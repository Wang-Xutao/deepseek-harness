/**
 * Locale keys and dictionaries for the BAF 工作流 Tab.
 */
export type WorkflowTabKey =
  | 'view.workflow'
  | 'strip.current'
  | 'strip.mode'
  | 'strip.totalTime'
  | 'strip.totalTokens'
  | 'strip.empty'
  | 'strip.blocked'
  | 'strip.idle'
  | 'mode.template'
  | 'mode.fullGoPath'
  | 'mode.bugFixPath'
  | 'mode.clarify'
  | 'mode.help'
  | 'card.duration'
  | 'card.tokens'
  | 'card.next'
  | 'card.condition'
  | 'card.done'
  | 'card.todo'
  | 'card.current'
  | 'metrics.pending'
  | 'intake.title'
  | 'intake.help'
  | 'intake.kind'
  | 'intake.mode'
  | 'intake.scope'
  | 'intake.confidence'
  | 'intake.openspec'
  | 'intake.reasons'
  | 'intake.summary'
  | 'intake.confirmation'
  | 'intake.confirmation.pending'
  | 'intake.confirmation.confirmed'
  | 'intake.confirmation.rejected'
  | 'intake.heuristicNote'
  | 'intake.confidenceHelp'
  | 'intake.allowlist'
  | 'kind.new-requirement'
  | 'kind.bug'
  | 'kind.maintenance'
  | 'kind.unknown'
  | 'scope.single-file'
  | 'scope.small-local'
  | 'scope.cross-module'
  | 'scope.public-api'
  | 'scope.unknown'
  | 'intake.confirm'
  | 'intake.confirmFull'
  | 'intake.confirmFullHelp'
  | 'intake.confirmBugFix'
  | 'intake.confirmBugFixHelp'
  | 'intake.enterOpenHelp'
  | 'intake.reject'
  | 'intake.supplement'
  | 'intake.required'
  | 'intake.notRequired'
  | 'intake.bugFixPath.title'
  | 'intake.bugFixPath.help'
  | 'intake.bugFixPath.problem'
  | 'intake.bugFixPath.rootCause'
  | 'intake.bugFixPath.file'
  | 'intake.bugFixPath.fileHelp'
  | 'intake.bugFixPath.test'
  | 'intake.bugFixPath.testCmd'
  | 'intake.bugFixPath.submit'
  | 'intake.bugFixPath.required'
  | 'detail.title'
  | 'detail.empty'
  | 'detail.checklist'
  | 'detail.todoTitle'
  | 'detail.doneTitle'
  | 'detail.todoEmpty'
  | 'detail.purpose'
  | 'detail.prerequisites'
  | 'detail.actions'
  | 'detail.artifacts'
  | 'detail.completion'
  | 'detail.failure'
  | 'detail.tip'
  | 'detail.failureCodes'
  | 'detail.codeLabel'
  | 'detail.fixLabel'
  | 'detail.entries'
  | 'detail.transitionsIn'
  | 'detail.transitionsOut'
  | 'detail.status'
  | 'detail.skipReasons'
  | 'detail.liveArtifacts'
  | 'detail.zh'
  | 'detail.en'
  | 'status.locked'
  | 'status.available'
  | 'status.in-progress'
  | 'status.completed'
  | 'status.failed'
  | 'status.blocked'
  | 'status.drifted'
  | 'status.skipped'
  | 'status.template'
  | 'status.awaiting'
  | 'status.abandoned'
  | 'terminal.completed.artifacts'
  | 'terminal.completed.completion'
  | 'terminal.abandoned.artifacts'
  | 'terminal.abandoned.completion'
  // §22 — pendingGate card (workspace scaffold gate + change-scoped
  // intake-classify, 2026-09-23 demo2 issue #2).
  | 'pendingGate.title'
  | 'pendingGate.action'
  | 'pendingGate.classifyTitle'
  | 'pendingGate.bugFixFieldsHelp'
  | 'gate.bannerTitle'
  // §22.14 — abandon gate (change-level) Tab button label.
  | 'action.abandon'
  | 'abandon.confirmHelp'
  | 'gate.designDone'
  | 'gate.verifyPassed'
  | 'gate.confirmIntoPlan'
  | 'gate.confirmArchive'
  | 'gate.replyToContinue'
  // §22 GATE_REGISTRY is the single source of truth for gate card text
  // (`renderGate` reads it directly). Earlier we kept a frozen zh/en copy
  // here as a "future i18n migration anchor"; it was never rendered and
  // drifted risk (a §22 edit here had to be mirrored there by hand).
  // §22.16 P3 freeze contract removed 2026-09; if a future phase needs
  // i18n for gate cards, read GATE_REGISTRY and project per-locale at
  // render time, do not re-introduce dead dictionaries.
  | 'lane.bugFixPath'
  | 'lane.fullGoPath'
  | 'lane.help'
  | 'edge.upgraded'
  | 'edge.cause'
  | 'edge.at'
  | 'edge.preserved'
  | 'edge.preservedEmpty'
  | 'node.intake'
  | 'node.open'
  | 'node.clarify'
  | 'node.design'
  | 'node.plan'
  | 'node.implement'
  | 'node.verify'
  | 'node.archive'
  | 'node.drift'
  | 'node.completed'
  | 'node.abandoned'
  | 'action.enterOpen'
  | 'action.startStage'
  | 'action.confirmArchive'
  | 'action.advance'
  | 'action.advanceHelp'
  | 'action.advanceBlocked'
  // §22.19 R5 — terminal dead-end escape (回到进行中的变更).
  | 'action.backToActive'
  | 'action.resume'
  | 'action.resumeHelp'
  | 'action.refresh'
  | 'action.dashboard'
  | 'action.newChange'
  | 'action.newChangeHelp'
  | 'dashboard.activeChanges'
  | 'dashboard.activeSection'
  | 'dashboard.archiveSection'
  | 'dashboard.archived'
  | 'dashboard.completion'
  | 'dashboard.loadFailed'
  | 'dashboard.tasks'
  | 'dashboard.tasksHelp'
  | 'dashboard.title'
  | 'dashboard.close'
  | 'dashboard.help'
  | 'dashboard.empty'
  | 'dashboard.focus'
  | 'dashboard.openChange'
  | 'dashboard.note'
  // 【变更】2026-09-23 (demo5 issue #5): the history flow modal's title.
  | 'dashboard.historyTitle'
  // 2026-09-21 (session 5.jsonl) — artifact rail card.
  | 'artifact.title'
  | 'artifact.help'
  | 'artifact.open'
  | 'artifact.gapCount'
  | 'artifact.missing'
  | 'artifact.state.missing'
  | 'artifact.state.template'
  | 'artifact.state.planned'
  | 'artifact.state.filled'
  // 【变更】2026-09-22 (user report #4) — session token statistics card.
  | 'stats.title'
  | 'stats.help'
  | 'stats.breakdownTitle'
  // 【变更】2026-09-23 (demo5 issue #6): the stats card's three sections.
  | 'stats.section.overview'
  | 'stats.section.tools'
  | 'stats.section.tokens'
  | 'stats.turns'
  | 'stats.steps'
  | 'stats.toolCalls'
  | 'stats.llmTime'
  | 'stats.toolTime'
  | 'stats.ttft'
  | 'stats.tokens'
  | 'stats.total'
  | 'stats.input'
  | 'stats.cacheRead'
  | 'stats.cacheWrite'
  | 'stats.output'
  | 'stats.cacheHit'
  | 'stats.pending'
  | 'empty.hint'
  | 'openspec.skipped'
  | 'graph.aria'
  | 'graph.ops'
  | 'none'

