/**
 * Enterprise route policy vocabulary, phase capability requirements, and
 * status views shared by the BAF route resolver and read surfaces.
 * @module @deepseek-ai/dsh-baf-core/route-policy
 */

import { readFile } from 'node:fs/promises'
import { load as loadYaml } from 'js-yaml'
import { z } from 'zod'
import type { BaselineManifest } from './baseline.ts'
import { BafError } from './errors.ts'
import type { WorkflowNode } from './workflow.ts'

/** Provider + model pair. */
export interface ModelRef {
  readonly provider: string
  readonly model: string
}

/** Capability tags frozen in route-profile.schema.json. */
export const ROUTE_CAPABILITIES = [
  'reasoning',
  'coding',
  'structured-output',
  'long-context',
  'tool-use',
  'low-latency',
] as const

/** One route capability tag. */
export type RouteCapability = (typeof ROUTE_CAPABILITIES)[number]

/** One allowed model entry with capabilities and fallback group id. */
export interface AllowedModel extends ModelRef {
  readonly capabilities: readonly RouteCapability[]
  readonly fallbackGroup: string
}

/** Baseline-embedded route profile (preference layer under enterprise policy). */
export type RouteProfile = BaselineManifest['routeProfile']

/**
 * Independent enterprise route ceiling (session-create freeze).
 * Loaded from deployment config path — never from baseline alone
 * (see overlay/docs/baf/route-notes.md).
 */
export interface EnterpriseRoutePolicy {
  readonly schema: 1
  readonly policyId: string
  readonly version: string
  /** When false, session overrides are rejected even if the model is allowed. */
  readonly allowSessionOverride: boolean
  readonly default: ModelRef
  readonly allowed: readonly AllowedModel[]
  readonly fallbackPolicy: {
    readonly mode: 'approved-only'
    readonly groups: Readonly<Record<string, readonly ModelRef[]>>
  }
}

/** Where the chosen provider/model came from in the resolver chain. */
export type RouteSource =
  | 'enterprise'
  | 'route-profile'
  | 'phase'
  | 'session-override'
  | 'dsh-default'

/** Successful resolveRoute result. */
export interface RouteResolution {
  readonly provider: string
  readonly model: string
  readonly source: RouteSource
  readonly phase: WorkflowNode
  readonly fallbackFrom?: {
    readonly provider: string
    readonly model: string
    readonly reason: string
  }
}

/** Availability probe supplied by dsh llm catalog (Phase 3 stubs allowed). */
export interface ProviderAvailability {
  /**
   * Whether the provider/model can accept a request now.
   * @param provider - registered provider id.
   * @param model - provider-owned model id.
   */
  isAvailable(provider: string, model: string): boolean
  /**
   * Optional max context length for compatibility checks.
   * @param provider - registered provider id.
   * @param model - provider-owned model id.
   */
  contextLength?(provider: string, model: string): number | undefined
}

/** Minimum context length required for long-context phases (tokens). */
export const LONG_CONTEXT_MIN_TOKENS = 32_000

/**
 * Required capability tags per go-workflow phase (§6.3).
 * `drift` reuses open-phase light requirements for recovery turns.
 */
export const PHASE_REQUIRED_CAPABILITIES: Readonly<Record<WorkflowNode, readonly RouteCapability[]>> = {
  intake: ['low-latency', 'tool-use'],
  open: ['low-latency', 'tool-use'],
  clarify: ['long-context'],
  design: ['reasoning', 'long-context'],
  plan: ['reasoning', 'structured-output'],
  implement: ['coding', 'tool-use'],
  verify: ['structured-output'],
  archive: ['low-latency'],
  drift: ['low-latency', 'tool-use'],
}

/** One phase's preferred vs actual route for status UIs. */
export interface PhaseRouteStatus {
  readonly preferred: ModelRef
  readonly actual?: ModelRef
  readonly source?: RouteSource
  readonly fallbackActive: boolean
}

/**
 * Read model for settings / Tab / `baf status` (Phase 3.4).
 */
export interface RouteStatusView {
  readonly policyId: string
  readonly policyVersion: string
  readonly profileDefault: ModelRef
  readonly enterpriseDefault: ModelRef
  readonly allowSessionOverride: boolean
  readonly phases: Readonly<Partial<Record<WorkflowNode, PhaseRouteStatus>>>
  readonly fallbackMode: 'approved-only'
}

const modelRefSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
})

const capabilitySchema = z.enum(ROUTE_CAPABILITIES)

const allowedModelSchema = modelRefSchema.extend({
  capabilities: z.array(capabilitySchema),
  fallbackGroup: z.string().min(1),
})

