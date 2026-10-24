/**
 * 多模型路由 auto 模型 — the host-realm `bafRouteAuto` runtime.
 *
 * 2026-10-05 批次 (customer points 4+5): tier routing only drives a session
 * whose model selection is the pseudo `baf-route/auto` entry the catalog
 * offers WHILE routing is enabled (没有使能则没有 auto). Sessions on any
 * other selection run on exactly that model — the dispatch hook (see
 * `route-dispatch.ts`) gates on the RAW selection and pins nothing.
 *
 * This service owns everything auto needs on the host plane:
 * - {@link BafRouteAutoRuntime.pinForNextRequest}: the one-shot map the
 *   dispatch hook fills at `/baf-go` time; the next request for that session
 *   runs on the pinned tier model whatever the keyword scan would say.
 * - the per-session LAST USER TEXT cache, fed from `session/event`
 *   user-origin messages; the fallback path (a plain chat turn with no
 *   dispatch pin) scans it against the effective keyword rules — user rules
 *   first, builtin packs after — and defaults to Worker (`low`): 日常编程使用
 *   Worker，只有触发了关键词才会进行升级.
 * - {@link BafRouteAutoRuntime.catalogGroups}: the auto catalog group the
 *   session controller prepends to the model catalog while routing is active.
 *
 * Mounted by the ui-settings-baf-route host entry (it owns the config file),
 * so sibling host services (session controller) reach it through the scope
 * chain. Config is re-read on every resolution — a settings save applies to
 * the very next turn.
 * @module @deepseek-ai/dsh-baf-workflow/route-auto
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-session' // Context 'session/event' augmentation
import type { Session } from '@deepseek-ai/dsh-session'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm/brand'
import {
  isTierRoutingActive,
  resolveTaskTier,
  type RouteTier,
  type RouteTierConfig,
} from '@deepseek-ai/dsh-baf-core'
import { effectiveRouteKeywordRules, readRouteTierConfigSync } from './route-config-io.ts'

/** Pseudo provider id of the auto entry (the catalog group id). */
export const AUTO_PROVIDER = 'baf-route'

/** Pseudo model id of the auto entry. */
export const AUTO_MODEL = 'auto'

/**
 * The model selection handed back to the session controller. Structural
 * (not the agent package's `ModelSelection`): consumers stay dependency-free.
 */
export interface RouteAutoSelection {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

/** Catalog group shape (structural subset of the session catalog's group). */
export interface RouteAutoCatalogGroup {
  readonly id: string
  readonly name: string
  readonly models: readonly { readonly id: string; readonly name: string }[]
}

/**
 * Structural view of one step's route: the provider route the agent loop
 * read, plus the optional adapter-owned reasoning effort.
 */
export interface StepRouteLike {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

/** The single catalog entry routing injects while active. */
const AUTO_GROUP: RouteAutoCatalogGroup = {
  id: AUTO_PROVIDER,
  name: '多模型路由',
  models: [{ id: AUTO_MODEL, name: 'Auto' }],
}

/** Structural view of one user/message event payload. */
interface UserMessageLike {
  readonly source?: { readonly kind?: string }
  readonly content?: readonly { readonly type?: string; readonly text?: string }[]
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** 多模型路由 auto runtime (host realm, mounted with the route settings entry). */
    bafRouteAuto: BafRouteAutoRuntime
  }
}

/**
 * Host-realm runtime for the `baf-route/auto` pseudo model: dispatch pins,
 * per-session last-user-text cache, keyword fallback resolution, and the
 * active-gated auto catalog group.
 */
export class BafRouteAutoRuntime extends Service {
  static Config = z.object({})

  /** sessionId → the dispatch-pinned selection, consumed by the next request. */
  private readonly pins = new Map<string, RouteAutoSelection>()
  /** sessionId → last user-origin message text (keyword scan haystack). */
  private readonly lastUserText = new Map<string, string>()

  constructor(ctx: Context, _config: Record<string, never>) {
    super(ctx, 'bafRouteAuto')
    // The agent loop reads a step's route before every step; this runtime is
    // the resolver that maps the auto pseudo pair to that step's tier route.
    ctx.effect(() => ctx.provide('stepRouteResolver', this), 'bafRouteAuto.stepRouteResolver')
    ctx.on('session/event', (session, event) => {
      if (event.type !== 'user/message') return
      const data = (event.data ?? {}) as UserMessageLike
      // User-origin only: tool results and subagent echoes carry other kinds
      // and must never steer the keyword scan.
      if (data.source?.kind !== 'user') return
      const text = (data.content ?? [])
        .filter(part => part?.type === 'text' && typeof part.text === 'string')
        .map(part => part.text)
        .join(' ')
      this.lastUserText.set(String(session.header.id), text)
    })
  }

