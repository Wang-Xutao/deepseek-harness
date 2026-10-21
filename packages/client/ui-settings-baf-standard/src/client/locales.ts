/**
 * BAF 工程规范 overview copy (namespace `baf.standard`).
 * 【变更】2026-10-06 (问题 6 客户决策: 规范总览·只读): the row lives in the
 * 工作流 settings section and never edits — every value row quotes the
 * baseline YAML path it came from, and the copy points edits at the file.
 */

export const NS = 'baf.standard'

const zh = {
  rowTitle: 'BAF 工程规范（规范总览 · 只读）',
  rowDescription: '七个 BAF 插件包各自的规则当前值、作用与配置位置。要改规则：直接编辑工作区里的 .baf/baseline.yml（改完这里刷新可见），工程规则内容改规则文档。',
  // 【变更】2026-10-19 (六问题批 4.1/4.3): panelProject*/panelStandard* heads are
  // deleted — the tab labels already carry the meaning.
  panelQualityTitle: '质量监控',
  // 【变更】2026-10-20 (批次七 2.5): the description now covers the real
  // baf-quality toolchain assets below the baseline stack projection.
  panelQualityDescription: 'stack 配置只读投影 + baf-quality 真实工具链资产（环境搭建、配置、规范文档）。',
  statusLoading: '正在读取工作区基线…',
  statusNoWorkspace: '还没有打开的工作区。先在会话里打开一个项目目录（或在项目里运行 /baf-scaffold 搭好 BAF 工作区），这里就能显示它的规范配置。',
  statusNoBaseline: '当前工作区还没有 BAF 基线（.baf/baseline.yml）。在会话里运行 /baf-scaffold 即可生成：基线配置 + 默认规则文档 + openspec 目录，一步到位。',
  statusFailed: '基线读取失败：',
  // 【变更】2026-10-20 (批次三 4.2): baselineLabel/compatLabel 退役 — 基线档案
  // 头卡随多列网格一起删除，项目工程页只剩受保护路径与状态脚本。
  cwdLabel: '工作区',
  configFileLabel: '配置文件',
  // 【变更】2026-10-18 (项目工程 1.1–1.3): clickable path rows + AI 禁改路径 card.
  // 【变更】2026-10-20 (批次四 3.7): the two path rows live inside a 项目信息 card.
  projectInfoTitle: '项目信息',
  projectPathLabel: '项目路径',
  // 【变更】2026-10-20 (批次四 3.5): copy/open row buttons retire (path click
  // already opens); only 编辑/删除 remain, so their labels retire too.
  editLabel: '编辑',
  deleteLabel: '删除',
  noticeOpenFailed: '打开失败：默认应用未能打开该文件。',
  noticeRevealFailed: '打开失败：未能定位到该路径。',
  // 【变更】2026-10-19 (六问题批 4.1): no-baseline error + the generate button
  // (the settings-page equivalent of typing /baf-scaffold in the session).
  noBaselineError: '当前会话工作区还没有配置文件（.baf/baseline.yml）。',
  generateBaseline: '生成配置文件',
  generatingBaseline: '生成中…',
  generatedNotice: '配置文件已生成：基线配置 + 默认规则文档 + openspec 目录。',
  // 【变更】2026-10-20 (批次三 4.3): the card renames to 受保护路径, drops its
  // long description, and its save/cancel pair replaces 保存到基线.
  protectedTitle: '受保护路径',
  protectedEmpty: '暂无禁改路径，待添加。',
  protectedEditLabel: '编辑禁改路径',
  protectedAddPlaceholder: '相对路径，如 docs 或 src/generated/**',
  protectedAdd: '添加',
  protectedPick: '选择文件夹…',
  protectedSave: '保存',
  protectedCancel: '取消',
  protectedSaving: '保存中…',
  protectedDuplicate: '该路径已在清单中。',
  protectedInvalidEntry: '路径不能为空。',
  protectedPickOutside: '所选文件夹不在当前工作区内，无法换算为相对路径。',
  // 【变更】2026-10-20 (批次四 3.3): the 提交防线 hook status line is deleted
  // from the card footer (save/cancel moved to the title row) — both keys retire.
  // 【变更】2026-10-19 (六问题批 4.1b): 状态脚本 card — per-node enter/exit
  // custom scripts, edited here and enforced at every workflow transition.
  hooksTitle: '状态脚本',
  // 【变更】2026-10-20 (批次三 4.4): the .baf/baseline.yml 说明 is deleted — the
  // canvas + editor carry the meaning; pick/validation keys join the card.
  hooksEnterLabel: '进入状态',
  hooksExitLabel: '退出状态',
  hooksAddPlaceholder: '脚本相对路径，如 scripts/build.sh',
  hooksAdd: '添加',
  hooksEmpty: '未配置脚本',
  // 【变更】2026-10-19 (流程图样式对齐批): canvas node accent lines + legend —
  // the 8-node graph adopts the 多模型路由 flow style (node card + accent).
  hooksEnterShort: '进',
  hooksExitShort: '出',
  hooksEmptyShort: '未配置',
  hooksLegendConfigured: '已配置脚本',
  hooksFlowAria: '工作流状态脚本流程图',
  hooksEditLabel: '编辑脚本路径',
  hooksSave: '保存',
  hooksCancel: '取消',
  hooksSaving: '保存中…',
  // 【变更】2026-10-20 (批次四 3.6): the picker selects a script FILE, not a folder.
  hooksPick: '选择脚本文件',
  hooksPathMissing: '脚本路径不存在，请确认后再添加。',
  hooksNodeIntake: '接单',
  hooksNodeOpen: '建立变更',
  hooksNodeClarify: '澄清',
  hooksNodeDesign: '设计',
  hooksNodePlan: '计划',
  hooksNodeImplement: '实现',
  hooksNodeVerify: '验证',
  hooksNodeArchive: '归档',
  fieldLabel: '字段',
  valueLabel: '当前值',
  stateOk: '生效',
  stateTbd: '企业待定',
  stateAvailabilityReady: '已就绪（规则文档已挂接）',
  stateAvailabilityMissing: '未配置（规则文档未挂接，企业占位仍在）',
  // 【变更】2026-10-20 (批次六 5, 客户决策): the placeholder-driven rules digest
  // + rules-doc viewer keys RETIRE — the 企业规范 tab renders the REAL
  // bafplugin standards as a workflow flow chart (which standard applies at
  // which state; click to read the document itself).
  // 【变更】2026-10-20 (批次七 2.1): enterpriseFlowTitle/Desc retire — the
  // card's title + description rows are gone (the tab label already says it).
  enterpriseFlowAria: '企业规范状态流程图',
  enterpriseLegendDocs: '适用规范',
  enterpriseNodeNone: '无适用规范',
  enterpriseDocsPick: '点击规范打开原文。',
  enterpriseDocApplies: '适用状态：',
  enterpriseDocOpenFile: '打开文件',
  enterpriseDocClose: '关闭',
  enterpriseDocLoading: '正在读取规范文档…',
  enterpriseDocUnknown: '未找到该规范文档。',
  enterpriseDocUnreadable: '规范文档读取失败：',
  // 【变更】2026-10-20 (批次七 2.5): the static gate-mechanism keys retire —
  // the 质量监控 tab now lists the REAL baf-quality toolchain assets.
  qualityToolchainTitle: '质量工具链（baf-quality · 真实资产）',
  qualityGroupEnv: '环境搭建',
  qualityGroupConfig: '配置',
  qualityGroupStandard: '规范文档',
  qualityDocsPick: '点击条目在右侧打开原文。',
  cardTitleWorkflow: 'baf-workflow · 流程引擎',
  cardDescWorkflow: '驱动 intake → open → clarify → design → plan → implement → verify → archive 八节点流程：阶段门禁、工单派发、verify 复核与归档都在这一个包里。',
  cardCommandWorkflow: '会话内 /baf-go 接单开工',
  cardTitleRoute: 'baf-workflow · 多模型路由',
  cardDescRoute: 'Commander / Reviewer / Worker 三级模型分级派单：关键词规则冻结档位，verify 失败的返工至少 Reviewer 档接手（保底规则）。',
  cardCommandRoute: '设置 → 多模型路由（关键词与三级模型在此调）',
  cardTitleOpenspec: 'baf-openspec · 变更产物',
  cardDescOpenspec: 'OpenSpec 变更提案/澄清/设计/任务清单的模板与校验；design.md、plan.json 等 BAF 产物都从这里出发。',
  cardCommandOpenspec: 'verify 阶段自动执行 openspec validate',
  cardTitleStandard: 'baf-standard · 工程规范',
  cardDescStandard: '工程规则的唯一来源投影：8 个规则域（章程/编码风格/接口/错误处理/日志/文档/分支提交/测试纪律）指向规则文档，包里不内嵌规则内容。',
  cardCommandStandard: '规则文档见下方查看器',
  cardTitleQuality: 'baf-quality · 质量门禁',
  cardDescQuality: '编译、构建、测试与覆盖率门禁；verify 阶段按 stack 配置的工具链逐项检查。',
  cardCommandQuality: '按 stack 配置的命令执行',
  cardTitleGuard: 'baf-guard · 安全护栏',
  cardDescGuard: '密钥扫描、受保护路径拦截、以及需要人工确认才能执行的动作清单。',
  cardCommandGuard: 'scaffold / archive / abandon 前自动拦截',
  // 【变更】2026-10-20 (批次三 4.2): cardTitleBaseline…scaffoldFileOpenspec 退役 —
  // 基线档案头卡与脚手架卡随项目工程页瘦身一起删除。
  // 【变更】2026-10-20 (批次七 2.2): enterprisePacks* / enterpriseBlockers* /
  // enterpriseCommandHint retire — the 企业规范资产（方案乙）card is deleted;
  // the tab is the flow chart + document viewer, nothing else.
}

