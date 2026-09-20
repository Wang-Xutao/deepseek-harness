/**
 * Transition executor against the authoritative TRANSITIONS table.
 * @module @deepseek-ai/dsh-baf-workflow/transition
 */

import {
  BafError,
  TRANSITIONS,
  type ChangeIntake,
  isHumanSource,
  type TerminalState,
  type TransitionRule,
  type WorkflowMode,
  type WorkflowNode,
  type WorkflowStatus,
} from '@deepseek-ai/dsh-baf-core'

export { isHumanSource }

/** Confirm edges whose transition must be human-originated (§22.15 B). */
export const CONFIRM_EDGES = new Set<TransitionRule['id']>([
  'T2',
  'T3',
  'T7',
  'T7a',
  'T13',
  'T14',
  'T16',
])

/** Transition request against a recovered status. */
export interface TransitionRequest {
  readonly status: WorkflowStatus
  readonly to: WorkflowNode | TerminalState
  readonly evidence?: Readonly<Record<string, unknown>>
}

/** Accepted or rejected transition decision. */
export interface TransitionDecision {
  readonly accepted: boolean
  readonly rule?: TransitionRule
  readonly reason?: string
}

/**
 * Decide whether a transition is legal for the current status.
 * Does not mutate projection; the service appends events after acceptance.
 * @param request - current status + target.
 * @returns decision.
 */
export function decideTransition(request: TransitionRequest): TransitionDecision {
  const { status, to } = request
  const from = currentAsFrom(status)

  // §21.5: `drift-detected` has exactly one writer (`driveDriftStage` →
  // `detectAndRecord` → `earliestAffectedNode`). A caller-initiated
  // `transition({to:'drift'})` used to fabricate a *different* anchor
  // (`status.current`), so the edge is refused here and the caller is pointed
  // at the detector.
  if (to === 'drift') {
    return { accepted: false, reason: 'invalid_transition' }
  }

  if (to === 'implement' && intakeBlocksImplement(status.intake)) {
    return { accepted: false, reason: 'intake_confirmation_required' }
  }

  const rule = findRule(from, to, status.mode)
  if (rule === undefined) {
    return { accepted: false, reason: 'invalid_transition' }
  }

  const evidenceFailure = checkEvidence(rule, status, request.evidence)
  if (evidenceFailure !== undefined) {
    return { accepted: false, rule, reason: evidenceFailure }
  }

  return { accepted: true, rule }
}

/**
 * Map status.current to the transition-table `from` value.
 * @param status - recovered status.
 * @returns from node or null.
 */
function currentAsFrom(status: WorkflowStatus): WorkflowNode | null {
  if (status.projectionVersion === 0) return null
  if (status.current === 'completed' || status.current === 'abandoned') return null
  return status.current
}

/**
 * Find a matching transition rule.
 * @param from - current node.
 * @param to - target.
 * @param mode - active mode.
 * @returns rule or undefined.
 */
function findRule(
  from: WorkflowNode | null,
  to: WorkflowNode | TerminalState,
  mode: WorkflowMode,
): TransitionRule | undefined {
  return TRANSITIONS.find((rule) => {
    if (rule.modes.length > 0 && !rule.modes.includes(mode)) return false

    // T13 (drift exit): the table records `intake` as the canonical target,
    // but §5.2 / §19.2 make the real target evidence-derived (the earliest
    // affected node). The check therefore runs *before* the generic `to`
    // filter, and the caller validates the target against
    // `resumeCandidates()` before calling. Terminal targets keep their own
    // rules (T14 archive / T16 abandon) so evidence checks are not skipped.
    if (rule.id === 'T13') {
      if (from !== 'drift') return false
      return to !== 'drift' && to !== 'abandoned' && to !== 'completed'
    }

    if (rule.to !== to) return false

    // Cross-cutting: drift / abandon from any active node.
    if (rule.id === 'T12' || rule.id === 'T16') return from !== null

    return rule.from === from
  })
}

/**
 * Extra evidence checks beyond the table mode filter.
 *
 * §22.15 B: confirm edges (T2/T3/T7/T7a/T13/T14/T16) require a human-originated
 * `source` in evidence. A model-driven surface (the `baf_*` model tool layer)
 * stamps `'model-tool'`, which is refused here so a tool call cannot unlock a
 * customer confirmation gate. The check runs before the switch so every
 * confirm-edge arm inherits it for free — adding a new arm and forgetting to
 * gate it would still pass this guard if the rule id sits inside
 * {@link CONFIRM_EDGES}.
 * @param rule - matched rule.
 * @param status - status.
 * @param evidence - caller evidence.
 * @returns reason code or undefined when ok.
 */
function checkEvidence(
  rule: TransitionRule,
  status: WorkflowStatus,
  evidence: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  if (CONFIRM_EDGES.has(rule.id) && !isHumanSource(evidence?.source)) {
    return 'gate_confirmation_required'
  }
  switch (rule.id) {
    case 'T2':
    case 'T3':
      if (status.intake?.confirmation !== 'confirmed') return 'intake_confirmation_required'
      break
    case 'T5':
      if (status.mode !== 'bug-fix-path') return 'invalid_transition'
      if (evidence?.rootCauseRecorded !== true) return 'invalid_transition'
      break
    case 'T10':
      if (evidence?.checksPassed !== true) return 'verify_required'
      if (evidence?.drift === true) return 'invalid_transition'
      break
    case 'T14':
    case 'T16':
      if (evidence?.humanConfirmed !== true) return 'invalid_transition'
      break
    default:
      break
  }
  return undefined
}

/**
 * Throw {@link BafError} when a decision is rejected.
 * @param decision - transition decision.
 * @param from - source.
 * @param to - target.
 */
export function assertTransitionAccepted(
  decision: TransitionDecision,
  from: WorkflowNode | null,
  to: WorkflowNode | TerminalState,
): asserts decision is TransitionDecision & { accepted: true } {
  if (decision.accepted) return
  const reason = decision.reason ?? 'invalid_transition'
  const code =
    reason === 'intake_confirmation_required'
      ? 'intake_confirmation_required'
      : reason === 'verify_required'
        ? 'verify_required'
        : reason === 'gate_confirmation_required'
          ? 'gate_confirmation_required'
          : 'invalid_transition'
  throw new BafError(code, `transition rejected: ${from ?? '∅'} → ${to}`, {
    from,
    to,
    reason,
  })
}

/**
 * Whether intake blocks implement-stage entry.
 * @param intake - intake record.
 * @returns true when implement must be refused.
 */
export function intakeBlocksImplement(intake: ChangeIntake | undefined): boolean {
  return intake === undefined || intake.confirmation !== 'confirmed'
}
