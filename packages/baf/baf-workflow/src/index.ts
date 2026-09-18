/**
 * BAF workflow Cordis services.
 *
 * - {@link BafWorkflow}: agent-isolate domain (route + projection helpers).
 * - Host Tab Remote lives in `@deepseek-ai/dsh-client-ui-baf-workflow`.
 *
 * Agent Note:
 * - .agents/notes/implemented/feature/2026-09-06-baf-workflow-phase3-route.md
 * - .agents/notes/implemented/feature/2026-09-07-baf-workflow-phase4-projection-tab.md
 *
 * @module @deepseek-ai/dsh-baf-workflow
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  BafError,
  buildRouteStatusView,
  loadEnterpriseRoutePolicyFile,
  type EnterpriseRoutePolicy,
  type GuardPolicy,
  type ModelRef,
  type ProviderAvailability,
  type RouteProfile,
  type RouteResolution,
  type RouteStatusView,
  type StackAdapter,
  type WorkflowNode,
  type WorkflowService,
} from '@deepseek-ai/dsh-baf-core'
import type { Session } from '@deepseek-ai/dsh-session'
import { resolveRoute } from './route.ts'
import {
  appendRouteResolved,
  routeAuditFromFailure,
  routeAuditFromResolution,
  type RouteAuditEntry,
} from './route-audit.ts'
import { toModelSelection, toWorkflowAgentOptions } from './phase-route.ts'
import { ProjectionStore } from './projection.ts'
import { createWorkflowService, confirmIntake, rejectIntake } from './workflow-service.ts'
import { StagePipeline } from './stages/pipeline.ts'
import type { BaselineManifest } from '@deepseek-ai/dsh-baf-core'

export * from './route.ts'
export * from './route-audit.ts'
export * from './phase-route.ts'
export * from './projection.ts'
export * from './transition.ts'
export * from './intake.ts'
export * from './workflow-service.ts'
export * from './tab-view.ts'
export * from './lanes.ts'
export * from './metrics.ts'
export * from './stages/context.ts'
export * from './stages/artifacts.ts'
export * from './stages/gates.ts'
export * from './stages/check-runner.ts'
export * from './stages/write.ts'
export * from './stages/open.ts'
export * from './stages/clarify.ts'
export * from './stages/design.ts'
export * from './stages/plan.ts'
export * from './stages/implement.ts'
export * from './stages/fastpath.ts'
export * from './stages/escalate.ts'
export * from './stages/verify.ts'
export * from './stages/archive.ts'
export * from './stages/drift.ts'
export * from './stages/abandon.ts'
export * from './stages/pipeline.ts'
export * from './pipeline-factory.ts'
export * from './gate-cards.ts'
/**
 * Host-facing re-exports of selected drives and adapter contracts. Only
 * those entries the Tab Remote (or other host-plane consumers outside the
 * `commands`/`cmdline` packages) legitimately need are surfaced here; the
 * full `command-drives` module is package-private to slash / CLI wiring.
 */
export {
  driveGateResolve,
  driveScaffold,
  type DriveAdapters,
} from './command-drives.ts'
export { isActiveChange } from './projection.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** BAF workflow domain service (entry-local realm under bafDomain isolate). */
    bafWorkflow: BafWorkflow
  }
}

/** Composition config for {@link BafWorkflow}. */
export interface Config {}

/**
 * Owns frozen enterprise/profile route state, resolve+audit helpers, and a
 * file-backed {@link WorkflowService} when a workspace root is known.
 *
 * Agent Note:
 * - .agents/notes/implemented/feature/2026-09-06-baf-workflow-phase3-route.md
 * - .agents/notes/implemented/feature/2026-09-07-baf-workflow-phase4-projection-tab.md
 */
export class BafWorkflow extends Service {
  static Config: z<Config> = z.object({})

  private enterprisePolicy: EnterpriseRoutePolicy | undefined
  private routeProfile: RouteProfile | undefined
  private dshDefault: ModelRef | undefined
  private lastByPhase: Partial<Record<WorkflowNode, RouteResolution>> = {}
  private store: ProjectionStore | undefined
  private workflow: WorkflowService | undefined

  constructor(ctx: Context, _config: Config) {
    super(ctx, 'bafWorkflow')
  }

  /**
   * Bind (or rebind) the projection store to a workspace root.
   * @param workspaceRoot - absolute workspace path.
   */
  bindWorkspace(workspaceRoot: string): void {
    this.store = new ProjectionStore({ workspaceRoot })
    this.workflow = createWorkflowService({ store: this.store })
  }

  /**
   * Stage pipeline bound to the current workspace (Phase 5 full-go chain).
   * @param options - optional git revision, baseline, and Phase 7 adapters
   * (stack/guard) for the chain.
   * @returns pipeline, or throws when no workspace is bound.
   */
  stagePipeline(options: {
    readonly gitRevision?: string
    readonly baseline?: BaselineManifest
    readonly stack?: StackAdapter
    readonly guard?: GuardPolicy
  } = {}): StagePipeline {
    const store = this.requireStore()
    return new StagePipeline({
      store,
      workspaceRoot: store.workspaceRoot(),
      ...options,
    })
  }

  /**
   * File-backed workflow service, or undefined when no workspace is bound.
   * @returns service.
   */
  workflowService(): WorkflowService | undefined {
    return this.workflow
  }

  /**
   * Projection store, or undefined when no workspace is bound.
   * @returns store.
   */
  projectionStore(): ProjectionStore | undefined {
    return this.store
  }

