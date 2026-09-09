/**
 * Slash commands for BAF sessions (`/baf-help`, `/baf-status`, …).
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

export const name = 'baf-commands'
export const inject = ['commands']

const READY = [
  '/baf-help       显示本帮助（指令一览与用法）',
  '/baf-status     查看当前变更：模式 / 阶段 / intake',
  '/baf-version    查看 BAF 指令与预设版本信息',
  '/baf-doctor     快速自检：cwd、指令注册、页签提示',
] as const

const BUILDING = [
  '/baf-open /baf-classify /baf-clarify /baf-design /baf-plan',
  '/baf-implement /baf-verify /baf-archive /baf-abandon',
  '（请先用「工作流」页签完成分类与合法转换）',
] as const

const USAGE = [
  '1. 新建会话，选「BAF 模式」',
  '2. 打开「工作流」页签 →「新建变更」，或直接描述需求',
  '3. 确认分类后再改代码；阶段由系统推进，勿口头宣称完成',
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
      description: 'BAF 模式帮助（阶段说明与可用指令）',
      handler: (): CommandResult => ({
        kind: 'success',
        text: formatCommandReport(true, 'BAF 帮助 · 4 条可用指令 · 点本行展开全文', [
          { title: '可用指令', lines: READY },
          { title: '建设中', lines: BUILDING },
          { title: '怎么用', lines: USAGE },
          { title: '模式说明', lines: MODE_LINES },
        ]),
      }),
    }),
    ctx.commands.register({
      name: 'baf-version',
      description: '显示 BAF / 桌面 / 插件版本（对齐设置页）',
      handler: (): CommandResult => {
        const v = resolveBafProductVersions()
        return {
          kind: 'success',
          text: formatCommandReport(true, `BAF 版本 · BAF DSH DESKTOP ${v.bafDsh} · 点行可收起`, [
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
      description: '显示当前变更工作流状态',
      handler: async ({ agent }): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd
        if (cwd === undefined || cwd === '') {
          return {
            kind: 'error',
            text: formatCommandReport(false, 'BAF 状态 · 缺少工作区', [
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
            text: formatCommandReport(true, 'BAF 状态 · 模板（空闲）· 无活动变更', [
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
            text: formatCommandReport(true, 'BAF 状态 · 模板（空闲）· 无活动变更', [
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
            `BAF 状态 · ${modeZh(status.mode)} · 当前 ${String(status.current)}`,
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
      name: 'baf-doctor',
      description: '检查 BAF 工作流是否可用',
      handler: ({ agent }): CommandResult => {
        const cwd = agent.session.header.cwd
        const cwdOk = cwd !== undefined && cwd !== ''
        return {
          kind: cwdOk ? 'success' : 'error',
          text: formatCommandReport(
            cwdOk,
            cwdOk ? 'BAF 自检 · 通过' : 'BAF 自检 · 缺少工作区',
            [
              {
                title: '检查项',
                lines: [
                  `session cwd: ${cwdOk ? cwd : '（missing）'}`,
                  'commands: registered（本指令已执行即证明注册成功）',
                  'workflow tab: 请打开会话「工作流」页签核对流程图',
                ],
              },
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
    ...(['open', 'classify', 'clarify', 'design', 'plan', 'implement', 'verify', 'archive', 'abandon'] as const)
      .map(stage => ctx.commands.register({
        name: `baf-${stage}`,
        description: `BAF ${stage}（阶段驱动，建设中）`,
        handler: (): CommandResult => ({
          kind: 'error',
          text: formatCommandReport(false, `/baf-${stage} · 尚未实现`, [
            {
              title: '当前可用替代',
              lines: [
                '打开「工作流」页签完成分类确认与合法转换',
                '查询状态：/baf-status',
                '帮助：/baf-help',
              ],
            },
            {
              title: '计划',
              lines: [`阶段驱动指令 /baf-${stage} 将在后续 Phase 落地`],
            },
          ]),
        }),
      })),
  ]

  ctx.effect(() => () => {
    for (const off of offs) off()
  }, 'baf-commands: unregister')
}

// Named exports only (no `default`): loader `unwrapExports` would otherwise
// return just `apply` and drop `inject`, breaking preset mount.
