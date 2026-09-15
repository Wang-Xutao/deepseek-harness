/**
 * Resolve product + BAF package versions for `/baf-version`.
 * Aligns with desktop Settings「版本与更新」when the pack embeds
 * `baf-product-versions.json` next to the dsh tree.
 * @module @deepseek-ai/dsh-baf-workflow/product-versions
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Product + independently versioned BAF packages. */
export interface BafProductVersions {
  readonly bafDsh: string
  readonly dsh: string
  readonly bafCore: string
  readonly bafWorkflow: string
  readonly bafOpenspec: string
  readonly bafStandard: string
  readonly bafQuality: string
  readonly bafGuard: string
  readonly bafScaffold: string
  readonly bafDshNotes: string
  readonly dshNotes: string
  readonly bafCoreNotes: string
  readonly bafWorkflowNotes: string
  readonly bafOpenspecNotes: string
  readonly bafStandardNotes: string
  readonly bafQualityNotes: string
  readonly bafGuardNotes: string
  readonly bafScaffoldNotes: string
  readonly source: string
}

const requireFromHere = createRequire(import.meta.url)

/**
 * Read a workspace package version via Node resolution.
 * @param name - package name.
 * @returns version string or unknown marker.
 */
function pkgVersion(name: string): string {
  try {
    const pkgPath = requireFromHere.resolve(`${name}/package.json`)
    const raw = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown }
    return typeof raw.version === 'string' && raw.version.length > 0 ? raw.version : '（未知）'
  } catch {
    return '（未知）'
  }
}

/**
 * Read optional Chinese notes from a package.json `bafNotesZh` field.
 * @param name - package name.
 * @returns notes or empty string.
 */
function pkgNotes(name: string): string {
  try {
    const pkgPath = requireFromHere.resolve(`${name}/package.json`)
    const raw = JSON.parse(readFileSync(pkgPath, 'utf8')) as { bafNotesZh?: unknown }
    return typeof raw.bafNotesZh === 'string' ? raw.bafNotesZh : ''
  } catch {
    return ''
  }
}

