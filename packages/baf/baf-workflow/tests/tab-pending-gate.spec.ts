/**
 * 【变更】2026-09-23 (demo2 user issue #2): the change-scoped `intake-classify`
 * pendingGate on the Tab view — the 完整流程 / 缺陷修复路径 decision renders as
 * buttons at the top of the workflow page at exactly the moment the session
 * dialog would pop it, and disappears the moment the classification settles.
 */

import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { buildWorkflowTabView } from '../src/tab-view.ts'
import { confirmIntake, createWorkflowService, setIntakeMode } from '../src/workflow-service.ts'
import { ProjectionStore } from '../src/projection.ts'

const execFileAsync = promisify(execFile)

const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

/** Workspace with baseline + git anchor (the go.spec recipe). */
async function setup(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'baf-tab-gate-'))
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

describe('Tab pendingGate — intake-classify resting point', () => {
  it('a pending classification surfaces as the change-scoped pendingGate', async () => {
    const root = await setup()
    try {
      const store = new ProjectionStore({ workspaceRoot: root })
      const { intake } = await createWorkflowService({ store }).intake({
        description: 'fix: parser crash when input file is empty (bug fix)',
        workspace: { root },
      })
      const view = await buildWorkflowTabView(store, intake.changeId)
      expect(view.pendingGate).toBeDefined()
      expect(view.pendingGate?.gateId).toBe('intake-classify')
      expect(view.pendingGate?.changeId).toBe(intake.changeId)
      // The registry's two path options + the reject, in registry order.
      expect(view.pendingGate?.options.map(o => o.id)).toEqual(['confirm-full', 'confirm-bugfix', 'reject'])
      // §22.17 I parity: the classifier's verdict rides as detail lines.
      expect(view.pendingGate?.detail?.join('\n')).toContain('系统初步判断')
      expect(view.pendingGate?.detail?.join('\n')).toContain('需求摘要')
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('a confirmed intake (still parked) and an advanced change carry no intake gate', async () => {
    const root = await setup()
    try {
      const store = new ProjectionStore({ workspaceRoot: root })
      const { intake } = await createWorkflowService({ store }).intake({
        description: 'fix: parser crash when input file is empty (bug fix)',
        workspace: { root },
        affectedScopeHint: 'single-file',
      })
      // The classifier's fixture verdict here is clarify-required; the
      // settled-path premise needs a real path, so apply the §22.17 J
      // customer override the classify dialog's path buttons write.
      await setIntakeMode(store, intake.changeId, 'bug-fix-path')
      await confirmIntake(store, intake.changeId, 'user')
      const settled = await store.readStatus(intake.changeId)
      expect(settled.intake?.mode).toBe('bug-fix-path')
      const view = await buildWorkflowTabView(store, intake.changeId)
      // Confirmed-but-never-opened: the decision is settled, /baf-go chains
      // the open drive — no classification gate may pop.
      expect(view.pendingGate).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })

  it('the scaffold gate outranks the intake gate when both conditions hold', async () => {
    // A change can exist in a workspace whose baseline file went missing
    // (minted pre-scaffold, or the file was removed) — the environment gate
    // is initialized first, so scaffold wins the pendingGate slot.
    const root = await mkdtemp(join(tmpdir(), 'baf-tab-gate-'))
    try {
      const store = new ProjectionStore({ workspaceRoot: root })
      const { intake } = await createWorkflowService({ store }).intake({
        description: 'fix: parser crash when input file is empty (bug fix)',
        workspace: { root },
      })
      const view = await buildWorkflowTabView(store, intake.changeId)
      expect(view.pendingGate?.gateId).toBe('scaffold')
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined)
    }
  })
})
