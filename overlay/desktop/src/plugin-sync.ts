/**
 * Mirror the pack's optional skills into the harness home, skipping the copy
 * when the source tree is byte-identical to the last sync.
 *
 * The mirror runs on every launch, and the destination is a directory tree the
 * shell does not own once written — so an unconditional `cpSync` per skill per
 * launch costs a stat and a rewrite of every file, and can leave a half-copied
 * skill behind if the process dies mid-copy. A fingerprint of the source tree
 * makes the steady state one directory walk and no writes.
 * @module
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/** Names never copied into the harness home, whatever the pack ships. */
const IGNORED_ENTRIES = new Set(['.gitkeep', '.DS_Store'])

/** One launch's mirror outcome. */
export interface SkillSyncResult {
  /** Whether the destination was rewritten; `false` means the fingerprint matched. */
  synced: boolean
  /** The source-tree fingerprint this launch computed. */
  fingerprint: string
}

/**
 * Fingerprint a directory tree from entry names, sizes, and mtimes.
 *
 * Content hashing would be stronger, but the pack is written by the installer
 * and the update flow, both of which rewrite mtimes; hashing every skill file
 * on every launch would cost more than the copy it avoids.
 * @param root - directory to walk.
 * @returns a stable string, or `''` when `root` does not exist.
 */
export function fingerprintTree(root: string): string {
  if (!existsSync(root)) return ''
  const parts: string[] = []
  const walk = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true })
      .filter(entry => !IGNORED_ENTRIES.has(entry.name))
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
    for (const entry of entries) {
      const path = join(dir, entry.name)
      const rel = relative(root, path).split(sep).join('/')
      if (entry.isDirectory()) {
        parts.push(`d:${rel}`)
        walk(path)
        continue
      }
      const stats = statSync(path)
      parts.push(`f:${rel}:${String(stats.size)}:${String(Math.round(stats.mtimeMs))}`)
    }
  }
  walk(root)
  return parts.join('\n')
}

/**
 * Copy `from` into `to` unless the recorded fingerprint already matches.
 *
 * A missing or unreadable marker is treated as "not synced": the destination
 * then gets rewritten, which is the pre-fingerprint behavior and therefore
 * never worse than it.
 * @param from - the pack's skills directory (`<userData>/plugin/skills`).
 * @param to - the harness home's skills directory (`~/.dsh/skills`).
 * @param marker - file recording the last synced fingerprint (`<userData>/plugin-skills-sync.json`).
 * @returns whether the destination was rewritten, and the fingerprint computed.
 */
export function syncSkillTree(from: string, to: string, marker: string): SkillSyncResult {
  const fingerprint = fingerprintTree(from)
  if (fingerprint === '') return { synced: false, fingerprint }
  if (readMarker(marker) === fingerprint) return { synced: false, fingerprint }

  mkdirSync(to, { recursive: true })
  for (const name of readdirSync(from)) {
    if (IGNORED_ENTRIES.has(name)) continue
    cpSync(join(from, name), join(to, name), { recursive: true, force: true })
  }
  writeMarker(marker, fingerprint)
  return { synced: true, fingerprint }
}

/**
 * @param marker - the fingerprint file.
 * @returns its trimmed content, or `undefined` when it is absent or unreadable.
 */
function readMarker(marker: string): string | undefined {
  try {
    const text = readFileSync(marker, 'utf8').trim()
    return text === '' ? undefined : text
  } catch {
    // Absent on a first run, and unreadable after a partial write; both mean "sync".
    return undefined
  }
}

/**
 * Persist a fingerprint. A write failure is swallowed: it only forces the next
 * launch to re-copy, and the mirror itself already succeeded.
 * @param marker - the fingerprint file.
 * @param fingerprint - the value to record.
 */
function writeMarker(marker: string, fingerprint: string): void {
  try {
    writeFileSync(marker, `${fingerprint}\n`, 'utf8')
  } catch {
    // See above: losing the marker costs one redundant copy, nothing more.
  }
}
