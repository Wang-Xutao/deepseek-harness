import { afterEach, describe, expect, it } from 'vitest'
import { bundledPnpmEntry, featuredManifestPath, packageManagerEnvJson } from '../src/package-manager.ts'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'

const temps: string[] = []

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('bundledPnpmEntry', () => {
  it('finds a packaged entry when the file exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'baf-pnpm-'))
    temps.push(root)
    const entry = join(root, 'runtime', 'pnpm', 'bin', 'pnpm.mjs')
    mkdirSync(dirname(entry), { recursive: true })
    writeFileSync(entry, '', 'utf8')
    expect(bundledPnpmEntry(true, root, join(root, 'unused-desktop'))).toBe(entry)
  })

  it('returns undefined when nothing is bundled', () => {
    expect(bundledPnpmEntry(true, 'Z:\\missing-resources', 'Z:\\missing-desktop')).toBeUndefined()
  })
})

describe('packageManagerEnvJson', () => {
  it('encodes the node command, pnpm args, and PATH delta', () => {
    const node = join('C:', 'Program Files', 'node', 'node.exe')
    const fact = JSON.parse(packageManagerEnvJson(node, join('D:', 'pnpm.mjs'), 'C:\\windows')) as {
      command: string
      args: string[]
      env: { PATH: string }
    }
    expect(fact.command).toBe(node)
    expect(fact.args).toStrictEqual(['--expose-internals', join('D:', 'pnpm.mjs')])
    expect(fact.env.PATH).toBe(`${dirname(node)}${delimiter}C:\\windows`)
  })
})

describe('featuredManifestPath', () => {
  it('prefers the userData copy over the packaged seed', () => {
    const user = mkdtempSync(join(tmpdir(), 'baf-manifest-user-'))
    const seed = mkdtempSync(join(tmpdir(), 'baf-manifest-seed-'))
    temps.push(user, seed)
    writeFileSync(join(user, 'featured-plugins.json'), '{}', 'utf8')
    writeFileSync(join(seed, 'featured-plugins.json'), '{}', 'utf8')
    expect(featuredManifestPath(join(user, 'featured-plugins.json'), join(seed, 'featured-plugins.json')))
      .toBe(join(user, 'featured-plugins.json'))
  })

  it('falls back to the packaged seed and then undefined', () => {
    const user = mkdtempSync(join(tmpdir(), 'baf-manifest-empty-'))
    const seed = mkdtempSync(join(tmpdir(), 'baf-manifest-seed2-'))
    temps.push(user, seed)
    mkdirSync(user, { recursive: true })
    expect(featuredManifestPath(join(user, 'featured-plugins.json'), join(seed, 'missing.json'))).toBeUndefined()
    writeFileSync(join(seed, 'featured-plugins.json'), '{}', 'utf8')
    expect(featuredManifestPath(join(user, 'featured-plugins.json'), join(seed, 'featured-plugins.json')))
      .toBe(join(seed, 'featured-plugins.json'))
  })
})
