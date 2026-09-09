/**
 * Fold a Trajectory snapshot into turn summaries and REQUESTâRESPONSEâTOOL
 * pipeline rows for the è½¨è¿¹å¾view.
 */
import type {
  AssistantMessageNode,
  ConversationLocation,
  ConversationNode,
  RequestView,
  ToolResultNode,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatSnapshot, LegacyConversationSlice } from '@deepseek-ai/dsh-client-ui-chat/client'
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

/** Risk severity for a tool invocation. */
export type TraceGraphToolRisk = 'safe' | 'caution' | 'dangerous'

/** TOOL card facts. */
export interface TraceGraphToolCard {
  readonly callId: string
  readonly name: string
  readonly argsPreview: string
  readonly resultPreview: string
  readonly isError: boolean
  readonly durationMs: number | null
  readonly risk: TraceGraphToolRisk
  /** Command-line / primary payload text when the tool accepts one. */
  readonly command: string | undefined
  /** Absolute or user-supplied paths the call references, when extractable. */
  readonly targetPaths: readonly string[]
  /** Short labels that triggered the risk classification. */
  readonly riskReasons: readonly string[]
}

/** One model-call row: request âresponse âtools. */
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

/** Orchestration run excerpt for the è½¨è¿¹å¾header. */
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
  return `${compact.slice(0, Math.max(0, max - 1))}â¦`
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
    const argsRaw = block.argsRaw
    const classification = classifyToolRisk(block.name, argsRaw)
    cards.push({
      callId: block.callId,
      name: block.name,
      argsPreview: truncate(argsRaw),
      resultPreview: result === undefined
        ? ''
        : truncate(result.content.map(part =>
          part.type === 'text' ? part.text : '').join('')),
      isError: result?.isError === true,
      durationMs: result !== undefined && result.callTime !== null
        ? Math.max(0, result.time - result.callTime)
        : null,
      risk: classification.risk,
      command: classification.command,
      targetPaths: classification.targetPaths,
      riskReasons: classification.reasons,
    })
  }
  return cards
}

/** Patterns that, when matched against a tool name or argument text, raise
 * the risk level for the call. Keys are risk level, values are RegExp sets
 * compiled from string literals so the bundler can inline them. */
const TOOL_RISK_PATTERNS: Record<TraceGraphToolRisk, readonly RegExp[]> = {
  // Destructive: file deletion, disk formatting, version-control writes,
  // elevated privilege escalation, environment mutation. These warrant an
  // explicit user confirmation prompt in the UI.
  dangerous: [
    /\brm\s+-rf?\b/i,
    /\brmdir\b/i,
    /\brd\s+\/s\b/i,
    /\bdel\s+\/[sq]\b/i,
    /\berase\b/i,
    /\bmkfs(?:\.[a-z0-9]+)?\b/i,
    /\bformat\s+[a-z]:/i,
    /\bshred\b/i,
    /\bdd\s+if=/i,
    /\bkill\s+-9\b/i,
    /\bpkill\s+-9\b/i,
    /\bsudo\b/i,
    /\bgit\s+push\s+(?:--force|-f)\b/i,
    /\bgit\s+reset\s+--hard\b/i,
    /\bgit\s+clean\s+-fd\b/i,
    /\bchmod\s+(-R\s+)?0?[67][67][67]\b/i,
    /\bchown\s+-R\b/i,
    /\bmove-item\s+-force\b/i,
    /\bremove-item\s+-recurse\b/i,
    /\bdel\s+/i,
  ],
  // Read-only but mass-mutating or externally observable. Worth flagging so the
  // operator can spot a runaway script at a glance.
  caution: [
    /\bcurl\b/i,
    /\bwget\b/i,
    /\bnpm\s+(?:install|i|add|publish|uninstall|rm)\b/i,
    /\bpnpm\s+(?:install|i|add|publish|remove|rm)\b/i,
    /\byarn\s+(?:install|add|remove)\b/i,
    /\bpip\s+(?:install|uninstall)\b/i,
    /\bgit\s+(?:commit|push|pull|merge|rebase|checkout)\b/i,
    /\bchmod\b/i,
    /\bchown\b/i,
    /\bcp\s+-r\b/i,
    /\bmv\s+/i,
    /\bset-content\b/i,
    /\bnew-item\b/i,
    /\bstart-process\b/i,
    /\binvoke-webrequest\b/i,
    /\bhttp\.post\b/i,
    /\bhttp\.put\b/i,
    /\bhttp\.delete\b/i,
    /\bwrite\b/i,
    /\bfile\.write\b/i,
    /\bfs\.writefile\b/i,
  ],
  // No risky keyword matched. We default everything else to safe; nothing in
  // the current tool catalogue is auto-elevated.
  safe: [],
}

/** Names that always elevate the call to dangerous regardless of args.
 * Intentionally conservative until tool contracts document their own risk
 * metadata. */
