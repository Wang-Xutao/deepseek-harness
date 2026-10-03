/** Profile-patch rows that keep an installed bundle from double-mounting a
 * package an earlier bundle layer already provides under a different row id. */
import { existsSync, readFileSync } from 'node:fs'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { BundleInfo } from '@deepseek-ai/dsh-plugin-manager'

/** Comment prefix marking the rows this module owns inside a profile patch. */
const MANAGED_MARKER = 'baf-featured dedupe'

/** Row ids safe to spell into the patch file verbatim: plain slugs only. */
function isSafeId(id: string): boolean {
  return /^[\w.-]+$/.test(id)
}

/**
 * The bundle's insert rows whose package another profile bundle already mounts
 * under a different row id. The Loader keeps one entry per id, so two rows for
 * one package both load and the second service registration throws; a row id
 * another layer also declares is an override, not a duplicate.
 * @param bundles The profile's bundles, as `listBundles` reports them.
 * @param target The bundle whose rows are being checked.
 * @returns Its duplicate row ids, in declaration order.
 */
export function overlappingRowIds(bundles: readonly BundleInfo[], target: string): string[] {
  const mine = bundles.find(bundle => bundle.name === target)
  if (mine === undefined) return []
  const others = bundles.filter(bundle => bundle.name !== target)
  const idsElsewhere = new Set(others.flatMap(bundle => [
    ...bundle.rows.map(row => row.rowId),
    ...bundle.overrides,
  ]))
  const modulesElsewhere = new Set(others.flatMap(bundle => bundle.rows.map(row => row.moduleName)))
  return mine.rows
    .filter(row => modulesElsewhere.has(row.moduleName) && !idsElsewhere.has(row.rowId) && isSafeId(row.rowId))
    .map(row => row.rowId)
}

/** Whether the patch text already declares a row with this id, in any quoting. */
function rowIdDeclared(text: string, id: string): boolean {
  const pattern = new RegExp(`^\\s*-\\s+id:\\s*['"]?${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?\\s*(?:#.*)?$`, 'm')
  return pattern.test(text)
}

/**
 * Append managed disable rows for `ids` to the profile patch, leaving every
 * existing byte untouched. An id the file already names in some row belongs to
 * whoever declared it first and is left alone.
 * @param patchPath The profile's cordis.patch.yml path.
 * @param ids Duplicate row ids to disable.
 * @returns Whether at least one row was appended.
 */
export async function appendDedupeRows(patchPath: string, ids: readonly string[]): Promise<boolean> {
  const text = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  const missing = ids.filter(id => isSafeId(id) && !rowIdDeclared(text, id))
  if (missing.length === 0) return false
  const block = missing
    .map(id => `# ${MANAGED_MARKER}: ${id} mounts a package another bundle already provides\n- id: ${id}\n  disabled: true\n`)
    .join('')
  const separator = text === '' || text.endsWith('\n') ? '' : '\n'
  await writeFileAtomic(patchPath, `${text}${separator}${block}`, { mode: 0o600 })
  return true
}

/**
 * Remove this module's managed rows for `ids`, leaving every other line — the
 * person's own rows and comments included — byte-identical. Rows an editor
 * reformatted no longer match their marker and stay behind as inert disables.
 * @param patchPath The profile's cordis.patch.yml path.
 * @param ids Row ids whose managed disable rows should go.
 */
export async function stripDedupeRows(patchPath: string, ids: readonly string[]): Promise<void> {
  if (!existsSync(patchPath) || ids.length === 0) return
  const lines = readFileSync(patchPath, 'utf8').split('\n')
  const kept: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const marker = `# ${MANAGED_MARKER}: `
    if (line.startsWith(marker)) {
      const id = line.slice(marker.length).split(' ', 1)[0] ?? ''
      const matched = ids.includes(id)
        && lines[index + 1] === `- id: ${id}`
        && lines[index + 2] === '  disabled: true'
      if (matched) {
        index += 2
        continue
      }
    }
    kept.push(line)
  }
  const next = kept.join('\n')
  const text = lines.join('\n')
  if (next !== text) await writeFileAtomic(patchPath, next, { mode: 0o600 })
}
