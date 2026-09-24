/**
 * §22.19 orchestrator unit tests: the harness-owned workflow line.
 *
 * The row subscribes `session/event` on the host plane and reacts to
 * completed turns. These tests drive the captured listener with synthetic
 * `turn/end` events against real temp workspaces and a fake `userQuestions`
 * service — no Cordis runtime. The due-gate derivation itself (`dueGateFor`)
 * is exercised end to end through these drives; its per-node predicates
 * mirror `explicitGatesFor`, which go.spec pins separately.
 */

import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type {
  AskUserQuestionAnswer,
  AskUserQuestionRequest,
} from '@deepseek-ai/dsh-user-questions'
import { apply, resetOrchestrator } from '../src/orchestrator.ts'
import { noteScaffoldDialogOffered } from '../src/scaffold-offer.ts'
import { driveClassify } from '../src/command-drives.ts'
import { driveGo } from '../src/go-coordinator.ts'
import { ProjectionStore } from '../src/projection.ts'
import { focusFor, resetFocusCache } from '../src/session-focus.ts'

const execFileAsync = promisify(execFile)

const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

/** A description the heuristic classifier lands on full-go-path + public-api. */
const DESCRIPTION = 'feat: add export public API for reports'

/** A `userQuestions` service double that records asks and replies canned answers. */
function serviceWith(replies: AskUserQuestionAnswer[]): {
  calls: AskUserQuestionRequest[]
  ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer>
} {
  const calls: AskUserQuestionRequest[] = []
  let n = 0
  return {
    calls,
    async ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer> {
      calls.push(request)
      const reply = replies[n]
      n += 1
      if (reply === undefined) throw Object.assign(new Error('no reply'), { code: 'NO_PROVIDER' })
      return reply
    },
  }
}

/** A service whose first ask blocks until the test releases it (in-flight dedupe). */
function hangingService(): {
  calls: AskUserQuestionRequest[]
  ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer>
  release(label: string): void
} {
  const calls: AskUserQuestionRequest[] = []
  let resolve: (answer: AskUserQuestionAnswer) => void = () => {}
  const gate = new Promise<AskUserQuestionAnswer>((r) => { resolve = r })
  return {
    calls,
    async ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer> {
      calls.push(request)
      return await gate
    },
    release(label: string): void {
      resolve({ answers: [{ id: 'x', selected: [label] }] })
    },
  }
}

function selected(label: string): AskUserQuestionAnswer {
  return { answers: [{ id: 'x', selected: [label] }] }
}

/** A skip-shaped answer — an option set the customer walked away from. */
const skipped: AskUserQuestionAnswer = { answers: [{ id: 'x', selected: [] }] }

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
    session: { header: { id: 'sess-orch', cwd: 'replaced-per-test' } },
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

/** Workspace fixture: baseline + git repo (the go.spec recipe). */
async function setup(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'baf-orchestrator-'))
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

/** One synthetic turn/end event. */
function turnEnd(turn: number, reasonKind = 'completed'): unknown {
  return { type: 'turn/end', data: { turn, reason: { kind: reasonKind } } }
}

/** Let fire-and-forget async chains settle. */
const settle = async (): Promise<void> => new Promise(resolve => setTimeout(resolve, 150))

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

/** The single active change id, or undefined. */
async function activeId(root: string): Promise<string | undefined> {
  const index = await new ProjectionStore({ workspaceRoot: root }).readIndex()
  return index.changes.find(c => c.current !== 'completed' && c.current !== 'abandoned')?.changeId
}

