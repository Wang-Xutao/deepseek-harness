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
}

/** A parked mandatory confirmation gate (§18.5) — Tab highlight + single action. */
export interface WorkflowTabGate {
  readonly id: ConfirmGate
  /** Node the change is parked on: `design` for gate A, `verify` for gate B. */
  readonly node: WorkflowNode
  /** i18n key for the button that confirms this gate. */
  readonly actionKey: string
}

/** One path lane in the §18.4.3 dual-lane view. */
export interface WorkflowTabLane {
  readonly id: 'bug-fast-path' | 'full-go'
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
  /** Where the full-go path picked up. */
  readonly to: WorkflowNode
  readonly at: string
  readonly cause: string
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

/** One node card in the Tab. */
export interface WorkflowTabNode {
  readonly id: WorkflowNode
  readonly status: NodeStatus | 'template'
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
  /** Set after a T15 escalation, so the Tab draws both paths (§18.4.3). */
  readonly lanes?: WorkflowTabLanes
  /** Set while the change is parked in drift, so the Tab offers a rollback (§19.5). */
  readonly resume?: WorkflowTabResume
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
      onPath: catalog.onFullGo,
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
    return {
      id: catalog.id,
      status: live ?? (onPath.has(catalog.id) ? 'locked' : 'skipped'),
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
