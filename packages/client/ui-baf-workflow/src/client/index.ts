/**
 * Browser half: conversation Tab「工作流图」— only registered for BAF sessions.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// 【变更】2026-10-21 (配置按钮): the layout service (selectPanel) + its
// MainPanelId brand, for the strip's 配置 button opening the 工作流 page.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from './remote-types.ts'
import { WorkflowView, type WorkflowViewInjected } from './WorkflowView.tsx'
import { WorkflowTabRow, type WorkflowTabRowInjected } from './WorkflowTabRow.tsx'
import { GatesOverviewRow, type GatesOverviewRowInjected } from './GatesOverviewRow.tsx'
// 【变更】2026-10-23 (批次十八 2.2/2.3): the 变更总览 row — the 工作流 page's
// last tab, listing the project's changes (the abandoned ones included).
import { ChangeOverviewRow, type ChangeOverviewRowInjected } from './ChangeOverviewRow.tsx'
// 【变更】2026-10-21 (批次十 测试流图): the session tab + its 工作流通用 row.
import { TestFlowView, type TestFlowViewInjected } from './TestFlowView.tsx'
import { TestFlowTabRow, type TestFlowTabRowInjected } from './TestFlowTabRow.tsx'
import {
  INITIAL_WORKFLOW_TAB_PREFS, WORKFLOW_TAB_PREF_KEY, type BafWorkflowTabSettings,
} from '../workflow-tab-settings.ts'
import {
  buildClientEmptyTabView,
  type BafWorkflowChangeDetailResult,
  type WorkflowTabView,
  type WorkflowTabTestFlowStatus,
} from './tab-types.ts'
import { en, zh, NS, type WorkflowTabKey } from './locales.ts'
import { isBafGatePending } from './gate-ask.ts'
import { bindGateOpenArtifact } from './BafGateComposer.tsx'
// 【变更】2026-10-24 (批次十九 1.3): the hand-off to the 工作流 page's
// 「变更总览」 tab — the ledger's new home.
import { requestWorkflowPageTab } from './workflow-page-nav.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'baf.go-workflow': WorkflowTabKey
  }
}

export type { WorkflowTabKey } from './locales.ts'

/** Required services. */
export const inject = [
  'slots', 'locale', 'remote', 'remote.bafWorkflowView', 'sessions', 'uiSession', 'sidebarRight', 'layout',
] as const

/**
 * Unwrap a RemoteResult or throw.
 * @param result - remote result.
 * @returns value.
 */
function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { message: string; code: string } }): T {
  if (!result.ok) throw new Error(`${result.error.message} (${result.error.code})`)
  return result.value
}

