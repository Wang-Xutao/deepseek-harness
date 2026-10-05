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

/**
 * One keyword rule: `|`-separated words, first matching rule wins.
 *
 * 【变更】2026-10-06 (问题 3/4): `category` names the rule's 功能分类 (a
 * user-defined group label the UI renders with a one-click master switch);
 * `enabled: false` parks the rule without deleting it (the tag-level switch).
 */
export interface TierKeywordRule {
  words: string
  tier: RouteTier
  note?: string
  category?: string
  enabled?: boolean
}

/** One curated builtin keyword pack (id doubles as the client's `preset${Id}` locale key). */
export interface BuiltinKeywordPreset {
  readonly id: string
  readonly tier: RouteTier
  readonly words: string
}

/**
 * The user-editable preset word library file
 * (`~/.dsh/baf-route-presets.json`, 问题 4): the packs the host seeds on
 * first read and the user freely adds/removes/edits. Same shape as the code
 * builtins — a pack is `{ id, tier, words }`.
 */
export interface RouteKeywordPresetsFile {
  schema: 1
  packs: BuiltinKeywordPreset[]
}

/**
 * Curated keyword packs always in effect (2.4 默认启用): task classes whose
 * wording stably predicts complexity — engineering/release terms escalate to
 * the strong model, QA terms stay balanced, doc/wording edits stay light.
 * Bilingual lists; matching is per-word so one library serves both locales.
 * Lives in baf-core so intake freeze, frozen backfill, and the settings
 * preview all evaluate the same effective rule list — the client gets it for
 * display via the `bafRouteConfig/defaults` payload, never as its own copy.
 */
export const BUILTIN_KEYWORD_PRESETS: readonly BuiltinKeywordPreset[] = [
  {
    id: 'complexEngineering',
    tier: 'high',
    words: '架构|重构|性能优化|性能瓶颈|安全漏洞|并发|算法|数据迁移|兼容性|architecture|refactor|performance|security|concurrency|migration',
  },
  {
    id: 'criticalRelease',
    tier: 'high',
    words: '技术选型|方案设计|设计评审|整体方案|上线|发布|部署|breaking',
  },
  {
    id: 'qualityAssurance',
    tier: 'mid',
    words: '单元测试|集成测试|测试用例|代码评审|回归|排查|复现|日志|边界|test|review|debug|regression',
  },
  {
    // 【变更】2026-10-06 (问题 3): Worker repositioned as 日常代码实现+文案 —
    // plain coding vocabulary joins the copy vocabulary at the low tier
    // (architecture/QA vocabulary still escalates above it, first-match-wins).
    id: 'routineEdits',
    tier: 'low',
    words: '实现|编码|写代码|改代码|函数|脚本|bug修复|修bug|implement|coding|文案|注释|文档|README|格式化|拼写|错别字|翻译|改名|版本号|typo|wording|docs|rename',
  },
]

/**
 * The rules a task actually evaluates: the user's own rules first (explicit
 * intent wins — a user downgrading 「架构」 to low overrides the builtin high),
 * then the preset packs, all in declaration order for first-match-wins.
 *
 * 【变更】2026-10-06 (问题 3/4): the pack list is caller-sourced (the host
 * passes the `~/.dsh/baf-route-presets.json` packs; the code builtins remain
 * the default), and every level carries an enable state the fold honors —
 * `enabled: false` user rules drop out, `packs[id] === false` parks a whole
 * pack (类级一键开关), `presetWords['id::word'] === false` parks one word
 * (标签级开关). A pack whose every word is disabled drops out entirely.
 * @param userKeywords - the user's saved keyword rules (may be empty/absent).
 * @param options - preset pack source + enable-state maps from the config.
 */
export function effectiveKeywordRules(
  userKeywords: readonly TierKeywordRule[] | undefined,
  options?: {
    presets?: readonly BuiltinKeywordPreset[]
    packs?: Record<string, boolean>
    presetWords?: Record<string, boolean>
  },
): TierKeywordRule[] {
  const presets = options?.presets ?? BUILTIN_KEYWORD_PRESETS
  const userRules = (userKeywords ?? []).filter(rule => rule.enabled !== false)
  const packRules = presets
    .filter(preset => options?.packs?.[preset.id] !== false)
    .map((preset) => {
      const words = preset.words
        .split('|')
        .map(word => word.trim())
        .filter(word => word !== '' && options?.presetWords?.[`${preset.id}::${word}`] !== false)
      return { tier: preset.tier, words }
    })
    .filter(preset => preset.words.length > 0)
    .map(preset => ({ words: preset.words.join('|'), tier: preset.tier }))
  return [...userRules, ...packRules]
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
  /**
   * Preset pack enable states (问题 3 类级开关): pack id → enabled; absent or
   * true = on. Lives in the config (runtime preference) — the pack vocabulary
   * itself lives in the presets file.
   */
  packs?: Record<string, boolean>
  /** Per-preset-word enable states (问题 4 标签级开关), keyed `${packId}::${word}`. */
  presetWords?: Record<string, boolean>
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
  category: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
})

