/**
 * Host Typert Remote for the BAF 工作流 Tab.
 * @module @deepseek-ai/dsh-client-ui-baf-workflow
 */

import { exec } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { Context } from '@deepseek-ai/cordis'
import {
  bafQualityCliPath,
  classifyStageToolMissing,
  stageSpawnCommand,
  testFlowCommandFor,
  testFlowStageCommand,
  TEST_FLOW_CHAIN_ORDER,
  TEST_FLOW_STAGE_TIMEOUT_MS as BAF_TEST_FLOW_STAGE_TIMEOUT_MS,
  STAGE_TOOL_TOKENS,
} from '@deepseek-ai/dsh-baf-quality'
import {
  BafError,
  isBafError,
  type GuardPolicy,
  type ProjectionEvent,
  type StackAdapter,
} from '@deepseek-ai/dsh-baf-core'
import {
  ProjectionStore,
  buildWorkflowDashboard,
  buildWorkflowTabView,
  type BuildWorkflowTabViewOptions,
  type UsagePoint,
  beginIntake,
  bindSessionChange,
  buildTierRouteStatus,
  deriveSessionChangeFromEvents,
  lastRouteAuditByChange,
  lastRouteAuditByPhase,
  type RouteAuditEntry,
  sessionChangeFor,
  homeSessionFor,
  clearParkedRequirementFor,
  confirmIntake,
  continueParkedRequirement,
  DISPATCH_SENT_MARKER,
  advanceGateIdForNode,
  artifactPathFor,
  dispatchGateRevisionFromTab,
  driveAbandon,
  driveArchiveDecision,
  driveClarify,
  driveClassify,
  driveDesign,
  driveGateResolve,
  driveGo,
  driveImplement,
  drivePlan,
  driveVerify,
  pipelineFor,
  rejectIntake,
  resolveActiveChange,
  makeGateAsk,
  makeGoDispatcher,
  // 【变更】2026-10-07 (九点批 问题 2/4/9): the gate-overview projection and
  // the pure routing core routePreview runs (see the two @Remote methods).
  projectGateOverview,
  taskTierFor,
  tierRouteSelection,
  tierRouteSelectorFor,
  detectArtifactDrift,
  driftArtifactPath,
  driftWorkLines,
  isDriftStage,
  // 【变更】2026-10-27 (批次三十): the per-change PAUSE flag (the 暂停/继续
  // button on the workflow graph).
  setChangePaused,
  // 【变更】2026-10-28 (批次三十三 · 用户问题 2): the pause brake — a paused
  // change advances through NO surface, the button hidden or not.
  isChangePaused,
  // 【变更】2026-10-28 (批次三十五 · 用户问题 2): the per-gate ADVANCE-DECLINE
  // marker — the conversation tab's 暂不推进, honored until 推进 re-raises it.
  markAdvanceDeclinedForNode,
  clearAdvanceDeclined,
  // 【变更】2026-10-28 (批次三十三): whether the pause CUT a running model
  // turn, and the 「继续」 instruction that resumes it.
  wasChangeInterrupted,
  resumeMessage,
  type DispatchNode,
  // 【变更】2026-10-07 (九点批 问题 5): the Auto pseudo entry ids, for the
  // route-scan's session-model auto flag (see readSessionRouteScan).
  AUTO_PROVIDER,
  AUTO_MODEL,
  resolveIsolateService,
  resolveScaffoldService,
  type DispatchAgent,
  type DriveAdapters,
  type ScaffoldAdapter,
  // 【变更】2026-10-29 (批次三十七 · 用户问题 4): the intake confidence
  // evaluator registry — the model hook the classifier asks for a real
  // percentage.
  setIntakeConfidenceEvaluator,
} from '@deepseek-ai/dsh-baf-workflow'
import { readRouteTierConfigSync } from '@deepseek-ai/dsh-baf-workflow/route-config-io'
import { isTierRoutingActive } from '@deepseek-ai/dsh-baf-core'
import type {
  WorkflowDashboardView,
  WorkflowNode,
  WorkflowTabResume,
  WorkflowTabRouteStatus,
  WorkflowTabView,
} from '@deepseek-ai/dsh-baf-core'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, RequestMessage, UserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-llm'
// 【变更】2026-10-29 (批次三十七 · 用户问题 4): the model evaluation behind the
// intake's real confidence percentage.
import { evaluateIntakeConfidence } from './intake-evaluator.ts'
import type {
  BafWorkflowChainRunRequest,
  BafWorkflowChainRunResult,
  BafWorkflowChainStageOutcome,
  BafWorkflowChangeDetailRequest,
  BafWorkflowChangeDetailResult,
  BafWorkflowChangeHistoryEntry,
  BafWorkflowChangeOverviewRequest,
  BafWorkflowChangeOverviewResult,
  BafWorkflowChangeRequest,
  BafWorkflowChangeRow,
  BafWorkflowDraftFormatRequest,
  BafWorkflowDraftFormatResult,
  BafWorkflowFileReadRequest,
  BafWorkflowFileReadResult,
  BafWorkflowGateOverview,
  BafWorkflowGateResolveRequest,
  BafWorkflowGateReviseRequest,
  BafWorkflowResumeRequest,
  BafWorkflowRoutePreview,
  BafWorkflowRoutePreviewRequest,
  BafWorkflowSessionRequest,
  BafWorkflowStageRunRequest,
  BafWorkflowStageRunResult,
  BafWorkflowStartIntakeRequest,
  BafWorkflowSyncRequest,
  BafWorkflowSyncResult,
  // 【变更】2026-10-27 (批次三十): the workflow PAUSE control.
  BafWorkflowPauseRequest,
  BafWorkflowPauseResult,
  BafWorkflowTestFlowStageToggle,
  BafWorkflowTestFlowStatus,
  BafWorkflowTransitionRequest,
} from './types.ts'

export type { WorkflowTabView }

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host-facing BAF workflow Tab Remote. */
    bafWorkflowView: BafWorkflowTabRemote
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'baf-workflow/session-not-found': { readonly sessionId: string }
    'baf-workflow/no-cwd': { readonly sessionId: string }
    'baf-workflow/domain': { readonly code: string; readonly message: string }
    'baf-workflow/transition': { readonly code: string; readonly message: string }
  }
}

/** Request carrying the session whose cwd owns the projection. */
export type {
  BafWorkflowChainRunRequest,
  BafWorkflowChainRunResult,
  BafWorkflowChainStageOutcome,
  BafWorkflowChangeRequest,
  BafWorkflowChangeRow,
  BafWorkflowFileReadRequest,
  BafWorkflowFileReadResult,
  BafWorkflowGateConfirmRow,
  BafWorkflowGateOptionRow,
  BafWorkflowGateOverview,
  BafWorkflowGateResolveRequest,
  BafWorkflowGateReviseRequest,
  BafWorkflowGateStageRow,
  BafWorkflowProjectionAppended,
  BafWorkflowResumeRequest,
  BafWorkflowRoutePreview,
  BafWorkflowRoutePreviewRequest,
  BafWorkflowSessionRequest,
  BafWorkflowStageRunRequest,
  BafWorkflowStageRunResult,
  BafWorkflowStartIntakeRequest,
  BafWorkflowTestFlowCoverage,
  BafWorkflowTestFlowStageToggle,
  BafWorkflowTestFlowStatic,
  BafWorkflowTestFlowStatus,
  BafWorkflowTransitionRequest,
} from './types.ts'

/** A cached per-cwd projection store plus its broadcast wiring. */
export interface ProjectionStorePool {
  /** The persistent store for one workspace (same instance per cwd). */
  storeFor(cwd: string): ProjectionStore
  /** Drop every cached store (ctx dispose — the bus goes with them). */
  dispose(): void
}

/**
 * 【变更】2026-10-24 (批次十九 1.3): flatten one projection event into the
 * history row the change-detail modal renders.
 *
 * The projection event union carries type-specific payloads; the modal only
 * needs the WHEN / WHAT / WHICH-STAGE triple, so the union is reduced here
 * (the host owns the event shape) and the client localizes the `type`.
 * @param event - one projection event.
 * @returns the flattened history row.
 */
function flattenChangeEvent(event: ProjectionEvent): BafWorkflowChangeHistoryEntry {
  const base = { at: event.at, type: event.type }
  switch (event.type) {
    case 'intake-mode-set':
      return { ...base, detail: `${event.from} → ${event.to}` }
    case 'task-tier-frozen':
      return { ...base, detail: event.matched === undefined ? event.tier : `${event.tier} · ${event.matched}` }
    case 'intake-settled':
      return {
        ...base,
        ...(event.kind === undefined ? {} : { detail: event.kind }),
        ...(event.affectedScope === undefined ? {} : { reason: event.affectedScope }),
      }
    case 'stage-entered':
      return { ...base, node: event.node, ...(event.cause === undefined ? {} : { reason: event.cause }) }
    case 'stage-completed':
      return { ...base, node: event.node, ...(event.artifacts.length === 0 ? {} : { detail: event.artifacts.join('、') }) }
    case 'stage-failed':
      return { ...base, node: event.node, reason: event.reason }
    case 'drift-detected':
      return { ...base, node: event.node, reason: event.cause }
    case 'mode-upgraded':
      return { ...base, detail: `${event.from} → ${event.to}` }
    case 'awaiting-confirm':
      return { ...base, gate: event.gate }
    case 'transition-rejected':
      // 【变更】2026-10-24 (批次十九 1.3): the source node is NULLABLE on this
      // event, and the history row's optional props are exact (the key must be
      // absent, not `undefined`) — the same conditional-spread shape the rest
      // of this function uses.
      return { ...base, ...(event.from === null ? {} : { node: event.from }), reason: event.reason }
    default:
      return base
  }
}

/**
 * §22.19 R5 — persistent per-cwd projection stores wired into the forwarded
 * host event `baf-workflow/projection-appended`.
 *
 * The Remote used to construct a throwaway `ProjectionStore` per RPC; that
 * shape could never push: the §13 R8 append bus is per-instance, so a store
 * built for one `getTabView` call would only ever hear its own (nonexistent)
 * writes. Holding ONE store per workspace for the service's lifetime lets a
 * single `subscribe` hear **every** append in the process — the projection
 * bus is workspace-global since §22.19, so the drives' own short-lived
 * stores (`beginIntake`, `driveGo`, the orchestrator) poke this subscriber
 * too — and each poke becomes `ctx.emit('baf-workflow/projection-appended',
 * { cwd, changeId })`, which api-remotes forwards to the web client. The
 * Tab then refreshes on the trailing edge instead of waiting for a
 * focus/mount pull (session 7.jsonl R5: the Tab sat on a dead「已放弃」
 * view while the chat minted a new change).
 * @param ctx - host context (emit surface for the forwarded event).
 * @returns the store pool; keep for the service lifetime.
 */
export function createProjectionStorePool(ctx: Context): ProjectionStorePool {
  const stores = new Map<string, ProjectionStore>()
  const unsubs = new Set<() => void>()
  return {
    storeFor(cwd: string): ProjectionStore {
      // Windows paths compare case-blind; resolve normalizes slashes so the
      // same workspace spelled by different session headers hits one store.
      const key = process.platform === 'win32' ? resolve(cwd).toLowerCase() : resolve(cwd)
      let store = stores.get(key)
      if (store === undefined) {
        store = new ProjectionStore({ workspaceRoot: cwd })
        // The §22.19 bus is process-global per workspace, so dropping the
        // map reference alone would LEAK the listener — keep the disposer
        // and run it in dispose().
        const unsubscribe = store.subscribe((changeId) => {
          ctx.emit('baf-workflow/projection-appended', { cwd, changeId })
        })
        unsubs.add(unsubscribe)
        stores.set(key, store)
      }
      return store
    },
    dispose(): void {
      for (const unsubscribe of unsubs) unsubscribe()
      unsubs.clear()
      stores.clear()
    },
  }
}

/**
 * 【变更】2026-09-23 (user issue #3): fold one session's per-step provider
 * usage into attribution samples. Reads the cold log through
 * `sessionQuery.observeSession` (the same read the API history path uses —
 * no agent wake, no repair); `assistant/message` events carry the step's
 * `usage` and every persisted event carries its epoch-ms `time`. The
 * sessionQuery service is optional at this row's composition: absent or
 * failing reads return an empty list and the Tab renders without tokens.
 * @param ctx - host context.
 * @param sessionId - the session whose log to fold.
 * @returns one UsagePoint per usage-carrying assistant message.
 */
