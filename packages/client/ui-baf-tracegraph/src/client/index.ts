/**
 * Browser 轨迹图 plugin: conversation view tab + 工作流 main panel page.
 *
 * - The conversation view tab is gated on the device-local
 *   trace-graph preference switch — when it is `false` the plugin never
 *   registers a `conversation.view` entry.
 * - The preference persists in localStorage via the client snapshot store
 *   (【变更】2026-09-25: the host settings namespace round-trip was a silent
 *   no-op after the master merge; see ../workflow-settings.ts).
 * - 【变更】2026-10-06 (问题 1): the toggle lives under the dedicated 工作流
 *   surface (`settings.workflow.item`, order 5 — ahead of the 工作流图 row),
 *   no longer under General settings.
 * - 【变更】2026-10-19 (主页面三改 3): the 工作流 surface left the Settings
 *   modal and became a first-level main panel (sidebar entry below 插件 /
 *   自动化任务, tagged baf); this plugin owns the page + panel entry and
 *   still declares the `settings.workflow.item` child slot — now under the
 *   main entry instead of a settings.section one.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-trajectory/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-workflow-run/client'
import type {} from '@deepseek-ai/dsh-session-stats/client'
import {
  INITIAL_TRACE_GRAPH_PREFS, TRACE_GRAPH_PREF_KEY, type BafWorkflowSettings,
} from '../workflow-settings.ts'
import {
  en, enWorkflow, NS, WORKFLOW_NS, zh, zhWorkflow,
  type TraceGraphKey, type WorkflowKey,
} from './locales.ts'
import {
  EMPTY_TRAJECTORY, TraceGraphView, type TraceGraphViewInjected,
} from './TraceGraphView.tsx'
import { TraceGraphRow, type TraceGraphRowInjected } from './TraceGraphRow.tsx'
import { WorkflowPage } from './WorkflowPage.tsx'
import { WorkflowPanelIcon } from './WorkflowPanelIcon.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'baf.trace-graph': TraceGraphKey
    'baf.workflow': WorkflowKey
  }
}

export type { TraceGraphKey, WorkflowKey } from './locales.ts'

/** Main panel key + matching sidebar entry id for the 工作流 page. */
const PANEL_ID = 'workflow' as MainPanelId

/** Required services. */
export const inject = [
  'slots', 'sessions', 'uiConversation', 'uiWorkspace', 'locale',
] as const

/**
 * Project the device-local preference store into a HostObservable view.
 * @param store - the persisted preference store.
 * @returns an observable returning the current preference snapshot.
 */
function observeTraceGraphPrefs(
  store: SnapshotStore<BafWorkflowSettings>,
): HostObservable<BafWorkflowSettings | undefined> {
  return {
    getSnapshot: () => store.getSnapshot(),
    subscribe: listener => store.subscribe(listener),
  }
}

/**
 * Register General 轨迹图 toggle, 工作流 settings section, and conditional tab.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-baf-tracegraph: view dictionaries')
  ctx.effect(
    () => ctx.locale.register(WORKFLOW_NS, { zh: zhWorkflow, en: enWorkflow }),
    'ui-baf-tracegraph: workflow dictionaries',
  )

  const tView = ctx.locale.bind(NS)
  const tSection = ctx.locale.bind(WORKFLOW_NS)

  const prefs = createSnapshotStore(INITIAL_TRACE_GRAPH_PREFS, {
    persist: { name: TRACE_GRAPH_PREF_KEY },
  })

  const settingsInject = (): TraceGraphRowInjected => ({
    hooks: { settings: observeTraceGraphPrefs(prefs) },
    setShowTraceGraph: async (value) => {
      prefs.set({ showTraceGraph: value })
    },
  })

  ctx.slots.inject('settings.workflow.item', () => ctx.slots.register({
    name: 'settings.workflow.item',
    id: 'trace-graph',
    order: 5,
    locale: WORKFLOW_NS,
    inject: settingsInject,
  }, TraceGraphRow))

  // 【变更】2026-10-19 (主页面三改 3): the 工作流 settings.section registration
  // became a first-level main panel + its sidebar entry. The child row slot
  // 'settings.workflow.item' keeps its name, list kind, and root scope, so
  // every row registrant (trace-graph here, baf-workflow's gates/工作流 tabs,
  // baf-standard's project/enterprise/quality rows) is unchanged — only the
  // declaring parent moved. order 20 sits below 插件 (0) and 自动化任务 (10).
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: WORKFLOW_NS,
    children: { 'settings.workflow.item': { kind: 'list', scope: 'root' } },
  }, WorkflowPage))

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 20,
    locale: WORKFLOW_NS,
    label: () => tSection('section.title'),
    // 【变更】2026-10-20 (批次四 3.1): the baf mark moved off the glyph onto the
    // LABEL's top-right corner — it rides as list-option metadata the sidebar
    // renders (narrow rail shows no tag), no longer baked into the icon.
    badge: 'baf',
  }, WorkflowPanelIcon))

  const viewInject = (): TraceGraphViewInjected => ({
    ensureOpen: async (id) => {
      ctx.uiWorkspace.openSession(id)
    },
    childSource: (id: SessionId) => {
      const binding = ctx.sessions.binding(id)
      if (binding === undefined) return undefined
      const conversation = ctx.uiConversation.binding(binding)
      return {
        subscribe(listener) {
          const offTrajectory = conversation.target('trajectory').subscribe(listener)
          const offChat = conversation.target('chat').subscribe(listener)
          const offSession = binding.session.subscribe(listener)
          return () => {
            offTrajectory()
            offChat()
            offSession()
          }
        },
        getTrajectory: () => conversation.target('trajectory').getSnapshot() ?? EMPTY_TRAJECTORY,
        getTurnTimings: () => conversation.target('chat').getSnapshot()?.legacy.turnTimings ?? new Map(),
        getTurnEnds: () => conversation.target('chat').getSnapshot()?.legacy.turnEnds ?? new Map(),
        getRunning: () => binding.session.getSnapshot().running,
      }
    },
  })
  const installView = (): (() => void) => ctx.slots.register({
    name: 'conversation.view',
    id: 'trace-graph',
    order: 20,
    locale: NS,
    label: () => tView('view.trace-graph'),
    inject: viewInject,
  }, TraceGraphView)

  ctx.effect(() => {
    let current: (() => void) | undefined
    const adopt = (): void => {
      const enabled = prefs.getSnapshot().showTraceGraph
      if (current !== undefined) current()
      current = enabled ? installView() : undefined
    }
    const off = prefs.subscribe(adopt)
    adopt()
    return () => {
      off()
      if (current !== undefined) current()
      current = undefined
    }
  }, 'ui-baf-tracegraph: trace-graph tab gated by the device-local preference')
}
