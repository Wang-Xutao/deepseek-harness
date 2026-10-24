// @vitest-environment jsdom
/**
 * 【变更】2026-10-23 (批次十八 2.2/2.3): the 工作流 page's 变更总览 row — the
 * project's change ledger. The abandoned changes are RECORDED rows (a state
 * pill of their own), not a missing entry; the page states the project it
 * read and explains its empty / no-workspace states.
 * 【变更】2026-10-24 (批次十九 1.3): the ledger became the ONE home of the
 * change overview — clicking a change card opens the detail modal with the
 * stage flow and the change's full event history.
 * 【变更】2026-10-24 (批次二十 1/3): the ledger's console redesign + the
 * detail view's FOUR-ZONE workspace (顶部 strip / 左侧 rail / 中间工作流图 /
 * 右侧 rail). The middle zone is the session tab's own flow canvas — the same
 * component, so the change reads exactly as it reads in the conversation.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'

afterEach(cleanup)
import { ChangeOverviewRow } from '../src/client/ChangeOverviewRow.tsx'
import type {
  BafWorkflowChangeDetailResult, BafWorkflowChangeOverviewResult,
} from '../src/client/tab-types.ts'

function t(key: string): string {
  return key
}

/** One active, one completed, and one ABANDONED change — the ledger's three states. */
function readyFixture(): BafWorkflowChangeOverviewResult {
  return {
    status: 'ready',
    cwd: '/work/demo-project',
    rows: [
      {
        changeId: 'change-active',
        mode: 'full-go-path',
        current: 'implement',
        tasks: { done: 2, total: 4 },
        durationMs: 12_000,
        inputTokens: 1200,
        outputTokens: 800,
      },
      {
        changeId: 'change-done',
        mode: 'full-go-path',
        current: 'completed',
        endedAt: '2026-10-23T09:30:00.000Z',
        durationMs: 60_000,
      },
      {
        changeId: 'change-dropped',
        mode: 'bug-fix-path',
        current: 'abandoned',
        endedAt: '2026-10-23T08:00:00.000Z',
        artifacts: [{ file: 'proposal.md', path: 'openspec/changes/change-dropped/proposal.md', state: 'filled' }],
      },
    ],
    summary: {
      active: 1,
      archived: 1,
      abandoned: 1,
      tasksDone: 2,
      tasksTotal: 4,
    },
  }
}

/**
 * 【变更】2026-10-24 (批次二十 3): one change's detail — the COMPLETE graph
 * (two on-path stages and the edge between them), the intake, the artifacts
 * and the event history.
 */
function detailFixture(changeId: string): BafWorkflowChangeDetailResult {
  return {
    status: 'ready',
    cwd: '/work/demo-project',
    changeId,
    view: {
      empty: false,
      changeId,
      mode: 'full-go-path',
      current: 'implement',
      intake: {
        changeId,
        kind: 'feature',
        mode: 'full-go-path',
        affectedScope: 'src/app.ts',
        confidence: 0.82,
        reasonCodes: ['scope-narrow'],
        openspecRequired: true,
        requiresUserConfirmation: false,
        confirmation: '',
        summary: 'touches the app entry',
      },
      nodes: [
        {
          id: 'intake',
          status: 'completed',
          catalog: {
            id: 'intake', titleKey: 'node.intake', purpose: 'p', prerequisites: [], actions: ['classify'],
            artifacts: [], completion: [], failure: [], entries: [],
          },
          onPath: true,
          transitionsIn: [],
          transitionsOut: [],
        },
        {
          id: 'implement',
          status: 'in-progress',
          catalog: {
            id: 'implement', titleKey: 'node.implement', purpose: 'p', prerequisites: [], actions: ['code'],
            artifacts: [], completion: [], failure: [], entries: [],
          },
          onPath: true,
          transitionsIn: [],
          transitionsOut: [],
        },
      ],
      graph: {
        mode: 'full-go-path',
        nodes: [
          { id: 'intake', column: 0, row: 0, onPath: true },
          { id: 'implement', column: 1, row: 0, onPath: true },
        ],
        edges: [
          { id: 'edge-1', from: 'intake', to: 'implement', kind: 'forward', condition: 'ok' },
        ],
      },
      projectionVersion: 7,
      startedAt: '2026-10-23T08:00:00.000Z',
      metrics: { totalDurationMs: 60_000, totalInputTokens: 1200, totalOutputTokens: 800 },
      artifacts: [{ file: 'proposal.md', path: 'openspec/changes/x/proposal.md', state: 'filled', missing: [] }],
      changes: [],
      selectedChangeId: changeId,
      actions: [],
    },
    history: [
      { at: '2026-10-23T08:00:00.000Z', type: 'intake-classified' },
      { at: '2026-10-23T08:30:00.000Z', type: 'stage-entered', node: 'implement' },
      { at: '2026-10-23T09:30:00.000Z', type: 'stage-completed', node: 'implement', detail: 'plan.md' },
    ],
  }
}

