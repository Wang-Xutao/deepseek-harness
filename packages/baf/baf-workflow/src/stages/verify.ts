/**
 * N6 verify stage handler (§12 Phase 5.6, Phase 7 wiring): run the
 * CheckRunner over openspec-validate plus the wired quality/guard/secret-scan
 * adapters and write `verify-report.json` (machine) + `verify.md`
 * (customer-facing render, demo5 issue #3) bound to revision/baseline.
 * @module @deepseek-ai/dsh-baf-workflow/stages/verify
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WorkflowStatus } from '@deepseek-ai/dsh-baf-core'
import { changeDir } from '@deepseek-ai/dsh-baf-openspec'
import type { StageContext } from './context.ts'
import { CheckRunner, type CheckReportRow, type VerifyReport } from './check-runner.ts'
import { verifyGate } from './gates.ts'
import { readLedger } from './implement.ts'
import { regressionSatisfied } from './bug-fix-path.ts'

/** Result of a verify drive. */
export interface VerifyStageResult {
  readonly status: WorkflowStatus
  readonly report: VerifyReport
  readonly reportPath: string
  /** T11 applies when a required check failed (verify → implement). */
  readonly backToImplement: boolean
}

/** Options for {@link buildVerifyRunner}. */
export interface VerifyRunnerOptions {
  /** Mutable tool-version sink merged into the aggregated report (Phase 7). */
  readonly toolVersions?: Record<string, string>
}

/**
 * Build the mode-scoped check set. Full-go: openspec-validate required and
 * live. Bug fast-path (§12 Phase 6): `regression-test` over the durable
 * ledger is the required check and openspec-validate degrades to an
 * explicit skipped annotation (required: false). Phase 7 quality/guard/
 * secret-scan gate only when their adapters are wired into the stage
 * context; otherwise they annotate `tool_unavailable` without gating.
 * Quality-gate placeholders (`policy_missing` from `<enterprise-tbd>`
 * baseline entries) annotate as skipped the same way — a check that was
 * never configured cannot fail, and only checks that actually ran gate.
 * @param ctx - stage context.
 * @param changeId - change id.
 * @param mode - workflow mode of the change.
 * @param options - tool-version sink for the quality adapter.
 * @returns initialized runner.
 */
