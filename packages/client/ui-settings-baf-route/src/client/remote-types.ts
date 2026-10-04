/**
 * Client-side module merge for the bafRouteConfig Remote namespace.
 *
 * Master pattern (ui-baf-workflow): the namespace interfaces come from the
 * generator-owned `./remote` contribution (lib/typert.remote-client.d.ts),
 * pulled in with a type-only self-reference. Keeping no hand-written copy
 * means the Client face can never drift from the Host artifacts
 * typert-loader actually mounts.
 */
import type {} from '@deepseek-ai/dsh-client-ui-settings-baf-route/remote'

export {}
