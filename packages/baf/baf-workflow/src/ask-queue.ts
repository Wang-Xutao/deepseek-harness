/**
 * §22.19 — the single-flight ask queue for every BAF popup.
 *
 * Session 7.jsonl R2: the platform `userQuestions` channel allows N
 * concurrent asks, but the client shows ONE interaction per session and a
 * later equal-precedence ask **replaces** the visible one — so the
 * gate-ask classification card covered the still-unanswered auto-pop
 * pre-question. The fix is structural: every BAF-originated ask goes through
 * this per-session FIFO queue, so at most one dialog per session is ever in
 * flight and a second pop waits its turn instead of covering.
 *
 * Three guards ride the queue:
 * - **key dedupe** — the same logical pop (gate id + change id, the auto-pop
 *   pre-question, one question-card content) queued or in flight again is
 *   dropped as `duplicate` immediately. This is what makes the orchestrator /
 *   gate-ask / auto-pop triangle converge: whichever route reaches the queue
 *   first owns the pop; the others silently stand down.
 * - **moot check** — the queue head re-validates before popping, so a pop
 *   computed from stale state (the gate was just resolved through another
 *   surface) dies quietly instead of showing a dialog whose click can only
 *   produce an invalid-transition card.
 * - **abort chaining** — an external `AbortSignal` (tool exec signal, agent
 *   disposal) is bridged to the `AbortController` the pop runs with.
 *
 * Dropped is never "the customer chose something": callers must render it as
 * paused / already-handled-elsewhere, never as an answer.
 *
 * @module @deepseek-ai/dsh-baf-workflow/ask-queue
 */

import { sharedHostMap } from './host-memory.ts'

/** Why an entry never popped. */
export type AskDropReason = 'duplicate' | 'moot' | 'aborted'

/** What {@link enqueueAsk} resolved to. */
export type AskOutcome<T> =
  | { readonly kind: 'answered'; readonly value: T }
  | { readonly kind: 'dropped'; readonly reason: AskDropReason }

/** One queued pop. */
export interface AskQueueEntry<T> {
  /** Session scope — dialogs for one session serialize behind each other. */
  readonly sessionId: string
  /** Logical identity: same key queued/in-flight again → dropped duplicate. */
  readonly key: string
  /**
   * 【变更】2026-09-29 (demo23 问题 4): the change this pop is about, when it
   * is change-scoped (gate dialogs). Terminal transitions cancel every
   * in-flight/queued ask of the change they end — the session popup and the
   * Tab top dialog are the SAME pending ask, and after an abandon neither may
   * keep pushing the workflow. Absent for workspace/session-scoped pops
   * (scaffold, the auto-pop pre-question) which must survive.
   */
  readonly changeId?: string
  /** Head-of-queue staleness check; true → drop without popping. */
  readonly isMoot?: () => boolean | Promise<boolean>
  /** External abort (tool exec signal / agent disposal). */
  readonly signal?: AbortSignal
  /** The pop itself — receives the bridged abort controller. */
  readonly run: (controller: AbortController) => Promise<T>
}

/** A tracked in-flight/queued entry — what {@link cancelAsksForChange} needs. */
interface ActiveAsk {
  readonly controller: AbortController
  readonly changeId?: string
}

/** Per-session queue state: the FIFO chain tail plus the live key set. */
interface SessionQueue {
  tail: Promise<unknown>
  active: Set<string>
  /** Live entries by key — the issue-4 cancel registry. */
  readonly entries: Map<string, ActiveAsk>
}

/**
 * 【变更】2026-09-23 (demo2 re-test): anchored on globalThis — the
 * single-flight guarantee must hold across BUNDLE copies (gate-ask.js's pop
 * vs orchestrator.js's pop vs commands.js's coordinator pop); a module-local
 * Map gave each copy its own queue and the R2 dialog-cover window silently
 * reopened on bundled compositions (see host-memory.ts).
 */
const queues = sharedHostMap<SessionQueue>('ask-queue/sessions')

/** Test seam — forget every session chain. A running host never calls this. */
export function resetAskQueue(): void {
  queues.clear()
}

/**
 * Enqueue one pop on its session's single-flight chain.
 *
 * @param entry - what to pop and how to validate it.
 * @returns the pop's value, or why it never popped. Never throws for
 *   queue-level decisions; `run` rejections propagate to the caller as-is
 *   (the dialog wrappers already map ask failures themselves).
 */
