/**
 * §18.4.3 dual-lane view: split the projection event log at `mode-upgraded`.
 *
 * The projection deliberately holds **one** `nodes` map and one `mode`: adding
 * a lane field would break the append-only event shape the audit trail depends
 * on (§18.4.3 「不要给 projection 加 lane 字段」). So the two paths are
 * reconstructed here, in the Tab's derivation layer, from the events that are
 * already recorded — every node status in a lane is folded from that lane's own
 * slice of the log, never from the live status.
 * @module @deepseek-ai/dsh-baf-workflow/lanes
 */

import {
  BUG_FIX_PATH_ROWS,
  FULL_GO_PATH_ROWS,
  type NodeStatus,
  type ProjectionEvent,
  type WorkflowNode,
  type WorkflowTabLane,
  type WorkflowTabLanes,
} from '@deepseek-ai/dsh-baf-core'

/** i18n keys the Tab uses for lane headers and the T15 edge (§20.7). */
const LANE_LABEL_KEY: Record<WorkflowTabLane['id'], string> = {
  'bug-fix-path': 'lane.bugFixPath',
  'full-go-path': 'lane.fullGoPath',
}

const UPGRADE_LABEL_KEY = 'edge.upgraded'

/** Fallback landing node — the stage a T15 escalation always re-enters. */
const DEFAULT_LANDING: WorkflowNode = 'clarify'

/**
 * Fold one event slice into per-node status.
 *
 * `intake` is the only node with no `stage-entered` event of its own: its
 * lifecycle is the two intake events, so those are mapped explicitly.
 * @param events - slice of the projection log.
 * @returns node statuses recorded in that slice.
 */
function foldNodeStatus(
  events: readonly ProjectionEvent[],
): Partial<Record<WorkflowNode, NodeStatus>> {
  const status: Partial<Record<WorkflowNode, NodeStatus>> = {}
  for (const event of events) {
    switch (event.type) {
      case 'intake-classified':
        status.intake = 'in-progress'
        break
      case 'intake-confirmed':
        status.intake = 'completed'
        break
      case 'stage-entered':
        status[event.node] = 'in-progress'
        break
      case 'stage-completed':
        status[event.node] = 'completed'
        break
      case 'stage-failed':
        status[event.node] = 'failed'
        break
      case 'drift-detected':
        status[event.node] = 'drifted'
        break
      default:
        break
    }
  }
  return status
}

/**
 * The node a lane had reached when the slice ended.
 * @param events - slice of the projection log.
 * @returns last entered node, or undefined when the slice never entered one.
 */
function lastEntered(events: readonly ProjectionEvent[]): WorkflowNode | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]
    if (event !== undefined && event.type === 'stage-entered') return event.node
  }
  return undefined
}

/**
 * The node a lane picked up from.
 * @param events - slice of the projection log.
 * @returns first entered node, or undefined when the slice never entered one.
 */
function firstEntered(events: readonly ProjectionEvent[]): WorkflowNode | undefined {
  for (const event of events) {
    if (event.type === 'stage-entered') return event.node
  }
  return undefined
}

/**
 * Build the dual-lane payload for a change, or undefined when it never upgraded.
 *
 * Read-only and pure: the Tab calls it on every paint, so it must not touch
 * the filesystem — the events are already in hand.
 * @param events - the change's ordered projection events.
 * @returns lanes + upgrade edge, or undefined for a single-path change.
 */
export function deriveLanes(
  events: readonly ProjectionEvent[],
): WorkflowTabLanes | undefined {
  const upgradeIndex = events.findIndex(event => event.type === 'mode-upgraded')
  if (upgradeIndex < 0) return undefined
  const upgrade = events[upgradeIndex]
  if (upgrade === undefined || upgrade.type !== 'mode-upgraded') return undefined

  const before = events.slice(0, upgradeIndex)
  const after = events.slice(upgradeIndex + 1)

  const bugFixPathStatus = foldNodeStatus(before)
  const fullGoPathStatus = foldNodeStatus(after)

  // `from` is where the pre-upgrade path stopped, `to` is where full-go-path picked
  // up. Both are read off the log rather than assumed, because §18.4.3 requires
  // the picture to show *where it jumped from and to* — a hard-coded
  // `implement → clarify` would lie about an escalation that started elsewhere.
  const from = lastEntered(before)
  const to = firstEntered(after) ?? DEFAULT_LANDING

  const preservedArtifacts = before.flatMap(event => (
    event.type === 'stage-completed' ? event.artifacts : []
  ))

  return {
    lanes: [
      {
        id: 'bug-fix-path',
        nodes: BUG_FIX_PATH_ROWS,
        status: bugFixPathStatus,
        labelKey: LANE_LABEL_KEY['bug-fix-path'],
      },
      {
        id: 'full-go-path',
        nodes: FULL_GO_PATH_ROWS,
        status: fullGoPathStatus,
        labelKey: LANE_LABEL_KEY['full-go-path'],
      },
    ],
    upgrade: {
      // A degenerate log (upgrade with nothing entered before/after) still has
      // to render *something* legible; falling back to the landing node keeps
      // the edge on screen instead of dropping the whole lane view.
      from: from ?? to,
      to,
      at: upgrade.at,
      cause: upgrade.cause,
      labelKey: UPGRADE_LABEL_KEY,
    },
    preservedArtifacts,
  }
}
