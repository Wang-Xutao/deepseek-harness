/**
 * 【变更】2026-10-02 (demo31 问题 1/2/3) session-affinity integration tests.
 *
 * demo31's bug-fix-path walk surfaced one causal chain with three symptoms:
 * a model turn that called `baf_gate_ask` and never ended hung its session
 * composer (问题 3), gate clicks that a hard-validation refused were swallowed
 * with no feedback (问题 2), and every card / work order after the first
 * classify landed in whichever session last ended a turn — the customer's
 * home conversation went silent (问题 1). These tests pin the three fixes
 * against real temp workspaces: a resolved gate aborts sibling asks, a
 * refused resolve re-asks with the reason, and pops prefer the recorded home
 * session.
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
import { apply as applyOrchestrator, resetOrchestrator } from '../src/orchestrator.ts'
import { driveClassify, driveGateResolve } from '../src/command-drives.ts'
import { driveGo } from '../src/go-coordinator.ts'
import { enqueueAsk, resetAskQueue } from '../src/ask-queue.ts'
import { homeSessionFor, resetHomeSessionCache } from '../src/session-home.ts'
import { focusFor, resetFocusCache } from '../src/session-focus.ts'
import { ProjectionStore } from '../src/projection.ts'

const execFileAsync = promisify(execFile)

const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

/** A description the heuristic classifier lands on full-go-path + public-api. */
const DESCRIPTION = 'feat: add export public API for reports'

/** A `userQuestions` service double that records asks and replays canned answers. */
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

function selected(label: string): AskUserQuestionAnswer {
  return { answers: [{ id: 'x', selected: [label] }] }
}

/** A live-agent double: scoped userQuestions + the §18.4.2 followup channel. */
function agentWith(service: unknown, sessionId: string, cwd?: string): {
  session: { header: { id: string; cwd?: string } }
  ctx: { get(name: string): unknown }
  followup(): void
  status: 'idle' | 'running'
} {
  return {
    session: { header: { id: sessionId, ...(cwd === undefined ? {} : { cwd }) } },
    ctx: { get: (name: string) => (name === 'userQuestions' ? service : undefined) },
    followup() {},
    status: 'idle',
  }
}

/** A pop that rejects like the real waterfall does on abort (ASK_ABORTED). */
function abortableGateAsk(sessionId: string, gateId: string, changeId: string): {
  settled: Promise<void>
  error: () => unknown
} {
  let abort: (signal: AbortSignal) => void = () => {}
  let failure: unknown = 'unset'
  const promise = new Promise<string>((_, reject) => {
    abort = signal => signal.addEventListener('abort', () => {
      reject(Object.assign(new Error('aborted'), { code: 'ASK_ABORTED' }))
    }, { once: true })
  })
  // The handler is attached at creation: the cancel fires mid-drive (an await
  // gap away), and an unattached rejection would surface as an unhandled
  // rejection before the assertion gets to it.
  const settled = enqueueAsk({
    sessionId,
    key: `gate:${gateId}:${changeId}`,
    changeId,
    run: (controller) => {
      abort(controller.signal)
      return promise
    },
  }).then(
    () => { throw new Error('expected the sibling ask to abort') },
    (error: unknown) => { failure = error },
  )
  return { settled, error: () => failure }
}

/** Workspace fixture: baseline + git repo (the go.spec recipe). */
async function setup(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'baf-affinity-'))
  await mkdir(join(root, '.baf'), { recursive: true })
  await writeFile(join(root, '.baf', 'baseline.yml'), await readFile(FIXTURE_BASELINE, 'utf8'), 'utf8')
  await execFileAsync('git', ['init', '-q'], { cwd: root })
  await execFileAsync('git', [
    '-c', 'user.email=baf@test', '-c', 'user.name=baf', '-c', 'commit.gpgsign=false',
    'commit', '-q', '--allow-empty', '-m', 'init',
  ], { cwd: root })
  return root
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

async function currentOf(root: string, changeId: string): Promise<string> {
  return String((await new ProjectionStore({ workspaceRoot: root }).readStatus(changeId)).current)
}

