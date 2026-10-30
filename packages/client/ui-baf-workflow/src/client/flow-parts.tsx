/**
 * 【变更】2026-10-24 (批次二十 3): the READ-ONLY parts of the session
 * workflow graph, extracted so the 变更总览's per-change detail page can show
 * the SAME graph and the SAME stage detail as the session tab.
 *
 * Why this file exists: the customer asked the change-detail page to show the
 * complete workflow graph, identical to the session's 工作流图, with details
 * on top / left / right. The session's canvas and rail cards lived inside the
 * 2900-line `WorkflowView.tsx`, so the detail page could not reuse them
 * without either (a) duplicating a 350-line pan/zoom canvas — two graphs that
 * drift apart on the next change — or (b) importing `WorkflowView.tsx` from
 * `ChangeOverviewRow.tsx`, which would create an import cycle (WorkflowView
 * imports the canvas, the canvas's module imports WorkflowView).
 *
 * So the pieces both surfaces need live here, and BOTH import them:
 * - `WorkflowView.tsx` (the session tab) — unchanged behaviour, new import.
 * - `ChangeOverviewRow.tsx` (the 变更总览 detail page) — the same graph, the
 *   same stage checklist, the same stage detail, the same artifact rail.
 *
 * The design contract with the session tab: the graph, the node cards, the
 * status colours and the detail copy are ONE system. A change that looks
 * different in the ledger than in the conversation is a bug, not a variant.
 */
import clsx from 'clsx'
import type { ReactElement } from 'react'
import type { TestFlowStepId, WorkflowNodeId, WorkflowTabNodeView } from './tab-types.ts'
import type { WorkflowTabKey } from './locales.ts'
import { CATALOG_ZH } from './catalog-i18n.ts'
import { CONDITION_ZH } from './graph-template.ts'
import { formatDuration, formatTokens } from './dashboard-format.ts'
import css from './WorkflowView.module.css'

/* ── canvas geometry (the session graph's grid) ──────────────────────────── */

/** Column pitch of the node grid. */
export const COL_W = 248
/** Row pitch of the node grid. */
export const ROW_H = 128
/** Node card width. */
export const NODE_W = 208
/** Node card height. */
export const NODE_H = 96
/** Smallest zoom the canvas allows. */
export const ZOOM_MIN = 0.55
/** Largest zoom the canvas allows. */
export const ZOOM_MAX = 1.8

/** Clamp a number into [min, max] — wheel-pan bounds. */
export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/* ── the stage names' English half ─────────────────────────────────────────── */

/**
 * 【变更】2026-10-28 (批次三十五 · 用户问题 1/2): the stage names' ENGLISH
 * half — a plain TS constant, exactly like the 确认门配置流程图's `NODE_EN`
 * (an English name is a NAME, not a translatable sentence: the zh label
 * comes from the `node.*` locale keys and the English rides INLINE after it
 * on ONE name line — 中文在前，英文在后).
 *
 * The zh label stays locale-owned; only this constant carries the English.
 */
export const NODE_EN: Readonly<Record<string, string>> = {
  intake: 'Intake',
  open: 'Open change',
  clarify: 'Clarify',
  design: 'Design',
  plan: 'Plan',
  implement: 'Implement',
  verify: 'Verify',
  archive: 'Archive',
  drift: 'Drift',
  completed: 'Completed',
  abandoned: 'Abandoned',
}

/**
 * 【变更】2026-10-28 (批次三十五 · 用户问题 1/2): the stage's BILINGUAL name —
 * the zh label with the English name riding inline after it, on one name
 * line (the 确认门配置流程图's `.nodeName` / `.nodeNameEn` anatomy).
 *
 * The surface owns the two classes (the graph card's and the rail card's
 * names are styled differently); this component owns the ORDER and the
 * one-line promise.
 * @param props - the stage id, the locale binder and the two class names.
 * @returns the name element tree.
 */
export function StageName(props: {
  /** The stage's node id (the `node.*` locale key's suffix). */
  id: string
  /** The locale binder. */
  t: (key: WorkflowTabKey) => string
  /** The class of the whole name line. */
  className?: string | undefined
  /** The class of the English half. */
  enClassName?: string | undefined
  /** The test id of the name line. */
  testid?: string | undefined
}): ReactElement {
  const { id, t, className, enClassName, testid } = props
  const en = NODE_EN[id]
  return (
    <span className={className} data-testid={testid}>
      {t(`node.${id}` as WorkflowTabKey)}
      {en !== undefined && <span className={enClassName}>{en}</span>}
    </span>
  )
}

/* ── the 测试流图 jump chips ─────────────────────────────────────────────── */

