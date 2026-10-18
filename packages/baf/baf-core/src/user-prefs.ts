/**
 * Workspace user preferences layered over the enterprise baseline.
 *
 * A (user-editable) prefs live in `.baf/user-prefs.yml` and are git-shareable.
 * B (enterprise) owns `baseline.yml` values plus `userOverridePolicy`: only
 * keys the enterprise marks `true` may appear in the A settings surface and
 * may override the baseline at runtime. Rules-document body is never here.
 *
 * Frozen A catalog (plan recommended defaults): bugFixPath.allowed / maxScope,
 * coverage.minimum, projectionGitignore, verifyNotes, changeSlugPrefix.
 * @module @deepseek-ai/dsh-baf-core/user-prefs
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { dump as dumpYaml, load as loadYaml } from 'js-yaml'
import { z } from 'zod'
import type { BaselineManifest } from './baseline.ts'
import { BafError } from './errors.ts'
import {
  DEFAULT_USER_OVERRIDE_POLICY,
  OVERRIDABLE_PREF_IDS,
  type OverridablePrefId,
  type UserOverridePolicy,
} from './override-policy.ts'

export {
  DEFAULT_USER_OVERRIDE_POLICY,
  OVERRIDABLE_PREF_IDS,
  userOverridePolicySchema,
  type OverridablePrefId,
  type UserOverridePolicy,
} from './override-policy.ts'

/** Workspace-relative path for user prefs (git-shareable). */
export const USER_PREFS_RELATIVE_PATH = '.baf/user-prefs.yml'

const maxScopeSchema = z.enum(['single-file', 'small-local', 'cross-module', 'public-api'])

const userPrefsSchema = z.object({
  schema: z.literal(1),
  bugFixPath: z.object({
    allowed: z.boolean().optional(),
    maxScope: maxScopeSchema.optional(),
  }).optional(),
  coverage: z.object({
    minimum: z.union([z.number().min(0).max(100), z.string().min(1)]).optional(),
  }).optional(),
  projectionGitignore: z.boolean().optional(),
  verifyNotes: z.string().optional(),
  changeSlugPrefix: z.string().min(1).max(32).regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
})

/** Parsed `.baf/user-prefs.yml` document. */
export type UserPrefs = z.infer<typeof userPrefsSchema>

/** Empty prefs document (scaffold / first save). */
export const EMPTY_USER_PREFS: UserPrefs = { schema: 1 }

/**
 * Resolve the effective override policy for a baseline (default when absent).
 * @param manifest - baseline that may omit `userOverridePolicy`.
 * @returns complete policy map.
 */
export function resolveUserOverridePolicy(
  manifest: BaselineManifest,
): UserOverridePolicy {
  return manifest.userOverridePolicy ?? DEFAULT_USER_OVERRIDE_POLICY
}

/**
 * Pref ids the enterprise currently allows into the A settings surface.
 * @param policy - resolved override policy.
 * @returns ordered list of editable ids.
 */
export function editablePrefIds(policy: UserOverridePolicy): readonly OverridablePrefId[] {
  return OVERRIDABLE_PREF_IDS.filter(id => policy[id])
}

/**
 * Parse a user-prefs YAML/JSON document.
 * @param raw - loaded YAML value.
 * @param path - optional path for errors.
 * @returns validated prefs.
 */
export function parseUserPrefs(raw: unknown, path?: string): UserPrefs {
  const parsed = userPrefsSchema.safeParse(raw)
  if (!parsed.success) {
    throw new BafError('baseline_unavailable', 'user-prefs failed schema validation', {
      ...path === undefined ? {} : { path },
      cause: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    })
  }
  return parsed.data
}

/**
 * Load `.baf/user-prefs.yml` when present; missing file → empty prefs.
 * @param workspaceRoot - absolute workspace root.
 * @returns prefs (never throws on ENOENT).
 */
export async function loadUserPrefsFile(workspaceRoot: string): Promise<UserPrefs> {
  const path = join(workspaceRoot, USER_PREFS_RELATIVE_PATH)
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return EMPTY_USER_PREFS
  }
  let raw: unknown
  try {
    raw = loadYaml(text)
  } catch (error) {
    throw new BafError('baseline_unavailable', `user-prefs YAML parse failed at ${path}`, {
      path,
      cause: error instanceof Error ? error.message : String(error),
    })
  }
  if (raw === undefined || raw === null) return EMPTY_USER_PREFS
  return parseUserPrefs(raw, path)
}

/**
 * Atomically write user prefs (mkdir `.baf` as needed).
 * @param workspaceRoot - absolute workspace root.
 * @param prefs - document to persist.
 */
export async function writeUserPrefsFile(
  workspaceRoot: string,
  prefs: UserPrefs,
): Promise<void> {
  const path = join(workspaceRoot, USER_PREFS_RELATIVE_PATH)
  const validated = parseUserPrefs(prefs, path)
  await mkdir(dirname(path), { recursive: true })
  const body = dumpYaml(validated, { lineWidth: 100, noRefs: true, sortKeys: false })
  await writeFile(path, body.endsWith('\n') ? body : `${body}\n`, 'utf8')
}

