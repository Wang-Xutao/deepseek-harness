/**
 * The BAF 工程规范 overview row's state and controller: one read-only load of
 * the `bafStandardConfig` Remote (`summary` now) plus the 企业规范 tab's
 * real-document viewer (`enterpriseDoc` on demand).
 *
 * 【变更】2026-10-20 (批次六 5): the rules-doc digest machinery (rules /
 * rulesExpanded / areasExpanded / loadRules / toggleRules / toggleArea) is
 * RETIRED — the 企业规范 tab now renders the REAL bafplugin-migrated
 * documents (a product constant) as a workflow flow chart + viewer, so there
 * is no baseline-located rules document left to fetch or slice.
 *
 * 【变更】2026-10-18 (项目工程 1.3, 客户决策): ONE editable exception — the AI
 * 禁改路径 list (`guard.protectedPaths`) carries a local draft the 项目工程
 * tab mutates and `saveProtectedPaths` persists through the Remote's surgical
 * baseline write; every other field stays read-only (2026-10-06 问题 6 客户
 * 决策) so there is still no draft to keep dirty for them.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  BafEnterpriseDocResult, BafStandardNodeHooks, BafStandardSummaryResult,
  BafQualityAssetReadResult, BafQualityAssetsResult,
  BafQualityConfigurationResult, BafQualityEnvironmentResult,
  BafQualityInstallResult, BafQualityInstallStep, BafQualityReportResult,
  BafQualityTestFlowConfigResult, BafQualityTestFlowStageConfig, BafQualityTestFlowStageMap,
} from '../types.ts'

/** What the row renders; `summary` carries the status it loaded with. */
export interface StandardsOverviewState {
  /** Mirrors the Remote's summary status until the first answer lands. */
  status: 'loading' | BafStandardSummaryResult['status']
  /** The Host's summary projection; undefined only while loading. */
  summary: BafStandardSummaryResult | undefined
  /**
   * 【变更】2026-10-20 (批次六 5): the 企业规范 viewer's open document id
   * (undefined = viewer closed). The docs are product constants, so this
   * survives summary reloads and workspace switches.
   */
  enterpriseDocId: string | undefined
  /** The open document's payload; undefined while the fetch is in flight. */
  enterpriseDoc: BafEnterpriseDocResult | undefined
  /**
   * 【变更】2026-10-20 (批次六 5): the active locale id (the 企业规范 canvas
   * picks its doc chip tags by it; tracked here because slot components only
   * receive `t`, not the locale service).
   */
  localeActive: string
  /** 【变更】2026-10-18 (项目工程 1.3): the AI 禁改路径 draft (undefined until
   * the first ready summary; the enterprise placeholder never lists). */
  protectedDraft: readonly string[] | undefined
  /** A save of the draft is in flight. */
  protectedSaving: boolean
  /** Last save problem / desktop-open failure line (cleared on next action). */
  protectedNotice: string | undefined
  /** 【变更】2026-10-19 (六问题批 4.1b): the 状态脚本 draft (node → enter/exit
   * lists; undefined until the first ready summary). */
  hooksDraft: BafStandardNodeHooks | undefined
  /** A save of the 状态脚本 draft is in flight. */
  hooksSaving: boolean
  /** Last 状态脚本 save problem line (cleared on next action). */
  hooksNotice: string | undefined
  /** A generateBaseline call is in flight. */
  generating: boolean
  /** Last generate outcome line (cleared on next action). */
  generateNotice: string | undefined
  /**
   * 【变更】2026-10-21 (质量监控重构 1.3): the 环境 card's probe answer
   * (undefined until the first probe lands; survives summary reloads — the
   * probe is its own Remote round, not part of the summary).
   */
  qualityEnv: BafQualityEnvironmentResult | undefined
  /** An environment probe is in flight. */
  qualityEnvLoading: boolean
  /** Last environment-probe failure line (cleared on the next probe). */
  qualityEnvNotice: string | undefined
  /** A 一键安装 run is in flight (its steps arrive once it settles). */
  qualityInstallRunning: boolean
  /** The last 一键安装 per-step report. */
  qualityInstallSteps: readonly BafQualityInstallStep[] | undefined
  /** Last 一键安装 failure line (cleared on the next run). */
  qualityInstallNotice: string | undefined
  /**
   * 【变更】2026-10-21 (质量监控重构 1.4): the 配置 card's readout (undefined
   * until the first load lands).
   */
  qualityConfig: BafQualityConfigurationResult | undefined
  /** Monotonic token for stale 测试报告 fetches (compare-and-drop). */
  qualityReportSeq: number
  /** The open 测试报告 modal's payload; undefined while closed or fetching. */
  qualityReport: BafQualityReportResult | undefined
  /**
   * 【变更】2026-10-22 (批次十二 3, 客户决策): the 资产 card's explicit file
   * list (undefined until the first load lands).
   */
  qualityAssets: BafQualityAssetsResult | undefined
  /** Monotonic token for stale 资产 preview fetches (compare-and-drop). */
  qualityAssetSeq: number
  /** The open 资产 preview modal's payload; undefined while closed or fetching. */
  qualityAsset: BafQualityAssetReadResult | undefined
  /**
   * 【变更】2026-10-22 (批次十三 4): the 测试流 canvas's stage switches — the
   * persisted `.baf/quality/test-flow.json` map (undefined until the first
   * load lands; all-on defaults are server-side).
   */
  qualityFlow: BafQualityTestFlowConfigResult | undefined
  /** A toggle's save round is in flight (one at a time — switches debounce). */
  qualityFlowSaving: boolean
  /** Last toggle failure line (cleared on the next toggle). */
  qualityFlowNotice: string | undefined
}

