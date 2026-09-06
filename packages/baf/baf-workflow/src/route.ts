/**
 * Pure BAF route resolver: enterprise ceiling → profile phase → session
 * override → dsh default, with approved-only fallback.
 * @module @deepseek-ai/dsh-baf-workflow/route
 */

import {
  BafError,
  LONG_CONTEXT_MIN_TOKENS,
  PHASE_REQUIRED_CAPABILITIES,
  modelKey,
  type AllowedModel,
  type EnterpriseRoutePolicy,
  type ModelRef,
  type ProviderAvailability,
  type RouteCapability,
  type RouteProfile,
  type RouteResolution,
  type RouteSource,
  type WorkflowNode,
} from '@deepseek-ai/dsh-baf-core'

/** Optional dsh default when profile/enterprise defaults are unusable. */
export interface ResolveRouteOptions {
  /** Catalog default from agent-default-model / composition. */
  readonly dshDefault?: ModelRef
}

type CandidateFailure =
  | { kind: 'not-allowed' }
  | { kind: 'incompatible'; gap: string }
  | { kind: 'unavailable' }

/**
 * Whether an allowed entry satisfies required capability tags and optional
 * long-context length.
 * @param entry - enterprise allowed row.
 * @param required - phase-required tags.
 * @param availability - live catalog probe.
 * @returns failure reason, or undefined when ok.
 */
function capabilityGap(
  entry: AllowedModel,
  required: readonly RouteCapability[],
  availability: ProviderAvailability,
): string | undefined {
  const missing = required.filter(cap => !entry.capabilities.includes(cap))
  if (missing.length > 0) return `missing capabilities: ${missing.join(',')}`
  if (required.includes('long-context') && availability.contextLength !== undefined) {
    const length = availability.contextLength(entry.provider, entry.model)
    if (length !== undefined && length < LONG_CONTEXT_MIN_TOKENS) {
      return `contextLength ${length} < ${LONG_CONTEXT_MIN_TOKENS}`
    }
  }
  return undefined
}

/**
 * Evaluate one candidate against allowed membership, capabilities, and availability.
 * @param ref - candidate route.
 * @param enterpriseAllowed - enterprise allowed map.
 * @param required - phase capabilities.
 * @param availability - live probe.
 * @returns failure or the allowed entry.
 */
function evaluateCandidate(
  ref: ModelRef,
  enterpriseAllowed: ReadonlyMap<string, AllowedModel>,
  required: readonly RouteCapability[],
  availability: ProviderAvailability,
): { ok: true; entry: AllowedModel } | { ok: false; failure: CandidateFailure } {
  const entry = enterpriseAllowed.get(modelKey(ref))
  if (entry === undefined) return { ok: false, failure: { kind: 'not-allowed' } }
  const gap = capabilityGap(entry, required, availability)
  if (gap !== undefined) return { ok: false, failure: { kind: 'incompatible', gap } }
  if (!availability.isAvailable(entry.provider, entry.model)) {
    return { ok: false, failure: { kind: 'unavailable' } }
  }
  return { ok: true, entry }
}

/**
 * Pick the preferred route and its source before availability/capability checks.
 * Higher layers only tighten: every pick must already sit in enterprise.allowed.
 * @param enterprise - frozen enterprise policy.
 * @param profile - frozen baseline route profile.
 * @param phase - workflow node requesting a model turn.
 * @param sessionOverride - optional user/session selection.
 * @param dshDefault - optional catalog default.
 * @returns preferred ref + source.
 */
function pickPreferred(
  enterprise: EnterpriseRoutePolicy,
  profile: RouteProfile,
  phase: WorkflowNode,
  sessionOverride: ModelRef | undefined,
  dshDefault: ModelRef | undefined,
): { ref: ModelRef; source: RouteSource } {
  const allowed = new Map(enterprise.allowed.map(entry => [modelKey(entry), entry]))

  if (sessionOverride !== undefined) {
    if (!enterprise.allowSessionOverride) {
      throw new BafError('model_route_incompatible', 'session override disabled by enterprise policy', {
        provider: sessionOverride.provider,
        model: sessionOverride.model,
        phase,
        capabilityGap: 'allowSessionOverride=false',
      })
    }
    if (!allowed.has(modelKey(sessionOverride))) {
      throw new BafError('model_route_incompatible', 'session override is outside enterprise allowed', {
        provider: sessionOverride.provider,
        model: sessionOverride.model,
        phase,
        capabilityGap: 'not-in-enterprise-allowed',
      })
    }
    // Profile cannot widen: override must also be listed in profile.allowed when profile lists models.
    const profileKeys = new Set(profile.allowed.map(modelKey))
    if (profileKeys.size > 0 && !profileKeys.has(modelKey(sessionOverride))) {
      throw new BafError('model_route_incompatible', 'session override is outside route profile allowed', {
        provider: sessionOverride.provider,
        model: sessionOverride.model,
        phase,
        capabilityGap: 'not-in-route-profile-allowed',
      })
    }
    return { ref: sessionOverride, source: 'session-override' }
  }

  const phaseRoute = (profile.phases as Partial<Record<WorkflowNode, ModelRef>>)[phase]
  if (phaseRoute !== undefined && allowed.has(modelKey(phaseRoute))) {
    return { ref: phaseRoute, source: 'phase' }
  }
  if (allowed.has(modelKey(profile.default))) {
    return { ref: profile.default, source: 'route-profile' }
  }
  if (allowed.has(modelKey(enterprise.default))) {
    return { ref: enterprise.default, source: 'enterprise' }
  }
  if (dshDefault !== undefined && allowed.has(modelKey(dshDefault))) {
    return { ref: dshDefault, source: 'dsh-default' }
  }

  throw new BafError('model_route_unavailable', 'no preferred route inside enterprise allowed', {
    provider: enterprise.default.provider,
    model: enterprise.default.model,
    phase,
    source: 'enterprise',
  })
}

