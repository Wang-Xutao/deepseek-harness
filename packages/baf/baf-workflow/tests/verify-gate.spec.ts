/**
 * 【变更】2026-10-24 (批次十九 2.4, 客户决策「规定要跑过的测试必须通过才能通过
 * 确认门」+「工作流触发的测试流会生成报告，该报告也是验证阶段的必须产物」):
 * the verify gate's shared rule — a check that RAN and failed blocks the
 * confirm gate even when it is not `required`, while a check that never ran
 * (skipped / tool_unavailable / cancelled) only annotates — plus the 测试流
 * report as a verify-stage artifact.
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadBaselineFile } from '@deepseek-ai/dsh-baf-core'
import { ARTIFACT_FILES } from '@deepseek-ai/dsh-baf-openspec'
import { confirmIntake, createWorkflowService } from '../src/workflow-service.ts'
import { ProjectionStore } from '../src/projection.ts'
import { StagePipeline } from '../src/stages/pipeline.ts'
import { completeTask, recordTouched } from '../src/stages/implement.ts'
import { CheckRunner, checkActuallyRanAndFailed, checkBlocksVerify } from '../src/stages/check-runner.ts'
import { changeArtifactStatus, verifyGate } from '../src/stages/gates.ts'
import { buildWorkflowTabView } from '../src/tab-view.ts'

const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

/** One check row as the gate rule reads it. */
function row(over: Partial<import('../src/stages/check-runner.ts').CheckReportRow> = {}) {
  return {
    name: 'quality',
    required: false,
    ok: false,
    durationMs: 1,
    diagnostics: ['build:nonzero_exit'],
    ...over,
  }
}

describe('the shared verify rule (批次十九 2.4)', () => {
  it('treats a failed row with a real reason code as a check that RAN and failed', () => {
    expect(checkActuallyRanAndFailed(row())).toBe(true)
    expect(checkBlocksVerify(row())).toBe(true)
  })

  it('treats every not-run marker as a check that never ran', () => {
    for (const diagnostic of [
      'skipped: test flow not configured (baseline stack.test is a placeholder)',
      'tool_unavailable: guard policy not wired',
      'cancelled',
      'cancelled before start',
    ]) {
      const check = row({ diagnostics: [diagnostic] })
      expect(checkActuallyRanAndFailed(check)).toBe(false)
      expect(checkBlocksVerify(check)).toBe(false)
    }
  })

  it('still blocks on a required row that never ran (the pre-existing rule)', () => {
    const check = row({ required: true, diagnostics: ['tool_unavailable: guard policy not wired'] })
    expect(checkActuallyRanAndFailed(check)).toBe(false)
    expect(checkBlocksVerify(check)).toBe(true)
  })
})

describe('verifyGate (批次十九 2.4)', () => {
  it('blocks on a non-required check that ran and failed, and names it', () => {
    const gate = verifyGate([row()])
    expect(gate.ok).toBe(false)
    // The reason code stays the frozen enterprise one.
    expect(gate.reasonCodes).toContain('verify_required')
    expect(gate.detail).toContain('quality')
    // The refusal says the non-required check still blocks — no more 「不阻断」.
    expect(gate.missing?.join('\n')).toContain('非必需，但检查已执行')
    expect(gate.missing?.join('\n')).toContain('build:nonzero_exit')
  })

  it('does NOT block on a non-required check that never ran', () => {
    for (const diagnostic of [
      'skipped: test flow not configured (baseline stack.test is a placeholder)',
      'tool_unavailable: guard policy not wired',
      'cancelled',
    ]) {
      const gate = verifyGate([row({ diagnostics: [diagnostic] })])
      expect(gate.ok).toBe(true)
      expect(gate.reasonCodes).toEqual([])
    }
  })

  it('does NOT block on a row that carries a real reason code beside a not-run marker', () => {
    // A real reason code means the check ran — the not-run marker does not
    // excuse it.
    const gate = verifyGate([row({ diagnostics: ['skipped: partly configured', 'build:nonzero_exit'] })])
    expect(gate.ok).toBe(false)
  })
})

