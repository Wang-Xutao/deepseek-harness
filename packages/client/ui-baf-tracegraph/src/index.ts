/**
 * Host half for the baf 轨迹图 view: registers the durable `baf-workflow`
 * settings namespace so the trace-graph visibility switch survives reloads.
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  BAF_WORKFLOW_SETTINGS_NAMESPACE, DEFAULT_SHOW_TRACE_GRAPH, SHOW_TRACE_GRAPH_FIELD,
  type BafWorkflowSettings,
} from './workflow-settings.ts'

export {
  BAF_WORKFLOW_SETTINGS_NAMESPACE, DEFAULT_SHOW_TRACE_GRAPH,
  SHOW_TRACE_GRAPH_FIELD, type BafWorkflowSettings,
} from './workflow-settings.ts'

/** Wire schema for the baf-workflow namespace. */
const BafWorkflowSettingsSchema: z<BafWorkflowSettings> = z.object({
  [SHOW_TRACE_GRAPH_FIELD]: z.boolean().default(DEFAULT_SHOW_TRACE_GRAPH),
})

/**
 * Register the durable baf-workflow section when a settings provider exists.
 * @param ctx - Host context whose optional settings service owns the section.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(BAF_WORKFLOW_SETTINGS_NAMESPACE),
      BafWorkflowSettingsSchema,
    )
  })
}
