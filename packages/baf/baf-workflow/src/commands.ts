/**
 * Slash commands for BAF sessions (`/baf-help`, `/baf-status`, …).
 *
 * Naming follows a two-tier scheme:
 *   - **Core** (no middle segment): `/baf-help`, `/baf-welcome`,
 *     `/baf-gate`, `/baf-version`, `/baf-status`, `/baf-doctor`, `/baf-list` —
 *     entry / discovery / view surfaces used across every session. `/baf-welcome` is
 *     the §18.3 startup card (binding + toolchain probe); the preset's
 *     `baf-session-gate` row fires it once at session open, and the customer
 *     can reprint it any time.
 *   - **Go** (no middle segment): `/baf-go` and `/baf-go-confirm` — the
 *     auto-drive entries (§18 / §22.17). Both push the session to its next
 *     customer-action point; the two mandatory confirmation gates are the
 *     stop points. `/baf-go` pops the §22 interactive dialog where a popup
 *     channel exists; `/baf-go-confirm` takes the positive path directly.
 *   - **Workflow** (`baf-workflow-*`): the go-workflow stage commands
 *     (open / classify / clarify / design / plan / implement / verify /
 *     archive / abandon).
 *   - **Check** (`baf-check-*`): baseline machine gates (`quality`,
 *     `guard`).
 *
 * Descriptions drop the leading "BAF" prefix and end with a usage-frequency
 * mark (★★★ 常用 / ★★ 偶尔 / ★ 极少). Card titles mirror the description,
 * so the slash card and the picker line read as one.
 *
 * Mounted as a non-isolated preset row (like `@deepseek-ai/dsh-command-goal`)
 * so registration reaches the host `commands` service. Handlers use the
 * file-backed projection store — not the isolate-local `bafWorkflow` service.
 *
 * @module @deepseek-ai/dsh-baf-workflow/commands
 */

import type { Context } from '@deepseek-ai/cordis'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { formatCommandReport, modeZh } from './command-format.ts'
import { ProjectionStore } from './projection.ts'
import { resolveBafProductVersions } from './product-versions.ts'
import type { GuardPolicy, StackAdapter } from '@deepseek-ai/dsh-baf-core'
import {
  driveAbandon,
  driveArchive,
  driveClassify,
  driveClarify,
  driveDesign,
  driveGuard,
  driveImplement,
  driveOpen,
  drivePlan,
  driveQuality,
  driveResume,
  driveScaffold,
  driveVerify,
  type DriveAdapters,
  loadWorkspaceBaseline,
  renderDomainError,
} from './command-drives.ts'
import { driveGo } from './go-coordinator.ts'
import { makeGoDispatcher } from './go-dispatch.ts'
import { continueParkedRequirement } from './requirement-park.ts'
import { makeGateAsk, type GateDialogAgent } from './gate-dialog.ts'
import { renderGate } from './gate-cards.ts'
import { artifactLine, changeArtifactStatus } from './stages/gates.ts'
import { focusFor } from './session-focus.ts'
import {
  probeMountFlags,
  probeToolchain,
  renderProbeLines,
  renderWelcomeCard,
  resolveIsolateService,
  resolveScaffoldService,
  resolveStartupBinding,
  type GuardReportSummary,
} from './session-gate.ts'

export const name = 'baf-commands'
export const inject = ['commands']

/** Join a card title's description and optional runtime qualifier. */
function withHint(description: string, runtime?: string): string {
  return runtime === undefined ? description : `${description} · ${runtime}`
}

/** Shape of the args Cordis passes to a slash handler. The runtime agent also
 * carries its realm `ctx`; declared optional because only the probes read it.
 * `followup`/`status` are the §18.4.2 work-order channel — the live registry
 * `Agent` always has both, but this local structural view declares them
 * optional so a test double that only fills `session.header.cwd` (the shape
 * every existing probe uses) stays valid and simply cannot dispatch. */
type SlashHandlerArgs = {
  agent: {
    session: { header: { cwd?: string } }
    ctx?: Context
    followup?(message: UserMessage): void
    status?: 'idle' | 'running'
  }
  rawInput: string
}

