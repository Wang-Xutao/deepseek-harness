/**
 * §18.4.3 dual-lane derivation and §18.5 gate detection on the Tab payload.
 *
 * The lane split is the piece most likely to rot silently: it reconstructs two
 * paths out of one event log, so a wrong fold shows the customer a picture that
 * never happened. Both halves are pinned here — the pure fold against synthetic
 * logs, and the whole thing against a real T15 escalation drive.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  gateToTabView,
  loadBaselineFile,
  type ProjectionEvent,
  type WorkflowStatus,
} from '@deepseek-ai/dsh-baf-core'
import { BUG_RECORD_FILE } from '../src/stages/fastpath.ts'
import { confirmIntake, createWorkflowService } from '../src/workflow-service.ts'
import { ProjectionStore } from '../src/projection.ts'
import { StagePipeline } from '../src/stages/pipeline.ts'
import { buildWorkflowTabView } from '../src/tab-view.ts'
import { deriveLanes } from '../src/lanes.ts'

const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

/** Event payload without the envelope `log` stamps on. */
type EventBody = ProjectionEvent extends infer T
  ? T extends ProjectionEvent ? Omit<T, 'eventId' | 'seq' | 'at'> : never
  : never

/** Build a synthetic projection log with sequential seq/at. */
function log(...events: readonly EventBody[]): ProjectionEvent[] {
  return events.map((event, index) => ({
    ...event,
    eventId: `e${index}`,
    seq: index + 1,
    at: `2026-09-17T00:00:${String(index).padStart(2, '0')}.000Z`,
  }))
}

describe('deriveLanes', () => {
  it('returns undefined for a change that never upgraded', () => {
    const lanes = deriveLanes(log(
      { type: 'intake-confirmed', by: 'user' },
      { type: 'stage-entered', node: 'open' },
      { type: 'stage-completed', node: 'open', artifacts: ['bug-record.md'] },
      { type: 'stage-entered', node: 'implement' },
    ))
    expect(lanes).toBeUndefined()
  })

  it('splits at the upgrade and reads the edge off the log, not from a constant', () => {
    const lanes = deriveLanes(log(
      { type: 'intake-confirmed', by: 'user' },
      { type: 'stage-entered', node: 'open' },
      { type: 'stage-completed', node: 'open', artifacts: ['bug-record.md'] },
      { type: 'stage-entered', node: 'implement' },
      { type: 'stage-failed', node: 'implement', reason: 'escalated: scope grew' },
      { type: 'mode-upgraded', from: 'bug-fast-path', to: 'full-go', cause: 'scope grew' },
      { type: 'stage-entered', node: 'clarify' },
      { type: 'stage-completed', node: 'clarify', artifacts: ['clarify.md'] },
    ))

    expect(lanes).toBeDefined()
    const [fastPath, fullGo] = lanes?.lanes ?? []
    expect(fastPath?.id).toBe('bug-fast-path')
    expect(fullGo?.id).toBe('full-go')

    // The pre-upgrade lane stops where the escalation interrupted it...
    expect(fastPath?.status.implement).toBe('failed')
    expect(fastPath?.status.clarify).toBeUndefined()
    // ...and the full-go lane has no trace of the abandoned implement.
    expect(fullGo?.status.clarify).toBe('completed')
    expect(fullGo?.status.implement).toBeUndefined()

    expect(lanes?.upgrade).toMatchObject({
      from: 'implement',
      to: 'clarify',
      cause: 'scope grew',
      at: '2026-09-17T00:00:05.000Z',
    })

    // §18.4.3 「升级前 fast-path 的产物不删」 — the bug record survives the split.
    expect(lanes?.preservedArtifacts).toEqual(['bug-record.md'])
  })

  it('keeps the upgrade edge on screen for a degenerate log', () => {
    const lanes = deriveLanes(log(
      { type: 'mode-upgraded', from: 'bug-fast-path', to: 'full-go', cause: 'no stages yet' },
    ))
    // Nothing was entered on either side; the edge still has to point somewhere
    // legible rather than collapsing the whole lane view.
    expect(lanes?.upgrade).toMatchObject({ from: 'clarify', to: 'clarify' })
    expect(lanes?.preservedArtifacts).toEqual([])
  })

  it('leaves the first lane empty when nothing was entered before the split', () => {
    const lanes = deriveLanes(log(
      { type: 'mode-upgraded', from: 'bug-fast-path', to: 'full-go', cause: 'early' },
      { type: 'stage-entered', node: 'clarify' },
    ))
    expect(lanes?.lanes[0]?.status).toEqual({})
    expect(lanes?.lanes[1]?.status.clarify).toBe('in-progress')
  })
})

