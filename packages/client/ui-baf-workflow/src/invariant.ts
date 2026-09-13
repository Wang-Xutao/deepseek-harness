/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-baf-workflow`.
 * @module @deepseek-ai/dsh-client-ui-baf-workflow/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-baf-workflow'

/** Cordis companion plugin name. */
export const name = 'client-ui-baf-workflow-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No independent runtime invariant: Tab state is owned by baf-workflow projection.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
