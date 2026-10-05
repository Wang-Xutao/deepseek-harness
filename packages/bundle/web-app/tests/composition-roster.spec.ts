/**
 * 多模型路由 M3A 后续 — composition roster guard: every plugin the patch
 * tree names must also be a dependency the Loader can resolve, and the
 * dual-face packages the repo ships (host Remote + browser face) must be
 * named in the tree at all. The 2026-10-05 web boot caught ui-settings-baf-route
 * missing from both files: the browser roster knew the entry (typert scan)
 * but no Host plugin ever registered `remote.bafRouteConfig`, so web boot
 * died on "pending (waiting for service: remote.bafRouteConfig)".
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  readonly dependencies: Readonly<Record<string, string>>
}
const patchYml = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')

/** Plugin names the composition tree inserts (`name:` entries only). */
function pluginNamesInTree(): string[] {
  const names: string[] = []
  for (const match of patchYml.matchAll(/^\s*- id: .*\n\s*name: '?([^'\s]+)'?/gm)) {
    names.push(match[1] ?? '')
  }
  return names
    .filter(name => name !== '')
    // Subpath entries (`pkg/sub` inserts) resolve against the base package;
    // the bundle's own self-references mount through the profile, not a dep.
    .map(name => (name.match(/^(@[^/]+\/[^/]+)\//)?.[1] ?? name))
    .filter(name => name !== '@deepseek-ai/dsh-web-app')
}

describe('web-app composition roster', () => {
  it('names the 多模型路由 dual-face package (its Host Remote must mount)', () => {
    expect(pluginNamesInTree()).toContain('@deepseek-ai/dsh-client-ui-settings-baf-route')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-client-ui-settings-baf-route')
  })

  it('keeps every tree entry resolvable: each named plugin is a dependency', () => {
    const missing = pluginNamesInTree()
      .filter(name => name.startsWith('@deepseek-ai/dsh-'))
      .filter(name => manifest.dependencies[name] === undefined)
    // External packages (e.g. dshmarket) may arrive through other layers.
    expect(missing.filter(name => name.startsWith('@deepseek-ai/'))).toEqual([])
  })
})
