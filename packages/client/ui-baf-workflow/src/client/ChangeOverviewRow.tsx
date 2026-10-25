/**
 * 【变更】2026-10-23 (批次十八 2.2/2.3): the 工作流 page's 「变更总览」 tab —
 * every change of the CURRENT project (workspace), the abandoned ones
 * included.
 *
 * 【变更】2026-10-24 (批次十九 1.3): the panel became the ONE home of the
 * change overview. The session tab's 变更总览 modal is gone — here a change
 * card opens a detail modal with the change's stage flow and its full event
 * history. The ledger itself was redesigned for this batch: a hero header,
 * four accent tiles, and clickable change cards instead of a dense table.
 *
 * 【变更】2026-10-24 (批次二十 1/3): the ledger became a「金箔仪表台」console —
 * the gold reads as MATERIAL (layered surfaces, 1px hairline edges, a lit top
 * edge, staggered entrances) rather than as flat paint — and the per-change
 * detail view became a FOUR-ZONE workspace:
 *
 *   顶部  a strip with the change's identity and its headline figures
 *   左侧  a fixed rail: the change classification + the stage artifacts
 *   中间  the COMPLETE workflow graph — the session tab's own `FlowCanvas`,
 *         the same component, the same nodes, the same edges, the same status
 *         colours (a change that looks different in the ledger than in the
 *         conversation is a bug, not a variant)
 *   右侧  a rail: the stage head, the stage checklist, the stage detail and
 *         the change's full event history
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {
  BafWorkflowChangeDetailResult, BafWorkflowChangeOverviewResult,
  BafWorkflowChangeHistoryEntry, WorkflowDashboardRow, WorkflowNodeId,
  WorkflowTabFileReadResult, WorkflowTabNodeView, WorkflowTabView,
} from './tab-types.ts'
import type { WorkflowTabKey } from './locales.ts'
import { formatDuration, formatTimestamp, formatTokens, modeLabel } from './dashboard-format.ts'
import { buildDashboardHtml, type DashboardHtmlLabels } from './dashboard-html.ts'
import { FlowCanvas } from './FlowCanvas.tsx'
import { ArtifactRail, BilingualDetail, StageChecklist } from './flow-parts.tsx'
import css from './ChangeOverviewRow.module.css'

/** The inject face the slot registration hands the row. */
export interface ChangeOverviewRowInjected {
  /** Load the project change overview (workspace-scoped). */
  loadChangeOverview: () => Promise<BafWorkflowChangeOverviewResult>
  /**
   * 【变更】2026-10-24 (批次十九 1.3): load ONE change's detail (its flow
   * projection + its event history) for the drill-down modal.
   */
  loadChangeDetail: (changeId: string) => Promise<BafWorkflowChangeDetailResult>
  /**
   * 【变更】2026-10-24 (批次二十 3): open one of the change's artifacts in the
   * right sidebar.
   *
   * The 变更总览 page is PROJECT-scoped and has no conversation behind it, so
   * there is no session to borrow a file address from. The opener therefore
   * resolves a LIVE session of the same workspace and returns `false` when the
   * workspace has none — the page then says so instead of offering a button
   * that cannot work.
   */
  openArtifact?: (cwd: string, path: string) => boolean
  /**
   * 【变更】2026-10-25 (批次二十四 1): read one artifact's text for the
   * preview window. The 变更总览 page is PROJECT-scoped, so the reader resolves
   * a LIVE session of the same workspace and reads the file through it —
   * undefined when the workspace has none, and the page then says so instead
   * of offering a preview that cannot open.
   */
  readArtifact?: (cwd: string, path: string) => Promise<WorkflowTabFileReadResult>
}

/** Full component props for the 变更总览 settings row. */
export type ChangeOverviewRowProps =
  PropsRuntime<'settings.workflow.item'>
  & PropsLocale<'baf.go-workflow'>
  & InjectFace<ChangeOverviewRowInjected>

/** The three states a change can be in, as the ledger renders them. */
type ChangeState = 'active' | 'completed' | 'abandoned'

/**
 * One change's state, read off its terminal node. An abandoned change is a
 * RECORDED outcome (批次十八 2.2) — it keeps its row, its artifacts, and its
 * ending timestamp.
 * @param row - one dashboard row.
 * @returns the change state.
 */
