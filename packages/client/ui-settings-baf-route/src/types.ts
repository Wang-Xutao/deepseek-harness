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
  WorkflowNode,
} from '@deepseek-ai/dsh-baf-core'

/** Folded save outcome; `error` carries a field summary for inline UI hints. */
export interface BafRouteConfigSaveResult {
  readonly ok: boolean
  readonly error?: string
}

/**
 * 多模型路由 M3 — the 预演 (dry-run) box outcome: which tier a task summary
 * would freeze to under the CURRENT config's keywords, and the word that hit.
 * 【变更】2026-10-05 (auto 批): `escalated` marks the M4 verify-retry floor
 * raising an otherwise-lower verdict to mid.
 */
export interface BafRoutePreviewResult {
  readonly tier: RouteTier | null
  readonly matched?: string
  readonly escalated?: boolean
  /** Model the matched (or escalated) tier would dispatch to. */
  readonly provider?: string
  readonly model?: string
}

/**
 * 多模型路由 auto 批 (2026-10-05) — 预演 options: `verifyRetry` simulates the
 * M4 verify-failed retry floor (a below-mid verdict runs at mid).
 */
export interface BafRoutePreviewOptions {
  readonly verifyRetry?: boolean
}

/**
 * 多模型路由 M3 — built-in starting values for a fresh settings draft. The
 * client bundle cannot value-import baf-core (purity gate), so the Host hands
 * the default phase→tier map over the wire; the settings row never duplicates
 * it. 2.4 adds `presets`: the always-on builtin keyword packs, shipped for the
 * read-only preset block (they match at dispatch regardless of what the UI
 * shows — the display explains, it does not toggle).
 */
export interface BafRouteConfigDefaults {
  readonly phaseTier: Readonly<Record<string, RouteTier>>
  readonly presets: readonly { readonly id: string; readonly tier: RouteTier; readonly words: string }[]
  /** Fresh-draft grade count (product default: two). */
  readonly tierMode: 'two' | 'three'
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * The route-tier config changed (save or reset, from any surface).
     * Clients re-read `get`.
     * @mode emit
     */
    'baf-route-config/changed'(): void
  }
}
