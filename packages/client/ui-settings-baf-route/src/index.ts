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
  DEFAULT_PHASE_TIER, parseRouteTierConfig, resolveTaskTier, type RouteTierConfig,
} from '@deepseek-ai/dsh-baf-core'
import {
  effectiveRouteKeywordRules,
  readRoutePresetsSync,
  readRouteTierConfigSync,
  resetRouteTierConfigSync,
  writeRouteTierConfigSync,
} from '@deepseek-ai/dsh-baf-workflow/route-config-io'
import { BafRouteAutoRuntime } from '@deepseek-ai/dsh-baf-workflow/route-auto'
import type {
  BafRouteConfigDefaults, BafRouteConfigSaveResult, BafRoutePreviewOptions,
  BafRoutePreviewResult,
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
    // 【变更】2026-10-05 (auto 批 points 4+5): mount the host-realm auto
    // runtime alongside the config it reads — the session controller (catalog
    // injection, per-step resolution) and the dispatch gate reach it through
    // the scope chain by name, with no dependency on this package.
    ctx.plugin(BafRouteAutoRuntime, {})
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
   * freeze — the same `effectiveRouteKeywordRules` fold the freeze chain runs
   * (user rules first, then the FILE preset packs under their enable states),
   * one source of truth.
   * 【变更】2026-10-05 (auto 批): a passed DRAFT previews live (未保存改动即时
   * 预演 — an invalid draft falls back to the saved file), and
   * `options.verifyRetry` simulates the M4 verify-failed floor: a below-mid
   * verdict escalates to mid with `escalated` on the result.
   * 【变更】2026-10-06 (问题 5 root fix): the `enabled` gate is GONE — the
   * master switch governs live routing only, never the dry-run (a disabled or
   * even absent config still evaluates the preset packs, so 预演 never freezes
   * at「不会冻结角色」again).
   * @param summary - a task summary as it would be intaken.
   * @param draft - the unsaved config the row is editing (optional).
   * @param options - simulation switches.
   * @returns the tier (and the word that hit), or tier null when no keyword
   * would freeze anything.
   */
  @Remote
  async preview(
    summary: string,
    draft?: RouteTierConfig,
    options?: BafRoutePreviewOptions,
  ): Promise<BafRoutePreviewResult> {
    const fromDraft = draft === undefined ? undefined : parseRouteTierConfig(draft)
    const config = fromDraft ?? readRouteTierConfigSync()
    const hit = resolveTaskTier(summary, effectiveRouteKeywordRules(config))
    let tier = hit?.tier
    let escalated = false
    if (options?.verifyRetry === true && tier !== 'mid' && tier !== 'high') {
      tier = 'mid'
      escalated = true
    }
    if (tier === undefined) return { tier: null }
    return {
      tier,
      ...(hit === undefined ? {} : { matched: hit.matched }),
      ...(escalated ? { escalated } : {}),
    }
  }

  /**
   * The built-in phase→tier map for a fresh draft (no config saved yet), plus
   * the preset keyword packs for the settings display. 【变更】2026-10-06
   * (问题 4): the packs come from the user-editable preset file
   * (`~/.dsh/baf-route-presets.json`, seeded from the code builtins on first
   * read) — the client cannot import baf-core, so this is the one source the
   * settings row seeds its phase rows and preset display from.
   */
  @Remote
  async defaults(): Promise<BafRouteConfigDefaults> {
    return { phaseTier: DEFAULT_PHASE_TIER, presets: readRoutePresetsSync().packs }
  }
}

export const name = 'baf-route-config-service'
export default BafRouteConfigRemote
