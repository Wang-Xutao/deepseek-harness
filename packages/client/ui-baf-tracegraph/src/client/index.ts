/**
 * Browser 轨迹图 plugin: conversation view tab + settings contributions.
 *
 * - The conversation view tab is gated on the device-local
 *   trace-graph preference switch — when it is `false` the plugin never
 *   registers a `conversation.view` entry.
 * - The preference persists in localStorage via the client snapshot store
 *   (【变更】2026-09-25: the host settings namespace round-trip was a silent
 *   no-op after the master merge; see ../workflow-settings.ts).
 * - The toggle lives under General settings; the dedicated 工作流 section
 *   hosts the feature-registered workflow preference rows
 *   (`settings.workflow.item`).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
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
import { WorkflowSection } from './WorkflowSection.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'baf.trace-graph': TraceGraphKey
    'baf.workflow': WorkflowKey
  }
}

export type { TraceGraphKey, WorkflowKey } from './locales.ts'

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

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'trace-graph',
    order: 20,
    locale: WORKFLOW_NS,
    inject: settingsInject,
  }, TraceGraphRow))

  // Nav glyph for id `workflow` is owned by ui-settings-general SettingsRoot.
  // 【变更】2026-09-29 (demo23 问题 5): the section declares its child row slot
  // (same composition General settings uses) — feature packages register
  // workflow preference rows into 'settings.workflow.item' instead of the
  // section carrying placeholders.
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'workflow',
    order: 20,
    label: () => tSection('section.title'),
    locale: WORKFLOW_NS,
    children: { 'settings.workflow.item': { kind: 'list', scope: 'root' } },
  }, WorkflowSection))

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
