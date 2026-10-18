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

/** One enterprise-pack presence / blockers readout (方案乙). */
export interface BafEnterpriseStandardsStatus {
  /** Packs whose marker files are present (`c` / `commitlint` / …). */
  readonly appliedPacks: readonly string[]
  /** Error-severity blocker count from collectStatusBlockers. */
  readonly blockerErrors: number
  /** Warning/info blocker count. */
  readonly blockerWarnings: number
  /** Short lines for the settings card (`id: message`). */
  readonly blockerLines: readonly string[]
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
  /** 方案乙: enterprise asset pack presence + machine-readable blockers. */
  readonly enterpriseStandards?: BafEnterpriseStandardsStatus
  /**
   * 【变更】2026-10-18 (项目工程 1.3): the raw AI 禁改路径 list (baseline
   * `guard.protectedPaths`, verbatim including the enterprise placeholder) so
   * the 项目工程 tab can render the editable list, plus whether the managed
   * pre-commit commit 防线 is currently installed in this workspace.
   */
  readonly guardProtectedPaths?: readonly string[]
  readonly commitGuardHookInstalled?: boolean
  /**
   * 【变更】2026-10-19 (六问题批 4.1b): the per-node custom-script map
   * (baseline `hooks.nodes.<node>.enter/exit`) for the 项目工程 状态脚本
   * editor. Only configured nodes ride the wire; absent block = `{}`.
   */
  readonly nodeHooks?: BafStandardNodeHooks
  /** Technical one-liner for `failed` only; never shown for the empty states. */
  readonly error?: string
}

/** One node's script lists on the wire (六问题批 4.1b). */
export interface BafStandardNodeHookLists {
  readonly enter?: readonly string[]
  readonly exit?: readonly string[]
}

/** node id → hook lists; only configured nodes present. */
export type BafStandardNodeHooks = Readonly<Record<string, BafStandardNodeHookLists>>

/** `saveNodeHooks()` outcome — the 状态脚本 editor's save. */
export interface BafStandardSaveNodeHooksResult {
  readonly status: 'ready' | 'no-workspace' | 'no-baseline' | 'invalid' | 'error'
  /** The normalized map actually persisted (ready only). */
  readonly hooks?: BafStandardNodeHooks
  /** Customer-readable problem line (invalid / error). */
  readonly message?: string
}

/**
 * `generateBaseline()` outcome — the 项目工程 empty state's 生成配置文件
 * button runs the same scaffold `/baf` uses (button click IS the human
 * confirmation).
 */
export interface BafStandardGenerateResult {
  readonly status: 'ready' | 'no-workspace' | 'error'
  /** How many files the scaffold created (ready only). */
  readonly createdCount?: number
  /** Best-effort Git anchor one-liner (ready only). */
  readonly gitNote?: string
  /** Customer-readable problem line (error). */
  readonly message?: string
}

/** `saveProtectedPaths()` outcome — the editable AI 禁改路径 list's save. */
export interface BafStandardSaveProtectedResult {
  readonly status: 'ready' | 'no-workspace' | 'no-baseline' | 'invalid' | 'error'
  /** The normalized list actually persisted (ready only). */
  readonly paths?: readonly string[]
  /** Whether the commit 防线 hook ended up installed (ready only). */
  readonly hookInstalled?: boolean
  /** Customer-readable problem line (invalid / error, or a hook warning). */
  readonly message?: string
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
