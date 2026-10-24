/**
 * Optional per-step route resolution for deployments that map a recorded
 * selection to a concrete provider/model per step.
 *
 * The agent loop reads a step's route once, before prompt assembly, and the
 * route it reads is the one the request runs on. A deployment that records a
 * route which is not itself a provider route — a pseudo entry that maps to a
 * concrete route per step — installs a resolver as the `stepRouteResolver`
 * service, and the loop applies it at that read.
 *
 * The lookup is structural and best-effort, so the loop carries no dependency
 * on the deployment that provides the resolver: a deployment without one keeps
 * the recorded route unchanged.
 * @module @deepseek-ai/dsh-agent-loop/route-resolver
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'

/** Service name a per-step route resolver registers under. */
const RESOLVER_SERVICE = 'stepRouteResolver'

/**
 * Structural face of a per-step route resolver: it maps one step's recorded
 * route to the route that step runs on.
 */
export interface StepRouteResolverLike {
  /**
   * Resolve one step's route.
   * @param session - the Session the step belongs to.
   * @param route - the recorded route the step would otherwise use.
   * @returns the route the step runs on, or undefined to keep the recorded route.
   */
  resolveStepRoute(session: Session, route: Readonly<ModelSelection>): Readonly<ModelSelection> | undefined
}

/**
 * Look up the per-step route resolver, best-effort.
 * @param ctx - the agent's scope context, whose chain carries the deployment's services.
 * @returns the resolver, or undefined when none is installed.
 */
export function stepRouteResolverOf(ctx: Context): StepRouteResolverLike | undefined {
  try {
    const resolved = ctx.get(RESOLVER_SERVICE)
    if (resolved !== undefined) {
      const candidate = resolved as StepRouteResolverLike
      if (typeof candidate.resolveStepRoute === 'function') return candidate
    }
  } catch {
    // Not mounted (or the lookup fiber is gone): the recorded route stands.
  }
  return undefined
}

/**
 * Resolve one step's route through the installed resolver.
 *
 * A resolver that returns undefined leaves the recorded route in place. A
 * resolver that fails fails the step: a step must not run on a route the
 * deployment meant to replace.
 * @param ctx - the agent's scope context, whose chain carries the deployment's services.
 * @param session - the Session the step belongs to.
 * @param route - the recorded route the step would otherwise use.
 * @returns the route the step runs on, or undefined when no route is recorded.
 */
export function resolveStepRoute(
  ctx: Context,
  session: Session,
  route: Readonly<ModelSelection> | undefined,
): Readonly<ModelSelection> | undefined {
  if (route === undefined) return undefined
  const resolver = stepRouteResolverOf(ctx)
  if (resolver === undefined) return route
  return resolver.resolveStepRoute(session, route) ?? route
}
