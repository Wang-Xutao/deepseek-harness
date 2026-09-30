/**
 * Browser-safe Tab view model for the BAF 工作流 conversation Tab.
 * @module @deepseek-ai/dsh-baf-core/tab-view
 */

import { NODE_CATALOG } from './catalog.ts'
import { buildWorkflowGraph } from './graph.ts'
import type { ConfirmGate } from './events.ts'
import type { ChangeIntake, WorkflowMode } from './intake.ts'
import type { NodeCatalogEntry } from './catalog.ts'
import { TRANSITIONS } from './workflow.ts'
import type {
  NodeStatus,
  TerminalState,
  WorkflowNode,
  WorkflowStatus,
} from './workflow.ts'

/** One allowed / disabled Tab action. */
export interface WorkflowTabAction {
  readonly id:
    | 'confirm-intake'
    | 'reject-intake'
    | 'supplement-intake'
    | 'transition'
    | 'start-stage'
    | 'confirm-archive'
    | 'confirm-gate'
    | 'resume'
  readonly enabled: boolean
  readonly reason?: string
  readonly target?: WorkflowNode | TerminalState
  readonly labelKey: string
}

/** Per-stage wall time / token usage for Tab cards (tokens optional until Phase 5). */
export interface WorkflowNodeMetrics {
  /** Stage wall time in ms when entered/left times are known. */
  readonly durationMs?: number
  /** Provider input tokens attributed to this stage (when recorded). */
  readonly inputTokens?: number
  /** Provider output tokens attributed to this stage (when recorded). */
  readonly outputTokens?: number
}

/** Rollup metrics across the active change. */
export interface WorkflowTabMetrics {
  readonly totalDurationMs?: number
  readonly totalInputTokens?: number
  readonly totalOutputTokens?: number
  /**
   * 【变更】2026-09-25 (用户需求 工作流 3): epoch-ms HOST clock stamp of this
   * derivation. The totals are computed before serialization and transport, so
   * the Tab anchors its per-second 变更耗时 interpolation HERE rather than at
   * local apply time — otherwise every 2 s poll re-anchors ~a second behind
   * the already-interpolated display and the timer visibly runs backwards.
   */
  readonly computedAt?: number
  /**
   * 【变更】2026-09-28 (用户问题 4 停表): whether any work stage's window is
   * open at derivation time (a stage entered but not completed). While false
   * the change rests on a customer decision — the Tab freezes its per-second
   * 变更耗时 interpolation instead of accruing wall-clock wait time. Intake
   * and drift windows never count: intake-classified → intake-confirmed is
   * pure customer wait, and a drift park waits on the customer's resume call.
   */
  readonly running?: boolean
}

/** A parked mandatory confirmation gate (§18.5) — Tab highlight + single action. */
export interface WorkflowTabGate {
  readonly id: ConfirmGate
  /** Node the change is parked on: `design` for gate A, `verify` for gate B. */
  readonly node: WorkflowNode
  /** i18n key for the button that confirms this gate. */
  readonly actionKey: string
  /**
   * §22 `GateId` (registered gate card id) — `design-confirm` for
   * `design-to-plan`, `verify-archive` for `verify-to-archive`. Carried as a
   * string (not the workflow-only union) so baf-core stays independent of
   * baf-workflow's gate-cards registry; consumers in baf-workflow map it back
   * to the registry to render options / dispatch resolves.
   */
  readonly gateId?: string
  /** §22 registered question (verbatim from the registry) — Tab card body. */
  readonly question?: string
  /** §22 registered options, in registry order — Tab button row. */
  readonly options?: readonly { readonly id: string; readonly label: string }[]
}

/** One path lane in the §18.4.3 dual-lane view. */
export interface WorkflowTabLane {
  readonly id: 'bug-fix-path' | 'full-go-path'
  /** Node ids this lane draws, in stage order. */
  readonly nodes: readonly WorkflowNode[]
  /** Node status as recorded *within this lane's* slice of the event log. */
  readonly status: Readonly<Partial<Record<WorkflowNode, NodeStatus>>>
  readonly labelKey: string
}