export function changeStateOf(row: WorkflowDashboardRow): ChangeState {
  if (row.current === 'abandoned') return 'abandoned'
  if (row.current === 'completed') return 'completed'
  return 'active'
}

/**
 * The locale key for one projection event type — the history list's row title.
 * @param type - the projection event type.
 * @returns the locale key (falls back to the generic event label).
 */
export function historyKeyOf(type: string): string {
  const known: Record<string, string> = {
    'intake-classified': 'hist.intakeClassified',
    'intake-confirmed': 'hist.intakeConfirmed',
    'intake-mode-set': 'hist.intakeModeSet',
    'intake-settled': 'hist.intakeSettled',
    'task-tier-frozen': 'hist.taskTierFrozen',
    'baseline-locked': 'hist.baselineLocked',
    'stage-entered': 'hist.stageEntered',
    'stage-completed': 'hist.stageCompleted',
    'stage-failed': 'hist.stageFailed',
    'drift-detected': 'hist.driftDetected',
    'mode-upgraded': 'hist.modeUpgraded',
    'awaiting-confirm': 'hist.awaitingConfirm',
    'change-archived': 'hist.changeArchived',
    'change-abandoned': 'hist.changeAbandoned',
    'transition-rejected': 'hist.transitionRejected',
  }
  return known[type] ?? 'hist.event'
}

