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

/**
 * 【变更】2026-10-20 (批次三 4.4): `statWorkspacePath()` outcome — the 状态脚本
 * editor's add-time existence check. `exists` is false for anything not
 * expressible as a workspace-relative entry (absolute, `..` escape, empty).
 */
export interface BafStandardStatPathResult {
  /** Whether the entry resolves to something inside the workspace. */
  readonly exists: boolean
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

/**
 * 【变更】2026-10-21 (质量监控重构 1.3): `qualityEnvironment()` outcome — the
 * 质量监控 tab's 环境 card. One row per unit-test toolchain member with the
 * version the workspace actually answers (spawned `--version`, shell-resolved
 * so Windows gem/pip shims work), plus whether the workspace already carries
 * the quality pack assets (project.yml et al). `supported` is false when any
 * REQUIRED tool is missing or unknown.
 */
export interface BafQualityToolRow {
  /** Stable tool id (`gcc` / `ruby` / `ceedling` / …). */
  readonly key: string
  /** ok = version answered; missing = not runnable; unknown = probe timed out. */
  readonly state: 'ok' | 'missing' | 'unknown'
  /** The version the workspace answered (ok only). */
  readonly version?: string
  /** False for the 静态分析 members (cpplint/cppcheck) — shown, not gating. */
  readonly required: boolean
}

/** {@link BafQualityEnvironmentResult} — see the Remote's qualityEnvironment. */
export interface BafQualityEnvironmentResult {
  readonly status: 'ready' | 'no-workspace'
  readonly cwd?: string
  /** Probe rows in presentation order. */
  readonly tools: readonly BafQualityToolRow[]
  /** False when any required tool is missing/unknown. */
  readonly supported: boolean
  /** Whether the quality pack assets are already applied in the workspace. */
  readonly assetsInstalled: boolean
}

/** One 一键安装 step's outcome. */
export interface BafQualityInstallStep {
  /** Step id (`assets` / `ceedling` / `gcovr` / `cpplint`). */
  readonly id: string
  readonly ok: boolean
  /** Customer-readable one-liner (created counts, install output tail, hint). */
  readonly detail: string
}

/**
 * 【变更】2026-10-21 (质量监控重构 1.3): `installQualityToolchain()` outcome —
 * the 环境 card's 一键安装. Applies the quality pack assets into the
 * workspace, then installs the missing Ruby-gem / pip tools; prerequisites
 * that cannot be auto-installed (gcc / ruby / cppcheck) report a manual hint.
 */
export interface BafQualityInstallResult {
  readonly status: 'ready' | 'no-workspace' | 'error'
  readonly steps: readonly BafQualityInstallStep[]
  /** Customer-readable problem line (error only). */
  readonly message?: string
}

/**
 * 【变更】2026-10-21 (质量监控重构 1.4): `qualityConfiguration()` outcome — the
 * 质量监控 tab's 配置 card. Values read from the WORKSPACE's quality config
 * (`.baf/quality/config.json` / `.baf/quality/ceedling-config.json`, whichever
 * exists) with the shipped product defaults as the fallback, so the card
 * quotes what the workspace will actually run.
 */
export interface BafQualityConfigurationResult {
  readonly status: 'ready' | 'no-workspace'
  /** Where the values came from — the workspace file or the shipped defaults. */
  readonly source: 'workspace' | 'builtin'
  /** Unit-test source layout (`:paths.:test`, project.yml). */
  readonly testDir: string
  /** Build root (`:build_root`, project.yml). */
  readonly buildDir: string
  /** Directory of the HTML coverage report (dirname of report_html). */
  readonly reportDir: string
  /** Line-coverage threshold fraction (config.json threshold_line). */
  readonly thresholdLine: number
  /** Gate mode riding the threshold (config.json gate_mode). */
  readonly gateMode: string
  /** Workspace-relative HTML report path (the 测试报告 row's preview target). */
  readonly reportHtmlRel: string
  /** Whether the HTML report currently exists in the workspace. */
  readonly reportHtmlExists: boolean
}

/**
 * 【变更】2026-10-21 (质量监控重构 1.4): `readQualityReport()` outcome — the
 * 配置 card's 测试报告 modal payload (HTML only, per the customer decision).
 */
export type BafQualityReportResult =
  | { readonly status: 'ready'; readonly path: string; readonly content: string }
  | { readonly status: 'missing'; readonly path: string }
  | { readonly status: 'no-workspace' }
  | { readonly status: 'unreadable'; readonly reason: string }

/**
 * 【变更】2026-10-22 (批次十二 3, 客户决策): one 质量资产 row — WHAT the
 * quality pack actually lays into the workspace (project.yml / CPPLINT.cfg /
 * …), whether it is on disk right now, and what it governs. The 资产 card
 * lists these with 预览 + 打开 per row.
 */
export interface BafQualityAssetRow {
  /** Workspace-relative path (git-managed; the apply pack's destination). */
  readonly rel: string
  /** What the file governs (locale key, resolved client-side). */
  readonly roleKey: 'assetProject' | 'assetGateConfig' | 'assetCpplint' | 'assetSuppressions' | 'assetClangFormat' | 'assetUtReadme' | 'assetStaticReadme'
  /** Whether the file exists in the workspace right now. */
  readonly exists: boolean
}

/** `qualityAssets()` outcome — the explicit 质量资产 list + existence. */
export interface BafQualityAssetsResult {
  readonly status: 'ready' | 'no-workspace'
  readonly cwd?: string
  readonly assets: readonly BafQualityAssetRow[]
}

/**
 * 【变更】2026-10-22 (批次十二 3): `readQualityAsset()` outcome — one 资产
 * file's preview payload (text, size-capped).
 */
export type BafQualityAssetReadResult =
  | { readonly status: 'ready'; readonly path: string; readonly content: string }
  | { readonly status: 'missing'; readonly path: string }
  | { readonly status: 'no-workspace' }
  | { readonly status: 'unreadable'; readonly reason: string }

/**
 * 【变更】2026-10-20 (批次六 5): `enterpriseDoc()` outcome — one REAL enterprise
 * standard document read from the package assets (bafplugin-migrated; a
 * product constant, never workspace- or baseline-dependent). The client
 * mirror catalog carries the list; this carries the clicked document's text.
 * A discriminated union (like BafStandardSummaryResult) so consumers narrow
 * on `status` instead of probing optional fields.
 */
export type BafEnterpriseDocResult =
  | {
    readonly status: 'ready'
    readonly id: string
    readonly titleZh: string
    readonly titleEn: string
    /** Absolute asset path the content came from. */
    readonly path: string
    readonly content: string
  }
  | { readonly status: 'unknown' }
  | {
    readonly status: 'unreadable'
    /** IO reason. */
    readonly reason: string
  }