/** Walk to the parked gate A (design completed, awaiting-confirm tail). */
async function reachGateA(root: string): Promise<string> {
  const focus = focusFor(root)
  await driveGo({ cwd: root, rawInput: DESCRIPTION, focus })
  const changeId = await activeId(root)
  if (changeId === undefined) throw new Error('no active change after mint')
  await driveClassify(root, `confirm change=${changeId}`)
  // 【变更】2026-09-22 (user report #1): open gates on proposal.md now.
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
  await driveGo({ cwd: root, focus }) // open → clarify template
  await author(root, changeId, 'clarify.md', [
    '# Clarify',
    '',
    '## Blocking questions',
    '',
    '- None outstanding; output format settled with the customer.',
    '',
    '## Acceptance criteria',
    '',
    '- npm test exports CSV with a header row',
    '',
  ].join('\n'))
  await driveGo({ cwd: root, focus }) // clarify → design template
  await author(root, changeId, 'design.md', [
    '# Design',
    '',
    '## Approach',
    '',
    'Add src/export.ts exposing exportReportsCsv(rows): string, called from the CLI.',
    '',
    '## References',
    '',
    '- src/export.ts',
    '',
  ].join('\n'))
  await driveGo({ cwd: root, focus }) // parks on gate A
  return changeId
}

/** Fresh module memories per test — the ledger is process-global otherwise. */
beforeEach(() => {
  resetOrchestrator()
  resetFocusCache()
})

