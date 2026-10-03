/**
 * The featured-plugins settings section's state: the Host's curated cards,
 * the operation in flight, the confirmation an install waits on, and the
 * notices finished operations leave. Every fact comes from the Host — the
 * store re-reads after each operation and after every `featured-plugins/changed`
 * event, so a change made on another surface shows here without a manual
 * refresh.
 */
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  FeaturedInstallOptions,
  FeaturedPluginCard,
  FeaturedResult,
  IncompatiblePlugin,
  PluginInstallProgress,
} from '@deepseek-ai/dsh-api-remotes/client'

/** One single-plugin operation the section can run. */
export type FeaturedOp = 'install' | 'update' | 'remove' | 'enable' | 'disable'

/** A confirmation the Host asked for before an install may proceed. */
export interface FeaturedConfirm {
  /** Card the refused operation targeted. */
  readonly id: string
  /** The operation to retry once the person answers. */
  readonly op: 'install' | 'update'
  /** The compatibility gate refusal, or build-script packages awaiting approval. */
  readonly kind: 'risk' | 'builds'
  /** With `kind: 'risk'`: the peer differences the Host reported. */
  readonly incompatible?: readonly IncompatiblePlugin[]
  /** With `kind: 'builds'`: the package names awaiting approval. */
  readonly packages?: readonly string[]
}

/** What the last finished operation left to say. */
export interface FeaturedNotice {
  readonly kind: 'ok' | 'restart' | 'failed'
  /** The Host's or transport's words, shown verbatim; empty when the kind says it all. */
  readonly text: string
  /** The Host's refusal code, when one happened; locale renders the code. */
  readonly code?: string
  readonly seq: number
}

/** Install progress for the operation in flight, from the Host's event. */
export interface FeaturedProgress {
  readonly phase: PluginInstallProgress['phase']
  /** With `phase: 'installing'`: the registry attempt in progress. */
  readonly attempt?: { readonly registry: string | null; readonly index: number; readonly total: number }
}

/**
 * What the featured settings section renders. Fields stay writable: the
 * store's `update` mutates an immer draft of exactly this shape.
 */
export interface FeaturedSectionState {
  status: 'loading' | 'ready' | 'failed'
  plugins: readonly FeaturedPluginCard[]
  /** Manifest revision the cards came from, when one was readable. */
  revision: number | undefined
  /** Why the manifest could not be read, when it could not. */
  manifestError: string | undefined
  /** Single-plugin operation in flight, and the card it targets. */
  busy: { readonly id: string; readonly op: FeaturedOp } | undefined
  /** Bulk operation in flight. */
  bulk: 'install' | 'enable' | 'disable' | undefined
  /** Whether a version check is running. */
  checking: boolean
  /** Confirmation the Host asked for, shown on its card until answered. */
  confirm: FeaturedConfirm | undefined
  /** Last finished operation's message, shown as a status line. */
  notice: FeaturedNotice | undefined
  /** Progress of the install/update in flight, when the Host reported one. */
  progress: FeaturedProgress | undefined
}

/** The registration-side face the featured section's slot entry injects. */
export interface FeaturedSectionFace {
  hooks: {
    /** Section snapshot bound by the renderer as useFeaturedSection. */
    featuredSection: SnapshotStore<FeaturedSectionState>
  }
  /** Re-read the cards from the Host. */
  reload(): void
  /** Install one entry, asking the Host's compatibility and build gates. */
  install(id: string): void
  /** Reinstall one entry inside its verified range. */
  update(id: string): void
  /** Remove one entry from the profile. */
  remove(id: string): void
  /** Enable or disable one installed entry. */
  setEnabled(id: string, enabled: boolean): void
  /** Override one entry's auto-update choice. */
  setAutoUpdate(id: string, enabled: boolean): void
  /** Set every entry's auto-update choice. */
  setAllAutoUpdate(enabled: boolean): void
  /** Install every not-yet-installed entry, in manifest order. */
  bulkInstall(): void
  /** Enable or disable every installed entry. */
  bulkSetEnabled(enabled: boolean): void
  /** Probe registries for newer versions inside each entry's range. */
  checkUpdates(): void
  /** Answer the pending confirmation: approve retries, decline drops it. */
  acceptConfirm(approve: boolean): void
  /** The card's title in the active locale. */
  nameOf(card: FeaturedPluginCard): string
  /** The card's description in the active locale. */
  descriptionOf(card: FeaturedPluginCard): string
}

