/**
 * 【变更】2026-10-24 (批次二十 3): the flow graph canvas, extracted from
 * `WorkflowView.tsx` into its own module.
 *
 * Why: the 变更总览's per-change detail page must show the SAME graph as the
 * session's 工作流图 (the customer asked for it explicitly), and a 350-line
 * pan/zoom canvas copied into a second file would be two graphs that drift
 * apart on the next change. The canvas is now ONE component with two hosts.
 *
 * What changed against the session's original copy:
 * - the SVG arrow marker id is per-instance (`useId`), because the session tab
 *   and the detail page can be mounted at the SAME time (the detail page is a
 *   layer over the ledger, which lives on the 工作流 page — two canvases, one
 *   document). A fixed `wf-arrow` id would make the second canvas's arrows
 *   inherit the first one's marker.
 * - the layout constants and the stage helpers come from `flow-parts.tsx`.
 */
import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import clsx from 'clsx'
import type { TestFlowStepId, WorkflowNodeId, WorkflowTabNodeView, WorkflowTabView } from './tab-types.ts'
import type { WorkflowTabKey } from './locales.ts'
import { conditionTextOf } from './graph-template.ts'
import { NodeIcon } from './icons.tsx'
import { routeBadgeText } from './RouteStatusRow.tsx'
import { formatDuration, formatTokens } from './dashboard-format.ts'
import {
  artifactName,
  COL_W,
  NODE_H,
  NODE_W,
  ROW_H,
  stageDuration,
  stageTokens,
  statusClass,
  TEST_FLOW_JUMPS,
  TEST_FLOW_JUMP_LABEL,
  ZOOM_MAX,
  ZOOM_MIN,
  clamp,
  type WorkflowFlowControls,
} from './flow-parts.tsx'
import css from './WorkflowView.module.css'

/**
 * The flow graph canvas — pan / zoom / the node cards and their edges.
 * Selection stays lifted (`selected` + `onActivate`) because the rail and the
 * detail panel read it.
 */
