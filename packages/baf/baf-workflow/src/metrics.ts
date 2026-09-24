/**
 * Derive stage wall-time metrics from projection events, and — when the
 * caller supplies the session's per-step provider usage — attribute tokens
 * to stages by wall-clock windows (2026-09-23 user issue #3: the flow graph
 * shows each stage's token consumption).
 *
 * Session events carry epoch-ms `time` and `assistant/message` events carry
 * the step's provider `usage`; projection events carry ISO `at` stamps. A
 * usage event belongs to the stage whose [entered, next entered) window
 * contains its time — drives run between turns, so a turn's usage lands in
 * the stage the workflow sat in while the model worked it. Turns that straddle
 * a boundary are attributed to the stage the turn ENDED in (the window test
 * on the usage event's own time), which is the stage that consumed the work.
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

/** One attributed usage sample: when a model step finished, and what it cost. */
export interface UsagePoint {
  /** Epoch ms (the session event's `time`). */
  readonly time: number
  /** Input-side tokens (uncached + cache read + cache write). */
  readonly inputTokens: number
  /** Output-side tokens. */
  readonly outputTokens: number
}

/**
 * Fold projection events into stage duration metrics, attributing usage
 * points to stages by their time windows.
 * @param events - ordered projection events.
 * @param nowMs - clock for open in-progress stages (tests inject).
 * @param usagePoints - the session's per-step usage samples, any order.
 * @returns per-node and total metrics.
 */
export function deriveWorkflowMetrics(
  events: readonly ProjectionEvent[],
  nowMs: number = Date.now(),
  usagePoints: readonly UsagePoint[] = [],
): DerivedWorkflowMetrics {
  const enteredAt = new Map<WorkflowNode, number>()
  const durationMs = new Map<WorkflowNode, number>()
  // Stage windows in event order: [enter(node), enter(next non-same node)).
  // Built as an ordered list so a usage point finds its stage by scan.
  const windows: { readonly node: WorkflowNode; readonly start: number; end: number }[] = []
  const windowIndex = new Map<WorkflowNode, number>()

  const markEnter = (node: WorkflowNode, at: string) => {
    const ms = Date.parse(at)
    if (Number.isNaN(ms)) return
    enteredAt.set(node, ms)
    // A re-entry (T11 verify→implement→verify, drift resumes) opens a NEW
    // window; usage attribution keeps them separate, durations accumulate.
    windows.push({ node, start: ms, end: Number.POSITIVE_INFINITY })
    windowIndex.set(node, windows.length - 1)
  }

  const markLeave = (node: WorkflowNode, at: string) => {
    const start = enteredAt.get(node)
    const end = Date.parse(at)
    if (start === undefined || Number.isNaN(end) || end < start) return
    durationMs.set(node, (durationMs.get(node) ?? 0) + (end - start))
    enteredAt.delete(node)
    // Close every later window opened before this leave (the chain walk on
    // re-entries); the simple common case closes exactly this node's window.
    const idx = windowIndex.get(node)
    if (idx !== undefined && windows[idx] !== undefined && windows[idx].end === Number.POSITIVE_INFINITY) {
      windows[idx].end = end
    }
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
      // 【变更】2026-09-23 (demo5 issue #5): a terminal event is a hard stop —
      // every still-open window (archive itself, or a change abandoned mid-
      // stage) closes at the terminal stamp, so a finished change's 计时
      // freezes instead of growing forever against `nowMs`.
      case 'change-archived':
      case 'change-abandoned':
        for (const node of [...enteredAt.keys()]) markLeave(node, event.at)
        break
      default:
        break
    }
  }

  for (const [node, start] of enteredAt) {
    if (nowMs >= start) durationMs.set(node, (durationMs.get(node) ?? 0) + (nowMs - start))
  }

  // Attribute usage: earliest window whose [start, end) contains the point.
  // Windows are in event order; a point before the first window (preamble
  // turns before intake) is unattributed by design.
  const inputTokens = new Map<WorkflowNode, number>()
  const outputTokens = new Map<WorkflowNode, number>()
  const sorted = [...windows].sort((a, b) => a.start - b.start)
  for (const point of usagePoints) {
    for (const window of sorted) {
      if (point.time >= window.start && point.time < window.end) {
        inputTokens.set(window.node, (inputTokens.get(window.node) ?? 0) + point.inputTokens)
        outputTokens.set(window.node, (outputTokens.get(window.node) ?? 0) + point.outputTokens)
        break
      }
    }
  }

  const byNode: Partial<Record<WorkflowNode, WorkflowNodeMetrics>> = {}
  let totalDurationMs = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  const nodes = new Set<WorkflowNode>([...durationMs.keys(), ...inputTokens.keys()])
  for (const node of nodes) {
    const ms = durationMs.get(node)
    const inTok = inputTokens.get(node)
    const outTok = outputTokens.get(node)
    byNode[node] = {
      ...(ms === undefined ? {} : { durationMs: ms }),
      ...(inTok === undefined ? {} : { inputTokens: inTok }),
      ...(outTok === undefined ? {} : { outputTokens: outTok }),
    }
    totalDurationMs += ms ?? 0
    totalInputTokens += inTok ?? 0
    totalOutputTokens += outTok ?? 0
  }

  const totals: WorkflowTabMetrics = {
    ...(totalDurationMs > 0 ? { totalDurationMs } : {}),
    ...(totalInputTokens > 0 ? { totalInputTokens } : {}),
    ...(totalOutputTokens > 0 ? { totalOutputTokens } : {}),
  }

  return {
    byNode,
    totals,
  }
}
