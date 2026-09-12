/**
 * Non-isolated preset row installing the BAF tool guard on every agent
 * composed under the BAF preset (like `@deepseek-ai/dsh-baf-workflow/commands`
 * — the row must reach the host `agents` service, so it stays outside the
 * baf-domain isolate group).
 *
 * Per agent: `agent/created` → bind the workspace root from the session cwd →
 * `agent.ctx.inject(['tools'], …)` registers the sync guard on the agent's
 * own tool scope (scope isolation: two agents never share a guard layer).
 * `agent/disposed` and plugin teardown dispose the fibers.
 * @module @deepseek-ai/dsh-baf-guard/install
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createBafToolGuard } from './tool-guard.ts'

export const name = 'baf-guard-install'
export const inject = ['agents']

/**
 * Install the per-agent tool guard.
 * @param ctx - agent standing-mount context with `agents`.
 */
export function apply(ctx: Context): void {
  const fibers = new Map<Agent, ReturnType<Context['inject']>>()

  const install = (agent: Agent): void => {
    if (fibers.has(agent)) return
    const workspaceRoot = agent.session.header.cwd ?? process.cwd()
    const guard = createBafToolGuard({ workspaceRoot })
    const fiber = agent.ctx.inject(['tools'], (scope) => {
      scope.tools.guard(guard)
    })
    fibers.set(agent, fiber)
  }

  const dispose = (agent: Agent): void => {
    const fiber = fibers.get(agent)
    if (fiber === undefined) return
    fibers.delete(agent)
    void fiber.dispose().catch((error: unknown) => {
      ctx.logger.warn(
        `baf-guard: agent guard cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    })
  }

  for (const agent of ctx.agents.list()) install(agent)
  ctx.on('agent/created', ({ agent }) => { install(agent) })
  ctx.on('agent/disposed', ({ agent }) => { dispose(agent) })
  ctx.effect(() => async () => {
    const pending = [...fibers.values()]
    fibers.clear()
    await Promise.all(pending.map(fiber => fiber.dispose()))
  }, 'baf-guard: agent tool guards')
}