/** The T15 escalation edge joining the two lanes (§18.4.3). */
export interface WorkflowTabUpgradeEdge {
  /** Where the pre-upgrade path stopped. */
  readonly from: WorkflowNode
  /** Where the full-go-path path picked up. */
  readonly to: WorkflowNode
  readonly at: string
  /**
   * §13 R6 — carry the structured `{ code, message }` form through to the
   * Tab so the renderer can display `message` verbatim while keeping the
   * machine-readable `code` for any audit / dashboard grouping. Legacy
   * plain-string causes (pre-R6 logs) are accepted for replay honesty.
   */
  readonly cause: { code: string; message: string } | string
  readonly labelKey: string
}

/** Dual-lane payload; present only after a `mode-upgraded` event. */
export interface WorkflowTabLanes {
  readonly lanes: readonly WorkflowTabLane[]
  readonly upgrade: WorkflowTabUpgradeEdge
  /**
   * Artifacts produced before the upgrade, kept for traceability (§18.4.3:
   * 「升级前 fast-path 的产物不删」). A string when the path is known, the bare
   * name when the event recorded only names.
   */
  readonly preservedArtifacts: readonly string[]
}

/** T13 drift-resume options, precomputed so the Tab never picks a node (§19.4). */
export interface WorkflowTabResume {
  /** Evidence-derived anchor (the latest node a resume may target). */
  readonly anchor: WorkflowNode
  /** Legal targets, latest-first; index 0 is the recommended default. */
  readonly candidates: readonly WorkflowNode[]
}

/**
 * One customer-editable change artifact, as the Tab rail renders it
 * (2026-09-21 §22 follow-up, session 5.jsonl): stage outputs stop being
 * prose inside cards and become first-class Tab rows — file, workspace
 * path, and a customer-facing state the open button keys off.
 */
export interface WorkflowTabArtifact {
  /** Artifact file name inside the change directory (e.g. `clarify.md`). */
  readonly file: string
  /** Workspace-relative path — what the Tab's open button hands to the file sidebar. */
  readonly path: string
  /**
   * Customer-facing classification: file absent / template unfilled / filled.
   * 【变更】2026-09-23 (demo5 issue #4): `planned` is tasks.md's 中间态 —
   * 计划完成（todo list 已渲染）但实现未完成.
   * 【变更】2026-09-28 (用户问题 3): `clipped` marks the full-go artifacts the
   * bug-fix path never produces (clarify/design docs) — rail parity with
   * full-go-path, the skipped rows read 已裁剪.
   */
  readonly state: 'missing' | 'template' | 'planned' | 'filled' | 'clipped'
  /** Missing items when state is not `filled` (Chinese, one line each). */
  readonly missing: readonly string[]
}

/** One node card in the Tab. */
export interface WorkflowTabNode {
  readonly id: WorkflowNode
  /**
   * Live stage status, plus the display-only states. 【变更】2026-09-30
   * (demo31 问题 4): `clipped` marks the full-flow stages the bug-fix path
   * cuts (clarify/design/plan) — the graph is identical to full-go-path, and
   * those nodes read 已裁剪 instead of 已忽略 whether the change is live or
   * terminal. A T15 escalation backfills them with live statuses, which win.
   */
  readonly status: NodeStatus | 'template' | 'clipped'
  readonly catalog: NodeCatalogEntry
  readonly onPath: boolean
  readonly reasonCodes?: readonly string[]
  readonly artifacts?: readonly string[]
  readonly detail?: string
  readonly metrics?: WorkflowNodeMetrics
  readonly transitionsIn: readonly { id: string; condition: string; from: WorkflowNode | null }[]
  readonly transitionsOut: readonly { id: string; condition: string; to: WorkflowNode | TerminalState }[]
}

