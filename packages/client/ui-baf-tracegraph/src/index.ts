/**
 * Host half for the baf 轨迹图 view. This entry stays mounted for desktop
 * compositions but registers nothing itself: the 轨迹图 toggle is a
 * device-local browser preference persisted in localStorage by the client
 * half (see ./workflow-settings.ts), so no host settings namespace is
 * involved.
 */

import type { Context } from '@deepseek-ai/cordis'

export { DEFAULT_SHOW_TRACE_GRAPH, type BafWorkflowSettings } from './workflow-settings.ts'

/**
 * No-op Host apply.
 * @param _ctx - Host context (unused).
 */
export function apply(_ctx: Context): void {}
