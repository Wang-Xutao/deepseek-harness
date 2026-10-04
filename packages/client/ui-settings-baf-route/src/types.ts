/**
 * Wire vocabulary for the bafRouteConfig Remote and the 多模型路由 settings
 * section. Type-only re-exports from baf-core: browser consumers import these
 * without dragging the host package into the client bundle (type imports are
 * erased at build time).
 * @module @deepseek-ai/dsh-client-ui-settings-baf-route/types
 */

import type { RouteTier } from '@deepseek-ai/dsh-baf-core'

export type {
  RouteTier,
  RouteTierConfig,
  TierModelSpec,
  TierKeywordRule,
} from '@deepseek-ai/dsh-baf-core'

/** Folded save outcome; `error` carries a field summary for inline UI hints. */
export interface BafRouteConfigSaveResult {
  readonly ok: boolean
  readonly error?: string
}

/**
 * 多模型路由 M3 — the 预演 (dry-run) box outcome: which tier a task summary
 * would freeze to under the CURRENT config's keywords, and the word that hit.
 */
export interface BafRoutePreviewResult {
  readonly tier: RouteTier | null
  readonly matched?: string
}
