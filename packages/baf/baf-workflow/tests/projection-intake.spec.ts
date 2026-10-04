/**
 * Domain tests for projection append/replay and intake/transition gates.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, afterEach } from 'vitest'
import { BafError } from '@deepseek-ai/dsh-baf-core'
import { classifyIntake } from '../src/intake.ts'
import { ProjectionStore, replay } from '../src/projection.ts'
import { decideTransition } from '../src/transition.ts'
import { confirmIntake, createWorkflowService } from '../src/workflow-service.ts'
import { buildEmptyTabView, statusToTabView } from '@deepseek-ai/dsh-baf-core'
import { loadBaselineFile } from '@deepseek-ai/dsh-baf-core'
import { writeRouteTierConfigSync } from '../src/route-config-io.ts'
import { resetTaskTierMemory, taskTierFor } from '../src/task-tier-memory.ts'

const savedDshHome = process.env.DSH_HOME
afterEach(() => {
  if (savedDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedDshHome
  resetTaskTierMemory()
})

describe('projection store', () => {
  it('appends, replays, and rejects stale expectedSeq', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-proj-'))
    try {
      const store = new ProjectionStore({
        workspaceRoot: root,
        now: () => new Date('2026-09-07T00:00:00.000Z'),
        eventId: (() => {
          let n = 0
          return () => `evt-${++n}`
        })(),
      })
      const service = createWorkflowService({ store })
      const { intake } = await service.intake({
        description: 'fix single-file crash in parser',
        workspace: { root },
        affectedScopeHint: 'single-file',
      })
      expect(intake.confirmation).toBe('pending')
      const status = await store.readStatus(intake.changeId)
      expect(status.projectionVersion).toBe(1)
      expect(replay(intake.changeId, (await store.readEvents(intake.changeId)).events).current).toBe('intake')

      await expect(store.append(intake.changeId, 0, meta => ({
        type: 'intake-confirmed',
        by: 'user',
        ...meta,
      }))).rejects.toBeInstanceOf(BafError)

      const confirmed = await confirmIntake(store, intake.changeId)
      expect(confirmed.intake?.confirmation).toBe('confirmed')
      expect(confirmed.nodes.intake).toBe('completed')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('freezes the keyword task tier into the projection at intake confirm (多模型路由 M2)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-proj-tier-'))
    const home = await mkdtemp(join(tmpdir(), 'baf-proj-tier-home-'))
    try {
      process.env.DSH_HOME = home
      writeRouteTierConfigSync(join(home, 'baf-route-config.json'), {
        schema: 1,
        enabled: true,
        tiers: {
          high: { provider: 'p', model: 'big' },
          mid: { provider: 'p', model: 'mid' },
          low: { provider: 'p', model: 'cheap' },
        },
        keywords: [{ words: '架构', tier: 'high' }],
      })
      const store = new ProjectionStore({ workspaceRoot: root })
      const service = createWorkflowService({ store })
      const { intake } = await service.intake({
        description: '梳理整体架构并重构模块边界',
        workspace: { root },
      })
      const confirmed = await confirmIntake(store, intake.changeId)
      expect(confirmed.taskTier).toEqual({ tier: 'high', matched: '架构' })
      const types = (await store.readEvents(intake.changeId)).events.map(event => event.type)
      expect(types).toContain('task-tier-frozen')
      // The dispatch-time sync cache holds the frozen tier for this workspace.
      expect(taskTierFor(root, intake.changeId)).toEqual({ tier: 'high', matched: '架构' })
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(home, { recursive: true, force: true })
    }
  })

  it('freezes nothing when tier routing is inactive or no keyword hits', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-proj-tier-off-'))
    const home = await mkdtemp(join(tmpdir(), 'baf-proj-tier-home2-'))
    try {
      // No config file at all.
      process.env.DSH_HOME = home
      const store = new ProjectionStore({ workspaceRoot: root })
      const service = createWorkflowService({ store })
      const { intake } = await service.intake({
        description: '梳理整体架构并重构模块边界',
        workspace: { root },
      })
      const confirmed = await confirmIntake(store, intake.changeId)
      expect(confirmed.taskTier).toBeUndefined()
      expect((await store.readEvents(intake.changeId)).events.map(event => event.type))
        .not.toContain('task-tier-frozen')

      // Enabled config whose keywords do not hit: still no freeze.
      writeRouteTierConfigSync(join(home, 'baf-route-config.json'), {
        schema: 1,
        enabled: true,
        tiers: {
          high: { provider: 'p', model: 'big' },
          mid: { provider: 'p', model: 'mid' },
          low: { provider: 'p', model: 'cheap' },
        },
        keywords: [{ words: '性能优化', tier: 'high' }],
      })
      const second = await service.intake({
        description: '补充 README 的安装说明',
        workspace: { root },
      })
      const secondConfirmed = await confirmIntake(store, second.intake.changeId)
      expect(secondConfirmed.taskTier).toBeUndefined()
      expect((await store.readEvents(second.changeId)).events.map(event => event.type))
        .not.toContain('task-tier-frozen')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(home, { recursive: true, force: true })
    }
  })

  it('detects corrupt jsonl lines', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-proj-bad-'))
    try {
      const store = new ProjectionStore({ workspaceRoot: root })
      const path = store.logPath('change-x')
      const { mkdir, writeFile } = await import('node:fs/promises')
      const { dirname } = await import('node:path')
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, '{"type":"intake-classified","seq":1,"eventId":"a","at":"t","intake":{}}\nNOT-JSON\n')
      await expect(store.readStatus('change-x')).rejects.toMatchObject({ code: 'projection_corrupted' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('intake rules', () => {
  it('forces full-go-path for new requirements and public-api bugs', () => {
    const feature = classifyIntake({
      description: '新增 feature: export public API',
      workspace: { root: '/tmp' },
      affectedScopeHint: 'public-api',
    })
    expect(feature.mode).toBe('full-go-path')
    expect(feature.openspecRequired).toBe(true)

    const cross = classifyIntake({
      description: 'bug in cross-module path',
      workspace: { root: '/tmp' },
      affectedScopeHint: 'cross-module',
    })
    expect(cross.mode).toBe('full-go-path')
  })

  it('allows fast path for low-risk bugs when baseline permits', async () => {
    const { fileURLToPath } = await import('node:url')
    const baselinePath = fileURLToPath(
      new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
    )
    const real = await loadBaselineFile(baselinePath)
    const intake = classifyIntake({
      description: 'fix typo in one file',
      workspace: { root: '/tmp' },
      affectedScopeHint: 'single-file',
      baseline: real,
    })
    expect(intake.mode).toBe('bug-fix-path')
    expect(intake.openspecRequired).toBe(false)
  })

  it('settles kind = bug when the customer overrides to bug-fix-path, and keeps unknown for full-go (demo1 issue #2)', async () => {
    // The demo1 rail showed 类型 unknown forever: the keyword heuristic left
    // kind 'unknown' and nothing ever revisited it. Choosing the bug-fix fast
    // path IS the assertion「这是缺陷」— the fold settles kind there; the
    // full-go choice settles nothing (features, refactors and cross-module
    // bugs all take it).
    const root = await mkdtemp(join(tmpdir(), 'baf-kind-settle-'))
    try {
      const store = new ProjectionStore({ workspaceRoot: root })
      const service = createWorkflowService({ store })
      // No feature/bug keywords → heuristic kind 'unknown'.
      const bugish = await service.intake({
        description: '重构 ecum 模块',
        workspace: { root },
      })
      const { setIntakeMode } = await import('../src/workflow-service.ts')
      const rerouted = await setIntakeMode(store, bugish.intake.changeId, 'bug-fix-path')
      expect(rerouted.intake?.kind).toBe('bug')
      expect(rerouted.intake?.reasonCodes).toContain('kind-settled-by-path')

      const kept = await service.intake({
        description: '梳理 ecum 模块的接口',
        workspace: { root: `${root}-2` },
      })
      const fullGo = await setIntakeMode(store, kept.intake.changeId, 'full-go-path')
      expect(fullGo.intake?.kind).toBe('unknown')

      // Replay derives the same settled kind from the event log alone.
      const replayed = replay(
        rerouted.changeId,
        (await store.readEvents(rerouted.changeId)).events,
      )
      expect(replayed.intake?.kind).toBe('bug')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(`${root}-2`, { recursive: true, force: true }).catch(() => undefined)
    }
  })
})

describe('transition gates', () => {
  it('rejects implement before intake confirmation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-tr-'))
    try {
      const store = new ProjectionStore({ workspaceRoot: root })
      const service = createWorkflowService({ store })
      const { intake } = await service.intake({
        description: 'fix crash',
        workspace: { root },
        affectedScopeHint: 'single-file',
      })
      const status = await store.readStatus(intake.changeId)
      const decision = decideTransition({ status, to: 'implement' })
      expect(decision.accepted).toBe(false)
      expect(decision.reason).toBe('intake_confirmation_required')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('tab view', () => {
  it('builds an empty template with full catalog', () => {
    const view = buildEmptyTabView()
    expect(view.empty).toBe(true)
    expect(view.nodes.length).toBeGreaterThanOrEqual(9)
    expect(view.graph.edges.length).toBeGreaterThan(0)
  })

  it('marks fast-path skips after classification', async () => {
    const { fileURLToPath } = await import('node:url')
    const baseline = await loadBaselineFile(fileURLToPath(
      new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
    ))
    const root = await mkdtemp(join(tmpdir(), 'baf-tab-'))
    try {
      const store = new ProjectionStore({ workspaceRoot: root })
      const service = createWorkflowService({ store })
      const { intake } = await service.intake({
        description: 'bug fix single file',
        workspace: { root },
        affectedScopeHint: 'single-file',
        baseline,
      })
      const status = await store.readStatus(intake.changeId)
      const view = statusToTabView(status, [{
        changeId: status.changeId,
        mode: status.mode,
        current: status.current,
      }])
      if (status.mode === 'bug-fix-path') {
        expect(view.nodes.find(n => n.id === 'clarify')?.status).toBe('skipped')
        expect(view.openspecSkipped?.skipped).toBe(true)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