/**
 * Resolve the provider/model for one phase turn.
 * Order: enterprise ceiling → profile phase preference → session override
 * (when present) → dsh default; then approved-only fallback on failure.
 * @param enterprisePolicy - session-frozen enterprise ceiling.
 * @param profile - session-frozen baseline route profile.
 * @param phase - workflow node.
 * @param sessionOverride - optional selection (must stay inside allowed).
 * @param availability - dsh catalog probe.
 * @param options - optional dsh default.
 * @returns resolution with source and optional fallbackFrom.
 * @throws {BafError} model_route_* / model_fallback_blocked / policy_missing.
 */
export function resolveRoute(
  enterprisePolicy: EnterpriseRoutePolicy,
  profile: RouteProfile,
  phase: WorkflowNode,
  sessionOverride: ModelRef | undefined,
  availability: ProviderAvailability,
  options: ResolveRouteOptions = {},
): RouteResolution {
  if (enterprisePolicy.allowed.length === 0) {
    throw new BafError('policy_missing', 'enterprise route policy has empty allowed', {
      field: 'allowed',
      consumer: 'resolveRoute',
    })
  }

  // Profile must not widen enterprise: every profile.allowed entry outside
  // enterprise is ignored at resolve time; phase picks still require enterprise membership.
  const enterpriseAllowed = new Map(enterprisePolicy.allowed.map(entry => [modelKey(entry), entry]))
  for (const entry of profile.allowed) {
    if (!enterpriseAllowed.has(modelKey(entry))) {
      // Documented tighten-only rule: never throw here for extra profile rows;
      // they simply cannot be selected. Tests assert they are not chosen.
      continue
    }
  }

  const preferred = pickPreferred(
    enterprisePolicy,
    profile,
    phase,
    sessionOverride,
    options.dshDefault,
  )
  const required = PHASE_REQUIRED_CAPABILITIES[phase]
  const primary = evaluateCandidate(preferred.ref, enterpriseAllowed, required, availability)
  if (primary.ok) {
    return {
      provider: preferred.ref.provider,
      model: preferred.ref.model,
      source: preferred.source,
      phase,
    }
  }

  const preferredEntry = enterpriseAllowed.get(modelKey(preferred.ref))
  const groupId = preferredEntry?.fallbackGroup
  const members = groupId === undefined ? undefined : enterprisePolicy.fallbackPolicy.groups[groupId]
  if (members === undefined || members.length === 0) {
    throwFailure(primary.failure, preferred.ref, phase, preferred.source, groupId)
  }

  let lastFailure = primary.failure
  for (const member of members) {
    if (modelKey(member) === modelKey(preferred.ref)) continue
    // Fallback members must also remain inside profile.allowed when the profile lists them.
    const profileKeys = new Set(profile.allowed.map(modelKey))
    if (profileKeys.size > 0 && !profileKeys.has(modelKey(member))) {
      lastFailure = { kind: 'not-allowed' }
      continue
    }
    const result = evaluateCandidate(member, enterpriseAllowed, required, availability)
    if (result.ok) {
      const reason = failureReason(primary.failure)
      return {
        provider: member.provider,
        model: member.model,
        source: preferred.source,
        phase,
        fallbackFrom: {
          provider: preferred.ref.provider,
          model: preferred.ref.model,
          reason,
        },
      }
    }
    lastFailure = result.failure
  }

  throw new BafError('model_fallback_blocked', 'no approved compatible fallback available', {
    provider: preferred.ref.provider,
    model: preferred.ref.model,
    phase,
    ...groupId === undefined ? {} : { fallbackGroup: groupId },
    cause: failureReason(lastFailure),
  })
}

function failureReason(failure: CandidateFailure): string {
  switch (failure.kind) {
    case 'not-allowed':
      return 'not-allowed'
    case 'incompatible':
      return failure.gap
    case 'unavailable':
      return 'unavailable'
    default: {
      const _exhaustive: never = failure
      return String(_exhaustive)
    }
  }
}

function throwFailure(
  failure: CandidateFailure,
  ref: ModelRef,
  phase: WorkflowNode,
  source: RouteSource,
  fallbackGroup: string | undefined,
): never {
  switch (failure.kind) {
    case 'unavailable':
      throw new BafError('model_route_unavailable', 'preferred route is unavailable and has no fallback group', {
        provider: ref.provider,
        model: ref.model,
        phase,
        source,
        ...fallbackGroup === undefined ? {} : { fallbackGroup },
      })
    case 'incompatible':
      throw new BafError('model_route_incompatible', 'preferred route is incompatible and has no fallback group', {
        provider: ref.provider,
        model: ref.model,
        phase,
        capabilityGap: failure.gap,
      })
    case 'not-allowed':
      throw new BafError('model_route_incompatible', 'preferred route left enterprise allowed', {
        provider: ref.provider,
        model: ref.model,
        phase,
        capabilityGap: 'not-in-enterprise-allowed',
      })
    default: {
      const _exhaustive: never = failure
      throw _exhaustive
    }
  }
}
