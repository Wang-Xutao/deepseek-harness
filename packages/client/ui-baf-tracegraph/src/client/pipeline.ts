/**
 * Fold a Trajectory snapshot into turn summaries and REQUEST→RESPONSE→TOOL
 * pipeline rows for the 轨迹图 view.
 */
import type {
  AssistantMessageNode,
  ConversationLocation,
  ConversationNode,
  ConversationSnapshot,
  RequestView,
  ToolResultNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { TrajectorySnapshot } from '@deepseek-ai/dsh-client-ui-trajectory/src/client/trajectory-contract.ts'
import type { WorkflowRunChatData } from '@deepseek-ai/dsh-client-ui-workflow-run/src/client/workflow-definition.ts'

/** Coarse turn outcome for the left navigator. */
export type TraceGraphTurnStatus = 'completed' | 'failed' | 'running'

/** Token usage rolled up across every model call in one turn. */
export interface TraceGraphTurnUsage {
  readonly input: number
  readonly cacheRead: number
  readonly output: number
  readonly reasoning: number
}

/** One user-dialogue round in the left navigator. */
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

/** Token usage shown on one model-call row. */
export interface TraceGraphUsage {
  readonly input?: number
  readonly cacheRead?: number
  readonly output?: number
  readonly reasoning?: number
}

/** REQUEST card facts. */
export interface TraceGraphRequestCard {
  readonly model: string
  readonly provider: string
  readonly systemCount: number
  readonly userCount: number
  readonly toolCount: number
}

/** RESPONSE card facts. */
export interface TraceGraphResponseCard {
  readonly reasoningPreview: string
  readonly contentPreview: string
  readonly toolCallCount: number
  readonly status: 'ok' | 'error' | 'running'
}

/** TOOL card facts. */
export interface TraceGraphToolCard {
  readonly callId: string
  readonly name: string
  readonly argsPreview: string
  readonly resultPreview: string
  readonly isError: boolean
  readonly durationMs: number | null
}

/** One model-call row: request → response → tools. */
export interface TraceGraphPipelineStep {
  readonly key: string
  readonly turn: number
  readonly step: number
  readonly startedAt: number | null
  readonly durationMs: number | null
  readonly usage: TraceGraphUsage | undefined
  readonly request: TraceGraphRequestCard
  readonly response: TraceGraphResponseCard
  readonly tools: readonly TraceGraphToolCard[]
}

/** Orchestration run excerpt for the 轨迹图 header. */
export interface TraceGraphOrchestrationRun {
  readonly key: string
  readonly name: string
  readonly status: WorkflowRunChatData['status']
  readonly phases: WorkflowRunChatData['phases']
}

const EMPTY_USAGE: TraceGraphTurnUsage = { input: 0, cacheRead: 0, output: 0, reasoning: 0 }

type AssistantRequest = Extract<RequestView, { purpose: 'assistant' }>

function previewText(content: readonly { type: string; text?: string }[]): string {
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') {
      const text = block.text.trim().replace(/\s+/g, ' ')
      return text.length > 80 ? `${text.slice(0, 77)}…` : text
    }
  }
  return ''
}

function truncate(text: string, max = 72): string {
  const compact = text.trim().replace(/\s+/g, ' ')
  if (compact.length <= max) return compact
  return `${compact.slice(0, Math.max(0, max - 1))}…`
}

function finiteTime(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function locationTurn(location: ConversationLocation | undefined): number | undefined {
  if (location === undefined) return undefined
  if (location.kind === 'turn' || location.kind === 'step') return location.turn.turn
  return undefined
}

function usageOf(value: unknown): TraceGraphUsage | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as {
    inputTokens?: unknown
    cacheReadTokens?: unknown
    outputTokens?: unknown
    reasoningTokens?: unknown
  }
  const usage: TraceGraphUsage = {
    ...(typeof record.inputTokens === 'number' ? { input: record.inputTokens } : {}),
    ...(typeof record.cacheReadTokens === 'number' ? { cacheRead: record.cacheReadTokens } : {}),
    ...(typeof record.outputTokens === 'number' ? { output: record.outputTokens } : {}),
    ...(typeof record.reasoningTokens === 'number' ? { reasoning: record.reasoningTokens } : {}),
  }
  return usage.input === undefined
    && usage.cacheRead === undefined
    && usage.output === undefined
    && usage.reasoning === undefined
    ? undefined
    : usage
}

