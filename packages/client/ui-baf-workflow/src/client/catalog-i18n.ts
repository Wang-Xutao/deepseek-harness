/**
 * Chinese catalog copy paired 1:1 with English NODE_CATALOG fields.
 * 【变更】2026-09-23 (demo5 issue #7): every array is index-aligned with the
 * authoritative catalog (`packages/baf/baf-core/src/catalog.ts`) — the old
 * zh entries drifted out of alignment, so the Tab's 阶段清单 and detail panel
 * fell back to English rows. The zh copy is now the display source (English
 * stays the fallback only if an entry is missing here).
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
    purpose: '在任何源码写入之前，先判定变更类型、模式、影响范围，以及是否需要 OpenSpec。',
    prerequisites: ['已建立 BAF 会话', '工作区可读'],
    actions: [
      '解析用户意图为候选分类（模型仅建议）',
      '规则引擎复核：范围、公开 API、数据格式、并发、安全、性能、规格影响、回滚',
      '计算 affectedScope 与置信度',
      '决定模式：full-go-path / bug-fix-path / clarify-required',
      '需要用户确认时展示分类卡',
      '确认后将 ChangeIntake 追加到 projection 日志',
    ],
    artifacts: [
      'ChangeIntake { kind, mode, openspecRequired, reasonCodes, affectedScope, confidence }',
      '需要时的确认记录',
    ],
    completion: ['分类已写入 projection', '需要用户确认时已记录确认'],
    failure: ['基线缺失 → policy_missing / baseline_unavailable；禁止 fast path', '无法分类 → clarify-required；禁止写源码'],
  },
  open: {
    purpose: '创建变更身份、骨架目录，并锁定基线。',
    prerequisites: [
      'Intake 已确认',
      '工作区可读',
      'Git 可用（full-go-path 缺失则阻断；fast path 仅警告）',
      '基线可解析',
    ],
    actions: [
      '探测工作区 / Git / 基线 / OpenSpec 可用性',
      '多活动变更时要求显式选择或新建',
      '生成唯一 change id',
      '创建变更骨架（full-go-path 建 OpenSpec 目录；fast path 写最小缺陷记录）',
      '锁定基线并记录源修订',
    ],
    artifacts: ['change id', '骨架文件', '初始化的 workflow projection', '基线锁'],
    completion: ['change id 唯一且目录有效', '基线锁已记录', '变更目标非空'],
    failure: ['需要 OpenSpec 但不可用 → openspec_unavailable', '禁止覆盖已有文件'],
  },
  clarify: {
    purpose: '关闭阻塞问题，并写出可测试的验收标准（full-go-path）。',
    prerequisites: ['open 已完成'],
    actions: [
      '枚举阻塞问题',
      '记录答案与决策来源/时间',
      '标记已决定 / 延期 / 范围外',
      '写出可测试的验收标准',
      '非阻塞项延期并记录原因',
    ],
    artifacts: ['澄清文档 / 决策记录'],
    completion: ['阻塞问题已回答或明确延期', '验收标准可测试'],
    failure: ['未回答的阻塞项使阶段保持进行中', '模型推测不得标记为用户确认'],
  },
  design: {
    purpose: '产出扎根于真实仓库、可验证的技术设计（full-go-path）。',
    prerequisites: ['clarify 已完成'],
    actions: [
      '阅读真实仓库代码；不得凭空发明 API',
      '定义接口、数据流、错误路径、风险与兼容性',
      '优先复用既有抽象',
      '每条结论附可验证的文件/API 引用',
      '按守卫策略预检计划改动的路径',
    ],
    artifacts: ['设计文档', '风险清单'],
    completion: ['设计引用真实文件/API 且与基线一致', '已记录用户或规则确认'],
    failure: ['读取后仓库变化 → drift', '不可验证的引用阻断计划阶段'],
  },
  plan: {
    purpose: '把设计拆成可验证的任务：白名单、验证命令、回退点（full-go-path）。',
    prerequisites: ['design 已完成'],
    actions: [
      '把设计拆成任务（输入/输出/文件/验证/回退）',
      '冻结文件白名单',
      '写每任务的验证命令与可观测完成标准',
      '快照守卫策略',
    ],
    artifacts: ['计划文档', '任务清单', '文件白名单', '守卫策略快照'],
    completion: ['每个任务可执行、可验证、可回退'],
    failure: ['只写「实现该功能」的计划会被拒绝', '范围扩张必须发出新事件；禁止静默扩张'],
  },
  implement: {
    purpose: '在白名单内实现并测试，全程受守卫检查约束。',
    prerequisites: ['full-go-path：plan 已完成', 'fast path：open 已完成且记录根因'],
    actions: [
      '每个任务前检查阶段与守卫',
      '只改白名单内文件（新范围需重新确认或升级）',
      '先最小实现 + 测试，再扩展',
      'full-go-path 同步规格',
      '记录结构化的外部命令结果',
      '记录每任务 start/complete/blocked',
    ],
    artifacts: ['源码', '测试', '规格增量', '任务结果记录'],
    completion: ['每个任务有结果', '无越权编辑', '跳过测试不得计为通过'],
    failure: ['守卫拒绝 → blocked + 稳定原因码', '取消不得伪造完成', 'fast-path 范围扩张 → 升级 full-go-path（T15）'],
  },
  verify: {
    purpose: '运行必需的 OpenSpec/质量/守卫检查，并汇总新鲜报告。',
    prerequisites: ['implement 任务已结束', '报告环境可用'],
    actions: [
      '需要时运行 OpenSpec validate',
      '运行基线的编译/测试/覆盖率/静态检查/格式化检查',
      '运行密钥扫描与守卫检查',
      'fast path 必须跑回归测试',
      '汇总绑定基线/工具/工作区/修订的结构化报告',
      '检查报告新鲜度',
    ],
    artifacts: ['结构化 质量/守卫/OpenSpec 报告'],
    completion: ['全部必需检查通过', '报告未过期'],
    failure: ['任一必需项失败 → 回 implement（T11）', '工具缺失 → tool_unavailable 阻塞', '证据变化 → drift（T12）'],
  },
  archive: {
    purpose: '人工确认后原子归档，或写入最终缺陷记录。',
    prerequisites: ['verify 通过且无 drift', '人工确认'],
    actions: [
      '展示变更摘要、验证结果与审计引用',
      '请求人工确认',
      '原子归档（full-go-path 走 OpenSpec 适配器）或写入最终缺陷记录（fast path）',
      '写最终 projection 状态',
    ],
    artifacts: ['归档变更 / 最终记录', '摘要', '最终 projection'],
    completion: ['归档原子完成，不可伪造成功'],
    failure: ['保持变更可恢复；禁止半归档状态', '重试必须幂等'],
  },
  drift: {
    purpose: '证据变化时标记受影响阶段，禁止静默自愈。',
    prerequisites: ['存在活动变更', '检测到证据变化（文件/分支/基线/规格/组合/报告）'],
    actions: [
      '标记受影响阶段为 drifted',
      '要求重新验证或用户再确认',
      '回到最早受影响节点（T13）',
    ],
    artifacts: ['drift 证据', '最早受影响指针'],
    completion: ['证据恢复或用户再确认', '目标阶段取自证据；不跳过未完成/已失效阶段'],
    failure: ['禁止静默自动修复', '冲突时 OpenSpec 文件优先于 projection 索引'],
  },
}
