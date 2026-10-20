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
  | 'tierModeLabel'
  | 'tierModeTwo'
  | 'tierModeThree'
  | 'advancedTitle'
  | 'tabsAria'
  | 'roleLabel'
  | 'phaseTitle'
  | 'flowHint'
  | 'flowHintTwo'
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
  | 'presetBadge'
  | 'presetAlwaysHint'
  | 'presetComplexEngineering'
  | 'presetCriticalRelease'
  | 'presetQualityAssurance'
  | 'keywordWords'
  | 'keywordCategory'
  | 'keywordTier'
  | 'tagToggle'
  | 'keywordAdd'
  | 'keywordRemove'
  | 'keywordEdit'
  | 'keywordSave'
  | 'keywordCancel'
  | 'previewTitle'
  | 'previewPlaceholder'
  | 'previewRun'
  | 'previewNone'
  | 'previewEscalated'
  | 'previewMatched'
  | 'previewRole'
  | 'previewModel'
  | 'save'
  | 'cancel'
  | 'reset'
  | 'loading'
  | 'loadFailed'

export const en: Record<BafRouteKey, string> = {
  nav: 'Multi-model routing',
  title: 'Multi-model routing',
  // 【变更】2026-10-20 (批次二 2.3): one sentence — the config-file aside and
  // the pinned-model clause are gone; Auto triggers routing, full stop.
  description: 'Route work orders by phase and keyword to the chosen model grades. Sessions on the Auto model route automatically.',
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
  // 【变更】2026-10-06 (问题 2 批): the English role names are the labels after
  // all — Commander/Reviewer/Worker, matching the workflow Tab's vocabulary;
  // Chinese (旗舰/评审/执行) survives only inside the one-line descriptions.
  tierHigh: 'Commander',
  tierMid: 'Reviewer',
  tierLow: 'Worker',
  tierHighDesc: 'Flagship tier: strong reasoning, complex engineering, critical design & release, architecture decisions',
  tierMidDesc: 'Reviewer tier: review, investigation, testing, auditing Worker output',
  tierLowDesc: 'Worker tier: code implementation, documentation edits, light changes',
  provider: 'Provider',
  model: 'Model',
  effortLabel: 'Effort',
  effortDefault: 'Default',
  tiersTitle: 'Model tiers',
  tierModeLabel: 'Grade layout',
  tierModeTwo: 'Two grades',
  tierModeThree: 'Three grades',
  advancedTitle: 'Advanced',
  tabsAria: 'Multi-model routing categories',
  roleLabel: 'Role',
  phaseTitle: 'Workflow model binding',
  flowHint: 'Bind one model role per workflow stage; click a node to cycle its role (Worker → Reviewer → Commander).',
  flowHintTwo: 'Bind one model role per workflow stage; click a node to cycle (Worker ↔ Commander).',
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
  // 【变更】2026-10-20 (批次二 2.2): one sentence — the preset-file pointer and
  // the segment/tag-switch explanations are gone (the tag switches still work;
  // their affordance no longer needs a manual).
  keywordsHint: 'A task goes to whichever tier its keyword hits; with no hit the Worker model takes it as the fallback.',
  presetBadge: 'Preset',
  presetAlwaysHint: 'preset pack word · click the tag to park it',
  presetComplexEngineering: 'Complex engineering',
  presetCriticalRelease: 'Critical design & release',
  presetQualityAssurance: 'Test & debug',
  keywordWords: 'Keywords (| separated)',
  keywordCategory: 'Category (optional)',
  keywordTier: 'Role',
  tagToggle: 'enable or disable this rule',
  keywordAdd: 'Add',
  keywordRemove: 'Remove',
  keywordEdit: 'Edit',
  keywordSave: 'Save',
  keywordCancel: 'Cancel',
  previewTitle: 'Dry-run',
  previewPlaceholder: 'Type a task summary — match updates as you type…',
  previewRun: 'Dry-run',
  previewNone: 'No keyword matched — no role would freeze from keywords',
  previewEscalated: 'raised by verify-retry floor',
  previewMatched: 'Matched keyword',
  previewRole: 'Assigned grade',
  previewModel: 'Dispatched model',
  save: 'Save',
  cancel: 'Cancel',
  // 【变更】2026-10-20 (批次二 2.9): the 高级 tab lost its blast-radius
  // paragraph; the button text spells out what it restores.
  reset: 'Restore defaults',
  loading: 'Loading…',
  loadFailed: 'Could not read the routing config.',
}

export const zh: Record<BafRouteKey, string> = {
  nav: '多模型路由',
  title: '多模型路由',
  // 【变更】2026-10-20 (批次二 2.3): 客户口径一句文案，删掉配置文件与固定模型说明。
  description: '按阶段与关键词把工单派给所选档位模型。会话选择 Auto 模型时自动触发路由。',
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
  // 【变更】2026-10-06 (问题 2 批): 实际使用英文角色名 — Commander/Reviewer/
  // Worker，与工作流 Tab 一致；中文（旗舰/评审/执行）只出现在解释文字里。
  tierHigh: 'Commander',
  tierMid: 'Reviewer',
  tierLow: 'Worker',
  tierHighDesc: '旗舰档：强推理、复杂工程、关键设计与发布、架构决策',
  tierMidDesc: '评审档：评审、排查、测试、审查 Worker 产出',
  tierLowDesc: '执行档：代码实现、文档改动、轻量修改',
  provider: '服务商',
  model: '模型',
  effortLabel: '思考力度',
  effortDefault: '默认',
  tiersTitle: '模型分级',
  tierModeLabel: '挡位选择',
  tierModeTwo: '两档',
  tierModeThree: '三档',
  advancedTitle: '高级',
  tabsAria: '多模型路由分类',
  roleLabel: '角色',
  phaseTitle: '工作流模型绑定',
  flowHint: '为每个工作流阶段绑定角色模型；点击节点切换角色（Worker → Reviewer → Commander）。',
  flowHintTwo: '为每个工作流阶段绑定角色模型；点击节点切换（Worker ↔ Commander）。',
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
  // 【变更】2026-10-20 (批次二 2.2): 两段合并为客户指定的一句话。
  keywordsHint: '命中哪个档的关键词，任务就分配给对应挡位的模型。没有命中则使用Worker模型兜底',
  presetBadge: '预设',
  presetAlwaysHint: '预设词 · 点击标签可停用',
  presetComplexEngineering: '复杂工程',
  presetCriticalRelease: '关键设计与发布',
  presetQualityAssurance: '测试与排查',
  keywordWords: '关键词（| 分隔）',
  keywordCategory: '功能分类（可选）',
  keywordTier: '角色',
  tagToggle: '启用或停用此规则',
  keywordAdd: '添加',
  keywordRemove: '移除',
  keywordEdit: '编辑',
  keywordSave: '保存',
  keywordCancel: '取消',
  previewTitle: '预演',
  previewPlaceholder: '输入任务摘要，输入即自动预演…',
  previewRun: '预演',
  previewNone: '未命中任何关键词 — 不会因关键词冻结角色',
  previewEscalated: '经 verify 重试保底升档',
  previewMatched: '命中关键词',
  previewRole: '派给档位',
  previewModel: '派给模型',
  save: '保存',
  cancel: '取消',
  // 【变更】2026-10-20 (批次二 2.9): 按钮文字改为「恢复默认配置」，长说明删除。
  reset: '恢复默认配置',
  loading: '加载中…',
  loadFailed: '读取路由配置失败。',
}