function indexToolResults(nodes: readonly ConversationNode[]): Map<string, ToolResultNode> {
  const map = new Map<string, ToolResultNode>()
  for (const node of nodes) {
    if (node.kind === 'tool-result') map.set(node.callId, node)
  }
  return map
}

function toolCardsFromAssistant(
  node: AssistantMessageNode,
  results: ReadonlyMap<string, ToolResultNode>,
): TraceGraphToolCard[] {
  const cards: TraceGraphToolCard[] = []
  for (const block of node.blocks) {
    if (block.kind !== 'tool-call') continue
    const result = results.get(block.callId)
    cards.push({
      callId: block.callId,
      name: block.name,
      argsPreview: truncate(block.argsRaw),
      resultPreview: result === undefined
        ? ''
        : truncate(result.content.map(part =>
          part.type === 'text' ? part.text : '').join('')),
      isError: result?.isError === true,
      durationMs: result !== undefined && result.callTime !== null
        ? Math.max(0, result.time - result.callTime)
        : null,
    })
  }
  return cards
}

function turnStatus(
  turn: number,
  turnEnds: ConversationSnapshot['turnEnds'],
  failed: boolean,
  running: boolean,
): TraceGraphTurnStatus {
  if (failed) return 'failed'
  if (turnEnds.has(turn)) return 'completed'
  return running ? 'running' : 'completed'
}

function addUsage(
  accumulator: TraceGraphTurnUsage,
  usage: TraceGraphUsage | undefined,
): TraceGraphTurnUsage {
  if (usage === undefined) return accumulator
  return {
    input: accumulator.input + (usage.input ?? 0),
    cacheRead: accumulator.cacheRead + (usage.cacheRead ?? 0),
    output: accumulator.output + (usage.output ?? 0),
    reasoning: accumulator.reasoning + (usage.reasoning ?? 0),
  }
}

function turnBounds(
  trajectory: TrajectorySnapshot,
  turn: number,
  turnTimings: ConversationSnapshot['turnTimings'],
): { start: number | null; end: number | null } {
  let start = finiteTime(turnTimings.get(turn)?.startTime)
  let end = finiteTime(turnTimings.get(turn)?.endTime)
  for (const node of trajectory.eventNodes) {
    if (node.kind !== 'assistant') continue
    if (node.turn !== turn) continue
    if (node.step <= 0) continue
    const nodeStart = finiteTime(node.timing?.stepStartTime) ?? finiteTime(node.time)
    const nodeEnd = finiteTime(node.timing?.completedTime) ?? finiteTime(node.time)
    if (start === null || (nodeStart !== null && nodeStart < start)) start = nodeStart
    if (end === null || (nodeEnd !== null && nodeEnd > end)) end = nodeEnd
  }
  return { start, end }
}

/**
 * Build left-rail turn summaries from a Trajectory snapshot and turn timings.
 * @param trajectory - assembled trajectory target.
 * @param turnTimings - in-window turn start/end times.
 * @param turnEnds - completed turn → end seq map (presence = closed).
 * @param running - whether the session still has an active turn.
 * @returns ordered turn summaries.
 */
