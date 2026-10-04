/**
 * Route-tier decision vocabulary: task complexity tiers (high/mid/low),
 * keyword rules, phase-tier mapping, and compilation of a tier config into
 * the existing RouteProfile / EnterpriseRoutePolicy shapes — no parallel
 * routing system (see .agents/notes/proposed/feature/2026-10-04-baf-multi-model-routing.md).
 * @module @deepseek-ai/dsh-baf-core/route-tier
 */

import { z } from 'zod'
import {
  modelKey,
  type AllowedModel,
  type EnterpriseRoutePolicy,
  type ModelRef,
  type RouteCapability,
  type RouteProfile,
} from './route-policy.ts'
import { WORKFLOW_NODES, type WorkflowNode } from './workflow.ts'

/** One complexity tier. */
export type RouteTier = 'high' | 'mid' | 'low'

/** All tiers in escalating order. */
export const ROUTE_TIERS = ['low', 'mid', 'high'] as const

/** Fallback preference order: try the strongest tier first, fall down. */
const TIERS_FALLDOWN = ['high', 'mid', 'low'] as const

/** Rank used by the escalate-only `max(taskTier, phaseTier)` rule. */
const TIER_RANK: Readonly<Record<RouteTier, number>> = { low: 0, mid: 1, high: 2 }

/** One tier's model spec (reasoningEffort optional, applied at dispatch). */
export interface TierModelSpec {
  provider: string
  model: string
  reasoningEffort?: string
}

/** One keyword rule: `|`-separated words, first matching rule wins. */
export interface TierKeywordRule {
  words: string
  tier: RouteTier
  note?: string
}

/**
 * Mutable working config for `~/.dsh/baf-route-config.json`. Parsing fills
 * the optional fields; `enabled && parsed` implies all three tier models are
 * present (schema enforces non-empty provider/model).
 */
export interface RouteTierConfig {
  schema: 1
  enabled: boolean
  tiers: { high: TierModelSpec; mid: TierModelSpec; low: TierModelSpec }
  phaseTier?: Partial<Record<WorkflowNode, RouteTier>>
  keywords?: TierKeywordRule[]
  /** Keyword tier only ever escalates (default true); false = phase-only. */
  escalateOnly?: boolean
}

/** Default phase→tier mapping; `phaseTier` overrides per node. */
export const DEFAULT_PHASE_TIER: Readonly<Record<WorkflowNode, RouteTier>> = {
  design: 'high',
  plan: 'high',
  clarify: 'mid',
  verify: 'mid',
  implement: 'low',
  intake: 'low',
  open: 'low',
  archive: 'low',
  drift: 'low',
}

/** Default capability tags per tier (PHASE_REQUIRED_CAPABILITIES coverage). */
export const TIER_CAPABILITIES: Readonly<Record<RouteTier, readonly RouteCapability[]>> = {
  // 多模型路由 M2: high carries coding too — implement requires it, and a
  // reasoning-grade model without the tag could never receive an escalated
  // implement turn (the capability floor would veto the keyword escalation).
  high: ['reasoning', 'long-context', 'tool-use', 'structured-output', 'coding'],
  mid: ['structured-output', 'tool-use', 'long-context'],
  low: ['coding', 'tool-use', 'low-latency'],
}

const tierModelSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  reasoningEffort: z.string().min(1).optional(),
})

const tierKeywordSchema = z.object({
  words: z.string().min(1),
  tier: z.enum(ROUTE_TIERS),
  note: z.string().min(1).optional(),
})

/** Zod schema for {@link RouteTierConfig}. */
export const routeTierConfigSchema = z.object({
  schema: z.literal(1),
  enabled: z.boolean(),
  tiers: z.object({ high: tierModelSchema, mid: tierModelSchema, low: tierModelSchema }),
  phaseTier: z.partialRecord(z.enum(WORKFLOW_NODES), z.enum(ROUTE_TIERS)).optional(),
  keywords: z.array(tierKeywordSchema).optional(),
  escalateOnly: z.boolean().optional(),
})

/**
 * Parse an unknown JSON document into a normalized {@link RouteTierConfig}.
 * Invalid or incomplete documents return undefined — callers treat that as
 * "routing bypassed" rather than an error.
 * @param raw - parsed JSON document.
 * @returns normalized config, or undefined when validation fails.
 */
