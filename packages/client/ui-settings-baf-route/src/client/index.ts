/**
 * Browser half of the 多模型路由 settings package: the「多模型路由」row in
 * the 工作流 settings section (master enable, tier model cards, phase→tier
 * mapping, keyword rules, 预演 dry-run) over the `bafRouteConfig` Remote this
 * package's host half serves.
 * @module @deepseek-ai/dsh-client-ui-settings-baf-route/client
 */

// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the settings slot declarations ('settings.workflow.item' and the
// runtime kit the rows receive).
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
    /** 多模型路由 settings row copy. */
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
 * Register the 多模型路由 settings row after the 工作流 section's child slot
 * is declared (the section itself is owned by ui-baf-tracegraph; rows ride it
 * exactly like the workflow-tab row does).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-baf-route: dictionaries')
  const controller = new RouteSectionController(ctx)

  // The Host announces every save/reset — from this surface or any other
  // (e.g. a future CLI editor); re-read so the row never shows a stale draft.
  ctx.effect(
    () => ctx.remote.$on('baf-route-config/changed', () => { controller.reload() }),
    'ui-settings-baf-route: config changes',
  )

  ctx.slots.inject('settings.workflow.item', () => ctx.slots.register({
    name: 'settings.workflow.item',
    id: 'model-routing',
    order: 20,
    locale: NS,
    inject: () => controller.inject(),
  }, ModelRoutingRow))
}
