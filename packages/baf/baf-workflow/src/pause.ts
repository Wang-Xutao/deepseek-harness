/**
 * The PAUSE flag — a customer-held brake on one change's workflow.
 *
 * 【变更】2026-10-27 (批次三十 · 用户问题 6): the 工作流图 gained a 暂停/继续
 * button. Pausing must mean what it says: the workflow stops POPPING its
 * confirm gates and stops DISPATCHING work orders for that change, until the
 * customer presses 继续 again.
 *
 * 【变更】2026-10-28 (批次三十三 · 用户问题 2): 暂停 also CUTS the model's
 * turn. The brake stopped the workflow but left the model running, so the
 * conversation kept going while the graph said the change was paused — two
 * truths on one screen. 继续 now hands the work back to the model the way the
 * customer asked: the interrupted turn resumes on the word 「继续」.
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

import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import { sharedHostMap } from './host-memory.ts'

/**
 * One paused change's state.
 */
export interface PauseState {
  /**
   * Whether the pause CUT a running model turn.
   *
   * It decides what 继续 does: a cut turn is resumed by handing the model the
   * word 「继续」 (it picks up where the interruption left it), while a pause
   * that caught the model idle has nothing to resume — the outstanding gap
   * goes back the way `/baf-go` sends it.
   */
  readonly interrupted: boolean
}

/**
 * The paused changes, keyed `${cwd}|${changeId}` — one process-shared map, the
 * same anchor the dispatch ledger uses.
 */
const PAUSED = sharedHostMap<PauseState>('baf-workflow/paused')

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
  return PAUSED.has(pauseKey(cwd, changeId))
}

/**
 * Whether the pause cut a running model turn — the flag 继续 reads before it
 * releases the brake.
 * @param cwd - the workspace root.
 * @param changeId - the change id.
 * @returns true when the paused change's turn was interrupted.
 */
export function wasChangeInterrupted(cwd: string, changeId: string): boolean {
  return PAUSED.get(pauseKey(cwd, changeId))?.interrupted === true
}

/**
 * Pause or resume one change's workflow.
 * @param cwd - the workspace root.
 * @param changeId - the change id.
 * @param paused - true to pause, false to resume.
 * @param options - whether this pause cut a running model turn.
 * @returns the change's new state.
 */
export function setChangePaused(
  cwd: string,
  changeId: string,
  paused: boolean,
  options: { readonly interrupted?: boolean } = {},
): boolean {
  const key = pauseKey(cwd, changeId)
  if (paused) {
    PAUSED.set(key, { interrupted: options.interrupted === true })
  } else {
    PAUSED.delete(key)
  }
  return paused
}

/**
 * The instruction the 继续 button hands the model.
 *
 * It is the customer's own word, and it is the model's only cue: the model
 * resumes the turn the pause cut, and the conversation above it says what
 * that turn was doing.
 */
export const RESUME_INSTRUCTION = '继续'

/**
 * Build the resume instruction as the durable message a session receives.
 *
 * Never `kind: 'user'`: the `baf-workflow` producer source is what makes the
 * client render it read-only — it is the workflow speaking for the customer,
 * not the customer typing.
 * @returns the resume message.
 */
export function resumeMessage(): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text: RESUME_INSTRUCTION }],
    source: {
      kind: 'baf-workflow',
      form: 'notice',
      summary: RESUME_INSTRUCTION,
    },
  })
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
