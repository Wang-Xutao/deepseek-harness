/**
 * Phase 8.9 `/baf-workflow-resume`: the T13 drift exit (§19) and the
 * single-writer invariant for `drift-detected` (§21.5).
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadBaselineFile, type ProjectionEvent } from '@deepseek-ai/dsh-baf-core'
import { confirmIntake, createWorkflowService } from '../src/workflow-service.ts'
import { ProjectionStore } from '../src/projection.ts'
import { StagePipeline } from '../src/stages/pipeline.ts'
import { resumeCandidates } from '../src/stages/drift.ts'
import { driveResume } from '../src/command-drives.ts'

const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

/** Create a temp workspace with a store, pipeline, and a confirmed change. */
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'baf-resume-'))
  const store = new ProjectionStore({ workspaceRoot: root })
  const baseline = await loadBaselineFile(FIXTURE_BASELINE)
  const pipeline = new StagePipeline({ store, workspaceRoot: root, gitRevision: 'rev-1', baseline })
  const service = createWorkflowService({ store })
  const { intake } = await service.intake({
    description: 'feat: add export public API for reports',
    workspace: { root },
    affectedScopeHint: 'public-api',
  })
  await confirmIntake(store, intake.changeId, 'user')
  return { root, store, pipeline, service, changeId: intake.changeId, baseline }
}

/** Create an existing workspace-relative file for design citations. */
async function touchReference(root: string, rel: string): Promise<string> {
  const path = join(root, rel)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, 'export {}\n', 'utf8')
  return rel
}

/** Advance a change to `design` in-progress, the anchor for most cases here. */
async function driveToDesign(root: string, pipeline: StagePipeline, changeId: string): Promise<void> {
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
}

