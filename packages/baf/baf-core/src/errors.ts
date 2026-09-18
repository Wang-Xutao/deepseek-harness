/**
 * Shared BAF error codes and the structured error type every domain service throws.
 * @module @deepseek-ai/dsh-baf-core/errors
 */

/** Stable BAF error codes (see overlay/docs/baf/error-codes.md). */
export const BAF_ERROR_CODES = [
  'tool_unavailable',
  'openspec_unavailable',
  'baseline_unavailable',
  'baseline_incompatible',
  'policy_missing',
  'invalid_transition',
  'intake_confirmation_required',
  'protected_path',
  'secret_detected',
  'verify_required',
  'system_resource_conflict',
  'model_route_unavailable',
  'model_route_incompatible',
  'model_fallback_blocked',
  'projection_corrupted',
  'scope_exceeded',
  'writer_conflict',
  'gate_confirmation_required',
] as const

/** One stable BAF error code. */
export type BafErrorCode = (typeof BAF_ERROR_CODES)[number]

/** Structured BAF failure with a stable code and machine-readable details. */
export class BafError extends Error {
  readonly code: BafErrorCode
  readonly details: Readonly<Record<string, unknown>>

  /**
   * @param code - stable code from {@link BAF_ERROR_CODES}.
   * @param message - human-readable summary (not UI copy).
   * @param details - payload fields required by the error-code table.
   */
  constructor(code: BafErrorCode, message: string, details: Readonly<Record<string, unknown>> = {}) {
    super(message)
    this.name = 'BafError'
    this.code = code
    this.details = details
  }
}

/**
 * Type guard for {@link BafError}.
 * @param value - unknown thrown value.
 * @returns whether value is a BafError.
 */
export function isBafError(value: unknown): value is BafError {
  return value instanceof BafError
}
