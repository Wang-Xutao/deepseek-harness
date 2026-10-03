/**
 * Session-home cache (demo31 问题 1, 2026-10-02) — "which conversation is the
 * customer's HOME for this workspace's workflow".
 *
 * The incident: after the first classify confirm, every gate card and work
 * order landed in whichever session last ended a turn on the cwd — the work
 * order session — so the customer's original conversation went silent and
 * the decisions drifted with the work (the demo31 walk twice misread this as
 * "the page froze"). The fix is a sticky home: one session per workspace,
 * re-anchored only by genuine customer actions (a typed BAF slash, an
 * answered gate pop, the auto-pop 开始 click), and preferred by the
 * orchestrator's pops and dispatches over the session that merely happened
 * to end a turn.
 *
 * Like {@link ./session-focus} this is conversation state that never reaches
 * the projection log: process-local, anchored on the shared host map so the
 * write sides (commands, auto-pop, the orchestrator row) and the read side
 * (the same orchestrator, in any bundle copy) see one instance. The inverse
 * mapping (session → change, for the Tab view) lives in
 * {@link ./session-change}.
 *
 * @module @deepseek-ai/dsh-baf-workflow/session-home
 */

import { sharedHostMap } from './host-memory.ts'

/** The home session of one workspace, as consumed by the orchestrator. */
export interface HomeStore {
  /**
   * Currently recorded home session id.
   * @returns session id, or undefined when no customer action anchored one.
   */
  get(): string | undefined
  /**
   * Bind (or re-anchor, with undefined) the home session. Last customer
   * action wins — that is the semantics, not a race.
   * @param sessionId - the session the customer acted in.
   */
  set(sessionId: string | undefined): void
  /**
   * Drop the binding (terminal transitions — the workflow the home was
   * about has ended; the next change re-anchors on its own actions).
   */
  clear(): void
}

/** One entry per workspace root; anchored on globalThis across bundle copies. */
const homeByCwd = sharedHostMap<string>('session-home/by-cwd')

/**
 * The home cache for one workspace.
 * @param cwd - absolute workspace root.
 * @returns a store scoped to that root.
 */
export function homeSessionFor(cwd: string): HomeStore {
  return {
    get: () => homeByCwd.get(cwd),
    set: (sessionId) => {
      if (sessionId === undefined) homeByCwd.delete(cwd)
      else homeByCwd.set(cwd, sessionId)
    },
    clear: () => {
      homeByCwd.delete(cwd)
    },
  }
}

/**
 * Forget every binding. Test seam only — a running host never calls this.
 */
export function resetHomeSessionCache(): void {
  homeByCwd.clear()
}
