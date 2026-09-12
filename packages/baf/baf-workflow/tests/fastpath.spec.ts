/**
 * Phase 6 bug-fast-path tests: low-risk bug chain, regression-test-first
 * refusals, T15 escalation (auto + explicit), and post-upgrade backfill
 * (§12 Phase 6 acceptance).
 */

import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadBaselineFile } from '@deepseek-ai/dsh-baf-core'
import { ARTIFACT_FILES } from '@deepseek-ai/dsh-baf-openspec'
import { confirmIntake, createWorkflowService } from '../src/workflow-service.ts'
import { ProjectionStore } from '../src/projection.ts'
import { StagePipeline } from '../src/stages/pipeline.ts'
import { recordTouched, completeTask } from '../src/stages/implement.ts'

const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

const REGRESSION_FILE = 'tests/test_parser_empty.c'
const FIX_FILE = 'src/parser.c'

/** Create a temp workspace with a confirmed low-risk-bug change (T3 ready). */
async function setupFastPath(options: { readonly withGit?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'baf-fastpath-'))
  const store = new ProjectionStore({ workspaceRoot: root })
  const baseline = await loadBaselineFile(FIXTURE_BASELINE)
  const gitRevision = options.withGit === false ? undefined : 'rev-fp-1'
  const pipeline = new StagePipeline({
    store,
    workspaceRoot: root,
    ...(gitRevision === undefined ? {} : { gitRevision }),
    baseline,
  })
  const service = createWorkflowService({ store })
  const { intake } = await service.intake({
    description: 'fix: parser crash when input file is empty (bug fix)',
    workspace: { root },
    affectedScopeHint: 'single-file',
    baseline,
  })
  await confirmIntake(store, intake.changeId, 'user')
  return { root, store, pipeline, service, changeId: intake.changeId, baseline }
}

/** Standard fast-path open input for a parser crash fix. */
function bugInput(changeId: string) {
  return {
    changeId,
    title: 'Fix parser crash on empty input',
    problem: 'Parser dereferences a null token when the input file is empty.',
    rootCause: 'Missing length guard before the token loop in parse().',
    affectedFiles: [FIX_FILE],
    regressionTest: { file: REGRESSION_FILE, command: 'ctest -R parser_empty' },
  } as const
}

/** Drive open → implement in-progress with regression test written first. */
async function reachImplementInProgress(
  pipeline: StagePipeline,
  root: string,
  changeId: string,
): Promise<void> {
  await pipeline.driveFastPathOpenStage(bugInput(changeId))
  await pipeline.enterImplementStage(changeId)
  await recordTouched(root, { changeId, file: REGRESSION_FILE })
  await completeTask(root, changeId, 'regression-test')
  await recordTouched(root, { changeId, file: FIX_FILE })
  await completeTask(root, changeId, 'fix-root-cause')
}

/** Reference an existing workspace-relative file for design citations. */
async function touchReference(root: string, rel: string): Promise<string> {
  const path = join(root, rel)
  const { dirname } = await import('node:path')
  const { mkdir } = await import('node:fs/promises')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, 'export {}\n', 'utf8')
  return rel
}

