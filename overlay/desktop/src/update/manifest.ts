/** One downloadable artifact described by the channel manifest. */
export type ManifestArtifact = {
  name: string
  sha256: string
  size: number
}

/** Ed25519 signature descriptor (§11.2) — verification itself lives in github.ts. */
export type ManifestSignature = {
  algorithm: 'ed25519'
  keyId: string
  asset: string
}

/**
 * Stable-channel update manifest, schema 2 (§11.2).
 *
 * `issuedAt`/`expiresAt`/`releaseEpoch` are signed fields: they are only
 * interpreted AFTER the signature verifies (§11.2), via
 * {@link checkManifestPolicy}. `minShell` is the harness minimum version
 * (harness 最低版本); `force` marks a mandatory security update (强制安全).
 */
export type UpdateManifest = {
  schema: 2
  channel: string
  tag: string
  /** Signed validity window start (ISO 8601). */
  issuedAt: string
  /** Signed validity window end (ISO 8601). */
  expiresAt: string
  /** Monotonic release counter — guards replay of old-but-valid manifests. */
  releaseEpoch: number
  bafDsh: string
  dsh: string
  bafPlugin: string
  bafPreset: string
  baseline: string
  presetSchema: number
  minShell: string
  compatibility: {
    minDsh: string
    maxDsh: string
  }
  force: boolean
  notesZh: string
  artifacts: {
    plugin?: ManifestArtifact
    runtime?: ManifestArtifact
    shell?: ManifestArtifact
  }
  systemResources: readonly string[]
  rollback: {
    supported: boolean
    minimumVersion: string
  }
  signature: ManifestSignature
}

const SHA256_RE = /^[a-f0-9]{64}$/i
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/

function isArtifact(raw: unknown): raw is ManifestArtifact {
  if (raw === null || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  return typeof o.name === 'string'
    && o.name.length > 0
    && typeof o.sha256 === 'string'
    && SHA256_RE.test(o.sha256)
    && typeof o.size === 'number'
    && Number.isFinite(o.size)
    && o.size >= 0
}

/**
 * Parse and validate a channel manifest (schema 2 only — §11.2: 缺字段/坏类型
 * 拒绝; the schema-1 shape has no signature and is rejected outright).
 * @param raw - JSON value.
 * @returns the manifest or an error message.
 */
export function parseManifest(raw: unknown): { ok: true, value: UpdateManifest } | { ok: false, error: string } {
  if (raw === null || typeof raw !== 'object') return { ok: false, error: 'manifest 不是对象' }
  const o = raw as Record<string, unknown>
  if (o.schema !== 2) return { ok: false, error: 'manifest.schema 必须为 2' }
  const requireString = (key: string): string | undefined => {
    const v = o[key]
    return typeof v === 'string' && v.length > 0 ? v : undefined
  }
  const channel = requireString('channel')
  const tag = requireString('tag')
  const issuedAt = requireString('issuedAt')
  const expiresAt = requireString('expiresAt')
  const bafDsh = requireString('bafDsh')
  const dsh = requireString('dsh')
  const bafPlugin = requireString('bafPlugin')
  const bafPreset = requireString('bafPreset')
  const baseline = requireString('baseline')
  const minShell = requireString('minShell')
  const notesZh = typeof o.notesZh === 'string' ? o.notesZh : ''
  if (!channel || !tag || !issuedAt || !expiresAt || !bafDsh || !dsh || !bafPlugin || !bafPreset || !baseline || !minShell) {
    return { ok: false, error: 'manifest 缺少必填字段' }
  }
  if (!ISO_RE.test(issuedAt) || !ISO_RE.test(expiresAt)) {
    return { ok: false, error: 'manifest.issuedAt/expiresAt 必须为 ISO 8601' }
  }
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    return { ok: false, error: 'manifest.expiresAt 必须晚于 issuedAt' }
  }
  const releaseEpoch = o.releaseEpoch
  if (typeof releaseEpoch !== 'number' || !Number.isInteger(releaseEpoch) || releaseEpoch < 1) {
    return { ok: false, error: 'manifest.releaseEpoch 必须为正整数' }
  }
  const presetSchema = o.presetSchema
  if (typeof presetSchema !== 'number' || !Number.isInteger(presetSchema) || presetSchema < 0) {
    return { ok: false, error: 'manifest.presetSchema 必须为非负整数' }
  }
  if (!tag.startsWith('baf-dsh-v')) return { ok: false, error: 'manifest.tag 必须以 baf-dsh-v 开头' }
  for (const [key, value] of [['bafDsh', bafDsh], ['dsh', dsh], ['bafPlugin', bafPlugin], ['minShell', minShell]] as const) {
    if (!SEMVER_RE.test(value)) return { ok: false, error: `manifest.${key} 必须为 semver` }
  }
  const compatibilityRaw = o.compatibility
  if (compatibilityRaw === null || typeof compatibilityRaw !== 'object') {
    return { ok: false, error: 'manifest.compatibility 无效' }
  }
  const c = compatibilityRaw as Record<string, unknown>
  const minDsh = typeof c.minDsh === 'string' && SEMVER_RE.test(c.minDsh) ? c.minDsh : undefined
  const maxDsh = typeof c.maxDsh === 'string' && (c.maxDsh === '*' || SEMVER_RE.test(c.maxDsh)) ? c.maxDsh : undefined
  if (minDsh === undefined || maxDsh === undefined) {
    return { ok: false, error: 'manifest.compatibility.minDsh/maxDsh 必须为 semver（maxDsh 可为 *）' }
  }
  const artifactsRaw = o.artifacts
  if (artifactsRaw === null || typeof artifactsRaw !== 'object') {
    return { ok: false, error: 'manifest.artifacts 无效' }
  }
  const a = artifactsRaw as Record<string, unknown>
  const artifacts: UpdateManifest['artifacts'] = {}
  for (const key of ['plugin', 'runtime', 'shell'] as const) {
    if (a[key] === undefined) continue
    if (!isArtifact(a[key])) return { ok: false, error: `manifest.artifacts.${key} 无效` }
    artifacts[key] = a[key]
  }
  const systemResourcesRaw = o.systemResources
  if (!Array.isArray(systemResourcesRaw) || systemResourcesRaw.some(v => typeof v !== 'string' || v.length === 0)) {
    return { ok: false, error: 'manifest.systemResources 必须为非空字符串数组' }
  }
  const rollbackRaw = o.rollback
  if (rollbackRaw === null || typeof rollbackRaw !== 'object') {
    return { ok: false, error: 'manifest.rollback 无效' }
  }
  const r = rollbackRaw as Record<string, unknown>
  if (typeof r.supported !== 'boolean') return { ok: false, error: 'manifest.rollback.supported 必须为布尔' }
  const minimumVersion = typeof r.minimumVersion === 'string' && (r.minimumVersion === '*' || SEMVER_RE.test(r.minimumVersion))
    ? r.minimumVersion
    : undefined
  if (minimumVersion === undefined) return { ok: false, error: 'manifest.rollback.minimumVersion 必须为 semver 或 *' }
  const signatureRaw = o.signature
  if (signatureRaw === null || typeof signatureRaw !== 'object') {
    return { ok: false, error: 'manifest.signature 无效（生产强制 Ed25519 签名）' }
  }
  const s = signatureRaw as Record<string, unknown>
  if (s.algorithm !== 'ed25519') return { ok: false, error: 'manifest.signature.algorithm 必须为 ed25519' }
  const keyId = typeof s.keyId === 'string' && s.keyId.length > 0 ? s.keyId : undefined
  const asset = typeof s.asset === 'string' && s.asset.length > 0 ? s.asset : undefined
  if (keyId === undefined || asset === undefined) {
    return { ok: false, error: 'manifest.signature.keyId/asset 缺失' }
  }
  return {
    ok: true,
    value: {
      schema: 2,
      channel,
      tag,
      issuedAt,
      expiresAt,
      releaseEpoch,
      bafDsh,
      dsh,
      bafPlugin,
      bafPreset,
      baseline,
      presetSchema,
      minShell,
      compatibility: { minDsh, maxDsh },
      force: o.force === true,
      notesZh,
      artifacts,
      systemResources: systemResourcesRaw as string[],
      rollback: { supported: r.supported, minimumVersion },
      signature: { algorithm: 'ed25519', keyId, asset },
    },
  }
}

