/**
 * 【变更】2026-10-21 (指令集 tab): the browser-side mirror of baf-workflow's
 * slash-command help tables — the 指令集 tab's flow chart lists, per workflow
 * state, every baf command available there with its purpose (desc, VERBATIM
 * from the HELP_* tables) and its effect (the client's supplementary line).
 *
 * Parity discipline (same contract as enterprise-docs-catalog.ts): `desc` and
 * `stars` are a byte-for-byte mirror of
 * `@deepseek-ai/dsh-baf-workflow/src/commands.ts` HELP_TABLES — the spec
 * deep-compares them, so editing the help text there without this file (or
 * vice versa) fails the build. `effect` and the `nodes` applicability are
 * THIS file's own product copy.
 * @module @deepseek-ai/dsh-client-ui-settings-baf-standard/client
 */
import type { EnterpriseDocNode } from './enterprise-docs-catalog.ts'

/** One baf slash command as the 指令集 tab renders it. */
export interface BafCommandEntry {
  /** The command verbatim, e.g. `/baf-go`. */
  readonly id: string
  /** Frequency rating from the HELP tables (1–3 stars). */
  readonly stars: 1 | 2 | 3
  /** Purpose — VERBATIM from baf-workflow's HELP tables (parity-checked). */
  readonly desc: string
  /** Effect — what actually happens when it runs (this catalog's copy). */
  readonly effect: string
  /** States the command is specific to; `[]` = global (any state). */
  readonly nodes: readonly EnterpriseDocNode[]
}

/** Commands bound to specific workflow states, in HELP order. */
export const BAF_COMMANDS: readonly BafCommandEntry[] = [
  {
    id: '/baf-workflow-open',
    stars: 3,
    desc: '启动变更：先分类',
    effect: '从需求开出一条新变更并先弹分类确认卡；分类定了，模式（完整流程/缺陷修复）也就定了。',
    nodes: ['intake', 'open'],
  },
  {
    id: '/baf-workflow-classify',
    stars: 2,
    desc: '分类确认 / 重新描述',
    effect: '重新弹出分类确认卡，改分类结论或补充需求描述；分类变化会同步切换变更模式。',
    nodes: ['open'],
  },
  {
    id: '/baf-workflow-clarify',
    stars: 2,
    desc: '澄清阶段：把需求问清楚',
    effect: '生成澄清问题清单，逐项向客户确认；全部澄清后需求即冻结，进入设计。',
    nodes: ['clarify'],
  },
  {
    id: '/baf-workflow-design',
    stars: 2,
    desc: '设计阶段：写设计文档',
    effect: '按企业设计文档模板产出设计稿并送评审；设计确认后进入计划阶段。',
    nodes: ['design'],
  },
  {
    id: '/baf-workflow-plan',
    stars: 2,
    desc: '计划阶段：拆任务',
    effect: '把设计拆成带验收标准的任务清单（plan.json），作为实现阶段的派单依据。',
    nodes: ['plan'],
  },
  {
    id: '/baf-workflow-implement',
    stars: 3,
    desc: '实现阶段：进入/完成',
    effect: '按任务清单逐项实现并勾掉任务；实现完成后停在验证门口等待检查。',
    nodes: ['implement'],
  },
  {
    id: '/baf-workflow-verify',
    stars: 3,
    desc: '验证阶段：跑检查',
    effect: '跑基线 C 栈质量检查与安全检查，逐项核对验收标准；全部通过才放行归档。',
    nodes: ['verify'],
  },
  {
    id: '/baf-workflow-archive',
    stars: 3,
    desc: '归档变更（需 confirm）',
    effect: '确认后把变更产物归档、解除会话绑定；工作区回到可开新变更的状态。',
    nodes: ['archive'],
  },
  {
    id: '/baf-workflow-abandon',
    stars: 1,
    desc: '放弃变更（需 confirm）',
    effect: '确认后作废当前变更并解除绑定（保留现场产物，标记已放弃）。',
    nodes: ['open', 'clarify', 'design', 'plan', 'implement', 'verify', 'archive'],
  },
  {
    id: '/baf-workflow-resume',
    stars: 3,
    desc: '流程偏差后退回指定阶段重做',
    effect: '发现上游产物有问题时，把变更退回指定阶段重来，下游产物随之作废重建。',
    nodes: ['open', 'clarify', 'design', 'plan', 'implement', 'verify'],
  },
  {
    id: '/baf-check-quality',
    stars: 2,
    desc: '基线 C 栈质量检查',
    effect: '编译构建 + 单元测试 + 覆盖率门禁一次跑齐，报告落盘到 build/coverage。',
    nodes: ['verify', 'archive'],
  },
  {
    id: '/baf-check-guard',
    stars: 2,
    desc: '安全检查（verify + 密钥扫描）',
    effect: '扫描密钥泄漏与受保护路径改动，出问题就地拦截并给出处理建议。',
    nodes: ['verify', 'archive'],
  },
  {
    id: '/baf-go',
    stars: 3,
    desc: '自动推进到下一个需要你确认的点',
    effect: '从当前阶段一路自动推进（建变更/澄清/设计/计划/实现/检查），遇到需要客户决策的点停下弹卡。',
    nodes: ['intake', 'open', 'clarify', 'design', 'plan', 'implement', 'verify', 'archive'],
  },
  {
    id: '/baf-go-confirm',
    stars: 2,
    desc: '不弹确认框，直接继续工作流',
    effect: '跳过下一个确认门直接放行（信任前置产物没问题时的快进挡）。',
    nodes: ['open', 'clarify', 'design', 'plan', 'implement', 'verify', 'archive'],
  },
]