describe('fast-path happy path', () => {
  it('runs intake → fast-path open → implement → verify → archive without OpenSpec artifacts', async () => {
    const { root, pipeline, store, changeId } = await setupFastPath()
    try {
      let status = await store.readStatus(changeId)
      expect(status.mode).toBe('bug-fast-path')
      expect(status.openspecSkipped?.skipped).toBe(true)
      expect(status.nodes.clarify).toBe('skipped')

      await pipeline.driveFastPathOpenStage(bugInput(changeId))
      status = await store.readStatus(changeId)
      expect(status.current).toBe('open')
      expect(status.nodes.open).toBe('completed')

      const bugRecord = await readFile(
        join(root, 'openspec', 'changes', changeId, 'bug-record.md'),
        'utf8',
      )
      expect(bugRecord).toContain('## Root cause')

      // No full-go skeleton templates: fast path created only the bug record
      // and the implement ledger.
      await expect(readFile(
        join(root, 'openspec', 'changes', changeId, ARTIFACT_FILES.clarify),
        'utf8',
      )).rejects.toThrow()

      // Full-go-only edges stay illegal in fast-path mode (T4 is full-go).
      await expect(pipeline.driveClarifyStage({
        changeId,
        questions: [],
        acceptanceCriteria: [],
      })).rejects.toMatchObject({ code: 'invalid_transition' })

      // T5: root cause recorded → implement entry carries machine evidence.
      await pipeline.enterImplementStage(changeId)
      await recordTouched(root, { changeId, file: REGRESSION_FILE })
      await completeTask(root, changeId, 'regression-test')
      await recordTouched(root, { changeId, file: FIX_FILE })
      await completeTask(root, changeId, 'fix-root-cause')
      await pipeline.driveImplementStage(changeId)

      const verify = await pipeline.driveVerifyStage(changeId)
      expect(verify.result.backToImplement).toBe(false)
      expect(verify.result.report.mode).toBe('bug-fast-path')
      const regressionRow = verify.result.report.checks.find(c => c.name === 'regression-test')
      expect(regressionRow?.required).toBe(true)
      expect(regressionRow?.ok).toBe(true)
      const specRow = verify.result.report.checks.find(c => c.name === 'openspec-validate')
      expect(specRow?.required).toBe(false)

      await pipeline.driveArchiveStage(changeId, true)
      status = await store.readStatus(changeId)
      expect(status.terminal).toBe('completed')
      const archived = await readFile(
        join(root, 'openspec', 'changes', 'archive', changeId, 'bug-record.md'),
        'utf8',
      )
      expect(archived).toContain('## Root cause')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('fast-path open warns but does not block without a git revision', async () => {
    const { root, pipeline, store, changeId } = await setupFastPath({ withGit: false })
    try {
      await pipeline.driveFastPathOpenStage(bugInput(changeId))
      const status = await store.readStatus(changeId)
      expect(status.nodes.open).toBe('completed')

      const bugRecord = await readFile(
        join(root, 'openspec', 'changes', changeId, 'bug-record.md'),
        'utf8',
      )
      expect(bugRecord.toLowerCase()).toContain('git revision unavailable')

      const { events } = await store.readEvents(changeId)
      expect(events.some(e => e.type === 'baseline-locked')).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('fast-path gates', () => {
  it('T5 refuses implement entry when the bug record lacks a root cause', async () => {
    const { root, pipeline, store, changeId } = await setupFastPath()
    try {
      await pipeline.driveFastPathOpenStage(bugInput(changeId))
      await writeFile(
        join(root, 'openspec', 'changes', changeId, 'bug-record.md'),
        '# Bug record\n\n## Problem\n\nParser crashes.\n',
        'utf8',
      )
      await expect(pipeline.enterImplementStage(changeId))
        .rejects.toMatchObject({ code: 'invalid_transition' })
      const status = await store.readStatus(changeId)
      expect(status.current).toBe('open')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses the full-go open drive on a fast-path change', async () => {
    const { root, pipeline, changeId } = await setupFastPath()
    try {
      await expect(pipeline.driveOpenStage(changeId, 'Fix parser crash'))
        .rejects.toMatchObject({ code: 'invalid_transition' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses fix-file writes before the regression test is done (regression-test-first)', async () => {
    const { root, pipeline, changeId } = await setupFastPath()
    try {
      await pipeline.driveFastPathOpenStage(bugInput(changeId))
      await pipeline.enterImplementStage(changeId)

      // Fix file is inside the allowlist but the regression task is not done.
      await expect(recordTouched(root, { changeId, file: FIX_FILE }))
        .rejects.toMatchObject({
          code: 'invalid_transition',
          details: { reasonCodes: ['regression_test_required'] },
        })

      // Completion gate also refuses when the regression test is not done.
      await recordTouched(root, { changeId, file: REGRESSION_FILE })
      await expect(pipeline.driveImplementStage(changeId))
        .rejects.toMatchObject({ code: 'invalid_transition' })

      // Satisfying test-first unblocks the rest of the chain.
      await completeTask(root, changeId, 'regression-test')
      await recordTouched(root, { changeId, file: FIX_FILE })
      await completeTask(root, changeId, 'fix-root-cause')
      await pipeline.driveImplementStage(changeId)
      const status = await pipeline.context().store.readStatus(changeId)
      expect(status.nodes.implement).toBe('completed')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('T15 escalation', () => {
  it('auto-escalates to full-go when touched files grow beyond the allowlist', async () => {
    const { root, pipeline, store, changeId } = await setupFastPath()
    try {
      await reachImplementInProgress(pipeline, root, changeId)

      // Simulate scope growth the per-write guard missed (hand-edited ledger).
      const ledgerPath = join(root, 'openspec', 'changes', changeId, ARTIFACT_FILES.planJson)
      const ledger = JSON.parse(await readFile(ledgerPath, 'utf8')) as { touched: string[] }
      ledger.touched.push('src/other-module.c')
      await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8')

      const drive = await pipeline.driveImplementStage(changeId)
      expect(drive.node).toBe('implement')
      expect(drive.result.escalated).toBeDefined()

      const status = await store.readStatus(changeId)
      expect(status.mode).toBe('full-go')
      expect(status.current).toBe('clarify')
      expect(status.openspecSkipped?.skipped).toBe(false)
      expect(status.nodes.implement).toBe('failed')
      expect(status.nodes.open).toBe('completed')

      const { events } = await store.readEvents(changeId)
      expect(events.some(e => e.type === 'mode-upgraded')).toBe(true)

      // Fast-path ledger preserved for audit; OpenSpec change backfilled.
      const preserved = await readFile(
        join(root, 'openspec', 'changes', changeId, 'fastpath-ledger.json'),
        'utf8',
      )
      expect(JSON.parse(preserved).fastPath).toBe(true)
      const proposal = await readFile(
        join(root, 'openspec', 'changes', changeId, ARTIFACT_FILES.proposal),
        'utf8',
      )
      expect(proposal).toContain('## Why')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses escalation outside fast-path implement', async () => {
    const { root, pipeline, store, changeId } = await setupFastPath()
    try {
      await pipeline.driveFastPathOpenStage(bugInput(changeId))
      await expect(pipeline.driveEscalateStage({ changeId, cause: 'premature' }))
        .rejects.toMatchObject({ code: 'invalid_transition' })
      const status = await store.readStatus(changeId)
      expect(status.current).toBe('open')
      expect(status.mode).toBe('bug-fast-path')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('backfills clarify → design → plan → implement → verify → archive after escalation', async () => {
    const { root, pipeline, store, changeId } = await setupFastPath()
    try {
      await reachImplementInProgress(pipeline, root, changeId)

      // Explicit semantic escalation entry (public-API impact discovered).
      const escalated = await pipeline.driveEscalateStage({
        changeId,
        cause: 'public-api impact discovered during fix',
      })
      expect(escalated.node).toBe('escalate')

      await pipeline.driveClarifyStage({
        changeId,
        questions: [{
          question: 'Does the empty-input contract change?',
          answer: 'No — only the crash (maintainer, 2026-09-12)',
          status: 'decided',
        }],
        acceptanceCriteria: ['ctest -R parser_empty passes'],
      })
      await pipeline.driveDesignStage({
        changeId,
        approach: 'Guard the token loop with a length check before iteration.',
        references: [await touchReference(root, FIX_FILE)],
        risks: ['None; local change'],
      })
      await pipeline.drivePlanStage({
        changeId,
        tasks: [{
          id: 't1',
          title: 'Guard token loop and cover regression',
          files: [FIX_FILE, REGRESSION_FILE],
          verify: ['ctest -R parser_empty'],
          rollback: 'git revert HEAD',
        }],
        allowlist: [FIX_FILE, REGRESSION_FILE],
      })
      await writeFile(
        join(root, 'openspec', 'changes', changeId, ARTIFACT_FILES.tasks),
        '# Tasks\n\n- [x] t1 Guard token loop and cover regression\n',
        'utf8',
      )

      await pipeline.enterImplementStage(changeId)
      await recordTouched(root, { changeId, file: FIX_FILE })
      await recordTouched(root, { changeId, file: REGRESSION_FILE })
      await completeTask(root, changeId, 't1')
      await pipeline.driveImplementStage(changeId)

      const verify = await pipeline.driveVerifyStage(changeId)
      expect(verify.result.backToImplement).toBe(false)
      expect(verify.result.report.mode).toBe('full-go')

      await pipeline.driveArchiveStage(changeId, true)
      const status = await store.readStatus(changeId)
      expect(status.terminal).toBe('completed')
      // Completed fast-path stages survive the upgrade.
      expect(status.nodes.open).toBe('completed')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
