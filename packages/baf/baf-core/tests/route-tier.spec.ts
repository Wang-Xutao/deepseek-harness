/**
 * Route-tier decision functions: resolveTaskTier keyword matching
 * (ASCII whole-word, CJK substring), effectiveTier escalation semantics,
 * config parsing, and RouteProfile/EnterpriseRoutePolicy compilation.
 */

import {
  assertEnterpriseRoutePolicySemantics,
  buildRouteStatusView,
  modelKey,
  type RouteCapability,
} from '../src/route-policy.ts'
import {
  BUILTIN_KEYWORD_PRESETS,
  DEFAULT_PHASE_TIER,
  DEFAULT_PHASE_TIER_TWO,
  TIER_CAPABILITIES,
  activeDisplayTiers,
  applyTierMode,
  coerceTierForMode,
  compileTierRouteProfile,
  effectiveKeywordRules,
  effectiveTier,
  isTierRoutingActive,
  nextTierInMode,
  parseRouteTierConfig,
  resolveTaskTier,
  resolveTierMode,
  findTierByRef,
  synthesizeTierPolicy,
  type RouteTierConfig,
} from '../src/route-tier.ts'
import { describe, expect, it } from 'vitest'

const HIGH = { provider: 'p1', model: 'big-brain' } as const
const MID = { provider: 'p1', model: 'middle' } as const
const LOW = { provider: 'p2', model: 'cheap-fast' } as const

function makeConfig(overrides: {
  phaseTier?: RouteTierConfig['phaseTier']
  keywords?: RouteTierConfig['keywords']
  escalateOnly?: boolean
} = {}): RouteTierConfig {
  return {
    schema: 1,
    enabled: true,
    tiers: { high: { ...HIGH }, mid: { ...MID }, low: { ...LOW } },
    phaseTier: overrides.phaseTier,
    keywords: overrides.keywords,
    escalateOnly: overrides.escalateOnly,
  }
}

describe('resolveTaskTier', () => {
  it('matches an ASCII keyword as a whole word, case-insensitively', () => {
    const hit = resolveTaskTier('Please Refactor the parser first', [{ words: 'refactor', tier: 'high' }])
    expect(hit).toEqual({ tier: 'high', matched: 'refactor' })
  })

  it('does not match an ASCII keyword inside a larger word', () => {
    // `read` must not fire on `README` (prefix overlap) — whole-word rule.
    expect(resolveTaskTier('update the README file', [{ words: 'read', tier: 'low' }])).toBeUndefined()
  })

  it('matches a CJK keyword by substring without word boundaries', () => {
    const hit = resolveTaskTier('这次要做整体架构层面的调整', [{ words: '架构', tier: 'high' }])
    expect(hit).toEqual({ tier: 'high', matched: '架构' })
  })

  it('honors |-separated alternatives inside one rule, first rule wins', () => {
    const rules = [
      { words: '架构|architecture', tier: 'high' },
      { words: '文案|README', tier: 'low' },
    ]
    expect(resolveTaskTier('文案调整', rules)).toEqual({ tier: 'low', matched: '文案' })
    expect(resolveTaskTier('architecture overhaul', rules)).toEqual({ tier: 'high', matched: 'architecture' })
    // Both rules hit → the first declared rule wins.
    expect(resolveTaskTier('architecture 文案', rules)?.tier).toBe('high')
  })

  it('escapes regex metacharacters in keywords', () => {
    expect(resolveTaskTier('fix the c++ build', [{ words: 'c++', tier: 'mid' }]))
      .toEqual({ tier: 'mid', matched: 'c++' })
    expect(resolveTaskTier('fix the c build', [{ words: 'c++', tier: 'mid' }])).toBeUndefined()
  })

  it('returns undefined on no hit or empty input', () => {
    expect(resolveTaskTier('hello world', [{ words: '架构', tier: 'high' }])).toBeUndefined()
    expect(resolveTaskTier('', [{ words: '架构', tier: 'high' }])).toBeUndefined()
    expect(resolveTaskTier('架构', [])).toBeUndefined()
  })
})

