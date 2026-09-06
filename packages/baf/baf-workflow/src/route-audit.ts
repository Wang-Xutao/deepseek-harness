/**
 * Append typed `baf/route-resolved` session events for route audit.
 * @module @deepseek-ai/dsh-baf-workflow/route-audit
 */

import type { RouteResolution, WorkflowNode } from '@deepseek-ai/dsh-baf-core'
import type { Session } from '@deepseek-ai/dsh-session'

/**
 * Durable audit payload for one resolveRoute outcome (success or recorded failure).
 * Session log is authoritative; workspace `.baf/audit/route.jsonl` is optional derived index.
 */
export interface RouteAuditEntry {
  readonly provider: string
  readonly model: string
  readonly source: RouteResolution['source'] | 'failed'
  readonly phase: WorkflowNode
  readonly fallbackFrom?: {
    readonly provider: string
    readonly model: string
    readonly reason: string
  }
  readonly at: string
  readonly sessionId: string
  readonly changeId?: string
  readonly failureReason?: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * BAF route resolution identity for one phase turn.
     * Required to rebuild which provider/model served model-visible requests
     * under enterprise policy; not itself model-visible content.
     * @param provider Resolved or attempted provider id.
     * @param model Resolved or attempted model id.
     * @param source Resolution source, or `failed` when the turn was blocked.
     * @param phase Workflow node that requested the route.
     * @param fallbackFrom Prior preferred route when fallback engaged.
     * @param at ISO-8601 timestamp.
     * @param sessionId Owning session id string.
     * @param changeId Optional active change id.
     * @param failureReason Stable failure summary when source is `failed`.
     */
    'baf/route-resolved': RouteAuditEntry
  }
}

/** Inputs for building an audit entry from a successful resolution. */
export interface RouteAuditSuccessInput {
  readonly resolution: RouteResolution
  readonly sessionId: string
  readonly changeId?: string
  readonly at?: string
}

/** Inputs for building an audit entry when resolveRoute throws. */
export interface RouteAuditFailureInput {
  readonly provider: string
  readonly model: string
  readonly phase: WorkflowNode
  readonly sessionId: string
  readonly failureReason: string
  readonly changeId?: string
  readonly at?: string
}

/**
 * Build a success audit entry from a {@link RouteResolution}.
 * @param input - resolution and identity fields.
 * @returns audit payload.
 */
export function routeAuditFromResolution(input: RouteAuditSuccessInput): RouteAuditEntry {
  const { resolution } = input
  return {
    provider: resolution.provider,
    model: resolution.model,
    source: resolution.source,
    phase: resolution.phase,
    ...resolution.fallbackFrom === undefined ? {} : { fallbackFrom: resolution.fallbackFrom },
    at: input.at ?? new Date().toISOString(),
    sessionId: input.sessionId,
    ...input.changeId === undefined ? {} : { changeId: input.changeId },
  }
}

/**
 * Build a failure audit entry when routing blocks a phase turn.
 * @param input - attempted identity and reason.
 * @returns audit payload with `source: 'failed'`.
 */
export function routeAuditFromFailure(input: RouteAuditFailureInput): RouteAuditEntry {
  return {
    provider: input.provider,
    model: input.model,
    source: 'failed',
    phase: input.phase,
    at: input.at ?? new Date().toISOString(),
    sessionId: input.sessionId,
    failureReason: input.failureReason,
    ...input.changeId === undefined ? {} : { changeId: input.changeId },
  }
}

/**
 * Append a `baf/route-resolved` event to the session log.
 * @param session - owning session.
 * @param entry - audit payload.
 * @returns the appended event.
 */
export function appendRouteResolved(session: Session, entry: RouteAuditEntry): void {
  session.append('baf/route-resolved', entry)
}
