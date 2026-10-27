/**
 * 【变更】2026-10-27 (批次三十一): the OUT-OF-SYNC HOLD.
 *
 * The customer edited an upstream document after a downstream one was written.
 * The two documents no longer agree, so the workflow must not advance past the
 * disagreement and must not pop a confirmation the customer cannot judge from
 * contradicting documents — the 同步 notice is the customer's next action, and
 * the flow resumes when the documents agree again.
 *
 * The customer's own commands stay untouched (the 同步 order is one): the hold
 * covers the AUTOMATIC pops and the turn-end dispatch, nothing else.
 */

import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply, resetOrchestrator } from '../src/orchestrator.ts'
import { driveClassify } from '../src/command-drives.ts'
import { driveGo } from '../src/go-coordinator.ts'
import { ProjectionStore } from '../src/projection.ts'
import { focusFor, resetFocusCache } from '../src/session-focus.ts'
import { detectArtifactDrift } from '../src/stages/artifact-drift.ts'

const execFileAsync = promisify(execFile)

const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

/** A description the heuristic classifier lands on full-go-path + public-api. */
const DESCRIPTION = 'feat: add export public API for reports'

/** One minute between two artifacts — coarse enough for any filesystem stamp. */
const STEP_MS = 60_000

/** Workspace fixture: baseline + git repo. */
async function setup(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'baf-drift-hold-'))
  await mkdir(join(root, '.baf'), { recursive: true })
  await writeFile(
    join(root, '.baf', 'baseline.yml'),
    await readFile(FIXTURE_BASELINE, 'utf8'),
    'utf8',
  )
  await execFileAsync('git', ['init', '-q'], { cwd: root })
  await execFileAsync('git', [
    '-c', 'user.email=baf@test', '-c', 'user.name=baf', '-c', 'commit.gpgsign=false',
    'commit', '-q', '--allow-empty', '-m', 'init',
  ], { cwd: root })
  return root
}

/** A `userQuestions` service double — the hold must never ask. */
function serviceWith(): { calls: unknown[]; ask(request: unknown): Promise<never> } {
  const calls: unknown[] = []
  return {
    calls,
    async ask(request: unknown): Promise<never> {
      calls.push(request)
      throw new Error('the hold must not ask the customer anything')
    },
  }
}

/** Install the row against a fake host ctx and return the captured listener. */
function install(service: unknown): {
  emit: (session: unknown, event: unknown) => void
  logs: string[]
  followups: string[]
} {
  const listeners = new Map<string, (session: unknown, event: unknown) => void>()
  const logs: string[] = []
  const followups: string[] = []
  const agent = {
    session: { header: { id: 'sess-drift', cwd: 'replaced-per-test' } },
    ctx: { get: (name: string) => (name === 'userQuestions' ? service : undefined) },
    followup: (message: { content?: { text?: string }[] }) => {
      followups.push(message.content?.map(b => b.text ?? '').join('\n') ?? '')
    },
  }
  const ctx = {
    on: (name: string, fn: (session: unknown, event: unknown) => void) => {
      listeners.set(name, fn)
    },
    agents: { get: () => agent },
    logger: {
      info: (line: string) => { logs.push(`info: ${line}`) },
      warn: (line: string) => { logs.push(`warn: ${line}`) },
    },
    get: () => undefined,
  } as unknown as Context
  apply(ctx)
  const emit = (session: unknown, event: unknown): void => {
    listeners.get('session/event')?.(session, event)
  }
  return { emit, logs, followups }
}

/** One synthetic turn/end event. */
function turnEnd(turn: number): unknown {
  return { type: 'turn/end', data: { turn, reason: { kind: 'completed' } } }
}

/** Let fire-and-forget async chains settle. */
const settle = async (): Promise<void> => new Promise(resolve => setTimeout(resolve, 200))

