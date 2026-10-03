/**
 * §11.8/§12 9.6 `baf update` surface — the in-child half of the desktop
 * update loop.
 *
 * The dsh child has NO IPC channel to Electron main (config arrives via
 * env; results flow through files). The desktop names this contract:
 *
 * - `BAF_DSH_UPDATE_STATE` (env) → `update-state.json` written by the
 *   desktop's UpdateService — the 当前状态 surface `baf update` renders
 *   (last check, per-scope plans, epoch/keyId, blocked reason).
 * - `update-request.json` / `update-response.json` (siblings of the state
 *   file) — the child→main command loop: write a request with a fresh id,
 *   poll for the matching response (`baf update` check+apply, and
 *   `baf update rollback`).
 *
 * The command surface is TWO verbs (2026-10-03 简化指令面): `/baf-update`
 * shows 当前状态 + 最新可升级状态, and when something is available pops ONE
 * dialog (立即升级 / 暂不升级) on the `userQuestions` channel; `/baf-update-
 * rollback` restores a hot scope's last-applied bits.
 *
 * Outside the desktop (plain `dsh web`, CLI) the env is absent: every
 * command answers with a card explaining there is no desktop host — never
 * an error thrown at the customer.
 *
 * @module @deepseek-ai/dsh-baf-workflow/update-surface
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions'
import { enqueueAsk } from './ask-queue.ts'
import { formatCommandReport, type CommandReportSection } from './command-format.ts'
import { resolveUserQuestions } from './gate-dialog.ts'

/** Structural view of the desktop's persisted update state (§11.6 版本状态). */
export interface UpdateStateFile {
  readonly lastCheckAt?: string
  readonly lastCheckStatus?: 'up-to-date' | 'available' | 'error'
  readonly tag?: string
  readonly releaseEpoch?: number
  readonly keyId?: string
  readonly blocked?: string
  readonly summaryZh?: string
  readonly plans?: ReadonlyArray<{
    readonly scope: 'harness' | 'plugin' | 'baseline'
    readonly action: 'none' | 'download' | 'apply' | 'restart' | 'installer'
    readonly currentVersion: string
    readonly targetVersion: string
    readonly required: boolean
    readonly restartRequired: boolean
    readonly reason: string
  }>
}

/** Installer handoff record (apply.ts writes it before opening Setup). */
interface InstallerHandoffFile {
  readonly tag?: string
  readonly targetVersion?: string
  readonly keyId?: string
  readonly releaseEpoch?: number
  readonly pendingPlugin?: string | null
  readonly at?: string
}

/** The desktop's JSON-safe response (service.ts UpdateRequestResponse). */
export interface UpdateRequestResponseFile {
  readonly id: string
  readonly command: 'check' | 'apply' | 'rollback'
  readonly ok: boolean
  readonly error?: string
  readonly check?: CheckResult
  readonly apply?: ApplyResult
  readonly rollback?: RollbackResult
}

/** `check` payload — the fresh verdict the desktop writes back. */
interface CheckResult {
  readonly status: string
  readonly checkedAt: string
  readonly summaryZh?: string
  readonly blocked?: string
}

/** Per-scope outcome of an apply round-trip (one transaction per scope). */
interface ScopeOutcome {
  readonly scope: string
  readonly action: string
  readonly ok: boolean
  readonly error?: string
  readonly rolledBack?: boolean
}

/** `apply` payload — merged per-scope results + post-apply versions. */
interface ApplyResult {
  readonly ok: boolean
  readonly error?: string
  readonly launchedInstaller: boolean
  readonly restartedChild: boolean
  readonly scopes: ReadonlyArray<ScopeOutcome>
  readonly versions: { readonly bafDsh: string; readonly dsh: string; readonly bafPlugin: string }
}

/** `rollback` payload — where the hot scope came from and landed. */
interface RollbackResult {
  readonly scope: string
  readonly ok: boolean
  readonly fromVersion?: string
  readonly toVersion?: string
  readonly error?: string
}

/** State file path from the desktop env, or undefined outside the desktop. */
export function updateStateFilePath(): string | undefined {
  const env = process.env.BAF_DSH_UPDATE_STATE
  return env !== undefined && env.trim() !== '' ? env.trim() : undefined
}

/** Tolerant JSON read (missing/corrupt → undefined). */
function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return undefined
  }
}

/** The desktop-written update state, when the env names it. */
export function readUpdateState(): UpdateStateFile | undefined {
  const path = updateStateFilePath()
  return path === undefined ? undefined : readJson<UpdateStateFile>(path)
}