/** The registration-side face the row's slot entry injects. */
export interface StandardsOverviewFace {
  hooks: {
    /** Overview snapshot bound by the renderer as useStandards. */
    standards: SnapshotStore<StandardsOverviewState>
  }
  /** Re-read the summary (the Refresh button; also called once at apply). */
  reload(): Promise<void>
  /**
   * 【变更】2026-10-19 (六问题批 4.1 web 验证修复): re-read the summary when a
   * settings panel MOUNTS — the activation-time fetch goes stale once the user
   * switches sessions/workspaces, and 项目路径 must track the current session.
   * Skipped whenever either draft is mid-edit (a refresh must never clobber).
   */
  refreshIfClean(): void
  /**
   * 【变更】2026-10-20 (批次六 5): open one real enterprise document in the
   * 企业规范 viewer (fetches its text through the Remote; re-clicking the
   * open id is a no-op).
   */
  openEnterpriseDoc(id: string): Promise<void>
  /** Close the 企业规范 viewer. */
  closeEnterpriseDoc(): void
  /** 【变更】2026-10-18 (项目工程 1.3): replace the local AI 禁改路径 draft. */
  updateProtectedDraft(paths: readonly string[]): void
  /** Persist the draft through the Remote's surgical baseline write. */
  saveProtectedPaths(): Promise<void>
  /** Clear the last save/open notice line. */
  clearProtectedNotice(): void
  /** Reveal one absolute host path in the desktop file manager. */
  revealPath(path: string): Promise<void>
  /** Open one absolute host path with its default desktop application. */
  openPath(path: string): Promise<void>
  /** Open the OS folder chooser; the picked absolute path, or null on cancel. */
  pickDirectory(): Promise<string | null>
  /**
   * 【变更】2026-10-20 (批次三 4.4): does one workspace-relative entry exist?
   * The 状态脚本 editor's add-time existence check; transport trouble answers
   * `true` so a broken RPC never bricks the add flow.
   */
  statWorkspacePath(entry: string): Promise<boolean>
  /** 【变更】2026-10-19 (六问题批 4.1b): replace the whole 状态脚本 draft. */
  updateHooksDraft(hooks: BafStandardNodeHooks): void
  /** Persist the 状态脚本 draft through the Remote's surgical baseline write. */
  saveNodeHooks(): Promise<void>
  /** Clear the last 状态脚本 notice line. */
  clearHooksNotice(): void
  /** Run the scaffold (生成配置文件 button on the no-baseline empty state). */
  generateBaseline(): Promise<void>
  /**
   * 【变更】2026-10-21 (质量监控重构 1.3): probe the unit-test toolchain into
   * `qualityEnv` (the 环境 card's mount action; re-runs re-probe).
   */
  probeQualityEnvironment(): Promise<void>
  /** Run 一键安装 (assets + gem/pip installs), then re-probe + reload config. */
  installQualityToolchain(): Promise<void>
  /** 【变更】2026-10-21 (质量监控重构 1.4): load the 配置 card's readout. */
  loadQualityConfiguration(): Promise<void>
  /** Fetch the 测试报告 HTML into the preview modal (stale answers dropped). */
  openQualityReport(): Promise<void>
  /** Close the 测试报告 modal. */
  closeQualityReport(): void
  /** 【变更】2026-10-22 (批次十二 3): load the 资产 card's explicit file list. */
  loadQualityAssets(): Promise<void>
  /** Fetch one 资产 file's preview into the modal (stale answers dropped). */
  openQualityAsset(rel: string): Promise<void>
  /** Close the 资产 preview modal. */
  closeQualityAsset(): void
  /**
   * 【变更】2026-10-22 (批次十三 4): load the 测试流 canvas's stage switches
   * (the mount round; failures settle into the notice line).
   */
  loadQualityFlowConfig(): Promise<void>
  /**
   * 【变更】2026-10-22 (批次十三 4): flip ONE stage switch — optimistic local
   * cascade, then the Remote's authoritative map replaces it (the server's
   * cascade is the single source of truth).
   */
  toggleQualityFlowStage(stage: string, field: 'enabled' | 'haltOnError', value: boolean): Promise<void>
  /**
   * 【变更】2026-10-23 (批次十七 3.3): the 测试流 MASTER switch — flip every
   * stage's enabled flag in one gesture. Implemented as ONE Remote flip per
   * independent root (开=gate carries the coverage chain's whole prerequisite
   * closure; 关=build carries its dependent cone; lint/analyze/format are
   * independent), so the server-side cascade stays the single source of truth
   * and the wire contract is untouched.
   */
  toggleQualityFlowAll(value: boolean): Promise<void>
  /**
   * 【变更】2026-10-22 (批次十三 3): 「AI 协助安装」 — open a baf-preset session
   * in this workspace with a prefilled install-help prompt (draft
   * initialization; the customer presses Enter to send — never auto-sent).
   */
  aiHelpQualityInstall(): void
}