export function parseRouteTierConfig(raw: unknown): RouteTierConfig | undefined {
  const parsed = routeTierConfigSchema.safeParse(raw)
  if (!parsed.success) return undefined
  const spec = (value: { provider: string; model: string; reasoningEffort?: string | undefined }) => ({
    provider: value.provider,
    model: value.model,
    ...(value.reasoningEffort === undefined ? {} : { reasoningEffort: value.reasoningEffort }),
  })
  return {
    schema: 1,
    enabled: parsed.data.enabled,
    tiers: {
      high: spec(parsed.data.tiers.high),
      mid: spec(parsed.data.tiers.mid),
      low: spec(parsed.data.tiers.low),
    },
    phaseTier: parsed.data.phaseTier ?? {},
    keywords: (parsed.data.keywords ?? []).map(rule => ({
      words: rule.words,
      tier: rule.tier,
      ...(rule.note === undefined ? {} : { note: rule.note }),
    })),
    escalateOnly: parsed.data.escalateOnly ?? true,
  }
}

/**
 * Whether tier routing should act at all (schema validity implies the three
 * tier models are complete; the file-load path bypasses on parse failure).
 * @param config - normalized config.
 */
export function isTierRoutingActive(config: RouteTierConfig): boolean {
  return config.enabled
}

/**
 * Split one rule's `|`-separated words into trimmed lowercase candidates.
 * @param words - raw `words` field.
 */
function splitWords(words: string): string[] {
  return words
    .split('|')
    .map(word => word.trim().toLowerCase())
    .filter(word => word !== '')
}

/**
 * Whether one lowercase candidate word occurs in the lowercase haystack.
 * ASCII words match whole-word only (alnum/underscore boundaries); words
 * containing non-ASCII characters (CJK) match by substring — no `\b` after
 * CJK, where it never matches (demo33 lesson).
 * @param haystack - lowercase text.
 * @param word - lowercase candidate word.
 */
