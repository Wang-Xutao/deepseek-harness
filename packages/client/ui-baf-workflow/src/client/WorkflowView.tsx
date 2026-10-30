/**
 * BAF go-workflow Tab: theme-following flowchart with pan/zoom and click-expand.
 */
import {
  useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
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
  TestFlowStepId,
  WorkflowNodeId,
  WorkflowTabLanesView,
  WorkflowTabRoutePreview,
  WorkflowTabView,
} from './tab-types.ts'
import type { WorkflowTabKey } from './locales.ts'
// 【变更】2026-10-27 (批次三十): the 同步 dispatch's answer — the client
// mirrors the host's own result union so the banner can say what happened.
import type { BafWorkflowPauseResult, BafWorkflowSyncResult } from '../types.ts'
// 【变更】2026-10-28 (批次三十三 · 用户问题 3): the flow notice card — a title
// and a short body instead of the host's raw text in one muted line.
import { FlowNotice } from './FlowNotice.tsx'
import { buildClientTemplateTabView, withRenderableGraph } from './graph-template.ts'
// 【变更】2026-10-24 (批次二十 3): the graph canvas + the read-only rail
// parts moved into shared modules, so the 变更总览's per-change detail page
// renders the SAME graph and the SAME stage detail as this tab (the customer
// asked for exactly that). The behaviour here is unchanged — only the import
// moved.
import { FlowCanvas } from './FlowCanvas.tsx'
import { ArtifactRail, BilingualDetail, StageChecklist, StageSummaryCard, artifactDriftTags, artifactName, statusClass, type ArtifactDriftTag } from './flow-parts.tsx'
import { createRefreshScheduler } from './refresh-scheduler.ts'
import { RouteStatusRow } from './RouteStatusRow.tsx'
import { answerGateOption, answerGateRevision, gateAskViewOf, isBafGatePending, isSecondaryOptionLabel, parseGateSections } from './gate-ask.ts'
import { setWorkflowTabActive } from './tab-activity.ts'
// 【变更】2026-10-30 (用户问题 3.1): the answered-gate rendezvous — the
// session's dialog and this graph write to the same store, so a gate cancels
// IN SYNC across the two tabs.
import { answeredGateFor, noteGateAnswered, noteGateShown, subscribeAnsweredGates } from './gate-sync.ts'
// 【变更】2026-10-24 (批次十八 2.3): the shared row display helpers — the
// 工作流 page's 变更总览 ledger formats a change row the same way.
// 【变更】2026-10-24 (批次十九 1.3): the timestamp helper — the strip's 开始时间.
import { formatDuration, formatTokenCount, formatTimestamp, modeLabel } from './dashboard-format.ts'
// 【变更】2026-10-30 (用户问题 2/6/7): the shared per-second duration clock —
// the top strip and the rail's stage card read the SAME hook, so 流程耗时
// ticks once a second everywhere and freezes while the customer waits.
import { useLiveDurationMs } from './live-duration.ts'
import css from './WorkflowView.module.css'

/** intake.mode wire value → locale key (the rail's 变更分类 card). */
const INTAKE_MODE_LABEL: Record<string, WorkflowTabKey> = {
  'full-go-path': 'mode.fullGoPath',
  'bug-fix-path': 'mode.bugFixPath',
  'clarify-required': 'mode.clarify',
}

/**
 * 【变更】2026-10-24 (批次二十 3): the 测试流图 jump chips moved into
 * `flow-parts.tsx` together with the canvas that renders them (the 变更总览's
 * per-change detail page draws the same graph, chips included).
 */

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
   * 【变更】2026-10-28 (批次三十五 · 用户问题 2): record the Tab's own 暂不推进
   * host-side — the same deferral the conversation tab's decline records, so
   * BOTH tabs stand down (no re-prompt) until the graph's 「推进」 re-raises the
   * deferred confirmation.
   */
  advanceDismiss: (changeId: string) => Promise<WorkflowTabView>
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
   * 【变更】2026-10-24 (批次十九 1.3): the session tab no longer carries the
   * change overview — the ledger moved to the 工作流 page's 变更总览 tab, which
   * reads the WORKSPACE-scoped rollup (the host's `changeOverview`). This tab
   * only hands the user over to it.
   */
  /**
   * 2026-09-21 (session 5.jsonl) — open one change artifact in the right
   * sidebar (view/edit). The workspace-relative `path` comes straight off a
   * `WorkflowTabView.artifacts` row; command-card bodies render in <pre>
   * plain text, so this rail button is the GUI's true open channel.
   */
  openArtifact: (path: string) => void
  /**
   * 【变更】2026-10-07 (九点批 问题 2): preview the model a gate/advance
   * confirm would dispatch the next work order on — the host runs the SAME
   * pure routing core a real dispatch runs, with the same Auto gate, but
   * pins nothing and audits nothing. Only a `routed` outcome renders a
   * 「确认后派单」line; `off`/`unresolved` stay silent.
   */
  routePreview: (changeId: string, node: WorkflowNodeId) => Promise<WorkflowTabRoutePreview>
  /**
   * §22.19 R5 — real-time push subscription. The host emits
   * `baf-workflow/projection-appended` after every appended projection
   * event in this session's workspace; the returned disposer unregisters
   * (pair it in the same useEffect that created the scheduler).
   */
  subscribe: (onChange: () => void) => () => void
  /**
   * 【变更】2026-10-21 (配置按钮): open the main-stage 工作流 configuration
   * page (the one the sidebar's 工作流 entry opens) — the strip's 配置 button.
   */
  openWorkflowConfig: () => void
  /**
   * 【变更】2026-10-27 (批次三十): re-author the stale documents against the
   * newest upstream — the 「同步」button's action.
   *
   * The click IS the authorization: the order the host sends carries the
   * customer ledger scope, so it is never deduped away by the orchestrator's
   * own turn-end order.
   */
  syncArtifacts: (changeId: string) => Promise<BafWorkflowSyncResult>
  /**
   * 【变更】2026-10-27 (批次三十): the 暂停/继续 button — brake the change's
   * workflow, or release it and hand the outstanding gap back to the model.
   */
  setPaused: (changeId: string, paused: boolean) => Promise<BafWorkflowPauseResult>
  /**
   * 【变更】2026-10-27 (批次三十): open the 工作流 page's 「变更总览」 tab —
   * the strip's 变更总览 button. The session tab no longer carries the change
   * overview as a modal (the ledger moved to the 工作流 page), so the button
   * hands the user over to the one home of the ledger.
   */
  openChangeOverview: () => void
}

export type WorkflowViewProps =
  & ConvViewProps
  & PropsLocale<'baf.go-workflow'>
  & InjectFace<WorkflowViewInjected>

const RAIL_MIN = 280
const RAIL_MAX = 560
const RAIL_DEFAULT = 360

/**
 * Sum the three disjoint prompt-side billing buckets plus output — the same
 * aggregate the composer's usage pill shows (StatsPills `billedInputTokens`).
 * @param usage - the session's token-usage projection value.
 * @returns billed total tokens.
 */
