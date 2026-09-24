/**
 * Host Typert Remote for the BAF 工作流 Tab.
 * @module @deepseek-ai/dsh-client-ui-baf-workflow
 */

import { resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import {
  BafError,
  isBafError,
  type GuardPolicy,
  type StackAdapter,
} from '@deepseek-ai/dsh-baf-core'
import {
  ProjectionStore,
  buildWorkflowDashboard,
  buildWorkflowTabView,
  type BuildWorkflowTabViewOptions,
  type UsagePoint,
  beginIntake,
  clearParkedRequirementFor,
  confirmIntake,
  continueParkedRequirement,
  DISPATCH_SENT_MARKER,
  driveAbandon,
  driveArchive,
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
  resolveIsolateService,
  resolveScaffoldService,
  type DispatchAgent,
  type DriveAdapters,
  type ScaffoldAdapter,
} from '@deepseek-ai/dsh-baf-workflow'
import type { WorkflowDashboardView, WorkflowTabResume, WorkflowTabView } from '@deepseek-ai/dsh-baf-core'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  BafWorkflowChangeRequest,
  BafWorkflowChangeRow,
  BafWorkflowGateResolveRequest,
  BafWorkflowResumeRequest,
  BafWorkflowSessionRequest,
  BafWorkflowStartIntakeRequest,
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
  BafWorkflowChangeRequest,
  BafWorkflowChangeRow,
  BafWorkflowGateResolveRequest,
  BafWorkflowProjectionAppended,
  BafWorkflowResumeRequest,
  BafWorkflowSessionRequest,
  BafWorkflowStartIntakeRequest,
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
  static inject = ['sessions', 'sessionPersistence', 'agents', 'sessionQuery']

  /** §22.19 R5 — persistent per-cwd stores whose append bus feeds the push. */
  private readonly pool: ProjectionStorePool

  constructor(ctx: Context) {
    super(ctx, 'bafWorkflowView')
    this.pool = createProjectionStorePool(ctx)
    ctx.effect(() => { return () => { this.pool.dispose() } }, 'bafWorkflowView: projection store pool')
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
    return buildWorkflowTabView(store, changeId ?? undefined, {
      ...options,
      usagePoints: await this.usagePointsFor(sessionId),
    })
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
    const outcome = await this.guardDomain(() => beginIntake(cwd, request.description))
    const changeId = outcome.kind === 'minted' || outcome.kind === 'reused'
      ? outcome.changeId
      : undefined
    // 【变更】2026-09-23 (demo1 issue #1 follow-up): the Tab's mint spends the
    // session's parked statement too — otherwise the next /baf-go offers it as
    // an active-conflict against the change it just spawned.
    if (changeId !== undefined) clearParkedRequirementFor(this.liveAgentFor(request.sessionId))
    return await this.viewFor(request.sessionId, store, changeId)
  }

  /**
   * Confirm pending intake.
   * @param request - session + change.
   * @returns updated tab view.
   */
  @Remote('confirmIntake')
  async confirmIntake(request: BafWorkflowChangeRequest): Promise<WorkflowTabView> {
    const { store } = await this.contextFor(request.sessionId)
    await this.guardDomain(() => confirmIntake(store, request.changeId, 'user'))
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
   * User-facing advancement button (§22 user-request 2026-09-20).
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
   * @param request - session + change.
   * @returns updated tab view.
   */
  @Remote('advance')
  async advance(request: BafWorkflowChangeRequest): Promise<WorkflowTabView> {
    const { cwd, store } = await this.contextFor(request.sessionId)
    const adapters = this.resolveAdapters(request.sessionId, cwd)
    const agent = this.liveAgentFor(request.sessionId)
    // §22.17 popup channel + §18.4.2 work-order channel — the same pair the
    // typed `/baf-go` builds (commands.ts). The click is a customer action, so
    // the dispatcher carries the customer-origin marker.
    const ask = makeGateAsk(this.ctx, agent)
    const dispatch = makeGoDispatcher(cwd, agent as DispatchAgent | undefined)
    const result = await this.guardDomain(() => driveGo({
      cwd,
      rawInput: `change=${request.changeId}`,
      source: 'tab',
      adapters,
      ...(ask === undefined ? { confirm: true } : { ask }),
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
          // T14: archive writes `change-archived`; the projection fold
          // sets `current=completed`. driveArchive carries the confirm
          // positional; the host-stamped `source='tab'` satisfies the
          // confirm-edge source guard (§22.15 B).
          return driveArchive(cwd, `confirm ${rawInput}`, source)
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
    const { store } = await this.contextFor(request.sessionId)
    return await buildWorkflowDashboard(store)
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