describe('§22.19 orchestrator: turn-end gate popping', () => {
  it('a completed turn on a parked gate A pops design-confirm; the click enters plan', { timeout: 120_000 }, async () => {
    const root = await setup()
    try {
      const changeId = await reachGateA(root)
      const service = serviceWith([selected('确认设计，进入计划')])
      const { emit, logs } = install(service)
      emit({ header: { id: 'sess-orch', cwd: root } }, turnEnd(1))
      await waitFor(async () => service.calls.length >= 1, logs, 'design-confirm pop')
      expect(service.calls[0]?.questions[0]?.question).toBe('设计已完成，请确认')
      await waitFor(async () =>
        (await new ProjectionStore({ workspaceRoot: root }).readStatus(changeId)).current === 'plan',
      logs, 'plan entry after the confirm click')
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  // 【变更】2026-09-22 (user report #1): the relay wake is gone — the system
  // never queues synthetic user messages (they render as 插话 boxes in the
  // customer's composer, putting words in the customer's mouth). A turn that
  // ends on an incomplete authoring stage now rests SILENTLY: no dialog (no
  // gate is due) and no follow-up (the model's cue is the standing persona
  // instruction — read the projection + artifacts each turn — plus the
  // customer's next message; /baf-go names the exact missing list on demand).
  it('a turn ending on an incomplete clarify stage dispatches the remaining gap — no dialog, one work order (demo1 五问题 1/3)', { timeout: 120_000 }, async () => {
    const root = await setup()
    try {
      const service = serviceWith([])
      const { emit, followups } = install(service)
      const focus = focusFor(root)
      await driveGo({ cwd: root, rawInput: DESCRIPTION, focus })
      const changeId = await activeId(root)
      if (changeId === undefined) throw new Error('no active change after mint')
      await driveClassify(root, `confirm change=${changeId}`)
      // 【变更】2026-09-22 (user report #1): open gates on proposal.md now.
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

      // The model's turn ends with the template still unfilled: no gate is
      // due, so no dialog pops. 【变更】2026-09-23 (demo1 五问题 1/3): the old
      // contract was TOTAL silence — the demo1 stall (the model idled beside
      // an artifact the gate refused until the customer typed /baf-go). The
      // turn now hands the model the remaining gap as one plugin-sourced work
      // order through the /baf-go channel (never a synthetic customer
      // message); an identical gap dedupes on the next turn.
      emit({ header: { id: 'sess-orch', cwd: root } }, turnEnd(1))
      await waitFor(async () => followups.length >= 1, [], 'clarify gap order', 30_000).catch(() => undefined)
      // Nothing is due: no dialog.
      expect(service.calls).toHaveLength(0)
      // One gap order for the clarify artifact — not a relay follow-up shape.
      expect(followups.length).toBeGreaterThanOrEqual(1)
      expect(followups[0]).toContain('【BAF 工单 · /baf-go 派单】')
      expect(followups[0]).toContain('阶段：clarify')
      // The same gap on the next turn re-dispatches (by design — the turn-end
      // re-arm expires the SENT ledger so an ignored order is re-offered; the
      // order cadence is bounded by model turns). The re-dispatch carries the
      // IDENTICAL gap list — an accurate order, never a mutating one.
      const before = followups.length
      emit({ header: { id: 'sess-orch', cwd: root } }, turnEnd(2))
      await settle()
      await settle()
      expect(followups.length).toBe(before + 1)
      expect(followups.at(-1)).toContain('【BAF 工单 · /baf-go 派单】')
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('implement in progress stays silent — that is the model\'s domain', { timeout: 120_000 }, async () => {
    const root = await setup()
    try {
      const service = serviceWith([])
      const { emit } = install(service)
      // Seed an implement-stage change through the raw domain service (the
      // §22.19 single-mint entry refuses beside... nothing active here, but
      // the walk is shorter through the pipeline lanes.spec uses).
      const store = new ProjectionStore({ workspaceRoot: root })
      const { createWorkflowService, confirmIntake } = await import('../src/workflow-service.ts')
      const { loadBaselineFile } = await import('@deepseek-ai/dsh-baf-core')
      const { StagePipeline } = await import('../src/stages/pipeline.ts')
      const baseline = await loadBaselineFile(FIXTURE_BASELINE)
      const pipeline = new StagePipeline({ store, workspaceRoot: root, gitRevision: 'rev-o1', baseline })
      const { intake } = await createWorkflowService({ store }).intake({
        description: 'fix: parser crash when input file is empty (bug fix)',
        workspace: { root },
        affectedScopeHint: 'single-file',
        baseline,
      })
      await confirmIntake(store, intake.changeId, 'user')
      await pipeline.driveBugFixPathOpenStage({
        changeId: intake.changeId,
        title: 'Fix parser crash on empty input',
        problem: 'Parser dereferences a null token when the input file is empty.',
        rootCause: 'Missing length guard before the token loop in parse().',
        affectedFiles: ['src/parser.c'],
        regressionTest: { file: 'tests/test_parser_empty.c', command: 'ctest -R parser_empty' },
      }, 'slash')
      await pipeline.enterImplementStage(intake.changeId, 'slash')

      emit({ header: { id: 'sess-orch', cwd: root } }, turnEnd(1))
      await settle()
      expect(service.calls).toHaveLength(0)
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('aborted / max-tokens turns never pop', { timeout: 120_000 }, async () => {
    const root = await setup()
    try {
      await reachGateA(root)
      const service = serviceWith([])
      const { emit } = install(service)
      emit({ header: { id: 'sess-orch', cwd: root } }, turnEnd(1, 'aborted'))
      emit({ header: { id: 'sess-orch', cwd: root } }, turnEnd(2, 'max-tokens'))
      await settle()
      expect(service.calls).toHaveLength(0)
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('a paused gate does not re-offer on the same projection; a new projection pops the new gate', { timeout: 120_000 }, async () => {
    const root = await setup()
    try {
      const changeId = await reachGateA(root)
      const service = serviceWith([skipped, selected('确认 · 完整流程')])
      const { emit, logs } = install(service)
      emit({ header: { id: 'sess-orch', cwd: root } }, turnEnd(1))
      await waitFor(async () => service.calls.length >= 1, logs, 'first design-confirm pop')
      // Same projection, next turn — the ledger suppresses the re-offer.
      emit({ header: { id: 'sess-orch', cwd: root } }, turnEnd(2))
      await waitFor(async () => service.calls.length >= 1, logs, 'no second pop')
      await settle()
      expect(service.calls).toHaveLength(1)

      // Projection moves (the customer unlocked gate A out-of-band): the new
      // resting point is the plan template — model domain again, no pop. The
      // NEW gate after the model finishes plan would pop on its own version.
      await driveGo({ cwd: root, focus: focusFor(root), confirm: true })
      emit({ header: { id: 'sess-orch', cwd: root } }, turnEnd(3))
      await settle()
      expect(service.calls).toHaveLength(1)
      expect((await new ProjectionStore({ workspaceRoot: root }).readStatus(changeId)).current).toBe('plan')
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('an in-flight same-key pop collapses the second entry to a silent duplicate', { timeout: 120_000 }, async () => {
    const root = await setup()
    try {
      await reachGateA(root)
      const service = hangingService()
      const { emit, logs } = install(service)
      emit({ header: { id: 'sess-orch', cwd: root } }, turnEnd(1))
      await waitFor(async () => service.calls.length >= 1, logs, 'first pop in flight')
      emit({ header: { id: 'sess-orch', cwd: root } }, turnEnd(2))
      await settle()
      // One ask reached the service; the second same-key entry dropped.
      expect(service.calls).toHaveLength(1)
      service.release('确认设计，进入计划')
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('an idle initialized workspace stays silent — that is auto-pop\'s domain', { timeout: 120_000 }, async () => {
    const root = await setup()
    try {
      const service = serviceWith([])
      const { emit } = install(service)
      emit({ header: { id: 'sess-orch', cwd: root } }, turnEnd(1))
      await settle()
      expect(service.calls).toHaveLength(0)
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('an uninitialized workspace pops scaffold once per session', { timeout: 120_000 }, async () => {
    const bare = await mkdtemp(join(tmpdir(), 'baf-orchestrator-bare-'))
    try {
      const service = serviceWith([skipped, skipped])
      const { emit, logs } = install(service)
      emit({ header: { id: 'sess-a', cwd: bare } }, turnEnd(1))
      await waitFor(async () => service.calls.length >= 1, logs, 'scaffold pop')
      expect(service.calls[0]?.questions[0]?.question).toBe('工作区需要初始化')
      // Same session, still uninitialized — the once-per-session memory holds.
      emit({ header: { id: 'sess-a', cwd: bare } }, turnEnd(2))
      await settle()
      expect(service.calls).toHaveLength(1)
      // A different session gets its own single offer.
      emit({ header: { id: 'sess-b', cwd: bare } }, turnEnd(1))
      await waitFor(async () => service.calls.length >= 2, logs, 'second session scaffold pop')
    } finally {
      await rm(bare, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  // 【变更】2026-09-23 (demo2 re-test): the mid-turn `baf_gate_ask` bootstrap
  // offered the scaffold dialog, the customer answered 暂不初始化, and the
  // turn-end evaluation immediately offered the SAME dialog again — the old
  // per-row SCAFFOLD_SEEN only counted its own pops. The shared marker
  // (recorded at the askGateDialogQueued choke point) must suppress the
  // turn-end re-offer.
  it('a scaffold dialog offered by another channel suppresses the turn-end re-pop', { timeout: 120_000 }, async () => {
    const bare = await mkdtemp(join(tmpdir(), 'baf-orchestrator-bare-'))
    try {
      const service = serviceWith([])
      const { emit } = install(service)
      noteScaffoldDialogOffered('sess-midturn')
      emit({ header: { id: 'sess-midturn', cwd: bare } }, turnEnd(1))
      await settle()
      expect(service.calls).toHaveLength(0)
    } finally {
      await rm(bare, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('a multi-active workspace pops bind-workflow; the click binds and drives the picked change', { timeout: 120_000 }, async () => {
    const root = await setup()
    try {
      const first = await reachGateA(root)
      // Seed the twin the only way left: the raw domain service.
      const store = new ProjectionStore({ workspaceRoot: root })
      const { createWorkflowService } = await import('../src/workflow-service.ts')
      const { intake } = await createWorkflowService({ store }).intake({
        description: `${DESCRIPTION} (second, seeded directly)`,
        workspace: { root },
      })
      const second = intake.changeId
      resetFocusCache() // unbind: the orchestrator must rank, then offer the choice

      const service = serviceWith([selected(`接手 ${first}`)])
      const { emit, logs } = install(service)
      emit({ header: { id: 'sess-orch', cwd: root } }, turnEnd(1))
      await waitFor(async () => service.calls.length >= 1, logs, 'bind-workflow pop')
      expect(service.calls[0]?.questions[0]?.question).toBe('多条未完成的变更，请选择接手对象')
      const offered = service.calls[0]?.questions[0]?.options?.map(o => o.label) ?? []
      expect(offered).toEqual([`接手 ${first}`, `接手 ${second}`])
      // The click bound the session focus to the picked change.
      await waitFor(async () => focusFor(root).get() === first, logs, 'focus set to the picked change')
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })
})