export function deriveTraceGraphTurns(
  trajectory: TrajectorySnapshot,
  turnTimings: ConversationSnapshot['turnTimings'],
  turnEnds: ConversationSnapshot['turnEnds'],
  running: boolean,
): readonly TraceGraphTurnSummary[] {
  const byTurn = new Map<number, TraceGraphTurnSummary>()
  const ensure = (turn: number): TraceGraphTurnSummary => {
    const existing = byTurn.get(turn)
    if (existing !== undefined) return existing
    const created: TraceGraphTurnSummary = {
      turn,
      preview: '',
      modelCalls: 0,
      toolCalls: 0,
      status: turnStatus(turn, turnEnds, false, running),
      startedAt: finiteTime(turnTimings.get(turn)?.startTime),
      durationMs: null,
      usage: { ...EMPTY_USAGE },
    }
    byTurn.set(turn, created)
    return created
  }

  for (const node of trajectory.eventNodes) {
    if (node.kind === 'user') {
      const turn = locationTurn(trajectory.eventLocations.get(node.seq))
      if (turn === undefined) continue
      const current = ensure(turn)
      const preview = previewText(node.content as readonly { type: string; text?: string }[])
      if (current.preview === '' && preview !== '') {
        byTurn.set(turn, {
          ...current,
          preview,
          startedAt: current.startedAt ?? finiteTime(node.time),
        })
      }
      continue
    }
    if (node.kind === 'assistant' && node.step > 0) {
      const current = ensure(node.turn)
      const toolCalls = node.blocks.filter(block => block.kind === 'tool-call').length
      byTurn.set(node.turn, {
        ...current,
        modelCalls: current.modelCalls + 1,
        toolCalls: current.toolCalls + toolCalls,
        usage: addUsage(current.usage, usageOf(node.usage)),
        status: turnStatus(node.turn, turnEnds, false, running),
      })
      continue
    }
    if (node.kind === 'tool-result' && node.isError) {
      const turn = locationTurn(trajectory.eventLocations.get(node.seq))
      if (turn === undefined) continue
      const current = byTurn.get(turn)
      if (current !== undefined) {
        byTurn.set(turn, { ...current, status: 'failed' })
      }
      continue
    }
    if (node.kind === 'turn-error') {
      const current = ensure(node.turn)
      byTurn.set(node.turn, { ...current, status: 'failed' })
    }
  }

  for (const request of trajectory.requests) {
    if (request.purpose !== 'assistant') continue
    const current = ensure(request.turn)
    byTurn.set(request.turn, {
      ...current,
      usage: addUsage(current.usage, usageOf(request.usage)),
    })
  }

  for (const [turn, summary] of byTurn) {
    const bounds = turnBounds(trajectory, turn, turnTimings)
    let durationMs: number | null = null
    if (bounds.start !== null && bounds.end !== null && bounds.end >= bounds.start) {
      durationMs = bounds.end - bounds.start
    } else if (bounds.start !== null && summary.status === 'running') {
      durationMs = Date.now() - bounds.start
    }
    byTurn.set(turn, { ...summary, durationMs })
  }

  return [...byTurn.values()].sort((a, b) => a.turn - b.turn)
}

/**
 * Build pipeline steps for one turn from a Trajectory snapshot.
 * @param trajectory - assembled trajectory target.
 * @param turn - selected turn number.
 * @returns ordered model-call pipeline rows.
 */