async function readSessionUsagePoints(ctx: Context, sessionId: SessionId): Promise<readonly UsagePoint[]> {
  // One assistant step's provider usage, as the persisted event carries it.
  interface UsageEvent {
    readonly type: string
    readonly time?: number
    readonly data?: {
      readonly usage?: {
        readonly inputTokens?: number
        readonly outputTokens?: number
        readonly cacheReadTokens?: number
        readonly cacheWriteTokens?: number
      }
    }
  }

  // One cold observation of the session log (the API history read shape).
  interface Observation {
    readonly events: Iterable<UsageEvent>
    [Symbol.dispose]?: () => void
  }

  type SessionQuery = { observeSession: (id: SessionId, options?: { projectionMode?: string }) => Promise<Observation> }
  const query = (ctx as { sessionQuery?: SessionQuery }).sessionQuery
  if (query === undefined) return []
  const observation = await query.observeSession(sessionId, { projectionMode: 'none' })
  try {
    const points: UsagePoint[] = []
    for (const event of observation.events) {
      if (event.type !== 'assistant/message') continue
      const usage = event.data?.usage
      if (usage === undefined) continue
      const input = (usage.inputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
      const output = usage.outputTokens ?? 0
      if (input === 0 && output === 0) continue
      points.push({ time: event.time ?? 0, inputTokens: input, outputTokens: output })
    }
    return points
  } finally {
    observation[Symbol.dispose]?.()
  }
}

/**
 * 多模型路由 M3 批次C — read one session's `baf/route-resolved` audits from
 * the cold log (the same `sessionQuery.observeSession` read
 * {@link readSessionUsagePoints} uses — no agent wake, no repair). The
 * Tab's「当前路由」row folds these into its last-per-phase view; exported for
 * the host spec.
 * @param ctx - host context.
 * @param sessionId - the session whose log to scan.
 * @returns the audit payloads in log order (empty when sessionQuery is absent).
 */
export async function readSessionRouteAudits(ctx: Context, sessionId: SessionId): Promise<readonly RouteAuditEntry[]> {
  return (await readSessionRouteScan(ctx, sessionId)).audits
}

/**
 * 【变更】2026-10-07 (九点批 问题 5): one cold-log pass collecting BOTH the
 * `baf/route-resolved` audits AND the session's CURRENT raw model — the last
 * `request/header` epoch's call config, flagged `auto` when it is the
 * `baf-route/auto` pseudo entry. The「当前路由」empty state needs the model to
 * explain itself (Auto engaged vs. pinned), so the scan rides the same
 * observation the audit fold already pays for.
 * @param ctx - host context.
 * @param sessionId - the session whose log to scan.
 * @returns audits in log order + the session's current model (absent when the
 * log carries no header epoch or sessionQuery is unavailable).
 */
export async function readSessionRouteScan(
  ctx: Context,
  sessionId: SessionId,
): Promise<{
  audits: readonly RouteAuditEntry[]
  sessionModel?: { provider: string; model: string; auto: boolean }
}> {
  interface ScanEvent { readonly type: string; readonly data?: unknown }
  interface Observation {
    readonly events: Iterable<ScanEvent>
    [Symbol.dispose]?: () => void
  }
  type SessionQuery = { observeSession: (id: SessionId, options?: { projectionMode?: string }) => Promise<Observation> }
  const query = (ctx as { sessionQuery?: SessionQuery }).sessionQuery
  if (query === undefined) return { audits: [] }
  const observation = await query.observeSession(sessionId, { projectionMode: 'none' })
  try {
    const entries: RouteAuditEntry[] = []
    let sessionModel: { provider: string; model: string; auto: boolean } | undefined
    for (const event of observation.events) {
      if (event.type === 'baf/route-resolved') {
        entries.push(event.data as RouteAuditEntry)
        continue
      }
      if (event.type === 'request/header') {
        // The LAST header epoch is the session's current raw selection.
        const config = (event.data as { header?: { config?: { provider?: unknown; model?: unknown } } } | undefined)
          ?.header?.config
        if (typeof config?.provider === 'string' && typeof config?.model === 'string') {
          sessionModel = {
            provider: config.provider,
            model: config.model,
            auto: config.provider === AUTO_PROVIDER && config.model === AUTO_MODEL,
          }
        }
      }
    }
    return sessionModel === undefined ? { audits: entries } : { audits: entries, sessionModel }
  } finally {
    observation[Symbol.dispose]?.()
  }
}

/** promisified shell exec (批次十二 2.1 — the per-stage run executor). */
const execShell = promisify(exec)

/** Wall-clock budget for one per-stage manual run (批次十二 2.1). */
export const TEST_FLOW_STAGE_TIMEOUT_MS = BAF_TEST_FLOW_STAGE_TIMEOUT_MS

/** Preview payload cap for readWorkspaceFile (批次十二 2.6). */
export const WORKSPACE_FILE_PREVIEW_CAP = 256 * 1024

/**
 * 【变更】2026-10-25 (批次二十四 3): the「格式化输入」system prompt — the
 * contract the auxiliary call runs under. The prompt is deliberately
 * CONSERVATIVE: the arranger may re-shape the author's words into Markdown,
 * never re-word them, never add a fact the draft does not carry, and never
 * "fix" the author's code. A formatter that invents content is worse than no
 * formatter, because the user cannot see what changed.
 *
 * 【变更】2026-10-25 (批次二十五 2): the prompt is no longer structure-only.
 * Its rule 1 said "只调整结构与断句，不改写、不润色" and rule 5 said to return
 * the draft unchanged when it already read clearly — together they made the
 * model path a punctuation pass, which the user reported as "没有效果". The
 * contract now asks for TWO things: structure the draft into a requirement
 * brief, AND make the author's own words more precise, more specific and less
 * ambiguous. The hard bans stay exactly as they were — the optimizer may not
 * invent a fact, a requirement, a number or a path — so an optimized draft is
 * still the user's own request, only readable.
 */
export const DRAFT_FORMAT_SYSTEM = [
  '你是一个「需求输入优化」助手：把用户正在输入的草稿改写成一份结构清晰、逻辑完整、能被下游大模型一眼看懂的需求简报。',
  '',
  '你要同时做两件事：',
  '1. 结构化：切分意图、归并同类项、区分目标 / 背景 / 需求明细 / 约束 / 交付与验收。',
  '2. 内容优化：在不改变原意的前提下把话说得更准确、更具体、更无歧义——把作者写了但表达含糊的部分说清楚（例如「要快一点」要落到它约束的是哪个环节）。',
  '',
  '铁律（不可违背）：',
  '1. 绝不添加草稿中不存在的事实、需求、结论、命令、路径、数值或示例。',
  '2. 绝不改变作者的意图或扩大范围。确实无法从上下文判断的地方不要替作者做决定，用「（待确认：…）」标出，全篇最多 3 处。',
  '3. 代码、命令、报错、路径、标识符、专有名词一律原样保留，不要「修正」或「翻译」它们。',
  '4. 保留作者使用的语言（中文或英文）。',
  '5. 作者已经写清楚的内容原样保留，不要为了改而改，也不要用空话填充篇幅。',
  '',
  '结构规则：',
  '- 开头用一级标题写清「要做什么」——用作者自己的话凝练，不添加新信息。',
  '- 用 ## 小标题切分：目标 / 背景与现状 / 需求明细 / 约束与边界 / 交付物与验收。作者没写的章节直接省略，不要凑数。',
  '- 需求明细用有序列表，一条一个需求，动词开头。',
  '- 并列要点用无序列表；有先后步骤用有序列表。',
  '- 代码、命令、堆栈信息放进 ``` 代码块并标注语言。',
  '- 引用原文、日志片段用 > 引用。',
  '- 同一主题的多行合并成一段，段落之间空一行。',
  '',
  '只输出优化后的 Markdown 正文，不要写任何前言、说明、对比或结语。',
].join('\n')

/**
 * 【变更】2026-10-25 (批次二十四 3): the output cap for one formatting call.
 * A draft longer than this is not a draft; it is a document, and the arranger
 * is not the tool for it.
 */
export const DRAFT_FORMAT_MAX_TOKENS = 4096

/**
 * Read one unknown value as a plain record, or undefined when it is not an
 * object. The structural reads below cross plugin boundaries (the agent
 * registry's public face is deliberately minimal), so they read defensively
 * instead of casting a half-known shape.
 * @param value - the value to read.
 * @returns the record view, or undefined.
 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

/**
 * 【变更】2026-10-25 (批次二十五 2): one concrete provider/model pair — the
 * route an auxiliary call runs on.
 */
export interface DraftRoute {
  /** Registered provider route (must own an adapter). */
  readonly provider: string
  /** Model id the provider's adapter interprets. */
  readonly model: string
}

/**
 * 【变更】2026-10-25 (批次二十五 2): the session's OWN model selection — the
 * route the user picked in the model selector.
 *
 * The authority is the `modelSelection` projection: its `next` view is the
 * pending selection when one was recorded and the last used selection
 * otherwise, which is exactly what the agent loop reads before a step. The
 * projection is not composed in every deployment, so the read degrades to
 * "no recorded selection" instead of throwing.
 * @param ctx - host context.
 * @param session - the session whose selection is read.
 * @returns the recorded route, or undefined when none was recorded.
 */
function recordedSelectionFor(ctx: Context, session: Session): DraftRoute | undefined {
  try {
    const view = ctx.sessionProjections.snapshot(session).values.modelSelection
    const selection = view?.next ?? view?.lastUsed
    if (selection === undefined || selection === null) return undefined
    return { provider: selection.provider, model: selection.model }
  } catch {
    return undefined
  }
}

/**
 * 【变更】2026-10-25 (批次二十五 2): map one recorded route through the
 * deployment's per-step route resolver.
 *
 * A BAF session sitting on the「自动」pseudo entry records `{baf-route, auto}`,
 * which is NOT a provider route: the agent loop maps it to the tier route the
 * step runs on through the `stepRouteResolver` service. The formatter must use
 * the SAME mapping, or it would call a provider that does not exist. The
 * lookup is structural and best-effort — a deployment without a resolver keeps
 * the recorded route unchanged.
 * @param ctx - host context.
 * @param session - the session the step belongs to.
 * @param route - the recorded route.
 * @returns the route the step would run on.
 */
function stepRouteFor(ctx: Context, session: Session, route: DraftRoute): DraftRoute {
  const resolver = ctx.get('stepRouteResolver') as {
    resolveStepRoute?: (session: Session, route: DraftRoute) => DraftRoute | undefined
  } | undefined
  if (resolver === undefined || typeof resolver.resolveStepRoute !== 'function') return route
  try {
    return resolver.resolveStepRoute(session, route) ?? route
  } catch {
    return route
  }
}

/**
 * 【变更】2026-10-25 (批次二十五 2): whether one route is the BAF auto pseudo
 * entry — a routing placeholder, never a provider route.
 * @param route - the route to judge.
 * @returns whether the route is the auto pseudo entry.
 */
function isAutoRoute(route: DraftRoute): boolean {
  return route.provider === AUTO_PROVIDER && route.model === AUTO_MODEL
}

/**
 * 【变更】2026-10-25 (批次二十五 2): the agent's live route options — the
 * route a fresh session starts on, before any selection is recorded.
 *
 * The options' route fields are live accessors over the deployment's default
 * model, so the read is defensive: a missing agent, a missing provider or a
 * throwing accessor all mean "no route here".
 * @param ctx - host context.
 * @param sessionId - the session whose agent is read.
 * @returns the live route, or undefined when there is none.
 */
function agentRouteFor(ctx: Context, sessionId: SessionId): DraftRoute | undefined {
  try {
    const agent = ctx.agents.get(sessionId)
    const options = asRecord(asRecord(agent)?.options)
    const provider = typeof options?.provider === 'string' ? options.provider : undefined
    const model = typeof options?.model === 'string' ? options.model : undefined
    if (provider === undefined || model === undefined) return undefined
    return { provider, model }
  } catch {
    return undefined
  }
}

/**
 * 【变更】2026-10-26 (批次二十九 1): the deployment's default model — the
 * route a FRESH session starts on.
 *
 * A brand-new session (the very case a user arranges a draft in — nothing has
 * been sent yet) owns no recorded selection, no agent and no request header,
 * so every earlier candidate is empty and the formatter answered
 * 「模型未响应」. The deployment default is the route such a session would run
 * on, so it is the last resort.
 *
 * The read is structural and best-effort, exactly like the other lookups: a
 * deployment without the service (or a throwing accessor) simply has no
 * default here.
 * @param ctx - host context.
 * @returns the default route, or undefined when the deployment has none.
 */
function defaultRouteFor(ctx: Context): DraftRoute | undefined {
  try {
    const defaults = ctx.get('agentDefaultModel') as {
      currentSelection?: () => { provider?: unknown; model?: unknown }
    } | undefined
    if (defaults === undefined || typeof defaults.currentSelection !== 'function') return undefined
    const selection = defaults.currentSelection()
    const provider = typeof selection?.provider === 'string' ? selection.provider : undefined
    const model = typeof selection?.model === 'string' ? selection.model : undefined
    if (provider === undefined || model === undefined) return undefined
    return { provider, model }
  } catch {
    return undefined
  }
}

/**
 * 【变更】2026-10-25 (批次二十五 2): the route the session's last request
 * actually ran on — the header fold's current epoch.
 * @param session - the live session, or undefined when none is live.
 * @returns the logged route, or undefined when no request ran yet.
 */
function headerRouteFor(session: Session | undefined): DraftRoute | undefined {
  try {
    const config = session?.requestHeader()?.config
    if (config === undefined) return undefined
    return { provider: config.provider, model: config.model }
  } catch {
    return undefined
  }
}

/**
 * 【变更】2026-10-28 (批次三十四 · 用户问题 5): the 测试流's step→command map
 * and its chain order live in `dsh-baf-quality` now — the workflow's verify
 * stage runs the same chain, so the two surfaces cannot disagree about what a
 * step does. The client keeps re-exporting them (its public API).
 */
export {
  classifyStageToolMissing,
  stageSpawnCommand,
  STAGE_TOOL_TOKENS,
  testFlowStageCommand,
  TEST_FLOW_CHAIN_ORDER,
}

/** Keep the last `max` chars of a stage run's combined output (result card). */
function tailOfStage(text: string, max = 1200): string {
  const trimmed = text.trim()
  return trimmed.length <= max ? trimmed : `… [前略] ${trimmed.slice(trimmed.length - max)}`
}

/**
 * 【变更】2026-10-22 (批次十三 1): the single-stage executor `runTestFlowStage`
 * and the 全部运行 chain sweep share — spawn, wait, classify. Tool-missing is
 * a CLASSIFICATION (the shell can't resolve the wrapper), not an exception;
 * whether it halts a chain is the stage's `haltOnError` switch's call.
 * @param cwd - absolute workspace root.
 * @param stage - the step id (format included).
 * @param arg - the format node's configurable path ('' → `source`).
 * @returns the run outcome plus the tool-missing classification.
 */
async function execTestFlowStage(
  cwd: string,
  stage: BafWorkflowStageRunRequest['stage'],
  arg: string,
): Promise<{ ok: boolean; toolMissing: boolean; command: string; exitCode: number; output: string; durationMs: number }> {
  const command = testFlowCommandFor(stage, arg)
  const started = Date.now()
  try {
    const { stdout, stderr } = await execShell(stageSpawnCommand(command, bafQualityCliPath(), process.execPath), {
      cwd,
      timeout: TEST_FLOW_STAGE_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    })
    return {
      ok: true,
      toolMissing: false,
      command,
      exitCode: 0,
      output: tailOfStage(`${stdout}\n${stderr}`),
      durationMs: Date.now() - started,
    }
  } catch (error) {
    const out = error as { stdout?: unknown; stderr?: unknown; code?: unknown; killed?: unknown; message?: unknown }
    const combined = `${String(out.stdout ?? '')}\n${String(out.stderr ?? '')}`
    // Windows shell "not recognized" (exit 9009 / localized message) or a
    // unix ENOENT means the wrapper is absent — distinct from a failed run.
    const toolMissing = classifyStageToolMissing(out.code, combined, command)
    if (out.killed === true) {
      return {
        ok: false,
        toolMissing: false,
        command,
        exitCode: 124,
        output: `${tailOfStage(combined)}\n[超时 >${TEST_FLOW_STAGE_TIMEOUT_MS / 1000}s，已终止 — 可重试或改在会话内运行]`,
        durationMs: Date.now() - started,
      }
    }
    return {
      ok: false,
      toolMissing,
      command,
      exitCode: typeof out.code === 'number' ? out.code : 1,
      output: tailOfStage(combined) || (typeof out.message === 'string' ? tailOfStage(out.message) : ''),
      durationMs: Date.now() - started,
    }
  }
}

/**
 * 【变更】2026-10-22 (批次十三 4): the workspace's 测试流 stage switches, from
 * `.baf/quality/test-flow.json` (a `{version, stages}` envelope the settings
 * canvas — 工作流 · 测试流 — owns). The envelope MUST be unwrapped before
 * normalizing: reading stage keys off the envelope itself sees none and
 * silently falls back to all-on defaults (the exact bug the settings
 * package's readQualityTestFlowStages fixed). Inlined (~20 lines) rather
 * than imported across packages: the settings package is a preset data
 * carrier, not a dependency this host face may reach into. Context-free
 * (testable against a temp dir).
 * @param cwd - absolute workspace root.
 * @returns stage id → switch pair ({} when the file is absent/unreadable).
 */
export async function readTestFlowStageToggles(cwd: string): Promise<Record<string, BafWorkflowTestFlowStageToggle>> {
  let flowRaw: Record<string, unknown> | undefined
  try {
    const parsed: unknown = JSON.parse(await readFile(join(cwd, '.baf', 'quality', 'test-flow.json'), 'utf8'))
    if (typeof parsed === 'object' && parsed !== null) flowRaw = parsed as Record<string, unknown>
  } catch {
    flowRaw = undefined
  }
  // Bind then narrow: exactOptionalPropertyTypes codebase pattern — the
  // narrowed const can't re-widen through the ternary below.
  const envelopeStages: unknown = flowRaw?.stages
  const stagesSource = typeof envelopeStages === 'object' && envelopeStages !== null
    ? envelopeStages as Record<string, unknown>
    : {}
  const stages: Record<string, BafWorkflowTestFlowStageToggle> = {}
  for (const [id, raw] of Object.entries(stagesSource)) {
    if (typeof raw !== 'object' || raw === null) continue
    const entry = raw as Record<string, unknown>
    stages[id] = { enabled: entry.enabled !== false, haltOnError: entry.haltOnError !== false }
  }
  return stages
}

/**
 * 【变更】2026-10-21 (批次十 测试流图): read what the session Tab's 测试流图
 * paints, from the artifacts the quality pipeline actually leaves on disk —
 * `.baf/reports/ut-coverage.json` (check 链：编译→测试→插桩→报告→覆盖率门禁)
 * and `.baf/reports/static-analysis.json` (lint：cpplint+cppcheck)， plus the
 * workspace quality config for the threshold / gate mode / report path. The
 * SAME defensive-read contract `status-blockers` holds: every field optional,
 * a missing/unreadable file simply stays `undefined` (the tab paints 未运行，
 * never a fabricated verdict). Context-free (testable against a temp dir).
 * @param cwd - absolute workspace root.
 * @returns the 测试流图 status payload.
 */
export async function readTestFlowStatus(cwd: string): Promise<BafWorkflowTestFlowStatus> {
  const readJson = async (path: string): Promise<Record<string, unknown> | undefined> => {
    try {
      const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
      return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
    } catch {
      return undefined
    }
  }
  const asNumber = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined
  const asString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
  const asBool = (value: unknown): boolean | undefined => typeof value === 'boolean' ? value : undefined

  const coverageRaw = await readJson(join(cwd, '.baf', 'reports', 'ut-coverage.json'))
  const staticRaw = await readJson(join(cwd, '.baf', 'reports', 'static-analysis.json'))
  const config = await readJson(join(cwd, '.baf', 'quality', 'ceedling-config.json'))
  // 批次十三 4: the stage switches ride along on the same status read (see
  // readTestFlowStageToggles above for the envelope contract).
  const stages = await readTestFlowStageToggles(cwd)
  const reportHtmlRel = asString(config?.report_html) ?? 'build/coverage/coverage_report.html'
  let reportHtmlExists = false
  try {
    await stat(join(cwd, reportHtmlRel))
    reportHtmlExists = true
  } catch {
    reportHtmlExists = false
  }
  // generated_at snake_key on disk (the pipeline's own writer); surfaced as
  // camelCase on the wire like every other Remote payload. Each field binds
  // to a const FIRST — a re-called helper can't be narrowed through the
  // conditional spread, and exactOptionalPropertyTypes would reject the
  // `number | undefined` widening.
  const line = asNumber(coverageRaw?.line)
  const minimum = asNumber(coverageRaw?.minimum)
  const coveragePassed = asBool(coverageRaw?.passed)
  const coverageAt = asString(coverageRaw?.generated_at)
  const coverage = coverageRaw === undefined ? undefined : {
    ...(line === undefined ? {} : { line }),
    ...(minimum === undefined ? {} : { minimum }),
    ...(coveragePassed === undefined ? {} : { passed: coveragePassed }),
    ...(coverageAt === undefined ? {} : { generatedAt: coverageAt }),
  }
  const staticErrors = asNumber(staticRaw?.errors)
  const staticPassed = asBool(staticRaw?.passed)
  const staticAt = asString(staticRaw?.generated_at)
  const staticAnalysis = staticRaw === undefined ? undefined : {
    ...(staticErrors === undefined ? {} : { errors: staticErrors }),
    ...(staticPassed === undefined ? {} : { passed: staticPassed }),
    ...(staticAt === undefined ? {} : { generatedAt: staticAt }),
  }
  const thresholdLine = asNumber(config?.threshold_line)
  const gateMode = asString(config?.gate_mode)
  // exactOptionalPropertyTypes: narrow to defined-and-non-empty BEFORE the
  // spread — spreading the `{...} | undefined` variable would widen the
  // property past the declared `coverage?: BafWorkflowTestFlowCoverage`.
  const coverageOut = coverage !== undefined && Object.keys(coverage).length > 0 ? coverage : undefined
  const staticOut = staticAnalysis !== undefined && Object.keys(staticAnalysis).length > 0 ? staticAnalysis : undefined
  return {
    status: 'ready',
    ...(coverageOut === undefined ? {} : { coverage: coverageOut }),
    ...(staticOut === undefined ? {} : { staticAnalysis: staticOut }),
    ...(thresholdLine === undefined ? {} : { thresholdLine }),
    ...(gateMode === undefined ? {} : { gateMode }),
    reportHtmlRel,
    reportHtmlExists,
    ...(Object.keys(stages).length === 0 ? {} : { stages }),
  }
}

/**
 * 【变更】2026-10-25 (批次二十五 2): the concrete route one formatting call
 * runs on.
 *
 * 【变更】2026-10-25 (批次二十四 3): the resolver read the agent's live
 * options first and the session's last request header second. That missed the
 * session's ACTUAL selection (the model the user picked in the selector), and
 * it could not answer a session sitting on the BAF「自动」pseudo entry at all.
 * 【变更】2026-10-25 (批次二十五 2) resolves in the order the agent loop
 * itself uses:
 *   1. the RECORDED selection — the `modelSelection` projection's view
 *      (`next`, else `lastUsed`), i.e. the user's own pick;
 *   2. the agent's live route options — the route a fresh session starts on;
 *   3. the session's last request header — the route that actually ran.
 * Each candidate goes through the deployment's per-step route resolver first,
 * so the「自动」pseudo entry maps to the tier route the step would use.
 *
 * The cold log's last header epoch is the last resort: a session whose agent
 * is gone but whose log survives.
 * @param ctx - host context.
 * @param sessionId - the session whose route is resolved.
 * @returns the route, or undefined when the session has none.
 */
export async function resolveDraftRoute(ctx: Context, sessionId: SessionId): Promise<DraftRoute | undefined> {
  const session = ctx.sessions.get(sessionId)
  const candidates: DraftRoute[] = []
  if (session !== undefined) {
    const recorded = recordedSelectionFor(ctx, session)
    if (recorded !== undefined) candidates.push(recorded)
  }
  const live = agentRouteFor(ctx, sessionId)
  if (live !== undefined) candidates.push(live)
  const header = headerRouteFor(session)
  if (header !== undefined) candidates.push(header)
  for (const candidate of candidates) {
    const route = session === undefined ? candidate : stepRouteFor(ctx, session, candidate)
    if (isAutoRoute(route)) continue
    return { provider: route.provider, model: route.model }
  }
  // Last resort: the cold log's own header epoch (a session whose agent is
  // gone but whose log survives).
  const scan = await readSessionRouteScan(ctx, sessionId)
  const scanned = scan.sessionModel
  if (scanned !== undefined && !scanned.auto) {
    return { provider: scanned.provider, model: scanned.model }
  }
  // 【变更】2026-10-26 (批次二十九 1): the deployment's default model — the
  // route a fresh session starts on. A blank session (the case the user hit:
  // nothing sent yet) owns no recorded selection, no agent and no request
  // header, so without this the formatter had no route at all and answered
  // 「模型未响应」. The default goes through the per-step resolver too, so a
  // deployment whose default IS the BAF「自动」pseudo entry resolves to the
  // tier route the step would run on instead of the pseudo pair.
  const fallback = defaultRouteFor(ctx)
  if (fallback !== undefined) {
    const route = session === undefined ? fallback : stepRouteFor(ctx, session, fallback)
    if (!isAutoRoute(route)) return { provider: route.provider, model: route.model }
  }
  return undefined
}

/**
 * 【变更】2026-10-28 (批次三十三 · 用户问题 2): the agent face the 暂停/继续
 * control drives.
 *
 * `cancel` cuts the running turn; `followup` queues the 「继续」 instruction
 * that resumes it; `status` says whether a turn was in flight when the brake
 * took hold. Every member is optional — a session without a live model simply
 * has no channel, and the control reports that instead of guessing.
 */
interface PauseAgentFace {
  /** Cut the running turn. The cause is the platform's user-interrupt cause. */
  cancel?: (cause: { readonly kind: 'user' }, options?: { readonly keepInbox?: boolean }) => void
  /** Queue a user-role message into the next-turn inbox and wake the driver. */
  followup?: (message: UserMessage) => void
  /** Whether this agent has a turn in flight. */
  readonly status?: 'idle' | 'running'
}

/**
 * Host Remote: assembles {@link WorkflowTabView} and applies semi-interactive mutations.
 */
export class BafWorkflowTabRemote extends TypertRemoteService {
  // 【变更】2026-09-23 (demo1 issue #4): `agents` joined the inject list —
  // cordis refuses `ctx.agents` without the declaration ("cannot get property
  // "agents" without inject"), and the swallowed throw made every
  // {@link liveAgentFor} lookup return undefined: the Tab's 推进/transition
  // dispatches silently lost their work-order channel (no model wake — the
  // 虚假推进 report) and the popup ask degraded to an agent-less service that
  // could never render a dialog.
  // 【变更】2026-09-23 (demo1 五问题 4): `sessionQuery` joined for the same
  // reason — the per-stage token attribution reads it via a structural cast,
  // the undeclared access threw, and {@link usagePointsFor} swallowed it into
  // an eternal empty list (node cards showed '—' beside a working totals row).
  // 【变更】2026-10-25 (批次二十五 2): `sessionProjections` joined — the
  // formatter's route is the SESSION's recorded model selection, and the
  // `modelSelection` projection is that selection's authority (the agent's
  // live options only carry the deployment's default model).
  static inject = ['sessions', 'sessionPersistence', 'agents', 'sessionQuery', 'sessionProjections', 'llm']

  /** §22.19 R5 — persistent per-cwd stores whose append bus feeds the push. */
  private readonly pool: ProjectionStorePool

  constructor(ctx: Context) {
    super(ctx, 'bafWorkflowView')
    this.pool = createProjectionStorePool(ctx)
    ctx.effect(() => { return () => { this.pool.dispose() } }, 'bafWorkflowView: projection store pool')
    // 【变更】2026-10-29 (批次三十七 · 用户问题 4): register the model hook the
    // intake classifier asks for a real confidence percentage. It hangs off
    // the process-wide registry so EVERY mint surface (this Tab's
    // 「新建变更」, the model's `baf_gate_ask` bootstrap, the CLI) classifies
    // with the model's own score instead of a fixed tier. The route is the
    // deployment's default model — the evaluation is a workflow decision, not
    // a session's turn.
    setIntakeConfidenceEvaluator(async (input) => {
      const route = defaultRouteFor(this.ctx)
      return evaluateIntakeConfidence(this.ctx, route, input)
    })
  }

  /**
   * Read the Tab view for a session workspace.
   * @param request - session (+ optional change).
   * @returns tab view.
   */
  @Remote('getTabView')
  async getTabView(request: BafWorkflowSessionRequest): Promise<WorkflowTabView> {
    const { cwd, store } = await this.contextFor(request.sessionId)
    // 【变更】2026-09-22 (user report #2): metrics fold is ON for the
    // interactive path. This used to pass includeMetrics:false "so the Tab
    // paints quickly" — the result was that per-stage durations and the
    // change total never rendered anywhere (the strip and node cards read
    // exactly this payload). The fold is one O(events) pass over a single
    // change's log (tens of events), far cheaper than the artifact-status
    // reads every paint already performs.
    return this.viewFor(request.sessionId, store, request.changeId, {
      resume: this.resumeProvider(cwd),
    })
  }

  /**
   * 【变更】2026-09-23 (user issue #3): build a Tab view with the driving
   * session's per-step token usage attached, so the metrics fold can
   * attribute tokens to stages.
   *
   * The usage points come from a per-session cache keyed by the store's
   * `revision` (event count + size from `sessionPersistence.stat`) — the
   * scheduler's periodic refreshes re-fold only when the session log actually
   * grew, and a cold/missing session (stat miss) simply renders without
   * tokens, exactly like before.
   * @param sessionId - the driving session.
   * @param store - the workspace projection store.
   * @param changeId - change to focus.
   * @param options - assembly options forwarded verbatim.
   * @returns the assembled view.
   */
  private async viewFor(
    sessionId: SessionId,
    store: ProjectionStore,
    changeId: string | null | undefined,
    options: BuildWorkflowTabViewOptions = {},
  ): Promise<WorkflowTabView> {
    // 【变更】2026-09-28 (用户问题 7): a session that drove a change sees ITS
    // change's graph — before the workspace-ranked fallback. Two sessions on
    // one workspace each get their own flow (demo-21: 重构ecum vs 增加ECUM
    // 用法Demo), instead of both showing whichever change the ranking picks.
    // The live binding is process-local; when it is missing (restart, old
    // session), the session's own cold log names the change it drove — derive
    // once, then rebind so later reads skip the scan.
    const bound = changeId
      ?? sessionChangeFor(store.workspaceRoot(), sessionId)
      ?? await this.deriveSessionChange(sessionId, store.workspaceRoot())
    const view = await buildWorkflowTabView(store, bound ?? undefined, {
      ...options,
      usagePoints: await this.usagePointsFor(sessionId),
    })
    // 多模型路由 M3 批次C — the「当前路由」row rides the same payload the Tab
    // already polls; `off` (config absent/disabled) costs no log scan at all.
    return { ...view, routeStatus: await this.routeStatusFor(sessionId) }
  }

  /** Cached `(sessionId → last-per-phase audits + session model + by-change)` with the revision the fold was made at. */
  private readonly routeAuditCache = new Map<SessionId, {
    revision: string
    byPhase: Readonly<Partial<Record<WorkflowNode, RouteAuditEntry>>>
    sessionModel?: { provider: string; model: string; auto: boolean }
    byChange?: Readonly<Record<string, import('@deepseek-ai/dsh-baf-core').TierRouteChangeRow>>
  }>()

  /**
   * 多模型路由 M3 批次C — the Tab「当前路由」payload: preferred tiers from the
   * config file (re-read every call, so a settings save shows on the next
   * poll), actual/fallback from the driving session's LAST `baf/route-resolved`
   * audit per phase — revision-cached like {@link usagePointsFor} so the 2 s
   * poll never rescans an unchanged log. Failures degrade to the
   * preferred-only fold: the row is informational, never blocking.
   * @param sessionId - the driving session.
   * @returns the wire payload for `WorkflowTabView.routeStatus`.
   */
  private async routeStatusFor(sessionId: SessionId): Promise<WorkflowTabRouteStatus> {
    const config = readRouteTierConfigSync()
    if (config === undefined || !config.enabled) return { state: 'off' }
    try {
      const stat = await this.ctx.sessionPersistence.stat(sessionId)
      const revision = stat === undefined
        ? 'none'
        : `${String(stat.revision)}:${String(stat.eventCount ?? '?')}:${String(stat.sizeBytes ?? '?')}`
      const cached = this.routeAuditCache.get(sessionId)
      if (cached !== undefined && cached.revision === revision) {
        return buildTierRouteStatus(config, cached.byPhase, cached.sessionModel, cached.byChange)
      }
      // 【变更】2026-10-07 (九点批 问题 5): the same cold-log pass now also
      // captures the session's current model (last request/header epoch) so
      // the「当前路由」empty state can say WHY it is empty.
      // 【变更】2026-10-07 (九点批 问题 4): …and the by-change fold (last
      // audit per changeId) for the 变更总览 row badges.
      const scan = await readSessionRouteScan(this.ctx, sessionId)
      const byPhase = lastRouteAuditByPhase(scan.audits)
      const byChange = lastRouteAuditByChange(scan.audits)
      this.routeAuditCache.set(sessionId, {
        revision,
        byPhase,
        byChange,
        ...(scan.sessionModel === undefined ? {} : { sessionModel: scan.sessionModel }),
      })
      return buildTierRouteStatus(config, byPhase, scan.sessionModel, byChange)
    } catch {
      return buildTierRouteStatus(config, {})
    }
  }

  /** Sessions whose cold log was already scanned (negative cache — no signal). */
  private readonly deriveScanned = new Set<SessionId>()

  /**
   * 【变更】2026-09-28 (用户问题 7): recover the session→change binding for
   * sessions created before this process started — their driving events
   * (go-dispatch orders, route audits, gate dialogs) sit in the durable log.
   * One cold scan per session per process; a hit rebinds through the shared
   * host map, a miss is cached so chat sessions don't rescan on every paint.
   * @param sessionId - the session whose log to scan.
   * @param cwd - absolute workspace root for the binding key.
   * @returns the derived change id, or undefined when the log mentions none.
   */
  private async deriveSessionChange(sessionId: SessionId, cwd: string): Promise<string | undefined> {
    if (this.deriveScanned.has(sessionId)) return undefined
    this.deriveScanned.add(sessionId)
    type ColdObservation = { events: Iterable<{ type: string; data?: unknown }>; [Symbol.dispose]?: () => void }
    type ColdQuery = { observeSession: (id: SessionId, options?: { projectionMode?: string }) => Promise<ColdObservation> }
    const query = (this.ctx as { sessionQuery?: ColdQuery }).sessionQuery
    if (query === undefined) return undefined
    const observation = await query.observeSession(sessionId, { projectionMode: 'none' })
    try {
      const derived = deriveSessionChangeFromEvents(observation.events)
      if (derived !== undefined) bindSessionChange(cwd, sessionId, derived)
      return derived
    } catch {
      return undefined
    } finally {
      observation[Symbol.dispose]?.()
    }
  }

  /** Cached `(sessionId → points)` with the revision the fold was made at. */
  private readonly usageCache = new Map<SessionId, { revision: string; points: readonly UsagePoint[] }>()

  /**
   * The session's per-step usage samples: one per `assistant/message` event
   * that carries provider usage. Read through `sessionQuery.observeSession`
   * (the same cold-read the API history path uses — no agent wake, no
   * repair); failures degrade to an empty list.
   * @param sessionId - the session whose log to fold.
   * @returns the samples (empty when unreadable or unchanged).
   */
  private async usagePointsFor(sessionId: SessionId): Promise<readonly UsagePoint[]> {
    try {
      const stat = await this.ctx.sessionPersistence.stat(sessionId)
      const revision = stat === undefined
        ? 'none'
        : `${String(stat.revision)}:${String(stat.eventCount ?? '?')}:${String(stat.sizeBytes ?? '?')}`
      const cached = this.usageCache.get(sessionId)
      if (cached !== undefined && cached.revision === revision) return cached.points
      const points = await readSessionUsagePoints(this.ctx, sessionId)
      this.usageCache.set(sessionId, { revision, points })
      return points
    } catch {
      return []
    }
  }

  /**
   * Classify a new change (pending confirmation).
   *
   * §22.19: routes through the single mint entry — this used to call
   * `service.intake` directly (a fifth mint surface with no active-change
   * check and no focus set, exactly the shape that double-minted session
   * 7.jsonl). Refusals (an active change already exists) return the current
   * view instead of a new change.
   * @param request - session + description.
   * @returns updated tab view focused on the new change.
   */
  @Remote('startIntake')
  async startIntake(request: BafWorkflowStartIntakeRequest): Promise<WorkflowTabView> {
    const { store, cwd } = await this.contextFor(request.sessionId)
    // 【变更】2026-10-29 (批次三十七 · 用户问题 4): the classification runs the
    // model on the SESSION's own route (the same route the formatter uses), so
    // the confidence percentage comes from the model the customer is already
    // talking to. A missing route leaves the keyword answer in place.
    const route = await this.draftRouteFor(request.sessionId).catch(() => undefined)
    const outcome = await this.guardDomain(() => beginIntake(cwd, request.description, async (input) => {
      return evaluateIntakeConfidence(this.ctx, route, input)
    }))
    const changeId = outcome.kind === 'minted' || outcome.kind === 'reused'
      ? outcome.changeId
      : undefined
    // 【变更】2026-09-23 (demo1 issue #1 follow-up): the Tab's mint spends the
    // session's parked statement too — otherwise the next /baf-go offers it as
    // an active-conflict against the change it just spawned.
    if (changeId !== undefined) clearParkedRequirementFor(this.liveAgentFor(request.sessionId))
    if (changeId !== undefined) bindSessionChange(cwd, request.sessionId, changeId)
    return await this.viewFor(request.sessionId, store, changeId)
  }

  /**
   * Confirm pending intake.
   * @param request - session + change.
   * @returns updated tab view.
   */
  @Remote('confirmIntake')
  async confirmIntake(request: BafWorkflowChangeRequest): Promise<WorkflowTabView> {
    const { cwd, store } = await this.contextFor(request.sessionId)
    await this.guardDomain(() => confirmIntake(store, request.changeId, 'user'))
    bindSessionChange(cwd, request.sessionId, request.changeId)
    return await this.viewFor(request.sessionId, store, request.changeId)
  }

  /**
   * Reject pending intake (abandon).
   * @param request - session + change.
   * @returns updated tab view.
   */
  @Remote('rejectIntake')
  async rejectIntake(request: BafWorkflowChangeRequest): Promise<WorkflowTabView> {
    const { store } = await this.contextFor(request.sessionId)
    await this.guardDomain(() => rejectIntake(store, request.changeId))
    return await this.viewFor(request.sessionId, store, request.changeId)
  }

  /**
   * User-facing advancement (§22 user-request 2026-09-20; 2026-09-25 the
   * always-on strip button became the Tab's TOP advance dialog).
   *
   * 【变更】2026-09-23 (demo1 issue #4): the click is now the exact
   * counterpart of typing `/baf-go` in chat — it routes through `driveGo`
   * with the §22 dialog channel (`makeGateAsk`), so the resting-point
   * decision pops the same popup the session command pops, the click through
   * the popup resolves through the same gate registry, and the authoring rest
   * the confirm lands on receives the work order (the model wakes). The old
   * shape (`confirm:true`, no popup) silently took the positive path — the
   * customer saw the Tab graph move with nothing in the session and no model
   * participation. It survives only as the fallback when no dialog channel
   * can exist (no live agent / no `userQuestions` service).
   *
   * 【变更】2026-09-25 (用户需求 工作流 1): `skipAsk` — the Tab's own top
   * dialog already IS the customer's confirmation (推进 / 暂不推进), so the
   * click passes `skipAsk` and the drive takes the `confirm:true` positive
   * path directly (no second popup); the dispatch channel still rides along,
   * so the landed stage keeps receiving the work order.
   *
   * @param request - session + change (+ `skipAsk` from the Tab dialog).
   * @returns updated tab view.
   */
  @Remote('advance')
  async advance(request: BafWorkflowChangeRequest): Promise<WorkflowTabView> {
    const { cwd, store } = await this.contextFor(request.sessionId)
    // 【变更】2026-10-27 (批次三十二 · 用户问题 2): a PAUSED change advances
    // through NO surface. The 「推进」button is hidden while the brake holds,
    // but a stale client (or a command that reached this remote another way)
    // must be refused too — the pause is the customer's brake, not a UI state.
    if (isChangePaused(cwd, request.changeId)) {
      throw new RemoteError('baf-workflow/transition', '工作流已暂停——请先点「继续」再推进。', {
        code: 'advance_paused',
        message: '工作流已暂停——请先点「继续」再推进。',
      })
    }
    // 【变更】2026-10-28 (批次三十五 · 用户问题 2): the 推进 click re-raises the
    // deferred confirmation — the decline marker the customer's 暂不推进 left
    // is cleared, so the confirmation pops on THIS click and the turn-end
    // pops resume once it is answered.
    clearAdvanceDeclined(cwd, request.changeId)
    const adapters = this.resolveAdapters(request.sessionId, cwd)
    const agent = this.liveAgentFor(request.sessionId)
    // §22.17 popup channel + §18.4.2 work-order channel — the same pair the
    // typed `/baf-go` builds (commands.ts). The click is a customer action, so
    // the dispatcher carries the customer-origin marker.
    const ask = makeGateAsk(this.ctx, agent)
    const dispatch = makeGoDispatcher(cwd, agent as DispatchAgent | undefined)
    const skipAsk = request.skipAsk === true
    const result = await this.guardDomain(() => driveGo({
      cwd,
      rawInput: `change=${request.changeId}`,
      source: 'tab',
      adapters,
      ...(skipAsk || ask === undefined ? { confirm: true } : { ask }),
      ...(dispatch === undefined ? {} : { dispatch, dispatchOrigin: 'customer' as const }),
    }))
    if (result.kind === 'error') {
      throw new RemoteError('baf-workflow/transition', result.text, {
        code: 'advance_error',
        message: result.text,
      })
    }
    return await this.viewFor(request.sessionId, store, request.changeId)
  }

  /**
   * 【变更】2026-10-28 (批次三十五 · 用户问题 2): record the workflow Tab's own
   * 暂不推进 — the same deferral the conversation tab's decline records.
   *
   * The marker is the link between the two tabs: once set, the turn-end pops
   * stand down (no re-prompt on either surface) and the graph's 「推进」 button
   * (one click = /baf-go) is the way forward.
   * @param request - the change whose advance dialog the customer dismissed.
   * @returns the refreshed view, `advanceDeclined` now attached.
   */
  @Remote('advanceDismiss')
  async advanceDismiss(request: BafWorkflowChangeRequest): Promise<WorkflowTabView> {
    const { cwd, store } = await this.contextFor(request.sessionId)
    const status = await store.readStatus(request.changeId).catch(() => undefined)
    if (status !== undefined && status.terminal === undefined && status.current !== 'drift') {
      markAdvanceDeclinedForNode(
        cwd,
        request.changeId,
        status.current,
        status.mode === 'bug-fix-path' ? 'bug-fix-path' : 'full-go-path',
      )
      this.ctx.logger.info(
        `[baf] ${new Date().toISOString()} - session baf:advanceDismiss change=${request.changeId} node=${status.current}`,
      )
    }
    return await this.viewFor(request.sessionId, store, request.changeId)
  }

  /**
   * 【变更】2026-10-27 (批次三十): the 工作流图's 暂停/继续 button.
   *
   * 【变更】2026-10-28 (批次三十三 · 用户问题 2): the control now owns the
   * MODEL's turn, not only the workflow's gates.
   *
   * 暂停 does two things, in this order:
   * 1. the brake goes on FIRST — the orchestrator pops no gate and sends no
   *    work order for this change (the brake sits in `popDueGate`, the single
   *    funnel of both);
   * 2. the model's turn is CUT (`Agent.cancel`), so the conversation the
   *    customer sees stops with the graph instead of running on behind it.
   *
   * 继续 releases the brake AND hands the work back:
   * - a pause that CUT a turn resumes it with the customer's own word —
   *   「继续」 goes to the model, which picks up where the interruption left
   *   it. A fresh work order would be wrong here: the model already knows
   *   what it was doing.
   * - a pause that caught the model IDLE has no turn to resume, so the
   *   outstanding gap goes back the way `/baf-go` sends it: the same drive
   *   the session's `/baf-go` runs, so the due gate pops again.
   *
   * The customer's own commands stay untouched in both directions —
   * `/baf-go` and the Tab's 推进 are explicit instructions, and a lock the
   * customer cannot unlock with a command is a dead end.
   *
   * @param request - session + change + the wanted state.
   * @returns the outcome.
   */
  @Remote('setWorkflowPaused')
  async setWorkflowPaused(request: BafWorkflowPauseRequest): Promise<BafWorkflowPauseResult> {
    const { cwd } = await this.contextFor(request.sessionId)
    const agent = this.livePauseAgent(request.sessionId)
    if (request.paused) {
      // The brake goes on BEFORE the turn is cut: the aborted turn ends with
      // a `turn/end`, and the orchestrator reads the brake on that event. A
      // brake set after the cut would let the gate pop in the gap between.
      const interrupted = agent?.status === 'running'
      setChangePaused(cwd, request.changeId, true, { interrupted })
      agent?.cancel?.({ kind: 'user' }, { keepInbox: true })
      return { status: 'ok', paused: true }
    }
    // 继续 — read the pause's own record BEFORE the brake comes off.
    const interrupted = wasChangeInterrupted(cwd, request.changeId)
    setChangePaused(cwd, request.changeId, false)
    if (interrupted) {
      // The cut turn resumes on the customer's word.
      if (agent?.followup === undefined) {
        return {
          status: 'unavailable',
          code: 'no-model-channel',
          reason: '当前会话没有可用的模型通道（会话可能未运行）。',
        }
      }
      bindSessionChange(cwd, request.sessionId, request.changeId)
      agent.followup(resumeMessage())
      return { status: 'ok', paused: false }
    }
    // The model was idle: the outstanding gap goes back the way `/baf-go`
    // sends it — the due gate pops again, and the work order goes to the
    // model when it is not already working.
    const adapters = this.resolveAdapters(request.sessionId, cwd)
    const ask = makeGateAsk(this.ctx, agent)
    const dispatch = makeGoDispatcher(cwd, agent as DispatchAgent | undefined)
    if (ask === undefined && dispatch === undefined) {
      return {
        status: 'unavailable',
        code: 'no-model-channel',
        reason: '当前会话没有可用的工作流通道（会话可能未运行）。',
      }
    }
    bindSessionChange(cwd, request.sessionId, request.changeId)
    // 【变更】2026-10-28 (批次三十三 · 用户问题 3): the drive's card is the
    // workflow's RESTING POINT, not a failed resume — it answers with an error
    // card for every rest ("implement 进行中 · 等模型"), and reporting that as
    // a failure put 「继续操作未能生效」 over a change that was working. The
    // brake is off and the change is live again; whatever the workflow rests
    // on now (a gate to judge, a document to write) is shown by its own
    // surface.
    await this.guardDomain(() => driveGo({
      cwd,
      rawInput: `change=${request.changeId}`,
      source: 'tab',
      adapters,
      ...(ask === undefined ? {} : { ask }),
      ...(dispatch === undefined ? {} : { dispatch, dispatchOrigin: 'customer' as const }),
    }))
    return { status: 'ok', paused: false }
  }

  /**
   * Request a legal stage transition.
   *
   * Routes every transition through the same drive layer the slash handlers
   * and the CLI use (`driveClassify`, `drivePlan`, `driveArchive`, …), so the
   * Tab cannot fabricate a state that bypasses StagePipeline's side effects:
   * Tab `transition → 'open'` now actually creates the OpenSpec skeleton and
   * locks the baseline; `transition → 'archive'` runs the atomic move; and so
   * on. Before this rewrite the handler only ran `service.transition`, which
   * writes events but skips stage handlers — the user clicked 「进入建立变更」
   * and got a `current=open` row with no skeleton, no baseline lock, no
   * artifacts (§13 issue #2, three surfaces giving different behavior for the
   * same intent).
   *
   * Source is host-stamped as `'tab'` (the same rule §22.15 B enforces for
   * confirm-edge evidence). Drives surface domain errors as `CommandResult`
   * `kind: 'error'`; we re-throw them as `RemoteError` so the Tab UI
   * surfaces the message verbatim instead of swallowing it.
   * @param request - transition request.
   * @returns updated tab view.
   */
  @Remote('transition')
  async transition(request: BafWorkflowTransitionRequest): Promise<WorkflowTabView> {
    const { cwd, store } = await this.contextFor(request.sessionId)
    const adapters = this.resolveAdapters(request.sessionId, cwd)
    const target = request.to
    const evidence = request.evidence ?? {}
    const rawInput = this.evidenceToRawInput(request.changeId, evidence)
    const source = 'tab' as const

    const result = await this.guardDomain(async () => {
      switch (target) {
        case 'open':
        // Slash behaviour: `confirm change=<id>` chains confirm-intake +
        // drive-open in one call. If intake is already confirmed (the
        // usual Tab path: confirm-intake button then enter-open button),
        // confirmIntake is a no-op and driveOpenStage runs the open drive.
        // 【变更】2026-09-23 (demo2 user issue #1): after the confirm lands
        // the change on its authoring rest (template proposal for
        // full-go-path), re-enter the coordinator once with the
        // customer-origin dispatch channel — the Tab click happens with an
        // idle model, and without the work order the freshly-installed
        // template sat in silence (the same gap the dialog clicks had).
        {
          const confirm = await driveClassify(cwd, `confirm ${rawInput}`, source)
          return await this.followWithDispatch(request.sessionId, cwd, request.changeId, confirm, adapters)
        }
        case 'intake':
          // Re-render the classification card (slash `/baf-workflow-classify`
          // with no positionals). Drives are idempotent here.
          return driveClassify(cwd, rawInput, source)
        // 【变更】2026-09-23 (demo1 issue #4): the doc-stage transitions
        // (clarify / design / plan / implement) used to return the bare drive
        // card — a click that installed the next template left the change on
        // a model-authoring rest with nobody awake and nothing in the session
        // (the「虚假推进」report). Each now re-enters the coordinator once with
        // the customer-origin work-order channel, exactly like the open case
        // above and the gateResolve/advance surfaces.
        case 'clarify':
          return await this.followWithDispatch(request.sessionId, cwd, request.changeId, await driveClarify(cwd, rawInput, source))
        case 'design':
          return await this.followWithDispatch(request.sessionId, cwd, request.changeId, await driveDesign(cwd, rawInput, source))
        case 'plan':
          return await this.followWithDispatch(request.sessionId, cwd, request.changeId, await drivePlan(cwd, rawInput, source))
        case 'implement':
          return await this.followWithDispatch(request.sessionId, cwd, request.changeId, await driveImplement(cwd, rawInput, source))
        case 'verify':
          return driveVerify(cwd, rawInput, adapters, source)
        case 'archive':
        case 'completed':
          // 【变更】2026-10-29 (批次三十六 · 用户问题 9): the archive goes
          // through the ONE host entry point (`driveArchiveDecision`) — the
          // same one the coordinator, the Tab's gate card and the session's
          // gate dialog use. The old path (`driveArchive` straight from the
          // client) skipped the checklist gate and the workspace's
          // `guard.requireHumanConfirmation`, which is how demo1's change was
          // archived 24 ms after its verify with 25 unticked checklist boxes
          // and no customer answer.
          return driveArchiveDecision({
            cwd,
            changeId: request.changeId,
            source,
            adapters,
          })
        case 'abandoned':
          // T16: driveAbandon appends `change-abandoned` raw (no
          // decideTransition), source check runs in the drive.
          return driveAbandon(cwd, `confirm ${rawInput}`, source)
        default:
          throw new BafError(
            'invalid_transition',
            `Tab transition: unsupported target ${String(target)}`,
            { target, changeId: request.changeId },
          )
      }
    })
    if (result.kind === 'error') {
      throw new RemoteError('baf-workflow/transition', result.text, {
        code: 'drive_error',
        message: result.text,
      })
    }
    return await this.viewFor(request.sessionId, store, request.changeId)
  }

  /**
   * 【变更】2026-09-23 (demo1 issue #4): re-enter the coordinator once after a
   * successful Tab drive, with the customer-origin work-order channel.
   *
   * A Tab transition that installs a stage template (open → proposal,
   * clarify → design, design → plan, plan → implement ledger) leaves the
   * change on a model-authoring rest — without this follow the click advanced
   * the graph while the session stayed silent and the model stayed asleep
   * (the「虚假推进」report). The follow's resting card is `kind: 'error'` by
   * §22 design even when the order was just delivered, so a dispatched (or
   * genuinely successful) follow keeps the combined result `success`; only a
   * real failure surfaces as the error kind (→ RemoteError → strip banner).
   * @param sessionId - the session whose live agent takes the order.
   * @param cwd - workspace root.
   * @param result - the primary drive's card (unchanged when it failed or no
   *   dispatch channel exists).
   * @returns the combined card.
   */
  private async followWithDispatch(
    sessionId: SessionId,
    cwd: string,
    changeId: string,
    result: Awaited<ReturnType<typeof driveClassify>>,
    adapters: DriveAdapters = {},
  ): Promise<Awaited<ReturnType<typeof driveClassify>>> {
    if (result.kind !== 'success') return result
    const dispatch = makeGoDispatcher(cwd, this.liveAgentFor(sessionId) as DispatchAgent | undefined)
    if (dispatch === undefined) return result
    const follow = await driveGo({
      cwd,
      rawInput: `change=${changeId}`,
      source: 'gate-card',
      adapters,
      dispatch,
      dispatchOrigin: 'customer',
    })
    if ((follow.text ?? '') === '') return result
    const dispatched = (follow.text ?? '').includes(DISPATCH_SENT_MARKER)
    return {
      kind: follow.kind === 'error' && !dispatched ? 'error' : 'success',
      text: `${result.text}\n\n${follow.text}`,
    }
  }

  /**
   * Convert structured Tab evidence into a `key=value` rawInput string the
   * drive layer (`command-drives.ts`) already parses. Mirrors what
   * `parseArgs` expects: positional-and-key=value pairs joined by spaces;
   * arrays become repeated keys.
   */
  private evidenceToRawInput(changeId: string, evidence: Readonly<Record<string, unknown>>): string {    const parts: string[] = [`change=${changeId}`]
    for (const [key, value] of Object.entries(evidence)) {
      if (key === 'change') continue
      if (value === undefined || value === null) continue
      if (Array.isArray(value)) {
        for (const v of value) {
          if (v === undefined || v === null) continue
          parts.push(`${key}=${String(v)}`)
        }
      } else if (typeof value === 'object') {
        // Nested evidence (e.g. {regressionTest: {file, command}}) — flatten
        // one level so the existing parser sees plain values.
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (v === undefined || v === null) continue
          parts.push(`${k}=${String(v)}`)
        }
      } else {
        parts.push(`${key}=${String(value)}`)
      }
    }
    return parts.join(' ')
  }

  /**
   * Resolve the mounted `bafQuality` / `bafGuard` services into the
   * {@link DriveAdapters} shape `driveVerify` and `driveGuard` consume. Both
   * live in the baf-domain isolate, whose realms are invisible to a host
   * `ctx.get` — including the agent realm — so they resolve through
   * {@link resolveIsolateService} (`agentPresets.serviceFor`, driven by the
   * session's live agent from {@link liveAgentFor}); plain host-ctx lookup is
   * the fallback for compositions without the isolate. Absent services are
   * silently omitted — the drives then surface their own 「服务未挂载」 cards
   * instead of failing here.
   */
  private resolveAdapters(sessionId: SessionId, cwd: string): DriveAdapters {
    const agent = this.liveAgentFor(sessionId)
    const quality = resolveIsolateService<{ adapter(): StackAdapter }>(this.ctx, agent, 'bafQuality')
    const guard = resolveIsolateService<{ policy(root: string): GuardPolicy }>(this.ctx, agent, 'bafGuard')
    return {
      ...(quality === undefined ? {} : { stack: quality.adapter() }),
      ...(guard === undefined ? {} : { guard: guard.policy(cwd) }),
    }
  }

  /**
   * Drift rollback (§19.5 / T13).
   *
   * Without `node` this only re-reads: the Tab opens its 「复位到…」菜单, and the
   * returned view carries candidates recomputed from live drift evidence. With
   * `node` it drives the rollback — the pipeline re-validates the target
   * against that same candidate set and refuses an illegal one, so the Tab can
   * never roll a change back to a stage the evidence does not support (§19.4:
   * the model must not pick the node, and neither may the UI).
   * @param request - session + change (+ chosen rollback target).
   * @returns updated tab view.
   */
  @Remote('resume')
  async resume(request: BafWorkflowResumeRequest): Promise<WorkflowTabView> {
    const { cwd, store } = await this.contextFor(request.sessionId)
    const options = { resume: this.resumeProvider(cwd) }
    const target = request.node
    if (target === undefined) {
      return await this.viewFor(request.sessionId, store, request.changeId, options)
    }
    const pipeline = await pipelineFor(cwd)
    await this.guardDomain(() => pipeline.driveResumeStage(request.changeId, target, undefined, 'tab'))
    return await this.viewFor(request.sessionId, store, request.changeId, options)
  }

  /**
   * Read every change in the workspace (Dashboard list view).
   *
   * Returns the full derived index: one row per change with its current stage,
   * mode, projection seq, and timestamp. Drives the Dashboard's archive
   * overview alongside the focused tab view.
   * @param request - session (workspace = session.header.cwd).
   * @returns one entry per change, in projection order.
   */
  @Remote('listChanges')
  async listChanges(request: BafWorkflowSessionRequest): Promise<readonly BafWorkflowChangeRow[]> {
    const { store } = await this.contextFor(request.sessionId)
    const index = await store.readIndex()
    return index.changes.map(c => ({
      changeId: c.changeId,
      mode: c.mode as 'full-go-path' | 'bug-fix-path' | 'clarify-required',
      current: c.current,
      seq: c.seq,
      updatedAt: c.updatedAt,
    }))
  }

  /**
   * §22.14 Tab gate-card resolve: dispatch the registered command for a
   * chosen `(gateId, optionId)` pair.
   *
   * The Tab's gate cards (`WorkflowTabGate.options`,
   * `WorkflowTabPendingGate.options`) come straight from §22 GATE_REGISTRY;
   * this method is the **only** entry that can resolve them. The
   * `driveGateResolve` host function re-validates the pair against the
   * registry (unknown `gateId` / `optionId` → refusal), then dispatches the
   * slash command the option's `command` field advertises — so the Tab
   * cannot bypass the registry, and the same transition logic serves every
   * surface.
   *
   * Resume (drift) gates derive options live from the projection, so the
   * Tab posts `optionId` of the form `resume-<node>` and the host fetches
   * the current candidate set to re-validate before dispatching.
   * @param request - session + gate id + chosen option id (+ optional change id).
   * @returns updated tab view.
   */
  /**
   * 【变更】2026-09-23 (user issue #6): the 变更总览 dashboard payload — every
   * change in the workspace (active + terminal) as one rollup row, plus the
   * header summary tiles. The modal fetches this on open.
   * @param request - session whose cwd owns the projection.
   * @returns dashboard rows, newest first.
   */
  @Remote('dashboard')
  async dashboard(request: BafWorkflowSessionRequest): Promise<WorkflowDashboardView> {
    const { cwd, store } = await this.contextFor(request.sessionId)
    // 【变更】2026-09-28 (用户问题 4): rows used to fold without any usage
    // samples, so every 变更总览 row rendered token '-'. Attribution is
    // time-window based (metrics.ts), so the samples of EVERY session ever
    // run in this workspace fold correctly — enumerate the stored sessions
    // filtered by header cwd, reuse the per-session revision cache the Tab
    // path already maintains, and hand the concatenation to the builder.
    const points: UsagePoint[] = []
    try {
      for (const snap of await this.ctx.sessionPersistence.list()) {
        if (snap.header.cwd !== cwd) continue
        points.push(...await this.usagePointsFor(snap.header.id))
      }
    } catch {
      // listing is best-effort — a dashboard without tokens still renders
    }
    return await buildWorkflowDashboard(store, points)
  }

  /**
   * 【变更】2026-10-23 (批次十八 2.2/2.3): the 工作流 page's 「变更总览」 —
   * every change of the CURRENT project, the abandoned ones included.
   *
   * Unlike `dashboard` (session-scoped), this read is workspace-scoped: the
   * page is a main-stage surface with no conversation behind it, so the
   * workspace comes from the newest live session that names one. The rollup
   * is the same builder the session modal uses, so both surfaces list the
   * same changes with the same numbers.
   * @returns the project change rows plus the header rollups.
   */
  @Remote('changeOverview')
  async changeOverview(request?: BafWorkflowChangeOverviewRequest): Promise<BafWorkflowChangeOverviewResult> {
    // 【变更】2026-10-26 (用户问题 2): the rollup follows the workspace the user
    // is looking at. The client passes the main-view session's cwd; a host
    // without one (older client) keeps the newest-live-session fallback.
    const cwd = request?.cwd !== undefined && request.cwd !== ''
      ? request.cwd
      : this.workspaceCwd()
    if (cwd === undefined) return { status: 'no-workspace' }
    const store = this.pool.storeFor(cwd)
    // The token attribution folds every session that ever ran in this
    // workspace (same rule the session dashboard applies).
    const points: UsagePoint[] = []
    try {
      for (const snap of await this.ctx.sessionPersistence.list()) {
        if (snap.header.cwd !== cwd) continue
        points.push(...await this.usagePointsFor(snap.header.id))
      }
    } catch {
      // listing is best-effort — the rows still render without tokens
    }
    const dashboard = await buildWorkflowDashboard(store, points)
    return {
      status: 'ready',
      cwd,
      rows: dashboard.rows,
      summary: dashboard.summary,
    }
  }

  /**
   * 【变更】2026-10-24 (批次十九 1.3): ONE change's detail — the 变更总览
   * tab's row drill-down.
   *
   * The session tab used to open the change inside a modal built from
   * `getTabView({sessionId, changeId})`; the project-level page has no
   * conversation behind it, so the change is read straight from the workspace
   * projection: the same `buildWorkflowTabView` projection the flow graph
   * renders, plus the change's event history flattened for the modal's
   * history list.
   * @param request - the change to describe.
   * @returns the change's view + history, or the reason it is unavailable.
   */
  @Remote('changeDetail')
  async changeDetail(request: BafWorkflowChangeDetailRequest): Promise<BafWorkflowChangeDetailResult> {
    // 【变更】2026-10-26 (用户问题 2): same rule as `changeOverview` — the
    // client pins the workspace, the parameterless read falls back to the
    // newest live session.
    const cwd = request.cwd !== undefined && request.cwd !== ''
      ? request.cwd
      : this.workspaceCwd()
    if (cwd === undefined) return { status: 'no-workspace' }
    const store = this.pool.storeFor(cwd)
    const changeId = request.changeId
    // A change id the workspace never knew → the ledger row is stale.
    const known = (await store.readIndex()).changes.some(entry => entry.changeId === changeId)
    if (!known) return { status: 'unknown-change', changeId }
    const events = await store.readEvents(changeId)
    const view = await buildWorkflowTabView(store, changeId, {
      includeMetrics: true,
      usagePoints: await this.workspaceUsagePoints(cwd),
    })
    return {
      status: 'ready',
      cwd,
      changeId,
      view,
      // 【变更】2026-10-24 (批次十九 1.3): readEvents returns the parsed events
      // plus an optional corruption line — the row's history is the event list.
      history: events.events.map(event => flattenChangeEvent(event)),
    }
  }

  /**
   * Every session that ever ran in this workspace contributes its token
   * samples — the same attribution the dashboard rollup uses.
   * @param cwd - workspace root.
   * @returns the usage points (best effort).
   */
  private async workspaceUsagePoints(cwd: string): Promise<UsagePoint[]> {
    const points: UsagePoint[] = []
    try {
      for (const snap of await this.ctx.sessionPersistence.list()) {
        if (snap.header.cwd !== cwd) continue
        points.push(...await this.usagePointsFor(snap.header.id))
      }
    } catch {
      // listing is best-effort — the view still renders without tokens
    }
    return points
  }

  @Remote('gateResolve')
  async gateResolve(request: BafWorkflowGateResolveRequest): Promise<WorkflowTabView> {
    const { cwd, store } = await this.contextFor(request.sessionId)
    let resumeCandidates: readonly import('@deepseek-ai/dsh-baf-core').WorkflowNode[] | undefined
    let resolvedChangeId: string | undefined = request.changeId
    if (request.changeId === undefined) {
      const picked = await resolveActiveChange(store)
      resolvedChangeId = picked.kind === 'one' ? picked.changeId : undefined
    }
    // 【变更】2026-09-28 (用户问题 7): this session's Tab just resolved a gate
    // on that change — it is the change this conversation is driving.
    if (resolvedChangeId !== undefined) bindSessionChange(cwd, request.sessionId, resolvedChangeId)
    // 【变更】2026-10-02 (demo31 问题 1): the Tab click is a customer action in
    // this session — anchor the home so the orchestrator's later pops (and
    // the work orders that follow) land in this conversation instead of
    // drifting to whichever session next ends a turn.
    homeSessionFor(cwd).set(request.sessionId)
    if (request.gateId === 'resume') {
      // The Tab's `gate.options` for a resume gate are already pinned from
      // the projection, but the host re-derives them so a stale tab cannot
      // dispatch to a node the projection no longer considers legal.
      if (resolvedChangeId === undefined) {
        return await this.viewFor(request.sessionId, store, null)
      }
      const pipeline = await pipelineFor(cwd)
      const options = await pipeline.resumeOptions(resolvedChangeId)
      resumeCandidates = options.candidates
    }
    const scaffoldAdapter = this.tryGetScaffoldAdapter(request.sessionId)
    // 【变更】2026-09-23 (user issue #1): the Tab gate-card click is a
    // customer action — a confirm that advances into a template rest
    // dispatches the work order that wakes the model.
    const dispatch = makeGoDispatcher(cwd, this.liveAgentFor(request.sessionId) as DispatchAgent | undefined)
    const auditLines: string[] = []
    await this.guardDomain(() =>
      driveGateResolve(
        cwd,
        request.gateId,
        request.optionId,
        {
          // The scaffold adapter is resolved through the session's agent
          // realm (isolate-mounted); pass through when found. Other gates
          // don't need an adapter, and driveGateResolve ignores absent ones
          // silently.
          ...(scaffoldAdapter === undefined ? {} : { scaffold: scaffoldAdapter }),
        },
        resumeCandidates,
        undefined,
        'gate-card',
        {
          // §22.16 P3: emit one structured audit line per dispatched resolve.
          // exactOptionalPropertyTypes forbids `changeId: undefined`, so we
          // conditionally include the field when the host actually carried it.
          ...(request.changeId === undefined ? {} : { changeId: request.changeId }),
          audit: (line) => {
            auditLines.push(line)
            this.ctx.logger.info(line)
          },
          ...(dispatch === undefined ? {} : { dispatch }),
          // 【变更】2026-09-23 (demo2 user issue #2): the bug-fix form's
          // five fields ride the classify-confirm click (§22.17 J).
          ...(request.extraArgs === undefined || request.extraArgs.length === 0
            ? {}
            : { extraArgs: request.extraArgs }),
        },
      ),
    )
    if (auditLines.length === 0) {
      this.ctx.logger.info(
        `[baf] ${new Date().toISOString()} - session baf:gate gateId=${request.gateId} option=${request.optionId} change=${request.changeId ?? '-'} source=gate-card action=dismissed`,
      )
    }
    // 【变更】2026-09-23 (demo2 user issue #1): a scaffold gate resolved with
    // 初始化工作区 must not dead-end on the Tab surface either — the
    // requirement the customer stated before it (parked by baf-auto-pop)
    // continues as the 新建工作流 → 分类确认 chain in the session, the same
    // continuation the typed /baf-go runs. Its card is logged, not returned:
    // this remote's contract is the refreshed view.
    if (request.gateId === 'scaffold' && request.optionId === 'init') {
      const agent = this.liveAgentFor(request.sessionId)
      if (agent !== undefined) {
        try {
          const follow = await continueParkedRequirement(this.ctx, agent, cwd)
          if (follow !== undefined) {
            this.ctx.logger.info(
              `[baf] ${new Date().toISOString()} - session baf:gate gateId=scaffold option=init followUp=continued result=${follow.kind}`,
            )
          }
        } catch (error) {
          this.ctx.logger.warn(
            `bafWorkflowView: parked-requirement continuation failed: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }
    return await this.viewFor(request.sessionId, store, resolvedChangeId)
  }

  /**
   * 【变更】2026-09-28 (用户问题 1.7 Tab parity): submit a revision request from
   * the Tab's own decision surfaces (the advance dialog, the parked-gate
   * banner) — no ask carrier answers for those, so the host maps the click
   * onto the SAME `gate-revise` work-order dispatch the session dialog's
   * `custom` answer takes. `gateId` wins when present (banner); otherwise the
   * advance dialog's `node`+`mode` derive the stage's advance gate. The
   * outcome card is logged here (the remote's contract is the refreshed
   * view); the Tab swaps its revision form to a 已派单 note locally.
   * @param request - session + gate id or stage + the modification text.
   * @returns updated tab view.
   */
  @Remote('gateRevise')
  async gateRevise(request: BafWorkflowGateReviseRequest): Promise<WorkflowTabView> {
    const { cwd, store } = await this.contextFor(request.sessionId)
    let resolvedChangeId = request.changeId
    if (resolvedChangeId === undefined) {
      const picked = await resolveActiveChange(store)
      resolvedChangeId = picked.kind === 'one' ? picked.changeId : undefined
    }
    // 【变更】2026-09-28 (用户问题 7): the Tab just acted on that change.
    if (resolvedChangeId !== undefined) bindSessionChange(cwd, request.sessionId, resolvedChangeId)
    // 【变更】2026-10-02 (demo31 问题 1): a revision click is a customer action
    // too — anchor the home on this session.
    homeSessionFor(cwd).set(request.sessionId)
    const gateId = request.gateId !== undefined && request.gateId !== ''
      ? request.gateId
      : advanceGateIdForNode(request.node ?? '', request.mode)
    if (gateId !== undefined) {
      const dispatch = makeGoDispatcher(cwd, this.liveAgentFor(request.sessionId) as DispatchAgent | undefined)
      const revisionGate = gateId as Parameters<typeof dispatchGateRevisionFromTab>[2]
      const card = dispatchGateRevisionFromTab(cwd, dispatch, revisionGate, resolvedChangeId, request.text)
      if (card !== undefined) {
        this.ctx.logger.info(
          `[baf] ${new Date().toISOString()} - session baf:gateRevise gateId=${gateId} change=${resolvedChangeId ?? '-'} source=gate-card textLen=${request.text.length}`,
        )
      }
    }
    return await this.viewFor(request.sessionId, store, resolvedChangeId)
  }

  /**
   * 【变更】2026-10-27 (同步产物): the artifact-sync dispatch — the customer
   * clicked 同步 on a document that an upstream edit made stale, so the model
   * must re-author it (and every document after it).
   *
   * The red line this respects: the repo's rule is 「no dispatch without a
   * customer action」. This remote is reachable ONLY from the Tab's 同步
   * button, so the click IS the authorization — the order it sends carries
   * the `customer` ledger scope and never dedupes against the orchestrator's
   * turn-end order.
   *
   * The order is addressed at the EARLIEST stale stage: the later documents
   * are rewritten from it, so re-authoring them one by one would only produce
   * another drift.
   *
   * 【变更】2026-10-27 (批次三十一): the order lands in the session the customer
   * clicked from. It used to be addressed to the WORKSPACE's home session, so
   * a customer working in a second conversation saw the click accepted and
   * nothing happened — the order went somewhere they were not looking. The
   * request now carries the session id and the order goes to THAT session's
   * agent.
   * @param request - the change to sync, in the session the customer is in.
   * @returns what the dispatch did.
   */
  @Remote('syncArtifacts')
  async syncArtifacts(request: BafWorkflowSyncRequest): Promise<BafWorkflowSyncResult> {
    // 【变更】2026-10-27: same workspace rule as `changeDetail` — the client
    // pins the workspace, the parameterless read falls back to the newest
    // live session.
    const cwd = request.cwd !== undefined && request.cwd !== ''
      ? request.cwd
      : this.workspaceCwd()
    if (cwd === undefined) return { status: 'no-workspace' }
    const store = this.pool.storeFor(cwd)
    const status = await store.readStatus(request.changeId).catch(() => undefined)
    if (status === undefined) {
      return { status: 'unavailable', reason: `变更不存在：${request.changeId}` }
    }
    const mode = status.mode === 'bug-fix-path' ? 'bug-fix-path' : 'full-go-path'
    // 【变更】2026-10-28 (批次三十五 · 用户问题 1): the events ride along — only
    // a COMPLETED stage can be judged, so the model's same-turn co-write of
    // two documents is not a desync (and the 同步 click that collides with
    // the still-running turn is refused below instead).
    const { events } = await store.readEvents(request.changeId).catch(() => ({ events: [] }))
    const drift = await detectArtifactDrift(cwd, request.changeId, mode, events)
    if (drift.length === 0) return { status: 'no-drift' }
    const target = drift[0]
    if (target === undefined || !isDriftStage(target.node)) {
      return { status: 'unavailable', reason: '待同步的阶段无法识别' }
    }
    // 【变更】2026-10-27 (批次三十一): the agent of the session the customer
    // clicked in — not the workspace's home session, which can be another
    // conversation the customer is not looking at.
    const addressed = this.liveAgentFor(request.sessionId) as DispatchAgent | undefined
    if (addressed === undefined) {
      return { status: 'unavailable', reason: '当前工作区没有可用会话（会话可能未运行）' }
    }
    const dispatch = makeGoDispatcher(
      cwd,
      addressed,
      tierRouteSelectorFor(cwd, this.ctx, addressed),
    )
    if (dispatch === undefined) {
      return { status: 'unavailable', reason: '当前会话没有可用的派单通道（会话可能不在运行中）' }
    }
    // 【变更】2026-10-27: the customer acted on this change here — bind the
    // session to it, so the workflow's later pops land in this conversation.
    bindSessionChange(cwd, request.sessionId, request.changeId)
    // 【变更】2026-10-27 (批次三十一): anchor the workspace's home session here
    // too — the orchestrator's turn-end pop follows the home session, and the
    // customer's 同步 click is what brought this change back to life.
    homeSessionFor(cwd).set(request.sessionId)
    const outcome = dispatch({
      changeId: request.changeId,
      node: target.node,
      artifactPath: driftArtifactPath(request.changeId, target.file),
      missing: driftWorkLines(drift),
      cause: 'artifact-drift-sync',
      mode,
      scope: 'customer',
    })
    const nodes = drift.map(row => row.node)
    this.ctx.logger.info(
      `[baf] ${new Date().toISOString()} - session baf:sync change=${request.changeId} nodes=${nodes.join(',')} outcome=${outcome}`,
    )
    // 【变更】2026-10-27 (批次三十一): a deduped order means the very same
    // order is already on its way — nothing new reached the model, and the
    // client must not read that as a fresh dispatch.
    if (outcome === 'sent') return { status: 'dispatched', nodes }
    if (outcome === 'deduped') return { status: 'queued', nodes }
    return {
      status: 'unavailable',
      reason: outcome === 'busy' ? '模型回合进行中，回合结束后再点同步' : '派单通道未放行',
    }
  }

  /**
   * 【变更】2026-10-07 (九点批 问题 9): the settings 门禁总览 row's payload —
   * the read-only projection of BOTH gate layers (the 15 confirm-gate registry
   * entries and the per-stage completion gates, condition lines verbatim).
   * Zero-arg and static: the registry is product data, so the answer never
   * varies per workspace. The row's copy answers 增删改 honestly — gate
   * entries live in the product registry (code + tests); configuration files
   * govern switches and thresholds.
   * @returns both gate-layer tables.
   */
  @Remote('gateOverview')
  gateOverview(): Promise<BafWorkflowGateOverview> {
    return Promise.resolve(projectGateOverview())
  }

  /**
   * 【变更】2026-10-21 (批次十 测试流图): the session Tab's test-status read —
   * what the workspace's quality reports say RIGHT NOW (see
   * {@link readTestFlowStatus}). A session without a cwd answers `no-cwd` so
   * the tab renders its guidance hint instead of a fake all-idle chart;
   * anything else (dead session id) rethrows for the client's error strip.
   * @param request - the session whose workspace owns the reports.
   * @returns the 测试流图 status payload.
   */
  @Remote('testFlowStatus')
  async testFlowStatus(request: BafWorkflowSessionRequest): Promise<BafWorkflowTestFlowStatus> {
    let cwd: string
    try {
      cwd = await this.requireCwd(request.sessionId)
    } catch (error) {
      if (error instanceof RemoteError && error.code === 'baf-workflow/no-cwd') {
        return { status: 'no-cwd' }
      }
      throw error
    }
    return readTestFlowStatus(cwd)
  }

  /**
   * 【变更】2026-10-22 (批次十二 2.1 + 2.4): one 测试流图 node's 运行 button —
   * spawn the stage's baf-wrapped command in the workspace root and report the
   * REAL outcome (exit code + captured tail, never a fabricated verdict). The
   * command map is the wrapper's own contract (baf-quality-cli.cjs): `test` →
   * ceedling test:all, `check` → gcov 插桩 + gcovr + 门禁, `lint` → cpplint +
   * cppcheck; build shares `test` (ceedling compiles inside the test build —
   * the wrapper has no compile-only subcommand), and format keeps the raw
   * `clang-format -i <arg>` (the discipline's final step; no wrapper
   * subcommand by design — 2.5 makes the path configurable).
   *
   * A wrapper the shell cannot resolve answers `tool-missing` with the exact
   * command echoed, so the customer can run it by hand.
   * @param request - session + stage (+ the format node's configured path).
   * @returns the spawned command's outcome.
   */
  @Remote('runTestFlowStage')
  async runTestFlowStage(request: BafWorkflowStageRunRequest): Promise<BafWorkflowStageRunResult> {
    let cwd: string
    try {
      cwd = await this.requireCwd(request.sessionId)
    } catch (error) {
      if (error instanceof RemoteError && error.code === 'baf-workflow/no-cwd') {
        return { status: 'no-cwd' }
      }
      throw error
    }
    // 【变更】2026-10-22 (批次十三 4): a stage switched OFF in the 测试流
    // canvas refuses to run — the client greys its button out, and this guard
    // covers stale status and direct remote calls. Echoes the command (so the
    // result card still shows WHAT was refused) with the closed notice.
    const toggles = await readTestFlowStageToggles(cwd)
    if (toggles[request.stage]?.enabled === false) {
      return {
        status: 'disabled',
        command: testFlowCommandFor(request.stage, request.arg),
        output: '该步骤已在测试流配置中关闭（工作流 · 测试流），可前往打开后重试',
      }
    }
    const outcome = await execTestFlowStage(cwd, request.stage, request.arg)
    if (outcome.toolMissing) {
      return {
        status: 'tool-missing',
        command: outcome.command,
        output: outcome.output,
        durationMs: outcome.durationMs,
      }
    }
    return {
      status: 'ready',
      command: outcome.command,
      exitCode: outcome.exitCode,
      output: outcome.output,
      durationMs: outcome.durationMs,
    }
  }

  /**
   * 【变更】2026-10-22 (批次十三 1/4): the 测试流图's 全部运行 — one sweep over
   * the enabled stages in canonical order (build→test→instrument→report→gate→
   * lint→analyze→format, {@link TEST_FLOW_CHAIN_ORDER}). A stage OFF in the
   * test-flow config is reported as `skipped` (ok, never spawned); a FAILED
   * stage whose `haltOnError` switch is on (the default) stops the sweep — the
   * remaining stages are simply absent from the answer, and the client paints
   * the halt note. A missing tool (`toolMissing: true` on the outcome) is a
   * failure like any other for halting — it honors that stage's own switch.
   * @param request - session + the format node's configured path.
   * @returns per-stage outcomes plus the sweep's wall-clock duration.
   */
  @Remote('runTestFlowChain')
  async runTestFlowChain(request: BafWorkflowChainRunRequest): Promise<BafWorkflowChainRunResult> {
    let cwd: string
    try {
      cwd = await this.requireCwd(request.sessionId)
    } catch (error) {
      if (error instanceof RemoteError && error.code === 'baf-workflow/no-cwd') {
        return { status: 'no-cwd', stages: [], durationMs: 0 }
      }
      throw error
    }
    const started = Date.now()
    const toggles = await readTestFlowStageToggles(cwd)
    const outcomes: BafWorkflowChainStageOutcome[] = []
    for (const stage of TEST_FLOW_CHAIN_ORDER) {
      const toggle = toggles[stage]
      if (toggle?.enabled === false) {
        outcomes.push({ stage, ok: true, skipped: true })
        continue
      }
      const outcome = await execTestFlowStage(cwd, stage, request.arg)
      outcomes.push({
        stage,
        ok: outcome.ok,
        ...(outcome.toolMissing ? { toolMissing: true } : {}),
        exitCode: outcome.exitCode,
        command: outcome.command,
        output: outcome.output,
        durationMs: outcome.durationMs,
      })
      // haltOnError defaults ON: only an explicit `false` lets the sweep
      // march past a failure (the settings canvas's own normalization rule).
      if (!outcome.ok && toggle?.haltOnError !== false) break
    }
    return { status: 'ready', stages: outcomes, durationMs: Date.now() - started }
  }

  /**
   * 【变更】2026-10-22 (批次十二 2.6): one config file's preview payload — the
   * 测试流图 detail pane's 配置文件 chips. Workspace-relative paths only (no
   * absolute, no `..` — the resolved path must stay inside the workspace
   * root); text is size-capped so a pathological file cannot flood the wire.
   * @param request - session + workspace-relative path.
   * @returns the file's text or its absence.
   */
  @Remote('readWorkspaceFile')
  async readWorkspaceFile(request: BafWorkflowFileReadRequest): Promise<BafWorkflowFileReadResult> {
    let cwd: string
    try {
      cwd = await this.requireCwd(request.sessionId)
    } catch (error) {
      if (error instanceof RemoteError && error.code === 'baf-workflow/no-cwd') {
        return { status: 'missing', reason: 'no-cwd' }
      }
      throw error
    }
    const rel = request.path.replace(/\\/g, '/')
    if (rel === '' || rel.startsWith('/') || /^[a-zA-Z]:/.test(rel) || rel.split('/').includes('..')) {
      return { status: 'unreadable', path: rel, reason: '仅支持工作区相对路径' }
    }
    const abs = resolve(join(cwd, rel))
    if (!abs.startsWith(resolve(cwd))) {
      return { status: 'unreadable', path: rel, reason: '仅支持工作区相对路径' }
    }
    try {
      const content = await readFile(abs, 'utf8')
      return {
        status: 'ready',
        path: abs,
        content: content.length > WORKSPACE_FILE_PREVIEW_CAP
          ? `${content.slice(0, WORKSPACE_FILE_PREVIEW_CAP)}\n… [截断，共 ${content.length} 字符]`
          : content,
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return /ENOENT/i.test(reason) ? { status: 'missing', path: abs } : { status: 'unreadable', path: abs, reason }
    }
  }

  /**
   * 【变更】2026-10-25 (批次二十四 3): arrange one composer draft with the
   * session's OWN model — the「格式化输入」control's model path.
   *
   * The call is auxiliary, not a turn: `purpose: 'draft-format'` says so, the
   * draft rides as one user message, and nothing is appended to the session
   * log (the draft is the user's, and the arranged text is the user's too —
   * the model only shaped it). The route is the session's current selection,
   * so the user needs no second provider and no configuration.
   *
   * Every failure answers `unavailable` rather than throwing: the composer
   * falls back to its local arranger, so a provider hiccup must not surface
   * as an error the user has to dismiss.
   *
   * 【变更】2026-10-25 (批次二十五 2): the call now OPTIMIZES the draft's
   * content, not just its structure (see {@link DRAFT_FORMAT_SYSTEM}), and it
   * names the route it ran on in the answer so the composer can tell the user
   * that the model really answered — a silent fallback reads as「没有效果」.
   * @param request - session + the author's raw draft.
   * @returns the arranged Markdown, or the reason the call could not run.
   */
  @Remote('formatDraft')
  async formatDraft(request: BafWorkflowDraftFormatRequest): Promise<BafWorkflowDraftFormatResult> {
    if (request.draft.trim() === '') return { status: 'unavailable', reason: 'empty' }
    const route = await this.draftRouteFor(request.sessionId)
    // 【变更】2026-10-26 (批次二十九 1): the "no route" answer used to be
    // silent, so a 「模型未响应」 report had no ground truth. The reason is
    // logged (and the resolved route with it) whenever the formatter runs.
    if (route === undefined) {
      this.ctx.logger.warn(
        `bafWorkflowView.formatDraft: no route for session ${String(request.sessionId)} — the deployment has no model to answer with`,
      )
      return { status: 'unavailable', reason: 'no-model' }
    }
    const messages: RequestMessage[] = [
      { role: 'user', content: [{ type: 'text', text: request.draft }] },
    ]
    const options: GenerateOptions = {
      provider: route.provider,
      model: route.model,
      messages,
      system: DRAFT_FORMAT_SYSTEM,
      maxTokens: DRAFT_FORMAT_MAX_TOKENS,
      sessionId: request.sessionId,
      purpose: 'draft-format',
    }
    try {
      const assembler = new BlockAssembler()
      for await (const chunk of this.ctx.llm.stream(options)) assembler.push(chunk)
      const finish = assembler.finish
      if (finish.kind === 'error' || finish.kind === 'aborted') {
        return { status: 'unavailable', reason: 'failed' }
      }
      const text = assembler.blocks()
        .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
        .map(block => block.text)
        .join('')
        .trim()
      if (text === '') return { status: 'unavailable', reason: 'empty' }
      return { status: 'ready', text, provider: route.provider, model: route.model }
    } catch (error) {
      this.ctx.logger.warn(
        `bafWorkflowView.formatDraft failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      return { status: 'unavailable', reason: 'failed' }
    }
  }

  /**
   * 【变更】2026-10-25 (批次二十四 3): the route one formatting call runs on.
   *
   * 【变更】2026-10-25 (批次二十五 2): the resolution moved into
   * {@link resolveDraftRoute} — the same order the agent loop uses (the
   * session's recorded selection first, then the live route options, then the
   * last request header), with every candidate mapped through the
   * deployment's per-step route resolver so the BAF「自动」pseudo entry
   * resolves to the tier route the step would use.
   * @param sessionId - the session whose route is resolved.
   * @returns the route, or undefined when the session has none.
   */
  private async draftRouteFor(sessionId: SessionId): Promise<DraftRoute | undefined> {
    return resolveDraftRoute(this.ctx, sessionId)
  }

  /**
   * 【变更】2026-10-07 (九点批 问题 2/4): preview the model a gate click would
   * dispatch the next work order on — the advance dialog and the gate cards
   * render their 「确认后派单：<档位>·<模型>」 line from this. Runs the SAME
   * pure core a real dispatch runs (`tierRouteSelection`), with the same
   * auto-gate (a session not on the Auto pseudo entry dispatches on its own
   * model — preview says `off/session`, never a tier that would not run), but
   * pins nothing and audits nothing: previewed, not executed.
   * @param request - session + change + the stage the gate rests on.
   * @returns the preview outcome.
   */
  @Remote('routePreview')
  async routePreview(request: BafWorkflowRoutePreviewRequest): Promise<BafWorkflowRoutePreview> {
    const config = readRouteTierConfigSync()
    if (config === undefined || !isTierRoutingActive(config)) return { state: 'off', why: 'config' }
    // The auto gate, structurally read exactly like the dispatch hook's shell
    // (`tierRouteSelectorFor`): no pin surface is touched, only consulted.
    let controller: { rawSelectionOf(agent: unknown): { provider: string; model: string } | undefined } | undefined
    let auto: { accepts(provider: string, model: string): boolean } | undefined
    try {
      const resolvedController = this.ctx.get('sessionController')
      if (resolvedController !== undefined && typeof (resolvedController as { rawSelectionOf?: unknown }).rawSelectionOf === 'function') {
        controller = resolvedController as typeof controller
      }
      const resolvedAuto = this.ctx.get('bafRouteAuto')
      if (resolvedAuto !== undefined && typeof (resolvedAuto as { accepts?: unknown }).accepts === 'function') {
        auto = resolvedAuto as typeof auto
      }
    } catch {
      // Structural reads are best-effort — fall through to the off/session
      // answer below, which is what an unrouted session renders anyway.
    }
    if (controller === undefined || auto === undefined) return { state: 'off', why: 'session' }
    const raw = controller.rawSelectionOf(this.liveAgentFor(request.sessionId))
    if (raw === undefined || !auto.accepts(raw.provider, raw.model)) return { state: 'off', why: 'session' }
    const cwd = await this.requireCwd(request.sessionId)
    const node = request.node as DispatchNode
    const outcome = tierRouteSelection(
      {
        changeId: request.changeId,
        node,
        artifactPath: artifactPathFor(request.changeId, node),
        missing: [],
      },
      config,
      taskTierFor(cwd, request.changeId)?.tier,
    )
    if (outcome === undefined) return { state: 'unresolved' }
    return {
      state: 'routed',
      tier: outcome.tier,
      reason: outcome.reason,
      provider: outcome.selection.provider,
      model: outcome.selection.model,
    }
  }

  /**
   * The session's live agent — the handle `agentPresets.serviceFor` needs to
   * reach baf-domain isolate services (`bafScaffold`, `bafQuality`,
   * `bafGuard`). Isolate realms are invisible to a host `ctx.get` and even to
   * the agent realm itself, so the two-scope `get` this class used before
   * could never see them in the real desktop; the sanctioned cross-isolate
   * read is `ctx.get('agentPresets').serviceFor(agent, name)`, which is what
   * {@link resolveIsolateService} drives. Returns undefined for a dead or
   * unknown session; callers then fall back to plain host-ctx lookups,
   * matching dev/test compositions that mount the rows without an isolate.
   * @param sessionId - the session whose agent to fetch.
   * @returns the live agent, or undefined when no agent holds the session.
   */
  private liveAgentFor(sessionId: SessionId): { ctx?: Context } | undefined {
    try {
      return this.ctx.agents.get(sessionId)
    } catch {
      return undefined
    }
  }

  /**
   * 【变更】2026-10-28 (批次三十三 · 用户问题 2): the agent face the 暂停/继续
   * control drives — the turn it cuts and the 「继续」 it hands back.
   *
   * Structural on purpose: a session whose agent is gone (or a test double
   * without the members) reports no channel, and the control answers with a
   * notice instead of pretending it interrupted something.
   */
  private livePauseAgent(sessionId: SessionId): PauseAgentFace | undefined {
    return this.liveAgentFor(sessionId) as PauseAgentFace | undefined
  }

  /**
   * Wrap the `bafScaffold` service as a `ScaffoldAdapter`. The service is
   * mounted inside the baf-domain isolate, so it resolves through
   * {@link resolveScaffoldService} with the session's live agent (see
   * {@link liveAgentFor}). Returns undefined when no realm defines it —
   * callers (gateResolve) simply skip the adapter in that case.
   * @param sessionId - the session whose agent may hold the service.
   * @returns adapter for {@link driveGateResolve}, or undefined.
   */
  private tryGetScaffoldAdapter(sessionId: SessionId): ScaffoldAdapter | undefined {
    const svc = resolveScaffoldService(this.ctx, this.liveAgentFor(sessionId))
    if (svc === undefined) return undefined
    return { scaffold: opts => svc.scaffold(opts) }
  }

  private async contextFor(sessionId: SessionId): Promise<{ cwd: string; store: ProjectionStore }> {
    const cwd = await this.requireCwd(sessionId)
    // §22.19 R5 — the persistent per-cwd store (its append bus feeds the
    // push event), replacing the per-RPC throwaway.
    return { cwd, store: this.pool.storeFor(cwd) }
  }

  /**
   * 【变更】2026-10-23 (批次十八 2.3): the workspace a project-scoped read
   * answers for — the newest live session that names a cwd (sessions list in
   * creation order, so the last entry is the newest). Undefined when no live
   * session carries a workspace.
   * @returns absolute workspace root, or undefined.
   */
  private workspaceCwd(): string | undefined {
    try {
      const sessions = this.ctx.sessions.list()
      for (let index = sessions.length - 1; index >= 0; index -= 1) {
        const cwd = sessions[index]?.header?.cwd
        if (cwd !== undefined && cwd !== '') return cwd
      }
    } catch {
      // No live session store — the caller answers with the empty state.
    }
    return undefined
  }

  /**
   * Rollback menu for a change parked in drift (§19.5).
   *
   * `detectDrift` probes Git and the stage artifacts, so this is deliberately
   * *not* run on every Tab paint — `buildWorkflowTabView` only calls it once
   * the change is actually parked in `drift`. The anchors and targets come from
   * `StagePipeline.resumeOptions`, the same read the `/baf-workflow-resume`
   * card uses, so the menu and the card can never disagree.
   * @param cwd - session workspace root.
   * @returns provider for {@link buildWorkflowTabView}.
   */
  private resumeProvider(
    cwd: string,
  ): (changeId: string) => Promise<WorkflowTabResume | undefined> {
    return async (changeId: string) => {
      const pipeline = await pipelineFor(cwd)
      const options = await pipeline.resumeOptions(changeId)
      return { anchor: options.anchor, candidates: options.candidates }
    }
  }

  private async requireCwd(sessionId: SessionId): Promise<string> {
    const live = this.ctx.sessions.get(sessionId)
    if (live?.header.cwd !== undefined) return live.header.cwd
    const snap = await this.ctx.sessionPersistence.stat(sessionId)
    if (snap === undefined) {
      throw new RemoteError('baf-workflow/session-not-found', 'session not found', {
        sessionId: String(sessionId),
      })
    }
    const handle = await this.ctx.sessionPersistence.open(sessionId, 'read')
    try {
      const cwd = handle.header.cwd
      if (cwd === undefined) {
        throw new RemoteError('baf-workflow/no-cwd', 'session has no cwd', {
          sessionId: String(sessionId),
        })
      }
      return cwd
    } finally {
      await handle.close()
    }
  }

  private async guardDomain<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error) {
      if (error instanceof RemoteError) throw error
      if (isBafError(error) || error instanceof BafError) {
        throw new RemoteError('baf-workflow/domain', error.message, {
          code: isBafError(error) ? error.code : 'unknown',
          message: error.message,
        })
      }
      throw error
    }
  }
}

export default BafWorkflowTabRemote