export function buildVerifyRunner(
  ctx: StageContext,
  changeId: string,
  mode: 'full-go-path' | 'bug-fix-path' = 'full-go-path',
  options: VerifyRunnerOptions = {},
): CheckRunner {
  const runner = new CheckRunner()
  if (mode === 'bug-fix-path') {
    runner.register({
      name: 'regression-test',
      required: true,
      run: async () => {
        // Structural verdict from the durable ledger; a missing/malformed
        // plan.json surfaces as a failed row, never a crash.
        const ledger = await readLedger(ctx.workspace.root, changeId)
        return regressionSatisfied(ledger)
          ? { ok: true, diagnostics: ['regression test written and its task done'] }
          : { ok: false, diagnostics: ['regression_test_required: test not written or task not done'] }
      },
    })
    runner.register({
      name: 'openspec-validate',
      required: false,
      run: async () => {
        const status = await ctx.store.readStatus(changeId)
        const reasons = status.intake?.reasonCodes ?? []
        return {
          ok: true,
          diagnostics: [`skipped: bug-fix-path (未走 OpenSpec; intake reason codes: ${reasons.join(', ')})`],
        }
      },
    })
  } else {
    runner.register({
      name: 'openspec-validate',
      required: true,
      run: async () => {
        const report = await ctx.adapter.validate({ changeId, path: '' })
        return { ok: report.passed, diagnostics: report.diagnostics }
      },
    })
  }
  // Phase 7: quality/guard/secret-scan go live when the corresponding adapter
  // is wired into the stage context; wired rows gate T10 (any gate failure
  // blocks archive, §14.4), unwired rows annotate tool_unavailable only.
  // 2026-09-22 (web walk deadlock): a scaffolded baseline ships build/test/
  // analyzers as <enterprise-tbd> placeholders and baf-quality records each as
  // a `policy_missing` check (fail-closed against guessing — §15). Gating T10
  // on those made every fresh-workspace verify fail with no in-band fix: the
  // model cannot edit .baf/baseline.yml (outside the plan allowlist, by
  // design) and the customer was never asked. An unconfigured check is an
  // absent check, not a failing one — same semantics the row already gives
  // unwired adapters (tool_unavailable annotation) and secretScan: off. So
  // placeholder-only failures annotate `skipped: policy_missing ...` and pass;
  // any failure with a different reason code (a command that actually ran and
  // failed, a missed numeric coverage threshold, cancellation) still gates.
  const qualityWired = ctx.stack !== undefined && ctx.baseline !== undefined
  runner.register({
    name: 'quality',
    required: qualityWired,
    run: async (signal) => {
      if (ctx.stack === undefined || ctx.baseline === undefined) {
        return { ok: false, diagnostics: ['tool_unavailable: stack adapter not wired'] }
      }
      const report = await ctx.stack.runQuality(
        { workspace: ctx.workspace, baseline: ctx.baseline, changeId },
        signal,
      )
      if (options.toolVersions !== undefined) Object.assign(options.toolVersions, report.toolVersions)
      const failed = report.checks.filter(check => !(check as { readonly passed?: boolean }).passed)
      const entry = (check: unknown) => check as { readonly id?: string; readonly reasonCode?: string }
      const real = failed.filter(check => entry(check).reasonCode !== 'policy_missing')
      const placeholders = failed.filter(check => entry(check).reasonCode === 'policy_missing')
      const ok = !signal.aborted && (report.passed || real.length === 0)
      return {
        ok,
        diagnostics: ok && real.length === 0
          ? (placeholders.length === 0
            ? ['all quality checks passed']
            : [
              `skipped: quality gates not configured (${String(placeholders.length)} policy_missing placeholders; fill .baf/baseline.yml stack.build/test/analyzers to enable them)`,
              ...placeholders.map(check => `${entry(check).id ?? 'check'}:policy_missing`),
            ])
          : real.map(check => `${entry(check).id ?? 'check'}:${entry(check).reasonCode ?? 'failed'}`),
      }
    },
  })

  const guardWired = ctx.guard !== undefined && ctx.baseline !== undefined
  const touchedPaths = async (): Promise<readonly string[]> => {
    // plan.json is optional at verify time (docs-only changes); a missing
    // ledger means no recorded touched files, not a crash.
    try {
      return (await readLedger(ctx.workspace.root, changeId)).touched
    } catch {
      return []
    }
  }
  runner.register({
    name: 'guard',
    required: guardWired,
    run: async (signal) => {
      if (ctx.guard === undefined || ctx.baseline === undefined) {
        return { ok: false, diagnostics: ['tool_unavailable: guard policy not wired'] }
      }
      const paths = await touchedPaths()
      const report = await ctx.guard.check(
        { workspace: ctx.workspace, baseline: ctx.baseline, paths, action: 'verify' },
        signal,
      )
      return {
        ok: report.allowed,
        diagnostics: report.reasonCodes.length === 0 ? ['within policy'] : [...report.reasonCodes],
      }
    },
  })
  runner.register({
    name: 'secret-scan',
    required: guardWired,
    run: async (signal) => {
      if (ctx.guard === undefined || ctx.baseline === undefined) {
        return { ok: false, diagnostics: ['tool_unavailable: guard policy not wired'] }
      }
      if (ctx.baseline.guard.secretScan === 'off') {
        return { ok: true, diagnostics: ['skipped: secret scan off (baseline)'] }
      }
      const paths = await touchedPaths()
      const report = await ctx.guard.check(
        { workspace: ctx.workspace, baseline: ctx.baseline, paths, action: 'secret-scan' },
        signal,
      )
      return {
        ok: report.allowed,
        diagnostics: report.reasonCodes.length === 0 ? ['no secrets detected'] : [...report.reasonCodes],
      }
    },
  })
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
  // The projection's mode — not the caller's claim — selects the check set.
  const status = await ctx.store.readStatus(changeId)
  const mode = status.mode === 'bug-fix-path' ? 'bug-fix-path' : 'full-go-path'
  const toolVersions: Record<string, string> = { openspec: 'local-file-1' }
  const runner = buildVerifyRunner(ctx, changeId, mode, { toolVersions })
  const rows = await runner.runAll(signal)
  const report = runner.aggregate(changeId, rows, {
    mode,
    ...(ctx.workspace.git?.revision === undefined ? {} : { sourceRevision: ctx.workspace.git.revision }),
    ...(ctx.baseline === undefined ? {} : { baselineId: ctx.baseline.baselineId }),
    toolVersions,
  })
  const reportPath = await persistVerifyReport(ctx.workspace.root, changeId, report)
  // 【变更】2026-09-23 (demo5 issue #3): the customer-facing verify artifact is
  // verify.md — the human-readable acceptance document the rail shows (the
  // JSON stays on disk for drift freshness + quality consumers). Render
  // failures are tolerated the same way plan.md renders are: the gate judged
  // the run, and a doc render must not unwind it.
  await renderVerifyMd(ctx.workspace.root, changeId, report).catch(() => undefined)

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
 * 【变更】2026-09-23 (demo5 issue #3): render verify.md — the verify stage's
 * customer-facing artifact (阶段产物). The rail, gate cards and Tab show
 * verify.md, NOT verify-report.json; the machine JSON stays alongside for
 * drift freshness and quality-tool consumers that read it by name.
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - change id.
 * @param report - the aggregated report just persisted.
 */
export async function renderVerifyMd(
  workspaceRoot: string,
  changeId: string,
  report: VerifyReport,
): Promise<void> {
  const lines: string[] = [
    `# Verify — ${changeId}`,
    '',
    `> 结论：${report.passed ? '✅ 通过（必需检查全部通过）' : '❌ 未通过（存在未通过的必需检查）'}`,
    '',
    `- 模式：${report.mode ?? '—'}`,
    ...(report.sourceRevision === undefined ? [] : [`- 源版本：\`${report.sourceRevision}\``]),
    ...(report.baselineId === undefined ? [] : [`- 基线：\`${report.baselineId}\``]),
    `- 完成时间：${report.finishedAt}`,
    ...(Object.keys(report.toolVersions).length === 0
      ? []
      : [`- 工具版本：${Object.entries(report.toolVersions).map(([tool, v]) => `${tool}@${v}`).join('、')}`]),
    '',
    '## 检查明细',
    '',
    '| 检查 | 必需 | 结果 | 耗时 |',
    '| --- | --- | --- | --- |',
  ]
  for (const check of report.checks) {
    const verdict = check.ok ? '✅ 通过' : (check.required ? '❌ 失败' : '⚠️ 跳过/失败（非必需）')
    lines.push(`| ${check.name} | ${check.required ? '是' : '否'} | ${verdict} | ${check.durationMs}ms |`)
  }
  lines.push('', '## 诊断', '')
  for (const check of report.checks) {
    if (check.diagnostics.length === 0) continue
    lines.push(`### ${check.name}`, '')
    for (const line of check.diagnostics) lines.push(`- ${line}`)
    lines.push('')
  }
  lines.push('> 本文档由 verify-report.json 自动渲染；机器消费请读 JSON。', '')
  await writeFile(join(changeDir(workspaceRoot, changeId), 'verify.md'), lines.join('\n'), 'utf8')
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
