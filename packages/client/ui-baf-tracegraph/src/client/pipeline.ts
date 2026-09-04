/**
 * Stubbed while the trace-graph view is ported off the removed client-runtime
 * ConversationSnapshot. Kept so accidental imports compile.
 */
export type TraceGraphTurnStatus = 'completed' | 'failed' | 'running'

export interface TraceGraphTurnUsage {
  readonly input: number
  readonly cacheRead: number
  readonly output: number
  readonly reasoning: number
}

export interface TraceGraphTurnSummary {
  readonly turn: number
  readonly preview: string
  readonly modelCalls: number
  readonly toolCalls: number
  readonly status: TraceGraphTurnStatus
  readonly startedAt: number | null
  readonly durationMs: number | null
  readonly usage: TraceGraphTurnUsage
}

export type TraceGraphPipelineStep = never

export function deriveTraceGraphTurns(): TraceGraphTurnSummary[] {
  return []
}

export function deriveTraceGraphPipeline(): TraceGraphPipelineStep[] {
  return []
}

export function deriveTraceGraphOrchestration(): [] {
  return []
}

export function formatTraceGraphDuration(ms: number | null): string {
  return ms === null ? '' : String(ms)
}

export function formatTraceGraphTokens(n: number): string {
  return String(n)
}

export function traceGraphTurnTotalTokens(_usage: TraceGraphTurnUsage): number {
  return 0
}
