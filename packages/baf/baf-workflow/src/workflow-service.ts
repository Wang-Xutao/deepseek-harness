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
