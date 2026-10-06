/**
 * Host Remote for the BAF 工程规范 settings overview: a READ-ONLY projection
 * of the current workspace baseline (`.baf/baseline.yml`) — one card per BAF
 * plugin package, plus the rules document the baseline's
 * `standard.mattPocockRulesRef` points at (2026-10-06 问题 6 客户决策:
 * 规范总览·只读 — value edits go through the file itself, never this Remote).
 *
 * The projection reuses the same one-source chain everything else reads:
 * baf-core `loadBaselineFile` for parse+semantics, baf-standard
 * `summarizeStandard` for the standard card's availability — so the overview
 * can never disagree with what the workflow gates actually enforce.
 * @module @deepseek-ai/dsh-client-ui-settings-baf-standard
 */

import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { loadBaselineFile, type BaselineManifest } from '@deepseek-ai/dsh-baf-core'
import {
  STANDARD_AREAS, STANDARD_PLACEHOLDER, summarizeStandard,
} from '@deepseek-ai/dsh-baf-standard'
// Type-only: pulls the session store's Context merge (ctx.sessions).
import type {} from '@deepseek-ai/dsh-session'
import type {
  BafStandardFieldRow, BafStandardFieldState, BafStandardPackageCard,
  BafStandardRulesDocResult, BafStandardSummaryResult,
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
        row('guard.protectedPaths', g.protectedPaths),
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
      return { status: 'no-baseline', cwd, baselinePath }
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
      cards: projectStandardCards(manifest),
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
}

export const name = 'baf-standard-config-service'
export default BafStandardConfigRemote
