/**
 * 【变更】2026-10-30 (升级途径迁移): the baf-dsh update channel reads GITLAB
 * Releases, not GitHub Releases.
 *
 * The channel is a GitLab Release on the project `ai/workflow/baf-dsh` (host
 * `gitlab.sinc.lan`):
 *
 * - the CHANNEL release (`baf-channel-stable`) carries the signed manifest
 *   (`manifest.json` + `manifest.sig`) as release LINKS;
 * - the VERSION release (`baf-dsh-v<version>`) carries the artifacts
 *   (`baf-plugin-*.zip`, `baf-runtime-*.zip`, `baf-dsh-Setup-*.exe`) as
 *   release links too.
 *
 * A GitLab release link is an ordinary URL (CI job artifact or an object
 * storage直链), so downloading is a plain GET — no API token is needed for a
 * public project, and the manifest signature remains the only trust anchor
 * (the channel's own TLS is not a substitute for it).
 *
 * The fault-code vocabulary (U-01…U-04) is unchanged: the customer-facing
 * card quotes the code, not the provider's error text.
 *
 * @module update/gitlab
 */

import { createHash, createPublicKey, verify } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import type { ManifestArtifact } from './manifest.ts'
import { parseManifest, type UpdateManifest } from './manifest.ts'
import { findSigningKey, signaturePolicy, type UpdateSigningKey } from './public-key.ts'

/** The GitLab project coordinates the updater reads. */
export type GitlabUpdateConfig = {
  /** GitLab host base URL, e.g. `https://gitlab.sinc.lan`. */
  host: string
  /** Project path, e.g. `ai/workflow/baf-dsh` (URL-encoded into the API path). */
  project: string
  /** The channel release tag that carries the signed manifest. */
  channelTag: string
}

/**
 * Update-channel fault codes (2026-10-06 问题 5): classify every updater
 * failure into one of four codes the customer-facing card can quote; the
 * technical detail stays in `message` for logs and the help-doc table
 * (帮助文档→版本与更新). Classification rides the thrown `UpdateFault.code`,
 * never string parsing of messages.
 *
 * - U-01 通道未发布（channel Release 404）
 * - U-02 网络失败（fetch 层 TypeError）
 * - U-03 通道数据异常（其他 HTTP / manifest 缺失 / 解析失败）
 * - U-04 安全校验拒绝（签名 / key / 完整性）
 */
export type UpdateFaultCode = 'U-01' | 'U-02' | 'U-03' | 'U-04'

/** An updater failure carrying its fault code. */
export class UpdateFault extends Error {
  constructor(readonly code: UpdateFaultCode, message: string) {
    super(message)
    this.name = 'UpdateFault'
  }
}

/**
 * Classify any thrown value from the update path into a fault code.
 * @param error - whatever the updater threw.
 * @returns the fault code (U-03 is the catch-all for the abnormal-channel
 * bucket — anything unrecognized still maps to a code the card can show).
 */
export function classifyUpdateError(error: unknown): UpdateFaultCode {
  if (error instanceof UpdateFault) return error.code
  // Node fetch surfaces network-layer failures as TypeError('fetch failed').
  if (error instanceof TypeError) return 'U-02'
  return 'U-03'
}

/** One downloadable file on a GitLab release (a release link). */
export type ReleaseAsset = {
  /** The file name the manifest names (`manifest.json`, `baf-plugin-0.0.3.zip`, …). */
  readonly name: string
  /** The download URL. */
  readonly url: string
  /** The byte size, when the release reports one. */
  readonly size?: number
}

/** The GitLab release shape the updater reads. */
type GlRelease = {
  tag_name?: string
  assets?: {
    links?: Array<{
      name?: string
      url?: string
      direct_asset_url?: string
    }>
  }
}

/**
 * The API path of one release.
 * @param config - the GitLab coordinates.
 * @param tag - the release tag.
 * @returns the absolute API URL.
 */
function releaseUrl(config: GitlabUpdateConfig, tag: string): string {
  const host = config.host.replace(/\/+$/, '')
  const project = encodeURIComponent(config.project)
  return `${host}/api/v4/projects/${project}/releases/${encodeURIComponent(tag)}`
}

/**
 * The request headers for the release API. A public project needs no token;
 * the header set stays minimal so a private mirror can add one later.
 * @param _config - the GitLab coordinates (token support reserved).
 * @returns the request headers.
 */
export function gitlabHeaders(_config: GitlabUpdateConfig): Record<string, string> {
  return {
    Accept: 'application/json',
    'User-Agent': 'baf-dsh-updater',
  }
}

/**
 * Fetch one release and read its links.
 * @param config - the GitLab coordinates.
 * @param tag - the release tag.
 * @returns the release's links, keyed by file name.
 * @throws when the release is missing or carries no links.
 */
