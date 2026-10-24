/**
 * Verify-stage CheckRunner: registers named checks, runs them with
 * cancellation and timing, and aggregates a structured report bound to the
 * source revision, baseline, and tool versions (§12 Phase 5.6).
 * @module @deepseek-ai/dsh-baf-workflow/stages/check-runner
 */

/** Outcome of one registered check. */
export interface CheckOutcome {
  /** Machine verdict; failed required checks block T10. */
  readonly ok: boolean
  /** Stable per-check reason codes / diagnostics. */
  readonly diagnostics: readonly string[]
}

/** One registered check. */
export interface Check {
  /** Check id used in reports and gate failures. */
  readonly name: string
  /** Required checks gate T10; optional checks only annotate. */
  readonly required: boolean
  /** Execute the check; throwing counts as a failed run. */
  run(signal: AbortSignal): Promise<CheckOutcome>
}

/** One report row. */
export interface CheckReportRow {
  readonly name: string
  readonly required: boolean
  readonly ok: boolean
  readonly durationMs: number
  readonly diagnostics: readonly string[]
}

/**
 * 【变更】2026-10-24 (批次十九 2.4, 客户决策「规定要跑过的测试必须通过才能通过
 * 确认门」): the compact view of one check row the gate rule reads. The gate and
 * the aggregated report share ONE rule, so both take this shape — the report
 * row satisfies it structurally.
 */
export interface CheckVerdict {
  /** Check id — named in the gate's refusal. */
  readonly name: string
  /** Machine verdict; a required failure always blocks. */
  readonly ok: boolean
  /** Required checks block on failure. */
  readonly required: boolean
  /** Stable per-check diagnostics; absent for callers that carry none. */
  readonly diagnostics?: readonly string[]
}

/**
 * 【变更】2026-10-24 (批次十九 2.4): the diagnostic prefixes that mark a check
 * that did NOT actually run. `skipped:` is the 2026-09-22 placeholder
 * semantics (an unconfigured check annotates instead of failing),
 * `tool_unavailable:` is the unwired-adapter annotation, and `cancelled` is an
 * aborted run. None of them is a test result — an absent check cannot fail.
 * Every OTHER failure carries the real reason code (`build:nonzero_exit`,
 * `ut_coverage.failed: …`), i.e. the check RAN and the run failed.
 */
const NOT_RUN_DIAGNOSTIC_PREFIXES = ['skipped:', 'tool_unavailable:', 'cancelled'] as const

/**
 * 【变更】2026-10-24 (批次十九 2.4): whether one check did not actually run.
 * True only when every diagnostic is a not-run marker — a row that also
 * carries a real reason code ran and failed, whatever else it reported.
 * @param check - the check row.
 * @returns true when the check never ran.
 */
export function checkDidNotRun(check: CheckVerdict): boolean {
  const diagnostics = check.diagnostics ?? []
  if (diagnostics.length === 0) return false
  return diagnostics.every(d => NOT_RUN_DIAGNOSTIC_PREFIXES.some(prefix => d.startsWith(prefix)))
}

/**
 * 【变更】2026-10-24 (批次十九 2.4, 客户决策「规定要跑过的测试必须通过才能通过
 * 确认门」): whether one check ACTUALLY RAN and failed — the shared rule both
 * the verify gate and the aggregated report read. A check that ran and failed
 * blocks the confirm gate even when it is not `required`; a check that never
 * ran (skipped / tool_unavailable / cancelled) still cannot fail.
 * @param check - the check row.
 * @returns true when the check ran and did not pass.
 */
export function checkActuallyRanAndFailed(check: CheckVerdict): boolean {
  if (check.ok) return false
  return !checkDidNotRun(check)
}

/**
 * 【变更】2026-10-24 (批次十九 2.4): whether one check row BLOCKS the verify
 * gate — the single rule the gate and the aggregated report share, so the two
 * can never disagree about what 「跑过的测试必须通过」 means.
 * @param check - the check row.
 * @returns true when the check blocks the gate.
 */
