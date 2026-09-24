/**
 * Append-only workspace projection store for one BAF change.
 * @module @deepseek-ai/dsh-baf-workflow/projection
 */

import { createHash, randomUUID } from 'node:crypto'
import {
  mkdir, open, readFile, rename, unlink, readdir,
} from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {
  BafError,
  PROJECTION_DIR,
  PROJECTION_INDEX_PATH,
  projectionLogPath,
  type BaselineLock,
  type ChangeIntake,
  type NodeAnnotation,
  type NodeStatus,
  type ProjectionEvent,
  type TerminalState,
  type WorkflowMode,
  type WorkflowNode,
  type WorkflowStatus,
} from '@deepseek-ai/dsh-baf-core'

/** Derived index row (non-authoritative). */
export interface ProjectionIndexEntry {
  readonly changeId: string
  readonly mode: WorkflowMode
  readonly current: WorkflowNode | TerminalState
  readonly seq: number
  readonly updatedAt: string
}

/** Workspace projection index document. */
export interface ProjectionIndex {
  readonly schema: 1
  readonly changes: readonly ProjectionIndexEntry[]
}

/**
 * Whether an index row is still unfinished (§18.3.1).
 *
 * The definition lives here, next to the index type, because three surfaces
 * ask the same question — the `baf-go` coordinator (binding), the session gate
 * (startup card) and `/baf-status` — and a second copy of "what counts as
 * unfinished" is exactly the kind of split that makes those surfaces disagree.
 *
 * The parameter is the row's minimum shape rather than the full
 * {@link ProjectionIndexEntry}: resolvers that only need `current` (see
 * `command-drives.ts`) declare a `Pick` of it, and a predicate that demanded
 * the whole row would force them to carry fields they never read.
 * @param entry - projection index row (or any subset carrying `current`).
 * @returns true when the change has neither archived nor been abandoned.
 */
export function isActiveChange(entry: { readonly current: WorkflowNode | TerminalState }): boolean {
  return entry.current !== 'completed' && entry.current !== 'abandoned'
}

/**
 * Stale writer-lock threshold (§18.4 leak guard): if the lock file's `at`
 * timestamp is older than this, the previous owner is presumed dead (process
 * crash / kill / restart without releasing) and the lock may be reclaimed.
 *
 * 60s is well above the longest legitimate append path (an OpenSpec validate
 * + C-stack coverage + analysis run can take a few seconds; the verify drive
 * is the slowest). Below that, racing a live writer would corrupt the JSONL.
 *
 * Override via the `BAF_STALE_LOCK_MS` environment variable when running a
 * long-running verify (e.g. on a CI agent that suspends the process between
 * commands and crosses the 60s boundary on resume). Bad inputs fall back to
 * the default and log once — silent fallback would let a regression that
 * merely set the env var to `0` reintroduce the lock-corruption race.
 */
export const STALE_LOCK_MS = (() => {
  const fallback = 60_000
  const raw = process.env.BAF_STALE_LOCK_MS
  if (raw === undefined || raw === '') return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1_000) {
    console.warn(`[baf] BAF_STALE_LOCK_MS=${JSON.stringify(raw)} is not a positive integer ≥ 1000; using ${fallback}ms`)
    return fallback
  }
  return parsed
})()

/** Read the `at` field of a writer-lock file, or undefined when absent / malformed. */
async function readLockAt(path: string): Promise<string | undefined> {
  try {
    const text = await readFile(path, 'utf8')
    const parsed = JSON.parse(text) as { at?: unknown }
    return typeof parsed.at === 'string' ? parsed.at : undefined
  } catch {
    return undefined
  }
}

/**
 * Pick the "active" change every entry surface agrees on (§13 issue #2).
 *
 * One workspace can carry multiple non-terminal changes at once (a slow
 * design still parked next to a fresh bug-fix-path). The drives, the Tab,
 * `/baf-status`, and the session-gate all ask "which one is the focus?"
 * — and §22 says the focus is the change the customer was last driving,
 * not the lexically-first row in the index. We rank by projection `seq`
 * descending (the most recent event wins), tie-break by changeId lexical
 * order (deterministic, locale-independent). The result is the same
 * regardless of which surface asked, so a Tab click and a `/baf-go` typed
 * at the terminal always converge on the same change id.
 *
 * Sync variant of {@link resolveActiveChange} — the drives already hold
 * the index in hand (they did `store.readIndex()`), so going async just
 * to re-read would be pointless. The async helper is the public surface
 * for callers that do not have the index loaded.
 * @param changes - workspace projection index rows.
 * @returns discriminated union.
 */