/** Zod schema for {@link EnterpriseRoutePolicy}. */
export const enterpriseRoutePolicySchema = z.object({
  schema: z.literal(1),
  policyId: z.string().min(1),
  version: z.string().min(1),
  allowSessionOverride: z.boolean(),
  default: modelRefSchema,
  allowed: z.array(allowedModelSchema).min(1),
  fallbackPolicy: z.object({
    mode: z.literal('approved-only'),
    groups: z.record(z.string(), z.array(modelRefSchema)),
  }),
})

/**
 * Stable map key for a provider/model pair.
 * @param ref - model reference.
 * @returns `provider::model`.
 */
export function modelKey(ref: ModelRef): string {
  return `${ref.provider}::${ref.model}`
}

/**
 * Semantic checks: default and fallback members must be in allowed.
 * @param policy - structurally valid policy.
 * @throws {BafError} policy_missing when groups or membership fail.
 */
export function assertEnterpriseRoutePolicySemantics(policy: EnterpriseRoutePolicy): void {
  const allowed = new Map(policy.allowed.map(entry => [modelKey(entry), entry]))
  if (!allowed.has(modelKey(policy.default))) {
    throw new BafError('policy_missing', 'enterprise default is not in allowed', {
      field: 'default',
      consumer: 'EnterpriseRoutePolicy',
    })
  }
  for (const entry of policy.allowed) {
    const members = policy.fallbackPolicy.groups[entry.fallbackGroup]
    if (members === undefined) {
      throw new BafError('policy_missing', `fallback group "${entry.fallbackGroup}" is missing`, {
        field: `fallbackPolicy.groups.${entry.fallbackGroup}`,
        consumer: 'EnterpriseRoutePolicy',
      })
    }
    for (const member of members) {
      if (!allowed.has(modelKey(member))) {
        throw new BafError('policy_missing', 'fallback member not in enterprise allowed', {
          field: `fallbackPolicy.groups.${entry.fallbackGroup}`,
          consumer: 'EnterpriseRoutePolicy',
        })
      }
    }
  }
}

/**
 * Parse unknown YAML/JSON into an {@link EnterpriseRoutePolicy}.
 * @param raw - parsed document.
 * @param path - optional source path for error details.
 * @returns validated policy.
 */
export function parseEnterpriseRoutePolicy(raw: unknown, path?: string): EnterpriseRoutePolicy {
  const parsed = enterpriseRoutePolicySchema.safeParse(raw)
  if (!parsed.success) {
    throw new BafError('policy_missing', 'enterprise route policy failed schema validation', {
      field: 'EnterpriseRoutePolicy',
      consumer: 'parseEnterpriseRoutePolicy',
      ...path === undefined ? {} : { path },
      cause: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    })
  }
  assertEnterpriseRoutePolicySemantics(parsed.data)
  return parsed.data
}

/**
 * Load an enterprise route policy YAML file.
 * @param path - filesystem path from deployment config.
 * @returns validated policy.
 */
export async function loadEnterpriseRoutePolicyFile(path: string): Promise<EnterpriseRoutePolicy> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    throw new BafError('policy_missing', `enterprise route policy unreadable at ${path}`, {
      field: 'enterpriseRoutePolicyPath',
      consumer: 'loadEnterpriseRoutePolicyFile',
      path,
      cause: error instanceof Error ? error.message : String(error),
    })
  }
  let raw: unknown
  try {
    raw = loadYaml(text)
  } catch (error) {
    throw new BafError('policy_missing', `enterprise route policy YAML parse failed at ${path}`, {
      field: 'enterpriseRoutePolicyPath',
      consumer: 'loadEnterpriseRoutePolicyFile',
      path,
      cause: error instanceof Error ? error.message : String(error),
    })
  }
  return parseEnterpriseRoutePolicy(raw, path)
}

/**
 * Build a {@link RouteStatusView} from frozen policy + profile (+ optional last resolutions).
 * @param policy - enterprise ceiling.
 * @param profile - baseline route profile.
 * @param actualByPhase - last successful resolution per phase, if any.
 * @returns status view for UI/CLI.
 */
export function buildRouteStatusView(
  policy: EnterpriseRoutePolicy,
  profile: RouteProfile,
  actualByPhase: Readonly<Partial<Record<WorkflowNode, RouteResolution>>> = {},
): RouteStatusView {
  const phases: Partial<Record<WorkflowNode, PhaseRouteStatus>> = {}
  for (const [phase, preferred] of Object.entries(profile.phases) as [WorkflowNode, ModelRef][]) {
    const actual = actualByPhase[phase]
    phases[phase] = {
      preferred,
      ...actual === undefined
        ? {}
        : {
          actual: { provider: actual.provider, model: actual.model },
          source: actual.source,
        },
      fallbackActive: actual?.fallbackFrom !== undefined,
    }
  }
  return {
    policyId: policy.policyId,
    policyVersion: policy.version,
    profileDefault: profile.default,
    enterpriseDefault: policy.default,
    allowSessionOverride: policy.allowSessionOverride,
    phases,
    fallbackMode: 'approved-only',
  }
}
