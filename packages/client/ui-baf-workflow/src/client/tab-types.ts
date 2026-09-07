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
}

/** Empty template used when Remote is unavailable — still shows the full graph. */
export { buildClientTemplateTabView as buildClientEmptyTabView } from './graph-template.ts'