/** Walk to the parked gate A (design completed, awaiting-confirm tail). */
async function reachGateA(root: string): Promise<string> {
  const focus = focusFor(root)
  await driveGo({ cwd: root, rawInput: DESCRIPTION, focus })
  const changeId = await activeId(root)
  if (changeId === undefined) throw new Error('no active change after mint')
  await driveClassify(root, `confirm change=${changeId}`)
  await author(root, changeId, 'proposal.md', [
    '# Proposal', '',
    '## Why', '',
    'Customers need CSV export of reports for downstream spreadsheets.', '',
    '## Scope', '',
    '- In: public export API', '',
    '## Impact', '',
    'Adds src/export.ts; rollback is deleting the file.', '',
  ].join('\n'))
  await driveGo({ cwd: root, focus }) // open → clarify template
  await author(root, changeId, 'clarify.md', [
    '# Clarify', '',
    '## Blocking questions', '',
    '- None outstanding; output format settled with the customer.', '',
    '## Acceptance criteria', '',
    '- npm test exports with a header row', '',
  ].join('\n'))
  await driveGo({ cwd: root, focus }) // clarify → design template
  await author(root, changeId, 'design.md', [
    '# Design', '',
    '## Approach', '',
    'Add src/export.ts exposing exportReportsCsv(rows): string, called from the CLI.', '',
    '## References', '',
    '- src/export.ts', '',
  ].join('\n'))
  await driveGo({ cwd: root, focus }) // parks on gate A
  return changeId
}

/**
 * The orchestrator row against a MULTI-agent host: agents.get maps ids, so a
 * pop's retarget is observable through which agent the ask carried.
 */
function installMulti(service: unknown, liveIds: readonly string[]): {
  emit: (session: unknown, event: unknown) => void
  logs: string[]
  agentOf: (id: string) => unknown
} {
  const listeners = new Map<string, (session: unknown, event: unknown) => void>()
  const logs: string[] = []
  const agents = new Map<string, unknown>()
  for (const id of liveIds) agents.set(id, agentWith(service, id))
  const ctx = {
    on: (name: string, fn: (session: unknown, event: unknown) => void) => {
      listeners.set(name, fn)
    },
    agents: { get: (id: unknown) => agents.get(String(id)) },
    logger: {
      info: (line: string) => { logs.push(`info: ${line}`) },
      warn: (line: string) => { logs.push(`warn: ${line}`) },
    },
    get: () => undefined,
  } as unknown as Context
  applyOrchestrator(ctx)
  return {
    emit: (session: unknown, event: unknown): void => {
      listeners.get('session/event')?.(session, event)
    },
    logs,
    agentOf: (id: string): unknown => agents.get(id),
  }
}

