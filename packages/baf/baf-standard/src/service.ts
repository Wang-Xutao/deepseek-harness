/**
 * BafStandard Cordis service: exposes the baseline standard summary on the
 * entry-local BAF domain realm.
 * @module @deepseek-ai/dsh-baf-standard/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { BaselineManifest } from '@deepseek-ai/dsh-baf-core'
import {
  renderStandardPrompt,
  summarizeStandard,
  type StandardSummary,
} from './provider.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** BAF standard summary provider (baf-domain isolate). */
    bafStandard: BafStandard
  }
}

/** Composition config for {@link BafStandard}. */
export interface Config {}

/**
 * Stateless projection service over loaded baselines. Callers pass the
 * baseline (typically from `ctx.bafCore.currentBaseline()`); the service
 * keeps no per-workspace state.
 */
export class BafStandard extends Service {
  static Config = z.object({})

  constructor(ctx: Context, _config: Config) {
    super(ctx, 'bafStandard')
  }

  /**
   * Summarize the standard section of a baseline.
   * @param baseline - validated baseline manifest.
   * @returns structured summary.
   */
  summary(baseline: BaselineManifest): StandardSummary {
    return summarizeStandard(baseline)
  }

  /**
   * Prompt block for a baseline's standard section.
   * @param baseline - validated baseline manifest.
   * @returns multi-line prompt text.
   */
  renderPrompt(baseline: BaselineManifest): string {
    return renderStandardPrompt(summarizeStandard(baseline))
  }

  /**
   * Help string for slash/CLI.
   * @returns summary.
   */
  help(): string {
    return 'BAF standard: baseline standard-section summary for prompt/plan/guard (no embedded rule values).'
  }
}

export default BafStandard
