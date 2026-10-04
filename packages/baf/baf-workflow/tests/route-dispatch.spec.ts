/**
 * 多模型路由 M2 — dispatch-time tier routing: pure selection + shell.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, afterEach } from 'vitest'
import type { RouteTierConfig } from '@deepseek-ai/dsh-baf-core'
import { writeRouteTierConfigSync } from '../src/route-config-io.ts'
import { rememberTaskTier, resetTaskTierMemory } from '../src/task-tier-memory.ts'
import type { DispatchSignal } from '../src/go-dispatch.ts'
import { tierRouteSelection, tierRouteSelectorFor } from '../src/route-dispatch.ts'

const savedDshHome = process.env.DSH_HOME
afterEach(() => {
  if (savedDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedDshHome
  resetTaskTierMemory()
})

function makeConfig(overrides: Partial<RouteTierConfig> = {}): RouteTierConfig {
  return {
    schema: 1,
    enabled: true,
    tiers: {
      high: { provider: 'p1', model: 'big-brain', reasoningEffort: 'deep' },
      mid: { provider: 'p1', model: 'middle' },
      low: { provider: 'p2', model: 'cheap-fast' },
    },
    ...overrides,
  }
}

function signalOf(node: DispatchSignal['node'], changeId = 'change-1'): DispatchSignal {
  return { changeId, node, artifactPath: `openspec/changes/${changeId}/x.md`, missing: [] }
}

describe('tierRouteSelection (多模型路由 M2 纯核)', () => {
  it('returns undefined when routing is inactive', () => {
    expect(tierRouteSelection(signalOf('implement'), undefined, undefined)).toBeUndefined()
    expect(tierRouteSelection(signalOf('implement'), makeConfig({ enabled: false }), undefined)).toBeUndefined()
  })

  it('routes by the phase mapping alone when no keyword tier is frozen', () => {
    const outcome = tierRouteSelection(signalOf('implement'), makeConfig(), undefined)
    // implement maps low; the low spec carries no reasoningEffort.
    expect(outcome).toMatchObject({
      tier: 'low',
      reason: 'phase',
      selection: { provider: 'p2', model: 'cheap-fast' },
    })
    expect(outcome?.selection.reasoningEffort).toBeUndefined()
  })

  it('escalates a frozen high task tier onto a low phase (escalateOnly default)', () => {
    const outcome = tierRouteSelection(signalOf('implement'), makeConfig(), 'high')
    expect(outcome).toMatchObject({
      tier: 'high',
      reason: 'keyword',
      selection: { provider: 'p1', model: 'big-brain', reasoningEffort: 'deep' },
    })
  })

  it('keeps the phase mapping when escalateOnly is false', () => {
    const config = makeConfig({ escalateOnly: false })
    const outcome = tierRouteSelection(signalOf('implement'), config, 'high')
    expect(outcome).toMatchObject({
      tier: 'low',
      reason: 'phase',
      selection: { provider: 'p2', model: 'cheap-fast' },
    })
  })

  it('follows the resolved tier for reasoningEffort after a fallback move', () => {
    // verify requires structured-output, which the low tier lacks; a phase
    // override mapping verify→low must FALL BACK up the tiers group to a
    // model that satisfies the phase — and the reasoningEffort comes from
    // the tier actually resolved (high), not the one preferred (low).
    const config = makeConfig({ phaseTier: { verify: 'low' } })
    const outcome = tierRouteSelection(signalOf('verify'), config, undefined)
    expect(outcome).toMatchObject({
      tier: 'low',
      reason: 'phase',
      selection: { provider: 'p1', model: 'big-brain', reasoningEffort: 'deep' },
    })
    expect(outcome?.resolution.fallbackFrom).toMatchObject({ provider: 'p2', model: 'cheap-fast' })
  })

  it('M4: escalates a verify-failed retry to at least mid (审核不过 → 换更强模型再审)', () => {
    // implement maps low; the T11/T15 retry loop's cause floors the turn at
    // mid. implement requires coding, which mid lacks — the approved-only
    // fallback then lands the retry on high (the STRONGEST model: exactly the
    // M4 intent), with the floor + fallback both on the audit record.
    const signal = { ...signalOf('implement'), cause: 'verify-failed' as const }
    const outcome = tierRouteSelection(signal, makeConfig(), undefined)
    expect(outcome).toMatchObject({
      tier: 'mid',
      reason: 'verify-escalation',
      selection: { provider: 'p1', model: 'big-brain', reasoningEffort: 'deep' },
    })
    expect(outcome?.resolution.fallbackFrom).toMatchObject({ provider: 'p1', model: 'middle' })
  })

  it('M4: keeps a keyword tier above the mid floor (floor never demotes)', () => {
    const signal = { ...signalOf('implement'), cause: 'verify-failed' as const }
    const outcome = tierRouteSelection(signal, makeConfig(), 'high')
    expect(outcome).toMatchObject({
      tier: 'high',
      reason: 'keyword',
      selection: { provider: 'p1', model: 'big-brain', reasoningEffort: 'deep' },
    })
  })

  it('M4: an already-mid verify retry keeps the phase reason (floor is silent at parity)', () => {
    const signal = { ...signalOf('verify'), cause: 'verify-failed' as const }
    const outcome = tierRouteSelection(signal, makeConfig(), undefined)
    expect(outcome).toMatchObject({
      tier: 'mid',
      reason: 'phase',
      selection: { provider: 'p1', model: 'middle' },
    })
  })
})

describe('tierRouteSelectorFor (多模型路由 M2 壳)', () => {
  it('selects via the session controller and audits the route', async () => {
    const home = await mkdtemp(join(tmpdir(), 'baf-route-dispatch-home-'))
    const root = await mkdtemp(join(tmpdir(), 'baf-route-dispatch-'))
    try {
      process.env.DSH_HOME = home
      writeRouteTierConfigSync(join(home, 'baf-route-config.json'), makeConfig())
      rememberTaskTier(root, 'change-9', { tier: 'high', matched: '架构' })

      const selections: unknown[] = []
      const audits: { name: string; entry: unknown }[] = []
      const controller = {
        selectForNextRequest(_agent: unknown, selection: unknown): void {
          selections.push(selection)
        },
      }
      const ctx = {
        get(name: string): unknown {
          return name === 'sessionController' ? controller : undefined
        },
      }
      const agent = {
        session: {
          header: { id: 'sess-1' },
          append(name: string, entry: unknown): void {
            audits.push({ name, entry })
          },
        },
      }
      const route = tierRouteSelectorFor(root, ctx, agent)
      expect(route).toBeTypeOf('function')

      route?.(signalOf('implement', 'change-9'))
      expect(selections).toEqual([
        { provider: 'p1', model: 'big-brain', reasoningEffort: 'deep' },
      ])
      expect(audits).toHaveLength(1)
      expect(audits[0]?.name).toBe('baf/route-resolved')
      expect(audits[0]?.entry).toMatchObject({
        provider: 'p1',
        model: 'big-brain',
        phase: 'implement',
        sessionId: 'sess-1',
        changeId: 'change-9',
        tier: 'high',
        tierReason: 'keyword',
      })
    } finally {
      await rm(home, { recursive: true, force: true })
      await rm(root, { recursive: true, force: true })
    }
  })

  it('returns undefined when routing is inactive or no controller is reachable', async () => {
    const home = await mkdtemp(join(tmpdir(), 'baf-route-dispatch-home2-'))
    try {
      // No config file: nothing to route by.
      process.env.DSH_HOME = home
      expect(tierRouteSelectorFor('/w', { get: () => undefined }, { session: { header: {} } })).toBeUndefined()

      // Config present but no sessionController service: routing cannot be
      // applied, so no hook is installed (the order runs on the session's
      // current model).
      writeRouteTierConfigSync(join(home, 'baf-route-config.json'), makeConfig())
      expect(tierRouteSelectorFor('/w', { get: () => undefined }, { session: { header: {} } })).toBeUndefined()
      expect(tierRouteSelectorFor('/w', undefined, { session: { header: {} } })).toBeUndefined()
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})
