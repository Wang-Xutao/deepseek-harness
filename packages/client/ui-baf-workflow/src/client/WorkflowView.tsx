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
import { answerGateOption, answerGateRevision, gateAskViewOf, isBafGatePending, isSecondaryOptionLabel } from './gate-ask.ts'
import { setWorkflowTabActive } from './tab-activity.ts'
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
   * §22 user-request 2026-09-20 — Tab advancement. 【变更】2026-09-25 (用户需求
   * 工作流 1): the always-on strip button is gone; the Tab pops a TOP advance
   * dialog when the change rests at a point that can advance, and its 推进
   * click passes `skipAsk` — the dialog itself IS the confirmation, so the
   * host takes the positive `confirm` path (no second session-form popup)
   * while the dispatch channel still wakes the model at the landed rest.
   */
  advance: (changeId: string, skipAsk?: boolean) => Promise<WorkflowTabView>
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
   * 【变更】2026-09-28 (用户问题 1.7 Tab parity): submit a revision request from
   * the Tab's own decision surfaces (advance dialog, parked-gate banner) —
   * `gateId` for the banner, `node`+`mode` for the advance dialog (the host
   * derives the stage's advance gate). The host dispatches the same
   * `gate-revise` work order the session dialog's `custom` answer takes; the
   * gate re-pops after the model reworks the artifact.
   */
  gateRevise: (request: {
    changeId?: string
    gateId?: string
    node?: WorkflowNodeId
    mode?: 'full-go-path' | 'bug-fix-path' | 'clarify-required'
    text: string
  }) => Promise<WorkflowTabView>
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

/** Clamp a number into [min, max] — wheel-pan bounds. */
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

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
    case 'drifted': return css.statusDrifted ?? ''
    // 【变更】2026-09-25 (用户需求 工作流 5): 已忽略 is gray EVERYWHERE —
    // 'skipped' used to share the drifted amber here, so a drift-affected
    // stage's 已忽略 badge read amber while 已放弃's 已忽略 read gray.
    // Only 漂移 itself keeps the amber (its label is 漂移中, never 已忽略).
    case 'skipped': return css.statusIdle ?? ''
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
    gateResolve, gateRevise, openArtifact, useProjection, subscribe, dashboard,
    sessionId, useSessionStatus,
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
  // 【变更】2026-09-25 (用户需求 工作流 3): per-second 变更耗时 interpolation
  // anchor. `totalDurationMs` grows in real time host-side (open stage windows
  // accumulate `nowMs - start` in the metrics fold), so between the 2 s
  // refreshes the client can add the wall-clock elapsed to the LAST served
  // value and stay consistent with the next refresh. Re-anchored on every
  // applyView; frozen automatically once the change turns terminal
  // (changeActive false → the frozen metrics value renders).
  const timerAnchor = useRef<{ at: number; value: number | undefined }>({ at: Date.now(), value: undefined })
  // 【变更】2026-09-25 (用户需求 工作流 3): the last value the 变更耗时
  // interpolation painted for THIS change — the monotonic floor (see
  // liveTotalMs) so poll pipeline lag / clock skew can never step the timer
  // backwards mid-change.
  const lastShownTotal = useRef<{ key: string; ms: number } | null>(null)
  // The 1 s tick driving the interpolated display (only runs while the
  // change is active — terminal changes never re-tick their frozen total).
  const [nowTick, setNowTick] = useState(() => Date.now())
  // 【变更】2026-09-25 (用户需求 工作流 1): the TOP advance dialog's dismissal —
  // keyed `${changeId}:${current}` so 暂不推进 dismisses for THIS rest point
  // only; a real stage advance (or change switch) re-arms the dialog.
  const [advanceDismissed, setAdvanceDismissed] = useState<string | null>(null)
  // 【变更】2026-09-25 (用户需求 工作流 1): one-click state of the TOP live-gate
  // dialog — after a click every option disables until the carrier resolves
  // (the pending interaction clears and the card unmounts).
  const [gateAnswered, setGateAnswered] = useState<string | null>(null)
  // 【变更】2026-09-28 (用户问题 1.7 Tab parity): the revision draft of the
  // Tab-native decision surfaces (advance dialog, parked-gate banner) — keyed
  // per surface so switching surfaces resets the draft; `sent` swaps the form
  // for the 已派单 note until the surface's own state moves on. The LIVE gate
  // card needs none of this: its carrier resolves on submit and the card
  // unmounts.
  const [tabRevise, setTabRevise] = useState<{ key: string; text: string; sent: boolean } | null>(null)
  // 【变更】2026-09-28 (用户问题 1.7): the LIVE gate card's revision draft —
  // cleared with gateAnswered whenever a new carrier arrives.
  const [liveReviseText, setLiveReviseText] = useState('')

  const applyView = useCallback((next: WorkflowTabView) => {
    const safe = withRenderableGraph(next)
    setView(safe)
    setError(safe.blockedReason ?? null)
    // 【变更】2026-09-25 (用户需求 工作流 3): anchor at the HOST's derivation
    // stamp (the totals are computed before serialization/transport), not the
    // local apply time — applying ~a second after computation re-anchored the
    // interpolation behind the already-painted value and every 2 s poll made
    // the timer visibly jump backwards (4m0s → 3m59s).
    timerAnchor.current = { at: safe.metrics?.computedAt ?? Date.now(), value: safe.metrics?.totalDurationMs }
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

  // 【变更】2026-09-25 (用户需求 工作流 1): this component mounts exactly while
  // the 工作流 Tab is the active conversation view for this session — mirror
  // that into the tab-activity store so BafGateComposer (the session-form
  // unified card, a separate slot registration with no shared React tree)
  // hides the session dialog while the Tab owns the decision surface.
  useEffect(() => {
    setWorkflowTabActive(sessionId, true)
    return () => { setWorkflowTabActive(sessionId, false) }
  }, [sessionId])

  // 【变更】2026-09-25 (用户需求 工作流 1): the session's LIVE BAF gate dialog
  // (askGateDialog / auto-pop carriers, `header: 'BAF 工作流'`) — rendered as
  // the Tab's TOP dialog so the whole workflow runs from the Tab alone; the
  // session-form card is simultaneously hidden by the tab-activity store.
  // Business 选择卡 (`header: 'BAF 选择卡'`) never match — they stay in the
  // session's bottom popup.
  const pendingInteraction = useSessionStatus(snapshot =>
    snapshot.get(sessionId)?.pendingInteraction)
  const liveGate = useMemo(
    () => (isBafGatePending(pendingInteraction) ? pendingInteraction : null),
    [pendingInteraction],
  )
  const liveGateView = useMemo(() => (liveGate === null ? null : gateAskViewOf(liveGate)), [liveGate])
  // 【变更】2026-09-28 (用户问题 1.6): the emphasized confirm option of the
  // live gate card — the FIRST non-secondary option, the same heuristic the
  // session card renders by.
  const livePrimaryLabel = liveGateView === null
    ? undefined
    : liveGateView.options.find(o => !isSecondaryOptionLabel(o.label))?.label
  // A new gate → re-arm the one-click lock.
  useEffect(() => {
    setGateAnswered(null)
    // 用户问题 1.7: each new carrier starts a fresh revision draft.
    setLiveReviseText('')
  }, [liveGate])

  // The change-focused rest the advance dialog keys its dismissal on.
  const changeActive = view.changeId !== null
    && view.current !== null
    && view.current !== 'completed'
    && view.current !== 'abandoned'
  const advanceKey = view.changeId === null || view.current === null
    ? null
    : `${view.changeId}:${view.current}`
  useEffect(() => { setAdvanceDismissed(null) }, [advanceKey])

  // 【变更】2026-09-25 (用户需求 工作流 3): the 1 s ticker — runs only while a
  // change is active; the interpolated value below stays frozen otherwise.
  useEffect(() => {
    if (!changeActive) return
    const timer = window.setInterval(() => { setNowTick(Date.now()) }, 1000)
    return () => { window.clearInterval(timer) }
  }, [changeActive])
  // Interpolated 变更耗时: anchor value + wall-clock elapsed since the anchor
  // stamp. Never runs backwards within one change — a poll trailing the painted
  // interpolation by clock skew would read as a stuck timer every 2 s, so the
  // last shown value is a floor while this change stays active (terminal
  // switches to the frozen host value, which is authoritative).
  // 【变更】2026-09-28 (用户问题 4 停表): while the host reports
  // `metrics.running === false` the change rests on a customer decision — the
  // wall-clock wait is NOT workflow time, so the interpolation freezes and the
  // display holds the host's last computed total.
  const liveTotalMs = useMemo(() => {
    const waitingOnCustomer = view.metrics?.running === false
    const base = changeActive && !waitingOnCustomer && timerAnchor.current.value !== undefined
      ? timerAnchor.current.value + Math.max(0, nowTick - timerAnchor.current.at)
      : view.metrics?.totalDurationMs
    if (changeActive && base !== undefined) {
      // `changeActive`'s aliased predicate already narrowed changeId to string.
      const key = view.changeId
      const last = lastShownTotal.current
      if (last !== null && last.key === key) {
        const ms = Math.max(base, last.ms)
        lastShownTotal.current = { key, ms }
        return ms
      }
      lastShownTotal.current = { key, ms: base }
    }
    return base
  }, [changeActive, nowTick, view.metrics?.totalDurationMs, view.metrics?.running, view.changeId])

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
          {/* 【变更】2026-09-25 (用户需求 工作流 3): per-second interpolated
              total — the 2 s poll keeps the underlying view fresh, the display
              ticks every second between refreshes (anchor + wall-clock). */}
          <span className={css.stripValue}>{formatDuration(liveTotalMs)}</span>
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
        {/* §22 user-request 2026-09-20 — the strip 「推进」 button is GONE
            (【变更】2026-09-25 用户需求 工作流 1): the always-on button became
            the TOP advance dialog below — it pops only when the host-derived
            `advance` says the change rests at a point that can advance, so
            the strip no longer carries a permanent decision the customer
            would otherwise see on every paint. */}
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

      {/* 【变更】2026-09-25 (用户需求 工作流 1): the LIVE session gate dialog as
          the Tab's TOP card. When the session pops a BAF workflow decision
          (初始化工作区、推进工作流、§22 gate asks … — every
          `header: 'BAF 工作流'` carrier), the same decision renders here and
          is answered HERE while the 工作流 Tab is on screen: one click posts
          through the carrier's `answer` verb — the identical channel the
          session dialog click resolves through, so the host-side gate
          dispatch is byte-for-byte the same. Business 选择卡 never match the
          discriminator and keep the session's bottom popup.
          【变更】2026-09-28 (用户问题 1.1/1.2/1.5/1.6/1.7): the card renders the
          dialog wire protocol — 【…】 sections with `- ` lists, the 变更 chip
          top-right, openable 【产物】 chips (the Tab rail's openArtifact
          channel), the emphasized confirm button, and the revision input
          (answers the carrier's `custom` field; the gate re-pops after the
          model reworks the artifact). */}
      {liveGateView !== null && liveGate !== null && (
        <section className={clsx(css.card, css.cardGate)} aria-label={liveGateView.title} data-live-gate="">
          <div className={css.gateHeadRow}>
            <div className={css.cardTitle}>{liveGateView.title}</div>
            {liveGateView.changeId !== undefined && (
              <span className={css.gateChangeChip}>变更 {liveGateView.changeId}</span>
            )}
          </div>
          {liveGateView.sections.map((section, si) => (
            <div key={`live-sec-${si}`} className={css.gateSection}>
              {section.title !== undefined && <div className={css.gateSectionTitle}>{section.title}</div>}
              {section.blocks.map((block, bi) => block.kind === 'text'
                ? <p key={`live-t-${si}-${bi}`} className={css.hint}>{block.text}</p>
                : (
                  <ul key={`live-l-${si}-${bi}`} className={css.gateList}>
                    {block.items.map((item, ii) => (
                      <li key={`live-i-${si}-${bi}-${ii}`}>
                        {item.artifact === undefined
                          ? item.text
                          : (
                            <button
                              type="button"
                              className={css.gateArtifactChip}
                              onClick={() => { openArtifact(item.artifact?.path ?? '') }}
                            >
                              📄 {item.artifact.label} ↗
                            </button>
                          )}
                      </li>
                    ))}
                  </ul>
                ))}
            </div>
          ))}
          <div className={css.actions}>
            {liveGateView.options.map(opt => (
              <button
                key={`live-gate-${opt.label}`}
                type="button"
                className={clsx(css.btn, opt.label === livePrimaryLabel ? css.btnPrimary : css.btnGhost)}
                disabled={busy || gateAnswered !== null}
                onClick={() => {
                  setGateAnswered(opt.label)
                  answerGateOption(liveGate, liveGateView, opt.label)
                }}
              >
                {opt.label}
                {opt.hint !== undefined && <span className={css.optionHintInline}> · {opt.hint}</span>}
              </button>
            ))}
          </div>
          {liveGateView.allowsRevise && (
            <div className={css.reviseBox}>
              <label className={css.reviseLabel}>有修改意见？写下后提交，系统派单修订产物，改好后再次弹出确认</label>
              <textarea
                className={css.reviseInput}
                rows={2}
                value={liveReviseText}
                placeholder="例如：Scope 里补充不改哪些；Why 一句话讲清目标"
                disabled={gateAnswered !== null}
                onChange={(event) => { setLiveReviseText(event.target.value) }}
              />
              <button
                type="button"
                className={css.reviseSubmit}
                disabled={gateAnswered !== null || liveReviseText.trim() === ''}
                onClick={() => {
                  setGateAnswered('revise')
                  answerGateRevision(liveGate, liveGateView, liveReviseText)
                }}
              >
                提交修改意见
              </button>
            </div>
          )}
        </section>
      )}

      {/* §22.14 P3 — pending decision gate card. The host computes this when
          `.baf/baseline.yml` is missing (workspace scaffold gate) or — 2026-09-23
          demo2 issue #2 — when the focused change rests at a pending
          classification; the Tab renders the registered question and one
          button per option at the TOP of the workflow page, so the same
          decision the session dialog pops is clickable here at the same
          moment (projection push + poll keep the two surfaces in sync).
          `cancel` is the `__noop__` sentinel — `gateResolve` returns a calm
          dismissal card and the host re-derives the gate (its condition still
          holds).
          【变更】2026-09-25 (用户需求 工作流 1): suppressed while the LIVE gate
          dialog above is showing — the live carrier is the same decision at
          a strictly fresher instant, and both cards would race the answer. */}
      {view.pendingGate !== undefined && liveGateView === null && (
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
          at-the-top parity surface, not a replacement.
          【变更】2026-09-25 (用户需求 工作流 1): suppressed while the LIVE gate
          dialog above is showing (same decision, fresher instant). */}
      {view.gate !== undefined
        && view.gate.gateId !== undefined
        && view.gate.question !== undefined
        && view.changeId !== null
        && liveGateView === null && (
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
          {/* 【变更】2026-09-28 (用户问题 1.7 Tab parity): the banner's revision
              input — posts the host's `gateRevise` remote (this surface has no
              ask carrier); a `gate-revise` work order goes out against the
              gate's revisable document and the gate re-derives after the
              model reworks it. */}
          {(() => {
            const bannerChangeId = view.changeId
            const bannerGateId = view.gate?.gateId
            if (bannerChangeId === null || bannerGateId === undefined) return null
            const key = `gate:${bannerGateId}:${bannerChangeId}`
            const draft = tabRevise?.key === key ? tabRevise : null
            if (draft?.sent === true) {
              return <p className={css.reviseSent}>修改意见已提交派单，模型修订完成后此处更新</p>
            }
            return (
              <div className={css.reviseBox}>
                <label className={css.reviseLabel}>有修改意见？写下后提交，系统派单修订产物，改好后再次确认</label>
                <textarea
                  className={css.reviseInput}
                  rows={2}
                  value={draft?.text ?? ''}
                  placeholder="例如：设计文档补充回退方案；验收标准改为……"
                  disabled={busy}
                  onChange={(event) => { setTabRevise({ key, text: event.target.value, sent: false }) }}
                />
                <button
                  type="button"
                  className={css.reviseSubmit}
                  disabled={busy || (draft?.text ?? '').trim() === ''}
                  onClick={() => {
                    const text = (draft?.text ?? '').trim()
                    if (text === '') return
                    // run() never rejects (it owns its error surface), so the
                    // sent-note swap rides its completion.
                    void run(() => gateRevise({ changeId: bannerChangeId, gateId: bannerGateId, text }))
                      .then(() => { setTabRevise({ key, text: '', sent: true }) })
                  }}
                >
                  提交修改意见
                </button>
              </div>
            )
          })()}
        </section>
      )}

      {/* 【变更】2026-09-25 (用户需求 工作流 1): the TOP advance dialog — the
          former strip 推进 button, now a dialog that pops only when a
          decision is actually needed. Visibility: the host-derived `advance`
          exists AND is ready (the change rests at an advancing point with its
          file gate passed) AND no decision card outranks it (live gate,
          pending gate, parked confirm gate) AND the customer has not clicked
          暂不推进 for THIS rest point (`${changeId}:${current}` — a stage
          advance re-arms it). 确认推进 posts `advance(changeId, true)` — the
          dialog IS the confirmation, so the host takes the positive confirm
          path directly and the landed stage still receives the work order. */}
      {changeActive
        && view.current !== 'drift'
        && view.advance?.ready === true
        && view.gate === undefined
        && view.pendingGate === undefined
        && liveGateView === null
        && advanceKey !== null
        && advanceDismissed !== advanceKey && (
        <section className={clsx(css.card, css.cardGate)} aria-label={t('action.advance')} data-advance-dialog="">
          <div className={css.cardTitle}>{t('advanceDialog.title')}</div>
          <p className={css.hint}>
            {nextEdge !== null
              ? fillTemplate(t('advanceDialog.body'), {
                from: t(`node.${view.current}`),
                to: t(`node.${nextEdge.to}`),
              })
              : fillTemplate(t('advanceDialog.body'), {
                from: t(`node.${view.current}`),
                to: '',
              })}
          </p>
          <div className={css.actions}>
            <button
              type="button"
              className={clsx(css.btn, css.btnPrimary)}
              disabled={busy}
              onClick={() => {
                const changeId = view.changeId
                if (changeId === null) return
                void run(() => advance(changeId, true))
              }}
            >
              {t('action.advance')}
            </button>
            <button
              type="button"
              className={clsx(css.btn, css.btnGhost)}
              disabled={busy}
              onClick={() => { setAdvanceDismissed(advanceKey) }}
            >
              {t('advanceDialog.dismiss')}
            </button>
          </div>
          {/* 【变更】2026-09-28 (用户问题 1.7 Tab parity): the advance dialog's
              revision input — the dialog rests on a COMPLETED stage (no gate
              id of its own), so the submit posts `node`+`mode` and the host
              derives the stage's advance gate (open → open-advance …). The
              revision dispatches against that stage's document; the model
              reworks it and the same rest point re-derives. */}
          {(() => {
            const advanceChangeId = view.changeId
            const advanceNode = view.current
            // The enclosing card condition already excluded drift and the
            // terminal states — only the non-revisable resting nodes bow out.
            if (advanceChangeId === null
              || advanceNode === 'intake'
              || advanceNode === 'archive') return null
            const key = `advance:${advanceChangeId}:${advanceNode}`
            const draft = tabRevise?.key === key ? tabRevise : null
            if (draft?.sent === true) {
              return <p className={css.reviseSent}>修改意见已提交派单，模型修订完成后此处更新</p>
            }
            return (
              <div className={css.reviseBox}>
                <label className={css.reviseLabel}>有修改意见？写下后提交，系统派单修订本阶段产物，改好后再次确认</label>
                <textarea
                  className={css.reviseInput}
                  rows={2}
                  value={draft?.text ?? ''}
                  placeholder="例如：补充验收标准；Scope 里写清不改哪些"
                  disabled={busy}
                  onChange={(event) => { setTabRevise({ key, text: event.target.value, sent: false }) }}
                />
                <button
                  type="button"
                  className={css.reviseSubmit}
                  disabled={busy || (draft?.text ?? '').trim() === ''}
                  onClick={() => {
                    const text = (draft?.text ?? '').trim()
                    if (text === '') return
                    void run(() => gateRevise({
                      changeId: advanceChangeId,
                      node: advanceNode,
                      // The wire `mode` is loose string; the host only tests
                      // 'bug-fix-path' — narrow once at the boundary.
                      ...(view.mode === '' ? {} : { mode: view.mode as 'full-go-path' | 'bug-fix-path' | 'clarify-required' }),
                      text,
                    }))
                      .then(() => { setTabRevise({ key, text: '', sent: true }) })
                  }}
                >
                  提交修改意见
                </button>
              </div>
            )
          })()}
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
                      // 【变更】2026-09-25: the raw mode id (full-go-path) leaked
                      // here; the customer reads the same localized name the 模式
                      // row shows (modeLabel → 完整流程 / 缺陷修复路径 …).
                      ? `已确认 · ${modeLabel(view.intake.mode, t)}`
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
          stats={sessionStats}
          usage={tokenUsage}
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
    if (event.ctrlKey) {
      event.preventDefault()
      const delta = event.deltaY > 0 ? -0.08 : 0.08
      setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number((z + delta).toFixed(2)))))
      return
    }
    // 【变更】2026-09-28 (用户问题 5): the plain wheel pans the graph
    // vertically (shift+wheel pans horizontally) — the flow outgrew the
    // viewport and drag-pan needed a right-click, which nobody discovers.
    // Clamped so the canvas can never pan fully out of sight.
    event.preventDefault()
    setPan(p => ({
      x: event.shiftKey ? clamp(p.x - event.deltaY, -(canvasW + 80), 80) : p.x,
      y: clamp(p.y - event.deltaY, -(canvasH * zoom + 80), 80),
    }))
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
            // 【变更】2026-09-28 (用户问题 3): bug-fix parity — the off-path
            // clarify/design nodes are the stages this mode CLIPPED; they read
            // 「已裁剪」 instead of 空闲, mirroring the full-go graph shape.
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
  /** 【变更】2026-09-25 (用户需求 工作流 6): the driving session's statistics. */
  stats?: SessionStatsProjection | undefined
  usage?: TokenUsageProjection | undefined
  t: (key: WorkflowTabKey) => string
}): React.ReactElement {
  const { pick, onClose, onReload, onOpenArtifact, stats, usage, t } = props
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
              {/* 【变更】2026-09-25 (用户需求 工作流 6): 会话统计 joins 变更分类
                  and 阶段产物 as the third record section — the same card the
                  main rail renders, fed by the driving session's projections. */}
              {(stats !== undefined || usage !== undefined) && (
                <SessionStatsCard stats={stats} usage={usage} t={t} />
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
    readonly state: 'missing' | 'template' | 'planned' | 'filled' | 'clipped'
    readonly missing: readonly string[]
  }[]
  disabled: boolean
  onOpen: (path: string) => void
  t: (key: WorkflowTabKey) => string
}): React.ReactElement {
  const { rows, disabled, onOpen, t } = props
  const stateLabel = (state: 'missing' | 'template' | 'planned' | 'filled' | 'clipped'): string =>
    t(`artifact.state.${state}` as WorkflowTabKey)
  const stateClass = (state: 'missing' | 'template' | 'planned' | 'filled' | 'clipped'): string =>
    state === 'filled' ? css.artifactStateFilled ?? ''
      : state === 'planned' ? css.artifactStatePlanned ?? css.artifactStateTemplate ?? ''
        : state === 'template' || state === 'clipped' ? css.artifactStateTemplate ?? ''
          : css.artifactStateMissing ?? ''
  // 【变更】2026-09-23 (demo1 十问题 4): each row names the stage that
  // produces it — 「设计 design.md」「验证 verify.md」— so the rail
  // reads as the stage→document map it is.
  const stageOf = (file: string): string => {
    if (file === 'proposal.md' || file === 'bug-record.md') return t('node.open')
    if (file === 'clarify.md') return t('node.clarify')
    if (file === 'design.md') return t('node.design')
    if (file === 'plan.md' || file === 'plan.json' || file === 'tasks.md') return t('node.plan')
    if (file === 'verify.md' || file === 'verify-report.json' || file === 'checklist.md') return t('node.verify')
    return ''
  }
  return (
    <section className={clsx(css.card, css.cardAccent)} aria-label={t('artifact.title')}>
      <h3 className={css.cardTitle}>{t('artifact.title')}</h3>
      {rows.map((row) => {
        // 【变更】2026-09-28 (用户问题 3): clipped rows (bug-fix 裁剪的
        // full-go 产物) render dimmed with no open button — the file is never
        // produced on this mode, so there is nothing to open.
        const blocked = row.state === 'missing' || row.state === 'clipped'
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
 * 【变更】2026-09-25 (demo8 问题 2.4): plain-zh renderings of the workflow
 * edges' English conditions, keyed by the stable edge id (T1–T16, baf-core
 * workflow.ts). The raw condition string stays the fallback for an edge this
 * table has not covered.
 */
const CONDITION_ZH: Readonly<Record<string, string>> = {
  T1: '任何 BAF 输入都从这里开始',
  T2: '分类确认为新需求或高风险缺陷',
  T3: '分类确认为低风险缺陷，且基线允许走快速路径',
  T4: '变更档案已建立，澄清单独进行',
  T4a: '澄清并入建立变更阶段（已记录理由）',
  T5: '根因和影响范围已记录',
  T6: '卡进度的问题已回答或明确延后；验收标准可检验',
  T7: '设计已确认，计划单独进行',
  T7a: '设计并入计划（任务和回退点已记录）',
  T8: '计划已包含文件白名单、验证命令和回退点',
  T9: '全部任务有结果，且没有越权改动',
  T10: '必需检查全部通过，且无漂移',
  T11: '有必需检查未通过',
  T12: '进行中的变更，其依据的文件 / 基线 / 报告发生了变化',
  T13: '最早受影响的阶段已恢复或重新确认',
  T14: '你确认后，归档一次完成',
  T15: '缺陷修复升级为完整流程，回头补澄清 / 设计 / 计划',
  T16: '你确认放弃进行中的变更',
}

/**
 * 【变更】2026-09-25 (demo8 问题 2.4): the former standalone 通俗说明 section
 * (per-stage tips) is gone — its plain-language content now lives inside the
 * catalog copy itself (catalog-i18n.ts), so every section reads customer-
 * facing and nothing repeats.
 * 【变更】2026-09-25 (用户需求 工作流 4): the per-stage 常见失败与处理 reference
 * table (FAILURE_REFS) is gone too — the detail panel shows the anomaly's
 * reason and fix ONLY when the stage actually sits in a failed/blocked
 * state, driven by the live node evidence (detail + reasonCodes) plus the
 * catalog's failure copy.
 */
function BilingualDetail(props: {
  node: WorkflowTabNodeView
  t: (key: WorkflowTabKey) => string
  nextEdge: { id: string; to: string; condition: string } | null
}): React.ReactElement {
  const { node, t, nextEdge } = props
  const zh = CATALOG_ZH[node.id]
  // 【变更】2026-09-25 (用户需求 工作流 4): the anomaly block renders ONLY when
  // this stage actually sits failed/blocked — reason from the live node
  // evidence (detail + reasonCodes), fix from the catalog failure copy.
  const failed = node.status === 'failed' || node.status === 'blocked'
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
            {/* 【变更】2026-09-25 (demo8 问题 2.4): the raw edge id / target id /
                English condition are internal vocabulary — show the stage's
                display name and a plain-zh condition instead. */}
            <span>{t(`node.${nextEdge.to}` as WorkflowTabKey)}</span>
            <span className={css.metaKey}>{t('card.condition')}</span>
            <span>{CONDITION_ZH[nextEdge.id] ?? nextEdge.condition}</span>
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
      {/* 【变更】2026-09-25 (用户需求 工作流 4): the ONLY failure surface —
          reason (the node's live detail + reasonCodes) then 解决方法 (the
          catalog's customer-side fix copy), rendered exclusively while the
          stage sits failed/blocked. A healthy or not-yet-reached stage shows
          nothing here (the old always-on 常见失败与处理 table is deleted). */}
      {failed && (
        <div className={css.biSection}>
          <div className={css.metaKey}>{t('detail.failure')}</div>
          {node.detail !== undefined && node.detail !== '' && (
            <p className={css.biZh}>{node.detail}</p>
          )}
          {node.reasonCodes !== undefined && node.reasonCodes.length > 0 && (
            <p className={css.hint}>{node.reasonCodes.join(' · ')}</p>
          )}
          {(zh?.failure ?? node.catalog.failure).length > 0 && (
            <ul className={css.list}>
              {(zh?.failure ?? node.catalog.failure).map(item => (
                <li key={item}>
                  <div className={css.biZh}>{item}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )
}
