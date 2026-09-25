/**
 * Device-local baf-workflow presentation preferences.
 *
 * 【变更】2026-09-25 (post-master-merge): the 轨迹图 toggle used to ride the
 * host `baf-workflow` settings namespace via configForms, but this preset's
 * scoped mount is unreachable from the host settings controller — the form
 * silently fell back to memory persistence and every `set()` was a no-op
 * (switch would not move). The preference is browser-local state (per-device
 * tab visibility), so it now persists in localStorage through the client
 * snapshot store and never crosses the wire.
 */

/** localStorage key for the persisted preference snapshot. */
export const TRACE_GRAPH_PREF_KEY = 'baf.trace-graph.pref'

/**
 * Default keeps the trace-graph tab visible — pre-release stance prefers the
 * correct foundation, and the tab is part of the assembled product surface.
 */
export const DEFAULT_SHOW_TRACE_GRAPH = true

/** Device-local baf-workflow presentation preferences. */
export interface BafWorkflowSettings {
  /** Whether the conversation tab "轨迹图" is mounted. */
  showTraceGraph: boolean
}

/** Opening snapshot before any persisted value is read. */
export const INITIAL_TRACE_GRAPH_PREFS: BafWorkflowSettings = {
  showTraceGraph: DEFAULT_SHOW_TRACE_GRAPH,
}