describe('effectiveTier', () => {
  it('maps phases through defaults (design=high, implement=low, verify=mid)', () => {
    const config = makeConfig()
    expect(effectiveTier('design', undefined, config)).toEqual({ tier: 'high', reason: 'phase' })
    expect(effectiveTier('implement', undefined, config)).toEqual({ tier: 'low', reason: 'phase' })
    expect(effectiveTier('verify', undefined, config)).toEqual({ tier: 'mid', reason: 'phase' })
  })

  it('escalates with the keyword tier when it outranks the phase tier (escalateOnly default)', () => {
    const config = makeConfig()
    expect(effectiveTier('implement', 'high', config)).toEqual({ tier: 'high', reason: 'keyword' })
  })

  it('keeps the phase tier when the keyword tier does not outrank it', () => {
    const config = makeConfig()
    expect(effectiveTier('design', 'low', config)).toEqual({ tier: 'high', reason: 'phase' })
    expect(effectiveTier('verify', 'mid', config)).toEqual({ tier: 'mid', reason: 'phase' })
  })

  it('ignores the keyword tier entirely when escalateOnly=false', () => {
    const config = makeConfig({ escalateOnly: false })
    expect(effectiveTier('implement', 'high', config)).toEqual({ tier: 'low', reason: 'phase' })
  })

  it('honors explicit phaseTier overrides over defaults', () => {
    const config = makeConfig({ phaseTier: { verify: 'high' } })
    expect(effectiveTier('verify', undefined, config)).toEqual({ tier: 'high', reason: 'phase' })
  })

  it('resolves drift via the default table', () => {
    expect(effectiveTier('drift', undefined, makeConfig())).toEqual({ tier: 'low', reason: 'phase' })
  })
})

describe('tierMode (two vs three grades)', () => {
  it('defaults missing tierMode to three (preserve existing configs)', () => {
    const config = parseRouteTierConfig({
      schema: 1,
      enabled: true,
      tiers: { high: HIGH, mid: MID, low: LOW },
    })
    expect(resolveTierMode(config!)).toBe('three')
    expect(config?.tierMode).toBe('three')
  })

  it('parses tierMode two and demotes mid→low via applyTierMode', () => {
    const config = parseRouteTierConfig({
      schema: 1,
      enabled: true,
      tierMode: 'two',
      tiers: { high: HIGH, mid: MID, low: LOW },
      phaseTier: { verify: 'mid', design: 'high' },
      keywords: [{ words: '评审', tier: 'mid' }, { words: '架构', tier: 'high' }],
    })
    expect(config?.tierMode).toBe('two')
    const applied = applyTierMode(config!)
    expect(applied.tiers.mid).toEqual(applied.tiers.low)
    expect(applied.phaseTier?.verify).toBe('low')
    expect(applied.keywords?.find(rule => rule.words === '评审')?.tier).toBe('low')
    expect(applied.keywords?.find(rule => rule.words === '架构')?.tier).toBe('high')
  })

  it('cycles and displays only high/low in two-mode', () => {
    expect(activeDisplayTiers('two')).toEqual(['high', 'low'])
    expect(activeDisplayTiers('three')).toEqual(['high', 'mid', 'low'])
    expect(nextTierInMode('low', 'two')).toBe('high')
    expect(nextTierInMode('high', 'two')).toBe('low')
    expect(nextTierInMode('low', 'three')).toBe('mid')
    expect(coerceTierForMode('mid', 'two')).toBe('low')
    expect(DEFAULT_PHASE_TIER_TWO.verify).toBe('low')
    expect(DEFAULT_PHASE_TIER_TWO.design).toBe('high')
  })
})

describe('parseRouteTierConfig', () => {
  it('parses a complete document and fills defaults', () => {
    const config = parseRouteTierConfig({
      schema: 1,
      enabled: true,
      tiers: { high: HIGH, mid: MID, low: LOW },
      keywords: [{ words: '架构', tier: 'high', note: '复杂任务' }],
    })
    expect(config).toBeDefined()
    expect(config?.escalateOnly).toBe(true)
    expect(config?.keywords).toEqual([{ words: '架构', tier: 'high', note: '复杂任务' }])
    expect(config?.phaseTier).toEqual({})
    expect(isTierRoutingActive(config!)).toBe(true)
  })

  it('accepts enabled=false (feature off) but reports it inactive', () => {
    const config = parseRouteTierConfig({ schema: 1, enabled: false, tiers: { high: HIGH, mid: MID, low: LOW } })
    expect(config).toBeDefined()
    expect(isTierRoutingActive(config!)).toBe(false)
  })

  it('rejects incomplete tiers, bad tier refs, and wrong schema', () => {
    expect(parseRouteTierConfig({ schema: 1, enabled: true, tiers: { high: HIGH, mid: MID } })).toBeUndefined()
    expect(parseRouteTierConfig({
      schema: 1,
      enabled: true,
      tiers: { high: { provider: '', model: 'x' }, mid: MID, low: LOW },
    })).toBeUndefined()
    expect(parseRouteTierConfig({
      schema: 1,
      enabled: true,
      tiers: { high: HIGH, mid: MID, low: LOW },
      keywords: [{ words: '架构', tier: 'ultra' }],
    })).toBeUndefined()
    expect(parseRouteTierConfig({ schema: 2, enabled: true, tiers: { high: HIGH, mid: MID, low: LOW } }))
      .toBeUndefined()
    expect(parseRouteTierConfig('junk')).toBeUndefined()
  })
})

