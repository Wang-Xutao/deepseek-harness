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
import type {
  TerminalStateId,
  WorkflowNodeId,
  WorkflowTabLanesView,
  WorkflowTabNodeView,
  WorkflowTabView,
} from './tab-types.ts'
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
  /**
   * §13 R3 — fast-path Tab dispatch. The `evidence` payload is flattened on
   * the host into `key=value` pairs the same way the slash parser reads
   * them, so submitting a 5-field form from the Tab reaches the same
   * `driveClassify(..., 'confirm problem=… root-cause=… file=… test=… test-cmd=…')`
   * path that the slash command does. Arrays (e.g. multiple `file=…`)
   * become repeated keys.
   */
  transition: (
    changeId: string,
    to: WorkflowNodeId | TerminalStateId,
    evidence?: Readonly<Record<string, string | number | boolean | null | readonly (string | number | boolean | null)[]>>,
  ) => Promise<WorkflowTabView>
  /** T13 rollback (§19.5): omit `node` to re-read the freshly detected menu. */
  resume: (changeId: string, node?: WorkflowNodeId) => Promise<WorkflowTabView>
  /**
   * §22.14 Tab gate-card resolve: dispatch the registered command for a
   * chosen `(gateId, optionId)` pair. The pair is read from a
   * `WorkflowTabGate.options` / `WorkflowTabPendingGate.options` row.
   */
  gateResolve: (request: { changeId?: string; gateId: string; optionId: string }) => Promise<WorkflowTabView>
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

/**
 * Substitute `{name}` placeholders in a dictionary entry.
 *
 * The locale dictionaries are flat strings, so the few entries that carry
 * runtime values (`edge.upgraded`, …) declare them inline and fill here rather
 * than concatenating fragments at the call site — that keeps the whole sentence
 * in the dictionary where a translator can reorder it.
 * @param template - dictionary entry with `{name}` placeholders.
 * @param values - substitution table.
 * @returns filled text.
 */
function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match)
}

