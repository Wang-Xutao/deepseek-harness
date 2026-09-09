/**
 * N1 open stage handler (§12 Phase 5.1): create the change skeleton via the
 * OpenSpec adapter after the pipeline's T2/T3 adjudication.
 * @module @deepseek-ai/dsh-baf-workflow/stages/open
 */

import { stat } from 'node:fs/promises'
import {
  BafError,
  type WorkflowStatus,
} from '@deepseek-ai/dsh-baf-core'
import { changesDir, changeDir } from '@deepseek-ai/dsh-baf-openspec'
import type { StageContext } from './context.ts'

/** Result of a successful open-stage drive. */
export interface OpenStageResult {
  readonly status: WorkflowStatus
  readonly changeDir: string
}

/**
 * Probe workspace, Git, baseline, and OpenSpec availability for one change.
 * Full-go blocks when Git or the OpenSpec layout is unavailable (§5.3 N1).
 * @param ctx - stage context.
 * @returns availability facts.
 */
export async function probeWorkspace(ctx: StageContext): Promise<{
  readonly gitAvailable: boolean
  readonly openspecAvailable: boolean
}> {
  const detect = await ctx.adapter.detect({
    workspace: ctx.workspace,
    ...ctx.baseline === undefined ? {} : { baseline: ctx.baseline },
  })
  const gitAvailable = ctx.workspace.git?.revision !== undefined
  return {
    gitAvailable,
    openspecAvailable: detect.available,
  }
}

/**
 * Drive the open stage for a confirmed change (T2/T3 entry).
 *
 * Preconditions (intake confirmed, baseline, Git) are enforced by the
 * pipeline before entry; this handler creates the change skeleton via the
 * adapter (never overwriting) and returns its path.
 * @param ctx - stage context.
 * @param changeId - change id minted at intake.
 * @param title - human title recorded on the skeleton.
 * @returns new status plus the created change directory.
 * @throws {BafError} openspec_unavailable when skeleton creation fails.
 */
export async function driveOpen(
  ctx: StageContext,
  changeId: string,
  title: string,
): Promise<OpenStageResult> {
  const opened = await ctx.adapter.open({
    changeId,
    title,
    workspace: ctx.workspace,
  })
  if (opened.status !== 'ok' || opened.value === undefined) {
    throw new BafError(
      'openspec_unavailable',
      `open skeleton failed: ${opened.diagnostics.map(d => d.message).join('; ')}`,
      { changeId },
    )
  }
  return { status: await ctx.store.readStatus(changeId), changeDir: opened.value.path }
}

/**
 * Whether a change directory already exists on disk (multi-change pick guard).
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - change id.
 * @returns true when `openspec/changes/<id>` exists.
 */
export async function changeDirExists(workspaceRoot: string, changeId: string): Promise<boolean> {
  try {
    const s = await stat(changeDir(workspaceRoot, changeId))
    return s.isDirectory()
  } catch {
    return false
  }
}

/** Re-exported for handler-internal path math. */
export { changesDir }
