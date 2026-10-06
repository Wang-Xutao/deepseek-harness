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
  type TierRouteChangeRow,
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
 * 【变更】2026-10-07 (九点批 问题 4): fold the audits a second way — LAST
 * `baf/route-resolved` audit per CHANGE (log order wins). The 变更总览 rows
 * badge each change with the model that last served it; entries without a
 * changeId are skipped.
 * @param entries - audit entries in log order.
 * @returns last audit per changeId, when the audits carry one.
 */
export function lastRouteAuditByChange(entries: Iterable<RouteAuditEntry>): Readonly<Record<string, TierRouteChangeRow>> {
  const last: Record<string, TierRouteChangeRow> = {}
  for (const entry of entries) {
    if (entry.changeId === undefined || entry.changeId === '') continue
    last[entry.changeId] = {
      provider: entry.provider,
      model: entry.model,
      ...entry.tier === undefined ? {} : { tier: entry.tier },
      at: entry.at,
    }
  }
  return last
}

/**
 * Build the Tab's「当前路由」payload: `off` unless the config enables tier
 * routing, else one row per phase with the mapped tier's model as preferred
 * and the last audit (if any) as actual.
 * 【变更】2026-10-07 (九点批 问题 5): the optional `sessionModel` (the
 * session's last `request/header` provider/model + auto flag) rides the
 * routed view so the empty state can explain itself.
 * 【变更】2026-10-07 (九点批 问题 4): the optional `byChange` (last audit per
 * change) rides along for the 变更总览 row badges.
 * @param config - config as read from `~/.dsh/baf-route-config.json`.
 * @param auditsByPhase - last `baf/route-resolved` audit per phase.
 * @param sessionModel - the session's current raw model, when known.
 * @param byChange - last audit per changeId, when known.
 * @returns the wire payload for `WorkflowTabView.routeStatus`.
 */
export function buildTierRouteStatus(
  config: RouteTierConfig | undefined,
  auditsByPhase: Readonly<Partial<Record<WorkflowNode, RouteAuditEntry>>>,
  sessionModel?: TierRouteStatusView['sessionModel'],
  byChange?: Readonly<Record<string, TierRouteChangeRow>>,
): WorkflowTabRouteStatus {
  if (config === undefined || !config.enabled) return { state: 'off' }
  const view: TierRouteStatusView = {
    state: 'routed',
    tiers: tierRefs(config),
    ...(sessionModel === undefined ? {} : { sessionModel }),
    ...(byChange === undefined ? {} : { byChange }),
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
