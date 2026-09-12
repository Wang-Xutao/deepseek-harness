/**
 * BafQuality Cordis service: exposes the C-stack quality adapter factory on
 * the entry-local BAF domain realm.
 * @module @deepseek-ai/dsh-baf-quality/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { createCStackAdapter, type CStackAdapterOptions } from './runner.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** BAF quality runner service (baf-domain isolate). */
    bafQuality: BafQuality
  }
}

/** Composition config for {@link BafQuality}. */
export interface Config {
  /** Per-check wall-clock timeout in milliseconds. */
  checkTimeoutMs: number
}

/**
 * Owns the (stateless) C-stack quality adapter factory. Callers create one
 * adapter per workspace/session; the adapter itself holds no state.
 */
export class BafQuality extends Service {
  static Config = z.object({
    checkTimeoutMs: z.number().min(1_000).default(300_000),
  })

  readonly checkTimeoutMs: number

  constructor(ctx: Context, config: Config) {
    super(ctx, 'bafQuality')
    this.checkTimeoutMs = config.checkTimeoutMs
  }

  /**
   * Create a C-stack quality adapter.
   * @param options - timeout/executor overrides (tests).
   * @returns a StackAdapter backed by the QualityRunner.
   */
  adapter(options: CStackAdapterOptions = {}) {
    return createCStackAdapter({ timeoutMs: this.checkTimeoutMs, ...options })
  }

  /**
   * Help string for slash/CLI.
   * @returns summary.
   */
  help(): string {
    return 'BAF quality: baseline-driven build/test/coverage/analyzer StackAdapter with per-check timeout, cancel, redaction.'
  }
}

export default BafQuality
