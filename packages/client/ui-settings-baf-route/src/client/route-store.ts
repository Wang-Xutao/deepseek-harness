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

/** Provider/model id suggestions from the session catalog, for the tier inputs. */
export interface RouteCatalogSuggestions {
  readonly providers: readonly string[]
  readonly models: readonly string[]
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
  preview: { tier: RouteTier | null; matched?: string } | undefined
  /** Catalog suggestions for the tier inputs; undefined when the catalog is unreachable. */
  catalog: RouteCatalogSuggestions | undefined
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
  /** Pin one workflow node's tier in the draft's phase mapping. */
  setPhaseTier(node: WorkflowNode, tier: RouteTier): void
  /** Append one keyword rule. */
  addKeyword(rule: TierKeywordRule): void
  /** Drop the keyword rule at `index`. */
  removeKeyword(index: number): void
  /** Flip the keyword-escalates-only flag. */
  setEscalateOnly(value: boolean): void
  /** Persist the draft; a refusal keeps it dirty with `error` set. */
  save(): Promise<void>
  /** Remove the config file and return to a freshly seeded draft. */
  reset(): Promise<void>
  /** Run the Host-side keyword dry-run for `summary`. */
  runPreview(summary: string): Promise<void>
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
    const fresh = await this.freshDraft(catalog)
    this.store.update((state) => {
      state.draft = fresh
      state.dirty = false
      state.error = undefined
      state.preview = undefined
      state.catalog = this.suggestionsOf(catalog)
    })
  }

  /** @inheritdoc */
  async runPreview(summary: string): Promise<void> {
    if (summary === '') return
    const response = await this.ctx.remote.bafRouteConfig.preview(summary)
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
      setPhaseTier: (node, tier) => this.setPhaseTier(node, tier),
      addKeyword: rule => this.addKeyword(rule),
      removeKeyword: index => this.removeKeyword(index),
      setEscalateOnly: value => this.setEscalateOnly(value),
      save: () => this.save(),
      reset: () => this.reset(),
      runPreview: summary => this.runPreview(summary),
    }
  }

  private async load(): Promise<void> {
    const [response, catalog] = await Promise.all([
      this.ctx.remote.bafRouteConfig.get(),
      this.ctx.remote.session.modelCatalog(),
    ])
    const suggestions = this.suggestionsOf(catalog)
    if (!response.ok) {
      this.store.update((state) => {
        state.status = 'failed'
        state.catalog = suggestions
      })
      return
    }
    if (response.value !== null) {
      // The Host materializes the phase→tier defaults before sending.
      const config: RouteTierConfig = response.value
      this.store.update((state) => {
        state.draft = config
        state.status = 'ready'
        state.catalog = suggestions
      })
      return
    }
    const fresh = await this.freshDraft(catalog)
    this.store.update((state) => {
      state.draft = fresh
      state.status = 'ready'
      state.catalog = suggestions
    })
  }

  /** Distill the catalog into the tier inputs' suggestion lists. */
  private suggestionsOf(catalog: CatalogLookup): RouteCatalogSuggestions | undefined {
    if (!catalog.ok) return undefined
    const providers = [...new Set(catalog.value.groups.map(group => group.id))]
    const models = catalog.value.groups.flatMap(group => group.models.map(model => model.id))
    return { providers, models }
  }

  /**
   * A first-run draft: disabled, every tier on the session's default model,
   * phase mapping from the Host's built-in defaults, no keyword rules.
   */
  private async freshDraft(catalog: CatalogLookup): Promise<RouteTierConfig> {
    const defaults = await this.ctx.remote.bafRouteConfig.defaults()
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
