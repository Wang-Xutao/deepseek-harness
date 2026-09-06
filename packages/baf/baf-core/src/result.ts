/**
 * Uniform domain-service result envelope.
 * @module @deepseek-ai/dsh-baf-core/result
 */

/** Outcome status for a domain operation. */
export type DomainStatus = 'ok' | 'failed' | 'unavailable' | 'blocked'

/** One diagnostic line attached to a domain result. */
export interface DomainDiagnostic {
  /** Severity for aggregators and UI. */
  readonly severity: 'info' | 'warning' | 'error'
  /** Stable machine code when known (often a BafErrorCode). */
  readonly code?: string
  /** Human-readable detail (not locale-owned UI copy). */
  readonly message: string
}

/** Shared result carried by every BAF adapter and domain service call. */
export interface DomainResult<T> {
  /** Coarse outcome. */
  readonly status: DomainStatus
  /** Structured diagnostics; empty when status is ok and nothing to report. */
  readonly diagnostics: readonly DomainDiagnostic[]
  /** Artifact paths or ids produced by the call. */
  readonly artifacts: readonly string[]
  /** Process exit code when an external tool ran. */
  readonly exitCode?: number
  /** ISO-8601 start time. */
  readonly startedAt: string
  /** ISO-8601 finish time. */
  readonly finishedAt: string
  /** Baseline id/version that governed the call, when applicable. */
  readonly baselineVersion?: string
  /** Projection event seq that authorized or recorded the call. */
  readonly sourceEventSeq?: number
  /** Successful payload; absent when status is not ok. */
  readonly value?: T
}

/**
 * Build a failed/unavailable DomainResult without a value.
 * @param status - non-ok status.
 * @param diagnostics - at least one diagnostic.
 * @param extras - optional shared fields.
 * @returns a DomainResult with no value.
 */
export function domainFailure<T = never>(
  status: Exclude<DomainStatus, 'ok'>,
  diagnostics: readonly DomainDiagnostic[],
  extras: Partial<Pick<DomainResult<T>, 'artifacts' | 'exitCode' | 'baselineVersion' | 'sourceEventSeq'>> = {},
): DomainResult<T> {
  const now = new Date().toISOString()
  return {
    status,
    diagnostics,
    artifacts: extras.artifacts ?? [],
    startedAt: now,
    finishedAt: now,
    ...extras.exitCode === undefined ? {} : { exitCode: extras.exitCode },
    ...extras.baselineVersion === undefined ? {} : { baselineVersion: extras.baselineVersion },
    ...extras.sourceEventSeq === undefined ? {} : { sourceEventSeq: extras.sourceEventSeq },
  }
}

/**
 * Build an ok DomainResult.
 * @param value - successful payload.
 * @param extras - optional shared fields.
 * @returns a DomainResult carrying value.
 */
export function domainOk<T>(
  value: T,
  extras: Partial<Pick<DomainResult<T>, 'artifacts' | 'diagnostics' | 'exitCode' | 'baselineVersion' | 'sourceEventSeq'>> = {},
): DomainResult<T> {
  const now = new Date().toISOString()
  return {
    status: 'ok',
    diagnostics: extras.diagnostics ?? [],
    artifacts: extras.artifacts ?? [],
    startedAt: now,
    finishedAt: now,
    value,
    ...extras.exitCode === undefined ? {} : { exitCode: extras.exitCode },
    ...extras.baselineVersion === undefined ? {} : { baselineVersion: extras.baselineVersion },
    ...extras.sourceEventSeq === undefined ? {} : { sourceEventSeq: extras.sourceEventSeq },
  }
}
