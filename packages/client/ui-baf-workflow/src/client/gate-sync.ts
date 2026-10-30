/**
 * The ANSWERED-GATE rendezvous between the session's confirmation dialog and
 * the workflow graph's parked-gate banner.
 *
 * 【变更】2026-10-30 (用户问题 3.1): the two surfaces show the SAME decision,
 * but they live in different React trees — the session's dialog is a
 * composer-chain entry, the graph's banner is a card inside the workflow Tab —
 * so neither can see the other's click.
 *
 * The customer asked for them to cancel IN SYNC: answering the dialog with
 * 「暂不推进」 must take the graph's banner down with it, and vice versa.
 *
 * The reason it went wrong: the graph's banner is suppressed while the live
 * dialog is up (the dialog is the fresher instant), but the PROJECTION still
 * carries the park after the answer — the host clears it on the next event.
 * So the banner reappeared the moment the dialog closed: the customer watched
 * the confirmation they had just dismissed come back, and could never reach
 * the 「推进」 button that is the way forward.
 *
 * This module is the one place both surfaces can write to. It is a plain
 * module-level store (the same shape `tab-activity.ts` uses) — the answer is a
 * present-tense fact about the screen, not part of the change's history.
 *
 * @module ui-baf-workflow/client/gate-sync
 */

/** One answered confirmation gate. */
export interface AnsweredGate {
  /** The change the gate was about, when the gate named one. */
  readonly changeId?: string
  /** The gate's id — the registry key both surfaces share. */
  readonly gateId: string
}

/** The last answer per session. */
const ANSWERED = new Map<string, AnsweredGate>()

/** The store's listeners — every surface that shows a gate listens. */
const listeners = new Set<() => void>()

/**
 * Record that the customer answered a confirmation gate.
 *
 * The caller is any surface that shows the gate: the session's dialog or the
 * graph's live card. Both write here, so both learn from it.
 * @param sessionId - the session the gate belongs to.
 * @param gate - the answered gate's identity.
 * @returns nothing.
 */
export function noteGateAnswered(sessionId: string, gate: AnsweredGate): void {
  const previous = ANSWERED.get(sessionId)
  if (previous !== undefined
    && previous.gateId === gate.gateId
    && previous.changeId === gate.changeId) return
  ANSWERED.set(sessionId, gate)
  for (const listener of listeners) listener()
}

/**
 * The last gate answered in this session.
 * @param sessionId - the session to read.
 * @returns the answer, or undefined when nothing was answered yet.
 */
export function answeredGateFor(sessionId: string): AnsweredGate | undefined {
  return ANSWERED.get(sessionId)
}

/**
 * Forget a session's answered gate — the surface that shows a NEW decision
 * uses it to tell 「a different gate」 from 「the same one, still answered」.
 * @param sessionId - the session to clear.
 * @returns nothing.
 */
export function clearAnsweredGate(sessionId: string): void {
  if (!ANSWERED.delete(sessionId)) return
  for (const listener of listeners) listener()
}

/**
 * Record that a gate is ON SCREEN — and forget an answer that belongs to a
 * DIFFERENT decision.
 *
 * The surfaces call this whenever they render a gate. A new gate id means a
 * new decision, so the previous answer must not keep suppressing the banner
 * that belongs to it.
 * @param sessionId - the session the gate belongs to.
 * @param gateId - the gate's id.
 * @returns nothing.
 */
export function noteGateShown(sessionId: string, gateId: string): void {
  const previous = ANSWERED.get(sessionId)
  if (previous === undefined || previous.gateId === gateId) return
  ANSWERED.delete(sessionId)
  for (const listener of listeners) listener()
}

/**
 * Subscribe to the store's changes.
 * @param listener - called on every recorded answer.
 * @returns the unsubscribe function.
 */
export function subscribeAnsweredGates(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
