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
import { ChangeOverviewRow, toBoardGraph } from '../src/client/ChangeOverviewRow.tsx'
import type {
  BafWorkflowChangeDetailResult, BafWorkflowChangeOverviewResult,
} from '../src/client/tab-types.ts'
import type { WorkflowTabFileReadResult } from '../src/client/tab-types.ts'

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
        affectedScope: 'small-local',
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
  loadChangeOverview: (cwd?: string) => Promise<BafWorkflowChangeOverviewResult>,
  loadChangeDetail: (changeId: string, cwd?: string) => Promise<BafWorkflowChangeDetailResult> =
    async changeId => detailFixture(changeId),
  readArtifact?: (cwd: string, path: string) => Promise<WorkflowTabFileReadResult>,
  useSessions: (selector: (state: unknown) => unknown) => unknown =
    function select<S>(selector: (state: unknown) => S): S { return selector({ byId: {}, phase: 'ready' }) },
) {
  return render(
    <ChangeOverviewRow
      t={t as never}
      loadChangeOverview={loadChangeOverview}
      loadChangeDetail={loadChangeDetail}
      {...(readArtifact === undefined ? {} : { readArtifact })}
      useSessions={useSessions as never}
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

  /**
   * 【变更】2026-10-26 (用户问题 2): the ledger follows the MAIN-VIEW session's
   * workspace — no main view (a fresh web client with sessions but no main
   * binding, or a main view that names no cwd) falls back to the
   * parameterless read; a main view that names a cwd passes it to every load
   * (rollup, drill-down, board export), so the ledger switches with the
   * workspace the user is looking at.
   */
  it('reads the MAIN-VIEW session\'s workspace and reloads when it switches', async () => {
    const fixture = readyFixture()
    const load = vi.fn(async (cwd?: string) => ({
      ...fixture,
      cwd: cwd ?? '/work/fallback',
    }))
    const seat = (sessions: readonly { id: string; cwd: string; main: boolean }[]) =>
      function select<S>(selector: (state: unknown) => S): S {
        const byId: Record<string, unknown> = {}
        for (const session of sessions) {
          byId[session.id] = {
            id: session.id,
            cwd: session.cwd,
            retainedBy: session.main ? { mainView: 1 } : {},
          }
        }
        return selector({ ids: sessions.map(session => session.id), byId, phase: 'ready' })
      }
    const element = (sessions: readonly { id: string; cwd: string; main: boolean }[]) => (
      <ChangeOverviewRow
        t={t as never}
        loadChangeOverview={load}
        loadChangeDetail={async changeId => detailFixture(changeId)}
        useSessions={seat(sessions) as never}
      />
    )
    const view = render(element([{ id: 's1', cwd: '/work/alpha', main: true }]))
    await screen.findByTestId('change-overview-row-change-active')
    expect(load).toHaveBeenLastCalledWith('/work/alpha')

    // The main view moves to another workspace → the ledger re-reads THAT one.
    view.rerender(element([
      { id: 's1', cwd: '/work/alpha', main: false },
      { id: 's2', cwd: '/work/beta', main: true },
    ]))
    await waitFor(() => { expect(load).toHaveBeenLastCalledWith('/work/beta') })
  })

  it('keeps the parameterless fallback when no main-view session names a workspace', async () => {
    const load = vi.fn().mockResolvedValue(readyFixture())
    mount(load, undefined, undefined, undefined, selector => selector({ byId: {}, phase: 'ready' }))

    await screen.findByTestId('change-overview-row-change-active')
    expect(load).toHaveBeenLastCalledWith()
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

    // 左侧 · the classification card + the stage artifacts + the HISTORY (bottom).
    // 【变更】2026-10-28 (批次三十五 · 用户问题 1): the history moved DOWN from
    // the right rail to the left rail's BOTTOM band (左下方).
    const left = screen.getByTestId('change-detail-left')
    expect(left.textContent).toContain('ovw.detailIntake')
    expect(left.textContent).toContain('proposal.md')
    // 【变更】2026-10-28 (批次三十四 · 用户问题 6): the scope reads as the
    // customer's word (跨模块 / 局部小改 / 单文件), not the raw enum.
    expect(left.textContent).toContain('scope.small-local')
    const history = screen.getByTestId('change-detail-history')
    expect(history.textContent).toContain('hist.intakeClassified')
    expect(history.textContent).toContain('hist.stageEntered')
    expect(history.textContent).toContain('hist.stageCompleted')

    // 中间 · the COMPLETE graph — both stages and the edge between them.
    const graph = screen.getByTestId('change-detail-graph')
    expect(graph.textContent).toContain('node.intake')
    expect(graph.textContent).toContain('node.implement')
    expect(graph.querySelectorAll('[role="button"]').length).toBeGreaterThanOrEqual(2)
    expect(graph.querySelector('svg')).not.toBeNull()

    // 右侧 · the stage name card + the stage checklist — the HISTORY left it.
    const right = screen.getByTestId('change-detail-right')
    expect(right.textContent).toContain('node.implement')
    // 【变更】2026-10-28 (批次三十五 · 用户问题 1): the history sits in the
    // BOTTOM-LEFT band, not in the right rail.
    expect(right.querySelector('[data-testid="change-detail-history"]')).toBeNull()
    expect(left.querySelector('[data-testid="change-detail-history"]')).not.toBeNull()
  })

  /**
   * 【变更】2026-10-28 (批次三十五 · 用户问题 1): the history's NEW home — the
   * bottom-left band of the change detail. It is a region of its own, so the
   * reader can see where it sits without reading the copy.
   */
  it('puts the change history in the bottom-left band, out of the right rail', async () => {
    const load = vi.fn().mockResolvedValue(readyFixture())
    const detail = vi.fn().mockImplementation(async (changeId: string) => detailFixture(changeId))
    mount(load, detail)

    fireEvent.click(await screen.findByTestId('change-overview-row-change-active'))
    await screen.findByTestId('change-detail-modal')

    // The history region lives INSIDE the left rail, under the change's own
    // identity and documents.
    const left = screen.getByTestId('change-detail-left')
    const region = screen.getByTestId('change-detail-history-region')
    expect(left.contains(region)).toBe(true)
    expect(region.textContent).toContain('hist.intakeClassified')
    // …and it is GONE from the right rail.
    const right = screen.getByTestId('change-detail-right')
    expect(right.contains(screen.getByTestId('change-detail-history'))).toBe(false)
    expect(right.textContent).not.toContain('hist.stageEntered')
  })

  /**
   * 【变更】2026-10-28 (批次三十五 · 用户问题 1): the change detail's stage
   * NAMES are bilingual — 中文在前，英文在后 on ONE line, the 确认门配置流程图's
   * anatomy (the English name is a plain constant, the zh label stays
   * locale-owned).
   */
  it('names the stage bilingually in the change detail', async () => {
    const load = vi.fn().mockResolvedValue(readyFixture())
    const detail = vi.fn().mockImplementation(async (changeId: string) => detailFixture(changeId))
    mount(load, detail)

    fireEvent.click(await screen.findByTestId('change-overview-row-change-active'))
    await screen.findByTestId('change-detail-modal')

    // The stage name card prints both halves.
    const name = await screen.findByTestId('stage-summary-name')
    expect(name.textContent).toContain('node.implement')
    expect(name.textContent).toContain('Implement')
    // …and the graph's stage card names the stage the same way.
    const card = screen.getByTestId('flow-node-name-implement')
    expect(card.textContent).toContain('node.implement')
    expect(card.textContent).toContain('Implement')
  })

  // 【变更】2026-10-28 (批次三十四 · 用户问题 6): a finished change's outcome card
  // showed 「期望产物」「完成条件」 cut off by an ellipsis — the values are
  // sentences, so they WRAP now.
  it('wraps the finished change\'s artifact and completion lines', async () => {
    const load = vi.fn().mockResolvedValue(readyFixture())
    const detail = vi.fn().mockImplementation(async (changeId: string) => {
      const base = detailFixture(changeId)
      return { ...base, view: { ...base.view, current: 'completed' as const } }
    })
    mount(load, detail)

    fireEvent.click(await screen.findByTestId('change-overview-row-change-active'))
    const terminal = await screen.findByTestId('change-detail-terminal')
    expect(terminal.textContent).toContain('detail.artifacts')
    expect(terminal.textContent).toContain('detail.completion')
    // Both long values carry the WRAP class (white-space: normal), not the
    // truncating one.
    expect(terminal.querySelectorAll('span[class*="intakeValueWrap"]')).toHaveLength(2)
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

  // 【变更】2026-10-25 (批次二十四 1): clicking a 文档产物 opens the PREVIEW
  // window (the same one the 测试流图's config files use).
  // 【变更】2026-10-27 (批次三十二 · 用户问题 6): the preview's 在侧栏打开
  // footer button is GONE — the document is already on screen in this window.
  it('previews an artifact in the document window', async () => {
    const load = vi.fn().mockResolvedValue(readyFixture())
    const readArtifact = vi.fn().mockResolvedValue({
      status: 'ready', path: '/work/demo-project/openspec/changes/x/proposal.md', content: '# 提案\n正文',
    } satisfies WorkflowTabFileReadResult)
    mount(load, undefined, readArtifact as never)

    fireEvent.click(await screen.findByTestId('change-overview-row-change-active'))
    await screen.findByTestId('change-detail-left')
    const artifact = await screen.findByRole('button', { name: /proposal\.md/ })
    fireEvent.click(artifact)

    // The preview window opens with the document's own text.
    const preview = await screen.findByTestId('change-artifact-preview')
    expect(preview).toBeDefined()
    await waitFor(() => {
      expect(screen.getByTestId('change-artifact-preview-body').textContent).toContain('# 提案')
    })
    expect(readArtifact).toHaveBeenCalledWith('/work/demo-project', 'openspec/changes/x/proposal.md')
    // No footer action — the preview IS the reading surface now.
    expect(screen.queryByTestId('change-artifact-preview-open')).toBeNull()
  })

  // 【变更】2026-10-25 (批次二十四 1): without a live session there is nothing
  // to read the document through — the page says so instead of opening a
  // window that cannot read anything.
  it('says the artifacts cannot be read when the page has no live session', async () => {
    const load = vi.fn().mockResolvedValue(readyFixture())
    mount(load)

    fireEvent.click(await screen.findByTestId('change-overview-row-change-active'))
    await screen.findByTestId('change-detail-left')
    const artifact = await screen.findByRole('button', { name: /proposal\.md/ })
    fireEvent.click(artifact)

    await waitFor(() => { expect(screen.getByTestId('change-detail-open-failed')).toBeDefined() })
    expect(screen.getByTestId('change-detail-open-failed').textContent).toBe('ovw.detailNoSession')
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

  /**
   * 【变更】2026-10-26 (用户问题 2): the browser board renders the COMPLETE
   * workflow graph, not a text list. The board is a static file, so the graph
   * is laid out at EXPORT time — the same grid pitch, the same cubic-bezier
   * edge shape and the same status colours the in-app FlowCanvas uses.
   */
  it('lays the change graph out for the standalone board with the canvas geometry', () => {
    const detail = detailFixture('change-active')
    if (detail.status !== 'ready') throw new Error('fixture must be ready')
    const graph = toBoardGraph(detail, t as never)
    expect(graph).toBeDefined()
    if (graph === undefined) return

    // Two columns wide → (1 + 1) * COL_W + 56, one row → ROW_H + 72.
    expect(graph.width).toBe(2 * 248 + 56)
    expect(graph.height).toBe(128 + 72)

    const intake = graph.nodes.find(node => node.id === 'intake')
    const implement = graph.nodes.find(node => node.id === 'implement')
    expect(intake).toMatchObject({ x: 28, y: 28, width: 208, height: 96, tone: 'completed', onPath: true })
    expect(implement).toMatchObject({ x: 28 + 248, y: 28, tone: 'active', current: true })
    // The current stage carries its figures line; an idle stage would read —.
    expect(implement?.metrics.length).toBe(2)

    // One edge, drawn exactly as the canvas draws it: from the LOWER edge of
    // the source card into the TOP edge of the target, a cubic bezier with
    // both control points on the vertical midpoint.
    expect(graph.edges).toHaveLength(1)
    const edge = graph.edges[0]
    expect(edge?.kind).toBe('forward')
    expect(edge?.active).toBe(true)
    const x1 = 28 + 208 / 2
    const x2 = 28 + 248 + 208 / 2
    const y1 = 28 + 96
    const y2 = 28
    const mid = (y1 + y2) / 2
    expect(edge?.path).toBe(`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`)
    // The condition text is the plain-zh rendering (the edge is unknown to the
    // table, so the raw condition comes through).
    expect(edge?.title).toBe('ok')
  })
})
