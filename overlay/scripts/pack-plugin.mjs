#!/usr/bin/env node
/**
 * Pack overlay/plugin into baf-plugin-<version>.zip for GitHub Releases.
 *
 * The sidecar baf-plugin.meta.json (§12 9.7) carries the artifact identity
 * generate-manifest.mjs embeds into the channel manifest (name/sha256/size)
 * plus the payload descriptor the apply side will verify against: schema,
 * payload scope, presetSchema, bafVersion, systemResources, and a per-file
 * hash manifest of everything inside the zip (audit / future per-file
 * verification; today the desktop verifies the whole-zip sha256 on download).
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const overlayRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const pluginDir = join(overlayRoot, 'plugin')
const outDir = join(overlayRoot, 'desktop', 'dist', 'update')

if (!existsSync(join(pluginDir, 'plugin-manifest.json'))) {
  console.error('pack-plugin: missing overlay/plugin/plugin-manifest.json')
  process.exit(1)
}

const pluginManifest = JSON.parse(readFileSync(join(pluginDir, 'plugin-manifest.json'), 'utf8'))
const version = pluginManifest.version
if (typeof version !== 'string' || version.length === 0) {
  console.error('pack-plugin: invalid plugin version')
  process.exit(1)
}

/** Recursive file list, zip-style forward-slash relative paths. */
function listFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(path))
    else out.push(path)
  }
  return out
}

mkdirSync(outDir, { recursive: true })
const zipName = `baf-plugin-${version}.zip`
const zipPath = join(outDir, zipName)
rmSync(zipPath, { force: true })

const tar = spawnSync('tar', ['-a', '--force-local', '-cf', zipPath, '-C', pluginDir, '.'], { stdio: 'inherit' })
if (tar.status !== 0) {
  console.error('pack-plugin: tar failed')
  process.exit(1)
}

const buf = readFileSync(zipPath)
const sha256 = createHash('sha256').update(buf).digest('hex')
const meta = {
  schema: 2,
  payload: 'plugin',
  name: zipName,
  sha256,
  size: buf.byteLength,
  version,
  bafVersion: version,
  presetSchema: pluginManifest.presetSchema ?? 1,
  baseline: pluginManifest.baseline ?? 'std-c',
  systemResources: ['presets/baf'],
  files: listFiles(pluginDir)
    .map(path => {
      const body = readFileSync(path)
      return {
        path: relative(pluginDir, path).split('\\').join('/'),
        sha256: createHash('sha256').update(body).digest('hex'),
        size: body.byteLength,
      }
    })
    .sort((a, b) => a.path.localeCompare(b.path)),
}
writeFileSync(join(outDir, 'baf-plugin.meta.json'), `${JSON.stringify(meta, null, 2)}\n`)
console.log(`pack-plugin: wrote ${zipPath}`)
console.log(`pack-plugin: sha256 ${sha256}`)
console.log(`pack-plugin: ${meta.files.length} files hashed into baf-plugin.meta.json`)