/**
 * Run a stage drive for a slash handler, collapsing a thrown `BafError` into
 * the stable translated error card. /baf-go already did this inside
 * driveGo's top-level catch; the per-stage slashes returned the drive promise
 * directly, so a blocked drive (e.g. git-unavailable open) surfaced as a bare
 * host runner rejection instead of the「原因/处理」card — the customer saw no
 * card at all on exactly the steps that block most.
 */
async function guardedDrive(command: string, run: () => Promise<CommandResult>): Promise<CommandResult> {
  try {
    return await run()
  } catch (error) {
    return renderDomainError(command, error)
  }
}

const HELP_CORE = [
  '/baf-help           列出全部命令与用法 · ★★',
  '/baf-welcome        启动检查：工作区状态 + 环境体检 · ★★',
  '/baf-gate           重新弹出确认卡（如初始化确认） · ★★',
  '/baf-scaffold       初始化工作区（缺配置时用它） · ★★',
  '/baf-status         查看当前变更：模式/阶段/分类 · ★★★',
  '/baf-version        查看桌面/插件版本（对齐设置页） · ★',
  '/baf-doctor         工作流自检：工作区/环境/注册 · ★',
  '/baf-list           列出工作区全部变更（含已归档/已放弃） · ★★',
] as const

const HELP_FLOW = [
  '/baf-go                     自动推进到下一个需要你确认的点 · ★★★',
  '/baf-go-confirm             不弹确认框，直接继续工作流 · ★★',
  '/baf-workflow-open         启动变更：先分类 · ★★★',
  '/baf-workflow-classify     分类确认 / 重新描述 · ★★',
  '/baf-workflow-clarify      澄清阶段：把需求问清楚 · ★★',
  '/baf-workflow-design       设计阶段：写设计文档 · ★★',
  '/baf-workflow-plan         计划阶段：拆任务 · ★★',
  '/baf-workflow-implement    实现阶段：进入/完成 · ★★★',
  '/baf-workflow-verify       验证阶段：跑检查 · ★★★',
  '/baf-workflow-archive      归档变更（需 confirm） · ★★★',
  '/baf-workflow-abandon      放弃变更（需 confirm） · ★',
  '/baf-workflow-resume       流程偏差后退回指定阶段重做 · ★★★',
] as const

const HELP_CHECK = [
  '/baf-check-quality    基线 C 栈质量检查 · ★★',
  '/baf-check-guard      安全检查（verify + 密钥扫描） · ★★',
] as const

const USAGE = [
  '1. 新建会话，选「BAF 模式」',
  '2. 打开「工作流」页签 →「新建变更」，或直接描述需求',
  '3. 分类确认后再改代码；阶段由系统推进，勿口头宣称完成',
] as const

const MODE_LINES = [
  '模式由分类确认决定（不是另开一套命令）：',
  '  · 模板 = 还没有进行中的变更时的参考图',
  '  · full-go-path = 完整流程（新需求 / 高风险）',
  '  · bug-fix-path = 缺陷修复路径（低风险 Bug，更快）',
  '  · clarify-required = 信息不足，先澄清',
  '同一工作区可有多条变更，但一条变更只有一种模式；',
  '缺陷修复路径若风险扩大，在同一变更内升级为完整流程（无需新开会话）。',
] as const

/**
 * Register BAF slash commands into the receiving agent's command layer.
 * @param ctx - agent standing-mount context with `commands`.
 */
