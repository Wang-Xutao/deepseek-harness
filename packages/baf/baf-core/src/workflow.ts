/**
 * Go workflow graph vocabulary and the authoritative transition table.
 * @module @deepseek-ai/dsh-baf-core/workflow
 */

import type { ChangeIntake, WorkflowMode } from './intake.ts'

/** Ordered workflow nodes (N0–N8 plus terminal handling). */
export const WORKFLOW_NODES = [
  'intake',
  'open',
  'clarify',
  'design',
  'plan',
  'implement',
  'verify',
  'archive',
  'drift',
] as const

/** One workflow node id. */
export type WorkflowNode = (typeof WORKFLOW_NODES)[number]

/** Per-node lifecycle status for UI and projection. */
export type NodeStatus =
  | 'locked'
  | 'available'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'drifted'
  | 'skipped'

/** Terminal change outcomes. */
export type TerminalState = 'completed' | 'abandoned'

/** One allowed edge from the 5.2 transition table. */
export interface TransitionRule {
  /** Table id (T1…T16, T4a, T7a). */
  readonly id: string
  /** Current node, or null when no change exists yet. */
  readonly from: WorkflowNode | null
  /** Target node (or terminal marker via special handling in Phase 4). */
  readonly to: WorkflowNode | TerminalState
  /** Modes that may use this edge; empty means any mode. */
  readonly modes: readonly WorkflowMode[]
  /** Short condition summary for diagnostics. */
  readonly condition: string
}

/**
 * Authoritative transition table (enterprise-workflow §5.2).
 * Phase 4's transition executor is the sole writer of stage changes; this
 * table is the shared read-only vocabulary for UI and domain code.
 */
export const TRANSITIONS: readonly TransitionRule[] = [
  { id: 'T1', from: null, to: 'intake', modes: [], condition: 'any BAF input' },
  { id: 'T2', from: 'intake', to: 'open', modes: ['full-go'], condition: 'confirmed new requirement or high-risk bug' },
  { id: 'T3', from: 'intake', to: 'open', modes: ['bug-fast-path'], condition: 'confirmed low-risk bug and baseline allows fast path' },
  { id: 'T4', from: 'open', to: 'clarify', modes: ['full-go'], condition: 'skeleton created; clarify not merged into open' },
  { id: 'T4a', from: 'open', to: 'design', modes: ['full-go'], condition: 'clarify merged into open with recorded rationale' },
  { id: 'T5', from: 'open', to: 'implement', modes: ['bug-fast-path'], condition: 'root cause and scope recorded' },
  { id: 'T6', from: 'clarify', to: 'design', modes: ['full-go'], condition: 'blocking questions answered or deferred; acceptance testable' },
  { id: 'T7', from: 'design', to: 'plan', modes: ['full-go'], condition: 'design confirmed; not merged into plan' },
  { id: 'T7a', from: 'design', to: 'implement', modes: ['full-go'], condition: 'design merged into plan with recorded tasks and rollback' },
  { id: 'T8', from: 'plan', to: 'implement', modes: ['full-go'], condition: 'plan has file scope, verify commands, and rollback' },
  { id: 'T9', from: 'implement', to: 'verify', modes: [], condition: 'all tasks have results and no out-of-scope edits' },
  { id: 'T10', from: 'verify', to: 'archive', modes: [], condition: 'required checks passed with no drift' },
  { id: 'T11', from: 'verify', to: 'implement', modes: [], condition: 'required check failed' },
  { id: 'T12', from: null, to: 'drift', modes: [], condition: 'evidence changed on an active change' },
  { id: 'T13', from: 'drift', to: 'intake', modes: [], condition: 'earliest affected node restored or reconfirmed (target from evidence)' },
  { id: 'T14', from: 'archive', to: 'completed', modes: [], condition: 'human confirmed and atomic archive succeeded' },
  { id: 'T15', from: 'implement', to: 'clarify', modes: ['bug-fast-path'], condition: 'escalated to full-go; backfill clarify/design/plan' },
  { id: 'T16', from: null, to: 'abandoned', modes: [], condition: 'user confirmed abandon on an active change' },
]

/** Route identity frozen for one phase turn. */
export interface RouteSummary {
  readonly provider: string
  readonly model: string
  readonly source: string
  readonly phase: WorkflowNode
}

/** Baseline lock recorded when a change opens. */
export interface BaselineLock {
  readonly baselineId: string
  readonly sourceRevision: string
  readonly lockedAt: string
  /**
   * Content hash of the locked baseline manifest (`hashCanonical`), which is
   * what the drift detector compares to spot "same id, different content".
   * Optional: logs written before Phase 8.9 did not record it, and the
   * detector then skips the content comparison rather than reporting a
   * permanent false drift.
   */
  readonly contentHash?: string
}

/** Per-node skip / block annotation for Tab and diagnostics. */
export interface NodeAnnotation {
  /** Skip / block reason codes (e.g. fast-path cut, guard deny). */
  readonly reasonCodes?: readonly string[]
  /** Artifact paths recorded when the stage completed. */
  readonly artifacts?: readonly string[]
  /** Human-readable block / failure summary. */
  readonly detail?: string
}

/** Recoverable workflow status for one change. */
export interface WorkflowStatus {
  readonly changeId: string
  readonly mode: WorkflowMode
  readonly current: WorkflowNode | TerminalState
  readonly nodes: Readonly<Partial<Record<WorkflowNode, NodeStatus>>>
  /** Optional per-node annotations (skip reasons, artifacts, failures). */
  readonly annotations?: Readonly<Partial<Record<WorkflowNode, NodeAnnotation>>>
  readonly intake?: ChangeIntake
  readonly route?: RouteSummary
  readonly baseline?: BaselineLock
  readonly sourceRevision?: string
  readonly projectionVersion: number
  readonly terminal?: TerminalState
  /** ISO timestamp of the last projection event. */
  readonly updatedAt?: string
  /** Whether OpenSpec stages were skipped on the active mode. */
  readonly openspecSkipped?: {
    readonly skipped: boolean
    readonly reasonCodes: readonly string[]
  }
}