/**
 * Signed-field policy check (§11.2): validity window against a trusted clock
 * with bounded skew, and monotonic `releaseEpoch`. Runs only AFTER the
 * signature verifies — these fields are only as trustworthy as the bytes
 * they were signed over. Offline packages follow the same rules unless the
 * administrator provides a separately-signed exception (`offlineException`).
 * @param manifest - verified schema-2 manifest.
 * @param policy - trusted clock (`now`), allowed skew, the last applied
 *   `releaseEpoch` when known, and the offline-exception flag.
 * @returns ok, or a machine-readable refusal reason.
 */
export function checkManifestPolicy(
  manifest: UpdateManifest,
  policy: { now: Date; skewMs: number; lastReleaseEpoch?: number; offlineException?: boolean },
): { ok: true } | { ok: false; reason: 'clock_unavailable' | 'not_yet_valid' | 'expired' | 'epoch_regression'; error: string } {
  const nowMs = policy.now.getTime()
  if (!Number.isFinite(nowMs)) {
    return { ok: false, reason: 'clock_unavailable', error: '可信时钟不可用，阻断 apply' }
  }
  const issuedMs = Date.parse(manifest.issuedAt)
  const expiresMs = Date.parse(manifest.expiresAt)
  if (!Number.isFinite(issuedMs) || !Number.isFinite(expiresMs)) {
    return { ok: false, reason: 'clock_unavailable', error: 'manifest 有效期不可解析' }
  }
  if (nowMs < issuedMs - policy.skewMs) {
    return { ok: false, reason: 'not_yet_valid', error: `manifest 尚未生效（issuedAt ${manifest.issuedAt}）` }
  }
  const expired = nowMs > expiresMs + policy.skewMs
  if (expired && policy.offlineException !== true) {
    return { ok: false, reason: 'expired', error: `manifest 已过期（expiresAt ${manifest.expiresAt}）` }
  }
  if (policy.lastReleaseEpoch !== undefined && manifest.releaseEpoch < policy.lastReleaseEpoch) {
    return {
      ok: false,
      reason: 'epoch_regression',
      error: `manifest.releaseEpoch ${manifest.releaseEpoch} 低于已应用 epoch ${policy.lastReleaseEpoch}（拒绝重放）`,
    }
  }
  return { ok: true }
}