export function deriveTraceGraphPipeline(
  trajectory: TrajectorySnapshot,
  turn: number,
): readonly TraceGraphPipelineStep[] {
  const results = indexToolResults(trajectory.eventNodes)
  const assistants = trajectory.eventNodes.filter(
    (node): node is AssistantMessageNode =>
      node.kind === 'assistant' && node.turn === turn && node.step > 0,
  )
  const requestsByStep = new Map<number, AssistantRequest>()
  for (const request of trajectory.requests) {
    if (request.purpose === 'assistant' && request.turn === turn) {
      requestsByStep.set(request.step, request)
    }
  }
  const steps: TraceGraphPipelineStep[] = []
  const seen = new Set<number>()
  for (const node of assistants) {
    seen.add(node.step)
    const request = requestsByStep.get(node.step)
    const tools = toolCardsFromAssistant(node, results)
    const reasoning = node.blocks.find(block => block.kind === 'reasoning')
    const content = node.blocks.find(block => block.kind === 'text')
    const durationMs = node.timing?.stepStartTime != null
      ? Math.max(0, node.timing.completedTime - node.timing.stepStartTime)
      : null
    steps.push({
      key: `${turn}:${node.step}:${node.seq}`,
      turn,
      step: node.step,
      startedAt: finiteTime(node.timing?.stepStartTime) ?? finiteTime(node.time),
      durationMs,
      usage: usageOf(node.usage) ?? usageOf(request?.usage),
      request: {
        model: node.requestConfig?.model
          ?? request?.prompt?.config.model
          ?? node.provenance?.model
          ?? request?.provenance?.model
          ?? '—',
        provider: node.requestConfig?.provider
          ?? request?.prompt?.config.provider
          ?? node.provenance?.provider
          ?? request?.provenance?.provider
          ?? '—',
        systemCount: request?.prompt?.system ? (request.prompt.system.trim() === '' ? 0 : 1) : 0,
        userCount: 0,
        toolCount: request?.prompt?.tools.length ?? 0,
      },
      response: {
        reasoningPreview: reasoning?.kind === 'reasoning' ? truncate(reasoning.text, 120) : '',
        contentPreview: content?.kind === 'text' ? truncate(content.text, 120) : '',
        toolCallCount: tools.length,
        status: node.interrupted === true ? 'error' : 'ok',
      },
      tools,
    })
  }
  for (const [step, request] of requestsByStep) {
    if (seen.has(step)) continue
    steps.push({
      key: `${turn}:${step}:req:${request.startSeq}`,
      turn,
      step,
      startedAt: finiteTime(request.startedAt),
      durationMs: request.completedAt === null
        ? null
        : Math.max(0, request.completedAt - request.startedAt),
      usage: usageOf(request.usage),
      request: {
        model: request.prompt?.config.model ?? request.provenance?.model ?? '—',
        provider: request.prompt?.config.provider ?? request.provenance?.provider ?? '—',
        systemCount: request.prompt?.system ? (request.prompt.system.trim() === '' ? 0 : 1) : 0,
        userCount: 0,
        toolCount: request.prompt?.tools.length ?? 0,
      },
      response: {
        reasoningPreview: '',
        contentPreview: '',
        toolCallCount: 0,
        status: request.status === 'error'
          ? 'error'
          : request.status === 'running' ? 'running' : 'ok',
      },
      tools: [],
    })
  }
  return steps.sort((a, b) => a.step - b.step)
}

/**
 * Collect durable workflow-run Chat nodes for the orchestration strip.
 * @param chat - session chat snapshot.
 * @returns orchestration runs in chat order.
 */
export function deriveTraceGraphOrchestration(
  chat: ConversationSnapshot['chat'],
): readonly TraceGraphOrchestrationRun[] {
  const runs: TraceGraphOrchestrationRun[] = []
  for (const key of chat.order) {
    const node = chat.nodes.get(key)
    if (node === undefined || node.kind !== 'workflow-run' || node.visibility === 'hidden') continue
    const data = node.data as WorkflowRunChatData
    runs.push({
      key,
      name: data.name,
      status: data.status,
      phases: data.phases,
    })
  }
  return runs
}

/** Total billed tokens for the stats strip. */
export function traceGraphTurnTotalTokens(usage: TraceGraphTurnUsage): number {
  return usage.input + usage.cacheRead + usage.output + usage.reasoning
}

/**
 * Format a millisecond duration for the stats strip.
 * @param ms - duration in milliseconds.
 * @returns compact display string.
 */
export function formatTraceGraphDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s'
  if (ms < 60_000) {
    const seconds = Math.round(ms / 100) / 10
    return `${seconds % 1 === 0 ? String(seconds.toFixed(0)) : String(seconds)}s`
  }
  const totalSec = Math.round(ms / 1000)
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  if (minutes < 60) return `${minutes}m${seconds}s`
  const hours = Math.floor(minutes / 60)
  const remMin = minutes % 60
  return `${hours}h${remMin}m`
}

/** Compact "12.4K" / "1.2M" token count. */
export function formatTraceGraphTokens(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0'
  if (count < 1_000) return String(Math.round(count))
  if (count < 10_000) return `${(Math.round(count / 100) / 10).toFixed(1)}K`
  if (count < 1_000_000) return `${(Math.round(count / 1_000))}K`
  if (count < 10_000_000) return `${(Math.round(count / 100_000) / 10).toFixed(1)}M`
  return `${(Math.round(count / 1_000_000))}M`
}