/** Poll until fn() returns true (fire-and-forget chains under load). */
async function waitFor(fn: () => Promise<boolean>, logs: string[], what: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await fn()) return
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}; row logs:\n${logs.join('\n')}`)
    }
    await settle()
  }
}

/** Author a change artifact the way a model's guarded writes would. */
async function author(root: string, changeId: string, file: string, body: string): Promise<void> {
  const path = join(root, 'openspec', 'changes', changeId, file)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, body, 'utf8')
}

/** Stamp one artifact's modification time. */
async function stamp(root: string, changeId: string, file: string, mtimeMs: number): Promise<void> {
  const path = join(root, 'openspec', 'changes', changeId, file)
  await utimes(path, new Date(mtimeMs), new Date(mtimeMs))
}

/** The artifact's current modification time. */
async function mtimeOf(root: string, changeId: string, file: string): Promise<number> {
  const s = await stat(join(root, 'openspec', 'changes', changeId, file))
  return Math.floor(s.mtimeMs)
}

/** The single active change id, or undefined. */
async function activeId(root: string): Promise<string | undefined> {
  const index = await new ProjectionStore({ workspaceRoot: root }).readIndex()
  return index.changes.find(c => c.current !== 'completed' && c.current !== 'abandoned')?.changeId
}

/** Fresh module memories per test — the ledger is process-global otherwise. */
beforeEach(() => {
  resetOrchestrator()
  resetFocusCache()
})

describe('the out-of-sync hold (批次三十一)', () => {
  it('sends no work order while the documents disagree, and resumes once they agree', { timeout: 120_000 }, async () => {
    const root = await setup()
    try {
      const service = serviceWith()
      const { emit, logs, followups } = install(service)
      const focus = focusFor(root)
      await driveGo({ cwd: root, rawInput: DESCRIPTION, focus })
      const changeId = await activeId(root)
      if (changeId === undefined) throw new Error('no active change after mint')
      await driveClassify(root, `confirm change=${changeId}`)
      await author(root, changeId, 'proposal.md', [
        '# Proposal',
        '',
        '## Why',
        '',
        'Customers need CSV export of reports for downstream spreadsheets.',
        '',
        '## Scope',
        '',
        '- In: public exportReportsCsv API',
        '',
        '## Impact',
        '',
        'Adds src/export.ts; rollback is deleting the file.',
        '',
      ].join('\n'))
      await driveGo({ cwd: root, focus }) // open → clarify (template installed)

      // The customer edits the upstream document AFTER the downstream one was
      // written: the two no longer agree.
      const clarifyMtime = await mtimeOf(root, changeId, 'clarify.md')
      await stamp(root, changeId, 'proposal.md', clarifyMtime + STEP_MS)
      expect(await detectArtifactDrift(root, changeId, 'full-go-path')).toHaveLength(1)

      // The turn ends on the resting clarify stage whose gate still fails. The
      // old behaviour dispatched the gap order; the hold refuses it — the
      // customer must sync the documents first.
      emit({ header: { id: 'sess-drift', cwd: root } }, turnEnd(1))
      await settle()
      await settle()
      expect(followups).toHaveLength(0)
      expect(service.calls).toHaveLength(0)

      // The sync rewrites the stale document: the documents agree again. The
      // content stays the unfilled template — the resting stage's gate keeps
      // failing, so the turn-end still owes a gap order (the hold released it,
      // nothing else changed).
      await stamp(root, changeId, 'clarify.md', (await mtimeOf(root, changeId, 'proposal.md')) + STEP_MS)
      expect(await detectArtifactDrift(root, changeId, 'full-go-path')).toHaveLength(0)

      // The next turn-end dispatches the very gap the held turn refused.
      emit({ header: { id: 'sess-drift', cwd: root } }, turnEnd(2))
      await waitFor(async () => followups.length >= 1, logs, 'clarify gap order after the sync', 30_000).catch(() => undefined)
      expect(followups.length).toBeGreaterThanOrEqual(1)
      expect(followups[0]).toContain('【BAF 工单 · /baf-go 派单】')
      expect(followups[0]).toContain('阶段：clarify')
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })
})