/**
 * Register the BAF 工作流 conversation view only while the current session is BAF.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-baf-workflow: dictionaries')

  // 【变更】2026-10-07 (九点批 修): bound BEFORE the composer inject below —
  // that callback runs synchronously when the parent slot already exists, and
  // its options object reads `t` (the routePreview line's label binder), so a
  // later `const t` hit the TDZ and killed the whole entry's activation.
  const t = ctx.locale.bind(NS)

  // 【变更】2026-09-25 (用户需求 工作流 1/2): the unified BAF gate card as a
  // composer-chain entry. Priority -10 runs the selector BEFORE
  // ui-user-questions' default-0 entry, so every `header: 'BAF 工作流'`
  // pending question elects the BAF card (unified style, no technical
  // detail) instead of the generic question form; business 选择卡
  // (`header: 'BAF 选择卡'`) and all other carriers fall through untouched.
  // The selector is pure (structural read of the owner's currency — the same
  // contract ui-user-questions' selector follows); tab-flip hiding happens
  // INSIDE the component (render-time store read), never in the selector.
  // Registered unconditionally: the header discriminator only ever matches
  // BAF sessions' gate dialogs, so non-BAF sessions keep the generic flow.
  // 【变更】2026-09-28 (用户问题 1.5): the card binds the same artifact-opening
  // channel the Tab rail uses, so the dialog's 【产物】 chips open the
  // produced documents in the right sidebar.
  ctx.slots.inject('conversation.composer', () => ctx.slots.register(
    {
      name: 'conversation.composer',
      priority: -10,
      select: ({ pendingInteraction }: ComposerChainProps) =>
        isBafGatePending(pendingInteraction) ? pendingInteraction : null,
      locale: NS,
    },
    bindGateOpenArtifact(
      (sessionId, path) => {
        const cwd = ctx.sessions.list.getSnapshot().byId[sessionId as SessionId]?.cwd
        ctx.sidebarRight.openResource(fileAddressFor(sessionId as SessionId, cwd, path))
      },
      {
        // 【变更】2026-10-07 (九点批 问题 2): the card-level「确认后派单」preview —
        // the same routePreview remote the Tab decision cards render.
        routePreview: async (sessionId, changeId, node) => unwrap(await ctx.remote.bafWorkflowView.routePreview({
          sessionId: sessionId as SessionId,
          changeId,
          node,
        })) as import('./tab-types.ts').WorkflowTabRoutePreview,
        t,
      },
    ),
  ))

  // 【变更】2026-09-29 (demo23 问题 5): the 是否显示工作流 Tab preference —
  // device-local (localStorage via the client snapshot store), default on.
  // The same 2026-09-25 lesson the 轨迹图 toggle learned applies: browser-local
  // tab visibility never crosses the wire, so it persists client-side.
  const prefs = createSnapshotStore(INITIAL_WORKFLOW_TAB_PREFS, {
    persist: { name: WORKFLOW_TAB_PREF_KEY },
  })
  const observePrefs = (): HostObservable<BafWorkflowTabSettings | undefined> => ({
    getSnapshot: () => prefs.getSnapshot(),
    subscribe: listener => prefs.subscribe(listener),
  })
  const settingsInject = (): WorkflowTabRowInjected => ({
    hooks: { settings: observePrefs() },
    setShowWorkflowTab: async (value) => {
      // set() is wholesale (no patch API) — spread the current snapshot so
      // sibling switches (批次十's showTestFlowTab) survive the update.
      prefs.set({ ...prefs.getSnapshot(), showWorkflowTab: value })
    },
  })
  // The 工作流 settings section (owned by ui-baf-tracegraph) declares this
  // child slot; the row rides it exactly like General-settings rows do.
  ctx.slots.inject('settings.workflow.item', () => ctx.slots.register({
    name: 'settings.workflow.item',
    id: 'workflow-tab',
    order: 10,
    locale: NS,
    inject: settingsInject,
  }, WorkflowTabRow))

  // 【变更】2026-10-21 (批次十 测试流图): the 测试流图 visibility switch — the
  // row right under the 工作流图 one, same snapshot, same Switch primitive.
  // `!== false` read: a pre-批次十 snapshot must keep the new tab visible.
  const testFlowSettingsInject = (): TestFlowTabRowInjected => ({
    hooks: { settings: observePrefs() },
    setShowTestFlowTab: async (value) => {
      prefs.set({ ...prefs.getSnapshot(), showTestFlowTab: value })
    },
  })
  ctx.slots.inject('settings.workflow.item', () => ctx.slots.register({
    name: 'settings.workflow.item',
    id: 'test-flow-tab',
    order: 11,
    locale: NS,
    inject: testFlowSettingsInject,
  }, TestFlowTabRow))

  // 【变更】2026-10-07 (九点批 问题 9): the 门禁总览 read-only row — loads the
  // static registry projection on the user's first expand (user-triggered, so
  // no remote-default-responses entry; the rulesDoc precedent).
  ctx.slots.inject('settings.workflow.item', () => ctx.slots.register({
    name: 'settings.workflow.item',
    id: 'baf-gates-overview',
    order: 15,
    locale: NS,
    inject: (): GatesOverviewRowInjected => ({
      loadGateOverview: async () => unwrap(await ctx.remote.bafWorkflowView.gateOverview()),
      embeddedInTab: true,
    }),
  }, GatesOverviewRow))

  // 【变更】2026-10-23 (批次十八 2.2/2.3): the 变更总览 row — the 工作流 page's
  // LAST tab, listing every change of the current project (the abandoned ones
  // are recorded rows, not a missing entry). The read is workspace-scoped:
  // the page is a main-stage surface with no conversation behind it.
  // 【变更】2026-10-24 (批次十九 1.3): the row's drill-down — clicking a change
  // opens its flow + history modal (the session tab's 变更总览 modal is gone).
  ctx.slots.inject('settings.workflow.item', () => ctx.slots.register({
    name: 'settings.workflow.item',
    id: 'baf-change-overview',
    order: 16,
    locale: NS,
    inject: (): ChangeOverviewRowInjected => ({
      // 【变更】2026-10-26 (用户问题 2): `cwd` — the main-view session's
      // workspace. The row reads its sessions through the `sessions` seat and
      // passes the workspace the user is looking at, so 变更总览 switches with
      // the workspace instead of always answering for the newest session.
      loadChangeOverview: async (cwd?: string) =>
        unwrap(await ctx.remote.bafWorkflowView.changeOverview(cwd === undefined ? {} : { cwd })),
      // 【变更】2026-10-24 (批次十九 1.3): the host's payload type is the
      // baf-core .d.ts build (compiled WITHOUT exactOptionalPropertyTypes, so
      // its optional props carry `| undefined`), while the client mirror is
      // strict — the two differ only in that optionality, so the same plain
      // `as` the 测试流图 tab's `testFlowStatus` uses bridges them.
      loadChangeDetail: async (changeId: string, cwd?: string) =>
        unwrap(await ctx.remote.bafWorkflowView.changeDetail(
          cwd === undefined ? { changeId } : { changeId, cwd },
        )) as BafWorkflowChangeDetailResult,
      // 【变更】2026-10-24 (批次二十 3): open one of the change's artifacts in
      // the right sidebar. The 变更总览 page is PROJECT-scoped — there is no
      // conversation behind it to borrow a file address from — so the opener
      // resolves a LIVE session of the SAME workspace and uses its id. With no
      // such session the page has no sidebar to open into, so the opener
      // reports the refusal instead of the page offering a dead button.
      openArtifact: (cwd: string, path: string): boolean => {
        const sessions = Object.values(ctx.sessions.list.getSnapshot().byId)
        const owner = sessions.find(session => session.cwd === cwd)
        if (owner === undefined) return false
        ctx.sidebarRight.openResource(fileAddressFor(owner.id, cwd, path))
        return true
      },
      // 【变更】2026-10-25 (批次二十四 1): the artifact preview's reader. The
      // page is PROJECT-scoped, so it borrows a LIVE session of the same
      // workspace and reads the document through it (the same
      // readWorkspaceFile remote the 测试流图's config preview uses).
      readArtifact: async (cwd: string, path: string) => {
        const sessions = Object.values(ctx.sessions.list.getSnapshot().byId)
        const owner = sessions.find(session => session.cwd === cwd)
        if (owner === undefined) return { status: 'unreadable', path, reason: 'no-session' }
        return unwrap(await ctx.remote.bafWorkflowView.readWorkspaceFile({
          sessionId: owner.id,
          path,
        })) as import('./tab-types.ts').WorkflowTabFileReadResult
      },
    }),
  }, ChangeOverviewRow))

  const installView = (): (() => void) => ctx.slots.register({
    name: 'conversation.view',
    id: 'baf-workflow',
    // 【变更】2026-10-22 (批次十二 1): 12 — the middle chart of the contiguous
    // trio right after 轨迹 (10): 轨迹图 11 (ui-baf-tracegraph) · 工作流图 12 ·
    // 测试流图 13. Below every other registrant (上下文 = 30), so the strip
    // order is fixed across hide/show cycles regardless of load order.
    order: 12,
    locale: NS,
    label: () => t('view.workflow'),
    inject: (sessionId: SessionId): WorkflowViewInjected => {
      const remote = ctx.remote.bafWorkflowView
      return {
        refresh: async (changeId?: string): Promise<WorkflowTabView> => {
          try {
            return unwrap(await remote.getTabView({
              sessionId,
              ...(changeId === undefined ? {} : { changeId }),
            })) as WorkflowTabView
          } catch (err) {
            return {
              ...buildClientEmptyTabView(),
              blockedReason: err instanceof Error ? err.message : String(err),
            }
          }
        },
        confirmIntake: async changeId => unwrap(await remote.confirmIntake({ sessionId, changeId })) as WorkflowTabView,
        rejectIntake: async changeId => unwrap(await remote.rejectIntake({ sessionId, changeId })) as WorkflowTabView,
        startIntake: async description => unwrap(await remote.startIntake({ sessionId, description })) as WorkflowTabView,
        // 【变更】2026-09-25 (用户需求 工作流 1): the Tab's TOP advance dialog is
        // itself the confirmation — `skipAsk` makes the host take the confirm
        // positive path instead of popping a second session-form dialog.
        advance: async (changeId, skipAsk) => unwrap(await remote.advance({
          sessionId,
          changeId,
          ...(skipAsk === true ? { skipAsk: true } : {}),
        })) as WorkflowTabView,
        transition: async (changeId, to, evidence) => unwrap(await remote.transition({
          sessionId,
          changeId,
          to,
          ...(evidence === undefined ? {} : { evidence }),
        })) as WorkflowTabView,
        resume: async (changeId, node) => unwrap(await remote.resume({
          sessionId,
          changeId,
          ...(node === undefined ? {} : { node }),
        })) as WorkflowTabView,
        gateResolve: async request => unwrap(await remote.gateResolve({
          sessionId,
          ...request,
        })) as WorkflowTabView,
        // 【变更】2026-09-28 (用户问题 1.7 Tab parity): the advance-dialog /
        // parked-gate-banner revision input — same `gate-revise` work-order
        // dispatch the session dialog's custom answer takes.
        gateRevise: async request => unwrap(await remote.gateRevise({
          sessionId,
          ...(request.changeId === undefined ? {} : { changeId: request.changeId }),
          ...(request.gateId === undefined ? {} : { gateId: request.gateId }),
          ...(request.node === undefined ? {} : { node: request.node }),
          ...(request.mode === undefined ? {} : { mode: request.mode }),
          text: request.text,
        })) as WorkflowTabView,
        // 【变更】2026-10-07 (九点批 问题 2): the「确认后派单」preview — same pure
        // core a real dispatch runs, no pin, no audit.
        routePreview: async (changeId, node) => unwrap(await remote.routePreview({
          sessionId,
          changeId,
          node,
        })) as import('./tab-types.ts').WorkflowTabRoutePreview,
        // 2026-09-21 (session 5.jsonl) — the Tab's real "open this artifact"
        // channel. Cards render in <pre> plain text (no clickable paths), so
        // the artifact rows in the rail open the file in the right sidebar
        // through the same address ui-chat's openFile builds.
        openArtifact: (path: string) => {
          const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
          ctx.sidebarRight.openResource(fileAddressFor(sessionId, cwd, path))
        },
        // §22.19 R5 — real-time Tab push. The host emits
        // `baf-workflow/projection-appended` (per workspace, forwarded by
        // api-remotes) after every appended event; this subscription pokes
        // the view, which refreshes on a trailing debounce. The cwd filter
        // keeps one session's Tab from reacting to another workspace's
        // appends. Returns the `$on` disposer for the view's useEffect.
        subscribe: (listener: () => void): (() => void) =>
          ctx.remote.$on('baf-workflow/projection-appended', (event) => {
            const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
            if (cwd !== undefined && cwd === event.cwd) listener()
          }),
        // 【变更】2026-10-21 (配置按钮): open the main-stage 工作流 config page —
        // the same panel the sidebar's 工作流 entry selects (ui-baf-tracegraph's
        // 'workflow' MainPanelId); the strip's 配置 button fires this.
        openWorkflowConfig: () => {
          ctx.layout.selectPanel('workflow' as MainPanelId)
        },
        // 【变更】2026-10-27 (批次三十): the 「同步」button — re-author the
        // stale documents against the newest upstream. The remote resolves the
        // workspace from the session's cwd (the same pin `changeDetail` uses).
        // 【变更】2026-10-27 (批次三十一): the session id travels with the
        // request — the work order must land in THIS conversation.
        syncArtifacts: async (changeId: string) => {
          const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
          return unwrap(await remote.syncArtifacts({
            sessionId,
            changeId,
            ...(cwd === undefined ? {} : { cwd }),
          })) as import('../types.ts').BafWorkflowSyncResult
        },
        // 【变更】2026-10-27 (批次三十): the 暂停/继续 button — brake the
        // workflow, or release it and hand the outstanding gap back.
        setPaused: async (changeId: string, paused: boolean) =>
          unwrap(await remote.setWorkflowPaused({ sessionId, changeId, paused })) as import('../types.ts').BafWorkflowPauseResult,
        // 【变更】2026-10-24 (批次十九 1.3): the strip's 变更总览 button — the
        // change ledger moved to the 工作流 page, so the button asks that page
        // for its 变更总览 tab and opens the panel.
        openChangeOverview: () => {
          requestWorkflowPageTab('changes')
          ctx.layout.selectPanel('workflow' as MainPanelId)
        },
      }
    },
  }, WorkflowView)

  // 【变更】2026-10-21 (批次十 测试流图): the session 测试流图 tab — the last of
  // the contiguous chart trio right after 轨迹: 轨迹图 11 · 工作流图 12 ·
  // 测试流图 13 (【变更】2026-10-22 批次十二 1 — was 30, after the 上下文 tab;
  // unique orders below every other registrant fix the position for good).
  // One testFlowStatus pull (its own Remote — the workspace's quality
  // reports), the same push channel and artifact-opener the 工作流图 tab uses;
  // 【变更】2026-10-22 (批次十二 2.1/2.3/2.6): the per-stage 运行 Remote, the
  // config-file preview Remote, and the strip's 配置 button (same panel the
  // 工作流图 tab's opens).
  const installTestFlowView = (): (() => void) => ctx.slots.register({
    name: 'conversation.view',
    id: 'baf-test-flow',
    order: 13,
    locale: NS,
    label: () => t('view.testFlow'),
    inject: (sessionId: SessionId): TestFlowViewInjected => {
      const remote = ctx.remote.bafWorkflowView
      return {
        refresh: async () => unwrap(await remote.testFlowStatus({ sessionId })) as WorkflowTabTestFlowStatus,
        openArtifact: (path: string) => {
          const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
          ctx.sidebarRight.openResource(fileAddressFor(sessionId, cwd, path))
        },
        subscribe: (listener: () => void): (() => void) =>
          ctx.remote.$on('baf-workflow/projection-appended', (event) => {
            const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
            if (cwd !== undefined && cwd === event.cwd) listener()
          }),
        // 【变更】2026-10-22 (批次十二 2.1): one node's 运行 — the host spawns
        // the stage's baf-wrapped command in the workspace root.
        runStage: async (stage, arg) => unwrap(await remote.runTestFlowStage({
          sessionId,
          stage,
          arg,
        })) as import('./tab-types.ts').WorkflowTabStageRunResult,
        // 【变更】2026-10-22 (批次十三 1): the strip's 全部运行 — one host sweep
        // over the enabled stages in canonical order (skipped stages reported
        // as such; 错误即中止 halts the sweep at a failure).
        runChain: async arg => unwrap(await remote.runTestFlowChain({
          sessionId,
          arg,
        })) as import('./tab-types.ts').WorkflowTabChainRunResult,
        // 【变更】2026-10-22 (批次十二 2.6): one config file's preview payload.
        readFile: async path => unwrap(await remote.readWorkspaceFile({ sessionId, path })) as import('./tab-types.ts').WorkflowTabFileReadResult,
        // 【变更】2026-10-22 (批次十二 2.3): open the 工作流 config page — the
        // same panel the 工作流图 tab's 配置 button selects.
        openWorkflowConfig: () => {
          ctx.layout.selectPanel('workflow' as MainPanelId)
        },
      }
    },
  }, TestFlowView)

  // Tabs are global to the conversation chrome: keep the entries mounted only
  // while the *current* session's agentPreset is baf AND the device-local
  // visibility switches are on (demo23 问题 5 — a switch unmounts its tab
  // immediately, no restart).
  ctx.effect(() => {
    let disposeView: (() => void) | undefined
    let disposeTestFlow: (() => void) | undefined
    let disposePreset: (() => void) | undefined

    const setWanted = (mountWorkflow: boolean, mountTestFlow: boolean): void => {
      if (mountWorkflow) {
        if (disposeView === undefined) disposeView = installView()
      } else if (disposeView !== undefined) {
        disposeView()
        disposeView = undefined
      }
      // 【变更】2026-10-21 (批次十): `!== false` — pre-批次十 snapshots lack the
      // key and must keep the new tab visible.
      if (mountTestFlow) {
        if (disposeTestFlow === undefined) disposeTestFlow = installTestFlowView()
      } else if (disposeTestFlow !== undefined) {
        disposeTestFlow()
        disposeTestFlow = undefined
      }
    }

    const sync = (): void => {
      disposePreset?.()
      disposePreset = undefined
      // Master session controller: the active session is the uiSession
      // adapter's current binding (key = session id; '' = absence), not a
      // `current` field on the session list snapshot.
      const currentKey = ctx.uiSession.adapter.current.getSnapshot().key
      const sessionId = currentKey === '' ? undefined : (currentKey as SessionId | undefined)
      const binding = sessionId === undefined ? undefined : ctx.sessions.binding(sessionId)
      const face = binding?.session.projections.faceOf('agentPreset')
      if (face === undefined) {
        setWanted(false, false)
        return
      }
      const read = (): void => {
        const isBaf = face.getSnapshot() === 'baf'
        const snap = prefs.getSnapshot()
        setWanted(isBaf && snap.showWorkflowTab, isBaf && snap.showTestFlowTab !== false)
      }
      read()
      disposePreset = face.subscribe(read)
    }

    const offPrefs = prefs.subscribe(() => { sync() })
    const offCurrent = ctx.uiSession.adapter.current.subscribe(sync)
    const offList = ctx.sessions.list.subscribe(sync)
    sync()
    return () => {
      offPrefs()
      offCurrent()
      offList()
      disposePreset?.()
      disposeView?.()
      disposeTestFlow?.()
    }
  }, 'ui-baf-workflow: tabs gated by current agentPreset and the workflow-tab preferences')
}
