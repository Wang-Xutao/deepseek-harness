/**
 * Workspace-backed Tab view assembly (Host only).
 * @module @deepseek-ai/dsh-baf-workflow/tab-view
 */

import {
  buildEmptyTabView,
  statusToTabView,
  type WorkflowTabLanes,
  type WorkflowTabResume,
  type WorkflowTabView,
} from '@deepseek-ai/dsh-baf-core'
import { deriveLanes } from './lanes.ts'
import { deriveWorkflowMetrics } from './metrics.ts'
import type { ProjectionStore } from './projection.ts'

export type {
  WorkflowTabAction,
  WorkflowTabNode,
  WorkflowTabView,
} from '@deepseek-ai/dsh-baf-core'

export { buildEmptyTabView, statusToTabView } from '@deepseek-ai/dsh-baf-core'

/** Assembly options for {@link buildWorkflowTabView}. */
export interface BuildWorkflowTabViewOptions {
  /** Fold the event log into per-stage durations / tokens (default true). */
  readonly includeMetrics?: boolean
  /**
   * Resolve the T13 rollback targets for a change parked in drift (§19.5).
   *
   * Only called when `status.current === 'drift'`, because the authoritative
   * answer needs live drift detection (Git + artifact probes) that must not run
   * on every repaint. The Tab supplies it from its own cwd; omitting it simply
   * means the Tab shows no rollback menu.
   * @param changeId - drifted change.
   * @returns anchor + legal targets, or undefined.
   */
  readonly resume?: (changeId: string) => Promise<WorkflowTabResume | undefined>
}

/**
 * Build a Tab view for a workspace, optionally selecting one change.
 *
 * The event log is always read: the §18.4.3 dual-lane view is derived from it
 * and the Tab cannot draw the right picture without it. Only the metrics fold —
 * the O(n) cost the first paint cares about — is gated by `includeMetrics`.
 * @param store - projection store.
 * @param selectedChangeId - change to focus; when omitted picks the newest.
 * @param options - optional assembly flags.
 * @returns tab view.
 */
export async function buildWorkflowTabView(
  store: ProjectionStore,
  selectedChangeId?: string | null,
  options: BuildWorkflowTabViewOptions = {},
): Promise<WorkflowTabView> {
  const includeMetrics = options.includeMetrics !== false
  const index = await store.readIndex()
  const changes = index.changes.map(c => ({
    changeId: c.changeId,
    mode: c.mode,
    current: c.current,
  }))

  if (changes.length === 0) {
    return buildEmptyTabView([])
  }

  const fallback = changes.slice().sort((a, b) => a.changeId.localeCompare(b.changeId)).at(-1)
  if (fallback === undefined) {
    return buildEmptyTabView([])
  }
  const selected = selectedChangeId ?? fallback.changeId

  try {
    const status = await store.readStatus(selected)
    const { events } = await store.readEvents(selected)
    const lanes = deriveLanes(events)
    const resume = status.current === 'drift' && options.resume !== undefined
      ? await options.resume(selected)
      : undefined
    const extras: { lanes?: WorkflowTabLanes; resume?: WorkflowTabResume } = {
      ...(lanes === undefined ? {} : { lanes }),
      ...(resume === undefined ? {} : { resume }),
    }
    const derived = includeMetrics ? deriveWorkflowMetrics(events) : undefined
    return statusToTabView(status, changes, derived, extras)
  } catch (error) {
    return {
      ...buildEmptyTabView(changes),
      selectedChangeId: selected,
      blockedReason: error instanceof Error ? error.message : String(error),
    }
  }
}