/** Trim a recorded artifact path down to its file name for display. */
function artifactName(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
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

/**
 * §13 R3 — fast-path Tab form. Five required fields mirror the slash
 * `confirm problem=… root-cause=… file=… test=… test-cmd=…` shape verbatim,
 * so the host's `evidenceToRawInput` flattens this dict straight into the
 * `driveClassify` parser. `file` is multi-line: each non-empty line becomes
 * one `file=` argument, matching the slash behaviour where `file=a file=b`
 * repeats the key.
 *
 * Empty / whitespace-only fields disable the submit button and surface a
 * helper line, mirroring `command-drives.ts:missing` so the customer sees
 * the same diagnostic they'd get from the slash card.
 */
function FastPathForm(props: {
  busy: boolean
  changeId: string | null
  value: {
    problem: string
    rootCause: string
    file: string
    test: string
    testCmd: string
  }
  onChange: (next: FastPathFormProps['value']) => void
  onSubmit: () => void
  t: (key: WorkflowTabKey) => string
}): React.ReactElement {
  const { busy, changeId, value, onChange, onSubmit, t } = props
  const problemTrimmed = value.problem.trim()
  const rootCauseTrimmed = value.rootCause.trim()
  const fileLines = value.file.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0)
  const testTrimmed = value.test.trim()
  const testCmdTrimmed = value.testCmd.trim()
  const missing: string[] = []
  if (problemTrimmed.length === 0) missing.push(t('intake.fastPath.problem'))
  if (rootCauseTrimmed.length === 0) missing.push(t('intake.fastPath.rootCause'))
  if (fileLines.length === 0) missing.push(t('intake.fastPath.file'))
  if (testTrimmed.length === 0) missing.push(t('intake.fastPath.test'))
  if (testCmdTrimmed.length === 0) missing.push(t('intake.fastPath.testCmd'))
  const ready = missing.length === 0 && changeId !== null
  return (
    <div className={css.fastPathForm} aria-label={t('intake.fastPath.title')}>
      <p className={css.hint}>{t('intake.fastPath.help')}</p>
      <label className={css.fastPathLabel}>
        {t('intake.fastPath.problem')}
        <textarea
          className={clsx(css.fastPathInput, css.fastPathTextarea)}
          value={value.problem}
          onChange={event => onChange({ ...value, problem: event.target.value })}
          rows={2}
          disabled={busy}
        />
      </label>
      <label className={css.fastPathLabel}>
        {t('intake.fastPath.rootCause')}
        <textarea
          className={clsx(css.fastPathInput, css.fastPathTextarea)}
          value={value.rootCause}
          onChange={event => onChange({ ...value, rootCause: event.target.value })}
          rows={2}
          disabled={busy}
        />
      </label>
      <label className={css.fastPathLabel}>
        {t('intake.fastPath.file')}
        <textarea
          className={clsx(css.fastPathInput, css.fastPathTextarea)}
          value={value.file}
          onChange={event => onChange({ ...value, file: event.target.value })}
          rows={3}
          placeholder={'src/foo.ts\nsrc/bar.ts'}
          disabled={busy}
        />
        <span className={css.fastPathHelp}>{t('intake.fastPath.fileHelp')}</span>
      </label>
      <label className={css.fastPathLabel}>
        {t('intake.fastPath.test')}
        <input
          type="text"
          className={css.fastPathInput}
          value={value.test}
          onChange={event => onChange({ ...value, test: event.target.value })}
          placeholder="tests/foo.spec.ts"
          disabled={busy}
        />
      </label>
      <label className={css.fastPathLabel}>
        {t('intake.fastPath.testCmd')}
        <input
          type="text"
          className={css.fastPathInput}
          value={value.testCmd}
          onChange={event => onChange({ ...value, testCmd: event.target.value })}
          placeholder="pnpm test foo"
          disabled={busy}
        />
      </label>
      {missing.length > 0 && (
        <p className={css.fastPathWarn} role="status">{t('intake.fastPath.required')}</p>
      )}
      <div className={css.actions}>
        <button
          type="button"
          className={clsx(css.btn, css.btnPrimary)}
          disabled={busy || !ready}
          onClick={onSubmit}
        >
          {t('intake.fastPath.submit')}
        </button>
      </div>
    </div>
  )
}

