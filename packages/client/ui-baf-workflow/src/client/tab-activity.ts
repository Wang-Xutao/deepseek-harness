/**
 * 【变更】2026-09-25 (用户需求 工作流 1): which session's 工作流 Tab is on screen.
 *
 * `conversation.view` entries mount/unmount on tab switch — WorkflowView is
 * mounted exactly while the workflow Tab is the active conversation view for
 * that session. This module mirrors that lifecycle into a tiny module-level
 * store so the composer chain entry (BafGateComposer, same package) can hide
 * the session-form dialog while the Tab owns the decision surface, and
 * re-show it the moment the customer switches back to the 会话 tab
 * (useSyncExternalStore keeps both surfaces reactive to the flip).
 *
 * Module-level (not plugin-scoped) on purpose: the view entry and the
 * composer entry are separate slot registrations that never share a React
 * tree — the module table is their only rendezvous.
 * @module ui-baf-workflow/tab-activity
 */

/** Sessions whose workflow Tab is currently the active conversation view. */
const activeTabs = new Set<string>()

const listeners = new Set<() => void>()

/**
 * Mark one session's workflow Tab active/inactive (WorkflowView mount /
 * unmount). Idempotent; notifies listeners only on a real flip.
 * @param sessionId - session identity.
 * @param active - whether the Tab is on screen.
 */
export function setWorkflowTabActive(sessionId: string, active: boolean): void {
  const before = activeTabs.has(sessionId)
  if (active === before) return
  if (active) activeTabs.add(sessionId)
  else activeTabs.delete(sessionId)
  for (const listener of listeners) listener()
}

/**
 * Whether the workflow Tab is on screen for this session.
 * @param sessionId - session identity.
 * @returns true while WorkflowView is mounted.
 */
export function isWorkflowTabActive(sessionId: string): boolean {
  return activeTabs.has(sessionId)
}

/**
 * Subscribe to activity flips (useSyncExternalStore-compatible: the store
 * itself is module state, so `getSnapshot` is {@link isWorkflowTabActive}).
 * @param listener - called after every flip.
 * @returns disposer.
 */
export function subscribeTabActivity(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
