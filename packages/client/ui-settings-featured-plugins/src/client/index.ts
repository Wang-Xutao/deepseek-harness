/**
 * Featured plugins settings section, browser half: the「精选插件」page that
 * installs, updates, enables, disables, and removes the Host's curated
 * open-source plugins through the `featuredPlugins` Remote, with bulk
 * actions, per-plugin auto-update, and the compatibility/build confirmations
 * the Host's gates ask for.
 */

// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the ctx.remote Context merge and the forwarded-event key face.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: the forwarded events' own declaration (`$on`'s key face resolves
// through the owning package's client-safe types subpath).
import type {} from '@deepseek-ai/dsh-plugin-manager/types'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { FeaturedSection } from './FeaturedSection.tsx'
import { FeaturedSectionController } from './featured-store.ts'
import { en, zh, type FeaturedSettingsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Featured plugins settings section copy. */
    'settings.featured': FeaturedSettingsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.featured'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'remote', 'remote.featuredPlugins']

export type { FeaturedSettingsKey } from './locales.ts'
export type {
  FeaturedConfirm, FeaturedNotice, FeaturedOp, FeaturedProgress,
  FeaturedSectionFace, FeaturedSectionState,
} from './featured-store.ts'
export type { FeaturedSectionProps } from './FeaturedSection.tsx'

/**
 * Register the featured-plugins section after settings.section is declared.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-featured-plugins: dictionaries')
  const t = ctx.locale.bind(NS)
  const controller = new FeaturedSectionController(ctx)

  // The Host says when the curated set, an entry's state, or a version check
  // changed what the cards should say — from this surface or any other.
  ctx.effect(
    () => ctx.remote.$on('featured-plugins/changed', () => { controller.reload() }),
    'ui-settings-featured-plugins: featured changes',
  )
  // Install progress for the run in flight, matched by its request id.
  ctx.effect(
    () => ctx.remote.$on('plugin-manager/install-state', (progress) => { controller.trackProgress(progress) }),
    'ui-settings-featured-plugins: install progress',
  )

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'featured-plugins',
    order: 26,
    label: () => t('nav'),
    locale: NS,
    inject: () => controller.inject(),
  }, FeaturedSection))
}
