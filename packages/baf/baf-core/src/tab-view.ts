/**
 * Browser-safe Tab view model for the BAF 工作流 conversation Tab.
 * @module @deepseek-ai/dsh-baf-core/tab-view
 */

import { NODE_CATALOG } from './catalog.ts'
import { buildWorkflowGraph } from './graph.ts'
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
      reason: 'Start intake from chat or /baf-open',
    }],
  }
}

/**
 * Map a recovered status into the Tab view.
 * @param status - workflow status.
 * @param changes - index rows.
 * @param metrics - optional derived stage metrics.
 * @returns tab view.
 */
export function statusToTabView(
  status: WorkflowStatus,
  changes: readonly { changeId: string; mode: WorkflowMode; current: WorkflowNode | TerminalState }[],
  metrics?: {
    readonly byNode?: Readonly<Partial<Record<WorkflowNode, WorkflowNodeMetrics>>>
    readonly totals?: WorkflowTabMetrics
  },
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
 * @param status - live status.
 * @returns actions.
 */
function actionsFor(status: WorkflowStatus): WorkflowTabAction[] {
  const actions: WorkflowTabAction[] = []
  const pending = status.intake?.confirmation === 'pending'

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
  actions.push({
    id: 'confirm-archive',
    enabled: false,
    labelKey: 'action.confirmArchive',
    reason: 'Archive lands in Phase 5',
  })

  return actions
}