  /** Whether a model selection IS the auto pseudo entry (shape only — no I/O). */
  accepts(provider: string, model: string): boolean {
    return provider === AUTO_PROVIDER && model === AUTO_MODEL
  }

  /**
   * Record the dispatch-decided selection for the session's NEXT request
   * (one-shot: `resolveAuto` consumes it).
   * @param sessionId - the addressed session's id.
   * @param selection - the tier model the dispatch routed to.
   */
  pinForNextRequest(sessionId: string, selection: RouteAutoSelection): void {
    this.pins.set(sessionId, selection)
  }

  /**
   * Resolve an auto selection to a concrete tier model. Precedence: the
   * dispatch pin (one-shot) → keyword scan of the session's last user message
   * → Worker (`low`). Undefined means "routing cannot act" (selection is not
   * auto, or the config is gone/disabled since the pick) and the caller falls
   * back to the session's durable header / the deployment default.
   * @param sessionId - the addressed session's id.
   * @param raw - the raw model selection to resolve.
   */
  resolveAuto(sessionId: string, raw: { readonly provider: string; readonly model: string }): RouteAutoSelection | undefined {
    if (!this.accepts(raw.provider, raw.model)) return undefined
    const pinned = this.pins.get(sessionId)
    if (pinned !== undefined) {
      this.pins.delete(sessionId)
      return pinned
    }
    // Re-read per resolution: a save in the settings UI applies to the next turn.
    const config = readRouteTierConfigSync()
    if (config === undefined || !isTierRoutingActive(config)) return undefined
    const hit = resolveTaskTier(this.lastUserText.get(sessionId) ?? '', effectiveRouteKeywordRules(config))
    return selectionOfTier(config, hit?.tier ?? 'low')
  }

  /**
   * The auto catalog groups to PREPEND to the model catalog — empty (auto not
   * offered anywhere) while routing is inactive.
   */
  catalogGroups(): readonly RouteAutoCatalogGroup[] {
    const config = readRouteTierConfigSync()
    if (config === undefined || !isTierRoutingActive(config)) return []
    return [AUTO_GROUP]
  }

  /**
   * Resolve one step's route for the agent loop.
   *
   * The `baf-route/auto` pseudo pair is not a provider route: the loop reads
   * the recorded selection before every step, and this runtime maps the pseudo
   * pair to the tier route that step runs on. A session on any other selection
   * runs on exactly that selection.
   * @param session - the Session the step belongs to.
   * @param route - the recorded route the step would otherwise use.
   * @returns the route the step runs on.
   */
  resolveStepRoute(session: Session, route: StepRouteLike): StepRouteLike {
    if (!this.accepts(route.provider, route.model)) return route
    const resolved = this.resolveAuto(String(session.header.id), route)
    if (resolved !== undefined) {
      // The runtime's effort is a config-file string; brand it at this
      // boundary the way request-header assembly does.
      return {
        provider: resolved.provider,
        model: resolved.model,
        ...(resolved.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: ReasoningEffortId(resolved.reasoningEffort) }),
      }
    }
    // Routing went away after the pick (没有使能则没有 auto): fall through to
    // the route the last request used, then to the deployment default — the
    // pseudo pair must never reach a provider.
    return this.fallbackRoute(session)
  }

  /**
   * The route a session falls back to when its auto pick cannot be resolved:
   * the route its last request used, else the deployment default.
   * @param session - the Session the step belongs to.
   * @returns the concrete route the step runs on.
   */
  private fallbackRoute(session: Session): StepRouteLike {
    const header = session.requestHeader()
    const logged = header?.config
    if (logged !== undefined) {
      // An effort the adapter defaulted is not a conversation choice: restoring
      // it as one would make an unchanged default read as a request change.
      return {
        provider: logged.provider,
        model: logged.model,
        ...(logged.reasoningEffort === undefined || header?.adapterDefaults?.reasoningEffort === true
          ? {}
          : { reasoningEffort: logged.reasoningEffort }),
      }
    }
    const defaults = this.ctx.get('agentDefaultModel') as { currentSelection(): StepRouteLike } | undefined
    const fallback = defaults?.currentSelection()
    if (fallback === undefined) {
      throw new Error('baf-route/auto: no route to fall back to — the deployment has no default model')
    }
    return {
      provider: fallback.provider,
      model: fallback.model,
      ...(fallback.reasoningEffort === undefined ? {} : { reasoningEffort: fallback.reasoningEffort }),
    }
  }
}

/** Build the selection for one tier (reasoningEffort only when configured). */
function selectionOfTier(config: RouteTierConfig, tier: RouteTier): RouteAutoSelection {
  const spec = config.tiers[tier]
  return {
    provider: spec.provider,
    model: spec.model,
    ...(spec.reasoningEffort === undefined ? {} : { reasoningEffort: spec.reasoningEffort }),
  }
}