/** A writable copy of the Host's readonly card, for optimistic patches only. */
type WritableCard = { -readonly [K in keyof FeaturedPluginCard]: FeaturedPluginCard[K] }

/** Bridges the featured-plugins Remote onto the settings section. */
export class FeaturedSectionController {
  private readonly store: SnapshotStore<FeaturedSectionState>
  private seq = 0
  /** Request id of the install/update in flight, matching progress events. */
  private activeRequestId: string | undefined

  /**
   * @param ctx - the browser plugin context, whose `remote.featuredPlugins`
   * namespace answers for every card and operation.
   */
  constructor(private readonly ctx: ClientContext) {
    this.store = createSnapshotStore<FeaturedSectionState>({
      status: 'loading',
      plugins: [],
      revision: undefined,
      manifestError: undefined,
      busy: undefined,
      bulk: undefined,
      checking: false,
      confirm: undefined,
      notice: undefined,
      progress: undefined,
    })
    void this.load()
  }

  /** Re-read the cards; the Host's change event calls this after every operation. */
  reload(): void {
    void this.load()
  }

  /** @inheritdoc */
  install(id: string): void {
    void this.runChange('install', id)
  }

  /** @inheritdoc */
  update(id: string): void {
    void this.runChange('update', id)
  }

  /** @inheritdoc */
  remove(id: string): void {
    void this.runChange('remove', id)
  }

  /** @inheritdoc */
  setEnabled(id: string, enabled: boolean): void {
    void this.runChange(enabled ? 'enable' : 'disable', id)
  }

  /** @inheritdoc */
  setAutoUpdate(id: string, enabled: boolean): void {
    // Optimistic flip: the toggle answers instantly, the Host's change event
    // re-reads the authoritative state, and a refusal rolls the flip back.
    this.patchPlugin(id, (plugin) => { plugin.autoUpdate = enabled })
    void (async () => {
      const response = await this.ctx.remote.featuredPlugins.setAutoUpdate(id, enabled)
      if (response.ok) return
      this.patchPlugin(id, (plugin) => { plugin.autoUpdate = !enabled })
      this.fail(response.error.message)
    })()
  }

  /** @inheritdoc */
  async setAllAutoUpdate(enabled: boolean): Promise<void> {
    for (const plugin of this.store.getSnapshot().plugins) {
      await this.ctx.remote.featuredPlugins.setAutoUpdate(plugin.id, enabled)
    }
    await this.load()
  }

  /** @inheritdoc */
  bulkInstall(): void {
    void this.runBulk('install')
  }

  /** @inheritdoc */
  bulkSetEnabled(enabled: boolean): void {
    void this.runBulk(enabled ? 'enable' : 'disable')
  }

  /** @inheritdoc */
  checkUpdates(): void {
    const snapshot = this.store.getSnapshot()
    if (snapshot.checking || snapshot.busy !== undefined || snapshot.bulk !== undefined) return
    this.store.update((draft) => {
      draft.checking = true
      draft.notice = undefined
    })
    void (async () => {
      const response = await this.ctx.remote.featuredPlugins.checkUpdates()
      this.store.update((draft) => {
        draft.checking = false
        if (!response.ok) draft.notice = this.noticeOf('failed', response.error.message)
      })
      // The refreshed cards arrive through the Host's change event; re-read
      // defensively in case this client missed it.
      if (response.ok) await this.load()
    })()
  }

