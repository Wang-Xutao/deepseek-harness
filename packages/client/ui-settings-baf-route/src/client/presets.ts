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
  | 'routineEdits'

/** The builtin pack ids, escalation order (matches baf-core's BUILTIN_KEYWORD_PRESETS). */
export const KEYWORD_PRESET_IDS: readonly KeywordPresetId[] = [
  'complexEngineering',
  'criticalRelease',
  'qualityAssurance',
  'routineEdits',
]
