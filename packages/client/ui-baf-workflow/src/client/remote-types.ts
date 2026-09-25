/**
 * Client-side module merge for the bafWorkflowView Remote namespace.
 *
 * Master pattern: the namespace interfaces come from the generator-owned
 * `./remote` contribution (lib/typert.remote-client.d.ts), pulled in with a
 * type-only self-reference — the same wiring job-controller's client uses.
 * Keeping no hand-written copy means the Client face can never drift from the
 * Host artifacts typert-loader actually mounts.
 */
import type {} from '@deepseek-ai/dsh-client-ui-baf-workflow/remote'

export {}
