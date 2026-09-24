/**
 * 【变更】2026-09-23 (demo2 re-test): the "this session already saw the
 * scaffold dialog" marker, shared across every bundle boundary.
 *
 * The 2026-09-23 web re-test double-pop: the model's mid-turn `baf_gate_ask`
 * bootstrap offered the scaffold dialog, the customer answered 暂不初始化,
 * and the orchestrator's turn-end evaluation immediately offered the SAME
 * dialog again — its once-per-session memory (`SCAFFOLD_SEEN`) only counted
 * its own pops. The marker is recorded by `askGateDialogQueued` (the single
 * choke point every scaffold dialog passes through — gate-ask bootstrap,
 * orchestrator turn-end, the coordinator's `/baf-go` re-pop, the Tab button)
 * and lives in the process-global host-memory anchor, so it survives both the
 * per-bundle module duplication and the Tab remote's separate package copy.
 *
 * Kept in its own module (not `requirement-park.ts`) so `gate-dialog.ts` can
 * record without an import cycle against its own consumers.
 *
 * @module @deepseek-ai/dsh-baf-workflow/scaffold-offer
 */

import { sharedHostSet } from './host-memory.ts'

/** Sessions that have been offered the scaffold dialog on any channel. */
const SCAFFOLD_OFFERED = sharedHostSet('scaffold-offer/sessions')

/** Record that one session was offered the scaffold dialog (any channel). */
export function noteScaffoldDialogOffered(sessionId: string): void {
  SCAFFOLD_OFFERED.add(sessionId)
}

/**
 * Whether this session already saw a scaffold dialog. The customer's revive
 * path stays `/baf-go` (the coordinator re-pops unconditionally); this marker
 * only quiets the orchestrator's automatic turn-end re-offer.
 */
export function scaffoldDialogOffered(sessionId: string): boolean {
  return SCAFFOLD_OFFERED.has(sessionId)
}

/** Test seam — forget every marker. */
export function resetScaffoldOffer(): void {
  SCAFFOLD_OFFERED.clear()
}
