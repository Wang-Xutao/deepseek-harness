/**
 * BafScaffold Cordis service: exposes the workspace init scaffold on the
 * entry-local BAF domain realm.
 * @module @deepseek-ai/dsh-baf-scaffold/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { scaffoldWorkspace, type ScaffoldOptions, type ScaffoldOutcome } from './scaffold.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** BAF workspace scaffold service (baf-domain isolate). */
    bafScaffold: BafScaffold
  }
}

/** Composition config for {@link BafScaffold}. */
export interface Config {}

/**
 * Stateless scaffold facade. Human confirmation is required per the
 * baseline's guard.requireHumanConfirmation list; refusal is a value, not
 * an exception.
 */
export class BafScaffold extends Service {
  static Config = z.object({})

  constructor(ctx: Context, _config: Config) {
    super(ctx, 'bafScaffold')
  }

  /**
   * Initialize (or reconcile) the workspace skeleton.
   * @param options - workspace, baseline id, and human confirmation.
   * @returns refusal or created/skipped/backed-up changes.
   */
  scaffold(options: ScaffoldOptions): ScaffoldOutcome {
    return scaffoldWorkspace(options)
  }

  /**
   * Help string for slash/CLI.
   * @returns summary.
   */
  help(): string {
    return 'BAF scaffold: workspace init skeleton (baseline template + openspec layout) with confirmation and backup semantics.'
  }
}

export default BafScaffold
