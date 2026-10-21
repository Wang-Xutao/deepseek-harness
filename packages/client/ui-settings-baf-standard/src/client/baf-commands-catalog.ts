/**
 * 【变更】2026-10-21 (指令集 tab): the browser-side mirror of baf-workflow's
 * slash-command help tables — the 指令集 tab's flow chart lists, per workflow
 * state, every baf command available there with its purpose (desc, VERBATIM
 * from the HELP_* tables) and its effect (the client's supplementary line).
 * 【变更】2026-10-22 (批次十一 3): every command now also carries a `result`
 * line — WHAT THE CUSTOMER SEES after it runs (产物/卡片/去向) — so each row
 * answers 作用 → 功能 → 运行结果 in one place.
 *
 * Parity discipline (same contract as enterprise-docs-catalog.ts): `desc` and
 * `stars` are a byte-for-byte mirror of
 * `@deepseek-ai/dsh-baf-workflow/src/commands.ts` HELP_TABLES — the spec
 * deep-compares them, so editing the help text there without this file (or
 * vice versa) fails the build. `effect`, `result` and the `nodes`
 * applicability are THIS file's own product copy.
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
  /** Effect — the mechanism: what the command does and how (this catalog's copy). */
  readonly effect: string
  /** Result — what the customer actually sees after it runs (this catalog's copy). */
  readonly result: string
  /** States the command is specific to; `[]` = global (any state). */
  readonly nodes: readonly EnterpriseDocNode[]
}

