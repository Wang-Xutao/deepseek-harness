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
// 【变更】2026-09-22 (user report #4) — type-only: merges the sessionStats +
// tokenUsage keys into SessionProjectionMap for useProjection. The values ride
// the host session-projection channel (token-meter / session-stats units),
// so nothing is imported at runtime and no module-table row is requested.
import type {} from '@deepseek-ai/dsh-session-stats/client'
import type { SessionStatsProjection } from '@deepseek-ai/dsh-session-stats/client'
import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import type {
  TerminalStateId,
  WorkflowDashboardRow,
  WorkflowDashboardView,
  WorkflowNodeId,
  WorkflowTabLanesView,
  WorkflowTabNodeView,
  WorkflowTabView,
} from './tab-types.ts'
import type { WorkflowTabKey } from './locales.ts'
import { CATALOG_ZH } from './catalog-i18n.ts'
import { buildClientTemplateTabView, withRenderableGraph } from './graph-template.ts'
import { NodeIcon } from './icons.tsx'
import { createRefreshScheduler } from './refresh-scheduler.ts'
import css from './WorkflowView.module.css'

/** intake.mode wire value → locale key (the rail's 变更分类 card). */
const INTAKE_MODE_LABEL: Record<string, WorkflowTabKey> = {
  'full-go-path': 'mode.fullGoPath',
  'bug-fix-path': 'mode.bugFixPath',
  'clarify-required': 'mode.clarify',
}

/** Session-bound workflow Remote callbacks. */
export interface WorkflowViewInjected {
  /**
   * Re-read the Tab view. Without `changeId` the host picks the workspace's
   * active change (its fallback is `pickActiveChange` since §22.19 R3); with
   * one it focuses that change — the Dashboard rows use this to open any
   * change, terminal ones included.
   */
  refresh: (changeId?: string) => Promise<WorkflowTabView>
  confirmIntake: (changeId: string) => Promise<WorkflowTabView>
  rejectIntake: (changeId: string) => Promise<WorkflowTabView>
  startIntake: (description: string) => Promise<WorkflowTabView>
  /**
   * §22 user-request 2026-09-20 — Tab 「推进」 button. 【变更】2026-09-23
   * (demo1 issue #4): now the exact counterpart of typing `/baf-go` in chat —
   * the host routes `driveGo` with the §22 dialog channel, so the click pops
   * the same confirmation popup and the landed authoring rest gets the work
   * order (model participation). Compositions without a popup channel fall
   * back to the old positive-path (`confirm:true`) shape.
   */
  advance: (changeId: string) => Promise<WorkflowTabView>
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
  gateResolve: (request: { changeId?: string; gateId: string; optionId: string; extraArgs?: readonly string[] }) => Promise<WorkflowTabView>
  /**
   * 【变更】2026-09-23 (user issue #6): the 变更总览 dashboard payload — every
   * change in the workspace as one rollup row (phase, task progress,
   * duration, tokens) plus the summary tiles. Fetched when the modal opens.
   */
  dashboard: () => Promise<WorkflowDashboardView>
  /**
   * 2026-09-21 (session 5.jsonl) — open one change artifact in the right
   * sidebar (view/edit). The workspace-relative `path` comes straight off a
   * `WorkflowTabView.artifacts` row; command-card bodies render in <pre>
   * plain text, so this rail button is the GUI's true open channel.
   */
  openArtifact: (path: string) => void
  /**
   * §22.19 R5 — real-time push subscription. The host emits
   * `baf-workflow/projection-appended` after every appended projection
   * event in this session's workspace; the returned disposer unregisters
   * (pair it in the same useEffect that created the scheduler).
   */
  subscribe: (onChange: () => void) => () => void
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
  // 【变更】2026-09-23 (demo5 issue #2): 0 is a REAL value (a finished stage
  // that took no time) — only undefined/negative reads as the — blank.
  if (ms === undefined || ms < 0) return '—'
  if (ms === 0) return '0s'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return `${m}m${s}s`
}

/**
 * 【变更】2026-09-23 (demo5 issue #2): whether a node status means the flow
 * actually EXECUTED that stage — an executed stage shows its real figures and
 * 0 / 0s when nothing was attributed (a completed stage must never read —);
 * only stages the flow never reached (locked / skipped / template / idle)
 * keep the — blank.
 */
function stageExecuted(status: WorkflowTabNodeView['status'] | undefined): boolean {
  return status === 'completed' || status === 'in-progress' || status === 'failed'
    || status === 'blocked' || status === 'drifted'
}

/** Stage-aware duration: executed → real value or 0s; never-executed → —. */
function stageDuration(status: WorkflowTabNodeView['status'] | undefined, ms: number | undefined): string {
  if (ms !== undefined) return formatDuration(ms)
  return stageExecuted(status) ? '0s' : '—'
}

/** Stage-aware tokens: executed → real value or 0K; never-executed → —. */
function stageTokens(
  status: WorkflowTabNodeView['status'] | undefined,
  input: number | undefined,
  output: number | undefined,
): string {
  if (input !== undefined || output !== undefined) return formatTokens(input, output)
  return stageExecuted(status) ? formatTokens(0, 0) : '—'
}

function formatTokens(input?: number, output?: number): string {
  // 【变更】2026-09-23 (demo1 十问题 6): the node-card token display — unit is
  // always K (0K under a thousand); '—' means the stage did no model work at
  // all, which is the only honest blank.
  if (input === undefined && output === undefined) return '—'
  return formatTokenCount((input ?? 0) + (output ?? 0))
}

/**
 * 【变更】2026-09-23 (demo1 十问题 6): K is the default unit everywhere — a
 * value under a thousand reads 0K (not a bare number that reads like a
 * different unit), millions keep the M tier.
 * @param value - non-negative token count.
 * @returns compact display string (0K / 12.3K / 1.2M).
 */
function formatTokenCount(value: number): string {
  const scaled = (candidate: number): string =>
    candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10)
  if (value < 1_000) return '0K'
  if (value < 1_000_000) return `${scaled(value / 1_000)}K`
  return `${scaled(value / 1_000_000)}M`
}

/**
 * Sum the three disjoint prompt-side billing buckets plus output — the same
 * aggregate the composer's usage pill shows (StatsPills `billedInputTokens`).
 * @param usage - the session's token-usage projection value.
 * @returns billed total tokens.
 */
function billedTotalTokens(usage: TokenUsageProjection): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens
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
    case 'full-go-path': return t('mode.fullGoPath')
    case 'bug-fix-path': return t('mode.bugFixPath')
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

/** The §13 R3 bug-fix form's five fields (strings; `file` is one-per-line). */
interface BugFixFormValue {
  problem: string
  rootCause: string
  file: string
  test: string
  testCmd: string
}

/**
 * Quote one value as a `key="value"` token the host's §12 tokenizer
 * round-trips — it strips quotes without escape support, so embedded
 * quotes/newlines are removed first (the same `kv` rule gate-dialog applies).
 */
function bugFixKv(key: string, value: string): string {
  const cleaned = value.replaceAll('"', ' ').replaceAll("'", ' ').replaceAll('\n', ' ').replaceAll('\r', ' ')
  return `${key}="${cleaned.trim()}"`
}

/**
 * 【变更】2026-09-23 (demo2 user issue #2): the form's submit rides the
 * `gateResolve('intake-classify', 'confirm-bugfix')` click as `extraArgs`
 * (§22.17 J) — one button settles path + fields AND the click now carries the
 * work-order channel, so the model is woken after the confirm instead of the
 * Tab path stalling at a freshly-entered stage (the same fix the dialog
 * clicks got).
 */
