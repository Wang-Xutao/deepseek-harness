/**
 * Browser half: hero trailing Sora mark, IDE open utilities, and help placeholder.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { HeroTrailingMark } from './HeroTrailingMark.tsx'
import { IdeOpenButtons } from './IdeOpenButtons.tsx'
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

  ctx.slots.inject('conversation.hero.brand.trailing', () =>
    ctx.slots.register({ name: 'conversation.hero.brand.trailing' }, HeroTrailingMark))

  ctx.slots.inject('conversation.session.header.utilities', () =>
    ctx.slots.register({
      name: 'conversation.session.header.utilities',
      id: 'ide-open',
      order: 10,
      locale: NS,
    }, IdeOpenButtons))

  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register({
      name: 'sidebar.footer.action',
      id: 'help',
      order: 5,
      locale: NS,
    }, HelpFooterAction))
}
