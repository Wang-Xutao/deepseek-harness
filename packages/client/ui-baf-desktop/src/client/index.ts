/**
 * Browser half: hero trailing Sora mark, sidebar brand slots, and help docs panel.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
// Type-only: the Client Remote service (the `remote` seat) and the BAF Host
// bridge's client face — the namespace the「格式化输入」model call rides.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-baf-workflow/remote'
// Type-only: the forwarded Session events (the failure relay) and the Session
// root standard-hook merge (the session status the observer reads).
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionIdOf } from '@deepseek-ai/dsh-client-ui-slots'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { readDesktopBridge, type DesktopNotificationPayload } from './bridge.ts'
import { DesktopNotificationController, type DesktopNotificationEvent } from './desktop-notification.ts'
import { DesktopNotificationWatcher, type DesktopNotificationWatcherInjected } from './DesktopNotificationWatcher.tsx'
import { HeroTrailingMark } from './HeroTrailingMark.tsx'
import { SidebarBrandMark } from './SidebarBrandMark.tsx'
import { SidebarBrandName } from './SidebarBrandName.tsx'
import { DraftFormatButton, type DraftFormatInjected } from './DraftFormatButton.tsx'
import { DraftFormatToast, type DraftFormatToastInjected } from './DraftFormatToast.tsx'
import { DraftFormatNoticeController } from './draft-format-notice.ts'
import { UpdatePromptDialog, type UpdatePromptDialogInjected } from './UpdatePromptDialog.tsx'
import { UpdatePromptController, parseUpdatePrompt } from './update-prompt.ts'
import { HelpFooterAction, type HelpFooterInjected } from './HelpFooterAction.tsx'
import { en, zh, type BafDesktopKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'baf.desktop': BafDesktopKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'baf.desktop'

export type { BafDesktopKey } from './locales.ts'
export type {
  DesktopNotificationController,
  DesktopNotificationEvent,
  DesktopNotificationEventKind,
} from './desktop-notification.ts'

/**
 * Required services.
 *
 * 【变更】2026-10-26 (批次二十九 1): the「格式化输入」model call rides the
 * `bafWorkflowView` Remote namespace, and a Remote namespace is a CORDIS
 * SERVICE of its own (`remote.bafWorkflowView`), not a property hanging off
 * the `remote` service. Reading `ctx.remote.bafWorkflowView` therefore asks the
 * context resolver for the service name `remote.bafWorkflowView` — so the
 * plugin must INJECT that name. Without it the read throws
 * 「cannot get property "remote.bafWorkflowView" without inject」, the control
 * swallows the failure and falls back to the local arranger, and the user sees
 * 「模型未响应，已用本地规则整理结构」 even though the Host answers the very
 * same call.
 */
export const inject = ['slots', 'locale', 'shortcuts', 'remote', 'remote.bafWorkflowView'] as const

/**
 * 【变更】2026-10-25 (批次二十六 3): raise one desktop notification for a
 * settled Session event. The renderer owns the copy and the Session title;
 * the Electron shell owns the decision to show it, so the
 * `desktopNotifications` setting has a single owner and takes effect without
 * a reload.
 * @param event - the settled Session event.
 * @param controller - the controller holding the Session titles.
 * @param t - the namespace translate function.
 */
async function raiseDesktopNotification(
  event: DesktopNotificationEvent,
  controller: DesktopNotificationController,
  t: TranslateNS<'baf.desktop'>,
): Promise<void> {
  const bridge = readDesktopBridge()
  if (bridge?.notify === undefined) return
  const session = controller.titleOf(event.sessionId) ?? event.sessionId
  const payload: DesktopNotificationPayload = event.kind === 'complete'
    ? {
      kind: 'complete',
      title: t('notification.complete.title'),
      body: t('notification.complete.body', { session }),
    }
    : event.kind === 'error'
      ? {
        kind: 'error',
        title: t('notification.error.title'),
        body: t('notification.error.body', { session, detail: event.detail ?? '' }),
      }
      : event.attention === 'approval'
        ? {
          kind: 'attention',
          title: t('notification.approval.title'),
          body: t('notification.approval.body', { session }),
        }
        : {
          kind: 'attention',
          title: t('notification.attention.title'),
          body: t('notification.attention.body', { session }),
        }
  try {
    await bridge.notify(payload)
  } catch {
    // The shell may be tearing down; a lost toast must not break the page.
  }
}