/** The last installer handoff record, when one is pending. */
export function readInstallerHandoff(): InstallerHandoffFile | undefined {
  const path = updateStateFilePath()
  return path === undefined ? undefined : readJson<InstallerHandoffFile>(join(dirname(path), 'updates', 'installer-handoff.json'))
}

/**
 * One child→main round trip: write `update-request.json`, poll
 * `update-response.json` for the matching id.
 * @param command - the desktop verb.
 * @param scope - rollback scope (`plugin` default; `runtime` also hot).
 * @param timeoutMs - poll budget (default 120s; apply can download).
 * @returns the desktop's response, or an error-shaped response on timeout.
 */
export async function requestDesktopUpdate(
  command: 'check' | 'apply' | 'rollback',
  scope?: string,
  timeoutMs = 120_000,
): Promise<UpdateRequestResponseFile> {
  const statePath = updateStateFilePath()
  if (statePath === undefined) {
    return { id: 'no-desktop', command, ok: false, error: '当前没有桌面宿主（BAF_DSH_UPDATE_STATE 未设置）；请在 BAF DSH 桌面内使用更新指令' }
  }
  const dir = dirname(statePath)
  const requestPath = join(dir, 'update-request.json')
  const responsePath = join(dir, 'update-response.json')
  const id = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const body = {
    id,
    command,
    ...(scope === undefined ? {} : { scope }),
    requestedAt: new Date().toISOString(),
    requestor: 'baf-command',
  }
  try {
    writeFileSync(requestPath, `${JSON.stringify(body)}\n`, 'utf8')
  } catch (err) {
    return { id, command, ok: false, error: `请求写入失败：${err instanceof Error ? err.message : String(err)}` }
  }
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 500))
    const response = readJson<UpdateRequestResponseFile>(responsePath)
    if (response?.id === id) return response
  }
  return { id, command, ok: false, error: `桌面 ${timeoutMs / 1000}s 内未响应（可能未运行或正在忙碌）` }
}

const SCOPE_ZH: Record<string, string> = { harness: '桌面/运行时', plugin: '插件', baseline: '基线' }
const ACTION_ZH: Record<string, string> = {
  none: '无操作',
  download: '暂存下载',
  apply: '应用更新',
  restart: '需重启',
  installer: '安装器升级',
}

/** What the customer picked on the upgrade dialog. */
export type UpdateChoice = 'upgrade' | 'cancel'

/**
 * The popup channel for the upgrade choice — `'unavailable'` when no dialog
 * can show (standalone CLI / test compositions); `runUpdate` then reports
 * the available update without applying anything.
 */
export type UpdateAsk = () => Promise<UpdateChoice | 'unavailable'>

/** The live agent the dialog is scoped to (`ask_user_question` pattern). */
type DialogAgent = NonNullable<AskUserQuestionRequest['agent']>

/** Session scope of the pop — same structural read gate-dialog uses. */
function sessionKeyOf(agent: unknown): string {
  const id = (agent as { session?: { header?: { id?: unknown } } } | undefined)?.session?.header?.id
  return typeof id === 'string' && id !== '' ? id : 'baf-unknown-session'
}

/** Dialog paragraphs from the fresh state file (check just rewrote it). */
function updateDialogDetail(): string {
  const state = readUpdateState()
  const lines = [
    state?.summaryZh ?? '桌面/插件有新版本可应用',
    ...(state?.plans ?? [])
      .filter(p => p.action !== 'none')
      .map(p => `${SCOPE_ZH[p.scope] ?? p.scope}：${p.currentVersion} → ${p.targetVersion}（${ACTION_ZH[p.action] ?? p.action}）`),
  ]
  return `【待升级】\n${lines.join('\n')}`
}

/**
 * Build the upgrade-choice popup channel from a host-plane ctx — the SAME
 * `userQuestions` waterfall + §22.19 single-flight queue the workflow gates
 * ride, so an update pop can never cover an in-flight gate dialog (and vice
 * versa). Returns undefined when no answerer is mounted (standalone CLI /
 * tests); the caller then reports without applying.
 * @param ctx - preset-row context (`baf-commands` row).
 * @param agent - receiving agent; may be the runtime agent object.
 * @returns the popup channel, or undefined.
 */