/** Initial state: loading, viewer closed. */
const INITIAL: StandardsOverviewState = {
  status: 'loading',
  summary: undefined,
  enterpriseDocId: undefined,
  enterpriseDoc: undefined,
  localeActive: 'zh',
  protectedDraft: undefined,
  protectedSaving: false,
  protectedNotice: undefined,
  hooksDraft: undefined,
  hooksSaving: false,
  hooksNotice: undefined,
  generating: false,
  generateNotice: undefined,
  qualityEnv: undefined,
  qualityEnvLoading: false,
  qualityEnvNotice: undefined,
  qualityInstallRunning: false,
  qualityInstallSteps: undefined,
  qualityInstallNotice: undefined,
  qualityConfig: undefined,
  qualityReportSeq: 0,
  qualityReport: undefined,
  qualityAssets: undefined,
  qualityAssetSeq: 0,
  qualityAsset: undefined,
  qualityFlow: undefined,
  qualityFlowSaving: false,
  qualityFlowNotice: undefined,
}

/** The slice of the Session Remote the path gestures call (structural — the
 * namespace's generated merge is not imported here, matching open-path.ts's
 * controller-slice pattern). `action` is `?: 'reveal'`: omission opens the
 * default application (see SessionOpenWorkspacePathRequest). */
interface SessionPathRemote {
  readonly session: {
    openWorkspacePath(request: { path: string; action?: 'reveal' }): Promise<{ ok: boolean }>
  }
}

/** The preload bridge the native directory picker installs in Electron. */
type PreloadPicker = { pick(): Promise<string | null> }

/** The workspace navigation service's picking slice (ctx.get peek, no inject). */
interface WorkspacePickSlice {
  pickDirectory(): Promise<string | null>
}

