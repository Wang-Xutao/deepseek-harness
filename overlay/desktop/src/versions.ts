import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isNewer } from './update/semver.ts'

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

// ---------------------------------------------------------------------------
// InstalledVersions schema 2（§11.6 / enterprise-inputs.md §7 冻结映射）
// ---------------------------------------------------------------------------

/** Placeholder for fields no authority has written yet (baseline on migration, runtime before probe). */
export const UNKNOWN_VERSION = 'unknown'

/**
 * Schema-2 persisted shape — one version identity per update scope.
 *
 * Frozen field mapping (enterprise-inputs.md §7): legacy `bafDsh` →
 * `harness.desktop`; legacy `dsh` → `harness.dsh`; `harness.runtime` is
 * `unknown` until a seed/probe writes it; legacy `bafPlugin` maps ONLY to
 * `plugin.baf` — never guessed into baseline/tool versions; `plugin.
 * presetSchema` starts at 0; every `baseline.*` field is `unknown` on
 * migration.
 */
export interface InstalledVersions {
  readonly schema: 2
  readonly harness: {
    readonly desktop: string
    readonly dsh: string
    readonly runtime: string
  }
  readonly plugin: {
    readonly baf: string
    readonly presetSchema: number
  }
  readonly baseline: {
    readonly id: string
    readonly version: string
    readonly openspec: string
    readonly matt: string
    readonly stack: string
  }
}

/**
 * Strict schema-2 parser — every field must be present and well-typed.
 * Unlike {@link parseVersions} (lenient, for the flat build embed) this
 * returns `undefined` on ANY missing or bad field so the caller falls back
 * to legacy migration or re-seeding; a half-trusted schema-2 file must not
 * be read partially.
 * @param raw - unknown JSON value.
 * @returns the installed versions, or undefined when not schema 2.
 */
export function parseInstalledVersions(raw: unknown): InstalledVersions | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  if (o.schema !== 2) return undefined
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined)
  const harness = o.harness as Record<string, unknown> | undefined
  const plugin = o.plugin as Record<string, unknown> | undefined
  const baseline = o.baseline as Record<string, unknown> | undefined
  if (harness === null || typeof harness !== 'object'
    || plugin === null || typeof plugin !== 'object'
    || baseline === null || typeof baseline !== 'object') return undefined
  const desktop = str(harness.desktop)
  const dsh = str(harness.dsh)
  const runtime = str(harness.runtime)
  const baf = str(plugin.baf)
  if (desktop === undefined || dsh === undefined || runtime === undefined || baf === undefined) return undefined
  if (typeof plugin.presetSchema !== 'number' || !Number.isInteger(plugin.presetSchema) || plugin.presetSchema < 0) {
    return undefined
  }
  const baselineValues = [str(baseline.id), str(baseline.version), str(baseline.openspec), str(baseline.matt), str(baseline.stack)]
  if (baselineValues.some(v => v === undefined)) return undefined
  const [id, version, openspec, matt, stack] = baselineValues as string[]
  return {
    schema: 2,
    harness: { desktop, dsh, runtime },
    plugin: { baf, presetSchema: plugin.presetSchema },
    baseline: { id, version, openspec, matt, stack },
  }
}

/**
 * Explicit legacy → schema 2 migration (§11.6): old three-field flat shape
 * becomes the scoped structure. `bafPlugin` maps only to `plugin.baf`;
 * baseline fields are `unknown` (never guessed); `runtime` is `unknown`
 * until a probe writes it. Idempotent by construction — feeding an
 * already-migrated flat projection through it yields the same values.
 * @param legacy - sanitized flat versions (from {@link parseVersions}).
 * @returns the schema-2 shape.
 */
export function migrateVersions(legacy: AppVersions): InstalledVersions {
  return {
    schema: 2,
    harness: {
      desktop: legacy.bafDsh,
      dsh: legacy.dsh,
      runtime: UNKNOWN_VERSION,
    },
    plugin: {
      baf: legacy.bafPlugin,
      presetSchema: 0,
    },
    baseline: {
      id: UNKNOWN_VERSION,
      version: UNKNOWN_VERSION,
      openspec: UNKNOWN_VERSION,
      matt: UNKNOWN_VERSION,
      stack: UNKNOWN_VERSION,
    },
  }
}

/**
 * Seed authority over the persisted snapshot (§11.6: "dsh 版本始终从
 * packaged/source seed 读取"). `harness.desktop` ships inside the running
 * exe — the embed ALWAYS wins (a stale file once made Setup 0.0.15 report
 * 0.0.11). `harness.dsh` (the hot-swappable runtime): the seed is the floor
 * for the exe's lineage, but a PERSISTED NEWER value is a real runtime
 * hot-update record (apply writes the dir and versions.json together) and
 * must survive relaunch — otherwise every launch would re-detect and
 * re-apply the same runtime update forever. Non-semver garbage on disk
 * falls back to the seed. `plugin.baf` keeps its persisted identity
 * (independent update channel); `runtime`/`baseline` are probe-owned — the
 * embed has no such fields, so the persisted values survive untouched.
 * @param installed - the persisted schema-2 shape.
 * @param seed - build-embedded flat versions.
 * @returns the authoritative schema-2 shape.
 */
