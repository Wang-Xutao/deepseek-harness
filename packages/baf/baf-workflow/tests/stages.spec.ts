/**
 * Phase 5 full-go stage pipeline tests: happy path, gate failures, and
 * illegal entry (§12 Phase 5.8 acceptance).
 */

import { mkdtemp, mkdir, rm, writeFile, readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BafError, loadBaselineFile } from '@deepseek-ai/dsh-baf-core'
import { ARTIFACT_FILES } from '@deepseek-ai/dsh-baf-openspec'
import { confirmIntake, createWorkflowService } from '../src/workflow-service.ts'
import { ProjectionStore } from '../src/projection.ts'
import { StagePipeline } from '../src/stages/pipeline.ts'
import { recordTouched, completeTask } from '../src/stages/implement.ts'
import { detectAndRecord, type DriftObservation } from '../src/stages/drift.ts'

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

describe('stage pipeline happy path', () => {
  it('runs open → clarify → design → plan → implement → verify → archive', async () => {
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
        .rejects.toMatchObject({ code: 'invalid_transition' })
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
