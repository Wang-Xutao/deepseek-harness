/**
 * §22.19 begin-intake unit tests: the single mint entry.
 *
 * Session 7.jsonl R1 — the auto-pop row and the `baf_gate_ask` bootstrap both
 * checked "any active change?" before minting, neither saw the other, and one
 * customer sentence became two changes. These tests pin the structural fix:
 * the per-cwd mutex + in-lock re-read makes the racing second caller reuse
 * the first one's change, a different stated requirement beside a pending
 * intake refuses, and any other active shape refuses with the ranked list.
 */

import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { beforeEach, describe, expect, it } from 'vitest'
import { beginIntake, resetBeginIntakeState } from '../src/begin-intake.ts'
import { driveClassify, driveOpen } from '../src/command-drives.ts'
import { ProjectionStore, isActiveChange } from '../src/projection.ts'
import { focusFor, resetFocusCache } from '../src/session-focus.ts'

const execFileAsync = promisify(execFile)

const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

const REQUIREMENT = 'feat: add export public API for reports'

/** Workspace fixture: baseline + git repo (gate-dialog.spec recipe). */
async function setupWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'baf-begin-intake-'))
  await mkdir(join(root, '.baf'), { recursive: true })
  await writeFile(
    join(root, '.baf', 'baseline.yml'),
    await readFile(FIXTURE_BASELINE, 'utf8'),
    'utf8',
  )
  await execFileAsync('git', ['init', '-q'], { cwd: root })
  await execFileAsync('git', [
    '-c', 'user.email=baf@test', '-c', 'user.name=baf', '-c', 'commit.gpgsign=false',
    'commit', '-q', '--allow-empty', '-m', 'init',
  ], { cwd: root })
  return root
}

/** Active rows of a workspace index. */
async function activeIds(root: string): Promise<string[]> {
  const index = await new ProjectionStore({ workspaceRoot: root }).readIndex()
  return index.changes.filter(isActiveChange).map(c => c.changeId)
}

/** Mint and drive a change past intake to `open` (gate-dialog.spec recipe). */
async function mintOpenedChange(root: string, description: string): Promise<string> {
  await driveOpen(root, description)
  const [changeId] = await activeIds(root)
  if (changeId === undefined) throw new Error('mint failed')
  await driveClassify(root, `confirm mode=full-go-path change=${changeId}`)
  return changeId
}

beforeEach(() => {
  resetBeginIntakeState()
  resetFocusCache()
})

describe('§22.19 beginIntake — the single mint entry', () => {
  it('mints on an idle workspace and binds the focus', async () => {
    const root = await setupWorkspace()
    try {
      const outcome = await beginIntake(root, REQUIREMENT)
      expect(outcome.kind).toBe('minted')
      if (outcome.kind !== 'minted') return
      expect(outcome.card.kind).toBe('success')
      expect(outcome.card.text).toContain('分类卡')
      expect(await activeIds(root)).toEqual([outcome.changeId])
      expect(focusFor(root).get()).toBe(outcome.changeId)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('session-7 race replay: two concurrent calls mint once and reuse once', async () => {
    const root = await setupWorkspace()
    try {
      const [a, b] = await Promise.all([
        beginIntake(root, REQUIREMENT),
        beginIntake(root, REQUIREMENT),
      ])
      const kinds = [a.kind, b.kind].sort()
      expect(kinds).toEqual(['minted', 'reused'])
      if (a.kind !== 'minted' || b.kind !== 'reused') return
      expect(a.changeId).toBe(b.changeId)
      expect(await activeIds(root)).toEqual([a.changeId])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('a re-stated identical requirement reuses the pending intake', async () => {
    const root = await setupWorkspace()
    try {
      const first = await beginIntake(root, REQUIREMENT)
      const second = await beginIntake(root, REQUIREMENT)
      expect(second.kind).toBe('reused')
      if (second.kind !== 'reused' || first.kind !== 'minted') return
      expect(second.changeId).toBe(first.changeId)
      expect(await activeIds(root)).toEqual([first.changeId])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('a different requirement beside a pending intake refuses with the candidate', async () => {
    const root = await setupWorkspace()
    try {
      const first = await beginIntake(root, REQUIREMENT)
      const second = await beginIntake(root, '另一个完全不同的需求')
      expect(second.kind).toBe('refused-active')
      if (second.kind !== 'refused-active' || first.kind !== 'minted') return
      expect(second.actives.map(c => c.changeId)).toEqual([first.changeId])
      expect(second.card.text).toContain('已有进行中的变更')
      expect(await activeIds(root)).toEqual([first.changeId])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses beside a non-intake active change regardless of remembered text', async () => {
    const root = await setupWorkspace()
    try {
      const changeId = await mintOpenedChange(root, REQUIREMENT)
      const outcome = await beginIntake(root, REQUIREMENT)
      expect(outcome.kind).toBe('refused-active')
      if (outcome.kind !== 'refused-active') return
      expect(outcome.actives.map(c => c.changeId)).toEqual([changeId])
      expect(await activeIds(root)).toEqual([changeId])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reuses a pending intake after a process restart (no remembered requirement)', async () => {
    const root = await setupWorkspace()
    try {
      const first = await beginIntake(root, REQUIREMENT)
      resetBeginIntakeState() // restart: locks + lastRequirement forgotten
      const second = await beginIntake(root, '随便什么新话术')
      expect(second.kind).toBe('reused')
      if (second.kind !== 'reused' || first.kind !== 'minted') return
      expect(second.changeId).toBe(first.changeId)
      expect(await activeIds(root)).toEqual([first.changeId])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('an empty description refuses without minting', async () => {
    const root = await setupWorkspace()
    try {
      const outcome = await beginIntake(root, '   ')
      expect(outcome.kind).toBe('refused-input')
      if (outcome.kind !== 'refused-input') return
      expect(outcome.card.text).toContain('缺少描述')
      expect(await activeIds(root)).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('driveOpen (slash surface) returns the single-entry outcome card', async () => {
    const root = await setupWorkspace()
    try {
      const card = await driveOpen(root, REQUIREMENT)
      expect(card.kind).toBe('success')
      expect(card.text).toContain('分类卡')
      expect(card.text).toContain(`change: ${(await activeIds(root))[0]}`)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
