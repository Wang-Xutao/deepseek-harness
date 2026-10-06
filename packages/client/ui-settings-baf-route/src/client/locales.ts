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
  | 'effortLabel'
  | 'effortDefault'
  | 'tiersTitle'
  | 'roleLabel'
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
  | 'keywordsHint'
  | 'presetsFileHint'
  | 'presetBadge'
  | 'presetAlwaysHint'
  | 'presetComplexEngineering'
  | 'presetCriticalRelease'
  | 'presetQualityAssurance'
  | 'presetRoutineEdits'
  | 'keywordWords'
  | 'keywordCategory'
  | 'keywordTier'
  | 'tagToggle'
  | 'tagsZh'
  | 'tagsEn'
  | 'keywordAdd'
  | 'keywordRemove'
  | 'keywordEdit'
  | 'keywordSave'
  | 'keywordCancel'
  | 'escalateOnly'
  | 'escalateOnlyHint'
  | 'previewTitle'
  | 'previewPlaceholder'
  | 'previewRun'
  | 'previewNone'
  | 'previewVerify'
  | 'previewVerifyHint'
  | 'previewEscalated'
  | 'save'
  | 'cancel'
  | 'reset'
  | 'loading'
  | 'loadFailed'

export const en: Record<BafRouteKey, string> = {
  nav: 'Multi-model routing',
  title: 'Multi-model routing',
  description: 'Route work by phase and keyword to the Flagship / Reviewer / Worker model roles. Sessions on the Auto model route automatically; sessions on a concrete model always run on it (~/.dsh/baf-route-config.json).',
  master: 'Enable multi-model routing',
  dirty: 'Unsaved changes',
  // 【变更】2026-10-05 (角色三档): tiers are named as ROLES — Commander leads,
  // Reviewer checks, Worker executes; presentation only, the wire keeps
  // high/mid/low. Red / blue / green accents (muted) tell them apart.
  // 【变更】2026-10-05 (auto 批, point 2): Worker owns everyday coding (and the
  // implement phase); Reviewer audits Worker's output (and owns verify);
  // Commander takes complex engineering and critical design & release.
  // 【变更】2026-10-06 (问题 3): Worker repositioned — everyday CODE
  // implementation AND copy/doc edits are both Worker work; Reviewer audits;
  // Commander decides architecture and critical releases.
  // 【变更】2026-10-06 (问题 5/4.2): roles renamed for the customer — Commander
  // reads as Flagship (strong reasoning, complex engineering), Reviewer and
  // Worker keep their audit/execute meanings, descriptions tightened to one
  // line each.
  tierHigh: 'Flagship',
  tierMid: 'Reviewer',
  tierLow: 'Worker',
  tierHighDesc: 'Strong reasoning, complex engineering, critical design & release, architecture decisions',
  tierMidDesc: 'Review, investigation, testing, auditing Worker output',
  tierLowDesc: 'Code implementation, documentation edits, light changes',
  provider: 'Provider',
  model: 'Model',
  effortLabel: 'Effort',
  effortDefault: 'Default',
  tiersTitle: 'Model tiers',
  roleLabel: 'Role',
  phaseTitle: 'Workflow model binding',
  flowHint: 'Bind one model role per workflow stage; click a node to cycle its role (Worker → Reviewer → Flagship).',
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
  keywordsHint: 'Preset packs are part of the rules (Preset-badged tags, grouped by role then pack); plain tags are your own rules. CLICK a tag to park or revive that word; the switch beside a pack name or category parks the whole group. Tags sit in Chinese / English segments. Any live keyword hit routes the task to that role.',
  presetsFileHint: 'Preset packs live in ~/.dsh/baf-route-presets.json — edit the file to add, change, or remove packs; the next task already uses the new words.',
  presetBadge: 'Preset',
  presetAlwaysHint: 'preset pack word · click the tag to park it',
  presetComplexEngineering: 'Complex engineering',
  presetCriticalRelease: 'Critical design & release',
  presetQualityAssurance: 'Test & debug',
  presetRoutineEdits: 'Code & copy edits',
  keywordWords: 'Keywords (| separated)',
  keywordCategory: 'Category (optional)',
  keywordTier: 'Role',
  tagToggle: 'enable or disable this rule',
  tagsZh: 'Chinese',
  tagsEn: 'English',
  keywordAdd: 'Add',
  keywordRemove: 'Remove',
  keywordEdit: 'Edit',
  keywordSave: 'Save',
  keywordCancel: 'Cancel',
  escalateOnly: 'Keywords only escalate',
  escalateOnlyHint: 'A keyword hit raises the role at most; it never lowers it.',
  previewTitle: 'Dry-run',
  previewPlaceholder: 'Type a task summary to try the keyword match…',
  previewRun: 'Dry-run',
  previewNone: 'No role would freeze',
  previewVerify: 'Simulate a verify-failed retry (floor: Reviewer)',
  previewVerifyHint: 'Retry floor: in the real workflow, a turn whose verify stage fails retries at Reviewer or higher — check the box to preview with that floor applied.',
  previewEscalated: 'raised by verify retry',
  save: 'Save',
  cancel: 'Cancel',
  reset: 'Reset',
  loading: 'Loading…',
  loadFailed: 'Could not read the routing config.',
}