function mount(
  loadChangeOverview: () => Promise<BafWorkflowChangeOverviewResult>,
  loadChangeDetail: (changeId: string) => Promise<BafWorkflowChangeDetailResult> =
    async changeId => detailFixture(changeId),
  openArtifact?: (cwd: string, path: string) => boolean,
) {
  return render(
    <ChangeOverviewRow
      t={t as never}
      loadChangeOverview={loadChangeOverview}
      loadChangeDetail={loadChangeDetail}
      {...(openArtifact === undefined ? {} : { openArtifact })}
    />,
  )
}

describe('ChangeOverviewRow (批次十八 2.2/2.3 变更总览 tab)', () => {
  it('lists every change of the project, the abandoned one included', async () => {
    const load = vi.fn().mockResolvedValue(readyFixture())
    mount(load)

    expect(await screen.findByTestId('change-overview-row-change-active')).toBeDefined()
    expect(screen.getByTestId('change-overview-row-change-done')).toBeDefined()
    // 【变更】2026-10-23 (批次十八 2.2): an abandoned change is a recorded row
    // with its own state pill — never a missing entry.
    const abandoned = screen.getByTestId('change-overview-state-change-dropped')
    expect(abandoned.getAttribute('data-state')).toBe('abandoned')
    expect(abandoned.textContent).toBe('ovw.abandoned')
    expect(screen.getByTestId('change-overview-state-change-active').getAttribute('data-state')).toBe('active')
    expect(screen.getByTestId('change-overview-state-change-done').getAttribute('data-state')).toBe('completed')
  })

  it('states the project it read and the header rollups', async () => {
    const load = vi.fn().mockResolvedValue(readyFixture())
    mount(load)

    await screen.findByTestId('change-overview-row-change-active')
    expect(screen.getByTitle('/work/demo-project').textContent).toContain('/work/demo-project')
    expect(screen.getByTestId('change-overview-tile-active').textContent).toBe('1')
    expect(screen.getByTestId('change-overview-tile-completed').textContent).toBe('1')
    expect(screen.getByTestId('change-overview-tile-abandoned').textContent).toBe('1')
    expect(screen.getByTestId('change-overview-tile-tasks').textContent).toBe('2/4')
  })

  it('explains an empty project instead of rendering a blank table', async () => {
    const load = vi.fn().mockResolvedValue({
      status: 'ready',
      cwd: '/work/empty',
      rows: [],
      summary: { active: 0, archived: 0, abandoned: 0, tasksDone: 0, tasksTotal: 0 },
    } satisfies BafWorkflowChangeOverviewResult)
    mount(load)

    expect(await screen.findByText('ovw.empty')).toBeDefined()
  })

  it('explains a missing workspace', async () => {
    const load = vi.fn().mockResolvedValue({ status: 'no-workspace' } satisfies BafWorkflowChangeOverviewResult)
    mount(load)

    expect(await screen.findByTestId('change-overview-empty')).toBeDefined()
    expect(screen.getByTestId('change-overview-empty').textContent).toBe('ovw.noWorkspace')
  })

  it('reports a failed load and re-reads on refresh', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(readyFixture())
    mount(load)

    await waitFor(() => { expect(screen.getByTestId('change-overview-error')).toBeDefined() })
    expect(screen.getByTestId('change-overview-error').textContent).toContain('boom')

    fireEvent.click(screen.getByTestId('change-overview-refresh'))
    expect(await screen.findByTestId('change-overview-row-change-active')).toBeDefined()
    expect(load).toHaveBeenCalledTimes(2)
  })

  // 【变更】2026-10-24 (批次二十 3): clicking a change card opens the FOUR-ZONE
  // workspace — a top strip, a left rail, the complete workflow graph in the
  // middle and a right rail.
  it('opens the four-zone detail workspace with the complete workflow graph', async () => {
    const load = vi.fn().mockResolvedValue(readyFixture())
    const detail = vi.fn().mockImplementation(async (changeId: string) => detailFixture(changeId))
    mount(load, detail)

    fireEvent.click(await screen.findByTestId('change-overview-row-change-active'))
    expect(await screen.findByTestId('change-detail-modal')).toBeDefined()
    expect(detail).toHaveBeenCalledWith('change-active')

    // 顶部 · the identity strip carries the change id and the headline figures.
    const top = screen.getByTestId('change-detail-top')
    expect(top.textContent).toContain('change-active')
    expect(top.textContent).toContain('strip.startedAt')
    expect(top.textContent).toContain('card.duration')
    expect(top.textContent).toContain('card.tokens')

    // 左侧 · the classification card + the stage artifacts.
    const left = screen.getByTestId('change-detail-left')
    expect(left.textContent).toContain('ovw.detailIntake')
    expect(left.textContent).toContain('src/app.ts')
    expect(left.textContent).toContain('proposal.md')

    // 中间 · the COMPLETE graph — both stages and the edge between them.
    const graph = screen.getByTestId('change-detail-graph')
    expect(graph.textContent).toContain('node.intake')
    expect(graph.textContent).toContain('node.implement')
    expect(graph.querySelectorAll('[role="button"]').length).toBeGreaterThanOrEqual(2)
    expect(graph.querySelector('svg')).not.toBeNull()

    // 右侧 · the stage head + the stage checklist + the full event history.
    const right = screen.getByTestId('change-detail-right')
    expect(right.textContent).toContain('node.implement')
    const history = screen.getByTestId('change-detail-history')
    expect(history.textContent).toContain('hist.intakeClassified')
    expect(history.textContent).toContain('hist.stageEntered')
    expect(history.textContent).toContain('hist.stageCompleted')
  })

  // 【变更】2026-10-24 (批次二十 3): clicking a node in the graph switches the
  // right rail to that stage.
  it('switches the stage detail when another node in the graph is picked', async () => {
    const load = vi.fn().mockResolvedValue(readyFixture())
    mount(load)

    fireEvent.click(await screen.findByTestId('change-overview-row-change-active'))
    const graph = await screen.findByTestId('change-detail-graph')
    await waitFor(() => {
      expect(screen.getByTestId('change-detail-right').textContent).toContain('node.implement')
    })

    const intakeNode = graph.querySelector('[aria-label^="node.intake"]')
    expect(intakeNode).not.toBeNull()
    fireEvent.click(intakeNode as Element)

    await waitFor(() => {
      expect(screen.getByTestId('change-detail-right').textContent).toContain('node.intake')
    })
  })

  // 【变更】2026-10-24 (批次二十 3): the artifact open channel resolves a live
  // session of the same workspace; a refusal is reported in place.
  it('opens an artifact through the injected opener and reports a refusal', async () => {
    const load = vi.fn().mockResolvedValue(readyFixture())
    const openArtifact = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false)
    mount(load, undefined, openArtifact as never)

    fireEvent.click(await screen.findByTestId('change-overview-row-change-active'))
    await screen.findByTestId('change-detail-left')
    const artifact = await screen.findByRole('button', { name: /proposal\.md/ })
    fireEvent.click(artifact)
    expect(openArtifact).toHaveBeenCalledWith('/work/demo-project', 'openspec/changes/x/proposal.md')

    fireEvent.click(artifact)
    await waitFor(() => { expect(screen.getByTestId('change-detail-open-failed')).toBeDefined() })
    expect(screen.getByTestId('change-detail-open-failed').textContent).toBe('ovw.detailOpenFailed')
  })

  it('says the artifacts are read-only when the page cannot open them', async () => {
    const load = vi.fn().mockResolvedValue(readyFixture())
    mount(load)

    fireEvent.click(await screen.findByTestId('change-overview-row-change-active'))
    expect(await screen.findByTestId('change-detail-no-session')).toBeDefined()
    expect(screen.getByTestId('change-detail-no-session').textContent).toBe('ovw.detailNoSession')
  })

  it('closes the detail workspace again', async () => {
    const load = vi.fn().mockResolvedValue(readyFixture())
    mount(load)

    fireEvent.click(await screen.findByTestId('change-overview-row-change-active'))
    expect(await screen.findByTestId('change-detail-modal')).toBeDefined()
    fireEvent.click(screen.getByText('ovw.detailClose'))
    await waitFor(() => { expect(screen.queryByTestId('change-detail-modal')).toBeNull() })
  })

  it('explains a change the ledger no longer knows', async () => {
    const load = vi.fn().mockResolvedValue(readyFixture())
    const detail = vi.fn().mockResolvedValue({ status: 'unknown-change', changeId: 'change-gone' })
    mount(load, detail)

    fireEvent.click(await screen.findByTestId('change-overview-row-change-active'))
    expect(await screen.findByTestId('change-detail-unknown')).toBeDefined()
    expect(screen.getByTestId('change-detail-unknown').textContent).toBe('ovw.detailUnknownChange')
  })
})
