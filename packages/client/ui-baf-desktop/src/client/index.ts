/**
 * Browser half: hero trailing Sora mark, sidebar brand slots, and help docs panel.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { HeroTrailingMark } from './HeroTrailingMark.tsx'
import { SidebarBrandMark } from './SidebarBrandMark.tsx'
import { SidebarBrandName } from './SidebarBrandName.tsx'
import { DraftFormatButton } from './DraftFormatButton.tsx'
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

/** Required services. */
export const inject = ['slots', 'locale', 'shortcuts']

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
  // action. The control arranges the current draft into Markdown structure
  // with a local deterministic formatter — no model call — and turns into the
  // revert action while a formatted draft can be restored.
  ctx.slots.inject('conversation.input.right', () =>
    ctx.slots.register({
      name: 'conversation.input.right', id: 'draft-format', order: 0, locale: NS,
    }, DraftFormatButton))

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
