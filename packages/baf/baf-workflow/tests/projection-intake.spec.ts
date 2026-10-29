/**
 * Domain tests for projection append/replay and intake/transition gates.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, afterEach } from 'vitest'
import { BafError } from '@deepseek-ai/dsh-baf-core'
import { classifyIntake, deriveScopeFromAllowlist } from '../src/intake.ts'
import { ProjectionStore, replay } from '../src/projection.ts'
import { decideTransition } from '../src/transition.ts'
import { confirmIntake, createWorkflowService } from '../src/workflow-service.ts'
import { buildEmptyTabView, statusToTabView } from '@deepseek-ai/dsh-baf-core'
import { loadBaselineFile } from '@deepseek-ai/dsh-baf-core'
import { writeRoutePresetsSync, writeRouteTierConfigSync } from '../src/route-config-io.ts'
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

  it('freezes the builtin preset tier with ZERO user keywords (2.4 默认启用)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-proj-tier-builtin-'))
    const home = await mkdtemp(join(tmpdir(), 'baf-proj-tier-home-builtin-'))
    try {
      process.env.DSH_HOME = home
      // keywords deliberately empty: 「架构」 lives in the always-on builtin
      // complexEngineering pack, so the freeze chain must still fire.
      writeRouteTierConfigSync(join(home, 'baf-route-config.json'), {
        schema: 1,
        enabled: true,
        tiers: {
          high: { provider: 'p', model: 'big' },
          mid: { provider: 'p', model: 'mid' },
          low: { provider: 'p', model: 'cheap' },
        },
        keywords: [],
      })
      const store = new ProjectionStore({ workspaceRoot: root })
      const service = createWorkflowService({ store })
      const { intake } = await service.intake({
        description: '梳理整体架构并重构模块边界',
        workspace: { root },
      })
      const confirmed = await confirmIntake(store, intake.changeId)
      expect(confirmed.taskTier).toEqual({ tier: 'high', matched: '架构' })
      expect((await store.readEvents(intake.changeId)).events.map(event => event.type))
        .toContain('task-tier-frozen')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(home, { recursive: true, force: true })
    }
  })

  it('freezes from the FILE preset packs and honors the pack park (2026-10-06 问题 3/4)', async () => {
    const home = await mkdtemp(join(tmpdir(), 'baf-proj-tier-home-file-'))
    try {
      process.env.DSH_HOME = home
      // The user's own pack file REPLACES the code builtins: 对账 (high) is
      // the only pack, so 架构 must NOT freeze anything.
      writeRoutePresetsSync(join(home, 'baf-route-presets.json'), {
        schema: 1,
        packs: [{ id: 'reconPack', tier: 'high', words: '对账|reconciliation' }],
      })
      const config = {
        schema: 1 as const,
        enabled: true,
        tiers: {
          high: { provider: 'p', model: 'big' },
          mid: { provider: 'p', model: 'mid' },
          low: { provider: 'p', model: 'cheap' },
        },
        keywords: [],
      }
      writeRouteTierConfigSync(join(home, 'baf-route-config.json'), config)
      // One workspace per intake (the suite's one-change-per-root convention).
      const taskTierOf = async (description: string) => {
        const root = await mkdtemp(join(tmpdir(), 'baf-proj-tier-file-'))
        try {
          const store = new ProjectionStore({ workspaceRoot: root })
          const service = createWorkflowService({ store })
          const { intake } = await service.intake({ description, workspace: { root } })
          return (await confirmIntake(store, intake.changeId)).taskTier
        } finally {
          await rm(root, { recursive: true, force: true })
        }
      }
      expect(await taskTierOf('梳理整体架构并重构模块边界')).toBeUndefined()
      expect(await taskTierOf('做一个对账数据核对任务')).toEqual({ tier: 'high', matched: '对账' })
      // Parking the pack (类级开关) drops the rule: the same text freezes nothing.
      writeRouteTierConfigSync(join(home, 'baf-route-config.json'), {
        ...config,
        packs: { reconPack: false },
      })
      expect(await taskTierOf('再做一个对账数据核对任务')).toBeUndefined()
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it('freezes the tier hit evaluated over the FULL description (fix #3: summary is a 500-char slice)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-proj-tier-full-'))
    const home = await mkdtemp(join(tmpdir(), 'baf-proj-tier-home3-'))
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
      // The keyword sits beyond the 500-char summary window: 预演 (full
      // text, host-side) says 高档, so the freeze must too. The sliced
      // summary re-evaluation at confirm used to miss it entirely.
      const { intake } = await service.intake({
        description: `${'占'.repeat(600)} 最后重排整体架构边界`,
        workspace: { root },
      })
      expect(intake.summary.length).toBe(500)
      expect(intake.summary).not.toContain('架构')
      expect(intake.taskTierHit).toEqual({ tier: 'high', matched: '架构' })
      const confirmed = await confirmIntake(store, intake.changeId)
      expect(confirmed.taskTier).toEqual({ tier: 'high', matched: '架构' })
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

      // Enabled config whose keywords do not hit AND no builtin word occurs:
      // still no freeze. (2.4 made builtin packs always-on, so 「README」 now
      // freezes low — a doc-less summary is the honest no-hit case.)
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
        description: '补充安装说明与注意事项',
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
      // 【变更】2026-10-29 (批次三十七 · 用户问题 4): no feature/bug keyword →
      // the heuristic kind stays 'unknown' (the model may still fill it in).
      const bugish = await service.intake({
        description: 'ecum 模块的登录态老是丢失',
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

describe('the 影响范围 derivation from the frozen allowlist', () => {
  it('reads one module as 局部小改, not 跨模块', () => {
    // 【变更】2026-10-28 (批次三十四 · 用户问题 3): the customer's ECU
    // abstraction rework touched fourteen files of ONE module and the scope
    // read as 跨模块 — the old rule counted files, the word names modules.
    expect(deriveScopeFromAllowlist([
      'ecum/port/ecum_action.h',
      'ecum/port/ecum_port.h',
      'ecum/service/ecum_sm.c',
      'ecum/service/ecum.c',
    ])).toBe('small-local')
  })

  it('reads two module roots as 跨模块', () => {
    expect(deriveScopeFromAllowlist(['ecum/service/ecum.c', 'can/can_rx.c'])).toBe('cross-module')
  })

  it('ignores the workflow documents in the allowlist', () => {
    expect(deriveScopeFromAllowlist([
      'openspec/changes/change-1/verify.md',
      'openspec/changes/change-1/checklist.md',
      'ecum/service/ecum.c',
    ])).toBe('single-file')
  })

  it('reads a single product file as 单文件', () => {
    expect(deriveScopeFromAllowlist(['ecum/service/ecum.c'])).toBe('single-file')
  })
})
