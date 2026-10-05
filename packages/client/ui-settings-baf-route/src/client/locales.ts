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
  | 'presetAdded'
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
  description: 'Route work orders by phase and keyword to high/mid/low model tiers (~/.dsh/baf-route-config.json).',
  master: 'Enable multi-model routing',
  dirty: 'Unsaved changes',
  tierHigh: 'High tier',
  tierMid: 'Mid tier',
  tierLow: 'Low tier',
  tierHighDesc: 'Complex: architecture, refactor, performance, security',
  tierMidDesc: 'Balanced: tests, review, debugging',
  tierLowDesc: 'Light: docs, formatting, routine turns',
  provider: 'Provider',
  model: 'Model',
  phaseTitle: 'Phase → tier flow',
  flowHint: 'Click a node to cycle its tier (low → mid → high).',
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
  presetsTitle: 'Preset packs',
  presetsHint: 'Curated by mainstream routing practice — one click adds the pack; fine-tune below.',
  presetAdded: 'Added',
  presetComplexEngineering: 'Complex engineering',
  presetCriticalRelease: 'Critical design & release',
  presetQualityAssurance: 'Test & debug',
  presetRoutineEdits: 'Light edits',
  keywordWords: 'Keywords (| separated)',
  keywordTier: 'Tier',
  keywordAdd: 'Add',
  keywordRemove: 'Remove',
  escalateOnly: 'Keywords only escalate',
  escalateOnlyHint: 'A keyword hit raises the tier at most; it never lowers it.',
  previewTitle: 'Dry-run',
  previewPlaceholder: 'Type a task summary to try the keyword match…',
  previewRun: 'Dry-run',
  previewNone: 'No tier would freeze',
  save: 'Save',
  reset: 'Reset',
  loading: 'Loading…',
  loadFailed: 'Could not read the routing config.',
}

export const zh: Record<BafRouteKey, string> = {
  nav: '多模型路由',
  title: '多模型路由',
  description: '按阶段与关键词把工单派给 高/中/低 三档模型（~/.dsh/baf-route-config.json）。',
  master: '启用多模型路由',
  dirty: '有未保存修改',
  tierHigh: '高档',
  tierMid: '中档',
  tierLow: '低档',
  tierHighDesc: '复杂任务：架构、重构、性能、安全',
  tierMidDesc: '均衡任务：测试、评审、排查',
  tierLowDesc: '轻量任务：文案、格式、日常问答',
  provider: '服务商',
  model: '模型',
  phaseTitle: '阶段 → 档位 流程',
  flowHint: '点击节点切换档位（低 → 中 → 高）。',
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
  presetsTitle: '预设词库',
  presetsHint: '按主流路由实践整理，一键添加整包；可在下方继续增删微调。',
  presetAdded: '已添加',
  presetComplexEngineering: '复杂工程',
  presetCriticalRelease: '关键设计与发布',
  presetQualityAssurance: '测试与排查',
  presetRoutineEdits: '轻量改动',
  keywordWords: '关键词（| 分隔）',
  keywordTier: '档位',
  keywordAdd: '添加',
  keywordRemove: '移除',
  escalateOnly: '关键词仅升档',
  escalateOnlyHint: '关键词命中只会抬高档位，不会降低。',
  previewTitle: '预演',
  previewPlaceholder: '输入任务摘要试跑关键词匹配…',
  previewRun: '预演',
  previewNone: '不会冻结档位',
  save: '保存',
  reset: '恢复默认',
  loading: '加载中…',
  loadFailed: '读取路由配置失败。',
}
