/**
 * Client-local wire types for the BAF 工作流 Tab (mirrors baf-core tab-view).
 * Kept browser-safe so the Client face never pulls Node modules from baf-core.
 */
export type WorkflowNodeId =
  | 'intake'
  | 'open'
  | 'clarify'
  | 'design'
  | 'plan'
  | 'implement'
  | 'verify'
  | 'archive'
  | 'drift'

export type TerminalStateId = 'completed' | 'abandoned'

/** Mandatory customer-confirmation gate the change is parked on (§18.5). */
export type ConfirmGateId = 'design-to-plan' | 'verify-to-archive'

/** One path lane in the §18.4.3 dual-lane view. */
export interface WorkflowTabLaneView {
  readonly id: 'bug-fix-path' | 'full-go-path'
  readonly nodes: readonly WorkflowNodeId[]
  /** Status **within this lane's slice** of the event log, not the live one. */
  readonly status: Readonly<Partial<Record<WorkflowNodeId, NodeStatusId>>>
  readonly labelKey: string
}

/** The T15 escalation edge joining the two lanes (§18.4.3). */
export interface WorkflowTabUpgradeEdgeView {
  readonly from: WorkflowNodeId
  readonly to: WorkflowNodeId
  readonly at: string
  readonly cause: string
  readonly labelKey: string
}

/** Dual-lane payload; present only after a `mode-upgraded` event. */
export interface WorkflowTabLanesView {
  readonly lanes: readonly WorkflowTabLaneView[]
  readonly upgrade: WorkflowTabUpgradeEdgeView
  /** Pre-upgrade artifacts, kept for traceability (§18.4.3). */
  readonly preservedArtifacts: readonly string[]
}

export type NodeStatusId =
  | 'locked'
  | 'available'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'drifted'
  | 'skipped'
  | 'template'

export interface WorkflowTabNodeView {
  readonly id: WorkflowNodeId
  readonly status: NodeStatusId
  readonly catalog: {
    readonly id: WorkflowNodeId
    readonly titleKey: string
    readonly purpose: string
    readonly prerequisites: readonly string[]
    readonly actions: readonly string[]
    readonly artifacts: readonly string[]
    readonly completion: readonly string[]
    readonly failure: readonly string[]
    readonly entries: readonly string[]
  }
  readonly onPath: boolean
  readonly reasonCodes?: readonly string[]
  readonly artifacts?: readonly string[]
  readonly detail?: string
  readonly metrics?: {
    readonly durationMs?: number
    readonly inputTokens?: number
    readonly outputTokens?: number
  }
  readonly transitionsIn: readonly { id: string; condition: string; from: WorkflowNodeId | null }[]
  readonly transitionsOut: readonly {
    id: string
    condition: string
    to: WorkflowNodeId | TerminalStateId
  }[]
}

export interface WorkflowTabView {
  readonly empty: boolean
  readonly changeId: string | null
  readonly mode: string
  readonly current: WorkflowNodeId | TerminalStateId | null
  readonly intake?: {
    readonly changeId: string
    readonly kind: string
    readonly mode: string
    readonly affectedScope: string
    readonly confidence: number
    readonly reasonCodes: readonly string[]
    readonly openspecRequired: boolean
    readonly requiresUserConfirmation: boolean
    readonly confirmation: string
    readonly summary: string
  }
  readonly nodes: readonly WorkflowTabNodeView[]
  readonly graph: {
    readonly mode: string
    readonly nodes: readonly {
      readonly id: WorkflowNodeId | TerminalStateId
      readonly column: number
      readonly row: number
      readonly onPath: boolean
    }[]
    readonly edges: readonly {
      readonly id: string
      readonly from: WorkflowNodeId | null
      readonly to: WorkflowNodeId | TerminalStateId
      readonly kind: string
      readonly condition: string
    }[]
  }
  readonly projectionVersion: number
  readonly updatedAt?: string
  readonly sourceRevision?: string
  readonly baselineId?: string
  readonly openspecSkipped?: {
    readonly skipped: boolean
    readonly reasonCodes: readonly string[]
  }
  readonly changes: readonly {
    changeId: string
    mode: string
    current: WorkflowNodeId | TerminalStateId
  }[]
  readonly selectedChangeId: string | null
  readonly actions: readonly {
    readonly id: string
    readonly enabled: boolean
    readonly reason?: string
    readonly target?: WorkflowNodeId | TerminalStateId
    readonly labelKey: string
  }[]
  readonly blockedReason?: string
  readonly metrics?: {
    readonly totalDurationMs?: number
    readonly totalInputTokens?: number
    readonly totalOutputTokens?: number
  }
  /** Set while the change is parked on gate A/B (§18.5). */
  readonly gate?: {
    readonly id: ConfirmGateId
    readonly node: WorkflowNodeId
    readonly actionKey: string
    /** §22 registered gateId (`design-confirm` / `verify-archive`) — lets the
     * Tab dispatch the click back through `gateResolve`. */
    readonly gateId?: string
    /** §22 question, verbatim from the registry — Tab card body. */
    readonly question?: string
    /** §22 registered options, in registry order — rendered as one button each
     * so the Tab is equivalent to the slash/CLI option list (each option maps
     * to a single registered slash command; the host validates the pair). */
    readonly options?: readonly { readonly id: string; readonly label: string }[]
  }
  /**
   * Workspace-level gate (§22.4 scaffold). Set when the Tab's owning workspace
   * has no `.baf/baseline.yml` — only the template / pre-bootstrap view can
   * hold it (scaffold is workspace scope, not change scope). The Tab renders
   * one button per option, mirroring the slash card so the two surfaces are
   * equivalent (§22.14 principle: card = button row).
   */
  readonly pendingGate?: {
    readonly gateId: 'scaffold'
    readonly question: string
    readonly options: readonly { readonly id: string; readonly label: string }[]
  }
  /** Set after a T15 escalation, so the Tab draws both paths (§18.4.3). */
  readonly lanes?: WorkflowTabLanesView
  /** Set while the change is parked in drift, so the Tab offers a rollback (§19.5). */
  readonly resume?: {
    readonly anchor: WorkflowNodeId
    /** Legal targets, latest-first; index 0 is the recommended default. */
    readonly candidates: readonly WorkflowNodeId[]
  }
}

/** Empty template used when Remote is unavailable — still shows the full graph. */
export { buildClientTemplateTabView as buildClientEmptyTabView } from './graph-template.ts'
