import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Local product versions persisted under Electron userData. */
export type AppVersions = {
  bafDsh: string
  dsh: string
  bafPlugin: string
}

export const DEFAULT_VERSIONS: AppVersions = {
  bafDsh: '0.0.3',
  dsh: '0.1.0-rc.8',
  bafPlugin: '0.0.1',
}

/**
 * @param raw - unknown JSON value.
 * @returns a sanitized versions object.
 */
export function parseVersions(raw: unknown): AppVersions {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULT_VERSIONS }
  const o = raw as Record<string, unknown>
  return {
    bafDsh: typeof o.bafDsh === 'string' && o.bafDsh.length > 0 ? o.bafDsh : DEFAULT_VERSIONS.bafDsh,
    dsh: typeof o.dsh === 'string' && o.dsh.length > 0 ? o.dsh : DEFAULT_VERSIONS.dsh,
    bafPlugin: typeof o.bafPlugin === 'string' && o.bafPlugin.length > 0 ? o.bafPlugin : DEFAULT_VERSIONS.bafPlugin,
  }
}

/**
 * @param userData - Electron `app.getPath('userData')`.
 * @returns path to versions.json.
 */
export function versionsPath(userData: string): string {
  return join(userData, 'versions.json')
}

/**
 * Load versions from disk, or seed from packaged defaults when missing.
 * @param userData - userData directory.
 * @param seed - values written on first launch (from package embeds).
 */
export function loadVersions(userData: string, seed: AppVersions = DEFAULT_VERSIONS): AppVersions {
  const path = versionsPath(userData)
  try {
    if (!existsSync(path)) {
      saveVersions(userData, seed)
      return { ...seed }
    }
    return parseVersions(JSON.parse(readFileSync(path, 'utf8')) as unknown)
  } catch {
    return { ...seed }
  }
}

/**
 * Persist versions.json.
 * @param userData - userData directory.
 * @param next - versions to write.
 */
export function saveVersions(userData: string, next: AppVersions): void {
  const path = versionsPath(userData)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
}