export function makeUpdateAsk(ctx: Context, agent?: unknown): UpdateAsk | undefined {
  const service = resolveUserQuestions(ctx, agent === undefined ? undefined : agent as { ctx?: Context })
  if (service === undefined) return undefined
  const dialogAgent = agent as DialogAgent | undefined
  const sessionId = sessionKeyOf(agent)
  return async () => {
    const outcome = await enqueueAsk({
      sessionId,
      key: 'update:desktop',
      run: async (controller) => {
        try {
          const answer = await service.ask({
            questions: [{
              id: 'baf-update',
              question: '发现可用更新，是否升级？',
              detail: updateDialogDetail(),
              header: 'BAF 更新',
              options: [
                { label: '立即升级', description: '下载并应用可用更新（分 scope 独立事务，失败自动回滚本 scope）' },
                { label: '暂不升级', description: '保持当前版本；需要时再敲一次 /baf-update' },
              ],
            }],
            ...(dialogAgent === undefined ? {} : { agent: dialogAgent }),
            signal: controller.signal,
          })
          return answer.answers[0]?.selected[0] === '立即升级' ? 'upgrade' : 'cancel'
        } catch {
          // X-button / abort / ask failure — treat as not-now, never upgrade.
          return 'cancel'
        }
      },
    })
    // Dropped (duplicate / abort) is never a choice — render as not-now.
    return outcome.kind === 'answered' ? outcome.value : 'cancel'
  }
}

/** The `baf update` card body lines from the state + handoff files. */
function statusSections(state: UpdateStateFile | undefined, handoff: InstallerHandoffFile | undefined): CommandReportSection[] {
  if (state === undefined) {
    return [{
      title: '当前状态',
      lines: ['未检测到桌面宿主（BAF_DSH_UPDATE_STATE 未设置）', '独立运行 dsh 时无更新通道；请在 BAF DSH 桌面内使用更新指令'],
    }]
  }
  const sections: Array<{ title: string; lines: string[] }> = []
  sections.push({
    title: '当前状态（最近一次检查）',
    lines: [
      `时间：${state.lastCheckAt ?? '（未检查）'}`,
      `结果：${state.lastCheckStatus === 'available' ? '有可用更新' : state.lastCheckStatus === 'error' ? '检查失败' : state.lastCheckStatus === 'up-to-date' ? '已是最新' : '（未检查）'}`,
      ...(state.summaryZh === undefined ? [] : [`摘要：${state.summaryZh}`]),
      ...(state.blocked === undefined ? [] : [`阻断：${state.blocked}`]),
      ...(state.tag === undefined ? [] : [`通道 tag：${state.tag}`]),
      ...(state.keyId === undefined || state.releaseEpoch === undefined
        ? []
        : [`签名 keyId：${state.keyId} · releaseEpoch：${String(state.releaseEpoch)}`]),
    ],
  })
  if (state.plans !== undefined && state.plans.length > 0) {
    sections.push({
      title: '分 scope 计划（harness / plugin / baseline）',
      lines: state.plans.map(p => [
        `${SCOPE_ZH[p.scope] ?? p.scope}：${ACTION_ZH[p.action] ?? p.action}`,
        p.action === 'none' ? `  · ${p.reason}` : `  · ${p.currentVersion} → ${p.targetVersion}${p.required ? '（必须）' : ''}`,
      ].join('\n')),
    })
  }
  if (handoff !== undefined) {
    sections.push({
      title: '安装器交接（上次升级已交给安装器）',
      lines: [
        `目标版本：${handoff.targetVersion ?? '（未知）'} · ${handoff.tag ?? ''}`,
        ...(handoff.pendingPlugin != null ? [`待应用插件：${handoff.pendingPlugin}`] : []),
        ...(handoff.at === undefined ? [] : [`时间：${handoff.at}`]),
      ],
    })
  }
  return sections
}

/**
 * `baf update` — the single update verb (2026-10-03 简化指令面):
 *
 * 1. read the persisted state (当前状态：last check + scoped plans + handoff);
 * 2. round-trip `check` for the LATEST channel verdict (最新可升级状态);
 * 3. when something is available, pop ONE dialog — 立即升级 / 暂不升级 — via
 *    the passed {@link UpdateAsk}; upgrade dispatches `apply` and renders the
 *    per-scope outcome, cancel (or no popup channel) leaves the card
 *    reporting what is available. `autoApply: true` (CLI `--apply`) skips
 *    the dialog.
 * @param ask - popup channel; undefined reports without applying.
 * @param opts - `autoApply` skips the upgrade dialog.
 * @returns the card result.
 */