/**
 * The stages that carry a 测试流图 shortcut. The link is gated host-side by
 * the required `test-flow` check, so it sits exactly where the 测试流 becomes
 * the gatekeeper — and it is NOT forced into the model's dispatch loop.
 */
export const TEST_FLOW_JUMPS: Partial<Record<WorkflowNodeId, TestFlowStepId>> = {
  verify: 'test',
}

/** The jump chip's 测试流图 stage label key (reuses the 测试流图's node catalog). */
export const TEST_FLOW_JUMP_LABEL: Record<TestFlowStepId, WorkflowTabKey> = {
  build: 'tflow.node.build',
  test: 'tflow.node.test',
  instrument: 'tflow.node.instrument',
  report: 'tflow.node.report',
  gate: 'tflow.node.gate',
  lint: 'tflow.node.lint',
  analyze: 'tflow.node.analyze',
  format: 'tflow.node.format',
}

/* ── stage figures ───────────────────────────────────────────────────────── */

/**
 * Whether a node status means the flow actually EXECUTED that stage — an
 * executed stage shows its real figures and 0 / 0s when nothing was
 * attributed (a completed stage must never read —); only stages the flow
 * never reached (locked / skipped / template / idle) keep the — blank.
 */
export function stageExecuted(status: WorkflowTabNodeView['status'] | undefined): boolean {
  return status === 'completed' || status === 'in-progress' || status === 'failed'
    || status === 'blocked' || status === 'drifted'
}

/** Stage-aware duration: executed → real value or 0s; never-executed → —. */
export function stageDuration(status: WorkflowTabNodeView['status'] | undefined, ms: number | undefined): string {
  if (ms !== undefined) return formatDuration(ms)
  return stageExecuted(status) ? '0s' : '—'
}

/** Stage-aware tokens: executed → real value or 0K; never-executed → —. */
export function stageTokens(
  status: WorkflowTabNodeView['status'] | undefined,
  input: number | undefined,
  output: number | undefined,
): string {
  if (input !== undefined || output !== undefined) return formatTokens(input, output)
  return stageExecuted(status) ? formatTokens(0, 0) : '—'
}

/** The status badge class for one node status. */
export function statusClass(status: WorkflowTabNodeView['status']): string {
  switch (status) {
    case 'completed': return css.statusCompleted ?? ''
    case 'in-progress': return css.statusInProgress ?? ''
    case 'failed':
    case 'blocked': return css.statusFailed ?? ''
    case 'drifted': return css.statusDrifted ?? ''
    // 已忽略 is gray EVERYWHERE — only 漂移 itself keeps the amber.
    case 'skipped': return css.statusIdle ?? ''
    // 已裁剪 (bug-fix 裁剪掉的 full-go 节点) is gray like 已忽略.
    case 'clipped': return css.statusIdle ?? ''
    default: return css.statusIdle ?? ''
  }
}