export function apply(ctx: Context): void {
  const offs = [
    ctx.commands.register({
      name: 'baf-help',
      description: '列出全部指令与用法 · ★★',
      handler: (): CommandResult => ({
        kind: 'success',
        text: formatCommandReport(true, withHint('列出全部指令与用法 · ★★'), [
          { title: '核心', lines: HELP_CORE },
          { title: '流程', lines: HELP_FLOW },
          { title: '检查', lines: HELP_CHECK },
          { title: '怎么用', lines: USAGE },
          { title: '模式说明', lines: MODE_LINES },
        ]),
      }),
    }),
    ctx.commands.register({
      name: 'baf-welcome',
      description: '启动检查：工作区状态 + 环境体检 · ★★',
      handler: async ({ agent }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-welcome')
        // Read-only by construction: the card reports the candidates and never
        // binds one (§18.6 guard 4 — adoption is the customer's call, and the
        // gate is exactly where they make it).
        const [probe, binding] = await Promise.all([
          probeToolchain(cwd, probeMountFlags(ctx, agent)),
          resolveStartupBinding(cwd),
        ])
        // Run the same `baf-guard` sweep the verify stage uses, so the
        // welcome card tells the customer at session-open whether the
        // environment is clean — instead of silently dropping the check when
        // everything is OK (2026-09-20 incident 4.jsonl). Guard may be
        // absent (CLI / tests); degraded summary surfaces as 已跳过, not as
        // an error.
        const guardSummary = await runGuardSummary(cwd, resolveAdapters(ctx, agent, cwd))
        return renderWelcomeCard({ cwd, probe, binding, ...(guardSummary === undefined ? {} : { guardSummary }) })
      },
    }),
    ctx.commands.register({
      name: 'baf-gate',
      description: '重新弹出确认卡（如初始化确认） · ★★',
      handler: ({ rawInput }: SlashHandlerArgs): CommandResult => {
        const gateId = rawInput.trim()
        if (gateId === '') {
          return {
            kind: 'error',
            text: formatCommandReport(false, withHint('重新弹出确认卡（如初始化确认） · ★★', '缺少确认项名称'), [
              {
                title: '用法',
                lines: ['/baf-gate scaffold | intake-classify | design-confirm | verify-archive | abandon | resume'],
              },
            ]),
          }
        }
        // Read-only by construction: `renderGate` only reads the §22 registry
        // (unknown ids come back as its structured refusal card). Resolution
        // stays with the mapped drive commands / Tab buttons (§22.9).
        return renderGate(gateId)
      },
    }),
    ctx.commands.register({
      name: 'baf-go',
      description: '自动驱动到下一个客户确认点 · ★★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-go')
        // §22.17: with a `userQuestions` answerer mounted (desktop GUI),
        // /baf-go pops the §22 interactive dialog at each park point. The
        // runtime agent object is the live registry Agent (commands pass it
        // whole); the local structural type cannot express the branded id,
        // hence the single cast.
        const ask = makeGateAsk(ctx, agent as unknown as GateDialogAgent | undefined)
        // §18.4.2: a typed command is a customer action — the dispatcher plus
        // the origin marker together authorize the work order (2026-09-23
        // issue #1 widened the surface: gate-dialog and Tab clicks build the
        // same pair where they have a live agent).
        const dispatch = makeGoDispatcher(cwd, agent)
        const adapters = resolveDriveAdapters(ctx, agent, cwd)
        const result = await driveGo({
          cwd,
          rawInput,
          focus: focusFor(cwd),
          ...(ask === undefined ? {} : { ask }),
          ...(dispatch === undefined ? {} : { dispatch, dispatchOrigin: 'customer' as const }),
          adapters,
        })
        // 【变更】2026-09-23 (demo2 user issue #1): the parked-requirement
        // continuation. A /baf-go that just resolved the scaffold gate (or one
        // typed into an initialized-but-idle workspace whose requirement never
        // landed) used to dead-end: the next decision — 新建工作流 → 分类确认 —
        // never popped and the model was never woken. With a parked statement
        // this run continues the chain itself, so the command keeps driving
        // the flow end to end without the customer re-typing the requirement.
        const follow = await continueParkedRequirement(ctx, agent, cwd, adapters)
        if (follow !== undefined) return { kind: follow.kind, text: `${result.text}\n\n${follow.text}` }
        return result
      },
    }),
    ctx.commands.register({
      name: 'baf-go-confirm',
      description: '不弹确认框，直接继续工作流 · ★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-go-confirm')
        // §22.17 confirm mode: take the positive path at the resting gate
        // (scaffold init / intake confirm / gates A+B unlock) without any
        // popup. Drift still asks — auto-picking a rollback node is §19's
        // one forbidden shortcut.
        // 【变更】2026-09-23 (user issue #1): the customer typed this command,
        // so its confirm path dispatches too — a confirm that advances into a
        // template rest must wake the model exactly like /baf-go would.
        const dispatch = makeGoDispatcher(cwd, agent)
        const adapters = resolveDriveAdapters(ctx, agent, cwd)
        const result = await driveGo({
          cwd,
          rawInput,
          focus: focusFor(cwd),
          confirm: true,
          ...(dispatch === undefined ? {} : { dispatch, dispatchOrigin: 'customer' as const }),
          adapters,
        })
        // 【变更】2026-09-23 (demo2 user issue #1): same continuation as /baf-go
        // — a /baf-go-confirm that just initialized the workspace picks the
        // parked requirement back up. The 新建工作流 confirmation still pops
        // (spec §1: create/bind settles on a card, even in confirm mode).
        const follow = await continueParkedRequirement(ctx, agent, cwd, adapters)
        if (follow !== undefined) return { kind: follow.kind, text: `${result.text}\n\n${follow.text}` }
        return result
      },
    }),
    ctx.commands.register({
      name: 'baf-version',
      description: '查看桌面/插件版本（对齐设置页） · ★',
      handler: (): CommandResult => {
        const v = resolveBafProductVersions()
        return {
          kind: 'success',
          text: formatCommandReport(true, withHint('查看桌面/插件版本（对齐设置页） · ★', v.bafDsh), [
            {
              title: '与设置「版本与更新」对齐',
              lines: [
                `BAF DSH DESKTOP: ${v.bafDsh}`,
                ...(v.bafDshNotes ? [`  · ${v.bafDshNotes}`] : []),
                `DeepSeek Harness: ${v.dsh}`,
                ...(v.dshNotes ? [`  · ${v.dshNotes}`] : []),
              ],
            },
            {
              title: 'BAF 核心包（工作流本体，各自独立 semver）',
              lines: [
                `@deepseek-ai/dsh-baf-core: ${v.bafCore}`,
                ...(v.bafCoreNotes ? [`  · ${v.bafCoreNotes}`] : []),
                `@deepseek-ai/dsh-baf-workflow: ${v.bafWorkflow}`,
                ...(v.bafWorkflowNotes ? [`  · ${v.bafWorkflowNotes}`] : []),
              ],
            },
            {
              title: 'BAF 子包',
              lines: [
                `@deepseek-ai/dsh-baf-openspec: ${v.bafOpenspec}`,
                ...(v.bafOpenspecNotes ? [`  · ${v.bafOpenspecNotes}`] : []),
              ],
            },
            {
              title: '来源',
              lines: [
                v.source,
                '桌面 bump：overlay/desktop/VERSION（npm run bump-desktop -- <X.Y.Z>）',
              ],
            },
          ]),
        }
      },
    }),
    ctx.commands.register({
      name: 'baf-status',
      description: '查看当前变更：模式/阶段/intake · ★★★',
      handler: async ({ agent }): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') {
          return {
            kind: 'error',
            text: formatCommandReport(false, withHint('查看当前变更：模式/阶段/intake · ★★★', '缺少工作区'), [
              { title: '原因', lines: ['当前会话没有 cwd，无法读取 .baf/projection'] },
              { title: '处理', lines: ['为会话绑定工作区目录后重试 /baf-status'] },
            ]),
          }
        }
        const store = new ProjectionStore({ workspaceRoot: cwd })
        const index = await store.readIndex()
        const ids = index.changes.map(c => c.changeId)
        if (ids.length === 0) {
          return {
            kind: 'success',
            text: formatCommandReport(true, withHint('查看当前变更：模式/阶段/intake · ★★★', '模板（空闲）· 无活动变更'), [
              { title: '工作区', lines: [`cwd: ${cwd}`] },
              {
                title: '变更',
                lines: [
                  '（无）— 流程图为参考模板',
                  '下一步：工作流页签「新建变更」，或对话描述需求',
                ],
              },
              { title: '模式说明', lines: MODE_LINES },
            ]),
          }
        }
        // 【变更】2026-09-23 (user issue #4): the pick mirrors driveGo's
        // binding — focus (while active) → lone active → newest active — so
        // /baf-status can never name a different change than the /baf-go the
        // customer types right after it (the old lexical-last pick reported
        // the active change while a stale focus dead-ended /baf-go on a
        // terminal one).
        const focused = focusFor(cwd).get()
        const actives = index.changes.filter(c => c.current !== 'completed' && c.current !== 'abandoned')
        const newest = [...index.changes].sort((a, b) =>
          a.seq !== b.seq ? b.seq - a.seq : a.changeId.localeCompare(b.changeId))[0]?.changeId
        const changeId = focused !== undefined && actives.some(c => c.changeId === focused)
          ? focused
          : actives.length === 1 ? actives[0]?.changeId
            : actives.length > 1
              ? [...actives].sort((a, b) =>
                a.seq !== b.seq ? b.seq - a.seq : a.changeId.localeCompare(b.changeId))[0]?.changeId
              // Everything terminal: still report the most recently ended
              // change (with its terminal state) rather than an empty card.
              : newest
        if (changeId === undefined) {
          return {
            kind: 'success',
            text: formatCommandReport(true, withHint('查看当前变更：模式/阶段/intake · ★★★', '模板（空闲）· 无活动变更'), [
              { title: '工作区', lines: [`cwd: ${cwd}`] },
              { title: '变更', lines: ['（无）'] },
            ]),
          }
        }
        const status = await store.readStatus(changeId)
        const others = index.changes
          .filter(c => c.changeId !== changeId)
          .map(c => `${c.changeId} · ${modeZh(c.mode)} · ${String(c.current)}`)
        // 产物状态（2026-09-21 用户需求 3）：每个文档产物一行——路径 + 状态，
        // 让 /baf-status 成为「不用敲 /baf-go 也能看清门挡在哪」的主动查询面。
        const artifactRows = await changeArtifactStatus({
          workspaceRoot: cwd,
          changeId,
          mode: status.mode === 'bug-fix-path' ? 'bug-fix-path' : 'full-go-path',
        })
        return {
          kind: 'success',
          text: formatCommandReport(
            true,
            withHint('查看当前变更：模式/阶段/intake · ★★★', `${modeZh(status.mode)} · 当前 ${status.current}`),
            [
              {
                title: '焦点变更',
                lines: [
                  `change: ${status.changeId}`,
                  `mode: ${status.mode}（${modeZh(status.mode)}）`,
                  `current: ${status.current}`,
                  `projection: v${status.projectionVersion}`,
                  status.intake === undefined
                    ? 'intake: （无）'
                    : `intake: ${status.intake.kind} / ${status.intake.mode} / ${status.intake.confirmation}`,
                ],
              },
              { title: '产物', lines: artifactRows.map(artifactLine) },
              {
                title: '同工作区其他变更',
                lines: others.length === 0 ? ['（无）'] : others,
              },
              { title: '工作区', lines: [`cwd: ${cwd}`] },
              { title: '模式说明', lines: MODE_LINES },
            ],
          ),
        }
      },
    }),
    ctx.commands.register({
      name: 'baf-list',
      description: '列出工作区全部变更（含已归档/已放弃） · ★★',
      handler: async ({ agent }): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') {
          return {
            kind: 'error',
            text: formatCommandReport(false, withHint('列出工作区全部变更（含已归档/已放弃） · ★★', '缺少工作区'), [
              { title: '原因', lines: ['当前会话没有 cwd'] },
            ]),
          }
        }
        const store = new ProjectionStore({ workspaceRoot: cwd })
        const index = await store.readIndex()
        const rows = index.changes.map(c => `${c.changeId} · ${modeZh(c.mode)} · ${String(c.current)} · ${c.updatedAt}`)
        return {
          kind: 'success',
          text: formatCommandReport(true, withHint('列出工作区全部变更（含已归档/已放弃） · ★★', `${rows.length} 条变更`), [
            { title: '变更', lines: rows.length === 0 ? ['（无）'] : rows },
            { title: '工作区', lines: [`cwd: ${cwd}`] },
          ]),
        }
      },
    }),
    ctx.commands.register({
      name: 'baf-doctor',
      description: '工作流自检：cwd/工具链/注册 · ★',
      handler: async ({ agent }): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        const cwdOk = cwd !== undefined && cwd !== ''
        // Same probe and same renderer as the welcome card (§18.3.2), so
        // "doctor disagrees with the startup card" cannot happen. The probe
        // cache makes the second call free within one session open.
        const probe = cwdOk ? await probeToolchain(cwd, probeMountFlags(ctx, agent)) : undefined
        return {
          kind: cwdOk ? 'success' : 'error',
          text: formatCommandReport(
            cwdOk,
            withHint('工作流自检：cwd/工具链/注册 · ★', cwdOk ? '通过' : '缺少工作区'),
            [
              {
                title: '检查项',
                lines: [
                  `session cwd: ${cwdOk ? cwd : '（missing）'}`,
                  'commands: registered（本指令已执行即证明注册成功）',
                  'workflow tab: 请打开会话「工作流」页签核对流程图',
                ],
              },
              ...(probe === undefined ? [] : [{ title: '工具链体检', lines: renderProbeLines(probe) }]),
              {
                title: '续跑提示',
                lines: [
                  '状态落在工作区 .baf/projection/，与会话 id 无关',
                  '同 cwd 新开会话可继续；换机需同步该目录（或整仓）',
                ],
              },
            ],
          ),
        }
      },
    }),
    ...(['workflow-open'] as const).map(stage => ctx.commands.register({
      name: `baf-${stage}`,
      description: '启动变更：先分类 · ★★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-workflow-open')
        return guardedDrive('/baf-workflow-open', () => driveOpen(cwd, rawInput))
      },
    })),
    ctx.commands.register({
      name: 'baf-workflow-classify',
      description: '分类确认 · ★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-workflow-classify')
        return guardedDrive('/baf-workflow-classify', () => driveClassify(cwd, rawInput))
      },
    }),
    ctx.commands.register({
      name: 'baf-workflow-clarify',
      description: '澄清阶段（N2） · ★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-workflow-clarify')
        return guardedDrive('/baf-workflow-clarify', () => driveClarify(cwd, rawInput))
      },
    }),
    ctx.commands.register({
      name: 'baf-workflow-design',
      description: '设计阶段（N3） · ★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-workflow-design')
        return guardedDrive('/baf-workflow-design', () => driveDesign(cwd, rawInput))
      },
    }),
    ctx.commands.register({
      name: 'baf-workflow-plan',
      description: '计划阶段（N4） · ★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-workflow-plan')
        return guardedDrive('/baf-workflow-plan', () => drivePlan(cwd, rawInput))
      },
    }),
    ctx.commands.register({
      name: 'baf-workflow-implement',
      description: '实现阶段（N5 进入/完成） · ★★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-workflow-implement')
        return guardedDrive('/baf-workflow-implement', () => driveImplement(cwd, rawInput))
      },
    }),
    ctx.commands.register({
      name: 'baf-workflow-verify',
      description: '验证阶段（N6） · ★★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-workflow-verify')
        const { stack, guard } = resolveAdapters(ctx, agent, cwd)
        return guardedDrive('/baf-workflow-verify', () => driveVerify(cwd, rawInput, { ...(stack === undefined ? {} : { stack }), ...(guard === undefined ? {} : { guard }) }))
      },
    }),
    ctx.commands.register({
      name: 'baf-workflow-archive',
      description: '归档变更（N7/T14，需 confirm） · ★★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-workflow-archive')
        return guardedDrive('/baf-workflow-archive', () => driveArchive(cwd, rawInput))
      },
    }),
    ctx.commands.register({
      name: 'baf-workflow-abandon',
      description: '放弃变更（T16，需 confirm） · ★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-workflow-abandon')
        return guardedDrive('/baf-workflow-abandon', () => driveAbandon(cwd, rawInput))
      },
    }),
    ctx.commands.register({
      name: 'baf-workflow-resume',
      description: 'drift 复位（T13，需选目标节点） · ★★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-workflow-resume')
        return guardedDrive('/baf-workflow-resume', () => driveResume(cwd, rawInput))
      },
    }),
    ctx.commands.register({
      name: 'baf-check-quality',
      description: '基线 C 栈质量检查 · ★★',
      handler: async ({ agent }): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-check-quality')
        const { stack } = resolveAdapters(ctx, agent, cwd)
        return guardedDrive('/baf-check-quality', () => driveQuality(cwd, { ...(stack === undefined ? {} : { stack }) }))
      },
    }),
    ctx.commands.register({
      name: 'baf-check-guard',
      description: '安全门禁（verify + secret-scan） · ★★',
      handler: async ({ agent }): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-check-guard')
        const { guard } = resolveAdapters(ctx, agent, cwd)
        return guardedDrive('/baf-check-guard', () => driveGuard(cwd, { ...(guard === undefined ? {} : { guard }) }))
      },
    }),
    ctx.commands.register({
      name: 'baf-scaffold',
      description: '初始化工作区（缺配置时用它） · ★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-scaffold')
        // Per §22.4: this slash is the human-confirmation trigger; the drive
        // is unconditional at humanConfirmed:true. The scaffold service sits
        // in the baf-domain isolate — invisible to both this row ctx and the
        // agent realm — so it resolves through resolveScaffoldService
        // (agentPresets.serviceFor first; plain get as the fallback for
        // host-only compositions like tests and CLI).
        const scaffold = resolveScaffoldService(ctx, agent)
        if (scaffold === undefined) {
          return {
            kind: 'error',
            text: formatCommandReport(false, withHint('初始化工作区（缺配置时用它） · ★★', '初始化服务没有加载'), [
              { title: '原因', lines: ['工作区初始化需要的组件没有加载到当前会话'] },
              { title: '处理', lines: ['请在设置里启用 BAF 工作流预设（含全部 BAF 组件）后，重新打开本会话再试'] },
            ]),
          }
        }
        const baselineId = rawInput.trim() === '' ? 'baf-baseline-init' : rawInput.trim()
        return guardedDrive('/baf-scaffold', () => driveScaffold(cwd, { scaffold: { scaffold: opts => scaffold.scaffold(opts) } }, baselineId))
      },
    }),
  ]

  ctx.effect(() => () => {
    for (const off of offs) off()
  }, 'baf-commands: unregister')
}

