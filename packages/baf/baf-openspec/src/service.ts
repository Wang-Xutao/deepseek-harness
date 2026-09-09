/**
 * BafOpenspec Cordis service: registers the local file-mode OpenSpecAdapter
 * factory on the entry-local BAF domain realm.
 * @module @deepseek-ai/dsh-baf-openspec/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { createLocalOpenSpecAdapter, type LocalOpenSpecAdapterOptions } from './adapter.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** BAF local file-mode OpenSpec adapter factory (baf-domain isolate). */
    bafOpenspec: BafOpenspec
  }
}

/** Composition config for {@link BafOpenspec}. */
export interface Config {}

/**
 * Owns the workspace-bound OpenSpec adapter for this realm. The adapter is
 * stateless per workspace root; callers create one per session cwd.
 */
export class BafOpenspec extends Service {
  static Config = z.object({})

  constructor(ctx: Context, _config: Config) {
    super(ctx, 'bafOpenspec')
  }

  /**
   * Create a local file-mode adapter for one workspace.
   * @param options - workspace binding.
   * @returns adapter instance.
   */
  adapter(options: LocalOpenSpecAdapterOptions) {
    return createLocalOpenSpecAdapter(options)
  }

  /**
   * Help string for slash/CLI.
   * @returns summary.
   */
  help(): string {
    return 'BAF openspec: local file-mode OpenSpecAdapter (skeleton, read, validate, atomic archive).'
  }
}

export default BafOpenspec
