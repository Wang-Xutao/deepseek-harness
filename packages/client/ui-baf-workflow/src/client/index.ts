/**
 * Browser half: conversation Tab「工作流」— only registered for BAF sessions.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
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
  'slots', 'locale', 'remote', 'remote.bafWorkflowView', 'sessions', 'uiSession', 'sidebarRight',
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
        advance: async changeId => unwrap(await remote.advance({ sessionId, changeId })) as WorkflowTabView,
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
        // 【变更】2026-09-23 (user issue #6): the 变更总览 dashboard payload.
        dashboard: async () => unwrap(await remote.dashboard({ sessionId })),
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
      // Master session controller: the active session is the uiSession
      // adapter's current binding (key = session id; '' = absence), not a
      // `current` field on the session list snapshot.
      const currentKey = ctx.uiSession.adapter.current.getSnapshot().key
      const sessionId = currentKey === '' ? undefined : (currentKey as SessionId | undefined)
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

    const offCurrent = ctx.uiSession.adapter.current.subscribe(sync)
    const offList = ctx.sessions.list.subscribe(sync)
    sync()
    return () => {
      offCurrent()
      offList()
      disposePreset?.()
      disposeView?.()
    }
  }, 'ui-baf-workflow: tab gated by current agentPreset')
}
