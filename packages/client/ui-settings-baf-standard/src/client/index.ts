/**
 * Browser half of the BAF 工程规范 settings package: the「规范总览·只读」row
 * inside the 工作流 settings section (2026-10-06 问题 6 客户决策), over the
 * `bafStandardConfig` Remote this package's host half serves. One card per
 * BAF plugin package + the rules-document viewer; the row never edits.
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
import { StandardsOverview } from './StandardsOverview.tsx'
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
export type { StandardsOverviewProps } from './StandardsOverview.tsx'

/**
 * Register the BAF 工程规范 overview row. The 工作流 settings section (owned
 * by ui-baf-tracegraph) declares the `settings.workflow.item` child slot; this
 * row rides it right after the workflow-tab toggle (order 10).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'ui-settings-baf-standard: dictionaries')
  const controller = new StandardsController(ctx)

  ctx.slots.inject('settings.workflow.item', () => ctx.slots.register({
    name: 'settings.workflow.item',
    id: 'baf-standard-overview',
    order: 20,
    locale: NS,
    inject: () => controller.face(),
  }, StandardsOverview))
}
