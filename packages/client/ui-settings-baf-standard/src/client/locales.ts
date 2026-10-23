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
  // 【变更】2026-10-21 (质量监控重构 1.1–1.5): the tab head (title + description)
  // and the old UT/toolchain card keys retire — the tab is THREE cards now
  // (环境 / 配置 / 规范), each carrying its own keys below.
  qolEnvTitle: '环境',
  qolEnvProbing: '正在检测工具链…',
  qolEnvSupported: '当前工作区支持单元测试环境',
  qolEnvUnsupported: '环境不完整',
  qolEnvNoWorkspace: '先打开一个工作区，再检测环境。',
  qolEnvColTool: '工具',
  qolEnvColRole: '用途',
  qolEnvColVersion: '版本',
  qolEnvColState: '状态',
  // 【变更】2026-10-22 (批次十四 3): the env table's new 配置文件 column —
  // each tool's required config files, click to preview (the 质量资产 row it
  // replaces said only 已应用到工作区 as a whole).
  qolEnvColConfig: '配置文件',
  qolEnvCfgNone: '—',
  qolEnvCfgMissing: '未写入',
  qolEnvOk: '已就绪',
  qolEnvMissing: '未安装',
  qolEnvUnknown: '未确认',
  qolEnvRequired: '必装',
  qolEnvOptional: '选装',
  qolEnvInstall: '一键安装',
  qolEnvInstalling: '安装中…gem/pip 步骤可能需要数分钟',
  qolEnvRecheck: '重新检测',
  qolEnvSteps: '安装报告',
  qolEnvToolGcc: 'C 编译器',
  qolEnvToolRuby: 'Ceedling 运行时',
  qolEnvToolCeedling: '单元测试构建（gem）',
  qolEnvToolGcovr: '覆盖率报告（pip）',
  qolEnvToolCpplint: '风格检查（pip）',
  qolEnvToolCppcheck: '静态分析',
  qolEnvToolClangFormat: '代码排版（代码冻结步骤）',
  qolCfgNoWorkspace: '先打开一个工作区，再读取配置。',
  qolCfgReport: '测试报告',
  qolCfgReportMissing: '未生成',
  qolReportTitle: '测试报告',
  qolReportLoading: '正在读取测试报告…',
  qolReportMissing: '测试报告还未生成：运行一次单元测试（baf-quality check）后生成。',
  qolReportUnreadable: '测试报告读取失败：',
  // 【变更】2026-10-21 (指令集 tab): the per-state baf-command flow chart's
  // copy (command text itself rides the baf-commands-catalog mirror).
  // 【变更】2026-10-22 (批次十一 3): the legend keys retire (图例删除) and the
  // tab splits into two cards — 状态指令 + 全局指令 — each with its own
  // title/intro; every command row carries three captioned lines.
  // 【变更】2026-10-22 (批次十五 4): cmdStateTitle/cmdStateIntro retire — the
  // 状态指令 card starts directly at its flow canvas (the 全局指令 card keeps
  // its own title/intro).
  cmdFlowAria: 'BAF 指令集状态流程图',
  cmdAccentUnit: '条指令',
  cmdNodeNone: '该状态没有专属指令（全局指令仍然可用）',
  cmdPick: '点击状态节点查看该状态支持的指令。',
  cmdGlobalTitle: '全局指令 · 任何状态可用',
  cmdGlobalIntro: '与阶段无关的常备指令：查状态、初始化、体检、升级这类操作任何时候都能用。每条同样给出作用、功能与运行结果。',
  cmdUseLabel: '作用',
  cmdEffectLabel: '功能',
  cmdResultLabel: '结果',
  // 【变更】2026-10-22 (批次十二 3 → 批次十三 4): the 资产 card dissolved into
  // the 测试流 canvas — these are the 资产 modal's own keys (chips + preview).
  qolAssetOpen: '打开',
  // 【变更】2026-10-22 (批次十五 2): every file-preview modal's top-right pair —
  // 打开 (default app) + 打开文件夹 (reveal in file manager).
  qolAssetReveal: '打开文件夹',
  qolAssetMissing: '未安装',
  qolAssetLoading: '正在读取…',
  qolAssetReadFailed: '读取失败：',
  qolAssetModalTitle: '质量资产预览',
  // 【变更】2026-10-22 (批次十三 3/4): AI 协助安装 + the 测试流 canvas — the
  // 配置/资产/规范 cards dissolve into the flow diagram, so only the keys the
  // canvas + modals still speak remain above; the card-level keys retire.
  qolEnvAiHelp: 'AI 协助安装',
  qolEnvAiHelpTitle: '打开一个 baf 会话并预填求助指令（含缺失清单与安装报告），确认后按回车发送。',
  qflowTitle: '测试流',
  // 【变更】2026-10-22 (批次十五 3): qflowIntro 删除（客户指定）——画布本身已是
  // 说明，卡片标题下不再赘述八步链。
  qflowPrereqLabel: '前置',
  qflowPrereqHint: '先在上方环境卡装好工具链。',
  qflowSwitchEnabled: '启用',
  qflowSwitchHalt: '失败中止',
  qflowDisabled: '已停用——不参与测试流（依赖它的下游也已停用）。',
  qflowChipCfg: '配置',
  qflowChipAsset: '资产',
  qflowChipStd: '规范',
  // 【变更】2026-10-22 (批次十四 4): the canvas upgrade's copy — per-node tool
  // state chip (from the 环境 probe) + the 主链/独立 phase tag.
  qflowToolReady: '工具就绪',
  qflowToolMissing: '工具未装',
  qflowToolUnknown: '工具未知',
  qflowChainChip: '主链',
  qflowSideChip: '独立',
  qflowBuildDir: '构建目录',
  qflowTestDir: '测试目录',
  qflowReportDir: '报告目录',
  qflowThreshold: '覆盖率阈值',
  qflowGateMode: '门禁模式',
  qflowReportPreview: '预览报告',
  qflowLoading: '读取测试流配置…',
  qflowNoWorkspace: '先打开一个工作区，再配置测试流。',
  qflowSaveFailed: '开关保存失败：',
  qflowNodeBuild: 'gcc 编译',
  qflowNodeTest: 'ceedling 单元测试',
  qflowNodeInstrument: 'gcov 覆盖率插桩',
  qflowNodeReport: 'gcovr 报告生成',
  qflowNodeGate: '覆盖率检查',
  qflowNodeLint: 'cpplint 风格检查',
  qflowNodeAnalyze: 'cppcheck 静态分析',
  qflowNodeFormat: 'clang-format 格式化',
  qflowEnBuild: 'Build (gcc)',
  qflowEnTest: 'Unit tests (ceedling)',
  qflowEnInstrument: 'Coverage instrumentation (gcov)',
  qflowEnReport: 'Coverage report (gcovr)',
  qflowEnGate: 'Coverage gate',
  qflowEnLint: 'Style lint (cpplint)',
  qflowEnAnalyze: 'Static analysis (cppcheck)',
  qflowEnFormat: 'Final layout (clang-format)',
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
  // 【变更】2026-10-22 (批次十一 4): enterpriseLegendDocs retires — the legend
  // row is deleted from the 企业规范 tab (客户指定).
  enterpriseNodeNone: '无适用规范',
  // 【变更】2026-10-21 (批次八 3.2): the doc viewer is a full-screen modal —
  // enterpriseDocClose retires (the scrim click / Escape is the only way out)
  // and the pick hints say so.
  enterpriseDocsPick: '点击规范全屏打开原文；点文档外空白处关闭。',
  enterpriseDocApplies: '适用状态：',
  enterpriseDocOpenFile: '打开文件',
  enterpriseDocLoading: '正在读取规范文档…',
  enterpriseDocUnknown: '未找到该规范文档。',
  enterpriseDocUnreadable: '规范文档读取失败：',
  // 【变更】2026-10-22 (批次十一 4): the doc viewer renders MARKDOWN now —
  // these feed the shared MarkdownText chrome (code fence + footnote copy).
  mdCopy: '复制',
  mdCopied: '已复制',
  mdCode: '代码',
  mdWrap: '换行',
  mdUnwrap: '不换行',
  mdFootnotes: '脚注',
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
  // (质量监控重构 1.1–1.5): the tab head + old UT/toolchain card keys retire —
  // the tab is THREE cards now (环境 / 配置 / 规范).
  qolEnvTitle: 'Environment',
  qolEnvProbing: 'Probing the toolchain…',
  qolEnvSupported: 'This workspace supports the unit-test environment',
  qolEnvUnsupported: 'Environment incomplete',
  qolEnvNoWorkspace: 'Open a workspace first, then probe the environment.',
  qolEnvColTool: 'Tool',
  qolEnvColRole: 'Role',
  qolEnvColVersion: 'Version',
  qolEnvColState: 'State',
  qolEnvColConfig: 'Config file',
  qolEnvCfgNone: '—',
  qolEnvCfgMissing: 'not written',
  qolEnvOk: 'ready',
  qolEnvMissing: 'not installed',
  qolEnvUnknown: 'unconfirmed',
  qolEnvRequired: 'required',
  qolEnvOptional: 'optional',
  qolEnvInstall: 'One-click install',
  qolEnvInstalling: 'Installing… gem/pip steps can take minutes',
  qolEnvRecheck: 'Re-probe',
  qolEnvSteps: 'Install report',
  qolEnvToolGcc: 'C compiler',
  qolEnvToolRuby: 'Ceedling runtime',
  qolEnvToolCeedling: 'unit-test build (gem)',
  qolEnvToolGcovr: 'coverage report (pip)',
  qolEnvToolCpplint: 'style lint (pip)',
  qolEnvToolCppcheck: 'static analysis',
  qolEnvToolClangFormat: 'code layout (the code-freeze step)',
  qolCfgNoWorkspace: 'Open a workspace first, then read the configuration.',
  qolCfgReport: 'Test report',
  qolCfgReportMissing: 'not generated',
  qolReportTitle: 'Test report',
  qolReportLoading: 'Reading the test report…',
  qolReportMissing: 'The test report has not been generated yet: run the unit tests once (baf-quality check).',
  qolReportUnreadable: 'Test report read failed: ',
  // (批次十三 3/4) AI-assisted install + the 测试流 canvas.
  qolEnvAiHelp: 'AI-assisted install',
  qolEnvAiHelpTitle: 'Open a baf session with a prefilled help request (missing tools + install report); press Enter to send.',
  qflowTitle: 'Test flow',
  qflowPrereqLabel: 'Prerequisite',
  qflowPrereqHint: 'Install the toolchain in the environment card above first.',
  qflowSwitchEnabled: 'Enabled',
  qflowSwitchHalt: 'Halt on error',
  qflowDisabled: 'Disabled — out of the test flow (its dependents are disabled too).',
  qflowChipCfg: 'Config',
  qflowChipAsset: 'Assets',
  qflowChipStd: 'Standards',
  qflowToolReady: 'tool ready',
  qflowToolMissing: 'tool missing',
  qflowToolUnknown: 'tool unknown',
  qflowChainChip: 'chain',
  qflowSideChip: 'standalone',
  qflowBuildDir: 'Build dir',
  qflowTestDir: 'Test dir',
  qflowReportDir: 'Report dir',
  qflowThreshold: 'Coverage threshold',
  qflowGateMode: 'Gate mode',
  qflowReportPreview: 'Preview report',
  qflowLoading: 'Reading the test-flow switches…',
  qflowNoWorkspace: 'Open a workspace first, then configure the test flow.',
  qflowSaveFailed: 'Switch save failed: ',
  qflowNodeBuild: 'gcc build',
  qflowNodeTest: 'ceedling unit tests',
  qflowNodeInstrument: 'gcov coverage instrumentation',
  qflowNodeReport: 'gcovr report',
  qflowNodeGate: 'Coverage gate',
  qflowNodeLint: 'cpplint style lint',
  qflowNodeAnalyze: 'cppcheck static analysis',
  qflowNodeFormat: 'clang-format final layout',
  qflowEnBuild: 'Build (gcc)',
  qflowEnTest: 'Unit tests (ceedling)',
  qflowEnInstrument: 'Coverage instrumentation (gcov)',
  qflowEnReport: 'Coverage report (gcovr)',
  qflowEnGate: 'Coverage gate',
  qflowEnLint: 'Style lint (cpplint)',
  qflowEnAnalyze: 'Static analysis (cppcheck)',
  qflowEnFormat: 'Final layout (clang-format)',
  // (指令集 tab) the per-state command flow chart's copy.
  // (批次十一 3) legend keys retire; two cards with their own title/intro;
  // every row carries three captioned lines.
  // (批次十五 4) cmdStateTitle/cmdStateIntro retire — the state card opens at
  // its flow canvas directly.
  cmdFlowAria: 'BAF commands flow chart',
  cmdAccentUnit: 'commands',
  cmdNodeNone: 'No state-bound commands here (global ones still apply)',
  cmdPick: 'Click a state node to list its commands.',
  cmdGlobalTitle: 'Global commands · any state',
  cmdGlobalIntro: 'Stage-independent commands — status, scaffolding, health checks, updates — usable at any time. Each row explains purpose, mechanism, and result the same way.',
  cmdUseLabel: 'Purpose',
  cmdEffectLabel: 'Does',
  cmdResultLabel: 'Result',
  // (批次十二 3 → 批次十三 4) the 资产 card dissolved into the 测试流 canvas —
  // these are the 资产 modal's own keys (chips + preview).
  qolAssetOpen: 'Open',
  // (批次十五 2) every file-preview modal's top-right pair.
  qolAssetReveal: 'Reveal in folder',
  qolAssetMissing: 'not installed',
  qolAssetLoading: 'Reading…',
  qolAssetReadFailed: 'Read failed: ',
  qolAssetModalTitle: 'Quality asset preview',
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
  // (批次十一 4) enterpriseLegendDocs retires with the deleted legend row.
  enterpriseFlowAria: 'Enterprise standards flow chart',
  enterpriseNodeNone: 'No standards apply',
  // (批次八 3.2) the doc viewer is a full-screen modal — enterpriseDocClose
  // retires; the scrim click / Escape is the only way out.
  enterpriseDocsPick: 'Click a standard to read it full screen; click the blank area outside the document to close.',
  enterpriseDocApplies: 'Applies at: ',
  enterpriseDocOpenFile: 'Open file',
  enterpriseDocLoading: 'Reading the standard…',
  enterpriseDocUnknown: 'This standard document was not found.',
  enterpriseDocUnreadable: 'Standard read failed: ',
  // (批次十一 4) markdown chrome copy for the shared MarkdownText renderer.
  mdCopy: 'Copy',
  mdCopied: 'Copied',
  mdCode: 'Code',
  mdWrap: 'Wrap',
  mdUnwrap: 'Unwrap',
  mdFootnotes: 'Footnotes',
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
