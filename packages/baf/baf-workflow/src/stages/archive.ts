/**
 * N8 archive stage handler (§12 Phase 5.7): human confirmation → atomic
 * OpenSpec archive → `change-archived`. Failures keep the change active;
 * retry is idempotent.
 * @module @deepseek-ai/dsh-baf-workflow/stages/archive
 */

import { BafError, type WorkflowStatus } from '@deepseek-ai/dsh-baf-core'
import type { StageContext } from './context.ts'
import { readVerifyReport } from './verify.ts'

/** Result of a successful archive drive. */
export interface ArchiveStageResult {
  readonly status: WorkflowStatus
  readonly archivePath: string
}

/**
 * Drive the archive stage (T14): require human confirmation and a passing
 * verify report, then archive atomically via the adapter.
 *
 * The caller records `change-archived` through WorkflowService.transition
 * after this returns; this handler performs the artifact move only, so an
 * adapter failure leaves the change active with no partial archive.
 * @param ctx - stage context.
 * @param changeId - change id.
 * @param humanConfirmed - explicit user confirmation (ask-user/approval result).
 * @returns archive destination path.
 * @throws {BafError} invalid_transition without confirmation or a passing
 * verify report; openspec_unavailable when the atomic move fails.
 */
export async function driveArchive(
  ctx: StageContext,
  changeId: string,
  humanConfirmed: boolean,
): Promise<ArchiveStageResult> {
  if (!humanConfirmed) {
    throw new BafError('invalid_transition', 'archive requires human confirmation', { changeId })
  }

  const status = await ctx.store.readStatus(changeId)
  if (status.current !== 'archive') {
    throw new BafError('invalid_transition', `archive driven from non-archive stage: ${status.current}`, {
      changeId,
      from: status.current,
    })
  }

  const report = await readVerifyReport(ctx.workspace.root, changeId)
  if (report === undefined) {
    throw new BafError('verify_required', 'no verify report; run verify before archive', { changeId })
  }
  if (!report.passed) {
    throw new BafError('verify_required', 'verify report has failed required checks', { changeId })
  }

  const archived = await ctx.adapter.archive({ changeId, path: '' }, new AbortController().signal)
  if (archived.status !== 'ok' || archived.value === undefined) {
    const code = archived.diagnostics[0]?.code ?? 'openspec_unavailable'
    throw new BafError(
      code === 'openspec_unavailable' ? 'openspec_unavailable' : 'invalid_transition',
      `archive failed: ${archived.diagnostics.map(d => d.message).join('; ')}`,
      { changeId },
    )
  }
  return {
    status,
    archivePath: archived.value.archivePath,
  }
}
