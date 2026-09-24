/**
 * 【变更】2026-09-23 (demo2 re-test): the host-plane process-singleton anchor.
 *
 * tsdown emits ONE self-contained bundle per preset entry and per package
 * export face — `auto-pop.js`, `commands.js`, `orchestrator.js`, `gate-ask.js`,
 * plus the Tab remote's own copy of `@deepseek-ai/dsh-baf-workflow`'s bundle.
 * A module-level `const x = new Map()` therefore exists in **N copies per
 * process**: state written through one bundle's copy (auto-pop parking a
 * requirement) is invisible to every other bundle (the `/baf-go` handler's
 * continuation reading an empty map — the exact 2026-09-23 web re-test
 * failure: scaffold initialized, then silence). The same defect class silently
 * degraded the dispatch ledger's turn-end re-arm, the beginIntake cross-surface
 * mint lock, and the ask queue's cross-channel single-flight on every bundled
 * (web/desktop) composition.
 *
 * Every host-plane memory that must cross those boundaries anchors on
 * `globalThis` through this module instead. Tests reset through each module's
 * existing `reset*` seam (the anchor keeps the same object identity, so clears
 * behave exactly like the module-local versions did).
 *
 * @module @deepseek-ai/dsh-baf-workflow/host-memory
 */

/** The process-wide registry every shared host memory hangs off. */
interface HostMemoryAnchor {
  readonly maps: Map<string, Map<string, unknown>>
  readonly sets: Map<string, Set<string>>
}

const ANCHOR_KEY = '__bafWorkflowHostMemory'

const anchor: HostMemoryAnchor = (() => {
  const holder = globalThis as { [key: string]: unknown }
  const existing = holder[ANCHOR_KEY]
  if (existing !== undefined) return existing as HostMemoryAnchor
  const created: HostMemoryAnchor = { maps: new Map(), sets: new Map() }
  holder[ANCHOR_KEY] = created
  return created
})()

/**
 * One process-shared `Map<string, V>` per id — the same instance in every
 * bundle copy that asks for it.
 * @param id - stable identity of the memory (module-qualified).
 * @returns the shared map.
 */
export function sharedHostMap<V>(id: string): Map<string, V> {
  let map = anchor.maps.get(id) as Map<string, V> | undefined
  if (map === undefined) {
    map = new Map<string, V>()
    anchor.maps.set(id, map)
  }
  return map
}

/**
 * One process-shared `Set<string>` per id — the same instance in every bundle
 * copy that asks for it.
 * @param id - stable identity of the memory (module-qualified).
 * @returns the shared set.
 */
export function sharedHostSet(id: string): Set<string> {
  let set = anchor.sets.get(id)
  if (set === undefined) {
    set = new Set<string>()
    anchor.sets.set(id, set)
  }
  return set
}