function bugFixExtraArgs(value: BugFixFormValue): string[] {
  const files = value.file.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0)
  return [
    bugFixKv('problem', value.problem),
    bugFixKv('root-cause', value.rootCause),
    ...files.map(f => bugFixKv('file', f)),
    bugFixKv('test', value.test),
    bugFixKv('test-cmd', value.testCmd),
  ]
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
function BugFixPathForm(props: {
  busy: boolean
  changeId: string | null
  value: BugFixFormValue
  onChange: (next: BugFixFormValue) => void
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
  if (problemTrimmed.length === 0) missing.push(t('intake.bugFixPath.problem'))
  if (rootCauseTrimmed.length === 0) missing.push(t('intake.bugFixPath.rootCause'))
  if (fileLines.length === 0) missing.push(t('intake.bugFixPath.file'))
  if (testTrimmed.length === 0) missing.push(t('intake.bugFixPath.test'))
  if (testCmdTrimmed.length === 0) missing.push(t('intake.bugFixPath.testCmd'))
  const ready = missing.length === 0 && changeId !== null
  return (
    <div className={css.bugFixPathForm} aria-label={t('intake.bugFixPath.title')}>
      <p className={css.hint}>{t('intake.bugFixPath.help')}</p>
      <label className={css.bugFixPathLabel}>
        {t('intake.bugFixPath.problem')}
        <textarea
          className={clsx(css.bugFixPathInput, css.bugFixPathTextarea)}
          value={value.problem}
          onChange={event => onChange({ ...value, problem: event.target.value })}
          rows={2}
          disabled={busy}
        />
      </label>
      <label className={css.bugFixPathLabel}>
        {t('intake.bugFixPath.rootCause')}
        <textarea
          className={clsx(css.bugFixPathInput, css.bugFixPathTextarea)}
          value={value.rootCause}
          onChange={event => onChange({ ...value, rootCause: event.target.value })}
          rows={2}
          disabled={busy}
        />
      </label>
      <label className={css.bugFixPathLabel}>
        {t('intake.bugFixPath.file')}
        <textarea
          className={clsx(css.bugFixPathInput, css.bugFixPathTextarea)}
          value={value.file}
          onChange={event => onChange({ ...value, file: event.target.value })}
          rows={3}
          placeholder={'src/foo.ts\nsrc/bar.ts'}
          disabled={busy}
        />
        <span className={css.bugFixPathHelp}>{t('intake.bugFixPath.fileHelp')}</span>
      </label>
      <label className={css.bugFixPathLabel}>
        {t('intake.bugFixPath.test')}
        <input
          type="text"
          className={css.bugFixPathInput}
          value={value.test}
          onChange={event => onChange({ ...value, test: event.target.value })}
          placeholder="tests/foo.spec.ts"
          disabled={busy}
        />
      </label>
      <label className={css.bugFixPathLabel}>
        {t('intake.bugFixPath.testCmd')}
        <input
          type="text"
          className={css.bugFixPathInput}
          value={value.testCmd}
          onChange={event => onChange({ ...value, testCmd: event.target.value })}
          placeholder="pnpm test foo"
          disabled={busy}
        />
      </label>
      {missing.length > 0 && (
        <p className={css.bugFixPathWarn} role="status">{t('intake.bugFixPath.required')}</p>
      )}
      <div className={css.actions}>
        <button
          type="button"
          className={clsx(css.btn, css.btnPrimary)}
          disabled={busy || !ready}
          onClick={onSubmit}
        >
          {t('intake.bugFixPath.submit')}
        </button>
      </div>
    </div>
  )
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
  const {
    t, refresh, startIntake, advance, transition, resume,
    gateResolve, openArtifact, useProjection, subscribe, dashboard,
  } = props
  const preset = useProjection('agentPreset')
  // 【变更】2026-09-22 (user report #4) — session statistics. Both figures ride
  // durable whole-log projections (tokenUsage: cumulative provider usage;
  // sessionStats: turn/step counts and wall times), so paging and compaction
  // cannot change them; each stays undefined until the host serves a value
  // (before the first billed step).
  const sessionStats = useProjection('sessionStats')
  const tokenUsage = useProjection('tokenUsage')
  const [view, setView] = useState<WorkflowTabView>(() => withRenderableGraph(buildClientTemplateTabView()))
  const [selected, setSelected] = useState<WorkflowNodeId | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [railWidth, setRailWidth] = useState(RAIL_DEFAULT)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  // 【变更】2026-09-23 (user issue #6): the 变更总览 modal's payload — fetched
  // when the modal opens (and on manual refresh), never on the poll path.
  const [dashboardData, setDashboardData] = useState<WorkflowDashboardView | null>(null)
  const [dashboardBusy, setDashboardBusy] = useState(false)
  // 【变更】2026-09-23 (demo5 issue #5): the opened history flow — its OWN
  // modal, independent of the main view. `refresh(changeId)`'s return value
  // feeds it directly, so the 2 s poll (which re-picks the ACTIVE change in
  // the main view) can no longer replace an opened history 2 s later. The
  // dashboard stays open underneath — 变更总览 and 历史流程图 are two pages.
  const [historyPick, setHistoryPick] = useState<{
    changeId: string
    endedAt?: string
    busy: boolean
    error: string | null
    view: WorkflowTabView | null
  } | null>(null)
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
  const [bugFixPath, setBugFixPath] = useState({
    problem: '',
    rootCause: '',
    file: '',
    test: '',
    testCmd: '',
  })
  // 【变更】2026-09-23 (demo1 十问题 2): the current the view last
  // auto-selected — see applyView.
  const lastAutoCurrent = useRef<WorkflowNodeId | TerminalStateId | null>(null)

  const applyView = useCallback((next: WorkflowTabView) => {
    const safe = withRenderableGraph(next)
    setView(safe)
    setError(safe.blockedReason ?? null)
    // 2026-09-23 issue #5: terminal currents (completed/abandoned) have no
    // catalog node to select — keep whatever the customer last clicked; the
    // rail carries the archived docs (the archive-path read fix).
    // 【变更】2026-09-23 (demo1 十问题 2): the selection only follows a REAL
    // stage advance — the 2 s scheduler refresh re-applies the same current,
    // and the old unconditional setSelected stole the customer's clicked card
    // every tick (选「设计」被自动切回「计划」).
    if (safe.current !== null
      && safe.current !== 'completed' && safe.current !== 'abandoned'
      && lastAutoCurrent.current !== safe.current) {
      lastAutoCurrent.current = safe.current
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

  // 【变更】2026-09-22 (user report #3): automatic refreshes (scheduler
  // poll/poke ticks, focus & visibility re-syncs) must never toggle `busy` —
  // every poll flashed the whole strip (all `disabled={busy}` buttons plus the
  // busy span) for the duration of the fetch. `run` stays reserved for
  // user-initiated button clicks, where the busy state is real feedback.
  // A failed silent tick keeps the last good view and stays quiet: the next
  // tick retries anyway, and a 2 s error flash is the same flicker class.
  const runSilent = useCallback(async (op: () => Promise<WorkflowTabView>) => {
    try {
      applyView(await op())
    } catch {
      // Transient — the painted graph stays; interactive errors still surface
      // through `run`.
    }
  }, [applyView])

  useEffect(() => {
    if (preset !== 'baf') return
    void run(() => refresh())
  }, [preset, refresh, run])

  // 【变更】2026-09-24 (demo6 问题 11): fetch on the OPEN transition only.
  // The old effect listed `dashboardBusy` in its deps and flipped busy inside
  // — busy false→true→false re-fired the effect forever, so the head showed
  // 刷新… the whole time the modal was open (and each pass re-fetched).
  // `loadDashboard` keeps the last data painted while refetching (no null
  // flash), so the busy span is a real transient now.
  const loadDashboard = useCallback(() => {
    setDashboardBusy(true)
    dashboard()
      .then((data) => { setDashboardData(data) })
      .catch(() => { setDashboardData(null) })
      .finally(() => { setDashboardBusy(false) })
  }, [dashboard])
  useEffect(() => {
    if (!dashboardOpen) return
    loadDashboard()
  }, [dashboardOpen, loadDashboard])

  // §22.19 R5 — synchronous in-flight mirror. `busy` is state, so a closure
  // reading it in the same tick it was set sees the old value; the push
  // notifications and poll ticks below need an immediate guard.
  const inFlight = useRef(false)

  const refreshNow = useCallback(() => {
    if (inFlight.current || document.visibilityState !== 'visible') return
    inFlight.current = true
    void runSilent(() => refresh()).finally(() => { inFlight.current = false })
  }, [runSilent, refresh])

  // §22.19 R5 — real-time Tab follow. Every appended projection event in
  // this workspace (host push, filtered by cwd in the injected `subscribe`)
  // pokes a 200 ms trailing-debounce refresh; a 2 s visible poll is the
  // floor under the push (a second process writing the workspace, a lost
  // forwarded event). Hidden tabs stay quiet; the §13 R8 effect above
  // refreshes the moment the tab becomes visible/focused again.
  useEffect(() => {
    if (preset !== 'baf') return
    const scheduler = createRefreshScheduler({ refresh: refreshNow })
    const off = subscribe(() => { scheduler.poke() })
    return () => {
      off()
      scheduler.dispose()
    }
  }, [preset, subscribe, refreshNow])

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
    const onFocus = () => { void runSilent(() => refresh()) }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onFocus()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [preset, refresh, runSilent])

  const selectedNode = useMemo(
    () => view.nodes.find(n => n.id === selected) ?? null,
    [view, selected],
  )
  // 【变更】2026-09-23 (demo1 十问题 10): terminal cards (完成/已放弃) have no
  // NODE_CATALOG entry — the detail panel renders this compact summary instead
  // of the empty hint. `selected` types as WorkflowNodeId, but the graph's
  // terminal placements activate through the same cast.
  const selectedId = selected as WorkflowNodeId | TerminalStateId | null
  const selectedTerminal = selectedId === 'completed' || selectedId === 'abandoned' ? selectedId : null

  // 【变更】2026-09-22 (user report #4) — strip token cell + stats-card
  // figures derived from the tokenUsage projection (undefined → placeholder).
  const tokenTotal = tokenUsage === undefined ? undefined : billedTotalTokens(tokenUsage)
  const tokenTooltip = useMemo(() => {
    if (tokenUsage === undefined) return t('metrics.pending')
    return [
      `${t('stats.total')} ${formatTokenCount(billedTotalTokens(tokenUsage))}`,
      `${t('stats.input')} ${formatTokenCount(tokenUsage.uncachedInputTokens)}`,
      `${t('stats.cacheRead')} ${formatTokenCount(tokenUsage.cacheReadTokens)}`,
      `${t('stats.cacheWrite')} ${formatTokenCount(tokenUsage.cacheWriteTokens)}`,
      `${t('stats.output')} ${formatTokenCount(tokenUsage.outputTokens)}`,
    ].join('\n')
  }, [tokenUsage, t])

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

  // 【变更】2026-09-23 (user issue #5): every node is clickable, terminal
  // states included — the graph is the change's history, and a completed or
  // abandoned change is exactly when the customer wants to click back through
  // the stages (their data, their docs). Selection is view-only everywhere:
  // it opens the detail panel, it never drives a transition.
  const onCardActivate = (id: string) => {
    setSelected(id as WorkflowNodeId)
  }

  // 【变更】2026-09-23 (demo5 issue #5): open one change's flow graph in its
  // OWN modal — the fetch's return value feeds this modal directly and the
  // main view is untouched, so the 2 s active-change poll can never replace
  // an opened history. Terminal rows open here; active rows still jump the
  // main view (that is a focus, not a history read).
  const openHistory = useCallback((changeId: string, endedAt?: string) => {
    setHistoryPick({ changeId, ...(endedAt === undefined ? {} : { endedAt }), busy: true, error: null, view: null })
    refresh(changeId)
      .then(next => setHistoryPick({
        changeId,
        ...(endedAt === undefined ? {} : { endedAt }),
        busy: false,
        error: null,
        view: withRenderableGraph(next),
      }))
      .catch(err => setHistoryPick({
        changeId,
        ...(endedAt === undefined ? {} : { endedAt }),
        busy: false,
        error: err instanceof Error ? err.message : String(err),
        view: null,
      }))
  }, [refresh])

  /**
   * 【变更】2026-09-23 (user issue #6): one dashboard table row — phase pill,
   * task progress bar, duration, tokens, and the 查看工作流 action.
   * 【变更】2026-09-23 (demo5 issue #5): a TERMINAL row opens the history
   * modal (dashboard stays open underneath); an active row keeps the old
   * focus jump.
   */
  const dashboardRow = (row: WorkflowDashboardRow, current: WorkflowTabView, terminal: boolean) => {
    const focused = row.changeId === current.selectedChangeId || row.changeId === current.changeId
    const stageLabel = t(`node.${row.current}` as WorkflowTabKey)
    const done = row.tasks?.done ?? 0
    const total = row.tasks?.total ?? 0
    const percent = total === 0 ? 0 : Math.round((done / total) * 100)
    const tokens = formatTokens(row.inputTokens, row.outputTokens)
    return (
      <button
        type="button"
        className={clsx(css.dashboardItem, css.dashboardPick, focused && css.dashboardItemFocus)}
        disabled={busy}
        title={t('dashboard.openChange')}
        onClick={() => {
          if (terminal) {
            openHistory(row.changeId, row.endedAt)
            return
          }
          setDashboardOpen(false)
          void run(() => refresh(row.changeId))
        }}
      >
        <span className={css.dashboardItemMain}>
          <span className={css.dashboardId}>{row.changeId}</span>
          <span className={css.dashboardMeta}>
            {modeLabel(row.mode, t)}
            {' · '}
            <span className={clsx(css.dashboardPhase, terminal && css.dashboardPhaseTerminal)}>{stageLabel}</span>
            {row.endedAt !== undefined && ` · ${row.endedAt.slice(0, 16).replace('T', ' ')}`}
          </span>
          <span className={css.dashboardRowMetrics}>
            {row.tasks !== undefined && (
              <span className={css.dashboardProgress} title={t('dashboard.tasksHelp')}>
                <span className={css.dashboardProgressFill} style={{ width: `${percent}%` }} />
                <span className={css.dashboardProgressText}>{done}/{total}</span>
              </span>
            )}
            <span title={t('card.duration')}>{formatDuration(row.durationMs)}</span>
            <span title={t('card.tokens')}>{tokens}</span>
          </span>
        </span>
        {focused && <span className={css.currentPill}>{t('dashboard.focus')}</span>}
      </button>
    )
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
        <span className={css.stripItem} title={tokenTooltip}>
          <span className={css.stripLabel}>{t('strip.totalTokens')}</span>
          <span className={css.stripValue}>
            {tokenTotal === undefined || tokenTotal === 0 ? '—' : formatTokenCount(tokenTotal)}
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
        {/* 【变更】2026-09-24 (demo6 问题 14): the busy span is gone and manual
            refresh rides `runSilent` — `run` toggled `busy`, which disabled
            every strip button and flashed the whole strip for the duration of
            one fetch. Refresh is a read: keep the strip interactive. */}
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
          onClick={() => void runSilent(() => refresh())}
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
        {/* §22 user-request 2026-09-20 — Tab 「推进」 button.
            【变更】2026-09-23 (demo1 issue #4): the click now has exact
            /baf-go parity — the host routes driveGo with the §22 dialog
            channel, so the resting-point decision pops the same popup the
            session command pops, and the authoring rest the confirm lands on
            receives the work order (the model wakes; the session shows the
            派单 row and the turn). The no-popup confirm:true shape survives
            only as the fallback when no dialog channel exists.
            (2026-09-22 user report #4 keeps holding: the button renders only
            when the host-derived `advance` says the CURRENT node's file gate
            passes — 产物是推进的前提，按钮只做确认；not ready → disabled with
            the gate's missing list in the tooltip; absent → hide.) */}
        {view.changeId !== null
          && view.current !== null
          && view.current !== 'completed'
          && view.current !== 'abandoned'
          && view.current !== 'drift'
          && view.gate === undefined
          && view.advance !== undefined ? (
            <button
              type="button"
              className={clsx(css.btn, view.advance.ready ? css.btnPrimary : css.btnGhost)}
              disabled={busy || !view.advance.ready}
              title={view.advance.ready
                ? t('action.advanceHelp')
                : `${t('action.advanceBlocked')}\n${view.advance.missing.join('\n')}`}
              onClick={() => {
                const changeId = view.changeId
                if (changeId === null || view.advance?.ready !== true) return
                void run(() => advance(changeId))
              }}
            >
              {t('action.advance')}
            </button>
          ) : null}
      </div>

      {view.openspecSkipped?.skipped === true && (
        <div className={css.banner}>
          {t('openspec.skipped')}: {view.openspecSkipped.reasonCodes.join(', ')}
        </div>
      )}

      {/* §22.19 R5 — terminal dead-end escape. The view focused a completed
          or abandoned change (a Dashboard pick, or a stale pre-push fetch —
          session 7.jsonl's stuck「已放弃」screen) while a live change exists
          in the workspace. A plain refresh() re-runs the host's active-change
          fallback and lands on the live one; the button says exactly that. */}
      {(view.current === 'completed' || view.current === 'abandoned')
        && view.changes.some(c => c.current !== 'completed' && c.current !== 'abandoned') ? (
          <div className={clsx(css.banner, css.bannerActions)}>
            <button
              type="button"
              className={clsx(css.btn, css.btnPrimary)}
              disabled={busy}
              onClick={() => void run(() => refresh())}
            >
              {t('action.backToActive')}
            </button>
          </div>
        ) : null}

      {/* §22.14 P3 — pending decision gate card. The host computes this when
          `.baf/baseline.yml` is missing (workspace scaffold gate) or — 2026-09-23
          demo2 issue #2 — when the focused change rests at a pending
          classification; the Tab renders the registered question and one
          button per option at the TOP of the workflow page, so the same
          decision the session dialog pops is clickable here at the same
          moment (projection push + poll keep the two surfaces in sync).
          `cancel` is the `__noop__` sentinel — `gateResolve` returns a calm
          dismissal card and the host re-derives the gate (its condition still
          holds). */}
      {view.pendingGate !== undefined && (
        <section className={clsx(css.card, css.cardGate)} aria-label={t('pendingGate.title')}>
          <div className={css.cardTitle}>
            {view.pendingGate.gateId === 'intake-classify'
              ? t('pendingGate.classifyTitle')
              : t('pendingGate.title')}
          </div>
          <p className={css.hint}>{view.pendingGate.question}</p>
          {(view.pendingGate.detail ?? []).map(line => (
            <p key={line} className={css.hint}>{line}</p>
          ))}
          <div className={css.actions}>
            {view.pendingGate.options.map((opt) => {
              const isCancel = opt.id === 'cancel' || opt.id === 'reject'
              return (
                <button
                  key={`pending-${opt.id}`}
                  type="button"
                  className={clsx(css.btn, isCancel ? css.btnGhost : css.btnPrimary)}
                  disabled={busy}
                  title={
                    view.pendingGate?.gateId === 'intake-classify' && opt.id === 'confirm-bugfix'
                      ? t('pendingGate.bugFixFieldsHelp')
                      : undefined
                  }
                  onClick={() => {
                    const gate = view.pendingGate
                    if (gate === undefined) return
                    void run(() => gateResolve({
                      ...(gate.changeId === undefined ? {} : { changeId: gate.changeId }),
                      gateId: gate.gateId,
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

      {/* 【变更】2026-09-23 (demo2 user issue #2): the change-level confirm
          gate (§18.5 gate A/B) as a TOP banner — the decision buttons the
          session dialog pops, rendered at the top of the workflow page at the
          moment the change parks on them. Clicks dispatch through the same
          `gateResolve` channel; the verify-archive confirm option goes through
          the §13 R1 destructive modal, exactly like the rail's primary
          button. The rail keeps its buttons — this banner is the
          at-the-top parity surface, not a replacement. */}
      {view.gate !== undefined
        && view.gate.gateId !== undefined
        && view.gate.question !== undefined
        && view.changeId !== null && (
        <section className={clsx(css.card, css.cardGate)} aria-label={t('gate.bannerTitle')}>
          <div className={css.cardTitle}>{t('gate.bannerTitle')}</div>
          <p className={css.hint}>{view.gate.question}</p>
          <div className={css.actions}>
            {(view.gate.options ?? []).map(opt => (
              <button
                key={`gate-banner-${opt.id}`}
                type="button"
                className={clsx(css.btn, opt.id === 'confirm' ? css.btnPrimary : css.btnGhost)}
                disabled={busy}
                onClick={() => {
                  const changeId = view.changeId
                  const gateId = view.gate?.gateId
                  if (changeId === null || gateId === undefined) return
                  // §13 R1 — destructive confirm behind the modal.
                  if (gateId === 'verify-archive' && opt.id === 'confirm') {
                    setPendingArchive({ changeId, title: t('gate.verifyPassed') })
                    return
                  }
                  void run(() => gateResolve({ changeId, gateId, optionId: opt.id }))
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className={css.body}>
        <div className={css.main}>
          {view.lanes !== undefined && <LanePanel lanes={view.lanes} t={t} />}
          {/* 【变更】2026-09-23 (demo5 issue #5): the flow canvas is its own
              component (pan/zoom/canvas math live inside) so the history
              modal re-renders the SAME graph for any change without touching
              the main view's state. */}
          <FlowCanvas view={view} selected={selected} onActivate={onCardActivate} t={t} />

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
                {/* 【变更】2026-09-23 (demo1 五问题 5): compacted — the two
                    explanatory paragraphs (workflow jargon) are gone; the
                    field semantics ride as the confidence cell's hover title,
                    and the pending confirmation is the one highlighted
                    exception. Fields stay: 模式 first (the settled decision),
                    then the pre-judgment trio, confirmation state, summary. */}
                <div className={css.metaRow}>
                  <span className={css.metaKey}>{t('intake.mode')}</span>
                  <span className={view.intake.confirmation === 'pending' ? css.metaValueWarn : undefined}>
                    {t(INTAKE_MODE_LABEL[view.intake.mode] ?? 'mode.help')}
                  </span>
                  <span className={css.metaKey}>{t('intake.kind')}</span>
                  <span>{t(`kind.${view.intake.kind}` as WorkflowTabKey)}</span>
                  {/* 【变更】2026-09-24 (demo6 问题 2): once the plan froze the
                      allowlist the scope IS determined — show the settled
                      label with the real file count (tooltip lists files). */}
                  <span className={css.metaKey}>{t('intake.scope')}</span>
                  <span
                    className={css.scopeValue}
                    title={view.planAllowlist === undefined
                      ? t('intake.heuristicNote')
                      : `${t('intake.allowlist')}（${view.planAllowlist.length}）:\n${view.planAllowlist.join('\n')}`}
                  >
                    {t(`scope.${view.intake.affectedScope}` as WorkflowTabKey)}
                    {view.planAllowlist !== undefined && (
                      <span className={css.scopeFiles}> · {t('intake.allowlist')} {view.planAllowlist.length}</span>
                    )}
                  </span>
                  {/* 【变更】2026-09-24 (demo6 问题 8): the hover now explains the
                      number itself (40% base / 70% keyword hit, and when each
                      field settles) instead of restating the pre-judgment. */}
                  <span className={css.metaKey}>{t('intake.confidence')}</span>
                  <span title={t('intake.confidenceHelp')}>{(view.intake.confidence * 100).toFixed(0)}%</span>
                  <span className={css.metaKey}>{t('intake.confirmation')}</span>
                  <span className={view.intake.confirmation === 'pending' ? css.metaValueWarn : undefined}>
                    {view.intake.confirmation === 'confirmed'
                      ? `已确认 · ${view.intake.mode}`
                      : t(`intake.confirmation.${view.intake.confirmation}` as WorkflowTabKey)}
                  </span>
                  {/* 【变更】2026-09-24 (demo6 问题 3): the summary rides the same
                      key/value row style as 模式/类型 — it was a loose hint
                      paragraph while every other field was a labeled row. */}
                  <span className={css.metaKey}>{t('intake.summary')}</span>
                  <span className={css.summaryText}>{view.intake.summary}</span>
                </div>
                {/* §13 R9 — keep the classification metadata visible after
                    confirm so the customer can re-check what was agreed.
                    Pending: the two registry path buttons (§22.17 J parity —
                    the dialog offers both paths, so does the Tab; a click is
                    confirm + open in one step, matching every other surface).
                    Confirmed while still parked on intake: the open drive never
                    landed (blocked precondition or a restart) — surface the
                    retry inline instead of leaving only the rail's generic
                    action (2026-09-20 incident: the card showed nothing
                    clickable).
                    【变更】2026-09-23 (demo2 user issue #1): the clicks now
                    dispatch through `gateResolve('intake-classify', …)` — the
                    single resolve channel — so the host's classify-confirm
                    follow-up wakes the model at the authoring rest (the old
                    `transition` path confirmed and then went silent until
                    someone typed /baf-go). */}
                {view.intake.confirmation === 'pending' ? (
                  <>
                    <div className={css.actions}>
                      <button
                        type="button"
                        className={clsx(css.btn, css.btnPrimary)}
                        disabled={busy || view.changeId === null}
                        title={t('intake.confirmFullHelp')}
                        onClick={() => {
                          const changeId = view.changeId
                          if (changeId !== null) void run(() => gateResolve({ changeId, gateId: 'intake-classify', optionId: 'confirm-full' }))
                        }}
                      >
                        {t('intake.confirmFull')}
                      </button>
                      <button
                        type="button"
                        className={clsx(css.btn, css.btnPrimary)}
                        disabled={busy || view.changeId === null}
                        title={t('intake.confirmBugFixHelp')}
                        onClick={() => {
                          const changeId = view.changeId
                          if (changeId !== null) void run(() => gateResolve({ changeId, gateId: 'intake-classify', optionId: 'confirm-bugfix' }))
                        }}
                      >
                        {t('intake.confirmBugFix')}
                      </button>
                      <button
                        type="button"
                        className={clsx(css.btn, css.btnDanger)}
                        disabled={busy || view.changeId === null}
                        onClick={() => {
                          const changeId = view.changeId
                          if (changeId !== null) void run(() => gateResolve({ changeId, gateId: 'intake-classify', optionId: 'reject' }))
                        }}
                      >
                        {t('intake.reject')}
                      </button>
                    </div>
                    {view.intake.mode === 'bug-fix-path' && (
                      <BugFixPathForm
                        busy={busy}
                        changeId={view.changeId}
                        value={bugFixPath}
                        onChange={setBugFixPath}
                        onSubmit={() => {
                          const changeId = view.changeId
                          if (changeId === null) return
                          void run(() => gateResolve({
                            changeId,
                            gateId: 'intake-classify',
                            optionId: 'confirm-bugfix',
                            extraArgs: bugFixExtraArgs(bugFixPath),
                          }))
                          setBugFixPath({ problem: '', rootCause: '', file: '', test: '', testCmd: '' })
                        }}
                        t={t}
                      />
                    )}
                  </>
                ) : view.current === 'intake' ? (
                  view.intake.mode === 'bug-fix-path' ? (
                    <BugFixPathForm
                      busy={busy}
                      changeId={view.changeId}
                      value={bugFixPath}
                      onChange={setBugFixPath}
                      onSubmit={() => {
                        const changeId = view.changeId
                        if (changeId === null) return
                        void run(() => gateResolve({
                          changeId,
                          gateId: 'intake-classify',
                          optionId: 'confirm-bugfix',
                          extraArgs: bugFixExtraArgs(bugFixPath),
                        }))
                        setBugFixPath({ problem: '', rootCause: '', file: '', test: '', testCmd: '' })
                      }}
                      t={t}
                    />
                  ) : view.intake.mode === 'full-go-path' ? (
                    <div className={css.actions}>
                      <button
                        type="button"
                        className={clsx(css.btn, css.btnPrimary)}
                        disabled={busy || view.changeId === null}
                        title={t('intake.enterOpenHelp')}
                        onClick={() => {
                          const changeId = view.changeId
                          if (changeId !== null) void run(() => transition(changeId, 'open'))
                        }}
                      >
                        {t('action.enterOpen')}
                      </button>
                    </div>
                  ) : (
                    // Confirmed on the unresolved `clarify-required` verdict
                    // (legacy logs): the mode can never drive, so the two
                    // path buttons are the rescue — setIntakeMode accepts the
                    // override for exactly this state.
                    <div className={css.actions}>
                      <button
                        type="button"
                        className={clsx(css.btn, css.btnPrimary)}
                        disabled={busy || view.changeId === null}
                        title={t('intake.confirmFullHelp')}
                        onClick={() => {
                          const changeId = view.changeId
                          if (changeId !== null) void run(() => gateResolve({ changeId, gateId: 'intake-classify', optionId: 'confirm-full' }))
                        }}
                      >
                        {t('intake.confirmFull')}
                      </button>
                      <button
                        type="button"
                        className={clsx(css.btn, css.btnPrimary)}
                        disabled={busy || view.changeId === null}
                        title={t('intake.confirmBugFixHelp')}
                        onClick={() => {
                          const changeId = view.changeId
                          if (changeId !== null) void run(() => gateResolve({ changeId, gateId: 'intake-classify', optionId: 'confirm-bugfix' }))
                        }}
                      >
                        {t('intake.confirmBugFix')}
                      </button>
                    </div>
                  )
                ) : null}
              </section>
            )}

            {view.artifacts !== undefined && view.artifacts.length > 0 && (
              <ArtifactRail rows={view.artifacts} disabled={busy} onOpen={openArtifact} t={t} />
            )}

            {/* 【变更】2026-09-22 (user report #4) — session statistics card.
                Session-scoped (not change-scoped): renders whenever either
                projection has served a value, independent of the artifact rail. */}
            {(sessionStats !== undefined || tokenUsage !== undefined) && (
              <SessionStatsCard stats={sessionStats} usage={tokenUsage} t={t} />
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
              {selectedNode === null && selectedTerminal === null ? (
                <p className={css.hint}>{t('detail.empty')}</p>
              ) : selectedTerminal !== null ? (
                <div className={css.metaRow}>
                  <span className={css.metaKey}>{t('detail.status')}</span>
                  <span>{selectedTerminal === 'completed' ? t('status.completed') : t('status.abandoned')}</span>
                  <span className={css.metaKey}>{t('detail.artifacts')}</span>
                  <span>{t(`terminal.${selectedTerminal}.artifacts`)}</span>
                  <span className={css.metaKey}>{t('detail.completion')}</span>
                  <span>{t(`terminal.${selectedTerminal}.completion`)}</span>
                </div>
              ) : (
                <BilingualDetail node={selectedNode as NonNullable<typeof selectedNode>} t={t} nextEdge={nextEdge} />
              )}
            </section>

            {/* 【变更】2026-09-24 (demo6 问题 12): the bottom actions card is
                GONE — 「启动 intake；确认前不写源码」 plus the generic
                进入建立变更 / 开始阶段 / 确认归档 buttons duplicated capabilities
                that live where the decision happens: 进入建立变更 is the intake
                card's own retry, gate confirms are the TOP gate banner + the
                strip's 推进/放弃, and a new change is the empty-state toolbar
                (plus chat). One surface per decision, at the top of the page. */}
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
              <div className={css.dashboardHeadActions}>
                {dashboardBusy && <span className={css.dashboardMuted}>{t('action.refresh')}…</span>}
                <button
                  type="button"
                  className={clsx(css.btn, css.btnGhost)}
                  disabled={dashboardBusy}
                  onClick={loadDashboard}
                >
                  {t('action.refresh')}
                </button>
                <button
                  type="button"
                  className={clsx(css.btn, css.btnGhost)}
                  onClick={() => setDashboardOpen(false)}
                >
                  {t('dashboard.close')}
                </button>
              </div>
            </div>
            {dashboardData === null ? (
              <p className={css.hint}>{dashboardBusy ? t('dashboard.help') : t('dashboard.loadFailed')}</p>
            ) : (
              <div className={css.dashboardBody}>
                {/* Summary tiles (2026-09-23 issue #6, comet-style): the four
                    numbers the header of the reference dashboard leads with. */}
                <div className={css.dashboardTiles}>
                  <div className={css.dashboardTile}>
                    <span className={css.dashboardTileValue}>{dashboardData.summary.active}</span>
                    <span className={css.dashboardTileLabel}>{t('dashboard.activeChanges')}</span>
                  </div>
                  <div className={css.dashboardTile} title={t('dashboard.tasksHelp')}>
                    <span className={css.dashboardTileValue}>
                      {dashboardData.summary.tasksDone}/{dashboardData.summary.tasksTotal}
                    </span>
                    <span className={css.dashboardTileLabel}>{t('dashboard.tasks')}</span>
                  </div>
                  <div className={css.dashboardTile} title={t('dashboard.tasksHelp')}>
                    <span className={css.dashboardTileValue}>
                      {dashboardData.summary.tasksTotal === 0
                        ? '—'
                        : `${Math.round((dashboardData.summary.tasksDone / dashboardData.summary.tasksTotal) * 100)}%`}
                    </span>
                    <span className={css.dashboardTileLabel}>{t('dashboard.completion')}</span>
                    <span className={css.dashboardTileBar}>
                      <span
                        className={css.dashboardTileBarFill}
                        style={{
                          width: dashboardData.summary.tasksTotal === 0
                            ? 0
                            : `${Math.round((dashboardData.summary.tasksDone / dashboardData.summary.tasksTotal) * 100)}%`,
                        }}
                      />
                    </span>
                  </div>
                  <div className={css.dashboardTile}>
                    <span className={css.dashboardTileValue}>{dashboardData.summary.archived}</span>
                    <span className={css.dashboardTileLabel}>{t('dashboard.archived')}</span>
                  </div>
                </div>

                {/* Active changes table: one row per running change with its
                    phase pill, task progress, duration and tokens. */}
                <h3 className={css.dashboardSection}>
                  {t('dashboard.activeSection')}
                  （{dashboardData.rows.filter(r => r.current !== 'completed' && r.current !== 'abandoned').length}）
                </h3>
                <ul className={css.dashboardList}>
                  {dashboardData.rows
                    .filter(r => r.current !== 'completed' && r.current !== 'abandoned')
                    .map(row => (
                      <li key={row.changeId}>{dashboardRow(row, view, false)}</li>
                    ))}
                  {dashboardData.rows.every(r => r.current === 'completed' || r.current === 'abandoned') && (
                    <li className={css.dashboardMuted}>{t('dashboard.empty')}</li>
                  )}
                </ul>

                {/* Archive history: terminal rows stay inspectable (issue #5's
                    read path — the rows open the graph focused on the ended
                    change, whose rail reads the archived artifacts). */}
                <h3 className={css.dashboardSection}>
                  {t('dashboard.archiveSection')}
                  （{dashboardData.rows.filter(r => r.current === 'completed' || r.current === 'abandoned').length}）
                </h3>
                <ul className={css.dashboardList}>
                  {dashboardData.rows
                    .filter(r => r.current === 'completed' || r.current === 'abandoned')
                    .map(row => (
                      <li key={row.changeId}>{dashboardRow(row, view, true)}</li>
                    ))}
                </ul>
              </div>
            )}
            <p className={css.hint}>{t('dashboard.note')}</p>
          </div>
        </div>
      )}

      {/* 【变更】2026-09-23 (demo5 issue #5): the opened history flow — its own
          modal stacked OVER the still-open dashboard (变更总览与历史流程图是
          两个页面). Independent of the main view: its payload came from
          refresh(changeId)'s return value, and the 2 s poll only rewrites the
          main view, so the history stays until closed. */}
      {historyPick !== null && (
        <HistoryFlowModal
          pick={historyPick}
          onClose={() => setHistoryPick(null)}
          onReload={openHistory}
          onOpenArtifact={openArtifact}
          t={t}
        />
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

/**
 * 【变更】2026-09-23 (demo5 issue #5): the flow graph canvas as its own
 * component — pan/zoom/canvas math live inside, so the history modal renders
 * the SAME graph for any change without touching the main view's state.
 * Selection stays lifted (`selected` + `onActivate`) because the main view's
 * rail and detail panel read it.
 */
function FlowCanvas(props: {
  view: WorkflowTabView
  selected: WorkflowNodeId | null
  onActivate: (id: string) => void
  t: (key: WorkflowTabKey) => string
}): React.ReactElement {
  const { view, selected, onActivate, t } = props
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const panDrag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

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
    if (!event.ctrlKey) return
    event.preventDefault()
    const delta = event.deltaY > 0 ? -0.08 : 0.08
    setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number((z + delta).toFixed(2)))))
  }

  return (
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
            const isCurrent = view.current === placement.id
            const isSelected = selected === placement.id
            // §18.5: a parked gate is its own visual state — deliberately
            // not the `blocked` styling, because nothing is wrong and the
            // customer's one action is the way forward.
            const isGate = view.gate?.node === placement.id
            const label = t(`node.${placement.id}` as WorkflowTabKey)
            // 【变更】2026-09-23 (demo1 十问题 9/10): terminal cards carry
            // their outcome (已完成 / 已放弃); on a terminal change the
            // opposite outcome card reads 已忽略 — never the template
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
            const statusLabel = isGate
              ? t('status.awaiting')
              : badge !== null
                ? badge.label
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
                </div>
                <div className={css.flowMetrics}>
                  {/* 【变更】2026-09-24 (demo6 问题 5): the CURRENT terminal card
                      (完成 / 已放弃) carries the change's TOTAL figures — the
                      flow ran, so — would be a lie; no attributed usage reads
                      0s / 0K. The non-current terminal stays 已忽略 with —. */}
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
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * 【变更】2026-09-23 (demo5 issue #5): the history flow modal — a read-only
 * canvas of one (usually terminal) change over the still-open 变更总览
 * dashboard. Owns its selection; closing returns to the dashboard. The data
 * came from `refresh(changeId)`'s RETURN VALUE, so nothing here participates
 * in the 2 s active-change poll — an opened history stays put.
 */
function HistoryFlowModal(props: {
  pick: {
    changeId: string
    endedAt?: string
    busy: boolean
    error: string | null
    view: WorkflowTabView | null
  }
  onClose: () => void
  onReload: (changeId: string, endedAt?: string) => void
  onOpenArtifact: (path: string) => void
  t: (key: WorkflowTabKey) => string
}): React.ReactElement {
  const { pick, onClose, onReload, onOpenArtifact, t } = props
  const [selected, setSelected] = useState<WorkflowNodeId | null>(null)
  const history = pick.view
  return (
    <div
      className={css.dashboardBackdrop}
      role="presentation"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <div
        className={css.dashboardPanel}
        role="dialog"
        aria-modal="true"
        aria-label={t('dashboard.historyTitle')}
        onClick={event => event.stopPropagation()}
      >
        <div className={css.dashboardHead}>
          <h2 className={css.dashboardTitle}>{t('dashboard.historyTitle')}</h2>
          <div className={css.dashboardHeadActions}>
            {pick.busy && <span className={css.dashboardMuted}>{t('action.refresh')}…</span>}
            {!pick.busy && history !== null && (
              <span className={css.dashboardMuted}>
                {`${pick.changeId} · ${modeLabel(history.mode, t)} · ${history.current === null ? '—' : t(`node.${history.current}` as WorkflowTabKey)}${pick.endedAt !== undefined ? ` · ${pick.endedAt.slice(0, 16).replace('T', ' ')}` : ''}`}
              </span>
            )}
            <button
              type="button"
              className={clsx(css.btn, css.btnGhost)}
              disabled={pick.busy}
              onClick={() => onReload(pick.changeId, pick.endedAt)}
            >
              {t('action.refresh')}
            </button>
            <button
              type="button"
              className={clsx(css.btn, css.btnGhost)}
              onClick={onClose}
            >
              {t('dashboard.close')}
            </button>
          </div>
        </div>
        {pick.busy ? (
          <p className={css.hint}>{t('dashboard.help')}</p>
        ) : pick.error !== null || history === null ? (
          <p className={css.hint}>{t('dashboard.loadFailed')}</p>
        ) : (
          <div
            className={css.dashboardBody}
            style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
          >
            {/* 流程已结束 → 计时已冻结（host 在 change-archived/abandoned 关窗）；
                本模态只读，任何点击都只是选中卡片，不会驱动流转。 */}
            <div className={css.historyCanvas}>
              <FlowCanvas
                view={history}
                selected={selected}
                onActivate={(id) => { setSelected(id as WorkflowNodeId) }}
                t={t}
              />
            </div>
            {/* 【变更】2026-09-24 (demo6 问题 4): the history modal carries the
                change's FULL record, not just the graph — the classification
                fields and every stage artifact ride below the canvas, each
                row opening in the right sidebar exactly like the main rail
                (terminal changes read theirs from the archive directory). */}
            <div className={css.historyRecords}>
              {history.intake !== undefined && (
                <section className={clsx(css.card, css.cardAccent)} aria-label={t('intake.title')}>
                  <h3 className={css.cardTitle}>{t('intake.title')}</h3>
                  <div className={css.metaRow}>
                    <span className={css.metaKey}>{t('intake.mode')}</span>
                    <span>{t(INTAKE_MODE_LABEL[history.intake.mode] ?? 'mode.help')}</span>
                    <span className={css.metaKey}>{t('intake.kind')}</span>
                    <span>{t(`kind.${history.intake.kind}` as WorkflowTabKey)}</span>
                    <span className={css.metaKey}>{t('intake.scope')}</span>
                    <span>
                      {t(`scope.${history.intake.affectedScope}` as WorkflowTabKey)}
                      {history.planAllowlist !== undefined && (
                        <span className={css.scopeFiles}> · {t('intake.allowlist')} {history.planAllowlist.length}</span>
                      )}
                    </span>
                    <span className={css.metaKey}>{t('intake.summary')}</span>
                    <span className={css.summaryText}>{history.intake.summary}</span>
                  </div>
                </section>
              )}
              {history.artifacts !== undefined && history.artifacts.length > 0 && (
                <ArtifactRail rows={history.artifacts} disabled={false} onOpen={onOpenArtifact} t={t} />
              )}
            </div>
          </div>
        )}
      </div>
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
            className={clsx(css.lane, lane.id === 'bug-fix-path' && css.lanePreserved)}
          >
            <span className={css.laneLabel}>
              {t(lane.id === 'bug-fix-path' ? 'lane.bugFixPath' : 'lane.fullGoPath')}
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

/**
 * 2026-09-21 (session 5.jsonl) — artifact rail card: one row per
 * customer-editable change document, in stage order. The open button hands
 * the workspace-relative path to the injected {@link
 * WorkflowViewInjected.openArtifact} (right sidebar); `missing` rows carry
 * the fill-work list instead of an enabled button. State labels mirror the
 * /baf-status card so both surfaces read the same.
 */
/**
 * 【变更】2026-09-22 (user report #4) — session statistics card. Turns/steps/
 * tool calls and wall times from the durable `sessionStats` projection; the
 * token breakdown from `tokenUsage` (three disjoint prompt-side buckets plus
 * output, cache-hit share over billed input — the same math the composer's
 * usage pill shows). The card hides until either projection has a value.
 * 【变更】2026-09-23 (demo5 issue #6): regrouped into three titled sections —
 * 概览 / 工具 / Tokens.
 * 【变更】2026-09-24 (demo6 问题 1): the three sections render as ONE compact
 * grid of labeled figures — each section is a checklistHead row followed by
 * wide key/value pairs (two figures per line), so the whole card reads as a
 * tight table instead of six stacked one-line strips.
 */
function SessionStatsCard(props: {
  stats?: SessionStatsProjection | undefined
  usage?: TokenUsageProjection | undefined
  t: (key: WorkflowTabKey) => string
}): React.ReactElement {
  const { stats, usage, t } = props
  const billedInput = usage === undefined
    ? 0
    : usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
  const cacheHit = usage !== undefined && billedInput > 0
    ? `${Math.round((usage.cacheReadTokens / billedInput) * 100)}%`
    : null
  return (
    <section className={clsx(css.card, css.cardAccent)} aria-label={t('stats.title')}>
      <h3 className={css.cardTitle}>{t('stats.title')}</h3>
      {stats !== undefined && (
        <>
          <div className={css.checklistHead}>{t('stats.section.overview')}</div>
          <div className={css.statsGrid}>
            <span className={css.statsKey}>{t('stats.turns')}</span>
            <span className={css.statsNum}>{stats.turns}</span>
            <span className={css.statsKey}>{t('stats.steps')}</span>
            <span className={css.statsNum}>{stats.steps}</span>
            <span className={css.statsKey}>{t('stats.llmTime')}</span>
            <span className={css.statsNum}>{formatDuration(stats.llmMs)}</span>
          </div>
          <div className={css.checklistHead}>{t('stats.section.tools')}</div>
          <div className={css.statsGrid}>
            <span className={css.statsKey}>{t('stats.toolCalls')}</span>
            <span className={css.statsNum}>{stats.toolCalls}</span>
            <span className={css.statsKey}>{t('stats.toolTime')}</span>
            <span className={css.statsNum}>{formatDuration(stats.toolMs)}</span>
          </div>
        </>
      )}
      <div className={css.checklistHead}>{t('stats.section.tokens')}</div>
      {usage !== undefined ? (
        <div className={css.statsGrid}>
          <span className={css.statsKey} title={t('stats.breakdownTitle')
            .replace('{input}', formatTokenCount(usage.uncachedInputTokens))
            .replace('{cacheRead}', formatTokenCount(usage.cacheReadTokens))
            .replace('{cacheWrite}', formatTokenCount(usage.cacheWriteTokens))
            .replace('{output}', formatTokenCount(usage.outputTokens))}>
            {t('stats.total')}
          </span>
          <span className={clsx(css.statsNum, css.statsHero)} title={t('stats.breakdownTitle')
            .replace('{input}', formatTokenCount(usage.uncachedInputTokens))
            .replace('{cacheRead}', formatTokenCount(usage.cacheReadTokens))
            .replace('{cacheWrite}', formatTokenCount(usage.cacheWriteTokens))
            .replace('{output}', formatTokenCount(usage.outputTokens))}>
            {formatTokenCount(billedTotalTokens(usage))}
          </span>
          <span className={css.statsKey}>{t('stats.output')}</span>
          <span className={css.statsNum}>{formatTokenCount(usage.outputTokens)}</span>
          <span className={css.statsKey}>{t('stats.cacheHit')}</span>
          <span className={css.statsNum}>{cacheHit ?? '—'}</span>
        </div>
      ) : (
        <p className={css.hint}>{t('stats.pending')}</p>
      )}
    </section>
  )
}

function ArtifactRail(props: {
  rows: readonly {
    readonly file: string
    readonly path: string
    readonly state: 'missing' | 'template' | 'planned' | 'filled'
    readonly missing: readonly string[]
  }[]
  disabled: boolean
  onOpen: (path: string) => void
  t: (key: WorkflowTabKey) => string
}): React.ReactElement {
  const { rows, disabled, onOpen, t } = props
  const stateLabel = (state: 'missing' | 'template' | 'planned' | 'filled'): string =>
    t(`artifact.state.${state}` as WorkflowTabKey)
  const stateClass = (state: 'missing' | 'template' | 'planned' | 'filled'): string =>
    state === 'filled' ? css.artifactStateFilled ?? ''
      : state === 'planned' ? css.artifactStatePlanned ?? css.artifactStateTemplate ?? ''
        : state === 'template' ? css.artifactStateTemplate ?? ''
          : css.artifactStateMissing ?? ''
  // 【变更】2026-09-23 (demo1 十问题 4): each row names the stage that
  // produces it — 「设计 design.md」「验证 verify.md」— so the rail
  // reads as the stage→document map it is.
  const stageOf = (file: string): string => {
    if (file === 'proposal.md') return t('node.open')
    if (file === 'clarify.md') return t('node.clarify')
    if (file === 'design.md') return t('node.design')
    if (file === 'plan.md' || file === 'plan.json' || file === 'tasks.md') return t('node.plan')
    if (file === 'verify.md' || file === 'verify-report.json') return t('node.verify')
    return ''
  }
  return (
    <section className={clsx(css.card, css.cardAccent)} aria-label={t('artifact.title')}>
      <h3 className={css.cardTitle}>{t('artifact.title')}</h3>
      {rows.map((row) => {
        const blocked = row.state === 'missing'
        const stage = stageOf(row.file)
        return (
          <div key={row.path}>
            <div className={css.artifactRow}>
              <button
                type="button"
                className={clsx(css.artifactNameBtn)}
                disabled={disabled || blocked}
                title={blocked ? t('artifact.missing') : row.path}
                onClick={() => onOpen(row.path)}
              >
                {stage === '' ? row.file : `${stage} · ${row.file}`}
              </button>
              <span className={clsx(css.artifactState, stateClass(row.state))}>
                {stateLabel(row.state)}
              </span>
            </div>
            {(row.state === 'template' || row.state === 'planned') && row.missing.length > 0 && (
              <div className={css.artifactGap} title={row.missing.join('\n')}>
                {t('artifact.gapCount').replace('{n}', String(row.missing.length))}
              </div>
            )}
          </div>
        )
      })}
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

/**
 * 【变更】2026-09-24 (demo6 问题 13): per-stage plain-language tips — what this
 * stage FEELS like from the outside (who acts, what the customer waits for),
 * one short paragraph under the catalog facts. Written for the customer, not
 * the engineer: no protocol talk, no section numbers.
 */
const STAGE_TIPS: Readonly<Record<string, string>> = {
  intake: '你在分类卡上点选路径，系统才会动源码。点「完整流程」走全阶段，点「缺陷修复路径」直接进修复。',
  open: '系统为这次变更建档、锁定基线，然后模型撰写提案（为什么改、改什么、影响面）。你确认提案后才进入下一步。',
  clarify: '把含糊的地方问清楚：模型把阻塞问题写成文档，需要你拍板的会弹卡提问，答案记录在案。',
  design: '模型读真实仓库代码写技术设计——接口怎么定、错误怎么处理、有什么风险。设计里引用的文件都是仓库里真实存在的。',
  plan: '把设计拆成一条条可验证的任务，并冻结允许修改的文件清单（白名单）。之后改任何白名单外的文件都会被拦下。',
  implement: '模型按任务清单逐项写代码、跑验证命令，每完成一项就在 tasks.md 勾掉一项。全部完成后请你确认进入验证。',
  verify: '系统自动跑检查：编译、测试、密钥扫描、规格校验，结果写入 verify.md。全部通过才弹归档确认；有失败项会带着原因回到实现阶段重改。',
  archive: '你确认归档后，变更连同所有文档一起移入归档目录，流程结束，审计记录保留。',
  drift: '系统发现仓库的实际状态和流程记录对不上（比如流程外的文件被改了）。需要你选择退回到哪个阶段，从那里重跑——不会静默自愈。',
}

/**
 * 【变更】2026-09-24 (demo6 问题 13): per-stage common failures with the
 * stable BAF error code, plain meaning, and the customer-side fix — cribbed
 * from overlay/docs/baf/error-codes.md, trimmed to what a customer can act
 * on. Rendered as a compact code → meaning → fix table under 失败处理.
 */
const FAILURE_REFS: Readonly<Record<string, readonly { code: string; meaning: string; fix: string }[]>> = {
  intake: [
    { code: 'policy_missing', meaning: '企业策略/基线缺少必需字段', fix: '先初始化工作区或补齐基线，再重新分类' },
  ],
  open: [
    { code: 'git_unavailable', meaning: '本地 Git 不可用（没有仓库或提交）', fix: '在仓库里 git init 并至少提交一次，再点「进入建立变更」重试' },
    { code: 'openspec_unavailable', meaning: 'OpenSpec 工具缺失或版本不满足', fix: '安装/初始化 OpenSpec 后重试' },
    { code: 'baseline_unavailable', meaning: '基线文件缺失或无法解析', fix: '重新初始化工作区生成 .baf/baseline.yml' },
  ],
  clarify: [],
  design: [
    { code: 'invalid_transition', meaning: '前置阶段未完成就试图进入设计', fix: '先确认澄清文档已完成（完成门检查通过）' },
  ],
  plan: [
    { code: 'invalid_transition', meaning: '计划账本缺任务结构或验证命令', fix: '按完成门缺什么清单补齐 plan.json 后再推进' },
  ],
  implement: [
    { code: 'scope_exceeded', meaning: '试图修改白名单之外的文件', fix: '只改白名单内文件；范围确实要扩大时走升级/重计划' },
    { code: 'intake_confirmation_required', meaning: '分类未确认就尝试写源码', fix: '先在分类卡上点选路径确认' },
    { code: 'protected_path', meaning: '写入命中受保护路径', fix: '换到白名单内的目标文件；受保护资源不可改' },
    { code: 'secret_detected', meaning: '写入内容命中密钥扫描', fix: '移除硬编码密钥，改用环境变量/配置' },
  ],
  verify: [
    { code: 'tool_unavailable', meaning: '验证所需的外部工具不可用', fix: '安装对应工具后重跑验证（verify 会带着缺失清单回实现）' },
    { code: 'openspec_unavailable', meaning: 'OpenSpec 校验不可用', fix: '安装/初始化 OpenSpec 后重跑' },
    { code: 'model_route_unavailable', meaning: '验证阶段的模型路由不可用', fix: '在设置里检查模型配置后重跑' },
  ],
  archive: [
    { code: 'verify_required', meaning: '验证未通过或报告过期，不允许归档', fix: '回到实现修复失败项，验证全绿后再归档' },
    { code: 'gate_confirmation_required', meaning: '归档需要你本人确认', fix: '在确认卡上点「确认归档」' },
  ],
  drift: [
    { code: 'projection_corrupted', meaning: '流程记录文件损坏', fix: '按提示修复记录文件后刷新；不要手改 .baf/projection' },
    { code: 'writer_conflict', meaning: '另一个进程在写同一条变更', fix: '关闭其它占用该工作区的会话/进程后重试' },
  ],
}

function BilingualDetail(props: {
  node: WorkflowTabNodeView
  t: (key: WorkflowTabKey) => string
  nextEdge: { id: string; to: string; condition: string } | null
}): React.ReactElement {
  const { node, t, nextEdge } = props
  const zh = CATALOG_ZH[node.id]
  // 【变更】2026-09-23 (demo5 issue #7): the detail panel renders Chinese only —
  // the bilingual 英/中 pairs are gone. The zh dictionary entry is the display
  // source; the English catalog text stays the fallback for a node the zh
  // dictionary has not covered (defensive — the rewrite covers every node).
  const sections: Array<{
    title: WorkflowTabKey
    items: readonly string[]
    block?: string
  }> = [
    {
      title: 'detail.purpose',
      items: [],
      block: zh?.purpose ?? node.catalog.purpose,
    },
    {
      title: 'detail.prerequisites',
      items: zh?.prerequisites ?? node.catalog.prerequisites,
    },
    {
      title: 'detail.artifacts',
      items: zh?.artifacts ?? node.catalog.artifacts,
    },
    {
      title: 'detail.completion',
      items: zh?.completion ?? node.catalog.completion,
    },
    {
      title: 'detail.failure',
      items: zh?.failure ?? node.catalog.failure,
    },
  ]

  return (
    <>
      <div className={css.metaRow}>
        <span className={css.metaKey}>{t('detail.status')}</span>
        <span>{t(`status.${node.status}` as WorkflowTabKey)}</span>
        <span className={css.metaKey}>{t('card.duration')}</span>
        <span>{stageDuration(node.status, node.metrics?.durationMs)}</span>
        <span className={css.metaKey}>{t('card.tokens')}</span>
        <span title={t('metrics.pending')}>
          {stageTokens(node.status, node.metrics?.inputTokens, node.metrics?.outputTokens)}
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
        if (section.block === undefined && section.items.length === 0) return null
        return (
          <div key={section.title} className={css.biSection}>
            <div className={css.metaKey}>{t(section.title)}</div>
            {section.block !== undefined && (
              <p className={css.biZh}>{section.block}</p>
            )}
            {section.items.length > 0 && (
              <ul className={css.list}>
                {section.items.map(item => (
                  <li key={item}>
                    <div className={css.biZh}>{item}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
      {/* 【变更】2026-09-24 (demo6 问题 13): two customer-facing additions on
          the SAME card — a plain-language tip (who acts, what you wait for)
          and, when this stage has known failure codes, the compact
          code → meaning → fix table. Same section styling as above so the
          whole detail panel reads as one format. */}
      {STAGE_TIPS[node.id] !== undefined && (
        <div className={css.biSection}>
          <div className={css.metaKey}>{t('detail.tip')}</div>
          <p className={css.biZh}>{STAGE_TIPS[node.id]}</p>
        </div>
      )}
      {(FAILURE_REFS[node.id] ?? []).length > 0 && (
        <div className={css.biSection}>
          <div className={css.metaKey}>{t('detail.failureCodes')}</div>
          <div className={css.failTable}>
            {FAILURE_REFS[node.id]?.map(ref => (
              <div key={ref.code} className={css.failRow}>
                <span className={css.failCode}>{ref.code}</span>
                <span className={css.failMeaning}>{ref.meaning}</span>
                <span className={css.failFix}>{ref.fix}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