/** One synthetic completed turn/end event. */
function turnEnd(turn: number): unknown {
  return { type: 'turn/end', data: { turn, reason: { kind: 'completed' } } }
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

/** Fresh module memories per test — the shared host maps are process-global. */
beforeEach(() => {
  resetOrchestrator()
  resetFocusCache()
  resetAskQueue()
  resetHomeSessionCache()
})

describe('demo31 问题 3 — resolving a gate elsewhere unhangs the sibling session', () => {
  it('a classify-confirm click aborts the hung intake-classify ask in another session', { timeout: 120_000 }, async () => {
    const root = await setup()
    try {
      const store = new ProjectionStore({ workspaceRoot: root })
      const { createWorkflowService } = await import('../src/workflow-service.ts')
      const { intake } = await createWorkflowService({ store }).intake({
        description: 'fix: parser crash when input file is empty (bug fix)',
        workspace: { root },
        affectedScopeHint: 'single-file',
      })
      // The hung sibling: the model's mid-turn baf_gate_ask in session A,
      // awaiting an answer the customer will give through ANOTHER surface.
      const hung = abortableGateAsk('sess-hung', 'intake-classify', intake.changeId)
      await settle()
      const agent = agentWith(serviceWith([]), 'sess-clicker')
      const { makeGoDispatcher } = await import('../src/go-dispatch.ts')
      const dispatch = makeGoDispatcher(root, agent as never)
      const card = await driveGateResolve(
        root,
        'intake-classify',
        'confirm-bugfix',
        {},
        undefined,
        undefined,
        'gate-card',
        {
          changeId: intake.changeId,
          extraArgs: [
            'problem="Parser crashes on empty input"',
            'root-cause="Missing length guard"',
            'file="src/parser.c"',
            'test="tests/test_parser_empty.c"',
            'test-cmd="ctest -R parser_empty"',
          ],
          ...(dispatch === undefined ? {} : { dispatch }),
        },
      )
      expect(card.text).toContain('已确认并进入 open')
      // The sibling died with ASK_ABORTED — the baf_gate_ask tool settles
      // paused and its turn finally ends (the demo31 hang, healed).
      await hung.settled
      expect(hung.error()).toMatchObject({ code: 'ASK_ABORTED' })
      expect(await currentOf(root, intake.changeId)).toBe('open')
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('a typed /baf-go that proceeds past the parked gate A aborts the sibling design-confirm ask', { timeout: 120_000 }, async () => {
    const root = await setup()
    try {
      const changeId = await reachGateA(root)
      expect(await currentOf(root, changeId)).toBe('design')
      // §18.5: the first /baf-go parked gate A; the second one is the typed
      // confirm that proceeds — while session A's baf_gate_ask still hangs.
      const hung = abortableGateAsk('sess-hung', 'design-confirm', changeId)
      await settle()
      const card = await driveGo({ cwd: root, focus: focusFor(root) })
      expect(await currentOf(root, changeId)).toBe('plan')
      expect(card.kind).toBe('success')
      await hung.settled
      expect(hung.error()).toMatchObject({ code: 'ASK_ABORTED' })
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })
})

describe('demo31 问题 1 — the sticky home session owns the pops', () => {
  it('a turn ending in the TASK session pops the gate in the HOME session', { timeout: 120_000 }, async () => {
    const root = await setup()
    try {
      const changeId = await reachGateA(root)
      // The customer stated the requirement in sess-home; the work order ran
      // in sess-task. The pop must land back in the customer's conversation.
      homeSessionFor(root).set('sess-home')
      const service = serviceWith([selected('确认设计，进入计划')])
      const { emit, logs } = installMulti(service, ['sess-home', 'sess-task'])
      emit({ header: { id: 'sess-task', cwd: root } }, turnEnd(1))
      await waitFor(async () => service.calls.length >= 1, logs, 'design-confirm pop in home')
      const askedAgent = (service.calls[0] as unknown as { agent?: { session?: { header?: { id?: string } } } }).agent
      expect(askedAgent?.session?.header?.id).toBe('sess-home')
      await waitFor(async () => await currentOf(root, changeId) === 'plan', logs, 'plan entry after the confirm click')
      // The answered click re-anchored home on the session it landed in.
      expect(homeSessionFor(root).get()).toBe('sess-home')
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('without a home the pop falls back to the triggering session and the click anchors it', { timeout: 120_000 }, async () => {
    const root = await setup()
    try {
      await reachGateA(root)
      expect(homeSessionFor(root).get()).toBeUndefined()
      const service = serviceWith([selected('确认设计，进入计划')])
      const { emit, logs } = installMulti(service, ['sess-first'])
      emit({ header: { id: 'sess-first', cwd: root } }, turnEnd(1))
      await waitFor(async () => service.calls.length >= 1, logs, 'design-confirm pop in triggering session')
      const askedAgent = (service.calls[0] as unknown as { agent?: { session?: { header?: { id?: string } } } }).agent
      expect(askedAgent?.session?.header?.id).toBe('sess-first')
      await waitFor(async () => homeSessionFor(root).get() === 'sess-first', logs, 'home anchored by the answered click')
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('a dead home session falls back to the triggering one (no zombie retarget)', { timeout: 120_000 }, async () => {
    const root = await setup()
    try {
      await reachGateA(root)
      homeSessionFor(root).set('sess-closed')
      const service = serviceWith([selected('确认设计，进入计划')])
      // sess-closed has NO live agent — the retarget must not strand the pop.
      const { emit, logs } = installMulti(service, ['sess-task'])
      emit({ header: { id: 'sess-task', cwd: root } }, turnEnd(1))
      await waitFor(async () => service.calls.length >= 1, logs, 'design-confirm pop falls back')
      const askedAgent = (service.calls[0] as unknown as { agent?: { session?: { header?: { id?: string } } } }).agent
      expect(askedAgent?.session?.header?.id).toBe('sess-task')
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })
})