/**
 * Register baf desktop chrome into the conversation and sidebar holes.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-baf-desktop: dictionaries')
  const t = ctx.locale.bind(NS)

  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.register({ name: 'sidebar.brand.mark' }, SidebarBrandMark))

  // Override ui-brand-official's "DeepSeek Harness" wordmark so the title row
  // reads "BAF DSH" + the version capsule instead. baf-desktop activates after
  // brand-official in the standard profile boot order, so this slot wins.
  ctx.slots.inject('sidebar.brand.name', () =>
    ctx.slots.register({ name: 'sidebar.brand.name' }, SidebarBrandName))

  // Trailing two-ring mark after the hero headline; the rings spin in opposite
  // directions while the mark is hovered.
  ctx.slots.inject('conversation.hero.brand.trailing', () =>
    ctx.slots.register({ name: 'conversation.hero.brand.trailing' }, HeroTrailingMark))

  // 【变更】2026-10-25 (批次二十二): the composer tidy-up control. It sits in
  // the composer's right cluster, before the model selector and the send
  // action. The control arranges the current draft into Markdown structure.
  // 【变更】2026-10-25 (批次二十四 3): the arrangement now runs on the
  // SESSION'S OWN MODEL — the Host bridge arranges the draft with the model
  // that already answers this conversation, and the control falls back to its
  // local deterministic arranger when no model answered. The user picks no
  // mode: one button, the best answer available.
  // 【变更】2026-10-25 (批次二十五 2): the outcome of a run is published to the
  // app-wide notice (the `shell.overlay` toast below), so the user reads which
  // of the two answered without hovering the control.
  const draftNotice = new DraftFormatNoticeController()
  ctx.slots.inject('conversation.input.right', () =>
    ctx.slots.register({
      name: 'conversation.input.right', id: 'draft-format', order: 0, locale: NS,
      inject: (sessionId: SessionIdOf): DraftFormatInjected => ({
        // 【变更】2026-10-25 (批次二十五 2): the answer carries the model that
        // ran, so the control can tell the user the model really answered (a
        // silent fallback read as「没有效果」).
        formatWithModel: async (draft: string) => {
          const result = await ctx.remote.bafWorkflowView.formatDraft({ sessionId, draft })
          if (!result.ok) return undefined
          if (result.value.status !== 'ready') return undefined
          return { text: result.value.text, model: result.value.model }
        },
        notifyOutcome: (kind, model) => { draftNotice.publish(kind, model) },
      }),
    }, DraftFormatButton))

  // 【变更】2026-10-25 (批次二十五 2): the app-wide notice. It lives in the
  // frame-wide overlay layer, so it outlives the composer that produced it —
  // a toast rendered inside the composer would vanish with it.
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({
      name: 'shell.overlay', id: 'baf-desktop.draft-format-toast', locale: NS,
      inject: (): DraftFormatToastInjected => ({
        hooks: { draftFormatNotice: draftNotice.store },
        dismiss: () => { draftNotice.dismiss() },
      }),
    }, DraftFormatToast))

  // 【变更】2026-10-25 (批次二十六 3): the desktop notification. The observer
  // lives in the frame-wide overlay layer, so it sees every Session in the
  // list — not only the open one — and the toast belongs to the operating
  // system, not to the page. The failure relay arrives as a Remote event, so
  // it does not depend on the observed Session being open.
  const notifications = new DesktopNotificationController((event) => {
    void raiseDesktopNotification(event, notifications, t)
  })
  ctx.effect(() => ctx.remote.$on('api-session/error', (sessionId, message) => {
    notifications.observeError(sessionId, message)
  }), 'ui-baf-desktop: session failure relay')
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({
      name: 'shell.overlay', id: 'baf-desktop.notification-watcher', locale: NS,
      inject: (): DesktopNotificationWatcherInjected => ({ controller: notifications }),
    }, DesktopNotificationWatcher))

  // 【变更】2026-10-25 (批次二十六 4): the update prompt. The shell decides
  // WHEN to prompt and WHAT the update means; the app draws the dialog — the
  // operating system's message box looked like a stranger in a product that
  // paints every other surface itself. The dialog lives in the frame-wide
  // overlay layer, so it survives whatever the user is doing while it waits.
  const updatePrompt = new UpdatePromptController()
  ctx.effect(() => {
    const bridge = readDesktopBridge()
    if (bridge === undefined) return () => { /* no shell bridge: nothing to listen to */ }
    // The shell keeps the prompt until the next one, so a renderer that
    // mounted late still finds it — the fetch covers the push's blind spot.
    const offPrompt = bridge.onUpdatePrompt?.((payload) => {
      const prompt = parseUpdatePrompt(payload)
      if (prompt !== undefined) updatePrompt.show(prompt)
    })
    void bridge.getUpdatePrompt?.().then((payload) => {
      const prompt = parseUpdatePrompt(payload)
      if (prompt !== undefined) updatePrompt.show(prompt)
    }).catch(() => { /* no pending prompt */ })
    const offProgress = bridge.onUpdateProgress?.((payload) => {
      updatePrompt.setProgress(typeof payload.message === 'string' ? payload.message : '')
    })
    return () => {
      offPrompt?.()
      offProgress?.()
    }
  }, 'ui-baf-desktop: update prompt')

  /**
   * Apply the update the prompt offers.
   *
   * The shell owns the apply, so the progress arrives as a push and the
   * outcome arrives in the reply. A failure keeps the dialog open with the
   * reason — the user retries or quits, and a required update still holds.
   */
  const applyUpdate = async (): Promise<void> => {
    const bridge = readDesktopBridge()
    if (bridge?.startUpdate === undefined) return
    updatePrompt.setBusy(true)
    updatePrompt.setError(null)
    try {
      const result = await bridge.startUpdate()
      if (!result.ok) {
        updatePrompt.setError(result.error ?? t('update.prompt.error'))
        return
      }
      updatePrompt.dismiss()
      // The shell forgets the prompt too, so a reloaded renderer does not
      // raise a dialog the update already answered.
      void bridge.dismissUpdatePrompt?.()
    } catch (error) {
      updatePrompt.setError(error instanceof Error ? error.message : String(error))
    } finally {
      updatePrompt.setBusy(false)
    }
  }

  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({
      name: 'shell.overlay', id: 'baf-desktop.update-prompt', locale: NS,
      inject: (): UpdatePromptDialogInjected => ({
        hooks: { updatePrompt: updatePrompt.store },
        applyUpdate: () => { void applyUpdate() },
        later: () => {
          updatePrompt.dismiss()
          void readDesktopBridge()?.dismissUpdatePrompt?.()
        },
        // 【变更】2026-10-25 (批次二十六 4): a required update refuses to let
        // the app keep running on the old version; only the shell can end the
        // process.
        quit: () => {
          void readDesktopBridge()?.quitApp?.()
        },
      }),
    }, UpdatePromptDialog))

  // 【变更】2026-10-19 (主页面三改 2): Ctrl+Alt+H toggles the Help docs panel.
  // The open flag lives in a plugin-level snapshot store (not component state)
  // so the command resolver and the sidebar trigger share one source of truth;
  // the inject face binds it to the trigger's useHelpOpen hook alongside the
  // shortcut catalog (useShortcuts finds the 'help.open' row for the keycap
  // and aria-keyshortcuts). Conflict check before landing: no other command
  // registers KeyH, the Windows Electron menu only owns F12, and Ctrl+Alt+H
  // is not a Windows/macOS system chord. Two profiles stay unbound by design:
  // web:linux (its browser allowlist rejects the two-modifier chord — same
  // omission as settings.open) and desktop:linux, where the registry reserves
  // primary+KeyH (browser-history chord) and would refuse the registration.
  const helpOpen = createSnapshotStore(false)
  const toggleHelp = (): void => { helpOpen.set(!helpOpen.getSnapshot()) }
  const closeHelp = (): void => { helpOpen.set(false) }
  ctx.effect(() => ctx.shortcuts.register({
    id: 'help.open' as ShortcutCommandId,
    label: () => t('help.trigger'),
    aliases: ['help', 'open help'],
    defaults: {
      'desktop:macos': { code: 'KeyH', modifiers: ['primary', 'alt'] },
      'desktop:windows': { code: 'KeyH', modifiers: ['primary', 'alt'] },
      'web:macos': { code: 'KeyH', modifiers: ['primary', 'alt'] },
      'web:windows': { code: 'KeyH', modifiers: ['primary', 'alt'] },
    },
    regions: ['page', 'editable', 'terminal'],
    modals: ['help'],
    // Modal ownership is DOM-based: the shortcuts layer reads
    // data-shortcut-modal off the topmost [role="dialog"][aria-modal] node,
    // so the panel tags itself "help" and the chord both opens it from the
    // page and closes it while it is topmost. Any other modal (e.g.
    // Settings) keeps the chord blocked so help never stacks on top.
    resolve: ({ modal }) => modal !== null && modal !== 'help'
      ? { status: 'blocked', reason: 'modal' }
      : { status: 'handled', run: toggleHelp },
  }), 'ui-baf-desktop: help.open')

  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register({
      name: 'sidebar.footer.action',
      id: 'help',
      order: 5,
      locale: NS,
      inject: (): HelpFooterInjected => ({
        hooks: { helpOpen, shortcuts: ctx.shortcuts.catalog },
        toggleHelp,
        closeHelp,
      }),
    }, HelpFooterAction))
}
