/** Locale keys for the 多模型路由 settings section. */

export type BafRouteKey =
  | 'nav'
  | 'title'
  | 'description'
  | 'master'
  | 'dirty'
  | 'tierHigh'
  | 'tierMid'
  | 'tierLow'
  | 'tierHighDesc'
  | 'tierMidDesc'
  | 'tierLowDesc'
  | 'provider'
  | 'model'
  | 'phaseTitle'
  | 'flowHint'
  | 'phaseDesign'
  | 'phasePlan'
  | 'phaseClarify'
  | 'phaseVerify'
  | 'phaseImplement'
  | 'phaseIntake'
  | 'phaseOpen'
  | 'phaseArchive'
  | 'phaseDrift'
  | 'keywordsTitle'
  | 'presetsTitle'
  | 'presetsHint'
  | 'presetComplexEngineering'
  | 'presetCriticalRelease'
  | 'presetQualityAssurance'
  | 'presetRoutineEdits'
  | 'keywordWords'
  | 'keywordTier'
  | 'keywordAdd'
  | 'keywordRemove'
  | 'escalateOnly'
  | 'escalateOnlyHint'
  | 'previewTitle'
  | 'previewPlaceholder'
  | 'previewRun'
  | 'previewNone'
  | 'save'
  | 'reset'
  | 'loading'
  | 'loadFailed'

export const en: Record<BafRouteKey, string> = {
  nav: 'Multi-model routing',
  title: 'Multi-model routing',
  description: 'Route work orders by phase and keyword to the Commander / Reviewer / Worker model roles (~/.dsh/baf-route-config.json).',
  master: 'Enable multi-model routing',
  dirty: 'Unsaved changes',
  // 【变更】2026-10-05 (角色三档): tiers are named as ROLES — Commander leads,
  // Reviewer checks, Worker executes; presentation only, the wire keeps
  // high/mid/low. Red / blue / green accents (muted) tell them apart.
  tierHigh: 'Commander',
  tierMid: 'Reviewer',
  tierLow: 'Worker',
  tierHighDesc: 'Commander: complex engineering, architecture, critical decisions',
  tierMidDesc: 'Reviewer: routine development, review, debugging',
  tierLowDesc: 'Worker: light edits, formatting, everyday questions',
  provider: 'Provider',
  model: 'Model',
  phaseTitle: 'Phase → role flow',
  flowHint: 'Click a node to cycle its role (Worker → Reviewer → Commander).',
  phaseDesign: 'Design',
  phasePlan: 'Plan',
  phaseClarify: 'Clarify',
  phaseVerify: 'Verify',
  phaseImplement: 'Implement',
  phaseIntake: 'Intake',
  phaseOpen: 'Open',
  phaseArchive: 'Archive',
  phaseDrift: 'Drift',
  keywordsTitle: 'Keyword rules',
  presetsTitle: 'Builtin presets',
  presetsHint: 'Always in effect — no need to add them. Add your own keyword rules below to layer on top.',
  presetComplexEngineering: 'Complex engineering',
  presetCriticalRelease: 'Critical design & release',
  presetQualityAssurance: 'Test & debug',
  presetRoutineEdits: 'Light edits',
  keywordWords: 'Keywords (| separated)',
  keywordTier: 'Role',
  keywordAdd: 'Add',
  keywordRemove: 'Remove',
  escalateOnly: 'Keywords only escalate',
  escalateOnlyHint: 'A keyword hit raises the role at most; it never lowers it.',
  previewTitle: 'Dry-run',
  previewPlaceholder: 'Type a task summary to try the keyword match…',
  previewRun: 'Dry-run',
  previewNone: 'No role would freeze',
  save: 'Save',
  reset: 'Reset',
  loading: 'Loading…',
  loadFailed: 'Could not read the routing config.',
}

export const zh: Record<BafRouteKey, string> = {
  nav: '多模型路由',
  title: '多模型路由',
  description: '按阶段与关键词把工单派给 Commander / Reviewer / Worker 三级模型（~/.dsh/baf-route-config.json）。',
  master: '启用多模型路由',
  dirty: '有未保存修改',
  // 【变更】2026-10-05 (角色三档): 档位以角色命名 — Commander 统帅、Reviewer
  // 评审、Worker 执行；仅呈现层改名，线上仍是 high/mid/low。红/蓝/绿低饱和
  // 点缀区分。
  tierHigh: 'Commander',
  tierMid: 'Reviewer',
  tierLow: 'Worker',
  tierHighDesc: '统帅：复杂工程、架构与关键决策',
  tierMidDesc: '评审：常规开发、评审与排查',
  tierLowDesc: '执行：轻量改动、格式与日常问答',
  provider: '服务商',
  model: '模型',
  phaseTitle: '阶段 → 角色 流程',
  flowHint: '点击节点切换角色（Worker → Reviewer → Commander）。',
  phaseDesign: '设计',
  phasePlan: '规划',
  phaseClarify: '澄清',
  phaseVerify: '验证',
  phaseImplement: '实现',
  phaseIntake: '受理',
  phaseOpen: '开放',
  phaseArchive: '归档',
  phaseDrift: '漂移',
  keywordsTitle: '关键词规则',
  presetsTitle: '内置预设词库',
  presetsHint: '默认启用、始终生效，无需添加；如需补充，在下方新增自定义关键词规则叠加其上。',
  presetComplexEngineering: '复杂工程',
  presetCriticalRelease: '关键设计与发布',
  presetQualityAssurance: '测试与排查',
  presetRoutineEdits: '轻量改动',
  keywordWords: '关键词（| 分隔）',
  keywordTier: '角色',
  keywordAdd: '添加',
  keywordRemove: '移除',
  escalateOnly: '关键词仅升档',
  escalateOnlyHint: '关键词命中只会抬高档位，不会降低。',
  previewTitle: '预演',
  previewPlaceholder: '输入任务摘要试跑关键词匹配…',
  previewRun: '预演',
  previewNone: '不会冻结角色',
  save: '保存',
  reset: '恢复默认',
  loading: '加载中…',
  loadFailed: '读取路由配置失败。',
}
