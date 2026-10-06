/**
 * Wire vocabulary for the bafStandardConfig Remote and the BAF 工程规范
 * settings overview (2026-10-06 问题 6 客户决策: 规范总览·只读). The Host owns
 * every baseline readout; the browser face owns locale, package one-liners,
 * and the static scaffold card — no baseline value is duplicated client-side.
 * @module @deepseek-ai/dsh-client-ui-settings-baf-standard/types
 */

/** Per-field readout state: 生效, or 企业待定 (placeholder still in place). */
export type BafStandardFieldState = 'ok' | 'tbd'

/** One baseline field row: the YAML path, its current value, and the state. */
export interface BafStandardFieldRow {
  /** Baseline YAML path, exactly as written in `.baf/baseline.yml`. */
  readonly field: string
  /** Rendered value: booleans as true/false, lists comma-joined. */
  readonly value: string
  readonly state: BafStandardFieldState
}

/** Card ids the Host projects; the scaffold card is client-static. */
export type BafStandardCardId = 'workflow' | 'route' | 'openspec' | 'standard' | 'quality' | 'guard'

/** One plugin package's baseline readout. */
export interface BafStandardPackageCard {
  readonly id: BafStandardCardId
  readonly fields: readonly BafStandardFieldRow[]
}

/** Availability mirrors baf-standard's own vocabulary. */
export type BafStandardAvailability = 'ready' | 'policy_missing'

/**
 * 【变更】2026-10-07 (九点批 问题 8): one rule area of the standards source —
 * id + locale title key + the ANCHORED sourceRef (`ref#anchor`) so the client
 * can point each of the 8 domains at the exact section it governs. Pure
 * projection of `summarizeStandard().areas`; no content rides the wire (the
 * client slices the rules document it already receives via `rulesDoc`).
 */
export interface BafStandardAreaRow {
  /** Stable area id (matches the `## <anchor>` heading in the rules doc). */
  readonly id: string
  /** Locale key (`baf.standard.area.<id>`), rendered by the client. */
  readonly titleKey: string
  /** Anchored pointer: `<rulesRef>#<anchor>` (raw placeholder when missing). */
  readonly sourceRef: string
}

/** `summary()` outcome — every non-ready status carries its own empty state. */
export interface BafStandardSummaryResult {
  readonly status: 'ready' | 'no-workspace' | 'no-baseline' | 'failed'
  readonly cwd?: string
  readonly baselinePath?: string
  readonly baselineId?: string
  readonly compatibility?: { readonly min: string; readonly max: string }
  readonly standardSourceRef?: string
  readonly standardAvailability?: BafStandardAvailability
  /** 【变更】2026-10-07 (九点批 问题 8): the 8 rule areas, anchored. */
  readonly standardAreas?: readonly BafStandardAreaRow[]
  readonly cards?: readonly BafStandardPackageCard[]
  /** Technical one-liner for `failed` only; never shown for the empty states. */
  readonly error?: string
}

/** `rulesDoc()` outcome — the rules document viewer's payload. */
export interface BafStandardRulesDocResult {
  readonly status: 'ready' | 'unavailable' | 'unreadable'
  /** Absolute path the content came from (ready / unreadable). */
  readonly path?: string
  readonly content?: string
  /** Why it is unavailable/unreadable (`no-workspace` / `policy_missing` / IO). */
  readonly reason?: string
}
