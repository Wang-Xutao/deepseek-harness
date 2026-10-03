/** Featured-plugins host service: curated manifest × plugin-manager orchestration. */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { brandString } from '@deepseek-ai/dsh-brand'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type { PluginManager } from '@deepseek-ai/dsh-plugin-manager'
import type { ProfileContext } from '@deepseek-ai/dsh-app-boot'
import type { BundleInfo, ChangeResult, InstallBundleOptions, PluginInstallRequestId } from '@deepseek-ai/dsh-plugin-manager'
import { FEATURED_MANIFEST_ENV, readFeaturedManifest } from './manifest.ts'
import { appendDedupeRows, overlappingRowIds, stripDedupeRows } from './dedupe.ts'
import { VERSION_REGISTRIES, fetchLatestVersion, rangeSatisfies } from './registry.ts'
import { readFeaturedState, writeFeaturedState, type FeaturedState } from './state.ts'
import type {
  FeaturedBulkOutcome, FeaturedBulkResult, FeaturedInstallOptions, FeaturedListResult,
  FeaturedManifestPlugin, FeaturedPluginCard, FeaturedPluginState, FeaturedResult,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Curated featured-plugin orchestration over the profile's plugin manager. */
    featuredPlugins: FeaturedPlugins
  }
}

/** Composition config for {@link FeaturedPlugins}. */
export interface Config {
  /** Auto-update cadence: version re-check, then in-range reinstalls, for opted-in entries. */
  autoUpdateIntervalMs: number
}

/** How long after boot the first auto-update check waits, keeping boot traffic to itself. */
const AUTO_UPDATE_INITIAL_DELAY_MS = 30_000

/**
 * The curated featured set: reads `featured-plugins.json` fresh on every call
 * (so a hot-updated manifest needs no service restart) and drives the profile's
 * plugin manager for installs, updates, enablement, and opt-in auto-updates.
 * Without a plugin manager every card degrades to read-only `unavailable`.
 */
export class FeaturedPlugins extends TypertRemoteService {
  // No static inject: the plugin manager is optional, resolved per call through
  // ctx.get the way the manager itself treats 'hmr', so this service loads and
  // degrades even in boots that offer no manager.
  static Config = z.object({
    autoUpdateIntervalMs: z.number().step(1).min(60_000).default(21_600_000),
  })

  private readonly autoUpdateIntervalMs: number
  private autoUpdateRunning = false

  constructor(ctx: Context, config: Config) {
    super(ctx, 'featuredPlugins')
    this.autoUpdateIntervalMs = config.autoUpdateIntervalMs
    // Another surface may change the same bundles; keep featured cards in step.
    ctx.effect(() => ctx.on('plugin-manager/changed', () => { ctx.emit('featured-plugins/changed') }))
    const interval = setInterval(() => void this.autoUpdateTick(), this.autoUpdateIntervalMs)
    interval.unref()
    const initial = setTimeout(() => void this.autoUpdateTick(), AUTO_UPDATE_INITIAL_DELAY_MS)
    initial.unref()
    ctx.effect(() => () => {
      clearInterval(interval)
      clearTimeout(initial)
    }, 'featured-plugins: auto-update timers')
  }

  /** The profile's plugin manager, or undefined while this boot offers none. */
  private get manager(): PluginManager | undefined {
    return this.ctx.get('pluginManager')
  }

  /**
   * List the curated entries joined with profile state.
   * @returns A card per readable manifest entry, plus the revision or why no manifest was readable.
   */
  @Remote
  async list(): Promise<FeaturedListResult> {
    const { manifest, error } = readFeaturedManifest(process.env[FEATURED_MANIFEST_ENV])
    const bundles = await this.manager?.listBundles()
    const state = readFeaturedState()
    const plugins = (manifest?.plugins ?? []).map(entry => this.cardFor(entry, bundles, state))
    return {
      plugins,
      ...(manifest === undefined ? {} : { revision: manifest.revision }),
      ...(error === undefined ? {} : { manifestError: error }),
    }
  }

  /**
   * Install one curated entry, activating its bundle.
   * @param id Manifest entry id.
   * @param options Cancellation id, build approvals, and risk acceptance for the compatibility gate.
   * @returns The folded install outcome, including a risk confirmation when the gate refused.
   */
  @Remote
  async installPlugin(id: string, options?: FeaturedInstallOptions): Promise<FeaturedResult> {
    return this.installEntry(id, options)
  }