describe('Tab payload for an escalated change', () => {
  it('carries both lanes after a real T15 escalation, and no gate while clear', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-lanes-'))
    try {
      const store = new ProjectionStore({ workspaceRoot: root })
      const baseline = await loadBaselineFile(FIXTURE_BASELINE)
      const pipeline = new StagePipeline({ store, workspaceRoot: root, gitRevision: 'rev-l1', baseline })
      const service = createWorkflowService({ store })
      const { intake } = await service.intake({
        description: 'fix: parser crash when input file is empty (bug fix)',
        workspace: { root },
        affectedScopeHint: 'single-file',
        baseline,
      })
      await confirmIntake(store, intake.changeId, 'user')
      await pipeline.driveFastPathOpenStage({
        changeId: intake.changeId,
        title: 'Fix parser crash on empty input',
        problem: 'Parser dereferences a null token when the input file is empty.',
        rootCause: 'Missing length guard before the token loop in parse().',
        affectedFiles: ['src/parser.c'],
        regressionTest: { file: 'tests/test_parser_empty.c', command: 'ctest -R parser_empty' },
      })
      await pipeline.enterImplementStage(intake.changeId)
      const escalated = await pipeline.driveEscalateStage({
        changeId: intake.changeId,
        cause: 'public-API impact discovered',
      })
      expect(escalated.node).toBe('escalate')

      const view = await buildWorkflowTabView(store, intake.changeId)
      expect(view.lanes).toBeDefined()
      expect(view.lanes?.upgrade).toMatchObject({
        from: 'implement',
        to: 'clarify',
        cause: 'public-API impact discovered',
      })
      // The bug record written by the fast-path open survives the escalation;
      // `stage-completed` records absolute paths, so compare basenames.
      const preserved = (view.lanes?.preservedArtifacts ?? []).map(p => basename(p))
      expect(preserved).toContain(BUG_RECORD_FILE)
      // Parked on an interrupted implement, not on a gate: no confirm button.
      expect(view.gate).toBeUndefined()
      expect(view.actions.some(a => a.id === 'confirm-gate')).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('gate exposure', () => {
  /** Minimal status carrying just the fields the gate predicate reads. */
  function statusAt(
    current: WorkflowStatus['current'],
    nodes: WorkflowStatus['nodes'],
  ): WorkflowStatus {
    return { changeId: 'c1', mode: 'full-go', current, nodes } as unknown as WorkflowStatus
  }

  it('opens gate A only once design completed, and stays silent otherwise', () => {
    expect(gateToTabView(statusAt('design', { design: 'completed' }))?.id).toBe('design-to-plan')
    expect(gateToTabView(statusAt('design', { design: 'in-progress' }))).toBeUndefined()
    // Completed design but a `current` that already moved on is not a gate.
    expect(gateToTabView(statusAt('plan', { design: 'completed' }))).toBeUndefined()
  })

  it('opens gate B only once verify completed', () => {
    expect(gateToTabView(statusAt('verify', { verify: 'completed' }))?.id).toBe('verify-to-archive')
    expect(gateToTabView(statusAt('verify', { verify: 'failed' }))).toBeUndefined()
  })

  it('points each gate at its own node and button label', () => {
    expect(gateToTabView(statusAt('design', { design: 'completed' }))).toMatchObject({
      node: 'design',
      actionKey: 'gate.confirmIntoPlan',
    })
    expect(gateToTabView(statusAt('verify', { verify: 'completed' }))).toMatchObject({
      node: 'verify',
      actionKey: 'gate.confirmArchive',
    })
  })
})

describe('resume exposure', () => {
  it('consults the resume provider only while the change is parked in drift', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-resume-provider-'))
    try {
      const store = new ProjectionStore({ workspaceRoot: root })
      const baseline = await loadBaselineFile(FIXTURE_BASELINE)
      const pipeline = new StagePipeline({ store, workspaceRoot: root, gitRevision: 'rev-r1', baseline })
      const service = createWorkflowService({ store })
      const { intake } = await service.intake({
        description: 'fix: parser crash when input file is empty (bug fix)',
        workspace: { root },
        affectedScopeHint: 'single-file',
        baseline,
      })
      await confirmIntake(store, intake.changeId, 'user')

      let calls = 0
      const resume = async () => {
        calls += 1
        return { anchor: 'open' as const, candidates: ['open' as const] }
      }

      // intake is not drift → the provider must not run (it probes Git).
      const before = await buildWorkflowTabView(store, intake.changeId, { resume })
      expect(before.resume).toBeUndefined()
      expect(calls).toBe(0)

      await pipeline.driveFastPathOpenStage({
        changeId: intake.changeId,
        title: 'Fix parser crash on empty input',
        problem: 'Parser dereferences a null token when the input file is empty.',
        rootCause: 'Missing length guard before the token loop in parse().',
        affectedFiles: ['src/parser.c'],
        regressionTest: { file: 'tests/test_parser_empty.c', command: 'ctest -R parser_empty' },
      })
      await pipeline.driveDriftStage(intake.changeId, { gitRevision: 'rev-r2' })

      const after = await buildWorkflowTabView(store, intake.changeId, { resume })
      expect(after.current).toBe('drift')
      expect(calls).toBe(1)
      expect(after.resume).toEqual({ anchor: 'open', candidates: ['open'] })
      expect(after.actions.find(a => a.id === 'resume')?.enabled).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
