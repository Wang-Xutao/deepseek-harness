/**
 * Host Typert Remote for the BAF 工作流 Tab.
 * @module @deepseek-ai/dsh-client-ui-baf-workflow
 */

import { Context } from '@deepseek-ai/cordis'
import {
  BafError,
  isBafError,
  type GuardPolicy,
  type StackAdapter,
} from '@deepseek-ai/dsh-baf-core'
import {
  ProjectionStore,
  buildWorkflowTabView,
  confirmIntake,
  createWorkflowService,
  driveAbandon,
  driveArchive,
  driveClarify,
  driveClassify,
  driveDesign,
  driveGateResolve,
  driveImplement,
  drivePlan,
  driveVerify,
  pipelineFor,
  rejectIntake,
  resolveActiveChange,
  resolveIsolateService,
  resolveScaffoldService,
  type DriveAdapters,
  type ScaffoldAdapter,
} from '@deepseek-ai/dsh-baf-workflow'
import type { WorkflowTabResume, WorkflowTabView } from '@deepseek-ai/dsh-baf-core'
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
  BafWorkflowResumeRequest,
  BafWorkflowSessionRequest,
  BafWorkflowStartIntakeRequest,
  BafWorkflowTransitionRequest,
} from './types.ts'

/**
 * Host Remote: assembles {@link WorkflowTabView} and applies semi-interactive mutations.
 */
export class BafWorkflowTabRemote extends TypertRemoteService {
  static inject = ['sessions', 'sessionPersistence']

  constructor(ctx: Context) {
    super(ctx, 'bafWorkflowView')
  }

  /**
   * Read the Tab view for a session workspace.
   * @param request - session (+ optional change).
   * @returns tab view.
   */
  @Remote('getTabView')
  async getTabView(request: BafWorkflowSessionRequest): Promise<WorkflowTabView> {
    const { cwd, store } = await this.contextFor(request.sessionId)
    // Skip the full-log metrics fold on the interactive path so the Tab paints
    // quickly; the dual-lane view still comes through, it only needs the events.
    return buildWorkflowTabView(store, request.changeId, {
      includeMetrics: false,
      resume: this.resumeProvider(cwd),
    })
  }

  /**
   * Classify a new change (pending confirmation).
   * @param request - session + description.
   * @returns updated tab view focused on the new change.
   */
  @Remote('startIntake')
  async startIntake(request: BafWorkflowStartIntakeRequest): Promise<WorkflowTabView> {
    const { store } = await this.contextFor(request.sessionId)
    const service = createWorkflowService({ store })
    const cwd = await this.requireCwd(request.sessionId)
    const result = await this.guardDomain(() => service.intake({
      description: request.description,
      workspace: { root: cwd },
    }))
    return buildWorkflowTabView(store, result.intake.changeId)
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
    return buildWorkflowTabView(store, request.changeId)
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
    return buildWorkflowTabView(store, request.changeId)
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
          return driveClassify(cwd, `confirm ${rawInput}`, source)
        case 'intake':
          // Re-render the classification card (slash `/baf-workflow-classify`
          // with no positionals). Drives are idempotent here.
          return driveClassify(cwd, rawInput, source)
        case 'clarify':
          return driveClarify(cwd, rawInput, source)
        case 'design':
          return driveDesign(cwd, rawInput, source)
        case 'plan':
          return drivePlan(cwd, rawInput, source)
        case 'implement':
          return driveImplement(cwd, rawInput, source)
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
    return buildWorkflowTabView(store, request.changeId)
  }

  /**
   * Convert structured Tab evidence into a `key=value` rawInput string the
   * drive layer (`command-drives.ts`) already parses. Mirrors what
   * `parseArgs` expects: positional-and-key=value pairs joined by spaces;
   * arrays become repeated keys.
   */
  private evidenceToRawInput(changeId: string, evidence: Readonly<Record<string, unknown>>): string {
    const parts: string[] = [`change=${changeId}`]
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
    const options = { includeMetrics: false, resume: this.resumeProvider(cwd) }
    const target = request.node
    if (target === undefined) {
      return buildWorkflowTabView(store, request.changeId, options)
    }
    const pipeline = await pipelineFor(cwd)
    await this.guardDomain(() => pipeline.driveResumeStage(request.changeId, target, undefined, 'tab'))
    return buildWorkflowTabView(store, request.changeId, options)
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
        return buildWorkflowTabView(store, null)
      }
      const pipeline = await pipelineFor(cwd)
      const options = await pipeline.resumeOptions(resolvedChangeId)
      resumeCandidates = options.candidates
    }
    const scaffoldAdapter = this.tryGetScaffoldAdapter(request.sessionId)
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
        },
      ),
    )
    if (auditLines.length === 0) {
      this.ctx.logger.info(
        `[baf] ${new Date().toISOString()} - session baf:gate gateId=${request.gateId} option=${request.optionId} change=${request.changeId ?? '-'} source=gate-card action=dismissed`,
      )
    }
    return buildWorkflowTabView(store, resolvedChangeId)
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
    return { cwd, store: new ProjectionStore({ workspaceRoot: cwd }) }
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
