/**
 * The 多模型路由 settings row's state and controller: the draft config the
 * row edits, the save/preview verdicts, and the bridge onto the
 * `bafRouteConfig` + `session.modelCatalog` Remotes. Every phase→tier default
 * comes from the Host (`defaults` / the materialized `get`) — the client
 * bundle cannot value-import baf-core, so it never duplicates the map.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  RouteTierConfig, TierKeywordRule, TierModelSpec, WorkflowNode,
} from '@deepseek-ai/dsh-baf-core'
import type { RouteTier } from '../types.ts'

/**
 * One catalog model the tier pickers offer: display name (the「模型」config's
 * name, falling back to the id) plus the provider group it lives in — a pick
 * derives both, so the user never types a provider by hand.
 *
 * 【变更】2026-10-05 (auto 批): `label` is the menu text, and `reasoning`
 * carries the ladder the tier's effort menu offers (omitted when the model
 * has none).
 * 【变更】2026-10-06 (问题 1): `label` is now the fetched name itself — the
 * menus are provider-scoped, so the old cross-provider ` · provider` suffix
 * repeated information. Only a duplicate name INSIDE one provider still
 * disambiguates, with the id.
 */
export interface RouteCatalogModel {
  readonly id: string
  readonly name: string
  readonly provider: string
  readonly label: string
  readonly reasoning?: {
    readonly efforts: readonly { readonly id: string; readonly name: string }[]
    readonly defaultEffort?: string
  }
}

/** Every catalog model, for the tier pickers (2.3: name-labelled dropdown). */
export interface RouteCatalogSuggestions {
  readonly models: readonly RouteCatalogModel[]
}

/** One builtin preset pack as the Host's `defaults()` Remote hands it (2.4). */
export interface RouteBuiltinPreset {
  readonly id: string
  readonly tier: RouteTier
  readonly words: string
}

/** What the row renders; `update` mutates an immer draft of this shape. */
export interface RouteSectionState {
  status: 'loading' | 'ready' | 'failed'
  /** The config being edited; fresh from the Host, or a seeded draft. */
  draft: RouteTierConfig | undefined
  /** True once edited since load/save; cleared by a successful save. */
  dirty: boolean
  /** A save is in flight. */
  saving: boolean
  /** The Host's or transport's words for the last refused save. */
  error: string | undefined
  /** The last 预演 verdict, from the Host's keyword dry-run. */
  preview: { tier: RouteTier | null; matched?: string; escalated?: boolean } | undefined
  /** Catalog models for the tier pickers; undefined when the catalog is unreachable. */
  catalog: RouteCatalogSuggestions | undefined
  /** Always-on builtin packs from the Host, for the read-only preset block (2.4). */
  presets: readonly RouteBuiltinPreset[] | undefined
}

/** The session model-catalog Remote result shape, fetched once per load. */
type CatalogLookup = Awaited<ReturnType<ClientContext['remote']['session']['modelCatalog']>>