/** Complete Tab payload (JSON-safe). */
export interface WorkflowTabView {
  readonly empty: boolean
  readonly changeId: string | null
  readonly mode: WorkflowMode | 'template'
  readonly current: WorkflowNode | TerminalState | null
  readonly intake?: ChangeIntake
  readonly nodes: readonly WorkflowTabNode[]
  readonly graph: ReturnType<typeof buildWorkflowGraph>
  readonly projectionVersion: number
  readonly updatedAt?: string
  readonly sourceRevision?: string
  readonly baselineId?: string
  readonly route?: WorkflowStatus['route']
  readonly openspecSkipped?: WorkflowStatus['openspecSkipped']
  readonly changes: readonly { changeId: string; mode: WorkflowMode; current: WorkflowNode | TerminalState }[]
  readonly selectedChangeId: string | null
  readonly actions: readonly WorkflowTabAction[]
  readonly blockedReason?: string
  /** Change-level duration / token rollup when available. */
  readonly metrics?: WorkflowTabMetrics
  /** Set while the change is parked on gate A/B (§18.5). */
  readonly gate?: WorkflowTabGate
  /**
   * Workspace-level gate (§22.4 scaffold). Set when the Tab's owning workspace
   * has no `.baf/baseline.yml` — only the template / pre-bootstrap view can
   * hold it (scaffold is workspace scope, not change scope; see §22.6).
   */
  readonly pendingGate?: WorkflowTabPendingGate
  /** Set after a T15 escalation, so the Tab draws both paths (§18.4.3). */
  readonly lanes?: WorkflowTabLanes
  /** Set while the change is parked in drift, so the Tab offers a rollback (§19.5). */
  readonly resume?: WorkflowTabResume
  /**
   * Customer-editable artifacts of the focused change, one row per file in
   * stage order (2026-09-21 §22 follow-up). Present only when a change is
   * selected and its status read succeeds; the Tab rail renders one
   * open-in-sidebar button per row.
   */
  readonly artifacts?: readonly WorkflowTabArtifact[]
  /**
   * 【变更】2026-09-24 (demo6 问题 2): the plan ledger's frozen file allowlist
   * once the plan stage completed (live path, archive path for terminal
   * changes). The rail's 影响范围 cell reads the real file count from it;
   * absent before plan or when no ledger is readable.
   */
  readonly planAllowlist?: readonly string[]
  /**
   * Whether the Tab 「推进」 button may advance the change right now
   * (2026-09-22 user report #4): the button used to be always clickable, so
   * tab clicks walked a change through stages whose artifacts were still
   * TODO templates. `ready` is the current node's file gate — the same
   * judgment `/baf-go` runs; `missing` carries the gate's customer-facing
   * lines for the disabled state's tooltip. Absent on empty/blocked views
   * (the button hides).
   */
  readonly advance?: {
    readonly ready: boolean
    readonly missing: readonly string[]
  }
}

/**
 * 【变更】2026-09-23 (user issue #6): one row of the 变更总览 dashboard —
 * every change in the workspace, active and terminal, with the rollup the
 * dashboard table renders (phase pill, task progress, duration, tokens).
 */
export interface WorkflowDashboardRow {
  readonly changeId: string
  readonly mode: WorkflowMode
  readonly current: WorkflowNode | TerminalState
  /** Set only for terminal rows; drives the archived section's grouping. */
  readonly endedAt?: string
  /** Plan-ledger task rollup (absent when no readable ledger). */
  readonly tasks?: { readonly done: number; readonly total: number }
  readonly durationMs?: number
  readonly inputTokens?: number
  readonly outputTokens?: number
  /**
   * 【变更】2026-09-29 (demo23 问题 3): the artifacts the change actually
   * generated — one compact row per file that exists on disk (live or
   * archived), so an ABANDONED change's dashboard entry still shows what was
   * produced before the give-up (the history modal's rail was already
   * terminal-aware; the overview row was not). `missing`/`clipped` files are
   * dropped (nothing to show); the open button keys off `path`.
   */
  readonly artifacts?: readonly WorkflowDashboardArtifact[]
}

/** One generated-artifact chip of a dashboard row (issue 3's compact shape). */
export interface WorkflowDashboardArtifact {
  /** Artifact file name inside the change directory (e.g. `clarify.md`). */
  readonly file: string
  /** Workspace-relative path (live or archive, wherever the file lives). */
  readonly path: string
  /** Customer-facing state of the generated file. */
  readonly state: 'template' | 'planned' | 'filled'
}

