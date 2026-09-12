/**
 * BAF workflow Tab Remote request types.
 * @module @deepseek-ai/dsh-client-ui-baf-workflow/types
 */

import type { TerminalState, WorkflowNode } from '@deepseek-ai/dsh-baf-core/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Request carrying the session whose cwd owns the projection. */
export interface BafWorkflowSessionRequest {
  readonly sessionId: SessionId
  readonly changeId?: string
}

/** Confirm / reject intake for one change. */
export interface BafWorkflowChangeRequest {
  readonly sessionId: SessionId
  readonly changeId: string
}

/** Start intake from a free-form description. */
export interface BafWorkflowStartIntakeRequest {
  readonly sessionId: SessionId
  readonly description: string
}

/** Request a legal transition. */
export interface BafWorkflowTransitionRequest {
  readonly sessionId: SessionId
  readonly changeId: string
  readonly to: WorkflowNode | TerminalState
  /** JSON-safe evidence payload attached to the transition. */
  readonly evidence?: Readonly<Record<string, string | number | boolean | null>>
}
