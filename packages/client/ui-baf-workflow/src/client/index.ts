/**
 * Browser half: conversation Tab「工作流」— only registered for BAF sessions.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from './remote-types.ts'
import { WorkflowView, type WorkflowViewInjected } from './WorkflowView.tsx'
import { buildClientEmptyTabView, type WorkflowTabView } from './tab-types.ts'
import { en, zh, NS, type WorkflowTabKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'baf.go-workflow': WorkflowTabKey
  }
}

export type { WorkflowTabKey } from './locales.ts'

/** Required services. */
export const inject = [
  'slots', 'locale', 'remote', 'remote.bafWorkflowView', 'sessions',
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

  const t = ctx.locale.bind(NS)

  const installView = (): (() => void) => ctx.slots.register({
    name: 'conversation.view',
    id: 'baf-workflow',
    order: 25,
    locale: NS,
    label: () => t('view.workflow'),
    inject: (sessionId: SessionId): WorkflowViewInjected => {
      const remote = ctx.remote.bafWorkflowView
      return {
        refresh: async (): Promise<WorkflowTabView> => {
          try {
            return unwrap(await remote.getTabView({ sessionId })) as WorkflowTabView
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
        transition: async (changeId, to) => unwrap(await remote.transition({ sessionId, changeId, to })) as WorkflowTabView,
        resume: async (changeId, node) => unwrap(await remote.resume({
          sessionId,
          changeId,
          ...(node === undefined ? {} : { node }),
        })) as WorkflowTabView,
        gateResolve: async request => unwrap(await remote.gateResolve({
          sessionId,
          ...request,
        })) as WorkflowTabView,
      }
    },
  }, WorkflowView)

  // Tabs are global to the conversation chrome: keep the entry mounted only
  // while the *current* session's agentPreset is baf.
  ctx.effect(() => {
    let disposeView: (() => void) | undefined
    let disposePreset: (() => void) | undefined

    const setWanted = (wanted: boolean): void => {
      if (wanted) {
        if (disposeView === undefined) disposeView = installView()
        return
      }
      if (disposeView !== undefined) {
        disposeView()
        disposeView = undefined
      }
    }

    const sync = (): void => {
      disposePreset?.()
      disposePreset = undefined
      const sessionId = ctx.sessions.list.getSnapshot().current
      const binding = sessionId === undefined ? undefined : ctx.sessions.binding(sessionId)
      const face = binding?.session.projections.faceOf('agentPreset')
      if (face === undefined) {
        setWanted(false)
        return
      }
      const read = (): void => {
        setWanted(face.getSnapshot() === 'baf')
      }
      read()
      disposePreset = face.subscribe(read)
    }

    const offList = ctx.sessions.list.subscribe(sync)
    sync()
    return () => {
      offList()
      disposePreset?.()
      disposeView?.()
    }
  }, 'ui-baf-workflow: tab gated by current agentPreset')
}