/** Dictionary namespace. */
export const NS = 'baf.go-workflow'

/** English copy. */
export const en: Record<WorkflowTabKey, string> = {
  'view.workflow': 'Workflow',
  'strip.current': 'Current',
  'strip.mode': 'Mode',
  'strip.totalTime': 'Change time',
  'strip.totalTokens': 'Session tokens',
  'strip.empty': 'No active change — reference graph (template)',
  'strip.blocked': 'Blocked',
  'strip.idle': 'Idle',
  'mode.template': 'Template (idle)',
  'mode.fullGoPath': 'Full-go',
  'mode.bugFixPath': 'Bug fix path',
  'mode.clarify': 'Needs clarify',
  'mode.help': 'Template = reference graph before a change starts. After intake: full-go-path / bug-fix-path / clarify-required.',
  'card.duration': 'Time',
  'card.tokens': 'Tokens',
  'card.next': 'Next',
  'card.condition': 'When',
  'card.done': 'Done',
  'card.todo': 'Todo',
  'card.current': 'Current',
  'metrics.pending': 'Model tokens attributed by stage working window',
  'intake.title': 'Change classification',
  'intake.help': 'Intake decides kind/mode/scope before writes. Trigger: chat or New change. Confirm → projection; reject → abandon; supplement → keep chatting.',
  'intake.heuristicNote': 'Kind / scope / confidence are the system\'s keyword pre-judgment (unmatched shows To be determined; confirming does not rewrite them). Mode is the path YOU picked on the classification card; the bug-fix pick settles kind = Bug.',
  'intake.confidenceHelp': 'Confidence = how strongly the keyword pre-judgment matched your description: 70% when a feature/bug keyword hit (新增/需求/feat… or bug/修复/fix…), 40% as the base when nothing matched. It only shapes the system\'s INITIAL suggestion — the path is settled by your click on the classification card, never by this number. It settles with the flow: kind at classification confirm, scope when the plan freezes the file allowlist.',
  'intake.allowlist': 'Allowlist',
  'intake.kind': 'Kind',
  'intake.mode': 'Mode',
  'intake.scope': 'Scope',
  'intake.confidence': 'Confidence',
  'intake.openspec': 'OpenSpec',
  'intake.reasons': 'Reason codes',
  'intake.summary': 'Summary',
  'intake.confirmation': 'Confirmation',
  'intake.confirmation.pending': 'Awaiting your choice',
  'intake.confirmation.confirmed': 'Confirmed (path settled by your click)',
  'intake.confirmation.rejected': 'Rejected',
  'kind.new-requirement': 'New requirement',
  'kind.bug': 'Bug',
  'kind.maintenance': 'Maintenance',
  'kind.unknown': 'To be determined',
  'scope.single-file': 'Single file',
  'scope.small-local': 'Small local change',
  'scope.cross-module': 'Cross-module',
  'scope.public-api': 'Public API',
  'scope.unknown': 'To be determined',
  'intake.confirm': 'Confirm classification',
  'intake.confirmFull': 'Confirm · Full path',
  'intake.confirmFullHelp': 'Confirm the classification and enter the full go path (one click: confirm + open)',
  'intake.confirmBugFix': 'Confirm · Bug-fix path',
  'intake.confirmBugFixHelp': 'Confirm the bug-fix fast path — fill the five bug fields below first, the click submits them in one step',
  'intake.enterOpenHelp': 'The classification is confirmed but the open step was blocked (e.g. Git unavailable) — click to retry entering open',
  'intake.reject': 'Reject and exit',
  'intake.supplement': 'Add details in chat',
  'intake.required': 'Required',
  'intake.notRequired': 'Not required',
  'intake.bugFixPath.title': 'Fast-path Bug fields',
  'intake.bugFixPath.help': 'Five required fields gate the fast-path ledger. They map 1:1 to the slash form.',
  'intake.bugFixPath.problem': 'Problem',
  'intake.bugFixPath.rootCause': 'Root cause',
  'intake.bugFixPath.file': 'Affected files (one per line)',
  'intake.bugFixPath.fileHelp': 'Repeat or list — each line becomes one `file=` argument.',
  'intake.bugFixPath.test': 'Regression test file',
  'intake.bugFixPath.testCmd': 'Regression test command',
  'intake.bugFixPath.submit': 'Submit fast-path',
  'intake.bugFixPath.required': 'All five fields are required before fast-path can dispatch.',
  'detail.title': 'Stage detail',
  'detail.empty': 'Select a stage on the graph',
  'detail.checklist': 'Stage checklist',
  'detail.todoTitle': 'Not done yet',
  'detail.doneTitle': 'Done',
  'detail.todoEmpty': 'No open items for this stage',
  'detail.purpose': 'Purpose',
  'detail.prerequisites': 'Prerequisites',
  'detail.actions': 'Actions',
  'detail.artifacts': 'Expected artifacts',
  'detail.completion': 'Completion',
  'detail.failure': 'Failure handling',
  'detail.tip': 'Plain-language tip',
  'detail.failureCodes': 'Common failures & fixes',
  'detail.codeLabel': 'code',
  'detail.fixLabel': 'fix',
  'detail.entries': 'Entries',
  'detail.transitionsIn': 'Inbound transitions',
  'detail.transitionsOut': 'Outbound transitions',
  'detail.status': 'Status',
  'detail.skipReasons': 'Skip / block reasons',
  'detail.liveArtifacts': 'Recorded artifacts',
  'detail.zh': 'Chinese',
  'detail.en': 'English',
  'status.locked': 'Locked',
  'status.available': 'Available',
  'status.in-progress': 'In progress',
  'status.completed': 'Completed',
  'status.failed': 'Failed',
  'status.blocked': 'Blocked',
  'status.drifted': 'Drifted',
  'status.skipped': 'Ignored',
  'status.template': 'Idle',
  'status.awaiting': 'Awaiting customer',
  'status.abandoned': 'Abandoned',
  'terminal.completed.artifacts': 'Archived under openspec/changes/archive/<changeId>/ — every stage document plus the verify report',
  'terminal.completed.completion': 'The change passed verification and was archived; the audit trail (projection log) is preserved',
  'terminal.abandoned.artifacts': 'Kept in place for audit (no archive move); the projection log records the abandon decision',
  'terminal.abandoned.completion': 'The change was abandoned before completion; nothing further runs on it',
  // §22 — pendingGate card.
  'pendingGate.title': 'Workspace bootstrap required',
  'pendingGate.action': 'Resolve in Tab',
  'pendingGate.classifyTitle': 'Requirement classification awaiting your choice',
  'pendingGate.bugFixFieldsHelp': 'Bug-fix path needs five fields — fill the bug-fix form in the rail first, or the confirm returns the missing list',
  'gate.bannerTitle': 'Workflow decision',
  // §22.14 — abandon change-level gate button label.
  'action.abandon': 'Abandon this change',
  'abandon.confirmHelp': 'Abandoning ends this change and keeps only the audit trail. The slash form /baf-workflow-abandon confirm has the same effect.',
  'gate.designDone': 'Design is done — confirm to enter plan',
  'gate.verifyPassed': 'Verify passed — confirm to archive',
  'gate.confirmIntoPlan': 'Confirm and continue',
  'gate.confirmArchive': 'Confirm archive',
  'gate.replyToContinue': 'Run /baf-go again to continue',
  'lane.bugFixPath': 'Bug fix path (before the upgrade)',
  'lane.fullGoPath': 'Full-go (after the upgrade)',
  'lane.help': 'A fast-path change that escalated keeps both paths: the earlier lane is greyed but never deleted.',
  'edge.upgraded': 'T15 upgrade: {from} → {to}',
  'edge.cause': 'Cause',
  'edge.at': 'When',
  'edge.preserved': 'Pre-upgrade artifacts (no OpenSpec)',
  'edge.preservedEmpty': 'No artifacts were produced before the upgrade',
  'node.intake': 'Intake',
  'node.open': 'Open',
  'node.clarify': 'Clarify',
  'node.design': 'Design',
  'node.plan': 'Plan',
  'node.implement': 'Implement',
  'node.verify': 'Verify',
  'node.archive': 'Archive',
  'node.drift': 'Drift',
  'node.completed': 'Completed',
  'node.abandoned': 'Abandoned',
  'action.enterOpen': 'Enter open',
  'action.startStage': 'Start stage',
  'action.confirmArchive': 'Confirm archive',
  'action.advance': 'Advance',
  'action.advanceHelp': 'Push the workflow to the next customer confirmation point — same as typing /baf-go in chat: pops the dialog, and the stage the model lands on gets a work order.',
  'action.advanceBlocked': 'Advance is locked until the current stage artifact passes its gate. What is missing:',
  'action.backToActive': 'Back to the active change',
  'action.resume': 'Roll back to…',
  'action.resumeHelp': 'Drift never clears itself. Pick the stage to re-enter — everything after it is re-run.',
  'action.refresh': 'Refresh',
  'action.dashboard': 'Changes',
  'action.newChange': 'New change',
  'action.newChangeHelp': 'Starts intake for a new change (no source writes until confirmed).',
  'dashboard.title': 'Change dashboard',
  'dashboard.close': 'Close',
  'dashboard.help': 'Every change in this workspace — phases, task progress, and cost at a glance.',
  'dashboard.empty': 'No active changes.',
  'dashboard.focus': 'Focus',
  'dashboard.openChange': 'Show this change in the workflow tab',
  'dashboard.note': 'Rows open the flow graph focused on that change; terminal rows read their archived artifacts.',
  'dashboard.activeChanges': 'Active changes',
  'dashboard.activeSection': 'Active changes',
  'dashboard.archiveSection': 'Archive history',
  'dashboard.archived': 'Archived',
  'dashboard.completion': 'Task completion',
  'dashboard.tasks': 'Plan tasks',
  'dashboard.tasksHelp': 'Plan tasks: done/total checkboxes from the change\'s plan.json task ledger (full-go-path changes only; a change without a plan ledger counts 0).',
  'dashboard.loadFailed': 'Dashboard load failed — retry with Refresh.',
  'dashboard.historyTitle': 'Change history',
  'artifact.title': 'Stage artifacts',
  'artifact.help': 'One row per stage document. Open reviews/edits it in the sidebar; the state mirrors /baf-status.',
  'artifact.open': 'Open',
  'artifact.gapCount': '{n} items missing (hover to view)',
  'artifact.missing': 'Not generated yet — run /baf-go to reach the stage that creates it',
  'artifact.state.missing': 'not generated',
  'artifact.state.template': 'template unfilled',
  'artifact.state.planned': 'planned',
  'artifact.state.filled': 'filled',
  'stats.title': 'Session stats',
  'stats.help': 'Whole-session figures from the durable log: turn/step counts, model and tool wall time, and cumulative provider token usage.',
  'stats.breakdownTitle': 'Input {input} · cache read {cacheRead} · cache write {cacheWrite} · output {output}',
  'stats.section.overview': 'Overview',
  'stats.section.tools': 'Tools',
  'stats.section.tokens': 'Tokens',
  'stats.turns': 'Turns',
  'stats.steps': 'Steps',
  'stats.toolCalls': 'Tool calls',
  'stats.llmTime': 'Model time',
  'stats.toolTime': 'Tool time',
  'stats.ttft': 'First token',
  'stats.tokens': 'Tokens',
  'stats.total': 'Total',
  'stats.input': 'Input (uncached)',
  'stats.cacheRead': 'Cache read',
  'stats.cacheWrite': 'Cache write',
  'stats.output': 'Output',
  'stats.cacheHit': 'Cache hit',
  'stats.pending': 'No usage recorded yet — stats appear after the first completed step',
  'empty.hint': 'Describe the change, then start intake.',
  'openspec.skipped': 'OpenSpec skipped (fast path)',
  'graph.aria': 'BAF go workflow graph',
  'graph.ops': 'Operations',
  'none': '—',
}

