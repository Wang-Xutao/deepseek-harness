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
import { routeTierConfigPath } from '@deepseek-ai/dsh-baf-workflow/route-config-io'

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
  await ctx.plugin(BafRouteConfigService, {})
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
})
