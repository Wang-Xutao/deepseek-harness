/**
 * Phase 5 full-go-path stage pipeline tests: happy path, gate failures, and
 * illegal entry (§12 Phase 5.8 acceptance).
 */

import { mkdtemp, mkdir, rm, writeFile, readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BafError, loadBaselineFile } from '@deepseek-ai/dsh-baf-core'
import { ARTIFACT_FILES } from '@deepseek-ai/dsh-baf-openspec'
import { confirmIntake, createWorkflowService } from '../src/workflow-service.ts'
import { ProjectionStore } from '../src/projection.ts'
import { StagePipeline } from '../src/stages/pipeline.ts'
import { recordTouched, completeTask } from '../src/stages/implement.ts'
import { detectAndRecord, type DriftObservation } from '../src/stages/drift.ts'
import { CHECKLIST_FILE, artifactLine, bugRecordGate, changeArtifactStatus, proposalGate } from '../src/stages/gates.ts'
import { BUG_FIX_PROPOSAL_FILE } from '../src/stages/bug-fix-path.ts'

const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

/** Create a temp workspace with a store, pipeline, and fresh change. */
async function setup(
  options: {
    readonly gitRevision?: string
    readonly withGit?: boolean
    readonly stack?: import('@deepseek-ai/dsh-baf-core').StackAdapter
    readonly guard?: import('@deepseek-ai/dsh-baf-core').GuardPolicy
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'baf-stage-'))
  const store = new ProjectionStore({ workspaceRoot: root })
  const baseline = await loadBaselineFile(FIXTURE_BASELINE)
  const gitRevision = options.withGit === false ? undefined : (options.gitRevision ?? 'rev-1')
  const pipeline = new StagePipeline({
    store,
    workspaceRoot: root,
    ...(gitRevision === undefined ? {} : { gitRevision }),
    baseline,
    ...(options.stack === undefined ? {} : { stack: options.stack }),
    ...(options.guard === undefined ? {} : { guard: options.guard }),
  })
  const service = createWorkflowService({ store })
  const { intake } = await service.intake({
    description: 'feat: add export public API for reports',
    workspace: { root },
    affectedScopeHint: 'public-api',
  })
  await confirmIntake(store, intake.changeId, 'user')
  return { root, store, pipeline, service, changeId: intake.changeId, baseline }
}

/** Reference an existing workspace-relative file for design citations. */
async function touchReference(root: string, rel: string): Promise<string> {
  const path = join(root, rel)
  const { dirname } = await import('node:path')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, 'export {}\n', 'utf8')
  return rel
}

/** Write (or replace) one artifact body inside the change directory. */
async function putFile(root: string, changeId: string, file: string, body: string): Promise<void> {
  const path = join(root, 'openspec', 'changes', changeId, file)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, body, 'utf8')
}

