/**
 * The PAUSE flag — a customer-held brake on one change's workflow.
 *
 * 【变更】2026-10-27 (批次三十 · 用户问题 6): the 工作流图 gained a 暂停/继续
 * button. Pausing must mean what it says: the workflow stops POPPING its
 * confirm gates and stops DISPATCHING work orders for that change, until the
 * customer presses 继续 again.
 *
 * Why it lives in host memory and not in the projection: the projection is the
 * change's HISTORY (what happened); the pause is a present-tense operator
 * control that must survive a host restart without becoming part of the
 * audited trail. The same `sharedHostMap` the dispatch ledger and the session
 * focus use — one instance per bundle copy, so the flag is seen by every copy
 * of the plugin inside the process.
 *
 * The flag is scoped per (workspace, change): two changes in one workspace are
 * two independent workflows, and the graph the customer is looking at shows
 * exactly one of them.
 *
 * @module @deepseek-ai/dsh-baf-workflow/pause
 */

import { sharedHostMap } from './host-memory.ts'

/**
 * The paused changes, keyed `${cwd}|${changeId}` — one process-shared map, the
 * same anchor the dispatch ledger uses.
 */
const PAUSED = sharedHostMap<boolean>('baf-workflow/paused')

/**
 * The ledger key of one paused change.
 * @param cwd - the workspace root.
 * @param changeId - the change id.
 * @returns the key.
 */
function pauseKey(cwd: string, changeId: string): string {
  return `${cwd}|${changeId}`
}

/**
 * Whether one change's workflow is paused.
 *
 * A paused change pops NO gate and receives NO work order. The orchestrator
 * reads this before every pop / dispatch, so the brake holds even when the
 * turn was triggered by something other than the customer.
 * @param cwd - the workspace root.
 * @param changeId - the change id.
 * @returns true when the change is paused.
 */
export function isChangePaused(cwd: string, changeId: string): boolean {
  return PAUSED.get(pauseKey(cwd, changeId)) === true
}

/**
 * Pause or resume one change's workflow.
 * @param cwd - the workspace root.
 * @param changeId - the change id.
 * @param paused - true to pause, false to resume.
 * @returns the change's new state.
 */
export function setChangePaused(cwd: string, changeId: string, paused: boolean): boolean {
  const key = pauseKey(cwd, changeId)
  if (paused) {
    PAUSED.set(key, true)
  } else {
    PAUSED.delete(key)
  }
  return paused
}

/**
 * Drop the pause flag of every change in one workspace — the cleanup a
 * finished (or abandoned) change gets, so a later change with the same id
 * never inherits a stale brake.
 * @param cwd - the workspace root.
 * @returns nothing.
 */
export function clearPausedChanges(cwd: string): void {
  const prefix = `${cwd}|`
  for (const key of PAUSED.keys()) {
    if (key.startsWith(prefix)) PAUSED.delete(key)
  }
}
