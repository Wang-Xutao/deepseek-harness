/**
 * Pure decision for BafWorkflow's tier-route context loading: with no
 * explicitly frozen enterprise policy, an active `~/.dsh/baf-route-config.json`
 * freezes the synthesized tier policy + compiled profile (so `routeStatus()`
 * reflects the tier mapping); the freeze re-runs when the config changes and
 * clears when routing turns off. The dispatch path (M2) recompiles per turn
 * and does not depend on this freeze.
 * @module @deepseek-ai/dsh-baf-workflow/tier-route-context
 */

import {
  compileTierRouteProfile,
  isTierRoutingActive,
  synthesizeTierPolicy,
  type EnterpriseRoutePolicy,
  type RouteProfile,
  type RouteTierConfig,
} from '@deepseek-ai/dsh-baf-core'

/** What the service should do with its route context this call. */
export type TierRouteDecision =
  | { readonly kind: 'keep' }
  | { readonly kind: 'clear' }
  | {
    readonly kind: 'freeze'
    readonly policy: EnterpriseRoutePolicy
    readonly profile: RouteProfile
    readonly json: string
  }

/**
 * Decide whether to freeze, keep, or clear the tier route context.
 * @param explicitFrozen - whether freezeRouteContext/freezeFromPolicyFile ran.
 * @param config - freshly read (normalized) tier config, if any.
 * @param lastJson - JSON snapshot behind the current tier freeze, if any.
 * @returns decision; explicit freezes are always kept as-is.
 */
export function tierRouteDecision(
  explicitFrozen: boolean,
  config: RouteTierConfig | undefined,
  lastJson: string | undefined,
): TierRouteDecision {
  if (explicitFrozen) return { kind: 'keep' }
  if (config === undefined || !isTierRoutingActive(config)) {
    return lastJson === undefined ? { kind: 'keep' } : { kind: 'clear' }
  }
  const json = JSON.stringify(config)
  if (json === lastJson) return { kind: 'keep' }
  return { kind: 'freeze', policy: synthesizeTierPolicy(config), profile: compileTierRouteProfile(config), json }
}