/** The 变更总览 dashboard payload: every change row, newest first. */
export interface WorkflowDashboardView {
  readonly rows: readonly WorkflowDashboardRow[]
  /** Convenience rollups the header tiles render. */
  readonly summary: {
    readonly active: number
    readonly archived: number
    readonly abandoned: number
    readonly tasksDone: number
    readonly tasksTotal: number
  }
}

/**
 * Workspace- or change-level pending gate payload — `scaffold` (no baseline,
 * workspace scope) and, 【变更】2026-09-23 (demo2 user issue #2), the
 * change-scoped `intake-classify` resting point (a change parked at intake
 * whose classification is still the live decision). Carried alongside `gate`
 * (the §18.5 design/verify gates) so the Tab renders every pending decision
 * from one shape, each button dispatching through the same `gateResolve`
 * channel the session dialogs use.
 */
export interface WorkflowTabPendingGate {
  readonly gateId: 'scaffold' | 'intake-classify'
  /** Present iff `gateId === 'intake-classify'` — the change awaiting classification. */
  readonly changeId?: string
  readonly question: string
  readonly options: readonly { readonly id: string; readonly label: string }[]
  /**
   * Extra context paragraphs under the question (intake-classify: the
   * classifier's verdict — path / kind / confidence / summary — so the two
   * path buttons confirm a visible judgment, §22.17 I parity).
   */
  readonly detail?: readonly string[]
}

/**
 * The mandatory confirmation gate a change is parked on, or undefined (§18.5).
 *
 * This is the **single** definition of "gate A/B is active". §18.5 states the
 * trigger in terms of node status — `current === 'design'` with `design`
 * completed, and `current === 'verify'` with `verify` completed — and the
 * coordinator, the Tab view and the gate-highlight UI all ask the same
 * question, so they read it from here rather than each re-deriving it.
 *
 * It is a **display / routing** predicate, never a permission check: the
 * customer's unlock is still "type `/baf-go` once more", observed by the
 * coordinator at the projection tail.
 * @param status - recovered workflow status.
 * @returns the parked gate, or undefined when no gate is open.
 */
export function confirmGateOf(
  status: { readonly current: WorkflowNode | TerminalState; readonly nodes: Readonly<Partial<Record<WorkflowNode, NodeStatus>>> },
): ConfirmGate | undefined {
  if (status.current === 'design' && status.nodes.design === 'completed') return 'design-to-plan'
  if (status.current === 'verify' && status.nodes.verify === 'completed') return 'verify-to-archive'
  return undefined
}

/** Node a gate parks on, for card and Tab highlighting. */
const GATE_NODE: Record<ConfirmGate, WorkflowNode> = {
  'design-to-plan': 'design',
  'verify-to-archive': 'verify',
}

/** i18n key for the button that confirms a gate. */
const GATE_ACTION_KEY: Record<ConfirmGate, string> = {
  'design-to-plan': 'gate.confirmIntoPlan',
  'verify-to-archive': 'gate.confirmArchive',
}

/**
 * Tab payload for a parked gate.
 * @param status - recovered workflow status.
 * @returns gate payload, or undefined when no gate is open.
 */
export function gateToTabView(status: WorkflowStatus): WorkflowTabGate | undefined {
  const id = confirmGateOf(status)
  return id === undefined
    ? undefined
    : { id, node: GATE_NODE[id], actionKey: GATE_ACTION_KEY[id] }
}

/**
 * Empty / template view with full graph (no workspace I/O).
 * @param changes - known changes (may be empty).
 * @returns tab view.
 */
