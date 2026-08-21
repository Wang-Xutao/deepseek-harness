#!/usr/bin/env node
/**
 * Build channel manifest.json (+ optional .sig) from desktop/dist artifacts.
 *
 * Env:
 *   BAF_UPDATE_PRIVATE_KEY_PEM — ed25519 private PEM (CI secret); if unset, skip .sig
 */
import { createHash, createPrivateKey, sign } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const overlayRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const desktopPkg = JSON.parse(readFileSync(join(overlayRoot, 'desktop', 'package.json'), 'utf8'))
const repoRoot = join(overlayRoot, '..')
const rootPkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
const pluginManifest = JSON.parse(
  readFileSync(join(overlayRoot, 'plugin', 'plugin-manifest.json'), 'utf8'),
)
const outDir = join(overlayRoot, 'desktop', 'dist', 'update')
mkdirSync(outDir, { recursive: true })

const bafDsh = desktopPkg.version
const dsh = rootPkg.version
const bafPlugin = pluginManifest.version
const tag = `baf-dsh-v${bafDsh}`

function loadMeta(name) {
  const path = join(outDir, name)
  if (!existsSync(path)) return undefined
  return JSON.parse(readFileSync(path, 'utf8'))
}

const pluginMeta = loadMeta('baf-plugin.meta.json')
const runtimeMeta = loadMeta('baf-runtime.meta.json')

const setupName = `baf-dsh-Setup-${bafDsh}.exe`
const setupPath = join(overlayRoot, 'desktop', 'dist', setupName)
let shellArtifact
if (existsSync(setupPath)) {
  const buf = readFileSync(setupPath)
  shellArtifact = {
    name: setupName,
    sha256: createHash('sha256').update(buf).digest('hex'),
    size: buf.byteLength,
  }
}

const artifacts = {}
if (pluginMeta) {
  artifacts.plugin = { name: pluginMeta.name, sha256: pluginMeta.sha256, size: pluginMeta.size }
}
if (runtimeMeta) {
  artifacts.runtime = { name: runtimeMeta.name, sha256: runtimeMeta.sha256, size: runtimeMeta.size }
}
if (shellArtifact) artifacts.shell = shellArtifact

const manifest = {
  channel: 'stable',
  publishedAt: new Date().toISOString(),
  tag,
  bafDsh,
  dsh,
  bafPlugin,
  minShell: bafDsh,
  force: false,
  notesZh: process.env.BAF_RELEASE_NOTES_ZH ?? `baf-dsh ${bafDsh}`,
  artifacts,
}

const manifestPath = join(outDir, 'manifest.json')
const body = `${JSON.stringify(manifest, null, 2)}\n`
writeFileSync(manifestPath, body)
console.log(`generate-manifest: wrote ${manifestPath}`)

const pem = process.env.BAF_UPDATE_PRIVATE_KEY_PEM
if (pem && pem.includes('BEGIN PRIVATE KEY')) {
  const key = createPrivateKey(pem)
  const sig = sign(null, Buffer.from(body, 'utf8'), key)
  const sigPath = join(outDir, 'manifest.sig')
  writeFileSync(sigPath, sig.toString('base64'))
  console.log(`generate-manifest: wrote ${sigPath}`)
} else {
  console.log('generate-manifest: no BAF_UPDATE_PRIVATE_KEY_PEM — skipped signature')
}
