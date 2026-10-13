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
  | 'advancedHint'
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
  | 'presetsFileHint'
  | 'presetBadge'
  | 'presetAlwaysHint'
  | 'presetComplexEngineering'
  | 'presetCriticalRelease'
  | 'presetQualityAssurance'
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
  | 'previewVerifyHintTwo'
  | 'previewEscalated'
  | 'previewMatched'
  | 'previewRole'
  | 'previewModel'
  | 'previewAutoHint'
  | 'save'
  | 'cancel'
  | 'reset'
  | 'loading'
  | 'loadFailed'

export const en: Record<BafRouteKey, string> = {
  nav: 'Multi-model routing',
  title: 'Multi-model routing',
  description: 'Route work orders by phase and keyword to the chosen model grades. Sessions on Auto route automatically; a pinned model always wins (~/.dsh/baf-route-config.json).',
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
  advancedHint: 'Reset the whole multi-model routing config (~/.dsh/baf-route-config.json) back to factory defaults — three grades with the default models, no keyword rules of your own. Saved bindings and rules are discarded.',
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
  // 【变更】2026-10-07 (九点批 问题 7): rewritten plain — one sentence per rule,
  // no nested terminology; matches the zh copy structure.
  keywordsHint: 'A task goes to whichever tier\'s keyword it hits; with no hit (or keywords off) the fallback grade Worker takes it, so Worker needs no keywords of its own. Tags with a "Preset" badge come built in; plain tags are yours. Click a tag = park/revive that word; the switch by a pack or category name parks the whole group. Chinese and English tags sit in separate segments.',
  presetsFileHint: 'Built-in packs live in ~/.dsh/baf-route-presets.json — edit the file to add or remove packs; the next dispatch already uses them.',
  presetBadge: 'Preset',
  presetAlwaysHint: 'preset pack word · click the tag to park it',
  presetComplexEngineering: 'Complex engineering',
  presetCriticalRelease: 'Critical design & release',
  presetQualityAssurance: 'Test & debug',
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
  previewPlaceholder: 'Type a task summary — match updates as you type…',
  previewRun: 'Dry-run',
  previewNone: 'No keyword matched — no role would freeze from keywords',
  previewVerify: 'Simulate a verify-failed retry',
  previewVerifyHint: 'A real rule: a failed verify retries at Reviewer or above so Worker never retries its own failure. Check the box to include it in the dry-run.',
  previewVerifyHintTwo: 'A real rule: a failed verify retries at Commander so Worker never retries its own failure. Check the box to include it in the dry-run.',
  previewEscalated: 'raised by verify-retry floor',
  previewMatched: 'Matched keyword',
  previewRole: 'Assigned grade',
  previewModel: 'Dispatched model',
  previewAutoHint: 'Results update automatically while you type (no button needed).',
  save: 'Save',
  cancel: 'Cancel',
  reset: 'Reset',
  loading: 'Loading…',
  loadFailed: 'Could not read the routing config.',
}

export const zh: Record<BafRouteKey, string> = {
  nav: '多模型路由',
  title: '多模型路由',
  description: '按阶段与关键词把工单派给所选档位模型。会话选择 Auto 时自动路由；选择具体模型则始终使用该模型（~/.dsh/baf-route-config.json）。',
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
  advancedHint: '把多模型路由配置（~/.dsh/baf-route-config.json）整体恢复为出厂默认：三档默认模型、无自定义关键词规则；已保存的档位绑定与规则都会被清掉。',
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
  // 【变更】2026-10-07 (九点批 问题 7): 通俗化改写 — 一句一条规则，去掉嵌套术语。
  keywordsHint: '命中哪个档的词，任务就派给哪个档的模型；没命中（或关掉关键词）就兜底给 Worker，所以 Worker 不需要自己的关键词。带「预设」角标的是产品自带词库，普通标签是你自己加的。点一下标签＝停用/启用这个词；词库或分类名旁的开关＝整组停用。中文、英文标签分段排列。',
  presetsFileHint: '自带词库存在 ~/.dsh/baf-route-presets.json：改这个文件就能增删词库，下次派单即生效。',
  presetBadge: '预设',
  presetAlwaysHint: '预设词 · 点击标签可停用',
  presetComplexEngineering: '复杂工程',
  presetCriticalRelease: '关键设计与发布',
  presetQualityAssurance: '测试与排查',
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
  previewPlaceholder: '输入任务摘要，输入即自动预演…',
  previewRun: '预演',
  previewNone: '未命中任何关键词 — 不会因关键词冻结角色',
  previewVerify: '模拟 verify 失败重试',
  // 【变更】2026-10-06 (问题 3 批): 保底规则逻辑不动，文案改通俗 — 说清这是
  // 真实规则、为什么要保底（防低档模型反复栽在同一处），勾选只是让预演演示它。
  previewVerifyHint: '这是真实规则：模型自查（verify）没通过的活，重做时至少换 Reviewer 档接手，免得低档模型在同一个坑里反复失败。勾选后，预演就按这条规则演示。',
  previewVerifyHintTwo: '这是真实规则：模型自查（verify）没通过的活，重做时至少换 Commander 档接手，免得 Worker 在同一个坑里反复失败。勾选后，预演就按这条规则演示。',
  previewEscalated: '经 verify 重试保底升档',
  previewMatched: '命中关键词',
  previewRole: '派给档位',
  previewModel: '派给模型',
  previewAutoHint: '输入时自动预演，无需点击按钮。',
  save: '保存',
  cancel: '取消',
  reset: '恢复默认',
  loading: '加载中…',
  loadFailed: '读取路由配置失败。',
}