const en = {
  rowTitle: 'BAF standards (read-only overview)',
  rowDescription: 'Current rule values, purpose, and config location for each of the seven BAF plugin packages. To change a rule: edit .baf/baseline.yml in the workspace (refresh here to see it); rule CONTENT lives in the rules document.',
  // 2026-10-19 (六问题批 4.1/4.3): panelProject*/panelStandard* heads deleted.
  panelQualityTitle: 'Quality monitoring',
  panelQualityDescription: 'Read-only stack gate projection plus the real baf-quality toolchain assets (env setup, config, standards docs).',
  statusLoading: 'Reading the workspace baseline…',
  statusNoWorkspace: 'No open workspace yet. Open a project directory in a session (or run /baf-scaffold inside one) and its standards config shows up here.',
  statusNoBaseline: 'This workspace has no BAF baseline (.baf/baseline.yml) yet. Run /baf-scaffold in a session: baseline + default rules document + the openspec directory, in one step.',
  statusFailed: 'Baseline read failed: ',
  cwdLabel: 'Workspace',
  configFileLabel: 'Config file',
  // 2026-10-18 (项目工程 1.1–1.3): clickable path rows + AI-protected paths card.
  projectInfoTitle: 'Project info',
  projectPathLabel: 'Project path',
  editLabel: 'Edit',
  deleteLabel: 'Delete',
  noticeOpenFailed: 'Open failed: the default application could not open this file.',
  noticeRevealFailed: 'Open failed: the path could not be located.',
  // 2026-10-19 (六问题批 4.1): no-baseline error + generate button.
  noBaselineError: 'This session\'s workspace has no config file (.baf/baseline.yml) yet.',
  generateBaseline: 'Generate config file',
  generatingBaseline: 'Generating…',
  generatedNotice: 'Config file generated: baseline + default rules document + the openspec directory.',
  protectedTitle: 'Protected paths',
  protectedEmpty: 'No protected paths yet.',
  protectedEditLabel: 'Edit protected path',
  protectedAddPlaceholder: 'Relative path, e.g. docs or src/generated/**',
  protectedAdd: 'Add',
  protectedPick: 'Choose folder…',
  protectedSave: 'Save',
  protectedCancel: 'Cancel',
  protectedSaving: 'Saving…',
  protectedDuplicate: 'This path is already in the list.',
  protectedInvalidEntry: 'The path cannot be empty.',
  protectedPickOutside: 'The chosen folder is outside the current workspace and cannot become a relative path.',
  // 2026-10-20 (批次四 3.3): hook status line deleted; both keys retire.
  // 2026-10-19 (六问题批 4.1b): per-node enter/exit custom scripts card.
  hooksTitle: 'State scripts',
  hooksEnterLabel: 'Enter state',
  hooksExitLabel: 'Exit state',
  hooksAddPlaceholder: 'script relative path, e.g. scripts/build.sh',
  hooksAdd: 'Add',
  hooksEmpty: 'No scripts configured',
  hooksEnterShort: 'in',
  hooksExitShort: 'out',
  hooksEmptyShort: 'none',
  hooksLegendConfigured: 'scripts configured',
  hooksFlowAria: 'Workflow state-script flow chart',
  hooksEditLabel: 'Edit script path',
  hooksSave: 'Save',
  hooksCancel: 'Cancel',
  hooksSaving: 'Saving…',
  hooksPick: 'Choose script file',
  hooksPathMissing: 'The script path does not exist; check it before adding.',
  hooksNodeIntake: 'Intake',
  hooksNodeOpen: 'Open change',
  hooksNodeClarify: 'Clarify',
  hooksNodeDesign: 'Design',
  hooksNodePlan: 'Plan',
  hooksNodeImplement: 'Implement',
  hooksNodeVerify: 'Verify',
  hooksNodeArchive: 'Archive',
  fieldLabel: 'Field',
  valueLabel: 'Current value',
  stateOk: 'active',
  stateTbd: 'enterprise TBD',
  stateAvailabilityReady: 'ready (rules doc wired)',
  stateAvailabilityMissing: 'policy_missing (rules doc not configured)',
  // (批次七 2.1) enterpriseFlowTitle/Desc retire with the card's title rows.
  enterpriseFlowAria: 'Enterprise standards flow chart',
  enterpriseLegendDocs: 'standards apply',
  enterpriseNodeNone: 'No standards apply',
  enterpriseDocsPick: 'Click a standard to read it.',
  enterpriseDocApplies: 'Applies at: ',
  enterpriseDocOpenFile: 'Open file',
  enterpriseDocClose: 'Close',
  enterpriseDocLoading: 'Reading the standard…',
  enterpriseDocUnknown: 'This standard document was not found.',
  enterpriseDocUnreadable: 'Standard read failed: ',
  // (批次七 2.5) the static gate-mechanism keys retire — the Quality tab lists
  // the REAL baf-quality toolchain assets instead.
  qualityToolchainTitle: 'Quality toolchain (baf-quality · real assets)',
  qualityGroupEnv: 'Environment setup',
  qualityGroupConfig: 'Configuration',
  qualityGroupStandard: 'Standards docs',
  qualityDocsPick: 'Click an entry to open it on the right.',
  cardTitleWorkflow: 'baf-workflow · process engine',
  cardDescWorkflow: 'Drives the intake → open → clarify → design → plan → implement → verify → archive eight-node flow: stage gates, work-order dispatch, verify review, and archiving.',
  cardCommandWorkflow: '/baf-go in a session',
  cardTitleRoute: 'baf-workflow · model routing',
  cardDescRoute: 'Commander / Reviewer / Worker tiered dispatch: keyword rules freeze the tier, and a verify-failed redo runs at Reviewer or above (the floor rule).',
  cardCommandRoute: 'Settings → Model routing (keywords and tiers)',
  cardTitleOpenspec: 'baf-openspec · change artifacts',
  cardDescOpenspec: 'Templates and validation for OpenSpec proposals/clarify/design/tasks; design.md, plan.json, and the other BAF artifacts start here.',
  cardCommandOpenspec: 'openspec validate runs automatically at verify',
  cardTitleStandard: 'baf-standard · engineering standards',
  cardDescStandard: 'The single-source projection of engineering rules: 8 rule areas pointing at the rules document; no rule text is embedded in the package.',
  cardCommandStandard: 'Rules document in the viewer below',
  cardTitleQuality: 'baf-quality · quality gates',
  cardDescQuality: 'Compile, build, test, and coverage gates; verify checks each item per the stack toolchain config.',
  cardCommandQuality: 'Runs the stack-configured commands',
  cardTitleGuard: 'baf-guard · safety rails',
  cardDescGuard: 'Secret scanning, protected-path interception, and the actions that require human confirmation.',
  cardCommandGuard: 'Intercepts before scaffold / archive / abandon',
  // (批次七 2.2) enterprisePacks* / enterpriseBlockers* / enterpriseCommandHint
  // retire — the Plan-B assets card is deleted from the 企业规范 tab.
}

/** Dictionary key union for the baf.standard namespace. */
export type BafStandardKey = keyof typeof zh

export const dictionaries = { zh, en }
