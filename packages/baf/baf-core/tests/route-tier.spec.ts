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
  DEFAULT_PHASE_TIER,
  TIER_CAPABILITIES,
  compileTierRouteProfile,
  effectiveTier,
  isTierRoutingActive,
  parseRouteTierConfig,
  resolveTaskTier,
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
  })
})