  /** @inheritdoc */
  acceptConfirm(approve: boolean): void {
    const confirm = this.store.getSnapshot().confirm
    if (confirm === undefined) return
    if (!approve) {
      this.store.update((draft) => { draft.confirm = undefined })
      return
    }
    const options: FeaturedInstallOptions = confirm.kind === 'risk'
      ? { acceptRisk: true }
      : { approvedBuilds: confirm.packages ?? [] }
    void this.runChange(confirm.op, confirm.id, options)
  }

  /** Publish the install progress the Host's event just reported, when it belongs to the run in flight. */
  trackProgress(progress: PluginInstallProgress): void {
    if (progress.requestId !== this.activeRequestId) return
    this.store.update((draft) => {
      draft.progress = {
        phase: progress.phase,
        ...progress.attempt === undefined ? {} : {
          attempt: {
            registry: progress.attempt.registry,
            index: progress.attempt.index,
            total: progress.attempt.total,
          },
        },
      }
    })
  }

  /**
   * Build the face the section's slot registration injects.
   * @returns the section's snapshot and its actions.
   */
  inject(): FeaturedSectionFace {
    return {
      hooks: { featuredSection: this.store },
      reload: () => this.reload(),
      install: id => this.install(id),
      update: id => this.update(id),
      remove: id => this.remove(id),
      setEnabled: (id, enabled) => this.setEnabled(id, enabled),
      setAutoUpdate: (id, enabled) => this.setAutoUpdate(id, enabled),
      setAllAutoUpdate: (enabled) => { void this.setAllAutoUpdate(enabled) },
      bulkInstall: () => this.bulkInstall(),
      bulkSetEnabled: enabled => this.bulkSetEnabled(enabled),
      checkUpdates: () => this.checkUpdates(),
      acceptConfirm: approve => this.acceptConfirm(approve),
      nameOf: card => this.ctx.locale.resolveText({ zh: card.nameZh, en: card.nameEn }),
      descriptionOf: card => this.ctx.locale.resolveText({ zh: card.descriptionZh, en: card.descriptionEn }),
    }
  }

  private async load(): Promise<void> {
    const response = await this.ctx.remote.featuredPlugins.list()
    this.store.update((draft) => {
      if (!response.ok) {
        draft.status = 'failed'
        draft.notice = this.noticeOf('failed', response.error.message)
        return
      }
      draft.plugins = response.value.plugins
      draft.revision = response.value.revision
      draft.manifestError = response.value.manifestError
      draft.status = 'ready'
    })
  }

  private async runChange(op: FeaturedOp, id: string, options?: FeaturedInstallOptions): Promise<void> {
    const snapshot = this.store.getSnapshot()
    if (snapshot.busy !== undefined || snapshot.bulk !== undefined) return
    if (!snapshot.plugins.some(plugin => plugin.id === id)) return
    this.store.update((draft) => {
      draft.busy = { id, op }
      draft.notice = undefined
      draft.progress = undefined
      // A retry from a confirmation clears the card's old refusal first.
      if (draft.confirm?.id !== id) draft.confirm = undefined
    })
    const requestId = op === 'install' || op === 'update'
      ? (options?.requestId ?? randomUUID())
      : undefined
    this.activeRequestId = requestId
    const installOptions = requestId === undefined ? options : { ...options, requestId }
    const response = op === 'remove'
      ? await this.ctx.remote.featuredPlugins.removePlugin(id)
      : op === 'enable'
        ? await this.ctx.remote.featuredPlugins.setEnabled(id, true)
        : op === 'disable'
          ? await this.ctx.remote.featuredPlugins.setEnabled(id, false)
          : op === 'update'
            ? await this.ctx.remote.featuredPlugins.update(id, installOptions)
            : await this.ctx.remote.featuredPlugins.installPlugin(id, installOptions)
    this.activeRequestId = undefined
    this.fold(op, id, response.ok ? response.value : undefined, response.ok ? undefined : response.error.message)
  }

