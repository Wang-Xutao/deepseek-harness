/**
 * Host Remote for the BAF 工程规范 settings overview: a READ-ONLY projection
 * of the current workspace baseline (`.baf/baseline.yml`) — one card per BAF
 * plugin package, plus the rules document the baseline's
 * `standard.mattPocockRulesRef` points at (2026-10-06 问题 6 客户决策:
 * 规范总览·只读 — value edits go through the file itself, never this Remote).
 *
 * 【变更】2026-10-18 (项目工程 1.3, 客户决策): ONE controlled exception —
 * `saveProtectedPaths` writes the editable AI 禁改路径 list (`guard.
 * protectedPaths`) into the git-managed baseline via a comment-preserving
 * surgical rewrite, and installs the pre-commit commit 防线. Every other
 * field remains strictly read-only.
 *
 * The projection reuses the same one-source chain everything else reads:
 * baf-core `loadBaselineFile` for parse+semantics, baf-standard
 * `summarizeStandard` for the standard card's availability — so the overview
 * can never disagree with what the workflow gates actually enforce.
 * @module @deepseek-ai/dsh-client-ui-settings-baf-standard
 */

import { exec } from 'node:child_process'
import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import { load as loadYaml } from 'js-yaml'
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  BAF_VERSION, BafError, loadBaselineFile, parseBaselineManifest,
  rewriteBaselineNodeHooks, rewriteBaselineProtectedPaths,
  validateNodeHooks, validateProtectedPaths, type BaselineManifest,
} from '@deepseek-ai/dsh-baf-core'
import { commitGuardHookInstalled, installCommitGuardHook } from '@deepseek-ai/dsh-baf-guard/commit-hook'
import { scaffoldWorkspace } from '@deepseek-ai/dsh-baf-scaffold'
import {
  applyEnterpriseStandards, detectAppliedEnterprisePacks,
  enterpriseAssetsRoot, readEnterpriseDoc,
  STANDARD_AREAS, STANDARD_PLACEHOLDER, summarizeStandard,
} from '@deepseek-ai/dsh-baf-standard'
// Type-only: pulls the session store's Context merge (ctx.sessions).
import type {} from '@deepseek-ai/dsh-session'
import type {
  BafEnterpriseDocResult, BafStandardGenerateResult,
  BafStandardNodeHooks, BafStandardSaveNodeHooksResult,
  BafStandardSaveProtectedResult,
  BafStandardFieldRow, BafStandardFieldState, BafStandardPackageCard,
  BafStandardRulesDocResult, BafStandardStatPathResult, BafStandardSummaryResult,
  BafQualityConfigurationResult, BafQualityEnvironmentResult,
  BafQualityInstallResult, BafQualityInstallStep, BafQualityReportResult,
  BafQualityToolRow,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** BAF 工程规范 overview Remote (host plane, workspace baseline read). */
    bafStandardConfig: BafStandardConfigRemote
  }
}

/** Render one baseline value for the field table (booleans/lists flattened). */
function fieldValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) return value.length === 0 ? '[]' : value.join(', ')
  return String(value)
}

/** 企业待定 detection: the enterprise placeholder (or any `<…>` marker) wins. */
function fieldState(value: unknown): BafStandardFieldState {
  if (typeof value !== 'string') return 'ok'
  const trimmed = value.trim()
  return trimmed === STANDARD_PLACEHOLDER || trimmed.startsWith('<') ? 'tbd' : 'ok'
}

/** Build one field row. */
function row(field: string, value: unknown): BafStandardFieldRow {
  return { field, value: fieldValue(value), state: fieldState(value) }
}

/**
 * 【变更】2026-10-19 (六问题批 4.1b): project a manifest's hooks block into
 * the wire map (only configured nodes, plain arrays). Absent block → `{}`.
 */
export function projectNodeHooks(manifest: BaselineManifest): BafStandardNodeHooks {
  const out: Record<string, { enter?: string[]; exit?: string[] }> = {}
  for (const [node, lists] of Object.entries(manifest.hooks?.nodes ?? {})) {
    const mapped: { enter?: string[]; exit?: string[] } = {}
    if (lists.enter !== undefined && lists.enter.length > 0) mapped.enter = [...lists.enter]
    if (lists.exit !== undefined && lists.exit.length > 0) mapped.exit = [...lists.exit]
    if (Object.keys(mapped).length > 0) out[node] = mapped
  }
  return out
}

/**
 * Project a validated baseline into the per-package cards. Pure — unit-tested
 * without a Context; every field path matches the YAML the customer edits.
 * @param manifest - validated baseline manifest.
 * @returns six data cards (the scaffold card is client-static).
 */
