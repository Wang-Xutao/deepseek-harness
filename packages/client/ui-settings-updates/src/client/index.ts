/**
 * Browser half: registers the Version & updates settings section.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { FeedbackSection } from './FeedbackSection.tsx'
import { UpdatesSection } from './UpdatesSection.tsx'
import { en, zh, type UpdatesSettingsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.updates': UpdatesSettingsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.updates'

export type { UpdatesSettingsKey } from './locales.ts'

/**
 * Required services (cordis fiber inject).
 */
export const inject = ['slots', 'locale']

/**
 * Register Version & updates (order 25) and User feedback (order 27) after
 * settings.section is declared.
 *
 * 【变更】2026-10-12 (问题 3 复盘): the feedback section's src was lost in an
 * earlier batch while its built lib survived — the running app still showed
 * 用户反馈 but a clean rebuild would have dropped it. Restored 1:1 from the
 * client.js.map sourcesContent (Feishu form, id 'user-feedback').
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-updates: dictionaries')
  const t = ctx.locale.bind(NS)

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'version-updates',
    order: 25,
    label: () => t('nav'),
    locale: NS,
  }, UpdatesSection))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'user-feedback',
    order: 27,
    label: () => t('feedbackNav'),
    locale: NS,
  }, FeedbackSection))
}