function applySeedAuthority(installed: InstalledVersions, seed: AppVersions): InstalledVersions {
  return {
    schema: 2,
    harness: {
      desktop: seed.bafDsh,
      dsh: isNewer(installed.harness.dsh, seed.dsh) ? installed.harness.dsh : seed.dsh,
      runtime: installed.harness.runtime,
    },
    plugin: installed.plugin,
    baseline: installed.baseline,
  }
}

/**
 * Flat view over schema 2 — Settings and `/baf-version` keep reading
 * {@link AppVersions}. The 7 BAF packages and notes live only in the embed
 * (seed-first policy), so they come from the seed directly.
 * @param installed - authoritative schema-2 shape.
 * @param seed - build-embedded flat versions.
 * @returns the flat projection.
 */
function installedToFlat(installed: InstalledVersions, seed: AppVersions): AppVersions {
  return {
    ...seed,
    bafDsh: installed.harness.desktop,
    dsh: installed.harness.dsh,
    bafPlugin: installed.plugin.baf,
  }
}

/** Sibling backup of the legacy file, written once at migration (备份标记). */
function legacyBackupPath(userData: string): string {
  return join(userData, 'versions.legacy.bak')
}

/**
 * Read versions.json as schema 2, migrating legacy flat files on first
 * touch. Migration is explicit and one-way: the legacy bytes are preserved
 * in `versions.legacy.bak`, the schema-2 rewrite lands via temp + rename,
 * and re-reading a migrated file is a plain schema-2 load (idempotent).
 * A corrupt file is NOT overwritten (evidence preserved) — the seed-derived
 * shape is returned unsaved, matching the legacy loader's behavior.
 * @param userData - userData directory.
 * @param seed - build-embedded flat versions.
 * @returns the authoritative schema-2 shape.
 */
export function loadInstalledVersions(userData: string, seed: AppVersions = DEFAULT_VERSIONS): InstalledVersions {
  const path = versionsPath(userData)
  let text: string | undefined
  if (existsSync(path)) {
    try {
      text = readFileSync(path, 'utf8')
    } catch {
      text = undefined
    }
  }
  if (text !== undefined) {
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      raw = undefined
    }
    if (raw !== undefined) {
      const installed = parseInstalledVersions(raw)
      if (installed !== undefined) {
        // Already schema 2 — seed authority only; no rewrite needed.
        return applySeedAuthority(installed, seed)
      }
      // Legacy flat file → explicit one-time migration with backup marker.
      const migrated = applySeedAuthority(migrateVersions(parseVersions(raw)), seed)
      try {
        mkdirSync(dirname(path), { recursive: true })
        copyFileSync(path, legacyBackupPath(userData))
      } catch {
        // Backup is best-effort; migration itself must proceed.
      }
      saveInstalledVersions(userData, migrated)
      return migrated
    }
    // Unparseable JSON — return seed-derived shape WITHOUT saving so the
    // corrupt bytes stay on disk for inspection.
    return applySeedAuthority(migrateVersions(seed), seed)
  }
  // First launch — seed everything.
  const fresh = applySeedAuthority(migrateVersions(seed), seed)
  saveInstalledVersions(userData, fresh)
  return fresh
}

/**
 * Persist schema-2 versions.json atomically (temp file + rename) so a crash
 * mid-write can never leave a truncated file behind.
 * @param userData - userData directory.
 * @param next - versions to write.
 */
export function saveInstalledVersions(userData: string, next: InstalledVersions): void {
  const path = versionsPath(userData)
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  renameSync(tmp, path)
}

/**
 * Load versions from disk, or seed from packaged defaults when missing.
 *
 * Thin adapter over {@link loadInstalledVersions}: the on-disk shape is
 * schema 2 (legacy files migrate in place), the caller keeps the flat
 * {@link AppVersions} projection. Re-seeding policy is unchanged:
 * - `bafDsh`/`dsh` and the 7 BAF packages — always from the running
 *   binary's embed (seed authority, §11.6);
 * - `bafPlugin` — persisted identity wins (independent update channel);
 * - `*Notes` — seed-first; notes only ship with bumps.
 * @param userData - userData directory.
 * @param seed - values written on first launch (from package embeds).
 */
export function loadVersions(userData: string, seed: AppVersions = DEFAULT_VERSIONS): AppVersions {
  return installedToFlat(loadInstalledVersions(userData, seed), seed)
}

/**
 * Persist versions.json (schema 2, atomic). The flat shape carries no
 * runtime/baseline state, so those scopes are merged from the current file
 * rather than clobbered to `unknown` on every plugin-channel save.
 * @param userData - userData directory.
 * @param next - versions to write.
 */
export function saveVersions(userData: string, next: AppVersions): void {
  const path = versionsPath(userData)
  let base: InstalledVersions | undefined
  if (existsSync(path)) {
    try {
      base = parseInstalledVersions(JSON.parse(readFileSync(path, 'utf8')) as unknown)
    } catch {
      base = undefined
    }
  }
  const fallback = migrateVersions(DEFAULT_VERSIONS)
  const current = base ?? fallback
  saveInstalledVersions(userData, {
    schema: 2,
    harness: {
      desktop: next.bafDsh,
      dsh: next.dsh,
      runtime: current.harness.runtime,
    },
    plugin: {
      baf: next.bafPlugin,
      presetSchema: current.plugin.presetSchema,
    },
    baseline: current.baseline,
  })
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