describe('compileTierRouteProfile + synthesizeTierPolicy', () => {
  it('compiles phases from the tier mapping and default = mid', () => {
    const profile = compileTierRouteProfile(makeConfig())
    expect(profile.phases.design).toEqual(HIGH)
    expect(profile.phases.plan).toEqual(HIGH)
    expect(profile.phases.implement).toEqual(LOW)
    expect(profile.phases.verify).toEqual(MID)
    expect(profile.default).toEqual(MID)
  })

  it('builds allowed with tier capability tags and the tiers fallback group', () => {
    const profile = compileTierRouteProfile(makeConfig())
    expect(profile.allowed).toHaveLength(3)
    const byKey = new Map(profile.allowed.map(entry => [modelKey(entry), entry]))
    expect(byKey.get(modelKey(HIGH))?.capabilities).toContain('reasoning')
    expect(byKey.get(modelKey(HIGH))?.capabilities).toContain('long-context')
    expect(byKey.get(modelKey(LOW))?.capabilities).toContain('coding')
    expect(byKey.get(modelKey(LOW))?.capabilities).toContain('low-latency')
    expect(profile.allowed.every(entry => entry.fallbackGroup === 'tiers')).toBe(true)
    expect(profile.fallbackPolicy.groups.tiers?.map(modelKey)).toEqual([
      modelKey(HIGH), modelKey(MID), modelKey(LOW),
    ])
  })

  it('dedupes allowed when two tiers share a model, unioning capabilities', () => {
    const config = makeConfig()
    config.tiers.mid = { ...HIGH, reasoningEffort: 'low' }
    const profile = compileTierRouteProfile(config)
    expect(profile.allowed).toHaveLength(2)
    const merged = profile.allowed.find(entry => modelKey(entry) === modelKey(HIGH))
    const caps = merged?.capabilities as readonly RouteCapability[]
    expect(caps).toContain('reasoning')
    expect(caps).toContain('structured-output')
  })

  it('honors phaseTier overrides in compiled phases', () => {
    const profile = compileTierRouteProfile(makeConfig({ phaseTier: { verify: 'high' } }))
    expect(profile.phases.verify).toEqual(HIGH)
  })

  it('synthesizes a semantically valid policy and a buildable status view', () => {
    const config = makeConfig()
    const policy = synthesizeTierPolicy(config)
    expect(() => assertEnterpriseRoutePolicySemantics(policy)).not.toThrow()
    expect(policy.allowSessionOverride).toBe(true)
    expect(policy.default).toEqual(MID)
    expect(() => buildRouteStatusView(policy, compileTierRouteProfile(config))).not.toThrow()
  })
})

describe('tier vocabulary', () => {
  it('defaults cover all nine workflow nodes', () => {
    expect(Object.keys(DEFAULT_PHASE_TIER).sort()).toEqual([
      'archive', 'clarify', 'design', 'drift', 'implement', 'intake', 'open', 'plan', 'verify',
    ])
  })

  it('gives each tier the capabilities the plan table promises', () => {
    expect(TIER_CAPABILITIES.high).toContain('reasoning')
    expect(TIER_CAPABILITIES.mid).toContain('structured-output')
    expect(TIER_CAPABILITIES.low).toContain('coding')
    // 多模型路由 M2: high also codes — without the coding tag, an escalated
    // implement turn (phase requires coding) could never run on the high
    // model; the capability floor would veto the keyword escalation and the
    // approved-only fallback would undo it.
    expect(TIER_CAPABILITIES.high).toContain('coding')
  })
})

