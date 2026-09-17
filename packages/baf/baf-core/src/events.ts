/**
 * Append-only projection event types (Phase 4 persists these).
 * @module @deepseek-ai/dsh-baf-core/events
 */

import type { ChangeIntake } from './intake.ts'
import type { BaselineLock } from './workflow.ts'
import type { TerminalState, WorkflowNode } from './workflow.ts'

/** Common envelope fields on every projection event. */
export interface ProjectionEventBase {
  /** Stable event id for idempotent append. */
  readonly eventId: string
  /** Monotonic sequence within one change log. */
  readonly seq: number
  /** ISO-8601 timestamp. */
  readonly at: string
}

/** Which mandatory customer-confirmation gate is being awaited (§18.5). */
export type ConfirmGate = 'design-to-plan' | 'verify-to-archive'

/** One projection log event. */
export type ProjectionEvent =
  | (ProjectionEventBase & { type: 'intake-classified'; intake: ChangeIntake })
  | (ProjectionEventBase & { type: 'intake-confirmed'; by: 'user' | 'rule' })
  | (ProjectionEventBase & { type: 'baseline-locked'; lock: BaselineLock })
  | (ProjectionEventBase & { type: 'stage-entered'; node: WorkflowNode; cause?: string })
  | (ProjectionEventBase & { type: 'stage-completed'; node: WorkflowNode; artifacts: string[] })
  | (ProjectionEventBase & { type: 'stage-failed'; node: WorkflowNode; reason: string })
  | (ProjectionEventBase & { type: 'drift-detected'; node: WorkflowNode; cause: string })
  | (ProjectionEventBase & {
    type: 'mode-upgraded'
    from: 'bug-fast-path'
    to: 'full-go'
    cause: string
  })
  | (ProjectionEventBase & {
    /** Coordinator parked on gate A/B awaiting an explicit customer drive (§18.5). */
    type: 'awaiting-confirm'
    gate: ConfirmGate
  })
  | (ProjectionEventBase & { type: 'change-archived' })
  | (ProjectionEventBase & { type: 'change-abandoned' })
  | (ProjectionEventBase & {
    type: 'transition-rejected'
    from: WorkflowNode | null
    to: WorkflowNode | TerminalState
    reason: string
  })
