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
  | 'traceGraph.on'
  | 'traceGraph.off'

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
  'section.intro': '控制会话 Tab 中的轨迹图等可视化功能。',
  'traceGraph.title': '轨迹图',
  'traceGraph.description': '关闭后，对话 Tab 不再显示「轨迹图」。',
  'traceGraph.on': '已开启',
  'traceGraph.off': '已关闭',
}

/** English dictionary (workflow namespace). */
export const enWorkflow: Record<WorkflowKey, string> = {
  'section.title': 'Workflow',
  'section.intro': 'Toggle the agent-execution visualisations shown on the conversation tab.',
  'traceGraph.title': 'Trace Graph',
  'traceGraph.description': 'Hide the Trace Graph tab on the conversation view.',
  'traceGraph.on': 'Enabled',
  'traceGraph.off': 'Disabled',
}
