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

/**
 * 【变更】2026-10-21 (批次十 测试流图): the 测试流图 tab rides the SAME snapshot
 * (one persisted device-local object for every BAF workflow tab switch). Read
 * with `!== false` everywhere — a snapshot persisted before this key existed
 * must keep the new tab visible, not silently hide it.
 */
export const DEFAULT_SHOW_TEST_FLOW_TAB = true

/** Device-local 工作流 Tab preferences. */
export interface BafWorkflowTabSettings {
  /** Whether the conversation tab 「工作流」 is mounted. */
  showWorkflowTab: boolean
  /** Whether the conversation tab 「测试流图」 is mounted (批次十). */
  showTestFlowTab: boolean
}

/** Opening snapshot before any persisted value is read. */
export const INITIAL_WORKFLOW_TAB_PREFS: BafWorkflowTabSettings = {
  showWorkflowTab: DEFAULT_SHOW_WORKFLOW_TAB,
  showTestFlowTab: DEFAULT_SHOW_TEST_FLOW_TAB,
}
