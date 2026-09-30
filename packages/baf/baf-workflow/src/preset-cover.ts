/**
 * 【变更】2026-09-28 (用户问题: BAF 门禁与工作流不得影响其他模式): the preset
 * membership test for the host-plane per-agent rows (`baf-guard-install`,
 * `baf-session-gate`).
 *
 * Those rows live in the baf preset's standing mount, but the `agents` registry
 * they reach is host-plane and process-global. `agent/created` arrives
 * carrier-scoped (a standing mount only hears its own agents), yet TWO paths
 * still cross presets:
 *
 * 1. the initial `agents.list()` sweep at mount time — the first baf session
 *    (or a cold transcript read of one) can mount the preset while
 *    standard-mode agents are already live, and the sweep would install the
 *    BAF tool guard and the 启动门 prompt section on those agents;
 * 2. `agentPresets.recompose` (a blank session switching presets in the
 *    picker) re-links the agent's scope WITHOUT re-firing `agent/created` —
 *    an agent that leaves baf keeps everything installed under the old
 *    composition.
 *
 * Both are answered with the scope chain: a row mounted under a standing
 * scope covers exactly the agents whose scope chain contains that scope.
 * Membership is by mount, not by preset id, so a user-copied baf preset is
 * covered by its own rows too. A row mounted WITHOUT a scope (CLI / test
 * compositions, where the rows sit host-plane and there is no second preset)
 * keeps the old cover-everything behavior.
 *
 * @module @deepseek-ai/dsh-baf-workflow/preset-cover
 */

import type { Context } from '@deepseek-ai/cordis'
import { scopeChainOf, scopeOf } from '@deepseek-ai/dsh-scope'

/**
 * Whether one agent is composed under this row's standing mount.
 *
 * The companion sync contract for the per-agent rows: pair every sweep or
 * `agent/created` install with an `agent-preset/selected` listener that
 * re-evaluates this predicate (install when covered, dispose when not), so an
 * agent that switches presets settles into exactly the composition it runs.
 *
 * @param ctx - the row's own (standing-mount) context.
 * @param agent - the live agent; its scope context decides membership.
 * @returns true when the row should install on this agent.
 */
export function presetCovers(ctx: Context, agent: { ctx: Context }): boolean {
  const own = scopeOf(ctx)
  if (own === undefined) return true
  return scopeChainOf(scopeOf(agent.ctx)).includes(own)
}
