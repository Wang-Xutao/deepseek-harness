import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Local product versions persisted under Electron userData.
 * `bafPlugin` remains for update-channel plugin zip identity; Settings UI
 * lists individual BAF packages instead of this aggregate field.
 */
export type AppVersions = {
  bafDsh: string
  dsh: string
  bafPlugin: string
  bafCore?: string
  bafWorkflow?: string
  bafDshNotes?: string
  dshNotes?: string
  bafCoreNotes?: string
  bafWorkflowNotes?: string
}

export const DEFAULT_VERSIONS: AppVersions = {
  bafDsh: '0.0.8',
  dsh: '0.1.3-alpha.1',
  bafPlugin: '0.0.2',
  bafCore: '0.1.0',
  bafWorkflow: '0.1.0',
  bafDshNotes: 'Phase 3–4：route 解析、工作流 Tab、intake/projection、BAF 斜杠指令',
  dshNotes: '上游 DeepSeek Harness 运行时（会话、工具、Web GUI）',
  bafCoreNotes: 'baseline loader、adapter stub、bafCore isolate 挂载',
  bafWorkflowNotes: 'projection、intake、transition、工作流 Tab Remote',
}

/**
 * @param raw - unknown JSON value.
 * @returns a sanitized versions object.
 */
export function parseVersions(raw: unknown): AppVersions {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULT_VERSIONS }
  const o = raw as Record<string, unknown>
  const str = (key: keyof AppVersions, fallback: string | undefined): string | undefined => {
    const v = o[key]
    return typeof v === 'string' && v.length > 0 ? v : fallback
  }
  return {
    bafDsh: str('bafDsh', DEFAULT_VERSIONS.bafDsh) ?? DEFAULT_VERSIONS.bafDsh,
    dsh: str('dsh', DEFAULT_VERSIONS.dsh) ?? DEFAULT_VERSIONS.dsh,
    bafPlugin: str('bafPlugin', DEFAULT_VERSIONS.bafPlugin) ?? DEFAULT_VERSIONS.bafPlugin,
    ...(str('bafCore', DEFAULT_VERSIONS.bafCore) !== undefined
      ? { bafCore: str('bafCore', DEFAULT_VERSIONS.bafCore) }
      : {}),
    ...(str('bafWorkflow', DEFAULT_VERSIONS.bafWorkflow) !== undefined
      ? { bafWorkflow: str('bafWorkflow', DEFAULT_VERSIONS.bafWorkflow) }
      : {}),
    ...(str('bafDshNotes', DEFAULT_VERSIONS.bafDshNotes) !== undefined
      ? { bafDshNotes: str('bafDshNotes', DEFAULT_VERSIONS.bafDshNotes) }
      : {}),
    ...(str('dshNotes', DEFAULT_VERSIONS.dshNotes) !== undefined
      ? { dshNotes: str('dshNotes', DEFAULT_VERSIONS.dshNotes) }
      : {}),
    ...(str('bafCoreNotes', DEFAULT_VERSIONS.bafCoreNotes) !== undefined
      ? { bafCoreNotes: str('bafCoreNotes', DEFAULT_VERSIONS.bafCoreNotes) }
      : {}),
    ...(str('bafWorkflowNotes', DEFAULT_VERSIONS.bafWorkflowNotes) !== undefined
      ? { bafWorkflowNotes: str('bafWorkflowNotes', DEFAULT_VERSIONS.bafWorkflowNotes) }
      : {}),
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
 * Runtime-facing fields are always re-seeded from the pack.
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
    const parsed = parseVersions(JSON.parse(readFileSync(path, 'utf8')) as unknown)
    return {
      ...parsed,
      dsh: seed.dsh,
      bafCore: seed.bafCore ?? parsed.bafCore,
      bafWorkflow: seed.bafWorkflow ?? parsed.bafWorkflow,
      bafDshNotes: seed.bafDshNotes ?? parsed.bafDshNotes,
      dshNotes: seed.dshNotes ?? parsed.dshNotes,
      bafCoreNotes: seed.bafCoreNotes ?? parsed.bafCoreNotes,
      bafWorkflowNotes: seed.bafWorkflowNotes ?? parsed.bafWorkflowNotes,
    }
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

/**
 * Read desktop VERSION file (source of truth for BAF DSH DESKTOP bump).
 * @param path - absolute path to VERSION.
 * @returns semver string or undefined.
 */
export function readDesktopVersionFile(path: string): string | undefined {
  try {
    if (!existsSync(path)) return undefined
    const text = readFileSync(path, 'utf8').trim()
    return /^\d+\.\d+\.\d+$/.test(text) ? text : undefined
  } catch {
    return undefined
  }
}
