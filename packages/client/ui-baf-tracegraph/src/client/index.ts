/**
 * Browser 轨迹图 plugin: conversation view tab + 工作流 settings section.
 *
 * - The conversation view tab is gated on the durable
 *   `BafWorkflowSettings.showTraceGraph` switch — when it is `false` the
 *   plugin never registers a `conversation.view` entry, so the tab is
 *   absent from the assembled UI without touching the upstream view ledger.
 * - The settings section is always mounted (so the user can re-enable the
 *   tab), and reads the same scope through a HostObservable selector.
 */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-trajectory/client'
import type {} from '@deepseek-ai/dsh-client-ui-workflow-run/client'
import type {} from '@deepseek-ai/dsh-session-stats/client'
import type { BafWorkflowSettings } from '../workflow-settings.ts'
import { SHOW_TRACE_GRAPH_FIELD } from '../workflow-settings.ts'
import {
  en, enWorkflow, NS, WORKFLOW_NS, zh, zhWorkflow,
} from './locales.ts'
import {
  TraceGraphView, type TraceGraphViewInjected,
} from './TraceGraphView.tsx'
import { WorkflowSection, type WorkflowSectionInjected } from './WorkflowSection.tsx'
import { IconWorkflowOutline16 } from './icons.tsx'

export type { TraceGraphKey, WorkflowKey } from './locales.ts'

/** Required services. */
export const inject = ['slots', 'sessions', 'locale', 'settingsScope']

/**
 * Project one settings namespace scope into a `HostObservable<BafWorkflowSettings | undefined>`
 * view consumed by the settings section renderer.
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
 * Register the 工作流 settings section and conditionally the 轨迹图
 * conversation view tab.
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

  // Durable namespace scope — observes the baf-workflow section and writes
  // through it. Bind on the calling fiber so the disposer follows the plugin.
  const settings = ctx.settingsScope.bind<BafWorkflowSettings>({ namespace: 'baf-workflow' })

  // ---- 工作流 settings section (always mounted so the user can re-enable).
  const settingsSectionInject = (): WorkflowSectionInjected => ({
    hooks: { settings: observeBafWorkflowSettings(settings) },
    setShowTraceGraph: value => settings.set(SHOW_TRACE_GRAPH_FIELD, value),
  })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'workflow',
    order: 20,
    label: () => tSection('section.title'),
    icon: IconWorkflowOutline16,
    locale: WORKFLOW_NS,
    inject: settingsSectionInject,
  }, WorkflowSection))

  // ---- 轨迹图 conversation view tab — only when the switch is on.
  const viewInject = (): TraceGraphViewInjected => ({
    ensureOpen: id => ctx.sessions.ensureOpen(id),
    bindingSession: id => ctx.sessions.binding(id)?.session,
  })
  const installView = (): (() => void) => ctx.slots.register({
    name: 'conversation.view',
    id: 'trace-graph',
    order: 20,
    locale: NS,
    label: () => tView('view.trace-graph'),
    inject: viewInject,
  }, TraceGraphView)

  // Re-evaluate the registration whenever the settings scope publishes. While
  // the scope is still `loading` we default to ON — pre-release stance prefers
  // shipping the tab over silently hiding it on first paint.
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
