/**
 * Enterprise `userOverridePolicy` vocabulary (shared by baseline schema and
 * user-prefs merge). Kept in its own module so baseline ↔ user-prefs do not
 * form a runtime import cycle.
 * @module @deepseek-ai/dsh-baf-core/override-policy
 */

import { z } from 'zod'

/** Stable ids for every preference that MAY be user-overridable. */
export const OVERRIDABLE_PREF_IDS = [
  'bugFixPathAllowed',
  'bugFixPathMaxScope',
  'coverageMinimum',
  'projectionGitignore',
  'verifyNotes',
  'changeSlugPrefix',
] as const

/** One overridable preference id. */
export type OverridablePrefId = (typeof OVERRIDABLE_PREF_IDS)[number]

/** Enterprise map: which prefs the workspace may customize in UI (A). */
export const userOverridePolicySchema = z.object({
  bugFixPathAllowed: z.boolean(),
  bugFixPathMaxScope: z.boolean(),
  coverageMinimum: z.boolean(),
  projectionGitignore: z.boolean(),
  verifyNotes: z.boolean(),
  changeSlugPrefix: z.boolean(),
})

/** Parsed override policy. */
export type UserOverridePolicy = z.infer<typeof userOverridePolicySchema>

/**
 * Product default: plan recommended ✓ set (W1/W2/S2/N1/N2/N3).
 * Missing `userOverridePolicy` in an older baseline resolves to this.
 */
export const DEFAULT_USER_OVERRIDE_POLICY: UserOverridePolicy = {
  bugFixPathAllowed: true,
  bugFixPathMaxScope: true,
  coverageMinimum: true,
  projectionGitignore: true,
  verifyNotes: true,
  changeSlugPrefix: true,
}
