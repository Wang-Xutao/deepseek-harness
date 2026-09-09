/**
 * EnterpriseRoutePolicy parse + RouteStatusView builder.
 */

import {
  buildRouteStatusView,
  parseEnterpriseRoutePolicy,
  type EnterpriseRoutePolicy,
  type RouteProfile,
} from '../src/route-policy.ts'
import { describe, expect, it } from 'vitest'

const ALL_CAPS = [
  'reasoning',
  'coding',
  'structured-output',
  'long-context',
  'tool-use',
  'low-latency',
] as const

const PRIMARY = { provider: 'fixture', model: 'primary' } as const

const POLICY: EnterpriseRoutePolicy = {
  schema: 1,
  policyId: 'fixture-enterprise-route',
  version: '2026.1',
  allowSessionOverride: true,
  default: PRIMARY,
  allowed: [
    { ...PRIMARY, capabilities: [...ALL_CAPS], fallbackGroup: 'primary-group' },
  ],
  fallbackPolicy: {
    mode: 'approved-only',
    groups: { 'primary-group': [PRIMARY] },
  },
}

const PROFILE: RouteProfile = {
  default: PRIMARY,
  allowed: POLICY.allowed.map(entry => ({ ...entry, capabilities: [...entry.capabilities] })),
  phases: {
    intake: PRIMARY,
    open: PRIMARY,
    clarify: PRIMARY,
    design: PRIMARY,
    plan: PRIMARY,
    implement: PRIMARY,
    verify: PRIMARY,
    archive: PRIMARY,
  },
  fallbackPolicy: {
    mode: 'approved-only',
    groups: { 'primary-group': [PRIMARY] },
  },
}

describe('EnterpriseRoutePolicy', () => {
  it('parses a valid policy document', () => {
    const policy = parseEnterpriseRoutePolicy(POLICY)
    expect(policy.policyId).toBe('fixture-enterprise-route')
  })

  it('rejects missing fallback group', () => {
    expect(() => parseEnterpriseRoutePolicy({
      ...POLICY,
      fallbackPolicy: { mode: 'approved-only', groups: {} },
    })).toThrow(/fallback group/)
  })

  it('builds RouteStatusView', () => {
    const view = buildRouteStatusView(POLICY, PROFILE, {
      implement: {
        provider: 'fixture',
        model: 'primary',
        source: 'phase',
        phase: 'implement',
        fallbackFrom: { provider: 'fixture', model: 'other', reason: 'unavailable' },
      },
    })
    expect(view.policyVersion).toBe('2026.1')
    expect(view.phases.implement?.fallbackActive).toBe(true)
  })
})
