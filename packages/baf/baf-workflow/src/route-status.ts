/**
 * 多模型路由 M3 批次C — the 工作流 Tab「当前路由」fold. Preferred per phase
 * comes from the config file (`resolvePhaseTier`, overrides over defaults),
 * actual/fallback from the driving session's LAST `baf/route-resolved` audit
 * per phase — tier routing reads the config per dispatch and never freezes a
 * RouteProfile, so the freeze-based `buildRouteStatusView` has nothing to read
 * here; this fold carries the same preferred/actual/fallback semantics.
 * @module @deepseek-ai/dsh-baf-workflow/route-status
 */

import {
  resolvePhaseTier,
  type RouteTier,
  type RouteTierConfig,
  type TierRouteStatusView,
  type WorkflowNode,
  type WorkflowTabRouteStatus,
} from '@deepseek-ai/dsh-baf-core'
import type { RouteAuditEntry } from './route-audit.ts'

/** Structural cold-read shape {@link lastRouteAuditByPhase} understands. */
export interface RouteAuditEventLike {
  readonly type: string
  readonly data?: unknown
}

/** The nine nodes the row folds, in workflow order (8 stages + drift). */
const TAB_PHASE_ORDER: readonly WorkflowNode[] = [
  'intake', 'open', 'clarify', 'design', 'plan', 'implement', 'verify', 'archive', 'drift',
]

/**
 * Fold a cold session log into the LAST `baf/route-resolved` audit per phase
 * (log order wins — a later turn supersedes an earlier one). Malformed
 * payloads are skipped, never thrown: the row renders what the log can prove.
 * Accepts raw cold events or already-typed audit entries (the Tab host's
 * reader hands back the latter).
 * @param items - cold session events or audit entries, in log order.
 * @returns last audit per phase, when the log carries well-formed ones.
 */
export function lastRouteAuditByPhase(
  items: Iterable<RouteAuditEventLike | RouteAuditEntry>,
): Readonly<Partial<Record<WorkflowNode, RouteAuditEntry>>> {
  const last: Partial<Record<WorkflowNode, RouteAuditEntry>> = {}
  for (const item of items) {
    const entry = 'type' in item
      ? (item as RouteAuditEventLike).type === 'baf/route-resolved'
        ? routeAuditOf((item as RouteAuditEventLike).data)
        : undefined
      : item
    if (entry !== undefined) last[entry.phase] = entry
  }
  return last
}

/**
 * Build the Tab's「当前路由」payload: `off` unless the config enables tier
 * routing, else one row per phase with the mapped tier's model as preferred
 * and the last audit (if any) as actual.
 * @param config - config as read from `~/.dsh/baf-route-config.json`.
 * @param auditsByPhase - last `baf/route-resolved` audit per phase.
 * @returns the wire payload for `WorkflowTabView.routeStatus`.
 */
export function buildTierRouteStatus(
  config: RouteTierConfig | undefined,
  auditsByPhase: Readonly<Partial<Record<WorkflowNode, RouteAuditEntry>>>,
): WorkflowTabRouteStatus {
  if (config === undefined || !config.enabled) return { state: 'off' }
  const view: TierRouteStatusView = {
    state: 'routed',
    tiers: tierRefs(config),
    phases: TAB_PHASE_ORDER.map((phase) => {
      const preferredTier = resolvePhaseTier(config, phase)
      const spec = config.tiers[preferredTier]
      const audit = auditsByPhase[phase]
      return {
        phase,
        preferredTier,
        preferred: { provider: spec.provider, model: spec.model },
        ...audit === undefined ? {} : {
          actual: {
            provider: audit.provider,
            model: audit.model,
            source: audit.source,
            ...audit.tier === undefined ? {} : { tier: audit.tier },
            ...audit.tierReason === undefined ? {} : { tierReason: audit.tierReason },
            fallbackActive: audit.fallbackFrom !== undefined,
            at: audit.at,
          },
        },
      }
    }),
  }
  return view
}

/** The three tier models on the wire (reasoningEffort stays a dispatch concern). */
function tierRefs(config: RouteTierConfig): TierRouteStatusView['tiers'] {
  const of = (tier: RouteTier): { provider: string; model: string } => {
    const spec = config.tiers[tier]
    return { provider: spec.provider, model: spec.model }
  }
  return { high: of('high'), mid: of('mid'), low: of('low') }
}

/** Structural check for one persisted `baf/route-resolved` payload. */
function routeAuditOf(data: unknown): RouteAuditEntry | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const entry = data as Record<string, unknown>
  const phase = entry.phase
  if (typeof phase !== 'string') return undefined
  if (typeof entry.provider !== 'string' || typeof entry.model !== 'string') return undefined
  if (typeof entry.source !== 'string' || typeof entry.at !== 'string') return undefined
  return entry as unknown as RouteAuditEntry
}
