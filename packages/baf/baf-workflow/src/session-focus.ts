/**
 * Session focus cache (§18.6) — "which change is *this* conversation about".
 *
 * Deliberately **not** in the projection. The projection is cwd-bound and
 * shared: two sessions on one workspace must observe one durable history
 * (§18.6.6). Which of that history's changes a given conversation is driving is
 * conversation state, so it lives here and never reaches the log.
 *
 * The cache is process-local and keyed by workspace root rather than by session
 * id, because the BAF invariant is one *active* change per workspace: a second
 * session on the same cwd either adopts the same change or is refused by the
 * binding guard (§18.6.5). That keeps the map correct without threading a
 * session id through every drive, and it lets the non-isolated `baf-commands`
 * row and the isolate-local `bafWorkflow` service share one instance — a plain
 * module singleton is visible across Cordis realms in the same process.
 *
 * @module @deepseek-ai/dsh-baf-workflow/session-focus
 */

import { sharedHostMap } from './host-memory.ts'

/** A session's focused change, as consumed by the `baf-go` coordinator. */
export interface FocusStore {
  /**
   * Currently focused change id.
   * @returns change id, or undefined when the session is unbound.
   */
  get(): string | undefined
  /**
   * Bind (or clear, with undefined) the focused change.
   * @param changeId - change to focus.
   */
  set(changeId: string | undefined): void
  /**
   * Drop the binding.
   */
  clear(): void
}

/** One entry per workspace root; cleared with the focus or on terminal states.
 *
 * 【变更】2026-09-23 (demo2 re-test): anchored on globalThis (host-memory) —
 * the write side (beginIntake inside the auto-pop / gate-ask / Tab bundles)
 * and the read side (the commands bundle's coordinator) live in different
 * tsdown bundle copies of this module; a module-local Map split per copy and
 * the fallbacks masked it until the parked-requirement round made the split
 * visible (see host-memory.ts). */
const focusByCwd = sharedHostMap<string>('session-focus/by-cwd')

/**
 * The focus cache for one workspace.
 * @param cwd - absolute workspace root.
 * @returns a store scoped to that root.
 */
export function focusFor(cwd: string): FocusStore {
  return {
    get: () => focusByCwd.get(cwd),
    set: (changeId) => {
      if (changeId === undefined) focusByCwd.delete(cwd)
      else focusByCwd.set(cwd, changeId)
    },
    clear: () => {
      focusByCwd.delete(cwd)
    },
  }
}

/**
 * Forget every binding. Test seam only — a running host never calls this.
 */
export function resetFocusCache(): void {
  focusByCwd.clear()
}
