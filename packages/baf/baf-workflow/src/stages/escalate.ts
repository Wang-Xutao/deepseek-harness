/**
 * T15 risk escalation (§12 Phase 6): fast-path implement whose scope grew
 * (files outside the allowlist, or a semantic discovery such as public-API
 * impact) upgrades to full-go. The upgrade adjudicates T15 while the mode is
 * still bug-fast-path (the transition table filters T15 by that mode), then
 * writes `mode-upgraded`, preserves the fast-path ledger for audit, installs
 * the OpenSpec change backfill, and re-enters at clarify.
 * @module @deepseek-ai/dsh-baf-workflow/stages/escalate
 */

import { rename, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { BafError, type WorkflowStatus } from '@deepseek-ai/dsh-baf-core'
import { ARTIFACT_FILES, changeDir } from '@deepseek-ai/dsh-baf-openspec'
import { assertTransitionAccepted, decideTransition } from '../transition.ts'
import { ProjectionStore } from '../projection.ts'
import type { StageContext } from './context.ts'
import { writeArtifact } from './write.ts'
import {
  FASTPATH_LEDGER_FILE,
  readBugRecord,
  sectionOf,
  type FastPathLedgerView,
} from './fastpath.ts'

/** Options for {@link driveEscalate}. */
export interface EscalateOptions {
  readonly changeId: string
  /** Machine or human cause recorded on the mode-upgraded event. */
  readonly cause: string
}

/** Result of a successful escalation drive. */
export interface EscalateStageResult {
  readonly status: WorkflowStatus
  readonly cause: string
  /** Whether the fast-path plan.json was preserved as fastpath-ledger.json. */
  readonly preservedLedger: boolean
}

/**
 * Files recorded as touched but outside the allowlist (structural growth
 * signal for the automatic T15 path).
 * @param ledger - implement ledger.
 * @returns out-of-allowlist files.
 */
export function scopeGrowthFiles(ledger: FastPathLedgerView): readonly string[] {
  const allow = new Set(ledger.allowlist)
  return ledger.touched.filter(file => !allow.has(file))
}

/**
 * Render the proposal backfill installed at escalation. The bug context
 * becomes the OpenSpec "Why" so the upgraded change is a real full-go
 * change and verify's openspec-validate stays meaningful.
 * @param changeId - change id.
 * @param cause - escalation cause.
 * @param bugRecord - bug record body when readable.
 * @returns markdown body.
 */
export function renderEscalatedProposal(
  changeId: string,
  cause: string,
  bugRecord: string | undefined,
): string {
  const problem = bugRecord === undefined ? undefined : sectionOf(bugRecord, 'Problem')
  const rootCause = bugRecord === undefined ? undefined : sectionOf(bugRecord, 'Root cause')
  const lines: string[] = [
    `# Proposal — ${changeId}`,
    '',
    '## Why',
    '',
    `Escalated from bug-fast-path to full-go — ${cause}`,
    '',
    '## Problem',
    '',
    ...(problem === undefined || problem.trim() === '' ? ['See bug-record.md'] : [problem.trim()]),
    '',
    '## Root cause',
    '',
    ...(rootCause === undefined || rootCause.trim() === '' ? ['See bug-record.md'] : [rootCause.trim()]),
    '',
  ]
  return lines.join('\n')
}

/**
 * Drive T15: adjudicate implement → clarify (bug-fast-path only), record
 * `stage-failed` + `mode-upgraded`, preserve the fast-path ledger, install
 * the OpenSpec backfill, and enter clarify for the N2→N4 补走.
 *
 * Ordering constraint: T15 is mode-filtered to bug-fast-path and the
 * `mode-upgraded` event flips the fold's mode to full-go, so the transition
 * must be adjudicated BEFORE the event is appended or the edge disappears.
 * @param ctx - stage context.
 * @param options - change + cause.
 * @returns escalation result.
 * @throws {BafError} invalid_transition outside fast-path implement.
 */
export async function driveEscalate(
  ctx: StageContext,
  options: EscalateOptions,
): Promise<EscalateStageResult> {
  const { changeId, cause } = options
  if (cause.trim() === '') {
    throw new BafError('invalid_transition', 'escalation requires a cause', { changeId })
  }

  const status = await ctx.store.readStatus(changeId)
  const decision = decideTransition({ status, to: 'clarify' })
  if (!decision.accepted) {
    await appendRejection(ctx.store, changeId, status.projectionVersion, decision.reason)
    assertTransitionAccepted(decision, status.current === 'completed' || status.current === 'abandoned'
      ? null
      : status.current, 'clarify')
  }

  // T15 accepted: mark implement interrupted (T11 house style) so no
  // in-progress node dangles while the chain backfills clarify.
  const { status: afterFail } = await ctx.store.append(
    changeId,
    status.projectionVersion,
    meta => ({
      type: 'stage-failed' as const,
      node: 'implement' as const,
      reason: `escalated: ${cause}`,
      ...meta,
    }),
  )

  const { status: afterUpgrade } = await ctx.store.append(
    changeId,
    afterFail.projectionVersion,
    meta => ({
      type: 'mode-upgraded' as const,
      from: 'bug-fast-path' as const,
      to: 'full-go' as const,
      cause,
      ...meta,
    }),
  )

  const preservedLedger = await preserveFastPathLedger(ctx.workspace.root, changeId)
  await installOpenSpecBackfill(ctx, changeId, cause)

  const { status: afterClarify } = await ctx.store.append(
    changeId,
    afterUpgrade.projectionVersion,
    meta => ({
      type: 'stage-entered' as const,
      node: 'clarify' as const,
      ...meta,
    }),
  )

  return {
    status: afterClarify,
    cause,
    preservedLedger,
  }
}

/**
 * Rename the fast-path plan.json aside so the backfilled plan stage can
 * write a fresh ledger without clobbering the fast-path audit trail.
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - change id.
 * @returns whether a ledger was preserved.
 */
async function preserveFastPathLedger(
  workspaceRoot: string,
  changeId: string,
): Promise<boolean> {
  const dir = changeDir(workspaceRoot, changeId)
  const source = join(dir, ARTIFACT_FILES.planJson)
  const destination = join(dir, FASTPATH_LEDGER_FILE)
  try {
    await stat(destination)
    return false // Already preserved (idempotent re-escalation attempt).
  } catch {
    // Destination free — proceed to move the ledger when it exists.
  }
  try {
    await stat(source)
  } catch {
    return false
  }
  await rename(source, destination)
  return true
}

/**
 * Install the OpenSpec change backfill required of a full-go change:
 * proposal.md carrying the bug context plus the tasks.md template the
 * backfilled plan stage fills in. The bug record stays in place
 * (identity/audit preserved).
 * @param ctx - stage context.
 * @param changeId - change id.
 * @param cause - escalation cause.
 */
async function installOpenSpecBackfill(
  ctx: StageContext,
  changeId: string,
  cause: string,
): Promise<void> {
  const bugRecord = await readBugRecord(ctx.workspace.root, changeId)
  await writeArtifact(
    ctx.workspace.root,
    changeId,
    ARTIFACT_FILES.proposal,
    renderEscalatedProposal(changeId, cause, bugRecord),
  )
  await writeArtifact(
    ctx.workspace.root,
    changeId,
    ARTIFACT_FILES.tasks,
    `# Tasks — ${changeId}\n\nTODO: one checkbox per planned task, e.g. \`- [ ] t1 <title>\`.\n`,
  )
}

/**
 * Record a transition-rejected audit event (mirror of the pipeline's).
 * @param store - projection store.
 * @param changeId - change id.
 * @param expectedSeq - observed tail.
 * @param reason - rejection reason code.
 */
async function appendRejection(
  store: ProjectionStore,
  changeId: string,
  expectedSeq: number,
  reason: string | undefined,
): Promise<void> {
  await store.append(changeId, expectedSeq, meta => ({
    type: 'transition-rejected',
    from: 'implement',
    to: 'clarify',
    reason: reason ?? 'invalid_transition',
    ...meta,
  })).catch(() => undefined)
}
