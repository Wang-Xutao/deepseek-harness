/**
 * Compare loose product versions (supports trailing -rc.N).
 * @param a - left version.
 * @param b - right version.
 * @returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < 3; i++) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] - pb.nums[i]
  }
  // Release without prerelease is newer than same numbers with prerelease.
  if (pa.pre === undefined && pb.pre === undefined) return 0
  if (pa.pre === undefined) return 1
  if (pb.pre === undefined) return -1
  if (pa.pre.kind !== pb.pre.kind) return pa.pre.kind < pb.pre.kind ? -1 : 1
  return pa.pre.n - pb.pre.n
}

/**
 * @param a - local version.
 * @param b - remote version.
 * @returns true when remote is strictly newer.
 */
export function isNewer(remote: string, local: string): boolean {
  return compareVersions(remote, local) > 0
}

type Parsed = {
  nums: [number, number, number]
  pre?: { kind: string, n: number }
}

function parse(v: string): Parsed {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z]+)\.?(\d+))?$/.exec(v.trim())
  if (m === null) {
    return { nums: [0, 0, 0] }
  }
  const nums: [number, number, number] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (m[4] !== undefined && m[5] !== undefined) {
    return { nums, pre: { kind: m[4].toLowerCase(), n: Number(m[5]) } }
  }
  return { nums }
}