/** Trim a recorded artifact path down to its file name for display. */
export function artifactName(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

/**
 * 【变更】2026-10-28 (批次三十四 · 用户问题 6): the workspace-relative form of
 * an artifact path.
 *
 * The graph's chips carry the ABSOLUTE paths the stage events recorded, and
 * the workspace reader accepts workspace-relative paths only — the document
 * preview answered 「仅支持工作区相对路径」 for every artifact. A path inside
 * the workspace becomes relative; anything else is left alone (the reader
 * refuses it with its own message).
 * @param cwd - absolute workspace root.
 * @param path - the artifact path.
 * @returns the workspace-relative path, or the input when it is not inside.
 */
export function workspaceRelativePath(cwd: string, path: string): string {
  const root = cwd.replace(/[\\/]+$/, '').replace(/\\/g, '/')
  const candidate = path.replace(/\\/g, '/')
  const prefix = `${root.toLowerCase()}/`
  if (!candidate.toLowerCase().startsWith(prefix)) return path
  return candidate.slice(root.length + 1)
}

/**
 * 【变更】2026-10-27 (批次三十一): the flow graph's operating controls.
 *
 * The graph's top-right corner carries the buttons that OPERATE the flow. A
 * surface that cannot operate the change (the 变更总览 detail page has no
 * session behind it) passes no controls — a button that cannot work is worse
 * than an absent one.
 *
 * 【变更】2026-10-27 (批次三十一): the change's identity TAG left the toolbar
 * (the customer asked for it to go), and the 「同步」button moved OUT of it —
 * the sync action belongs to the out-of-sync notice, and only exists while
 * something is actually out of sync. The 「推进」button arrived instead: it is
 * the workflow's advance action and sits LEFT of 「暂停」/「继续」.
 */
export interface WorkflowFlowControls {
  /** Whether the workflow is currently paused. */
  readonly paused: boolean
  /** Pause the workflow / continue it. */
  readonly onTogglePause: () => void
  /** Whether the pause request is in flight — the button waits for its answer. */
  readonly pauseDisabled?: boolean
  /**
   * Whether the change rests at a point that can advance. The 「推进」button is
   * rendered only while this is true, so the toolbar never carries an advance
   * the host would refuse.
   */
  readonly advanceReady?: boolean
  /**
   * 【变更】2026-10-28 (批次三十五 · 用户问题 9): drive the SAME `/baf-go` a typed
   * command would — ask channel and all — so the registered confirmation pops
   * as this tab's live-gate dialog AND the conversation tab's modal at once.
   * A deferred 暂不推进 is re-raised by this click. Absent on a surface that
   * cannot advance.
   */
  readonly onAdvance?: () => void
  /**
   * 【变更】2026-10-30 (用户问题 3.5): whether the 推进 button must be HIDDEN
   * altogether.
   *
   * The button is otherwise always in place (a disabled button says what is
   * missing; an absent one reads as a missing button). The one exception the
   * customer asked for: while the model is RUNNING, the advance must not be
   * offered at all — the workflow is mid-turn, so there is nothing to confirm
   * and a click would collide with the turn.
   */
  readonly advanceHidden?: boolean
}

/**
 * Whether a catalog action is treated as done for checkbox display.
 * 'clipped' joins — a 裁剪 node's whole action list is moot.
 * @param status - node status.
 * @returns true when the stage is finished.
 */
export function stageActionsDone(status: WorkflowTabNodeView['status'] | undefined): boolean {
  return status === 'completed' || status === 'skipped' || status === 'clipped'
}

/* ── the rail cards ──────────────────────────────────────────────────────── */

/**
 * 【变更】2026-10-27 (批次三十一): one document's drift tag.
 *
 * - `modified` — the upstream document the customer (or the model) edited after
 *   a downstream one was written.
 * - `pending` — the downstream document that edit made stale; it must be
 *   rewritten before the workflow moves on.
 * - `synced` — the document the sync order is rewriting right now.
 */
export type ArtifactDriftTag = 'modified' | 'pending' | 'synced'

/**
 * 【变更】2026-10-27 (批次三十一): the drift tags for one change's documents.
 *
 * The upstream document that was edited is 已修改; the downstream document that
 * edit made stale is 待同步 — or 已同步 while the sync order is rewriting it.
 * A file that appears in both roles (an upstream document of one row and a
 * stale downstream document of another) keeps the stale role: that is the one
 * the customer must act on.
 * @param rows - the change's stale documents.
 * @param syncing - whether a sync order is on its way.
 * @returns the tag per file name.
 */
export function artifactDriftTags(
  rows: readonly { readonly file: string; readonly sourceFile: string }[],
  syncing: boolean,
): Record<string, ArtifactDriftTag> {
  const tags: Record<string, ArtifactDriftTag> = {}
  for (const row of rows) tags[row.sourceFile] = 'modified'
  for (const row of rows) tags[row.file] = syncing ? 'synced' : 'pending'
  return tags
}

/**
 * 【变更】2026-10-29 (批次三十七 · 用户问题 6): the document states the rail
 * renders — the six-state lifecycle plus the two middle states the task
 * ledger and the checklist carry.
 */
export type ArtifactRailState =
  | 'missing'
  | 'template'
  | 'planned'
  | 'filled'
  | 'completed'
  | 'updated'
  | 'stale'
  | 'clipped'

/**
 * 【变更】2026-10-27 (批次三十一): the artifact rail.
 *
 * `onOpen` is OPTIONAL: the session tab opens an artifact in the sidebar, the
 * 变更总览 detail page has no session behind it and therefore no sidebar to
 * open into — there the row is a static chip (the file name and its state are
 * still read; only the click is absent). A row that has no file to open
 * (missing / clipped) never offered a click in the first place.
 *
 * `driftTags` maps a file NAME to its drift tag. The rail reads it as a second
 * chip next to the document's state, so the customer sees which document was
 * edited, which one is stale, and which one the sync order is rewriting —
 * without leaving the workflow graph.
 */
export function ArtifactRail(props: {
  rows: readonly {
    readonly file: string
    readonly path: string
    readonly state: ArtifactRailState
    readonly missing: readonly string[]
  }[]
  /**
   * 【变更】2026-10-27 (批次三十一): the per-document drift tag, keyed by file
   * name. Absent (or empty) when nothing is out of sync.
   */
  driftTags?: Readonly<Record<string, ArtifactDriftTag>>
  disabled?: boolean
  onOpen?: (path: string) => void
  t: (key: WorkflowTabKey) => string
}): ReactElement {
  const { rows, driftTags, disabled = false, onOpen, t } = props
  const stateLabel = (state: ArtifactRailState): string =>
    t(`artifact.state.${state}`)
  const stateClass = (state: ArtifactRailState): string =>
    // 【变更】2026-10-29 (批次三十七 · 用户问题 6): the six-state lifecycle
    // reads as one ladder — 未生成（灰）→ 未填写（黄）→ 已填写（蓝）→
    // 已完成（绿）, with 已更新（橙）and 待更新（红）for the documents that
    // drifted out of that ladder.
    state === 'completed' ? css.artifactStateCompleted ?? ''
      : state === 'updated' ? css.artifactStateUpdated ?? ''
        : state === 'stale' ? css.artifactStateStale ?? ''
          : state === 'filled' ? css.artifactStateFilled ?? ''
            : state === 'planned' ? css.artifactStatePlanned ?? css.artifactStateTemplate ?? ''
              : state === 'template' || state === 'clipped' ? css.artifactStateTemplate ?? ''
                : css.artifactStateMissing ?? ''
  // 【变更】2026-10-27 (批次三十一): the drift tag's own label + tone. The three
  // tags read as one sequence — 已修改 → 待同步 → 已同步 — so they share one
  // chip shape and differ only in hue.
  const driftLabel = (tag: ArtifactDriftTag): string => t(`artifact.drift.${tag}`)
  const driftClass = (tag: ArtifactDriftTag): string =>
    tag === 'pending' ? css.artifactDriftPending ?? ''
      : tag === 'synced' ? css.artifactDriftSynced ?? ''
        : css.artifactDriftModified ?? ''
  // Each row names the stage that produces it — 「设计 design.md」「验证 verify.md」—
  // so the rail reads as the stage→document map it is.
  const stageOf = (file: string): string => {
    if (file === 'proposal.md') return t('node.open')
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
        // clipped rows (bug-fix 裁剪的 full-go 产物) render dimmed with no open
        // button — the file is never produced on this mode, so there is
        // nothing to open.
        const blocked = row.state === 'missing' || row.state === 'clipped'
        const stage = stageOf(row.file)
        const label = stage === '' ? row.file : `${stage} · ${row.file}`
        // 【变更】2026-10-27 (批次三十一): the drift tag rides the document NAME,
        // so the customer reads 「design.md 待同步」 as one fact.
        const drift = driftTags?.[row.file]
        return (
          <div key={row.path}>
            <div className={css.artifactRow}>
              {onOpen === undefined ? (
                <span className={css.artifactNameStatic} title={row.path}>{label}</span>
              ) : (
                <button
                  type="button"
                  className={clsx(css.artifactNameBtn)}
                  disabled={disabled || blocked}
                  title={blocked ? t('artifact.missing') : row.path}
                  onClick={() => { onOpen(row.path) }}
                >
                  {label}
                </button>
              )}
              {/* 【变更】2026-10-29 (批次三十六 · 用户问题 5): the drift tag and
                  the state chip ride ONE right-aligned group — both read at the
                  row's right edge, in the order 「已修改 / 待同步」 then the
                  state. Before, only the state chip was pushed right, so the
                  drift tag floated in the middle of the row. */}
              <span className={css.artifactTrailing}>
                {drift !== undefined && (
                  <span
                    className={clsx(css.artifactDriftTag, driftClass(drift))}
                    data-testid={`artifact-drift-tag-${row.file}`}
                  >
                    {driftLabel(drift)}
                  </span>
                )}
                <span className={clsx(css.artifactState, stateClass(row.state))}>
                  {stateLabel(row.state)}
                </span>
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

/**
 * The stage's checklist — the actions still to do and the ones already done.
 * The session rail and the 变更总览 detail rail read the same list.
 */
export function StageChecklist(props: {
  node: WorkflowTabNodeView
  t: (key: WorkflowTabKey) => string
}): ReactElement {
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
 * 【变更】2026-10-27 (批次三十二 · 用户问题 5): the stage's NAME card — the
 * stage name in big type plus the five figures that say where the stage
 * stands (状态 / 耗时 / Tokens / 下一跳 / 条件).
 *
 * These five used to ride the 阶段详情 card's meta row, BELOW the checklist, so
 * the customer had to scroll the rail to learn which stage they were looking
 * at. They now ride the name card at the top of the rail; the 阶段详情 keeps
 * only the catalog copy (目标 / 前置条件 / 产物 / 完成).
 *
 * The workflow rail and the 变更总览 detail page both render it, so the two
 * surfaces answer 「我现在在哪个阶段、它到哪了、下一步是什么」 the same way.
 * @param props - the card props.
 * @returns the card element tree.
 */
export function StageSummaryCard(props: {
  /** The stage name — the selected stage, or the change's current stage. */
  name: string
  /**
   * 【变更】2026-10-28 (批次三十五 · 用户问题 1): the stage name's ENGLISH half
   * — it rides INLINE after the zh name on the same line (中文在前，英文在后),
   * the 确认门配置流程图's anatomy. Absent → the stage's OWN English name is
   * taken from `node.id`; a terminal card (no node) names it explicitly.
   */
  nameEn?: string | undefined
  /** The stage's node view; absent for a terminal card (no stage figures). */
  node?: WorkflowTabNodeView | undefined
  /**
   * 【变更】2026-10-30 (用户问题 6): the RUNNING stage's live elapsed time —
   * the per-second value the shared `useLiveDurationMs` hook paints. The
   * caller passes it only for the stage that is actually running, so a
   * finished stage keeps its frozen host value.
   */
  liveDurationMs?: number | undefined
  /** The forward edge leaving this stage — the next hop and its condition. */
  nextEdge?: { id: string; to: string; condition: string } | null
  t: (key: WorkflowTabKey) => string
}): ReactElement {
  const { name, nameEn, node, nextEdge, t } = props
  // 【变更】2026-10-30 (用户问题 6): the RUNNING stage paints the per-second
  // value; every other stage keeps its frozen host figure.
  const stageMs = props.liveDurationMs ?? node?.metrics?.durationMs
  // 【变更】2026-10-28 (批次三十五 · 用户问题 1): the stage's English name —
  // the caller's own, or the stage's own (a node's id names it). The rail
  // card and the graph card then say the SAME thing in the SAME two halves.
  const englishName = nameEn ?? (node === undefined ? undefined : NODE_EN[node.id])
  const status = node === undefined ? undefined : t(`status.${node.status}`)
  const duration = node === undefined ? undefined : stageDuration(node.status, stageMs)
  const tokens = node === undefined
    ? undefined
    : stageTokens(node.status, node.metrics?.inputTokens, node.metrics?.outputTokens)
  const next = nextEdge === undefined || nextEdge === null
    ? undefined
    : t(`node.${nextEdge.to}` as WorkflowTabKey)
  const condition = nextEdge === undefined || nextEdge === null
    ? undefined
    : (CONDITION_ZH[nextEdge.id] ?? nextEdge.condition)
  return (
    <section className={clsx(css.card, css.cardAccent, css.stageSummaryCard)} aria-label={name}>
      <h3 className={css.stageSummaryName} data-testid="stage-summary-name">
        {name}
        {englishName !== undefined && <span className={css.nodeNameEn}>{englishName}</span>}
      </h3>
      <div className={css.metaRow}>
        {status !== undefined && (
          <>
            <span className={css.metaKey}>{t('detail.status')}</span>
            <span>{status}</span>
          </>
        )}
        {duration !== undefined && (
          <>
            <span className={css.metaKey}>{t('card.duration')}</span>
            <span>{duration}</span>
          </>
        )}
        {tokens !== undefined && (
          <>
            <span className={css.metaKey}>{t('card.tokens')}</span>
            <span title={t('metrics.pending')}>{tokens}</span>
          </>
        )}
        {next !== undefined && (
          <>
            <span className={css.metaKey}>{t('card.next')}</span>
            <span>{next}</span>
          </>
        )}
        {condition !== undefined && (
          <>
            <span className={css.metaKey}>{t('card.condition')}</span>
            <span>{condition}</span>
          </>
        )}
      </div>
    </section>
  )
}

/**
 * The stage's detail — the four catalog sections (purpose / prerequisites /
 * artifacts / completion).
 *
 * 【变更】2026-10-24 (批次二十 3): the anomaly block renders ONLY when this
 * stage actually sits failed/blocked; a healthy stage shows nothing there.
 * 【变更】2026-10-27 (批次三十二 · 用户问题 5): the meta row (状态 / 耗时 /
 * Tokens / 下一跳 / 条件) moved to the {@link StageSummaryCard} above it — the
 * rail's top names the stage and says where it stands.
 */
export function BilingualDetail(props: {
  node: WorkflowTabNodeView
  t: (key: WorkflowTabKey) => string
}): ReactElement {
  const { node, t } = props
  const zh = CATALOG_ZH[node.id]
  const failed = node.status === 'failed' || node.status === 'blocked'
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
