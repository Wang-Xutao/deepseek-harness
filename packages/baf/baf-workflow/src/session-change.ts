/**
 * Session→change binding (用户问题 7, 2026-09-28) — "which change did *this*
 * conversation drive".
 *
 * 【变更】2026-09-28: the workflow Tab used to focus the workspace's ranked
 * active change (pickActiveChange fallback), so two sessions on one workspace
 * both saw the SAME graph — demo-21's 重构ecum and 增加ECUM用法Demo sessions
 * each opened the Tab and got the other change's flow. The projection is
 * deliberately cwd-shared (§18.6.6), so the per-conversation view needs its
 * own binding, written whenever a session actually drives a change (intake
 * mint, gate ask/resolve through that session) and consulted by the Tab view
 * read before the workspace fallback.
 *
 * Like session-focus (§18.6) this is conversation state that never reaches
 * the projection log: process-local, anchored on the shared host map so the
 * write side (gate-ask tool inside a session) and the read side (the Tab
 * view service) see one instance across tsdown bundle copies.
 *
 * @module @deepseek-ai/dsh-baf-workflow/session-change
 */

import { sharedHostMap } from './host-memory.ts'

/** One entry per (workspace root, session id); the change that session drove. */
const changeBySession = sharedHostMap<string>('session-change/by-session')

const keyOf = (cwd: string, sessionId: string): string => `${cwd}\u0000${sessionId}`

/**
 * Remember that a session drove a change.
 * @param cwd - absolute workspace root.
 * @param sessionId - the driving session's id.
 * @param changeId - the change it drove.
 */
export function bindSessionChange(cwd: string, sessionId: string, changeId: string): void {
  changeBySession.set(keyOf(cwd, sessionId), changeId)
}

/**
 * The change a session drove, when known.
 * @param cwd - absolute workspace root.
 * @param sessionId - the session to look up.
 * @returns the bound change id, or undefined when the session never drove one.
 */
export function sessionChangeFor(cwd: string, sessionId: string): string | undefined {
  return changeBySession.get(keyOf(cwd, sessionId))
}

/** Structural cold-read shape {@link deriveSessionChangeFromEvents} understands. */
export interface SessionChangeEventLike {
  readonly type: string
  readonly data?: unknown
}

/**
 * Which change a session's own durable log says it drove (用户问题 7 follow-up).
 *
 * 【变更】2026-09-28: the live binding is process-local — after a restart, the
 * demo-21 acceptance repro (open two OLD sessions, each workflow Tab shows the
 * workspace-ranked graph) regressed to "both show the same change". The cold
 * log carries the same fact, so the Tab read derives the binding once from it:
 * the LAST event-ordered mention wins, mirroring how a later gate ask rebinds
 * a live session. Recognized mentions, strongest first:
 * 1. `user/message` with the `baf-workflow`/`go-dispatch` source (every
 *    /baf-go work order names its change);
 * 2. `baf/route-resolved` audit events (every routed phase turn);
 * 3. `assistant/message` tool-call blocks for `baf_gate_ask` (the dialog tool
 *    names the change in its raw-JSON arguments).
 * A session with none of these never drove a change — undefined keeps the
 * workspace-ranked fallback, which is the honest answer for chat sessions.
 * @param events - cold session events, in log order.
 * @returns the derived change id, or undefined when the log mentions none.
 */
export function deriveSessionChangeFromEvents(events: Iterable<SessionChangeEventLike>): string | undefined {
  let derived: string | undefined
  for (const event of events) {
    const changeId = changeIdOfEvent(event)
    if (changeId !== undefined) derived = changeId
  }
  return derived
}

function changeIdOfEvent(event: SessionChangeEventLike): string | undefined {
  if (event.type === 'user/message') {
    const source = struct(event.data).at('source') as { kind?: unknown; form?: unknown; changeId?: unknown } | undefined
    if (source !== undefined && source.kind === 'baf-workflow' && source.form === 'go-dispatch'
      && typeof source.changeId === 'string') {
      return source.changeId
    }
    return undefined
  }
  if (event.type === 'baf/route-resolved') {
    const changeId = struct(event.data).at('changeId')
    return typeof changeId === 'string' ? changeId : undefined
  }
  if (event.type === 'assistant/message') {
    const content = struct(event.data).at('content')
    if (!Array.isArray(content)) return undefined
    let found: string | undefined
    for (const block of content) {
      const call = struct(block)
      if (call.at('type') !== 'tool-call' || call.at('name') !== 'baf_gate_ask') continue
      const args = call.at('arguments')
      if (typeof args !== 'string') continue
      try {
        const changeId = struct(JSON.parse(args)).at('changeId')
        if (typeof changeId === 'string') found = changeId
      } catch {
        // raw arguments are model output — malformed JSON mentions nothing
      }
    }
    return found
  }
  return undefined
}

/** Narrow `unknown` to an indexable record without trusting its shape. */
function struct(value: unknown): { at(key: string): unknown } {
  return {
    at(key: string): unknown {
      if (typeof value !== 'object' || value === null) return undefined
      return (value as Record<string, unknown>)[key]
    },
  }
}

/** Forget every binding. Test seam only — a running host never calls this. */
export function resetSessionChangeCache(): void {
  changeBySession.clear()
}
