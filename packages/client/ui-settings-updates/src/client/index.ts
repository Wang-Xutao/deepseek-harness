/**
 * Browser half: registers the Version & updates settings section.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
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
 * Register the Version & updates section after settings.section is declared.
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
}
