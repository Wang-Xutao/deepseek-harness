/** Registry lookups and range checks for featured-plugin updates. */

/** Registries a latest-version lookup asks, in order. */
export const VERSION_REGISTRIES = ['https://registry.npmmirror.com', 'https://registry.npmjs.org'] as const

/** One bound for an HTTP lookup, matching the plugin manager's inspect bound. */
export const LOOKUP_TIMEOUT_MS = 10_000

/**
 * Compare two versions by numeric core parts, then prerelease presence: a
 * prerelease sorts below its release. Non-numeric segments compare
 * lexicographically, which orders the shapes the curated manifest pins.
 * @param left First version.
 * @param right Second version.
 * @returns Negative, zero, or positive as `left` sorts before, with, or after `right`.
 */
export function compareVersions(left: string, right: string): number {
  const split = (version: string): { core: string[]; prerelease: string[] } => {
    const dash = version.indexOf('-')
    const core = (dash === -1 ? version : version.slice(0, dash)).split('.')
    const prerelease = dash === -1 ? [] : version.slice(dash + 1).split('.')
    return { core, prerelease }
  }
  const a = split(left)
  const b = split(right)
  const length = Math.max(a.core.length, b.core.length)
  for (let index = 0; index < length; index++) {
    const leftPart = a.core[index] ?? '0'
    const rightPart = b.core[index] ?? '0'
    const leftNum = /^\d+$/.test(leftPart) ? Number(leftPart) : undefined
    const rightNum = /^\d+$/.test(rightPart) ? Number(rightPart) : undefined
    if (leftNum !== undefined && rightNum !== undefined) {
      if (leftNum !== rightNum) return leftNum - rightNum
    } else {
      const compared = leftPart.localeCompare(rightPart)
      if (compared !== 0) return compared
    }
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0
  if (a.prerelease.length === 0) return 1
  if (b.prerelease.length === 0) return -1
  return a.prerelease.join('.').localeCompare(b.prerelease.join('.'))
}

/**
 * Whether a version satisfies the curated range. Exact pins compare equal;
 * `^` ranges run from the pinned base (inclusive) up to the next minor when
 * the base is below 1.0.0, else the next major, with prereleases of an
 * admitted release admitted too.
 * @param range The manifest entry's `version` value.
 * @param version The version a registry offered.
 * @returns Whether installing `range` could select `version`.
 */
export function rangeSatisfies(range: string, version: string): boolean {
  if (!range.startsWith('^')) return range === version
  const base = range.slice(1)
  if (compareVersions(version, base) < 0) return false
  const dash = base.indexOf('-')
  const [major, minor, patch] = (dash === -1 ? base : base.slice(0, dash)).split('.').map(Number)
  if (major === undefined || minor === undefined || patch === undefined
    || ![major, minor, patch].every(Number.isInteger)) return false
  const ceiling = major === 0 ? `${String(major)}.${String(minor + 1)}.0` : `${String(major + 1)}.0.0`
  return compareVersions(version, ceiling) < 0
}

/**
 * Look up the newest version a registry offers for a package.
 * @param pkg Registry package name.
 * @param registries URLs to ask, in order; the first that answers wins.
 * @param fetchImpl Fetch implementation, overridable for tests.
 * @returns The version the first answering registry named, or undefined when none answered.
 */
export async function fetchLatestVersion(
  pkg: string,
  registries: readonly string[] = VERSION_REGISTRIES,
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  for (const registry of registries) {
    try {
      const response = await fetchImpl(`${registry}/${pkg}/latest`, {
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
        headers: { accept: 'application/json' },
      })
      if (!response.ok) continue
      const answer: unknown = await response.json()
      if (typeof answer === 'object' && answer !== null) {
        const version = (answer as { version?: unknown }).version
        if (typeof version === 'string' && version !== '') return version
      }
    } catch {
      // One registry's failure just asks the next.
    }
  }
  return undefined
}