export function FlowCanvas(props: {
  view: WorkflowTabView
  selected: WorkflowNodeId | null
  onActivate: (id: string) => void
  /** Opens one node artifact in the sidebar. */
  onOpenArtifact: (path: string) => void
  /**
   * The 测试流图 jump chips' channel — select the session's 测试流图 tab and
   * address a `stage:<id>` focus to it.
   *
   * 【变更】2026-10-24 (批次二十 3): OPTIONAL. The 变更总览's per-change detail
   * page hosts this same canvas, but it is a PROJECT-level surface with no
   * conversation behind it — there is no session 测试流图 tab to switch to. The
   * chip is a NAVIGATION affordance, not part of the graph's semantics, so
   * without a channel it is not rendered at all: a dead button that looks
   * clickable is worse than an absent one. Everything else about the graph —
   * nodes, edges, statuses, artifact chips, route badges — stays identical.
   */
  onOpenTestFlow?: (stage: TestFlowStepId) => void
  /**
   * 【变更】2026-10-27 (批次三十): the graph's top-right toolbar — the buttons
   * that operate the flow (推进 / 暂停 / 继续). Absent on a surface that cannot
   * operate the change (the 变更总览 detail page has no session behind it).
   */
  controls?: WorkflowFlowControls
  /**
   * 【变更】2026-10-27 (批次三十): the stages whose artifact is stale — an
   * upstream document was edited after it was written. Those cards wear a
   * warning badge, so the graph itself says where the documents disagree.
   */
  driftNodes?: readonly WorkflowNodeId[]
  t: (key: WorkflowTabKey) => string
}): React.ReactElement {
  const { view, selected, onActivate, onOpenArtifact, onOpenTestFlow, controls, driftNodes, t } = props
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const panDrag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const markerId = useId()

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

  const onNodeKey = (id: WorkflowNodeId) => (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onActivate(id)
    }
  }

  const onCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 2) return
    event.preventDefault()
    panDrag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panDrag.current === null) return
    const dx = event.clientX - panDrag.current.x
    const dy = event.clientY - panDrag.current.y
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
    if (event.ctrlKey) {
      event.preventDefault()
      const delta = event.deltaY > 0 ? -0.08 : 0.08
      setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number((z + delta).toFixed(2)))))
      return
    }
    // The plain wheel pans the graph vertically (shift+wheel pans
    // horizontally) — the flow outgrew the viewport and drag-pan needed a
    // right-click, which nobody discovers. Clamped so the canvas can never
    // pan fully out of sight.
    event.preventDefault()
    setPan(p => ({
      x: event.shiftKey ? clamp(p.x - event.deltaY, -(canvasW + 80), 80) : p.x,
      y: clamp(p.y - event.deltaY, -(canvasH * zoom + 80), 80),
    }))
  }

  return (
    <div
      className={css.graphWrap}
      onContextMenu={(event) => { event.preventDefault() }}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={onCanvasPointerUp}
      onPointerCancel={onCanvasPointerUp}
      onWheel={onCanvasWheel}
    >
      {/* 【变更】2026-10-27 (批次三十): the graph's floating toolbar. It lives
          OUTSIDE the pan/zoom world, so it stays put while the graph moves.
          【变更】2026-10-27 (批次三十一): the toolbar is now only the buttons
          that OPERATE the flow — 「推进」then「暂停」/「继续」. The change's
          identity tag left it (the customer asked), and the 「同步」button
          moved into the out-of-sync notice, where it exists only while
          something is actually out of sync. */}
      <div className={css.graphOverlay}>
        {controls !== undefined && (
          <>
            {controls.onAdvance !== undefined && controls.advanceReady === true && (
              <button
                type="button"
                className={css.toolBtn}
                data-testid="flow-advance"
                title={t('flow.advanceHelp')}
                onClick={() => { controls.onAdvance?.() }}
              >
                {t('action.advance')}
              </button>
            )}
            <button
              type="button"
              className={css.toolBtn}
              data-testid="flow-toggle-pause"
              title={controls.paused ? t('flow.resumeHelp') : t('flow.pauseHelp')}
              aria-pressed={controls.paused}
              disabled={controls.pauseDisabled === true}
              onClick={() => { controls.onTogglePause() }}
            >
              {controls.paused ? t('flow.resumeWorkflow') : t('flow.pauseWorkflow')}
            </button>
          </>
        )}
      </div>
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
                id={markerId}
                viewBox="0 0 10 10"
                refX="8"
                refY={5}
                markerWidth={6}
                markerHeight={6}
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className={css.arrowHead} />
              </marker>
            </defs>
            {(view.graph.edges).map((edge) => {
              const fromId = edge.from ?? 'intake'
              const a = pos(fromId)
              const b = pos(edge.to)
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
                  markerEnd={`url(#${markerId})`}
                >
                  <title>{conditionTextOf(edge)}</title>
                </path>
              )
            })}
          </svg>

          {placements.map((placement, index) => {
            const p = pos(placement.id)
            if (p === undefined) return null
            const node = nodeById.get(placement.id)
            const isCurrent = view.current === placement.id
            const isSelected = selected === placement.id
            // A parked gate is its own visual state — deliberately not the
            // `blocked` styling, because nothing is wrong and the customer's
            // one action is the way forward.
            const isGate = view.gate?.node === placement.id
            const label = t(`node.${placement.id}`)
            // Terminal cards carry their outcome (已完成 / 已放弃); on a terminal
            // change the opposite outcome card reads 已忽略 — never the template
            // 空闲 (nothing is idle after the flow ended).
            const terminalBadge = (): { label: string; cls: string } | null => {
              if (placement.id !== 'completed' && placement.id !== 'abandoned') return null
              if (view.current === placement.id) {
                return placement.id === 'completed'
                  ? { label: t('status.completed'), cls: css.statusCompleted ?? '' }
                  : { label: t('status.abandoned'), cls: css.statusFailed ?? '' }
              }
              if (view.current === 'completed' || view.current === 'abandoned') {
                return { label: t('status.skipped'), cls: css.statusIdle ?? '' }
              }
              return null
            }
            const badge = terminalBadge()
            // bug-fix parity — the off-path clarify/design nodes are the stages
            // this mode CLIPPED; they read 「已裁剪」 instead of 空闲, mirroring
            // the full-go graph shape.
            const isClipped = view.mode === 'bug-fix-path' && !placement.onPath
              && placement.id !== 'completed' && placement.id !== 'abandoned'
            const statusLabel = isGate
              ? t('status.awaiting')
              : badge !== null
                ? badge.label
                : isClipped
                  ? t('status.clipped')
                  : node === undefined
                    ? t('status.template')
                    : t(`status.${node.status}`)

            return (
              <div
                key={placement.id}
                className={clsx(
                  css.flowNode,
                  isCurrent && css.nodeCurrent,
                  isSelected && css.nodeSelected,
                  isGate && css.nodeGate,
                  !placement.onPath && css.nodeOffPath,
                )}
                style={{
                  left: p.x,
                  top: p.y,
                  width: NODE_W,
                  minHeight: NODE_H,
                  animationDelay: `${index * 35}ms`,
                }}
                tabIndex={0}
                role="button"
                aria-label={`${label}: ${statusLabel}${isCurrent ? ` · ${t('card.current')}` : ''}`}
                aria-pressed={isSelected}
                onClick={(event) => {
                  event.stopPropagation()
                  onActivate(placement.id)
                }}
                onKeyDown={onNodeKey(placement.id as WorkflowNodeId)}
              >
                <div className={css.flowNodeHead}>
                  <span className={css.nodeIcon}><NodeIcon id={placement.id} /></span>
                  <div className={css.flowNodeTitles}>
                    <span className={css.nodeLabel}>{label}</span>
                    <span
                      className={clsx(
                        css.nodeBadge,
                        isGate ? css.statusGate
                          : badge !== null ? badge.cls
                            : node ? statusClass(node.status) : css.statusIdle,
                      )}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  {isCurrent && <span className={css.currentPill}>{t('card.current')}</span>}
                  {/* 【变更】2026-10-27 (批次三十): the stale-artifact badge — an
                      upstream document was edited after this stage's document was
                      written, so this one may no longer match it. */}
                  {driftNodes?.includes(placement.id as WorkflowNodeId) === true && (
                    <span className={css.driftPill} data-testid={`flow-node-drift-${placement.id}`}>
                      {t('flow.driftNode')}
                    </span>
                  )}
                </div>
                <div className={css.flowMetrics}>
                  {/* The CURRENT terminal card (完成 / 已放弃) carries the
                      change's TOTAL figures — the flow ran, so — would be a
                      lie. The non-current terminal stays 已忽略 with —. */}
                  {((): React.ReactElement => {
                    const isCurrentTerminal = (placement.id === 'completed' || placement.id === 'abandoned')
                      && view.current === placement.id
                    if (isCurrentTerminal) {
                      return (
                        <>
                          <span>{t('card.duration')} {formatDuration(view.metrics?.totalDurationMs ?? 0)}</span>
                          <span title={t('metrics.pending')}>
                            {t('card.tokens')} {formatTokens(view.metrics?.totalInputTokens ?? 0, view.metrics?.totalOutputTokens ?? 0)}
                          </span>
                        </>
                      )
                    }
                    return (
                      <>
                        <span>{t('card.duration')} {stageDuration(node?.status, node?.metrics?.durationMs)}</span>
                        <span title={t('metrics.pending')}>
                          {t('card.tokens')} {stageTokens(node?.status, node?.metrics?.inputTokens, node?.metrics?.outputTokens)}
                        </span>
                      </>
                    )
                  })()}
                </div>
                {/* Per-node route badge + artifact chips. The badge reads the
                    「当前路由」fold's audit for THIS phase; the chips are the
                    stage's real artifact files, click-to-open through the
                    rail's openArtifact channel. */}
                {(() => {
                  const routeActual = view.routeStatus?.state === 'routed'
                    ? view.routeStatus.phases.find(row => row.phase === placement.id)?.actual
                    : undefined
                  if (routeActual === undefined) return null
                  return (
                    <div className={css.flowNodeRoute} data-testid={`flow-node-route-${placement.id}`}>
                      {routeBadgeText(routeActual, t)}
                    </div>
                  )
                })()}
                {node?.artifacts !== undefined && node.artifacts.length > 0 && (
                  <div className={css.flowNodeArtifacts}>
                    {node.artifacts.map(artifact => {
                      // 【变更】2026-10-27 (批次三十): the 建立变更 card's artifact is
                      // the change's OWN directory — the change's IDENTITY, not a
                      // document. As a click-to-open chip it read as a file path
                      // (its tooltip carried the whole absolute path) and it
                      // invited an open that has no document behind it. The graph
                      // already names the change as a TAG in its overlay, so the
                      // card repeats it as a plain, non-interactive label.
                      if (view.changeId !== null && artifactName(artifact) === view.changeId) {
                        return (
                          <span
                            key={`${placement.id}:${artifact}`}
                            className={css.flowNodeChangeTag}
                            data-testid={`flow-node-change-${placement.id}`}
                          >
                            {artifactName(artifact)}
                          </span>
                        )
                      }
                      return (
                        <button
                          key={`${placement.id}:${artifact}`}
                          type="button"
                          className={css.flowNodeArtifactChip}
                          title={artifact}
                          onClick={(event) => {
                            // The node itself selects on click — the chip must
                            // not, it opens the file.
                            event.stopPropagation()
                            onOpenArtifact(artifact)
                          }}
                        >
                          {artifactName(artifact)}
                        </button>
                      )
                    })}
                  </div>
                )}
                {/* The 测试流图 jump chip — the implement/verify/archive cards'
                    shortcut into the quality pipeline. stopPropagation (the node
                    selects on click, the chip switches Tab instead); the stage
                    lands selected via the view-request channel. The chip reads
                    「测试流图」 alone — the stage name moved into the tooltip,
                    so the label stays short and loud on the 验证 card. */}
                {(() => {
                  const jumpStage = TEST_FLOW_JUMPS[placement.id as WorkflowNodeId]
                  if (jumpStage === undefined) return null
                  // 【变更】2026-10-24 (批次二十 3): no channel → no chip (the
                  // detail page has no session 测试流图 tab to jump to).
                  if (onOpenTestFlow === undefined) return null
                  return (
                    <div className={css.flowNodeJumps}>
                      <button
                        type="button"
                        className={css.flowNodeTestFlowChip}
                        data-testid={`flow-node-testflow-${placement.id}`}
                        title={`${t('flow.testFlowJumpDesc')} · ${t(TEST_FLOW_JUMP_LABEL[jumpStage])}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          onOpenTestFlow(jumpStage)
                        }}
                      >
                        {t('flow.testFlowJump')}
                      </button>
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
