/**
 * Browser half: conversation Tab「工作流」— only registered for BAF sessions.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from './remote-types.ts'
import { WorkflowView, type WorkflowViewInjected } from './WorkflowView.tsx'
import { buildClientEmptyTabView, type WorkflowTabView } from './tab-types.ts'
import { en, zh, NS, type WorkflowTabKey } from './locales.ts'
import { isBafGatePending } from './gate-ask.ts'
import { bindGateOpenArtifact } from './BafGateComposer.tsx'

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
    bindGateOpenArtifact((sessionId, path) => {
      const cwd = ctx.sessions.list.getSnapshot().byId[sessionId as SessionId]?.cwd
      ctx.sidebarRight.openResource(fileAddressFor(sessionId as SessionId, cwd, path))
    }),
  ))

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