/** Commands bound to specific workflow states, in HELP order. */
export const BAF_COMMANDS: readonly BafCommandEntry[] = [
  {
    id: '/baf-workflow-open',
    stars: 3,
    desc: '启动变更：先分类',
    effect: '从当前需求开出一条新变更：先弹分类确认卡确认变更类型（新功能 / 缺陷修复 / 文档…），分类结论决定走完整流程还是缺陷修复快速路径，需求描述随变更一起存档。',
    result: '得到一条绑定了当前会话的新变更（changeId），工作流图与 /baf-status 立即可查；下一步按模式进入澄清或计划。',
    nodes: ['intake', 'open'],
  },
  {
    id: '/baf-workflow-classify',
    stars: 2,
    desc: '分类确认 / 重新描述',
    effect: '把分类确认卡重新弹出来：可以改分类结论，也可以补充、重写需求描述；分类一变，变更模式（完整流程/缺陷修复）随之切换。',
    result: '确认后变更档案里的分类、模式与需求描述同步更新，工作流图立即按新模式重画。',
    nodes: ['open'],
  },
  {
    id: '/baf-workflow-clarify',
    stars: 2,
    desc: '澄清阶段：把需求问清楚',
    effect: '围绕需求生成一份澄清问题清单（边界条件、输入输出、异常路径…），逐项向客户确认；全部澄清后需求即冻结，作为下游设计与计划的依据。',
    result: '会话里逐条出现澄清问题卡；全部回答后产出冻结的需求说明，变更推进到设计阶段。',
    nodes: ['clarify'],
  },
  {
    id: '/baf-workflow-design',
    stars: 2,
    desc: '设计阶段：写设计文档',
    effect: '按企业设计文档模板产出设计稿（模块划分、接口、数据结构、风险项），完成后送评审确认；确认通过才允许进入计划阶段。',
    result: '产出 openspec 设计文档并出现在产物栏，可点击打开；评审确认卡弹出，确认后变更推进到计划。',
    nodes: ['design'],
  },
  {
    id: '/baf-workflow-plan',
    stars: 2,
    desc: '计划阶段：拆任务',
    effect: '把设计拆解成带验收标准的任务清单（plan.json / tasks.md），每个任务可独立派单、独立验收，作为实现阶段的派单依据。',
    result: '产出任务清单文件；变更总览出现任务进度（x/y），实现阶段按清单逐项派单。',
    nodes: ['plan'],
  },
  {
    id: '/baf-workflow-implement',
    stars: 3,
    desc: '实现阶段：进入/完成',
    effect: '按任务清单逐项实现并勾掉任务；每完成一项就更新清单状态，全部完成后变更停在验证门口等待质量检查。',
    result: '源码/文档逐项落盘，任务清单进度实时刷新；实现完成后工作流图亮起验证节点，等待 /baf-workflow-verify。',
    nodes: ['implement'],
  },
  {
    id: '/baf-workflow-verify',
    stars: 3,
    desc: '验证阶段：跑检查',
    effect: '跑基线 C 栈质量检查（编译、单元测试、覆盖率门禁）与安全检查（密钥扫描、禁改路径），并逐项核对计划阶段的验收标准；全部通过才放行归档。',
    result: '输出质量检查结论与报告路径（build/coverage 等）；测试流图 Tab 同步刷新，未通过项就地列出整改建议。',
    nodes: ['verify'],
  },
  {
    id: '/baf-workflow-archive',
    stars: 3,
    desc: '归档变更（需 confirm）',
    effect: '确认后把变更的全部产物归档进 openspec 目录、解除会话与变更的绑定，工作区回到可以开新变更的干净状态。',
    result: '变更总览里该变更转为已归档（含结束时间与产物清单），会话解绑，可立即 /baf-workflow-open 开下一条。',
    nodes: ['archive'],
  },
  {
    id: '/baf-workflow-abandon',
    stars: 1,
    desc: '放弃变更（需 confirm）',
    effect: '确认后作废当前变更并解除绑定：现场产物保留不删，只标记为已放弃，随时可以追溯为什么放弃。',
    result: '变更总览里该变更转为已放弃，产物保留在原处可打开查看；工作区可以开新变更。',
    nodes: ['open', 'clarify', 'design', 'plan', 'implement', 'verify', 'archive'],
  },
  {
    id: '/baf-workflow-resume',
    stars: 3,
    desc: '流程偏差后退回指定阶段重做',
    effect: '发现上游产物有问题时，把变更退回指定阶段（澄清/设计/计划/实现/验证）重来；该阶段之后的产物随之作废重建，避免带病前进。',
    result: '工作流图跳回目标阶段并清除下游产物状态，会话从该阶段重新推进；退回动作记录在变更历史里。',
    nodes: ['open', 'clarify', 'design', 'plan', 'implement', 'verify'],
  },
  {
    id: '/baf-check-quality',
    stars: 2,
    desc: '基线 C 栈质量检查',
    effect: '一次跑齐 gcc 编译 → ceedling 单元测试 → gcov 插桩 → gcovr 报告 → 覆盖率门禁（≥80%）整条 check 链，不需要手动逐个工具执行。',
    result: '覆盖率行数、达标结论与 HTML 报告路径直接输出；报告落盘 build/coverage，测试流图 Tab 随即亮起各步状态。',
    nodes: ['verify', 'archive'],
  },
  {
    id: '/baf-check-guard',
    stars: 2,
    desc: '安全检查（verify + 密钥扫描）',
    effect: '扫描本次变更是否泄漏密钥/凭据、是否改动了受保护路径（AI 禁改清单）；发现违规就地拦截，不进入归档。',
    result: '输出逐文件扫描结论：通过则放行归档，违规则列出文件与处理建议（移除密钥/恢复路径），变更停在验证阶段。',
    nodes: ['verify', 'archive'],
  },
  {
    id: '/baf-go',
    stars: 3,
    desc: '自动推进到下一个需要你确认的点',
    effect: '从当前阶段一路自动推进（建变更、澄清、设计、计划、实现、检查），该做的都做掉，只在需要客户决策的点（分类、设计确认、归档确认…）停下弹卡等你。',
    result: '阶段快速点亮、产物持续落盘；停顿时会话里出现决策卡，选完继续，无需再敲指令。',
    nodes: ['intake', 'open', 'clarify', 'design', 'plan', 'implement', 'verify', 'archive'],
  },
  {
    id: '/baf-go-confirm',
    stars: 2,
    desc: '不弹确认框，直接继续工作流',
    effect: '跳过下一个确认门直接放行——当你确认前置产物没问题、不想再点一次确认卡时的快进挡。',
    result: '确认卡不再弹出，工作流直接推进到下一个停顿点或走完当前阶段。',
    nodes: ['open', 'clarify', 'design', 'plan', 'implement', 'verify', 'archive'],
  },
]

