/**
 * Append-only workspace projection store for one BAF change.
 * @module @deepseek-ai/dsh-baf-workflow/projection
 */

import { createHash, randomUUID } from 'node:crypto'
import {
  mkdir, open, readFile, rename, unlink, readdir,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  BafError,
  PROJECTION_DIR,
  PROJECTION_INDEX_PATH,
  projectionLogPath,
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
      if (event.intake.mode === 'bug-fast-path') {
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
    case 'intake-confirmed':
      if (state.intake !== undefined) {
        state.intake = { ...state.intake, confirmation: 'confirmed', requiresUserConfirmation: false }
      }
      state.nodes.intake = 'completed'
      break
    case 'stage-entered':
      state.current = event.node
      state.nodes[event.node] = 'in-progress'
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
      state.mode = 'full-go'
      state.openspecSkipped = { skipped: false, reasonCodes: [event.cause] }
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
        throw new BafError('writer_conflict', 'another projection writer holds the lock', {
          path,
          pid: process.pid,
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
      return await current
    } finally {
      if (this.queues.get(changeId) === current) this.queues.delete(changeId)
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
    await rename(tmp, path)
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
