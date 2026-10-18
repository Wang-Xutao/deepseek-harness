/**
 * Host-plane standing row installing the protected-paths guard on EVERY
 * agent (2026-10-18 项目工程 1.3, 客户决策: 任何 AI agent 不得修改管控文件夹).
 * Mirrors `baf-guard/install`'s per-agent mechanics (`agent/created` → bind
 * the session cwd → the agent's own tool scope) but mounts in the always-on
 * base composition instead of the baf preset, and does NOT filter by preset
 * membership — see global-guard.ts for why the deliberate cross-preset scope
 * is correct (and harmless where the full guard also runs).
 * @module @deepseek-ai/dsh-baf-guard/global-install
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createProtectedPathsGuard } from './global-guard.ts'

export const name = 'baf-guard-global-install'
export const inject = ['agents']

/**
 * Install the protected-paths tool guard on every agent of this process.
 * @param ctx - host-plane standing-mount context with `agents`.
 */
export function apply(ctx: Context): void {
  const fibers = new Map<Agent, ReturnType<Context['inject']>>()

  const install = (agent: Agent): void => {
    if (fibers.has(agent)) return
    const workspaceRoot = agent.session.header.cwd ?? process.cwd()
    const guard = createProtectedPathsGuard({ workspaceRoot })
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
        `baf-guard: protected-paths guard cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    })
  }

  for (const agent of ctx.agents.list()) {
    install(agent)
  }
  ctx.on('agent/created', ({ agent }) => { install(agent) })
  ctx.on('agent/disposed', ({ agent }) => { dispose(agent) })
  // A blank session re-linking presets re-uses the same agent — the guard is
  // preset-independent, so unlike baf-guard/install there is nothing to
  // re-evaluate here; the row keeps the fiber until the agent disposes.
  ctx.effect(() => async () => {
    const pending = [...fibers.values()]
    fibers.clear()
    await Promise.all(pending.map(fiber => fiber.dispose()))
  }, 'baf-guard: protected-paths agent guards')
}
