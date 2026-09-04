/**
 * Trace-graph view: session stats strip, turn navigator with per-turn duration
 * + token totals, REQUEST->RESPONSE->TOOL pipeline cards (stacked vertically),
 * orchestration members with inline child-session loading, and a fixed
 * right-rail detail panel that shows the currently-selected pipeline step
 * without scrolling with the pipeline column.
 */
import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties,
} from 'react'
import clsx from 'clsx'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { LegacyConversationSlice } from '@deepseek-ai/dsh-client-ui-chat/client'
// Type-only: merges useChat / useTrajectory / sessionStats into SessionStandardProps.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-trajectory/client'
import type { TrajectorySnapshot } from '@deepseek-ai/dsh-client-ui-trajectory/src/client/trajectory-contract.ts'
import type {} from '@deepseek-ai/dsh-client-ui-workflow-run/client'
import type {} from '@deepseek-ai/dsh-session-stats/client'
import {
  deriveTraceGraphOrchestration,
  deriveTraceGraphPipeline,
  deriveTraceGraphTurns,
  formatTraceGraphDuration,
  formatTraceGraphTokens,
  traceGraphTurnTotalTokens,
  type TraceGraphPipelineStep,
  type TraceGraphTurnStatus,
} from './pipeline.ts'
import type { TraceGraphKey } from './locales.ts'
import {
  IconChevronRightOutline14, IconClockOutline14, IconCloseOutline16,
  IconCpuOutline14, IconTokensOutline14,
  IconToolsOutline14, IconUserOutline14,
} from './icons.tsx'
import css from './TraceGraphView.module.css'

/** Empty trajectory used before a child source publishes. */
export const EMPTY_TRAJECTORY: TrajectorySnapshot = {
  eventNodes: [],
  eventLocations: new Map(),
  requests: [],
  callSchemas: new Map(),
  partial: null,
  runningCalls: [],
}

/** Detail rail width bounds (px). Below MIN the splitter refuses to drag
 * further; above MAX the rail caps so it cannot starve the pipeline. */
const DETAIL_MIN_WIDTH = 240
const DETAIL_MAX_WIDTH = 640
const DETAIL_DEFAULT_WIDTH = 360

/** Live child-session trace reads for inline orchestration members. */
export interface ChildTraceSource {
  /** Subscribe to trajectory, chat, and session lifecycle changes. */
  subscribe: (listener: () => void) => () => void
  /** Current trajectory target snapshot for the child. */
  getTrajectory: () => TrajectorySnapshot
  /** Legacy turn timings for the child chat window. */
  getTurnTimings: () => LegacyConversationSlice['turnTimings']
  /** Legacy turn-end map for the child chat window. */
  getTurnEnds: () => LegacyConversationSlice['turnEnds']
  /** Whether the child session still has an active turn. */
  getRunning: () => boolean
}

/** Session-bound controls for inline child loading. */
export interface TraceGraphViewInjected {
  /**
   * Open a child session history window without changing the current selection.
   * @param id - child session id.
   */
  ensureOpen: (id: SessionId) => Promise<void>
  /**
   * Resolve live child-trace reads for a listed or scoped session.
   * @param id - session id.
   */
  childSource: (id: SessionId) => ChildTraceSource | undefined
}

function statusClass(status: TraceGraphTurnStatus): string {
  switch (status) {
    case 'completed': return css.statusCompleted ?? ''
    case 'failed': return css.statusFailed ?? ''
    case 'running': return css.statusRunning ?? ''
    default: return status satisfies never
  }
}

function statusLabel(status: TraceGraphTurnStatus, t: (key: TraceGraphKey) => string): string {
  switch (status) {
    case 'completed': return t('turns.status.completed')
    case 'failed': return t('turns.status.failed')
    case 'running': return t('turns.status.running')
    default: return status satisfies never
  }
}

function formatClock(ms: number | null): string {
  if (ms === null) return '-'
  return new Date(ms).toLocaleTimeString()
}

