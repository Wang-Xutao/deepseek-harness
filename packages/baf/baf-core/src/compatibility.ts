/**
 * BAF version string and baseline compatibility checks.
 * @module @deepseek-ai/dsh-baf-core/compatibility
 */

/** Package version; keep in sync with package.json. */
export const BAF_VERSION = '0.1.3-alpha.1'

interface ParsedVersion {
  readonly major: number
  readonly minor: number
  readonly patch: number
}

/**
 * Parse a dotted version, ignoring prerelease/build metadata for ordering.
 * @param raw - version string such as `0.1.3-alpha.1` or `0.x`.
 * @returns numeric components, or undefined when unparseable.
 */
export function parseVersion(raw: string): ParsedVersion | undefined {
  const core = raw.trim().split(/[-+]/, 2)[0] ?? ''
  const parts = core.split('.')
  if (parts.length === 0 || parts[0] === '') return undefined
  const major = Number(parts[0])
  if (!Number.isInteger(major) || major < 0) return undefined
  if (parts.length === 2 && parts[1] === 'x') return { major, minor: Number.POSITIVE_INFINITY, patch: Number.POSITIVE_INFINITY }
  if (parts.length === 3 && parts[2] === 'x') {
    const minor = Number(parts[1])
    if (!Number.isInteger(minor) || minor < 0) return undefined
    return { major, minor, patch: Number.POSITIVE_INFINITY }
  }
  const minor = parts.length > 1 ? Number(parts[1]) : 0
  const patch = parts.length > 2 ? Number(parts[2]) : 0
  if (![minor, patch].every(n => Number.isInteger(n) && n >= 0)) return undefined
  return { major, minor, patch }
}

function cmp(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

/**
 * Whether `current` satisfies baseline `bafCompatibility.min` / `max`.
 * `max` may use a trailing `.x` (for example `0.x` ⇒ same major).
 * @param current - running BAF version.
 * @param min - inclusive lower bound.
 * @param max - inclusive upper bound or major/minor wildcard.
 * @returns true when compatible.
 */
export function isBafVersionCompatible(current: string, min: string, max: string): boolean {
  const cur = parseVersion(current)
  const lo = parseVersion(min)
  const hi = parseVersion(max)
  if (cur === undefined || lo === undefined || hi === undefined) return false
  if (cmp(cur, lo) < 0) return false
  if (Number.isFinite(hi.minor) && Number.isFinite(hi.patch)) return cmp(cur, hi) <= 0
  if (!Number.isFinite(hi.minor)) return cur.major === hi.major
  return cur.major === hi.major && cur.minor === hi.minor
}
