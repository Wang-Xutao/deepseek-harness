/**
 * N6 verify stage handler (§12 Phase 5.6): run the CheckRunner over
 * openspec-validate (quality/guard/secret stay placeholder interfaces until
 * Phase 7) and write `verify-report.json` bound to revision/baseline.
 * @module @deepseek-ai/dsh-baf-workflow/stages/verify
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WorkflowStatus } from '@deepseek-ai/dsh-baf-core'
import { changeDir } from '@deepseek-ai/dsh-baf-openspec'
import type { StageContext } from './context.ts'
import { CheckRunner, type CheckReportRow, type VerifyReport } from './check-runner.ts'
import { verifyGate } from './gates.ts'

/** Default check names registered by the Phase 5 verify driver. */
export const VERIFY_CHECK_NAMES = ['openspec-validate', 'quality', 'guard', 'secret-scan'] as const

/** Result of a verify drive. */
export interface VerifyStageResult {
  readonly status: WorkflowStatus
  readonly report: VerifyReport
  readonly reportPath: string
  /** T11 applies when a required check failed (verify → implement). */
  readonly backToImplement: boolean
}

/**
 * Build the Phase 5 check set: openspec-validate live, Phase 7 checks as
 * explicit `tool_unavailable` placeholders that annotate but do not gate.
 * @param ctx - stage context.
 * @param changeId - change id.
 * @returns initialized runner.
 */
export function buildVerifyRunner(ctx: StageContext, changeId: string): CheckRunner {
  const runner = new CheckRunner()
  runner.register({
    name: 'openspec-validate',
    required: true,
    run: async () => {
      const report = await ctx.adapter.validate({ changeId, path: '' })
      return { ok: report.passed, diagnostics: report.diagnostics }
    },
  })
  for (const name of ['quality', 'guard', 'secret-scan'] as const) {
    runner.register({
      name,
      required: false,
      run: async () => ({
        ok: false,
        diagnostics: ['tool_unavailable: Phase 7 wires this check'],
      }),
    })
  }
  return runner
}

/**
 * Drive the verify stage: run checks, write verify-report.json, decide T10/T11.
 * @param ctx - stage context.
 * @param changeId - change id.
 * @param signal - cancellation for the whole run.
 * @returns status, report, and the T11 verdict.
 */
export async function driveVerify(
  ctx: StageContext,
  changeId: string,
  signal: AbortSignal,
): Promise<VerifyStageResult> {
  const runner = buildVerifyRunner(ctx, changeId)
  const rows = await runner.runAll(signal)
  const report = runner.aggregate(changeId, rows, {
    ...(ctx.workspace.git?.revision === undefined ? {} : { sourceRevision: ctx.workspace.git.revision }),
    ...(ctx.baseline === undefined ? {} : { baselineId: ctx.baseline.baselineId }),
    toolVersions: { openspec: 'local-file-1' },
  })
  const reportPath = await persistVerifyReport(ctx.workspace.root, changeId, report)

  const gate = verifyGate(rows)
  if (!gate.ok) {
    // T11: report written, caller transitions verify → implement.
    return {
      status: await ctx.store.readStatus(changeId),
      report,
      reportPath,
      backToImplement: true,
    }
  }
  return {
    status: await ctx.store.readStatus(changeId),
    report,
    reportPath,
    backToImplement: false,
  }
}

/**
 * Write verify-report.json atomically into the change directory.
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - change id.
 * @param report - aggregated report.
 * @returns absolute report path.
 */
export async function persistVerifyReport(
  workspaceRoot: string,
  changeId: string,
  report: VerifyReport,
): Promise<string> {
  const path = join(changeDir(workspaceRoot, changeId), 'verify-report.json')
  const tmp = `${path}.verify.tmp`
  await mkdir(join(changeDir(workspaceRoot, changeId)), { recursive: true })
  await writeFile(tmp, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await rename(tmp, path)
  return path
}

/**
 * Read the last persisted verify report (drift freshness checks read this).
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - change id.
 * @returns report or undefined when none was written.
 */
export async function readVerifyReport(
  workspaceRoot: string,
  changeId: string,
): Promise<VerifyReport | undefined> {
  try {
    const body = await readFile(join(changeDir(workspaceRoot, changeId), 'verify-report.json'), 'utf8')
    return JSON.parse(body) as VerifyReport
  } catch {
    return undefined
  }
}

/** Re-exported row type for report consumers. */
export type { CheckReportRow }
