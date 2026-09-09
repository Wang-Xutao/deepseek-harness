/**
 * BAF go-workflow Tab: theme-following flowchart with pan/zoom and click-expand.
 */
import {
  useCallback, useEffect, useMemo, useRef, useState,
  type KeyboardEvent, type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import clsx from 'clsx'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkflowTabView, WorkflowTabNodeView, WorkflowNodeId } from './tab-types.ts'
import type { WorkflowTabKey } from './locales.ts'
import { CATALOG_ZH } from './catalog-i18n.ts'
import { buildClientTemplateTabView, withRenderableGraph } from './graph-template.ts'
import { NodeIcon } from './icons.tsx'
import css from './WorkflowView.module.css'

/** Session-bound workflow Remote callbacks. */
export interface WorkflowViewInjected {
  refresh: () => Promise<WorkflowTabView>
  confirmIntake: (changeId: string) => Promise<WorkflowTabView>
  rejectIntake: (changeId: string) => Promise<WorkflowTabView>
  startIntake: (description: string) => Promise<WorkflowTabView>
  transition: (changeId: string, to: 'open') => Promise<WorkflowTabView>
}

export type WorkflowViewProps =
  & ConvViewProps
  & PropsLocale<'baf.go-workflow'>
  & InjectFace<WorkflowViewInjected>

const COL_W = 248
const ROW_H = 128
const NODE_W = 208
const NODE_H = 96
const RAIL_MIN = 280
const RAIL_MAX = 560
const RAIL_DEFAULT = 360
const ZOOM_MIN = 0.55
const ZOOM_MAX = 1.8

function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms <= 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return `${m}m${s}s`
}

function formatTokens(input?: number, output?: number): string {
  if (input === undefined && output === undefined) return '—'
  const total = (input ?? 0) + (output ?? 0)
  return total === 0 ? '—' : String(total)
}

function statusClass(status: WorkflowTabNodeView['status']): string {
  switch (status) {
    case 'completed': return css.statusCompleted ?? ''
    case 'in-progress': return css.statusInProgress ?? ''
    case 'failed':
    case 'blocked': return css.statusFailed ?? ''
    case 'drifted':
    case 'skipped': return css.statusDrifted ?? ''
    default: return css.statusIdle ?? ''
  }
}

function modeLabel(mode: string, t: (key: WorkflowTabKey) => string): string {
  switch (mode) {
    case 'template': return t('mode.template')
    case 'full-go': return t('mode.fullGo')
    case 'bug-fast-path': return t('mode.fastPath')
    case 'clarify-required': return t('mode.clarify')
    default: return mode
  }
}

/**
 * Whether a catalog action is treated as done for checkbox display.
 * Phase 4 has stage-level status only; completed/skipped stages check all items.
 * @param status - node status.
 * @returns true when the stage is finished.
 */
function stageActionsDone(status: WorkflowTabNodeView['status'] | undefined): boolean {
  return status === 'completed' || status === 'skipped'
}

function RailSplitter(props: {
  width: number
  onChange: (next: number) => void
}): React.ReactElement {
  const { width, onChange } = props
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; width: number } | null>(null)

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    start.current = { x: event.clientX, width }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [width])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (start.current === null) return
    onChange(Math.min(RAIL_MAX, Math.max(RAIL_MIN, start.current.width - (event.clientX - start.current.x))))
  }, [onChange])

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    start.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  return (
    <div
      className={css.splitter}
      data-dragging={dragging ? 'true' : undefined}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={RAIL_MIN}
      aria-valuemax={RAIL_MAX}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  )
}

/**
 * Render the BAF workflow flowchart Tab.
 * @param props - conversation view props + inject face.
 */