export async function runUpdate(ask?: UpdateAsk, opts?: { autoApply?: boolean }): Promise<{ ok: boolean; text: string }> {
  const before = readUpdateState()
  const sections = statusSections(before, readInstallerHandoff())
  const check = await requestDesktopUpdate('check', undefined, 90_000)
  if (!check.ok) {
    if (check.error !== undefined) sections.push({ title: '本次检查失败', lines: [check.error] })
    return { ok: false, text: formatCommandReport(false, '检查并升级桌面 · 检查失败', sections) }
  }
  // The fresh check rewrote the state file — re-read so the card shows the
  // latest verdict, not the pre-check snapshot.
  const fresh = readUpdateState()
  const sectionsFresh = statusSections(fresh, readInstallerHandoff())
  if (check.check?.status !== 'available') {
    return { ok: true, text: formatCommandReport(true, '检查并升级桌面 · 已是最新', sectionsFresh) }
  }

  let choice: UpdateChoice | 'unavailable' = opts?.autoApply === true ? 'upgrade' : 'unavailable'
  if (opts?.autoApply !== true && ask !== undefined) {
    choice = await ask()
  }
  if (choice !== 'upgrade') {
    sectionsFresh.push({
      title: '待升级',
      lines: [
        ...(choice === 'cancel' ? ['你选择了暂不升级；需要时再敲一次 /baf-update'] : ['当前没有弹窗通道（独立 CLI）；升级可运行 `baf update --apply` 或在桌面会话里再敲 /baf-update']),
      ],
    })
    return { ok: true, text: formatCommandReport(true, '检查并升级桌面 · 有可用更新（未升级）', sectionsFresh) }
  }

  const apply = await requestDesktopUpdate('apply')
  const applySections: Array<{ title: string; lines: string[] }> = []
  if (apply.apply !== undefined) {
    applySections.push({
      title: '分 scope 结果',
      lines: apply.apply.scopes.map(s => `${SCOPE_ZH[s.scope] ?? s.scope}（${ACTION_ZH[s.action] ?? s.action}）：${s.ok ? '成功' : `失败${s.rolledBack === true ? '（已回滚）' : ''}${s.error === undefined ? '' : ` — ${s.error}`}`}`),
    })
    applySections.push({
      title: '当前版本',
      lines: [
        `桌面：${apply.apply.versions.bafDsh}`,
        `运行时：${apply.apply.versions.dsh}`,
        `插件：${apply.apply.versions.bafPlugin}`,
        ...(apply.apply.launchedInstaller ? ['已交给系统安装器，请按向导完成升级'] : []),
      ],
    })
  }
  if (apply.error !== undefined) {
    applySections.push({ title: '失败原因', lines: [apply.error] })
  }
  return {
    ok: apply.ok,
    text: formatCommandReport(
      apply.ok,
      apply.ok ? '检查并升级桌面 · 升级完成' : '检查并升级桌面 · 升级失败',
      [...sectionsFresh, ...applySections],
    ),
  }
}

/**
 * `baf update rollback [scope]` — restore the scope's last-applied `.bak`.
 * Only hot scopes are addressable; the harness installer is OS-managed.
 * @param scope - `plugin`（默认）or `runtime`; other values get a refusal card.
 * @returns the card text.
 */
export async function runUpdateRollback(scope: string | undefined): Promise<{ ok: boolean; text: string }> {
  const normalized = scope === undefined ? 'plugin' : scope
  if (normalized !== 'plugin' && normalized !== 'runtime') {
    return {
      ok: false,
      text: formatCommandReport(false, '回滚更新 · 不支持该 scope', [{
        title: '可选 scope',
        lines: [
          'plugin（默认）：回滚插件包到上一次应用前',
          'runtime：回滚 DeepSeek Harness 运行时',
          'harness/desktop：由系统安装器管理，无应用内回滚（重新运行旧版安装包即可）',
          'baseline：Phase 10 之前不提供',
        ],
      }]),
    }
  }
  const response = await requestDesktopUpdate('rollback', normalized)
  const sections: Array<{ title: string; lines: string[] }> = []
  if (response.rollback !== undefined) {
    sections.push({
      title: '回滚结果',
      lines: [
        `scope：${response.rollback.scope}`,
        ...(response.rollback.fromVersion === undefined ? [] : [`回滚前版本：${response.rollback.fromVersion}`]),
        ...(response.rollback.toVersion === undefined ? [] : [`回到版本：${response.rollback.toVersion}`]),
      ],
    })
  }
  if (response.error !== undefined) {
    sections.push({ title: '失败原因', lines: [response.error] })
  }
  return {
    ok: response.ok,
    text: formatCommandReport(response.ok, response.ok ? '回滚更新 · 完成' : '回滚更新 · 失败', sections),
  }
}
