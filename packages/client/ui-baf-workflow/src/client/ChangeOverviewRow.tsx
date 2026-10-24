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
 */
import { useCallback, useEffect, useState } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {
  BafWorkflowChangeDetailResult, BafWorkflowChangeOverviewResult,
  BafWorkflowChangeHistoryEntry, WorkflowDashboardRow, WorkflowTabView,
} from './tab-types.ts'
import type { WorkflowTabKey } from './locales.ts'
import { formatDuration, formatTimestamp, formatTokens, modeLabel } from './dashboard-format.ts'
import { buildDashboardHtml, type DashboardHtmlLabels } from './dashboard-html.ts'
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
  const { t, loadChangeOverview, loadChangeDetail } = props
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

  const card = (change: WorkflowDashboardRow) => {
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
        onClick={() => { void openDetail(change.changeId) }}
      >
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
            <span className={css.progressFill} style={{ width: `${percent}%` }} />
            <span className={css.progressText}>{done}/{total}</span>
          </span>
        )}
        <span className={css.cardFoot}>
          <span title={t('card.duration')}>{formatDuration(change.durationMs)}</span>
          <span title={t('card.tokens')}>{formatTokens(change.inputTokens, change.outputTokens)}</span>
          <span title={t('ovw.columnEnded')}>
            {change.endedAt === undefined ? '—' : formatTimestamp(change.endedAt)}
          </span>
        </span>
      </button>
    )
  }

  return (
    <section className={css.block} data-testid="baf-change-overview">
      {/* 【变更】2026-10-24 (批次十九 1.3): the hero header — the ledger's
          identity, its purpose, and the refresh action in one band. */}
      <header className={css.hero}>
        <div className={css.heroText}>
          <h2 className={css.title}>{t('ovw.title')}</h2>
          <p className={css.description}>{t('ovw.help')}</p>
        </div>
        <div className={css.heroActions}>
          <button
            type="button"
            className={css.refresh}
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

          <p className={css.hint}>{t('ovw.clickHint')}</p>

          <div className={css.cards} data-testid="change-overview-cards">
            {result.rows.map(card)}
            {result.rows.length === 0 && (
              <div className={css.empty}>{t('ovw.empty')}</div>
            )}
          </div>
        </>
      )}

      {openChangeId !== undefined && (
        <ChangeDetailModal
          changeId={openChangeId}
          detail={detail}
          loading={detailLoading}
          onClose={() => { setOpenChangeId(undefined); setDetail(undefined) }}
          t={t}
        />
      )}
    </section>
  )
}

/**
 * 【变更】2026-10-24 (批次十九 1.3): the per-change drill-down modal — the
 * stage flow, the artifacts, the metrics, and the full event history.
 * @param props - the modal props.
 * @returns the modal element tree.
 */
