/**
 * Local OpenSpec adapter tests: skeleton open, read states, structural
 * validate, and atomic archive semantics.
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLocalOpenSpecAdapter } from '../src/adapter.ts'
import { ARTIFACT_FILES, archivedChangeDir, changeDir } from '../src/layout.ts'

async function workspace(): Promise<{ root: string; clean: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'baf-openspec-'))
  return { root, clean: () => rm(root, { recursive: true, force: true }) }
}

describe('local openspec adapter', () => {
  it('reports unavailable detect before the layout exists, then available', async () => {
    const { root, clean } = await workspace()
    try {
      const adapter = createLocalOpenSpecAdapter({ workspaceRoot: root })
      const ctx = { workspace: { root } }
      expect((await adapter.detect(ctx)).available).toBe(false)
      await mkdir(join(root, 'openspec', 'changes'), { recursive: true })
      const after = await adapter.detect(ctx)
      expect(after.available).toBe(true)
      expect(after.version).toBe('local-file-1')
    } finally {
      await clean()
    }
  })

  it('opens a skeleton once, refuses to overwrite, and lists artifact states', async () => {
    const { root, clean } = await workspace()
    try {
      const adapter = createLocalOpenSpecAdapter({ workspaceRoot: root })
      const input = { changeId: 'change-20260908-demo-aabb', title: 'Demo change', workspace: { root } }
      const opened = await adapter.open(input)
      expect(opened.status).toBe('ok')
      expect(opened.artifacts[0]).toBe(changeDir(root, input.changeId))
      const body = await readFile(join(changeDir(root, input.changeId), ARTIFACT_FILES.proposal), 'utf8')
      expect(body).toContain('# Demo change')
      expect(body).toContain(input.changeId)

      const again = await adapter.open(input)
      expect(again.status).toBe('failed')
      expect(again.diagnostics[0]?.code).toBe('openspec_unavailable')

      const state = await adapter.read({ changeId: input.changeId, path: '' })
      expect(state.status).toBe('ok')
      if (state.status !== 'ok') return
      const value = state.value as unknown as Record<string, unknown>
      expect(value.files).toContain(ARTIFACT_FILES.proposal)
      expect((value[ARTIFACT_FILES.proposal] as { templateOnly: boolean }).templateOnly).toBe(true)
    } finally {
      await clean()
    }
  })

  it('validate fails on template-only artifacts and passes when sections are filled', async () => {
    const { root, clean } = await workspace()
    try {
      const adapter = createLocalOpenSpecAdapter({ workspaceRoot: root })
      const changeId = 'change-20260908-demo-bcdd'
      await adapter.open({ changeId, title: 'Fill me', workspace: { root } })
      const before = await adapter.validate({ changeId, path: '' })
      expect(before.passed).toBe(false)
      expect(before.diagnostics.some(d => d.includes('unfilled template'))).toBe(true)

      const dir = changeDir(root, changeId)
      await writeFile(join(dir, ARTIFACT_FILES.proposal), '# Fill me\n\n## Why\n\nA real reason.\n', 'utf8')
      await writeFile(
        join(dir, ARTIFACT_FILES.clarify),
        '# Clarify\n\n## Blocking questions\n\n- Q1 answered.\n\n## Acceptance criteria\n\n- Command passes.\n',
        'utf8',
      )
      await writeFile(
        join(dir, ARTIFACT_FILES.design),
        '# Design\n\n## Approach\n\nReuse existing parser in packages/x/src/y.ts.\n',
        'utf8',
      )
      await writeFile(
        join(dir, ARTIFACT_FILES.plan),
        '# Plan\n\n## Tasks\n\n1. Edit a.md; verify: pnpm test; rollback: git checkout.\n',
        'utf8',
      )
      const after = await adapter.validate({ changeId, path: '' })
      expect(after.passed).toBe(true)
    } finally {
      await clean()
    }
  })

  it('archive moves the change atomically and fails when destination exists', async () => {
    const { root, clean } = await workspace()
    try {
      const adapter = createLocalOpenSpecAdapter({ workspaceRoot: root })
      const changeId = 'change-20260908-demo-cdee'
      await adapter.open({ changeId, title: 'Archive me', workspace: { root } })
      const controller = new AbortController()
      const result = await adapter.archive({ changeId, path: '' }, controller.signal)
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.value?.archivePath).toBe(archivedChangeDir(root, changeId))
      await expect(stat(changeDir(root, changeId))).rejects.toMatchObject({ code: 'ENOENT' })
      expect(await readFile(join(archivedChangeDir(root, changeId), ARTIFACT_FILES.proposal), 'utf8'))
        .toContain(changeId)

      // Recreate the source; archiving onto the existing destination must fail.
      await adapter.open({ changeId, title: 'Second round', workspace: { root } })
      const conflict = await adapter.archive({ changeId, path: '' }, controller.signal)
      expect(conflict.status).toBe('failed')

      const aborted = await adapter.archive(
        { changeId: `${changeId}-x`, path: '' },
        AbortSignal.abort(),
      )
      expect(aborted.status).toBe('failed')
    } finally {
      await clean()
    }
  })
})