function formatDurationMs(ms: number | null): string {
  if (ms === null) return '-'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

interface StatsCardProps {
  icon: React.ReactNode
  label: string
  value: string
  accent: 'turns' | 'steps' | 'toolCalls' | 'duration'
}

function StatsCard({ icon, label, value, accent }: StatsCardProps) {
  return (
    <div
      className={clsx(css.statCard, css[`statCard-${accent}`])}
      data-trace-graph-stat={accent}
    >
      <span className={css.statIcon}>{icon}</span>
      <span className={css.statText}>
        <span className={css.statLabel}>{label}</span>
        <span className={css.statValue}>{value}</span>
      </span>
    </div>
  )
}

/**
 * Drag handle between pipeline and detail rails. Owns the global pointermove
 * / pointerup listeners while a drag is active; the body suppresses text
 * selection for the drag duration.
 */
function ColumnSplitter({
  width,
  onChange,
}: {
  width: number
  onChange: (next: number) => void
}) {
  const [dragging, setDragging] = useState(false)
  const startRef = useRef<{ x: number; width: number } | null>(null)

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    startRef.current = { x: event.clientX, width }
    setDragging(true)
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
  }, [width])

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = startRef.current
    if (start === null) return
    const delta = event.clientX - start.x
    const next = Math.min(DETAIL_MAX_WIDTH, Math.max(DETAIL_MIN_WIDTH, start.width - delta))
    onChange(next)
  }, [onChange])

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    startRef.current = null
    setDragging(false)
    const target = event.currentTarget
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
  }, [])

  useEffect(() => {
    if (!dragging) return
    const previous = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    return () => { document.body.style.userSelect = previous }
  }, [dragging])

  return (
    <div
      className={css.splitter}
      data-dragging={dragging ? 'true' : undefined}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={DETAIL_MIN_WIDTH}
      aria-valuemax={DETAIL_MAX_WIDTH}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  )
}

interface RequestCardModel {
  model: string
  provider: string
  systemCount: number
  userCount: number
  toolCount: number
}

function RequestCard({ request }: { request: RequestCardModel }) {
  return (
    <div className={clsx(css.card, css.cardRequest)}>
      <div className={css.cardHeader}>
        <span className={css.cardHeaderLeading}>
          <span className={css.cardBadge} data-kind="request">
            <span className={css.cardBadgeDot} />
            REQUEST
          </span>
        </span>
      </div>
      <div className={css.cardKey}>
        <span className={css.cardKeyLabel}>model</span>
        <span className={css.cardKeyValue}>{request.model}</span>
      </div>
      <div className={css.cardKey}>
        <span className={css.cardKeyLabel}>provider</span>
        <span className={css.cardKeyValue}>{request.provider}</span>
      </div>
      <div className={css.cardKey}>
        <span className={css.cardKeyLabel}>system</span>
        <span className={css.cardKeyValue}>{request.systemCount}</span>
      </div>
      <div className={css.cardKey}>
        <span className={css.cardKeyLabel}>user</span>
        <span className={css.cardKeyValue}>{request.userCount}</span>
      </div>
      <div className={css.cardKey}>
        <span className={css.cardKeyLabel}>tools</span>
        <span className={css.cardKeyValue}>{request.toolCount}</span>
      </div>
    </div>
  )
}

function ResponseCard({ response }: { response: TraceGraphPipelineStep['response'] }) {
  return (
    <div className={clsx(css.card, css.cardResponse)}>
      <div className={css.cardHeader}>
        <span className={css.cardHeaderLeading}>
          <span className={css.cardBadge} data-kind="response">
            <span className={css.cardBadgeDot} />
            RESPONSE
          </span>
        </span>
      </div>
      <div className={css.cardKey}>
        <span className={css.cardKeyLabel}>status</span>
        <span className={css.cardKeyValue}>{response.status}</span>
      </div>
      <div className={css.cardKey}>
        <span className={css.cardKeyLabel}>tool calls</span>
        <span className={css.cardKeyValue}>{response.toolCallCount}</span>
      </div>
      {response.reasoningPreview !== '' && (
        <div className={css.cardKey}>
          <span className={css.cardKeyLabel}>reasoning</span>
          <span className={css.cardKeyValue}>{response.reasoningPreview}</span>
        </div>
      )}
      {response.contentPreview !== '' && (
        <div className={css.cardKey}>
          <span className={css.cardKeyLabel}>content</span>
          <span className={css.cardKeyValue}>{response.contentPreview}</span>
        </div>
      )}
    </div>
  )
}

