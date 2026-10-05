/**
 * 多模型路由 M3A 后续 — phantom-dependency guard for the Host entry.
 *
 * The 2026-10-05 web boot caught the Host plugin failing to import at
 * runtime: `@deepseek-ai/schemastery` was imported by src/index.ts but not
 * declared. Vitest and tsc resolve through the repo's hoisted root, so both
 * stayed green while the Loader's package-local resolution failed — the
 * browser then died on "pending (waiting for service: remote.bafRouteConfig)".
 * This spec pins every runtime import of the Host entry to a declared
 * dependency so the class of failure cannot come back silently.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  readonly dependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
}
const declared = new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.peerDependencies ?? {}),
])

/** Runtime module specifiers the Host entry imports (subpaths → base package). */
function hostEntryImports(): string[] {
  const source = readFileSync(join(root, 'src/index.ts'), 'utf8')
  const specifiers: string[] = []
  for (const match of source.matchAll(/from\s+'([^']+)'/g)) specifiers.push(match[1] ?? '')
  for (const match of source.matchAll(/import\s+'([^']+)'(\)|,)/g)) specifiers.push(match[1] ?? '')
  return specifiers
    .filter(s => s !== '' && !s.startsWith('.') && !s.startsWith('node:'))
    // `pkg/subpath` imports resolve through the base package's exports.
    .map(s => s.match(/^(@[^/]+\/[^/]+)\//)?.[1] ?? s)
}

describe('host entry runtime imports are declared', () => {
  it('every bare import of src/index.ts resolves through package.json', () => {
    const undeclared = hostEntryImports().filter(s => !declared.has(s))
    expect(undeclared).toEqual([])
  })
})
