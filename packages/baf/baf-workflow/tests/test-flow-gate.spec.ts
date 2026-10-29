/**
 * 【变更】2026-10-28 (批次三十五 · 用户问题 8): the implement→verify test-flow
 * precondition — the shared verdict (one source for /baf-go's verify entry,
 * the turn-end advance pop, and the Tab 推进 readiness), the 补单 lines, and
 * the projection's downstream reset on re-entry (a T11 bounce back to
 * implement must not leave the previous verify pass reading 「已完成」).
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ProjectionEvent } from '@deepseek-ai/dsh-baf-core'
import { loadBaselineFile } from '@deepseek-ai/dsh-baf-core'
import { testFlowEntryVerdict, testFlowWorkOrderLines } from '../src/test-flow-gate.ts'
import { replay } from '../src/projection.ts'
import { ProjectionStore } from '../src/projection.ts'
import { buildWorkflowTabView } from '../src/tab-view.ts'
import { confirmIntake, createWorkflowService } from '../src/workflow-service.ts'
import { StagePipeline } from '../src/stages/pipeline.ts'
import { completeTask, recordTouched } from '../src/stages/implement.ts'
import { apply, resetOrchestrator } from '../src/orchestrator.ts'
import { resetFocusCache } from '../src/session-focus.ts'

const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

/** A temp workspace with `.baf/baseline.yml` (a real test command optional). */
async function workspace(options: { readonly realTest?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'baf-testflow-'))
  await mkdir(join(root, '.baf'), { recursive: true })
  const body = await readFile(FIXTURE_BASELINE, 'utf8')
  await writeFile(
    join(root, '.baf', 'baseline.yml'),
    options.realTest === true ? body.replace('test: <enterprise-tbd>', 'test: ceedling test') : body,
    'utf8',
  )
  return root
}

/** The 测试流's two durable reports, green. */
async function writeGreenReports(root: string): Promise<void> {
  await mkdir(join(root, '.baf', 'reports'), { recursive: true })
  await writeFile(
    join(root, '.baf', 'reports', 'ut-coverage.json'),
    JSON.stringify({ passed: true, line: 92, minimum: 80 }),
    'utf8',
  )
  await writeFile(
    join(root, '.baf', 'reports', 'static-analysis.json'),
    JSON.stringify({ passed: true, errors: 0 }),
    'utf8',
  )
}

/**
 * 【变更】2026-10-29 (批次三十六 · 用户问题 9): the 检查单 the verify stage
 * ticks item by item — the verify entry's real precondition.
 */
async function writeChecklist(root: string, changeId: string): Promise<void> {
  await writeFile(
    join(root, 'openspec', 'changes', changeId, 'checklist.md'),
    [
      '# Checklist',
      '',
      '- [x] npm test exports CSV with a header row',
      '- [x] no console.error during the export run',
      '',
    ].join('\n'),
    'utf8',
  )
}

/** One envelope-carrying projection event at `seq`. */
function ev(seq: number, body: Record<string, unknown>): ProjectionEvent {
  return { eventId: `evt-${seq}`, seq, at: '2026-10-28T00:00:00.000Z', ...body } as unknown as ProjectionEvent
}