function ToolCard({ tool }: { tool: TraceGraphPipelineStep['tools'][number] }) {
  const riskClass = tool.risk === 'dangerous'
    ? css.toolRiskDangerous
    : tool.risk === 'caution' ? css.toolRiskCaution : css.toolRiskSafe
  return (
    <div
      className={clsx(
        css.card,
        css.cardTool,
        tool.isError && css.cardToolError,
        tool.risk === 'dangerous' && css.cardToolDangerous,
        tool.risk === 'caution' && css.cardToolCaution,
      )}
    >
      <div className={css.cardHeader}>
        <span className={css.cardHeaderLeading}>
          <span className={css.cardBadge} data-kind="tool">
            <span className={css.cardBadgeDot} />
            TOOL · {tool.name}
          </span>
        </span>
        <span
          className={clsx(css.toolRiskBadge, riskClass)}
          title={tool.riskReasons.join(', ') || tool.risk}
        >
          {tool.risk === 'safe' ? 'safe' : tool.risk.toUpperCase()}
        </span>
      </div>
      {tool.command !== undefined && (
        <pre className={css.detailToolCommand}>{tool.command}</pre>
      )}
      {tool.targetPaths.length > 0 && (
        <ul className={css.detailPathList}>
          {tool.targetPaths.map(p => (
            <li key={p} className={css.detailPath}>{p}</li>
          ))}
        </ul>
      )}
      {tool.riskReasons.length > 0 && (
        <div className={css.detailRiskReasons}>
          matched: {tool.riskReasons.join(', ')}
        </div>
      )}
      {tool.argsPreview !== '' && (
        <div className={css.cardKey}>
          <span className={css.cardKeyLabel}>args</span>
          <span className={css.cardKeyValue}>{tool.argsPreview}</span>
        </div>
      )}
      {tool.resultPreview !== '' && (
        <div className={css.cardKey}>
          <span className={css.cardKeyLabel}>result</span>
          <span className={css.cardKeyValue}>{tool.resultPreview}</span>
        </div>
      )}
      <div className={css.cardKey}>
        <span className={css.cardKeyLabel}>duration</span>
        <span className={css.cardKeyValue}>{formatDurationMs(tool.durationMs)}</span>
      </div>
    </div>
  )
}

/**
 * Trace-graph conversation view.
 */
