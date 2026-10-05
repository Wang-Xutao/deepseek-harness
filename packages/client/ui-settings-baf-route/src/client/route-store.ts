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
 * 【变更】2026-10-05 (auto 批): `label` is the menu text (duplicate names
 * disambiguate with a ` · provider` suffix), and `reasoning` carries the
 * ladder the tier's effort menu offers (omitted when the model has none).
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
  /** 【变更】2026-10-05 (point 1): re-point one tier's provider alone; model and effort stay. */
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
  /** Flip the keyword-escalates-only flag. */
  setEscalateOnly(value: boolean): void
  /** Persist the draft; a refusal keeps it dirty with `error` set. */
  save(): Promise<void>
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
    this.edit((draft) => { draft.tiers[tier] = { ...draft.tiers[tier], provider } })
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
    this.edit((draft) => {
      draft.keywords = (draft.keywords ?? []).map((existing, at) => at === index ? rule : existing)
    })
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
      setEscalateOnly: value => this.setEscalateOnly(value),
      save: () => this.save(),
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
        state.draft = config
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
   * model; duplicate display names disambiguate with a ` · provider` suffix
   * so two same-named models stay distinguishable (批次B-E); each model
   * carries its reasoning ladder for the effort menu.
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
    for (const model of models) counts.set(model.name, (counts.get(model.name) ?? 0) + 1)
    return {
      models: models.map(model => ({
        ...model,
        label: (counts.get(model.name) ?? 1) > 1 ? `${model.name} · ${model.provider}` : model.name,
      })),
    }
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
