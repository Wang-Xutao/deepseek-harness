/**
 * 【变更】2026-10-24 (批次十九 1.3): the cross-surface hand-off that opens the
 * 工作流 page's 「变更总览」 tab from the session 工作流图 tab.
 *
 * The session tab no longer shows the change overview as a modal (the ledger
 * lives in the 工作流 page now), so its 变更总览 button navigates there. The
 * 工作流 page is owned by ui-baf-tracegraph, which cannot import this package
 * (no client package depends on another), so the hand-off runs over two
 * device-local channels that both sides spell out:
 *
 * 1. a window event — delivered when the 工作流 page is already mounted;
 * 2. a localStorage one-shot — picked up when the page mounts afterwards.
 *
 * The mirrored constants live in ui-baf-tracegraph's workflow-page-nav.ts.
 * Keep both files in sync.
 */

/** The device-local one-shot key holding the requested tab id. */
export const WORKFLOW_PAGE_TAB_REQUEST_KEY = 'baf.workflow-page.tab-request'

/** The window event carrying the requested tab id. */
export const WORKFLOW_PAGE_TAB_REQUEST_EVENT = 'baf:workflow-page:tab-request'

/**
 * Ask the 工作流 page to open one of its tabs.
 * @param tabId - the target tab id (e.g. `changes`).
 */
export function requestWorkflowPageTab(tabId: string): void {
  try {
    localStorage.setItem(WORKFLOW_PAGE_TAB_REQUEST_KEY, tabId)
  } catch {
    // storage failures (private mode, quota) only drop the mount-time pick-up
  }
  window.dispatchEvent(new CustomEvent(WORKFLOW_PAGE_TAB_REQUEST_EVENT, { detail: tabId }))
}