export function WorkflowView(props: WorkflowViewProps): React.ReactElement {
  const { t, refresh, confirmIntake, rejectIntake, startIntake, transition, useProjection } = props
  const preset = useProjection('agentPreset')
  const [view, setView] = useState<WorkflowTabView>(() => withRenderableGraph(buildClientTemplateTabView()))
  const [selected, setSelected] = useState<WorkflowNodeId | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [railWidth, setRailWidth] = useState(RAIL_DEFAULT)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const panDrag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const panned = useRef(false)

  const applyView = useCallback((next: WorkflowTabView) => {
    const safe = withRenderableGraph(next)
    setView(safe)
    setError(safe.blockedReason ?? null)
    if (safe.current !== null
      && safe.current !== 'completed' && safe.current !== 'abandoned') {
      setSelected(safe.current)
    }
  }, [])

  const run = useCallback(async (op: () => Promise<WorkflowTabView>) => {
    setBusy(true)
    setError(null)
    try {
      applyView(await op())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      // Keep the already-painted graph; only annotate the strip error.
    } finally {
      setBusy(false)
    }
  }, [applyView])

  useEffect(() => {
    if (preset !== 'baf') return
    void run(() => refresh())
  }, [preset, refresh, run])

  const selectedNode = useMemo(
    () => view.nodes.find(n => n.id === selected) ?? null,
    [view, selected],
  )

  const nextEdge = useMemo(() => {
    if (view.current === null) return null
    return view.graph.edges.find(e => e.from === view.current && e.kind === 'forward')
      ?? view.graph.edges.find(e => e.from === view.current)
      ?? null
  }, [view])

  const nodeById = useMemo(() => {
    const map = new Map<string, WorkflowTabNodeView>()
    for (const n of view.nodes) map.set(n.id, n)
    return map
  }, [view])

  const placements = view.graph.nodes
  const maxCol = Math.max(0, ...placements.map(p => p.column))
  const maxRow = Math.max(0, ...placements.map(p => p.row))
  const canvasW = (maxCol + 1) * COL_W + 56
  const canvasH = (maxRow + 1) * ROW_H + 72

  const pos = (id: string): { x: number; y: number } | undefined => {
    const p = placements.find(n => n.id === id)
    if (p === undefined) return undefined
    return { x: 28 + p.column * COL_W, y: 28 + p.row * ROW_H }
  }

  const onCardActivate = (id: string, isTerminal: boolean) => {
    if (!isTerminal) setSelected(id as WorkflowNodeId)
  }

  const onNodeKey = (id: WorkflowNodeId, isTerminal: boolean) => (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onCardActivate(id, isTerminal)
    }
  }

  const onCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 2) return
    event.preventDefault()
    panned.current = false
    panDrag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panDrag.current === null) return
    const dx = event.clientX - panDrag.current.x
    const dy = event.clientY - panDrag.current.y
    if (Math.abs(dx) + Math.abs(dy) > 3) panned.current = true
    setPan({
      x: panDrag.current.panX + dx,
      y: panDrag.current.panY + dy,
    })
  }

  const onCanvasPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    panDrag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onCanvasWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return
    event.preventDefault()
    const delta = event.deltaY > 0 ? -0.08 : 0.08
    setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number((z + delta).toFixed(2)))))
  }

  if (preset !== 'baf') {
    return <div className={css.root} data-conversation-composer-overlay="" />
  }

  return (
    <div className={css.root} data-conversation-composer-overlay="">
      <div className={css.strip} role="status">
        <span className={css.stripBrand}>BAF</span>
        <span className={css.stripItem}>
          <span className={css.stripLabel}>{t('strip.current')}</span>
          <span className={css.stripValue}>
            {view.current === null
              ? t('strip.idle')
              : t(`node.${view.current}` as WorkflowTabKey)}
          </span>
        </span>
        <span className={css.stripItem} title={t('mode.help')}>
          <span className={css.stripLabel}>{t('strip.mode')}</span>
          <span className={css.stripValue}>{modeLabel(view.mode, t)}</span>
        </span>
        <span className={css.stripItem}>
          <span className={css.stripLabel}>{t('strip.totalTime')}</span>
          <span className={css.stripValue}>{formatDuration(view.metrics?.totalDurationMs)}</span>
        </span>
        <span className={css.stripItem} title={t('metrics.pending')}>
          <span className={css.stripLabel}>{t('strip.totalTokens')}</span>
          <span className={css.stripValue}>
            {formatTokens(view.metrics?.totalInputTokens, view.metrics?.totalOutputTokens)}
          </span>
        </span>
        {view.empty && (
          <span className={clsx(css.stripItem, css.stripMuted)} title={t('mode.help')}>
            {t('strip.empty')}
          </span>
        )}
        {busy && (
          <span className={clsx(css.stripItem, css.stripMuted)}>{t('action.refresh')}…</span>
        )}
        {error !== null && (
          <span className={clsx(css.stripItem, css.stripBlocked)}>
            <span className={css.stripLabel}>{t('strip.blocked')}</span>
            <span className={css.stripValue}>{error}</span>
          </span>
        )}
        <button
          type="button"
          className={clsx(css.btn, css.btnGhost)}
          disabled={busy}
          onClick={() => setDashboardOpen(true)}
        >
          {t('action.dashboard')}
        </button>
        <button
          type="button"
          className={clsx(css.btn, css.btnGhost)}
          disabled={busy}
          onClick={() => void run(() => refresh())}
        >
          {t('action.refresh')}
        </button>
      </div>

      {view.openspecSkipped?.skipped === true && (
        <div className={css.banner}>
          {t('openspec.skipped')}: {view.openspecSkipped.reasonCodes.join(', ')}
        </div>
      )}

      <div className={css.body}>
        <div className={css.main}>
          <div
            className={css.graphWrap}
            onContextMenu={event => event.preventDefault()}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerUp}
            onWheel={onCanvasWheel}
          >
            <div
              className={css.flowWorld}
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            >
              <div
                className={css.flowCanvas}
                style={{ width: canvasW, height: canvasH }}
                role="img"
                aria-label={t('graph.aria')}
              >
                <div className={css.flowGlow} aria-hidden />
                <svg
                  className={css.flowEdges}
                  viewBox={`0 0 ${canvasW} ${canvasH}`}
                  width={canvasW}
                  height={canvasH}
                  aria-hidden
                >
                  <defs>
                    <marker
                      id="wf-arrow"
                      viewBox="0 0 10 10"
                      refX="8"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" className={css.arrowHead} />
                    </marker>
                  </defs>
                  {(view.graph.edges).map((edge) => {
                    const fromId = edge.from ?? 'intake'
                    const a = pos(fromId)
                    const b = pos(String(edge.to))
                    if (a === undefined || b === undefined) return null
                    const x1 = a.x + NODE_W / 2
                    const y1 = edge.from === null ? a.y : a.y + NODE_H
                    const x2 = b.x + NODE_W / 2
                    const y2 = b.y
                    const mid = (y1 + y2) / 2
                    const active = view.current !== null && (
                      edge.from === view.current || edge.to === view.current
                    )
                    return (
                      <path
                        key={edge.id}
                        d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`}
                        className={clsx(
                          css.edge,
                          edge.kind === 'forward' && css.edgeForward,
                          edge.kind === 'loop' && css.edgeLoop,
                          edge.kind === 'cross' && css.edgeCross,
                          edge.kind === 'entry' && css.edgeEntry,
                          active && css.edgeActive,
                        )}
                        markerEnd="url(#wf-arrow)"
                      >
                        <title>{`${edge.id}: ${edge.condition}`}</title>
                      </path>
                    )
                  })}
                </svg>

                {placements.map((placement, index) => {
                  const p = pos(placement.id)
                  if (p === undefined) return null
                  const node = nodeById.get(placement.id)
                  const isTerminal = placement.id === 'completed' || placement.id === 'abandoned'
                  const isCurrent = view.current === placement.id
                  const isSelected = selected === placement.id
                  const label = t(`node.${placement.id}` as WorkflowTabKey)
                  const statusLabel = node === undefined
                    ? t('status.template')
                    : t(`status.${node.status}` as WorkflowTabKey)

                  return (
                    <div
                      key={placement.id}
                      className={clsx(
                        css.flowNode,
                        isCurrent && css.nodeCurrent,
                        isSelected && css.nodeSelected,
                        !placement.onPath && css.nodeOffPath,
                      )}
                      style={{
                        left: p.x,
                        top: p.y,
                        width: NODE_W,
                        minHeight: NODE_H,
                        animationDelay: `${index * 35}ms`,
                      }}
                      tabIndex={isTerminal ? -1 : 0}
                      role="button"
                      aria-label={`${label}: ${statusLabel}${isCurrent ? ` · ${t('card.current')}` : ''}`}
                      aria-pressed={isSelected}
                      onClick={(event) => {
                        event.stopPropagation()
                        onCardActivate(placement.id, isTerminal)
                      }}
                      onKeyDown={isTerminal ? undefined : onNodeKey(placement.id as WorkflowNodeId, false)}
                    >
                      <div className={css.flowNodeHead}>
                        <span className={css.nodeIcon}><NodeIcon id={placement.id} /></span>
                        <div className={css.flowNodeTitles}>
                          <span className={css.nodeLabel}>{label}</span>
                          <span className={clsx(css.nodeBadge, node ? statusClass(node.status) : css.statusIdle)}>
                            {statusLabel}
                          </span>
                        </div>
                        {isCurrent && <span className={css.currentPill}>{t('card.current')}</span>}
                      </div>
                      <div className={css.flowMetrics}>
                        <span>{t('card.duration')} {formatDuration(node?.metrics?.durationMs)}</span>
                        <span title={t('metrics.pending')}>
                          {t('card.tokens')} {formatTokens(node?.metrics?.inputTokens, node?.metrics?.outputTokens)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {view.empty && (
            <div className={css.toolbar}>
              <input
                className={css.intakeInput}
                value={draft}
                placeholder={t('empty.hint')}
                onChange={e => setDraft(e.target.value)}
                disabled={busy}
              />
              <button
                type="button"
                className={clsx(css.btn, css.btnPrimary)}
                disabled={busy || draft.trim() === ''}
                title={t('action.newChangeHelp')}
                onClick={() => void run(async () => {
                  const next = await startIntake(draft.trim())
                  setDraft('')
                  return next
                })}
              >
                {t('action.newChange')}
              </button>
            </div>
          )}
        </div>

        <RailSplitter width={railWidth} onChange={setRailWidth} />

        <aside className={css.rail} style={{ width: railWidth }}>
          <div className={css.railScroll}>
            {view.intake !== undefined && view.intake.confirmation === 'pending' && (
              <section className={clsx(css.card, css.cardAccent)} aria-label={t('intake.title')}>
                <h3 className={css.cardTitle}>{t('intake.title')}</h3>
                <p className={css.hint}>{t('intake.help')}</p>
                <div className={css.metaRow}>
                  <span className={css.metaKey}>{t('intake.kind')}</span>
                  <span>{view.intake.kind}</span>
                  <span className={css.metaKey}>{t('intake.mode')}</span>
                  <span>{view.intake.mode}</span>
                  <span className={css.metaKey}>{t('intake.scope')}</span>
                  <span>{view.intake.affectedScope}</span>
                  <span className={css.metaKey}>{t('intake.confidence')}</span>
                  <span>{(view.intake.confidence * 100).toFixed(0)}%</span>
                  <span className={css.metaKey}>{t('intake.summary')}</span>
                  <span>{view.intake.summary}</span>
                </div>
                <div className={css.actions}>
                  <button
                    type="button"
                    className={clsx(css.btn, css.btnPrimary)}
                    disabled={busy || view.changeId === null}
                    onClick={() => {
                      const changeId = view.changeId
                      if (changeId !== null) void run(() => confirmIntake(changeId))
                    }}
                  >
                    {t('intake.confirm')}
                  </button>
                  <button type="button" className={clsx(css.btn, css.btnGhost)} disabled={busy}>
                    {t('intake.supplement')}
                  </button>
                  <button
                    type="button"
                    className={clsx(css.btn, css.btnDanger)}
                    disabled={busy || view.changeId === null}
                    onClick={() => {
                      const changeId = view.changeId
                      if (changeId !== null) void run(() => rejectIntake(changeId))
                    }}
                  >
                    {t('intake.reject')}
                  </button>
                </div>
              </section>
            )}

            {selectedNode !== null && (
              <section className={clsx(css.card, css.cardChecklist)} aria-label={t('detail.checklist')}>
                <h3 className={css.cardTitle}>
                  {t('detail.checklist')}
                  <span className={css.checklistStage}>
                    {t(`node.${selectedNode.id}` as WorkflowTabKey)}
                  </span>
                </h3>
                <StageChecklist node={selectedNode} t={t} />
              </section>
            )}

            <section className={css.card} aria-label={t('detail.title')}>
              <h3 className={css.cardTitle}>{t('detail.title')}</h3>
              {selectedNode === null ? (
                <p className={css.hint}>{t('detail.empty')}</p>
              ) : (
                <BilingualDetail node={selectedNode} t={t} nextEdge={nextEdge} />
              )}
            </section>

            <section className={css.card}>
              <p className={css.hint}>{t('action.newChangeHelp')}</p>
              <div className={css.actions}>
                {view.actions.map((action) => {
                  if (action.id === 'confirm-intake' || action.id === 'reject-intake'
                    || action.id === 'supplement-intake') {
                    return null
                  }
                  const label = t(
                    action.id === 'transition'
                      ? 'action.enterOpen'
                      : action.id === 'start-stage'
                        ? 'action.startStage'
                        : action.id === 'confirm-archive'
                          ? 'action.confirmArchive'
                          : 'action.newChange',
                  )
                  return (
                    <button
                      key={`${action.id}-${action.target ?? ''}`}
                      type="button"
                      className={clsx(css.btn, action.enabled ? css.btnPrimary : css.btnGhost)}
                      disabled={busy || !action.enabled || view.changeId === null}
                      title={action.reason}
                      onClick={() => {
                        const changeId = view.changeId
                        if (action.id === 'transition' && changeId !== null) {
                          void run(() => transition(changeId, 'open'))
                        }
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </section>
          </div>
        </aside>
      </div>

      {dashboardOpen && (
        <div
          className={css.dashboardBackdrop}
          role="presentation"
          onClick={() => setDashboardOpen(false)}
        >
          <div
            className={css.dashboardPanel}
            role="dialog"
            aria-modal="true"
            aria-label={t('dashboard.title')}
            onClick={event => event.stopPropagation()}
          >
            <div className={css.dashboardHead}>
              <h2 className={css.dashboardTitle}>{t('dashboard.title')}</h2>
              <button
                type="button"
                className={clsx(css.btn, css.btnGhost)}
                onClick={() => setDashboardOpen(false)}
              >
                {t('dashboard.close')}
              </button>
            </div>
            <p className={css.hint}>{t('dashboard.help')}</p>
            {view.changes.length === 0 ? (
              <p className={css.hint}>{t('dashboard.empty')}</p>
            ) : (
              <ul className={css.dashboardList}>
                {view.changes.map((change) => {
                  const focused = change.changeId === view.selectedChangeId
                    || change.changeId === view.changeId
                  const stageKey = `node.${String(change.current)}` as WorkflowTabKey
                  const stageLabel = t(stageKey)
                  return (
                    <li
                      key={change.changeId}
                      className={clsx(css.dashboardItem, focused && css.dashboardItemFocus)}
                    >
                      <div className={css.dashboardItemMain}>
                        <span className={css.dashboardId}>{change.changeId}</span>
                        <span className={css.dashboardMeta}>
                          {modeLabel(change.mode, t)} · {stageLabel}
                        </span>
                      </div>
                      {focused && <span className={css.currentPill}>{t('dashboard.focus')}</span>}
                    </li>
                  )
                })}
              </ul>
            )}
            <p className={css.hint}>{t('dashboard.note')}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function StageChecklist(props: {
  node: WorkflowTabNodeView
  t: (key: WorkflowTabKey) => string
}): React.ReactElement {
  const { node, t } = props
  const zh = CATALOG_ZH[node.id]
  const actions = node.catalog.actions
  const done = stageActionsDone(node.status)
  const todo = done ? [] : [...actions]
  const finished = done ? [...actions] : []

  return (
    <div className={css.checklist}>
      <div className={css.checklistBlock}>
        <div className={css.checklistHead}>{t('detail.todoTitle')}</div>
        {todo.length === 0 ? (
          <p className={css.hint}>{t('detail.todoEmpty')}</p>
        ) : (
          <ul className={css.flowOps}>
            {todo.map((action, index) => {
              const actionIndex = actions.indexOf(action)
              return (
                <li key={`todo-${index}`} className={css.flowOpItem}>
                  <span className={css.flowCheck} aria-hidden />
                  <span className={css.flowOpZh}>
                    {zh?.actions[actionIndex] ?? action}
                  </span>
                  <span className={css.flowOpState}>{t('card.todo')}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {finished.length > 0 && (
        <div className={css.checklistBlock}>
          <div className={css.checklistHead}>{t('detail.doneTitle')}</div>
          <ul className={css.flowOps}>
            {finished.map((action, index) => {
              const actionIndex = actions.indexOf(action)
              return (
                <li key={`done-${index}`} className={css.flowOpItem}>
                  <span className={clsx(css.flowCheck, css.flowCheckDone)} aria-hidden>✓</span>
                  <span className={clsx(css.flowOpZh, css.flowOpDone)}>
                    {zh?.actions[actionIndex] ?? action}
                  </span>
                  <span className={css.flowOpState}>{t('card.done')}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function BilingualDetail(props: {
  node: WorkflowTabNodeView
  t: (key: WorkflowTabKey) => string
  nextEdge: { id: string; to: string; condition: string } | null
}): React.ReactElement {
  const { node, t, nextEdge } = props
  const zh = CATALOG_ZH[node.id]
  const sections: Array<{
    title: WorkflowTabKey
    en: readonly string[]
    zhItems?: readonly string[]
    enBlock?: string
    zhBlock?: string
  }> = [
    {
      title: 'detail.purpose',
      en: [],
      enBlock: node.catalog.purpose,
      ...(zh?.purpose === undefined ? {} : { zhBlock: zh.purpose }),
    },
    {
      title: 'detail.prerequisites',
      en: node.catalog.prerequisites,
      ...(zh?.prerequisites === undefined ? {} : { zhItems: zh.prerequisites }),
    },
    {
      title: 'detail.artifacts',
      en: node.catalog.artifacts,
      ...(zh?.artifacts === undefined ? {} : { zhItems: zh.artifacts }),
    },
    {
      title: 'detail.completion',
      en: node.catalog.completion,
      ...(zh?.completion === undefined ? {} : { zhItems: zh.completion }),
    },
    {
      title: 'detail.failure',
      en: node.catalog.failure,
      ...(zh?.failure === undefined ? {} : { zhItems: zh.failure }),
    },
  ]

  return (
    <>
      <div className={css.metaRow}>
        <span className={css.metaKey}>{t('detail.status')}</span>
        <span>{t(`status.${node.status}` as WorkflowTabKey)}</span>
        <span className={css.metaKey}>{t('card.duration')}</span>
        <span>{formatDuration(node.metrics?.durationMs)}</span>
        <span className={css.metaKey}>{t('card.tokens')}</span>
        <span title={t('metrics.pending')}>
          {formatTokens(node.metrics?.inputTokens, node.metrics?.outputTokens)}
        </span>
        {nextEdge !== null && (
          <>
            <span className={css.metaKey}>{t('card.next')}</span>
            <span>{nextEdge.id} → {nextEdge.to}</span>
            <span className={css.metaKey}>{t('card.condition')}</span>
            <span>{nextEdge.condition}</span>
          </>
        )}
      </div>
      {sections.map((section) => {
        const hasBlock = section.enBlock !== undefined || section.zhBlock !== undefined
        const hasList = section.en.length > 0
        if (!hasBlock && !hasList) return null
        return (
          <div key={section.title} className={css.biSection}>
            <div className={css.metaKey}>{t(section.title)}</div>
            {section.zhBlock !== undefined && (
              <p className={css.biZh}><span className={css.biTag}>{t('detail.zh')}</span>{section.zhBlock}</p>
            )}
            {section.enBlock !== undefined && (
              <p className={css.biEn}><span className={css.biTag}>{t('detail.en')}</span>{section.enBlock}</p>
            )}
            {hasList && (
              <ul className={css.list}>
                {section.en.map((item, index) => (
                  <li key={item}>
                    {section.zhItems?.[index] !== undefined && (
                      <div className={css.biZh}>{section.zhItems[index]}</div>
                    )}
                    <div className={css.biEn}>{item}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </>
  )
}
