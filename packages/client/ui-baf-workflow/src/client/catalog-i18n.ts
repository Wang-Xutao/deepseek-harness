/**
 * Chinese catalog copy paired 1:1 with English NODE_CATALOG fields.
 * 【变更】2026-09-23 (demo5 issue #7): every array is index-aligned with the
 * authoritative catalog (`packages/baf/baf-core/src/catalog.ts`) — the old
 * zh entries drifted out of alignment, so the Tab's 阶段清单 and detail panel
 * fell back to English rows. The zh copy is now the display source (English
 * stays the fallback only if an entry is missing here).
 *
 * 【变更】2026-09-25 (demo8 问题 2.4): full plain-language rewrite. The
 * customer does not know or care about the internals, so every line now says
 * what happens, who acts, and what they wait for — protocol tokens
 * (projection / full-go-path / T-codes / raw schema shapes) are gone; the
 * standalone 通俗说明 section was folded INTO these lines and removed from
 * the panel. `actions` arrays stay index-aligned: the stage checklist pairs
 * them 1:1 with the English rows.
 */
import type { WorkflowNodeId } from './tab-types.ts'

/** Localized catalog body for one node. */
export interface CatalogLocaleBody {
  readonly purpose: string
  readonly actions: readonly string[]
  readonly prerequisites: readonly string[]
  readonly artifacts: readonly string[]
  readonly completion: readonly string[]
  readonly failure: readonly string[]
}

