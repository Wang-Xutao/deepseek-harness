/**
 * Browser half: hero trailing Sora mark, sidebar brand slots, and help docs panel.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { HeroTrailingMark } from './HeroTrailingMark.tsx'
import { SidebarBrandMark } from './SidebarBrandMark.tsx'
import { SidebarBrandName } from './SidebarBrandName.tsx'
import { HelpFooterAction } from './HelpFooterAction.tsx'
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
export const inject = ['slots', 'locale']

/**
 * Register baf desktop chrome into the conversation and sidebar holes.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-baf-desktop: dictionaries')

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

  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register({
      name: 'sidebar.footer.action',
      id: 'help',
      order: 5,
      locale: NS,
    }, HelpFooterAction))
}
