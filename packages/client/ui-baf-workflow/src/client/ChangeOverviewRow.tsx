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
 *   左侧  a fixed rail: the change classification + the stage artifacts, and
 *         — at its BOTTOM — the change's full event history (【变更】
 *         2026-10-28 (批次三十五 · 用户问题 1): the history moved DOWN from
 *         the right rail to the bottom-left band; it is the change's story and
 *         it reads under the change's own identity and documents)
 *   中间  the COMPLETE workflow graph — the session tab's own `FlowCanvas`,
 *         the same component, the same nodes, the same edges, the same status
 *         colours (a change that looks different in the ledger than in the
 *         conversation is a bug, not a variant)
 *   右侧  a rail: the stage head, the stage checklist and the stage detail
 *
 * 【变更】2026-10-28 (批次三十五 · 用户问题 1/2): the stage NAMES are
 * bilingual — 中文在前，英文在后 on ONE line, the 确认门配置流程图's anatomy
 * (the English name is a plain constant, the zh label stays locale-owned).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {
  BafWorkflowChangeDetailResult, BafWorkflowChangeOverviewResult,
  BafWorkflowChangeHistoryEntry, WorkflowDashboardRow, WorkflowNodeId,
  WorkflowTabFileReadResult, WorkflowTabNodeView, WorkflowTabView,
} from './tab-types.ts'
import type { WorkflowTabKey } from './locales.ts'
import {
  IconChevronDownOutlineRegular, Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { formatDuration, formatTimestamp, formatTokens, modeLabel } from './dashboard-format.ts'
import { buildDashboardHtml, type DashboardHtmlChangeDetail, type DashboardHtmlGraph, type DashboardHtmlGraphEdge, type DashboardHtmlGraphNode, type DashboardHtmlLabels } from './dashboard-html.ts'
import { FlowCanvas } from './FlowCanvas.tsx'
import { ArtifactRail, BilingualDetail, StageChecklist, StageSummaryCard, COL_W, NODE_EN, NODE_H, NODE_W, ROW_H, artifactDriftTags, stageExecuted, workspaceRelativePath } from './flow-parts.tsx'
import { conditionTextOf } from './graph-template.ts'
import css from './ChangeOverviewRow.module.css'

/** The inject face the slot registration hands the row. */
export interface ChangeOverviewRowInjected {
  /**
   * 【变更】2026-10-26 (用户问题 2): load the project change overview for one
   * workspace. `cwd` PINS the read to the workspace the user is looking at —
   * the main-view session's — so the ledger switches with the workspace;
   * undefined keeps the host's newest-live-session fallback.
   */
  loadChangeOverview: (cwd?: string) => Promise<BafWorkflowChangeOverviewResult>
  /**
   * 【变更】2026-10-24 (批次十九 1.3): load ONE change's detail (its flow
   * projection + its event history) for the drill-down modal.
   * 【变更】2026-10-26 (用户问题 2): `cwd` — the same main-view workspace pin
   * {@link ChangeOverviewRowInjected.loadChangeOverview} takes.
   */
  loadChangeDetail: (changeId: string, cwd?: string) => Promise<BafWorkflowChangeDetailResult>
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
 * 【变更】2026-10-26 (批次二十八 5): the ledger's category filter — which
 * change states the record list shows.
 */
export type ChangeCategory = 'all' | 'active' | 'completed' | 'abandoned'

/**
 * 【变更】2026-10-26 (批次二十九 5): the ledger's sort DIMENSION — which field
 * the record list is ordered by.
 *
 * The dimension and the DIRECTION are two controls now: the 排序 dropdown
 * names the field (耗时 / 耗token / 开始时间 / 任务完成率) and the 升降序
 * dropdown flips it. Before, the direction was baked into the field id
 * (durationDesc / durationAsc), so 「最短优先」was reachable from the duration
 * field alone and every other field was stuck on one direction.
 */
export type ChangeSortField = 'default' | 'duration' | 'tokens' | 'startedAt' | 'tasks'

/**
 * 【变更】2026-10-26 (批次二十九 5): the sort DIRECTION — 升序 / 降序.
 */
export type ChangeSortOrder = 'asc' | 'desc'

/**
 * 【变更】2026-10-26 (批次二十八 5): the ledger's workflow-mode filter. The
 * ids are the locale keys' own suffix, so the dropdown label and the filter
 * value never drift apart; the wire value each one selects rides
 * {@link CHANGE_MODE_WIRE}.
 */
export type ChangeMode = 'all' | 'fullGoPath' | 'bugFixPath' | 'clarify'

/** 【变更】2026-10-26 (批次二十八 5): the wire mode each filter id selects. */
const CHANGE_MODE_WIRE: Readonly<Record<ChangeMode, string>> = {
  all: '',
  fullGoPath: 'full-go-path',
  bugFixPath: 'bug-fix-path',
  clarify: 'clarify-required',
}

/** 【变更】2026-10-26 (批次二十八 5): the ledger's four view controls. */
export interface ChangeLedgerView {
  readonly category: ChangeCategory
  readonly mode: ChangeMode
  readonly sort: ChangeSortField
  /** 【变更】2026-10-26 (批次二十九 5): the direction the sort field applies. */
  readonly sortOrder: ChangeSortOrder
  readonly query: string
}

/** 【变更】2026-10-26 (批次二十八 5): every category, in display order. */
export const CHANGE_CATEGORIES: readonly ChangeCategory[] = ['all', 'active', 'completed', 'abandoned']

/** 【变更】2026-10-26 (批次二十九 5): every sort dimension, in display order. */
export const CHANGE_SORTS: readonly ChangeSortField[] = ['default', 'duration', 'tokens', 'startedAt', 'tasks']

/** 【变更】2026-10-26 (批次二十九 5): both sort directions, in display order. */
export const CHANGE_SORT_ORDERS: readonly ChangeSortOrder[] = ['desc', 'asc']

/** 【变更】2026-10-26 (批次二十八 5): every workflow mode, in display order. */
export const CHANGE_MODES: readonly ChangeMode[] = ['all', 'fullGoPath', 'bugFixPath', 'clarify']

/**
 * One change's task-completion ratio (0 … 1). A change with no readable plan
 * ledger scores 0 — it has no tasks to complete.
 * @param row - one dashboard row.
 * @returns the ratio.
 */
function taskRatioOf(row: WorkflowDashboardRow): number {
  const total = row.tasks?.total ?? 0
  if (total <= 0) return 0
  return (row.tasks?.done ?? 0) / total
}

/**
 * 【变更】2026-10-26 (批次二十九 5): the comparable value of one row on one
 * sort dimension. Undefined means「this row cannot answer the dimension」— a
 * change with no measured duration, no tokens and no start time.
 * @param row - one dashboard row.
 * @param field - the sort dimension.
 * @returns the value, or undefined when the row has none.
 */
function sortValueOf(row: WorkflowDashboardRow, field: ChangeSortField): number | undefined {
  switch (field) {
    case 'duration':
      return row.durationMs
    case 'tokens':
      return row.inputTokens === undefined && row.outputTokens === undefined
        ? undefined
        : (row.inputTokens ?? 0) + (row.outputTokens ?? 0)
    case 'startedAt': {
      if (row.startedAt === undefined) return undefined
      const parsed = Date.parse(row.startedAt)
      return Number.isNaN(parsed) ? undefined : parsed
    }
    case 'tasks':
      return row.tasks === undefined ? undefined : taskRatioOf(row)
    case 'default':
      return undefined
  }
}

/**
 * 【变更】2026-10-26 (批次二十八 5): apply the ledger's filters, then its sort.
 *
 * The filters narrow first (category, then workflow mode, then the search
 * text); the sort then reorders what survived. `default` keeps the host's own
 * order — the projection reads newest change first, and no client-side guess
 * reproduces that order for the rows that carry no timestamp.
 *
 * 【变更】2026-10-26 (批次二十九 5): the sort is a DIMENSION plus a
 * DIRECTION. A row that cannot answer the dimension (no duration, no tokens,
 * no start time) sorts LAST in both directions — an unknown value is not the
 * smallest one.
 * @param rows - every change row of the project.
 * @param view - the view controls.
 * @returns the rows the ledger shows, in display order.
 */
export function selectChangeRows(
  rows: readonly WorkflowDashboardRow[],
  view: ChangeLedgerView,
): readonly WorkflowDashboardRow[] {
  const query = view.query.trim().toLowerCase()
  const filtered = rows.filter((row) => {
    if (view.category !== 'all' && changeStateOf(row) !== view.category) return false
    if (view.mode !== 'all' && row.mode !== CHANGE_MODE_WIRE[view.mode]) return false
    if (query !== '' && !row.changeId.toLowerCase().includes(query)) return false
    return true
  })
  if (view.sort === 'default') return filtered
  const direction = view.sortOrder === 'asc' ? 1 : -1
  const sorted = [...filtered]
  sorted.sort((left, right) => {
    const leftValue = sortValueOf(left, view.sort)
    const rightValue = sortValueOf(right, view.sort)
    if (leftValue === undefined && rightValue === undefined) return 0
    if (leftValue === undefined) return 1
    if (rightValue === undefined) return -1
    if (leftValue === rightValue) return left.changeId.localeCompare(right.changeId)
    return (leftValue - rightValue) * direction
  })
  return sorted
}

/**
 * 【变更】2026-10-26 (批次二十八 5): the desktop bridge the ledger hands its
 * rendered page to.
 *
 * The desktop shell's window-open handler forwards only http(s)/file URLs to
 * the system browser, so the ledger's `blob:` page never left the renderer —
 * the button did nothing. The shell instead writes the page to a temp file
 * and opens THAT.
 */
type DesktopBridge = {
  readonly isDesktop?: boolean
  readonly openHtml?: (html: string, name: string) => Promise<{ ok: boolean; error?: string }>
}

/**
 * @returns the desktop bridge when running inside baf-dsh Electron.
 */
function readDesktopBridge(): DesktopBridge | undefined {
  if (typeof window === 'undefined') return undefined
  const bridge = (globalThis as { bafDesktop?: DesktopBridge }).bafDesktop
  if (bridge === undefined || bridge.isDesktop !== true) return undefined
  return bridge
}

/**
 * 【变更】2026-10-27 (批次三十): the Blob URL of the board the ledger last
 * opened in a BROWSER (the desktop path writes a file instead — see
 * {@link readDesktopBridge}).
 *
 * The board's own 刷新 button reloads the page, and a revoked Blob URL cannot
 * be reloaded — so the URL is dropped when the NEXT board is exported, not on
 * a timer. An open board therefore stays refreshable for as long as the
 * customer is looking at it.
 */
let boardBlobUrl: string | undefined

/**
 * 【变更】2026-10-27 (批次三十): drop the previous board's Blob URL.
 * @returns nothing.
 */
function revokeBoardBlobUrl(): void {
  if (boardBlobUrl === undefined) return
  URL.revokeObjectURL(boardBlobUrl)
  boardBlobUrl = undefined
}

/**
 * 【变更】2026-10-26 (批次二十八 5): the loading plate — a spinning ring beside
 * the label, inside the page's own card vocabulary. The bare「正在加载…」 line
 * read as a frozen page; the ring says the round is running.
 * @param props - the label and the optional test id.
 * @returns the plate element tree.
 */
function LoadingPlate({ label, testid }: { label: string; testid?: string }) {
  return (
    <div className={css.loading} data-testid={testid} role="status" aria-live="polite">
      <span className={css.spinner} aria-hidden="true" />
      <span className={css.loadingLabel}>{label}</span>
    </div>
  )
}

/**
 * 【变更】2026-10-26 (批次二十九 5): one view control — the 设置 → 通用设置 →
 * 权限 row's own dropdown recipe (a pill trigger + the shared Menu), so the
 * ledger's 排序 / 升降序 / 流程 read exactly like the permission preset
 * selector instead of like the browser's native select.
 * @param props - the label, the selected id, the options and the change handler.
 * @returns the control element tree.
 */
function ViewSelect({ label, value, options, onSelect, testid, disabled }: {
  label: string
  value: string
  options: readonly { readonly id: string; readonly label: string }[]
  onSelect: (id: string) => void
  testid: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find(option => option.id === value)
  return (
    <div className={css.selectWrap}>
      <span className={css.selectLabel}>{label}</span>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={options.map(option => ({ id: option.id, label: option.label }))}
        selectedId={value}
        onSelect={(id) => {
          setOpen(false)
          onSelect(id)
        }}
        align="end"
        portal
        anchor={(
          <button
            type="button"
            className={css.selector}
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={disabled === true}
            data-testid={testid}
            onClick={() => { setOpen(value => !value) }}
          >
            {selected?.label ?? value}
            <IconChevronDownOutlineRegular className={css.chevron} />
          </button>
        )}
      />
    </div>
  )
}

/**
 * 【变更】2026-10-26 (批次二十九 6): a change's stage nodes in the order the
 * graph lays them out — the same order the app's flow canvas draws them in.
 * A node the graph does not know keeps its catalog position, after the known
 * ones.
 * @param view - the change's projection view.
 * @returns the ordered stage nodes.
 */
function orderByGraph(view: WorkflowTabView): readonly WorkflowTabNodeView[] {
  const order = new Map<string, number>()
  for (const [index, node] of view.graph.nodes.entries()) order.set(node.id, index)
  return view.nodes
    .map((node, index) => ({ node, index }))
    .sort((left, right) =>
      (order.get(left.node.id) ?? 1000 + left.index) - (order.get(right.node.id) ?? 1000 + right.index))
    .map(item => item.node)
}

/**
 * 【变更】2026-10-26 (用户问题 2): one node's board STATUS TONE — the colour
 * family the board's graph card uses. The mapping is the in-app
 * `flow-parts.statusClass` one: completed → green, in-progress → the gold
 * accent, failed/blocked → red, drifted → amber, everything else → grey;
 * the parked gate and the current terminal are their own tones.
 * @param status - the node's status (undefined = template idle).
 * @param abandoned - this card is the abandoned terminus.
 * @param isGate - the change is parked on a confirm gate at this node.
 * @param isCurrentTerminal - this terminal card is the change's outcome.
 * @returns the tone id.
 */
function boardToneOf(
  status: WorkflowTabNodeView['status'] | undefined,
  abandoned: boolean,
  isGate: boolean,
  isCurrentTerminal: boolean,
): DashboardHtmlGraphNode['tone'] {
  if (isGate) return 'gate'
  if (isCurrentTerminal) return abandoned ? 'failed' : 'completed'
  switch (status) {
    case 'completed': return 'completed'
    case 'in-progress': return 'active'
    case 'failed':
    case 'blocked': return 'failed'
    case 'drifted': return 'drifted'
    default: return 'idle'
  }
}

/**
 * 【变更】2026-10-26 (用户问题 2): lay ONE change's detail graph out for the
 * board — the same grid geometry, the same edge paths and the same status
 * colours the in-app `FlowCanvas` resolves at render time; here they are
 * resolved at EXPORT time, because the board is a static file that cannot
 * run the app's canvas.
 * @param detail - the change's host detail payload (status `ready`).
 * @param t - the locale binder.
 * @returns the laid-out graph.
 */
export function toBoardGraph(
  detail: BafWorkflowChangeDetailResult & { status: 'ready' },
  t: ChangeOverviewRowProps['t'],
): DashboardHtmlGraph | undefined {
  const view = detail.view
  if (view.graph.nodes.length === 0) return undefined
  const placements = view.graph.nodes
  const maxCol = Math.max(0, ...placements.map(p => p.column))
  const maxRow = Math.max(0, ...placements.map(p => p.row))
  const width = (maxCol + 1) * COL_W + 56
  const height = (maxRow + 1) * ROW_H + 72
  const posById = new Map<string, { x: number; y: number }>()
  for (const p of placements) {
    const id = String(p.id)
    posById.set(id, { x: 28 + p.column * COL_W, y: 28 + p.row * ROW_H })
  }
  const nodeById = new Map(view.nodes.map(node => [String(node.id), node]))
  // The parked gate and the current stage — the same reads FlowCanvas applies.
  const gateNode = view.gate?.node === undefined ? undefined : String(view.gate.node)
  const edges = view.graph.edges.map((edge) => {
    const fromId = edge.from ?? 'intake'
    const a = posById.get(fromId)
    const b = posById.get(String(edge.to))
    if (a === undefined || b === undefined) return undefined
    const x1 = a.x + NODE_W / 2
    const y1 = edge.from === null ? a.y : a.y + NODE_H
    const x2 = b.x + NODE_W / 2
    const y2 = b.y
    const mid = (y1 + y2) / 2
    const current = view.current === null ? undefined : String(view.current)
    return {
      id: edge.id,
      path: `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`,
      kind: edge.kind,
      active: current !== undefined && (edge.from === view.current || edge.to === view.current),
      title: conditionTextOf(edge),
    } satisfies DashboardHtmlGraphEdge
  }).filter((edge): edge is DashboardHtmlGraphEdge => edge !== undefined)
  const nodes: DashboardHtmlGraphNode[] = []
  placements.forEach((placement) => {
    const id = String(placement.id)
    const p = posById.get(id)
    if (p === undefined) return
    const node = nodeById.get(id)
    const isCurrent = view.current === placement.id
    const isGate = gateNode === id
    const isClipped = view.mode === 'bug-fix-path' && !placement.onPath
      && placement.id !== 'completed' && placement.id !== 'abandoned'
    const isCurrentTerminal = (placement.id === 'completed' || placement.id === 'abandoned') && isCurrent
    const badge = isCurrent && (placement.id === 'completed' || placement.id === 'abandoned')
      ? placement.id === 'completed' ? t('status.completed') : t('status.abandoned')
      : null
    const nonCurrentTerminalBadge = !isCurrent && (placement.id === 'completed' || placement.id === 'abandoned')
      && (view.current === 'completed' || view.current === 'abandoned')
      ? t('status.skipped')
      : null
    const statusLabel = isGate
      ? t('status.awaiting')
      : badge !== null
        ? badge
        : nonCurrentTerminalBadge !== null
          ? nonCurrentTerminalBadge
          : isClipped
            ? t('status.clipped')
            : node === undefined
              ? t('status.template')
              : t(`status.${node.status}`)
    // The CURRENT terminal card carries the change's TOTAL figures — the
    // same rule the app's FlowCanvas applies to its metrics row.
    const metrics = isCurrentTerminal
      ? [
        `${t('card.duration')} ${formatDuration(view.metrics?.totalDurationMs ?? 0)}`,
        `${t('card.tokens')} ${formatTokens(view.metrics?.totalInputTokens ?? 0, view.metrics?.totalOutputTokens ?? 0)}`,
      ]
      : [
        `${t('card.duration')} ${
          node?.metrics?.durationMs !== undefined
            ? formatDuration(node.metrics.durationMs)
            : stageExecuted(node?.status) ? '0s' : '—'
        }`,
        `${t('card.tokens')} ${
          node?.metrics?.inputTokens !== undefined || node?.metrics?.outputTokens !== undefined
            ? formatTokens(node.metrics?.inputTokens, node.metrics?.outputTokens)
            : stageExecuted(node?.status) ? formatTokens(0, 0) : '—'
        }`,
      ]
    nodes.push({
      id,
      label: t(`node.${placement.id as WorkflowNodeId}`),
      statusLabel,
      tone: boardToneOf(node?.status, placement.id === 'abandoned', isGate, isCurrentTerminal),
      onPath: placement.onPath,
      current: isCurrent,
      x: p.x,
      y: p.y,
      width: NODE_W,
      height: NODE_H,
      metrics,
    })
  })
  const graph: DashboardHtmlGraph = { width, height, nodes, edges }
  return graph
}

/**
 * 【变更】2026-10-26 (批次二十九 6): flatten ONE change's detail into the
 * board's embedded payload.
 *
 * The board is a static file on disk: when the customer clicks a change
 * there, the page cannot ask the host for the detail any more. The client
 * therefore reads every detail up front and the board carries the answers
 * with it. Every label is resolved HERE, so the page only prints.
 * @param row - the change's dashboard row (the metrics the board shows).
 * @param detail - the host's detail payload.
 * @param t - the locale binder.
 * @returns the board's flattened detail.
 */
function toBoardDetail(
  row: WorkflowDashboardRow,
  detail: BafWorkflowChangeDetailResult,
  t: ChangeOverviewRowProps['t'],
): DashboardHtmlChangeDetail {
  if (detail.status !== 'ready') {
    return { changeId: row.changeId, status: detail.status }
  }
  const view = detail.view
  const state = changeStateOf(row)
  const stateLabel = state === 'completed'
    ? t('ovw.completed')
    : state === 'abandoned'
      ? t('ovw.abandoned')
      : t('dashboard.activeChanges')
  return {
    changeId: row.changeId,
    status: 'ready',
    modeLabel: modeLabel(view.mode, t),
    stateLabel,
    ...(view.current === null ? {} : { stageLabel: t(`node.${view.current}`) }),
    ...(view.startedAt === undefined ? {} : { startedAtText: formatTimestamp(view.startedAt) }),
    ...(row.endedAt === undefined ? {} : { endedAtText: formatTimestamp(row.endedAt) }),
    ...(row.durationMs === undefined ? {} : { durationText: formatDuration(row.durationMs) }),
    ...(row.inputTokens === undefined && row.outputTokens === undefined
      ? {}
      : { tokensText: formatTokens(row.inputTokens, row.outputTokens) }),
    ...(row.tasks === undefined ? {} : { tasksText: `${row.tasks.done}/${row.tasks.total}` }),
    ...(view.intake === undefined ? {} : {
      intake: {
        kind: view.intake.kind,
        modeLabel: modeLabel(view.intake.mode, t),
        affectedScope: t(`scope.${view.intake.affectedScope}` as WorkflowTabKey),
        confidence: view.intake.confidence,
        reasonCodes: view.intake.reasonCodes,
        openspecRequired: view.intake.openspecRequired,
        requiresUserConfirmation: view.intake.requiresUserConfirmation,
        confirmation: view.intake.confirmation,
      },
    }),
    ...(view.artifacts === undefined ? {} : {
      artifacts: view.artifacts.map(artifact => ({
        file: artifact.file,
        path: artifact.path,
        stateLabel: t(`artifact.state.${artifact.state}`),
      })),
    }),
    ...(view.nodes.length === 0 ? {} : {
      // The stage list follows the GRAPH's order (the same order the app's
      // flow canvas lays the nodes out in), not the catalog's.
      stages: orderByGraph(view).map(node => ({
        label: t(`node.${node.id}`),
        statusLabel: t(`status.${node.status}`),
        onPath: node.onPath,
      })),
    }),
    // 【变更】2026-10-26 (用户问题 2): the COMPLETE laid-out graph — the board
    // draws the same picture the in-app canvas does, offline.
    ...(() => {
      const graph = toBoardGraph(detail, t)
      return graph === undefined ? {} : { graph }
    })(),
    ...(detail.history.length === 0 ? {} : {
      history: detail.history.map(entry => ({
        at: formatTimestamp(entry.at),
        title: t(historyKeyOf(entry.type) as WorkflowTabKey),
        ...(entry.node === undefined ? {} : { nodeLabel: t(`node.${entry.node}` as WorkflowTabKey) }),
        ...(entry.gate === undefined ? {} : { gate: entry.gate }),
        ...(entry.detail === undefined ? {} : { detail: entry.detail }),
        ...(entry.reason === undefined ? {} : { reason: entry.reason }),
      })),
    }),
  }
}

/**
 * 【变更】2026-10-27 (批次三十): how much of ONE artifact the board embeds.
 *
 * The board carries every change's documents inside itself, so an unbounded
 * body would turn the page into a multi-megabyte file. The cap keeps the board
 * readable; a cut document says so in the preview pane.
 */
const BOARD_ARTIFACT_CAP = 40_000

/**
 * 【变更】2026-10-27 (批次三十): embed each stage document's TEXT into the
 * board's detail payload.
 *
 * The board is a static file on disk: when the customer clicks a stage
 * document there, the page cannot ask the host for its body. So the export
 * reads every artifact up front and embeds the texts. A document the reader
 * cannot reach is embedded WITHOUT a body — the board's row then says so
 * instead of opening an empty pane.
 * @param detail - the flattened board detail.
 * @param cwd - the workspace root to read through.
 * @param readArtifact - the reader; undefined when the workspace has no live
 * session, in which case nothing is embedded.
 * @returns the detail with the artifact bodies attached.
 */
async function withArtifactContents(
  detail: DashboardHtmlChangeDetail,
  cwd: string,
  readArtifact: ((cwd: string, path: string) => Promise<WorkflowTabFileReadResult>) | undefined,
): Promise<DashboardHtmlChangeDetail> {
  if (readArtifact === undefined || detail.artifacts === undefined) return detail
  const artifacts = await Promise.all(detail.artifacts.map(async (artifact) => {
    if (artifact.content !== undefined) return artifact
    try {
      const read = await readArtifact(cwd, artifact.path)
      if (read.status !== 'ready' || read.content === undefined) return artifact
      const cut = read.content.length > BOARD_ARTIFACT_CAP
      return {
        ...artifact,
        content: cut ? read.content.slice(0, BOARD_ARTIFACT_CAP) : read.content,
        ...(cut ? { truncated: true } : {}),
      }
    } catch {
      // An unreadable document leaves its row without a body — the board says
      // so rather than failing the whole export.
      return artifact
    }
  }))
  return { ...detail, artifacts }
}

/**
 * Render the 工作流 page's 变更总览 row — the project's change ledger.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function ChangeOverviewRow(props: ChangeOverviewRowProps): React.ReactElement {
  const { t, loadChangeOverview, loadChangeDetail, readArtifact, useSessions } = props
  const [result, setResult] = useState<BafWorkflowChangeOverviewResult | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  /**
   * 【变更】2026-10-26 (用户问题 2): the MAIN-VIEW workspace — the session the
   * shell retains as the main view (`retainedBy.mainView > 0`, the same rule
   * ui-session's publishMain applies). `undefined` when no live session is the
   * main view (or it names no workspace): the ledger then reads the host's
   * newest-live-session fallback instead of answering for a workspace nobody
   * is looking at.
   */
  const mainCwd = useSessions((state) => {
    const main = Object.values(state.byId).find(
      session => (session.retainedBy.mainView ?? 0) > 0,
    )
    return main?.cwd
  })
  // 【变更】2026-10-26 (用户问题 2): key the load on the main-view workspace so
  // switching the workspace re-reads the ledger for THAT project.
  const loadKey = mainCwd ?? ''
  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setResult(await (loadKey === '' ? loadChangeOverview() : loadChangeOverview(loadKey)))
      setError(undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [loadChangeOverview, loadKey])

  useEffect(() => { void load() }, [load])
  // 【变更】2026-10-24 (批次十九 1.3): the drill-down state — the open change
  // id plus its detail payload.
  const [openChangeId, setOpenChangeId] = useState<string | undefined>(undefined)
  const [detail, setDetail] = useState<BafWorkflowChangeDetailResult | undefined>(undefined)
  const [detailLoading, setDetailLoading] = useState(false)
  // 【变更】2026-10-26 (批次二十八 5): the ledger's four view controls — the
  // category (change state), the workflow mode, the sort order and the search
  // text. They narrow the record list without touching the projection.
  const [category, setCategory] = useState<ChangeCategory>('all')
  const [mode, setMode] = useState<ChangeMode>('all')
  // 【变更】2026-10-26 (批次二十九 5): the sort is a dimension plus a
  // direction — 「排序」names the field, 「升降序」flips it.
  const [sort, setSort] = useState<ChangeSortField>('default')
  const [sortOrder, setSortOrder] = useState<ChangeSortOrder>('desc')
  const [query, setQuery] = useState('')
  // 【变更】2026-10-26 (批次二十八 5): why the board did not open in the
  // browser — the desktop shell's answer when the temp file could not be
  // written or handed to the browser.
  const [externalError, setExternalError] = useState<string | undefined>(undefined)
  // 【变更】2026-10-26 (批次二十九 6): the export reads every change's detail
  // before it can open the board, so the button has work to show.
  const [exporting, setExporting] = useState(false)

  /**
   * The record list the ledger shows: the projection's own rows, narrowed by
   * the view controls and reordered by the sort.
   */
  const visibleRows = useMemo(() => {
    if (result?.status !== 'ready') return []
    return selectChangeRows(result.rows, { category, mode, sort, sortOrder, query })
  }, [result, category, mode, sort, sortOrder, query])

  /**
   * 【变更】2026-10-24 (批次十九 1.3): the standalone board — the project
   * ledger baked into a self-contained HTML page (tiles, mode donut, duration
   * ranking, one card per change) and opened in a new browser tab via a Blob
   * URL. The entry point moved here with the ledger (the session tab's modal
   * is gone); the click-originated window.open keeps popup blockers happy and
   * the URL is revoked a minute later (the page outlives it — nothing is
   * fetched back).
   *
   * 【变更】2026-10-26 (批次二十八 5): the desktop shell's window-open handler
   * forwards only http(s)/file URLs to the system browser, so the `blob:` page
   * never left the renderer and the button did nothing. On desktop the page
   * now goes through the shell, which writes it to a temp file and opens
   * THAT; a browser keeps the Blob URL. Either way the customer gets the
   * board in a real browser window.
   *
   * 【变更】2026-10-26 (批次二十九 6): the board grew a per-change DETAIL
   * overlay, and the page is a static file — it cannot ask the host for a
   * change's detail when the customer clicks it. So the export reads EVERY
   * change's detail up front and embeds it in the document. The reads run in
   * parallel; a change whose detail cannot be read still gets a card (the
   * overlay says so) instead of failing the whole export.
   */
  const openExternal = useCallback(async (): Promise<void> => {
    if (result?.status !== 'ready') return
    // 【变更】2026-10-26 (批次二十九 6): the export reads every change's
    // detail before it can open the board, so the button has work to show.
    setExporting(true)
    setExternalError(undefined)
    try {
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
          // 【变更】2026-10-29 (批次三十七 · 用户问题 6): the lifecycle tail.
          completed: t('artifact.state.completed'),
          updated: t('artifact.state.updated'),
          stale: t('artifact.state.stale'),
        },
        nodeLabels,
        modeLabels: {
          'full-go-path': t('mode.fullGoPath'),
          'bug-fix-path': t('mode.bugFixPath'),
          'clarify-required': t('mode.clarify'),
        },
        // 【变更】2026-10-27 (批次三十): the board's TOP BAR + the artifact
        // preview — the theme switch, the refresh and the preview pane's copy.
        themeLight: t('dashboard.board.themeLight'),
        themeDark: t('dashboard.board.themeDark'),
        refresh: t('dashboard.board.refresh'),
        preview: t('dashboard.board.preview'),
        previewEmpty: t('dashboard.board.previewEmpty'),
        previewTruncated: t('dashboard.board.previewTruncated'),
        previewClose: t('dashboard.board.previewClose'),
        // 【变更】2026-10-26 (批次二十九 6): the board's own view controls — the
        // same four the in-app ledger carries, so the exported page reads like
        // the page it came from.
        board: {
          filter: t('ovw.categoryLabel'),
          sort: t('ovw.sortLabel'),
          order: t('ovw.orderLabel'),
          mode: t('ovw.modeLabel'),
          search: t('ovw.searchPlaceholder'),
          clickHint: t('ovw.clickHint'),
          categories: CHANGE_CATEGORIES.map(id => ({ id, label: t(`ovw.category.${id}`) })),
          sorts: CHANGE_SORTS.map(id => ({ id, label: t(`ovw.sort.${id}`) })),
          orders: CHANGE_SORT_ORDERS.map(id => ({ id, label: t(`ovw.order.${id}`) })),
          // The board's mode filter selects the WIRE mode — the value the card's
          // own data attribute carries (the app's filter maps the same way).
          modes: CHANGE_MODES.map(id => ({ id: CHANGE_MODE_WIRE[id], label: t(`ovw.mode.${id}`) })),
        },
        // 【变更】2026-10-26 (批次二十九 6): the detail overlay's labels — the
        // same copy the in-app detail workspace uses.
        detail: {
          title: t('ovw.detailTitle'),
          close: t('ovw.detailClose'),
          intake: t('ovw.detailIntake'),
          kind: t('ovw.detailKind'),
          scope: t('ovw.detailScope'),
          confidence: t('ovw.detailConfidence'),
          reason: t('ovw.detailReason'),
          flow: t('ovw.detailFlow'),
          metrics: t('ovw.detailMetrics'),
          tasks: t('ovw.detailTasks'),
          artifacts: t('ovw.detailArtifacts'),
          history: t('ovw.detailHistory'),
          empty: t('ovw.detailEmpty'),
          unknown: t('ovw.detailUnknownChange'),
          failed: t('ovw.detailFailed'),
          startedAt: t('strip.startedAt'),
          endedAt: t('ovw.columnEnded'),
          mode: t('ovw.columnMode'),
          duration: t('card.duration'),
          tokens: t('card.tokens'),
          state: t('ovw.columnState'),
          openSpec: t('ovw.detailOpenSpec'),
          confirmation: t('ovw.detailConfirmation'),
          current: t('card.current'),
        },
      }
      const details = await Promise.all(result.rows.map(async (row): Promise<DashboardHtmlChangeDetail> => {
        try {
          const changeDetail = loadKey === ''
            ? await loadChangeDetail(row.changeId)
            : await loadChangeDetail(row.changeId, loadKey)
          const flat = toBoardDetail(row, changeDetail, t)
          // 【变更】2026-10-27 (批次三十): the board's PREVIEW needs the stage
          // documents' own text — the page is a file on disk and can never ask
          // the host for a document.
          return loadKey === '' ? flat : await withArtifactContents(flat, loadKey, readArtifact)
        } catch {
          return { changeId: row.changeId, status: 'failed' }
        }
      }))
      const html = buildDashboardHtml({ rows: result.rows, summary: result.summary }, labels, details)
      const bridge = readDesktopBridge()
      if (bridge?.openHtml !== undefined) {
        void bridge.openHtml(html, 'baf-dsh-change-overview.html').then((answer) => {
          if (answer.ok) {
            setExternalError(undefined)
            return
          }
          setExternalError(answer.error ?? t('ovw.externalFailed'))
        }).catch((err: unknown) => {
          setExternalError(err instanceof Error ? err.message : String(err))
        })
        return
      }
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
      window.open(url, '_blank', 'noopener,noreferrer')
      // 【变更】2026-10-27 (批次三十): the board's own 刷新 button RELOADS the
      // page, and a revoked Blob URL cannot be reloaded — so the URL is no
      // longer dropped on a 60s timer. It is revoked when the NEXT board is
      // exported instead, which keeps an open board refreshable for as long
      // as the customer is looking at it.
      revokeBoardBlobUrl()
      boardBlobUrl = url
    } finally {
      setExporting(false)
    }
  }, [result, t, loadChangeDetail, loadKey, readArtifact])

  const openDetail = useCallback(async (changeId: string): Promise<void> => {
    setOpenChangeId(changeId)
    setDetail(undefined)
    setDetailLoading(true)
    try {
      setDetail(loadKey === '' ? await loadChangeDetail(changeId) : await loadChangeDetail(changeId, loadKey))
    } catch {
      setDetail({ status: 'unknown-change', changeId })
    } finally {
      setDetailLoading(false)
    }
  }, [loadChangeDetail, loadKey])

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
            disabled={result?.status !== 'ready' || exporting}
            title={t('dashboard.board.snapshotNote')}
            onClick={() => { void openExternal() }}
          >
            {/* 【变更】2026-10-26 (批次二十九 6): the export reads every
                change's detail before the board can open — the button says so
                instead of looking dead. */}
            {exporting ? <span className={css.spinner} aria-hidden="true" /> : null}
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
      {/* 【变更】2026-10-26 (批次二十八 5): the board could not be opened — the
          desktop shell's answer. The page says so instead of the button
          failing silently. */}
      {externalError !== undefined && (
        <div className={css.statusError} data-testid="change-overview-external-error">
          {t('ovw.externalFailed')} {externalError}
        </div>
      )}
      {/* 【变更】2026-10-26 (批次二十八 5): the loading view is a spinner in a
          plate, not a bare line of text — a slow projection round reads as
          work in progress. */}
      {result === undefined && error === undefined && (
        <LoadingPlate label={t('ovw.loading')} testid="change-overview-loading" />
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
              <span className={css.sectionCount} data-testid="change-overview-count">{result.rows.length}</span>
              <span className={css.sectionHint}>{t('ovw.clickHint')}</span>
            </div>

            {/* 【变更】2026-10-26 (批次二十八 5): the view controls — the
                category (which change states), the workflow mode, the sort
                order and the search text. A project with dozens of changes
                cannot be read from one flat list. */}
            <div className={css.toolbar} data-testid="change-overview-toolbar">
              <div className={css.segGroup} role="group" aria-label={t('ovw.categoryLabel')}>
                {CHANGE_CATEGORIES.map(item => (
                  <button
                    key={item}
                    type="button"
                    className={css.seg}
                    data-active={category === item ? 'true' : undefined}
                    aria-pressed={category === item}
                    data-testid={`change-overview-category-${item}`}
                    onClick={() => { setCategory(item) }}
                  >
                    {t(`ovw.category.${item}`)}
                  </button>
                ))}
              </div>
              <ViewSelect
                label={t('ovw.sortLabel')}
                value={sort}
                options={CHANGE_SORTS.map(item => ({ id: item, label: t(`ovw.sort.${item}`) }))}
                onSelect={(id) => { setSort(id as ChangeSortField) }}
                testid="change-overview-sort"
              />
              {/* 【变更】2026-10-26 (批次二十九 5): the direction — a second
                  dropdown, linked to the sort dimension above. It reads
                  「降序」/「升序」 and flips whatever field 排序 names. With
                  「默认顺序」picked there is nothing to flip, so it rests. */}
              <ViewSelect
                label={t('ovw.orderLabel')}
                value={sortOrder}
                options={CHANGE_SORT_ORDERS.map(item => ({ id: item, label: t(`ovw.order.${item}`) }))}
                onSelect={(id) => { setSortOrder(id as ChangeSortOrder) }}
                testid="change-overview-order"
                disabled={sort === 'default'}
              />
              <ViewSelect
                label={t('ovw.modeLabel')}
                value={mode}
                options={CHANGE_MODES.map(item => ({ id: item, label: t(`ovw.mode.${item}`) }))}
                onSelect={(id) => { setMode(id as ChangeMode) }}
                testid="change-overview-mode"
              />
              <input
                type="search"
                className={css.search}
                value={query}
                placeholder={t('ovw.searchPlaceholder')}
                aria-label={t('ovw.searchPlaceholder')}
                data-testid="change-overview-search"
                onChange={(event) => { setQuery(event.currentTarget.value) }}
              />
              <span className={css.resultCount} data-testid="change-overview-result-count">
                {t('ovw.filteredCount', { shown: visibleRows.length, total: result.rows.length })}
              </span>
            </div>

            <div className={css.cards} data-testid="change-overview-cards">
              {visibleRows.map(card)}
              {visibleRows.length === 0 && (
                // 【变更】2026-10-26 (批次二十九 5): the two empty states are
                // different facts. A project that carries NO change at all
                // gets 「本项目还没有任何变更」; a project whose changes are all
                // filtered out gets 「没有符合当前筛选条件的变更」. 批次二十八
                // collapsed the two and lost the first one.
                result.rows.length === 0
                  ? <div className={css.empty} data-testid="change-overview-empty-project">{t('ovw.empty')}</div>
                  : <div className={css.empty} data-testid="change-overview-no-match">{t('ovw.noMatch')}</div>
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
  readArtifact: ((cwd: string, path: string) => Promise<WorkflowTabFileReadResult>) | undefined
  t: ChangeOverviewRowProps['t']
}): React.ReactElement {
  const { changeId, detail, loading, onClose, readArtifact, t } = props
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
    // 【变更】2026-10-28 (批次三十四 · 用户问题 6): the graph's chips carry the
    // ABSOLUTE paths the stage events recorded, and the workspace reader takes
    // workspace-relative paths only — every document preview answered
    // 「仅支持工作区相对路径」. The path becomes relative here.
    const relative = workspaceRelativePath(cwd, path)
    setPreview({ path: relative })
    try {
      const result = await readArtifact(cwd, relative)
      setPreview(current => (current !== null && current.path === relative ? { path: relative, result } : current))
    } catch (err) {
      setPreview(current => (current !== null && current.path === relative
        ? { path: relative, result: { status: 'unreadable', reason: err instanceof Error ? err.message : String(err) } }
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

  // 【变更】2026-10-27 (批次三十二 · 用户问题 6): the preview's 在侧栏打开
  // button is GONE — the document is already on screen in this window, and the
  // button only moved it to another surface. With it gone the preview is one
  // reading surface: title, path, body.
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
            {/* ── 左侧 · classification + artifacts + the HISTORY (bottom) ── */}
            <aside className={css.wsLeft} data-testid="change-detail-left">
              <div className={css.wsLeftScroll}>
                {loading && <LoadingPlate label={t('ovw.detailLoading')} testid="change-detail-loading" />}
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
                        // 【变更】2026-10-27 (批次三十一): the same drift tags the
                        // session rail wears — 已修改 / 待同步 / 已同步.
                        driftTags={artifactDriftTags(view.artifactDrift ?? [], false)}
                        onOpen={(path) => { void openPreview(path) }}
                        t={t}
                      />
                    )}
                    {readArtifact === undefined && (
                      <p className={css.wsNote} data-testid="change-detail-no-session">{t('ovw.detailNoSession')}</p>
                    )}
                    {openNotice !== undefined && (
                      <p className={css.wsWarn} data-testid="change-detail-open-failed">{openNotice}</p>
                    )}
                  </>
                )}
              </div>
              {/* 【变更】2026-10-28 (批次三十五 · 用户问题 1): the change's
                  HISTORY moved DOWN from the right rail to the rail's BOTTOM
                  band (左下方). It is the change's story (what happened, in
                  order); the right rail answers 「这个阶段现在怎么样」, and the
                  left rail's upper part answers 「这个变更是什么」. */}
              {view !== undefined && (
                <div className={css.wsLeftHistory} data-testid="change-detail-history-region">
                  <HistoryPanel
                    history={detail?.status === 'ready' ? detail.history : []}
                    t={t}
                  />
                </div>
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

            {/* ── 右侧 · stage card + checklist + detail ─────────────────── */}
            <aside className={css.wsRight} data-testid="change-detail-right">
              {view !== undefined && (
                <>
                  <div className={css.wsRightScroll}>
                    {/* 【变更】2026-10-27 (批次三十二 · 用户问题 5): the stage
                        header became the stage's NAME CARD — the name plus the
                        stage's own figures (状态 / 耗时 / Tokens / 下一跳 /
                        条件), the same card the session rail shows.
                        【变更】2026-10-28 (批次三十五 · 用户问题 1): the name
                        is BILINGUAL — the English name rides INLINE after the
                        zh name on the same line (中文在前，英文在后). */}
                    <StageSummaryCard
                      name={terminal !== null
                        ? t(`node.${terminal}`)
                        : selectedNode === undefined
                          ? t('ovw.detailSelectStage')
                          : t(`node.${selectedNode.id}`)}
                      nameEn={terminal !== null
                        ? NODE_EN[terminal]
                        : selectedNode === undefined
                          ? undefined
                          : NODE_EN[selectedNode.id]}
                      node={selectedNode}
                      nextEdge={nextEdge}
                      t={t}
                    />
                    {terminal !== null ? (
                      <section className={css.wsCard} data-testid="change-detail-terminal">
                        <div className={css.terminalRow}>
                          <span className={css.intakeKey}>{t('detail.status')}</span>
                          <span className={css.intakeValue}>{t(`status.${terminal}`)}</span>
                        </div>
                        <div className={css.terminalRow}>
                          <span className={css.intakeKey}>{t('detail.artifacts')}</span>
                          <span className={clsx(css.intakeValue, css.intakeValueWrap)}>
                            {t(`terminal.${terminal}.artifacts`)}
                          </span>
                        </div>
                        <div className={css.terminalRow}>
                          <span className={css.intakeKey}>{t('detail.completion')}</span>
                          <span className={clsx(css.intakeValue, css.intakeValueWrap)}>
                            {t(`terminal.${terminal}.completion`)}
                          </span>
                        </div>
                      </section>
                    ) : selectedNode === undefined ? (
                      <p className={css.wsHint}>{t('ovw.detailStageHint')}</p>
                    ) : (
                      <>
                        <StageChecklist node={selectedNode} t={t} />
                        <section className={css.wsCard}>
                          <BilingualDetail node={selectedNode} t={t} />
                        </section>
                      </>
                    )}
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
        {/* 【变更】2026-10-28 (批次三十四 · 用户问题 6): the scope reads as the
            customer's word (跨模块 / 局部小改 / 单文件), not the raw enum the
            session rail already localizes. */}
        <span className={css.intakeValue}>{t(`scope.${intake.affectedScope}` as WorkflowTabKey)}</span>
      </div>
      <div className={css.intakeRow}>
        <span className={css.intakeKey}>{t('ovw.detailConfidence')}</span>
        <span className={css.intakeValue}>{percent}%</span>
      </div>
      <div className={css.confidence}>
        <span className={css.confidenceFill} style={{ width: `${percent}%` }} />
      </div>
      {/* 【变更】2026-10-29 (批次三十六 · 用户问题 4): the 置信度 number's
          meaning and purpose ride the card as a line — the customer asked
          「置信度到底是什么，有什么用」 and a bare percentage did not say. */}
      <p className={css.intakeNote}>{t('intake.confidenceNote')}</p>
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
 * projection event, oldest first, as a timeline.
 * 【变更】2026-10-28 (批次三十五 · 用户问题 1): the timeline moved to the
 * BOTTOM-LEFT band of the change detail (the left rail's lower part), and
 * every stage name it prints is BILINGUAL — 中文在前，英文在后 on one line.
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
                  <span className={css.historyNode}>
                    {t(`node.${entry.node}` as WorkflowTabKey)}
                    {NODE_EN[entry.node] !== undefined && (
                      <span className={css.historyNodeEn}>{NODE_EN[entry.node]}</span>
                    )}
                  </span>
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
