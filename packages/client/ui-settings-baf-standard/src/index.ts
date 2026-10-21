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

import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
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
  readEnterpriseDoc,
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
}

export const name = 'baf-standard-config-service'
export default BafStandardConfigRemote