export function pickActiveChange(changes: readonly ProjectionIndexEntry[]):
  | { readonly kind: 'none' }
  | { readonly kind: 'one'; readonly changeId: string }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly ProjectionIndexEntry[] }
{
  const actives = changes.filter(isActiveChange)
  if (actives.length === 0) return { kind: 'none' }
  if (actives.length === 1) {
    const only = actives[0]
    if (only === undefined) return { kind: 'none' }
    return { kind: 'one', changeId: only.changeId }
  }
  const sorted = [...actives].sort((a, b) =>
    a.seq !== b.seq ? b.seq - a.seq : a.changeId.localeCompare(b.changeId),
  )
  return { kind: 'ambiguous', candidates: sorted }
}

export async function resolveActiveChange(store: ProjectionStore): Promise<
  | { readonly kind: 'none' }
  | { readonly kind: 'one'; readonly changeId: string }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly ProjectionIndexEntry[] }
> {
  const index = await store.readIndex()
  return pickActiveChange(index.changes)
}

/**
 * List every active (non-terminal) change in the workspace, oldest first.
 * Used by the session gate's welcome card and the dashboard panel.
 */
export async function listActiveChanges(store: ProjectionStore): Promise<readonly ProjectionIndexEntry[]> {
  const index = await store.readIndex()
  return index.changes.filter(isActiveChange)
}

/** Mutable fold state while replaying events. */
interface FoldState {
  changeId: string
  mode: WorkflowMode
  current: WorkflowNode | TerminalState
  nodes: Partial<Record<WorkflowNode, NodeStatus>>
  annotations: Partial<Record<WorkflowNode, NodeAnnotation>>
  intake?: ChangeIntake
  terminal?: TerminalState
  updatedAt?: string
  openspecSkipped?: { skipped: boolean; reasonCodes: readonly string[] }
  baseline?: BaselineLock
}

/**
 * Replay projection events into a WorkflowStatus.
 * @param changeId - owning change.
 * @param events - ordered events (seq ascending).
 * @returns status, or throws projection_corrupted on structural failure.
 */
export function replay(changeId: string, events: readonly ProjectionEvent[]): WorkflowStatus {
  const state: FoldState = {
    changeId,
    mode: 'clarify-required',
    current: 'intake',
    nodes: { intake: 'available' },
    annotations: {},
  }

  let expected = 1
  for (const event of events) {
    if (event.seq !== expected) {
      throw new BafError('projection_corrupted', `seq gap: expected ${expected}, got ${event.seq}`, {
        changeId,
        expectedSeq: expected,
        actualSeq: event.seq,
      })
    }
    expected += 1
    state.updatedAt = event.at
    applyEvent(state, event)
  }

  return {
    changeId,
    mode: state.mode,
    current: state.current,
    nodes: { ...state.nodes },
    ...(Object.keys(state.annotations).length > 0 ? { annotations: { ...state.annotations } } : {}),
    ...(state.intake === undefined ? {} : { intake: state.intake }),
    projectionVersion: events.at(-1)?.seq ?? 0,
    ...(state.terminal === undefined ? {} : { terminal: state.terminal }),
    ...(state.updatedAt === undefined ? {} : { updatedAt: state.updatedAt }),
    ...(state.openspecSkipped === undefined ? {} : { openspecSkipped: state.openspecSkipped }),
    ...(state.baseline === undefined ? {} : { baseline: state.baseline }),
  }
}

/**
 * Apply one event onto fold state.
 * @param state - mutable fold.
 * @param event - next event.
 */