export function projectStandardCards(manifest: BaselineManifest): BafStandardPackageCard[] {
  const summary = summarizeStandard(manifest)
  const { workflow: w, routeProfile: r, openspec: o, stack: st, guard: g } = manifest
  return [
    {
      id: 'workflow',
      fields: [
        row('workflow.default', w.default),
        row('workflow.requireOpenSpec', w.requireOpenSpec),
        row('workflow.bugFixPath.allowed', w.bugFixPath.allowed),
        row('workflow.bugFixPath.maxScope', w.bugFixPath.maxScope),
        row('workflow.bugFixPath.requireRegressionTest', w.bugFixPath.requireRegressionTest),
      ],
    },
    {
      id: 'route',
      fields: [
        row('routeProfile.default', `${r.default.provider} / ${r.default.model}`),
        row('routeProfile.allowed', `${r.allowed.length}`),
        row('routeProfile.fallbackPolicy.mode', r.fallbackPolicy.mode),
      ],
    },
    {
      id: 'openspec',
      fields: [
        row('openspec.cli', o.cli),
        row('openspec.version', o.version),
        row('openspec.root', o.root),
        row('openspec.changeRoot', o.changeRoot),
        row('openspec.validate.args', o.validate.args.join(' ')),
      ],
    },
    {
      id: 'standard',
      fields: [
        row('standard.mattPocockRulesRef', summary.sourceRef),
        row('standard.availability', summary.availability),
        row('standard.ruleAreas', STANDARD_AREAS.map(area => area.id).join(', ')),
      ],
    },
    {
      id: 'quality',
      fields: [
        row('stack.language', st.language),
        row('stack.compiler', st.compiler),
        row('stack.build', st.build),
        row('stack.test', st.test),
        row('stack.coverage.required', st.coverage.required),
        row('stack.coverage.minimum', st.coverage.minimum),
        row('stack.analyzers', st.analyzers),
      ],
    },
    {
      id: 'guard',
      fields: [
        row('guard.secretScan', g.secretScan),
        // 【变更】2026-10-18 (项目工程 1.3): guard.protectedPaths moved out of
        // this read-only projection — the editable AI 禁改路径 card owns it.
        row('guard.requireHumanConfirmation', g.requireHumanConfirmation),
      ],
    },
  ]
}

/** The session-store face {@link resolveWorkspaceCwd} needs (test-friendly). */
export interface CwdSessionStore {
  get(id: string): { header?: { cwd?: string } } | undefined
  list(): readonly { header?: { cwd?: string } }[]
}

/**
 * Resolve the workspace the overview reads: the caller's session when it has
 * a cwd, else the newest session that has one, else the sandbox policy's
 * workspace root. Pure — unit-tested without a Context.
 * @param sessions - live session store.
 * @param workspaceRoot - `sandboxPolicy.workspaceRoot` fallback.
 * @param sessionId - optional caller session.
 * @returns absolute cwd, or undefined when nothing names a workspace.
 */
export function resolveWorkspaceCwd(
  sessions: CwdSessionStore,
  workspaceRoot: string | undefined,
  sessionId?: string,
): string | undefined {
  if (sessionId !== undefined && sessionId !== '') {
    const live = sessions.get(sessionId)?.header?.cwd
    if (live !== undefined && live !== '') return live
  }
  const listed = sessions.list()
  for (let index = listed.length - 1; index >= 0; index -= 1) {
    const cwd = listed[index]?.header?.cwd
    if (cwd !== undefined && cwd !== '') return cwd
  }
  if (workspaceRoot !== undefined && workspaceRoot !== '') return workspaceRoot
  return undefined
}

// ── 质量监控 (2026-10-21 重构): environment probe / 一键安装 / 配置 readout ──

const execShell = promisify(exec)

/** Per-tool version-probe budget (missing tools fail fast on ENOENT). */
const QUALITY_PROBE_TIMEOUT_MS = 4_000

/** One gem/pip install's wall-clock budget (network-bound; no RPC timeout). */
const QUALITY_INSTALL_TIMEOUT_MS = 300_000

/** The unit-test toolchain members, in presentation order. */
const QUALITY_TOOLS: ReadonlyArray<{ key: string; cmd: string; required: boolean }> = [
  { key: 'gcc', cmd: 'gcc --version', required: true },
  { key: 'ruby', cmd: 'ruby --version', required: true },
  { key: 'ceedling', cmd: 'ceedling version', required: true },
  { key: 'gcovr', cmd: 'gcovr --version', required: true },
  { key: 'cpplint', cmd: 'cpplint --version', required: false },
  { key: 'cppcheck', cmd: 'cppcheck --version', required: false },
]

