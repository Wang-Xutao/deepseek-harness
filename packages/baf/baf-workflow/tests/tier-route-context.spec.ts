/**
 * Tier-route context decision: when the BafWorkflow service (unfrozen, no
 * explicit enterprise policy) should freeze the synthesized tier policy, keep
 * the current one, or clear it after the config went away/disabled.
 */

import { describe, expect, it } from 'vitest'
import type { RouteTierConfig } from '@deepseek-ai/dsh-baf-core'
import { modelKey } from '@deepseek-ai/dsh-baf-core'
import { tierRouteDecision } from '../src/tier-route-context.ts'

const CONFIG: RouteTierConfig = {
  schema: 1,
  enabled: true,
  tiers: {
    high: { provider: 'p', model: 'big' },
    mid: { provider: 'p', model: 'mid' },
    low: { provider: 'p', model: 'cheap' },
  },
  phaseTier: {},
  keywords: [],
  escalateOnly: true,
}

const CONFIG_JSON = JSON.stringify(CONFIG)

describe('tierRouteDecision', () => {
  it('freezes the synthesized policy + compiled profile for an active config', () => {
    const decision = tierRouteDecision(false, CONFIG, undefined)
    expect(decision?.kind).toBe('freeze')
    if (decision?.kind !== 'freeze') return
    expect(decision.policy.policyId).toBe('baf-tier-route')
    expect(decision.policy.allowSessionOverride).toBe(true)
    expect(decision.profile.phases.design).toEqual({ provider: 'p', model: 'big' })
    expect(decision.profile.phases.implement).toEqual({ provider: 'p', model: 'cheap' })
    expect(decision.json).toBe(CONFIG_JSON)
  })

  it('keeps the current freeze when the config is unchanged', () => {
    expect(tierRouteDecision(false, CONFIG, CONFIG_JSON)?.kind).toBe('keep')
  })

  it('refreezes when the config changed (settings save applies next read)', () => {
    const changed = { ...CONFIG, tiers: { ...CONFIG.tiers, mid: { provider: 'p', model: 'new-mid' } } }
    const decision = tierRouteDecision(false, changed, CONFIG_JSON)
    expect(decision?.kind).toBe('freeze')
    if (decision?.kind !== 'freeze') return
    expect(decision.profile.default).toEqual({ provider: 'p', model: 'new-mid' })
    expect(decision.profile.phases.verify).toEqual({ provider: 'p', model: 'new-mid' })
  })

  it('never touches an explicitly frozen enterprise context', () => {
    expect(tierRouteDecision(true, CONFIG, undefined)?.kind).toBe('keep')
  })

  it('keeps quiet when inactive and nothing was tier-frozen', () => {
    expect(tierRouteDecision(false, undefined, undefined)?.kind).toBe('keep')
    const disabled = { ...CONFIG, enabled: false }
    expect(tierRouteDecision(false, disabled, undefined)?.kind).toBe('keep')
  })

  it('clears a stale tier freeze when the config goes away or turns disabled', () => {
    expect(tierRouteDecision(false, undefined, CONFIG_JSON)?.kind).toBe('clear')
    const disabled = { ...CONFIG, enabled: false }
    expect(tierRouteDecision(false, disabled, CONFIG_JSON)?.kind).toBe('clear')
  })

  it('compiled context satisfies the enterprise policy semantics', () => {
    const decision = tierRouteDecision(false, CONFIG, undefined)
    if (decision?.kind !== 'freeze') throw new Error('expected freeze')
    const allowedKeys = decision.policy.allowed.map(modelKey)
    for (const member of decision.policy.fallbackPolicy.groups.tiers ?? []) {
      expect(allowedKeys).toContain(modelKey(member))
    }
  })
})
