/**
 * Derive stage wall-time metrics from projection events.
 * Token attribution lands with Phase 5 stage handlers; this module only
 * measures entered→completed/failed spans (and open in-progress spans).
 * @module @deepseek-ai/dsh-baf-workflow/metrics
 */

import type {
  ProjectionEvent,
  WorkflowNode,
  WorkflowNodeMetrics,
  WorkflowTabMetrics,
} from '@deepseek-ai/dsh-baf-core'

/** Per-node metrics plus change rollup. */
export interface DerivedWorkflowMetrics {
  readonly byNode: Readonly<Partial<Record<WorkflowNode, WorkflowNodeMetrics>>>
  readonly totals: WorkflowTabMetrics
}

/**
 * Fold projection events into stage duration metrics.
 * @param events - ordered projection events.
 * @param nowMs - clock for open in-progress stages (tests inject).
 * @returns per-node and total metrics.
 */
export function deriveWorkflowMetrics(
  events: readonly ProjectionEvent[],
  nowMs: number = Date.now(),
): DerivedWorkflowMetrics {
  const enteredAt = new Map<WorkflowNode, number>()
  const durationMs = new Map<WorkflowNode, number>()

  const markEnter = (node: WorkflowNode, at: string) => {
    const ms = Date.parse(at)
    if (!Number.isNaN(ms)) enteredAt.set(node, ms)
  }

  const markLeave = (node: WorkflowNode, at: string) => {
    const start = enteredAt.get(node)
    const end = Date.parse(at)
    if (start === undefined || Number.isNaN(end) || end < start) return
    durationMs.set(node, (durationMs.get(node) ?? 0) + (end - start))
    enteredAt.delete(node)
  }

  for (const event of events) {
    switch (event.type) {
      case 'intake-classified':
        markEnter('intake', event.at)
        break
      case 'intake-confirmed':
        markLeave('intake', event.at)
        break
      case 'stage-entered':
        markEnter(event.node, event.at)
        break
      case 'stage-completed':
      case 'stage-failed':
        markLeave(event.node, event.at)
        break
      case 'drift-detected':
        markEnter('drift', event.at)
        break
      default:
        break
    }
  }

  for (const [node, start] of enteredAt) {
    if (nowMs >= start) durationMs.set(node, (durationMs.get(node) ?? 0) + (nowMs - start))
  }

  const byNode: Partial<Record<WorkflowNode, WorkflowNodeMetrics>> = {}
  let totalDurationMs = 0
  for (const [node, ms] of durationMs) {
    byNode[node] = { durationMs: ms }
    totalDurationMs += ms
  }

  return {
    byNode,
    totals: totalDurationMs > 0 ? { totalDurationMs } : {},
  }
}