/** Global commands — available at EVERY state (rendered in their own card). */
export const BAF_GLOBAL_COMMANDS: readonly BafCommandEntry[] = [
  {
    id: '/baf-help',
    stars: 2,
    desc: '列出全部命令与用法',
    effect: '在会话里就地打出核心/流程/检查/更新四组指令说明，每组带用途、星级与用法示例——迷路时的第一站。',
    result: '会话里出现完整的指令速查表，可直接照着敲下一条指令。',
    nodes: [],
  },
  {
    id: '/baf-welcome',
    stars: 2,
    desc: '启动检查：工作区状态 + 环境体检',
    effect: '立即输出工作区绑定、基线配置、环境与工具链（gcc/ceedling/gcovr…）的探测结果，判断今天能不能直接开工。',
    result: '一张体检清单：每项显示就绪/缺失与建议动作（如先 /baf-scaffold 或一键安装工具链）。',
    nodes: [],
  },
  {
    id: '/baf-gate',
    stars: 2,
    desc: '重新弹出确认卡（如初始化确认）',
    effect: '把误关或被刷掉的确认门卡片重新弹出来（初始化确认、设计确认等已注册的门）；只补卡，不推进阶段。',
    result: '会话里重新出现那张确认卡，照常点选即可；工作流位置不变。',
    nodes: [],
  },
  {
    id: '/baf-scaffold',
    stars: 2,
    desc: '初始化工作区（缺配置时用它）',
    effect: '在工作区生成 .baf 基线（baseline.yml）、默认规则文档与 openspec 目录骨架；已存在的文件一律不覆盖，安全可重跑。',
    result: '工作区出现 .baf/ 与 openspec/ 结构，设置页各 Tab 从“未配置”变为可读取的真实配置。',
    nodes: [],
  },
  {
    id: '/baf-standard-init',
    stars: 2,
    desc: '迁入企业规范资产（clang-format/commitlint/UT…）',
    effect: '把企业规范资产（.clang-format、commitlint 配置、UT 模板与 CPPLINT.cfg 等）写入工作区；覆盖已有文件前自动备份。',
    result: '工作区出现规范配置文件（旧文件备份在同目录），质量监控页的“质量资产”转为已应用。',
    nodes: [],
  },
  {
    id: '/baf-status',
    stars: 3,
    desc: '查看当前变更：模式/阶段/分类',
    effect: '一行看清当前变更绑到哪个会话、走到哪个阶段、按什么模式在跑、分类结论是什么——工作流图 Tab 的文字版。',
    result: '输出当前变更摘要行（changeId/模式/阶段/分类）；没有活动变更时明确说没有。',
    nodes: [],
  },
  {
    id: '/baf-list',
    stars: 2,
    desc: '列出工作区全部变更（含已归档/已放弃）',
    effect: '列出本工作区所有变更及其状态（进行中/已归档/已放弃）、模式与当前阶段；找旧变更、旧产物从这里入手。',
    result: '一张变更清单，每行可对照变更总览里的同名条目与产物。',
    nodes: [],
  },
  {
    id: '/baf-version',
    stars: 1,
    desc: '查看桌面/插件版本（对齐设置页）',
    effect: '打出桌面端与各 BAF 插件包（workflow/quality/featured…）的版本号，与设置页显示同源。',
    result: '输出版本清单；排查“功能怎么没有”时先看这里是不是旧版。',
    nodes: [],
  },
  {
    id: '/baf-doctor',
    stars: 1,
    desc: '工作流自检：工作区/环境/注册',
    effect: '逐项体检工作流依赖：工作区绑定、基线可读、环境工具链、各 BAF 插件是否注册——哪项红了修哪项。',
    result: '输出逐项 ✅/❌ 体检表，红项附带修复建议（对应指令或设置页入口）。',
    nodes: [],
  },
  {
    id: '/baf-update',
    stars: 1,
    desc: '检查并升级桌面（有更新时弹窗选择）',
    effect: '检查桌面更新通道，发现有新版本时弹窗让客户决定是否升级；不升级可以继续用当前版。',
    result: '无更新：提示已是最新；有更新：弹升级确认窗，确认后自动下载安装并提示重启。',
    nodes: [],
  },
  {
    id: '/baf-update-rollback',
    stars: 1,
    desc: '回滚上次升级（plugin/runtime，默认 plugin）',
    effect: '把上次升级的插件（默认）或运行时回滚到升级前版本——升级后异常时的后悔药。',
    result: '回滚完成后提示重启；重启后 /baf-version 显示回滚前的版本号。',
    nodes: [],
  },
]

/** Commands specific to one node, in catalog order. */
export const commandsAt = (node: EnterpriseDocNode): readonly BafCommandEntry[] =>
  BAF_COMMANDS.filter(command => command.nodes.includes(node))