export const zh: Record<BafRouteKey, string> = {
  nav: '多模型路由',
  title: '多模型路由',
  description: '按阶段与关键词把工单派给 旗舰 / 评审 / 执行 三级模型。会话选择 Auto 模型时自动路由；选择具体模型则始终使用该模型（~/.dsh/baf-route-config.json）。',
  master: '启用多模型路由',
  dirty: '有未保存修改',
  // 【变更】2026-10-05 (角色三档): 档位以角色命名 — Commander 统帅、Reviewer
  // 评审、Worker 执行；仅呈现层改名，线上仍是 high/mid/low。红/蓝/绿低饱和
  // 点缀区分。
  // 【变更】2026-10-05 (auto 批, point 2): Worker 负责日常编程（implement 默认
  // 档）；Reviewer 审查 Worker 的产出、负责验证（verify 默认档）；Commander
  // 承担复杂工程与关键设计与发布。
  // 【变更】2026-10-06 (问题 3): Worker 重新定位 — 日常代码实现与文案改动
  // 都是执行档；Reviewer 负责审查；Commander 负责架构决策与关键发布。
  // 【变更】2026-10-06 (问题 5/4.2): 角色按客户口径改名 — Commander 呈现为
  // 「旗舰」（强推理、复杂工程），评审/执行语义不变，描述各收紧为一行。
  tierHigh: '旗舰',
  tierMid: '评审',
  tierLow: '执行',
  tierHighDesc: '强推理、复杂工程、关键设计与发布、架构决策',
  tierMidDesc: '评审、排查、测试、审查 Worker 产出',
  tierLowDesc: '代码实现、文档改动、轻量修改',
  provider: '服务商',
  model: '模型',
  effortLabel: '思考力度',
  effortDefault: '默认',
  tiersTitle: '模型分级',
  roleLabel: '角色',
  phaseTitle: '工作流模型绑定',
  flowHint: '为每个工作流阶段绑定角色模型；点击节点切换角色（执行 → 评审 → 旗舰）。',
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
  keywordsHint: '预设词库已是规则的一部分（带「预设」徽标的标签，按角色再按词库分组）；普通标签为自定义规则，可增删改、可归类。点击标签即可停用/启用该词；词库名或分类名旁的开关可整组停用。标签按中文/英文分段显示。命中任一启用关键词即切到对应角色。',
  presetsFileHint: '预设词库存放在 ~/.dsh/baf-route-presets.json，可直接增删改词库；下一次任务即按新词库生效。',
  presetBadge: '预设',
  presetAlwaysHint: '预设词 · 点击标签可停用',
  presetComplexEngineering: '复杂工程',
  presetCriticalRelease: '关键设计与发布',
  presetQualityAssurance: '测试与排查',
  presetRoutineEdits: '代码与文案改动',
  keywordWords: '关键词（| 分隔）',
  keywordCategory: '功能分类（可选）',
  keywordTier: '角色',
  tagToggle: '启用或停用此规则',
  tagsZh: '中文',
  tagsEn: '英文',
  keywordAdd: '添加',
  keywordRemove: '移除',
  keywordEdit: '编辑',
  keywordSave: '保存',
  keywordCancel: '取消',
  escalateOnly: '关键词仅升档',
  escalateOnlyHint: '关键词命中只会抬高档位，不会降低。',
  previewTitle: '预演',
  previewPlaceholder: '输入任务摘要试跑关键词匹配…',
  previewRun: '预演',
  previewNone: '不会冻结角色',
  previewVerify: '模拟 verify 失败重试（保底 Reviewer）',
  previewVerifyHint: '保底规则：真实工作流里 verify 阶段失败的回合，重试时至少用 Reviewer 档执行；勾选后预演按该保底规则演示。',
  previewEscalated: '经 verify 重试保底升档',
  save: '保存',
  cancel: '取消',
  reset: '恢复默认',
  loading: '加载中…',
  loadFailed: '读取路由配置失败。',
}