/** zh-CN catalog bodies keyed by node id. */
export const CATALOG_ZH: Readonly<Partial<Record<WorkflowNodeId, CatalogLocaleBody>>> = {
  intake: {
    purpose: '动手改代码前的分类关卡：先弄清这次要改什么、走哪条路径、影响多大；你在分类卡上确认后，系统才开始改源码。',
    prerequisites: ['已开启 BAF 会话', '工作区可以读取'],
    actions: [
      '把你的想法整理成分类建议（模型只建议，最终由你确认）',
      '按规则复核：改动范围、对外接口、数据格式、并发、安全、性能、规格影响、可回滚性',
      '估算影响范围和把握程度',
      '决定走哪条路径：完整流程 / 缺陷修复路径 / 先澄清',
      '需要你确认时弹出分类卡',
      '你确认后，把分类结果写入流程记录',
    ],
    artifacts: [
      '分类结果（类型、路径、是否需要规格、原因、影响范围、把握程度）',
      '需要时的确认记录',
    ],
    completion: ['分类已写入流程记录', '需要你确认的，确认也已记录'],
    failure: [
      '基线缺失（policy_missing / baseline_unavailable）→ 禁止走快速路径',
      '分不出来 → 先澄清，禁止改源码',
    ],
  },
  open: {
    purpose: '为这次变更建档：系统建立变更身份、锁定基线，模型撰写提案（为什么改、改什么、影响面）；你确认提案后才进入下一步。',
    prerequisites: [
      '分类已确认',
      '工作区可以读取',
      'Git 可用（完整流程缺 Git 会阻断；快速路径只提醒）',
      '基线文件可读',
    ],
    actions: [
      '检查工作区 / Git / 基线 / OpenSpec 是否就绪',
      '同时进行多条变更时，由你明确选择或新建',
      '生成唯一的变更编号',
      '建立变更档案（完整流程建规格目录；快速路径写最小缺陷记录）',
      '锁定基线并记录当时的代码版本',
    ],
    artifacts: ['变更编号', '变更档案文件', '初始化的流程记录', '基线锁'],
    completion: ['变更编号唯一且目录有效', '基线锁已记录', '变更目标非空'],
    failure: ['需要 OpenSpec 但不可用（openspec_unavailable）', '绝不覆盖已有文件'],
  },
  clarify: {
    purpose: '把含糊的地方问清楚：模型把卡进度的问题写成文档，需要你拍板的会弹卡提问，答案记录在案，最后形成可检验的验收标准。',
    prerequisites: ['建立变更已完成'],
    actions: [
      '列出所有卡住进度的问题',
      '记录每个答案：谁定的、依据什么、什么时间',
      '标记每项：已定 / 延后 / 不在本次范围',
      '写出可检验的验收标准',
      '不卡进度的问题延后处理并记录原因',
    ],
    artifacts: ['澄清文档 / 决策记录'],
    completion: ['卡进度的问题都已回答或明确延后', '验收标准可以检验'],
    failure: ['还有没回答的卡点时，阶段保持进行中', '模型自己的猜测不能记成「你已确认」'],
  },
  design: {
    purpose: '模型读真实仓库代码写技术设计——接口怎么定、错误怎么处理、有什么风险；设计里引用的文件都是仓库里真实存在的。',
    prerequisites: ['澄清已完成'],
    actions: [
      '读仓库里的真实代码，不凭空发明接口',
      '定义接口、数据流、错误处理、风险与兼容性',
      '优先复用已有代码',
      '每条结论都附上仓库里真实存在的文件 / 接口出处',
      '按安全策略预先检查计划要改的路径',
    ],
    artifacts: ['设计文档', '风险清单'],
    completion: ['设计引用的文件 / 接口都真实存在、与基线一致', '已记录你或规则的确认'],
    failure: ['读完后仓库又变了 → 进入漂移处理', '出处无法核对的引用会挡住计划阶段'],
  },
  plan: {
    purpose: '把设计拆成一条条可验证的任务，并冻结允许修改的文件清单（白名单）；之后改任何白名单外的文件都会被拦下。',
    prerequisites: ['设计已完成'],
    actions: [
      '把设计拆成任务（输入 / 输出 / 文件 / 验证 / 回退）',
      '冻结文件白名单',
      '给每个任务写验证命令和「怎样算完成」',
      '记录当时的守卫策略',
    ],
    artifacts: ['计划文档', '任务清单', '文件白名单', '守卫策略快照'],
    completion: ['每个任务都可执行、可验证、出问题可回退'],
    failure: ['只写「实现该功能」的计划会被拒绝', '要改的范围变大必须重新确认，禁止悄悄扩大'],
  },
  implement: {
    purpose: '模型按任务清单逐项写代码、跑验证命令，每完成一项勾掉一项；全部完成后请你确认进入验证。',
    prerequisites: ['完整流程：计划已完成', '快速路径：建立变更已完成并记录了根因'],
    actions: [
      '每个任务开始前检查阶段与守卫',
      '只改白名单内的文件（要改别处需重新确认或升级流程）',
      '先做最小实现 + 测试，再扩展',
      '完整流程同步更新规格',
      '记录每条外部命令的结果',
      '记录每个任务的开始 / 完成 / 受阻',
    ],
    artifacts: ['源码', '测试', '规格增量', '任务结果记录'],
    completion: ['每个任务都有结果', '没有越权改动', '跳过测试不算通过'],
    failure: [
      '守卫拦截 → 任务受阻并给出原因码',
      '取消的任务不能记成完成',
      '快速路径要改的范围变大 → 升级为完整流程并补前置阶段',
    ],
  },
  verify: {
    purpose: '系统自动跑检查：编译、测试、密钥扫描、规格校验，结果写入报告；全部通过才弹归档确认，有失败项会带着原因回到实现阶段重改。',
    prerequisites: ['实现阶段的任务都已结束', '检查环境可用'],
    actions: [
      '需要时运行 OpenSpec 规格校验',
      '运行基线要求的编译 / 测试 / 覆盖率 / 静态检查 / 格式检查',
      '运行密钥扫描和守卫检查',
      '快速路径必须跑回归测试',
      '汇总检查报告（记录用的基线、工具、工作区、代码版本）',
      '检查报告是否过期',
    ],
    artifacts: ['结构化的质量 / 守卫 / 规格检查报告'],
    completion: ['必需检查全部通过', '报告未过期'],
    failure: [
      '任一必需项失败 → 回实现阶段重改',
      '工具缺失（tool_unavailable）→ 阻塞并提示',
      '证据变化 → 进入漂移处理',
    ],
  },
  archive: {
    purpose: '你确认归档后，变更连同所有文档一起移入归档目录，流程结束，审计记录保留。',
    prerequisites: ['验证通过且无漂移', '你本人确认'],
    actions: [
      '展示变更摘要、验证结果与审计引用',
      '请你确认',
      '一次性完成归档（完整流程）或写入最终缺陷记录（快速路径）——要么全成功，要么不动',
      '写入最终流程状态',
    ],
    artifacts: ['归档的变更 / 最终记录', '摘要', '最终流程状态'],
    completion: ['归档一次完成，不会出现半归档状态'],
    failure: ['变更始终保持可恢复', '重试不会产生重复数据'],
  },
  drift: {
    purpose: '系统发现仓库的实际状态和流程记录对不上（比如流程外的文件被改了），需要你选择退回到哪个阶段，从那里重跑——不会静默自愈。',
    prerequisites: ['存在进行中的变更', '检测到实际状态与记录不一致（文件 / 分支 / 基线 / 规格 / 报告变了）'],
    actions: [
      '把受影响的阶段标记为「漂移」',
      '要求重新验证或由你再确认',
      '退回到最早受影响的阶段重跑',
    ],
    artifacts: ['漂移证据', '最早受影响阶段的指针'],
    completion: ['证据恢复一致，或你重新确认', '回到哪个阶段由证据决定，不跳过未完成或已失效的阶段'],
    failure: ['绝不静默自动修复', '冲突时以 OpenSpec 文件为准'],
  },
}