function ChangeDetailModal(props: {
  changeId: string
  detail: BafWorkflowChangeDetailResult | undefined
  loading: boolean
  onClose: () => void
  t: ChangeOverviewRowProps['t']
}): React.ReactElement {
  const { changeId, detail, loading, onClose, t } = props
  const view = detail?.status === 'ready' ? detail.view : undefined

  return (
    <div
      className={css.backdrop}
      role="presentation"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <div
        className={css.modal}
        role="dialog"
        aria-modal="true"
        aria-label={t('ovw.detailTitle')}
        data-testid="change-detail-modal"
        onClick={(event) => { event.stopPropagation() }}
      >
        <header className={css.modalHead}>
          <div>
            <div className={css.modalTitle}>{t('ovw.detailTitle')}</div>
            <div className={css.modalId}>{changeId}</div>
          </div>
          <button type="button" className={css.modalClose} onClick={onClose}>
            {t('ovw.detailClose')}
          </button>
        </header>

        <div className={css.modalBody}>
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
          {view !== undefined && detail?.status === 'ready' && (
            <>
              <StageFlow view={view} t={t} />
              <ArtifactList view={view} t={t} />
              <MetricLine view={view} t={t} />
              <HistoryList history={detail.history} t={t} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The change's stage flow — the on-path stages in order, each with its
 * recorded state, the current one highlighted.
 * @param props - the flow props.
 * @returns the flow element tree.
 */
function StageFlow(props: { view: WorkflowTabView; t: ChangeOverviewRowProps['t'] }): React.ReactElement {
  const { view, t } = props
  const stages = view.nodes.filter(node => node.onPath)
  return (
    <section className={css.section} data-testid="change-detail-flow">
      <h3 className={css.sectionTitle}>{t('ovw.detailFlow')}</h3>
      <ol className={css.flow}>
        {stages.map((node, index) => {
          const current = view.current === node.id
          return (
            <li key={node.id} className={css.flowStage} data-status={node.status} data-current={current ? 'true' : undefined}>
              <span className={css.flowDot} />
              {index < stages.length - 1 && <span className={css.flowLink} />}
              <span className={css.flowName}>{t(`node.${node.id}`)}</span>
              <span className={css.flowStatus}>{t(`status.${node.status}`)}</span>
            </li>
          )
        })}
        {(view.current === 'completed' || view.current === 'abandoned') && (
          <li className={css.flowStage} data-status={view.current} data-current="true">
            <span className={css.flowDot} />
            <span className={css.flowName}>
              {view.current === 'completed' ? t('status.completed') : t('status.abandoned')}
            </span>
          </li>
        )}
      </ol>
    </section>
  )
}

/**
 * The change's artifacts — one chip per file with its recorded state.
 * @param props - the artifact props.
 * @returns the artifact element tree.
 */
function ArtifactList(props: { view: WorkflowTabView; t: ChangeOverviewRowProps['t'] }): React.ReactElement {
  const { view, t } = props
  const artifacts = view.artifacts ?? []
  return (
    <section className={css.section} data-testid="change-detail-artifacts">
      <h3 className={css.sectionTitle}>{t('ovw.detailArtifacts')}</h3>
      {artifacts.length === 0
        ? <div className={css.status}>—</div>
        : (
          <ul className={css.artifacts}>
            {artifacts.map(artifact => (
              <li key={artifact.file} className={css.artifact} data-state={artifact.state} title={artifact.path}>
                <span className={css.artifactFile}>{artifact.file}</span>
                <span className={css.artifactState}>{t(`artifact.state.${artifact.state}`)}</span>
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}

/**
 * The change's headline numbers — elapsed time and tokens.
 * @param props - the metric props.
 * @returns the metric element tree.
 */
function MetricLine(props: { view: WorkflowTabView; t: ChangeOverviewRowProps['t'] }): React.ReactElement {
  const { view, t } = props
  const metrics = view.metrics
  return (
    <section className={css.section} data-testid="change-detail-metrics">
      <h3 className={css.sectionTitle}>{t('ovw.detailMetrics')}</h3>
      <div className={css.metrics}>
        <span className={css.metric} title={t('strip.startedAt')}>
          <span className={css.metricLabel}>{t('strip.startedAt')}</span>
          <span className={css.metricValue}>{formatTimestamp(view.startedAt)}</span>
        </span>
        <span className={css.metric} title={t('card.duration')}>
          <span className={css.metricLabel}>{t('card.duration')}</span>
          <span className={css.metricValue}>{formatDuration(metrics?.totalDurationMs)}</span>
        </span>
        <span className={css.metric} title={t('card.tokens')}>
          <span className={css.metricLabel}>{t('card.tokens')}</span>
          <span className={css.metricValue}>
            {formatTokens(metrics?.totalInputTokens, metrics?.totalOutputTokens)}
          </span>
        </span>
      </div>
    </section>
  )
}

/**
 * The change's event history — every projection event, oldest first.
 * @param props - the history props.
 * @returns the history element tree.
 */
function HistoryList(props: {
  history: readonly BafWorkflowChangeHistoryEntry[]
  t: ChangeOverviewRowProps['t']
}): React.ReactElement {
  const { history, t } = props
  return (
    <section className={css.section} data-testid="change-detail-history">
      <h3 className={css.sectionTitle}>{t('ovw.detailHistory')}</h3>
      {history.length === 0
        ? <div className={css.status} data-testid="change-detail-history-empty">{t('ovw.detailEmpty')}</div>
        : (
          <ol className={css.history}>
            {history.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className={css.historyRow} data-type={entry.type}>
                <span className={css.historyAt}>{formatTimestamp(entry.at)}</span>
                <span className={css.historyTitle}>{t(historyKeyOf(entry.type) as Parameters<typeof t>[0])}</span>
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
