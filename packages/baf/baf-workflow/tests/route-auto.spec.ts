/**
 * 多模型路由 auto 模型 — the host-realm `bafRouteAuto` runtime.
 *
 * Point 4/5 of the 2026-10-05 batch: routing only drives a session whose
 * model selection is the pseudo `baf-route/auto` entry; plain chat sessions
 * default to Worker (low) and escalate only on a keyword hit in the last user
 * message. The service owns the one-shot dispatch pins, the per-session last
 * user text cache, and the auto catalog group the session controller prepends
 * while routing is active.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, onTestFinished } from 'vitest'
import type { RouteTierConfig } from '@deepseek-ai/dsh-baf-core'
import type { Session } from '@deepseek-ai/dsh-session'
import { writeRoutePresetsSync, writeRouteTierConfigSync } from '../src/route-config-io.ts'
import { BafRouteAutoRuntime, AUTO_MODEL, AUTO_PROVIDER } from '../src/route-auto.ts'

function makeConfig(overrides: Partial<RouteTierConfig> = {}): RouteTierConfig {
  return {
    schema: 1,
    enabled: true,
    tiers: {
      high: { provider: 'p1', model: 'big-brain', reasoningEffort: 'deep' },
      mid: { provider: 'p1', model: 'middle' },
      low: { provider: 'p2', model: 'cheap-fast' },
    },
    keywords: [],
    ...overrides,
  }
}

let home = ''
let savedEnv: string | undefined

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'baf-route-auto-'))
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
  await ctx.plugin(BafRouteAutoRuntime, {})
  return { ctx, service: ctx.get('bafRouteAuto') as BafRouteAutoRuntime }
}

describe('BafRouteAutoRuntime (多模型路由 auto 模型)', () => {
  it('registers under the bafRouteAuto service name in the host realm', async () => {
    const { ctx } = await fixture()
    expect(ctx.get('bafRouteAuto')).toBeInstanceOf(BafRouteAutoRuntime)
  })

  it('accepts() recognizes only the baf-route/auto pseudo pair', async () => {
    const { service } = await fixture()
    expect(service.accepts(AUTO_PROVIDER, AUTO_MODEL)).toBe(true)
    expect(service.accepts('deepseek-official', 'auto')).toBe(false)
    expect(service.accepts(AUTO_PROVIDER, 'deepseek-chat')).toBe(false)
    expect(service.accepts('p1', 'big-brain')).toBe(false)
  })

  it('catalogGroups() exposes the auto group only while routing is active', async () => {
    const { service } = await fixture()
    // No config file: the picker must not offer auto at all (没有使能则没有 auto).
    expect(service.catalogGroups()).toEqual([])
    writeRouteTierConfigSync(undefined, makeConfig({ enabled: false }))
    expect(service.catalogGroups()).toEqual([])
    writeRouteTierConfigSync(undefined, makeConfig())
    expect(service.catalogGroups()).toEqual([{
      id: AUTO_PROVIDER,
      name: expect.any(String),
      models: [{ id: AUTO_MODEL, name: expect.any(String) }],
    }])
  })

  it('resolveAuto() returns undefined for a non-auto selection', async () => {
    const { service } = await fixture()
    writeRouteTierConfigSync(undefined, makeConfig())
    expect(service.resolveAuto('sess-1', { provider: 'p1', model: 'big-brain' })).toBeUndefined()
  })

  it('resolveAuto() returns undefined when routing is inactive', async () => {
    const { service } = await fixture()
    writeRouteTierConfigSync(undefined, makeConfig({ enabled: false }))
    expect(service.resolveAuto('sess-1', { provider: AUTO_PROVIDER, model: AUTO_MODEL })).toBeUndefined()
  })

  it('defaults to Worker (low) when no keyword hits the last user message', async () => {
    const { service } = await fixture()
    writeRouteTierConfigSync(undefined, makeConfig())
    expect(service.resolveAuto('sess-1', { provider: AUTO_PROVIDER, model: AUTO_MODEL }))
      .toEqual({ provider: 'p2', model: 'cheap-fast' })
  })

  it('escalates by keyword against the last user message (builtin packs included)', async () => {
    const { ctx } = await fixture()
    const service = ctx.get('bafRouteAuto') as BafRouteAutoRuntime
    writeRouteTierConfigSync(undefined, makeConfig({ keywords: [{ words: '重构|refactor', tier: 'mid' }] }))
    ctx.emit('session/event', { id: 'sess-1', header: { id: 'sess-1' } } as never, {
      type: 'user/message',
      data: { source: { kind: 'user' }, content: [{ type: 'text', text: '帮我做一次重构' }] },
    } as never)
    expect(service.resolveAuto('sess-1', { provider: AUTO_PROVIDER, model: AUTO_MODEL }))
      .toEqual({ provider: 'p1', model: 'middle' })
    // Builtin packs work with zero user keywords: 架构 lives in complexEngineering (high).
    writeRouteTierConfigSync(undefined, makeConfig())
    ctx.emit('session/event', { id: 'sess-1', header: { id: 'sess-1' } } as never, {
      type: 'user/message',
      data: { source: { kind: 'user' }, content: [{ type: 'text', text: '帮我梳理整体架构' }] },
    } as never)
    expect(service.resolveAuto('sess-1', { provider: AUTO_PROVIDER, model: AUTO_MODEL }))
      .toEqual({ provider: 'p1', model: 'big-brain', reasoningEffort: 'deep' })
  })

  it('ignores non-user and text-less session events when caching', async () => {
    const { ctx } = await fixture()
    const service = ctx.get('bafRouteAuto') as BafRouteAutoRuntime
    ctx.emit('session/event', { id: 'sess-1', header: { id: 'sess-1' } } as never, {
      type: 'user/message',
      data: { source: { kind: 'system' }, content: [{ type: 'text', text: '架构' }] },
    } as never)
    // No cached text → Worker default, no keyword escalation.
    writeRouteTierConfigSync(undefined, makeConfig())
    expect(service.resolveAuto('sess-1', { provider: AUTO_PROVIDER, model: AUTO_MODEL }))
      .toEqual({ provider: 'p2', model: 'cheap-fast' })
  })

  it('a dispatch pin wins over the keyword path and is consumed once', async () => {
    const { service } = await fixture()
    writeRouteTierConfigSync(undefined, makeConfig())
    service.pinForNextRequest('sess-1', { provider: 'p1', model: 'big-brain', reasoningEffort: 'deep' })
    expect(service.resolveAuto('sess-1', { provider: AUTO_PROVIDER, model: AUTO_MODEL }))
      .toEqual({ provider: 'p1', model: 'big-brain', reasoningEffort: 'deep' })
    // One-shot: the next resolution falls back to the keyword/default path.
    expect(service.resolveAuto('sess-1', { provider: AUTO_PROVIDER, model: AUTO_MODEL }))
      .toEqual({ provider: 'p2', model: 'cheap-fast' })
  })

  it('re-reads the config per resolution (a settings save applies to the next turn)', async () => {
    const { service } = await fixture()
    writeRouteTierConfigSync(undefined, makeConfig())
    expect(service.resolveAuto('sess-1', { provider: AUTO_PROVIDER, model: AUTO_MODEL }))
      .toEqual({ provider: 'p2', model: 'cheap-fast' })
    writeRouteTierConfigSync(undefined, { ...makeConfig(), enabled: false })
    expect(service.resolveAuto('sess-1', { provider: AUTO_PROVIDER, model: AUTO_MODEL })).toBeUndefined()
  })

  it('escalates by the FILE preset packs and honors the config pack park (2026-10-06 问题 3/4)', async () => {
    const { ctx } = await fixture()
    const service = ctx.get('bafRouteAuto') as BafRouteAutoRuntime
    writeRoutePresetsSync(undefined, {
      schema: 1,
      packs: [{ id: 'myPack', tier: 'high', words: '对账|reconciliation' }],
    })
    writeRouteTierConfigSync(undefined, makeConfig())
    ctx.emit('session/event', { id: 'sess-1', header: { id: 'sess-1' } } as never, {
      type: 'user/message',
      data: { source: { kind: 'user' }, content: [{ type: 'text', text: '做一个对账任务' }] },
    } as never)
    // The user-edited pack file drives the escalation — not the code builtins.
    expect(service.resolveAuto('sess-1', { provider: AUTO_PROVIDER, model: AUTO_MODEL }))
      .toEqual({ provider: 'p1', model: 'big-brain', reasoningEffort: 'deep' })
    // Parking the pack (类级开关) drops the rule; the same cached text falls
    // back to the Worker default.
    writeRouteTierConfigSync(undefined, makeConfig({ packs: { myPack: false } }))
    expect(service.resolveAuto('sess-1', { provider: AUTO_PROVIDER, model: AUTO_MODEL }))
      .toEqual({ provider: 'p2', model: 'cheap-fast' })
  })

  it('registers as the step route resolver the agent loop reads', async () => {
    const { ctx, service } = await fixture()
    expect(ctx.get('stepRouteResolver')).toBe(service)
  })

  it('resolveStepRoute() maps the pseudo pair to the step route and leaves other routes alone', async () => {
    const { service } = await fixture()
    writeRouteTierConfigSync(undefined, makeConfig())
    const session = { header: { id: 'sess-1' }, requestHeader: () => undefined } as unknown as Session
    // The auto pseudo pair is not a provider route: the step runs on the tier route.
    expect(service.resolveStepRoute(session, { provider: AUTO_PROVIDER, model: AUTO_MODEL }))
      .toEqual({ provider: 'p2', model: 'cheap-fast' })
    // Any other recorded route is the step's route.
    const other = { provider: 'p1', model: 'big-brain' }
    expect(service.resolveStepRoute(session, other)).toBe(other)
  })

  it('resolveStepRoute() falls back to the last request route when routing went away', async () => {
    const { service } = await fixture()
    writeRouteTierConfigSync(undefined, makeConfig({ enabled: false }))
    const session = {
      header: { id: 'sess-1' },
      requestHeader: () => ({ config: { provider: 'p1', model: 'big-brain' } }),
    } as unknown as Session
    // The pseudo pair must never reach a provider: the step runs on the route
    // the last request used.
    expect(service.resolveStepRoute(session, { provider: AUTO_PROVIDER, model: AUTO_MODEL }))
      .toEqual({ provider: 'p1', model: 'big-brain' })
  })
})
