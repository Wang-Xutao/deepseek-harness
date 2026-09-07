/**
 * Change intake classification types (workflow N0).
 * @module @deepseek-ai/dsh-baf-core/intake
 */

/** High-level change kind after intake. */
export type ChangeKind =
  | 'new-requirement'
  | 'bug'
  | 'maintenance'
  | 'unknown'

/** Workflow execution mode selected by intake. */
export type WorkflowMode = 'full-go' | 'bug-fast-path' | 'clarify-required'

/** Estimated blast radius used by fast-path policy. */
export type AffectedScope =
  | 'single-file'
  | 'small-local'
  | 'cross-module'
  | 'public-api'
  | 'unknown'

/** Intake confirmation state. */
export type IntakeConfirmation = 'pending' | 'confirmed' | 'rejected'

/**
 * Durable intake classification for one change (N0 product).
 * Written to projection before any implement-stage mutation is allowed.
 */
export interface ChangeIntake {
  /** Owning change id. */
  readonly changeId: string
  /** Classified kind. */
  readonly kind: ChangeKind
  /** Selected workflow mode. */
  readonly mode: WorkflowMode
  /** Estimated scope. */
  readonly affectedScope: AffectedScope
  /** Model/rule confidence in [0, 1]. */
  readonly confidence: number
  /** Reason codes from the rule engine. */
  readonly reasonCodes: readonly string[]
  /** Whether OpenSpec artifacts are required for this change. */
  readonly openspecRequired: boolean
  /** Whether a human must confirm before implement. */
  readonly requiresUserConfirmation: boolean
  /** Confirmation state. */
  readonly confirmation: IntakeConfirmation
  /** Free-form summary of the user request. */
  readonly summary: string
}