export function TraceGraphView({
  useSession,
  useChat,
  useTrajectory,
  useProjection,
  ensureOpen,
  childSource,
  t,
}: ConvViewProps & InjectFace<TraceGraphViewInjected> & PropsLocale<'baf.trace-graph'>) {
  const trajectory = useTrajectory(snapshot => snapshot)
  const chat = useChat(snapshot => snapshot)
  const turnTimings = useChat(snapshot => snapshot.legacy.turnTimings)
  const turnEnds = useChat(snapshot => snapshot.legacy.turnEnds)
  const running = useSession(snapshot => snapshot.running)
  const stats = useProjection('sessionStats')

  const turns = useMemo(
    () => deriveTraceGraphTurns(trajectory, turnTimings, turnEnds, running),
    [trajectory, turnTimings, turnEnds, running],
  )
  const orchestration = useMemo(() => deriveTraceGraphOrchestration(chat), [chat])

  const [selectedTurn, setSelectedTurn] = useState<number | null>(null)
  const [selectedStepKey, setSelectedStepKey] = useState<string | null>(null)
  const [childId, setChildId] = useState<SessionId | null>(null)
  const [childPhase, setChildPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [childTick, setChildTick] = useState(0)
  const [detailWidth, setDetailWidth] = useState(DETAIL_DEFAULT_WIDTH)

  useEffect(() => {
    if (turns.length === 0) {
      setSelectedTurn(null)
      return
    }
    if (selectedTurn === null || !turns.some(turn => turn.turn === selectedTurn)) {
      const last = turns.findLast(() => true)
      if (last !== undefined) setSelectedTurn(last.turn)
    }
  }, [turns, selectedTurn])

  useEffect(() => {
    if (childId === null) {
      setChildPhase('idle')
      return
    }
    let cancelled = false
    setChildPhase('loading')
    void ensureOpen(childId)
      .then(() => {
        if (cancelled) return
        setChildPhase('ready')
        setChildTick(value => value + 1)
      })
      .catch(() => {
        if (!cancelled) setChildPhase('error')
      })
    return () => { cancelled = true }
  }, [childId, ensureOpen])

  useEffect(() => {
    if (childId === null || childPhase !== 'ready') return
    const source = childSource(childId)
    if (source === undefined) return
    return source.subscribe(() => { setChildTick(value => value + 1) })
  }, [childId, childPhase, childSource])

  const childTrajectory = useMemo(() => {
    void childTick
    if (childId === null || childPhase !== 'ready') return null
    const source = childSource(childId)
    if (source === undefined) return null
    return source.getTrajectory()
  }, [childId, childPhase, childSource, childTick])

  const childTurns = useMemo(() => {
    if (childId === null || childPhase !== 'ready') return []
    const source = childSource(childId)
    if (source === undefined) return []
    return deriveTraceGraphTurns(
      childTrajectory ?? EMPTY_TRAJECTORY,
      source.getTurnTimings(),
      source.getTurnEnds(),
      source.getRunning(),
    )
  }, [childId, childPhase, childSource, childTrajectory])

  const [childSelectedTurn, setChildSelectedTurn] = useState<number | null>(null)
  useEffect(() => {
    if (childTurns.length === 0) {
      setChildSelectedTurn(null)
      return
    }
    if (childSelectedTurn === null || !childTurns.some(turn => turn.turn === childSelectedTurn)) {
      const last = childTurns.findLast(() => true)
      if (last !== undefined) setChildSelectedTurn(last.turn)
    }
  }, [childTurns, childSelectedTurn])

  const activeTrajectory = childTrajectory ?? trajectory
  const activeTurn = childTrajectory !== null ? childSelectedTurn : selectedTurn
  const pipeline = useMemo(
    () => activeTurn === null ? [] : deriveTraceGraphPipeline(activeTrajectory, activeTurn),
    [activeTurn, activeTrajectory],
  )

  useEffect(() => {
    if (pipeline.length === 0) {
      setSelectedStepKey(null)
      return
    }
    if (selectedStepKey === null || !pipeline.some(step => step.key === selectedStepKey)) {
      const first = pipeline[0]
      if (first !== undefined) setSelectedStepKey(first.key)
    }
  }, [pipeline, selectedStepKey])

  const selectedStep = pipeline.find(step => step.key === selectedStepKey) ?? null
  const totalMs = (stats?.llmMs ?? 0) + (stats?.toolMs ?? 0)

  const detailStyle = { width: `${detailWidth}px` } as CSSProperties

  return (
    <div className={css.root} data-trace-graph-view>
      <div className={css.stats} data-trace-graph-stats>
        <StatsCard
          accent="turns"
          icon={<IconUserOutline14 size={22} />}
          label={t('stats.turns')}
          value={String(stats?.turns ?? 0)}
        />
        <StatsCard
          accent="steps"
          icon={<IconCpuOutline14 size={22} />}
          label={t('stats.steps')}
          value={String(stats?.steps ?? 0)}
        />
        <StatsCard
          accent="toolCalls"
          icon={<IconToolsOutline14 size={22} />}
          label={t('stats.toolCalls')}
          value={String(stats?.toolCalls ?? 0)}
        />
        <StatsCard
          accent="duration"
          icon={<IconClockOutline14 size={22} />}
          label={t('stats.duration')}
          value={formatTraceGraphDuration(totalMs)}
        />
      </div>

      <div className={css.body}>
        <aside className={css.turns} data-trace-graph-turns>
          <h2 className={css.sectionTitle}>{t('turns.title')}</h2>
          {orchestration.length > 0 && (
            <div className={css.orch} data-trace-graph-orch>
              <div className={css.sectionTitle}>{t('orch.title')}</div>
              {orchestration.map(run => (
                <div key={run.key} className={css.orchRun}>
                  <div className={css.orchRunName}>
                    <span className={css.orchRunDot} data-status={run.status} />
                    {run.name}
                  </div>
                  {run.phases.map(phase => (
                    <div key={phase.key} className={css.orchPhase}>
                      <div className={css.orchPhaseTitle}>
                        {phase.phase === null ? '-' : phase.phase || '?'}
                      </div>
                      {phase.members.map(member => (
                        <button
                          key={member.seq}
                          type="button"
                          data-selected={childId === member.childId ? 'true' : undefined}
                          className={
                            childId === member.childId
                              ? `${css.memberButton} ${css.memberButtonSelected}`
                              : css.memberButton
                          }
                          onClick={() => { setChildId(member.childId) }}
                        >
                          <span className={css.memberLabel}>{member.label || t('orch.member')}</span>
                          <span className={css.memberStatus} data-status={member.status}>
                            {member.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {childId !== null && (
            <div className={css.childBanner} data-trace-graph-child-banner data-state={childPhase}>
              <span className={css.childBannerText}>
                {childPhase === 'loading' && t('orch.loadingChild')}
                {childPhase === 'error' && t('orch.childError')}
                {childPhase === 'ready' && String(childId)}
              </span>
              <button
                type="button"
                className={css.backButton}
                onClick={() => { setChildId(null) }}
              >
                <IconCloseOutline16 size={12} />
                <span>{t('orch.backToParent')}</span>
              </button>
            </div>
          )}

          {(childTrajectory !== null ? childTurns : turns).length === 0 ? (
            <div className={css.empty}>{t('turns.empty')}</div>
          ) : (
            <ol className={css.turnList} aria-label={t('turns.title')}>
              {(childTrajectory !== null ? childTurns : turns).map((turn, index) => {
                const selected = (childTrajectory !== null ? childSelectedTurn : selectedTurn) === turn.turn
                return (
                  <TurnCard
                    key={turn.turn}
                    index={index}
                    turn={turn}
                    selected={selected}
                    onSelect={() => {
                      if (childTrajectory !== null) setChildSelectedTurn(turn.turn)
                      else setSelectedTurn(turn.turn)
                    }}
                    t={t}
                  />
                )
              })}
            </ol>
          )}
        </aside>

        <section className={css.pipeline} data-trace-graph-pipeline>
          {pipeline.length === 0 ? (
            <div className={css.empty}>{t('pipeline.empty')}</div>
          ) : pipeline.map((step, index) => (
            <PipelineStepCard
              key={step.key}
              step={step}
              index={index}
              total={pipeline.length}
              selected={step.key === selectedStepKey}
              onSelect={() => { setSelectedStepKey(step.key) }}
              t={t}
            />
          ))}
        </section>

        <ColumnSplitter width={detailWidth} onChange={setDetailWidth} />

        <aside className={css.detail} data-trace-graph-detail style={detailStyle}>
          <div className={css.detailSticky}>
            <h2 className={css.sectionTitle}>{t('detail.title')}</h2>
            {selectedStep === null ? (
              <div className={css.empty}>{t('detail.empty')}</div>
            ) : (
              <DetailPanel step={selectedStep} />
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

interface TurnCardProps {
  turn: ReturnType<typeof deriveTraceGraphTurns>[number]
  index: number
  selected: boolean
  onSelect: () => void
  t: (key: TraceGraphKey, params?: Record<string, string | number>) => string
}

function TurnCard({ turn, index, selected, onSelect, t }: TurnCardProps) {
  const style: CSSProperties = { animationDelay: `${Math.min(index, 8) * 40}ms` }
  return (
    <li className={css.turnItem}>
      <span className={css.turnConnector} aria-hidden="true">
        <span className={css.turnConnectorNode} data-status={turn.status} />
      </span>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        data-selected={selected ? 'true' : undefined}
        data-status={turn.status}
        style={style}
        className={clsx(css.turnButton, selected && css.turnButtonSelected)}
        onClick={onSelect}
      >
        <span className={css.turnHeader}>
          <span className={css.turnIndex}>{t('turns.round', { n: turn.turn })}</span>
          <span className={clsx(css.turnStatusPill, statusClass(turn.status))}>
            {statusLabel(turn.status, t)}
          </span>
        </span>
        {turn.preview !== '' && (
          <span className={css.turnPreview}>{turn.preview}</span>
        )}
        <span className={css.turnMeta}>
          <span className={css.turnChip} data-kind="model">
            <IconCpuOutline14 size={12} />
            <span>{t('turns.modelCalls', { n: turn.modelCalls })}</span>
          </span>
          <span className={css.turnChip} data-kind="tool">
            <IconToolsOutline14 size={12} />
            <span>{t('turns.toolCalls', { n: turn.toolCalls })}</span>
          </span>
          <span className={css.turnChip} data-kind="tokens">
            <IconTokensOutline14 size={12} />
            <span>{t('turns.tokens', { n: formatTraceGraphTokens(traceGraphTurnTotalTokens(turn.usage)) })}</span>
          </span>
          <span className={css.turnChip} data-kind="duration">
            <IconClockOutline14 size={12} />
            <span>{t('turns.duration', { duration: turn.durationMs === null ? '-' : formatTraceGraphDuration(turn.durationMs) })}</span>
          </span>
        </span>
        <span className={css.turnChevron} aria-hidden="true">
          <IconChevronRightOutline14 size={12} />
        </span>
      </button>
    </li>
  )
}

function PipelineStepCard({
  step,
  index,
  total,
  selected,
  onSelect,
  t,
}: {
  step: TraceGraphPipelineStep
  index: number
  total: number
  selected: boolean
  onSelect: () => void
  t: (key: TraceGraphKey, params?: Record<string, string | number>) => string
}) {
  const style: CSSProperties = { animationDelay: `${Math.min(index, 6) * 50}ms` }
  return (
    <article
      className={clsx(css.stepCard, selected && css.stepCardSelected)}
      data-trace-graph-step={step.step}
      data-selected={selected ? 'true' : undefined}
      style={style}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      role="button"
      tabIndex={0}
    >
      <header className={css.stepHeader}>
        <span className={css.stepOrdinal}>{index + 1}<span className={css.stepOrdinalSep}>/</span>{total}</span>
        <span className={css.stepTitle}>{t('pipeline.modelCall', { n: step.step })}</span>
        <span className={css.stepClock}>{formatClock(step.startedAt)}</span>
        <span className={css.stepDuration}>{formatDurationMs(step.durationMs)}</span>
        {step.usage?.input !== undefined && (
          <span className={css.stepUsageChip} data-kind="input">
            {t('pipeline.inputTokens', { n: step.usage.input })}
          </span>
        )}
        {step.usage?.cacheRead !== undefined && (
          <span className={css.stepUsageChip} data-kind="cached">
            {t('pipeline.cachedTokens', { n: step.usage.cacheRead })}
          </span>
        )}
        {step.usage?.output !== undefined && (
          <span className={css.stepUsageChip} data-kind="output">
            {t('pipeline.outputTokens', { n: step.usage.output })}
          </span>
        )}
      </header>
      <div className={css.flow}>
        <RequestCard request={step.request} />
        <div className={clsx(css.connector, css.connectorRequest)} aria-hidden="true" />
        <ResponseCard response={step.response} />
        {step.tools.length > 0 && (
          <>
            <div className={clsx(css.connector, css.connectorResponse)} aria-hidden="true" />
            <div className={css.toolsGrid}>
              {step.tools.map(tool => <ToolCard key={tool.callId} tool={tool} />)}
            </div>
          </>
        )}
      </div>
    </article>
  )
}

interface DetailPanelProps {
  step: TraceGraphPipelineStep
}

function DetailPanel({ step }: DetailPanelProps) {
  const fields: ReadonlyArray<readonly [string, string]> = [
    ['turn', String(step.turn)],
    ['step', String(step.step)],
    ['model', step.request.model],
    ['provider', step.request.provider],
    ['duration', formatDurationMs(step.durationMs)],
  ]
  const usage = step.usage
  return (
    <div className={css.detailBody}>
      <header className={css.detailHeader}>
        <span className={css.detailTitle}>step</span>
        <span className={css.detailStep}>#{step.step}</span>
      </header>
      <dl className={css.detailList}>
        {fields.map(([k, v]) => (
          <div key={k} className={css.detailRow}>
            <dt className={css.detailKey}>{k}</dt>
            <dd className={css.detailVal}>{v}</dd>
          </div>
        ))}
        {usage !== undefined && (
          <>
            {usage.input !== undefined && (
              <div className={css.detailRow}>
                <dt className={css.detailKey}>input tokens</dt>
                <dd className={css.detailVal}>{usage.input}</dd>
              </div>
            )}
            {usage.output !== undefined && (
              <div className={css.detailRow}>
                <dt className={css.detailKey}>output tokens</dt>
                <dd className={css.detailVal}>{usage.output}</dd>
              </div>
            )}
            {usage.cacheRead !== undefined && (
              <div className={css.detailRow}>
                <dt className={css.detailKey}>cached tokens</dt>
                <dd className={css.detailVal}>{usage.cacheRead}</dd>
              </div>
            )}
          </>
        )}
      </dl>
      <pre className={css.detailPre}>
        {JSON.stringify({
          request: step.request,
          response: step.response,
          tools: step.tools,
          usage,
        }, null, 2)}
      </pre>
      {step.tools.length > 0 && (
        <section className={css.detailTools}>
          <header className={css.detailHeader}>
            <span className={css.detailTitle}>tool calls</span>
            <span className={css.detailStep}>{step.tools.length}</span>
          </header>
          {step.tools.map(tool => (
            <article
              key={tool.callId}
              className={clsx(
                css.detailToolCard,
                tool.risk === 'dangerous' && css.detailToolCardDangerous,
                tool.risk === 'caution' && css.detailToolCardCaution,
                tool.isError && css.detailToolCardError,
              )}
            >
              <div className={css.detailToolHeader}>
                <span className={css.detailToolName}>{tool.name}</span>
                <span
                  className={clsx(
                    css.toolRiskBadge,
                    tool.risk === 'dangerous' && css.toolRiskDangerous,
                    tool.risk === 'caution' && css.toolRiskCaution,
                    tool.risk === 'safe' && css.toolRiskSafe,
                  )}
                >
                  {tool.risk === 'safe' ? 'safe' : tool.risk.toUpperCase()}
                </span>
              </div>
              {tool.command !== undefined && (
                <div>
                  <div className={css.detailToolCommandLabel}>
                    {tool.risk === 'dangerous' ? '? command (dangerous)' : tool.risk === 'caution' ? '? command' : 'command'}
                  </div>
                  <pre className={css.detailToolCommand}>{tool.command}</pre>
                </div>
              )}
              {tool.targetPaths.length > 0 && (
                <div>
                  <div className={css.detailToolCommandLabel}>target paths</div>
                  <ul className={css.detailPathList}>
                    {tool.targetPaths.map(p => (
                      <li key={p} className={css.detailPath}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {tool.riskReasons.length > 0 && (
                <div className={css.detailRiskReasons}>
                  risk reasons: {tool.riskReasons.join(', ')}
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
