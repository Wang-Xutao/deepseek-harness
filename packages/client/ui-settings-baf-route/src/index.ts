/**
 * Host Remote for the BAF multi-model route-tier config
 * (`~/.dsh/baf-route-config.json`): get/save/reset plus the
 * `baf-route-config/changed` announcement every surface re-reads on.
 *
 * 多模型路由 M3: this service lives in a dual client package because the
 * browser settings section needs the generated TYPERT_REMOTE contribution
 * (`./remote`) only such packages produce. The file IO itself stays in
 * baf-workflow (`./route-config-io`) — dispatch-time routing re-reads the
 * file per turn in the same process, so a save applies to the very next
 * work order without a restart.
 * @module @deepseek-ai/dsh-client-ui-settings-baf-route
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { parseRouteTierConfig, type RouteTierConfig } from '@deepseek-ai/dsh-baf-core'
import {
  readRouteTierConfigSync,
  resetRouteTierConfigSync,
  writeRouteTierConfigSync,
} from '@deepseek-ai/dsh-baf-workflow/route-config-io'
import type { BafRouteConfigSaveResult } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** BAF route-tier config Remote (host plane, process-global file). */
    bafRouteConfig: BafRouteConfigRemote
  }
  interface Events {
    /**
     * The route-tier config changed (save or reset, from any surface).
     * Clients re-read `get`.
     * @mode emit
     */
    'baf-route-config/changed'(): void
  }
}

/**
 * The route-tier config Remote. File-backed and synchronous under the hood —
 * the file is tiny, and the dispatch path deliberately re-reads it per turn.
 */
export class BafRouteConfigRemote extends TypertRemoteService {
  static Config = z.object({})

  constructor(ctx: Context, _config: Record<string, never>) {
    super(ctx, 'bafRouteConfig')
  }

  /**
   * Read the persisted config.
   * @returns normalized config, or null when absent/invalid (routing bypasses).
   */
  @Remote
  async get(): Promise<RouteTierConfig | null> {
    return readRouteTierConfigSync() ?? null
  }

  /**
   * Validate and persist a config document (normalized), then announce.
   * @param config - candidate config from the settings UI.
   * @returns ok:false + error summary when validation fails; file untouched.
   */
  @Remote
  async save(config: RouteTierConfig): Promise<BafRouteConfigSaveResult> {
    const normalized = parseRouteTierConfig(config)
    if (normalized === undefined) {
      return { ok: false, error: 'config failed schema validation (tiers/keywords/phaseTier)' }
    }
    writeRouteTierConfigSync(undefined, normalized)
    this.ctx.emit('baf-route-config/changed')
    return { ok: true }
  }

  /**
   * Remove the config file (routing returns to today's behavior), then announce.
   */
  @Remote
  async reset(): Promise<void> {
    resetRouteTierConfigSync()
    this.ctx.emit('baf-route-config/changed')
  }
}

export const name = 'baf-route-config-service'
export default BafRouteConfigRemote
