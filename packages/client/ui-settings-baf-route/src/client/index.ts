/**
 * Browser half of the 多模型路由 settings package: the「多模型路由」settings
 * SECTION (master enable, tier model cards, phase→tier flow diagram, keyword
 * rules with preset packs, 预演 dry-run) over the `bafRouteConfig` Remote this
 * package's host half serves.
 * 【变更】2026-10-05 (UI 批次问题 1): moved out of the 工作流 section's
 * `settings.workflow.item` row into this package's own `settings.section`
 * registration (id `model-routing`, order 21 — right after 工作流).
 * @module @deepseek-ai/dsh-client-ui-settings-baf-route/client
 */

// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the settings slot declarations ('settings.section' and the
// runtime kit the section receives).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: the ctx.remote Context merge and the forwarded-event key face.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: the ctx.slots registry + uiRenderer mount face.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the bafRouteConfig namespace from the generated /remote artifact.
import type {} from './remote-types.ts'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { ModelRoutingRow } from './ModelRoutingRow.tsx'
import { RouteSectionController } from './route-store.ts'
import { en, zh, type BafRouteKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 多模型路由 settings section copy. */
    'baf.route': BafRouteKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'baf.route'

/** Required services (cordis fiber inject). */
export const inject = [
  'slots', 'locale', 'remote', 'remote.bafRouteConfig', 'remote.session',
] as const

export type { BafRouteKey } from './locales.ts'
export type {
  RouteSectionController, RouteSectionFace, RouteSectionState,
} from './route-store.ts'
export type { ModelRoutingRowProps } from './ModelRoutingRow.tsx'

/**
 * Register the 多模型路由 settings section. Nav glyph for id `model-routing`
 * is owned by ui-settings-general SettingsRoot (the tier dial).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-baf-route: dictionaries')
  const controller = new RouteSectionController(ctx)
  const t = ctx.locale.bind(NS)

  // The Host announces every save/reset — from this surface or any other
  // (e.g. a future CLI editor); re-read so the section never shows a stale draft.
  ctx.effect(
    () => ctx.remote.$on('baf-route-config/changed', () => { controller.reload() }),
    'ui-settings-baf-route: config changes',
  )

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'model-routing',
    order: 21,
    label: () => t('nav'),
    locale: NS,
    inject: () => controller.inject(),
  }, ModelRoutingRow))
}
