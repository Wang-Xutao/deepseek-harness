// @vitest-environment jsdom
/**
 * 【变更】2026-10-23 (批次十八 2.2/2.3): the 工作流 page's 变更总览 row — the
 * project's change ledger. The abandoned changes are RECORDED rows (a state
 * pill of their own), not a missing entry; the page states the project it
 * read and explains its empty / no-workspace states.
 * 【变更】2026-10-24 (批次十九 1.3): the ledger became the ONE home of the
 * change overview — clicking a change card opens the detail modal with the
 * stage flow and the change's full event history.
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

/** One change's detail — the stage flow + the event history. */
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
      nodes: [
        {
          id: 'intake',
          status: 'completed',
          catalog: {
            id: 'intake', titleKey: 'node.intake', purpose: 'p', prerequisites: [], actions: [],
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
            id: 'implement', titleKey: 'node.implement', purpose: 'p', prerequisites: [], actions: [],
            artifacts: [], completion: [], failure: [], entries: [],
          },
          onPath: true,
          transitionsIn: [],
          transitionsOut: [],
        },
      ],
      graph: { nodes: [], edges: [] },
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
) {
  return render(
    <ChangeOverviewRow
      t={t as never}
      loadChangeOverview={loadChangeOverview}
      loadChangeDetail={loadChangeDetail}
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

  // 【变更】2026-10-24 (批次十九 1.3): clicking a change card opens the detail
  // modal — the stage flow plus the change's full event history.
  it('opens the change detail modal with the stage flow and the history', async () => {
    const load = vi.fn().mockResolvedValue(readyFixture())
    const detail = vi.fn().mockImplementation(async (changeId: string) => detailFixture(changeId))
    mount(load, detail)

    fireEvent.click(await screen.findByTestId('change-overview-row-change-active'))
    expect(await screen.findByTestId('change-detail-modal')).toBeDefined()
    expect(detail).toHaveBeenCalledWith('change-active')

    // The stage flow lists the change's stages.
    const flow = screen.getByTestId('change-detail-flow')
    expect(flow.textContent).toContain('node.intake')
    expect(flow.textContent).toContain('node.implement')
    // The history lists every projection event.
    const history = screen.getByTestId('change-detail-history')
    expect(history.textContent).toContain('hist.intakeClassified')
    expect(history.textContent).toContain('hist.stageEntered')
    expect(history.textContent).toContain('hist.stageCompleted')
    // The artifacts and the headline numbers ride the modal too.
    expect(screen.getByTestId('change-detail-artifacts').textContent).toContain('proposal.md')
    expect(screen.getByTestId('change-detail-metrics').textContent).toContain('strip.startedAt')
  })

  it('closes the detail modal again', async () => {
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
