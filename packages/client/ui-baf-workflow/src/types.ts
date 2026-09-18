/**
 * BAF workflow Tab Remote request types.
 * @module @deepseek-ai/dsh-client-ui-baf-workflow/types
 */

import type { TerminalState, WorkflowNode } from '@deepseek-ai/dsh-baf-core/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * Mirrors `WorkflowMode` from baf-core (declared locally to avoid pulling
 * the full intake module across the Remote boundary).
 */
export type BafWorkflowMode = 'full-go' | 'bug-fast-path' | 'clarify-required'

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

/**
 * Drift rollback (§19.5 / T13).
 *
 * Omitting `node` re-reads the candidate set — the Tab calls it that way when
 * the customer opens the 「复位到…」菜单, so the list on screen is the freshly
 * detected one. Passing `node` drives the rollback; the pipeline re-validates
 * the target against its own candidate set and rejects an illegal one.
 */
export interface BafWorkflowResumeRequest {
  readonly sessionId: SessionId
  readonly changeId: string
  readonly node?: WorkflowNode
}

/**
 * One row of the workspace change Dashboard (`listChanges` Remote return).
 *
 * Mirrors `ProjectionIndexEntry` from baf-workflow; declared here as the
 * typert boundary contract so the wire payload stays owned by this package.
 */
export interface BafWorkflowChangeRow {
  readonly changeId: string
  readonly mode: BafWorkflowMode
  readonly current: WorkflowNode | TerminalState
  readonly seq: number
  readonly updatedAt: string
}

/**
 * §22.14 Tab gate-card resolve: dispatch the registered command for a chosen
 * `(gateId, optionId)` pair. The Tab renders the options straight from
 * `WorkflowTabGate.options` / `WorkflowTabPendingGate.options` and posts the
 * customer click back as this request.
 *
 * `changeId` is required for change-scoped gates (intake-classify,
 * design-confirm, verify-archive, abandon, resume) and unused for the
 * workspace-scoped scaffold gate — passing it for scaffold is harmless.
 * The host validates the pair against §22 GATE_REGISTRY; unknown `gateId` /
 * `optionId` returns a refusal card (the workflow never re-dispatches
 * something the registry did not advertise).
 */
export interface BafWorkflowGateResolveRequest {
  readonly sessionId: SessionId
  readonly changeId?: string
  readonly gateId: string
  readonly optionId: string
}
