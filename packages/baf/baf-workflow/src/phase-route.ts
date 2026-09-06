/**
 * Map a route resolution onto the agent request-level ModelSelection.
 * Stage runners call this after resolveRoute; they must not silent-fallback.
 * @module @deepseek-ai/dsh-baf-workflow/phase-route
 */

import type { RouteResolution } from '@deepseek-ai/dsh-baf-core'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'

/**
 * Convert a successful {@link RouteResolution} into agent ModelSelection.
 * Prefer setting `selection.current` before the next prompt assembly so the
 * turn uses this provider/model without going through dsh `tool-workflow`.
 * @param resolution - output of resolveRoute.
 * @returns provider/model for installModelSelection / selectForNextRequest.
 */
export function toModelSelection(resolution: RouteResolution): ModelSelection {
  return {
    provider: resolution.provider,
    model: resolution.model,
  }
}

/**
 * Optional workflow-worker fan-out fields when a phase needs child agents.
 * Only use when the stage already decided to run dsh workflow `agent()`;
 * go state transitions must not be driven by that tool.
 * @param resolution - output of resolveRoute.
 * @returns `{ provider, model }` for agentOptions (same pair as {@link toModelSelection}).
 */
export function toWorkflowAgentOptions(resolution: RouteResolution): {
  provider: string
  model: string
} {
  return toModelSelection(resolution)
}
