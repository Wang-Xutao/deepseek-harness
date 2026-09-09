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
  readonly bafDshNotes: string
  readonly dshNotes: string
  readonly bafCoreNotes: string
  readonly bafWorkflowNotes: string
  readonly bafOpenspecNotes: string
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
  bafDshNotes?: string
  dshNotes?: string
  bafCoreNotes?: string
  bafWorkflowNotes?: string
  bafOpenspecNotes?: string
}

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
          if (typeof raw.bafCore === 'string') out.bafCore = raw.bafCore
          if (typeof raw.bafWorkflow === 'string') out.bafWorkflow = raw.bafWorkflow
          if (typeof raw.bafOpenspec === 'string') out.bafOpenspec = raw.bafOpenspec
          if (typeof raw.bafDshNotes === 'string') out.bafDshNotes = raw.bafDshNotes
          if (typeof raw.dshNotes === 'string') out.dshNotes = raw.dshNotes
          if (typeof raw.bafCoreNotes === 'string') out.bafCoreNotes = raw.bafCoreNotes
          if (typeof raw.bafWorkflowNotes === 'string') out.bafWorkflowNotes = raw.bafWorkflowNotes
          if (typeof raw.bafOpenspecNotes === 'string') out.bafOpenspecNotes = raw.bafOpenspecNotes
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
      bafDshNotes: embedded.bafDshNotes ?? '',
      dshNotes: embedded.dshNotes ?? '',
      bafCoreNotes: embedded.bafCoreNotes ?? pkgNotes('@deepseek-ai/dsh-baf-core'),
      bafWorkflowNotes: embedded.bafWorkflowNotes ?? pkgNotes('@deepseek-ai/dsh-baf-workflow'),
      bafOpenspecNotes: embedded.bafOpenspecNotes ?? pkgNotes('@deepseek-ai/dsh-baf-openspec'),
      source: 'baf-product-versions.json（与设置「版本与更新」同源字段）',
    }
  }

  return {
    bafDsh: '（仅桌面壳可知；请打开设置 → 版本与更新）',
    dsh: dshPkg === '（未知）' ? '（未知）' : dshPkg,
    bafCore: bafCoreResolved,
    bafWorkflow: bafWorkflowResolved,
    bafOpenspec: bafOpenspecResolved,
    bafDshNotes: '',
    dshNotes: '',
    bafCoreNotes: pkgNotes('@deepseek-ai/dsh-baf-core'),
    bafWorkflowNotes: pkgNotes('@deepseek-ai/dsh-baf-workflow'),
    bafOpenspecNotes: pkgNotes('@deepseek-ai/dsh-baf-openspec'),
    source: 'npm 包解析（未找到打包嵌入的 baf-product-versions.json）',
  }
}
