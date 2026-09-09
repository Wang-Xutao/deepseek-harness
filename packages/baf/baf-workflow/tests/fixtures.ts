/**
 * Shared fixtures for route resolver tests.
 */

import type { EnterpriseRoutePolicy, ModelRef, RouteProfile } from '@deepseek-ai/dsh-baf-core'

const ALL_CAPS = [
  'reasoning',
  'coding',
  'structured-output',
  'long-context',
  'tool-use',
  'low-latency',
] as const

/** Full-capability primary model. */
export const PRIMARY: ModelRef = { provider: 'fixture', model: 'primary' }
/** Approved fallback with full capabilities. */
export const FALLBACK: ModelRef = { provider: 'fixture', model: 'fallback' }
/** Light model for intake (no reasoning). */
export const LIGHT: ModelRef = { provider: 'fixture', model: 'light' }
/** Outside enterprise allowed. */
export const OUTSIDER: ModelRef = { provider: 'other', model: 'x' }

/** Enterprise policy used by most route tests. */
export const ENTERPRISE: EnterpriseRoutePolicy = {
  schema: 1,
  policyId: 'fixture-enterprise-route',
  version: '2026.1',
  allowSessionOverride: true,
  default: PRIMARY,
  allowed: [
    { ...PRIMARY, capabilities: [...ALL_CAPS], fallbackGroup: 'primary-group' },
    { ...FALLBACK, capabilities: [...ALL_CAPS], fallbackGroup: 'primary-group' },
    {
      ...LIGHT,
      capabilities: ['low-latency', 'tool-use', 'structured-output'],
      fallbackGroup: 'light-group',
    },
  ],
  fallbackPolicy: {
    mode: 'approved-only',
    groups: {
      'primary-group': [PRIMARY, FALLBACK],
      'light-group': [LIGHT],
    },
  },
}

/** Baseline route profile preferring PRIMARY for every phase. */
export const PROFILE: RouteProfile = {
  default: PRIMARY,
  allowed: [
    { ...PRIMARY, capabilities: [...ALL_CAPS], fallbackGroup: 'primary-group' },
    { ...FALLBACK, capabilities: [...ALL_CAPS], fallbackGroup: 'primary-group' },
    {
      ...LIGHT,
      capabilities: ['low-latency', 'tool-use', 'structured-output'],
      fallbackGroup: 'light-group',
    },
  ],
  phases: {
    intake: LIGHT,
    open: LIGHT,
    clarify: PRIMARY,
    design: PRIMARY,
    plan: PRIMARY,
    implement: PRIMARY,
    verify: PRIMARY,
    archive: LIGHT,
  },
  fallbackPolicy: {
    mode: 'approved-only',
    groups: {
      'primary-group': [PRIMARY, FALLBACK],
      'light-group': [LIGHT],
    },
  },
}

/**
 * Availability stub from an allow-set of `provider::model` keys.
 * @param available - available keys.
 * @param contextLengths - optional context lengths.
 * @returns ProviderAvailability.
 */
export function availabilityOf(
  available: ReadonlySet<string>,
  contextLengths: ReadonlyMap<string, number> = new Map(),
) {
  return {
    isAvailable(provider: string, model: string): boolean {
      return available.has(`${provider}::${model}`)
    },
    contextLength(provider: string, model: string): number | undefined {
      return contextLengths.get(`${provider}::${model}`)
    },
  }
}