describe('CheckRunner.aggregate (批次十九 2.4)', () => {
  it('marks the report not passed when a non-required check ran and failed', () => {
    const runner = new CheckRunner()
    const report = runner.aggregate('CHG-1', [row()])
    expect(report.passed).toBe(false)
  })

  it('keeps the report passed when the only failure never ran', () => {
    const runner = new CheckRunner()
    const report = runner.aggregate('CHG-1', [row({ diagnostics: ['tool_unavailable: guard policy not wired'] })])
    expect(report.passed).toBe(true)
  })

  it('agrees with the gate on a real failing run', async () => {
    const runner = new CheckRunner()
    runner.register({
      name: 'optional-check',
      required: false,
      run: async () => ({ ok: false, diagnostics: ['build:nonzero_exit'] }),
    })
    const rows = await runner.runAll(new AbortController().signal)
    expect(runner.aggregate('CHG-1', rows).passed).toBe(false)
    expect(verifyGate(rows).ok).toBe(false)
  })
})

/**
 * A workspace driven to the verify stage: open → clarify → design → plan →
 * implement, with a real baseline on disk (the verify stage re-reads it).
 */
async function setupAtVerify(options: {
  readonly realTest?: boolean
  readonly stagesEnabled?: boolean
  readonly stack?: import('@deepseek-ai/dsh-baf-core').StackAdapter
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'baf-verify-gate-'))
  const store = new ProjectionStore({ workspaceRoot: root })
  await mkdir(join(root, '.baf'), { recursive: true })
  const baselinePath = join(root, '.baf', 'baseline.yml')
  const baselineBody = await readFile(FIXTURE_BASELINE, 'utf8')
  await writeFile(
    baselinePath,
    options.realTest === true ? baselineBody.replace('test: <enterprise-tbd>', 'test: ceedling test') : baselineBody,
    'utf8',
  )
  // 【变更】2026-10-29 (批次三十六 · 用户问题 9): the 测试流's per-stage
  // switches — the file the settings canvas writes.
  if (options.stagesEnabled === true) {
    await mkdir(join(root, '.baf', 'quality'), { recursive: true })
    await writeFile(
      join(root, '.baf', 'quality', 'test-flow.json'),
      JSON.stringify({
        stages: {
          build: { enabled: true, haltOnError: true },
          test: { enabled: true, haltOnError: true },
          instrument: { enabled: true, haltOnError: true },
          report: { enabled: true, haltOnError: true },
          gate: { enabled: true, haltOnError: true },
          lint: { enabled: true, haltOnError: true },
          analyze: { enabled: true, haltOnError: true },
        },
      }, null, 2),
      'utf8',
    )
  }
  const baseline = await loadBaselineFile(baselinePath)
  const pipeline = new StagePipeline({
    store,
    workspaceRoot: root,
    gitRevision: 'rev-1',
    baseline,
    ...(options.stack === undefined ? {} : { stack: options.stack }),
  })
  const service = createWorkflowService({ store })
  const { intake } = await service.intake({
    description: 'feat: add export public API for reports',
    workspace: { root },
    affectedScopeHint: 'public-api',
  })
  const changeId = intake.changeId
  await confirmIntake(store, changeId, 'user')
  await pipeline.driveOpenStage(changeId, 'Add report export API', 'slash')
  await pipeline.driveClarifyStage({
    changeId,
    questions: [{ question: 'Format?', answer: 'CSV (user call 2026-10-24)', status: 'decided' }],
    acceptanceCriteria: ['npm test exports CSV'],
  })
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src', 'w.ts'), 'export {}\n', 'utf8')
  await pipeline.driveDesignStage({ changeId, approach: 'Approach', references: ['src/w.ts'] })
  await pipeline.drivePlanStage({
    changeId,
    tasks: [{
      id: 't1',
      title: 'Task',
      files: ['src/w.ts'],
      verify: ['npm test'],
      rollback: 'git revert HEAD',
    }],
    allowlist: ['src/w.ts'],
  }, 'slash')
  const changeDirAbs = join(root, 'openspec', 'changes', changeId)
  await writeFile(
    join(changeDirAbs, ARTIFACT_FILES.proposal),
    '# Add report export API\n\n## Why\n\nUsers need CSV export.\n',
    'utf8',
  )
  await writeFile(join(changeDirAbs, ARTIFACT_FILES.tasks), '# Tasks\n\n- [x] t1 Task\n', 'utf8')
  await pipeline.enterImplementStage(changeId)
  await recordTouched(root, { changeId, file: 'src/w.ts' })
  await completeTask(root, changeId, 't1')
  await pipeline.driveImplementStage(changeId)
  return { root, store, pipeline, changeId }
}