/** Standard missing-cwd error card for any /baf-* drive. */
function missingCwd(command: string): CommandResult {
  return {
    kind: 'error',
    text: formatCommandReport(false, `${command} · 缺少工作区`, [
      { title: '原因', lines: ['当前会话没有 cwd，无法读取 .baf/projection'] },
      { title: '处理', lines: ['为会话绑定工作区目录后重试'] },
    ]),
  }
}

/**
 * Run the `baf-guard` sweep for the welcome card. The returned summary is
 * plain-Chinese: "通过 · 受检 0 个文件" or "未通过 · …" with one actionable
 * hint, so the customer sees the environment's health at session open.
 * Returns undefined when the `baf-guard` service is not mounted (CLI / tests);
 * the welcome card then skips the 【安全检查】 section entirely instead of
 * printing an error.
 *
 * Failures degrade to `state: 'fail'` with the guard's own reason codes
 * translated to plain language — never to an exception that would skip the
 * welcome card.
 * @param cwd - workspace root.
 * @param adapters - already-resolved drive adapters (may have no `guard`).
 * @returns summary, or undefined when the service is absent.
 */
async function runGuardSummary(cwd: string, adapters: { guard?: GuardPolicy }): Promise<GuardReportSummary | undefined> {
  if (adapters.guard === undefined) return undefined
  try {
    const baseline = await loadWorkspaceBaseline(cwd)
    if (baseline === undefined) {
      return {
        state: 'ok',
        detail: '工作区还未初始化，本次只检查密钥风险',
        hint: '完整检查要在 /baf-scaffold 完成初始化后再跑',
      }
    }
    const signal = new AbortController().signal
    const [verifyReport, secretReport] = await Promise.all([
      adapters.guard.check({ workspace: { root: cwd }, baseline, paths: [], action: 'verify' }, signal),
      adapters.guard.check({ workspace: { root: cwd }, baseline, paths: [], action: 'secret-scan' }, signal),
    ])
    const ok = verifyReport.allowed && secretReport.allowed
    const reasons = [...verifyReport.reasonCodes, ...secretReport.reasonCodes]
    if (ok) {
      return {
        state: 'ok',
        detail: '未发现越界改动，也没有扫描到密钥',
      }
    }
    const reason = reasons.length === 0
      ? '检查服务拒绝了当前工作区'
      : translateGuardReasons(reasons)
    return {
      state: 'fail',
      detail: reason,
      hint: '查看详情：/baf-check-guard；解锁方式看上一行说明',
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      state: 'fail',
      detail: `安全检查执行失败：${message}`,
      hint: '稍后再试；或输入 /baf-check-guard 复跑一次',
    }
  }
}