/**
 * Apply allowed user overrides onto a baseline copy.
 * Disallowed keys in prefs are ignored (enterprise wins; no error).
 * @param manifest - enterprise baseline.
 * @param prefs - workspace user prefs.
 * @param policy - which keys may override (defaults from manifest).
 * @returns new manifest with overrides applied (input unchanged).
 */
export function applyUserPrefsToBaseline(
  manifest: BaselineManifest,
  prefs: UserPrefs,
  policy: UserOverridePolicy = resolveUserOverridePolicy(manifest),
): BaselineManifest {
  const next: BaselineManifest = {
    ...manifest,
    workflow: {
      ...manifest.workflow,
      bugFixPath: { ...manifest.workflow.bugFixPath },
    },
    stack: {
      ...manifest.stack,
      coverage: { ...manifest.stack.coverage },
    },
  }
  if (policy.bugFixPathAllowed && prefs.bugFixPath?.allowed !== undefined) {
    next.workflow.bugFixPath.allowed = prefs.bugFixPath.allowed
  }
  if (policy.bugFixPathMaxScope && prefs.bugFixPath?.maxScope !== undefined) {
    next.workflow.bugFixPath.maxScope = prefs.bugFixPath.maxScope
  }
  if (policy.coverageMinimum && prefs.coverage?.minimum !== undefined) {
    next.stack.coverage.minimum = prefs.coverage.minimum
  }
  return next
}

/** Extra (non-baseline) prefs after policy filter — for UI / scaffold helpers. */
export interface EffectiveExtraPrefs {
  readonly projectionGitignore?: boolean
  readonly verifyNotes?: string
  readonly changeSlugPrefix?: string
}

/**
 * Extra prefs visible/effective only when the enterprise allows them.
 * @param prefs - raw user prefs file.
 * @param policy - override policy.
 * @returns filtered extras (undefined fields omitted when not allowed or unset).
 */
export function effectiveExtraPrefs(
  prefs: UserPrefs,
  policy: UserOverridePolicy,
): EffectiveExtraPrefs {
  const out: {
    projectionGitignore?: boolean
    verifyNotes?: string
    changeSlugPrefix?: string
  } = {}
  if (policy.projectionGitignore && prefs.projectionGitignore !== undefined) {
    out.projectionGitignore = prefs.projectionGitignore
  }
  if (policy.verifyNotes && prefs.verifyNotes !== undefined && prefs.verifyNotes.trim() !== '') {
    out.verifyNotes = prefs.verifyNotes
  }
  if (policy.changeSlugPrefix && prefs.changeSlugPrefix !== undefined) {
    out.changeSlugPrefix = prefs.changeSlugPrefix
  }
  return out
}

/**
 * Load baseline + user prefs and return the effective baseline for runtime.
 * @param workspaceRoot - absolute workspace root.
 * @param loadBaseline - baseline loader (injected for tests).
 * @returns effective manifest + extras + policy + raw prefs.
 */
export async function loadEffectiveWorkspacePolicy(
  workspaceRoot: string,
  loadBaseline: (path: string) => Promise<BaselineManifest>,
): Promise<{
  readonly baseline: BaselineManifest
  readonly effective: BaselineManifest
  readonly prefs: UserPrefs
  readonly policy: UserOverridePolicy
  readonly extras: EffectiveExtraPrefs
  readonly editable: readonly OverridablePrefId[]
}> {
  const baseline = await loadBaseline(join(workspaceRoot, '.baf', 'baseline.yml'))
  const prefs = await loadUserPrefsFile(workspaceRoot)
  const policy = resolveUserOverridePolicy(baseline)
  const effective = applyUserPrefsToBaseline(baseline, prefs, policy)
  return {
    baseline,
    effective,
    prefs,
    policy,
    extras: effectiveExtraPrefs(prefs, policy),
    editable: editablePrefIds(policy),
  }
}

/** YAML snippet for scaffold / docs (product default override policy). */
export function userOverridePolicyYaml(): string {
  return `userOverridePolicy:
  # 为 true 时，该开关会出现在设置→工作流「用户可调偏好」并可写入 .baf/user-prefs.yml
  bugFixPathAllowed: true
  bugFixPathMaxScope: true
  coverageMinimum: true
  projectionGitignore: true
  verifyNotes: true
  changeSlugPrefix: true
`
}

/** Default user-prefs file body for scaffold. */
export function defaultUserPrefsYaml(): string {
  return `# BAF workspace user preferences (git-shareable).
# Only keys whose userOverridePolicy.<id> is true in .baf/baseline.yml take effect.
# Rules document body is NEVER edited here — see .baf/standards/.
schema: 1
# bugFixPath:
#   allowed: true
#   maxScope: small-local
# coverage:
#   minimum: 80
# projectionGitignore: true
# verifyNotes: ""
# changeSlugPrefix: feat
`
}
