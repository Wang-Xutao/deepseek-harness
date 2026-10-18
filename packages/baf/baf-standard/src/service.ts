/**
 * BafStandard Cordis service: baseline standard summary + enterprise asset apply.
 * @module @deepseek-ai/dsh-baf-standard/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { BaselineManifest } from '@deepseek-ai/dsh-baf-core'
import {
  applyEnterpriseStandards,
  type ApplyEnterpriseStandardsOptions,
  type EnterpriseStandardsChanges,
} from './apply-enterprise-standards.ts'
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
 * Stateless projection + enterprise-standards apply service. Callers pass the
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
   * Apply bafplugin-aligned enterprise assets into a workspace (方案乙).
   * @param options - workspace root + optional packs / pinStack.
   * @returns created / skipped / backed-up / stackPinned report.
   */
  applyEnterprise(options: ApplyEnterpriseStandardsOptions): EnterpriseStandardsChanges {
    return applyEnterpriseStandards(options)
  }

  /**
   * Help string for slash/CLI.
   * @returns summary.
   */
  help(): string {
    return 'BAF standard: baseline summary + /baf-standard-init enterprise asset apply (clang-format/commitlint/ceedling/…)。'
  }
}

export default BafStandard