export function buildEmptyTabView(
  changes: readonly { changeId: string; mode: WorkflowMode; current: WorkflowNode | TerminalState }[] = [],
): WorkflowTabView {
  const graph = buildWorkflowGraph('template')
  return {
    empty: true,
    changeId: null,
    mode: 'template',
    current: null,
    nodes: Object.values(NODE_CATALOG).map(catalog => ({
      id: catalog.id,
      status: 'template' as const,
      catalog,
      onPath: catalog.onFullGoPath,
      transitionsIn: transitionsInto(catalog.id),
      transitionsOut: transitionsFrom(catalog.id),
    })),
    graph,
    projectionVersion: 0,
    changes,
    selectedChangeId: null,
    actions: [{
      id: 'supplement-intake',
      enabled: true,
      labelKey: 'action.newChange',
      reason: 'Start intake from chat or /baf-workflow-open',
    }],
  }
}

/**
 * Map a recovered status into the Tab view.
 * @param status - workflow status.
 * @param changes - index rows.
 * @param metrics - optional derived stage metrics.
 * @param extras - optional dual-lane and drift-resume payloads (host-derived;
 * they need the event log, which this function deliberately never reads).
 * @returns tab view.
 */
export function statusToTabView(
  status: WorkflowStatus,
  changes: readonly { changeId: string; mode: WorkflowMode; current: WorkflowNode | TerminalState }[],
  metrics?: {
    readonly byNode?: Readonly<Partial<Record<WorkflowNode, WorkflowNodeMetrics>>>
    readonly totals?: WorkflowTabMetrics
  },
  extras: { readonly lanes?: WorkflowTabLanes; readonly resume?: WorkflowTabResume } = {},
): WorkflowTabView {
  const modeForGraph: WorkflowMode | 'template' = status.mode === 'clarify-required'
    ? 'template'
    : status.mode
  const graph = buildWorkflowGraph(modeForGraph)
  const onPath = new Set(
    graph.nodes.filter(n => n.onPath && n.id !== 'completed' && n.id !== 'abandoned').map(n => n.id),
  )

  const nodes: WorkflowTabNode[] = Object.values(NODE_CATALOG).map((catalog) => {
    const live = status.nodes[catalog.id]
    const annotation = status.annotations?.[catalog.id]
    const nodeMetrics = metrics?.byNode?.[catalog.id]
    // 【变更】2026-09-23 (demo1 十问题 9): terminal-context node statuses. A
    // finished change renders every on-path node reached by the live feed as
    // its recorded outcome, an abandoned one likewise, and every node the
    // flow never touched reads 已忽略 (skipped) — never 锁定/空闲: past the
    // terminal state nothing is locked or pending.
    // 【变更】2026-09-30 (demo31 问题 4): bug-fix-path renders the FULL flow
    // graph; the stages this mode cuts (clarify/design/plan — full-path nodes
    // that are off the bug happy path) read 已裁剪 (clipped) live AND in
    // terminal context, instead of 已忽略. A T15 escalation writes live
    // statuses onto those nodes, which take precedence here.
    let nodeStatus: WorkflowTabNode['status']
    if (live !== undefined) {
      nodeStatus = live
    } else if (status.mode === 'bug-fix-path' && !onPath.has(catalog.id) && catalog.onFullGoPath) {
      nodeStatus = 'clipped'
    } else if (status.terminal !== undefined) {
      nodeStatus = 'skipped'
    } else {
      nodeStatus = onPath.has(catalog.id) ? 'locked' : 'skipped'
    }
    return {
      id: catalog.id,
      status: nodeStatus,
      catalog,
      onPath: onPath.has(catalog.id) || catalog.id === 'drift',
      ...(annotation?.reasonCodes === undefined ? {} : { reasonCodes: annotation.reasonCodes }),
      ...(annotation?.artifacts === undefined ? {} : { artifacts: annotation.artifacts }),
      ...(annotation?.detail === undefined ? {} : { detail: annotation.detail }),
      ...(nodeMetrics === undefined ? {} : { metrics: nodeMetrics }),
      transitionsIn: transitionsInto(catalog.id),
      transitionsOut: transitionsFrom(catalog.id),
    }
  })

  const gate = gateToTabView(status)
  return {
    empty: false,
    changeId: status.changeId,
    mode: status.mode,
    current: status.current,
    ...(status.intake === undefined ? {} : { intake: status.intake }),
    nodes,
    graph,
    projectionVersion: status.projectionVersion,
    ...(status.updatedAt === undefined ? {} : { updatedAt: status.updatedAt }),
    ...(status.sourceRevision === undefined ? {} : { sourceRevision: status.sourceRevision }),
    ...(status.baseline === undefined ? {} : { baselineId: status.baseline.baselineId }),
    ...(status.route === undefined ? {} : { route: status.route }),
    ...(status.openspecSkipped === undefined ? {} : { openspecSkipped: status.openspecSkipped }),
    changes,
    selectedChangeId: status.changeId,
    actions: actionsFor(status),
    ...(metrics?.totals === undefined || Object.keys(metrics.totals).length === 0
      ? {}
      : { metrics: metrics.totals }),
    ...(gate === undefined ? {} : { gate }),
    ...(extras.lanes === undefined ? {} : { lanes: extras.lanes }),
    ...(extras.resume === undefined ? {} : { resume: extras.resume }),
  }
}

