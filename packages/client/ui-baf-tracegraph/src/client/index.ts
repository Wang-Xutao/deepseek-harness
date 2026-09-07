/**
 * Browser 轨迹图 plugin: conversation view tab + settings contributions.
 *
 * - The conversation view tab is gated on the durable
 *   `BafWorkflowSettings.showTraceGraph` switch — when it is `false` the
 *   plugin never registers a `conversation.view` entry.
 * - The toggle lives under General settings; the dedicated 工作流 section
 *   keeps placeholders for future BAF workflow preferences.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-trajectory/client'
import type {} from '@deepseek-ai/dsh-client-ui-workflow-run/client'
import type {} from '@deepseek-ai/dsh-session-stats/client'
import type { BafWorkflowSettings } from '../workflow-settings.ts'
import { SHOW_TRACE_GRAPH_FIELD } from '../workflow-settings.ts'
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
  'slots', 'sessions', 'uiConversation', 'locale', 'settingsScope',
] as const

/**
 * Project one settings namespace scope into a HostObservable view.
 * @param scope - the baf-workflow namespace scope.
 * @returns an observable returning the current decoded section.
 */
function observeBafWorkflowSettings(
  scope: SettingsScope<BafWorkflowSettings>,
): HostObservable<BafWorkflowSettings | undefined> {
  return {
    getSnapshot: () => scope.getSnapshot().value as BafWorkflowSettings | undefined,
    subscribe: listener => scope.subscribe(listener),
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

  const settings = ctx.settingsScope.bind<BafWorkflowSettings>({ namespace: 'baf-workflow' })

  const settingsInject = (): TraceGraphRowInjected => ({
    hooks: { settings: observeBafWorkflowSettings(settings) },
    setShowTraceGraph: value => settings.set(SHOW_TRACE_GRAPH_FIELD, value),
  })

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'trace-graph',
    order: 20,
    locale: WORKFLOW_NS,
    inject: settingsInject,
  }, TraceGraphRow))

  // Nav glyph for id `workflow` is owned by ui-settings-general SettingsRoot.
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'workflow',
    order: 20,
    label: () => tSection('section.title'),
    locale: WORKFLOW_NS,
  }, WorkflowSection))

  const viewInject = (): TraceGraphViewInjected => ({
    ensureOpen: id => ctx.sessions.ensureOpen(id),
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
      const enabled = settings.getSnapshot().value?.showTraceGraph ?? true
      if (current !== undefined) current()
      current = enabled ? installView() : undefined
    }
    const off = settings.subscribe(adopt)
    adopt()
    return () => {
      off()
      if (current !== undefined) current()
      current = undefined
    }
  }, 'ui-baf-tracegraph: trace-graph tab gated by baf-workflow.showTraceGraph')
}
