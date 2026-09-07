/**
 * Change intake classifier: heuristic suggest + rule review + decide + confirm.
 * @module @deepseek-ai/dsh-baf-workflow/intake
 */

import {
  generateChangeId,
  type AffectedScope,
  type BaselineManifest,
  type ChangeIntake,
  type ChangeKind,
  type IntakeInput,
  type WorkflowMode,
} from '@deepseek-ai/dsh-baf-core'

/** Candidate produced by suggest() before rule review. */
export interface IntakeCandidate {
  readonly kind: ChangeKind
  readonly mode: WorkflowMode
  readonly affectedScope: AffectedScope
  readonly confidence: number
  readonly reasonCodes: readonly string[]
  readonly summary: string
  readonly openspecRequired: boolean
}

/** Rule-engine review result. */
export interface IntakeReview {
  readonly kind: ChangeKind
  readonly mode: WorkflowMode
  readonly affectedScope: AffectedScope
  readonly confidence: number
  readonly reasonCodes: readonly string[]
  readonly openspecRequired: boolean
  readonly requiresUserConfirmation: boolean
}

const FEATURE_RE = /\b(feat|feature|新增|需求|实现|add\s+support|new\s+requirement)\b/i
const BUG_RE = /\b(bug|fix|修复|缺陷|crash|回归|regress)\b/i
const PUBLIC_API_RE = /\b(public\s+api|abi|header\s+api|导出\s*api|breaking)\b/i
const CROSS_RE = /\b(cross[- ]?module|多模块|跨模块|integration|全局)\b/i

/**
 * Heuristic suggest (Phase 4). A later phase may replace this with an LLM call
 * on the intake route; the rule engine remains authoritative.
 * @param input - intake input.
 * @returns candidate classification.
 */
export function suggestIntake(input: IntakeInput): IntakeCandidate {
  const text = input.description
  const scopeHint = input.affectedScopeHint ?? 'unknown'
  let kind: ChangeKind = 'unknown'
  let confidence = 0.4
  const reasonCodes: string[] = []

  if (FEATURE_RE.test(text)) {
    kind = 'new-requirement'
    confidence = 0.7
    reasonCodes.push('heuristic-feature')
  } else if (BUG_RE.test(text)) {
    kind = 'bug'
    confidence = 0.7
    reasonCodes.push('heuristic-bug')
  } else {
    reasonCodes.push('heuristic-unknown')
  }

  let affectedScope: AffectedScope = scopeHint
  if (PUBLIC_API_RE.test(text)) {
    affectedScope = 'public-api'
    reasonCodes.push('heuristic-public-api')
  } else if (CROSS_RE.test(text)) {
    affectedScope = 'cross-module'
    reasonCodes.push('heuristic-cross-module')
  }

  const mode: WorkflowMode = kind === 'bug' && (affectedScope === 'single-file' || affectedScope === 'small-local')
    ? 'bug-fast-path'
    : kind === 'unknown'
      ? 'clarify-required'
      : 'full-go'

  return {
    kind,
    mode,
    affectedScope,
    confidence,
    reasonCodes,
    summary: text.trim().slice(0, 500),
    openspecRequired: mode === 'full-go',
  }
}

/**
 * Rule-engine review of a candidate against baseline policy and scope facts.
 * @param candidate - suggest() output.
 * @param baseline - optional baseline (missing blocks fast path).
 * @returns reviewed decision fields.
 */
export function reviewIntake(
  candidate: IntakeCandidate,
  baseline: BaselineManifest | undefined,
): IntakeReview {
  const reasonCodes = [...candidate.reasonCodes]
  const kind = candidate.kind
  const affectedScope = candidate.affectedScope
  let { mode, confidence, openspecRequired } = candidate

  const forceFullGoScopes: AffectedScope[] = ['cross-module', 'public-api']
  if (forceFullGoScopes.includes(affectedScope)) {
    mode = 'full-go'
    openspecRequired = true
    reasonCodes.push(`scope-forces-full-go:${affectedScope}`)
  }

  if (kind === 'new-requirement') {
    mode = 'full-go'
    openspecRequired = true
    reasonCodes.push('new-requirement-full-go')
  }

  if (mode === 'bug-fast-path') {
    if (baseline === undefined) {
      mode = 'full-go'
      openspecRequired = true
      reasonCodes.push('baseline_unavailable')
      confidence = Math.min(confidence, 0.5)
    } else if (!baseline.workflow.bugFastPath.allowed) {
      mode = 'full-go'
      openspecRequired = true
      reasonCodes.push('fast-path-disallowed')
    } else {
      const max = baseline.workflow.bugFastPath.maxScope
      const order = ['single-file', 'small-local', 'cross-module', 'public-api', 'unknown'] as const
      if (order.indexOf(affectedScope) > order.indexOf(max) || affectedScope === 'unknown') {
        mode = 'full-go'
        openspecRequired = true
        reasonCodes.push('scope-exceeds-fast-path')
      } else {
        openspecRequired = false
        reasonCodes.push('fast-path-allowed')
      }
    }
  }

  if (kind === 'unknown' || confidence < 0.55 || affectedScope === 'unknown') {
    mode = 'clarify-required'
    reasonCodes.push('clarify-required')
  }

  if (baseline?.workflow.requireOpenSpec === true && mode === 'full-go') {
    openspecRequired = true
  }

  return {
    kind,
    mode,
    affectedScope,
    confidence,
    reasonCodes: Object.freeze(reasonCodes),
    openspecRequired,
    requiresUserConfirmation: true,
  }
}

/**
 * Synthesize a durable ChangeIntake from input + review.
 * @param input - intake input.
 * @param review - rule review.
 * @param changeId - optional pre-minted id.
 * @returns ChangeIntake pending confirmation.
 */
export function decideIntake(
  input: IntakeInput,
  review: IntakeReview,
  changeId: string = generateChangeId(input.description),
): ChangeIntake {
  return {
    changeId,
    kind: review.kind,
    mode: review.mode,
    affectedScope: review.affectedScope,
    confidence: review.confidence,
    reasonCodes: review.reasonCodes,
    openspecRequired: review.openspecRequired,
    requiresUserConfirmation: review.requiresUserConfirmation,
    confirmation: 'pending',
    summary: input.description.trim().slice(0, 500),
  }
}

/**
 * Run suggest → review → decide for one intake request.
 * @param input - intake input.
 * @returns pending ChangeIntake.
 */
export function classifyIntake(input: IntakeInput): ChangeIntake {
  const candidate = suggestIntake(input)
  const review = reviewIntake(candidate, input.baseline)
  return decideIntake(input, review)
}