/** The registration-side face the row's slot entry injects. */
export interface RouteSectionFace {
  hooks: {
    /** Section snapshot bound by the renderer as useRouteSection. */
    routeSection: SnapshotStore<RouteSectionState>
  }
  /** Flip the master enable. */
  setEnabled(enabled: boolean): void
  /** Patch one tier's model spec (provider/model, kept in the draft). */
  setTierModel(tier: RouteTier, patch: Partial<TierModelSpec>): void
  /**
   * Re-point one tier's provider.
   * 【变更】2026-10-05 (point 1): re-points the provider alone.
   * 【变更】2026-10-06 (问题 5/4.3): the model follows to the provider's first
   * offering — a provider switch never leaves a dangling out-of-provider id.
   */
  setTierProvider(tier: RouteTier, provider: string): void
  /** 【变更】2026-10-05 (批次B-B): set one tier's reasoning effort; undefined follows the model default. */
  setTierEffort(tier: RouteTier, effort: string | undefined): void
  /** Pin one workflow node's tier in the draft's phase mapping. */
  setPhaseTier(node: WorkflowNode, tier: RouteTier): void
  /** Append one keyword rule. */
  addKeyword(rule: TierKeywordRule): void
  /** Drop the keyword rule at `index`. */
  removeKeyword(index: number): void
  /** 【变更】2026-10-05 (point 5): replace the keyword rule at `index` in place (inline tag edit). */
  updateKeyword(index: number, rule: TierKeywordRule): void
  /** 【变更】2026-10-06 (问题 4): park one user rule at the tag level (`enabled:false` keeps it listed). */
  setKeywordEnabled(index: number, enabled: boolean): void
  /** 【变更】2026-10-06 (问题 3): flip every rule carrying `category` in one click (类级一键开关). */
  setCategoryEnabled(category: string, enabled: boolean): void
  /** 【变更】2026-10-06 (问题 3): park a whole preset pack via `draft.packs`. */
  setPackEnabled(packId: string, enabled: boolean): void
  /** 【变更】2026-10-06 (问题 4): park one preset word via `draft.presetWords` (key `pack::word`). */
  setPresetWordEnabled(packId: string, word: string, enabled: boolean): void
  /** Flip the keyword-escalates-only flag. */
  setEscalateOnly(value: boolean): void
  /** Persist the draft; a refusal keeps it dirty with `error` set. */
  save(): Promise<void>
  /** 【变更】2026-10-06 (问题 5/4.1): discard the draft's unsaved edits, back to the saved file. */
  cancel(): Promise<void>
  /** Remove the config file and return to a freshly seeded draft. */
  reset(): Promise<void>
  /**
   * Run the Host-side keyword dry-run for `summary`.
   * 【变更】2026-10-05 (auto 批): previews the unsaved DRAFT (not the saved
   * file) and forwards the M4 verify-retry simulation switch.
   */
  runPreview(summary: string, options?: { verifyRetry?: boolean }): Promise<void>
}

/**
 * Bridges the bafRouteConfig Remote onto the settings row.
 */
export class RouteSectionController {
  private readonly store: SnapshotStore<RouteSectionState>

  /**
   * @param ctx - the browser plugin context, whose `remote.bafRouteConfig`
   * namespace owns the config file and `remote.session` the model catalog.
   */
  constructor(private readonly ctx: ClientContext) {
    this.store = createSnapshotStore<RouteSectionState>({
      status: 'loading',
      draft: undefined,
      dirty: false,
      saving: false,
      error: undefined,
      preview: undefined,
      catalog: undefined,
      presets: undefined,
    })
    void this.load()
  }

  /** Re-read the config; the Host's change event calls this after remote saves. */
  reload(): void {
    void this.load()
  }

  /** @inheritdoc */
  setEnabled(enabled: boolean): void {
    this.edit((draft) => { draft.enabled = enabled })
  }

  /** @inheritdoc */
  setTierModel(tier: RouteTier, patch: Partial<TierModelSpec>): void {
    this.edit((draft) => { draft.tiers[tier] = { ...draft.tiers[tier], ...patch } })
  }

  /** @inheritdoc */
  setTierProvider(tier: RouteTier, provider: string): void {
    // 问题 5 (4.3): the provider's first offering becomes the model — effort
    // ladders are per-model, so a re-point clears the stale pick.
    const first = this.store.getSnapshot().catalog?.models.find(model => model.provider === provider)
    this.edit((draft) => {
      const spec: TierModelSpec = { ...draft.tiers[tier], provider }
      if (first !== undefined && first.id !== spec.model) {
        spec.model = first.id
        delete spec.reasoningEffort
      }
      draft.tiers[tier] = spec
    })
  }