describe('resume candidates (§19.2)', () => {
  it('anchors at the node that was active when drift was recorded, latest-first', async () => {
    const { root, pipeline, changeId } = await setup()
    try {
      await driveToDesign(root, pipeline, changeId)
      const drift = await pipeline.driveDriftStage(changeId, { gitRevision: 'rev-2' })
      if (drift.node !== 'drift') throw new Error('expected a drift drive')
      expect(drift.result.recorded).toBe(true)
      // A partial override must not be read as "the baseline vanished".
      expect(drift.result.signals.map(s => s.trigger)).toEqual(['git-revision-changed'])

      // A drifted status parks `current` at `drift`, yet the anchor is
      // recovered from the node the detector marked.
      expect(drift.status.current).toBe('drift')
      const options = await pipeline.resumeOptions(changeId)
      expect(options.anchor).toBe('design')
      expect(options.candidates).toEqual(['design', 'clarify'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('always includes the anchor and never the entry stages', async () => {
    const { root, pipeline, changeId } = await setup()
    try {
      await pipeline.driveOpenStage(changeId, 'Add report export API', 'slash')
      const drift = await pipeline.driveDriftStage(changeId, { gitRevision: 'rev-2' })
      if (drift.node !== 'drift') throw new Error('expected a drift drive')
      // Open-time drift: only `open` is upstream and it is not re-runnable.
      expect(resumeCandidates(drift.status, drift.result.signals)).toEqual(['open'])
      // §22.16 P3: anchor pin — candidates[0] === anchor so the dynamic
      // resume gate can render the default target identically to the
      // registry-driven gates.
      const options = await pipeline.resumeOptions(changeId)
      expect(options.candidates[0]).toBe(options.anchor)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('driveResumeStage (§19.3)', () => {
  it('re-enters a candidate, clears the drift park, and records the cause', async () => {
    const { root, store, pipeline, service, changeId } = await setup()
    try {
      await driveToDesign(root, pipeline, changeId)
      await pipeline.driveDriftStage(changeId, { gitRevision: 'rev-2' })

      const resumed = await pipeline.driveResumeStage(changeId, 'clarify', undefined, 'slash')
      if (resumed.node !== 'resume') throw new Error('expected a resume drive')
      expect(resumed.result.anchor).toBe('design')
      expect(resumed.result.target).toBe('clarify')

      const status = await store.readStatus(changeId)
      expect(status.current).toBe('clarify')
      expect(status.nodes.clarify).toBe('in-progress')
      expect(status.nodes.drift).toBeUndefined()

      const events = await store.readEvents(changeId)
      const entered = events.events.filter(
        (e): e is Extract<ProjectionEvent, { type: 'stage-entered' }> =>
          e.type === 'stage-entered' && e.node === 'clarify' && e.cause !== undefined,
      )
      expect(entered.length).toBe(1)
      expect(entered[0]?.cause).toContain('drift-resume')

      // §19.3: the parked pseudo-node is the single "still drifted" test.
      const report = await service.resume({ changeId, workspace: { root } })
      expect(report.drifted).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses a target past the anchor without touching the projection', async () => {
    const { root, store, pipeline, changeId } = await setup()
    try {
      await driveToDesign(root, pipeline, changeId)
      await pipeline.driveDriftStage(changeId, { gitRevision: 'rev-2' })
      const before = await store.readStatus(changeId)

      await expect(pipeline.driveResumeStage(changeId, 'plan', undefined, 'slash'))
        .rejects.toMatchObject({ code: 'invalid_transition' })

      const after = await store.readStatus(changeId)
      expect(after.current).toBe('drift')
      expect(after.projectionVersion).toBe(before.projectionVersion + 1)
      const events = await store.readEvents(changeId)
      expect(events.events.at(-1)).toMatchObject({
        type: 'transition-rejected',
        from: 'drift',
        to: 'plan',
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses a change that is not parked in drift', async () => {
    const { root, pipeline, changeId } = await setup()
    try {
      await driveToDesign(root, pipeline, changeId)
      await expect(pipeline.driveResumeStage(changeId, 'design', undefined, 'slash'))
        .rejects.toMatchObject({ code: 'invalid_transition' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('drift-detected has one writer (§21.5)', () => {
  it('refuses a caller-initiated transition to drift', async () => {
    const { root, service, changeId } = await setup()
    try {
      await expect(service.transition({ changeId, from: 'intake', to: 'drift' }))
        .rejects.toMatchObject({ code: 'invalid_transition' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('still accepts abandon from a drifted change (T16 keeps its evidence gate)', async () => {
    const { root, pipeline, service, changeId } = await setup()
    try {
      await driveToDesign(root, pipeline, changeId)
      await pipeline.driveDriftStage(changeId, { gitRevision: 'rev-2' })
      // §22.15 B: T16 now refuses without a human-originated source. The
      // evidence still requires `humanConfirmed`, but the upstream guard
      // surfaces first.
      await expect(service.transition({ changeId, from: 'drift', to: 'abandoned' }))
        .rejects.toMatchObject({ code: 'gate_confirmation_required' })
      const abandoned = await service.transition({
        changeId,
        from: 'drift',
        to: 'abandoned',
        evidence: { humanConfirmed: true, source: 'slash' },
      })
      expect(abandoned.accepted).toBe(true)
      expect(abandoned.status.terminal).toBe('abandoned')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('driveResume card (§19.3 / §19.6)', () => {
  it('renders the candidate card with no argument and never picks a node', async () => {
    const { root, pipeline, changeId } = await setup()
    try {
      await driveToDesign(root, pipeline, changeId)
      await pipeline.driveDriftStage(changeId, { gitRevision: 'rev-2' })

      const card = await driveResume(root, '')
      expect(card.kind).toBe('error')
      expect(card.text).toContain('请选择复位目标')
      expect(card.text).toContain('/baf-workflow-resume design')
      expect(card.text).toContain('/baf-workflow-resume clarify')
      // The drive's probe cannot see the temp workspace's git/baseline facts
      // (no repo, no `.baf/baseline.yml`), so the card must fall back to the
      // *recorded* cause rather than inventing an "unavailable" signal.
      expect(card.text).toContain('Git HEAD moved from rev-1 to rev-2')
      // Read-only: the candidate card must not move the projection.
      const status = await pipeline.context().store.readStatus(changeId)
      expect(status.current).toBe('drift')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses a target outside the candidate set', async () => {
    const { root, pipeline, changeId } = await setup()
    try {
      await driveToDesign(root, pipeline, changeId)
      await pipeline.driveDriftStage(changeId, { gitRevision: 'rev-2' })
      const card = await driveResume(root, 'implement')
      expect(card.kind).toBe('error')
      expect(card.text).toContain('不在候选集内')
      const status = await pipeline.context().store.readStatus(changeId)
      expect(status.current).toBe('drift')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('resumes into a chosen node and reports the re-run chain', async () => {
    const { root, pipeline, changeId } = await setup()
    try {
      await driveToDesign(root, pipeline, changeId)
      await pipeline.driveDriftStage(changeId, { gitRevision: 'rev-2' })
      const card = await driveResume(root, 'clarify')
      expect(card.kind).toBe('success')
      expect(card.text).toContain('已复位到 clarify')
      expect(card.text).toContain('design → clarify')
      expect(card.text).toContain('clarify → design → plan → implement → verify')

      // Second call is idempotent: clarify is now the current node.
      const again = await driveResume(root, 'clarify')
      expect(again.kind).toBe('success')
      expect(again.text).toContain('已在 clarify')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reports no drift on a healthy change', async () => {
    const { root, pipeline, changeId } = await setup()
    try {
      await driveToDesign(root, pipeline, changeId)
      const card = await driveResume(root, '')
      expect(card.kind).toBe('success')
      expect(card.text).toContain('当前无漂移，无需复位')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('awaiting-confirm replay (R24)', () => {
  it('replays as an audit-only event without moving status', async () => {
    const { root, store } = await setup()
    try {
      const changeId = 'audit-only-gate'
      await store.append(changeId, 0, meta => ({
        type: 'intake-classified',
        intake: {
          changeId,
          kind: 'feature',
          mode: 'full-go',
          scope: [],
          confidence: 'high',
          openspec: true,
          reasonCodes: [],
          requiresUserConfirmation: true,
          confirmation: 'confirmed',
        },
        ...meta,
      }))
      const { status: parked } = await store.append(changeId, 1, meta => ({
        type: 'awaiting-confirm',
        gate: 'design-to-plan',
        ...meta,
      }))
      // The gate is derived from node status, so the event must not move
      // `current` — and it must not replay as `projection_corrupted`.
      expect(parked.current).toBe('intake')
      expect(await store.readStatus(changeId)).toMatchObject({ current: 'intake' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