function wordMatches(haystack: string, word: string): boolean {
  if (/[^\u0000-\u007f]/.test(word)) return haystack.includes(word)
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9_])${escaped}([^a-z0-9_]|$)`).test(haystack)
}

/**
 * Evaluate the keyword rules against a task description, once, at intake
 * classification confirm; the result is frozen into the change projection.
 * @param text - requirement description.
 * @param keywords - rules in declaration order.
 * @returns first matching rule's tier + the matched word (lowercase), or undefined.
 */
export function resolveTaskTier(
  text: string,
  keywords: readonly TierKeywordRule[],
): { tier: RouteTier; matched: string } | undefined {
  const haystack = text.toLowerCase()
  if (haystack.trim() === '') return undefined
  for (const rule of keywords) {
    for (const word of splitWords(rule.words)) {
      if (wordMatches(haystack, word)) return { tier: rule.tier, matched: word }
    }
  }
  return undefined
}

/**
 * Resolve the phase tier honoring explicit overrides.
 * @param config - normalized config.
 * @param node - workflow node.
 */
export function resolvePhaseTier(config: RouteTierConfig, node: WorkflowNode): RouteTier {
  return config.phaseTier?.[node] ?? DEFAULT_PHASE_TIER[node]
}

/**
 * One phase row of the 工作流 Tab「当前路由」fold (M3 批次C): the tier the
 * config maps the phase to, plus the last `baf/route-resolved` audit when the
 * driving session produced one for that phase.
 */
export interface TierRoutePhaseRow {
  readonly phase: WorkflowNode
  /** Tier the config maps this phase to; a frozen keyword tier may override at turn time (`actual.tier`). */
  readonly preferredTier: RouteTier
  /** The mapped tier's model the resolver prefers for this phase. */
  readonly preferred: { readonly provider: string; readonly model: string }
  /** Last audit for this phase, when the session logged one. */
  readonly actual?: {
    readonly provider: string
    readonly model: string
    readonly source: string
    /** Effective tier when the turn was tier-routed (pre-M2 audits omit it). */
    readonly tier?: RouteTier
    /** Whether the frozen keyword tier decided the turn. */
    readonly tierReason?: 'keyword' | 'phase'
    readonly fallbackActive: boolean
    readonly at: string
  }
}

/** Routed payload of {@link WorkflowTabRouteStatus}. */
export interface TierRouteStatusView {
  readonly state: 'routed'
  /** The three tier models (reasoningEffort stays a dispatch concern). */
  readonly tiers: Readonly<Record<RouteTier, { readonly provider: string; readonly model: string }>>
  /** Nine rows (8 stages + drift) in workflow order. */
  readonly phases: readonly TierRoutePhaseRow[]
}

/**
 * 「当前路由」 fold for the 工作流 Tab: `off` until the tier config enables
 * routing — an off row renders nothing (M3 验收: enabled=false 与今天一致).
 */
export type WorkflowTabRouteStatus = { readonly state: 'off' } | TierRouteStatusView

/**
 * The tier a dispatch turn actually uses. With escalateOnly (default) the
 * keyword tier only ever escalates: `max(taskTier, phaseTier)`; with
 * escalateOnly=false selection follows the phase mapping alone.
 * @param node - workflow node being dispatched.
 * @param taskTier - frozen keyword tier for this change, if any.
 * @param config - normalized config.
 * @returns effective tier + whether the keyword decided it.
 */
export function effectiveTier(
  node: WorkflowNode,
  taskTier: RouteTier | undefined,
  config: RouteTierConfig,
): { tier: RouteTier; reason: 'keyword' | 'phase' } {
  const phaseTier = resolvePhaseTier(config, node)
  const escalateOnly = config.escalateOnly !== false
  if (escalateOnly && taskTier !== undefined && TIER_RANK[taskTier] > TIER_RANK[phaseTier]) {
    return { tier: taskTier, reason: 'keyword' }
  }
  return { tier: phaseTier, reason: 'phase' }
}

/**
 * Shared allowed-list + fallback-group compilation: the three tier models
 * deduped by provider::model with unioned capabilities, all pointing at the
 * single `tiers` fallback group (approved-only, high→mid→low).
 */
function tierAllowed(config: RouteTierConfig): {
  allowed: AllowedModel[]
  groups: Record<string, ModelRef[]>
} {
  const byKey = new Map<string, AllowedModel>()
  for (const tier of ROUTE_TIERS) {
    const ref = tierRef(config, tier)
    const caps = TIER_CAPABILITIES[tier]
    const existing = byKey.get(modelKey(ref))
    byKey.set(modelKey(ref), {
      ...ref,
      capabilities: existing === undefined ? [...caps] : [...new Set([...existing.capabilities, ...caps])],
      fallbackGroup: 'tiers',
    })
  }
  return {
    allowed: [...byKey.values()],
    groups: { tiers: TIERS_FALLDOWN.map(tier => tierRef(config, tier)) },
  }
}

/**
 * The model ref a tier names.
 * @param config - normalized config.
 * @param tier - complexity tier.
 */
function tierRef(config: RouteTierConfig, tier: RouteTier): ModelRef {
  const spec = config.tiers[tier]
  return { provider: spec.provider, model: spec.model }
}

/**
 * Which tier a resolved provider/model landed on — the reasoning-effort
 * lookup after a fallback moved a turn to a different tier's model.
 * @param config - normalized config.
 * @param ref - resolved route.
 * @returns the strongest tier naming this ref, or undefined.
 */
export function findTierByRef(config: RouteTierConfig, ref: ModelRef): RouteTier | undefined {
  for (const tier of TIERS_FALLDOWN) {
    const candidate = tierRef(config, tier)
    if (candidate.provider === ref.provider && candidate.model === ref.model) return tier
  }
  return undefined
}

/**
 * Compile a tier config into the existing RouteProfile shape: per-phase
 * models from the (overridable) tier mapping, default = mid, allowed = the
 * deduped tier models with tier capability tags.
 * @param config - normalized config.
 */
export function compileTierRouteProfile(config: RouteTierConfig): RouteProfile {
  const { allowed, groups } = tierAllowed(config)
  const phase = (node: WorkflowNode): ModelRef => tierRef(config, resolvePhaseTier(config, node))
  return {
    default: tierRef(config, 'mid'),
    allowed,
    phases: {
      intake: phase('intake'),
      open: phase('open'),
      clarify: phase('clarify'),
      design: phase('design'),
      plan: phase('plan'),
      implement: phase('implement'),
      verify: phase('verify'),
      archive: phase('archive'),
    },
    fallbackPolicy: { mode: 'approved-only', groups },
  }
}

/**
 * Synthesize the local permissive enterprise ceiling for hosts with no
 * deployment policy file: allowed = the three tier models, so the resolver
 * chain, capability checks, and approved-only fallback all run unchanged.
 * @param config - normalized config.
 */
export function synthesizeTierPolicy(config: RouteTierConfig): EnterpriseRoutePolicy {
  const { allowed, groups } = tierAllowed(config)
  return {
    schema: 1,
    policyId: 'baf-tier-route',
    version: 'local',
    allowSessionOverride: true,
    default: tierRef(config, 'mid'),
    allowed,
    fallbackPolicy: { mode: 'approved-only', groups },
  }
}