function applyEvent(state: FoldState, event: ProjectionEvent): void {
  switch (event.type) {
    case 'intake-classified':
      state.intake = event.intake
      state.mode = event.intake.mode
      state.current = 'intake'
      state.nodes.intake = 'in-progress'
      if (event.intake.mode === 'bug-fix-path') {
        state.openspecSkipped = {
          skipped: true,
          reasonCodes: event.intake.reasonCodes,
        }
        for (const skipped of ['clarify', 'design', 'plan'] as const) {
          state.nodes[skipped] = 'skipped'
          state.annotations[skipped] = {
            reasonCodes: ['fast-path-cut', ...event.intake.reasonCodes],
          }
        }
      }
      break
    case 'intake-settled': {
      // 【变更】2026-09-23 (demo1 十问题 9): the archive-time settlement —
      // a finished change must not show 待定 in 类型/影响范围 forever.
      // 【变更】2026-09-24 (demo6 问题 2/6): per-field application — the settle
      // now fires at the stage where each fact is known (kind at classify
      // confirm, scope at plan completion, both at archive as the backstop).
      // An event settles only the field it carries AND only while that field
      // is still 待定; a replay that settles nothing appends nothing (the
      // reasonCodes list must not grow on stray replays).
      if (state.intake === undefined) break
      const settleKind = event.kind !== undefined && state.intake.kind === 'unknown'
        ? event.kind
        : undefined
      const settleScope = event.affectedScope !== undefined && state.intake.affectedScope === 'unknown'
        ? event.affectedScope
        : undefined
      if (settleKind === undefined && settleScope === undefined) break
      state.intake = {
        ...state.intake,
        ...(settleKind !== undefined ? { kind: settleKind } : {}),
        ...(settleScope !== undefined ? { affectedScope: settleScope } : {}),
        reasonCodes: Object.freeze([...state.intake.reasonCodes, ...(event.reasonCodes ?? ['settled-at-archive'])]),
      }
      break
    }
    case 'intake-confirmed':
      if (state.intake !== undefined) {
        state.intake = { ...state.intake, confirmation: 'confirmed', requiresUserConfirmation: false }
      }
      state.nodes.intake = 'completed'
      break
    case 'intake-mode-set': {
      // §22.17 J — customer path override at the classify gate. Legal while
      // the intake is pending, or — the rescue arm mirroring `setIntakeMode`
      // — while a confirmed intake still sits on the unresolved
      // `clarify-required` verdict; anything else stays audit-only so a
      // replayed log never resurrects a confirmed change's chosen path.
      if (state.intake === undefined) break
      if (state.intake.confirmation === 'confirmed' && state.intake.mode !== 'clarify-required') break
      if (event.to === state.intake.mode) break
      state.intake = { ...state.intake, mode: event.to }
      // 【变更】2026-09-23 (demo1 issue #2): choosing the bug-fix fast path IS
      // the assertion「这是缺陷」— the customer settles the one field the
      // keyword heuristic left at 'unknown'. The full-go choice settles
      // nothing (a feature, a refactor and a cross-module bug all take it),
      // so only the bug-fix override writes kind.
      if (event.to === 'bug-fix-path' && state.intake.kind === 'unknown') {
        state.intake = {
          ...state.intake,
          kind: 'bug',
          reasonCodes: [...state.intake.reasonCodes, 'kind-settled-by-path'],
        }
      }
      state.mode = event.to
      if (event.to === 'bug-fix-path') {
        // Same shape the classified-bug fold applies (§ intake-classified):
        // fast-path cuts the openspec doc stages and annotates why.
        state.openspecSkipped = { skipped: true, reasonCodes: ['customer-override'] }
        for (const skipped of ['clarify', 'design', 'plan'] as const) {
          state.nodes[skipped] = 'skipped'
          state.annotations[skipped] = { reasonCodes: ['fast-path-cut', 'customer-override'] }
        }
      } else {
        // Mirror of `mode-upgraded`: reopen the doc stages the fast path cut.
        state.openspecSkipped = { skipped: false, reasonCodes: ['customer-override'] }
        for (const node of ['clarify', 'design', 'plan'] as const) {
          if (state.nodes[node] === 'skipped') {
            state.nodes[node] = 'available'
            const nextAnnotations = { ...state.annotations }
            Reflect.deleteProperty(nextAnnotations, node)
            state.annotations = nextAnnotations
          }
        }
      }
      break
    }
    case 'stage-entered':
      state.current = event.node
      state.nodes[event.node] = 'in-progress'
      // §19.3: `nodes.drift` tracks "currently parked in drift", not "has
      // ever drifted". Any entry — normal progression or a T13 resume —
      // resolves the park; the `drift-detected` audit events stay in the log.
      if (state.nodes.drift === 'drifted') Reflect.deleteProperty(state.nodes, 'drift')
      break
    case 'baseline-locked':
      state.baseline = event.lock
      break
    case 'stage-completed':
      state.nodes[event.node] = 'completed'
      state.annotations[event.node] = {
        ...state.annotations[event.node],
        artifacts: event.artifacts,
      }
      break
    case 'stage-failed':
      state.nodes[event.node] = 'failed'
      state.annotations[event.node] = {
        ...state.annotations[event.node],
        detail: event.reason,
      }
      break
    case 'drift-detected':
      state.current = 'drift'
      state.nodes.drift = 'drifted'
      state.nodes[event.node] = 'drifted'
      state.annotations.drift = { detail: event.cause }
      break
    case 'mode-upgraded':
      state.mode = 'full-go-path'
      // §13 R6 — `event.cause` is now structured `{ code, message } | string`;
      // the fold keeps the human-readable summary (or the legacy string) in
      // `reasonCodes` so the rest of the projection fold stays string-only.
      const upgradeReason = typeof event.cause === 'string' ? event.cause : event.cause.message
      state.openspecSkipped = { skipped: false, reasonCodes: [upgradeReason] }
      for (const node of ['clarify', 'design', 'plan'] as const) {
        if (state.nodes[node] === 'skipped') {
          state.nodes[node] = 'available'
          const nextAnnotations = { ...state.annotations }
          if (node === 'clarify') Reflect.deleteProperty(nextAnnotations, 'clarify')
          else if (node === 'design') Reflect.deleteProperty(nextAnnotations, 'design')
          else Reflect.deleteProperty(nextAnnotations, 'plan')
          state.annotations = nextAnnotations
        }
      }
      break
    case 'change-archived':
      state.current = 'completed'
      state.terminal = 'completed'
      state.nodes.archive = 'completed'
      break
    case 'change-abandoned':
      state.current = 'abandoned'
      state.terminal = 'abandoned'
      break
    case 'transition-rejected':
      // Audit-only; status unchanged.
      break
    case 'awaiting-confirm':
      // Audit-only; status unchanged. The gate is *derived* from the node
      // status (`design` completed → gate A, `verify` completed → gate B), so
      // recording it must not move `current` or `nodes` — the coordinator
      // re-reads status to decide (§18.5).
      break
    default: {
      const _exhaustive: never = event
      void _exhaustive
      throw new BafError('projection_corrupted', 'unknown projection event type', { changeId: state.changeId })
    }
  }
}

