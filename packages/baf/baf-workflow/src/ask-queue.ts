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
  /** Head-of-queue staleness check; true → drop without popping. */
  readonly isMoot?: () => boolean | Promise<boolean>
  /** External abort (tool exec signal / agent disposal). */
  readonly signal?: AbortSignal
  /** The pop itself — receives the bridged abort controller. */
  readonly run: (controller: AbortController) => Promise<T>
}

/** Per-session queue state: the FIFO chain tail plus the live key set. */
interface SessionQueue {
  tail: Promise<unknown>
  active: Set<string>
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
    state = { tail: Promise.resolve(), active: new Set<string>() }
    queues.set(entry.sessionId, state)
  }
  if (state.active.has(entry.key)) return { kind: 'dropped', reason: 'duplicate' }

  state.active.add(entry.key)
  const controller = new AbortController()
  const forwardAbort = () => controller.abort()
  if (entry.signal !== undefined) {
    if (entry.signal.aborted) {
      state.active.delete(entry.key)
      return { kind: 'dropped', reason: 'aborted' }
    }
    entry.signal.addEventListener('abort', forwardAbort, { once: true })
  }

  const previous = state.tail
  const run = async (): Promise<AskOutcome<T>> => {
    try {
      if (entry.signal?.aborted) return { kind: 'dropped', reason: 'aborted' }
      if (entry.isMoot !== undefined && await entry.isMoot()) return { kind: 'dropped', reason: 'moot' }
      return { kind: 'answered', value: await entry.run(controller) }
    } finally {
      state.active.delete(entry.key)
      if (entry.signal !== undefined) entry.signal.removeEventListener('abort', forwardAbort)
    }
  }
  const current = previous.catch(() => undefined).then(run)
  // The tail must never reject — a failed pop cannot be allowed to poison
  // every later pop on the same session.
  state.tail = current.catch(() => undefined)
  return current
}