  /** @inheritdoc */
  setTierEffort(tier: RouteTier, effort: string | undefined): void {
    this.edit((draft) => {
      const spec = { ...draft.tiers[tier] }
      if (effort === undefined) delete spec.reasoningEffort
      else spec.reasoningEffort = effort
      draft.tiers[tier] = spec
    })
  }

  /** @inheritdoc */
  setPhaseTier(node: WorkflowNode, tier: RouteTier): void {
    this.edit((draft) => { draft.phaseTier = { ...draft.phaseTier, [node]: tier } })
  }

  /** @inheritdoc */
  addKeyword(rule: TierKeywordRule): void {
    this.edit((draft) => { draft.keywords = [...draft.keywords ?? [], rule] })
  }

  /** @inheritdoc */
  removeKeyword(index: number): void {
    this.edit((draft) => { draft.keywords = (draft.keywords ?? []).filter((_, at) => at !== index) })
  }

  /** @inheritdoc */
  updateKeyword(index: number, rule: TierKeywordRule): void {
    // Merge, not replace: the inline edit row re-sends words+tier, and the
    // rule's category (问题 3 自定义分类) must survive a patch that omits it.
    this.edit((draft) => {
      draft.keywords = (draft.keywords ?? [])
        .map((existing, at) => at === index ? { ...existing, ...rule } : existing)
    })
  }

  /** @inheritdoc */
  setKeywordEnabled(index: number, enabled: boolean): void {
    this.edit((draft) => {
      draft.keywords = (draft.keywords ?? [])
        .map((existing, at) => at === index ? { ...existing, enabled } : existing)
    })
  }

  /** @inheritdoc */
  setCategoryEnabled(category: string, enabled: boolean): void {
    this.edit((draft) => {
      draft.keywords = (draft.keywords ?? [])
        .map(rule => rule.category === category ? { ...rule, enabled } : rule)
    })
  }

  /** @inheritdoc */
  setPackEnabled(packId: string, enabled: boolean): void {
    this.edit((draft) => { draft.packs = { ...draft.packs, [packId]: enabled } })
  }

  /** @inheritdoc */
  setPresetWordEnabled(packId: string, word: string, enabled: boolean): void {
    this.edit((draft) => { draft.presetWords = { ...draft.presetWords, [`${packId}::${word}`]: enabled } })
  }

  /** @inheritdoc */
  setEscalateOnly(value: boolean): void {
    this.edit((draft) => { draft.escalateOnly = value })
  }

  /** @inheritdoc */
  async save(): Promise<void> {
    const draft = this.store.getSnapshot().draft
    if (draft === undefined) return
    this.store.update((state) => {
      state.saving = true
      state.error = undefined
    })
    const response = await this.ctx.remote.bafRouteConfig.save(draft)
    this.store.update((state) => {
      state.saving = false
      if (!response.ok) {
        state.error = response.error.message
        // The file does not hold the draft — it stays unsaved.
        state.dirty = true
        return
      }
      if (!response.value.ok) {
        state.error = response.value.error ?? 'save failed'
        state.dirty = true
        return
      }
      state.dirty = false
    })
  }

  /** @inheritdoc */
  async cancel(): Promise<void> {
    // 4.1 取消: the saved file is the truth again — re-read replaces the draft
    // wholesale, then the dirty flag (load leaves it untouched) drops.
    await this.load()
    this.store.update((state) => {
      state.dirty = false
      state.error = undefined
    })
  }

  /** @inheritdoc */
  async reset(): Promise<void> {
    await this.ctx.remote.bafRouteConfig.reset()
    const catalog = await this.ctx.remote.session.modelCatalog()
    // No defaults fetched here — freshDraft pulls its own when none is handed in.
    const fresh = await this.freshDraft(catalog, undefined)
    this.store.update((state) => {
      state.draft = fresh
      state.dirty = false
      state.error = undefined
      state.preview = undefined
      state.catalog = this.suggestionsOf(catalog)
    })
  }

