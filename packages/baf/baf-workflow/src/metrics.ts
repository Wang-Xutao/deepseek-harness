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
 * 【变更】2026-10-30 (用户问题 7): one approval WAIT — the span between the
 * moment the harness asked the customer to allow an operation and the moment
 * the customer answered.
 *
 * The wait is not work: the model is blocked on a human, exactly like it is
 * blocked at a confirmation gate. The customer asked that 「等待审批」 not count
 * toward 流程耗时 — so the fold takes these spans OUT of the stage durations.
 *
 * A wait with no `endMs` is still PENDING — the customer has not answered yet.
 * While one is pending the change is not running either, so the client clock
 * freezes on the last real figure.
 */
export interface ApprovalWait {
  /** Epoch ms of the `approval/asked` event. */
  readonly startMs: number
  /** Epoch ms of the `approval/decided` event; undefined while pending. */
  readonly endMs?: number
}

/**
 * 【变更】2026-10-30 (用户问题 7): how long an approval ask may stay "pending"
 * before it counts as dead.
 *
 * The session log records `approval/asked` before the customer answers and
 * `approval/decided` after. An ask WITHOUT a decision is normally a live
 * approval — the model is blocked on the customer, so the clock must freeze
 * and the wait must not count. But a session that was interrupted (or a
 * customer who dismissed the card) leaves the ask dangling FOREVER — the
 * demo6 session carried four of them — and a dangling ask must not freeze
 * the change's clock for the rest of its life.
 *
 * So a pending ask counts only while it is recent enough to still be on
 * screen; beyond that window the evidence is stale and nothing is excluded.
 */
export const PENDING_APPROVAL_WINDOW_MS = 30 * 60_000

/**
 * 【变更】2026-10-30 (用户问题 2.3): one MODEL-ACTIVE span — a turn the agent
 * loop actually ran.
 *
 * The session log brackets every turn with `turn/start` → `turn/end`. Inside a
 * turn the model is working; between turns it is not — the customer is typing,
 * a confirmation gate is open, the workflow is paused, or the model was
 * stopped. The customer asked that 会话耗时 count ONLY 「大模型在跑的时间」, so
 * the fold measures every stage window against these spans: the time the
 * customer spent away, the time a paused workflow sat still, and the time a
 * stopped model waited never reach the total.
 *
 * A span with no `endMs` is still OPEN — the turn has not ended in the log.
 */
export interface ModelSpan {
  /** Epoch ms of the `turn/start` event. */
  readonly startMs: number
  /** Epoch ms of the `turn/end` event; undefined while the turn is open. */
  readonly endMs?: number
}

/**
 * 【变更】2026-10-30 (用户问题 2.3): what the model was doing, as the host
 * read it from the session log.
 *
 * `spans` is EMPTY when the host could not read the log (an old session, a
 * log it cannot open). The fold then measures the stage windows the way it
 * always did — the measure degrades to the old one instead of collapsing to
 * zero.
 */
export interface ModelActivity {
  /** The turns the agent loop ran, oldest first. */
  readonly spans: readonly ModelSpan[]
  /**
   * Whether the agent is running RIGHT NOW. The host reads the live agent's
   * status; `undefined` means it could not tell (a dead session, a test
   * composition without an agent), and the fold then treats an OPEN turn as
   * running.
   */
  readonly running?: boolean
}

/**
 * Merge the model's spans into disjoint intervals, oldest first.
 * @param spans - the raw spans (an open span runs to `nowMs`).
 * @param nowMs - the clock an open span runs to.
 * @returns the merged, disjoint spans.
 */
function mergeModelSpans(spans: readonly ModelSpan[], nowMs: number): { startMs: number; endMs: number }[] {
  const sorted = spans
    .map(span => ({ startMs: span.startMs, endMs: span.endMs ?? nowMs }))
    .filter(span => span.endMs > span.startMs)
    .sort((a, b) => a.startMs - b.startMs)
  const merged: { startMs: number; endMs: number }[] = []
  for (const span of sorted) {
    const last = merged[merged.length - 1]
    if (last !== undefined && span.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, span.endMs)
      continue
    }
    merged.push({ ...span })
  }
  return merged
}

/**
 * The parts of `[start, end)` that fall inside the model's active spans.
 * @param start - the interval's start.
 * @param end - the interval's end.
 * @param spans - the merged active spans; undefined = the whole interval.
 * @returns the covered sub-intervals.
 */
