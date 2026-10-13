/**
 * Builtin keyword-preset vocabulary for the 多模型路由 settings section.
 *
 * 【变更】2026-10-05 (2.4 默认启用): the packs moved into baf-core — they are
 * ALWAYS in effect at dispatch (user rules layer on top), so the client no
 * longer owns the words or tiers; this file only carries the display-name ids
 * (`preset${Id}` locale keys). The words/tier a row shows come over the wire
 * from `bafRouteConfig/defaults`, keeping the bundle free of baf-core value
 * imports (purity gate).
 * @module @deepseek-ai/dsh-client-ui-settings-baf-route/client/presets
 */

/** One curated pack; the display name is the `preset${Id}` locale key. */
export type KeywordPresetId =
  | 'complexEngineering'
  | 'criticalRelease'
  | 'qualityAssurance'

/**
 * The builtin pack ids, escalation order (matches baf-core's
 * BUILTIN_KEYWORD_PRESETS). 【变更】2026-10-13 (worker 关键词批): the low-tier
 * `routineEdits` pack is gone — Worker is the fallback grade; its keywords
 * could never decide a turn. Version-skewed packs already seeded into a
 * user's `~/.dsh/baf-route-presets.json` still parse (raw-id render) but the
 * dead-tier filter drops them before evaluation or display.
 */
export const KEYWORD_PRESET_IDS: readonly KeywordPresetId[] = [
  'complexEngineering',
  'criticalRelease',
  'qualityAssurance',
]
