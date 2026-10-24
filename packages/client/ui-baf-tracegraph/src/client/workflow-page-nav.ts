/**
 * 【变更】2026-10-24 (批次十九 1.3): the 工作流 page's side of the cross-surface
 * hand-off that opens one of its tabs from another surface (the session
 * 工作流图 tab's 变更总览 button).
 *
 * The session tab is owned by ui-baf-workflow, which this package cannot
 * import (no client package depends on another), so the hand-off runs over two
 * device-local channels both sides spell out:
 *
 * 1. a window event — delivered when this page is already mounted;
 * 2. a localStorage one-shot — picked up when the page mounts afterwards.
 *
 * The mirrored constants live in ui-baf-workflow's workflow-page-nav.ts.
 * Keep both files in sync.
 */

/** The device-local one-shot key holding the requested tab id. */
export const WORKFLOW_PAGE_TAB_REQUEST_KEY = 'baf.workflow-page.tab-request'

/** The window event carrying the requested tab id. */
export const WORKFLOW_PAGE_TAB_REQUEST_EVENT = 'baf:workflow-page:tab-request'

/**
 * Read (and consume) the pending tab request.
 * @returns the requested tab id, or undefined when none is pending.
 */
export function takeWorkflowPageTabRequest(): string | undefined {
  try {
    const raw = localStorage.getItem(WORKFLOW_PAGE_TAB_REQUEST_KEY)
    if (raw === null || raw === '') return undefined
    localStorage.removeItem(WORKFLOW_PAGE_TAB_REQUEST_KEY)
    return raw
  } catch {
    return undefined
  }
}
