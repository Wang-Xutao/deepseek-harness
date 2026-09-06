/**
 * resolveRoute covers enterprise-workflow §6.2 boundaries 1–7.
 */

import { BafError, isBafError } from '@deepseek-ai/dsh-baf-core'
import { describe, expect, it } from 'vitest'
import { resolveRoute } from '../src/route.ts'
import {
  ENTERPRISE,
  FALLBACK,
  LIGHT,
  OUTSIDER,
  PRIMARY,
  PROFILE,
  availabilityOf,
} from './fixtures.ts'

function key(ref: { provider: string; model: string }): string {
  return `${ref.provider}::${ref.model}`
}

describe('resolveRoute (§6.2)', () => {
  it('1. uses phase preference inside enterprise allowed', () => {
    const all = new Set([key(PRIMARY), key(FALLBACK), key(LIGHT)])
    const r = resolveRoute(ENTERPRISE, PROFILE, 'intake', undefined, availabilityOf(all))
    expect(r).toMatchObject({ ...LIGHT, source: 'phase', phase: 'intake' })
  })

  it('2. enterprise ceiling rejects profile-only widening (outsider never selected)', () => {
    const widened = {
      ...PROFILE,
      phases: {
        ...PROFILE.phases,
        implement: OUTSIDER,
      },
      allowed: [
        ...PROFILE.allowed,
        { ...OUTSIDER, capabilities: ['coding', 'tool-use'], fallbackGroup: 'primary-group' },
      ],
    }
    const all = new Set([key(PRIMARY), key(FALLBACK), key(LIGHT), key(OUTSIDER)])
    // Phase points outside enterprise → fall through to profile.default (PRIMARY).
    const r = resolveRoute(ENTERPRISE, widened, 'implement', undefined, availabilityOf(all))
    expect(r.provider).toBe(PRIMARY.provider)
    expect(r.model).toBe(PRIMARY.model)
    expect(r.source).toBe('route-profile')
  })

  it('3. session override outside enterprise allowed is rejected', () => {
    const all = new Set([key(PRIMARY), key(FALLBACK), key(LIGHT)])
    expect(() => resolveRoute(ENTERPRISE, PROFILE, 'implement', OUTSIDER, availabilityOf(all)))
      .toThrow(/outside enterprise allowed/)
    try {
      resolveRoute(ENTERPRISE, PROFILE, 'implement', OUTSIDER, availabilityOf(all))
    } catch (error) {
      expect(isBafError(error)).toBe(true)
      expect((error as BafError).code).toBe('model_route_incompatible')
    }
  })

  it('4. session override disabled by enterprise policy is rejected', () => {
    const locked = { ...ENTERPRISE, allowSessionOverride: false }
    const all = new Set([key(PRIMARY), key(FALLBACK), key(LIGHT)])
    expect(() => resolveRoute(locked, PROFILE, 'implement', FALLBACK, availabilityOf(all)))
      .toThrow(/disabled by enterprise policy/)
  })

  it('5. unavailable preferred engages approved fallback', () => {
    const onlyFallback = new Set([key(FALLBACK), key(LIGHT)])
    const r = resolveRoute(ENTERPRISE, PROFILE, 'implement', undefined, availabilityOf(onlyFallback))
    expect(r).toMatchObject({
      ...FALLBACK,
      source: 'phase',
      phase: 'implement',
      fallbackFrom: { ...PRIMARY, reason: 'unavailable' },
    })
  })

  it('6. incompatible preferred with no compatible fallback → model_fallback_blocked', () => {
    // design requires reasoning+long-context; LIGHT lacks them; only LIGHT available.
    const lightOnlyEnterprise: typeof ENTERPRISE = {
      ...ENTERPRISE,
      default: LIGHT,
      allowed: [
        {
          ...LIGHT,
          capabilities: ['low-latency', 'tool-use'],
          fallbackGroup: 'light-group',
        },
      ],
      fallbackPolicy: {
        mode: 'approved-only',
        groups: { 'light-group': [LIGHT] },
      },
    }
    const lightProfile: typeof PROFILE = {
      ...PROFILE,
      default: LIGHT,
      allowed: lightOnlyEnterprise.allowed,
      phases: {
        intake: LIGHT,
        open: LIGHT,
        clarify: LIGHT,
        design: LIGHT,
        plan: LIGHT,
        implement: LIGHT,
        verify: LIGHT,
        archive: LIGHT,
      },
      fallbackPolicy: lightOnlyEnterprise.fallbackPolicy,
    }
    try {
      resolveRoute(lightOnlyEnterprise, lightProfile, 'design', undefined, availabilityOf(new Set([key(LIGHT)])))
      expect.unreachable('expected throw')
    } catch (error) {
      expect(isBafError(error)).toBe(true)
      expect((error as BafError).code).toBe('model_fallback_blocked')
    }
  })

  it('7. no fallback group members usable → model_fallback_blocked when preferred unavailable', () => {
    const none = new Set<string>()
    try {
      resolveRoute(ENTERPRISE, PROFILE, 'implement', undefined, availabilityOf(none))
      expect.unreachable('expected throw')
    } catch (error) {
      expect(isBafError(error)).toBe(true)
      expect((error as BafError).code).toBe('model_fallback_blocked')
    }
  })

  it('accepts session override inside allowed and records source', () => {
    const all = new Set([key(PRIMARY), key(FALLBACK), key(LIGHT)])
    const r = resolveRoute(ENTERPRISE, PROFILE, 'implement', FALLBACK, availabilityOf(all))
    expect(r).toMatchObject({ ...FALLBACK, source: 'session-override', phase: 'implement' })
  })

  it('falls back to dsh-default when phase and profile/enterprise defaults are outside allowed', () => {
    const tight = {
      ...ENTERPRISE,
      // Intentionally inconsistent (bypasses parse) so pick reaches dsh-default.
      default: PRIMARY,
      allowed: [
        {
          ...FALLBACK,
          capabilities: [...ENTERPRISE.allowed[1]!.capabilities],
          fallbackGroup: 'primary-group',
        },
      ],
      fallbackPolicy: {
        mode: 'approved-only' as const,
        groups: { 'primary-group': [FALLBACK] },
      },
    }
    const profile = {
      ...PROFILE,
      default: PRIMARY,
      allowed: PROFILE.allowed,
      phases: { ...PROFILE.phases, implement: PRIMARY },
      fallbackPolicy: PROFILE.fallbackPolicy,
    }
    const r = resolveRoute(
      tight,
      profile,
      'implement',
      undefined,
      availabilityOf(new Set([key(FALLBACK)])),
      { dshDefault: FALLBACK },
    )
    expect(r).toMatchObject({ ...FALLBACK, source: 'dsh-default', phase: 'implement' })
  })
})
