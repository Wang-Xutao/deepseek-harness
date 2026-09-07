/**
 * Workspace-backed Tab view assembly (Host only).
 * @module @deepseek-ai/dsh-baf-workflow/tab-view
 */

import {
  buildEmptyTabView,
  statusToTabView,
  type WorkflowTabView,
} from '@deepseek-ai/dsh-baf-core'
import { deriveWorkflowMetrics } from './metrics.ts'
import type { ProjectionStore } from './projection.ts'

export type {
  WorkflowTabAction,
  WorkflowTabNode,
  WorkflowTabView,
} from '@deepseek-ai/dsh-baf-core'

export { buildEmptyTabView, statusToTabView } from '@deepseek-ai/dsh-baf-core'

/**
 * Build a Tab view for a workspace, optionally selecting one change.
 * Prefer status/index only for the first paint; metrics are derived separately
 * so a long projection log does not block the flowchart.
 * @param store - projection store.
 * @param selectedChangeId - change to focus; when omitted picks the newest.
 * @param options - optional assembly flags.
 * @returns tab view.
 */
export async function buildWorkflowTabView(
  store: ProjectionStore,
  selectedChangeId?: string | null,
  options: { readonly includeMetrics?: boolean } = {},
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
    if (!includeMetrics) {
      return statusToTabView(status, changes)
    }
    const { events } = await store.readEvents(selected)
    const derived = deriveWorkflowMetrics(events)
    return statusToTabView(status, changes, derived)
  } catch (error) {
    return {
      ...buildEmptyTabView(changes),
      selectedChangeId: selected,
      blockedReason: error instanceof Error ? error.message : String(error),
    }
  }
}