type EmbeddedProduct = {
  bafDsh: string
  dsh: string
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

const OPTIONAL_BAF_KEYS = [
  'bafStandard', 'bafQuality', 'bafGuard', 'bafScaffold',
] as const
const NOTES_KEYS = [
  'bafStandardNotes', 'bafQualityNotes', 'bafGuardNotes', 'bafScaffoldNotes',
] as const

/**
 * Walk ancestors of a start path looking for `baf-product-versions.json`.
 * @param start - absolute file or directory.
 * @returns parsed product versions, or undefined.
 */
function readEmbeddedProductFile(start: string): EmbeddedProduct | undefined {
  let dir = start
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(dir, 'baf-product-versions.json')
    if (existsSync(candidate)) {
      try {
        const raw = JSON.parse(readFileSync(candidate, 'utf8')) as Record<string, unknown>
        const bafDsh = typeof raw.bafDsh === 'string' ? raw.bafDsh : undefined
        const dsh = typeof raw.dsh === 'string' ? raw.dsh : undefined
        if (bafDsh && dsh) {
          const out: EmbeddedProduct = { bafDsh, dsh }
          for (const key of ['bafCore', 'bafWorkflow', 'bafOpenspec', ...OPTIONAL_BAF_KEYS] as const) {
            if (typeof raw[key] === 'string') {
              ;(out as Record<string, unknown>)[key] = raw[key]
            }
          }
          for (const key of [
            'bafDshNotes', 'dshNotes', 'bafCoreNotes', 'bafWorkflowNotes', 'bafOpenspecNotes',
            ...NOTES_KEYS,
          ] as const) {
            if (typeof raw[key] === 'string') {
              ;(out as Record<string, unknown>)[key] = raw[key]
            }
          }
          return out
        }
      } catch {
        // Ignore corrupt embed; fall through.
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/**
 * Resolve versions for the `/baf-version` command report.
 * @returns product + package versions and a short provenance note.
 */
export function resolveBafProductVersions(): BafProductVersions {
  const bafCoreResolved = pkgVersion('@deepseek-ai/dsh-baf-core')
  const bafWorkflowResolved = pkgVersion('@deepseek-ai/dsh-baf-workflow')
  const bafOpenspecResolved = pkgVersion('@deepseek-ai/dsh-baf-openspec')
  const bafStandardResolved = pkgVersion('@deepseek-ai/dsh-baf-standard')
  const bafQualityResolved = pkgVersion('@deepseek-ai/dsh-baf-quality')
  const bafGuardResolved = pkgVersion('@deepseek-ai/dsh-baf-guard')
  const bafScaffoldResolved = pkgVersion('@deepseek-ai/dsh-baf-scaffold')
  const dshPkg = pkgVersion('@deepseek-ai/dsh')

  const here = dirname(fileURLToPath(import.meta.url))
  const embedded = readEmbeddedProductFile(here)
    ?? readEmbeddedProductFile(process.cwd())

  if (embedded !== undefined) {
    return {
      bafDsh: embedded.bafDsh,
      dsh: embedded.dsh,
      bafCore: embedded.bafCore ?? bafCoreResolved,
      bafWorkflow: embedded.bafWorkflow ?? bafWorkflowResolved,
      bafOpenspec: embedded.bafOpenspec ?? bafOpenspecResolved,
      bafStandard: embedded.bafStandard ?? bafStandardResolved,
      bafQuality: embedded.bafQuality ?? bafQualityResolved,
      bafGuard: embedded.bafGuard ?? bafGuardResolved,
      bafScaffold: embedded.bafScaffold ?? bafScaffoldResolved,
      bafDshNotes: embedded.bafDshNotes ?? '',
      dshNotes: embedded.dshNotes ?? '',
      bafCoreNotes: embedded.bafCoreNotes ?? pkgNotes('@deepseek-ai/dsh-baf-core'),
      bafWorkflowNotes: embedded.bafWorkflowNotes ?? pkgNotes('@deepseek-ai/dsh-baf-workflow'),
      bafOpenspecNotes: embedded.bafOpenspecNotes ?? pkgNotes('@deepseek-ai/dsh-baf-openspec'),
      bafStandardNotes: embedded.bafStandardNotes ?? pkgNotes('@deepseek-ai/dsh-baf-standard'),
      bafQualityNotes: embedded.bafQualityNotes ?? pkgNotes('@deepseek-ai/dsh-baf-quality'),
      bafGuardNotes: embedded.bafGuardNotes ?? pkgNotes('@deepseek-ai/dsh-baf-guard'),
      bafScaffoldNotes: embedded.bafScaffoldNotes ?? pkgNotes('@deepseek-ai/dsh-baf-scaffold'),
      source: 'baf-product-versions.json（与设置「版本与更新」同源字段）',
    }
  }

  return {
    bafDsh: '（仅桌面壳可知；请打开设置 → 版本与更新）',
    dsh: dshPkg === '（未知）' ? '（未知）' : dshPkg,
    bafCore: bafCoreResolved,
    bafWorkflow: bafWorkflowResolved,
    bafOpenspec: bafOpenspecResolved,
    bafStandard: bafStandardResolved,
    bafQuality: bafQualityResolved,
    bafGuard: bafGuardResolved,
    bafScaffold: bafScaffoldResolved,
    bafDshNotes: '',
    dshNotes: '',
    bafCoreNotes: pkgNotes('@deepseek-ai/dsh-baf-core'),
    bafWorkflowNotes: pkgNotes('@deepseek-ai/dsh-baf-workflow'),
    bafOpenspecNotes: pkgNotes('@deepseek-ai/dsh-baf-openspec'),
    bafStandardNotes: pkgNotes('@deepseek-ai/dsh-baf-standard'),
    bafQualityNotes: pkgNotes('@deepseek-ai/dsh-baf-quality'),
    bafGuardNotes: pkgNotes('@deepseek-ai/dsh-baf-guard'),
    bafScaffoldNotes: pkgNotes('@deepseek-ai/dsh-baf-scaffold'),
    source: 'npm 包解析（未找到打包嵌入的 baf-product-versions.json）',
  }
}