async function fetchReleaseLinks(
  config: GitlabUpdateConfig,
  tag: string,
): Promise<Map<string, ReleaseAsset>> {
  const res = await fetch(releaseUrl(config, tag), { headers: gitlabHeaders(config) })
  if (!res.ok) {
    if (res.status === 404) {
      throw new UpdateFault(
        'U-01',
        `无法读取更新通道（HTTP 404）。GitLab 项目 ${config.project} 尚未发布 Release「${tag}」；请先在 baf 分支打 tag baf-dsh-v* 并完成发版流水线。`,
      )
    }
    throw new UpdateFault('U-03', `无法读取更新通道（HTTP ${String(res.status)}）`)
  }
  const release = await res.json() as GlRelease
  const assets = new Map<string, ReleaseAsset>()
  for (const link of release.assets?.links ?? []) {
    if (link.name === undefined) continue
    const url = link.direct_asset_url ?? link.url
    if (url === undefined) continue
    assets.set(link.name, { name: link.name, url })
  }
  return assets
}

/**
 * Fetch the channel release and parse its manifest (+ optional signature).
 * @param config - the GitLab coordinates.
 * @returns the verified manifest.
 */
export async function fetchChannelManifest(config: GitlabUpdateConfig): Promise<UpdateManifest> {
  const assets = await fetchReleaseLinks(config, config.channelTag)
  const manifestAsset = assets.get('manifest.json')
  if (manifestAsset === undefined) {
    throw new UpdateFault('U-03', '更新通道缺少 manifest.json')
  }
  const manifestBuf = await downloadAssetBuffer(manifestAsset)
  const parsed = parseManifest(JSON.parse(manifestBuf.toString('utf8')) as unknown)
  if (!parsed.ok) throw new UpdateFault('U-03', parsed.error)

  // §11.3: 验签后才解释 signed 字段（issuedAt/expiresAt/releaseEpoch 的
  // policy 检查在 plan 阶段跑）。生产缺签名/错 key/签名不匹配直接拒绝。
  const policy = signaturePolicy()
  const sigAsset = assets.get(parsed.value.signature.asset)
  if (policy.required) {
    if (sigAsset === undefined) throw new UpdateFault('U-04', `更新通道缺少 ${parsed.value.signature.asset}`)
    const key = findSigningKey(parsed.value.signature.keyId)
    if (key === undefined) {
      throw new UpdateFault('U-04', `manifest 签名 keyId「${parsed.value.signature.keyId}」未注册（拒绝）`)
    }
    if (key.testOnly && !policy.allowTestKeys) {
      throw new UpdateFault('U-04', 'manifest 使用测试签名 key（生产构建拒绝）')
    }
    const sig = await downloadAssetBuffer(sigAsset)
    if (!verifyManifestSignature(manifestBuf, sig, key)) {
      throw new UpdateFault('U-04', 'manifest 签名校验失败')
    }
  }

  return parsed.value
}

/**
 * Resolve an artifact from the versioned release named by the manifest tag.
 * @param config - the GitLab coordinates.
 * @param tag - release tag (e.g. baf-dsh-v0.1.0).
 * @param artifact - artifact descriptor from the manifest.
 * @returns the release link that carries the file.
 */
export async function resolveReleaseAsset(
  config: GitlabUpdateConfig,
  tag: string,
  artifact: ManifestArtifact,
): Promise<ReleaseAsset> {
  const assets = await fetchReleaseLinks(config, tag)
  const asset = assets.get(artifact.name)
  if (asset === undefined) {
    throw new Error(`Release ${tag} 缺少资产 ${artifact.name}`)
  }
  return asset
}

/**
 * Download a release asset to a file and verify sha256.
 * @param asset - the release link metadata.
 * @param destPath - local destination path.
 * @param expectedSha256 - hex digest.
 */
export async function downloadAssetToFile(
  asset: ReleaseAsset,
  destPath: string,
  expectedSha256: string,
): Promise<void> {
  mkdirSync(dirname(destPath), { recursive: true })
  const buf = await downloadAssetBuffer(asset)
  const actual = createHash('sha256').update(buf).digest('hex')
  if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new UpdateFault('U-04', `校验失败：${asset.name}`)
  }
  writeFileSync(destPath, buf)
}

/**
 * Download one release asset into memory.
 * @param asset - the release link metadata.
 * @returns the file bytes.
 */
export async function downloadAssetBuffer(asset: ReleaseAsset): Promise<Buffer> {
  const res = await fetch(asset.url, { redirect: 'follow' })
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
 * @param signingKey - the registered key the descriptor named (keyId-bound).
 */
export function verifyManifestSignature(manifestBytes: Buffer, signature: Buffer, signingKey: UpdateSigningKey): boolean {
  try {
    const key = createPublicKey(signingKey.publicKeyPem)
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
 * @param asset - the release link metadata.
 * @param destPath - local destination path.
 */
export async function downloadAssetStreaming(
  asset: ReleaseAsset,
  destPath: string,
): Promise<void> {
  mkdirSync(dirname(destPath), { recursive: true })
  const res = await fetch(asset.url, { redirect: 'follow' })
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