function billedTotalTokens(usage: TokenUsageProjection): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens
}

/**
 * 【变更】2026-10-07 (九点批 问题 2): the node whose work order a confirm on
 * the TOP decision cards (advance dialog, live gate, pending gate) would
 * dispatch. A change resting on a COMPLETED stage advances into the next
 * forward node (the same edge the advance dialog names); mid-stage gates
 * (clarification asks, proposal gates) continue the CURRENT node. Terminal
 * targets archive nothing model-authored — no preview.
 * @param view - the current Tab view.
 * @returns the dispatch node, or null when no previewable target exists.
 */
function dispatchNodeForConfirm(view: WorkflowTabView): WorkflowNodeId | null {
  const current = view.current
  if (current === null || current === 'completed' || current === 'abandoned') return null
  const currentNode = view.nodes.find(n => n.id === current)
  if (currentNode?.status !== 'completed') return current
  const edge = view.graph.edges.find(e => e.from === current && e.kind === 'forward')
    ?? view.graph.edges.find(e => e.from === current)
  const to = edge?.to
  if (to === undefined || to === 'completed' || to === 'abandoned') return null
  return to as WorkflowNodeId
}

/**
 * 【变更】2026-10-23 (批次十六 2.2): a raw gate question string rendered as
 * its 【…】 sections — the same wire protocol the live dialog speaks
 * (`parseGateSections`); a question with no sections (plain prose gates like
 * the classify card) stays one hint paragraph. Shared by the pendingGate
 * card and the workflow-top gate banner so every gate surface reads in
 * segments, not one run-on line.
 */
function GateBodySections({ text }: { readonly text: string }) {
  const sections = parseGateSections(text)
  if (sections.length === 0) return <p className={css.hint}>{text}</p>
  return (
    <>
      {sections.map((section, si) => (
        <div key={`gsec-${si}`} className={css.gateSection}>
          {section.title !== undefined && <div className={css.gateSectionTitle}>{section.title}</div>}
          {section.blocks.map((block, bi) => block.kind === 'text'
            ? <p key={`gt-${si}-${bi}`} className={css.hint}>{block.text}</p>
            : (
              <ul key={`gl-${si}-${bi}`} className={css.gateList}>
                {block.items.map((item, ii) => (
                  <li key={`gli-${si}-${bi}-${ii}`}>{item.text}</li>
                ))}
              </ul>
            ))}
        </div>
      ))}
    </>
  )
}

/**
 * 【变更】2026-10-07 (九点批 问题 2): the「确认后派单：<档位>·<模型>」line —
 * one async best-effort preview per (change, node); only a `routed` outcome
 * renders. Off (config disabled / session not on Auto) and unresolved stay
 * silent: the card never promises a tier the dispatch would not use.
 */
export function RouteDispatchLine(props: {
  load: (changeId: string, node: WorkflowNodeId) => Promise<WorkflowTabRoutePreview>
  changeId: string | null
  node: WorkflowNodeId | null
  t: (key: WorkflowTabKey) => string
}): React.ReactElement | null {
  const { load, changeId, node, t } = props
  const [badge, setBadge] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setBadge(null)
    if (changeId === null || node === null) return
    load(changeId, node)
      .then((preview) => {
        if (cancelled || preview.state !== 'routed') return
        const tierLabel: WorkflowTabKey = preview.tier === 'high'
          ? 'route.tierHigh'
          : preview.tier === 'mid' ? 'route.tierMid' : 'route.tierLow'
        setBadge(`${t('route.dispatchOn')}${t(tierLabel)}·${preview.model}`)
      })
      .catch(() => {
        // Informational line only — a failed preview never blocks the card.
      })
    return () => { cancelled = true }
  }, [load, changeId, node, t])
  if (badge === null) return null
  return <p className={css.routeDispatchLine} data-testid="route-dispatch-line">{badge}</p>
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
 * 【变更】2026-10-27 (批次三十): what the 「同步」dispatch did, in one line.
 *
 * The banner must not promise more than the host did: a dispatched order says
 * the model is working on it, a refusal says WHY (no workspace / no live
 * session / the model is mid-turn).
 *
 * 【变更】2026-10-28 (批次三十三 · 用户问题 3): a notice is a TITLE plus a
 * body, not one long line. The title says which action failed; the body says
 * why, in the host's own short words.
 *
 * 【变更】2026-10-28 (批次三十三 · 用户问题 2): a dispatched order is not a
 * sentence — it is work ON ITS WAY, and the notice for that state is derived
 * from the drift still being on disk (the 「正在同步」 spinner), not stored
 * here. So this answers with a notice only when the sync FAILED.
 * @param result - the host's answer.
 * @param t - the locale binder.
 * @returns the failure notice, or null when there is nothing to report.
 */
function syncNoticeOf(
  result: BafWorkflowSyncResult,
  t: (key: WorkflowTabKey) => string,
): { readonly kind: 'warn'; readonly title: string; readonly text: string } | null {
  switch (result.status) {
    case 'dispatched':
    // 【变更】2026-10-27 (批次三十一): the order was already on its way — the
    // host says so instead of claiming a fresh dispatch, because nothing new
    // reached the model.
    case 'queued':
    // Nothing is out of sync: there is nothing to wait for either.
    case 'no-drift':
      return null
    case 'no-workspace':
      return { kind: 'warn', title: t('flow.syncFailedTitle'), text: t('flow.syncNoWorkspace') }
    case 'unavailable':
      return { kind: 'warn', title: t('flow.syncFailedTitle'), text: result.reason }
  }
}

/**
 * 【变更】2026-10-27 (批次三十): what the 暂停/继续 action did.
 *
 * 【变更】2026-10-27 (批次三十二 · 补充 2): ONLY a failure says anything now.
 * The success used to print a plain sentence under the graph (「工作流已暂停——
 * 在你点「继续」之前，不再自动弹门，也不再自动派单。」), but the pause state is
 * already on screen: the toolbar button reads 继续 instead of 暂停, and the
 * 「推进」button is gone while the brake holds. The sentence repeated what the
 * picture already showed, so it left; a FAILED pause still reports itself —
 * that is a fact the customer cannot see.
 *
 * 【变更】2026-10-28 (批次三十三 · 用户问题 3): the title follows the ACTION
 * the customer took — a failed 继续 never says 「暂停操作未能生效」 — and the
 * body is the host's one-line reason instead of its whole card.
 * @param result - the host's answer.
 * @param paused - the action the customer took (true = 暂停).
 * @param t - the locale binder.
 * @returns the notice, or null when the action succeeded.
 */
function pauseNoticeOf(
  result: BafWorkflowPauseResult,
  paused: boolean,
  t: (key: WorkflowTabKey) => string,
): { readonly kind: 'warn'; readonly title: string; readonly text: string } | null {
  if (result.status === 'unavailable') {
    const title = paused ? t('flow.pauseFailedTitle') : t('flow.resumeFailedTitle')
    return { kind: 'warn', title, text: result.reason }
  }
  return null
}

/**
 * Render the BAF workflow flowchart Tab.
 * @param props - conversation view props + inject face.
 */