describe('findTierByRef', () => {
  it('finds the tier a resolved ref landed on (fallback effort lookup)', () => {
    const config = makeConfig()
    expect(findTierByRef(config, HIGH)).toBe('high')
    expect(findTierByRef(config, LOW)).toBe('low')
    expect(findTierByRef(config, { provider: 'other', model: 'x' })).toBeUndefined()
  })

  it('prefers the stronger tier when two tiers share one model', () => {
    const config = makeConfig()
    config.tiers.mid = { ...HIGH }
    expect(findTierByRef(config, HIGH)).toBe('high')
  })
})

describe('builtin keyword presets (2.4 默认启用)', () => {
  it('ships the three curated escalation packs with stable ids and non-empty word lists', () => {
    // 【变更】2026-10-13 (worker 关键词批): three packs, all escalation tiers —
    // Worker is the fallback grade and carries no keywords of its own.
    expect(BUILTIN_KEYWORD_PRESETS.map(preset => preset.id)).toEqual([
      'complexEngineering', 'criticalRelease', 'qualityAssurance',
    ])
    for (const preset of BUILTIN_KEYWORD_PRESETS) {
      expect(preset.words.length).toBeGreaterThan(0)
      expect(preset.tier).not.toBe('low')
    }
    expect(BUILTIN_KEYWORD_PRESETS[0]?.tier).toBe('high')
  })

  it('effectiveKeywordRules appends the builtins after the user rules', () => {
    const rules = effectiveKeywordRules([{ words: '我的关键词', tier: 'mid' }])
    expect(rules[0]).toEqual({ words: '我的关键词', tier: 'mid' })
    expect(rules.length).toBe(1 + BUILTIN_KEYWORD_PRESETS.length)
    expect(rules.at(-1)?.words).toBe(BUILTIN_KEYWORD_PRESETS.at(-1)?.words)
  })

  it('matches a builtin word with zero user rules (presets act by default)', () => {
    // 「架构」 lives in the complexEngineering pack — no user keyword needed.
    expect(resolveTaskTier('梳理整体架构并重构', effectiveKeywordRules([])))
      .toEqual({ tier: 'high', matched: '架构' })
    // Plain copy/typo wording matches NOTHING now — Worker is the fallback
    // grade; with no keyword hit the turn falls through to it by design.
    expect(resolveTaskTier('fix a typo in the docs', effectiveKeywordRules([]))).toBeUndefined()
    // 「单元测试」 lives in qualityAssurance.
    expect(resolveTaskTier('补充单元测试覆盖', effectiveKeywordRules([])))
      .toEqual({ tier: 'mid', matched: '单元测试' })
  })

  it('user mid rules win over builtins on the same word (declared first)', () => {
    expect(resolveTaskTier('架构', effectiveKeywordRules([{ words: '架构', tier: 'mid' }])))
      .toEqual({ tier: 'mid', matched: '架构' })
  })
})

