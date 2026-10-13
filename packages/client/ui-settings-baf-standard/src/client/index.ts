/**
 * Browser half of the BAF 工程规范 settings package: read-only panels inside
 * the 工作流 settings section tabs (项目工程 / 企业规范 / 质量监控).
 * @module @deepseek-ai/dsh-client-ui-settings-baf-standard/client
 */

// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the settings slot declarations (settings.workflow.item and the
// runtime kit the row receives).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: the ctx.remote Context merge.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: the ctx.slots registry + uiRenderer mount face.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the bafStandardConfig namespace from the generated /remote artifact.
import type {} from './remote-types.ts'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import {
  StandardsEnterpriseOverview,
  StandardsProjectOverview,
  StandardsQualityOverview,
} from './StandardsOverview.tsx'
import { StandardsController } from './standards-store.ts'
import { dictionaries, NS, type BafStandardKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** BAF 工程规范 overview settings copy. */
    'baf.standard': BafStandardKey
  }
}

/** Required services (cordis fiber inject). */
export const inject = [
  'slots', 'locale', 'remote', 'remote.bafStandardConfig',
] as const

export type { BafStandardKey } from './locales.ts'
export type {
  StandardsController, StandardsOverviewFace, StandardsOverviewState,
} from './standards-store.ts'
export type { StandardsPanelProps, StandardsOverviewProps } from './StandardsOverview.tsx'

/**
 * Register the BAF 工程规范 overview panels under `settings.workflow.item`.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'ui-settings-baf-standard: dictionaries')
  const controller = new StandardsController(ctx)
  const injectFace = (): ReturnType<StandardsController['face']> => controller.face()

  ctx.slots.inject('settings.workflow.item', () => ctx.slots.register({
    name: 'settings.workflow.item',
    id: 'baf-standard-project',
    order: 20,
    locale: NS,
    inject: injectFace,
  }, StandardsProjectOverview))

  ctx.slots.inject('settings.workflow.item', () => ctx.slots.register({
    name: 'settings.workflow.item',
    id: 'baf-standard-enterprise',
    order: 21,
    locale: NS,
    inject: injectFace,
  }, StandardsEnterpriseOverview))

  ctx.slots.inject('settings.workflow.item', () => ctx.slots.register({
    name: 'settings.workflow.item',
    id: 'baf-standard-quality',
    order: 22,
    locale: NS,
    inject: injectFace,
  }, StandardsQualityOverview))
}