  /**
   * Update one installed entry to the newest version inside its curated range.
   * An update is a direct install of the same range; the manager's inspect-time
   * already-installed refusal only guards prechecks, not this path.
   * @param id Manifest entry id.
   * @param options Cancellation id, build approvals, and risk acceptance.
   * @returns The folded install outcome.
   */
  @Remote
  async update(id: string, options?: FeaturedInstallOptions): Promise<FeaturedResult> {
    return this.installEntry(id, options)
  }

  /** Resolve one entry and install it; both public faces share this body. */
  private async installEntry(id: string, options: FeaturedInstallOptions | undefined): Promise<FeaturedResult> {
    const entry = this.entryFor(id)
    if (entry === undefined) return failure('unknown-plugin', `no featured plugin ${id}`)
    return this.runInstall(entry, options)
  }

  /**
   * Remove one curated entry's bundle from the profile.
   * @param id Manifest entry id.
   * @returns The folded removal outcome.
   */
  @Remote
  async removePlugin(id: string): Promise<FeaturedResult> {
    const entry = this.entryFor(id)
    if (entry === undefined) return failure('unknown-plugin', `no featured plugin ${id}`)
    const manager = this.manager
    if (manager === undefined) return managerUnavailable()
    // Captured before the removal deletes the bundle's patch from disk.
    const rowIds = (await manager.listBundles()).find(bundle => bundle.name === entry.package)
      ?.rows.map(row => row.rowId) ?? []
    const result = await manager.removeBundle(entry.package)
    const outcome = this.announced(fold(result))
    if (result.application === 'applied' || result.application === 'restart-required') {
      if (this.patchPath !== undefined) await stripDedupeRows(this.patchPath, rowIds)
    }
    return outcome
  }

  /**
   * Enable or disable one curated entry's bundle.
   * @param id Manifest entry id.
   * @param enabled Whether the bundle's contributions load.
   * @returns The folded enablement outcome.
   */
  @Remote
  async setEnabled(id: string, enabled: boolean): Promise<FeaturedResult> {
    const entry = this.entryFor(id)
    if (entry === undefined) return failure('unknown-plugin', `no featured plugin ${id}`)
    const manager = this.manager
    if (manager === undefined) return managerUnavailable()
    const result = await manager.setBundleEnabled(entry.package, enabled)
    return this.announced(fold(result))
  }

  /**
   * Install every not-yet-installed entry, in manifest order. Entries whose
   * install needs a human decision (risk or build approval) come back as
   * confirmations for the caller to resolve entry by entry.
   * @returns Per-entry outcomes, in manifest order.
   */
  @Remote
  async bulkInstall(): Promise<FeaturedBulkResult> {
    const listing = await this.list()
    const outcomes: FeaturedBulkOutcome[] = []
    for (const card of listing.plugins) {
      if (card.state !== 'not-installed') continue
      outcomes.push({ id: card.id, result: await this.installPlugin(card.id) })
    }
    return { outcomes }
  }

  /**
   * Enable or disable every installed entry, in manifest order; entries already
   * in the requested state are skipped as no-ops.
   * @param enabled Target state for every installed entry.
   * @returns Per-entry outcomes, in manifest order.
   */
  @Remote
  async bulkSetEnabled(enabled: boolean): Promise<FeaturedBulkResult> {
    const listing = await this.list()
    const outcomes: FeaturedBulkOutcome[] = []
    for (const card of listing.plugins) {
      if (card.state !== 'enabled' && card.state !== 'disabled') continue
      if ((card.state === 'enabled') === enabled) continue
      outcomes.push({ id: card.id, result: await this.setEnabled(card.id, enabled) })
    }
    return { outcomes }
  }

  /**
   * Record one entry's auto-update choice, overriding the manifest default.
   * @param id Manifest entry id.
   * @param enabled Whether the scheduled check may update this entry.
   * @returns Ok once the choice is persisted.
   */
  @Remote
  async setAutoUpdate(id: string, enabled: boolean): Promise<FeaturedResult> {
    const entry = this.entryFor(id)
    if (entry === undefined) return failure('unknown-plugin', `no featured plugin ${id}`)
    await this.mutateState((state) => { state.autoUpdate[id] = enabled })
    return this.announced({ ok: true })
  }