/** The workspace navigation service's session-start slice (ctx.get peek). */
interface WorkspaceStartSlice {
  startSession(workspaceId?: unknown, options?: { prompt?: string; agentPreset?: string }): void
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
    // 【变更】2026-10-20 (批次六 5): mirror the active locale into state so the
    // 企业规范 canvas can pick its doc chip tags by language (slot props only
    // carry `t`). Initial read + the locale/change event keep it current.
    try {
      this.store.update((state) => { state.localeActive = this.ctx.locale.getSnapshot().active })
      this.ctx.on('locale/change', (snapshot) => {
        this.store.update((state) => { state.localeActive = snapshot.active })
      })
    } catch {
      // Locale service absent (bare test harness): the 'zh' default stands.
    }
    void this.reload()
  }

  /** The inject face the slot registration hands the row component. */
  face(): StandardsOverviewFace {
    return {
      hooks: { standards: this.store },
      reload: () => this.reload(),
      refreshIfClean: () => this.refreshIfClean(),
      openEnterpriseDoc: (id: string) => this.openEnterpriseDoc(id),
      closeEnterpriseDoc: () => this.closeEnterpriseDoc(),
      updateProtectedDraft: (paths: readonly string[]) => this.updateProtectedDraft(paths),
      saveProtectedPaths: () => this.saveProtectedPaths(),
      clearProtectedNotice: () => this.clearProtectedNotice(),
      revealPath: (path: string) => this.revealPath(path),
      openPath: (path: string) => this.openPath(path),
      pickDirectory: () => this.pickDirectory(),
      statWorkspacePath: (entry: string) => this.statWorkspacePath(entry),
      updateHooksDraft: (hooks: BafStandardNodeHooks) => this.updateHooksDraft(hooks),
      saveNodeHooks: () => this.saveNodeHooks(),
      clearHooksNotice: () => this.clearHooksNotice(),
      generateBaseline: () => this.generateBaseline(),
      probeQualityEnvironment: () => this.probeQualityEnvironment(),
      installQualityToolchain: () => this.installQualityToolchain(),
      loadQualityConfiguration: () => this.loadQualityConfiguration(),
      openQualityReport: () => this.openQualityReport(),
      closeQualityReport: () => this.closeQualityReport(),
      loadQualityAssets: () => this.loadQualityAssets(),
      openQualityAsset: (rel: string) => this.openQualityAsset(rel),
      closeQualityAsset: () => this.closeQualityAsset(),
      loadQualityFlowConfig: () => this.loadQualityFlowConfig(),
      toggleQualityFlowStage: (stage, field, value) => this.toggleQualityFlowStage(stage, field, value),
      toggleQualityFlowAll: value => this.toggleQualityFlowAll(value),
      aiHelpQualityInstall: () => this.aiHelpQualityInstall(),
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

  /** @inheritdoc */
  refreshIfClean(): void {
    if (!this.draftsDirty()) void this.reload()
  }

  /** Whether either local draft has drifted from its persisted projection. */
  private draftsDirty(): boolean {
    const { summary, protectedDraft, hooksDraft } = this.store.getSnapshot()
    if (summary === undefined || summary.status !== 'ready') return false
    const persistedProtected = (summary.guardProtectedPaths ?? [])
      .filter(entry => entry.trim() !== '<enterprise-tbd>')
    const persistedHooks = summary.nodeHooks ?? {}
    return (protectedDraft !== undefined
        && JSON.stringify(protectedDraft) !== JSON.stringify(persistedProtected))
      || (hooksDraft !== undefined
        && JSON.stringify(hooksDraft) !== JSON.stringify(persistedHooks))
  }

  /** Fold one summary answer into the store (shared by reload's outcomes). */
  private applySummary(summary: BafStandardSummaryResult): void {
    this.store.update((state) => {
      // 【变更】2026-10-19 (六问题批 4.1 web 验证修复): a fresh ready answer
      // re-seeds only drafts that are still CLEAN against the projection it
      // replaces — one typed during the roundtrip (or during a save's reload)
      // is dirty against the old projection and survives the fold.
      const previous = state.summary?.status === 'ready' ? state.summary : undefined
      const previousProtected = (previous?.guardProtectedPaths ?? [])
        .filter(entry => entry.trim() !== '<enterprise-tbd>')
      const previousHooks = previous?.nodeHooks ?? {}
      const protectedClean = state.protectedDraft === undefined
        || JSON.stringify(state.protectedDraft) === JSON.stringify(previousProtected)
      const hooksClean = state.hooksDraft === undefined
        || JSON.stringify(state.hooksDraft) === JSON.stringify(previousHooks)
      state.status = summary.status
      state.summary = summary
      if (summary.status === 'ready') {
        // A fresh answer resets a clean draft (the save path reloads, so a
        // saved list re-reads as itself; the placeholder never lists).
        if (protectedClean) {
          state.protectedDraft = (summary.guardProtectedPaths ?? [])
            .filter(entry => entry.trim() !== '<enterprise-tbd>')
          state.protectedNotice = undefined
        }
        // 【变更】2026-10-19 (六问题批 4.1b): seed the 状态进出hook draft the
        // same way (a saved map re-reads as itself).
        if (hooksClean) {
          state.hooksDraft = summary.nodeHooks ?? {}
          // 【变更】2026-10-26 (批次二十八 2): the server's dead-config line
          // (a tolerated script the node does not configure) rides the
          // summary — it replaces the transient save problem until the next
          // save clears it.
          state.hooksNotice = summary.hooksNotice
        }
      } else {
        // A different workspace story invalidates the editable drafts. The
        // 企业规范 document viewer survives — its docs are product constants,
        // not workspace state (批次六 5).
        state.protectedDraft = undefined
        state.hooksDraft = undefined
        state.hooksNotice = undefined
      }
    })
  }

  /**
   * @inheritdoc
   * 【变更】2026-10-20 (批次六 5): fetch one real enterprise document into the
   * viewer. A stale answer for a superseded click is dropped by id compare;
   * transport failures settle as `unreadable` (never left hanging).
   */
  async openEnterpriseDoc(id: string): Promise<void> {
    if (this.store.getSnapshot().enterpriseDocId === id) return
    this.store.update((state) => {
      state.enterpriseDocId = id
      state.enterpriseDoc = undefined
    })
    let result: BafEnterpriseDocResult
    try {
      const response = await this.ctx.remote.bafStandardConfig.enterpriseDoc(id)
      result = response.ok
        ? response.value
        : { status: 'unreadable', reason: response.error.message }
    } catch (error) {
      result = { status: 'unreadable', reason: error instanceof Error ? error.message : String(error) }
    }
    this.store.update((state) => {
      if (state.enterpriseDocId !== id) return
      state.enterpriseDoc = result
    })
  }

  /** @inheritdoc */
  closeEnterpriseDoc(): void {
    this.store.update((state) => {
      state.enterpriseDocId = undefined
      state.enterpriseDoc = undefined
    })
  }

  /** @inheritdoc */
  updateProtectedDraft(paths: readonly string[]): void {
    this.store.update((state) => {
      state.protectedDraft = [...paths]
      state.protectedNotice = undefined
    })
  }

  /** @inheritdoc */
  async saveProtectedPaths(): Promise<void> {
    const draft = this.store.getSnapshot().protectedDraft
    if (draft === undefined) return
    this.store.update((state) => {
      state.protectedSaving = true
      state.protectedNotice = undefined
    })
    let message: string | undefined
    try {
      const response = await this.ctx.remote.bafStandardConfig.saveProtectedPaths([...draft])
      if (response.ok) {
        const value = response.value
        if (value.status === 'ready') {
          if (value.hookInstalled === false) message = value.message
          await this.reload()
          this.store.update((state) => { state.protectedSaving = false })
          if (message !== undefined) {
            this.store.update((state) => { state.protectedNotice = message })
          }
          return
        }
        message = value.message ?? value.status
      } else {
        message = response.error.message
      }
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    this.store.update((state) => {
      state.protectedSaving = false
      state.protectedNotice = message
    })
  }

  /** @inheritdoc */
  clearProtectedNotice(): void {
    this.store.update((state) => { state.protectedNotice = undefined })
  }

  /** @inheritdoc */
  updateHooksDraft(hooks: BafStandardNodeHooks): void {
    this.store.update((state) => {
      state.hooksDraft = Object.fromEntries(Object.entries(hooks).map(([node, lists]) => [
        node,
        {
          ...(lists.enter === undefined ? {} : { enter: [...lists.enter] }),
          ...(lists.exit === undefined ? {} : { exit: [...lists.exit] }),
        },
      ]))
      state.hooksNotice = undefined
    })
  }

  /** @inheritdoc */
  async saveNodeHooks(): Promise<void> {
    const draft = this.store.getSnapshot().hooksDraft
    if (draft === undefined) return
    this.store.update((state) => {
      state.hooksSaving = true
      state.hooksNotice = undefined
    })
    let message: string | undefined
    try {
      const wire = Object.fromEntries(Object.entries(draft).map(([node, lists]) => [
        node,
        {
          ...(lists.enter === undefined ? {} : { enter: [...lists.enter] }),
          ...(lists.exit === undefined ? {} : { exit: [...lists.exit] }),
        },
      ]))
      const response = await this.ctx.remote.bafStandardConfig.saveNodeHooks(wire)
      if (response.ok) {
        if (response.value.status === 'ready') {
          await this.reload()
          this.store.update((state) => { state.hooksSaving = false })
          return
        }
        message = response.value.message ?? response.value.status
      } else {
        message = response.error.message
      }
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    this.store.update((state) => {
      state.hooksSaving = false
      state.hooksNotice = message
    })
  }

  /** @inheritdoc */
  clearHooksNotice(): void {
    this.store.update((state) => { state.hooksNotice = undefined })
  }

  /**
   * @inheritdoc
   * Runs the scaffold, then reloads so the empty state flips to the ready
   * projection without a manual refresh.
   */
  async generateBaseline(): Promise<void> {
    if (this.store.getSnapshot().generating) return
    this.store.update((state) => {
      state.generating = true
      state.generateNotice = undefined
    })
    let failed: string | undefined
    try {
      const response = await this.ctx.remote.bafStandardConfig.generateBaseline()
      if (response.ok) {
        if (response.value.status === 'ready') {
          await this.reload()
          this.store.update((state) => { state.generating = false })
          return
        }
        failed = response.value.message ?? response.value.status
      } else {
        failed = response.error.message
      }
    } catch (error) {
      failed = error instanceof Error ? error.message : String(error)
    }
    this.store.update((state) => {
      state.generating = false
      state.generateNotice = failed
    })
  }

  /** Run one desktop path gesture; failures land in the notice line. */
  private async pathGesture(path: string, action: 'open' | 'reveal'): Promise<void> {
    const remote = (this.ctx.remote as unknown as SessionPathRemote).session
    try {
      // `action: 'reveal'` navigates the file manager; its omission hands the
      // path to the OS default application (the request type has no 'open').
      const request = action === 'reveal' ? { path, action } : { path }
      const answer = await remote.openWorkspacePath(request)
      if (!answer.ok) {
        this.store.update((state) => { state.protectedNotice = action === 'open' ? 'openFailed' : 'revealFailed' })
      }
    } catch (error) {
      this.store.update((state) => {
        state.protectedNotice = error instanceof Error ? error.message : String(error)
      })
    }
  }

  /** @inheritdoc */
  revealPath(path: string): Promise<void> {
    return this.pathGesture(path, 'reveal')
  }

  /** @inheritdoc */
  openPath(path: string): Promise<void> {
    return this.pathGesture(path, 'open')
  }

  /** @inheritdoc */
  async pickDirectory(): Promise<string | null> {
    const preload = (globalThis as typeof globalThis & { __DSH_DIRECTORY_PICKER__?: PreloadPicker })
      .__DSH_DIRECTORY_PICKER__
    if (preload !== undefined) {
      try {
        return await preload.pick()
      } catch {
        return null
      }
    }
    const workspace = this.ctx.get('uiWorkspace') as unknown as WorkspacePickSlice | undefined
    if (workspace === undefined || typeof workspace.pickDirectory !== 'function') return null
    try {
      return await workspace.pickDirectory()
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  async statWorkspacePath(entry: string): Promise<boolean> {
    try {
      const response = await this.ctx.remote.bafStandardConfig.statWorkspacePath(entry)
      if (response.ok) return response.value.exists
      return true
    } catch {
      // Fail-open: a broken RPC must not brick the add flow (the save-time
      // validation remains the authoritative gate).
      return true
    }
  }

  /**
   * @inheritdoc
   * 【变更】2026-10-21 (质量监控重构 1.3): one toolchain probe round into
   * `qualityEnv`. Failures settle into the notice line (never left hanging);
   * a probe already in flight is joined, not duplicated.
   */
  async probeQualityEnvironment(): Promise<void> {
    if (this.store.getSnapshot().qualityEnvLoading) return
    this.store.update((state) => {
      state.qualityEnvLoading = true
      state.qualityEnvNotice = undefined
    })
    let notice: string | undefined
    let result: BafQualityEnvironmentResult | undefined
    try {
      const response = await this.ctx.remote.bafStandardConfig.qualityEnvironment()
      if (response.ok) {
        result = response.value
      } else {
        notice = response.error.message
      }
    } catch (error) {
      notice = error instanceof Error ? error.message : String(error)
    }
    this.store.update((state) => {
      state.qualityEnvLoading = false
      state.qualityEnvNotice = notice
      if (result !== undefined) state.qualityEnv = result
    })
  }

  /**
   * @inheritdoc
   * 【变更】2026-10-21 (质量监控重构 1.3): run 一键安装, fold its per-step report,
   * then re-probe the environment and reload the 配置 readout so the verdict
   * flips without a manual refresh. Double-runs are ignored while in flight
   * (installs are minutes-long; a stacked second run helps nobody).
   */
  async installQualityToolchain(): Promise<void> {
    if (this.store.getSnapshot().qualityInstallRunning) return
    this.store.update((state) => {
      state.qualityInstallRunning = true
      state.qualityInstallNotice = undefined
    })
    let notice: string | undefined
    let outcome: BafQualityInstallResult | undefined
    try {
      const response = await this.ctx.remote.bafStandardConfig.installQualityToolchain()
      if (response.ok) {
        outcome = response.value
        if (response.value.status === 'error') notice = response.value.message ?? response.value.status
      } else {
        notice = response.error.message
      }
    } catch (error) {
      notice = error instanceof Error ? error.message : String(error)
    }
    this.store.update((state) => {
      state.qualityInstallRunning = false
      state.qualityInstallNotice = notice
      if (outcome !== undefined) state.qualityInstallSteps = outcome.steps
    })
    // Fresh verdict + config (assets may have just landed in the workspace).
    await this.probeQualityEnvironment()
    await this.loadQualityConfiguration()
  }

  /**
   * @inheritdoc
   * 【变更】2026-10-21 (质量监控重构 1.4): one 配置 readout round. Failures
   * settle into the notice line; a stale load never clobbers a newer answer's
   * fields because the whole readout lands atomically.
   */
  async loadQualityConfiguration(): Promise<void> {
    let notice: string | undefined
    let result: BafQualityConfigurationResult | undefined
    try {
      const response = await this.ctx.remote.bafStandardConfig.qualityConfiguration()
      if (response.ok) {
        result = response.value
      } else {
        notice = response.error.message
      }
    } catch (error) {
      notice = error instanceof Error ? error.message : String(error)
    }
    this.store.update((state) => {
      state.qualityEnvNotice = notice ?? state.qualityEnvNotice
      if (result !== undefined) state.qualityConfig = result
    })
  }

  /**
   * @inheritdoc
   * 【变更】2026-10-21 (质量监控重构 1.4): fetch the 测试报告 HTML into the
   * preview modal. A stale answer for a superseded open is dropped by the
   * sequence token; transport failures settle as `unreadable`.
   */
  async openQualityReport(): Promise<void> {
    const seq = this.store.getSnapshot().qualityReportSeq + 1
    this.store.update((state) => {
      state.qualityReportSeq = seq
      state.qualityReport = undefined
    })
    let result: BafQualityReportResult
    try {
      const response = await this.ctx.remote.bafStandardConfig.readQualityReport()
      result = response.ok
        ? response.value
        : { status: 'unreadable', reason: response.error.message }
    } catch (error) {
      result = { status: 'unreadable', reason: error instanceof Error ? error.message : String(error) }
    }
    this.store.update((state) => {
      if (state.qualityReportSeq !== seq) return
      state.qualityReport = result
    })
  }

  /** @inheritdoc */
  closeQualityReport(): void {
    this.store.update((state) => {
      state.qualityReportSeq += 1
      state.qualityReport = undefined
    })
  }

  /**
   * @inheritdoc
   * 【变更】2026-10-22 (批次十二 3, 客户决策): one 资产 list round. Failures
   * settle into the environment notice line (the card's only status lane).
   */
  async loadQualityAssets(): Promise<void> {
    let notice: string | undefined
    let result: BafQualityAssetsResult | undefined
    try {
      const response = await this.ctx.remote.bafStandardConfig.qualityAssets()
      if (response.ok) {
        result = response.value
      } else {
        notice = response.error.message
      }
    } catch (error) {
      notice = error instanceof Error ? error.message : String(error)
    }
    this.store.update((state) => {
      state.qualityEnvNotice = notice ?? state.qualityEnvNotice
      if (result !== undefined) state.qualityAssets = result
    })
  }

  /**
   * @inheritdoc
   * 【变更】2026-10-22 (批次十二 3): fetch one 资产 file's preview into the
   * modal. A stale answer for a superseded open is dropped by the sequence
   * token; transport failures settle as `unreadable`.
   */
  async openQualityAsset(rel: string): Promise<void> {
    const seq = this.store.getSnapshot().qualityAssetSeq + 1
    this.store.update((state) => {
      state.qualityAssetSeq = seq
      state.qualityAsset = undefined
    })
    let result: BafQualityAssetReadResult
    try {
      const response = await this.ctx.remote.bafStandardConfig.readQualityAsset(rel)
      result = response.ok
        ? response.value
        : { status: 'unreadable', reason: response.error.message }
    } catch (error) {
      result = { status: 'unreadable', reason: error instanceof Error ? error.message : String(error) }
    }
    this.store.update((state) => {
      if (state.qualityAssetSeq !== seq) return
      state.qualityAsset = result
    })
  }

  /** @inheritdoc */
  closeQualityAsset(): void {
    this.store.update((state) => {
      state.qualityAssetSeq += 1
      state.qualityAsset = undefined
    })
  }

  /**
   * @inheritdoc
   * 【变更】2026-10-22 (批次十三 4): one stage-switch map round. Failures
   * settle into the notice line; a `no-workspace` answer also lands as the
   * map (the canvas renders its guidance state from it).
   */
  async loadQualityFlowConfig(): Promise<void> {
    let notice: string | undefined
    let result: BafQualityTestFlowConfigResult | undefined
    try {
      const response = await this.ctx.remote.bafStandardConfig.qualityTestFlowConfig()
      if (response.ok) {
        result = response.value
      } else {
        notice = response.error.message
      }
    } catch (error) {
      notice = error instanceof Error ? error.message : String(error)
    }
    this.store.update((state) => {
      state.qualityFlowNotice = notice
      if (result !== undefined) state.qualityFlow = result
    })
  }

  /**
   * @inheritdoc
   * 【变更】2026-10-22 (批次十三 4): ONE switch flip. The optimistic local
   * update sets ONLY the flipped field (the cascade stays server-side — one
   * implementation, no drift); the Remote's authoritative normalized map
   * replaces the whole thing when it lands, flipping the dependents with it.
   * A second toggle while one is in flight is queued behind the save gate
   * rather than interleaved.
   */
  async toggleQualityFlowStage(stage: string, field: 'enabled' | 'haltOnError', value: boolean): Promise<void> {
    const snapshot = this.store.getSnapshot()
    const current = snapshot.qualityFlow
    if (snapshot.qualityFlowSaving) return
    if (current?.stages !== undefined && current.stages[stage] !== undefined) {
      this.store.update((state) => {
        // exactOptionalPropertyTypes: narrow the flow first, then rebuild the
        // result explicitly — spreading the `| undefined` state value widens
        // `status` to optional and fails the required-prop assignment.
        const flow = state.qualityFlow
        const stages = flow?.stages
        const prev = stages?.[stage]
        if (flow === undefined || stages === undefined || prev === undefined) return
        const flipped: BafQualityTestFlowStageConfig = {
          enabled: field === 'enabled' ? value : prev.enabled,
          haltOnError: field === 'haltOnError' ? value : prev.haltOnError,
        }
        state.qualityFlow = {
          status: flow.status,
          ...(flow.cwd === undefined ? {} : { cwd: flow.cwd }),
          stages: { ...stages, [stage]: flipped },
        }
        state.qualityFlowNotice = undefined
      })
    }
    this.store.update((state) => { state.qualityFlowSaving = true })
    let notice: string | undefined
    let stages: BafQualityTestFlowStageMap | undefined
    try {
      const response = await this.ctx.remote.bafStandardConfig.saveQualityTestFlowToggle({ stage, field, value })
      if (response.ok) {
        if (response.value.status === 'ready') stages = response.value.stages
        else notice = response.value.message ?? response.value.status
      } else {
        notice = response.error.message
      }
    } catch (error) {
      notice = error instanceof Error ? error.message : String(error)
    }
    this.store.update((state) => {
      state.qualityFlowSaving = false
      state.qualityFlowNotice = notice
      if (stages !== undefined && state.qualityFlow !== undefined) {
        state.qualityFlow = { ...state.qualityFlow, stages }
      }
    })
  }

  /**
   * @inheritdoc
   * 【变更】2026-10-23 (批次十七 3.3): the master switch — ONE optimistic
   * all-stages flip, then one Remote round per independent root (开 = gate +
   * lint/analyze/format; 关 = build + lint/analyze/format — each root's server
   * cascade covers its cone, so four flips land the whole map). The LAST ready
   * map wins; a failed round stops the sweep and surfaces its notice (the map
   * stays at the last good state, never a half-cascade guess).
   */
  async toggleQualityFlowAll(value: boolean): Promise<void> {
    const snapshot = this.store.getSnapshot()
    if (snapshot.qualityFlowSaving) return
    const flow = snapshot.qualityFlow
    if (flow?.stages !== undefined) {
      this.store.update((state) => {
        // exactOptionalPropertyTypes: spreading the `| undefined` state value
        // widens `status` to optional — rebuild the result explicitly (the
        // single-flip toggle above does the same).
        const current = state.qualityFlow
        const stages = current?.stages
        if (current === undefined || stages === undefined) return
        const nextStages: Record<string, BafQualityTestFlowStageConfig> = {}
        for (const [id, entry] of Object.entries(stages)) {
          nextStages[id] = { enabled: value, haltOnError: entry.haltOnError }
        }
        state.qualityFlow = {
          status: current.status,
          ...(current.cwd === undefined ? {} : { cwd: current.cwd }),
          stages: nextStages,
        }
        state.qualityFlowNotice = undefined
      })
    }
    this.store.update((state) => { state.qualityFlowSaving = true })
    const roots = value ? ['gate', 'lint', 'analyze', 'format'] : ['build', 'lint', 'analyze', 'format']
    let notice: string | undefined
    let lastStages: BafQualityTestFlowStageMap | undefined
    for (const stage of roots) {
      try {
        const response = await this.ctx.remote.bafStandardConfig.saveQualityTestFlowToggle({ stage, field: 'enabled', value })
        if (response.ok) {
          if (response.value.status === 'ready') lastStages = response.value.stages
          else {
            notice = response.value.message ?? response.value.status
            break
          }
        } else {
          notice = response.error.message
          break
        }
      } catch (error) {
        notice = error instanceof Error ? error.message : String(error)
        break
      }
    }
    this.store.update((state) => {
      state.qualityFlowSaving = false
      state.qualityFlowNotice = notice
      if (lastStages !== undefined && state.qualityFlow !== undefined) {
        state.qualityFlow = { ...state.qualityFlow, stages: lastStages }
      }
    })
  }

  /**
   * @inheritdoc
   * 【变更】2026-10-22 (批次十三 3, 可行性落地): the 「AI 协助安装」 trigger —
   * `uiWorkspace.startSession` with the baf agent preset and a DRAFT-INITIALIZED
   * prompt carrying the real install report + the still-missing members + the
   * workspace root. Draft initialization PREFILLS the composer (never
   * auto-sends — the customer reads it and presses Enter, per the
   * customer-decision principle). The workspace slice is read structurally
   * (ctx.get peek, no inject), matching {@link pickDirectory}'s pattern.
   */
  aiHelpQualityInstall(): void {
    const { qualityEnv, qualityInstallSteps } = this.store.getSnapshot()
    const missing = (qualityEnv?.tools ?? [])
      .filter(tool => tool.required && tool.state !== 'ok')
      .map(tool => tool.key)
    const cwd = qualityEnv?.cwd
    const reportLines = (qualityInstallSteps ?? [])
      .map(step => `- ${step.ok ? '✓' : '✗'} ${step.id}：${step.detail}`)
      .join('\n')
    const prompt = [
      '请帮我安装并验证 C 单元测试质量工具链，直到每个必装工具都能应答 --version。',
      cwd !== undefined ? `工作区：${cwd}` : '（请先确认当前工作区）',
      missing.length > 0 ? `仍缺失的必装工具：${missing.join('、')}。` : '一键安装复检仍未通过，请逐个排查。',
      '',
      '最近一次一键安装报告：',
      reportLines === '' ? '（尚未运行过一键安装）' : reportLines,
      '',
      '要求：1) gem 装 ceedling 1.0.1，pip 装 gcovr 与 cpplint（gcovr 没有可用的 gem，勿用 gem 装）；',
      '2) 系统级工具（GCC/MinGW、Ruby、Cppcheck、LLVM/clang-format）先给出下载与 PATH 配置步骤再执行；',
      '3) 每装完一个立即运行 <工具> --version 验证；4) 全部就绪后复检并汇报结论。',
    ].join('\n')
    const workspace = this.ctx.get('uiWorkspace') as unknown as WorkspaceStartSlice | undefined
    if (workspace === undefined || typeof workspace.startSession !== 'function') return
    try {
      // No workspaceId → the current/recent workspace (this page's cwd tracks
      // the current session; the prompt also carries the absolute root).
      workspace.startSession(undefined, { agentPreset: 'baf', prompt })
    } catch {
      // Navigation refused (superseded) — nothing to settle; the customer can
      // retry the button.
    }
  }
}
