#!/usr/bin/env node
/**
 * Build channel manifest.json (+ optional .sig) from desktop/dist artifacts.
 * Schema 2 (§11.2): signed issuedAt/expiresAt/releaseEpoch, keyId-bound
 * Ed25519 signature over the exact manifest.json bytes.
 *
 * Env:
 *   BAF_UPDATE_PRIVATE_KEY_PEM  — ed25519 private PEM (CI secret); if unset, skip .sig
 *   BAF_UPDATE_KEY_ID           — signing key id recorded in the manifest (default baf-test-2026q4)
 *   BAF_UPDATE_VALIDITY_DAYS    — signed validity window length (default 90)
 *   BAF_UPDATE_RELEASE_EPOCH    — explicit epoch; default: previous manifest epoch + 1 (monotonic)
 */
import { createHash, createPrivateKey, sign } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const overlayRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const desktopVersionPath = join(overlayRoot, 'desktop', 'VERSION')
const desktopPkg = JSON.parse(readFileSync(join(overlayRoot, 'desktop', 'package.json'), 'utf8'))
const repoRoot = join(overlayRoot, '..')
const rootPkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
const pluginManifest = JSON.parse(
  readFileSync(join(overlayRoot, 'plugin', 'plugin-manifest.json'), 'utf8')
)
const notes = JSON.parse(readFileSync(join(overlayRoot, 'desktop', 'version-notes.json'), 'utf8'))
const outDir = join(overlayRoot, 'desktop', 'dist', 'update')
mkdirSync(outDir, { recursive: true })

const bafDsh = existsSync(desktopVersionPath)
  ? readFileSync(desktopVersionPath, 'utf8').trim()
  : desktopPkg.version
const dsh = rootPkg.version
const bafPlugin = pluginManifest.version
const bafPreset = pluginManifest.version
const baseline = pluginManifest.baseline ?? 'std-c'
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

// Signed validity window (§11.2): issued now, expires after N days.
const validityDays = Number(process.env.BAF_UPDATE_VALIDITY_DAYS ?? 90)
const issuedAt = new Date()
const expiresAt = new Date(issuedAt.getTime() + validityDays * 24 * 60 * 60 * 1000)

// Monotonic release epoch: explicit env wins; otherwise previous + 1.
const manifestPath = join(outDir, 'manifest.json')
let previousEpoch = 0
if (existsSync(manifestPath)) {
  try {
    previousEpoch = JSON.parse(readFileSync(manifestPath, 'utf8')).releaseEpoch ?? 0
  } catch {
    previousEpoch = 0
  }
}
const releaseEpoch = Number(process.env.BAF_UPDATE_RELEASE_EPOCH ?? previousEpoch + 1)
if (releaseEpoch < previousEpoch) {
  console.error(`generate-manifest: releaseEpoch ${releaseEpoch} < previous ${previousEpoch} — refusing (replay guard)`)
  process.exit(1)
}

const keyId = process.env.BAF_UPDATE_KEY_ID ?? 'baf-test-2026q4'

const manifest = {
  schema: 2,
  channel: 'stable',
  issuedAt: issuedAt.toISOString(),
  expiresAt: expiresAt.toISOString(),
  releaseEpoch,
  tag,
  bafDsh,
  dsh,
  bafPlugin,
  bafPreset,
  baseline,
  presetSchema: pluginManifest.presetSchema ?? 1,
  minShell: bafDsh,
  compatibility: { minDsh: dsh, maxDsh: '*' },
  force: false,
  notesZh: process.env.BAF_RELEASE_NOTES_ZH ?? notes.desktop?.notesZh ?? `BAF DSH DESKTOP ${bafDsh}`,
  artifacts,
  systemResources: ['presets/baf', `baseline/${baseline}`],
  rollback: { supported: true, minimumVersion: process.env.BAF_UPDATE_ROLLBACK_MIN ?? '0.0.1' },
  signature: { algorithm: 'ed25519', keyId, asset: 'manifest.sig' },
}

const body = `${JSON.stringify(manifest, null, 2)}\n`
writeFileSync(manifestPath, body)
console.log(`generate-manifest: wrote ${manifestPath} (schema 2, epoch ${releaseEpoch}, keyId ${keyId})`)

const pem = process.env.BAF_UPDATE_PRIVATE_KEY_PEM
  ?? (existsSync(join(overlayRoot, 'scripts', '.baf-update-test-private.pem'))
    ? readFileSync(join(overlayRoot, 'scripts', '.baf-update-test-private.pem'), 'utf8')
    : undefined)
if (pem && pem.includes('BEGIN PRIVATE KEY')) {
  const key = createPrivateKey(pem)
  // Sign the exact bytes written to manifest.json — the verifier compares
  // against the raw download, so pretty-printing IS the canonical form.
  const sig = sign(null, Buffer.from(body, 'utf8'), key)
  const sigPath = join(outDir, 'manifest.sig')
  writeFileSync(sigPath, sig.toString('base64'))
  console.log(`generate-manifest: wrote ${sigPath}`)
} else {
  console.log('generate-manifest: no signing key — skipped signature (production refuses unsigned manifests)')
}