/** Type alias extracted so the `WorkflowView` parent and the form agree. */
type FastPathFormProps = {
  readonly value: {
    readonly problem: string
    readonly rootCause: string
    readonly file: string
    readonly test: string
    readonly testCmd: string
  }
  readonly onChange: (next: {
    readonly problem: string
    readonly rootCause: string
    readonly file: string
    readonly test: string
    readonly testCmd: string
  }) => void
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
  const { t, refresh, confirmIntake, rejectIntake, startIntake, transition, resume, gateResolve, useProjection } = props
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
  const [resumeTarget, setResumeTarget] = useState<WorkflowNodeId | null>(null)
  // §13 R1 — gate destructive actions (archive / abandon) behind a confirm
  // modal so a misclick on the verify-archive gate's 「确认归档」 button
  // does not atomically move the change into the archive folder. The drive
  // layer still requires `confirm` as a defence-in-depth guardrail, but the
  // user-facing mistake-prevention belongs here in the view.
  const [pendingArchive, setPendingArchive] = useState<{ changeId: string; title: string } | null>(null)
  // §22.14 P3 — abandon-gate destructive confirm modal. Mirrors §13 R1's
  // pattern for archive: the Tab button opens the modal; only the modal's
  // primary action runs `gateResolve('abandon', 'confirm')`, which the host
  // re-dispatches to /baf-workflow-abandon confirm (driveAbandon). The drive
  // layer's own `confirm` requirement is defence-in-depth, but the user-facing
  // mistake-prevention lives here in the view.
  const [pendingAbandon, setPendingAbandon] = useState<{ changeId: string } | null>(null)
  // §13 R3 — fast-path Tab form state. Five required fields, kept as
  // plain strings so the textarea and inputs share a `useState<string>` shape.
  // `file` is multi-line; each line becomes one `file=` argument on submit.
  const [fastPath, setFastPath] = useState({
    problem: '',
    rootCause: '',
    file: '',
    test: '',
    testCmd: '',
  })
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

  // §13 R8 — stale gate-card defense. The Tab paints whatever the host
  // last returned; if another channel (CLI, slash, another Tab) parks
  // or resolves a confirm gate while this view is idle, the painted
  // `gate` / `pendingGate` can drift from the projection log. We re-read
  // on (a) document/window focus — the user just alt-tabbed back into the
  // IDE — and (b) `visibilitychange` to visible — the panel was hidden
  // behind a different conversation. We deliberately skip a polling
  // timer: every other entry surface goes through the same projection
  // store, and the host remote re-derives the view from a fresh log on
  // every transition call, so the only gap is "another channel acted
  // while the Tab was unfocused". Focus + visibilitychange covers that.
  useEffect(() => {
    if (preset !== 'baf') return
    const onFocus = () => { void run(() => refresh()) }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onFocus()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
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

  // Keep the rollback picker on a legal target: the menu is re-read from the
  // server on every refresh, so a target that dropped out must not linger.
  useEffect(() => {
    const candidates = view.resume?.candidates
    if (candidates === undefined || candidates.length === 0) {
      setResumeTarget(null)
      return
    }
    setResumeTarget(current => (
      current !== null && candidates.includes(current) ? current : (candidates[0] ?? null)
    ))
  }, [view.resume])

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
        {view.gate !== undefined && (
          <span className={clsx(css.stripItem, css.stripGate)} title={t('gate.replyToContinue')}>
            <span className={css.stripLabel}>{t('status.awaiting')}</span>
            <span className={css.stripValue}>
              {t(view.gate.id === 'design-to-plan' ? 'gate.designDone' : 'gate.verifyPassed')}
            </span>
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
        {/* §22.14 P3 — abandon gate Tab surface. The abandon gate only ever
            fires when an active change is parked on a non-terminal node; the
            slash form is /baf-workflow-abandon confirm, gated by a Tab
            confirm modal (matches §13 R1 spirit: destructive → modal). The
            strip button mirrors that flow on the Tab side so the principle
            "card ≡ button" holds for abandon too. */}
        {view.changeId !== null
          && view.current !== null
          && view.current !== 'completed'
          && view.current !== 'abandoned' ? (
            <button
              type="button"
              className={clsx(css.btn, css.btnGhost)}
              disabled={busy}
              onClick={() => {
                const changeId = view.changeId
                if (changeId === null) return
                setPendingAbandon({ changeId })
              }}
            >
              {t('action.abandon')}
            </button>
          ) : null}
      </div>

      {view.openspecSkipped?.skipped === true && (
        <div className={css.banner}>
          {t('openspec.skipped')}: {view.openspecSkipped.reasonCodes.join(', ')}
        </div>
      )}

      {/* §22.14 P3 — workspace-level pendingGate card. The host computes this
          when `.baf/baseline.yml` is missing; the Tab renders the registered
          question and one button per option, so the workspace-bootstrap gate
          is reachable as a Tab button row (equivalent to the slash card).
          `cancel` is the `__noop__` sentinel — `gateResolve` returns a calm
          dismissal card and the host keeps `pendingGate` because the gate's
          condition (no baseline) still holds. */}
      {view.pendingGate !== undefined && (
        <section className={clsx(css.card, css.cardGate)} aria-label={t('pendingGate.title')}>
          <div className={css.cardTitle}>{t('pendingGate.title')}</div>
          <p className={css.hint}>{view.pendingGate.question}</p>
          <div className={css.actions}>
            {view.pendingGate.options.map((opt) => {
              const isCancel = opt.id === 'cancel'
              return (
                <button
                  key={`pending-${opt.id}`}
                  type="button"
                  className={clsx(css.btn, isCancel ? css.btnGhost : css.btnPrimary)}
                  disabled={busy}
                  onClick={() => {
                    void run(() => gateResolve({
                      gateId: view.pendingGate?.gateId ?? 'scaffold',
                      optionId: opt.id,
                    }))
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </section>
      )}

      <div className={css.body}>
        <div className={css.main}>
          {view.lanes !== undefined && <LanePanel lanes={view.lanes} t={t} />}
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
                  // §18.5: a parked gate is its own visual state — deliberately
                  // not the `blocked` styling, because nothing is wrong and the
                  // customer's one action is the way forward.
                  const isGate = view.gate?.node === placement.id
                  const label = t(`node.${placement.id}` as WorkflowTabKey)
                  const statusLabel = isGate
                    ? t('status.awaiting')
                    : node === undefined
                      ? t('status.template')
                      : t(`status.${node.status}` as WorkflowTabKey)

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
                          <span
                            className={clsx(
                              css.nodeBadge,
                              isGate ? css.statusGate : node ? statusClass(node.status) : css.statusIdle,
                            )}
                          >
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
            {view.intake !== undefined && (
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
                {/* §13 R9 — keep the classification metadata visible after
                    confirm so the customer can re-check what was agreed.
                    Action buttons stay gated on `pending` because they only
                    make sense before intake is decided. */}
                {view.intake.confirmation === 'pending' && (
                  view.intake.mode === 'bug-fast-path'
                    ? (
                      <FastPathForm
                        busy={busy}
                        changeId={view.changeId}
                        value={fastPath}
                        onChange={setFastPath}
                        onSubmit={() => {
                          const changeId = view.changeId
                          if (changeId === null) return
                          const files = fastPath.file
                            .split(/\r?\n/)
                            .map(line => line.trim())
                            .filter(line => line.length > 0)
                          void run(() => transition(changeId, 'open', {
                            problem: fastPath.problem.trim(),
                            'root-cause': fastPath.rootCause.trim(),
                            file: files,
                            test: fastPath.test.trim(),
                            'test-cmd': fastPath.testCmd.trim(),
                          }))
                          setFastPath({ problem: '', rootCause: '', file: '', test: '', testCmd: '' })
                        }}
                        t={t}
                      />
                    )
                    : (
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
                    )
                )}
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

            {view.resume !== undefined && (
              <section className={clsx(css.card, css.cardDrift)} aria-label={t('action.resume')}>
                <h3 className={css.cardTitle}>{t('action.resume')}</h3>
                <p className={css.hint}>{t('action.resumeHelp')}</p>
                <div className={css.metaRow}>
                  <span className={css.metaKey}>{t('detail.status')}</span>
                  <span>{t('status.drifted')}</span>
                  <span className={css.metaKey}>{t('card.current')}</span>
                  <span>{t(`node.${view.resume.anchor}`)}</span>
                </div>
                <div className={css.actions}>
                  <select
                    className={css.resumeSelect}
                    value={resumeTarget ?? ''}
                    disabled={busy || view.changeId === null}
                    aria-label={t('action.resume')}
                    onChange={(event) => { setResumeTarget(event.target.value as WorkflowNodeId) }}
                  >
                    {view.resume.candidates.map(candidate => (
                      <option key={candidate} value={candidate}>
                        {t(`node.${candidate}`)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={clsx(css.btn, css.btnPrimary)}
                    disabled={busy || view.changeId === null || resumeTarget === null}
                    onClick={() => {
                      const changeId = view.changeId
                      const node = resumeTarget
                      if (changeId !== null && node !== null) void run(() => resume(changeId, node))
                    }}
                  >
                    {t('action.resume')}
                  </button>
                </div>
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
                  // Intake actions have their own card; the rollback has the
                  // drift card above (it needs a target picker, not a button).
                  if (action.id === 'confirm-intake' || action.id === 'reject-intake'
                    || action.id === 'supplement-intake' || action.id === 'resume') {
                    return null
                  }
                  const label = action.id === 'transition'
                    ? t('action.enterOpen')
                    : action.id === 'start-stage'
                      ? t('action.startStage')
                      : action.id === 'confirm-archive'
                        ? t('action.confirmArchive')
                        : action.id === 'confirm-gate'
                          ? t((view.gate?.actionKey ?? 'gate.confirmIntoPlan') as WorkflowTabKey)
                          : t('action.newChange')
                  return (
                    <button
                      key={`${action.id}-${action.target ?? ''}`}
                      type="button"
                      className={clsx(css.btn, action.enabled ? css.btnPrimary : css.btnGhost)}
                      disabled={busy || !action.enabled || view.changeId === null}
                      title={action.reason}
                      onClick={() => {
                        const changeId = view.changeId
                        if (changeId === null) return
                        // §13 R1 — destructive target surfaces go through a
                        // confirm modal first. The modal re-uses the drive
                        // layer's source-stamping (`'tab'`); cancelling
                        // dismisses the modal without writing any event.
                        if (action.id === 'confirm-gate'
                          && (action.target === 'archive' || action.target === 'completed')) {
                          // The client-side `view.gate` type strips the live
                          // `question` (only the action key + id survive the
                          // typert wire), so we lean on the i18n hint that
                          // already names the verify-archive scenario.
                          setPendingArchive({
                            changeId,
                            title: t('gate.verifyPassed'),
                          })
                          return
                        }
                        if (action.id === 'transition') {
                          void run(() => transition(changeId, 'open'))
                        } else if (action.id === 'confirm-gate' && action.target !== undefined) {
                          void run(() => transition(changeId, action.target as WorkflowNodeId | TerminalStateId))
                        }
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              {/* §22.14 P3 — change-level gate registry options. The single
                  primary confirm button above stays (it owns the destructive
                  confirm modal and the i18n-keyed label); the registry's
                  other options — currently `back` for design-confirm /
                  verify-archive, taking them to /baf-workflow-clarify /
                  /baf-workflow-implement — render below it as ghost-style
                  buttons. Each click goes through `gateResolve`, the same
                  Tab resolve channel the slash card uses; the host validates
                  `(gateId, optionId)` against §22 GATE_REGISTRY and dispatches
                  the registered slash command. */}
              {view.gate?.options !== undefined
                && view.gate.options.length > 0
                && view.gate.gateId !== undefined
                && view.changeId !== null ? (
                  <div className={css.actions}>
                    {view.gate.options
                      .filter(opt => opt.id !== 'confirm')
                      .map(opt => (
                        <button
                          key={`gate-opt-${opt.id}`}
                          type="button"
                          className={clsx(css.btn, css.btnGhost)}
                          disabled={busy}
                          onClick={() => {
                            const changeId = view.changeId
                            const gateId = view.gate?.gateId
                            if (changeId === null || gateId === undefined) return
                            void run(() => gateResolve({ changeId, gateId, optionId: opt.id }))
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                  </div>
                ) : null}
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

      {/* §13 R1 — destructive-action confirm modal. Triggered by the
          「确认归档」 button on the verify-archive gate card; prevents the
          atomic move into the archive folder from happening on a single
          misclick. Escape and backdrop click cancel; only the explicit
          「确认归档」 button runs the transition. */}
      {pendingArchive !== null && (
        <div
          className={css.dashboardBackdrop}
          role="presentation"
          onClick={() => setPendingArchive(null)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setPendingArchive(null)
          }}
        >
          <div
            className={css.dashboardPanel}
            role="alertdialog"
            aria-modal="true"
            aria-label={t('action.confirmArchive')}
            onClick={event => event.stopPropagation()}
          >
            <div className={css.dashboardHead}>
              <h2 className={css.dashboardTitle}>{t('action.confirmArchive')}</h2>
            </div>
            <p className={css.hint}>
              {t('gate.verifyPassed')}
              {' · '}
              {pendingArchive.changeId}
            </p>
            <p className={css.hint}>{pendingArchive.title}</p>
            <div className={css.actions}>
              <button
                type="button"
                className={clsx(css.btn, css.btnGhost)}
                disabled={busy}
                onClick={() => setPendingArchive(null)}
              >
                {t('dashboard.close')}
              </button>
              <button
                type="button"
                className={clsx(css.btn, css.btnDanger)}
                disabled={busy}
                onClick={() => {
                  const target = pendingArchive
                  setPendingArchive(null)
                  void run(() => transition(target.changeId, 'archive'))
                }}
              >
                {t('action.confirmArchive')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* §22.14 P3 — abandon-gate destructive confirm modal. Mirrors the
          archive modal: backdrop / Escape cancels, the primary action runs
          `gateResolve('abandon', 'confirm')` → host dispatches
          /baf-workflow-abandon confirm → driveAbandon → projection
          `transition → 'abandoned'` event. */}
      {pendingAbandon !== null && (
        <div
          className={css.dashboardBackdrop}
          role="presentation"
          onClick={() => setPendingAbandon(null)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setPendingAbandon(null)
          }}
        >
          <div
            className={css.dashboardPanel}
            role="alertdialog"
            aria-modal="true"
            aria-label={t('action.abandon')}
            onClick={event => event.stopPropagation()}
          >
            <div className={css.dashboardHead}>
              <h2 className={css.dashboardTitle}>{t('action.abandon')}</h2>
            </div>
            <p className={css.hint}>
              {t('abandon.confirmHelp')}
            </p>
            <p className={css.hint}>
              {pendingAbandon.changeId}
            </p>
            <div className={css.actions}>
              <button
                type="button"
                className={clsx(css.btn, css.btnGhost)}
                disabled={busy}
                onClick={() => setPendingAbandon(null)}
              >
                {t('dashboard.close')}
              </button>
              <button
                type="button"
                className={clsx(css.btn, css.btnDanger)}
                disabled={busy}
                onClick={() => {
                  const target = pendingAbandon
                  setPendingAbandon(null)
                  void run(() => gateResolve({
                    changeId: target.changeId,
                    gateId: 'abandon',
                    optionId: 'confirm',
                  }))
                }}
              >
                {t('action.abandon')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LanePanel(props: {
  lanes: WorkflowTabLanesView
  t: (key: WorkflowTabKey) => string
}): React.ReactElement {
  const { lanes, t } = props
  const { upgrade } = lanes
  return (
    <section className={css.lanes} aria-label={t('lane.help')}>
      <p className={css.lanesHint}>{t('lane.help')}</p>
      <div className={css.laneRows}>
        {lanes.lanes.map(lane => (
          <div
            key={lane.id}
            className={clsx(css.lane, lane.id === 'bug-fast-path' && css.lanePreserved)}
          >
            <span className={css.laneLabel}>
              {t(lane.id === 'bug-fast-path' ? 'lane.fastpath' : 'lane.fullgo')}
            </span>
            <ol className={css.laneTrack}>
              {lane.nodes.map((node) => {
                const status = lane.status[node]
                return (
                  <li
                    key={node}
                    className={clsx(css.laneNode, status !== undefined && statusClass(status))}
                  >
                    {t(`node.${node}`)}
                  </li>
                )
              })}
            </ol>
          </div>
        ))}
      </div>
      <div className={css.upgradeEdge}>
        <span className={css.upgradeTitle}>
          {fillTemplate(t('edge.upgraded'), {
            from: t(`node.${upgrade.from}`),
            to: t(`node.${upgrade.to}`),
          })}
        </span>
        <span className={css.upgradeMeta}>
          <span className={css.metaKey}>{t('edge.cause')}</span> {upgrade.cause}
        </span>
        <span className={css.upgradeMeta}>
          <span className={css.metaKey}>{t('edge.at')}</span> {upgrade.at}
        </span>
      </div>
      <div className={css.preserved}>
        <span className={css.metaKey}>{t('edge.preserved')}</span>
        {lanes.preservedArtifacts.length === 0 ? (
          <span className={css.hint}>{t('edge.preservedEmpty')}</span>
        ) : (
          <ul className={css.list}>
            {lanes.preservedArtifacts.map(artifact => (
              <li key={artifact}>{artifactName(artifact)}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
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
