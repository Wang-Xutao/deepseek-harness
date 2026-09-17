/**
 * Slash commands for BAF sessions (`/baf-help`, `/baf-status`, …).
 *
 * Naming follows a two-tier scheme:
 *   - **Core** (no middle segment): `/baf-help`, `/baf-welcome`,
 *     `/baf-version`, `/baf-status`, `/baf-doctor`, `/baf-list` — entry /
 *     discovery / view surfaces used across every session. `/baf-welcome` is
 *     the §18.3 startup card (binding + toolchain probe); the preset's
 *     `baf-session-gate` row fires it once at session open, and the customer
 *     can reprint it any time.
 *   - **Go** (no middle segment): `/baf-go` — the single auto-drive entry
 *     (§18). Pushes the session to its next customer-action point; the two
 *     mandatory confirmation gates are its stop points, and there is
 *     deliberately no `/baf-go confirm`.
 *   - **Workflow** (`baf-workflow-*`): the go-workflow stage commands
 *     (open / classify / clarify / design / plan / implement / verify /
 *     archive / abandon).
 *   - **Check** (`baf-check-*`): baseline machine gates (`quality`,
 *     `guard`).
 *
 * Descriptions drop the leading "BAF" prefix and end with a usage-frequency
 * mark (★★★ 常用 / ★★ 偶尔 / ★ 极少). Card titles mirror the description
 * and append the standardize expand/collapse hint
 * `点本行展开/折叠指令全文`, so the slash card and the picker line read as
 * one.
 *
 * Mounted as a non-isolated preset row (like `@deepseek-ai/dsh-command-goal`)
 * so registration reaches the host `commands` service. Handlers use the
 * file-backed projection store — not the isolate-local `bafWorkflow` service.
 *
 * @module @deepseek-ai/dsh-baf-workflow/commands
 */

import type { Context } from '@deepseek-ai/cordis'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
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
  driveVerify,
} from './command-drives.ts'
import { driveGo } from './go-coordinator.ts'
import { focusFor } from './session-focus.ts'
import {
  probeMountFlags,
  probeToolchain,
  renderProbeLines,
  renderWelcomeCard,
  resolveStartupBinding,
} from './session-gate.ts'

export const name = 'baf-commands'
export const inject = ['commands']

/** Append the standard expand/collapse hint to a card title. */
function withHint(description: string, runtime?: string): string {
  return runtime === undefined
    ? `${description} · 点本行展开/折叠指令全文`
    : `${description} · ${runtime} · 点本行展开/折叠指令全文`
}

/** Shape of the args Cordis passes to a slash handler. */
type SlashHandlerArgs = {
  agent: { session: { header: { cwd?: string } } }
  rawInput: string
}

const HELP_CORE = [
  '/baf-help           列出全部指令与用法 · ★★',
  '/baf-welcome        会话启动卡：绑定 + 工具链体检 · ★★',
  '/baf-status         查看当前变更：模式/阶段/intake · ★★★',
  '/baf-version        查看桌面/插件版本（对齐设置页） · ★',
  '/baf-doctor         工作流自检：cwd/工具链/注册 · ★',
  '/baf-list           列出工作区全部变更（含已归档/已放弃） · ★★',
] as const

const HELP_FLOW = [
  '/baf-go                     自动驱动到下一个客户确认点 · ★★★',
  '/baf-workflow-open         启动变更：intake 分类 · ★★★',
  '/baf-workflow-classify     分类确认 / 拒绝 · ★★',
  '/baf-workflow-clarify      澄清阶段（N2） · ★★',
  '/baf-workflow-design       设计阶段（N3） · ★★',
  '/baf-workflow-plan         计划阶段（N4） · ★★',
  '/baf-workflow-implement    实现阶段（N5 进入/完成） · ★★★',
  '/baf-workflow-verify       验证阶段（N6） · ★★★',
  '/baf-workflow-archive      归档变更（N7/T14，需 confirm） · ★★★',
  '/baf-workflow-abandon      放弃变更（T16，需 confirm） · ★',
  '/baf-workflow-resume       drift 复位（T13，需选目标节点） · ★★★',
] as const

const HELP_CHECK = [
  '/baf-check-quality    基线 C 栈质量检查 · ★★',
  '/baf-check-guard      安全门禁（verify + secret-scan） · ★★',
] as const

const USAGE = [
  '1. 新建会话，选「BAF 模式」',
  '2. 打开「工作流」页签 →「新建变更」，或直接描述需求',
  '3. 分类确认后再改代码；阶段由 domain service 推进，勿口头宣称完成',
] as const