/**
 * Render the 工作流 page's 变更总览 row — the project's change ledger.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function ChangeOverviewRow(props: ChangeOverviewRowProps): React.ReactElement {
  const { t, loadChangeOverview, loadChangeDetail, openArtifact, readArtifact } = props
  const [result, setResult] = useState<BafWorkflowChangeOverviewResult | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  // 【变更】2026-10-24 (批次十九 1.3): the drill-down state — the open change
  // id plus its detail payload.
  const [openChangeId, setOpenChangeId] = useState<string | undefined>(undefined)
  const [detail, setDetail] = useState<BafWorkflowChangeDetailResult | undefined>(undefined)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setResult(await loadChangeOverview())
      setError(undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [loadChangeOverview])

  useEffect(() => { void load() }, [load])

  /**
   * 【变更】2026-10-24 (批次十九 1.3): the standalone board — the project
   * ledger baked into a self-contained HTML page (tiles, mode donut, duration
   * ranking, one card per change) and opened in a new browser tab via a Blob
   * URL. The entry point moved here with the ledger (the session tab's modal
   * is gone); the click-originated window.open keeps popup blockers happy and
   * the URL is revoked a minute later (the page outlives it — nothing is
   * fetched back).
   */
  const openExternal = useCallback(() => {
    if (result?.status !== 'ready') return
    const nodeIds = ['intake', 'open', 'clarify', 'design', 'plan', 'implement', 'verify', 'archive', 'drift', 'completed', 'abandoned'] as const
    const nodeLabels: Record<string, string> = {}
    for (const id of nodeIds) nodeLabels[id] = t(`node.${id}`)
    const labels: DashboardHtmlLabels = {
      title: t('dashboard.board.title'),
      subtitle: t('dashboard.board.subtitle'),
      generatedAt: t('dashboard.board.generatedAt'),
      snapshotNote: t('dashboard.board.snapshotNote'),
      tileActive: t('dashboard.board.tileActive'),
      tileArchived: t('dashboard.board.tileArchived'),
      tileAbandoned: t('dashboard.board.tileAbandoned'),
      tileTasks: t('dashboard.board.tileTasks'),
      tileDuration: t('dashboard.board.tileDuration'),
      tileTokens: t('dashboard.board.tileTokens'),
      chartModes: t('dashboard.board.chartModes'),
      chartDuration: t('dashboard.board.chartDuration'),
      allChanges: t('dashboard.board.allChanges'),
      empty: t('dashboard.board.empty'),
      tasksHelp: t('dashboard.tasksHelp'),
      durationHelp: t('card.duration'),
      tokensHelp: t('card.tokens'),
      endedAt: t('dashboard.board.endedAt'),
      artifactsLabel: t('dashboard.artifacts'),
      artifactStates: {
        template: t('artifact.state.template'),
        planned: t('artifact.state.planned'),
        filled: t('artifact.state.filled'),
      },
      nodeLabels,
      modeLabels: {
        'full-go-path': t('mode.fullGoPath'),
        'bug-fix-path': t('mode.bugFixPath'),
        'clarify-required': t('mode.clarify'),
      },
    }
    const html = buildDashboardHtml({ rows: result.rows, summary: result.summary }, labels)
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    window.open(url, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => { URL.revokeObjectURL(url) }, 60_000)
  }, [result, t])

  const openDetail = useCallback(async (changeId: string): Promise<void> => {
    setOpenChangeId(changeId)
    setDetail(undefined)
    setDetailLoading(true)
    try {
      setDetail(await loadChangeDetail(changeId))
    } catch {
      setDetail({ status: 'unknown-change', changeId })
    } finally {
      setDetailLoading(false)
    }
  }, [loadChangeDetail])

  const stateLabel = (state: ChangeState): string => {
    if (state === 'completed') return t('ovw.completed')
    if (state === 'abandoned') return t('ovw.abandoned')
    return t('dashboard.activeChanges')
  }

  const card = (change: WorkflowDashboardRow, index: number) => {
    const state = changeStateOf(change)
    const done = change.tasks?.done ?? 0
    const total = change.tasks?.total ?? 0
    const percent = total === 0 ? 0 : Math.round((done / total) * 100)
    return (
      <button
        key={change.changeId}
        type="button"
        className={css.card}
        data-state={state}
        data-testid={`change-overview-row-${change.changeId}`}
        title={t('ovw.detailOpen')}
        style={{ animationDelay: `${index * 45}ms` }}
        onClick={() => { void openDetail(change.changeId) }}
      >
        <span className={css.cardEdge} aria-hidden />
        <span className={css.cardHead}>
          <span className={css.changeId}>{change.changeId}</span>
          <span className={css.state} data-state={state} data-testid={`change-overview-state-${change.changeId}`}>
            {stateLabel(state)}
          </span>
        </span>
        <span className={css.cardMeta}>
          <span className={css.mode}>{modeLabel(change.mode, t)}</span>
          {/* The stage names the ACTIVE change's position; a terminal row's
              stage IS its outcome, which the state pill already says. */}
          {state === 'active' && (
            <span className={css.stage}>{t(`node.${change.current}`)}</span>
          )}
        </span>
        {change.tasks !== undefined && total > 0 && (
          <span className={css.progress} title={t('dashboard.tasksHelp')}>
            <span className={css.progressTrack}>
              <span className={css.progressFill} style={{ width: `${percent}%` }} />
            </span>
            <span className={css.progressText}>{done}/{total}</span>
          </span>
        )}
        <span className={css.cardFoot}>
          <span title={t('card.duration')}>{formatDuration(change.durationMs)}</span>
          <span title={t('card.tokens')}>{formatTokens(change.inputTokens, change.outputTokens)}</span>
          <span title={t('ovw.columnEnded')}>
            {change.endedAt === undefined ? '—' : formatTimestamp(change.endedAt)}
          </span>
          {/* 【变更】2026-10-25 (批次二十四 1): the affordance line rides the
              foot row instead of floating over it — the metrics and the
              affordance no longer overlap. */}
          <span className={css.cardCta} aria-hidden>{t('ovw.detailOpen')} ↗</span>
        </span>
      </button>
    )
  }

  return (
    <section className={css.block} data-testid="baf-change-overview">
      {/* 【变更】2026-10-24 (批次二十 1): the console header — the BAF mark,
          the ledger's identity, its purpose, and the two actions in one band. */}
      <header className={css.hero}>
        <span className={css.heroBrand}>{t('view.brandBaf')}</span>
        <div className={css.heroText}>
          <span className={css.heroLabel}>{t('ovw.ledgerLabel')}</span>
          <h2 className={css.title}>{t('ovw.title')}</h2>
          <p className={css.description}>{t('ovw.help')}</p>
        </div>
        <div className={css.heroActions}>
          {/* 【变更】2026-10-25 (批次二十四 2): the two actions split into
              primary / secondary — the ledger's own action (导出看板) carries
              the gold, the utility action (刷新) stays a ghost. Two identical
              pills side by side read as one loud band and no focal point. */}
          <button
            type="button"
            className={css.refreshPrimary}
            data-testid="change-overview-external"
            disabled={result?.status !== 'ready'}
            title={t('dashboard.board.snapshotNote')}
            onClick={openExternal}
          >
            {t('dashboard.openExternal')}
          </button>
          <button
            type="button"
            className={css.refresh}
            data-testid="change-overview-refresh"
            disabled={loading}
            onClick={() => { void load() }}
          >
            {t('ovw.refresh')}
          </button>
        </div>
      </header>

      {error !== undefined && (
        <div className={css.statusError} data-testid="change-overview-error">
          {t('dashboard.loadFailed')} {error}
        </div>
      )}
      {result === undefined && error === undefined && (
        <div className={css.status}>{t('ovw.loading')}</div>
      )}
      {result?.status === 'no-workspace' && (
        <div className={css.status} data-testid="change-overview-empty">{t('ovw.noWorkspace')}</div>
      )}

      {result?.status === 'ready' && (
        <>
          <div className={css.project} title={result.cwd}>
            <span className={css.projectLabel}>{t('ovw.project')}</span>
            <span className={css.projectPath}>{result.cwd}</span>
          </div>

          {/* 【变更】2026-10-24 (批次二十 1): the four figure plates — each one
              a lit panel with a gold rule, so the numbers read as a dashboard. */}
          <div className={css.tiles}>
            <div className={css.tile} data-tone="active">
              <span className={css.tileValue} data-testid="change-overview-tile-active">{result.summary.active}</span>
              <span className={css.tileLabel}>{t('dashboard.activeChanges')}</span>
            </div>
            <div className={css.tile} data-tone="completed">
              <span className={css.tileValue} data-testid="change-overview-tile-completed">{result.summary.archived}</span>
              <span className={css.tileLabel}>{t('ovw.completed')}</span>
            </div>
            <div className={css.tile} data-tone="abandoned">
              <span className={css.tileValue} data-testid="change-overview-tile-abandoned">{result.summary.abandoned}</span>
              <span className={css.tileLabel}>{t('ovw.abandoned')}</span>
            </div>
            <div className={css.tile} data-tone="tasks">
              <span className={css.tileValue} data-testid="change-overview-tile-tasks">{result.summary.tasksDone}/{result.summary.tasksTotal}</span>
              <span className={css.tileLabel}>{t('dashboard.tasks')}</span>
            </div>
          </div>

          {/* 【变更】2026-10-25 (批次二十四 2): the list gets its OWN section
              head — an eyebrow, the record count and the click hint on one
              hairline rule. The tiles and the cards used to float as one
              undifferentiated field; the rule says 「these are the records」. */}
          <section className={css.section}>
            <div className={css.sectionHead}>
              <span className={css.sectionLabel}>{t('ovw.listLabel')}</span>
              <span className={css.sectionCount}>{result.rows.length}</span>
              <span className={css.sectionHint}>{t('ovw.clickHint')}</span>
            </div>
            <div className={css.cards} data-testid="change-overview-cards">
              {result.rows.map(card)}
              {result.rows.length === 0 && (
                <div className={css.empty}>{t('ovw.empty')}</div>
              )}
            </div>
          </section>
        </>
      )}

      {openChangeId !== undefined && (
        <ChangeDetailWorkspace
          changeId={openChangeId}
          detail={detail}
          loading={detailLoading}
          openArtifact={openArtifact}
          readArtifact={readArtifact}
          onClose={() => { setOpenChangeId(undefined); setDetail(undefined) }}
          t={t}
        />
      )}
    </section>
  )
}

