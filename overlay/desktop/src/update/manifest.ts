/** One downloadable artifact described by the channel manifest. */
export type ManifestArtifact = {
  name: string
  sha256: string
  size: number
}

/** Stable-channel update manifest published on GitHub Releases. */
export type UpdateManifest = {
  channel: string
  publishedAt: string
  tag: string
  bafDsh: string
  dsh: string
  bafPlugin: string
  minShell: string
  force: boolean
  notesZh: string
  artifacts: {
    plugin?: ManifestArtifact
    runtime?: ManifestArtifact
    shell?: ManifestArtifact
  }
}

const SHA256_RE = /^[a-f0-9]{64}$/i

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
 * Parse and validate a channel manifest.
 * @param raw - JSON value.
 * @returns the manifest or an error message.
 */
export function parseManifest(raw: unknown): { ok: true, value: UpdateManifest } | { ok: false, error: string } {
  if (raw === null || typeof raw !== 'object') return { ok: false, error: 'manifest 不是对象' }
  const o = raw as Record<string, unknown>
  const requireString = (key: string): string | undefined => {
    const v = o[key]
    return typeof v === 'string' && v.length > 0 ? v : undefined
  }
  const channel = requireString('channel')
  const publishedAt = requireString('publishedAt')
  const tag = requireString('tag')
  const bafDsh = requireString('bafDsh')
  const dsh = requireString('dsh')
  const bafPlugin = requireString('bafPlugin')
  const minShell = requireString('minShell')
  const notesZh = typeof o.notesZh === 'string' ? o.notesZh : ''
  if (!channel || !publishedAt || !tag || !bafDsh || !dsh || !bafPlugin || !minShell) {
    return { ok: false, error: 'manifest 缺少必填字段' }
  }
  if (!tag.startsWith('baf-dsh-v')) return { ok: false, error: 'manifest.tag 必须以 baf-dsh-v 开头' }
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
  return {
    ok: true,
    value: {
      channel,
      publishedAt,
      tag,
      bafDsh,
      dsh,
      bafPlugin,
      minShell,
      force: o.force === true,
      notesZh,
      artifacts,
    },
  }
}
