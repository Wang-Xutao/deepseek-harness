/**
 * Abandon flow (§12 Phase 5.8, §5.2 T16). Records `change-abandoned` after
 * explicit user confirmation; failure leaves the change active. Idempotent:
 * re-confirming an already-abandoned change returns the current status.
 *
 * The action only writes the terminal event; the OpenSpec change directory is
 * preserved so the change record, audit trail, and projection history remain
 * inspectable. Drift-stage history and any prior `change-abandoned` events are
 * never overwritten or deleted.
 *
 * @module @deepseek-ai/dsh-baf-workflow/stages/abandon
 */

import {
  BafError,
  isHumanSource,
  type TransitionSource,
  type WorkflowStatus,
} from '@deepseek-ai/dsh-baf-core'
import type { StageContext } from './context.ts'

/** Result of a successful abandon drive. */
export interface AbandonStageResult {
  readonly status: WorkflowStatus
  /** Whether this call performed the write; false when already terminal. */
  readonly recorded: boolean
}

/** Options for {@link driveAbandon}. */
export interface AbandonOptions {
  readonly changeId: string
  /** Explicit user confirmation (T16 evidence). */
  readonly humanConfirmed: boolean
  /** Origin of the drive (§22.15 B convention). */
  readonly source?: TransitionSource
}

/**
 * Drive the abandon stage for an active change (T16).
 *
 * Refuses without human confirmation; refuses when the change is already
 * terminal (use projection.replay to inspect prior abandon events instead).
 * @param ctx - stage context.
 * @param options - change id and confirmation.
 * @returns updated status.
 * @throws {BafError} invalid_transition when not confirmed or already terminal.
 */
export async function driveAbandon(
  ctx: StageContext,
  options: AbandonOptions,
): Promise<AbandonStageResult> {
  // §22.15 B: T16 (change-abandoned) is appended raw and never enters
  // `decideTransition`, so the confirm-edge source guard must run here. The
  // source check runs first so a caller missing both gates surfaces the
  // upstream error (gate_confirmation_required) rather than the lower one
  // (invalid_transition for missing humanConfirmed).
  if (!isHumanSource(options.source)) {
    throw new BafError(
      'gate_confirmation_required',
      'abandon (T16) requires a human-originated drive; use /baf-workflow-abandon confirm or the 工作流 Tab',
      { changeId: options.changeId, source: options.source ?? null },
    )
  }
  if (!options.humanConfirmed) {
    throw new BafError('invalid_transition', 'abandon requires explicit human confirmation', {
      changeId: options.changeId,
    })
  }
  const status = await ctx.store.readStatus(options.changeId)
  if (status.terminal === 'abandoned') {
    return { status, recorded: false }
  }
  if (status.terminal === 'completed') {
    throw new BafError('invalid_transition', 'cannot abandon a completed change', {
      changeId: options.changeId,
      from: status.terminal,
    })
  }
  const { status: next } = await ctx.store.append(options.changeId, status.projectionVersion, meta => ({
    type: 'change-abandoned',
    ...(options.source === undefined ? {} : { source: options.source }),
    ...meta,
  }))
  return { status: next, recorded: true }
}

/** Re-exported stage context for callers wiring abandon in isolation. */
export type { StageContext }