  /** @inheritdoc */
  async runPreview(summary: string, options?: { verifyRetry?: boolean }): Promise<void> {
    if (summary === '') return
    // 未保存改动即时预演 (批次B-A): the draft the row is editing, not the file.
    const draft = this.store.getSnapshot().draft
    const response = await this.ctx.remote.bafRouteConfig.preview(summary, draft, options)
    this.store.update((state) => {
      if (!response.ok) {
        state.error = response.error.message
        return
      }
      state.preview = response.value
    })
  }

  /**
   * Build the face the row's slot registration injects.
   * @returns the section's snapshot and its actions.
   */
  inject(): RouteSectionFace {
    return {
      hooks: { routeSection: this.store },
      setEnabled: enabled => this.setEnabled(enabled),
      setTierModel: (tier, patch) => this.setTierModel(tier, patch),
      setTierProvider: (tier, provider) => this.setTierProvider(tier, provider),
      setTierEffort: (tier, effort) => this.setTierEffort(tier, effort),
      setPhaseTier: (node, tier) => this.setPhaseTier(node, tier),
      addKeyword: rule => this.addKeyword(rule),
      removeKeyword: index => this.removeKeyword(index),
      updateKeyword: (index, rule) => this.updateKeyword(index, rule),
      setKeywordEnabled: (index, enabled) => this.setKeywordEnabled(index, enabled),
      setCategoryEnabled: (category, enabled) => this.setCategoryEnabled(category, enabled),
      setPackEnabled: (packId, enabled) => this.setPackEnabled(packId, enabled),
      setPresetWordEnabled: (packId, word, enabled) => this.setPresetWordEnabled(packId, word, enabled),
      setEscalateOnly: value => this.setEscalateOnly(value),
      save: () => this.save(),
      cancel: () => this.cancel(),
      reset: () => this.reset(),
      runPreview: (summary, options) => this.runPreview(summary, options),
    }
  }

  private async load(): Promise<void> {
    const [response, catalog, defaults] = await Promise.all([
      this.ctx.remote.bafRouteConfig.get(),
      this.ctx.remote.session.modelCatalog(),
      this.ctx.remote.bafRouteConfig.defaults(),
    ])
    const suggestions = this.suggestionsOf(catalog)
    const presets = defaults.ok ? defaults.value.presets : undefined
    if (!response.ok) {
      this.store.update((state) => {
        state.status = 'failed'
        state.catalog = suggestions
        state.presets = presets
      })
      return
    }
    if (response.value !== null) {
      // 【变更】2026-10-05 (UI 批次问题 3): a hand-edited or legacy file may pin
      // only some phase nodes — the flow diagram renders every node's tier and
      // model, so fill the gaps from the Host's default map (user overrides
      // win; the node list itself stays Host-owned, never a client copy). A
      // new object, never a mutation: snapshot stores deep-freeze their state,
      // and the Remote's value may be shared.
      const config: RouteTierConfig = defaults.ok
        ? {
          ...response.value,
          phaseTier: { ...defaults.value.phaseTier, ...(response.value.phaseTier ?? {}) },
        }
        : response.value
      this.store.update((state) => {
        state.draft = this.normalizeTiers(config, suggestions)
        state.status = 'ready'
        state.catalog = suggestions
        state.presets = presets
      })
      return
    }
    const fresh = await this.freshDraft(catalog, defaults)
    this.store.update((state) => {
      state.draft = fresh
      state.status = 'ready'
      state.catalog = suggestions
      state.presets = presets
    })
  }

