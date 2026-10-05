/**
 * Host-plane process memory for frozen task tiers: the sync dispatch-time
 * lookup the routing callback needs. The projection log is authoritative;
 * this cache is populated when `confirmIntake` freezes the tier (same
 * process as every followup-capable dispatch) and keyed by workspace +
 * change id. A cache miss falls through to {@link rehydrateTaskTier} — a
 * restarted host re-reads the change's projection JSONL once and re-seeds
 * this map, so the freeze survives the process that wrote it.
 * @module @deepseek-ai/dsh-baf-workflow/task-tier-memory
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectionLogPath, type RouteTier } from '@deepseek-ai/dsh-baf-core'
import { sharedHostMap } from './host-memory.ts'
import { parseProjectionLog } from './projection.ts'

/** The frozen tier for one change, as the dispatch callback reads it. */
export interface FrozenTaskTier {
  readonly tier: RouteTier
  readonly matched?: string
}

const FROZEN = sharedHostMap<FrozenTaskTier>('route-tier/frozen')

/**
 * Record a tier frozen at intake confirm.
 * @param cwd - workspace root.
 * @param changeId - change id.
 * @param value - frozen tier + matched keyword.
 */
export function rememberTaskTier(cwd: string, changeId: string, value: FrozenTaskTier): void {
  FROZEN.set(`${cwd}|${changeId}`, value)
}

/**
 * The frozen tier for a change, if any (sync; dispatch-path read). A miss
 * rehydrates from the projection log (host-restart gap), so the value is
 * either the cache entry or the log's freeze — never a silent drop.
 * @param cwd - workspace root.
 * @param changeId - change id.
 */
export function taskTierFor(cwd: string, changeId: string): FrozenTaskTier | undefined {
  const cached = FROZEN.get(`${cwd}|${changeId}`)
  if (cached !== undefined) return cached
  const rehydrated = rehydrateTaskTier(cwd, changeId)
  if (rehydrated !== undefined) rememberTaskTier(cwd, changeId, rehydrated)
  return rehydrated
}

/**
 * Re-seed a frozen tier from the change's projection JSONL (fix pass #1:
 * the map is in-process only; a restarted host used to lose the freeze and
 * drop the change to the phase mapping). First freeze wins, matching the
 * projection fold. Best-effort: any read/parse problem returns undefined —
 * routing falls back to the phase mapping, never blocks the order.
 * @param cwd - workspace root.
 * @param changeId - change id.
 */
function rehydrateTaskTier(cwd: string, changeId: string): FrozenTaskTier | undefined {
  try {
    const text = readFileSync(join(cwd, projectionLogPath(changeId)), 'utf8')
    const { events } = parseProjectionLog(text, changeId)
    // The fold is first-freeze-wins (projection.ts `task-tier-frozen`): a
    // stray replayed freeze later in the log never re-tiers the change.
    for (const event of events) {
      if (event.type === 'task-tier-frozen') {
        return {
          tier: event.tier,
          ...(event.matched === undefined ? {} : { matched: event.matched }),
        }
      }
    }
    return undefined
  } catch {
    // Missing log (change never froze / foreign workspace) or IO error.
    return undefined
  }
}

/** Forget every frozen tier. Test seam only — a running host never calls this. */
export function resetTaskTierMemory(): void {
  FROZEN.clear()
}
