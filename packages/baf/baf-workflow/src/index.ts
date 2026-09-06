/**
 * BAF workflow Cordis service (Phase 3: route resolve + audit; Phase 4+: projection).
 *
 * Agent Note:
 * - .agents/notes/implemented/feature/2026-09-06-baf-workflow-phase3-route.md
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
  type ModelRef,
  type ProviderAvailability,
  type RouteProfile,
  type RouteResolution,
  type RouteStatusView,
  type WorkflowNode,
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

export * from './route.ts'
export * from './route-audit.ts'
export * from './phase-route.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** BAF workflow domain service (entry-local realm under bafDomain isolate). */
    bafWorkflow: BafWorkflow
  }
}

/** Composition config for {@link BafWorkflow} (no tunables in Phase 3). */
export interface Config {}

/**
 * Owns frozen enterprise/profile route state and resolve+audit helpers.
 * Projection / transitions arrive in Phase 4.
 */
export class BafWorkflow extends Service {
  static Config: z<Config> = z.object({})

  private enterprisePolicy: EnterpriseRoutePolicy | undefined
  private routeProfile: RouteProfile | undefined
  private dshDefault: ModelRef | undefined
  private lastByPhase: Partial<Record<WorkflowNode, RouteResolution>> = {}

  constructor(ctx: Context, _config: Config) {
    super(ctx, 'bafWorkflow')
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
   * Load enterprise policy from {@link Config.enterpriseRoutePolicyPath} then freeze with profile.
   * @param profile - baseline route profile.
   * @param path - override path; defaults to config path.
   * @param dshDefault - optional catalog default.
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
      { dshDefault: this.dshDefault },
    )
    this.lastByPhase[phase] = resolution
    return resolution
  }

  /**
   * Resolve, append `baf/route-resolved`, and return the resolution.
   * On failure, still appends a failed audit entry then rethrows.
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
          changeId,
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
          changeId,
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
   * Map resolution to agent ModelSelection (Phase 3.2 primary path).
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
    return 'BAF workflow: resolveRoute + route audit (Phase 3). Projection/transitions in Phase 4.'
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
}

export type { RouteAuditEntry }
export default BafWorkflow
