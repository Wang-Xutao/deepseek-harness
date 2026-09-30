/**
 * Device-local 工作流 Tab presentation preference.
 *
 * 【变更】2026-09-29 (demo23 问题 5): the 是否显示工作流 Tab switch. Same stance
 * as the 轨迹图 preference (see ui-baf-tracegraph's workflow-settings.ts and
 * its 2026-09-25 lesson): browser-local state persisted through the client
 * snapshot store in localStorage — per-device tab visibility that never
 * crosses the wire and cannot be reached from the host settings controller.
 */

/** localStorage key for the persisted preference snapshot. */
export const WORKFLOW_TAB_PREF_KEY = 'baf.workflow-tab.pref'

/** Default keeps the 工作流 tab visible — it is the preset's primary surface. */
export const DEFAULT_SHOW_WORKFLOW_TAB = true

/** Device-local 工作流 Tab preferences. */
export interface BafWorkflowTabSettings {
  /** Whether the conversation tab 「工作流」 is mounted. */
  showWorkflowTab: boolean
}

/** Opening snapshot before any persisted value is read. */
export const INITIAL_WORKFLOW_TAB_PREFS: BafWorkflowTabSettings = {
  showWorkflowTab: DEFAULT_SHOW_WORKFLOW_TAB,
}
