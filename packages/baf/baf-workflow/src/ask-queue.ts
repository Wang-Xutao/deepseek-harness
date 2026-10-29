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

/**
 * 【变更】2026-10-27 (批次三十二 · 用户问题 10): the CHANGE-scoped single-flight
 * registry — the gates of one change that are on screen RIGHT NOW.
 *
 * Why the per-session queue was not enough: its key dedupe is scoped to ONE
 * session's chain, so the same gate for the same change could still be popped
 * twice through two chains — the orchestrator's turn-end pop (retargeted to the
 * workspace's home session) and the model's mid-turn `baf_gate_ask` (scoped to
 * the tool's own session). The customer then saw 「澄清已完成 · 请确认进入设计」
 * twice: the first dialog was still unanswered when the second replaced it.
 *
 * This registry is keyed by (change, gate) and shared across bundle copies, so
 * "one gate per change" holds across every surface and every session. A pop
 * that finds its gate already on screen stands down as `duplicate` — the
 * customer decides the outcome once.
 */
const CHANGE_GATES = sharedHostMap<Set<string>>('ask-queue/change-gates')

/**
 * The registry key of one change's gate.
 * @param changeId - the change the gate is about.
 * @param gateId - the gate id.
 * @returns the key.
 */
export function changeGateKey(changeId: string, gateId: string): string {
  return `${changeId}|${gateId}`
}

/**
 * Claim the on-screen slot of one change's gate.
 *
 * The claim is held from the moment the pop starts until the dialog settles
 * (answered, cancelled, or dropped) — so a second pop for the same gate is
 * refused for exactly as long as the first dialog is on screen.
 * @param changeId - the change the gate is about.
 * @param gateId - the gate id.
 * @returns true when the claim was granted; false when the gate is already on
 *   screen.
 */
export function claimChangeGate(changeId: string, gateId: string): boolean {
  let gates = CHANGE_GATES.get(changeId)
  if (gates === undefined) {
    gates = new Set<string>()
    CHANGE_GATES.set(changeId, gates)
  }
  if (gates.has(gateId)) return false
  gates.add(gateId)
  return true
}

/**
 * Release the on-screen slot of one change's gate — the dialog settled, so a
 * later pop may offer it again.
 * @param changeId - the change the gate is about.
 * @param gateId - the gate id.
 * @returns nothing.
 */
export function releaseChangeGate(changeId: string, gateId: string): void {
  const gates = CHANGE_GATES.get(changeId)
  if (gates === undefined) return
  gates.delete(gateId)
  if (gates.size === 0) CHANGE_GATES.delete(changeId)
}

/**
 * Test seam — forget every session chain and every change's gate slot.
 * A running host never calls this.
 */
export function resetAskQueue(): void {
  queues.clear()
  CHANGE_GATES.clear()
}

/**
 * The prefix every gate pop's queue key carries (`gate:<gateId>:<changeId>`).
 */
const GATE_KEY_PREFIX = 'gate:'

/**
 * The gate id of a queue key, when the key belongs to a gate pop.
 * @param key - the queue key.
 * @returns the gate id, or undefined for a non-gate key.
 */
function gateIdOfKey(key: string): string | undefined {
  if (!key.startsWith(GATE_KEY_PREFIX)) return undefined
  const rest = key.slice(GATE_KEY_PREFIX.length)
  const separator = rest.indexOf(':')
  return separator === -1 ? rest : rest.slice(0, separator)
}

/**
 * 【变更】2026-10-29 (批次三十六 · 用户问题 2): whether the same GATE is
 * already queued or on screen in this session — regardless of the change id
 * the two pops name.
 *
 * Why: a gate pop that carries NO change id cannot take the change-scoped
 * on-screen slot (`claimChangeGate` is keyed by change + gate), so the
 * orchestrator's turn-end pop of the SAME decision — which does carry the
 * change id — used to pop a second dialog over the first one. Keying the
 * dedupe on the GATE (not on change + gate) makes the session the last line of
 * defence: one session shows one card per gate, and the second pop stands
 * down instead of covering the first.
 *
 * @param state - the session's queue state.
 * @param key - the key of the pop that wants to run.
 * @returns true when the same gate is already active in this session.
 */
function gateAlreadyOnScreen(state: SessionQueue, key: string): boolean {
  const gateId = gateIdOfKey(key)
  if (gateId === undefined) return false
  for (const active of state.active) {
    if (active === key) continue
    if (gateIdOfKey(active) === gateId) return true
  }
  return false
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
  // 【变更】2026-10-29 (批次三十六 · 用户问题 2): the same gate already on
  // screen in this session stands down even when the two pops name different
  // change ids (the change-scoped slot cannot dedupe an unscoped pop).
  if (gateAlreadyOnScreen(state, entry.key)) return { kind: 'dropped', reason: 'duplicate' }

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
