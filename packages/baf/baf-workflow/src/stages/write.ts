/**
 * Artifact-writing helpers shared by clarify/design/plan handlers.
 * Writes are workspace-relative; a template-only artifact may be filled in,
 * but real (filled) content is never silently overwritten.
 * @module @deepseek-ai/dsh-baf-workflow/stages/write
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { BafError } from '@deepseek-ai/dsh-baf-core'
import { changeDir } from '@deepseek-ai/dsh-baf-openspec'

/** Structural placeholder lines a fresh template contains. */
const TEMPLATE_PLACEHOLDER = new RegExp(
  '^(?:-\\s*)?(?:TODO\\b|Change id:|Question:|'
  + 'Answer \\(decision source \\+ date\\) or `deferred: <reason>`:|'
  + 'Decided \\/ Deferred \\/ Out-of-scope:|[A-Z][\\w /]*:)',
)

/**
 * Whether a body is still an unfilled template (no real content lines).
 * @param body - artifact text.
 * @returns true when only template placeholders remain.
 */
export function templateOnly(body: string): boolean {
  const content = body
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l !== '' && !l.startsWith('#'))
  return content.every(l => TEMPLATE_PLACEHOLDER.test(l))
}

/**
 * Write one stage artifact into the change directory.
 * Overwrites a template-only artifact (open-stage skeleton); refuses to
 * overwrite real content so handlers never clobber user/model work.
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - change id.
 * @param file - artifact file name (e.g. `clarify.md`).
 * @param body - full artifact body to install.
 */
export async function writeArtifact(
  workspaceRoot: string,
  changeId: string,
  file: string,
  body: string,
): Promise<void> {
  const path = join(changeDir(workspaceRoot, changeId), file)
  const existing = await readFile(path, 'utf8').catch(() => undefined)
  if (existing !== undefined && existing.trim() !== '' && !templateOnly(existing)) {
    throw new BafError('invalid_transition', `artifact already filled: ${file}`, {
      changeId,
      file,
    })
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, body, 'utf8')
}