describe('stage pipeline happy path', () => {
  // Seven stages × git+fs work; under full-suite parallel load on Windows the
  // default 5s budget intermittently expires mid-pipeline (hunt run 2026-09-20:
  // timed out at 5055ms with the machine thrashing). Fast path is ~1s.
  it('runs open → clarify → design → plan → implement → verify → archive', { timeout: 60_000 }, async () => {
    const { root, pipeline, changeId } = await setup()
    try {
      await pipeline.driveOpenStage(changeId, 'Add report export API', 'slash')
      let status = await pipeline.context().store.readStatus(changeId)
      expect(status.current).toBe('open')
      expect(status.nodes.open).toBe('completed')

      await pipeline.driveClarifyStage({
        changeId,
        questions: [
          { question: 'Format?', answer: 'CSV (user call 2026-09-08)', status: 'decided' },
        ],
        acceptanceCriteria: ['npm test exports CSV'],
      })
      await pipeline.driveDesignStage({
        changeId,
        approach: 'Add export.ts with a CSV serializer.',
        references: [await touchReference(root, 'src/export.ts')],
        risks: ['Encoding edge cases'],
      })
      const allowlistFile = 'src/export.ts'
      await pipeline.drivePlanStage({
        changeId,
        tasks: [{
          id: 't1',
          title: 'Implement serializer',
          files: [allowlistFile],
          verify: ['npm test'],
          rollback: 'git revert HEAD',
        }],
        allowlist: [allowlistFile],
      }, 'slash')

      // Fill the proposal/tasks skeleton sections the openspec structural
      // gate requires (model-authored content in a real run).
      const changeDirAbs = join(root, 'openspec', 'changes', changeId)
      await writeFile(
        join(changeDirAbs, 'proposal.md'),
        '# Add report export API\n\n## Why\n\nUsers need CSV export for monthly reports.\n',
        'utf8',
      )
      await writeFile(
        join(changeDirAbs, 'tasks.md'),
        '# Tasks\n\n- [x] t1 Implement serializer\n',
        'utf8',
      )

      // implement: enter stage, record touched, finish tasks, gate T9.
      await pipeline.enterImplementStage(changeId, 'slash')
      await recordTouched(root, { changeId, file: allowlistFile })
      await completeTask(root, changeId, 't1')
      await pipeline.driveImplementStage(changeId)

      const verify = await pipeline.driveVerifyStage(changeId)
      expect(verify.node).toBe('verify')

      const archive = await pipeline.driveArchiveStage(changeId, true, 'slash')
      expect(archive.node).toBe('archive')
      status = await pipeline.context().store.readStatus(changeId)
      expect(status.terminal).toBe('completed')

      const report = await readFile(
        join(root, 'openspec', 'changes', 'archive', changeId, 'verify-report.json'),
        'utf8',
      )
      expect(JSON.parse(report).passed).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('gate failures', () => {
  it('clarify gate rejects a template-only artifact', async () => {
    const { root, pipeline, changeId } = await setup()
    try {
      await pipeline.driveOpenStage(changeId, 'Add report export API', 'slash')
      // The open skeleton installs the unfilled template; a clarify drive
      // that leaves it unfilled (empty questions + criteria) must be gated.
      await expect(pipeline.driveClarifyStage({
        changeId,
        questions: [],
        acceptanceCriteria: [],
      })).rejects.toBeInstanceOf(BafError)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('implement gate rejects out-of-allowlist touched files', async () => {
    const { root, pipeline, changeId } = await setup()
    try {
      await pipeline.driveOpenStage(changeId, 'Add report export API', 'slash')
      await pipeline.driveClarifyStage({
        changeId,
        questions: [],
        acceptanceCriteria: ['npm test'],
      })
      await pipeline.driveDesignStage({
        changeId,
        approach: 'Approach',
        references: [await touchReference(root, 'src/a.ts')],
      })
      await pipeline.drivePlanStage({
        changeId,
        tasks: [{
          id: 't1',
          title: 'Task',
          files: ['src/a.ts'],
          verify: ['npm test'],
          rollback: 'git revert HEAD',
        }],
        allowlist: ['src/a.ts'],
      }, 'slash')
      await pipeline.enterImplementStage(changeId, 'slash')
      await expect(recordTouched(root, { changeId, file: 'src/other.ts' }))
        .rejects.toMatchObject({ code: 'scope_exceeded' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('archive refuses without human confirmation and without a passing report', async () => {
    const { root, pipeline, changeId } = await setup()
    try {
      await pipeline.driveOpenStage(changeId, 'Add report export API', 'slash')
      // §22.15 B: driveArchiveStage guards the confirm-edge source first, so
      // an unsourced call is refused with `gate_confirmation_required` before
      // the humanConfirmed check (which fires inside driveArchive → T14 evidence).
      await expect(pipeline.driveArchiveStage(changeId, false))
        .rejects.toMatchObject({ code: 'gate_confirmation_required' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('plan gate accepts the model-natural snake_case ledger (demo1 五问题 1–3)', async () => {
    // The demo1 stall: the order wording said「缺 affected files / verify 命令 /
    // rollback 点」so the model wrote `affected_files` / `verify_cmd` (a bare
    // STRING, not a list) / `rollback_point` — the strict reader reported every
    // task missing and the flow dead-looped at plan. The tolerant normalizer
    // accepts the aliases exactly like the canonical keys.
    const { root, pipeline, changeId } = await setup()
    try {
      await pipeline.driveOpenStage(changeId, '重构 ecum 示例模块', 'slash')
      await pipeline.driveClarifyStage({
        changeId,
        questions: [],
        acceptanceCriteria: ['npm test'],
      })
      await pipeline.driveDesignStage({
        changeId,
        approach: 'Approach',
        references: [await touchReference(root, 'src/a.ts')],
      })
      // Enter plan the way the walk does (template install), then author the
      // ledger in the model-natural shape the incident produced.
      await pipeline.beginDocStage(changeId, 'plan', 'slash')
      const { writeFileSync: writeFile, mkdirSync: mkdir } = await import('node:fs')
      const { dirname, join } = await import('node:path')
      const planJson = join(root, 'openspec', 'changes', changeId, 'plan.json')
      mkdir(dirname(planJson), { recursive: true })
      writeFile(planJson, `${JSON.stringify({
        tasks: [{
          id: 'T01-prepare-baseline',
          title: '记录基线',
          affected_files: ['src/a.ts'],
          verify_cmd: 'npm test',
          rollback_point: 'git checkout -- src/a.ts',
        }],
        allowlist: ['src/a.ts'],
      }, null, 2)}\n`, 'utf8')
      const { planGate } = await import('../src/stages/gates.ts')
      const gate = await planGate({ workspaceRoot: root, changeId, mode: 'full-go-path' })
      expect(gate.ok).toBe(true)
      // The implement reader takes the same shape (one contract everywhere).
      const { readLedger } = await import('../src/stages/implement.ts')
      const ledger = await readLedger(root, changeId)
      expect(ledger.tasks[0]?.files).toEqual(['src/a.ts'])
      expect(ledger.tasks[0]?.verify).toEqual(['npm test'])
      expect(ledger.tasks[0]?.done).toBe(false)
      // And the plan.md render shows the aliased rows (not an empty doc).
      const { renderPlanMdFromLedger } = await import('../src/stages/plan.ts')
      await renderPlanMdFromLedger(root, changeId)
      const { readFile: readf } = await import('node:fs/promises')
      const md = await readf(join(root, 'openspec', 'changes', changeId, 'plan.md'), 'utf8')
      expect(md).toContain('T01-prepare-baseline')
      expect(md).toContain('src/a.ts')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('illegal entry', () => {
  it('design before open is an invalid_transition', async () => {
    const { root, pipeline, changeId } = await setup()
    try {
      await expect(pipeline.driveDesignStage({
        changeId,
        approach: 'x',
        references: [],
      })).rejects.toMatchObject({ code: 'invalid_transition' })
      const status = await pipeline.context().store.readStatus(changeId)
      expect(status.current).toBe('intake')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('open blocks without a git revision', async () => {
    const { root, pipeline, changeId } = await setup({ withGit: false })
    try {
      await expect(pipeline.driveOpenStage(changeId, 'Add API', 'slash'))
        .rejects.toMatchObject({ code: 'git_unavailable' })
      const status = await pipeline.context().store.readStatus(changeId)
      expect(status.current).toBe('intake')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('verify Phase 7 wiring', () => {
  /** Shared chain setup reaching a completed implement for verify tests. */
  async function setupAtVerify(
    stack: import('@deepseek-ai/dsh-baf-core').StackAdapter | undefined,
    guard: import('@deepseek-ai/dsh-baf-core').GuardPolicy | undefined,
  ) {
    const harness = await setup({
      ...(stack === undefined ? {} : { stack }),
      ...(guard === undefined ? {} : { guard }),
    })
    await harness.pipeline.driveOpenStage(harness.changeId, 'Add report export API', 'slash')
    await harness.pipeline.driveClarifyStage({
      changeId: harness.changeId,
      questions: [{ question: 'Format?', answer: 'CSV (user call 2026-09-08)', status: 'decided' }],
      acceptanceCriteria: ['npm test exports CSV'],
    })
    await harness.pipeline.driveDesignStage({
      changeId: harness.changeId,
      approach: 'Approach',
      references: [await touchReference(harness.root, 'src/w.ts')],
    })
    const allowlistFile = 'src/w.ts'
    await harness.pipeline.drivePlanStage({
      changeId: harness.changeId,
      tasks: [{
        id: 't1',
        title: 'Task',
        files: [allowlistFile],
        verify: ['npm test'],
        rollback: 'git revert HEAD',
      }],
      allowlist: [allowlistFile],
    }, 'slash')
    const changeDirAbs = join(harness.root, 'openspec', 'changes', harness.changeId)
    await writeFile(
      join(changeDirAbs, ARTIFACT_FILES.proposal),
      '# Add report export API\n\n## Why\n\nUsers need CSV export.\n',
      'utf8',
    )
    await writeFile(
      join(changeDirAbs, ARTIFACT_FILES.tasks),
      '# Tasks\n\n- [x] t1 Task\n',
      'utf8',
    )
    await harness.pipeline.enterImplementStage(harness.changeId)
    await recordTouched(harness.root, { changeId: harness.changeId, file: allowlistFile })
    await completeTask(harness.root, harness.changeId, 't1')
    await harness.pipeline.driveImplementStage(harness.changeId)
    return harness
  }

  it('wired failing quality adapter fails verify (T11) with structured reasons', async () => {
    const stack: import('@deepseek-ai/dsh-baf-core').StackAdapter = {
      detect: async () => ({ available: true, compiler: 'gcc' }),
      runQuality: async input => ({
        schema: 1,
        baselineId: input.baseline.baselineId,
        workspace: input.workspace.root,
        toolVersions: { gcc: 'gcc 13' },
        checks: [{ id: 'build', passed: false, reasonCode: 'exit_code' }],
        artifacts: [],
        passed: false,
        diagnostics: [],
      }),
    }
    const harness = await setupAtVerify(stack, undefined)
    try {
      const verify = await harness.pipeline.driveVerifyStage(harness.changeId)
      if (verify.node !== 'verify') throw new Error('expected a verify drive')
      expect(verify.result.backToImplement).toBe(true)
      const qualityRow = verify.result.report.checks.find(row => row.name === 'quality')
      expect(qualityRow).toMatchObject({ required: true, ok: false })
      expect(qualityRow?.diagnostics).toContain('build:exit_code')
      expect(verify.result.report.toolVersions.gcc).toBe('gcc 13')
      // Unwired guard rows stay annotating (not gating).
      const guardRow = verify.result.report.checks.find(row => row.name === 'guard')
      expect(guardRow).toMatchObject({ required: false, ok: false })
    } finally {
      await rm(harness.root, { recursive: true, force: true })
    }
  })

  it('placeholder-only quality failures (policy_missing) annotate as skipped and pass verify', async () => {
    // 2026-09-22 web walk deadlock: a fresh scaffold ships build/test/analyzers
    // as <enterprise-tbd>; baf-quality reports each as a policy_missing check.
    // Those must not gate T10 — the model has no allowlisted channel to edit
    // .baf/baseline.yml, so gating here deadlocks every fresh-workspace run.
    const stack: import('@deepseek-ai/dsh-baf-core').StackAdapter = {
      detect: async () => ({ available: true, compiler: 'gcc' }),
      runQuality: async input => ({
        schema: 1,
        baselineId: input.baseline.baselineId,
        workspace: input.workspace.root,
        toolVersions: { gcc: 'gcc 13' },
        checks: [
          { id: 'build', passed: false, reasonCode: 'policy_missing' },
          { id: 'test', passed: false, reasonCode: 'policy_missing' },
          { id: 'analyzer:<enterprise-tbd>', passed: false, reasonCode: 'policy_missing' },
          { id: 'coverage', passed: true },
        ],
        artifacts: [],
        passed: false,
        diagnostics: ['no executable checks (all commands are policy placeholders)'],
      }),
    }
    const guard: import('@deepseek-ai/dsh-baf-core').GuardPolicy = {
      check: async () => ({ allowed: true, reasonCodes: [] }),
    }
    const harness = await setupAtVerify(stack, guard)
    try {
      const verify = await harness.pipeline.driveVerifyStage(harness.changeId)
      if (verify.node !== 'verify') throw new Error('expected a verify drive')
      expect(verify.result.backToImplement).toBe(false)
      const qualityRow = verify.result.report.checks.find(row => row.name === 'quality')
      expect(qualityRow).toMatchObject({ required: true, ok: true })
      expect(qualityRow?.diagnostics?.[0]).toContain('skipped: quality gates not configured')
      expect(qualityRow?.diagnostics).toContain('build:policy_missing')
      expect(verify.result.report.passed).toBe(true)
    } finally {
      await rm(harness.root, { recursive: true, force: true })
    }
  })

  it('a real quality failure still gates verify even alongside placeholders', async () => {
    const stack: import('@deepseek-ai/dsh-baf-core').StackAdapter = {
      detect: async () => ({ available: true, compiler: 'gcc' }),
      runQuality: async input => ({
        schema: 1,
        baselineId: input.baseline.baselineId,
        workspace: input.workspace.root,
        toolVersions: {},
        checks: [
          { id: 'build', passed: false, reasonCode: 'nonzero_exit' },
          { id: 'test', passed: false, reasonCode: 'policy_missing' },
        ],
        artifacts: [],
        passed: false,
        diagnostics: [],
      }),
    }
    const harness = await setupAtVerify(stack, undefined)
    try {
      const verify = await harness.pipeline.driveVerifyStage(harness.changeId)
      if (verify.node !== 'verify') throw new Error('expected a verify drive')
      expect(verify.result.backToImplement).toBe(true)
      const qualityRow = verify.result.report.checks.find(row => row.name === 'quality')
      expect(qualityRow).toMatchObject({ required: true, ok: false })
      // Only the check that actually ran and failed gates; the placeholder is
      // not laundered into the failure list.
      expect(qualityRow?.diagnostics).toEqual(['build:nonzero_exit'])
    } finally {
      await rm(harness.root, { recursive: true, force: true })
    }
  })

  it('wired guard policy gates verify via reason codes', async () => {
    const guard: import('@deepseek-ai/dsh-baf-core').GuardPolicy = {
      check: async input => ({
        allowed: input.action !== 'verify',
        reasonCodes: input.action === 'verify' ? ['protected_path'] : [],
      }),
    }
    const harness = await setupAtVerify(undefined, guard)
    try {
      const verify = await harness.pipeline.driveVerifyStage(harness.changeId)
      if (verify.node !== 'verify') throw new Error('expected a verify drive')
      expect(verify.result.backToImplement).toBe(true)
      const guardRow = verify.result.report.checks.find(row => row.name === 'guard')
      expect(guardRow).toMatchObject({ required: true, ok: false })
      expect(guardRow?.diagnostics).toContain('protected_path')
      const secretRow = verify.result.report.checks.find(row => row.name === 'secret-scan')
      expect(secretRow).toMatchObject({ required: true, ok: true })
    } finally {
      await rm(harness.root, { recursive: true, force: true })
    }
  })

  it('wired passing adapters let verify complete', async () => {
    const stack: import('@deepseek-ai/dsh-baf-core').StackAdapter = {
      detect: async () => ({ available: true }),
      runQuality: async input => ({
        schema: 1,
        baselineId: input.baseline.baselineId,
        workspace: input.workspace.root,
        toolVersions: {},
        checks: [{ id: 'build', passed: true }],
        artifacts: [],
        passed: true,
        diagnostics: [],
      }),
    }
    const guard: import('@deepseek-ai/dsh-baf-core').GuardPolicy = {
      check: async () => ({ allowed: true, reasonCodes: [] }),
    }
    const harness = await setupAtVerify(stack, guard)
    try {
      const verify = await harness.pipeline.driveVerifyStage(harness.changeId)
      if (verify.node !== 'verify') throw new Error('expected a verify drive')
      expect(verify.result.backToImplement).toBe(false)
      expect(verify.result.report.checks.every(row => row.ok)).toBe(true)
    } finally {
      await rm(harness.root, { recursive: true, force: true })
    }
  })
})

describe('verify T11', () => {
  it('failing openspec-validate sends verify → implement with a stage-failed record', async () => {
    const { root, pipeline, store, changeId } = await setup()
    try {
      await pipeline.driveOpenStage(changeId, 'Add report export API', 'slash')
      await pipeline.driveClarifyStage({
        changeId,
        questions: [{ question: 'Format?', answer: 'CSV (user call 2026-09-08)', status: 'decided' }],
        acceptanceCriteria: ['npm test exports CSV'],
      })
      await pipeline.driveDesignStage({
        changeId,
        approach: 'Approach',
        references: [await touchReference(root, 'src/x.ts')],
      })
      const allowlistFile = 'src/x.ts'
      await pipeline.drivePlanStage({
        changeId,
        tasks: [{
          id: 't1',
          title: 'Task',
          files: [allowlistFile],
          verify: ['npm test'],
          rollback: 'git revert HEAD',
        }],
        allowlist: [allowlistFile],
      }, 'slash')
      const changeDirAbs = join(root, 'openspec', 'changes', changeId)
      await writeFile(
        join(changeDirAbs, ARTIFACT_FILES.proposal),
        '# Add report export API\n\n## Why\n\nUsers need CSV export.\n',
        'utf8',
      )
      await writeFile(
        join(changeDirAbs, ARTIFACT_FILES.tasks),
        '# Tasks\n\n- [x] t1 Task\n',
        'utf8',
      )

      await pipeline.enterImplementStage(changeId, 'slash')
      await recordTouched(root, { changeId, file: allowlistFile })
      await completeTask(root, changeId, 't1')
      await pipeline.driveImplementStage(changeId)

      // Force verify to fail by emptying proposal.md (adapter validate then
      // flags the missing "## Why" section as an unfilled template).
      await writeFile(
        join(changeDirAbs, ARTIFACT_FILES.proposal),
        '# Add report export API\n',
        'utf8',
      )
      const verify = await pipeline.driveVerifyStage(changeId)
      if (verify.node !== 'verify') throw new Error('expected a verify drive')
      expect(verify.result.backToImplement).toBe(true)
      const status = await store.readStatus(changeId)
      expect(status.nodes.verify).toBe('failed')
      expect(status.current).toBe('implement')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('drift detection (Phase 5.8)', () => {
  it('writes drift-detected when an artifact owned by a completed stage is deleted', async () => {
    const { root, pipeline, store, changeId } = await setup()
    try {
      await pipeline.driveOpenStage(changeId, 'Add report export API', 'slash')
      await pipeline.driveClarifyStage({
        changeId,
        questions: [{ question: 'Format?', answer: 'CSV (user call 2026-09-08)', status: 'decided' }],
        acceptanceCriteria: ['npm test exports CSV'],
      })
      await pipeline.driveDesignStage({
        changeId,
        approach: 'Approach',
        references: [await touchReference(root, 'src/d.ts')],
      })

      const designPath = join(root, 'openspec', 'changes', changeId, ARTIFACT_FILES.design)
      await unlink(designPath)

      const drift = await pipeline.driveDriftStage(changeId)
      if (drift.node !== 'drift') throw new Error('expected drift node')
      expect(drift.result.signals.length).toBeGreaterThan(0)
      expect(drift.result.signals.some(s => s.trigger === 'artifact-missing')).toBe(true)

      const events = await store.readEvents(changeId)
      expect(events.events.some(e => e.type === 'drift-detected')).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('detects baseline id change without recording when record=false', async () => {
    const { root, pipeline, changeId, baseline } = await setup()
    try {
      await pipeline.driveOpenStage(changeId, 'Add report export API', 'slash')
      const status = await pipeline.context().store.readStatus(changeId)
      const observation: DriftObservation = {
        baseline: { ...baseline, baselineId: 'replacement-baseline' },
      }
      const signals = await detectAndRecord(pipeline.context(), status, observation, { record: false })
      expect(signals.some(s => s.trigger === 'baseline-id-changed')).toBe(true)
      const events = await pipeline.context().store.readEvents(changeId)
      expect(events.events.some(e => e.type === 'drift-detected')).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('abandon (Phase 5.8)', () => {
  it('refuses without human confirmation', async () => {
    const { root, pipeline, changeId } = await setup()
    try {
      // §22.15 B: the source guard runs before the humanConfirmed check.
      await expect(pipeline.driveAbandonStage({ changeId, humanConfirmed: false }))
        .rejects.toMatchObject({ code: 'gate_confirmation_required' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('records change-abandoned after confirmation and stays idempotent on retry', async () => {
    const { root, pipeline, store, changeId } = await setup()
    try {
      await pipeline.driveOpenStage(changeId, 'Add report export API', 'slash')
      const first = await pipeline.driveAbandonStage({ changeId, humanConfirmed: true, source: 'slash' })
      if (first.node !== 'abandon') throw new Error('expected abandon node')
      expect(first.result.recorded).toBe(true)
      expect(first.result.status.terminal === 'abandoned').toBe(true)

      const events = await store.readEvents(changeId)
      expect(events.events.some(e => e.type === 'change-abandoned')).toBe(true)

      const second = await pipeline.driveAbandonStage({ changeId, humanConfirmed: true, source: 'slash' })
      if (second.node !== 'abandon') throw new Error('expected abandon node')
      expect(second.result.recorded).toBe(false)
      expect(second.result.status.terminal === 'abandoned').toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('changeArtifactStatus (customer-facing artifact rows)', () => {
  it('classifies template vs filled vs missing and names the paths', async () => {
    const { root, changeId } = await setup()
    try {
      // proposal.md filled, clarify.md still the template, rest absent.
      await putFile(root, changeId, ARTIFACT_FILES.proposal, [
        '# Proposal', '', '## Why', '', '- The customer needs CSV export for reports.', '',
      ].join('\n'))
      await putFile(root, changeId, ARTIFACT_FILES.clarify, [
        '# Clarify', '', '## Blocking questions', '', 'TODO: one entry per blocking question, each with:', '',
        '## Acceptance criteria', '', 'TODO: testable acceptance conditions.', '',
      ].join('\n'))
      const rows = await changeArtifactStatus({ workspaceRoot: root, changeId, mode: 'full-go-path' })
      const by = (file: string) => rows.find(r => r.file === file)

      expect(by(ARTIFACT_FILES.proposal)?.state).toBe('filled')
      expect(by(ARTIFACT_FILES.proposal)?.missing).toEqual([])
      expect(by(ARTIFACT_FILES.clarify)?.state).toBe('template')
      expect(by(ARTIFACT_FILES.clarify)?.missing.length).toBeGreaterThan(0)
      expect(by(ARTIFACT_FILES.design)?.state).toBe('missing')
      expect(by(ARTIFACT_FILES.planJson)?.state).toBe('missing')
      expect(by(ARTIFACT_FILES.clarify)?.path).toBe(`openspec/changes/${changeId}/${ARTIFACT_FILES.clarify}`)
      // The card line renders path + Chinese state.
      expect(artifactLine(by(ARTIFACT_FILES.design)!)).toBe(
        `openspec/changes/${changeId}/${ARTIFACT_FILES.design} · 尚未生成`)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('accepts a numbered Acceptance criteria heading (models number their sections)', async () => {
    const { root, changeId } = await setup()
    try {
      // r8 web-walk shape: the model wrote `## 7. Acceptance criteria` — the
      // gate's contract is "the section exists", not the literal heading.
      await putFile(root, changeId, ARTIFACT_FILES.clarify, [
        '# Clarify', '',
        '## 7. Acceptance criteria', '',
        '- AC-1: Select-String over the later artifacts returns no TODO: lines.', '',
      ].join('\n'))
      const rows = await changeArtifactStatus({ workspaceRoot: root, changeId, mode: 'full-go-path' })
      expect(rows.find(r => r.file === ARTIFACT_FILES.clarify)?.state).toBe('filled')
      expect(rows.find(r => r.file === ARTIFACT_FILES.clarify)?.missing).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('treats an empty plan.json as the template and a tasked one as filled', async () => {
    const { root, changeId } = await setup()
    try {
      await putFile(root, changeId, ARTIFACT_FILES.planJson, `${JSON.stringify({ tasks: [], allowlist: [] }, null, 2)}\n`)
      const empty = await changeArtifactStatus({ workspaceRoot: root, changeId, mode: 'full-go-path' })
      expect(empty.find(r => r.file === ARTIFACT_FILES.planJson)?.state).toBe('template')

      await putFile(root, changeId, ARTIFACT_FILES.planJson, `${JSON.stringify({
        tasks: [{ id: 'T1', files: ['src/a.ts'], verify: ['npm test'], rollback: 'git checkout' }],
        allowlist: ['src/a.ts'],
      }, null, 2)}\n`)
      const filled = await changeArtifactStatus({ workspaceRoot: root, changeId, mode: 'full-go-path' })
      expect(filled.find(r => r.file === ARTIFACT_FILES.planJson)?.state).toBe('filled')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('classifies a wrapped-line TODO template (tasks.md) as the template', async () => {
    const { root, changeId } = await setup()
    try {
      // The real tasks.md template: its TODO sentence wraps onto a second line,
      // which the old per-line placeholder rule misread as real content.
      await putFile(root, changeId, ARTIFACT_FILES.tasks, [
        `# Tasks — ${changeId}`, '',
        'TODO: ordered task list. Each task states input, output, affected files,',
        'the verification command, and the rollback point.', '',
      ].join('\n'))
      const rows = await changeArtifactStatus({ workspaceRoot: root, changeId, mode: 'full-go-path' })
      expect(rows.find(r => r.file === ARTIFACT_FILES.tasks)?.state).toBe('template')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('proposalGate (2026-09-22 user report #1 — open 阶段产物是推进前提)', () => {
  /** Author (or replace) one artifact body inside the change dir. */
  async function put(root: string, changeId: string, body: string): Promise<void> {
    const path = join(root, 'openspec', 'changes', changeId, ARTIFACT_FILES.proposal)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, body, 'utf8')
  }

  it('full-go-path: fails on missing file, template body, and a body without Why; passes authored', async () => {
    const { root, changeId } = await setup()
    const input = { workspaceRoot: root, changeId, mode: 'full-go-path' as const }
    try {
      const missing = await proposalGate(input)
      expect(missing.ok).toBe(false)
      expect(missing.reasonCodes).toEqual(['stage_incomplete'])
      expect(missing.missing?.join('\n')).toContain('proposal.md 不存在')

      await put(root, changeId, [
        '# Proposal', '', '## Why', '',
        'TODO: one paragraph on the user goal and the problem this change solves.',
        '', '## Scope', '',
        'TODO: bullet list of what is in scope and what is explicitly out of scope.',
      ].join('\n'))
      const template = await proposalGate(input)
      expect(template.ok).toBe(false)
      expect(template.missing?.join('\n')).toContain('Why')

      await put(root, changeId, [
        '# Proposal', '',
        'Real prose explaining the goal, but the required Why heading is absent.',
      ].join('\n'))
      const noWhy = await proposalGate(input)
      expect(noWhy.ok).toBe(false)
      expect(noWhy.detail).toContain('lacks Why section')

      await put(root, changeId, [
        '# Proposal', '', '## Why', '',
        'Customers need CSV export of reports for downstream spreadsheets.',
        '', '## 3. Scope', '',
        '- In: public exportReportsCsv API; Out: any non-CSV format.',
        '', '## Impact', '',
        'Adds src/export.ts; rollback is deleting the file.',
      ].join('\n'))
      // Numbered heading variants pass (Fix A tolerance, same contract).
      expect((await proposalGate(input)).ok).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('bug-fix-path skips the proposal gate', async () => {
    const { root, changeId } = await setup()
    try {
      expect((await proposalGate({ workspaceRoot: root, changeId, mode: 'bug-fix-path' })).ok).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

// 【变更】2026-09-26 (用户需求 工作流 3): the bug-fix open gate — the clipped
// counterpart of proposalGate. A fieldless confirm now opens a TODO draft;
// this gate is what refuses the advance until the model completes it.
describe('bugRecordGate (bug-fix-path open 裁决门)', () => {
  /** The draft a fieldless confirm writes (driveClassify's placeholder shape). */
  function draftBody(changeId: string, problem: string): string {
    return [
      '# Fix parser crash on empty input', '',
      `Change id: ${changeId}`, '',
      '## Problem', '',
      problem, '',
      '## Root cause', '',
      'TODO', '',
      '## Impact scope', '',
      '- TODO', '',
      '## Regression test', '',
      '- File: TODO',
      '- Command: TODO', '',
    ].join('\n')
  }

  /** A completed record (root cause / files / regression all real). */
  function completeBody(changeId: string): string {
    return [
      '# Fix parser crash on empty input', '',
      `Change id: ${changeId}`, '',
      '## Problem', '',
      'Parser dereferences a null token when the input file is empty.', '',
      '## Root cause', '',
      'Missing length guard before the token loop in parse().', '',
      '## Impact scope', '',
      '- src/parser.c', '',
      '## Regression test', '',
      '- File: tests/test_parser_empty.c',
      '- Command: ctest -R parser_empty', '',
    ].join('\n')
  }

  it('fails on the TODO draft with the per-item missing list, passes the completed record', async () => {
    const { root, changeId } = await setup()
    const input = { workspaceRoot: root, changeId, mode: 'bug-fix-path' as const }
    try {
      const missing = await bugRecordGate(input)
      expect(missing.ok).toBe(false)
      expect(missing.reasonCodes).toEqual(['stage_incomplete'])
      expect(missing.missing?.join('\n')).toContain('proposal.md 不存在')

      await putFile(root, changeId, BUG_FIX_PROPOSAL_FILE, draftBody(changeId, 'feat: add export public API for reports'))
      const draft = await bugRecordGate(input)
      expect(draft.ok).toBe(false)
      const lines = draft.missing?.join('\n') ?? ''
      expect(lines).toContain('Root cause')
      expect(lines).toContain('Impact scope')
      expect(lines).toContain('Regression test · File')
      expect(lines).toContain('Regression test · Command')
      // The problem section is real (requirement summary) — not on the list.
      expect(lines).not.toContain('Problem：')

      // Draft ledger: TODO allowlist + TODO regression task keep the gate shut.
      await putFile(root, changeId, ARTIFACT_FILES.planJson, `${JSON.stringify({
        bugFixPath: true,
        tasks: [
          { id: 'regression-test', files: ['TODO'], done: false },
          { id: 'fix-root-cause', files: ['TODO'], done: false },
        ],
        allowlist: ['TODO'],
        touched: [],
      }, null, 2)}\n`)
      const ledger = await bugRecordGate(input)
      expect(ledger.ok).toBe(false)
      expect(ledger.missing?.join('\n')).toContain('allowlist')

      await putFile(root, changeId, BUG_FIX_PROPOSAL_FILE, completeBody(changeId))
      await putFile(root, changeId, ARTIFACT_FILES.planJson, `${JSON.stringify({
        bugFixPath: true,
        tasks: [
          { id: 'regression-test', files: ['tests/test_parser_empty.c'], done: false },
          { id: 'fix-root-cause', files: ['src/parser.c'], done: false },
        ],
        allowlist: ['tests/test_parser_empty.c', 'src/parser.c'],
        touched: [],
      }, null, 2)}\n`)
      expect((await bugRecordGate(input)).ok).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('full-go-path passes unconditionally (the mode never runs this gate)', async () => {
    const { root, changeId } = await setup()
    try {
      expect((await bugRecordGate({ workspaceRoot: root, changeId, mode: 'full-go-path' })).ok).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  // 【变更】2026-09-26 (web walk, demo-bugfix): the model prefilled the
  // bug-fields form with vague Chinese placeholders; the gate passed them and
  // the classify-confirm follow-up advanced into implement on an empty
  // diagnosis. The vague family and prose-instead-of-path shapes must count
  // as missing exactly like TODO.
  it('refuses the model-prefilled vague record (待定位 / prose paths / prose allowlist)', async () => {
    const { root, changeId } = await setup()
    const input = { workspaceRoot: root, changeId, mode: 'bug-fix-path' as const }
    try {
      // Verbatim shape from the walk: every field "filled", none real.
      await putFile(root, changeId, BUG_FIX_PROPOSAL_FILE, [
        '# Fix parser crash on empty input', '',
        `Change id: ${changeId}`, '',
        '## Problem', '',
        'ecum 模块导出报表时，如果数据行为空会崩溃', '',
        '## Root cause', '',
        '待定位（疑似导出流程未对空数据行做空值/边界检查）', '',
        '## Impact scope', '',
        '- ecum 模块导出报表相关源文件（待定位）', '',
        '## Regression test', '',
        '- File: ecum 导出报表的空数据行回归测试（待新建）',
        '- Command: 待定位（基于项目现有测试命令）', '',
      ].join('\n'))
      await putFile(root, changeId, ARTIFACT_FILES.planJson, `${JSON.stringify({
        bugFixPath: true,
        tasks: [
          { id: 'regression-test', files: ['ecum 导出报表的空数据行回归测试（待新建）'], done: false },
          { id: 'fix-root-cause', files: ['ecum 模块导出报表相关源文件（待定位）'], done: false },
        ],
        allowlist: ['ecum 模块导出报表相关源文件（待定位）', 'ecum 导出报表的空数据行回归测试（待新建）'],
        touched: [],
      }, null, 2)}\n`)
      const gate = await bugRecordGate(input)
      expect(gate.ok).toBe(false)
      const lines = gate.missing?.join('\n') ?? ''
      expect(lines).toContain('Root cause')
      expect(lines).toContain('Impact scope')
      expect(lines).toContain('Regression test · File')
      expect(lines).toContain('Regression test · Command')
      expect(lines).toContain('allowlist')
      expect(lines).toContain('regression-test 任务')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('accepts CJK paths and directory allowlist entries that are still real paths', async () => {
    const { root, changeId } = await setup()
    const input = { workspaceRoot: root, changeId, mode: 'bug-fix-path' as const }
    try {
      await putFile(root, changeId, BUG_FIX_PROPOSAL_FILE, [
        '# Fix parser crash on empty input', '',
        `Change id: ${changeId}`, '',
        '## Problem', '',
        '导出报表空数据行崩溃。', '',
        '## Root cause', '',
        '导出循环先解引用后判空。', '',
        '## Impact scope', '',
        '- ecum/导出.js', '',
        '## Regression test', '',
        '- File: ecum/导出空行.test.js',
        '- Command: node --test ecum/导出空行.test.js', '',
      ].join('\n'))
      await putFile(root, changeId, ARTIFACT_FILES.planJson, `${JSON.stringify({
        bugFixPath: true,
        tasks: [
          { id: 'regression-test', files: ['ecum/导出空行.test.js'], done: false },
          { id: 'fix-root-cause', files: ['ecum/导出.js'], done: false },
        ],
        allowlist: ['ecum/导出空行.test.js', 'ecum/导出.js', 'ecum/'],
        touched: [],
      }, null, 2)}\n`)
      expect((await bugRecordGate(input)).ok).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

// 【变更】2026-09-26 (用户需求 工作流 3): the clipped artifact rail — same
// shape as full-go-path, minus the artifacts this mode never writes.
describe('changeArtifactStatus (bug-fix-path clipped rail)', () => {
  it('shows the full-go rail row-for-row — proposal.md real, clarify/design/plan.md clipped', async () => {
    const { root, changeId } = await setup()
    try {
      // Draft record + draft ledger (the fieldless-confirm state).
      await putFile(root, changeId, BUG_FIX_PROPOSAL_FILE, [
        '# Fix parser crash on empty input', '',
        `Change id: ${changeId}`, '',
        '## Problem', '',
        'Parser crashes on empty input.', '',
        '## Root cause', '',
        'TODO', '',
        '## Impact scope', '',
        '- TODO', '',
        '## Regression test', '',
        '- File: TODO',
        '- Command: TODO', '',
      ].join('\n'))
      await putFile(root, changeId, 'bug-fix-path-ledger.json', `${JSON.stringify({
        bugFixPath: true,
        tasks: [
          { id: 'regression-test', files: ['TODO'], done: false },
          { id: 'fix-root-cause', files: ['TODO'], done: false },
        ],
        allowlist: ['TODO'],
        touched: [],
      }, null, 2)}\n`)
      const rows = await changeArtifactStatus({ workspaceRoot: root, changeId, mode: 'bug-fix-path' })
      // 【变更】2026-09-28 (用户问题 3 + 8) / 【变更】2026-09-30 (demo31 问题 4):
      // parity rail — the order is the full-go one row-for-row; the clipped
      // full-go docs render as 已裁剪 rows, checklist.md rides for real.
      // 【变更】2026-09-30 (demo33 问题 1): the whole plan row family clips —
      // the fast-path machine ledger lives at bug-fix-path-ledger.json
      // (outside the customer rail), so nothing named plan generates here.
      expect(rows.map(r => r.file)).toEqual([
        BUG_FIX_PROPOSAL_FILE,
        ARTIFACT_FILES.clarify,
        ARTIFACT_FILES.design,
        ARTIFACT_FILES.plan,
        ARTIFACT_FILES.planJson,
        ARTIFACT_FILES.tasks,
        CHECKLIST_FILE,
        'verify.md',
      ])
      const record = rows.find(r => r.file === BUG_FIX_PROPOSAL_FILE)
      expect(record?.state).toBe('template')
      expect(record?.missing.join('\n')).toContain('Root cause')
      expect(rows.find(r => r.file === ARTIFACT_FILES.planJson)?.state).toBe('clipped')
      expect(rows.find(r => r.file === 'verify.md')?.state).toBe('missing')
      // 【变更】2026-09-28 (用户问题 3): the clipped rows read 已裁剪.
      expect(rows.find(r => r.file === ARTIFACT_FILES.clarify)?.state).toBe('clipped')
      expect(rows.find(r => r.file === ARTIFACT_FILES.design)?.state).toBe('clipped')
      // 【变更】2026-09-30 (demo31 问题 4): plan.md joins the clipped set —
      // bug-fix writes only the plan.json ledger, the narrative plan is clipped.
      // 【变更】2026-09-30 (demo33 问题 1): plan.json + tasks.md clip too — the
      // ledger moved to bug-fix-path-ledger.json and tasks.md never renders.
      expect(rows.find(r => r.file === ARTIFACT_FILES.plan)?.state).toBe('clipped')
      expect(rows.find(r => r.file === ARTIFACT_FILES.tasks)?.state).toBe('clipped')
      // 【变更】2026-09-28 (用户问题 8): the checklist row is missing until the
      // implement exit authors it.
      expect(rows.find(r => r.file === CHECKLIST_FILE)?.state).toBe('missing')

      // Completed record + real ledger → both rows filled.
      await putFile(root, changeId, BUG_FIX_PROPOSAL_FILE, [
        '# Fix parser crash on empty input', '',
        `Change id: ${changeId}`, '',
        '## Problem', '',
        'Parser crashes on empty input.', '',
        '## Root cause', '',
        'Missing length guard in parse().', '',
        '## Impact scope', '',
        '- src/parser.c', '',
        '## Regression test', '',
        '- File: tests/test_parser_empty.c',
        '- Command: ctest -R parser_empty', '',
      ].join('\n'))
      await putFile(root, changeId, 'bug-fix-path-ledger.json', `${JSON.stringify({
        bugFixPath: true,
        tasks: [
          { id: 'regression-test', files: ['tests/test_parser_empty.c'], done: true },
          { id: 'fix-root-cause', files: ['src/parser.c'], done: true },
        ],
        allowlist: ['tests/test_parser_empty.c', 'src/parser.c'],
        touched: ['tests/test_parser_empty.c', 'src/parser.c'],
      }, null, 2)}\n`)
      const filled = await changeArtifactStatus({ workspaceRoot: root, changeId, mode: 'bug-fix-path' })
      expect(filled.find(r => r.file === BUG_FIX_PROPOSAL_FILE)?.state).toBe('filled')
      // 【变更】2026-09-30 (demo33 问题 1): the ledger at bug-fix-path-ledger.json
      // is machine state, not a rail row — plan.json stays clipped even with a
      // live ledger beside it.
      expect(filled.find(r => r.file === ARTIFACT_FILES.planJson)?.state).toBe('clipped')
      // 【变更】2026-09-28 (用户问题 8): an all-ticked checklist reads 已填写.
      await putFile(root, changeId, CHECKLIST_FILE, [
        '# Checklist', '',
        '- [x] ctest -R parser_empty 通过',
        '- [x] 空输入不再崩溃', '',
      ].join('\n'))
      const ticked = await changeArtifactStatus({ workspaceRoot: root, changeId, mode: 'bug-fix-path' })
      expect(ticked.find(r => r.file === CHECKLIST_FILE)?.state).toBe('filled')
      await putFile(root, changeId, CHECKLIST_FILE, [
        '# Checklist', '',
        '- [x] ctest -R parser_empty 通过',
        '- [ ] 空输入不再崩溃', '',
      ].join('\n'))
      const partial = await changeArtifactStatus({ workspaceRoot: root, changeId, mode: 'bug-fix-path' })
      expect(partial.find(r => r.file === CHECKLIST_FILE)?.state).toBe('planned')
      expect(partial.find(r => r.file === CHECKLIST_FILE)?.missing.join('\n')).toContain('剩 1/2')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

// 【变更】2026-09-30 (demo33 问题 3): verify.md 是完整、详尽的正式测试报告 —
// 验证名称 / 验证内容 / 验证方法 / 验证结果 四要素逐项可见，未知检查名回退
// 名称本身，失败报告与通过报告的结论分开。
describe('renderVerifyMd (demo33 问题 3 — 正式测试报告)', () => {
  /** Write one synthetic report through the renderer and hand back the md. */
  async function render(
    report: import('../src/stages/check-runner.ts').VerifyReport,
  ): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'baf-verify-md-'))
    try {
      const changeDirAbs = join(root, 'openspec', 'changes', report.changeId)
      await mkdir(changeDirAbs, { recursive: true })
      const { renderVerifyMd } = await import('../src/stages/verify.ts')
      await renderVerifyMd(root, report.changeId, report)
      return await readFile(join(changeDirAbs, 'verify.md'), 'utf8')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  const row = (over: Partial<import('../src/stages/check-runner.ts').CheckReportRow> = {}) => ({
    name: 'regression-test',
    required: true,
    ok: true,
    durationMs: 12,
    diagnostics: ['regression test written and its task done'],
    ...over,
  })

  it('renders the named four-element report for a passing bug-fix verify', async () => {
    const md = await render({
      schema: 1,
      changeId: 'change-x',
      mode: 'bug-fix-path',
      toolVersions: { node: '22.0.0' },
      checks: [row()],
      passed: true,
      finishedAt: '2026-09-30T12:00:00.000Z',
    })
    expect(md).toContain('# 验证报告 — change-x')
    expect(md).toContain('## 报告信息')
    expect(md).toContain('| 变更编号 | `change-x` |')
    expect(md).toContain('| 工作流模式 | bug-fix-path |')
    expect(md).toContain('| 工具版本 | node@22.0.0 |')
    expect(md).toContain('| 必需检查 | 通过 1/1 |')
    expect(md).toContain('**✅ 通过**')
    expect(md).toContain('## 验证总览')
    expect(md).toContain('| 1 | 回归测试落地检查 | 必需 | ✅ 通过 | 12ms |')
    expect(md).toContain('### 1. 回归测试落地检查')
    expect(md).toContain('- **检查项**：`regression-test`')
    expect(md).toContain('- **验证内容**：缺陷修复路径要求的回归测试是否先于修复代码落地')
    expect(md).toContain('- **验证方法**：读取实现账本（bug-fix-path-ledger.json / plan.json）')
    expect(md).toContain('- **验证结果**：✅ 通过（耗时 12ms）')
    expect(md).toContain('- regression test written and its task done')
  })

  it('falls back to the raw name for unregistered checks and separates the failed verdict', async () => {
    const md = await render({
      schema: 1,
      changeId: 'change-y',
      toolVersions: {},
      checks: [
        row({ name: 'future-check', required: false, ok: false, durationMs: 3, diagnostics: [] }),
      ],
      passed: true,
      finishedAt: '2026-09-30T12:00:00.000Z',
    })
    // Unknown catalog name → the name itself is the 验证名称.
    expect(md).toContain('| 1 | future-check | 辅助 | ⚠️ 未通过（非必需，不阻断） | 3ms |')
    expect(md).toContain('### 1. future-check')
    expect(md).toContain('- **验证内容**：检查项 future-check（暂无中文元数据')
    // A failed non-required row alone keeps the overall conclusion passing.
    expect(md).toContain('**✅ 通过**')
    expect(md).toContain('| 必需检查 | 通过 0/0 |')
  })

  it('renders the failing conclusion when a required check failed', async () => {
    const md = await render({
      schema: 1,
      changeId: 'change-z',
      toolVersions: {},
      checks: [row({ ok: false, diagnostics: ['regression_test_required: test not written'] })],
      passed: false,
      finishedAt: '2026-09-30T12:00:00.000Z',
    })
    expect(md).toContain('**❌ 未通过**')
    expect(md).toContain('❌ 失败（必需检查）')
    expect(md).toContain('- regression_test_required: test not written')
  })
})
