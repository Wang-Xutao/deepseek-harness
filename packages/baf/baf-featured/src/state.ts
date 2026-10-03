/** Persistence for per-person featured-plugin choices, beside the profile home. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** File name of the persisted state under the dsh home. */
export const FEATURED_STATE_FILENAME = 'featured-state.json'

/** What the state file stores; unknown fields from a newer writer survive a rewrite. */
export interface FeaturedState {
  schemaVersion: 1
  /** Per-plugin auto-update overrides by manifest id. */
  autoUpdate: Record<string, boolean>
  /** Newest registry version the last check saw, by manifest id. */
  latestKnown: Record<string, string>
  /** Wall-clock milliseconds of the last completed check, 0 before any. */
  lastCheck: number
}

/** An empty state, what a fresh install or unreadable file starts from. */
export function emptyFeaturedState(): FeaturedState {
  return { schemaVersion: 1, autoUpdate: {}, latestKnown: {}, lastCheck: 0 }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function booleanRecord(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'))
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

/**
 * Read the persisted state, forgiving anything unreadable into defaults.
 * @param home Directory holding the state file; the dsh home by default.
 * @returns The stored state, or defaults when no readable file exists.
 */
export function readFeaturedState(home: string = resolveDshHome()): FeaturedState {
  const path = join(home, FEATURED_STATE_FILENAME)
  if (!existsSync(path)) return emptyFeaturedState()
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!isRecord(parsed) || parsed.schemaVersion !== 1) return emptyFeaturedState()
    return {
      schemaVersion: 1,
      autoUpdate: booleanRecord(parsed.autoUpdate),
      latestKnown: stringRecord(parsed.latestKnown),
      lastCheck: typeof parsed.lastCheck === 'number' && Number.isFinite(parsed.lastCheck) ? parsed.lastCheck : 0,
    }
  } catch {
    return emptyFeaturedState()
  }
}

/**
 * Persist the state atomically, creating the home directory when missing.
 * @param state The state to write.
 * @param home Directory holding the state file; the dsh home by default.
 */
export async function writeFeaturedState(state: FeaturedState, home: string = resolveDshHome()): Promise<void> {
  await writeFileAtomic(join(home, FEATURED_STATE_FILENAME), `${JSON.stringify(state, undefined, 2)}\n`, { mode: 0o600 })
}