export async function enqueueAsk<T>(entry: AskQueueEntry<T>): Promise<AskOutcome<T>> {
  let state = queues.get(entry.sessionId)
  if (state === undefined) {
    state = { tail: Promise.resolve(), active: new Set<string>(), entries: new Map() }
    queues.set(entry.sessionId, state)
  }
  if (state.active.has(entry.key)) return { kind: 'dropped', reason: 'duplicate' }

  state.active.add(entry.key)
  const controller = new AbortController()
  state.entries.set(entry.key, { controller, ...(entry.changeId === undefined ? {} : { changeId: entry.changeId }) })
  const forwardAbort = () => controller.abort()
  if (entry.signal !== undefined) {
    if (entry.signal.aborted) {
      state.active.delete(entry.key)
      state.entries.delete(entry.key)
      return { kind: 'dropped', reason: 'aborted' }
    }
    entry.signal.addEventListener('abort', forwardAbort, { once: true })
  }

  const previous = state.tail
  const run = async (): Promise<AskOutcome<T>> => {
    try {
      // Aborted while queued: either the external signal went off after the
      // early-abort return, or 【变更】2026-09-29 (demo23 问题 4)
      // cancelAsksForChange killed the entry's own controller before it
      // reached the head — either way it must never pop.
      if (entry.signal?.aborted || controller.signal.aborted) return { kind: 'dropped', reason: 'aborted' }
      if (entry.isMoot !== undefined && await entry.isMoot()) return { kind: 'dropped', reason: 'moot' }
      return { kind: 'answered', value: await entry.run(controller) }
    } finally {
      state.active.delete(entry.key)
      state.entries.delete(entry.key)
      if (entry.signal !== undefined) entry.signal.removeEventListener('abort', forwardAbort)
    }
  }
  const current = previous.catch(() => undefined).then(run)
  // The tail must never reject — a failed pop cannot be allowed to poison
  // every later pop on the same session.
  state.tail = current.catch(() => undefined)
  return current
}

/**
 * 【变更】2026-09-29 (demo23 问题 4): cancel every in-flight or queued ask
 * about one change — the host-side kill switch a terminal transition fires.
 *
 * Aborting the entry's controller makes the underlying `service.ask` reject
 * with ASK_ABORTED on every surface at once: the client carrier unregisters
 * the pendingInteraction (the session popup disappears), the Tab's live gate
 * banner reads the same carrier, and the model's in-flight `baf_gate_ask`
 * settles as paused('cancelled'). Session/workspace-scoped pops (the
 * auto-pop pre-question, scaffold) carry no changeId and are untouched.
 *
 * @param changeId - the change that just reached a terminal state.
 * @returns how many asks were canceled (0 when none were about it).
 */
export function cancelAsksForChange(changeId: string): number {
  let canceled = 0
  for (const state of queues.values()) {
    for (const entry of state.entries.values()) {
      if (entry.changeId !== changeId) continue
      entry.controller.abort()
      canceled += 1
    }
  }
  return canceled
}

/**
 * 【变更】2026-10-02 (demo31 问题 3): cancel every in-flight or queued GATE
 * ask about one change — the gate-scoped sibling of
 * {@link cancelAsksForChange}, fired when the gate resolves through any
 * surface.
 *
 * The demo31 hang: the model's mid-turn `baf_gate_ask` (session A) blocked
 * on a dialog the customer never saw, while the same gate was resolved
 * through another surface (session B's pop click, a typed `/baf-go`). The
 * resolved drive succeeded, but session A's entry kept waiting — its turn
 * never ended (no `turn/end` → composer hidden forever) and the orchestrator
 * ignored the session. Aborting the entry settles the tool as
 * paused('cancelled'), which lets the turn close and the composer return.
 *
 * Only entries with BOTH the change id and a `gate:` key die: the auto-pop
 * pre-question (`autopop:<sess>`) and the scaffold gate carry no changeId and
 * survive — the workflow line's workspace-scoped decisions are not about
 * this change.
 *
 * @param changeId - the change whose gate just resolved elsewhere.
 * @returns how many gate asks were canceled (0 when none were about it).
 */
export function cancelAsksForChangeGates(changeId: string): number {
  let canceled = 0
  for (const state of queues.values()) {
    for (const [key, entry] of state.entries) {
      if (entry.changeId !== changeId || !key.startsWith('gate:')) continue
      entry.controller.abort()
      canceled += 1
    }
  }
  return canceled
}

/**
 * Whether a session still has any queued or in-flight ask. The auto-pop
 * offer checks this before offering (issue 2): a message typed while a
 * dialog is pending is most likely an answer or context for THAT dialog,
 * not a fresh requirement to confirm.
 * @param sessionId - the session to inspect.
 * @returns true when at least one ask is queued or in flight.
 */
export function hasPendingAsk(sessionId: string): boolean {
  return (queues.get(sessionId)?.active.size ?? 0) > 0
}