/**
 * Parse a JSONL projection log. Stops at the first corrupt line.
 * @param text - file contents.
 * @param changeId - change id for errors.
 * @returns events and optional corruption marker.
 */
export function parseProjectionLog(
  text: string,
  _changeId: string,
): { events: ProjectionEvent[]; corruptedAt?: number } {
  const events: ProjectionEvent[] = []
  if (text.trim() === '') return { events }
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line === undefined || line.trim() === '') continue
    try {
      const parsed = JSON.parse(line) as ProjectionEvent
      if (typeof parsed !== 'object' || parsed === null || typeof parsed.seq !== 'number') {
        return { events, corruptedAt: i + 1 }
      }
      events.push(parsed)
    } catch {
      return { events, corruptedAt: i + 1 }
    }
  }
  return { events }
}

/** Options for {@link ProjectionStore}. */
export interface ProjectionStoreOptions {
  /** Absolute workspace root. */
  readonly workspaceRoot: string
  /** Clock for event timestamps (tests). */
  readonly now?: () => Date
  /** Event id factory (tests). */
  readonly eventId?: () => string
}

/**
 * §13 R8 / §22.19 R5 — per-workspace, process-global append bus. Every
 * {@link ProjectionStore} of the same workspace root (and the host remote
 * deliberately constructs short-lived ones per drive — `beginIntake`,
 * `driveGo`, the orchestrator each build their own) fans appends out to the
 * SAME subscriber set: before §22.19 the bus was per-instance, so a
 * persistent subscriber could only hear its own writes and never the ones
 * it actually cares about — the drives' appends.
 *
 * The bus is intentionally **not** persisted and **not** cross-process: a
 * second dsh instance writing the same workspace won't poke this process —
 * the Tab's visibility refresh + poll fallback is the safety net for that
 * case. The point is to remove the latency on the same-process hot path,
 * where the bus pays for itself.
 */
