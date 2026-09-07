/**
 * Chinese catalog copy paired with English NODE_CATALOG fields for bilingual detail.
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
      '决定模式：full-go / bug-fast-path / clarify-required',
      '需要确认时展示分类卡',
      '确认后将 ChangeIntake 追加到 projection',
    ],
    artifacts: ['ChangeIntake 记录', '需要时的确认记录'],
    completion: ['分类已写入 projection', '需要确认时已记录用户确认'],
    failure: ['基线缺失 → 禁止 fast path', '无法分类 → clarify-required，禁止写源码'],
  },
  open: {
    purpose: '创建变更身份、骨架目录，并锁定基线。',
    prerequisites: ['Intake 已确认', '工作区可读', 'Git 可用（full-go 缺失则阻断）', '基线可解析'],
    actions: [
      '探测工作区 / Git / 基线 / OpenSpec',
      '多活动变更时要求显式选择或新建',
      '生成唯一 change id',
      '创建变更骨架',
      '锁定基线并记录源修订',
    ],
    artifacts: ['change id', '骨架文件', '初始化 projection', '基线锁'],
    completion: ['change id 唯一且目录有效', '基线锁已记录', '变更目标非空'],
    failure: ['需要 OpenSpec 但不可用 → openspec_unavailable', '禁止覆盖已有文件'],
  },
  clarify: {
    purpose: '关闭阻塞问题，并写出可测试的验收标准（full-go）。',
    prerequisites: ['open 已完成'],
    actions: [
      '枚举阻塞问题',
      '记录答案与决策来源/时间',
      '标记已决定 / 延期 / 范围外',
      '写出可测试验收标准',
    ],
    artifacts: ['问题清单', '验收标准'],
    completion: ['无阻塞未决问题', '验收标准可测试'],
    failure: ['关键信息不足 → 保持 clarify，禁止进入设计'],
  },
  design: {
    purpose: '固化方案边界、接口与风险（full-go）。',
    prerequisites: ['clarify 完成或可跳过'],
    actions: ['写设计草案', '标明接口与依赖', '记录风险与回滚策略'],
    artifacts: ['设计文档 / 规格增量'],
    completion: ['设计可被计划拆解'],
    failure: ['范围膨胀 → 回到 clarify'],
  },
  plan: {
    purpose: '把设计拆成可执行任务与门禁顺序（full-go）。',
    prerequisites: ['design 完成'],
    actions: ['拆任务', '标注依赖与并行', '定义门禁顺序'],
    artifacts: ['任务列表', '门禁计划'],
    completion: ['每个任务可指派结果类型'],
    failure: ['任务不可执行 → 回到 design'],
  },
  implement: {
    purpose: '按任务改源码并记录结构化结果。',
    prerequisites: ['plan 完成（或 fast-path 从 open 进入）'],
    actions: [
      '按任务改源码与测试',
      '记录外部命令结果',
      '记录每任务 start/complete/blocked',
    ],
    artifacts: ['源码', '测试', '规格增量', '任务结果'],
    completion: ['每任务有结果', '无越权编辑', '跳过测试不得计为通过'],
    failure: ['Guard 拒绝 → blocked', 'fast-path 范围膨胀 → 升级 full-go'],
  },
  verify: {
    purpose: '运行 OpenSpec/质量/守卫检查并汇总新鲜报告。',
    prerequisites: ['implement 任务结束', '报告环境可用'],
    actions: [
      '需要时运行 OpenSpec validate',
      '基线编译',
      '单元测试 / 覆盖率',
      '静态检查 / 格式化',
      '密钥扫描与 guard',
      'fast path 必须跑回归',
      '汇总结构化报告并检查新鲜度',
    ],
    artifacts: ['质量 / guard / OpenSpec 报告'],
    completion: ['全部必做检查通过', '报告未过期'],
    failure: ['任一必做失败 → 回 implement', '证据变化 → drift'],
  },
  archive: {
    purpose: '人工确认后原子归档或写入最终缺陷记录。',
    prerequisites: ['verify 通过且无 drift', '人工确认'],
    actions: [
      '展示变更摘要与校验结果',
      '请求人工确认',
      '原子归档或写最终记录',
      '写最终 projection',
    ],
    artifacts: ['归档记录', '摘要', '最终 projection'],
    completion: ['归档原子完成，不可伪造成功'],
    failure: ['保持可恢复，禁止半归档'],
  },
  drift: {
    purpose: '证据变化时标记受影响阶段，禁止静默自愈。',
    prerequisites: ['存在活动变更', '检测到证据变化'],
    actions: [
      '标记受影响阶段为 drifted',
      '要求重新验证或用户再确认',
      '回到最早受影响节点',
    ],
    artifacts: ['drift 证据', '最早受影响指针'],
    completion: ['证据恢复或用户再确认', '不跳过未完成/已失效阶段'],
    failure: ['禁止静默自动修复'],
  },
}
