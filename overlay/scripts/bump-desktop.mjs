/**
 * Bump baf-dsh desktop version before a release commit.
 *
 * Source of truth: overlay/desktop/VERSION (semver X.Y.Z).
 * Also syncs desktop/package.json and reminds to refresh version-map.md.
 *
 * Usage:
 *   node overlay/scripts/bump-desktop.mjs 0.0.9
 *   node overlay/scripts/bump-desktop.mjs 0.0.9 --notes-zh "说明" --notes-en "Notes"
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const overlayRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const desktopRoot = join(overlayRoot, 'desktop')
const versionPath = join(desktopRoot, 'VERSION')
const packagePath = join(desktopRoot, 'package.json')
const notesPath = join(desktopRoot, 'version-notes.json')

const SEMVER = /^\d+\.\d+\.\d+$/

const args = process.argv.slice(2)
const next = args.find(a => !a.startsWith('--'))
if (next === undefined || !SEMVER.test(next)) {
  console.error('usage: node overlay/scripts/bump-desktop.mjs <X.Y.Z> [--notes-zh "..."] [--notes-en "..."]')
  process.exit(1)
}

function flag(name) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

const prev = readFileSync(versionPath, 'utf8').trim()
writeFileSync(versionPath, `${next}\n`)

const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
pkg.version = next
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`)

const notes = JSON.parse(readFileSync(notesPath, 'utf8'))
const notesZh = flag('--notes-zh')
const notesEn = flag('--notes-en')
if (typeof notesZh === 'string' && notesZh.length > 0) notes.desktop.notesZh = notesZh
if (typeof notesEn === 'string' && notesEn.length > 0) notes.desktop.notesEn = notesEn
writeFileSync(notesPath, `${JSON.stringify(notes, null, 2)}\n`)

console.log(`bumped desktop ${prev} → ${next}`)
console.log('updated: desktop/VERSION, desktop/package.json, desktop/version-notes.json')
console.log('next: refresh overlay/docs/release/version-map.md, then commit and publish')
