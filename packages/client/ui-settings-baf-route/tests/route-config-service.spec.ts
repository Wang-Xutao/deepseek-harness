/**
 * bafRouteConfig host Remote: get/save/reset over the DSH-home config file,
 * validation on save, and `baf-route-config/changed` announcements.
 *
 * 多模型路由 M3: the service moved here from baf-workflow — a browser-reachable
 * Remote needs the generated TYPERT_REMOTE contribution only a dual client
 * package produces. The default import IS the loader contract (the host mounts
 * the package's default export).
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, onTestFinished } from 'vitest'
import type { RouteTierConfig } from '@deepseek-ai/dsh-baf-core'
import BafRouteConfigService from '../src/index.ts'
import { routeTierConfigPath, writeRoutePresetsSync } from '@deepseek-ai/dsh-baf-workflow/route-config-io'

const VALID: RouteTierConfig = {
  schema: 1,
  enabled: true,
  tiers: {
    high: { provider: 'p', model: 'big', reasoningEffort: 'high' },
    mid: { provider: 'p', model: 'mid' },
    low: { provider: 'p', model: 'cheap' },
  },
  phaseTier: { design: 'high' },
  keywords: [{ words: '架构|refactor', tier: 'high' }],
  escalateOnly: true,
}

let home = ''
let savedEnv: string | undefined

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'baf-route-config-svc-'))
  savedEnv = process.env.DSH_HOME
  process.env.DSH_HOME = home
})

afterEach(() => {
  if (savedEnv === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedEnv
  rmSync(home, { recursive: true, force: true })
})

async function fixture() {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(BafRouteConfigService)
  return { ctx, service: ctx.bafRouteConfig }
}

describe('bafRouteConfig Remote', () => {
  it('get() returns null when no config exists', async () => {
    const { service } = await fixture()
    expect(await service.get()).toBeNull()
  })

  it('save() validates, persists the normalized config, and announces the change', async () => {
    const { ctx, service } = await fixture()
    const events: number[] = []
    ctx.on('baf-route-config/changed', () => { events.push(events.length) })
    const result = await service.save(VALID)
    expect(result.ok).toBe(true)
    const loaded = await service.get()
    expect(loaded?.tiers.high).toEqual({ provider: 'p', model: 'big', reasoningEffort: 'high' })
    // Normalization fills the optional collections before persisting.
    expect(loaded?.keywords).toEqual([{ words: '架构|refactor', tier: 'high' }])
    expect(JSON.parse(readFileSync(routeTierConfigPath(), 'utf8')).escalateOnly).toBe(true)
    expect(events).toHaveLength(1)
  })

  it('save() refuses an invalid document without touching the file or emitting', async () => {
    const { ctx, service } = await fixture()
    const events: number[] = []
    ctx.on('baf-route-config/changed', () => { events.push(events.length) })
    const result = await service.save({ ...VALID, tiers: { ...VALID.tiers, low: { provider: '', model: 'x' } } })
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(await service.get()).toBeNull()
    expect(events).toHaveLength(0)
  })

  it('reset() removes the file and announces the change (idempotent)', async () => {
    const { ctx, service } = await fixture()
    const events: number[] = []
    ctx.on('baf-route-config/changed', () => { events.push(events.length) })
    expect((await service.save(VALID)).ok).toBe(true)
    await service.reset()
    expect(await service.get()).toBeNull()
    await service.reset()
    // Every mutation announces, even the no-op second reset (clients re-read).
    expect(events).toHaveLength(3)
  })

  it('preview() dry-runs the keyword match host-side (多模型路由 M3 预演)', async () => {
    const { service } = await fixture()
    // 【变更】2026-10-06 (问题 5): the enabled gate is GONE from 预演 — the
    // preset packs evaluate with NO config at all (fresh machine), and the
    // switch only gates live routing. 架构 lives in the seeded pack file.
    expect(await service.preview('梳理整体架构')).toMatchObject({ tier: 'high', matched: '架构' })
    // A summary nothing matches still freezes nothing.
    expect(await service.preview('帮我看看这个问题')).toEqual({ tier: null })

    expect((await service.save(VALID)).ok).toBe(true)
    // VALID's keywords hit 架构 → high.
    expect(await service.preview('梳理整体架构')).toMatchObject({ tier: 'high', matched: '架构' })
  })

  it('preview() matches builtin presets even with zero user keywords (2.4 默认启用)', async () => {
    const { service } = await fixture()
    expect((await service.save({ ...VALID, keywords: [] })).ok).toBe(true)
    // 架构 lives in the builtin complexEngineering pack; README vocabulary
    // matched the retired Worker pack — now it hits nothing and the turn
    // falls through to the Worker fallback by design (2026-10-13 批).
    expect(await service.preview('梳理整体架构')).toMatchObject({ tier: 'high', matched: '架构' })
    expect(await service.preview('补充 README 安装说明')).toEqual({ tier: null })
  })

  it('get() materializes the default phase mapping for omitted nodes (多模型路由 M3)', async () => {
    const { service } = await fixture()
    expect((await service.save(VALID)).ok).toBe(true)
    const loaded = await service.get()
    // The saved doc only pinned design=high; the read path fills the rest with
    // the built-in defaults so the settings row shows the EFFECTIVE mapping.
    expect(loaded?.phaseTier?.design).toBe('high')
    expect(loaded?.phaseTier?.implement).toBe('low')
    expect(loaded?.phaseTier?.verify).toBe('mid')
  })

  it('defaults() exposes the two-grade phase map for fresh drafts', async () => {
    const { service } = await fixture()
    const defaults = await service.defaults()
    expect(defaults.tierMode).toBe('two')
    expect(defaults.phaseTier.design).toBe('high')
    expect(defaults.phaseTier.implement).toBe('low')
    expect(defaults.phaseTier.verify).toBe('low')
    expect(Object.keys(defaults.phaseTier)).toHaveLength(9)
  })

  it('defaults() ships the builtin keyword presets for the read-only preset block (2.4)', async () => {
    const { service } = await fixture()
    const presets = (await service.defaults()).presets
    // 【变更】2026-10-13 (worker 关键词批): three escalation packs — the low
    // routineEdits pack is gone (Worker is the fallback grade).
    expect(presets?.map(preset => preset.id)).toEqual([
      'complexEngineering', 'criticalRelease', 'qualityAssurance',
    ])
    expect(presets?.[0]).toMatchObject({ tier: 'high' })
    expect(presets?.[0]?.words).toContain('架构')
    for (const preset of presets ?? []) expect(preset.tier).not.toBe('low')
  })
})

describe('bafRouteConfig Remote — 2026-10-06 问题 3/4/5 批 (enable states + preset file)', () => {
  it('preview() ignores the master switch: a DISABLED draft still evaluates (问题 5 root fix)', async () => {
    const { service } = await fixture()
    // freshDraft ships enabled:false — the exact screen the customer hit:
    // 「不会冻结角色」then nothing. The rules must evaluate regardless.
    const draft: RouteTierConfig = {
      ...VALID,
      enabled: false,
      keywords: [{ words: '灰度|canary', tier: 'mid' }],
    }
    expect(await service.preview('帮我做一次灰度切流', draft)).toEqual({
      tier: 'mid', matched: '灰度', provider: 'p', model: 'mid',
    })
    // The saved file being disabled must not freeze the preview either. The
    // saved rule is a LOW one — dead config since 2026-10-13 (Worker is the
    // fallback), so the same summary previews nothing.
    expect((await service.save({ ...VALID, enabled: false, keywords: [{ words: '灰度', tier: 'low' }] })).ok).toBe(true)
    expect(await service.preview('帮我做一次灰度切流')).toEqual({ tier: null })
  })

  it('preview() and defaults() read the FILE preset packs (问题 4 配置文件)', async () => {
    const { service } = await fixture()
    writeRoutePresetsSync(undefined, {
      schema: 1,
      packs: [{ id: 'myPack', tier: 'high', words: '对账|reconciliation' }],
    })
    expect((await service.save({ ...VALID, keywords: [] })).ok).toBe(true)
    expect(await service.preview('做一个对账任务')).toMatchObject({ tier: 'high', matched: '对账' })
    // 架构 is NOT in the user's file — no builtin fallback when the file exists.
    expect(await service.preview('梳理整体架构')).toEqual({ tier: null })
    // defaults() seeds the settings display from the same file.
    expect((await service.defaults()).presets).toEqual([
      { id: 'myPack', tier: 'high', words: '对账|reconciliation' },
    ])
  })

  it('preview() honors the pack and per-word parks (问题 3/4 类级+标签级开关)', async () => {
    const { service } = await fixture()
    expect((await service.save({
      ...VALID,
      keywords: [],
      packs: { qualityAssurance: false },
    })).ok).toBe(true)
    // The whole qualityAssurance pack is parked: 单元测试 freezes nothing.
    expect(await service.preview('补充单元测试覆盖')).toEqual({ tier: null })
    // Parking a single word keeps the rest of the pack live.
    expect((await service.save({
      ...VALID,
      keywords: [],
      presetWords: { 'qualityAssurance::单元测试': false },
    })).ok).toBe(true)
    expect(await service.preview('补充单元测试覆盖')).toEqual({ tier: null })
    expect(await service.preview('排查线上回归')).toMatchObject({ tier: 'mid', matched: '回归' })
  })

  it('preview() drops user rules disabled at the tag level (enabled: false)', async () => {
    const { service } = await fixture()
    expect((await service.save({
      ...VALID,
      keywords: [{ words: '架构', tier: 'low', enabled: false }],
    })).ok).toBe(true)
    // The parked low rule never fires; the seeded preset pack lifts 架构 high.
    expect(await service.preview('梳理整体架构')).toMatchObject({ tier: 'high', matched: '架构' })
  })
})

describe('bafRouteConfig Remote — 多模型路由 auto 批 (2026-10-05)', () => {
  it('mounts the bafRouteAuto runtime with the config service', async () => {
    const { ctx } = await fixture()
    const runtime = ctx.get('bafRouteAuto') as { accepts?: unknown; resolveAuto?: unknown }
    expect(runtime).toBeTruthy()
    expect(typeof runtime?.accepts).toBe('function')
    expect(typeof runtime?.resolveAuto).toBe('function')
  })

  it('preview() reads the DRAFT when one is passed (未保存改动即时预演)', async () => {
    const { service } = await fixture()
    expect((await service.save({ ...VALID, keywords: [] })).ok).toBe(true)
    // A keyword that exists only in the draft hits; without the draft the
    // same summary previews nothing (灰度切流 is in no user rule nor pack).
    const draft: RouteTierConfig = { ...VALID, keywords: [{ words: '灰度|canary', tier: 'mid' }] }
    expect(await service.preview('帮我做一次灰度切流', draft)).toMatchObject({ tier: 'mid', matched: '灰度' })
    expect(await service.preview('帮我做一次灰度切流')).toEqual({ tier: null })
  })

  it('preview() falls back to the SAVED config when the draft is invalid', async () => {
    const { service } = await fixture()
    expect((await service.save(VALID)).ok).toBe(true)
    const badDraft: RouteTierConfig = {
      ...VALID,
      keywords: [{ words: '灰度', tier: 'mid' }],
      tiers: { ...VALID.tiers, low: { provider: '', model: 'x' } },
    }
    // The draft cannot parse; the saved 架构 rule still drives the preview.
    expect(await service.preview('梳理整体架构', badDraft)).toMatchObject({ tier: 'high', matched: '架构' })
  })

  it('preview() simulates the M4 verify-failed floor: below mid escalates and is flagged', async () => {
    const { service } = await fixture()
    expect((await service.save({ ...VALID, keywords: [] })).ok).toBe(true)
    // 【变更】2026-10-13 (worker 关键词批): no below-mid keyword exists anymore
    // (the Worker pack is gone) — the below-mid path is the no-hit one.
    expect(await service.preview('补充 README 安装说明', undefined, { verifyRetry: true }))
      .toMatchObject({ tier: 'mid', escalated: true })
    // No keyword at all: a verify retry still runs at mid.
    expect(await service.preview('帮我看看这个问题', undefined, { verifyRetry: true }))
      .toMatchObject({ tier: 'mid', escalated: true })
    // Already at/above mid: the floor is silent.
    expect(await service.preview('梳理整体架构', undefined, { verifyRetry: true }))
      .toMatchObject({ tier: 'high', matched: '架构' })
    expect(await service.preview('补充单元测试覆盖', undefined, { verifyRetry: true }))
      .toMatchObject({ tier: 'mid', matched: '单元测试' })
    // Without the flag, the same README summary previews no keyword at all.
    expect(await service.preview('补充 README 安装说明')).toEqual({ tier: null })
  })
})
