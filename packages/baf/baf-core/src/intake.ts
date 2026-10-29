/**
 * Change intake classification types (workflow N0).
 * @module @deepseek-ai/dsh-baf-core/intake
 */

import type { RouteTier } from './route-tier.ts'

/** High-level change kind after intake. */
export type ChangeKind =
  | 'new-requirement'
  | 'bug'
  | 'maintenance'
  | 'unknown'

/** Workflow execution mode selected by intake. */
export type WorkflowMode = 'full-go-path' | 'bug-fix-path' | 'clarify-required'

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
 * 【变更】2026-10-29 (批次三十七 · 用户问题 4): where the intake's confidence
 * number came from.
 * - `keyword` — a path keyword matched the requirement outright (100%);
 * - `llm` — the model evaluated the requirement and returned a real percentage;
 * - `default` — neither was available (no keyword, no model) — the honest
 *   "we do not know" fallback.
 */
export type IntakeConfidenceSource = 'keyword' | 'llm' | 'default'

/**
 * 【变更】2026-10-29 (批次三十七 · 用户问题 4): the model's per-path scores in
 * percent (0..100). The recommended path is the higher of the two; both are
 * kept so the confirmation gate can explain WHY one path was recommended.
 */
export interface IntakePathConfidence {
  readonly 'full-go-path': number
  readonly 'bug-fix-path': number
}

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
  /**
   * Model/rule confidence in [0, 1].
   *
   * 【变更】2026-10-29 (批次三十七 · 用户问题 4): this is no longer one of two
   * fixed tiers. A direct keyword hit is 1 (100%); otherwise the number is the
   * model's own evaluation (a real percentage, scaled into [0,1]).
   */
  readonly confidence: number
  /**
   * 【变更】2026-10-29 (批次三十七 · 用户问题 4): where `confidence` came from.
   * Absent on records written before the upgrade.
   */
  readonly confidenceSource?: IntakeConfidenceSource
  /**
   * 【变更】2026-10-29 (批次三十七 · 用户问题 4): the path the classifier
   * recommends, independent of `mode` — `mode` is what the rules decided
   * (it can fall back to `clarify-required`), `recommendedMode` is what the
   * confidence points at. The confirmation gate marks that path as 推荐.
   */
  readonly recommendedMode?: WorkflowMode
  /**
   * 【变更】2026-10-29 (批次三十七 · 用户问题 4): the model's per-path scores
   * in percent. Absent when the classifier answered from keywords alone.
   */
  readonly pathConfidence?: IntakePathConfidence
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
  /**
   * Keyword tier hit evaluated over the FULL description at classify time
   * (fix pass #3): the durable summary is a 500-char slice, so a keyword
   * beyond the window showed 高档 in 预演 but never froze at confirm. Old
   * logs without it fall back to the summary re-evaluation.
   */
  readonly taskTierHit?: { readonly tier: RouteTier; readonly matched?: string }
}