/** Simplified Chinese copy. */
export const zh: Record<WorkflowTabKey, string> = {
  'view.workflow': '工作流',
  'strip.current': '当前',
  'strip.mode': '模式',
  'strip.totalTime': '变更耗时',
  'strip.totalTokens': '会话 tokens',
  'strip.empty': '暂无变更 — 参考图（模板）',
  'strip.blocked': '阻断',
  'strip.idle': '空闲',
  'mode.template': '模板（空闲）',
  'mode.fullGoPath': '完整流程',
  'mode.bugFixPath': '缺陷修复路径',
  'mode.clarify': '需先澄清',
  'mode.help': '模板 = 还没开始变更时的参考图。分类确认后才会变成完整流程 / 缺陷修复路径 / 需澄清。',
  'card.duration': '耗时',
  'card.tokens': 'Tokens',
  'card.next': '下一跳',
  'card.condition': '条件',
  'card.done': '已作',
  'card.todo': '未作',
  'card.current': '当前',
  'metrics.pending': '模型 tokens，按各阶段工作时段归属',
  'intake.title': '变更分类',
  'intake.help': '写源码前判定类型/模式/范围。触发：对话或「新建变更」。确认→投影；拒绝→放弃；补充→继续对话。',
  'intake.heuristicNote': '类型 / 影响范围 / 置信度是系统关键词初判（没匹配上就显示「待定」，确认分类不会改写它们）；模式是你在分类卡上点的路径；选「缺陷修复路径」会把类型定为「缺陷」。',
  // 【变更】2026-09-24 (demo6 问题 8): 置信度给出可读解释——40% 基准 / 70% 命中
  // 关键词，且说明它在流程中何时落定（类型随确认、范围随计划白名单）。
  'intake.confidenceHelp': '初判置信度 = 关键词初判的把握程度：描述里命中「新增 / 需求 / feat」或「bug / 修复 / fix」这类关键词时为 70%；一个关键词都没命中时为基准 40%。它只影响系统的最初建议——路径由你在分类卡上的点选决定，与这个数字无关。这两个字段会随流程落定：类型在分类确认时确定，影响范围在计划冻结文件白名单时确定。',
  'intake.allowlist': '白名单',
  'intake.kind': '类型',
  'intake.mode': '模式',
  'intake.scope': '影响范围',
  'intake.confidence': '初判置信度',
  'intake.openspec': 'OpenSpec',
  'intake.reasons': '原因码',
  'intake.summary': '摘要',
  'intake.confirmation': '确认状态',
  'intake.confirmation.pending': '待你确认',
  'intake.confirmation.confirmed': '已确认（路径由你的点选落定）',
  'intake.confirmation.rejected': '已拒绝',
  'kind.new-requirement': '新需求',
  'kind.bug': '缺陷',
  'kind.maintenance': '维护',
  // 【变更】2026-09-23 (demo1 十问题 3/9): 待定 says WHEN it settles — bug-fix
  // 选择在分类确认即定类型，其余在归档时随账本落定。
  'kind.unknown': '待分类/归档确定',
  'scope.single-file': '单文件',
  'scope.small-local': '局部小改',
  'scope.cross-module': '跨模块',
  'scope.public-api': '公共 API',
  'scope.unknown': '待归档确定',
  'intake.confirm': '确认分类',
  'intake.confirmFull': '确认 · 完整流程',
  'intake.confirmFullHelp': '确认分类并进入完整流程（一次点击 = 确认 + 进入建立变更）',
  'intake.confirmBugFix': '确认 · 缺陷修复路径',
  'intake.confirmBugFixHelp': '确认走缺陷修复快速路径——先在下方补齐五个缺陷字段，点击时一并提交',
  'intake.enterOpenHelp': '分类已确认但进入建立变更被阻断（如 Git 不可用）——点击重试进入',
  'intake.reject': '拒绝并退出',
  'intake.supplement': '在对话中补充',
  'intake.required': '需要',
  'intake.notRequired': '不需要',
  'intake.bugFixPath.title': 'fast-path Bug 字段',
  'intake.bugFixPath.help': '5 字段是 fast-path 账本的硬性前置；与 slash 的 key=value 一一对应。',
  'intake.bugFixPath.problem': '现象',
  'intake.bugFixPath.rootCause': '根因',
  'intake.bugFixPath.file': '受影响文件（每行一个）',
  'intake.bugFixPath.fileHelp': '可重复也可换行 — 每行就是一个 file= 参数。',
  'intake.bugFixPath.test': '回归测试文件',
  'intake.bugFixPath.testCmd': '回归测试命令',
  'intake.bugFixPath.submit': '提交 fast-path',
  'intake.bugFixPath.required': 'fast-path 必须填齐 5 字段后才能提交。',
  'detail.title': '阶段详情',
  'detail.empty': '在流程图中选择一个阶段',
  'detail.checklist': '本阶段清单',
  'detail.todoTitle': '未作（优先处理）',
  'detail.doneTitle': '已作',
  'detail.todoEmpty': '本阶段暂无未作项',
  'detail.purpose': '目标',
  'detail.prerequisites': '前置条件',
  'detail.actions': '操作步骤',
  'detail.artifacts': '期望产物',
  'detail.completion': '完成条件',
  'detail.failure': '失败处理',
  'detail.tip': '通俗说明',
  'detail.failureCodes': '常见失败与处理',
  'detail.codeLabel': '错误码',
  'detail.fixLabel': '怎么处理',
  'detail.entries': '入口',
  'detail.transitionsIn': '入边条件',
  'detail.transitionsOut': '出边条件',
  'detail.status': '状态',
  'detail.skipReasons': '跳过/阻断理由',
  'detail.liveArtifacts': '已记录产物',
  'detail.zh': '中文',
  'detail.en': 'English',
  'status.locked': '锁定',
  'status.available': '可用',
  'status.in-progress': '进行中',
  'status.completed': '已完成',
  'status.failed': '失败',
  'status.blocked': '阻断',
  'status.drifted': '漂移',
  // 【变更】2026-09-23 (demo1 十问题 9): 终态后未走到的节点读「已忽略」——
  // 不再显示 锁定/空闲（终态之后没有待解锁的东西）。
  'status.skipped': '已忽略',
  'status.template': '空闲',
  'status.awaiting': '待客户确认',
  'status.abandoned': '已放弃',
  'terminal.completed.artifacts': '归档在 openspec/changes/archive/<变更ID>/——各阶段文档与验收报告',
  'terminal.completed.completion': '变更通过验证并已归档；投影日志（审计轨迹）保留',
  'terminal.abandoned.artifacts': '原地保留供审计（不移动归档）；投影日志记录放弃决策',
  'terminal.abandoned.completion': '变更在完成前被放弃；不再有任何流程动作',
  // §22 — pendingGate card.
  'pendingGate.title': '工作区需要先初始化',
  'pendingGate.action': '在 Tab 解决',
  'pendingGate.classifyTitle': '需求分类待确认',
  'pendingGate.bugFixFieldsHelp': '缺陷修复路径需要五个字段——先在右侧栏填写缺陷修复表单，否则确认会返回缺项清单',
  'gate.bannerTitle': '工作流决策',
  // §22.14 — abandon change-level gate button label.
  'action.abandon': '放弃此变更',
  'abandon.confirmHelp': '放弃将结束此变更并仅保留审计轨迹。slash 形式 /baf-workflow-abandon confirm 效果相同。',
  'gate.designDone': '设计文档已实现 · 请确认是否进入 plan',
  'gate.verifyPassed': 'verify 已通过 · 请确认是否归档',
  'gate.confirmIntoPlan': '确认进入下一阶段',
  'gate.confirmArchive': '确认归档',
  'gate.replyToContinue': '再敲一次 /baf-go 继续',
  // §22.16 P3 freeze contract removed 2026-09 — see WorkflowTabKey.
  'lane.bugFixPath': '缺陷修复路径（升级前）',
  'lane.fullGoPath': '完整流程（升级后）',
  'lane.help': '缺陷修复路径中途升级后，两条路径都保留：升级前那条置灰，但不删除。',
  'edge.upgraded': 'T15 升级：{from} → {to}',
  'edge.cause': '原因',
  'edge.at': '时间',
  'edge.preserved': '升级前产物（未走 OpenSpec）',
  'edge.preservedEmpty': '升级前没有产生产物',
  'node.intake': '分类',
  'node.open': '建立变更',
  'node.clarify': '澄清',
  'node.design': '设计',
  'node.plan': '计划',
  'node.implement': '实现',
  'node.verify': '验证',
  'node.archive': '归档',
  'node.drift': '漂移',
  'node.completed': '完成',
  'node.abandoned': '已放弃',
  'action.enterOpen': '进入建立变更',
  'action.startStage': '开始阶段',
  'action.confirmArchive': '确认归档',
  'action.advance': '推进',
  'action.advanceHelp': '把工作流推进到下一个需要你确认的点——与在对话里输入 /baf-go 完全一致：会弹出确认框，模型落定的阶段会收到工单派单',
  'action.advanceBlocked': '当前阶段产物未过完成门，暂不能推进。缺什么：',
  'action.backToActive': '回到进行中的变更',
  'action.resume': '复位到…',
  'action.resumeHelp': '漂移不会自行消失。请选择要重新进入的阶段——它之后的阶段会重跑。',
  'action.refresh': '刷新',
  'action.dashboard': '变更总览',
  'action.newChange': '新建变更',
  'action.newChangeHelp': '启动 intake；确认前不写源码。',
  'dashboard.title': '变更总览',
  'dashboard.close': '关闭',
  'dashboard.help': '本工作区全部变更 — 阶段、任务进度、耗时与 token 一览。',
  'dashboard.empty': '暂无进行中的变更。',
  'dashboard.activeChanges': '进行中变更',
  'dashboard.activeSection': '进行中的变更',
  'dashboard.archiveSection': '归档历史',
  'dashboard.archived': '已归档',
  'dashboard.completion': '任务完成率',
  // 【变更】2026-09-24 (demo6 问题 7): 「任务」改名「计划任务」并配悬停解释——
  // 统计的是 plan.json 任务清单的勾选数，不是任意待办。
  'dashboard.tasks': '计划任务',
  'dashboard.tasksHelp': '计划任务：该变更 plan.json 任务清单中已勾选完成的数量（仅完整流程变更有计划账本；缺陷修复路径不计数）。',
  'dashboard.loadFailed': '总览加载失败 — 点刷新重试。',
  'dashboard.historyTitle': '历史流程图',
  'dashboard.focus': '当前焦点',
  'dashboard.openChange': '在工作流页查看该变更',
  'dashboard.note': '点击行即在流程图聚焦该变更；终态行的产物从归档目录读取。',
  'artifact.title': '阶段产物',
  'artifact.help': '每个阶段文档一行；「打开」在侧栏查看/编辑。状态与 /baf-status 一致。',
  'artifact.open': '打开',
  'artifact.gapCount': '缺 {n} 项（悬停查看）',
  'artifact.missing': '尚未生成——先 /baf-go 推进到产出它的阶段',
  'artifact.state.missing': '尚未生成',
  'artifact.state.template': '仍是未填的模板',
  'artifact.state.planned': '已计划',
  'artifact.state.filled': '已填写',
  'stats.title': '会话统计',
  'stats.help': '来自完整会话日志的累计数字：回合/步骤数、模型与工具耗时、以及按 provider 上报累计的 token 用量。',
  'stats.breakdownTitle': '输入 {input} · 缓存读 {cacheRead} · 缓存写 {cacheWrite} · 输出 {output}',
  'stats.section.overview': '概览',
  'stats.section.tools': '工具',
  'stats.section.tokens': 'Tokens',
  'stats.turns': '回合',
  'stats.steps': '步骤',
  'stats.toolCalls': '工具调用',
  'stats.llmTime': '模型耗时',
  'stats.toolTime': '工具耗时',
  'stats.ttft': '首字延迟',
  'stats.tokens': 'Tokens',
  'stats.total': '合计',
  'stats.input': '输入（未命中）',
  'stats.cacheRead': '缓存读',
  'stats.cacheWrite': '缓存写',
  'stats.output': '输出',
  'stats.cacheHit': '缓存命中',
  'stats.pending': '暂无用量——完成一个步骤后统计会出现',
  'empty.hint': '描述变更，然后启动 intake。',
  'openspec.skipped': '已跳过 OpenSpec（缺陷修复路径）',
  'graph.aria': 'BAF go 工作流图',
  'graph.ops': '细分操作',
  'none': '—',
}
