/**
 * 【变更】2026-10-29 (批次三十七 · 用户问题 6): the document lifecycle — the
 * six-state ladder the customer reads, and the lock that follows it.
 */

import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ProjectionEvent } from '@deepseek-ai/dsh-baf-core'
import { changeArtifactStatus } from '../src/stages/gates.ts'

/** One projection event — the tests build the log by hand. */
function event(type: string, at: string, node?: string): ProjectionEvent {
  return { type, seq: 1, eventId: `e-${at}`, at, ...(node === undefined ? {} : { node }) } as unknown as ProjectionEvent
}

/** A fixed past stamp — the files' write times are pinned to it so the
 * lifecycle comparison never depends on the wall clock. */
const WRITTEN_AT = new Date('2026-01-01T00:00:00.000Z')

/**
 * Write a document with a pinned write time.
 * @param file - the document's path.
 * @param body - its content.
 */
async function writeDocument(file: string, body: string): Promise<void> {
  await writeFile(file, body, 'utf8')
  await utimes(file, WRITTEN_AT, WRITTEN_AT)
}

describe('the document lifecycle (批次三十七 · 用户问题 6)', () => {
  it('reads 未生成 → 未填写 → 已填写 → 已完成 as the workflow advances', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-lifecycle-'))
    try {
      const changeId = 'change-1'
      const dir = join(root, 'openspec', 'changes', changeId)
      await mkdir(dir, { recursive: true })

      const before = await changeArtifactStatus({
        workspaceRoot: root,
        changeId,
        mode: 'full-go-path',
        events: [],
      })
      expect(before.find(row => row.file === 'proposal.md')?.state).toBe('missing')

      // The open stage wrote the TEMPLATE — 未填写, not 已填写.
      await writeDocument(join(dir, 'proposal.md'), '# 提案\n\n## Why\nTODO 写清楚为什么\n')
      const templated = await changeArtifactStatus({
        workspaceRoot: root,
        changeId,
        mode: 'full-go-path',
        events: [],
      })
      expect(templated.find(row => row.file === 'proposal.md')?.state).toBe('template')

      // The customer filled it during the clarify stage — 已填写.
      await writeDocument(join(dir, 'proposal.md'), '# 提案\n\n## Why\n让报表能导出\n')
      const filled = await changeArtifactStatus({
        workspaceRoot: root,
        changeId,
        mode: 'full-go-path',
        events: [event('stage-entered', '2026-10-29T00:00:00.000Z', 'clarify')],
      })
      expect(filled.find(row => row.file === 'proposal.md')?.state).toBe('filled')

      // Passing the clarify gate into design confirms it — 已完成.
      const confirmed = await changeArtifactStatus({
        workspaceRoot: root,
        changeId,
        mode: 'full-go-path',
        events: [
          event('stage-entered', '2026-10-29T00:00:00.000Z', 'clarify'),
          event('stage-entered', '2026-10-29T01:00:00.000Z', 'design'),
        ],
      })
      expect(confirmed.find(row => row.file === 'proposal.md')?.state).toBe('completed')
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('reads a confirmed document edited afterwards as 已更新, and the later stages as 待更新', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-lifecycle-'))
    try {
      const changeId = 'change-2'
      const dir = join(root, 'openspec', 'changes', changeId)
      await mkdir(dir, { recursive: true })
      await writeDocument(join(dir, 'proposal.md'), '# 提案\n\n## Why\n让报表能导出\n')
      await writeDocument(join(dir, 'design.md'), '# 设计\n\n## 方案\n写入中\n')
      await writeDocument(join(dir, 'plan.md'), '# 计划\n\n## 步骤\n一、二\n')

      const events = [
        event('stage-entered', '2026-10-29T00:00:00.000Z', 'clarify'),
        event('stage-entered', '2026-10-29T01:00:00.000Z', 'design'),
        event('stage-entered', '2026-10-29T02:00:00.000Z', 'plan'),
      ]
      const settled = await changeArtifactStatus({
        workspaceRoot: root,
        changeId,
        mode: 'full-go-path',
        events,
      })
      expect(settled.find(row => row.file === 'proposal.md')?.state).toBe('completed')
      expect(settled.find(row => row.file === 'design.md')?.state).toBe('completed')
      // plan.md's own gate (the plan → implement one) has not been passed yet.
      expect(settled.find(row => row.file === 'plan.md')?.state).toBe('filled')

      // The customer edits the confirmed proposal afterwards.
      const later = new Date('2026-10-29T03:00:00.000Z')
      await utimes(join(dir, 'proposal.md'), later, later)

      const edited = await changeArtifactStatus({
        workspaceRoot: root,
        changeId,
        mode: 'full-go-path',
        events,
      })
      expect(edited.find(row => row.file === 'proposal.md')?.state).toBe('updated')
      // The documents of the LATER stages are now out of sync — 待更新.
      expect(edited.find(row => row.file === 'design.md')?.state).toBe('stale')
      expect(edited.find(row => row.file === 'plan.md')?.state).toBe('stale')
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })
})
