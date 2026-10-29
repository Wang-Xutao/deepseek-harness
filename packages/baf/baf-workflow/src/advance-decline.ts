/**
 * The ADVANCE-DECLINE marker — the customer said 暂不推进 to one change's
 * advance gate, and the workflow must HEAR it.
 *
 * 【变更】2026-10-28 (批次三十五 · 用户问题 2): declining an advance gate in the
 * conversation tab used to buy nothing. The orchestrator's turn-end pop
 * re-asked the very same gate on the next turn, and the workflow Tab re-prompt
 * with it too — the customer's 暂不推进 read as 「not now」 to the workflow and
 * 「again in a second」 to every surface.
 *
 * The marker is the link the two tabs were missing: once the customer declines,
 * the AUTOMATIC pops stand down (no re-prompt on either surface) and the
 * workflow Tab's 「推进」 button becomes the way forward — one click, the same
 * `/baf-go` the button already drives, and the confirmation the customer asked
 * to defer comes back exactly then.
 *
 * Why host memory and not the projection: the decline is a present-tense
 * operator control (like the pause flag), not part of the change's audited
 * history. The same `sharedHostMap` keeps it visible to every copy of the
 * plugin inside the process.
 *
 * @module @deepseek-ai/dsh-baf-workflow/advance-decline
 */

import { sharedHostMap } from './host-memory.ts'
import type { GateId } from './gate-cards.ts'
import { advanceGateIdForNode } from './gate-dialog.ts'

/**
 * The gates whose 暂不推进 means 「not now」 — the advance family. Every one of
 * them carries a `__noop__` decline option, and none of them is irreversible
 * (the archive gate's options are confirm-or-go-back; it can never be
 * silently declined, so it is not in this family).
 */
const ADVANCE_DECLINE_GATES: readonly GateId[] = [
  'open-advance',
  'bugfix-open-advance',
  'clarify-advance',
  'design-advance',
  'design-confirm',
  'plan-advance',
  'verify-advance',
]

/**
 * The declined gates, keyed `${cwd}|${changeId}|${gateId}` — one
 * process-shared map, the same anchor the pause flag uses.
 */
const DECLINED = sharedHostMap<true>('baf-workflow/advance-declined')

/**
 * The ledger key of one declined gate.
 * @param cwd - the workspace root.
 * @param changeId - the change id.
 * @param gateId - the gate the customer declined.
 * @returns the key.
 */
function declineKey(cwd: string, changeId: string, gateId: GateId): string {
  return `${cwd}|${changeId}|${gateId}`
}

/**
 * Whether one gate belongs to the advance family a 暂不推进 may silence.
 * @param gateId - the gate id.
 * @returns true when declining the gate is a deferral the workflow honors.
 */
export function isAdvanceDeclineGate(gateId: GateId): boolean {
  return (ADVANCE_DECLINE_GATES as readonly string[]).includes(gateId)
}

/**
 * Whether the customer declined one gate of one change.
 *
 * The orchestrator reads this before every turn-end pop: a declined gate must
 * not re-ask. The workflow Tab reads the same flag to suppress its own
 * advance dialog and keep the 「推进」 button as the single way forward.
 * @param cwd - the workspace root.
 * @param changeId - the change id.
 * @param gateId - the gate.
 * @returns true when the customer declined the gate and it has not been
 * re-raised since.
 */
export function isAdvanceDeclined(cwd: string, changeId: string, gateId: GateId): boolean {
  return DECLINED.has(declineKey(cwd, changeId, gateId))
}

/**
 * Record a 暂不推进 — one gate of one change stands down until the customer
 * re-raises it (the Tab's 「推进」 button, or a typed `/baf-go`).
 * @param cwd - the workspace root.
 * @param changeId - the change id.
 * @param gateId - the declined gate.
 * @returns nothing.
 */
export function markAdvanceDeclined(cwd: string, changeId: string, gateId: GateId): void {
  if (!isAdvanceDeclineGate(gateId)) return
  DECLINED.set(declineKey(cwd, changeId, gateId), true)
}

/**
 * Whether the customer declined the advance decision one RESTING STAGE owes.
 *
 * The workflow Tab's flag: the resting stage maps to its advance gate
 * (open → open-advance …), and the design stage's PARKED gate (design-confirm)
 * is the same decision under its second id, so both keys are checked — the
 * customer declined the transition, not one spelling of its card.
 * @param cwd - the workspace root.
 * @param changeId - the change id.
 * @param node - the change's current (resting) stage.
 * @param mode - the change's mode (bug-fix open quotes the clipped gate).
 * @returns true when the stage's advance decision was declined.
 */
export function isAdvanceDeclinedForNode(
  cwd: string,
  changeId: string,
  node: string,
  mode?: string,
): boolean {
  const candidates: readonly (GateId | undefined)[] = node === 'design'
    ? [advanceGateIdForNode(node, mode), 'design-confirm' as const]
    : [advanceGateIdForNode(node, mode)]
  return candidates.some(gate => gate !== undefined && isAdvanceDeclined(cwd, changeId, gate))
}

/**
 * Record a 暂不推进 for the advance decision one RESTING STAGE owes — the
 * workflow Tab's own dismiss button writes this (the conversation tab's
 * decline is recorded inside `resolveViaDialog`). Same candidate set as
 * {@link isAdvanceDeclinedForNode}: both spellings of the design decision.
 * @param cwd - the workspace root.
 * @param changeId - the change id.
 * @param node - the change's current (resting) stage.
 * @param mode - the change's mode.
 * @returns nothing.
 */
export function markAdvanceDeclinedForNode(
  cwd: string,
  changeId: string,
  node: string,
  mode?: string,
): void {
  const candidates: readonly (GateId | undefined)[] = node === 'design'
    ? [advanceGateIdForNode(node, mode), 'design-confirm' as const]
    : [advanceGateIdForNode(node, mode)]
  for (const gate of candidates) {
    if (gate !== undefined) markAdvanceDeclined(cwd, changeId, gate)
  }
}

/**
 * Re-raise every declined gate of one change — the 「推进」 click's first
 * effect, so the deferred confirmation comes back and the turn-end pops
 * resume once it is answered.
 * @param cwd - the workspace root.
 * @param changeId - the change id.
 * @returns nothing.
 */
export function clearAdvanceDeclined(cwd: string, changeId: string): void {
  const prefix = `${cwd}|${changeId}|`
  for (const key of DECLINED.keys()) {
    if (key.startsWith(prefix)) DECLINED.delete(key)
  }
}
