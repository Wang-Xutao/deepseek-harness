/**
 * Local file-mode OpenSpecAdapter implementation (Phase 5).
 * Workspace files are the spec authority; no CLI, no network.
 * @module @deepseek-ai/dsh-baf-openspec/adapter
 */

import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  domainFailure,
  domainOk,
  type AdapterContext,
  type ArchiveResult,
  type ChangeRef,
  type ChangeState,
  type DetectResult,
  type DomainResult,
  type OpenInput,
  type OpenSpecAdapter,
  type ValidationReport,
} from '@deepseek-ai/dsh-baf-core'
import {
  ARTIFACT_FILES,
  archivedChangeDir,
  archiveDir,
  changeDir,
  changesDir,
} from './layout.ts'
import { proposalTemplate } from './templates.ts'

/** Options for {@link createLocalOpenSpecAdapter}. */
export interface LocalOpenSpecAdapterOptions {
  /** Absolute workspace root that owns the `openspec/` tree. */
  readonly workspaceRoot: string
}

/** Required section markers per artifact for the Phase 5 structural gate. */
const REQUIRED_SECTIONS: Readonly<Record<string, readonly string[]>> = {
  [ARTIFACT_FILES.clarify]: ['## Blocking questions', '## Acceptance criteria'],
  [ARTIFACT_FILES.design]: ['## Approach'],
  [ARTIFACT_FILES.plan]: ['## Tasks'],
  [ARTIFACT_FILES.proposal]: ['## Why'],
}

/** Structural placeholder lines a fresh template is allowed to contain. */
const TEMPLATE_PLACEHOLDER =
  /^(?:-\s*)?(?:TODO\b|Change id:|[A-Z][\w /]*:|Question:|Answer \(decision source \+ date\) or `deferred: <reason>`:)/

/**
 * Whether a file body still counts as "template only" (unfilled TODO skeleton).
 * @param body - file text.
 * @returns true when no real content was filled in.
 */
function isTemplateOnly(body: string): boolean {
  const contentLines = body
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('#'))
  return contentLines.every(line => TEMPLATE_PLACEHOLDER.test(line))
}

/**
 * Create the Phase 5 local file-mode adapter.
 * @param options - workspace binding.
 * @returns adapter implementation.
 */
export function createLocalOpenSpecAdapter(options: LocalOpenSpecAdapterOptions): OpenSpecAdapter {
  const { workspaceRoot } = options

  const readArtifact = async (changeId: string, file: string): Promise<string | undefined> => {
    try {
      return await readFile(join(changeDir(workspaceRoot, changeId), file), 'utf8')
    } catch {
      return undefined
    }
  }

  return {
    async detect(_ctx: AdapterContext): Promise<DetectResult> {
      try {
        const s = await stat(changesDir(workspaceRoot))
        return {
          available: s.isDirectory(),
          cli: 'local://openspec/changes',
          version: 'local-file-1',
          detail: 'Local file-mode OpenSpec layout (Phase 5); enterprise CLI not wired yet',
        }
      } catch {
        return {
          available: false,
          cli: 'local://openspec/changes',
          version: 'local-file-1',
          detail: 'openspec/changes directory not found; run baf-scaffold init or create it',
        }
      }
    },

    async open(input: OpenInput): Promise<DomainResult<ChangeRef>> {
      const dir = changeDir(workspaceRoot, input.changeId)
      try {
        await stat(dir)
        return domainFailure('failed', [{
          severity: 'error',
          code: 'openspec_unavailable',
          message: `change directory already exists: ${input.changeId}`,
        }], { artifacts: [dir] })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      await mkdir(dir, { recursive: true })
      // 【变更】2026-09-22 (user report #2): open() installs ONLY proposal.md —
      // the open stage's own artifact. clarify/design/tasks templates belong to
      // their own stages and are installed lazily by `beginDocStage` on stage
      // entry (see baf-workflow stages/pipeline.ts), so every later artifact
      // reads 「尚未生成」 until its stage begins, exactly like plan.md.
      const bodies: Readonly<Record<string, string>> = {
        [ARTIFACT_FILES.proposal]: proposalTemplate(input.changeId, input.title),
      }
      for (const [file, body] of Object.entries(bodies)) {
        const path = join(dir, file)
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, body, 'utf8')
      }
      return domainOk({ changeId: input.changeId, path: dir }, { artifacts: [dir] })
    },

    async read(change: ChangeRef): Promise<DomainResult<ChangeState>> {
      const dir = changeDir(workspaceRoot, change.changeId)
      const files: string[] = []
      const states: Record<string, { present: boolean; templateOnly: boolean }> = {}
      for (const file of Object.values(ARTIFACT_FILES)) {
        const body = await readArtifact(change.changeId, file)
        if (body === undefined) continue
        files.push(file)
        states[file] = { present: true, templateOnly: isTemplateOnly(body) }
      }
      try {
        await stat(dir)
      } catch {
        return domainFailure('failed', [{
          severity: 'error',
          code: 'openspec_unavailable',
          message: `change directory not found: ${change.changeId}`,
        }], { artifacts: [] })
      }
      return domainOk({ changeId: change.changeId, files, ...states }, { artifacts: files })
    },

    async validate(change: ChangeRef): Promise<ValidationReport> {
      const diagnostics: string[] = []
      let passed = true
      for (const [file, sections] of Object.entries(REQUIRED_SECTIONS)) {
        const body = await readArtifact(change.changeId, file)
        if (body === undefined) continue
        for (const section of sections) {
          if (!body.includes(section)) {
            passed = false
            diagnostics.push(`${file}: missing required section "${section}"`)
          }
        }
        if (isTemplateOnly(body)) {
          passed = false
          diagnostics.push(`${file}: still the unfilled template`)
        }
      }
      if (diagnostics.length === 0) diagnostics.push('structural validation passed')
      return { passed, diagnostics }
    },

    async archive(change: ChangeRef, signal: AbortSignal): Promise<DomainResult<ArchiveResult>> {
      if (signal.aborted) {
        return domainFailure('failed', [{
          severity: 'error',
          code: 'openspec_unavailable',
          message: 'archive aborted before start',
        }], { artifacts: [] })
      }
      const source = changeDir(workspaceRoot, change.changeId)
      const destination = archivedChangeDir(workspaceRoot, change.changeId)
      try {
        await stat(source)
      } catch {
        return domainFailure('failed', [{
          severity: 'error',
          code: 'openspec_unavailable',
          message: `change directory not found: ${change.changeId}`,
        }], { artifacts: [] })
      }
      try {
        await stat(destination)
        return domainFailure('failed', [{
          severity: 'error',
          code: 'openspec_unavailable',
          message: `archive destination already exists: ${change.changeId}`,
        }], { artifacts: [destination] })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      await mkdir(archiveDir(workspaceRoot), { recursive: true })
      // 【变更】2026-09-23 (user issue #5): on Windows a single `rename` of
      // the change directory fails with EPERM/EBUSY while any process holds
      // an open handle inside it (an editor, a file watcher, the artifact
      // viewer). That used to leave the change parked at `archive` with the
      // move undone. Retry the same atomic rename a few times with a short
      // backoff — transient watchers usually let go within a second or two.
      let lastError: unknown
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          await rename(source, destination)
          lastError = undefined
          break
        } catch (error) {
          lastError = error
          const code = (error as NodeJS.ErrnoException).code
          if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') throw error
          await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)))
        }
      }
      if (lastError !== undefined) throw lastError
      return domainOk(
        { changeId: change.changeId, archivePath: destination },
        { artifacts: [destination] },
      )
    },
  }
}