function transitionsInto(node: WorkflowNode) {
  return TRANSITIONS.filter(r => r.to === node).map(r => ({
    id: r.id,
    condition: r.condition,
    from: r.from,
  }))
}

function transitionsFrom(node: WorkflowNode) {
  return TRANSITIONS.filter(r => r.from === node).map(r => ({
    id: r.id,
    condition: r.condition,
    to: r.to,
  }))
}

/**
 * Derive semi-interactive actions for Phase 4.
 *
 * The gate action is the §18.5 exception to "stages are driven from chat":
 * a parked gate exposes exactly one enabled action — the customer's
 * confirmation — and it carries the gate's own label rather than a generic
 * "start stage" one.
 * @param status - live status.
 * @returns actions.
 */
function actionsFor(status: WorkflowStatus): WorkflowTabAction[] {
  const actions: WorkflowTabAction[] = []
  const pending = status.intake?.confirmation === 'pending'
  const gate = gateToTabView(status)

  actions.push({
    id: 'confirm-intake',
    enabled: pending === true,
    labelKey: 'action.confirmIntake',
    ...(pending ? {} : { reason: 'Intake already confirmed or absent' }),
  })
  actions.push({
    id: 'reject-intake',
    enabled: pending === true,
    labelKey: 'action.rejectIntake',
    ...(pending ? {} : { reason: 'Intake already confirmed or absent' }),
  })
  actions.push({
    id: 'supplement-intake',
    enabled: status.mode === 'clarify-required' || pending === true,
    labelKey: 'action.supplementIntake',
    reason: 'Reply in chat to add details, then re-run intake',
  })

  if (status.intake?.confirmation === 'confirmed' && status.current === 'intake') {
    actions.push({
      id: 'transition',
      enabled: true,
      target: 'open',
      labelKey: 'action.enterOpen',
    })
  } else {
    actions.push({
      id: 'transition',
      enabled: false,
      labelKey: 'action.enterOpen',
      reason: pending ? 'Confirm intake first' : 'Open already entered or not ready',
    })
  }

  actions.push({
    id: 'start-stage',
    enabled: false,
    labelKey: 'action.startStage',
    reason: 'Stage handlers land in Phase 5',
  })
  // Gate B *is* the archive confirmation, so its button replaces the Phase-5
  // stub rather than sitting next to a second, disabled one of the same name.
  if (gate?.id !== 'verify-to-archive') {
    actions.push({
      id: 'confirm-archive',
      enabled: false,
      labelKey: 'action.confirmArchive',
      reason: 'Archive lands in Phase 5',
    })
  }

  if (gate !== undefined) {
    actions.push({
      id: 'confirm-gate',
      enabled: true,
      labelKey: gate.actionKey,
      target: gate.node === 'design' ? 'plan' : 'completed',
      reason: `Gate ${gate.id} is parked; confirming drives the next stage (§18.5)`,
    })
  }

  if (status.current === 'drift') {
    actions.push({
      id: 'resume',
      enabled: true,
      labelKey: 'action.resume',
      reason: 'Drift never resolves itself — pick a rollback node (§19.4)',
    })
  }

  return actions
}
