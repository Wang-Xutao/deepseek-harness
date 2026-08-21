#!/usr/bin/env node
/**
 * Pack overlay/plugin into baf-plugin-<version>.zip for GitHub Releases.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const overlayRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const pluginDir = join(overlayRoot, 'plugin')
const outDir = join(overlayRoot, 'desktop', 'dist', 'update')

if (!existsSync(join(pluginDir, 'plugin-manifest.json'))) {
  console.error('pack-plugin: missing overlay/plugin/plugin-manifest.json')
  process.exit(1)
}

const version = JSON.parse(readFileSync(join(pluginDir, 'plugin-manifest.json'), 'utf8')).version
if (typeof version !== 'string' || version.length === 0) {
  console.error('pack-plugin: invalid plugin version')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
const zipName = `baf-plugin-${version}.zip`
const zipPath = join(outDir, zipName)
rmSync(zipPath, { force: true })

const tar = spawnSync('tar', ['-a', '-cf', zipPath, '-C', pluginDir, '.'], { stdio: 'inherit' })
if (tar.status !== 0) {
  console.error('pack-plugin: tar failed')
  process.exit(1)
}

const buf = readFileSync(zipPath)
const sha256 = createHash('sha256').update(buf).digest('hex')
const meta = { name: zipName, sha256, size: buf.byteLength, version }
writeFileSync(join(outDir, 'baf-plugin.meta.json'), `${JSON.stringify(meta, null, 2)}\n`)
console.log(`pack-plugin: wrote ${zipPath}`)
console.log(`pack-plugin: sha256 ${sha256}`)
