/**
 * Browser half of open-in-app: one Session-header split button opening the
 * session's workspace directory (the summary's `cwd`) in the remembered
 * installed application. Availability arrives once per page from the host
 * apps route; the last choice persists in the browser through the
 * controller's persisted snapshot store. The General-settings row is the
 * single source for per-app visibility — toggles there publish through
 * `controller.disabled` and the header re-renders against the same store.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { OPEN_IN_APP_ICON_PREFIX } from '@deepseek-ai/dsh-host-open-in-app/shared'
import { OpenInAppController } from './controller.ts'
import { OpenInAppAction, type OpenInAppActionInjected } from './OpenInAppAction.tsx'
import {
  OpenInAppSettingsRow, type OpenInAppSettingsRowInjected,
} from './OpenInAppSettingsRow.tsx'
import { en, NS, zh, type OpenInAppKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Session-header "open workspace in application" copy. */
    'open-in-app': OpenInAppKey
  }
}

export type { OpenInAppActionInjected, OpenInAppActionProps } from './OpenInAppAction.tsx'
export type { OpenInAppSettingsRowInjected, OpenInAppSettingsRowProps } from './OpenInAppSettingsRow.tsx'

/** Required services for locale registration and the header-slot contribution. */
export const inject = ['sessions', 'slots', 'locale']

/**
 * Client plugin body: register the dictionaries, the header split button,
 * and the General-settings per-app visibility row.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const controller = new OpenInAppController()
  void controller.load()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'open-in-app: dictionaries')
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'open-in-app',
    order: -10,
    locale: NS,
    inject: (): OpenInAppActionInjected => ({
      hooks: {
        openInAppApps: controller.apps,
        openInAppChoice: controller.choice,
        openInAppDisabled: controller.disabled,
      },
      launch: (appId, path) => controller.launch(appId, path),
      choose: (appId) => { controller.choose(appId) },
      iconUrl: appId => `${OPEN_IN_APP_ICON_PREFIX}/${appId}`,
    }),
  }, OpenInAppAction))

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'open-in-app',
    order: 30,
    locale: NS,
    inject: (): OpenInAppSettingsRowInjected => ({
      hooks: {
        disabled: controller.disabled,
        installed: controller.apps,
      },
      setEnabled: (appId, enabled) => { controller.setEnabled(appId, enabled) },
    }),
  }, OpenInAppSettingsRow))
}
