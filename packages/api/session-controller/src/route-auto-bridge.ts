/**
 * 多模型路由 auto 模型 — structural bridge from the session controller to
 * the host-realm `bafRouteAuto` runtime (baf-workflow `route-auto.ts`,
 * 2026-10-05 批 customer points 4+5).
 *
 * api/session-controller must not depend on baf packages, so everything here
 * is STRUCTURAL: a duck-typed lookup through the scope chain, best-effort — a
 * deployment without the runtime (routing off / entry not mounted) simply
 * offers no auto entry anywhere and every selection behaves as before.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ModelCatalog } from './types.ts'

/**
 * Structural face of the host-realm `bafRouteAuto` runtime. The pseudo
 * `baf-route/auto` selection resolves per step through here.
 */
export interface RouteAutoRuntimeLike {
  /** Whether a model selection IS the auto pseudo entry (shape only). */
  accepts(provider: string, model: string): boolean
  /** Resolve an auto selection for the session's next step, or undefined. */
  resolveAuto(sessionId: string, raw: { readonly provider: string; readonly model: string }):
    { readonly provider: string; readonly model: string; readonly reasoningEffort?: string } | undefined
  /** The auto catalog groups to prepend ([] while routing is inactive). */
  catalogGroups(): ReadonlyArray<{
    readonly id: string
    readonly name: string
    readonly models: ReadonlyArray<{ readonly id: string; readonly name: string }>
  }>
}

/**
 * Look up the bafRouteAuto runtime, best-effort.
 * @param ctx - host context whose scope chain may carry the runtime.
 * @returns the runtime, or undefined when its entry is not mounted.
 */
export function routeAutoOf(ctx: Context): RouteAutoRuntimeLike | undefined {
  try {
    const resolved = ctx.get('bafRouteAuto')
    if (resolved !== undefined) {
      const candidate = resolved as RouteAutoRuntimeLike
      if (typeof candidate.accepts === 'function'
        && typeof candidate.resolveAuto === 'function'
        && typeof candidate.catalogGroups === 'function') return candidate
    }
  } catch {
    // Not mounted (or the lookup fiber is gone): no auto entry anywhere.
  }
  return undefined
}

/**
 * The auto catalog groups to PREPEND to the provider catalog — [] when the
 * runtime is absent or routing is inactive (没有使能则没有 auto).
 * @param ctx - host context whose scope chain may carry the runtime.
 * @returns plain provider-group shapes safe to hand to the browser catalog.
 */
export function autoCatalogGroups(ctx: Context): ModelCatalog['groups'] {
  const runtime = routeAutoOf(ctx)
  if (runtime === undefined) return []
  try {
    return runtime.catalogGroups().map(group => ({
      id: group.id,
      name: group.name,
      models: group.models.map(model => ({ id: model.id, name: model.name })),
    }))
  } catch {
    return []
  }
}
