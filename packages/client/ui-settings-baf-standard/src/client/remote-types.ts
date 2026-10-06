/**
 * Client-side module merge for the bafStandardConfig Remote namespace.
 *
 * Master pattern (ui-settings-baf-route): the namespace interfaces come from
 * the generator-owned `./remote` contribution (lib/typert.remote-client.d.ts),
 * pulled in with a type-only self-reference — no hand-written copy means the
 * Client face can never drift from the Host artifacts typert-loader mounts.
 */
import type {} from '@deepseek-ai/dsh-client-ui-settings-baf-standard/remote'

export {}