  /**
   * Re-check every curated entry's latest registry version and refresh the
   * cached `latestKnown`. Network-bound per registry; entries each stop at the
   * first registry that answers.
   * @returns The listing the fresh versions feed.
   */
  @Remote
  async checkUpdates(): Promise<FeaturedListResult> {
    const { manifest } = readFeaturedManifest(process.env[FEATURED_MANIFEST_ENV])
    if (manifest !== undefined) {
      const found: Record<string, string> = {}
      for (const entry of manifest.plugins) {
        const version = await fetchLatestVersion(entry.package, this.registriesFor(entry))
        if (version !== undefined) found[entry.id] = version
      }
      await this.mutateState((state) => {
        state.lastCheck = Date.now()
        for (const [id, version] of Object.entries(found)) state.latestKnown[id] = version
      })
    }
    return this.announced(await this.list())
  }

  /** The manifest entry an id names, from a fresh manifest read. */
  private entryFor(id: string): FeaturedManifestPlugin | undefined {
    const { manifest } = readFeaturedManifest(process.env[FEATURED_MANIFEST_ENV])
    return manifest?.plugins.find(entry => entry.id === id)
  }

  /** Install or update one entry, folding the manager outcome for the caller. */
  private async runInstall(entry: FeaturedManifestPlugin, options: FeaturedInstallOptions | undefined): Promise<FeaturedResult> {
    const manager = this.manager
    if (manager === undefined) return managerUnavailable()
    const spec = `${entry.package}@${entry.version}`
    const installOptions: InstallBundleOptions = {
      enabled: true,
      ...(options?.requestId === undefined ? {} : { requestId: brandString<PluginInstallRequestId>(options.requestId) }),
      ...(options?.approvedBuilds === undefined ? {} : { approvedBuilds: [...options.approvedBuilds] }),
      ...(entry.registryFirst === undefined ? {} : { registry: entry.registryFirst }),
    }
    let result = await manager.installBundle(spec, installOptions)
    const refusal = result.error?.code === 'incompatible-version' ? result.error : undefined
    if (refusal?.incompatible !== undefined && options?.acceptRisk === true) {
      for (const incompatible of refusal.incompatible) {
        const exemption = await manager.setVersionExemption(
          `${incompatible.name}@${incompatible.version}`, incompatible.runtimeVersion, true, true)
        if (exemption.application === 'failed') return fold(exemption)
      }
      result = await manager.installBundle(spec, installOptions)
    }
    result = await this.repairOverlaps(entry.package, result)
    return this.announced(fold(result))
  }

  /**
   * Keep a just-installed bundle from double-mounting packages earlier bundle
   * layers already provide under different row ids: disable its duplicate rows
   * through the profile patch and recompose, so an activation failure the
   * duplicate registration caused comes back as a clean outcome.
   * @param name The installed bundle's package name.
   * @param result The install outcome to repair.
   * @returns The recomposition's outcome when a repair ran, else `result` unchanged.
   */
  private async repairOverlaps(name: string, result: ChangeResult): Promise<ChangeResult> {
    const manager = this.manager
    const patchPath = this.patchPath
    if (manager === undefined || patchPath === undefined) return result
    const duplicates = overlappingRowIds(await manager.listBundles(), name)
    if (duplicates.length === 0) return result
    // A refusal that changed nothing on disk (a risk confirmation, a registry
    // failure) neither needs rows seeded nor can be cleared by recomposing,
    // so it must reach the caller unchanged; the next successful install
    // repairs.
    if (result.application === 'failed' && result.changed !== true) return result
    const wrote = await appendDedupeRows(patchPath, duplicates)
    // Already-declared rows with a successful install need nothing; the same
    // rows with a failed install point past the duplicates only recomposition
    // can clear, so a fresh write and a stuck failure both recompose.
    if (!wrote && result.application !== 'failed') return result
    const recomposed = await manager.setBundleEnabled(name, true)
    // With a failed install the recomposition either cleared the composition
    // failure (the outcome the caller should see) or reported its own, so the
    // recomposition's outcome stands either way.
    return recomposed
  }