/** The 测试流's two durable reports, green. */
async function writeGreenTestFlowReports(root: string): Promise<void> {
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

describe('the 测试流 report as a verify-stage artifact (批次十九 2.4)', () => {
  it('carries the report in the stage-completed artifacts and on the rail when it exists', async () => {
    const stack: import('@deepseek-ai/dsh-baf-core').StackAdapter = {
      detect: async () => ({ available: true, compiler: 'gcc' }),
      runQuality: async input => ({
        schema: 1,
        baselineId: input.baseline.baselineId,
        workspace: input.workspace.root,
        toolVersions: { gcc: 'gcc 13' },
        checks: [{ id: 'build', passed: true }],
        artifacts: [],
        passed: true,
        diagnostics: [],
      }),
    }
    const harness = await setupAtVerify({ realTest: true, stack })
    try {
      await writeGreenTestFlowReports(harness.root)
      const driven = await harness.pipeline.driveVerifyStage(harness.changeId)
      if (driven.node !== 'verify') throw new Error('expected a verify drive')
      expect(driven.result.backToImplement).toBe(false)

      // The stage-completed event carries the 测试流 report next to the
      // change-level verify report.
      const { events } = await harness.store.readEvents(harness.changeId)
      const completed = events.find(event => event.type === 'stage-completed' && event.node === 'verify')
      expect(completed?.artifacts).toContain(join(harness.root, '.baf', 'reports', 'ut-coverage.json'))
      expect(completed?.artifacts).toContain(join(harness.root, '.baf', 'reports', 'static-analysis.json'))

      // The customer artifact track shows it as a verify-stage row.
      const rows = await changeArtifactStatus({
        workspaceRoot: harness.root,
        changeId: harness.changeId,
        mode: 'full-go-path',
      })
      const coverage = rows.find(r => r.file === 'ut-coverage.json')
      expect(coverage?.path).toBe('.baf/reports/ut-coverage.json')
      expect(coverage?.state).toBe('filled')
      expect(rows.find(r => r.file === 'static-analysis.json')?.path).toBe('.baf/reports/static-analysis.json')
    } finally {
      await rm(harness.root, { recursive: true, force: true })
    }
  })

  it('invents NO rail row when the 测试流 never ran', async () => {
    const harness = await setupAtVerify()
    try {
      const rows = await changeArtifactStatus({
        workspaceRoot: harness.root,
        changeId: harness.changeId,
        mode: 'full-go-path',
      })
      expect(rows.find(r => r.file === 'ut-coverage.json')).toBeUndefined()
      expect(rows.find(r => r.file === 'static-analysis.json')).toBeUndefined()
    } finally {
      await rm(harness.root, { recursive: true, force: true })
    }
  })
})

describe('the Tab advance readiness names the blocking checks (批次十九 2.4)', () => {
  it('reports the failed check instead of a generic "verify not done" line', async () => {
    const stack: import('@deepseek-ai/dsh-baf-core').StackAdapter = {
      detect: async () => ({ available: true, compiler: 'gcc' }),
      runQuality: async input => ({
        schema: 1,
        baselineId: input.baseline.baselineId,
        workspace: input.workspace.root,
        toolVersions: { gcc: 'gcc 13' },
        checks: [{ id: 'build', passed: true }],
        artifacts: [],
        passed: true,
        diagnostics: [],
      }),
    }
    const harness = await setupAtVerify({ realTest: true, stack })
    try {
      // No 测试流 reports → the test-flow check ran and failed → verify blocks.
      const driven = await harness.pipeline.driveVerifyStage(harness.changeId)
      if (driven.node !== 'verify') throw new Error('expected a verify drive')
      expect(driven.result.backToImplement).toBe(true)

      // The change rests at verify with the stage unfinished (the verify run is
      // in flight) — the Tab's readiness must name the blocking check.
      const status = await harness.store.readStatus(harness.changeId)
      await harness.store.append(harness.changeId, status.projectionVersion, meta => ({
        type: 'stage-entered',
        node: 'verify',
        ...meta,
      }))
      const view = await buildWorkflowTabView(harness.store, harness.changeId)
      expect(view.advance?.ready).toBe(false)
      expect(view.advance?.missing.join('\n')).toContain('test-flow')
      expect(view.advance?.missing.join('\n')).toContain('ut_coverage.missing')
    } finally {
      await rm(harness.root, { recursive: true, force: true })
    }
  })
})

describe('the 测试流 gate (批次三十六 · 用户问题 9)', () => {
  it('the explicitly enabled stages gate the verify even with the placeholder baseline', async () => {
    const stack: import('@deepseek-ai/dsh-baf-core').StackAdapter = {
      detect: async () => ({ available: true, compiler: 'gcc' }),
      runQuality: async input => ({
        schema: 1,
        baselineId: input.baseline.baselineId,
        workspace: input.workspace.root,
        toolVersions: { gcc: 'gcc 13' },
        checks: [{ id: 'build', passed: true }],
        artifacts: [],
        passed: true,
        diagnostics: [],
      }),
    }
    const harness = await setupAtVerify({ stagesEnabled: true, stack })
    try {
      const driven = await harness.pipeline.driveVerifyStage(harness.changeId)
      if (driven.node !== 'verify') throw new Error('expected a verify drive')
      const flowRow = driven.result.report.checks.find(row => row.name === 'test-flow')
      // The customer switched the stages on — the flow is no longer "not configured".
      expect(flowRow?.required).toBe(true)
    } finally {
      await rm(harness.root, { recursive: true, force: true })
    }
  })

  it('a workspace with no test flow configured says so — it never reads as 全部通过', async () => {
    const stack: import('@deepseek-ai/dsh-baf-core').StackAdapter = {
      detect: async () => ({ available: true, compiler: 'gcc' }),
      runQuality: async input => ({
        schema: 1,
        baselineId: input.baseline.baselineId,
        workspace: input.workspace.root,
        toolVersions: { gcc: 'gcc 13' },
        checks: [{ id: 'build', passed: true }],
        artifacts: [],
        passed: true,
        diagnostics: [],
      }),
    }
    const harness = await setupAtVerify({ stack })
    try {
      const driven = await harness.pipeline.driveVerifyStage(harness.changeId)
      if (driven.node !== 'verify') throw new Error('expected a verify drive')
      const flowRow = driven.result.report.checks.find(row => row.name === 'test-flow')
      expect(flowRow?.required).toBe(false)
      // The row says the flow never ran — it never reads as a green test.
      expect(flowRow?.diagnostics.join('\n')).toContain('未执行真实测试')
      const md = await readFile(join(harness.root, 'openspec', 'changes', harness.changeId, 'verify.md'), 'utf8')
      expect(md).toContain('未执行真实测试')
    } finally {
      await rm(harness.root, { recursive: true, force: true })
    }
  })
})