function activeParts(
  start: number,
  end: number,
  spans: readonly { startMs: number; endMs: number }[] | undefined,
): { start: number; end: number }[] {
  if (spans === undefined) return [{ start, end }]
  const parts: { start: number; end: number }[] = []
  for (const span of spans) {
    const from = Math.max(start, span.startMs)
    const to = Math.min(end, span.endMs)
    if (to > from) parts.push({ start: from, end: to })
  }
  return parts
}

/**
 * Fold projection events into stage duration metrics, attributing usage
 * points to stages by their time windows.
 * @param events - ordered projection events.
 * @param nowMs - clock for open in-progress stages (tests inject).
 * @param usagePoints - the session's per-step usage samples, any order.
 * @param approvalWaits - 【变更】2026-10-30 (用户问题 7): the spans where the
 * customer was deciding an approval — they are taken OUT of the durations.
 * @param modelActivity - 【变更】2026-10-30 (用户问题 2.3): the turns the model
 * actually ran — the durations count only the time inside them.
 * @returns per-node and total metrics.
 */
export function deriveWorkflowMetrics(
  events: readonly ProjectionEvent[],
  nowMs: number = Date.now(),
  usagePoints: readonly UsagePoint[] = [],
  approvalWaits: readonly ApprovalWait[] = [],
  modelActivity?: ModelActivity,
): DerivedWorkflowMetrics {
  // 【变更】2026-10-30 (用户问题 2.3): the model's active spans — the turns the
  // agent loop ran. Undefined (no spans read) means the measure degrades to
  // the window durations it always had, instead of collapsing to zero.
  const modelSpans = modelActivity?.spans ?? []
  const activeSpans = modelSpans.length === 0 ? undefined : mergeModelSpans(modelSpans, nowMs)
  const hasOpenTurn = modelSpans.some(span => span.endMs === undefined)
  const enteredAt = new Map<WorkflowNode, number>()
  const durationMs = new Map<WorkflowNode, number>()
  // Stage windows in event order: [enter(node), enter(next non-same node)).
  // Built as an ordered list so a usage point finds its stage by scan.
  const windows: { readonly node: WorkflowNode; readonly start: number; end: number }[] = []
  const windowIndex = new Map<WorkflowNode, number>()
  // 【变更】2026-10-29 (批次三十七 · 用户问题 5): the nodes whose window a
  // confirmation gate closed. The customer waits at the gate — that wait is
  // not work time, so the window reopens when the answer arrives.
  const parked = new Set<WorkflowNode>()

  const markEnter = (node: WorkflowNode, at: string) => {
    const ms = Date.parse(at)
    if (Number.isNaN(ms)) return
    enteredAt.set(node, ms)
    // A re-entry (T11 verify→implement→verify, drift resumes) opens a NEW
    // window; usage attribution keeps them separate, durations accumulate.
    // 【变更】2026-10-30 (用户问题 7): the previous window of the SAME node is
    // closed where the new one opens — otherwise it stayed open forever and
    // every approval wait after it was counted twice.
    const previous = windowIndex.get(node)
    if (previous !== undefined && windows[previous] !== undefined && windows[previous].end === Number.POSITIVE_INFINITY) {
      windows[previous].end = ms
    }
    windows.push({ node, start: ms, end: Number.POSITIVE_INFINITY })
    windowIndex.set(node, windows.length - 1)
  }

  const markLeave = (node: WorkflowNode, at: string) => {
    const start = enteredAt.get(node)
    const end = Date.parse(at)
    if (start === undefined || Number.isNaN(end) || end < start) return
    // 【变更】2026-09-28 (用户问题 4 停表): the intake window
    // [intake-classified → intake-confirmed] is pure customer wait — the
    // classifier ran BEFORE the classified marker, so nothing in the window
    // is machine work. It keeps its window (token attribution stays intact)
    // but accrues no duration: waiting for the confirmation click does not
    // count toward the change's 耗时.
    // 【变更】2026-10-29 (批次三十七 · 用户问题 5): the DRIFT window is the
    // same shape — the change is frozen on a customer decision.
    // 【变更】2026-10-30 (用户问题 2.3): the duration itself is derived from
    // the WINDOWS after the fold, clipped to the model's active spans — so
    // this step only closes the window.
    enteredAt.delete(node)
    // Close every later window opened before this leave (the chain walk on
    // re-entries); the simple common case closes exactly this node's window.
    const idx = windowIndex.get(node)
    if (idx !== undefined && windows[idx] !== undefined && windows[idx].end === Number.POSITIVE_INFINITY) {
      windows[idx].end = end
    }
  }

  /**
   * 【变更】2026-10-29 (批次三十七 · 用户问题 5): close every open work window
   * at a confirmation gate — the customer is the bottleneck now, and the wait
   * must not land in 会话耗时.
   * @param at - the park stamp.
   */
  const parkWindows = (at: string) => {
    for (const node of [...enteredAt.keys()]) {
      if (node === 'intake' || node === 'drift') continue
      markLeave(node, at)
      parked.add(node)
    }
  }

  /**
   * 【变更】2026-10-29 (批次三十七 · 用户问题 5): reopen the windows a gate
   * closed once the answer arrives — the work continues from where it stopped.
   * @param at - the resume stamp.
   */
  const resumeWindows = (at: string) => {
    for (const node of parked) {
      if (!enteredAt.has(node)) markEnter(node, at)
    }
    parked.clear()
  }

  for (const event of events) {
    // The answer to a parked gate reopens the window before this event is
    // folded — the gate's own event is the park, the next one is the answer.
    resumeWindows(event.at)
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
      // 【变更】2026-10-29 (批次三十七 · 用户问题 5): a parked confirmation
      // gate is customer wait — the work windows close until the answer.
      case 'awaiting-confirm':
        parkWindows(event.at)
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

  // 【变更】2026-10-30 (用户问题 7): an approval the customer has NOT answered
  // yet blocks the model exactly like a confirmation gate does — the change is
  // not running, so the client clock freezes and the pending wait is not
  // counted. A DANGLING ask (no decision in the log — an interrupted session,
  // a dismissed card) only counts while it is recent enough to still be on
  // screen: the demo6 session carried four such asks, and they must not
  // freeze the change's clock for the rest of its life.
  const livePending = approvalWaits.filter(wait =>
    wait.endMs === undefined
    && wait.startMs <= nowMs
    && nowMs - wait.startMs <= PENDING_APPROVAL_WINDOW_MS)
  const approvalPending = livePending.length > 0

  // The waits that are real evidence of a customer wait: every decided pair,
  // plus a pending one that is still live (its wait runs up to now).
  const effectiveWaits = approvalWaits.flatMap((wait) => {
    if (wait.endMs !== undefined) return [{ startMs: wait.startMs, endMs: wait.endMs }]
    if (livePending.includes(wait)) return [{ startMs: wait.startMs, endMs: nowMs }]
    return []
  })

  // 【变更】2026-09-28 (用户问题 4 停表): `running` — a WORK stage's window is
  // still open (entered, not completed) AND the model is running on the
  // change: the Tab's live timer may tick. Intake (customer confirm wait)
  // and drift (customer resume decision) never count as running.
  //
  // 【变更】2026-10-30 (用户问题 2.3): the window alone was not enough. A
  // change whose stage never completed — the customer stopped the model, or
  // the session was left open — kept its window open forever, and the strip's
  // timer ran forever against it: the customer saw 「会话耗时 一直在跑」 on a
  // session where nothing was running. The model must be running NOW.
  const stageOpen = [...enteredAt.keys()].some(node => node !== 'intake' && node !== 'drift')
  const modelRunning = modelActivity === undefined ? true : (modelActivity.running ?? hasOpenTurn)
  const running = !approvalPending && stageOpen && modelRunning

  // 【变更】2026-10-30 (用户问题 2.3): the per-node durations come from the
  // WINDOWS, clipped to the model's active spans and minus the approval waits.
  //
  // A window is the exact span the workflow sat in a stage. Clipping it to
  // the turns the model ran is what turns it into 「大模型在跑的时间」: the
  // customer's typing time, a paused workflow and a stopped model never reach
  // the total. The approval waits are then taken out of what is left — the
  // model was blocked on a human there too.
  for (const window of windows) {
    if (window.node === 'intake' || window.node === 'drift') continue
    const windowEnd = window.end === Number.POSITIVE_INFINITY ? nowMs : window.end
    for (const part of activeParts(window.start, windowEnd, activeSpans)) {
      let approved = 0
      for (const wait of effectiveWaits) {
        const from = Math.max(part.start, wait.startMs)
        const to = Math.min(part.end, wait.endMs)
        if (to > from) approved += to - from
      }
      const worked = Math.max(0, part.end - part.start - approved)
      durationMs.set(window.node, (durationMs.get(window.node) ?? 0) + worked)
    }
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
    // 【变更】2026-09-25 (用户需求 工作流 3): stamp the derivation clock so the
    // Tab's per-second interpolation anchors at true computation time.
    computedAt: nowMs,
    // 【变更】2026-09-28 (用户问题 4 停表): see the derivation above — false
    // parks the change on a customer decision; the Tab freezes its timer.
    running,
  }

  return {
    byNode,
    totals,
  }
}