const ALWAYS_DANGEROUS_TOOLS: ReadonlySet<string> = new Set([
  'bash_dangerous',
  'delete_file',
  'force_remove',
  'rm_rf',
])

/** Extract a command-line string from raw tool argument JSON. We tolerate
 * missing fields, arrays, or pre-stringified JSON. The returned string is
 * trimmed and may be empty when the tool does not accept a command. */
function extractCommand(name: string, argsRaw: string): string | undefined {
  if (argsRaw.trim() === '') return undefined
  try {
    const parsed: unknown = JSON.parse(argsRaw)
    if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as Record<string, unknown>
      const candidates = ['command', 'cmd', 'shellCommand', 'script']
      for (const key of candidates) {
        const value = record[key]
        if (typeof value === 'string' && value.trim() !== '') return value.trim()
      }
    }
  } catch {
    // Tool args are not always valid JSON; fall back to treating the raw
    // payload as command text âcovers the common `tool_call(command="â)`
    // shape we see from bash-style tools.
  }
  if (/bash|shell|cmd|exec/i.test(name)) return argsRaw.trim()
  return undefined
}

/** Pull a list of file paths out of a tool arg payload. We look in the
 * conventional `path`/`paths`/`files`/`targets` keys first, then sweep the
 * whole arg text for absolute or home-relative path-looking strings so the
 * UI can show what is at stake even when the tool contract is loose. */
function extractTargetPaths(argsRaw: string): string[] {
  const out = new Set<string>()
  try {
    const parsed: unknown = JSON.parse(argsRaw)
    if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as Record<string, unknown>
      const keys = ['path', 'paths', 'file', 'files', 'target', 'targets']
      for (const key of keys) {
        const value = record[key]
        if (typeof value === 'string' && looksLikePath(value)) out.add(value)
        if (Array.isArray(value)) {
          for (const entry of value) {
            if (typeof entry === 'string' && looksLikePath(entry)) out.add(entry)
          }
        }
      }
    }
  } catch {
    // ignore âfall through to text sweep below
  }
  const textMatches = argsRaw.match(/(?:[a-zA-Z]:\\[^\s"'`]+|\/(?:home|root|usr|tmp|var|etc|opt|Users|Volumes|mnt)\/[^\s"'`]+)/g)
  if (textMatches !== null) {
    for (const match of textMatches) out.add(match)
  }
  return [...out]
}

function looksLikePath(value: string): boolean {
  if (value.length === 0) return false
  if (value.includes('\\') || value.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(value)) return true
  if (value.startsWith('~')) return true
  return false
}

/**
 * Classify the risk a tool invocation carries. The classifier is best-effort:
 * it inspects the tool name and the raw argument payload for destructive
 * keywords and surface the operator-relevant excerpts so the UI can show
 * *why* a call is flagged.
 */
export function classifyToolRisk(
  name: string,
  argsRaw: string,
): { risk: TraceGraphToolRisk; command: string | undefined; targetPaths: readonly string[]; reasons: readonly string[] } {
  const reasons = new Set<string>()
  const command = extractCommand(name, argsRaw)
  const haystack = `${name}\n${argsRaw}\n${command ?? ''}`
  const targetPaths = extractTargetPaths(argsRaw)

  let risk: TraceGraphToolRisk = 'safe'
  if (ALWAYS_DANGEROUS_TOOLS.has(name)) {
    risk = 'dangerous'
    reasons.add(name)
  }
  for (const pattern of TOOL_RISK_PATTERNS.dangerous) {
    const match = pattern.exec(haystack)
    if (match !== null) {
      risk = 'dangerous'
      reasons.add(match[0].trim())
    }
  }
  if (risk === 'safe') {
    for (const pattern of TOOL_RISK_PATTERNS.caution) {
      const match = pattern.exec(haystack)
      if (match !== null) {
        risk = 'caution'
        reasons.add(match[0].trim())
        break
      }
    }
  }

  return { risk, command, targetPaths, reasons: [...reasons] }
}

function turnStatus(
  turn: number,
  turnEnds: LegacyConversationSlice['turnEnds'],
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
  turnTimings: LegacyConversationSlice['turnTimings'],
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
 * @param turnEnds - completed turn âend seq map (presence = closed).
 * @param running - whether the session still has an active turn.
 * @returns ordered turn summaries.
 */
export function deriveTraceGraphTurns(
  trajectory: TrajectorySnapshot,
  turnTimings: LegacyConversationSlice['turnTimings'],
  turnEnds: LegacyConversationSlice['turnEnds'],
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
          ?? '-',
        provider: node.requestConfig?.provider
          ?? request?.prompt?.config.provider
          ?? node.provenance?.provider
          ?? request?.provenance?.provider
          ?? '-',
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
        model: request.prompt?.config.model ?? request.provenance?.model ?? '-',
        provider: request.prompt?.config.provider ?? request.provenance?.provider ?? '-',
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
  chat: ChatSnapshot,
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
