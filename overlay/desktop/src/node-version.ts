export const NODE_ENGINE_RANGE = '^22.19.0 || >=24.0.0'

/**
 * True when `version` satisfies the harness engines range (`^22.19.0 || >=24.0.0`).
 * Accepts `v22.19.0` or `22.19.0`. Node 23 is not in range.
 */
export function isSupportedNodeVersion(version: string): boolean {
  const trimmed = version.trim().replace(/^v/i, '')
  const [majorText, minorText] = trimmed.split('.')
  const major = Number.parseInt(majorText ?? '', 10)
  const minor = Number.parseInt(minorText ?? '0', 10)
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return false
  if (major === 22 && minor >= 19) return true
  if (major >= 24) return true
  return false
}
