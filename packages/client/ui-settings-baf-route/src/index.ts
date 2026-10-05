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
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  BUILTIN_KEYWORD_PRESETS, DEFAULT_PHASE_TIER, effectiveKeywordRules, parseRouteTierConfig,
  resolveTaskTier, type RouteTierConfig,
} from '@deepseek-ai/dsh-baf-core'
import {
  readRouteTierConfigSync,
  resetRouteTierConfigSync,
  writeRouteTierConfigSync,
} from '@deepseek-ai/dsh-baf-workflow/route-config-io'
import type {
  BafRouteConfigDefaults, BafRouteConfigSaveResult, BafRoutePreviewResult,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** BAF route-tier config Remote (host plane, process-global file). */
    bafRouteConfig: BafRouteConfigRemote
  }
}

/**
 * The route-tier config Remote. File-backed and synchronous under the hood —
 * the file is tiny, and the dispatch path deliberately re-reads it per turn.
 */
export class BafRouteConfigRemote extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'bafRouteConfig')
  }

  /**
   * Read the persisted config with the phase→tier defaults materialized: an
   * absent `phaseTier` entry means the built-in default, and the settings row
   * shows the EFFECTIVE mapping rather than a sparse one. The materialized
   * document is exactly what a no-edit save would persist (same effective
   * values, just explicit).
   * @returns normalized config, or null when absent/invalid (routing bypasses).
   */
  @Remote
  async get(): Promise<RouteTierConfig | null> {
    const config = readRouteTierConfigSync()
    if (config === undefined) return null
    return { ...config, phaseTier: { ...DEFAULT_PHASE_TIER, ...config.phaseTier } }
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

  /**
   * 多模型路由 M3 预演: dry-run the intake keyword match host-side. The
   * browser cannot value-import baf-core (client bundle purity), so the
   * settings row ships the summary here and renders the tier a confirm would
   * freeze — the same `effectiveKeywordRules` list the freeze chain runs
   * (user rules first, then the always-on builtin packs), one source of truth.
   * Reads the SAVED config: an unsaved edit previews stale, which the row
   * communicates with its own dirty marker.
   * @param summary - a task summary as it would be intaken.
   * @returns the tier (and the word that hit), or tier null when no keyword
   * would freeze anything.
   */
  @Remote
  async preview(summary: string): Promise<BafRoutePreviewResult> {
    const config = readRouteTierConfigSync()
    if (config === undefined || !config.enabled) return { tier: null }
    const hit = resolveTaskTier(summary, effectiveKeywordRules(config.keywords))
    if (hit === undefined) return { tier: null }
    return { tier: hit.tier, matched: hit.matched }
  }

  /**
   * The built-in phase→tier map for a fresh draft (no config saved yet), plus
   * the always-on builtin keyword packs for the read-only preset block (2.4
   * 默认启用). The client cannot import baf-core, so this is the one source
   * the settings row seeds its phase rows and preset display from.
   */
  @Remote
  async defaults(): Promise<BafRouteConfigDefaults> {
    return { phaseTier: DEFAULT_PHASE_TIER, presets: BUILTIN_KEYWORD_PRESETS }
  }
}

export const name = 'baf-route-config-service'
export default BafRouteConfigRemote
