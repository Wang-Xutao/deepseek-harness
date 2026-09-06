/**
 * Append-only projection event types (Phase 4 persists these).
 * @module @deepseek-ai/dsh-baf-core/events
 */

import type { ChangeIntake } from './intake.ts'
import type { WorkflowNode } from './workflow.ts'

/** One projection log event. */
export type ProjectionEvent =
  | { type: 'intake-classified'; intake: ChangeIntake; at: string; seq: number }
  | { type: 'intake-confirmed'; by: 'user' | 'rule'; at: string; seq: number }
  | { type: 'stage-entered'; node: WorkflowNode; at: string; seq: number }
  | { type: 'stage-completed'; node: WorkflowNode; artifacts: string[]; at: string; seq: number }
  | { type: 'stage-failed'; node: WorkflowNode; reason: string; at: string; seq: number }
  | { type: 'drift-detected'; node: WorkflowNode; cause: string; at: string; seq: number }
  | { type: 'mode-upgraded'; from: 'bug-fast-path'; to: 'full-go'; cause: string; at: string; seq: number }
  | { type: 'change-archived'; at: string; seq: number }
  | { type: 'change-abandoned'; at: string; seq: number }
