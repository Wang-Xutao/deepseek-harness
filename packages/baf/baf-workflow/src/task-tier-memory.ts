/**
 * Host-plane process memory for frozen task tiers: the sync dispatch-time
 * lookup the routing callback needs. The projection log is authoritative;
 * this cache is populated when `confirmIntake` freezes the tier (same
 * process as every followup-capable dispatch) and keyed by workspace +
 * change id. A miss simply routes by the phase mapping alone.
 * @module @deepseek-ai/dsh-baf-workflow/task-tier-memory
 */

import type { RouteTier } from '@deepseek-ai/dsh-baf-core'
import { sharedHostMap } from './host-memory.ts'

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
 * The frozen tier for a change, if any (sync; dispatch-path read).
 * @param cwd - workspace root.
 * @param changeId - change id.
 */
export function taskTierFor(cwd: string, changeId: string): FrozenTaskTier | undefined {
  return FROZEN.get(`${cwd}|${changeId}`)
}

/** Forget every frozen tier. Test seam only — a running host never calls this. */
export function resetTaskTierMemory(): void {
  FROZEN.clear()
}
