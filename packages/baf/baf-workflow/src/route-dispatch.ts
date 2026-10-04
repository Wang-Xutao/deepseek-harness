/**
 * 多模型路由 M2 — dispatch-time tier routing.
 *
 * The `/baf-go` dispatcher calls the {@link DispatchRoute} hook just before
 * queueing a work order (see `go-dispatch.ts`). This module is that hook's
 * implementation: for one dispatch signal it decides which tier's model the
 * upcoming turn should run on, asks the host's session controller to pin that
 * selection for the agent's next request, and records the decision in the
 * session audit trail.
 *
 * Split in two, like the rest of the routing code:
 * - {@link tierRouteSelection} is PURE (config + frozen task tier in,
 *   selection out) — unit-tested without a host, and reusable by any future
 *   surface that wants the same decision (e.g. the settings UI's 预演 box).
 * - {@link tierRouteSelectorFor} is the host shell: reads the config file,
 *   looks up the frozen task tier, and applies the selection through the
 *   session controller's public passthrough. Everything is best-effort —
 *   the dispatcher isolates hook failures, and a routing that cannot run
 *   (inactive config, missing controller, resolver rejection) simply leaves
 *   the turn on the session's current model.
 * @module @deepseek-ai/dsh-baf-workflow/route-dispatch
 */

import {
  compileTierRouteProfile,
  effectiveTier,
  findTierByRef,
  isTierRoutingActive,
  synthesizeTierPolicy,
  type ProviderAvailability,
  type RouteResolution,
  type RouteTier,
  type RouteTierConfig,
} from '@deepseek-ai/dsh-baf-core'
import type { DispatchAgent, DispatchRoute, DispatchSignal } from './go-dispatch.ts'
import { readRouteTierConfigSync } from './route-config-io.ts'
import { routeAuditFromResolution } from './route-audit.ts'
import { taskTierFor } from './task-tier-memory.ts'
import { resolveRoute } from './route.ts'

/**
 * The model selection handed to the session controller. Structural (not the
 * agent package's `ModelSelection`): baf-workflow does not depend on that
 * package, and the controller passthrough accepts any compatible shape.
 */
export interface RouteModelSelection {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

/** One dispatch turn's routing decision. */
export interface TierRouteOutcome {
  /** The tier the routing logic preferred (before any fallback move). */
  readonly tier: RouteTier
  /** Whether the frozen keyword tier decided it, or the phase mapping alone. */
  readonly reason: 'keyword' | 'phase'
  /** Full resolver result (carries `fallbackFrom` when a move happened). */
  readonly resolution: RouteResolution
  /** What the session controller should pin for the next request. */
  readonly selection: RouteModelSelection
}

/**
 * Permissive availability probe: dispatch routing runs without a live model
 * catalog, so availability never vetoes — capability compatibility and the
 * approved-only fallback chain still run (they are config-derived). A model
 * that is actually down surfaces in the request itself, and the next
 * `/baf-go` re-dispatches.
 */
const PERMISSIVE: ProviderAvailability = { isAvailable: () => true }

/**
 * Decide the model for one dispatch turn. Pure: no file reads, no host.
 * @param signal - the dispatch signal (node drives the phase mapping).
 * @param config - route tier config; undefined/disabled means no routing.
 * @param taskTier - the change's frozen keyword tier, if any.
 * @returns the outcome, or undefined when routing is off or the resolver
 * rejected every candidate (both mean "run on the session's current model").
 */
export function tierRouteSelection(
  signal: DispatchSignal,
  config: RouteTierConfig | undefined,
  taskTier: RouteTier | undefined,
): TierRouteOutcome | undefined {
  if (config === undefined || !isTierRoutingActive(config)) return undefined
  const effective = effectiveTier(signal.node, taskTier, config)
  const preferred = config.tiers[effective.tier]
  // Per-dispatch compile: the phase mapping from the config, with the
  // DISPATCHED node's entry overridden to the effective tier — the keyword
  // escalation (max(taskTier, phaseTier)) lands exactly on this turn.
  const profile = {
    ...compileTierRouteProfile(config),
    phases: {
      ...compileTierRouteProfile(config).phases,
      [signal.node]: { provider: preferred.provider, model: preferred.model },
    },
  }
  try {
    const resolution = resolveRoute(
      synthesizeTierPolicy(config),
      profile,
      signal.node,
      undefined,
      PERMISSIVE,
    )
    // reasoningEffort follows the tier actually RESOLVED: a fallback move
    // (capability gap) puts the turn on a different tier's model, and that
    // tier's effort setting is the one that applies.
    const resolvedTier = findTierByRef(config, { provider: resolution.provider, model: resolution.model })
    const spec = resolvedTier !== undefined ? config.tiers[resolvedTier] : preferred
    return {
      tier: effective.tier,
      reason: effective.reason,
      resolution,
      selection: {
        provider: resolution.provider,
        model: resolution.model,
        ...(spec.reasoningEffort === undefined ? {} : { reasoningEffort: spec.reasoningEffort }),
      },
    }
  } catch {
    // Best-effort by contract: a resolver rejection (no compatible model)
    // must never block the work order.
    return undefined
  }
}

/** Structural session controller face: the public passthrough M2 adds. */
interface SessionControllerLike {
  selectForNextRequest(agent: unknown, selection: RouteModelSelection): void
}

/** Structural session face for the audit append. */
interface SessionAppendLike {
  append(name: string, payload: unknown): unknown
}

/**
 * Build the dispatch route hook for one session, or undefined when tier
 * routing cannot act (inactive config / no reachable session controller) —
 * installing nothing is cleaner than a hook that no-ops every signal.
 * @param cwd - workspace root (frozen task-tier cache scope).
 * @param ctx - host context (or undefined in tests/CLI) — used to reach the
 * session controller through the scope chain.
 * @param agent - the addressed session's runtime agent.
 * @returns the route hook for {@link makeGoDispatcher}, or undefined.
 */
export function tierRouteSelectorFor(
  cwd: string,
  ctx: { get(name: string): unknown } | undefined,
  agent: DispatchAgent | undefined,
): DispatchRoute | undefined {
  const config = readRouteTierConfigSync()
  if (config === undefined || !isTierRoutingActive(config)) return undefined
  let controller: SessionControllerLike | undefined
  try {
    const resolved = ctx?.get('sessionController')
    if (resolved !== undefined && typeof (resolved as SessionControllerLike).selectForNextRequest === 'function') {
      controller = resolved as SessionControllerLike
    }
  } catch {
    controller = undefined
  }
  if (controller === undefined) return undefined
  const rawSession = agent?.session as (DispatchAgent['session'] & { append?: unknown }) | undefined
  const append = typeof rawSession?.append === 'function' ? rawSession.append as SessionAppendLike['append'] : undefined
  const sessionId = typeof agent?.session?.header?.id === 'string' && agent.session.header.id !== ''
    ? agent.session.header.id
    : 'baf-unknown-session'
  return (signal: DispatchSignal) => {
    const outcome = tierRouteSelection(signal, config, taskTierFor(cwd, signal.changeId)?.tier)
    if (outcome === undefined) return
    controller.selectForNextRequest(agent, outcome.selection)
    if (append !== undefined) {
      append('baf/route-resolved', routeAuditFromResolution({
        resolution: outcome.resolution,
        sessionId,
        changeId: signal.changeId,
        tier: outcome.tier,
        tierReason: outcome.reason,
      }))
    }
  }
}
