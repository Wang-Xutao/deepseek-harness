/** `baf.trace-graph` + `baf.workflow` namespace dictionaries. */

/** Conversation view tab dictionary namespace owned by this plugin. */
export const NS = 'baf.trace-graph'

/** Settings section dictionary namespace owned by this plugin. */
export const WORKFLOW_NS = 'baf.workflow'

/** The trace-graph dictionary key set. */
export type TraceGraphKey =
  | 'view.trace-graph'
  | 'stats.turns'
  | 'stats.steps'
  | 'stats.toolCalls'
  | 'stats.duration'
  | 'turns.title'
  | 'turns.empty'
  | 'turns.round'
  | 'turns.modelCalls'
  | 'turns.toolCalls'
  | 'turns.tokens'
  | 'turns.duration'
  | 'turns.status.completed'
  | 'turns.status.failed'
  | 'turns.status.running'
  | 'pipeline.empty'
  | 'pipeline.modelCall'
  | 'pipeline.request'
  | 'pipeline.response'
  | 'pipeline.tool'
  | 'pipeline.systemMessages'
  | 'pipeline.userMessages'
  | 'pipeline.tools'
  | 'pipeline.reasoning'
  | 'pipeline.content'
  | 'pipeline.toolCalls'
  | 'pipeline.inputTokens'
  | 'pipeline.cachedTokens'
  | 'pipeline.outputTokens'
  | 'card.model'
  | 'card.provider'
  | 'card.system'
  | 'card.user'
  | 'card.toolsCount'
  | 'card.status'
  | 'card.toolCallsCount'
  | 'card.reasoning'
  | 'card.content'
  | 'card.args'
  | 'card.result'
  | 'card.duration'
  | 'card.riskSafe'
  | 'card.riskMatched'
  | 'card.targetPaths'
  | 'detail.step'
  | 'detail.turn'
  | 'detail.model'
  | 'detail.provider'
  | 'detail.duration'
  | 'detail.inputTokens'
  | 'detail.outputTokens'
  | 'detail.cachedTokens'
  | 'detail.toolCalls'
  | 'detail.command'
  | 'detail.commandDangerous'
  | 'detail.commandCaution'
  | 'detail.riskReasons'
  | 'orch.title'
  | 'orch.empty'
  | 'orch.member'
  | 'orch.loadingChild'
  | 'orch.childError'
  | 'orch.backToParent'
  | 'detail.title'
  | 'detail.empty'

/** The workflow settings section dictionary key set. */
export type WorkflowKey =
  | 'section.title'
  | 'section.intro'
  | 'traceGraph.title'
  | 'traceGraph.description'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The 轨迹图 view tab label and surface copy. */
    'baf.trace-graph': TraceGraphKey
    /** The 工作流 settings section copy. */
    'baf.workflow': WorkflowKey
  }
}

/** Simplified Chinese dictionary (trace-graph namespace). */
export const zh: Record<TraceGraphKey, string> = {
  'view.trace-graph': '轨迹图',
  'stats.turns': '用户轮次',
  'stats.steps': '模型调用',
  'stats.toolCalls': '工具调用',
  'stats.duration': '总时长',
  'turns.title': '用户对话',
  'turns.empty': '暂无对话轮次',
  'turns.round': '第 {n} 轮',
  'turns.modelCalls': '{n} 次模型调用',
  'turns.toolCalls': '{n} 次工具调用',
  'turns.tokens': '{n} tokens',
  'turns.duration': '时长 {duration}',
  'turns.status.completed': '已完成',
  'turns.status.failed': '失败',
  'turns.status.running': '进行中',
  'pipeline.empty': '选择左侧轮次查看执行链路',
  'pipeline.modelCall': '模型调用 {n}',
  'pipeline.request': 'REQUEST',
  'pipeline.response': 'RESPONSE',
  'pipeline.tool': 'TOOL',
  'pipeline.systemMessages': 'System {n}',
  'pipeline.userMessages': 'User {n}',
  'pipeline.tools': 'Tools {n}',
  'pipeline.reasoning': 'Reasoning',
  'pipeline.content': 'Content',
  'pipeline.toolCalls': 'Tool calls {n}',
  'pipeline.inputTokens': '输入 {n}',
  'pipeline.cachedTokens': '缓存 {n}',
  'pipeline.outputTokens': '输出 {n}',
  'card.model': '模型',
  'card.provider': '提供方',
  'card.system': 'System',
  'card.user': 'User',
  'card.toolsCount': '工具',
  'card.status': '状态',
  'card.toolCallsCount': '工具调用',
  'card.reasoning': '推理',
  'card.content': '内容',
  'card.args': '参数',
  'card.result': '结果',
  'card.duration': '耗时',
  'card.riskSafe': '安全',
  'card.riskMatched': '命中规则：',
  'card.targetPaths': '目标路径',
  'detail.step': '步骤',
  'detail.turn': '轮次',
  'detail.model': '模型',
  'detail.provider': '提供方',
  'detail.duration': '耗时',
  'detail.inputTokens': '输入 tokens',
  'detail.outputTokens': '输出 tokens',
  'detail.cachedTokens': '缓存 tokens',
  'detail.toolCalls': '工具调用',
  'detail.command': '命令',
  'detail.commandDangerous': '命令（危险）',
  'detail.commandCaution': '命令（谨慎）',
  'detail.riskReasons': '风险原因：',
  'orch.title': '编排',
  'orch.empty': '本会话无编排运行',
  'orch.member': '成员',
  'orch.loadingChild': '正在加载子会话轨迹…',
  'orch.childError': '无法加载子会话轨迹',
  'orch.backToParent': '返回父会话',
  'detail.title': '详情',
  'detail.empty': '选择流水线中的步骤查看详情',
}