/** Translate a list of `baf-guard` reason codes into a single plain sentence. */
function translateGuardReasons(reasons: readonly string[]): string {
  const first = reasons[0]
  if (first === undefined) return '检查服务拒绝了当前工作区'
  if (first.toLowerCase().includes('secret')) return '扫描到了疑似密钥的字符串'
  if (first.toLowerCase().includes('path') || first.toLowerCase().includes('allowlist')) {
    return '改动了工作区白名单之外的文件'
  }
  if (first.toLowerCase().includes('baseline')) return '工作区基线配置有问题'
  return `检查未通过：${first}`
}

/**
 * Resolve the optional StackAdapter / GuardPolicy services for verify/quality/guard.
 *
 * These come from sibling `baf-quality` and `baf-guard` rows, which sit in
 * the baf-domain **isolate** — invisible to both the row ctx and the agent
 * realm ctx — so they resolve through {@link resolveIsolateService}
 * (`agentPresets.serviceFor`), with plain `ctx.get` as the fallback for
 * non-isolate compositions (tests, CLI). Absent services return undefined —
 * drives tolerate that and surface a clear 「服务未挂载」 card to the caller.
 */
function resolveAdapters(ctx: Context, agent: { ctx?: Context } | undefined, cwd: string): { stack?: StackAdapter; guard?: GuardPolicy } {
  const quality = resolveIsolateService<{ adapter(): StackAdapter }>(ctx, agent, 'bafQuality')
  const guard = resolveIsolateService<{ policy(root: string): GuardPolicy }>(ctx, agent, 'bafGuard')
  return {
    ...(quality === undefined ? {} : { stack: quality.adapter() }),
    ...(guard === undefined ? {} : { guard: guard.policy(cwd) }),
  }
}

/**
 * Full adapter set for the §18 coordinator: stack/guard (verify wiring) plus
 * the scaffold adapter the §22.17 dialog needs when the customer clicks
 * 「初始化工作区」. All three services sit in the baf-domain isolate and
 * resolve through {@link resolveIsolateService}; the scaffold service's own
 * `scaffold(opts)` method already satisfies the `ScaffoldAdapter` shape.
 */
function resolveDriveAdapters(ctx: Context, agent: { ctx?: Context }, cwd: string): DriveAdapters {
  const { stack, guard } = resolveAdapters(ctx, agent, cwd)
  const scaffold = resolveScaffoldService(ctx, agent)
  return {
    ...(stack === undefined ? {} : { stack }),
    ...(guard === undefined ? {} : { guard }),
    ...(scaffold === undefined ? {} : { scaffold }),
  }
}

// Named exports only (no `default`): loader `unwrapExports` would otherwise
// return just `apply` and drop `inject`, breaking preset mount.