const WORKSPACE_LISTENERS = new Map<string, Set<(changeId: string) => void>>()

/** Registry key for one workspace root (Windows paths compare case-blind). */
function workspaceBusKey(root: string): string {
  const resolved = resolve(root)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/**
 * Single-writer projection store for one workspace.
 * Holds an in-process queue and a lock file to refuse a second OS writer.
 */
export class ProjectionStore {
  private readonly root: string
  private readonly now: () => Date
  private readonly eventId: () => string
  private readonly queues = new Map<string, Promise<unknown>>()
  private lockHeld = false

  constructor(options: ProjectionStoreOptions) {
    this.root = options.workspaceRoot
    this.now = options.now ?? (() => new Date())
    this.eventId = options.eventId ?? (() => randomUUID())
  }

  /**
   * Absolute workspace root this store writes under.
   * @returns workspace root.
   */
  workspaceRoot(): string {
    return this.root
  }

  /**
   * Absolute path to a change log.
   * @param changeId - change id.
   * @returns absolute path.
   */
  logPath(changeId: string): string {
    return join(this.root, projectionLogPath(changeId))
  }

  /**
   * Absolute path to the derived index.
   * @returns absolute path.
   */
  indexPath(): string {
    return join(this.root, PROJECTION_INDEX_PATH)
  }

  /**
   * Absolute path to the writer lock file.
   * @returns absolute path.
   */
  lockPath(): string {
    return join(this.root, PROJECTION_DIR, '.writer.lock')
  }

  /**
   * Acquire the workspace writer lock (best-effort exclusive create).
   *
   * On `EEXIST` the lock is inspected: if its `at` is older than
   * {@link STALE_LOCK_MS}, the previous owner is presumed dead (crash /
   * kill / unlink-on-restart) and the stale lock is reclaimed. Otherwise
   * a {@link BafError} with code `writer_conflict` is thrown so the caller
   * surfaces it instead of corrupting the JSONL.
   * @returns disposer that releases the lock.
   */
  async acquireWriter(): Promise<() => Promise<void>> {
    await mkdir(join(this.root, PROJECTION_DIR), { recursive: true })
    const path = this.lockPath()
    try {
      const handle = await open(path, 'wx')
      await handle.writeFile(JSON.stringify({ pid: process.pid, at: this.now().toISOString() }))
      await handle.close()
      this.lockHeld = true
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EEXIST') {
        // Stale-lock guard: a writer that died holding the lock leaves a
        // file behind. Reclaim after the freshness window so a fresh boot
        // can recover without operator intervention.
        const priorAt = await readLockAt(path)
        const ageMs = priorAt === undefined
          ? Number.POSITIVE_INFINITY
          : Date.now() - Date.parse(priorAt)
        if (priorAt !== undefined && Number.isFinite(ageMs) && ageMs > STALE_LOCK_MS) {
          try {
            await unlink(path)
          } catch {
            // Another process reclaimed it between read and unlink; fall
            // through to writer_conflict so the caller still sees the
            // conflict instead of silently racing.
          }
          return this.acquireWriter()
        }
        throw new BafError('writer_conflict', 'another projection writer holds the lock', {
          path,
          pid: process.pid,
          priorAt: priorAt ?? null,
          ageMs: Number.isFinite(ageMs) ? ageMs : null,
        })
      }
      throw error
    }
    return async () => {
      if (!this.lockHeld) return
      this.lockHeld = false
      try {
        await unlink(path)
      } catch (error) {
        // Lock already gone — nothing else to clean.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
  }

  /**
   * Read and replay one change log.
   * @param changeId - change id.
   * @returns status.
   */
  async readStatus(changeId: string): Promise<WorkflowStatus> {
    const { events, corruptedAt } = await this.readEvents(changeId)
    if (corruptedAt !== undefined) {
      throw new BafError('projection_corrupted', `corrupt line ${corruptedAt} in projection log`, {
        changeId,
        line: corruptedAt,
        lastGoodSeq: events.at(-1)?.seq ?? 0,
      })
    }
    return replay(changeId, events)
  }

  /**
   * Read raw events for a change.
   * @param changeId - change id.
   * @returns parsed events and optional corruption line.
   */
  async readEvents(changeId: string): Promise<{ events: ProjectionEvent[]; corruptedAt?: number }> {
    const path = this.logPath(changeId)
    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { events: [] }
      throw error
    }
    return parseProjectionLog(text, changeId)
  }

  /**
   * Append one event with compare-and-swap on expectedSeq.
   * @param changeId - change id.
   * @param expectedSeq - caller-observed tail seq (0 when empty).
   * @param build - factory receiving the next seq / eventId / at.
   * @returns the appended event and new status.
   */
  async append(
    changeId: string,
    expectedSeq: number,
    build: (meta: { seq: number; eventId: string; at: string }) => Omit<ProjectionEvent, 'seq' | 'eventId' | 'at'> & {
      type: ProjectionEvent['type']
    },
  ): Promise<{ event: ProjectionEvent; status: WorkflowStatus }> {
    const run = async (): Promise<{ event: ProjectionEvent; status: WorkflowStatus }> => {
      const release = await this.acquireWriter()
      try {
        const { events, corruptedAt } = await this.readEvents(changeId)
        if (corruptedAt !== undefined) {
          throw new BafError('projection_corrupted', `corrupt line ${corruptedAt} in projection log`, {
            changeId,
            line: corruptedAt,
          })
        }
        const tail = events.at(-1)?.seq ?? 0
        if (tail !== expectedSeq) {
          throw new BafError('writer_conflict', `stale expectedSeq: have ${tail}, expected ${expectedSeq}`, {
            changeId,
            expectedSeq,
            actualSeq: tail,
          })
        }
        const seq = expectedSeq + 1
        const eventId = this.eventId()
        const at = this.now().toISOString()
        const partial = build({ seq, eventId, at })
        // Idempotent: identical eventId already at tail is a no-op success.
        const duplicate = events.find(e => e.eventId === eventId)
        if (duplicate !== undefined) {
          return { event: duplicate, status: replay(changeId, events) }
        }
        const event = { ...partial, seq, eventId, at } as ProjectionEvent
        const next = [...events, event]
        await this.commitLog(changeId, next)
        const status = replay(changeId, next)
        await this.updateIndex(status)
        return { event, status }
      } finally {
        await release()
      }
    }
    const previous = this.queues.get(changeId) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(run)
    this.queues.set(changeId, current)
    try {
      const result = await current
      // §13 R8 — fire-and-forget; throwing listeners must not poison the
      // writer queue. The catch wrapper is cheap: subscribers are the Tab
      // view rebuilder which catches its own errors and shows a blocked
      // reason instead of crashing the dashboard.
      this.emit(changeId)
      return result
    } finally {
      if (this.queues.get(changeId) === current) this.queues.delete(changeId)
    }
  }

  /**
   * §13 R8 / §22.19 R5 — register a workspace subscriber. Returns an
   * unsubscribe function so the Tab can `useEffect` pair subscribe/unsubscribe
   * without leaking the listener when the workspace unmounts. The listener is
   * poked once per successfully appended event **on any store instance of this
   * workspace** — the drives construct their own stores, and the subscriber
   * must hear those appends too — passing the `changeId` so a single listener
   * that watches every change can still index cheaply.
   * @param listener - callback fired with the affected changeId.
   * @returns unsubscribe function.
   */
  subscribe(listener: (changeId: string) => void): () => void {
    const key = workspaceBusKey(this.root)
    let set = WORKSPACE_LISTENERS.get(key)
    if (set === undefined) {
      set = new Set()
      WORKSPACE_LISTENERS.set(key, set)
    }
    set.add(listener)
    return () => {
      set.delete(listener)
      if (set.size === 0) WORKSPACE_LISTENERS.delete(key)
    }
  }

  private emit(changeId: string): void {
    const set = WORKSPACE_LISTENERS.get(workspaceBusKey(this.root))
    if (set === undefined) return
    for (const listener of set) {
      try {
        listener(changeId)
      } catch (error) {
        // Last-resort guard: a listener that throws synchronously must
        // not break the loop or bubble out of `append`. Surface via
        // process warning channel; production telemetry can hook here.
        console.warn(`[baf] projection listener threw: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  /**
   * List change ids known to the derived index (rebuilds when missing).
   * @returns change ids.
   */
  async listChangeIds(): Promise<readonly string[]> {
    const index = await this.readIndex()
    return index.changes.map(c => c.changeId)
  }

  /**
   * Read or rebuild the derived index.
   * @returns index document.
   */
  async readIndex(): Promise<ProjectionIndex> {
    try {
      const raw = await readFile(this.indexPath(), 'utf8')
      const parsed = JSON.parse(raw) as ProjectionIndex
      if (parsed.schema === 1 && Array.isArray(parsed.changes)) return parsed
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Fall through to rebuild on corrupt index.
      }
    }
    return this.rebuildIndex()
  }

  /**
   * Rebuild index.json from all change logs under the projection dir.
   * @returns rebuilt index.
   */
  async rebuildIndex(): Promise<ProjectionIndex> {
    const dir = join(this.root, PROJECTION_DIR)
    await mkdir(dir, { recursive: true })
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      names = []
    }
    const changes: ProjectionIndexEntry[] = []
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue
      const changeId = name.slice(0, -'.jsonl'.length)
      try {
        const status = await this.readStatus(changeId)
        changes.push({
          changeId,
          mode: status.mode,
          current: status.current,
          seq: status.projectionVersion,
          updatedAt: status.updatedAt ?? '',
        })
      } catch {
        // Skip unreadable logs during rebuild; doctor surfaces corruption separately.
      }
    }
    const index: ProjectionIndex = { schema: 1, changes }
    await this.writeAtomic(this.indexPath(), `${JSON.stringify(index, null, 2)}\n`)
    return index
  }

  /**
   * Write the full JSONL log atomically.
   * @param changeId - change id.
   * @param events - complete event list.
   */
  private async commitLog(changeId: string, events: readonly ProjectionEvent[]): Promise<void> {
    const path = this.logPath(changeId)
    const body = events.map(e => JSON.stringify(e)).join('\n') + (events.length > 0 ? '\n' : '')
    await this.writeAtomic(path, body)
  }

  /**
   * Update one row in the derived index.
   * @param status - latest status.
   */
  private async updateIndex(status: WorkflowStatus): Promise<void> {
    const index = await this.readIndex()
    const entry: ProjectionIndexEntry = {
      changeId: status.changeId,
      mode: status.mode,
      current: status.current,
      seq: status.projectionVersion,
      updatedAt: status.updatedAt ?? '',
    }
    const others = index.changes.filter(c => c.changeId !== status.changeId)
    const next: ProjectionIndex = { schema: 1, changes: [...others, entry] }
    await this.writeAtomic(this.indexPath(), `${JSON.stringify(next, null, 2)}\n`)
  }

  /**
   * Write via temp file + fsync + rename.
   *
   * The final rename retries briefly on Windows sharing violations: renaming
   * onto a target a concurrent reader holds open (Tab refresh polling the
   * index, a test's poll loop) fails transiently with EPERM/EBUSY — the
   * reader releases within milliseconds, and without the retry a customer's
   * gate-card click could die as an error card just because a refresh was
   * mid-read (observed as the 2026-09-20 auto-pop flake).
   * @param path - destination.
   * @param body - file body.
   */
  private async writeAtomic(path: string, body: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    const hash = createHash('sha1').update(body).digest('hex').slice(0, 8)
    const tmp = `${path}.${process.pid}.${hash}.tmp`
    const handle = await open(tmp, 'w')
    try {
      await handle.writeFile(body, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(tmp, path)
        return
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if ((code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') && attempt < 5) {
          await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)))
          continue
        }
        throw error
      }
    }
  }
}

/**
 * Fingerprint used only for tests asserting atomic write paths.
 * @param body - content.
 * @returns short hash.
 */
export function contentFingerprint(body: string): string {
  return createHash('sha1').update(body).digest('hex')
}
