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
  bafOpenspec?: string
  bafStandard?: string
  bafQuality?: string
  bafGuard?: string
  bafScaffold?: string
  bafDshNotes?: string
  dshNotes?: string
  bafCoreNotes?: string
  bafWorkflowNotes?: string
  bafOpenspecNotes?: string
  bafStandardNotes?: string
  bafQualityNotes?: string
  bafGuardNotes?: string
  bafScaffoldNotes?: string
}

export const DEFAULT_VERSIONS: AppVersions = {
  bafDsh: '0.0.9',
  dsh: '0.1.3-alpha.1',
  bafPlugin: '0.0.2',
  bafCore: '0.1.0',
  bafWorkflow: '0.1.0',
  bafOpenspec: '0.1.0',
  bafStandard: '0.1.0',
  bafQuality: '0.1.0',
  bafGuard: '0.1.0',
  bafScaffold: '0.1.0',
  bafDshNotes: 'Phase 4 工作流 Tab 半交互；设置版本明细与独立 bump；splash/通用设置打磨',
  dshNotes: '上游 DeepSeek Harness 运行时（会话、工具、Web GUI）',
  bafCoreNotes: 'baseline loader、adapter stub、bafCore isolate 挂载',
  bafWorkflowNotes: 'projection、intake、transition、工作流 Tab Remote',
  bafOpenspecNotes: 'OpenSpec 本地文件适配器',
  bafStandardNotes: 'baseline 摘要 + 提示词渲染',
  bafQualityNotes: 'C 栈质量执行器：build/test/coverage',
  bafGuardNotes: '工具调用硬门禁：fs/shell 裁决 + 密钥扫描',
  bafScaffoldNotes: '工作区 init 骨架：基线模板 + openspec 目录',
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
  const optStr = (key: keyof AppVersions): string | undefined => str(key, undefined)
  const out: AppVersions = {
    bafDsh: str('bafDsh', DEFAULT_VERSIONS.bafDsh) ?? DEFAULT_VERSIONS.bafDsh,
    dsh: str('dsh', DEFAULT_VERSIONS.dsh) ?? DEFAULT_VERSIONS.dsh,
    bafPlugin: str('bafPlugin', DEFAULT_VERSIONS.bafPlugin) ?? DEFAULT_VERSIONS.bafPlugin,
  }
  for (const key of [
    'bafCore', 'bafWorkflow', 'bafOpenspec', 'bafStandard', 'bafQuality', 'bafGuard', 'bafScaffold',
  ] as const) {
    const v = optStr(key)
    if (v !== undefined) out[key] = v
  }
  for (const key of [
    'bafDshNotes', 'dshNotes', 'bafCoreNotes', 'bafWorkflowNotes',
    'bafOpenspecNotes', 'bafStandardNotes', 'bafQualityNotes', 'bafGuardNotes', 'bafScaffoldNotes',
  ] as const) {
    const v = optStr(key)
    if (v !== undefined) out[key] = v
  }
  return out
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
      bafOpenspec: seed.bafOpenspec ?? parsed.bafOpenspec,
      bafStandard: seed.bafStandard ?? parsed.bafStandard,
      bafQuality: seed.bafQuality ?? parsed.bafQuality,
      bafGuard: seed.bafGuard ?? parsed.bafGuard,
      bafScaffold: seed.bafScaffold ?? parsed.bafScaffold,
      bafDshNotes: seed.bafDshNotes ?? parsed.bafDshNotes,
      dshNotes: seed.dshNotes ?? parsed.dshNotes,
      bafCoreNotes: seed.bafCoreNotes ?? parsed.bafCoreNotes,
      bafWorkflowNotes: seed.bafWorkflowNotes ?? parsed.bafWorkflowNotes,
      bafOpenspecNotes: seed.bafOpenspecNotes ?? parsed.bafOpenspecNotes,
      bafStandardNotes: seed.bafStandardNotes ?? parsed.bafStandardNotes,
      bafQualityNotes: seed.bafQualityNotes ?? parsed.bafQualityNotes,
      bafGuardNotes: seed.bafGuardNotes ?? parsed.bafGuardNotes,
      bafScaffoldNotes: seed.bafScaffoldNotes ?? parsed.bafScaffoldNotes,
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