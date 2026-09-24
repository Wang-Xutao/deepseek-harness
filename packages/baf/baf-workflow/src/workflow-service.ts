/**
 * WorkflowService implementation over ProjectionStore + transition + intake.
 * @module @deepseek-ai/dsh-baf-workflow/workflow-service
 */

import {
  BafError,
  type IntakeInput,
  type IntakeResult,
  type ResumeResult,
  type TerminalState,
  type TransitionInput,
  type TransitionResult,
  type TransitionSource,
  type WorkflowIdentity,
  type WorkflowNode,
  type WorkflowService,
  type WorkflowStatus,
} from '@deepseek-ai/dsh-baf-core'
import { classifyIntake } from './intake.ts'
import { ProjectionStore } from './projection.ts'
import { assertTransitionAccepted, decideTransition } from './transition.ts'

/** Options for {@link createWorkflowService}. */
export interface WorkflowServiceOptions {
  readonly store: ProjectionStore
}

/**
 * Create a file-backed {@link WorkflowService}.
 * @param options - store binding.
 * @returns service implementation.
 */
export function createWorkflowService(options: WorkflowServiceOptions): WorkflowService {
  const { store } = options

  return {
    async intake(input: IntakeInput): Promise<IntakeResult> {
      const intake = classifyIntake(input)
      const existing = await store.readEvents(intake.changeId)
      if (existing.events.length > 0) {
        throw new BafError('invalid_transition', 'change already has projection events', {
          changeId: intake.changeId,
        })
      }
      const { status } = await store.append(intake.changeId, 0, meta => ({
        type: 'intake-classified',
        intake,
        ...meta,
      }))
      return { intake: status.intake ?? intake }
    },

    async status(input: WorkflowIdentity): Promise<WorkflowStatus> {
      return store.readStatus(input.changeId)
    },

    async transition(input: TransitionInput): Promise<TransitionResult> {
      const status = await store.readStatus(input.changeId)
      const decision = decideTransition({
        status,
        to: input.to,
        ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
      })
      if (!decision.accepted) {
        await store.append(input.changeId, status.projectionVersion, meta => ({
          type: 'transition-rejected',
          from: input.from,
          to: input.to,
          reason: decision.reason ?? 'invalid_transition',
          ...meta,
        })).catch(() => undefined)
        assertTransitionAccepted(decision, input.from, input.to)
      }

      const next = await applyAcceptedTransition(store, status, input.to, input.evidence)
      return { accepted: true, status: next }
    },

    async resume(input: WorkflowIdentity): Promise<ResumeResult> {
      const status = await store.readStatus(input.changeId)
      // §19.3: a T13 resume moves `current` off `drift` and clears the park,
      // so the parked pseudo-node is the single test for "still drifted".
      const drifted = status.current === 'drift'
      return { status, drifted }
    },
  }
}

/**
 * Append stage events for an accepted transition.
 * @param store - projection store.
 * @param status - current status.
 * @param to - target.
 * @param evidence - optional evidence.
 * @returns new status.
 */
async function applyAcceptedTransition(
  store: ProjectionStore,
  status: WorkflowStatus,
  to: WorkflowNode | TerminalState,
  evidence: Readonly<Record<string, unknown>> | undefined,
): Promise<WorkflowStatus> {
  let version = status.projectionVersion
  const source = readSource(evidence)

  if (to === 'abandoned') {
    const { status: next } = await store.append(status.changeId, version, meta => ({
      type: 'change-abandoned',
      ...(source === undefined ? {} : { source }),
      ...meta,
    }))
    return next
  }

  if (to === 'completed') {
    const { status: next } = await store.append(status.changeId, version, meta => ({
      type: 'change-archived',
      ...(source === undefined ? {} : { source }),
      ...meta,
    }))
    return next
  }

  if (status.current !== 'intake' && status.nodes[status.current as WorkflowNode] === 'in-progress') {
    const current = status.current as WorkflowNode
    const { status: completed } = await store.append(status.changeId, version, meta => ({
      type: 'stage-completed',
      node: current,
      artifacts: Array.isArray(evidence?.artifacts) ? evidence.artifacts as string[] : [],
      ...meta,
    }))
    version = completed.projectionVersion
    status = completed
  }

  if (to === 'open' && status.intake?.confirmation !== 'confirmed') {
    // Confirming via transition to open still requires an explicit confirm path;
    // transition executor already gated this. Keep assert for safety.
    throw new BafError('intake_confirmation_required', 'confirm intake before open', {
      changeId: status.changeId,
    })
  }

  const { status: next } = await store.append(status.changeId, version, meta => ({
    type: 'stage-entered',
    node: to,
    ...(typeof evidence?.cause === 'string' ? { cause: evidence.cause } : {}),
    ...(source === undefined ? {} : { source }),
    ...meta,
  }))
  return next
}