/** Whether a shell failure was the timeout guard rather than a real failure. */
function qualTimedOut(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'killed' in error && error.killed === true
}

/**
 * Pull the version token out of a `--version` first line — the first
 * whitespace token that looks like `N(.N)+`, so `gcc (Rev3, …) 13.2.0`,
 * `ruby 3.2.2 (…)`, `ceedling 1.0.1`, `Cppcheck 2.13` all resolve without a
 * per-tool parser.
 */
export function readToolVersion(stdout: string): string | undefined {
  const firstLine = stdout.trim().split(/\r?\n/, 1)[0] ?? ''
  for (const token of firstLine.split(/\s+/)) {
    const match = token.match(/\d+(?:\.\d+)+/)
    if (match !== null) return match[0]
  }
  return undefined
}

/** One-line, tail-clamped rendering of a command's output for step details. */
function tailOf(text: string, max = 160): string {
  const flat = text.trim().split(/\r?\n/).map(line => line.trim()).filter(line => line !== '').join(' · ')
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`
}

/** The manual-install hints for prerequisites 一键安装 cannot provision. */
const QUALITY_MANUAL_HINTS: Readonly<Record<string, string>> = {
  gcc: '需手动安装 GCC（MinGW-w64 或 MSYS2）并加入 PATH',
  ruby: '需手动安装 Ruby（RubyInstaller）并加入 PATH，gem 随附',
  cppcheck: '需手动安装 Cppcheck 并加入 PATH',
}

/** Shipped defaults when neither workspace nor asset config is readable. */
const QUALITY_DEFAULTS = {
  thresholdLine: 0.8,
  gateMode: 'shadow',
  reportHtmlRel: 'build/coverage/coverage_report.html',
  testDir: 'test/**',
  buildDir: 'build',
} as const

/**
 * 【变更】2026-10-21 (质量监控重构 1.4): read the 配置 card's values — the
 * workspace's own quality config (`.baf/quality/ceedling-config.json` +
 * `project.yml`) with the SHIPPED asset defaults as fallback, so the card
 * quotes what the workspace will actually run. Context-free (testable against
 * a temp dir); `readQualityReport` reuses this to resolve the report path.
 * @param workspaceRoot - absolute workspace root.
 * @returns configuration readout (`no-workspace` only via the Remote).
 */
export async function readQualityConfiguration(
  workspaceRoot: string,
): Promise<BafQualityConfigurationResult> {
  const readJson = async (path: string): Promise<Record<string, unknown> | undefined> => {
    try {
      const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
      return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
    } catch {
      return undefined
    }
  }
  const assets = enterpriseAssetsRoot()
  const workspaceConfig = await readJson(join(workspaceRoot, '.baf', 'quality', 'ceedling-config.json'))
  const config = workspaceConfig ?? await readJson(join(assets, 'quality', 'ceedling', 'config.json'))
  // project.yml is Ceedling's symbol-key YAML (":project:" → key ":project").
  const readProject = async (path: string): Promise<Record<string, unknown> | undefined> => {
    try {
      const parsed: unknown = loadYaml(await readFile(path, 'utf8'))
      return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
    } catch {
      return undefined
    }
  }
  const project = await readProject(join(workspaceRoot, 'project.yml'))
    ?? await readProject(join(assets, 'quality', 'ceedling', 'project.yml'))

  const asString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

  const thresholdRaw = config?.threshold_line
  const reportHtmlRel = asString(config?.report_html) ?? QUALITY_DEFAULTS.reportHtmlRel
  const projectBlock = project?.[':project'] as Record<string, unknown> | undefined
  const pathsBlock = project?.[':paths'] as Record<string, unknown> | undefined
  const testEntry = asString((pathsBlock?.[':test'] as readonly string[] | undefined)?.[0])
  let reportHtmlExists = false
  try {
    await stat(join(workspaceRoot, reportHtmlRel))
    reportHtmlExists = true
  } catch {
    reportHtmlExists = false
  }
  return {
    status: 'ready',
    source: workspaceConfig !== undefined ? 'workspace' : 'builtin',
    // '+:test/**' is Ceedling's include-glob prefix — strip for display.
    testDir: testEntry?.replace(/^\+:/, '') ?? QUALITY_DEFAULTS.testDir,
    buildDir: asString(projectBlock?.[':build_root']) ?? QUALITY_DEFAULTS.buildDir,
    reportDir: dirname(reportHtmlRel),
    thresholdLine: typeof thresholdRaw === 'number' && Number.isFinite(thresholdRaw)
      ? thresholdRaw
      : QUALITY_DEFAULTS.thresholdLine,
    gateMode: asString(config?.gate_mode) ?? QUALITY_DEFAULTS.gateMode,
    reportHtmlRel,
    reportHtmlExists,
  }
}

/**
 * Probe one toolchain member (2026-10-21 质量监控重构 1.3). The command string
 * is a literal — nothing from the workspace is interpolated — so a shell is
 * safe and is the only thing that works: on Windows the gem/pip shims are
 * `.cmd`/`.bat`, which `execFile` refuses with `shell: false` (CVE-2024-27980);
 * the shell resolves them through PATHEXT. Timeout → `unknown` (§20.5: a slow
 * tool must not be reported as absent), ENOENT → `missing`.
 */
export async function probeQualityTool(
  tool: { key: string; cmd: string; required: boolean },
  timeoutMs = QUALITY_PROBE_TIMEOUT_MS,
): Promise<BafQualityToolRow> {
  try {
    const { stdout } = await execShell(tool.cmd, { timeout: timeoutMs, windowsHide: true })
    const version = readToolVersion(stdout)
    return version === undefined
      ? { key: tool.key, state: 'missing', required: tool.required }
      : { key: tool.key, state: 'ok', version, required: tool.required }
  } catch (error: unknown) {
    if (qualTimedOut(error)) return { key: tool.key, state: 'unknown', required: tool.required }
    // A CLI that prints its version then exits non-zero is still usable.
    const stdout = (error as { stdout?: unknown }).stdout
    const version = typeof stdout === 'string' ? readToolVersion(stdout) : undefined
    return version === undefined
      ? { key: tool.key, state: 'missing', required: tool.required }
      : { key: tool.key, state: 'ok', version, required: tool.required }
  }
}

/** Probe every toolchain member in parallel (presentation order preserved). */
async function probeQualityTools(): Promise<BafQualityToolRow[]> {
  return Promise.all(QUALITY_TOOLS.map(tool => probeQualityTool(tool)))
}

/**
 * The BAF 工程规范 overview Remote. Read-only by design: `summary` projects
 * the baseline into per-package cards, `rulesDoc` serves the referenced rules
 * document — neither writes, so a settings page can never mutate the policy.
 */
export class BafStandardConfigRemote extends TypertRemoteService {
  static inject = ['sessions', 'sandboxPolicy']

  constructor(ctx: Context) {
    super(ctx, 'bafStandardConfig')
  }

  /** Resolve the workspace for this call (newest session cwd → sandbox root). */
  private resolveCwd(): string | undefined {
    const workspaceRoot = (this.ctx.get('sandboxPolicy') as { workspaceRoot?: string } | undefined)
      ?.workspaceRoot
    try {
      return resolveWorkspaceCwd(this.ctx.sessions, workspaceRoot)
    } catch {
      return workspaceRoot !== undefined && workspaceRoot !== '' ? workspaceRoot : undefined
    }
  }

  /**
   * Project the workspace baseline into the overview cards. No workspace →
   * `no-workspace`; workspace without `.baf/baseline.yml` → `no-baseline`
   * (both render their own empty state pointing at `/baf-scaffold`); a present
   * but invalid baseline → `failed` with the technical one-liner.
   *
   * 【变更】2026-10-06 运行时探针: typert 客户端代理按声明参数个数严格校验实参
   * (gateway client `expected N argument(s)`)，可选参数也必须显式占位 — 远端方法
   * 一律零参，工作区解析只走「最新会话 cwd → 沙箱根」回退链。
   * @returns summary result for the settings overview.
   */
  @Remote
  async summary(): Promise<BafStandardSummaryResult> {
    const cwd = this.resolveCwd()
    if (cwd === undefined) return { status: 'no-workspace' }
    const baselinePath = join(cwd, '.baf', 'baseline.yml')
    try {
      await stat(baselinePath)
    } catch {
      return {
        status: 'no-baseline',
        cwd,
        baselinePath,
      }
    }
    let manifest: BaselineManifest
    try {
      manifest = await loadBaselineFile(baselinePath)
    } catch (error) {
      return {
        status: 'failed', cwd, baselinePath,
        error: error instanceof Error ? error.message : String(error),
      }
    }
    const standard = summarizeStandard(manifest)
    return {
      status: 'ready',
      cwd,
      baselinePath,
      baselineId: manifest.baselineId,
      compatibility: { min: manifest.bafCompatibility.min, max: manifest.bafCompatibility.max },
      standardSourceRef: standard.sourceRef,
      standardAvailability: standard.availability,
      // 【变更】2026-10-07 (九点批 问题 8): the 8 rule areas ride the summary —
      // id + titleKey + anchored sourceRef — so the client can render one
      // section per domain and point each at where its rules live. Content
      // still never rides this Remote (rulesDoc serves the document itself).
      standardAreas: standard.areas.map(area => ({
        id: area.id,
        titleKey: area.titleKey,
        sourceRef: area.sourceRef,
      })),
      cards: projectStandardCards(manifest),
      // 【变更】2026-10-18 (项目工程 1.3): raw protected-paths list + commit
      // 防线 presence for the editable AI 禁改路径 card.
      guardProtectedPaths: [...manifest.guard.protectedPaths],
      commitGuardHookInstalled: await commitGuardHookInstalled(cwd),
      // 【变更】2026-10-19 (六问题批 4.1b): per-node custom scripts for the
      // 项目工程 状态脚本 editor.
      nodeHooks: projectNodeHooks(manifest),
    }
  }

  /**
   * Serve the rules document the baseline points at (the 规范总览 viewer's
   * payload). Placeholder ref → `unavailable` with `policy_missing`; readable
   * file → full text; anything else → `unreadable` with the IO reason.
   * Zero-arg like {@link summary} (typert arity is exact; see its 变更 note).
   * @returns rules document result.
   */
  @Remote
  async rulesDoc(): Promise<BafStandardRulesDocResult> {
    const cwd = this.resolveCwd()
    if (cwd === undefined) return { status: 'unavailable', reason: 'no-workspace' }
    let ref: string
    try {
      const manifest = await loadBaselineFile(join(cwd, '.baf', 'baseline.yml'))
      ref = manifest.standard.mattPocockRulesRef
    } catch (error) {
      return { status: 'unavailable', reason: error instanceof Error ? error.message : String(error) }
    }
    if (ref.trim() === STANDARD_PLACEHOLDER) {
      return { status: 'unavailable', reason: 'policy_missing' }
    }
    const path = isAbsolute(ref) ? ref : join(cwd, ref)
    try {
      const content = await readFile(path, 'utf8')
      return { status: 'ready', path, content }
    } catch (error) {
      return { status: 'unreadable', path, reason: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * 【变更】2026-10-20 (批次六 5): serve one REAL enterprise standard document
   * from the package assets (the bafplugin-migrated catalog — a product
   * constant, so unlike {@link rulesDoc} this needs no workspace and never
   * degrades to a placeholder). Unknown id → `unknown`; IO trouble →
   * `unreadable` with the reason.
   * @param id - catalog id (`overview` / `code` / `sri` / …).
   * @returns the document's absolute path + full text.
   */
  @Remote
  async enterpriseDoc(id: string): Promise<BafEnterpriseDocResult> {
    const read = readEnterpriseDoc(id)
    if (read.status === 'unknown') return { status: 'unknown' }
    if (read.status === 'unreadable') return { status: 'unreadable', reason: read.reason }
    return {
      status: 'ready',
      id: read.entry.id,
      titleZh: read.entry.titleZh,
      titleEn: read.entry.titleEn,
      path: read.path,
      content: read.content,
    }
  }

  /**
   * 【变更】2026-10-18 (项目工程 1.3, 客户决策): save the editable AI 禁改路径
   * list into the git-managed baseline — the ONE write this Remote owns
   * (every other field stays read-only per the 2026-10-06 客户决策). The edit
   * is surgical (`rewriteBaselineProtectedPaths` keeps every other byte —
   * comments included), pre-validated as YAML BEFORE the atomic rename, and
   * re-loaded after the swap with a restore-on-failure belt. A non-empty
   * list also (re)installs the managed pre-commit commit 防线.
   * @param paths - the UI's proposed relative entries (validated here).
   * @returns save outcome; `hookInstalled` rides `ready`.
   */
  @Remote
  async saveProtectedPaths(paths: readonly string[]): Promise<BafStandardSaveProtectedResult> {
    const cwd = this.resolveCwd()
    if (cwd === undefined) return { status: 'no-workspace' }
    const baselinePath = join(cwd, '.baf', 'baseline.yml')
    try {
      await stat(baselinePath)
    } catch {
      return { status: 'no-baseline' }
    }
    const validation = validateProtectedPaths(paths)
    if (!validation.ok) return { status: 'invalid', message: validation.message }

    let original: string
    try {
      original = await readFile(baselinePath, 'utf8')
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
    let rewritten: string
    try {
      rewritten = rewriteBaselineProtectedPaths(original, validation.paths)
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof BafError ? error.message : String(error),
      }
    }
    // Validate the rewritten document as a whole BEFORE it reaches disk — a
    // broken baseline would take the workflow down, so it never lands.
    try {
      parseBaselineManifest(loadYaml(rewritten), BAF_VERSION, baselinePath)
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      }
    }
    const tmp = `${baselinePath}.baf-tmp`
    try {
      await writeFile(tmp, rewritten, 'utf8')
      await rename(tmp, baselinePath)
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => {})
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
    // Post-swap reload is the belt to the pre-check; restore on any surprise.
    try {
      await loadBaselineFile(baselinePath)
    } catch (error) {
      await writeFile(baselinePath, original, 'utf8').catch(() => {})
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }

    const effective = validation.paths.filter(entry => entry !== '<enterprise-tbd>')
    if (effective.length === 0) return { status: 'ready', paths: validation.paths }
    const hook = await installCommitGuardHook(cwd)
    if (!hook.ok) {
      return {
        status: 'ready',
        paths: validation.paths,
        hookInstalled: false,
        ...(hook.message === undefined ? {} : { message: hook.message }),
      }
    }
    return { status: 'ready', paths: validation.paths, hookInstalled: true }
  }

  /**
   * 【变更】2026-10-19 (六问题批 4.1b): save the per-node custom-script map
   * (baseline `hooks.nodes.<node>.enter/exit`) — the second controlled write,
   * same discipline as {@link saveProtectedPaths}: surgical comment-preserving
   * rewrite, whole-document YAML re-validation BEFORE the atomic rename, and a
   * post-swap reload with restore-on-failure. An all-empty draft REMOVES the
   * `hooks:` block (dead config never lingers).
   * @param hooks - the UI's draft map (node → enter/exit lists).
   * @returns save outcome with the normalized map on `ready`.
   */
  @Remote
  async saveNodeHooks(
    // The package's own types.ts mirror, not baf-core's NodeHookLists —
    // typert requires Remote boundary types to ride the public ./types
    // subpath of THIS package (they are structurally identical).
    hooks: BafStandardNodeHooks,
  ): Promise<BafStandardSaveNodeHooksResult> {
    const cwd = this.resolveCwd()
    if (cwd === undefined) return { status: 'no-workspace' }
    const baselinePath = join(cwd, '.baf', 'baseline.yml')
    try {
      await stat(baselinePath)
    } catch {
      return { status: 'no-baseline' }
    }
    const validation = validateNodeHooks(hooks)
    if (!validation.ok) return { status: 'invalid', message: validation.message }

    let original: string
    try {
      original = await readFile(baselinePath, 'utf8')
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
    let rewritten: string
    try {
      rewritten = rewriteBaselineNodeHooks(original, validation.hooks)
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof BafError ? error.message : String(error),
      }
    }
    try {
      parseBaselineManifest(loadYaml(rewritten), BAF_VERSION, baselinePath)
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      }
    }
    const tmp = `${baselinePath}.baf-tmp`
    try {
      await writeFile(tmp, rewritten, 'utf8')
      await rename(tmp, baselinePath)
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => {})
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
    try {
      await loadBaselineFile(baselinePath)
    } catch (error) {
      await writeFile(baselinePath, original, 'utf8').catch(() => {})
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
    return {
      status: 'ready',
      hooks: Object.fromEntries(Object.entries(validation.hooks).map(([node, lists]) => [
        node,
        {
          ...(lists.enter === undefined ? {} : { enter: [...lists.enter] }),
          ...(lists.exit === undefined ? {} : { exit: [...lists.exit] }),
        },
      ])),
    }
  }

  /**
   * 【变更】2026-10-20 (批次三 4.4): stat one workspace-relative entry — the
   * 状态脚本 editor's add-time existence check (不存在不允许添加). Entries not
   * expressible as workspace-relative (absolute, `..` escape, empty) answer
   * `exists: false` without touching the filesystem.
   * @param entry - the UI's proposed relative entry (validated here).
   * @returns whether the entry resolves inside the workspace.
   */
  @Remote
  async statWorkspacePath(entry: string): Promise<BafStandardStatPathResult> {
    const cwd = this.resolveCwd()
    if (cwd === undefined) return { exists: false }
    const normalized = entry.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '').trim()
    if (normalized === '' || isAbsolute(normalized) || normalized.split('/').includes('..')) {
      return { exists: false }
    }
    try {
      await stat(join(cwd, normalized))
      return { exists: true }
    } catch {
      return { exists: false }
    }
  }

  /**
   * 【变更】2026-10-19 (六问题批 4.1b): generate the missing baseline — the
   * 项目工程 empty state's 生成配置文件 button. Runs the SAME scaffold the
   * `/baf` command uses; the button click IS the human confirmation the
   * scaffold gate demands (等同输入 baf 指令). No-overwrite + backup semantics
   * come free, so the button is safe even on a half-initialized workspace.
   * Zero-arg (typert arity is exact; see summary's 变更 note).
   * @returns generate outcome; `createdCount`/`gitNote` ride `ready`.
   */
  @Remote
  async generateBaseline(): Promise<BafStandardGenerateResult> {
    const cwd = this.resolveCwd()
    if (cwd === undefined) return { status: 'no-workspace' }
    try {
      const outcome = scaffoldWorkspace({ workspaceRoot: cwd, humanConfirmed: true })
      if (outcome.kind === 'refused') {
        // Unreachable with humanConfirmed: true — kept for exhaustiveness.
        return { status: 'error', message: outcome.reason }
      }
      return {
        status: 'ready',
        createdCount: outcome.changes.created.length,
        ...(outcome.git === undefined ? {} : { gitNote: outcome.git.note }),
      }
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * 【变更】2026-10-21 (质量监控重构 1.3): the 环境 card's payload — one row per
   * unit-test toolchain member with the version the machine actually answers
   * (spawned `--version`, shell-resolved so Windows shims work), plus whether
   * the workspace already carries the quality pack assets (project.yml et al).
   * `supported` gates ONLY on the required members (gcc/ruby/ceedling/gcovr);
   * the 静态分析 members are shown but never block. Zero-arg (typert arity is
   * exact; see summary's 变更 note).
   * @returns probe rows + workspace support verdict.
   */
  @Remote
  async qualityEnvironment(): Promise<BafQualityEnvironmentResult> {
    const cwd = this.resolveCwd()
    if (cwd === undefined) return { status: 'no-workspace', tools: [], supported: false, assetsInstalled: false }
    const tools = await probeQualityTools()
    return {
      status: 'ready',
      cwd,
      tools,
      supported: tools.filter(tool => tool.required).every(tool => tool.state === 'ok'),
      assetsInstalled: detectAppliedEnterprisePacks(cwd).includes('quality'),
    }
  }

  /**
   * 【变更】2026-10-21 (质量监控重构 1.3): the 环境 card's 一键安装 — applies the
   * quality pack assets into the workspace (the same no-overwrite/backup
   * semantics `/baf-standard-init` uses), installs the gem/pip tools that CAN
   * be auto-installed, and reports a manual hint for each prerequisite that
   * cannot (gcc / ruby / cppcheck). The button click IS the human
   * confirmation. Steps run sequentially and every step's outcome rides the
   * wire — a failed step never aborts the rest. Zero-arg (typert arity).
   * @returns per-step install report.
   */
  @Remote
  async installQualityToolchain(): Promise<BafQualityInstallResult> {
    const cwd = this.resolveCwd()
    if (cwd === undefined) return { status: 'no-workspace', steps: [] }
    const steps: BafQualityInstallStep[] = []

    // 1. Workspace assets (project.yml / .baf/quality/* / CPPLINT.cfg …).
    try {
      const changes = applyEnterpriseStandards({ workspaceRoot: cwd, packs: ['quality'] })
      steps.push({
        id: 'assets',
        ok: true,
        detail: `新增 ${changes.created.length} · 跳过 ${changes.skipped.length}` +
          `${changes.stackPinned ? ' · 已固化 stack' : ''}`,
      })
    } catch (error) {
      steps.push({
        id: 'assets',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      })
    }

    // 2+3. The gem tools (ceedling pinned to project.yml's 1.0.1; gcovr any).
    const probes = await probeQualityTools()
    const rowOf = (key: string): BafQualityToolRow | undefined => probes.find(row => row.key === key)
    const rubyOk = rowOf('ruby')?.state === 'ok'
    for (const step of [
      { id: 'ceedling', cmd: 'gem install ceedling -v 1.0.1 --no-document' },
      { id: 'gcovr', cmd: 'gem install gcovr --no-document' },
    ]) {
      if (!rubyOk) {
        steps.push({ id: step.id, ok: false, detail: '未执行：先安装 Ruby（gem 依赖 Ruby 运行时）' })
        continue
      }
      try {
        const { stdout, stderr } = await execShell(step.cmd, {
          timeout: QUALITY_INSTALL_TIMEOUT_MS,
          windowsHide: true,
        })
        steps.push({
          id: step.id,
          ok: true,
          detail: tailOf(`${stdout} ${stderr}`) === '' ? '安装完成' : tailOf(`${stdout} ${stderr}`),
        })
      } catch (error) {
        if (qualTimedOut(error)) {
          steps.push({ id: step.id, ok: false, detail: `超时（>${QUALITY_INSTALL_TIMEOUT_MS / 1000}s），可重试` })
          continue
        }
        const out = error as { stdout?: unknown; stderr?: unknown; message?: unknown }
        const text = tailOf(`${String(out.stdout ?? '')} ${String(out.stderr ?? '')}`) ||
          (typeof out.message === 'string' ? tailOf(out.message) : '安装失败')
        steps.push({ id: step.id, ok: false, detail: text })
      }
    }

    // 4. cpplint via pip (python not probed as a row — failure detail carries
    // the python -m pip fallback so the customer can retry by hand).
    try {
      const { stdout, stderr } = await execShell('pip install cpplint', {
        timeout: QUALITY_INSTALL_TIMEOUT_MS,
        windowsHide: true,
      })
      steps.push({
        id: 'cpplint',
        ok: true,
        detail: tailOf(`${stdout} ${stderr}`) === '' ? '安装完成' : tailOf(`${stdout} ${stderr}`),
      })
    } catch (error) {
      if (qualTimedOut(error)) {
        steps.push({ id: 'cpplint', ok: false, detail: `超时（>${QUALITY_INSTALL_TIMEOUT_MS / 1000}s），可重试` })
      } else {
        const out = error as { stdout?: unknown; stderr?: unknown; message?: unknown }
        const text = tailOf(`${String(out.stdout ?? '')} ${String(out.stderr ?? '')}`) ||
          (typeof out.message === 'string' ? tailOf(out.message) : '安装失败')
        steps.push({ id: 'cpplint', ok: false, detail: `${text}（可改用 python -m pip install cpplint）` })
      }
    }

    // 5. Manual hints for the prerequisites no command can install here.
    for (const key of ['gcc', 'ruby', 'cppcheck'] as const) {
      if (rowOf(key)?.state !== 'ok') {
        const hint = QUALITY_MANUAL_HINTS[key]
        steps.push({ id: `manual-${key}`, ok: false, detail: hint ?? `需手动安装 ${key}` })
      }
    }

    return { status: 'ready', steps }
  }

  /**
   * 【变更】2026-10-21 (质量监控重构 1.4): the 配置 card's payload — the
   * workspace's quality config values (test/report/build dirs, line-coverage
   * threshold, gate mode, the HTML report path + whether it exists). See
   * {@link readQualityConfiguration} for the workspace→builtin fallback.
   * Zero-arg (typert arity is exact).
   * @returns configuration readout.
   */
  @Remote
  async qualityConfiguration(): Promise<BafQualityConfigurationResult> {
    const cwd = this.resolveCwd()
    if (cwd === undefined) return { status: 'no-workspace', source: 'builtin', ...QUALITY_DEFAULTS, reportHtmlExists: false, reportDir: dirname(QUALITY_DEFAULTS.reportHtmlRel) }
    return readQualityConfiguration(cwd)
  }

  /**
   * 【变更】2026-10-21 (质量监控重构 1.4): the 配置 card's 测试报告 modal payload
   * — the configured `report_html` file's full text (HTML only, rendered in a
   * sandboxed iframe client-side). Missing report → `missing` (the card shows
   * the run-a-test hint); IO trouble → `unreadable` with the reason. Zero-arg
   * (typert arity is exact).
   * @returns report content or its absence.
   */
  @Remote
  async readQualityReport(): Promise<BafQualityReportResult> {
    const cwd = this.resolveCwd()
    if (cwd === undefined) return { status: 'no-workspace' }
    const config = await readQualityConfiguration(cwd)
    const path = join(cwd, config.reportHtmlRel)
    try {
      const content = await readFile(path, 'utf8')
      return { status: 'ready', path, content }
    } catch {
      if (!config.reportHtmlExists) return { status: 'missing', path }
      return { status: 'unreadable', reason: `无法读取 ${config.reportHtmlRel}` }
    }
  }
}

export const name = 'baf-standard-config-service'
export default BafStandardConfigRemote
