import { createHash, createPublicKey, verify } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import type { ManifestArtifact } from './manifest.ts'
import { parseManifest, type UpdateManifest } from './manifest.ts'
import { BAF_UPDATE_PUBLIC_KEY_PEM, signatureVerificationEnabled } from './public-key.ts'

export type GithubUpdateConfig = {
  owner: string
  repo: string
  channelTag: string
}

type GhAsset = {
  id: number
  name: string
  browser_download_url: string
  url: string
  size: number
}

type GhRelease = {
  tag_name: string
  assets: GhAsset[]
}

/**
 * @param _config - repo coordinates (token auth deferred for private repos).
 * @returns public GitHub API headers.
 */
export function githubHeaders(_config: GithubUpdateConfig): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'baf-dsh-updater',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

/**
 * Fetch the channel release and parse its manifest (+ optional signature).
 * @param config - GitHub coordinates.
 */
export async function fetchChannelManifest(config: GithubUpdateConfig): Promise<UpdateManifest> {
  const releaseUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/releases/tags/${encodeURIComponent(config.channelTag)}`
  const releaseRes = await fetch(releaseUrl, { headers: githubHeaders(config) })
  if (!releaseRes.ok) {
    if (releaseRes.status === 404) {
      throw new Error(
        `无法读取更新通道（HTTP 404）。仓库尚未发布 Release「${config.channelTag}」；请先在 baf 分支打 tag baf-dsh-v* 并完成发版工作流。`,
      )
    }
    throw new Error(`无法读取更新通道（HTTP ${String(releaseRes.status)}）`)
  }
  const release = await releaseRes.json() as GhRelease
  const manifestAsset = release.assets.find(a => a.name === 'manifest.json')
  if (manifestAsset === undefined) {
    throw new Error('更新通道缺少 manifest.json')
  }
  const manifestBuf = await downloadAssetBuffer(config, manifestAsset)
  const parsed = parseManifest(JSON.parse(manifestBuf.toString('utf8')) as unknown)
  if (!parsed.ok) throw new Error(parsed.error)

  const sigAsset = release.assets.find(a => a.name === 'manifest.sig')
  if (signatureVerificationEnabled()) {
    if (sigAsset === undefined) throw new Error('更新通道缺少 manifest.sig')
    const sig = await downloadAssetBuffer(config, sigAsset)
    if (!verifyManifestSignature(manifestBuf, sig)) {
      throw new Error('manifest 签名校验失败')
    }
  }

  return parsed.value
}

/**
 * Resolve an artifact from the versioned release named by the manifest tag.
 * @param config - GitHub coordinates.
 * @param tag - release tag (e.g. baf-dsh-v0.1.0).
 * @param artifact - artifact descriptor from the manifest.
 */
export async function resolveReleaseAsset(
  config: GithubUpdateConfig,
  tag: string,
  artifact: ManifestArtifact,
): Promise<GhAsset> {
  const releaseUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/releases/tags/${encodeURIComponent(tag)}`
  const releaseRes = await fetch(releaseUrl, { headers: githubHeaders(config) })
  if (!releaseRes.ok) {
    throw new Error(`无法读取版本 Release ${tag}（HTTP ${String(releaseRes.status)}）`)
  }
  const release = await releaseRes.json() as GhRelease
  const asset = release.assets.find(a => a.name === artifact.name)
  if (asset === undefined) {
    throw new Error(`Release ${tag} 缺少资产 ${artifact.name}`)
  }
  return asset
}

/**
 * Download a GitHub release asset to a file and verify sha256.
 * @param config - GitHub coordinates.
 * @param asset - release asset metadata.
 * @param destPath - local destination path.
 * @param expectedSha256 - hex digest.
 */
export async function downloadAssetToFile(
  config: GithubUpdateConfig,
  asset: GhAsset,
  destPath: string,
  expectedSha256: string,
): Promise<void> {
  mkdirSync(dirname(destPath), { recursive: true })
  const buf = await downloadAssetBuffer(config, asset)
  const actual = createHash('sha256').update(buf).digest('hex')
  if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error(`校验失败：${asset.name}`)
  }
  writeFileSync(destPath, buf)
}

async function downloadAssetBuffer(config: GithubUpdateConfig, asset: GhAsset): Promise<Buffer> {
  // Private assets require the API asset URL with octet-stream accept.
  const headers = {
    ...githubHeaders(config),
    Accept: 'application/octet-stream',
  }
  const res = await fetch(asset.url, { headers, redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`下载失败 ${asset.name}（HTTP ${String(res.status)}）`)
  }
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}

/**
 * Verify an ed25519 detached signature over the raw manifest bytes.
 * @param manifestBytes - raw manifest.json.
 * @param signature - raw signature bytes (binary) or base64 text.
 */
export function verifyManifestSignature(manifestBytes: Buffer, signature: Buffer): boolean {
  try {
    const key = createPublicKey(BAF_UPDATE_PUBLIC_KEY_PEM)
    const sig = decodeSignature(signature)
    return verify(null, manifestBytes, key, sig)
  } catch {
    return false
  }
}

function decodeSignature(signature: Buffer): Buffer {
  const asText = signature.toString('utf8').trim()
  if (/^[A-Za-z0-9+/]+=*$/.test(asText) && asText.length > 64) {
    return Buffer.from(asText, 'base64')
  }
  return signature
}

/**
 * Stream helper kept for tests / large downloads if needed later.
 * @param config - GitHub coordinates.
 * @param asset - asset metadata.
 * @param destPath - destination file.
 */
export async function downloadAssetStreaming(
  config: GithubUpdateConfig,
  asset: GhAsset,
  destPath: string,
): Promise<void> {
  mkdirSync(dirname(destPath), { recursive: true })
  const headers = {
    ...githubHeaders(config),
    Accept: 'application/octet-stream',
  }
  const res = await fetch(asset.url, { headers, redirect: 'follow' })
  if (!res.ok || res.body === null) {
    throw new Error(`下载失败 ${asset.name}`)
  }
  // Node fetch body is a web stream; bridge to Node writable.
  const nodeReadable = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream)
  await pipeline(nodeReadable, createWriteStream(destPath))
  if (!existsSync(destPath)) throw new Error(`写入失败 ${destPath}`)
}

/**
 * @param filePath - local file.
 * @returns sha256 hex.
 */
export function sha256File(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

/**
 * Staging directory under userData for pending downloads.
 * @param userData - Electron userData.
 */
export function updatesDir(userData: string): string {
  return join(userData, 'updates')
}