  /**
   * Confirm pending intake for a change.
   * @param changeId - change id.
   * @returns updated status.
   */
  async confirmIntake(changeId: string) {
    const store = this.requireStore()
    return confirmIntake(store, changeId, 'user')
  }

  /**
   * Reject pending intake for a change.
   * @param changeId - change id.
   * @returns updated status.
   */
  async rejectIntake(changeId: string) {
    const store = this.requireStore()
    return rejectIntake(store, changeId)
  }

  /**
   * Freeze enterprise policy, baseline profile, and optional dsh default for this session realm.
   * @param policy - enterprise ceiling.
   * @param profile - baseline route profile.
   * @param dshDefault - optional catalog default.
   */
  freezeRouteContext(
    policy: EnterpriseRoutePolicy,
    profile: RouteProfile,
    dshDefault?: ModelRef,
  ): void {
    this.enterprisePolicy = policy
    this.routeProfile = profile
    this.dshDefault = dshDefault
    this.lastByPhase = {}
  }

  /**
   * Load enterprise policy from a file then freeze with profile.
   * @param profile - baseline route profile.
   * @param path - policy file path.
   * @param dshDefault - optional catalog default.
   * @returns loaded policy.
   */
  async freezeFromPolicyFile(
    profile: RouteProfile,
    path: string,
    dshDefault?: ModelRef,
  ): Promise<EnterpriseRoutePolicy> {
    const policy = await loadEnterpriseRoutePolicyFile(path)
    this.freezeRouteContext(policy, profile, dshDefault)
    return policy
  }

  /**
   * Resolve the route for a phase turn using the frozen context.
   * @param phase - workflow node.
   * @param availability - catalog probe.
   * @param sessionOverride - optional override.
   * @returns resolution.
   */
  resolve(
    phase: WorkflowNode,
    availability: ProviderAvailability,
    sessionOverride?: ModelRef,
  ): RouteResolution {
    const { policy, profile } = this.requireFrozen()
    const resolution = resolveRoute(
      policy,
      profile,
      phase,
      sessionOverride,
      availability,
      this.dshDefault === undefined ? {} : { dshDefault: this.dshDefault },
    )
    this.lastByPhase[phase] = resolution
    return resolution
  }

  /**
   * Resolve, append `baf/route-resolved`, and return the resolution.
   * @param session - session log writer.
   * @param phase - workflow node.
   * @param availability - catalog probe.
   * @param sessionOverride - optional override.
   * @param changeId - optional active change id.
   * @returns resolution.
   */
  resolveAndAudit(
    session: Session,
    phase: WorkflowNode,
    availability: ProviderAvailability,
    sessionOverride?: ModelRef,
    changeId?: string,
  ): RouteResolution {
    const { policy } = this.requireFrozen()
    try {
      const resolution = this.resolve(phase, availability, sessionOverride)
      appendRouteResolved(
        session,
        routeAuditFromResolution({
          resolution,
          sessionId: String(session.id),
          ...(changeId === undefined ? {} : { changeId }),
        }),
      )
      return resolution
    } catch (error) {
      const attempted = sessionOverride ?? policy.default
      const failureReason = error instanceof BafError
        ? `${error.code}: ${error.message}`
        : error instanceof Error ? error.message : String(error)
      appendRouteResolved(
        session,
        routeAuditFromFailure({
          provider: attempted.provider,
          model: attempted.model,
          phase,
          sessionId: String(session.id),
          failureReason,
          ...(changeId === undefined ? {} : { changeId }),
        }),
      )
      throw error
    }
  }

  /**
   * Status view for settings / Tab / CLI.
   * @returns route status, or throws when not frozen.
   */
  routeStatus(): RouteStatusView {
    const { policy, profile } = this.requireFrozen()
    return buildRouteStatusView(policy, profile, this.lastByPhase)
  }

  /**
   * Last successful resolution for a phase, if any.
   * @param phase - workflow node.
   * @returns resolution or undefined.
   */
  lastResolution(phase: WorkflowNode): RouteResolution | undefined {
    return this.lastByPhase[phase]
  }

  /**
   * Map resolution to agent ModelSelection.
   * @param resolution - resolveRoute result.
   * @returns model selection.
   */
  selectionForTurn(resolution: RouteResolution) {
    return toModelSelection(resolution)
  }

  /**
   * Map resolution to workflow worker agentOptions (fan-out only).
   * @param resolution - resolveRoute result.
   * @returns provider/model options.
   */
  workerAgentOptions(resolution: RouteResolution) {
    return toWorkflowAgentOptions(resolution)
  }

  /**
   * Help string for slash/CLI.
   * @returns summary.
   */
  help(): string {
    return 'BAF workflow: resolveRoute, projection, intake, transition, and WorkflowTabView Remote.'
  }

  private requireFrozen(): { policy: EnterpriseRoutePolicy; profile: RouteProfile } {
    if (this.enterprisePolicy === undefined || this.routeProfile === undefined) {
      throw new BafError('policy_missing', 'enterprise route context is not frozen', {
        field: 'EnterpriseRoutePolicy',
        consumer: 'BafWorkflow',
      })
    }
    return { policy: this.enterprisePolicy, profile: this.routeProfile }
  }

  private requireStore(): ProjectionStore {
    if (this.store === undefined) {
      throw new BafError('policy_missing', 'workspace root is not bound for projection', {
        field: 'workspaceRoot',
        consumer: 'BafWorkflow',
      })
    }
    return this.store
  }
}

export type { RouteAuditEntry }
export default BafWorkflow
