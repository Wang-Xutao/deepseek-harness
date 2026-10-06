/**
 * The BAF 工程规范 overview row's state and controller: one read-only load of
 * the `bafStandardConfig` Remote (`summary` now, `rulesDoc` on demand) plus
 * the viewer's expand/collapse flag. No draft, no save — the row never edits
 * (2026-10-06 问题 6 客户决策: 规范总览·只读), so there is nothing to keep
 * dirty or reconcile.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { BafStandardRulesDocResult, BafStandardSummaryResult } from '../types.ts'

/** What the row renders; `summary` carries the status it loaded with. */
export interface StandardsOverviewState {
  /** Mirrors the Remote's summary status until the first answer lands. */
  status: 'loading' | BafStandardSummaryResult['status']
  /** The Host's summary projection; undefined only while loading. */
  summary: BafStandardSummaryResult | undefined
  /** The rules document viewer payload; loaded on demand (undefined = not yet). */
  rules: BafStandardRulesDocResult | undefined
  /** Whether the rules document viewer shows the full text. */
  rulesExpanded: boolean
  /**
   * 【变更】2026-10-07 (九点批 问题 8): which of the 8 rule domains are
   * expanded in the digest section (keyed by area id).
   */
  areasExpanded: Record<string, boolean>
}

/** The registration-side face the row's slot entry injects. */
export interface StandardsOverviewFace {
  hooks: {
    /** Overview snapshot bound by the renderer as useStandards. */
    standards: SnapshotStore<StandardsOverviewState>
  }
  /** Re-read the summary (the Refresh button; also called once at apply). */
  reload(): Promise<void>
  /** Fetch the rules document into the viewer (first expand). */
  loadRules(): Promise<void>
  /** Toggle the rules document viewer's expanded flag. */
  toggleRules(): void
  /** 【变更】2026-10-07 (九点批 问题 8): toggle one rule domain in the digest. */
  toggleArea(id: string): void
}

/** Initial state: loading, viewer closed. */
const INITIAL: StandardsOverviewState = {
  status: 'loading',
  summary: undefined,
  rules: undefined,
  rulesExpanded: false,
  areasExpanded: {},
}

/**
 * Bridges the bafStandardConfig Remote onto the settings row.
 */
export class StandardsController {
  private readonly store: SnapshotStore<StandardsOverviewState>

  /**
   * @param ctx - the browser plugin context, whose `remote.bafStandardConfig`
   * namespace owns the baseline projection and the rules document read.
   */
  constructor(private readonly ctx: ClientContext) {
    this.store = createSnapshotStore<StandardsOverviewState>(INITIAL)
    void this.reload()
  }

  /** The inject face the slot registration hands the row component. */
  face(): StandardsOverviewFace {
    return {
      hooks: { standards: this.store },
      reload: () => this.reload(),
      loadRules: () => this.loadRules(),
      toggleRules: () => this.toggleRules(),
      toggleArea: (id: string) => this.toggleArea(id),
    }
  }

  /** @inheritdoc */
  async reload(): Promise<void> {
    // 【变更】2026-10-06 运行时探针: a rejected proxy call (e.g. the client-side
    // arity/contract check) used to leave the row at `loading` forever — settle
    // every failure into the `failed` status the component already renders.
    try {
      const response = await this.ctx.remote.bafStandardConfig.summary()
      this.applySummary(response.ok ? response.value : { status: 'failed', error: response.error.message })
    } catch (error) {
      this.applySummary({ status: 'failed', error: error instanceof Error ? error.message : String(error) })
    }
  }

  /** Fold one summary answer into the store (shared by reload's outcomes). */
  private applySummary(summary: BafStandardSummaryResult): void {
    this.store.update((state) => {
      state.status = summary.status
      state.summary = summary
      if (summary.status !== 'ready') {
        // A different workspace story invalidates the viewer's payload.
        state.rules = undefined
        state.rulesExpanded = false
        state.areasExpanded = {}
      }
    })
  }

  /** @inheritdoc */
  async loadRules(): Promise<void> {
    if (this.store.getSnapshot().summary?.status !== 'ready') return
    try {
      const response = await this.ctx.remote.bafStandardConfig.rulesDoc()
      this.store.update((state) => {
        state.rules = response.ok ? response.value : { status: 'unreadable', reason: response.error.message }
      })
    } catch (error) {
      this.store.update((state) => {
        state.rules = { status: 'unreadable', reason: error instanceof Error ? error.message : String(error) }
      })
    }
  }

  /** @inheritdoc */
  toggleRules(): void {
    this.store.update((state) => {
      state.rulesExpanded = !state.rulesExpanded
      if (state.rulesExpanded && state.rules === undefined) void this.loadRules()
    })
  }

  /**
   * 【变更】2026-10-07 (九点批 问题 8): flip one rule domain's digest row;
   * the first expand anywhere in the digest also pulls the rules document
   * (the digest slices its content from it).
   * @param id - the area id (`project-charter` … `testing-discipline`).
   */
  toggleArea(id: string): void {
    this.store.update((state) => {
      state.areasExpanded[id] = !state.areasExpanded[id]
      if (state.areasExpanded[id] && state.rules === undefined) void this.loadRules()
    })
  }
}