  /** The running profile's patch file, when this boot carries a profile context. */
  private get patchPath(): string | undefined {
    const context = (this.ctx as unknown as { profileContext?: ProfileContext }).profileContext
    return context?.patchPath
  }

  /** Join one manifest entry with profile bundles and persisted state. */
  private cardFor(entry: FeaturedManifestPlugin, bundles: readonly BundleInfo[] | undefined, state: FeaturedState): FeaturedPluginCard {
    const bundle = bundles?.find(item => item.name === entry.package)
    const manageable = this.manager !== undefined
    let cardState: FeaturedPluginState
    if (!manageable || entry.verified === false) cardState = 'unavailable'
    else if (bundle === undefined) cardState = 'not-installed'
    else if (bundle.enabled && bundle.error !== undefined) cardState = 'unavailable'
    else if (bundle.enabled) cardState = 'enabled'
    else cardState = 'disabled'
    const latestKnown = state.latestKnown[entry.id]
    const installedVersion = bundle?.version
    const updateAvailable = latestKnown !== undefined && installedVersion !== undefined
      && latestKnown !== installedVersion && rangeSatisfies(entry.version, latestKnown)
    const autoUpdate = state.autoUpdate[entry.id] ?? (entry.autoUpdateDefault ?? true)
    return {
      ...entry,
      state: cardState,
      ...(installedVersion === undefined ? {} : { installedVersion }),
      ...(latestKnown === undefined ? {} : { latestKnown }),
      updateAvailable,
      autoUpdate,
      manageable,
    }
  }

  /** Registries a version check asks for one entry: its first-choice registry, then the stock plan. */
  private registriesFor(entry: FeaturedManifestPlugin): readonly string[] {
    if (entry.registryFirst === undefined) return VERSION_REGISTRIES
    return [entry.registryFirst, ...VERSION_REGISTRIES.filter(registry => registry !== entry.registryFirst)]
  }

  /** Read, change, and persist the featured state under one atomic rewrite. */
  private async mutateState(apply: (state: FeaturedState) => void): Promise<void> {
    const state = readFeaturedState()
    apply(state)
    await writeFeaturedState(state)
  }

  /** The scheduled auto-update pass: refresh versions, then update opted-in enabled entries. */
  private async autoUpdateTick(): Promise<void> {
    if (this.autoUpdateRunning || this.manager === undefined) return
    this.autoUpdateRunning = true
    try {
      const listing = await this.checkUpdates()
      for (const card of listing.plugins) {
        if (!card.autoUpdate || card.state !== 'enabled' || !card.updateAvailable) continue
        const result = await this.runInstall(card, {})
        if (!result.ok) {
          this.ctx.logger.warn('featured auto-update left an entry pending', card.id, result.error?.code)
        }
      }
    } catch (error) {
      this.ctx.logger.warn('featured auto-update check failed', error)
    } finally {
      this.autoUpdateRunning = false
    }
  }

  /** Emit the change event after a mutation or version check; the outcome passes through. */
  private announced<T>(outcome: T): T {
    this.ctx.emit('featured-plugins/changed')
    return outcome
  }
}

/** Fold one manager change outcome into the featured result shape. */
function fold(result: ChangeResult): FeaturedResult {
  const ok = result.application === 'applied' || result.application === 'restart-required'
  return {
    ok,
    application: result.application,
    ...(result.error === undefined ? {} : { error: result.error }),
    ...(result.error?.code === 'incompatible-version' && result.error.incompatible !== undefined
      ? { needsRiskAck: result.error.incompatible }
      : {}),
    ...(result.pendingBuilds === undefined || result.pendingBuilds.length === 0 ? {} : { pendingBuilds: result.pendingBuilds }),
  }
}

/** A local refusal for an entry this service cannot act on. */
function failure(code: 'unknown-plugin' | 'operation-error', diagnostic: string): FeaturedResult {
  return { ok: false, application: 'failed', error: { code, diagnostic } }
}

/** The fixed refusal when this boot offers no plugin manager. */
function managerUnavailable(): FeaturedResult {
  return failure('operation-error', 'plugin manager unavailable in this profile')
}

export default FeaturedPlugins
