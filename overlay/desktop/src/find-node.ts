import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { isSupportedNodeVersion } from './node-version.ts'

export interface NodeProbe {
  exists(path: string): boolean
  version(path: string): string | undefined
}

const defaultProbe: NodeProbe = {
  exists: existsSync,
  version(path) {
    const result = spawnSync(path, ['-v'], { encoding: 'utf8', windowsHide: true })
    if (result.status !== 0) return undefined
    const text = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    return text.length > 0 ? text.split(/\r?\n/, 1)[0] : undefined
  },
}

/**
 * Candidate node binaries: explicit override, PATH, then Windows default install locations.
 */
export function collectNodeCandidates(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const binaryName = platform === 'win32' ? 'node.exe' : 'node'
  const seen = new Set<string>()
  const out: string[] = []
  const add = (candidate: string): void => {
    if (candidate.length === 0 || seen.has(candidate)) return
    seen.add(candidate)
    out.push(candidate)
  }
  if (env.DSH_NODE_BINARY) add(env.DSH_NODE_BINARY)
  const pathEnv = env.PATH ?? env.Path ?? ''
  for (const dir of pathEnv.split(delimiter)) add(join(dir, binaryName))
  if (platform === 'win32') {
    add(join(env.ProgramFiles ?? 'C:\\Program Files', 'nodejs', binaryName))
    if (env.LOCALAPPDATA) add(join(env.LOCALAPPDATA, 'Programs', 'nodejs', binaryName))
  }
  return out
}

/**
 * First existing candidate whose `node -v` satisfies the harness engines range.
 */
export function findSupportedNode(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  probe: NodeProbe = defaultProbe,
): string | undefined {
  for (const candidate of collectNodeCandidates(env, platform)) {
    if (!probe.exists(candidate)) continue
    const version = probe.version(candidate)
    if (version !== undefined && isSupportedNodeVersion(version)) return candidate
  }
  return undefined
}