/** Zod schema for {@link RouteTierConfig}. */
export const routeTierConfigSchema = z.object({
  schema: z.literal(1),
  enabled: z.boolean(),
  tiers: z.object({ high: tierModelSchema, mid: tierModelSchema, low: tierModelSchema }),
  phaseTier: z.partialRecord(z.enum(WORKFLOW_NODES), z.enum(ROUTE_TIERS)).optional(),
  keywords: z.array(tierKeywordSchema).optional(),
  escalateOnly: z.boolean().optional(),
  packs: z.record(z.string(), z.boolean()).optional(),
  presetWords: z.record(z.string(), z.boolean()).optional(),
})

const builtinPresetSchema = z.object({
  id: z.string().min(1),
  tier: z.enum(ROUTE_TIERS),
  words: z.string().min(1),
})

/** Zod schema for {@link RouteKeywordPresetsFile} (the preset word library). */
export const routeKeywordPresetsSchema = z.object({
  schema: z.literal(1),
  packs: z.array(builtinPresetSchema),
})

/**
 * Parse an unknown JSON document as a {@link RouteKeywordPresetsFile}.
 * Invalid documents return undefined — callers fall back to the code
 * builtins without touching the user's file.
 * @param raw - parsed JSON document.
 */
export function parseRouteKeywordPresets(raw: unknown): RouteKeywordPresetsFile | undefined {
  const parsed = routeKeywordPresetsSchema.safeParse(raw)
  if (!parsed.success) return undefined
  return { schema: 1, packs: parsed.data.packs }
}

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
      ...(rule.category === undefined ? {} : { category: rule.category }),
      ...(rule.enabled === undefined ? {} : { enabled: rule.enabled }),
    })),
    escalateOnly: parsed.data.escalateOnly ?? true,
    ...(parsed.data.packs === undefined ? {} : { packs: parsed.data.packs }),
    ...(parsed.data.presetWords === undefined ? {} : { presetWords: parsed.data.presetWords }),
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
    /** Whether the frozen keyword tier decided the turn, or the M4 verify-escalation floor raised it. */
    readonly tierReason?: 'keyword' | 'phase' | 'verify-escalation'
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
 * @param ceiling - explicitly frozen deployment policy (fix pass #2,
 * acceptance item 7): when present the synthesis min-restricts against it —
 * a tier model outside the ceiling's allowed list is dropped and the
 * fallback group keeps only ceiling-allowed refs, so a disallowed "high"
 * falls down to the strongest ALLOWED tier instead of escaping the ceiling.
 * An empty intersection yields empty `allowed` (the resolver then rejects
 * and dispatch routing steps aside for the turn).
 */
export function synthesizeTierPolicy(
  config: RouteTierConfig,
  ceiling?: Pick<EnterpriseRoutePolicy, 'allowSessionOverride' | 'allowed'>,
): EnterpriseRoutePolicy {
  const { allowed, groups } = tierAllowed(config)
  if (ceiling === undefined) {
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
  const ceilingAllowed = new Map(ceiling.allowed.map(entry => [modelKey(entry), entry]))
  const restricted = allowed.flatMap((entry) => {
    const cap = ceilingAllowed.get(modelKey(entry))
    if (cap === undefined) return []
    return [{
      ...entry,
      // Tighten-only on capabilities too: a capability the ceiling does not
      // grant is not granted here.
      capabilities: entry.capabilities.filter(c => cap.capabilities.includes(c)),
    }]
  })
  const allowedKeys = new Set(restricted.map(modelKey))
  const midRef = tierRef(config, 'mid')
  const defaultEntry = restricted.find(entry => entry.provider === midRef.provider && entry.model === midRef.model)
    ?? restricted[0]
  return {
    schema: 1,
    policyId: 'baf-tier-route',
    version: 'local',
    allowSessionOverride: ceiling.allowSessionOverride,
    default: defaultEntry === undefined ? midRef : { provider: defaultEntry.provider, model: defaultEntry.model },
    allowed: restricted,
    fallbackPolicy: {
      mode: 'approved-only',
      groups: { tiers: (groups.tiers ?? []).filter(ref => allowedKeys.has(modelKey(ref))) },
    },
  }
}