describe('keyword rule enable state + custom categories + preset file (2026-10-06 问题 3/4)', () => {
  it('round-trips category/enabled on user rules and packs/presetWords overrides through the schema', () => {
    const config = parseRouteTierConfig({
      ...makeConfig(),
      keywords: [{ words: '导出|export', tier: 'low', category: '数据导出', enabled: false }],
      packs: { routineEdits: false },
      presetWords: { 'routineEdits::typo': false },
    })
    expect(config?.keywords?.[0]).toEqual({
      words: '导出|export', tier: 'low', category: '数据导出', enabled: false,
    })
    expect(config?.packs).toEqual({ routineEdits: false })
    expect(config?.presetWords).toEqual({ 'routineEdits::typo': false })
  })

  it('drops user rules disabled at the tag level (enabled: false)', () => {
    const rules = effectiveKeywordRules([
      { words: '架构', tier: 'low', enabled: false },
      { words: '架构', tier: 'mid', enabled: true },
    ])
    // The disabled low rule never fires; the enabled mid one does.
    expect(resolveTaskTier('架构', rules)).toEqual({ tier: 'mid', matched: '架构' })
  })

  it('evaluates a caller-provided preset list (the file-backed packs) instead of the code builtins', () => {
    const rules = effectiveKeywordRules([], {
      presets: [{ id: 'customPack', tier: 'high', words: '对账|reconciliation' }],
    })
    expect(rules).toHaveLength(1)
    expect(resolveTaskTier('做一个对账报表', rules)).toEqual({ tier: 'high', matched: '对账' })
  })

  it('drops a whole pack disabled through packs (类级一键开关)', () => {
    const rules = effectiveKeywordRules([], { packs: { qualityAssurance: false } })
    expect(resolveTaskTier('补充单元测试覆盖', rules)).toBeUndefined()
    // Other packs keep matching.
    expect(resolveTaskTier('梳理整体架构', rules)).toEqual({ tier: 'high', matched: '架构' })
  })

  it('drops a single preset word disabled through presetWords (标签级开关)', () => {
    const rules = effectiveKeywordRules([], { presetWords: { 'qualityAssurance::单元测试': false } })
    expect(resolveTaskTier('补充单元测试覆盖', rules)).toBeUndefined()
    expect(resolveTaskTier('排查线上回归', rules)).toEqual({ tier: 'mid', matched: '回归' })
  })

  it('drops a pack whose every word is disabled', () => {
    const words = BUILTIN_KEYWORD_PRESETS[2]!
    const presetWords = Object.fromEntries(
      words.words.split('|').map(word => [`qualityAssurance::${word}`, false]),
    )
    const rules = effectiveKeywordRules([], { presetWords })
    expect(rules).toHaveLength(BUILTIN_KEYWORD_PRESETS.length - 1)
  })

  it('matches either side of a `|` alternation (问题 4: the separator works)', () => {
    expect(resolveTaskTier('alpha needs work', effectiveKeywordRules([{ words: 'alpha|beta', tier: 'high' }])))
      .toEqual({ tier: 'high', matched: 'alpha' })
    expect(resolveTaskTier('beta needs work', effectiveKeywordRules([{ words: 'alpha|beta', tier: 'high' }])))
      .toEqual({ tier: 'high', matched: 'beta' })
  })
})

describe('worker keyword rules are dead config, filtered (2026-10-13 worker 关键词批)', () => {
  it('drops stored low user rules — Worker is the fallback grade', () => {
    const rules = effectiveKeywordRules([
      { words: '函数|typo', tier: 'low' },
      { words: '架构', tier: 'high' },
    ])
    // The low rule is gone; the high user rule + the three builtin packs remain.
    expect(rules).toHaveLength(1 + BUILTIN_KEYWORD_PRESETS.length)
    expect(rules[0]).toEqual({ words: '架构', tier: 'high' })
  })

  it('drops low preset packs (version-skewed seeded files keep parsing)', () => {
    const rules = effectiveKeywordRules([], {
      presets: [
        { id: 'legacyLow', tier: 'low', words: '文案|typo' },
        { id: 'freshHigh', tier: 'high', words: '对账' },
      ],
    })
    expect(rules).toHaveLength(1)
    expect(rules[0]).toEqual({ words: '对账', tier: 'high' })
  })

  it('drops mid rules/packs in two-grade mode (mid coerces into the Worker fallback)', () => {
    const rules = effectiveKeywordRules(
      [{ words: '架构', tier: 'mid' }],
      {
        tierMode: 'two',
        presets: [
          { id: 'qaPack', tier: 'mid', words: '回归' },
          { id: 'highPack', tier: 'high', words: '对账' },
        ],
      },
    )
    expect(rules).toHaveLength(1)
    expect(rules[0]).toEqual({ words: '对账', tier: 'high' })
    // Three-grade mode keeps mid rules alive (max(mid, phase) escalates).
    const threeGrade = effectiveKeywordRules(
      [{ words: '架构', tier: 'mid' }],
      { tierMode: 'three' },
    )
    expect(threeGrade[0]).toEqual({ words: '架构', tier: 'mid' })
  })

  it('un-shadows escalations a legacy low rule used to swallow (first-match-wins)', () => {
    // 「重构架构并实现函数」: the legacy low rule (函数) matched FIRST and
    // returned a dead tier, hiding the builtin high pack's 架构/重构 — after
    // the filter the escalation surfaces with OR without the legacy rule.
    const legacy = [{ words: '函数', tier: 'low' }] as const
    expect(resolveTaskTier('重构架构并实现函数', effectiveKeywordRules([...legacy])))
      .toEqual({ tier: 'high', matched: '架构' })
    expect(resolveTaskTier('重构架构并实现函数', effectiveKeywordRules([])))
      .toEqual({ tier: 'high', matched: '架构' })
  })
})