const MODE_LINES = [
  '模式由 intake 分类确认决定（不是另开一套 slash）：',
  '  · 模板 = 尚无活动变更时的参考图',
  '  · full-go = 完整流程（新需求 / 高风险）',
  '  · bug-fast-path = 缺陷快路径（低风险 Bug）',
  '  · clarify-required = 信息不足，先澄清',
  '同一工作区可有多条变更，但一条变更只有一种模式；',
  '快路径若风险扩大，在同一变更内升级为 full-go（无需新开会话）。',
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
      description: '会话启动卡：绑定 + 工具链体检 · ★★',
      handler: async ({ agent }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-welcome')
        // Read-only by construction: the card reports the candidates and never
        // binds one (§18.6 guard 4 — adoption is the customer's call, and the
        // gate is exactly where they make it).
        const [probe, binding] = await Promise.all([
          probeToolchain(cwd, probeMountFlags(ctx)),
          resolveStartupBinding(cwd),
        ])
        return renderWelcomeCard({ cwd, probe, binding })
      },
    }),
    ctx.commands.register({
      name: 'baf-go',
      description: '自动驱动到下一个客户确认点 · ★★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-go')
        const { stack, guard } = resolveAdapters(ctx, cwd)
        return driveGo({
          cwd,
          rawInput,
          focus: focusFor(cwd),
          adapters: {
            ...(stack === undefined ? {} : { stack }),
            ...(guard === undefined ? {} : { guard }),
          },
        })
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
              title: 'BAF 插件包（各自独立 semver）',
              lines: [
                `@deepseek-ai/dsh-baf-core: ${v.bafCore}`,
                ...(v.bafCoreNotes ? [`  · ${v.bafCoreNotes}`] : []),
                `@deepseek-ai/dsh-baf-workflow: ${v.bafWorkflow}`,
                ...(v.bafWorkflowNotes ? [`  · ${v.bafWorkflowNotes}`] : []),
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
        const changeId = ids.at(-1)
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
        return {
          kind: 'success',
          text: formatCommandReport(
            true,
            withHint('查看当前变更：模式/阶段/intake · ★★★', `${modeZh(status.mode)} · 当前 ${String(status.current)}`),
            [
              {
                title: '焦点变更',
                lines: [
                  `change: ${status.changeId}`,
                  `mode: ${status.mode}（${modeZh(status.mode)}）`,
                  `current: ${String(status.current)}`,
                  `projection: v${status.projectionVersion}`,
                  status.intake === undefined
                    ? 'intake: （无）'
                    : `intake: ${status.intake.kind} / ${status.intake.mode} / ${status.intake.confirmation}`,
                ],
              },
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
        const probe = cwdOk ? await probeToolchain(cwd, probeMountFlags(ctx)) : undefined
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
      description: '启动变更：intake 分类 · ★★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd(`/baf-${stage}`)
        return driveOpen(cwd, rawInput)
      },
    })),
    ctx.commands.register({
      name: 'baf-workflow-classify',
      description: '分类确认 / 拒绝 · ★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-workflow-classify')
        return driveClassify(cwd, rawInput)
      },
    }),
    ctx.commands.register({
      name: 'baf-workflow-clarify',
      description: '澄清阶段（N2） · ★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-workflow-clarify')
        return driveClarify(cwd, rawInput)
      },
    }),
    ctx.commands.register({
      name: 'baf-workflow-design',
      description: '设计阶段（N3） · ★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-workflow-design')
        return driveDesign(cwd, rawInput)
      },
    }),
    ctx.commands.register({
      name: 'baf-workflow-plan',
      description: '计划阶段（N4） · ★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-workflow-plan')
        return drivePlan(cwd, rawInput)
      },
    }),
    ctx.commands.register({
      name: 'baf-workflow-implement',
      description: '实现阶段（N5 进入/完成） · ★★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-workflow-implement')
        return driveImplement(cwd, rawInput)
      },
    }),
    ctx.commands.register({
      name: 'baf-workflow-verify',
      description: '验证阶段（N6） · ★★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-workflow-verify')
        const { stack, guard } = resolveAdapters(ctx, cwd)
        return driveVerify(cwd, rawInput, { ...(stack === undefined ? {} : { stack }), ...(guard === undefined ? {} : { guard }) })
      },
    }),
    ctx.commands.register({
      name: 'baf-workflow-archive',
      description: '归档变更（N7/T14，需 confirm） · ★★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-workflow-archive')
        return driveArchive(cwd, rawInput)
      },
    }),
    ctx.commands.register({
      name: 'baf-workflow-abandon',
      description: '放弃变更（T16，需 confirm） · ★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-workflow-abandon')
        return driveAbandon(cwd, rawInput)
      },
    }),
    ctx.commands.register({
      name: 'baf-workflow-resume',
      description: 'drift 复位（T13，需选目标节点） · ★★★',
      handler: async ({ agent, rawInput }: SlashHandlerArgs): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-workflow-resume')
        return driveResume(cwd, rawInput)
      },
    }),
    ctx.commands.register({
      name: 'baf-check-quality',
      description: '基线 C 栈质量检查 · ★★',
      handler: async ({ agent }): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-check-quality')
        const { stack } = resolveAdapters(ctx, cwd)
        return driveQuality(cwd, { ...(stack === undefined ? {} : { stack }) })
      },
    }),
    ctx.commands.register({
      name: 'baf-check-guard',
      description: '安全门禁（verify + secret-scan） · ★★',
      handler: async ({ agent }): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') return missingCwd('/baf-check-guard')
        const { guard } = resolveAdapters(ctx, cwd)
        return driveGuard(cwd, { ...(guard === undefined ? {} : { guard }) })
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
    text: formatCommandReport(false, `${command} · 缺少工作区 · 点本行展开/折叠指令全文`, [
      { title: '原因', lines: ['当前会话没有 cwd，无法读取 .baf/projection'] },
      { title: '处理', lines: ['为会话绑定工作区目录后重试'] },
    ]),
  }
}

/**
 * Resolve the optional StackAdapter / GuardPolicy services for verify/quality/guard.
 *
 * These come from sibling `baf-quality` and `baf-guard` packages when mounted.
 * Returns undefined entries for the absent ones — drives tolerate that and
 * surface a clear "服务未挂挂" card to the caller.
 */
function resolveAdapters(ctx: Context, cwd: string): { stack?: StackAdapter; guard?: GuardPolicy } {
  const stack = ctx.get('bafQuality')?.adapter()
  const guard = ctx.get('bafGuard')?.policy(cwd)
  return {
    ...(stack === undefined ? {} : { stack }),
    ...(guard === undefined ? {} : { guard }),
  }
}

// Named exports only (no `default`): loader `unwrapExports` would otherwise
// return just `apply` and drop `inject`, breaking preset mount.
