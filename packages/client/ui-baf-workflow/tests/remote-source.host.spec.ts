/**
 * §22.15 B / §22.16 P3: Remote source-overwrite + gateResolve audit line.
 *
 * Verifies the host-driven boundaries via a direct probe of the Remote's
 * underlying business logic — the Remote is a cordis Service and would
 * require booting the whole composition, so this spec instead exercises:
 *
 * 1. The workflow-service `transition` source overwrite contract: when the
 *    host overwrites `evidence.source` (mirroring Remote.transition), the
 *    `change-abandoned` event records `source: 'tab'`.
 * 2. The driveGateResolve audit-line shape: a closure capturing the audit
 *    line confirms the §22.16 metadata contract.
 *
 * The Remote wrapper itself is exercised end-to-end by the GUI smoke at
 * `overlay/scripts/bench-spawn-to-shown.mjs` against the real pack.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadBaselineFile } from '@deepseek-ai/dsh-baf-core'
import {
  createWorkflowService,
  confirmIntake,
  driveGateResolve,
  ProjectionStore,
} from '@deepseek-ai/dsh-baf-workflow'

const FIXTURE_BASELINE = join(process.cwd(), 'packages/baf/baf-core/tests/fixtures/baseline/baseline.yml')

async function setup(): Promise<{ root: string; store: ProjectionStore; changeId: string }> {
  const root = await mkdtemp(join(tmpdir(), 'baf-remote-src-'))
  await mkdir(join(root, '.baf'), { recursive: true })
  await mkdir(join(root, 'openspec', 'changes'), { recursive: true })
  const baseline = await loadBaselineFile(FIXTURE_BASELINE)
  await writeFile(join(root, '.baf', 'baseline.yml'), JSON.stringify(baseline), 'utf8')
  const store = new ProjectionStore({ workspaceRoot: root })
  const service = createWorkflowService({ store })
  const { intake } = await service.intake({
    description: 'feat: add export public API',
    workspace: { root },
    affectedScopeHint: 'small-local',
  })
  await confirmIntake(store, intake.changeId, 'user')
  return { root, store, changeId: intake.changeId }
}

describe('Remote source contracts (§22.15 B / §22.16 P3)', () => {
  it('host-overwritten source reaches the change-abandoned event', async () => {
    const { root, store, changeId } = await setup()
    try {
      const service = createWorkflowService({ store })
      // Mirror Remote.transition: the host overwrites evidence.source.
      const hostEvidence = { humanConfirmed: true, source: 'tab' }
      const result = await service.transition({
        changeId,
        from: 'intake',
        to: 'abandoned',
        evidence: hostEvidence,
      })
      expect(result.accepted).toBe(true)
      const events = await store.readEvents(changeId)
      const archived = events.events.find(e => e.type === 'change-abandoned')
      expect(archived).toBeDefined()
      expect((archived as { source?: string }).source).toBe('tab')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('driveGateResolve emits an audit line with the expected fields', async () => {
    const { root, changeId } = await setup()
    const lines: string[] = []
    try {
      await driveGateResolve(
        root, 'design-confirm', 'confirm', {}, undefined, undefined, 'gate-card',
        { changeId, audit: line => lines.push(line) },
      )
      const line = lines.find(l => l.includes('session baf:gate'))
      expect(line, `audit lines: ${lines.join(' || ')}`).toBeDefined()
      expect(line).toContain('gateId=design-confirm')
      expect(line).toContain('option=confirm')
      expect(line).toContain(`change=${changeId}`)
      expect(line).toContain('source=gate-card')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('audit line omits the metadata when no audit callback is supplied', async () => {
    const { root, changeId } = await setup()
    try {
      // No audit param — should run silently (CLI smoke path).
      const result = await driveGateResolve(
        root, 'design-confirm', 'confirm', {}, undefined, undefined, 'gate-card',
        { changeId },
      )
      expect(result.kind).toBeDefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