describe('testFlowEntryVerdict — one verdict, three surfaces', () => {
  it('a workspace without a baseline is ungated (never gate-dead)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-testflow-bare-'))
    try {
      await expect(testFlowEntryVerdict(root)).resolves.toEqual({ gated: false, ok: true, problems: [] })
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('the scaffold placeholder stack.test never gates', async () => {
    const root = await workspace()
    try {
      // The fixture baseline ships `test: <enterprise-tbd>` — a fresh
      // scaffold configured no unit-test flow, so no evidence is owed.
      await expect(testFlowEntryVerdict(root)).resolves.toEqual({ gated: false, ok: true, problems: [] })
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('a real test command gates: missing durable reports read red with named problems', async () => {
    const root = await workspace({ realTest: true })
    try {
      const verdict = await testFlowEntryVerdict(root)
      expect(verdict.gated).toBe(true)
      expect(verdict.ok).toBe(false)
      expect(verdict.problems.join('\n')).toContain('ut_coverage.missing')
      expect(verdict.problems.join('\n')).toContain('static_analysis.missing')
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('green durable reports read green', async () => {
    const root = await workspace({ realTest: true })
    try {
      await writeGreenReports(root)
      await expect(testFlowEntryVerdict(root)).resolves.toEqual({ gated: true, ok: true, problems: [] })
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })
})

describe('testFlowWorkOrderLines — the 补单 names the 测试流图 chain', () => {
  it('orders the same baf-quality test/check/lint chain, quoting the problems', () => {
    const lines = testFlowWorkOrderLines(['ut_coverage.missing: 覆盖率报告未生成'])
    const joined = lines.join('\n')
    expect(joined).toContain('测试流未跑通——实现必须先通过测试流才能进入验证')
    expect(joined).toContain('ut_coverage.missing: 覆盖率报告未生成')
    expect(joined).toContain('baf-quality test')
    expect(joined).toContain('baf-quality check')
    expect(joined).toContain('baf-quality lint')
    expect(joined).toContain('与测试流图按钮是同一组命令')
  })
})

describe('projection stage-entered downstream reset (T11 re-entry)', () => {
  /** A full-go-path walk up to a completed verify (the pre-bounce state). */
  function walkedToVerify(): ProjectionEvent[] {
    return [
      ev(1, { type: 'intake-confirmed', by: 'user' }),
      ev(2, { type: 'stage-entered', node: 'open' }),
      ev(3, { type: 'stage-completed', node: 'open', artifacts: ['openspec/changes/CHG-1/proposal.md'] }),
      ev(4, { type: 'stage-entered', node: 'implement' }),
      ev(5, { type: 'stage-completed', node: 'implement', artifacts: [] }),
      ev(6, { type: 'stage-entered', node: 'verify' }),
      ev(7, { type: 'stage-completed', node: 'verify', artifacts: ['.baf/reports/ut-coverage.json'] }),
    ]
  }

  it('a first pass is untouched — upstream stages stay completed with their notes', () => {
    const status = replay('CHG-1', walkedToVerify())
    expect(status.current).toBe('verify')
    expect(status.nodes.implement).toBe('completed')
    expect(status.nodes.verify).toBe('completed')
    expect(status.annotations?.verify?.artifacts).toContain('.baf/reports/ut-coverage.json')
  })

  it('re-entering implement resets the previous verify pass and drops its artifacts note', () => {
    const status = replay('CHG-1', [
      ...walkedToVerify(),
      // The T11 fix loop: the verify checks failed, the change bounced back.
      ev(8, { type: 'stage-entered', node: 'implement' }),
    ])
    expect(status.current).toBe('implement')
    expect(status.nodes.implement).toBe('in-progress')
    // The rail may not read 验证已完成 while the change is back in
    // implementation — the rerun has not even started.
    expect(status.nodes.verify).toBe('available')
    expect(status.annotations?.verify).toBeUndefined()
  })

  it('a failed downstream stage keeps its audit record through the bounce', () => {
    // The real T11 sequence: verify FAILED (the audit record), then the
    // bounce. `failed` is the last pass's evidence, not a stale success —
    // stages.spec and bug-fix-path.spec assert it stays visible.
    const status = replay('CHG-1', [
      ev(1, { type: 'intake-confirmed', by: 'user' }),
      ev(2, { type: 'stage-entered', node: 'implement' }),
      ev(3, { type: 'stage-completed', node: 'implement', artifacts: [] }),
      ev(4, { type: 'stage-entered', node: 'verify' }),
      ev(5, { type: 'stage-failed', node: 'verify', reason: 'openspec-validate failed' }),
      ev(6, { type: 'stage-entered', node: 'implement' }),
    ])
    expect(status.current).toBe('implement')
    expect(status.nodes.verify).toBe('failed')
    expect(status.annotations?.verify?.detail).toBe('openspec-validate failed')
  })

  it('a fast-path cut stage stays skipped when an earlier node re-enters', () => {
    // bug-fix-path classification cuts clarify/design/plan to `skipped`; a
    // re-entry at `open` (its downstream includes those three) must keep the
    // cut — the skip is a mode decision, not a pass result to erase.
    const status = replay('CHG-1', [
      ev(1, {
        type: 'intake-classified',
        intake: {
          changeId: 'CHG-1',
          kind: 'bug',
          mode: 'bug-fix-path',
          affectedScope: 'single-file',
          confidence: 0.9,
          reasonCodes: ['crash-repro'],
          openspecRequired: false,
          requiresUserConfirmation: true,
          confirmation: 'pending',
          summary: 'fix parser crash on empty input',
        },
      }),
      ev(2, { type: 'stage-entered', node: 'open' }),
    ])
    expect(status.nodes.clarify).toBe('skipped')
    expect(status.nodes.design).toBe('skipped')
    expect(status.nodes.plan).toBe('skipped')
    expect(status.annotations?.clarify?.reasonCodes).toContain('fast-path-cut')
  })
})

/**
 * A full-go-path workspace walked to implement with every task done and the
 * touched file recorded — the resting point whose ONLY remaining gap is the
 * test-flow evidence (the exact state the three surfaces must agree on).
 */
async function walkedImplementWorkspace(options: { readonly realTest?: boolean } = {}): Promise<{
  readonly root: string
  readonly store: ProjectionStore
  readonly changeId: string
}> {
  const root = await workspace(options)
  const store = new ProjectionStore({ workspaceRoot: root })
  const baseline = await loadBaselineFile(join(root, '.baf', 'baseline.yml'))
  const pipeline = new StagePipeline({ store, workspaceRoot: root, gitRevision: 'rev-1', baseline })
  const { intake } = await createWorkflowService({ store }).intake({
    description: 'feat: add export public API for reports',
    workspace: { root },
    affectedScopeHint: 'public-api',
  })
  const changeId = intake.changeId
  await confirmIntake(store, changeId, 'user')
  await pipeline.driveOpenStage(changeId, 'Add report export API', 'slash')
  await pipeline.driveClarifyStage({
    changeId,
    questions: [],
    acceptanceCriteria: ['npm test exports CSV with a header row'],
  })
  const reference = join(root, 'src', 'export.ts')
  await mkdir(dirname(reference), { recursive: true })
  await writeFile(reference, 'export {}\n', 'utf8')
  await pipeline.driveDesignStage({
    changeId,
    approach: 'Add src/export.ts exposing exportReportsCsv(rows): string.',
    references: ['src/export.ts'],
  })
  await pipeline.drivePlanStage({
    changeId,
    tasks: [{
      id: 't1',
      title: 'Implement serializer',
      files: ['src/export.ts'],
      verify: ['npm test'],
      rollback: 'git revert HEAD',
    }],
    allowlist: ['src/export.ts'],
  }, 'slash')
  await pipeline.enterImplementStage(changeId, 'slash')
  await recordTouched(root, { changeId, file: 'src/export.ts' })
  await completeTask(root, changeId, 't1')
  return { root, store, changeId }
}

describe('Tab 推进 readiness mirror — the third surface', () => {
  it('the entry blocker is the checklist — the button names the real condition', async () => {
    const { root, store, changeId } = await walkedImplementWorkspace({ realTest: true })
    try {
      const view = await buildWorkflowTabView(store, changeId)
      // The 推进 button may not promise a verify entry the /baf-go path would
      // refuse one click later — and the refusal must name the REAL blocker.
      expect(view.advance?.ready).toBe(false)
      expect(view.advance?.missing.join('\n')).toContain('验证检查单未就绪：checklist.md 不存在')
      // The checklist is authored → the button is offered.
      await writeChecklist(root, changeId)
      const ready = await buildWorkflowTabView(store, changeId)
      expect(ready.advance?.ready).toBe(true)
      expect(ready.advance?.missing).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('a ready checklist is offered even when the evidence is red (the transition runs the chain)', async () => {
    const { root, store, changeId } = await walkedImplementWorkspace({ realTest: true })
    try {
      await writeChecklist(root, changeId)
      const view = await buildWorkflowTabView(store, changeId)
      // 【变更】2026-10-29 (批次三十六 · 用户问题 9): the missing evidence is
      // resolved BY the transition (the coordinator runs the chain itself), so
      // it is not a reason to hide the button — the run's own failure is then
      // reported as a real failure, not as a silent pass.
      expect(view.advance?.ready).toBe(true)
      // The durable evidence is green either way.
      await writeGreenReports(root)
      const green = await buildWorkflowTabView(store, changeId)
      expect(green.advance?.ready).toBe(true)
      expect(green.advance?.missing).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('an ungated baseline stays ready without any evidence (never gate-dead)', async () => {
    const { store, changeId, root } = await walkedImplementWorkspace()
    try {
      await writeChecklist(root, changeId)
      const view = await buildWorkflowTabView(store, changeId)
      expect(view.advance?.ready).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })
})

describe('turn-end pop + gap order (orchestrator mirror)', () => {
  /** Install the orchestrator row against a fake host ctx (orchestrator.spec recipe). */
  function install(): {
    readonly emit: (session: unknown, event: unknown) => void
    readonly asks: { readonly questions: { readonly question: string }[] }[]
    readonly followups: string[]
  } {
    const listeners = new Map<string, (session: unknown, event: unknown) => void>()
    const asks: { readonly questions: { readonly question: string }[] }[] = []
    const followups: string[] = []
    const service = {
      ask: async (request: { questions: { readonly question: string }[] }) => {
        asks.push(request)
        throw Object.assign(new Error('no reply'), { code: 'NO_PROVIDER' })
      },
    }
    const agent = {
      session: { header: { id: 'sess-testflow', cwd: 'replaced-per-test' } },
      ctx: { get: (name: string) => (name === 'userQuestions' ? service : undefined) },
      followup: (message: { content?: { text?: string }[] }) => {
        followups.push(message.content?.map(b => b.text ?? '').join('\n') ?? '')
      },
    }
    const ctx = {
      on: (name: string, fn: (session: unknown, event: unknown) => void) => { listeners.set(name, fn) },
      agents: { get: () => agent },
      logger: { info: () => undefined, warn: () => undefined },
      get: () => undefined,
    } as unknown as Parameters<typeof apply>[0]
    apply(ctx)
    return {
      emit: (session: unknown, event: unknown) => { listeners.get('session/event')?.(session, event) },
      asks,
      followups,
    }
  }

  /** Poll until fn() returns true (the dispatch chains are fire-and-forget). */
  async function waitFor(fn: () => boolean, what: string, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      if (fn()) return
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
      await new Promise(resolve => setTimeout(resolve, 150))
    }
  }

  beforeEach(() => {
    resetOrchestrator()
    resetFocusCache()
  })

  it('red evidence pops no verify-advance card and orders the flow at turn end', { timeout: 120_000 }, async () => {
    const { root, changeId } = await walkedImplementWorkspace({ realTest: true })
    try {
      const { emit, asks, followups } = install()
      emit({ header: { id: 'sess-testflow', cwd: root } }, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
      await waitFor(() => followups.length >= 1, 'test-flow gap order')
      // No gate popped: the card may not offer a verify entry the /baf-go
      // path would refuse one click later.
      expect(asks).toHaveLength(0)
      // The turn-end gap dispatch IS the flow order — the same baf-quality
      // chain the 测试流图 buttons run.
      expect(followups[0]).toContain('阶段：implement')
      expect(followups[0]).toContain('baf-quality test')
      expect(followups[0]).toContain('测试流未跑通——实现必须先通过测试流才能进入验证')
      // The change never left implement.
      expect((await new ProjectionStore({ workspaceRoot: root }).readStatus(changeId)).current).toBe('implement')
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })
})
