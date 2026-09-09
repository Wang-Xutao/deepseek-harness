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
async function setup(options: { readonly gitRevision?: string; readonly withGit?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'baf-stage-'))
  const store = new ProjectionStore({ workspaceRoot: root })
  const baseline = await loadBaselineFile(FIXTURE_BASELINE)
  const gitRevision = options.withGit === false ? undefined : (options.gitRevision ?? 'rev-1')
  const pipeline = new StagePipeline({
    store,
    workspaceRoot: root,
    ...(gitRevision === undefined ? {} : { gitRevision }),
    baseline,
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
      await pipeline.driveOpenStage(changeId, 'Add report export API')
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
      })

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
      await pipeline.enterImplementStage(changeId)
      await recordTouched(root, { changeId, file: allowlistFile })
      await completeTask(root, changeId, 't1')
      await pipeline.driveImplementStage(changeId)

      const verify = await pipeline.driveVerifyStage(changeId)
      expect(verify.node).toBe('verify')

      const archive = await pipeline.driveArchiveStage(changeId, true)
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
      await pipeline.driveOpenStage(changeId, 'Add report export API')
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
      await pipeline.driveOpenStage(changeId, 'Add report export API')
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
      })
      await pipeline.enterImplementStage(changeId)
      await expect(recordTouched(root, { changeId, file: 'src/other.ts' }))
        .rejects.toMatchObject({ code: 'scope_exceeded' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('archive refuses without human confirmation and without a passing report', async () => {
    const { root, pipeline, changeId } = await setup()
    try {
      await pipeline.driveOpenStage(changeId, 'Add report export API')
      await expect(pipeline.driveArchiveStage(changeId, false))
        .rejects.toMatchObject({ code: 'invalid_transition' })
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
      await expect(pipeline.driveOpenStage(changeId, 'Add API'))
        .rejects.toMatchObject({ code: 'invalid_transition' })
      const status = await pipeline.context().store.readStatus(changeId)
      expect(status.current).toBe('intake')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('verify T11', () => {
  it('failing openspec-validate sends verify → implement with a stage-failed record', async () => {
    const { root, pipeline, store, changeId } = await setup()
    try {
      await pipeline.driveOpenStage(changeId, 'Add report export API')
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
      })
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

      await pipeline.enterImplementStage(changeId)
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
      expect(verify.node).toBe('verify')
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
      await pipeline.driveOpenStage(changeId, 'Add report export API')
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
      await pipeline.driveOpenStage(changeId, 'Add report export API')
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
      await expect(pipeline.driveAbandonStage({ changeId, humanConfirmed: false }))
        .rejects.toMatchObject({ code: 'invalid_transition' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('records change-abandoned after confirmation and stays idempotent on retry', async () => {
    const { root, pipeline, store, changeId } = await setup()
    try {
      await pipeline.driveOpenStage(changeId, 'Add report export API')
      const first = await pipeline.driveAbandonStage({ changeId, humanConfirmed: true })
      if (first.node !== 'abandon') throw new Error('expected abandon node')
      expect(first.result.recorded).toBe(true)
      expect(first.result.status.terminal === 'abandoned').toBe(true)

      const events = await store.readEvents(changeId)
      expect(events.events.some(e => e.type === 'change-abandoned')).toBe(true)

      const second = await pipeline.driveAbandonStage({ changeId, humanConfirmed: true })
      if (second.node !== 'abandon') throw new Error('expected abandon node')
      expect(second.result.recorded).toBe(false)
      expect(second.result.status.terminal === 'abandoned').toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