export function checkBlocksVerify(check: CheckVerdict): boolean {
  return (check.required && !check.ok) || checkActuallyRanAndFailed(check)
}

/** Aggregated verify report written as verify-report.json. */
export interface VerifyReport {
  readonly schema: 1
  readonly changeId: string
  /** Workflow mode the verify ran under (fast path swaps the check set). */
  readonly mode?: string
  readonly sourceRevision?: string
  readonly baselineId?: string
  readonly toolVersions: Readonly<Record<string, string>>
  readonly checks: readonly CheckReportRow[]
  readonly passed: boolean
  readonly finishedAt: string
}

/** One named check + registration options. */
export interface CheckRegistration {
  readonly name: string
  readonly required?: boolean
  readonly run: Check['run']
}

/**
 * Ordered check runner with cancellation and per-check timing.
 * Checks run sequentially: C quality tools in one workspace can conflict
 * on build directories, and the report must attribute one duration each.
 */
export class CheckRunner {
  private readonly entries: CheckRegistration[] = []

  /**
   * Register a check.
   * @param registration - check definition.
   * @returns this runner for chaining.
   */
  register(registration: CheckRegistration): this {
    this.entries.push({
      name: registration.name,
      run: registration.run,
      ...(registration.required === undefined ? {} : { required: registration.required }),
    })
    return this
  }

  /**
   * Run every registered check in order.
   * @param signal - cancellation for the whole run.
   * @returns report rows.
   */
  async runAll(signal: AbortSignal): Promise<CheckReportRow[]> {
    const rows: CheckReportRow[] = []
    for (const entry of this.entries) {
      const started = Date.now()
      let row: CheckReportRow
      if (signal.aborted) {
        row = {
          name: entry.name,
          required: entry.required ?? true,
          ok: false,
          durationMs: 0,
          diagnostics: ['cancelled before start'],
        }
      } else {
        try {
          const outcome = await entry.run(signal)
          row = {
            name: entry.name,
            required: entry.required ?? true,
            ok: outcome.ok,
            durationMs: Date.now() - started,
            diagnostics: outcome.diagnostics,
          }
        } catch (error) {
          row = {
            name: entry.name,
            required: entry.required ?? true,
            ok: false,
            durationMs: Date.now() - started,
            diagnostics: [error instanceof Error ? error.message : String(error)],
          }
        }
      }
      rows.push(row)
      if (signal.aborted) break
    }
    return rows
  }

  /**
   * Aggregate rows into the durable report shape.
   *
   * 【变更】2026-10-24 (批次十九 2.4, 客户决策「规定要跑过的测试必须通过才能通过
   * 确认门」): `passed` now reads the SAME rule the verify gate reads — a check
   * that ran and failed blocks the report even when it is not `required`, while
   * a check that never ran still only annotates.
   * @param changeId - owning change.
   * @param rows - rows from {@link runAll}.
   * @param identity - mode, source revision, baseline, and tool versions.
   * @returns aggregated report.
   */
  aggregate(
    changeId: string,
    rows: readonly CheckReportRow[],
    identity: {
      readonly mode?: string
      readonly sourceRevision?: string
      readonly baselineId?: string
      readonly toolVersions?: Readonly<Record<string, string>>
    } = {},
  ): VerifyReport {
    return {
      schema: 1,
      changeId,
      ...(identity.mode === undefined ? {} : { mode: identity.mode }),
      ...(identity.sourceRevision === undefined ? {} : { sourceRevision: identity.sourceRevision }),
      ...(identity.baselineId === undefined ? {} : { baselineId: identity.baselineId }),
      toolVersions: identity.toolVersions ?? {},
      checks: rows,
      // 【变更】2026-10-24 (批次十九 2.4): the shared gate rule — a required
      // failure OR a check that ran and failed makes the report not passed.
      passed: rows.every(row => !checkBlocksVerify(row)),
      finishedAt: new Date().toISOString(),
    }
  }
}
