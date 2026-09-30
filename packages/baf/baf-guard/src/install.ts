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
 *
 * 【变更】2026-09-28 (用户问题: BAF 安全门禁不得影响其他模式): two paths used to
 * cross presets. The `agents.list()` sweep at mount time installed the guard
 * on agents of OTHER presets live at that moment (a baf session — or a cold
 * transcript read of one — mounting the preset next to a standard-mode
 * session); and `agentPresets.recompose` (a blank session switching presets)
 * never unwound a guard installed before the switch, so an agent that left
 * BAF kept the hard gate forever. Both are answered with the shared
 * {@link presetCovers} membership test (see `dsh-baf-workflow/preset-cover`).
 *
 * @module @deepseek-ai/dsh-baf-guard/install
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
// Type-only: brings the `'agent-preset/selected'` Events declaration into
// this compilation face (the preset registry emits it app-wide; no runtime
// import — the handler reads membership from the scope chain, not the id).
import type {} from '@deepseek-ai/dsh-agent-preset-registry/types'
import { presetCovers } from '@deepseek-ai/dsh-baf-workflow'
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

  // 【变更】2026-09-28: preset-filtered — only agents composed under this
  // standing mount (see the module comment for the cross-preset incident).
  for (const agent of ctx.agents.list()) {
    if (presetCovers(ctx, agent)) install(agent)
  }
  ctx.on('agent/created', ({ agent }) => { install(agent) })
  ctx.on('agent/disposed', ({ agent }) => { dispose(agent) })
  // 【变更】2026-09-28: `recompose` re-links a blank session's scope without
  // re-firing `agent/created` — the same contract `baf-session-gate` follows:
  // entering this preset installs, leaving it unwinds, both decided by the
  // re-linked scope chain (the preset id is never compared, so a copied baf
  // preset keeps its guard).
  ctx.on('agent-preset/selected', (sessionId) => {
    const agent = ctx.agents.get(sessionId)
    if (agent === undefined) return
    if (presetCovers(ctx, agent)) install(agent)
    else dispose(agent)
  })
  ctx.effect(() => async () => {
    const pending = [...fibers.values()]
    fibers.clear()
    await Promise.all(pending.map(fiber => fiber.dispose()))
  }, 'baf-guard: agent tool guards')
}