export function WorkflowView(props: WorkflowViewProps): React.ReactElement {
  const {
    t, refresh, startIntake, advance, transition, resume,
    advanceDismiss,
    gateResolve, gateRevise, openArtifact, routePreview, useProjection, subscribe,
    openWorkflowConfig,
    // 【变更】2026-10-27 (批次三十): the 「同步」button — re-author the stale
    // documents against the newest upstream.
    syncArtifacts,
    // 【变更】2026-10-27 (批次三十): the 暂停/继续 button.
    setPaused,
    // 【变更】2026-10-24 (批次十九 1.3): the strip's 变更总览 button hands the
    // user over to the 工作流 page's 变更总览 tab.
    openChangeOverview,
    // 批次十三 1 — the 测试流图 jump chips' channel: select that tab and
    // address a `stage:<id>` focus to it (ConvViewOwnerProps contract).
    openView,
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
  // 【变更】2026-10-30 (用户问题 2/6/7): the per-second 流程耗时 clock moved into
  // the shared `useLiveDurationMs` hook — the top strip and the rail's stage
  // card read the SAME clock, so they tick together and freeze together
  // (the host says `running === false` while the change rests on a customer
  // decision — a confirmation gate or an approval wait).
  // 【变更】2026-09-25 (用户需求 工作流 1): the TOP advance dialog's dismissal —
  // keyed `${changeId}:${current}` so 暂不推进 dismisses for THIS rest point
  // only; a real stage advance (or change switch) re-arms the dialog.
  const [advanceDismissed, setAdvanceDismissed] = useState<string | null>(null)
  // 【变更】2026-09-25 (用户需求 工作流 1): one-click state of the TOP live-gate
  // dialog — after a click every option disables until the carrier resolves
  // (the pending interaction clears and the card unmounts).
  const [gateAnswered, setGateAnswered] = useState<string | null>(null)
  // 【变更】2026-10-30 (用户问题 3.1): the gate the customer ANSWERED, read from
  // the shared answered-gate store — the session's dialog and this graph write
  // to the same place, so a 暂不推进 in the conversation cancels the banner
  // HERE, and a click here cancels it there.
  //
  // The graph's parked-gate banner and the session's dialog are the SAME
  // decision, and the banner is suppressed while the dialog is up (the dialog
  // is the fresher instant). But the PROJECTION still carries the park after
  // the answer — the host clears it on the NEXT event — so the banner used to
  // REAPPEAR the moment the dialog closed: the customer watched the
  // confirmation they had just dismissed come back, and could never reach the
  // 「推进」 button.
  const sharedAnswer = useSyncExternalStore(
    subscribeAnsweredGates,
    () => answeredGateFor(sessionId),
    () => undefined,
  )
  /**
   * The parked gate's id captured when the answer arrived — the banner is the
   * same decision while it shows THAT gate. A different parked gate is a
   * different decision and shows normally.
   */
  const [answeredBannerGateId, setAnsweredBannerGateId] = useState<string | null>(null)
  /**
   * 【变更】2026-10-30 (用户问题 3.1): the parked gate's id, captured when the
   * answer arrives.
   */
  const bannerGateId = view.gate?.gateId
  useEffect(() => {
    if (sharedAnswer === undefined) {
      setAnsweredBannerGateId(null)
      return
    }
    setAnsweredBannerGateId(bannerGateId ?? null)
  }, [sharedAnswer, bannerGateId])
  /**
   * 【变更】2026-10-30 (用户问题 3.1): whether the parked-gate banner is the
   * decision the customer has ALREADY answered.
   * @param gateId - the banner's gate id.
   * @returns true when the banner must stay hidden.
   */
  const answeredGateCovers = (gateId: string): boolean =>
    sharedAnswer !== undefined
    && answeredBannerGateId !== null
    && answeredBannerGateId === gateId
    && (sharedAnswer.changeId === undefined || sharedAnswer.changeId === view.changeId)
  // 【变更】2026-09-28 (用户问题 1.7 Tab parity): the revision draft of the
  // Tab-native decision surfaces (advance dialog, parked-gate banner) — keyed
  // per surface so switching surfaces resets the draft; `sent` swaps the form
  // for the 已派单 note until the surface's own state moves on. The LIVE gate
  // card needs none of this: its carrier resolves on submit and the card
  // unmounts.
  const [tabRevise, setTabRevise] = useState<{ key: string; text: string; sent: boolean } | null>(null)
  // 【变更】2026-10-28 (用户问题 3): the LIVE gate card's revision draft —
  // cleared with gateAnswered whenever a new carrier arrives.
  const [liveReviseText, setLiveReviseText] = useState('')
  // 【变更】2026-10-27 (批次三十): the 「同步」action's outcome — the banner
  // says what the dispatch did (or why it could not). `syncing` keeps the
  // button from firing twice while the order is on its way.
  // 【变更】2026-10-28 (批次三十三 · 用户问题 2): the outcome is now only a
  // FAILURE. A dispatched order is work on its way: the notice shows the
  // 「正在同步」 animation (derived from the drift still being on disk), not a
  // sentence about the dispatch.
  const [syncFailure, setSyncFailure] = useState<{ readonly kind: 'warn'; readonly title: string; readonly text: string } | null>(null)
  // Whether the customer asked for a sync — the 「正在同步」 state rides on it
  // until the stale documents are actually rewritten.
  const [syncStarted, setSyncStarted] = useState(false)
  const [syncing, setSyncing] = useState(false)
  // 【变更】2026-10-27 (批次三十): the 暂停/继续 action's outcome.
  // 【变更】2026-10-27 (批次三十二 · 补充 2): only a FAILED action produces a
  // notice — the success is on screen already (the button reads 继续, and the
  // 「推进」button is gone while the brake holds).
  const [pauseNotice, setPauseNotice] = useState<{ readonly kind: 'warn'; readonly title: string; readonly text: string } | null>(null)
  const [pausing, setPausing] = useState(false)

  // 【变更】2026-10-27 (批次三十): the STALE documents — a downstream document
  // an upstream edit made stale. The host reads them off the file mtimes and
  // rides them on the view; the graph marks the affected stages.
  const driftRows = view.artifactDrift ?? []
  // 【变更】2026-10-29 (批次三十七 · 用户问题 6): the document lifecycle's own
  // drift signal — a 已完成 document that was edited (已更新) and the
  // documents of the later stages that are now 待更新. The banner opens on
  // these rows too, so the customer is told to sync even when the pair-wise
  // drift detector found no stale pair (an edited document with nothing
  // downstream of it yet).
  const lifecycleDrift = (view.artifacts ?? []).filter(row => row.state === 'updated' || row.state === 'stale')
  // 【变更】2026-10-27 (批次三十二 · 用户问题 2): the change is PAUSED. A paused
  // change advances nothing: the 「推进」button is gone, the TOP advance
  // confirmation never renders, and the parked-gate banner is hidden — the
  // customer asked for the pause, so no surface may offer to move the change on
  // until 「继续」 is pressed.
  const paused = view.paused === true
  const driftNodes = useMemo(
    () => (view.artifactDrift ?? []).map(row => row.node),
    [view.artifactDrift],
  )

  // 【变更】2026-10-27 (批次三十一): the drift TAGS for the left rail's stage
  // documents. The upstream document that was edited is 已修改; the downstream
  // document that edit made stale is 待同步; the document the sync order is
  // rewriting right now is 已同步. The tags ride the document NAME, and they
  // are gone once the documents agree again (the drift rows are).
  const driftTags = useMemo(
    (): Record<string, ArtifactDriftTag> => artifactDriftTags(driftRows, syncing),
    [driftRows, syncing],
  )

  // 【变更】2026-10-27 (批次三十): the 「同步」action. The click IS the
  // authorization — the host's order carries the customer ledger scope, so it
  // is never deduped away by the orchestrator's own turn-end order.
  const syncDrift = useCallback(async (changeId: string): Promise<void> => {
    setSyncing(true)
    setSyncStarted(true)
    setSyncFailure(null)
    try {
      setSyncFailure(syncNoticeOf(await syncArtifacts(changeId), t))
    } catch (err) {
      setSyncStarted(false)
      setSyncFailure({
        kind: 'warn',
        title: t('flow.syncFailedTitle'),
        text: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setSyncing(false)
    }
  }, [syncArtifacts, t])

  // 【变更】2026-10-27 (批次三十): the 暂停/继续 action. The click IS the
  // authorization: the host's resume drive carries the customer ledger scope,
  // so the work order it hands back is never deduped away.
  const togglePause = useCallback(async (changeId: string, paused: boolean): Promise<void> => {
    setPausing(true)
    try {
      const result = await setPaused(changeId, paused)
      setPauseNotice(pauseNoticeOf(result, paused, t))
      // 【变更】2026-10-27 (批次三十): the button label flips on the ANSWER, not
      // on the next poll. The 2 s poll is suppressed while the window is hidden
      // (`refreshNow` guards on `visibilityState`), so a window that is not in
      // the foreground would sit on a stale 「暂停」 until the customer focuses
      // it again. The host owns the flag; the next poll still re-derives it and
      // corrects any divergence.
      if (result.status === 'ok') {
        setView(prev => (prev.paused === paused ? prev : { ...prev, paused }))
      }
    } catch (err) {
      setPauseNotice({
        kind: 'warn',
        title: paused ? t('flow.pauseFailedTitle') : t('flow.resumeFailedTitle'),
        text: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setPausing(false)
    }
  }, [setPaused, t])

  const applyView = useCallback((next: WorkflowTabView) => {
    const safe = withRenderableGraph(next)
    setView(safe)
    setError(safe.blockedReason ?? null)
    // 【变更】2026-10-30 (用户问题 2/6/7): the interpolation anchor moved into
    // the shared `useLiveDurationMs` hook — it re-anchors on every new view
    // snapshot, at the HOST's derivation stamp (the totals are computed before
    // serialization/transport), so applying ~a second after computation cannot
    // re-anchor the clock behind the already-painted value.
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

  // 【变更】2026-10-28 (批次三十五 · 用户问题 9): the toolbar's 「推进」 drives
  // the SAME `/baf-go` a typed command would — ask channel and all — so the
  // registered confirmation pops as the workflow tab's live-gate dialog AND
  // the conversation tab's BafGateComposer modal at once. A deferred 暂不推进
  // is re-raised by this click: the host clears the marker before the drive,
  // and the popped dialog carries the decision both tabs see.
  const advanceFromToolbar = useCallback((): void => {
    const changeId = view.changeId
    if (changeId === null) return
    setAdvanceDismissed(null)
    void run(() => advance(changeId, false))
  }, [advance, run, view.changeId])

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
  // 【变更】2026-10-28 (批次三十五 · 用户问题 1): whether the session's model
  // turn is still RUNNING. The 「同步」button stays disabled while it is — the
  // sync order would collide with the very turn that is still authoring the
  // documents (the host refuses it with 会话进行中无法同步), so the customer
  // waits for the turn to end instead of clicking into the refusal.
  const sessionRunning = useSessionStatus(snapshot =>
    snapshot.get(sessionId)?.running) === true
  const liveGate = useMemo(
    () => (isBafGatePending(pendingInteraction) ? pendingInteraction : null),
    [pendingInteraction],
  )
  const liveGateView = useMemo(() => (liveGate === null ? null : gateAskViewOf(liveGate)), [liveGate])
  // 【变更】2026-10-30 (用户问题 3.1): the carrier's gate id — the identity of
  // the decision on screen. A DIFFERENT gate clears the shared answer, so the
  // banner of the new decision is not suppressed by the old one.
  const liveGateId = liveGateView?.id ?? null
  useEffect(() => {
    if (liveGateId !== null) noteGateShown(sessionId, liveGateId)
  }, [liveGateId, sessionId])
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

  // 【变更】2026-10-30 (用户问题 2/6/7): the 流程耗时 clock — the shared
  // per-second hook. It advances once a second while the change works and
  // FREEZES while the change rests on a customer decision (the host reports
  // `metrics.running === false`: a confirmation gate the customer has not
  // answered yet, or an approval the customer has not granted yet). The gate
  // wait and the approval wait are therefore not counted, while the model's
  // own running time is.
  const liveTotalMs = useLiveDurationMs({
    view,
    baseMs: view.metrics?.totalDurationMs,
    running: view.metrics?.running,
    computedAt: view.metrics?.computedAt,
  })

  useEffect(() => {
    if (preset !== 'baf') return
    void run(() => refresh())
  }, [preset, refresh, run])



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

  // 【变更】2026-10-24 (批次十九 1.2): the rail's stage header values. The
  // column's cards describe ONE stage — the SELECTED node's — so the header
  // names it; with nothing selected the change's current stage stands in.
  // 【变更】2026-10-27 (批次三十二 · 用户问题 5): the header is now the stage's
  // NAME CARD — the name plus the stage's own figures (状态 / 耗时 / Tokens /
  // 下一跳 / 条件). The one-line purpose blurb is gone: it repeated the 目标
  // section the 阶段详情 already carries, one screen lower.
  const railStage = useMemo(() => {
    if (selectedNode !== null) {
      return {
        name: t(`node.${selectedNode.id}` as WorkflowTabKey),
        node: selectedNode,
      }
    }
    if (selectedTerminal !== null) {
      return {
        name: t(`status.${selectedTerminal}` as WorkflowTabKey),
        node: undefined,
      }
    }
    if (view.current !== null) {
      const node = view.nodes.find(n => n.id === view.current)
      const terminal = view.current === 'completed' || view.current === 'abandoned'
      return {
        name: terminal
          ? t(`status.${view.current}` as WorkflowTabKey)
          : t(`node.${view.current}` as WorkflowTabKey),
        node: terminal ? undefined : node,
      }
    }
    return { name: t('strip.idle'), node: undefined }
  }, [selectedNode, selectedTerminal, view, t])
  const railStageName = railStage.name
  const railStageNode = railStage.node
  // 【变更】2026-10-30 (用户问题 6): the RIGHT rail's 耗时 ticks once a second
  // while the stage it describes is the running one — the same clock the top
  // strip reads, so the two never disagree.
  const liveStageMs = useLiveDurationMs({
    view,
    baseMs: view.current !== null && view.current !== 'completed' && view.current !== 'abandoned'
      ? view.nodes.find(node => node.id === view.current)?.metrics?.durationMs
      : undefined,
    running: view.metrics?.running,
    computedAt: view.metrics?.computedAt,
  })
  // 【变更】2026-10-30 (用户问题 8b): the change's FILES and the scope they
  // carry — 待确定 while nothing is touched, 模块内 when every file is under
  // one directory, 跨模块 when the files reach several directories.
  const scopeFiles = view.scope?.files ?? []
  const scopeLabel = view.scope === undefined || view.scope.kind === 'unknown'
    ? t('scope.unknown')
    : t(`scope.${view.scope.kind}` as WorkflowTabKey)

  // 【变更】2026-09-22 (user report #4) — strip token cell + stats-card
  // figures derived from the tokenUsage projection (undefined → placeholder).
  // 【变更】2026-10-30 (用户问题 4): the strip's token cell now reads the HOST's
  // rollup — the very sum the stage cards add up to — so the two can never
  // disagree. It used to read the session-wide `tokenUsage` projection, which
  // counts the turns BEFORE the change started and the streaming retries the
  // per-stage fold never sees; the customer asked for the stage cards' sum to
  // equal the top, and those two sources could not agree by construction.
  const changeTokenTotal = view.metrics === undefined
    ? undefined
    : (view.metrics.totalInputTokens ?? 0) + (view.metrics.totalOutputTokens ?? 0)
  const tokenTotal = changeTokenTotal
  const tokenTooltip = useMemo(() => {
    if (tokenUsage === undefined) return t('metrics.pending')
    return [
      // 【变更】2026-10-30 (用户问题 4): the tooltip names the two totals apart
      // — the change's (the headline number) and the session's (which also
      // carries the turns before the change began).
      `${t('stats.changeTotal')} ${formatTokenCount(changeTokenTotal ?? 0)}`,
      `${t('stats.sessionTotal')} ${formatTokenCount(billedTotalTokens(tokenUsage))}`,
      `${t('stats.input')} ${formatTokenCount(tokenUsage.uncachedInputTokens)}`,
      `${t('stats.cacheRead')} ${formatTokenCount(tokenUsage.cacheReadTokens)}`,
      `${t('stats.cacheWrite')} ${formatTokenCount(tokenUsage.cacheWriteTokens)}`,
      `${t('stats.output')} ${formatTokenCount(tokenUsage.outputTokens)}`,
    ].join('\n')
  }, [changeTokenTotal, tokenUsage, t])

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
   * 【变更】2026-10-24 (批次十九 1.3): the dashboard table row (phase pill, task
   * progress bar, duration, tokens, and the 查看工作流 action) left with the
   * session tab's 变更总览 modal — the ledger moved to the 工作流 page, which
   * renders its own cards (ChangeOverviewRow.tsx).
   */

  if (preset !== 'baf') {
    return <div className={css.root} data-conversation-composer-overlay="" />
  }

  return (
    <div className={css.root} data-conversation-composer-overlay="">
      <div className={css.strip} role="status">
        {/* 【变更】2026-10-24 (批次十九 2.1): the top-left chip is the BAF brand
            mark (t('view.brandBaf')) — the SAME wordmark the 测试流图 tab
            shows, so the two conversation tabs read as one family. The
            测试流图 side lands in this same batch (TestFlowView.tsx +
            TestFlowView.module.css) and takes the same brand fill. */}
        <span className={css.stripBrand} data-testid="baf-workflow-brand">{t('view.brandBaf')}</span>
        {/* 【变更】2026-10-20 (批次四 4): the active change id rides the strip
            as an accent-tinted mono chip right after the brand — change-xx is
            readable at a glance from every corner of the tab, and the rail
            banner below repeats it for the sidebar reader. */}
        {view.changeId !== null && (
          <span className={css.stripChange} data-testid="strip-change-id" title={view.changeId}>
            变更 {view.changeId}
          </span>
        )}
        <span className={css.stripItem}>
          <span className={css.stripLabel}>{t('strip.current')}</span>
          <span className={css.stripValue}>
            {view.current === null
              ? t('strip.idle')
              : t(`node.${view.current}` as WorkflowTabKey)}
          </span>
        </span>
        {/* 【变更】2026-10-21 (批次八 2): the strip's 模式 item is deleted — the
            rail's intake card shows the mode (and its confirm state) one glance
            away; the strip keeps change id / node / time / tokens. */}
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
        {/* 【变更】2026-10-24 (批次十九 1.4): the change's START time rides the
            info box next to the elapsed duration — WHEN the change began is
            as load-bearing as HOW LONG it has been running. */}
        <span className={css.stripItem}>
          <span className={css.stripLabel}>{t('strip.startedAt')}</span>
          <span className={css.stripValue} data-testid="strip-started-at">
            {formatTimestamp(view.startedAt)}
          </span>
        </span>
        {/* 【变更】2026-10-24 (批次十九 1.4): the strip's buttons live in their
            own right-aligned group, ordered 配置 → 刷新 → 变更总览 (客户指定
            顺序). The 变更总览 button no longer opens a modal here — the
            ledger moved to the 工作流 page's 变更总览 tab (批次十九 1.3). */}
        <span className={css.stripActions}>
          <button
            type="button"
            className={clsx(css.btn, css.btnGhost)}
            disabled={busy}
            data-testid="strip-workflow-config"
            onClick={() => { openWorkflowConfig() }}
          >
            {t('action.config')}
          </button>
          <button
            type="button"
            className={clsx(css.btn, css.btnGhost)}
            disabled={busy}
            onClick={() => void runSilent(() => refresh())}
          >
            {t('action.refresh')}
          </button>
          <button
            type="button"
            className={clsx(css.btn, css.btnGhost)}
            disabled={busy}
            data-testid="strip-change-overview"
            onClick={() => { openChangeOverview() }}
          >
            {t('action.dashboard')}
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
          {/* 【变更】2026-09-25 (用户需求 工作流 1): the strip 「推进」 button is GONE
              (【变更】2026-09-25 用户需求 工作流 1): the always-on button became
              the TOP advance dialog below — it pops only when the host-derived
              `advance` says the change rests at a point that can advance, so
              the strip no longer carries a permanent decision the customer
              would otherwise see on every paint.
              【变更】2026-10-07 (九点批 问题 3): it is BACK as a RE-ARM — a quiet
              ghost button that shows only while an advance rest point actually
              exists (view.advance.ready), and its single job is to undo the
              暂不推进 dismissal for the CURRENT rest point so the TOP dialog
              re-renders (then scrolls into view). Before this, dismissing the
              dialog left typing /baf-go in chat as the only way back.
              【变更】2026-10-27 (批次三十一): the button MOVED into the flow
              graph's toolbar (left of 「暂停」/「继续」) — the customer asked for
              the advance action to sit with the other flow controls instead of
              in the page header. Its behavior is unchanged. */}
        </span>
      </div>

      {/* 多模型路由 M3 批次C —「当前路由」chips row. Absent when the fold says
          off or the payload predates it: enabled=false renders exactly like
          today (M3 验收), so the row mounts only on a routed fold. */}
      {view.routeStatus !== undefined && (
        <RouteStatusRow status={view.routeStatus} t={t} />
      )}

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
          {/* 【变更】2026-10-07 (九点批 问题 2): 确认后派单 preview — the tier·model
              the option's work order will run on (Auto sessions only). */}
          <RouteDispatchLine
            load={routePreview}
            changeId={view.changeId}
            node={dispatchNodeForConfirm(view)}
            t={t}
          />
          <div className={css.actions}>
            {liveGateView.options.map(opt => (
              /* 【变更】2026-10-29 (批次三十六 · 用户问题 6): the option's
                 explanation rides UNDER its button, not inline after the label —
                 the customer asked for a clear note under every option. */
              <span key={`live-gate-${opt.label}`} className={css.actionCell}>
                <button
                  type="button"
                  className={clsx(css.btn, opt.label === livePrimaryLabel ? css.btnPrimary : css.btnGhost)}
                  disabled={busy || gateAnswered !== null}
                  onClick={() => {
                    setGateAnswered(opt.label)
                    // 【变更】2026-10-30 (用户问题 3.1): remember the answer so
                    // the parked-gate banner does not come back behind it.
                    noteGateAnswered(sessionId, {
                      ...(liveGateView.changeId === undefined ? {} : { changeId: liveGateView.changeId }),
                      gateId: liveGateView.id,
                    })
                    answerGateOption(liveGate, liveGateView, opt.label)
                  }}
                >
                  {opt.label}
                </button>
                {opt.hint !== undefined && (
                  <span className={css.actionHint}>{opt.hint}</span>
                )}
              </span>
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
                  // 【变更】2026-10-30 (用户问题 3.1): the revision is an answer
                  // too — the banner must not reappear behind it.
                  noteGateAnswered(sessionId, {
                    ...(liveGateView.changeId === undefined ? {} : { changeId: liveGateView.changeId }),
                    gateId: liveGateView.id,
                  })
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
          {/* 【变更】2026-10-23 (批次十六 2.2): segmented 【…】 body — the same
              section rendering the live dialog uses, not one run-on line. */}
          <GateBodySections text={view.pendingGate.question} />
          {(view.pendingGate.detail ?? []).map(line => (
            <p key={line} className={css.hint}>{line}</p>
          ))}
          {/* 【变更】2026-10-07 (九点批 问题 2): 确认后派单 preview — the tier·model
              the confirm's work order will run on (Auto sessions only). */}
          <RouteDispatchLine
            load={routePreview}
            changeId={view.pendingGate.changeId ?? view.changeId}
            node={dispatchNodeForConfirm(view)}
            t={t}
          />
          <div className={css.actions}>
            {view.pendingGate.options.map((opt) => {
              const isCancel = opt.id === 'cancel' || opt.id === 'reject'
              return (
                /* 【变更】2026-10-29 (批次三十六 · 用户问题 6): each option shows
                   the registry's explanation under its button. */
                <span key={`pending-${opt.id}`} className={css.actionCell}>
                  <button
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
                    {/* 【变更】2026-10-29 (批次三十七 · 用户问题 4): the
                        recommended path (the higher-confidence one) carries a
                        「推荐」 badge. */}
                    {opt.recommended === true && (
                      <span className={css.recommendBadge} data-baf-recommended="">推荐</span>
                    )}
                  </button>
                  {opt.hint !== undefined && (
                    <span className={css.actionHint}>{opt.hint}</span>
                  )}
                </span>
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
          dialog above is showing (same decision, fresher instant).
          【变更】2026-10-27 (批次三十二 · 用户问题 2): suppressed while the
          change is PAUSED — a parked gate's confirm advances the change, and a
          paused change must not advance.
          【变更】2026-10-30 (用户问题 3.1): suppressed after the customer
          ANSWERED the same decision in the session (or here) — the projection
          still carries the park, so the banner used to come back the moment
          the dialog closed, and the customer could never reach the 「推进」
          button. */}
      {view.gate !== undefined
        && view.gate.gateId !== undefined
        && view.gate.question !== undefined
        && view.changeId !== null
        && !paused
        && liveGateView === null
        && !answeredGateCovers(view.gate.gateId) && (
        <section className={clsx(css.card, css.cardGate)} aria-label={t('gate.bannerTitle')}>
          <div className={css.cardTitle}>{t('gate.bannerTitle')}</div>
          {/* 【变更】2026-10-23 (批次十六 2.2): segmented 【…】 body — parity with
              the pendingGate card and the live dialog. */}
          <GateBodySections text={view.gate.question} />
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
          path directly and the landed stage still receives the work order.
          【变更】2026-09-30 (demo31 问题 5 · 非标准样式): the dialog now renders
          in the SAME shape as the standard §22 gate cards — segmented
          【状态变化】/【确认后】 body, 「确认推进 · 进入X」 primary option — so
          the workflow page has ONE decision-card style, not a bespoke one.
          【变更】2026-10-27 (批次三十二 · 用户问题 2): a PAUSED change shows NO
          advance confirmation — the flow is on the brake, so no surface may ask
          the customer to move it on until 「继续」 is pressed. */}
      {changeActive
        && view.current !== 'drift'
        && view.advance?.ready === true
        && view.gate === undefined
        && view.pendingGate === undefined
        && liveGateView === null
        // 【变更】2026-10-28 (批次三十五 · 用户问题 2): a DECLINED advance shows
        // no re-prompt — the customer said 暂不推进 (this tab or the
        // conversation tab), so the graph's 「推进」 button is the way forward
        // and this dialog stays down until that click re-raises it.
        && view.advanceDeclined !== true
        // 【变更】2026-10-27 (批次三十一): an out-of-sync change does NOT advance.
        // The documents disagree; the customer must sync them first, and the
        // workflow waits at this rest point instead of popping a confirmation
        // that would move past the disagreement.
        && driftRows.length === 0
        && !paused
        && advanceKey !== null
        && advanceDismissed !== advanceKey && (
        <section className={clsx(css.card, css.cardGate)} aria-label={t('action.advance')} data-advance-dialog="">
          <div className={css.cardTitle}>
            {/* 【变更】2026-10-20 (批次五 2.5): the title states BOTH ends —
                「{from}已完成 · 请确认进入{to}」 — the same grammar the gate
                registry titles now use. */}
            {nextEdge !== null
              ? fillTemplate(t('advanceDialog.title'), {
                from: t(`node.${view.current}`),
                to: t(`node.${nextEdge.to}`),
              })
              : fillTemplate(t('advanceDialog.title'), {
                from: t(`node.${view.current}`),
                to: '',
              })}
          </div>
          {fillTemplate(t('advanceDialog.body'), {
            from: t(`node.${view.current}`),
            to: nextEdge !== null ? t(`node.${nextEdge.to}`) : '',
          }).split('\n\n').map((part, pi) => (
            // 【…】 headers render as section titles, the rest as hint copy —
            // the same visual grammar the standard gate cards use.
            part.startsWith('【') && part.endsWith('】') && !part.includes('\n')
              ? <div key={`adv-sec-${pi}`} className={css.gateSectionTitle}>{part}</div>
              : <p key={`adv-p-${pi}`} className={css.hint}>{part}</p>
          ))}
          {/* 【变更】2026-10-07 (九点批 问题 2): 确认后派单 preview — the tier·model
              the confirm's work order will run on (Auto sessions only). */}
          <RouteDispatchLine
            load={routePreview}
            changeId={view.changeId}
            node={dispatchNodeForConfirm(view)}
            t={t}
          />
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
              {nextEdge !== null
                ? fillTemplate(t('advanceDialog.confirm'), { to: t(`node.${nextEdge.to}`) })
                : t('action.advance')}
            </button>
            <button
              type="button"
              className={clsx(css.btn, css.btnGhost)}
              disabled={busy}
              onClick={() => {
                setAdvanceDismissed(advanceKey)
                // 【变更】2026-10-28 (批次三十五 · 用户问题 2): the dismissal is
                // recorded HOST-side too — the turn-end pops stand down on
                // both tabs, and the graph's 「推进」 button re-raises the
                // deferred confirmation when the customer is ready.
                const changeId = view.changeId
                if (changeId !== null) void advanceDismiss(changeId).catch(() => undefined)
              }}
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
        <aside className={css.leftRail} aria-label={t('rail.sideRail')}>
          <div className={css.leftRailScroll}>
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
                  {/* 【变更】2026-10-30 (用户问题 8b): the 影响范围 sits between
                      确认状态 and 摘要, and it reads the FILES the change has
                      touched (allowlist ∪ touched): 待确定 while nothing is
                      touched, 模块内 when every file is under one directory,
                      跨模块 when the files reach several directories. The hover
                      lists every file. */}
                  <span className={css.metaKey}>{t('intake.scope')}</span>
                  <span
                    className={css.scopeValue}
                    title={scopeFiles.length === 0
                      ? t('intake.scopePending')
                      : `${scopeFiles.length} ${t('intake.scopeFiles')}:\n${scopeFiles.join('\n')}`}
                  >
                    {scopeLabel}
                    {scopeFiles.length > 0 && (
                      <span className={css.scopeFiles}> · {scopeFiles.length}</span>
                    )}
                  </span>
                  {/* 【变更】2026-09-24 (demo6 问题 3): the summary rides the same
                      key/value row style as 模式/类型 — it was a loose hint
                      paragraph while every other field was a labeled row. */}
                  <span className={css.metaKey}>{t('intake.summary')}</span>
                  <span className={css.summaryText}>{view.intake.summary}</span>
                </div>
                {/* 【变更】2026-10-30 (用户问题 1): the 置信度 说明段落 is gone —
                    the customer asked for it to be deleted: the number speaks for
                    itself on the card, and the hover title (intake.confidenceHelp)
                    still explains it on demand. */}
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
              /* 【变更】2026-10-27 (批次三十一): the rail's documents carry their
                 drift tag — 已修改 / 待同步 / 已同步 — so the customer sees which
                 document the upstream edit touched and which one is stale. */
              <ArtifactRail
                rows={view.artifacts}
                driftTags={driftTags}
                disabled={busy}
                onOpen={openArtifact}
                t={t}
              />
            )}

            {(sessionStats !== undefined || tokenUsage !== undefined) && (
              <SessionStatsCard stats={sessionStats} usage={tokenUsage} t={t} />
            )}

          </div>
        </aside>

        <div className={css.main}>
          {view.lanes !== undefined && <LanePanel lanes={view.lanes} t={t} />}
          {/* 【变更】2026-10-27 (批次三十): the STALE-artifact notice. An upstream
              document was edited AFTER a downstream one was written, so the
              downstream one may no longer match it. The banner names the pair
              and the 「同步」button sends the order that re-authors them.
              【变更】2026-10-27 (批次三十一): the notice is the ONLY home of the
              「同步」action — it exists exactly while something is out of sync,
              and the button reads 「同步中」while the order is on its way. The
              box itself is rebuilt: one neutral surface with a single warn
              accent (a rule, an icon and the title) instead of a saturated
              amber slab that fought the page's gold accent. */}
          {(driftRows.length > 0 || lifecycleDrift.length > 0) && (
            <div className={css.driftBanner} data-testid="flow-drift-banner">
              <span className={css.driftBannerIcon} aria-hidden>
                {/* 【变更】2026-10-28 (批次三十四 · 用户问题 4): the syncing state
                    LIVES in this card — the card changes its state (正在同步 →
                    产物不同步) instead of a second notice appearing under it. */}
                {syncing || (syncStarted && driftRows.length > 0)
                  ? <span className={css.flowNoticeSpinner} />
                  : (
                    <svg viewBox="0 0 16 16" focusable="false">
                      <path d="M8 2.2 14.4 13H1.6L8 2.2Z" />
                      <path d="M8 6.4v3.1" />
                      <path d="M8 11.4v.1" />
                    </svg>
                  )}
              </span>
              <div className={css.driftBannerText}>
                <span className={css.driftBannerTitle}>
                  {syncing || (syncStarted && driftRows.length > 0)
                    ? t('flow.syncRunningTitle')
                    : t('flow.driftTitle')}
                </span>
                <span className={css.driftBannerBody}>
                  {syncing || (syncStarted && driftRows.length > 0)
                    ? t('flow.syncRunning')
                    : driftRows.length > 0
                      ? driftRows.map(row => t('flow.driftBody', {
                        upstream: row.sourceFile,
                        stale: row.file,
                      })).join('；')
                      // 【变更】2026-10-29 (批次三十七 · 用户问题 6): the
                      // lifecycle's own signal — a 已完成 document was edited
                      // (已更新) and the documents after it are 待更新.
                      : t('flow.lifecycleDriftBody', {
                        updated: lifecycleDrift.map(row => row.file).join('、'),
                      })}
                </span>
              </div>
              {/* 【变更】2026-10-27 (批次三十一): the workflow holds here — it
                  neither advances nor pops a confirmation gate until the
                  documents agree again. The notice says so, so the hold never
                  reads as a hang.
                  【变更】2026-10-28 (批次三十四 · 用户问题 4): the hold line is
                  hidden while the sync is on its way — the card's state already
                  says the work is in flight. */}
              {(!(syncing || (syncStarted && driftRows.length > 0))) && (
                <span className={css.driftBannerHold} data-testid="flow-drift-hold">
                  {/* 【变更】2026-10-28 (批次三十五 · 用户问题 1): while a model
                      turn is running the hold line says WHY the 「同步」button
                      is disabled — wait for the turn to end, or stop it. */}
                  {sessionRunning ? t('flow.driftHoldRunning') : t('flow.driftHold')}
                </span>
              )}
              <button
                type="button"
                className={clsx(css.toolBtn, css.toolBtnWarn)}
                data-testid="flow-drift-sync"
                title={t('flow.syncHelp')}
                disabled={syncing || sessionRunning || view.changeId === null}
                onClick={() => {
                  const changeId = view.changeId
                  if (changeId !== null) void syncDrift(changeId)
                }}
              >
                {/* 【变更】2026-10-28 (批次三十三 · 用户问题 2): the button
                    reads 「同步中」 for as long as the sync is on its way — the
                    dispatch AND the model's rewrite, which the stale documents
                    still on disk report. */}
                {syncing || (syncStarted && driftRows.length > 0) ? t('flow.syncSyncing') : t('flow.sync')}
              </button>
            </div>
          )}
          {syncFailure !== null && (
            <FlowNotice notice={syncFailure} testId="flow-sync-notice" />
          )}
          {pauseNotice !== null && (
            <FlowNotice notice={pauseNotice} testId="flow-pause-notice" />
          )}
          {/* 【变更】2026-09-23 (demo5 issue #5): the flow canvas is its own
              component (pan/zoom/canvas math live inside) so the history
              modal re-renders the SAME graph for any change without touching
              the main view's state. */}
          <FlowCanvas
            view={view}
            selected={selected}
            onActivate={onCardActivate}
            onOpenArtifact={openArtifact}
            onOpenTestFlow={(stage) => { openView('baf-test-flow', `stage:${stage}`) }}
            controls={{
              paused: view.paused === true,
              onTogglePause: () => {
                const changeId = view.changeId
                if (changeId !== null) void togglePause(changeId, view.paused !== true)
              },
              pauseDisabled: pausing,
              // 【变更】2026-10-27 (批次三十一): the 「推进」button moved from the
              // page header into this toolbar (left of 「暂停」/「继续」). It
              // re-arms the advance confirmation, so an out-of-sync change
              // offers nothing to advance into.
              // 【变更】2026-10-27 (批次三十二 · 用户问题 2): a PAUSED change
              // offers nothing to advance into either — the button is gone
              // until 「继续」 releases the brake.
              // 【变更】2026-10-28 (批次三十五 · 用户问题 2/9): after a 暂不推进
              // (either tab) this button is the WAY FORWARD — one click drives
              // the same /baf-go the typed command would, and the deferred
              // confirmation pops in BOTH tabs.
              advanceReady: view.advance?.ready === true && driftRows.length === 0 && !paused,
              // 【变更】2026-10-30 (用户问题 3.5): while the model is RUNNING the
              // 推进 button is GONE — the workflow is mid-turn, so there is
              // nothing to confirm, and a click could only collide with the
              // turn that is already running.
              advanceHidden: sessionRunning,
              onAdvance: advanceFromToolbar,
            }}
            driftNodes={driftNodes}
            t={t}
          />

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
          {/* 【变更】2026-10-24 (批次十九 1.2): the rail's STAGE HEADER — the
              stage name in big type at the very top of the column, so 「现在在
              哪个阶段」 reads before any card. The stage is the SELECTED node
              (the cards below describe it); with nothing selected the change's
              current stage stands in.
              【变更】2026-10-27 (批次三十二 · 用户问题 5): the header became the
              stage's NAME CARD — the name plus the stage's own figures (状态 /
              耗时 / Tokens / 下一跳 / 条件), which used to sit in the 阶段详情
              one screen lower. The 「阶段」label and the purpose blurb are
              gone: the card's title IS the stage name, and the purpose repeats
              the 目标 section below. */}
          <div className={css.railStageHead} data-testid="rail-stage-head">
            <StageSummaryCard
              name={railStageName}
              node={railStageNode}
              liveDurationMs={railStageNode?.id === view.current ? liveStageMs : undefined}
              nextEdge={nextEdge}
              t={t}
            />
          </div>
          <div className={css.railScroll}>
            {/* 【变更】2026-10-24 (批次十九 1.1): the intake / artifacts / stats
                cards moved to the FIXED LEFT column (css.leftRail); the rail
                keeps only the stage-scoped cards below. */}
            {selectedNode !== null && (
              <section className={clsx(css.card, css.cardChecklist)} aria-label={t('detail.checklist')}>
                {/* 【变更】2026-10-27 (批次三十二 · 用户问题 5): the stage name
                    next to 本阶段清单 is gone — the name card above already
                    names the stage, and the duplicate chip read as a second
                    heading for the same card. */}
                <h3 className={css.cardTitle}>
                  {t('detail.checklist')}
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
                <BilingualDetail node={selectedNode as NonNullable<typeof selectedNode>} t={t} />
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
          onOpenTestFlow={(stage) => { openView('baf-test-flow', `stage:${stage}`) }}
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
  /**
   * 【变更】2026-10-22 (批次十三 1): the 测试流图 jump chips — the modal is
   * read-only for WORKFLOW transitions, but a Tab jump is navigation, not a
   * transition; the handler closes the modal first so the landing tab shows.
   */
  onOpenTestFlow: (stage: TestFlowStepId) => void
  /** 【变更】2026-09-25 (用户需求 工作流 6): the driving session's statistics. */
  stats?: SessionStatsProjection | undefined
  usage?: TokenUsageProjection | undefined
  t: (key: WorkflowTabKey) => string
}): React.ReactElement {
  const { pick, onClose, onReload, onOpenArtifact, onOpenTestFlow, stats, usage, t } = props
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
                onOpenArtifact={onOpenArtifact}
                onOpenTestFlow={(stage) => {
                  onClose()
                  onOpenTestFlow(stage)
                }}
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
          {/* 【变更】2026-10-27 (批次三十二 · 用户问题 9): the section heads
              (概览 / 工具 / TOKENS) carry their own class — the checklist's
              quiet head was too small to read as a heading. */}
          <div className={css.statsSectionHead}>{t('stats.section.overview')}</div>
          <div className={css.statsGrid}>
            <span className={css.statsKey}>{t('stats.turns')}</span>
            <span className={css.statsNum}>{stats.turns}</span>
            <span className={css.statsKey}>{t('stats.steps')}</span>
            <span className={css.statsNum}>{stats.steps}</span>
            <span className={css.statsKey}>{t('stats.llmTime')}</span>
            <span className={css.statsNum}>{formatDuration(stats.llmMs)}</span>
          </div>
          <div className={css.statsSectionHead}>{t('stats.section.tools')}</div>
          <div className={css.statsGrid}>
            <span className={css.statsKey}>{t('stats.toolCalls')}</span>
            <span className={css.statsNum}>{stats.toolCalls}</span>
            <span className={css.statsKey}>{t('stats.toolTime')}</span>
            <span className={css.statsNum}>{formatDuration(stats.toolMs)}</span>
          </div>
        </>
      )}
      <div className={css.statsSectionHead}>{t('stats.section.tokens')}</div>
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

/**
 * 【变更】2026-10-20 (批次五 2.3): CONDITION_ZH moved to graph-template.ts
 * (shared with the 确认门 GatesFlow 门禁明细) — import it from there.
 */

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