  /**
   * Distill the catalog into the picker list: every model with its display
   * name (the「模型」config's name) and the provider group it lives in — the
   * tier pickers are name-labelled and a pick derives provider + model.
   *
   * 【变更】2026-10-05 (auto 批): the `baf-route` pseudo group (the Auto model)
   * never reaches the tier pickers — a tier slot always holds a concrete
   * model; each model carries its reasoning ladder for the effort menu.
   * 【变更】2026-10-06 (问题 1): the label is the fetched name itself. The model
   * menus are already filtered to one provider, so a cross-provider suffix
   * (`MiniMax-M3 · baf`) repeated information the menu context already gives;
   * only two same-named models under ONE provider still disambiguate (with
   * the id), where the name alone genuinely cannot tell them apart.
   */
  private suggestionsOf(catalog: CatalogLookup): RouteCatalogSuggestions | undefined {
    if (!catalog.ok) return undefined
    const models = catalog.value.groups
      .filter(group => group.id !== 'baf-route')
      .flatMap(group => group.models.map((model) => {
        const name = model.name !== '' ? model.name : model.id
        const base = { id: model.id, name, provider: group.id }
        if (model.reasoning === undefined) return base
        return {
          ...base,
          reasoning: {
            efforts: model.reasoning.efforts.map(effort => ({ id: effort.id, name: effort.name })),
            ...(model.reasoning.defaultEffort === undefined ? {} : { defaultEffort: model.reasoning.defaultEffort }),
          },
        }
      }))
    const counts = new Map<string, number>()
    for (const model of models) {
      const key = `${model.provider}::${model.name}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return {
      models: models.map(model => ({
        ...model,
        label: (counts.get(`${model.provider}::${model.name}`) ?? 1) > 1
          ? `${model.name} · ${model.id}`
          : model.name,
      })),
    }
  }

  /**
   * 【变更】2026-10-06 (问题 5/4.3): heal a loaded config against the live
   * catalog — a tier whose provider vanished re-points to the catalog's first
   * provider+model, a tier whose model left its provider's menu re-points to
   * that provider's first model (effort ladders are per-model, so a re-point
   * clears them). The draft then never renders a dangling id, which is what
   * retired the 未在目录 chip.
   */
  private normalizeTiers(
    config: RouteTierConfig,
    catalog: RouteCatalogSuggestions | undefined,
  ): RouteTierConfig {
    if (catalog === undefined || catalog.models.length === 0) return config
    const tiers = { ...config.tiers }
    for (const tier of ['high', 'mid', 'low'] as const) {
      const spec: TierModelSpec = { ...tiers[tier] }
      const underProvider = catalog.models.filter(model => model.provider === spec.provider)
      if (underProvider.length === 0) {
        const first = catalog.models[0]
        if (first === undefined) continue
        spec.provider = first.provider
        spec.model = first.id
        delete spec.reasoningEffort
      } else if (!underProvider.some(model => model.id === spec.model)) {
        spec.model = underProvider[0]?.id ?? spec.model
        delete spec.reasoningEffort
      }
      tiers[tier] = spec
    }
    return { ...config, tiers }
  }

  /**
   * A first-run draft: disabled, every tier on the session's default model,
   * phase mapping from the Host's built-in defaults, no keyword rules.
   */
  private async freshDraft(
    catalog: CatalogLookup,
    loaded: Awaited<ReturnType<ClientContext['remote']['bafRouteConfig']['defaults']>> | undefined,
  ): Promise<RouteTierConfig> {
    const defaults = loaded ?? await this.ctx.remote.bafRouteConfig.defaults()
    const base = catalog.ok
      ? { provider: catalog.value.default.provider, model: catalog.value.default.model }
      : { provider: '', model: '' }
    const phaseTier = defaults.ok
      ? { ...defaults.value.phaseTier } as Partial<Record<WorkflowNode, RouteTier>>
      : {}
    return {
      schema: 1,
      enabled: false,
      tiers: { high: { ...base }, mid: { ...base }, low: { ...base } },
      phaseTier,
      keywords: [],
      escalateOnly: true,
    }
  }

  private edit(mutate: (draft: RouteTierConfig) => void): void {
    this.store.update((state) => {
      if (state.draft === undefined) return
      mutate(state.draft)
      state.dirty = true
    })
  }
}