/**
 * 【变更】2026-10-24 (批次二十 3): the per-change drill-down — the FOUR-ZONE
 * workspace. The middle zone is the session tab's own flow canvas, so the
 * change reads exactly as it reads in the conversation; the top strip, the
 * left rail and the right rail carry everything the graph cannot.
 * @param props - the workspace props.
 * @returns the workspace element tree.
 */
function ChangeDetailWorkspace(props: {
  changeId: string
  detail: BafWorkflowChangeDetailResult | undefined
  loading: boolean
  onClose: () => void
  openArtifact: ((cwd: string, path: string) => boolean) | undefined
  readArtifact: ((cwd: string, path: string) => Promise<WorkflowTabFileReadResult>) | undefined
  t: ChangeOverviewRowProps['t']
}): React.ReactElement {
  const { changeId, detail, loading, onClose, openArtifact, readArtifact, t } = props
  const view = detail?.status === 'ready' ? detail.view : undefined
  const cwd = detail?.status === 'ready' ? detail.cwd : undefined
  const shell = useRef<HTMLDivElement | null>(null)
  // 【变更】2026-10-24 (批次二十 3): the close handler is held in a ref so the
  // focus/escape effect does not re-run (and re-steal the focus) every time
  // the parent re-renders with a new handler identity.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // 【变更】2026-10-24 (批次二十 3): the workspace takes the focus when it
  // opens, and Escape closes it — a full-screen surface the user can leave.
  useEffect(() => {
    shell.current?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [])

  // The selected stage — the change's current stage until the user picks
  // another node in the graph.
  //
  // 【变更】2026-10-24 (批次二十 3): a TERMINAL change (完成 / 已放弃) selects
  // nothing — its right rail shows the terminal outcome (status, artifacts,
  // completion), the same card the session rail shows for a terminal change.
  // Falling back to the first stage would answer a different question than
  // 「这个变更最后怎么了」.
  const [selected, setSelected] = useState<WorkflowNodeId | undefined>(undefined)
  useEffect(() => {
    if (view === undefined) {
      setSelected(undefined)
      return
    }
    const current = view.current
    if (current === 'completed' || current === 'abandoned') {
      setSelected(undefined)
      return
    }
    const onPath = current === null
      ? undefined
      : view.nodes.find(node => node.id === (current as WorkflowNodeId))
    setSelected(onPath?.id ?? view.nodes[0]?.id)
  }, [view])

  const selectedNode = useMemo(
    (): WorkflowTabNodeView | undefined =>
      view === undefined ? undefined : view.nodes.find(node => node.id === selected),
    [view, selected],
  )

  // The selected stage's outgoing edge — the same 「下一阶段 + 条件」 line the
  // session rail shows.
  const nextEdge = useMemo((): { id: string; to: string; condition: string } | null => {
    if (view === undefined || selectedNode === undefined) return null
    const edges = view.graph.edges
    const edge = edges.find(e => e.from === selectedNode.id && e.kind === 'forward')
      ?? edges.find(e => e.from === selectedNode.id)
    if (edge === undefined) return null
    return { id: edge.id, to: edge.to, condition: edge.condition }
  }, [view, selectedNode])

  // 【变更】2026-10-24 (批次二十 3): a failed artifact open is reported in
  // place — the rail says why instead of leaving a button that did nothing.
  const [openNotice, setOpenNotice] = useState<string | undefined>(undefined)
  // 【变更】2026-10-25 (批次二十四 1): the artifact PREVIEW — the same window
  // the 测试流图's config files use (title + path + body + 在侧栏打开).
  const [preview, setPreview] = useState<{ path: string; result?: WorkflowTabFileReadResult } | null>(null)

  // The preview reads through a live session of this workspace; without one
  // the page says so instead of opening a window that cannot read anything.
  const openPreview = useCallback(async (path: string): Promise<void> => {
    if (readArtifact === undefined || cwd === undefined) {
      setOpenNotice(t('ovw.detailNoSession'))
      return
    }
    setPreview({ path })
    try {
      const result = await readArtifact(cwd, path)
      setPreview(current => (current !== null && current.path === path ? { path, result } : current))
    } catch (err) {
      setPreview(current => (current !== null && current.path === path
        ? { path, result: { status: 'unreadable', reason: err instanceof Error ? err.message : String(err) } }
        : current))
    }
  }, [readArtifact, cwd, t])

  // Escape closes the preview first; the workspace itself closes on Escape too.
  useEffect(() => {
    if (preview === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setPreview(null)
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('keydown', onKey, true) }
  }, [preview])

  const openFile = useCallback((path: string): void => {
    if (openArtifact === undefined || cwd === undefined) {
      setOpenNotice(t('ovw.detailNoSession'))
      return
    }
    setOpenNotice(openArtifact(cwd, path) ? undefined : t('ovw.detailOpenFailed'))
  }, [openArtifact, cwd, t])

  const state: ChangeState = view === undefined
    ? 'active'
    : view.current === 'abandoned'
      ? 'abandoned'
      : view.current === 'completed'
        ? 'completed'
        : 'active'
  // 【变更】2026-10-24 (批次二十 3): a terminal change — the right rail answers
  // 「这个变更最后怎么了」 instead of showing an arbitrary stage.
  const terminal = view !== undefined && (view.current === 'completed' || view.current === 'abandoned')
    ? view.current
    : null
  const stateLabel = state === 'completed'
    ? t('ovw.completed')
    : state === 'abandoned'
      ? t('ovw.abandoned')
      : t('dashboard.activeChanges')

  return (
    <>
      <div
        className={css.wsBackdrop}
        role="presentation"
        onClick={onClose}
      >
        <div
          ref={shell}
          className={css.ws}
          role="dialog"
          aria-modal="true"
          aria-label={t('ovw.detailTitle')}
          tabIndex={-1}
          data-testid="change-detail-modal"
          onClick={(event) => { event.stopPropagation() }}
        >
          {/* ── 顶部 · the identity strip ─────────────────────────────────── */}
          <header className={css.wsTop} data-testid="change-detail-top">
            <div className={css.wsTopLead}>
              <span className={css.wsBrand}>{t('view.brandBaf')}</span>
              <div className={css.wsTopTitle}>
                <span className={css.wsTopLabel}>{t('ovw.detailTitle')}</span>
                <span className={css.wsTopId}>{changeId}</span>
              </div>
              <span className={css.wsState} data-state={state}>{stateLabel}</span>
            </div>
            <div className={css.wsFigures}>
              {view !== undefined && (
                <>
                  <span className={css.figure}>
                    <span className={css.figureLabel}>{t('ovw.columnMode')}</span>
                    <span className={css.figureValue}>{modeLabel(view.mode, t)}</span>
                  </span>
                  <span className={css.figure}>
                    <span className={css.figureLabel}>{t('strip.startedAt')}</span>
                    <span className={css.figureValue}>{formatTimestamp(view.startedAt)}</span>
                  </span>
                  <span className={css.figure}>
                    <span className={css.figureLabel}>{t('card.duration')}</span>
                    <span className={css.figureValue}>{formatDuration(view.metrics?.totalDurationMs)}</span>
                  </span>
                  <span className={css.figure}>
                    <span className={css.figureLabel}>{t('card.tokens')}</span>
                    <span className={css.figureValue}>
                      {formatTokens(view.metrics?.totalInputTokens, view.metrics?.totalOutputTokens)}
                    </span>
                  </span>
                </>
              )}
            </div>
            <button type="button" className={css.wsClose} data-testid="change-detail-close" onClick={onClose}>
              {t('ovw.detailClose')}
            </button>
          </header>

          <div className={css.wsBody}>
            {/* ── 左侧 · classification + artifacts ───────────────────────── */}
            <aside className={css.wsLeft} data-testid="change-detail-left">
              {loading && <div className={css.status}>{t('ovw.detailLoading')}</div>}
              {!loading && detail === undefined && (
                <div className={css.statusError}>{t('ovw.detailFailed')}</div>
              )}
              {!loading && detail?.status === 'unknown-change' && (
                <div className={css.status} data-testid="change-detail-unknown">
                  {t('ovw.detailUnknownChange')}
                </div>
              )}
              {!loading && detail?.status === 'no-workspace' && (
                <div className={css.status}>{t('ovw.noWorkspace')}</div>
              )}
              {view !== undefined && (
                <>
                  <IntakeCard view={view} t={t} />
                  {view.artifacts !== undefined && view.artifacts.length > 0 && (
                    <ArtifactRail
                      rows={view.artifacts}
                      onOpen={(path) => { void openPreview(path) }}
                      t={t}
                    />
                  )}
                  {openArtifact === undefined && (
                    <p className={css.wsNote} data-testid="change-detail-no-session">{t('ovw.detailNoSession')}</p>
                  )}
                  {openNotice !== undefined && (
                    <p className={css.wsWarn} data-testid="change-detail-open-failed">{openNotice}</p>
                  )}
                </>
              )}
            </aside>

            {/* ── 中间 · the complete workflow graph ───────────────────────── */}
            <section className={css.wsCenter}>
              <div className={css.wsCenterHead}>
                <span className={css.wsCenterLabel}>{t('ovw.detailGraph')}</span>
                <span className={css.wsCenterHint}>{t('ovw.detailGraphHint')}</span>
              </div>
              {view !== undefined && (
                <div className={css.wsCanvas} data-testid="change-detail-graph">
                  <FlowCanvas
                    view={view}
                    selected={selected ?? null}
                    onActivate={(id) => { setSelected(id as WorkflowNodeId) }}
                    onOpenArtifact={(path) => { void openPreview(path) }}
                    t={t}
                  />
                </div>
              )}
              {view === undefined && !loading && (
                <div className={css.wsCenterEmpty}>{t('ovw.detailFailed')}</div>
              )}
            </section>

            {/* ── 右侧 · stage head + checklist + detail + history ─────────── */}
            <aside className={css.wsRight} data-testid="change-detail-right">
              {view !== undefined && (
                <>
                  <div className={css.wsStageHead}>
                    <span className={css.wsStageLabel}>{t('ovw.detailStageHead')}</span>
                    <span className={css.wsStageName}>
                      {terminal !== null
                        ? t(`node.${terminal}`)
                        : selectedNode === undefined
                          ? t('ovw.detailSelectStage')
                          : t(`node.${selectedNode.id}`)}
                    </span>
                    {terminal !== null && (
                      <span className={css.wsStageStatus} data-status={terminal}>
                        {t(`status.${terminal}`)}
                      </span>
                    )}
                    {selectedNode !== undefined && (
                      <span className={css.wsStageStatus} data-status={selectedNode.status}>
                        {t(`status.${selectedNode.status}`)}
                      </span>
                    )}
                  </div>
                  <div className={css.wsRightScroll}>
                    {terminal !== null ? (
                      <section className={css.wsCard} data-testid="change-detail-terminal">
                        <div className={css.terminalRow}>
                          <span className={css.intakeKey}>{t('detail.status')}</span>
                          <span className={css.intakeValue}>{t(`status.${terminal}`)}</span>
                        </div>
                        <div className={css.terminalRow}>
                          <span className={css.intakeKey}>{t('detail.artifacts')}</span>
                          <span className={css.intakeValue}>{t(`terminal.${terminal}.artifacts`)}</span>
                        </div>
                        <div className={css.terminalRow}>
                          <span className={css.intakeKey}>{t('detail.completion')}</span>
                          <span className={css.intakeValue}>{t(`terminal.${terminal}.completion`)}</span>
                        </div>
                      </section>
                    ) : selectedNode === undefined ? (
                      <p className={css.wsHint}>{t('ovw.detailStageHint')}</p>
                    ) : (
                      <>
                        <StageChecklist node={selectedNode} t={t} />
                        <section className={css.wsCard}>
                          <BilingualDetail node={selectedNode} t={t} nextEdge={nextEdge} />
                        </section>
                      </>
                    )}
                    <HistoryPanel
                      history={detail?.status === 'ready' ? detail.history : []}
                      t={t}
                    />
                  </div>
                </>
              )}
            </aside>
          </div>
        </div>
      </div>

      {/* 【变更】2026-10-25 (批次二十四 1): the artifact PREVIEW — the same
          window the 测试流图's config files use, so a 文档产物 reads the same
          wherever it is opened. */}
      {preview !== null && (
        <div
          className={css.modalBackdrop}
          data-testid="change-artifact-preview"
          onClick={(event) => { if (event.target === event.currentTarget) setPreview(null) }}
        >
          <div className={css.modal} role="dialog" aria-modal="true" aria-label={t('ovw.artifactPreview')}>
            <div className={css.modalHead}>
              <span className={css.modalTitle}>{t('ovw.artifactPreview')}</span>
              <span className={css.modalPath} title={preview.result?.path ?? preview.path}>
                {preview.result?.path ?? preview.path}
              </span>
              <button
                type="button"
                className={css.modalClose}
                data-testid="change-artifact-preview-close"
                onClick={() => { setPreview(null) }}
              >
                {t('ovw.artifactPreviewClose')}
              </button>
            </div>
            <pre className={css.modalBody} data-testid="change-artifact-preview-body">
              {preview.result === undefined
                ? t('ovw.artifactPreviewLoading')
                : preview.result.status === 'ready' ? preview.result.content
                  : preview.result.status === 'missing' ? t('ovw.artifactPreviewMissing')
                    : `${t('ovw.artifactPreviewFailed')}${preview.result.reason ?? ''}`}
            </pre>
            <div className={css.modalFoot}>
              <button
                type="button"
                className={css.modalAction}
                data-testid="change-artifact-preview-open"
                onClick={() => { openFile(preview.path) }}
              >
                {t('ovw.artifactPreviewOpen')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * 【变更】2026-10-24 (批次二十 3): the change's CLASSIFICATION card — the
 * intake's kind, mode, affected scope, confidence and reasons. It is the
 * ledger's left column: what the change IS, before any stage runs.
 * @param props - the card props.
 * @returns the card element tree.
 */
function IntakeCard(props: { view: WorkflowTabView; t: ChangeOverviewRowProps['t'] }): React.ReactElement {
  const { view, t } = props
  const intake = view.intake
  if (intake === undefined) {
    return (
      <section className={css.wsCard} data-testid="change-detail-intake">
        <h3 className={css.wsCardTitle}>{t('ovw.detailIntake')}</h3>
        <p className={css.wsHint}>{t('ovw.detailEmpty')}</p>
      </section>
    )
  }
  const percent = Math.round(Math.max(0, Math.min(1, intake.confidence)) * 100)
  return (
    <section className={css.wsCard} data-testid="change-detail-intake">
      <h3 className={css.wsCardTitle}>{t('ovw.detailIntake')}</h3>
      <div className={css.intakeRow}>
        <span className={css.intakeKey}>{t('ovw.detailKind')}</span>
        <span className={css.intakeValue}>{intake.kind}</span>
      </div>
      <div className={css.intakeRow}>
        <span className={css.intakeKey}>{t('ovw.columnMode')}</span>
        <span className={css.intakeValue}>{modeLabel(intake.mode, t)}</span>
      </div>
      <div className={css.intakeRow}>
        <span className={css.intakeKey}>{t('ovw.detailScope')}</span>
        <span className={css.intakeValue}>{intake.affectedScope}</span>
      </div>
      <div className={css.intakeRow}>
        <span className={css.intakeKey}>{t('ovw.detailConfidence')}</span>
        <span className={css.intakeValue}>{percent}%</span>
      </div>
      <div className={css.confidence}>
        <span className={css.confidenceFill} style={{ width: `${percent}%` }} />
      </div>
      {intake.reasonCodes.length > 0 && (
        <div className={css.intakeRow}>
          <span className={css.intakeKey}>{t('ovw.detailReason')}</span>
          <span className={css.intakeValue}>{intake.reasonCodes.join(' · ')}</span>
        </div>
      )}
      <div className={css.intakeFlags}>
        {intake.openspecRequired && (
          <span className={css.intakeFlag}>{t('ovw.detailOpenSpec')} ✓</span>
        )}
        {intake.requiresUserConfirmation && (
          <span className={css.intakeFlag} data-tone="warn">{t('ovw.detailConfirmation')}</span>
        )}
      </div>
      {intake.confirmation !== '' && (
        <p className={css.intakeSummary}>{intake.confirmation}</p>
      )}
    </section>
  )
}

/**
 * 【变更】2026-10-24 (批次二十 3): the change's event HISTORY — every
 * projection event, oldest first, as a timeline in the right rail.
 * @param props - the panel props.
 * @returns the panel element tree.
 */
function HistoryPanel(props: {
  history: readonly BafWorkflowChangeHistoryEntry[]
  t: ChangeOverviewRowProps['t']
}): React.ReactElement {
  const { history, t } = props
  return (
    <section className={css.wsCard} data-testid="change-detail-history">
      <h3 className={css.wsCardTitle}>{t('ovw.detailHistory')}</h3>
      {history.length === 0
        ? <p className={css.wsHint} data-testid="change-detail-history-empty">{t('ovw.detailEmpty')}</p>
        : (
          <ol className={css.history}>
            {history.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className={css.historyRow} data-type={entry.type}>
                <span className={css.historyDot} aria-hidden />
                <span className={css.historyAt}>{formatTimestamp(entry.at)}</span>
                <span className={css.historyTitle}>{t(historyKeyOf(entry.type) as WorkflowTabKey)}</span>
                {entry.node !== undefined && (
                  <span className={css.historyNode}>{t(`node.${entry.node}` as WorkflowTabKey)}</span>
                )}
                {entry.gate !== undefined && <span className={css.historyGate}>{entry.gate}</span>}
                {entry.detail !== undefined && <span className={css.historyDetail}>{entry.detail}</span>}
                {entry.reason !== undefined && <span className={css.historyReason}>{entry.reason}</span>}
              </li>
            ))}
          </ol>
        )}
    </section>
  )
}