/** Read the optional `source` field from evidence (convention, §22.15 B). */
function readSource(evidence: Readonly<Record<string, unknown>> | undefined): TransitionSource | undefined {
  const value = evidence?.source
  return value === 'slash' || value === 'cli' || value === 'tab' || value === 'gate-card' || value === 'model-tool'
    ? value
    : undefined
}

/**
 * Confirm a pending intake classification and optionally enter open.
 * @param store - projection store.
 * @param changeId - change id.
 * @param by - confirmation source.
 * @returns updated status.
 */
export async function confirmIntake(
  store: ProjectionStore,
  changeId: string,
  by: 'user' | 'rule' = 'user',
): Promise<WorkflowStatus> {
  const status = await store.readStatus(changeId)
  if (status.intake === undefined) {
    throw new BafError('invalid_transition', 'no intake to confirm', { changeId })
  }
  if (status.intake.confirmation === 'confirmed') return status
  const { status: next } = await store.append(changeId, status.projectionVersion, meta => ({
    type: 'intake-confirmed',
    by,
    ...meta,
  }))
  // 【变更】2026-09-24 (demo6 问题 6): settle the pre-judgment KIND at the
  // moment the path is settled — the customer just picked 完整流程 /
  // 缺陷修复路径, so an unknown keyword kind derives from that pick
  // (bug-fix→bug, full-go→new-requirement) instead of reading
  // 「待分类/归档确定」 for the whole flow. Scope stays 待定 until the plan
  // freezes the allowlist (its own settle at plan completion).
  if (next.intake?.kind === 'unknown') {
    const kind = next.mode === 'bug-fix-path' ? 'bug' : 'new-requirement'
    const { status: settled } = await store.append(next.changeId, next.projectionVersion, meta => ({
      type: 'intake-settled' as const,
      kind,
      reasonCodes: ['settled-at-confirm'] as const,
      ...meta,
    }))
    return settled
  }
  return next
}

/**
 * §22.17 J — record the customer's path override at the classify gate
 * (`/baf-workflow-classify confirm mode=…`). Legal while the intake is still
 * pending confirmation, or — the rescue arm — while a confirmed intake still
 * sits on the unresolved `clarify-required` verdict; a no-op when the
 * requested mode already holds.
 * @param store - projection store.
 * @param changeId - change id.
 * @param to - the customer's chosen path.
 * @returns updated status (unchanged when the mode already matches).
 */
export async function setIntakeMode(
  store: ProjectionStore,
  changeId: string,
  to: 'full-go-path' | 'bug-fix-path',
): Promise<WorkflowStatus> {
  const status = await store.readStatus(changeId)
  if (status.intake === undefined) {
    throw new BafError('invalid_transition', 'no intake to override', { changeId })
  }
  // Same-mode re-confirm is a no-op, not an error: the dialog's path options
  // always carry `mode=`, so retrying a bug-path confirm after a
  // missing-fields park must sail through (§22.17 J).
  if (status.intake.mode === to) return status
  // A confirmed change with a *drivable* mode can no longer re-route. The one
  // exception is `clarify-required`: that mode can never drive (no transition
  // rule matches it), so it is not a chosen path but an unresolved verdict —
  // historically reachable via confirm-without-mode (Tab button / hand-typed
  // slash). Accepting the override here is the only recovery short of
  // abandoning the change (2026-09-20 incident review).
  if (status.intake.confirmation !== 'pending' && status.intake.mode !== 'clarify-required') {
    throw new BafError('invalid_transition', 'intake already confirmed; mode can no longer change', { changeId })
  }
  // `from` is audit-only (the fold keys off `to`); narrow WorkflowMode for
  // the event type — anything unexpected records as clarify-required.
  const from = status.mode === 'full-go-path' || status.mode === 'bug-fix-path' ? status.mode : 'clarify-required'
  const { status: next } = await store.append(changeId, status.projectionVersion, meta => ({
    type: 'intake-mode-set',
    from,
    to,
    by: 'user' as const,
    ...meta,
  }))
  return next
}

/**
 * Reject a pending intake (marks abandoned without archive).
 * @param store - projection store.
 * @param changeId - change id.
 * @returns updated status.
 */
export async function rejectIntake(
  store: ProjectionStore,
  changeId: string,
): Promise<WorkflowStatus> {
  const status = await store.readStatus(changeId)
  const { status: next } = await store.append(changeId, status.projectionVersion, meta => ({
    type: 'change-abandoned',
    ...meta,
  }))
  return next
}
