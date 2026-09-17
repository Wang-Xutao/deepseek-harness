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
  | 'mode.fullGo'
  | 'mode.fastPath'
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
  | 'intake.confirm'
  | 'intake.reject'
  | 'intake.supplement'
  | 'intake.required'
  | 'intake.notRequired'
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
  | 'gate.designDone'
  | 'gate.verifyPassed'
  | 'gate.confirmIntoPlan'
  | 'gate.confirmArchive'
  | 'gate.replyToContinue'
  | 'lane.fastpath'
  | 'lane.fullgo'
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
  | 'action.resume'
  | 'action.resumeHelp'
  | 'action.refresh'
  | 'action.dashboard'
  | 'action.newChange'
  | 'action.newChangeHelp'
  | 'dashboard.title'
  | 'dashboard.close'
  | 'dashboard.help'
  | 'dashboard.empty'
  | 'dashboard.focus'
  | 'dashboard.note'
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
  'strip.totalTokens': 'Change tokens',
  'strip.empty': 'No active change — reference graph (template)',
  'strip.blocked': 'Blocked',
  'strip.idle': 'Idle',
  'mode.template': 'Template (idle)',
  'mode.fullGo': 'Full-go',
  'mode.fastPath': 'Bug fast-path',
  'mode.clarify': 'Needs clarify',
  'mode.help': 'Template = reference graph before a change starts. After intake: full-go / bug-fast-path / clarify-required.',
  'card.duration': 'Time',
  'card.tokens': 'Tokens',
  'card.next': 'Next',
  'card.condition': 'When',
  'card.done': 'Done',
  'card.todo': 'Todo',
  'card.current': 'Current',
  'metrics.pending': 'Per-stage tokens after Phase 5',
  'intake.title': 'Change classification (intake)',
  'intake.help': 'Intake decides kind/mode/scope before writes. Trigger: chat or New change. Confirm → projection; reject → abandon; supplement → keep chatting.',
  'intake.kind': 'Kind',
  'intake.mode': 'Mode',
  'intake.scope': 'Scope',
  'intake.confidence': 'Confidence',
  'intake.openspec': 'OpenSpec',
  'intake.reasons': 'Reason codes',
  'intake.summary': 'Summary',
  'intake.confirm': 'Confirm classification',
  'intake.reject': 'Reject and exit',
  'intake.supplement': 'Add details in chat',
  'intake.required': 'Required',
  'intake.notRequired': 'Not required',
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
  'status.skipped': 'Skipped',
  'status.template': 'Idle',
  'status.awaiting': 'Awaiting customer',
  'gate.designDone': 'Design is done — confirm to enter plan',
  'gate.verifyPassed': 'Verify passed — confirm to archive',
  'gate.confirmIntoPlan': 'Confirm and continue',
  'gate.confirmArchive': 'Confirm archive',
  'gate.replyToContinue': 'Run /baf-go again to continue',
  'lane.fastpath': 'Bug fast-path (before the upgrade)',
  'lane.fullgo': 'Full-go (after the upgrade)',
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
  'action.resume': 'Roll back to…',
  'action.resumeHelp': 'Drift never clears itself. Pick the stage to re-enter — everything after it is re-run.',
  'action.refresh': 'Refresh',
  'action.dashboard': 'Changes',
  'action.newChange': 'New change',
  'action.newChangeHelp': 'Starts intake for a new change (no source writes until confirmed).',
  'dashboard.title': 'Change dashboard',
  'dashboard.close': 'Close',
  'dashboard.help': 'Lists changes recorded under this workspace projection.',
  'dashboard.empty': 'No changes yet — start intake from the workflow tab.',
  'dashboard.focus': 'Focus',
  'dashboard.note': 'Full archive filters and export ship in Phase 8; this panel is the early entry.',
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
  'strip.totalTokens': '变更 tokens',
  'strip.empty': '暂无变更 — 参考图（模板）',
  'strip.blocked': '阻断',
  'strip.idle': '空闲',
  'mode.template': '模板（空闲）',
  'mode.fullGo': '完整流程',
  'mode.fastPath': '缺陷快路径',
  'mode.clarify': '需先澄清',
  'mode.help': '模板 = 还没开始变更时的参考图。分类确认后才会变成完整流程 / 快路径 / 需澄清。',
  'card.duration': '耗时',
  'card.tokens': 'Tokens',
  'card.next': '下一跳',
  'card.condition': '条件',
  'card.done': '已作',
  'card.todo': '未作',
  'card.current': '当前',
  'metrics.pending': '分阶段 tokens 将在后续版本写入',
  'intake.title': '变更分类（intake）',
  'intake.help': '写源码前判定类型/模式/范围。触发：对话或「新建变更」。确认→投影；拒绝→放弃；补充→继续对话。',
  'intake.kind': '类型',
  'intake.mode': '模式',
  'intake.scope': '影响范围',
  'intake.confidence': '置信度',
  'intake.openspec': 'OpenSpec',
  'intake.reasons': '原因码',
  'intake.summary': '摘要',
  'intake.confirm': '确认分类',
  'intake.reject': '拒绝并退出',
  'intake.supplement': '在对话中补充',
  'intake.required': '需要',
  'intake.notRequired': '不需要',
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
  'status.skipped': '已跳过',
  'status.template': '空闲',
  'status.awaiting': '待客户确认',
  'gate.designDone': '设计文档已实现 · 请确认是否进入 plan',
  'gate.verifyPassed': 'verify 已通过 · 请确认是否归档',
  'gate.confirmIntoPlan': '确认进入下一阶段',
  'gate.confirmArchive': '确认归档',
  'gate.replyToContinue': '再敲一次 /baf-go 继续',
  'lane.fastpath': '缺陷快路径（升级前）',
  'lane.fullgo': '完整流程（升级后）',
  'lane.help': '快路径中途升级后，两条 path 都保留：升级前那条置灰，但不删除。',
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
  'action.resume': '复位到…',
  'action.resumeHelp': '漂移不会自行消失。请选择要重新进入的阶段——它之后的阶段会重跑。',
  'action.refresh': '刷新',
  'action.dashboard': '变更总览',
  'action.newChange': '新建变更',
  'action.newChangeHelp': '启动 intake；确认前不写源码。',
  'dashboard.title': '变更总览',
  'dashboard.close': '关闭',
  'dashboard.help': '列出本工作区 projection 中已记录的变更。',
  'dashboard.empty': '暂无变更 — 请先在工作流页新建或描述需求。',
  'dashboard.focus': '当前焦点',
  'dashboard.note': '完整筛选/归档导出在 Phase 8；此处为工作流页入口（可先查看列表）。',
  'empty.hint': '描述变更，然后启动 intake。',
  'openspec.skipped': '已跳过 OpenSpec（fast path）',
  'graph.aria': 'BAF go 工作流图',
  'graph.ops': '细分操作',
  'none': '—',
}
