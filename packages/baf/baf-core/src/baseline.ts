/**
 * Baseline manifest zod schema, parse, and compatibility validation.
 * @module @deepseek-ai/dsh-baf-core/baseline
 */

import { readFile } from 'node:fs/promises'
import { load as loadYaml } from 'js-yaml'
import { z } from 'zod'
import { BAF_VERSION, isBafVersionCompatible } from './compatibility.ts'
import { BafError } from './errors.ts'

const modelRefSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
})

const capabilitySchema = z.enum([
  'reasoning',
  'coding',
  'structured-output',
  'long-context',
  'tool-use',
  'low-latency',
])

const allowedModelSchema = modelRefSchema.extend({
  capabilities: z.array(capabilitySchema),
  fallbackGroup: z.string().min(1),
})

const phaseRouteSchema = modelRefSchema

const routeProfileSchema = z.object({
  default: modelRefSchema,
  allowed: z.array(allowedModelSchema).min(1),
  phases: z.object({
    intake: phaseRouteSchema,
    open: phaseRouteSchema,
    clarify: phaseRouteSchema,
    design: phaseRouteSchema,
    plan: phaseRouteSchema,
    implement: phaseRouteSchema,
    verify: phaseRouteSchema,
    archive: phaseRouteSchema,
  }),
  fallbackPolicy: z.object({
    mode: z.literal('approved-only'),
    groups: z.record(z.string(), z.array(modelRefSchema)),
  }),
})

const maxScopeSchema = z.enum(['single-file', 'small-local', 'cross-module', 'public-api'])

/** Zod schema matching Phase 0 baseline.schema.yaml. */
export const baselineManifestSchema = z.object({
  schema: z.literal(1),
  baselineId: z.string().min(1).regex(/^[a-z0-9][a-z0-9.-]*$/),
  bafCompatibility: z.object({
    min: z.string().min(1),
    max: z.string().min(1),
  }),
  workflow: z.object({
    default: z.literal('go'),
    requireOpenSpec: z.boolean(),
    bugFixPath: z.object({
      allowed: z.boolean(),
      maxScope: maxScopeSchema,
      requireRegressionTest: z.boolean(),
    }),
  }),
  routeProfile: routeProfileSchema,
  openspec: z.object({
    cli: z.string().min(1),
    version: z.string().min(1),
    root: z.string().min(1),
    changeRoot: z.string().min(1),
    validate: z.object({
      args: z.array(z.string()),
    }),
  }),
  standard: z.object({
    mattPocockRulesRef: z.string().min(1),
  }),
  stack: z.object({
    language: z.literal('c'),
    compiler: z.string().min(1),
    build: z.string().min(1),
    test: z.string().min(1),
    coverage: z.object({
      required: z.boolean(),
      minimum: z.union([z.number().min(0).max(100), z.string().min(1)]),
    }),
    analyzers: z.array(z.string().min(1)),
  }),
  guard: z.object({
    secretScan: z.enum(['required', 'optional', 'off']),
    protectedPaths: z.array(z.string().min(1)),
    requireHumanConfirmation: z.array(z.enum(['scaffold', 'archive', 'abandon'])),
  }),
})

/** Parsed and validated baseline manifest. */
export type BaselineManifest = z.infer<typeof baselineManifestSchema>

function modelKey(ref: { provider: string; model: string }): string {
  return `${ref.provider}::${ref.model}`
}

/**
 * Semantic checks beyond zod shape: allowed-list membership, fallback groups,
 * and BAF version compatibility.
 * @param manifest - structurally valid baseline.
 * @param bafVersion - running BAF version.
 * @throws {BafError} baseline_incompatible or baseline_unavailable.
 */
export function assertBaselineSemantics(manifest: BaselineManifest, bafVersion: string = BAF_VERSION): void {
  const { min, max } = manifest.bafCompatibility
  if (!isBafVersionCompatible(bafVersion, min, max)) {
    throw new BafError('baseline_incompatible', `baseline ${manifest.baselineId} is incompatible with BAF ${bafVersion}`, {
      baselineId: manifest.baselineId,
      bafVersion,
      min,
      max,
    })
  }

  const allowed = new Map(manifest.routeProfile.allowed.map(entry => [modelKey(entry), entry]))
  const requireAllowed = (label: string, ref: { provider: string; model: string }): void => {
    if (!allowed.has(modelKey(ref))) {
      throw new BafError('baseline_unavailable', `${label} route is not in routeProfile.allowed`, {
        baselineId: manifest.baselineId,
        cause: `${label} ${ref.provider}/${ref.model} missing from allowed`,
      })
    }
  }

  requireAllowed('default', manifest.routeProfile.default)
  for (const [phase, ref] of Object.entries(manifest.routeProfile.phases)) {
    requireAllowed(`phases.${phase}`, ref)
  }

  const groups = manifest.routeProfile.fallbackPolicy.groups
  for (const entry of manifest.routeProfile.allowed) {
    const members = groups[entry.fallbackGroup]
    if (members === undefined) {
      throw new BafError('baseline_unavailable', `fallback group "${entry.fallbackGroup}" is missing`, {
        baselineId: manifest.baselineId,
        cause: `allowed entry ${entry.provider}/${entry.model} references missing group`,
      })
    }
    for (const member of members) {
      if (!allowed.has(modelKey(member))) {
        throw new BafError('baseline_unavailable', 'fallback member not in allowed', {
          baselineId: manifest.baselineId,
          cause: `group ${entry.fallbackGroup} member ${member.provider}/${member.model} not in allowed`,
        })
      }
    }
  }
}

/**
 * Parse unknown JSON/YAML data into a BaselineManifest.
 * @param raw - parsed YAML/JSON value.
 * @param bafVersion - running BAF version for compatibility.
 * @param path - optional source path for error details.
 * @returns validated manifest.
 * @throws {BafError} baseline_unavailable or baseline_incompatible.
 */
export function parseBaselineManifest(
  raw: unknown,
  bafVersion: string = BAF_VERSION,
  path?: string,
): BaselineManifest {
  const parsed = baselineManifestSchema.safeParse(raw)
  if (!parsed.success) {
    throw new BafError('baseline_unavailable', 'baseline failed schema validation', {
      ...path === undefined ? {} : { path },
      cause: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    })
  }
  assertBaselineSemantics(parsed.data, bafVersion)
  return parsed.data
}

/**
 * Load and validate a baseline YAML file from disk.
 * @param path - absolute or relative file path.
 * @param bafVersion - running BAF version.
 * @returns validated manifest.
 * @throws {BafError} baseline_unavailable or baseline_incompatible.
 */
export async function loadBaselineFile(path: string, bafVersion: string = BAF_VERSION): Promise<BaselineManifest> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    throw new BafError('baseline_unavailable', `baseline file unreadable at ${path}`, {
      path,
      cause: error instanceof Error ? error.message : String(error),
    })
  }
  let raw: unknown
  try {
    raw = loadYaml(text)
  } catch (error) {
    throw new BafError('baseline_unavailable', `baseline YAML parse failed at ${path}`, {
      path,
      cause: error instanceof Error ? error.message : String(error),
    })
  }
  return parseBaselineManifest(raw, bafVersion, path)
}
