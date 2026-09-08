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

/** Aggregated verify report written as verify-report.json. */
export interface VerifyReport {
  readonly schema: 1
  readonly changeId: string
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
   * @param changeId - owning change.
   * @param rows - rows from {@link runAll}.
   * @param identity - source revision, baseline, and tool versions.
   * @returns aggregated report.
   */
  aggregate(
    changeId: string,
    rows: readonly CheckReportRow[],
    identity: {
      readonly sourceRevision?: string
      readonly baselineId?: string
      readonly toolVersions?: Readonly<Record<string, string>>
    } = {},
  ): VerifyReport {
    return {
      schema: 1,
      changeId,
      ...(identity.sourceRevision === undefined ? {} : { sourceRevision: identity.sourceRevision }),
      ...(identity.baselineId === undefined ? {} : { baselineId: identity.baselineId }),
      toolVersions: identity.toolVersions ?? {},
      checks: rows,
      passed: rows.every(row => !row.required || row.ok),
      finishedAt: new Date().toISOString(),
    }
  }
}
