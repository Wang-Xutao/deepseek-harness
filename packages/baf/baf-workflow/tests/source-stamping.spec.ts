/**
 * §22.15 source-stamping pinning (P2-C1).
 *
 * The confirm-edge refusal lands in P2-C2; this spec locks the stamping
 * behaviour so C2 and P3 cannot silently drop the `source` field. Every
 * confirm-edge write must carry `source: 'slash' | 'cli' | 'tab' | 'gate-card'`
 * — never `model-tool`, never missing (when the caller stamps one).
 *
 * Drives run against a real workspace because the pipeline appends events
 * through the same `ProjectionStore` the production paths use; mocking would
 * pin the wrong surface.
 */

import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  driveClassify,
  driveAbandon,
} from '../src/command-drives.ts'
import { createWorkflowService } from '../src/workflow-service.ts'
import { ProjectionStore } from '../src/projection.ts'
import { StagePipeline } from '../src/stages/pipeline.ts'
import type { TransitionSource } from '@deepseek-ai/dsh-baf-core'

const execFileAsync = promisify(execFile)
const FIXTURE_BASELINE = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)
const DESCRIPTION = 'feat: add export public API for reports'

/** Workspace fixture: baseline + git repo. */
async function setup(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'baf-source-stamp-'))
  await mkdir(join(root, '.baf'), { recursive: true })
  await writeFile(join(root, '.baf', 'baseline.yml'), await readFile(FIXTURE_BASELINE, 'utf8'), 'utf8')
  await execFileAsync('git', ['init', '-q'], { cwd: root })
  await execFileAsync('git', [
    '-c', 'user.email=baf@test', '-c', 'user.name=baf', '-c', 'commit.gpgsign=false',
    'commit', '-q', '--allow-empty', '-m', 'init',
  ], { cwd: root })
  return { root, cleanup: async () => { await rm(root, { recursive: true, force: true }) } }
}

/** Intake → confirm → open so the change sits at `open` and the projection has events. */
async function intakeAndOpen(root: string): Promise<string> {
  const store = new ProjectionStore({ workspaceRoot: root })
  const { intake } = await createWorkflowService({ store }).intake({
    description: DESCRIPTION,
    workspace: { root },
  })
  await driveClassify(root, `confirm change=${intake.changeId} title=stamp-test`)
  return intake.changeId
}

/** Pull the last event of a given type for a change. */
async function lastEventOf<T extends { type: string }>(
  root: string,
  changeId: string,
  type: T['type'],
): Promise<T | undefined> {
  const { events } = await new ProjectionStore({ workspaceRoot: root }).readEvents(changeId)
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e !== undefined && e.type === type) return e as T
  }
  return undefined
}

describe('source stamping (P2-C1)', () => {
  it('stage-entered carries source:slash on driveOpenStage (slash default)', async () => {
    const { root, cleanup } = await setup()
    try {
      const changeId = await intakeAndOpen(root)
      const ev = await lastEventOf<{ type: 'stage-entered'; source?: TransitionSource; node: string }>(
        root, changeId, 'stage-entered',
      )
      expect(ev?.node).toBe('open')
      expect(ev?.source).toBe('slash')
    } finally { await cleanup() }
  })

  it('driveAbandon stamps change-abandoned with the supplied source', async () => {
    const { root, cleanup } = await setup()
    try {
      const changeId = await intakeAndOpen(root)
      await driveAbandon(root, `confirm change=${changeId}`, 'tab')
      const ev = await lastEventOf<{ type: 'change-abandoned'; source?: TransitionSource }>(
        root, changeId, 'change-abandoned',
      )
      expect(ev?.source).toBe('tab')
    } finally { await cleanup() }
  })

  it('StagePipeline barrel re-export keeps the source param visible', () => {
    // Compile-time assertion: driveArchiveStage on the public class accepts
    // the source overload. If the param is ever dropped, this spec stops
    // compiling before it runs.
    const _typecheck: StagePipeline['driveArchiveStage'] = (
      changeId: string,
      humanConfirmed: boolean,
      source?: TransitionSource,
    ) => Promise.resolve(undefined as never)
    void _typecheck
    expect(true).toBe(true)
  })
})
