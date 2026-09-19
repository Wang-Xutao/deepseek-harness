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
 * Compare two `MAJOR.MINOR.PATCH` semver strings (no pre-release).
 * Returns negative if `a < b`, 0 if equal, positive if `a > b`.
 * Non-numeric / malformed segments fall back to `0` so a corrupt value
 * never blocks a newer embed from advancing the stored version.
 * @param a - left version.
 * @param b - right version.
 */
function compareSemver(a: string, b: string): number {
  const parse = (v: string): [number, number, number] => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v)
    if (m === null) return [0, 0, 0]
    return [Number(m[1]), Number(m[2]), Number(m[3])]
  }
  const [a1, a2, a3] = parse(a)
  const [b1, b2, b3] = parse(b)
  if (a1 !== b1) return a1 - b1
  if (a2 !== b2) return a2 - b2
  return a3 - b3
}

/**
 * Load versions from disk, or seed from packaged defaults when missing.
 *
 * Re-seeding policy (single source of truth for `baf-dsh` desktop bump):
 * - `bafDsh` (desktop shell) — **always** taken from the package embed. The
 *   version the user sees in Settings must be the binary they are running;
 *   persisting a stale value across upgrades was the root cause of
 *   `baf-dsh-Setup-0.0.15.exe` reporting `0.0.11` after upgrade.
 * - `dsh` and the 7 BAF package versions — taken from the embed whenever
 *   the embedded value advances (semver greater-than) over the persisted
 *   one, so a re-bumped package propagates without nuking other state.
 *   When the persisted value is newer (e.g. user side-loaded a preview
 *   build) we keep it.
 * - `bafPlugin` and `*Notes` — preserved as-is; notes only ship with
 *   bumps and are append-only history.
 * @param userData - userData directory.
 * @param seed - values written on first launch (from package embeds).
 */
export function loadVersions(userData: string, seed: AppVersions = DEFAULT_VERSIONS): AppVersions {
  const path = versionsPath(userData)
  if (!existsSync(path)) {
    saveVersions(userData, seed)
    return { ...seed }
  }
  let parsed: AppVersions
  try {
    parsed = parseVersions(JSON.parse(readFileSync(path, 'utf8')) as unknown)
  } catch {
    return { ...seed }
  }
  // `bafDsh` is the desktop shell — always reflect the running binary.
  const bafDsh = seed.bafDsh
  const dsh = compareSemver(seed.dsh, parsed.dsh) > 0 ? seed.dsh : parsed.dsh
  const pickAdvanced = (next: string | undefined, prev: string | undefined): string | undefined => {
    if (next === undefined) return prev
    if (prev === undefined) return next
    return compareSemver(next, prev) > 0 ? next : prev
  }
  return {
    ...parsed,
    bafDsh,
    dsh,
    bafPlugin: parsed.bafPlugin,
    bafCore: pickAdvanced(seed.bafCore, parsed.bafCore),
    bafWorkflow: pickAdvanced(seed.bafWorkflow, parsed.bafWorkflow),
    bafOpenspec: pickAdvanced(seed.bafOpenspec, parsed.bafOpenspec),
    bafStandard: pickAdvanced(seed.bafStandard, parsed.bafStandard),
    bafQuality: pickAdvanced(seed.bafQuality, parsed.bafQuality),
    bafGuard: pickAdvanced(seed.bafGuard, parsed.bafGuard),
    bafScaffold: pickAdvanced(seed.bafScaffold, parsed.bafScaffold),
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