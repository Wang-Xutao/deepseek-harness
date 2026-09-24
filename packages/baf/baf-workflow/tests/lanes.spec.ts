/**
 * §18.4.3 dual-lane derivation and §18.5 gate detection on the Tab payload.
 *
 * The lane split is the piece most likely to rot silently: it reconstructs two
 * paths out of one event log, so a wrong fold shows the customer a picture that
 * never happened. Both halves are pinned here — the pure fold against synthetic
 * logs, and the whole thing against a real T15 escalation drive.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
import { BUG_RECORD_FILE } from '../src/stages/bug-fix-path.ts'
import { confirmIntake, createWorkflowService, rejectIntake } from '../src/workflow-service.ts'
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
      { type: 'mode-upgraded', from: 'bug-fix-path', to: 'full-go-path', cause: 'scope grew' },
      { type: 'stage-entered', node: 'clarify' },
      { type: 'stage-completed', node: 'clarify', artifacts: ['clarify.md'] },
    ))

    expect(lanes).toBeDefined()
    const [bugFixPath, fullGoPath] = lanes?.lanes ?? []
    expect(bugFixPath?.id).toBe('bug-fix-path')
    expect(fullGoPath?.id).toBe('full-go-path')

    // The pre-upgrade lane stops where the escalation interrupted it...
    expect(bugFixPath?.status.implement).toBe('failed')
    expect(bugFixPath?.status.clarify).toBeUndefined()
    // ...and the full-go-path lane has no trace of the abandoned implement.
    expect(fullGoPath?.status.clarify).toBe('completed')
    expect(fullGoPath?.status.implement).toBeUndefined()

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
      { type: 'mode-upgraded', from: 'bug-fix-path', to: 'full-go-path', cause: 'no stages yet' },
    ))
    // Nothing was entered on either side; the edge still has to point somewhere
    // legible rather than collapsing the whole lane view.
    expect(lanes?.upgrade).toMatchObject({ from: 'clarify', to: 'clarify' })
    expect(lanes?.preservedArtifacts).toEqual([])
  })

  it('leaves the first lane empty when nothing was entered before the split', () => {
    const lanes = deriveLanes(log(
      { type: 'mode-upgraded', from: 'bug-fix-path', to: 'full-go-path', cause: 'early' },
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
      await pipeline.driveBugFixPathOpenStage({
        changeId: intake.changeId,
        title: 'Fix parser crash on empty input',
        problem: 'Parser dereferences a null token when the input file is empty.',
        rootCause: 'Missing length guard before the token loop in parse().',
        affectedFiles: ['src/parser.c'],
        regressionTest: { file: 'tests/test_parser_empty.c', command: 'ctest -R parser_empty' },
      }, 'slash')
      await pipeline.enterImplementStage(intake.changeId, 'slash')
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
    return { changeId: 'c1', mode: 'full-go-path', current, nodes } as unknown as WorkflowStatus
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

      await pipeline.driveBugFixPathOpenStage({
        changeId: intake.changeId,
        title: 'Fix parser crash on empty input',
        problem: 'Parser dereferences a null token when the input file is empty.',
        rootCause: 'Missing length guard before the token loop in parse().',
        affectedFiles: ['src/parser.c'],
        regressionTest: { file: 'tests/test_parser_empty.c', command: 'ctest -R parser_empty' },
      }, 'slash')
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

describe('artifact exposure (2026-09-21 session 5.jsonl)', () => {
  it('carries one row per stage artifact with its live state, and flips on authoring', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-tab-artifacts-'))
    try {
      const store = new ProjectionStore({ workspaceRoot: root })
      const baseline = await loadBaselineFile(FIXTURE_BASELINE)
      const pipeline = new StagePipeline({ store, workspaceRoot: root, gitRevision: 'rev-a1', baseline })
      const service = createWorkflowService({ store })
      const { intake } = await service.intake({
        description: 'feat: add export public API for reports',
        workspace: { root },
        affectedScopeHint: 'public-api',
        baseline,
      })
      await confirmIntake(store, intake.changeId, 'user')
      await pipeline.driveOpenStage(intake.changeId, 'Add export API', 'slash')
      await pipeline.beginDocStage(intake.changeId, 'clarify', 'slash')

      const view = await buildWorkflowTabView(store, intake.changeId)
      // Seven rows in stage order — the rail's open buttons key off these paths.
      // 【变更】2026-09-23 (demo5 issue #3): verify.md replaces verify-report.json
      // as the verify stage's rail row (the JSON stays on disk for machine
      // consumers; the rail shows the human document).
      expect(view.artifacts?.map(r => r.file)).toEqual([
        'proposal.md', 'clarify.md', 'design.md', 'plan.md', 'plan.json', 'tasks.md', 'verify.md',
      ])
      const byFile = new Map((view.artifacts ?? []).map(r => [r.file, r]))
      // 【变更】2026-09-22 (user report #2): every artifact now reads
      // 「尚未生成」until its own stage begins — open() installs only
      // proposal.md, beginDocStage installs the rest (clarify here; the plan
      // entry also installs plan.md/plan.json/tasks.md).
      expect(byFile.get('proposal.md')?.state).toBe('template')
      expect(byFile.get('clarify.md')?.state).toBe('template')
      expect(byFile.get('clarify.md')?.path).toBe(`openspec/changes/${intake.changeId}/clarify.md`)
      expect(byFile.get('design.md')?.state).toBe('missing')
      expect(byFile.get('design.md')?.missing).toEqual([])
      expect(byFile.get('tasks.md')?.state).toBe('missing')
      expect(byFile.get('plan.json')?.state).toBe('missing')
      expect(byFile.get('verify.md')?.state).toBe('missing')

      // Authoring the real content flips the row to filled — the rail reads
      // disk through the same changeArtifactStatus /baf-status uses.
      await writeFile(
        join(root, 'openspec', 'changes', intake.changeId, 'clarify.md'),
        [
          '# Clarify',
          '',
          '## Blocking questions',
          '',
          '- None outstanding; format settled with the customer.',
          '',
          '## Acceptance criteria',
          '',
          '- npm test exports CSV with a header row',
          '',
        ].join('\n'),
        'utf8',
      )
      const after = await buildWorkflowTabView(store, intake.changeId)
      const afterByFile = new Map((after.artifacts ?? []).map(r => [r.file, r]))
      expect(afterByFile.get('clarify.md')?.state).toBe('filled')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('omits artifacts on the empty workspace view', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-tab-empty-'))
    try {
      const store = new ProjectionStore({ workspaceRoot: root })
      const view = await buildWorkflowTabView(store, null)
      expect(view.empty).toBe(true)
      expect(view.artifacts).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('§22.19 fallback selection (session 7.jsonl R5)', () => {
  /**
   * The old Tab fallback was lexical-last over EVERY change, terminal
   * included — a workspace holding one abandoned change beside a running
   * one rendered the abandoned dead view (no buttons, no way forward). The
   * §22.19 fallback picks the active change by the shared ranking, and
   * only shows a terminal change when nothing active remains.
   */
  it('prefers the active change over a terminal one regardless of change ids', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-tab-fallback-'))
    try {
      const store = new ProjectionStore({ workspaceRoot: root })
      const service = createWorkflowService({ store })
      const { intake: doomed } = await service.intake({
        description: 'first requirement that gets abandoned',
        workspace: { root },
      })
      await rejectIntake(store, doomed.changeId)
      const { intake: live } = await service.intake({
        description: 'second requirement that stays active at intake',
        workspace: { root },
      })
      const view = await buildWorkflowTabView(store, null)
      expect(view.selectedChangeId).toBe(live.changeId)
      expect(view.current).toBe('intake')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('with only terminal changes left, shows the most recent one without crashing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-tab-terminal-'))
    try {
      const store = new ProjectionStore({ workspaceRoot: root })
      const service = createWorkflowService({ store })
      const { intake: doomed } = await service.intake({
        description: 'the only change, and it is abandoned',
        workspace: { root },
      })
      await rejectIntake(store, doomed.changeId)
      const view = await buildWorkflowTabView(store, null)
      expect(view.empty).toBe(false)
      expect(view.selectedChangeId).toBe(doomed.changeId)
      expect(view.current).toBe('abandoned')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('Tab advance readiness (2026-09-22 user report #4 — 推进按钮管控)', () => {
  /** Mint a full-go-path change resting at open with template artifacts. */
  async function setupAtOpen(): Promise<{ root: string; store: ProjectionStore; changeId: string }> {
    const root = await mkdtemp(join(tmpdir(), 'baf-adv-'))
    const store = new ProjectionStore({ workspaceRoot: root })
    const baseline = await loadBaselineFile(FIXTURE_BASELINE)
    const pipeline = new StagePipeline({ store, workspaceRoot: root, gitRevision: 'rev-a1', baseline })
    const service = createWorkflowService({ store })
    const { intake } = await service.intake({
      description: 'feat: add export public API for reports',
      workspace: { root },
      affectedScopeHint: 'public-api',
      baseline,
    })
    await confirmIntake(store, intake.changeId, 'user')
    await pipeline.driveOpenStage(intake.changeId, 'Add report export API', 'slash')
    return { root, store, changeId: intake.changeId }
  }

  it('open is not advance-ready while proposal.md is the template; ready once authored', async () => {
    const { root, store, changeId } = await setupAtOpen()
    try {
      const before = await buildWorkflowTabView(store, changeId)
      expect(before.current).toBe('open')
      expect(before.advance).toBeDefined()
      expect(before.advance?.ready).toBe(false)
      expect(before.advance?.missing.join('\n')).toContain('Why')

      const proposalPath = join(root, 'openspec', 'changes', changeId, 'proposal.md')
      await writeFile(proposalPath, [
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
      ].join('\n'), 'utf8')
      const after = await buildWorkflowTabView(store, changeId)
      expect(after.advance).toMatchObject({ ready: true, missing: [] })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('per-stage durations ride the same payload (user report #2)', async () => {
    const { root, store, changeId } = await setupAtOpen()
    try {
      const view = await buildWorkflowTabView(store, changeId)
      // The metrics fold must be part of the default payload (getTabView used
      // to pass includeMetrics:false, so durations never rendered anywhere).
      // The open span can complete within one ms, so assert presence, not size.
      const openNode = view.nodes.find(n => n.id === 'open')
      expect(openNode?.metrics).toBeDefined()
      expect(openNode?.metrics?.durationMs).toBeGreaterThanOrEqual(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