  private async runBulk(kind: 'install' | 'enable' | 'disable'): Promise<void> {
    const snapshot = this.store.getSnapshot()
    if (snapshot.busy !== undefined || snapshot.bulk !== undefined) return
    this.store.update((draft) => {
      draft.bulk = kind
      draft.notice = undefined
      draft.confirm = undefined
    })
    const response = kind === 'install'
      ? await this.ctx.remote.featuredPlugins.bulkInstall()
      : await this.ctx.remote.featuredPlugins.bulkSetEnabled(kind === 'enable')
    this.store.update((draft) => {
      draft.bulk = undefined
      if (!response.ok) {
        draft.notice = this.noticeOf('failed', response.error.message)
        return
      }
      // A bulk run that the gates refused surfaces its first unanswered entry
      // as that card's confirmation, so the person can approve and retry it.
      const refused = response.value.outcomes.find(outcome =>
        !outcome.result.ok && (outcome.result.needsRiskAck !== undefined || outcome.result.pendingBuilds !== undefined))
      if (refused !== undefined && refused.result.needsRiskAck !== undefined) {
        draft.confirm = {
          id: refused.id, op: 'install', kind: 'risk',
          incompatible: refused.result.needsRiskAck,
        }
      } else if (refused !== undefined && refused.result.pendingBuilds !== undefined) {
        draft.confirm = {
          id: refused.id, op: 'install', kind: 'builds',
          packages: refused.result.pendingBuilds,
        }
      }
      const failed = response.value.outcomes.filter(outcome => !outcome.result.ok)
      draft.notice = failed.length === 0
        ? this.noticeOf('ok', '')
        : this.noticeOf('failed', failed[0]?.result.error?.diagnostic ?? failed[0]?.result.error?.code ?? '')
    })
    await this.load()
  }

  private fold(op: FeaturedOp, id: string, result: FeaturedResult | undefined, transportError: string | undefined): void {
    this.store.update((draft) => {
      draft.busy = undefined
      draft.progress = undefined
      if (transportError !== undefined) {
        draft.notice = this.noticeOf('failed', transportError)
        return
      }
      if (result === undefined) return
      if (result.ok) {
        draft.confirm = undefined
        draft.notice = result.application === 'restart-required'
          ? this.noticeOf('restart', '')
          : this.noticeOf('ok', '')
        return
      }
      if (result.needsRiskAck !== undefined && result.needsRiskAck.length > 0) {
        draft.confirm = {
          id, op: op === 'update' ? 'update' : 'install', kind: 'risk',
          incompatible: result.needsRiskAck,
        }
        return
      }
      if (result.pendingBuilds !== undefined && result.pendingBuilds.length > 0) {
        draft.confirm = {
          id, op: op === 'update' ? 'update' : 'install', kind: 'builds',
          packages: result.pendingBuilds,
        }
        return
      }
      draft.notice = this.noticeOf('failed', result.error?.diagnostic ?? result.error?.code ?? '', result.error?.code)
    })
  }

  private patchPlugin(id: string, mutate: (plugin: WritableCard) => void): void {
    this.store.update((draft) => {
      const index = draft.plugins.findIndex(plugin => plugin.id === id)
      const found = index < 0 ? undefined : draft.plugins[index]
      if (found === undefined) return
      const next: WritableCard = { ...found }
      mutate(next)
      const plugins = [...draft.plugins]
      plugins[index] = next
      draft.plugins = plugins
    })
  }

  private fail(text: string): void {
    this.store.update((draft) => { draft.notice = this.noticeOf('failed', text) })
  }

  private noticeOf(kind: FeaturedNotice['kind'], text: string, code?: string): FeaturedNotice {
    this.seq += 1
    return { kind, text, ...code === undefined ? {} : { code }, seq: this.seq }
  }
}