/** English dictionary (trace-graph namespace). */
export const en: Record<TraceGraphKey, string> = {
  'view.trace-graph': 'Trace Graph',
  'stats.turns': 'User turns',
  'stats.steps': 'Model calls',
  'stats.toolCalls': 'Tool calls',
  'stats.duration': 'Duration',
  'turns.title': 'User dialogue',
  'turns.empty': 'No turns yet',
  'turns.round': 'Round {n}',
  'turns.modelCalls': '{n} model calls',
  'turns.toolCalls': '{n} tool calls',
  'turns.tokens': '{n} tokens',
  'turns.duration': 'Duration {duration}',
  'turns.status.completed': 'Completed',
  'turns.status.failed': 'Failed',
  'turns.status.running': 'Running',
  'pipeline.empty': 'Select a turn to inspect the execution pipeline',
  'pipeline.modelCall': 'Model call {n}',
  'pipeline.request': 'REQUEST',
  'pipeline.response': 'RESPONSE',
  'pipeline.tool': 'TOOL',
  'pipeline.systemMessages': 'System {n}',
  'pipeline.userMessages': 'User {n}',
  'pipeline.tools': 'Tools {n}',
  'pipeline.reasoning': 'Reasoning',
  'pipeline.content': 'Content',
  'pipeline.toolCalls': 'Tool calls {n}',
  'pipeline.inputTokens': 'Input {n}',
  'pipeline.cachedTokens': 'Cached {n}',
  'pipeline.outputTokens': 'Output {n}',
  'card.model': 'Model',
  'card.provider': 'Provider',
  'card.system': 'System',
  'card.user': 'User',
  'card.toolsCount': 'Tools',
  'card.status': 'Status',
  'card.toolCallsCount': 'Tool calls',
  'card.reasoning': 'Reasoning',
  'card.content': 'Content',
  'card.args': 'Args',
  'card.result': 'Result',
  'card.duration': 'Duration',
  'card.riskSafe': 'Safe',
  'card.riskMatched': 'Matched: ',
  'card.targetPaths': 'Target paths',
  'detail.step': 'Step',
  'detail.turn': 'Turn',
  'detail.model': 'Model',
  'detail.provider': 'Provider',
  'detail.duration': 'Duration',
  'detail.inputTokens': 'input tokens',
  'detail.outputTokens': 'output tokens',
  'detail.cachedTokens': 'cached tokens',
  'detail.toolCalls': 'Tool calls',
  'detail.command': 'command',
  'detail.commandDangerous': 'command (dangerous)',
  'detail.commandCaution': 'command (caution)',
  'detail.riskReasons': 'risk reasons: ',
  'orch.title': 'Orchestration',
  'orch.empty': 'No orchestration runs in this session',
  'orch.member': 'Members',
  'orch.loadingChild': 'Loading child session trace…',
  'orch.childError': 'Could not load the child session trace',
  'orch.backToParent': 'Back to parent',
  'detail.title': 'Details',
  'detail.empty': 'Select a pipeline step for details',
}

/** Simplified Chinese dictionary (workflow namespace). */
export const zhWorkflow: Record<WorkflowKey, string> = {
  'section.title': '工作流',
  'section.intro': 'BAF 企业工作流相关选项。',
  'traceGraph.title': '轨迹图',
  'traceGraph.description': '关闭后，对话 Tab 不再显示「轨迹图」。',
}

/** English dictionary (workflow namespace). */
export const enWorkflow: Record<WorkflowKey, string> = {
  'section.title': 'Workflow',
  'section.intro': 'BAF enterprise workflow preferences.',
  'traceGraph.title': 'Trace Graph',
  'traceGraph.description': 'Hide the Trace Graph tab on the conversation view.',
}
