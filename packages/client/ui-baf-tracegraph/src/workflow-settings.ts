/** Durable baf-workflow preference: visibility of the 轨迹图 conversation tab. */

/** Settings namespace owned by the baf workflow plugin. */
export const BAF_WORKFLOW_SETTINGS_NAMESPACE = 'baf-workflow'

/** Field carrying the trace-graph tab visibility switch. */
export const SHOW_TRACE_GRAPH_FIELD = 'showTraceGraph'

/**
 * Default keeps the trace-graph tab visible — pre-release stance prefers the
 * correct foundation, and the tab is part of the assembled product surface.
 */
export const DEFAULT_SHOW_TRACE_GRAPH = true

/** Durable baf-workflow section shared by the Host schema and the browser scope. */
export interface BafWorkflowSettings {
  /** Whether the conversation tab "轨迹图" is mounted. */
  showTraceGraph: boolean
}