/** Global commands — available at EVERY state (rendered below the chart). */
export const BAF_GLOBAL_COMMANDS: readonly BafCommandEntry[] = [
  {
    id: '/baf-help',
    stars: 2,
    desc: '列出全部命令与用法',
    effect: '在会话里就地打出核心/流程/检查/更新四组指令说明——迷路时的第一站。',
    nodes: [],
  },
  {
    id: '/baf-welcome',
    stars: 2,
    desc: '启动检查：工作区状态 + 环境体检',
    effect: '立即输出工作区、基线、环境与工具链探测结果，判断今天能不能直接开工。',
    nodes: [],
  },
  {
    id: '/baf-gate',
    stars: 2,
    desc: '重新弹出确认卡（如初始化确认）',
    effect: '把误关的确认门卡片重新弹出来；只补卡，不推进阶段。',
    nodes: [],
  },
  {
    id: '/baf-scaffold',
    stars: 2,
    desc: '初始化工作区（缺配置时用它）',
    effect: '生成 .baf 基线、默认规则文档与 openspec 目录；已存在的文件不覆盖。',
    nodes: [],
  },
  {
    id: '/baf-standard-init',
    stars: 2,
    desc: '迁入企业规范资产（clang-format/commitlint/UT…）',
    effect: '把企业规范资产（格式化/提交规范/UT 模板等）写入工作区，覆盖前自动备份。',
    nodes: [],
  },
  {
    id: '/baf-status',
    stars: 3,
    desc: '查看当前变更：模式/阶段/分类',
    effect: '一行看清当前变更绑到哪个会话、走到哪个阶段、按什么模式在跑。',
    nodes: [],
  },
  {
    id: '/baf-list',
    stars: 2,
    desc: '列出工作区全部变更（含已归档/已放弃）',
    effect: '本工作区所有变更的清单与各自状态，找旧变更/旧产物从这里入手。',
    nodes: [],
  },
  {
    id: '/baf-version',
    stars: 1,
    desc: '查看桌面/插件版本（对齐设置页）',
    effect: '打出桌面端与各 BAF 插件包版本号，和设置页显示一致。',
    nodes: [],
  },
  {
    id: '/baf-doctor',
    stars: 1,
    desc: '工作流自检：工作区/环境/注册',
    effect: '逐项体检工作流依赖（工作区/环境/插件注册），哪项红了修哪项。',
    nodes: [],
  },
  {
    id: '/baf-update',
    stars: 1,
    desc: '检查并升级桌面（有更新时弹窗选择）',
    effect: '检查桌面更新通道，有新版本时弹窗让客户决定是否升级。',
    nodes: [],
  },
  {
    id: '/baf-update-rollback',
    stars: 1,
    desc: '回滚上次升级（plugin/runtime，默认 plugin）',
    effect: '把上次升级的插件（或运行时）回滚到升级前版本。',
    nodes: [],
  },
]

/** Commands specific to one node, in catalog order. */
export const commandsAt = (node: EnterpriseDocNode): readonly BafCommandEntry[] =>
  BAF_COMMANDS.filter(command => command.nodes.includes(node))
