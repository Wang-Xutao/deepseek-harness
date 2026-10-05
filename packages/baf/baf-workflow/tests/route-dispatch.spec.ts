/**
 * 多模型路由 M2 — dispatch-time tier routing: pure selection + shell.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it, afterEach } from 'vitest'
import { projectionLogPath, type EnterpriseRoutePolicy, type RouteTierConfig } from '@deepseek-ai/dsh-baf-core'
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

/**
 * Fix pass #2 fixture: a deployment ceiling that allows the mid and low tier
 * models but NOT the high one — acceptance item 7 says the tier synthesis
 * must min-restrict against it instead of escaping it.
 */
function ceilingForbiddingHigh(): EnterpriseRoutePolicy {
  return {
    schema: 1,
    policyId: 'fixture-ceiling',
    version: 'v1',
    allowSessionOverride: true,
    default: { provider: 'p1', model: 'middle' },
    allowed: [
      {
        provider: 'p1', model: 'middle', fallbackGroup: 'ceiling',
        capabilities: ['structured-output', 'tool-use', 'long-context'],
      },
      {
        provider: 'p2', model: 'cheap-fast', fallbackGroup: 'ceiling',
        capabilities: ['coding', 'tool-use', 'low-latency'],
      },
    ],
    fallbackPolicy: {
      mode: 'approved-only',
      groups: {
        ceiling: [{ provider: 'p1', model: 'middle' }, { provider: 'p2', model: 'cheap-fast' }],
      },
    },
  }
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

  it('fix #2: min-restricts the tier synthesis against a frozen enterprise ceiling', () => {
    // Acceptance item 7: big-brain (high) is outside the ceiling, so a
    // keyword-escalated implement turn must fall down the tiers group to
    // the strongest ALLOWED model instead of escaping the ceiling. mid
    // (middle) lacks coding, so the fall lands on low (cheap-fast), with
    // the move on the audit record.
    const outcome = tierRouteSelection(
      signalOf('implement'), makeConfig(), 'high', ceilingForbiddingHigh(),
    )
    expect(outcome).toMatchObject({
      tier: 'high',
      reason: 'keyword',
      selection: { provider: 'p2', model: 'cheap-fast' },
    })
    expect(outcome?.selection.reasoningEffort).toBeUndefined()
    expect(outcome?.resolution.fallbackFrom).toMatchObject({ provider: 'p1', model: 'middle' })
  })

  it('fix #2: a ceiling that allows no tier model disables routing for the turn', () => {
    // No escape hatch: when the ceiling forbids every tier model the
    // resolver rejects and the order runs on the session's current model.
    const ceiling: EnterpriseRoutePolicy = {
      ...ceilingForbiddingHigh(),
      allowed: [{
        provider: 'p9', model: 'approved-elsewhere', fallbackGroup: 'ceiling',
        capabilities: ['coding', 'reasoning'],
      }],
    }
    const outcome = tierRouteSelection(signalOf('implement'), makeConfig(), 'high', ceiling)
    expect(outcome).toBeUndefined()
  })
})

describe('tierRouteSelectorFor (多模型路由 M2 壳)', () => {
  /**
   * 【变更】2026-10-05 (points 4+5): the shell is auto-gated now — the fake
   * controller exposes the RAW selection passthrough and the routing lands as
   * a one-shot pin on the bafRouteAuto runtime (consumed by the next request's
   * model-selection waterfall), never as a durable selectForNextRequest.
   */
  function fakeController(raw?: { provider: string; model: string }) {
    return { rawSelectionOf: () => raw }
  }

  function fakeAuto() {
    const pins: { sessionId: string; selection: { provider: string; model: string; reasoningEffort?: string } }[] = []
    return {
      pins,
      service: {
        accepts: (provider: string, model: string) => provider === 'baf-route' && model === 'auto',
        pinForNextRequest: (sessionId: string, selection: { provider: string; model: string; reasoningEffort?: string }) => {
          pins.push({ sessionId, selection })
        },
      },
    }
  }

  it('pins the tier model through the auto runtime and audits the route', async () => {
    const home = await mkdtemp(join(tmpdir(), 'baf-route-dispatch-home-'))
    const root = await mkdtemp(join(tmpdir(), 'baf-route-dispatch-'))
    try {
      process.env.DSH_HOME = home
      writeRouteTierConfigSync(join(home, 'baf-route-config.json'), makeConfig())
      rememberTaskTier(root, 'change-9', { tier: 'high', matched: '架构' })

      const auto = fakeAuto()
      const audits: { name: string; entry: unknown }[] = []
      const ctx = {
        get(name: string): unknown {
          if (name === 'sessionController') return fakeController({ provider: 'baf-route', model: 'auto' })
          if (name === 'bafRouteAuto') return auto.service
          return undefined
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
      expect(auto.pins).toEqual([
        { sessionId: 'sess-1', selection: { provider: 'p1', model: 'big-brain', reasoningEffort: 'deep' } },
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

  it('a session NOT on auto stays on its selected model: no pin, no audit (point 4)', async () => {
    const home = await mkdtemp(join(tmpdir(), 'baf-route-dispatch-home5-'))
    const root = await mkdtemp(join(tmpdir(), 'baf-route-dispatch-root5-'))
    try {
      process.env.DSH_HOME = home
      writeRouteTierConfigSync(join(home, 'baf-route-config.json'), makeConfig())
      rememberTaskTier(root, 'change-9', { tier: 'high', matched: '架构' })

      for (const raw of [
        { provider: 'deepseek-official', model: 'deepseek-v4' },
        { provider: 'baf-route', model: 'deepseek-v4' },
        { provider: 'deepseek-official', model: 'auto' },
        undefined,
      ] as [{ provider: string; model: string } | undefined]) {
        const auto = fakeAuto()
        const audits: { name: string; entry: unknown }[] = []
        const ctx = {
          get(name: string): unknown {
            if (name === 'sessionController') return fakeController(raw)
            if (name === 'bafRouteAuto') return auto.service
            return undefined
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
        route?.(signalOf('implement', 'change-9'))
        expect(auto.pins, `raw=${JSON.stringify(raw)}`).toEqual([])
        expect(audits, `raw=${JSON.stringify(raw)}`).toEqual([])
      }
    } finally {
      await rm(home, { recursive: true, force: true })
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rehydrates the frozen tier from the projection log after a host restart', async () => {
    // Fix pass #1 (review Important): the in-process task-tier map dies with
    // the host, but the frozen tier lives in the change's projection JSONL —
    // a cache-miss dispatch must re-read the log instead of silently
    // dropping the change to the phase mapping (clarify=mid here, expected
    // big-brain).
    const home = await mkdtemp(join(tmpdir(), 'baf-route-dispatch-home3-'))
    const root = await mkdtemp(join(tmpdir(), 'baf-route-dispatch-root3-'))
    try {
      process.env.DSH_HOME = home
      writeRouteTierConfigSync(join(home, 'baf-route-config.json'), makeConfig())
      // Restart-equivalent log: intake confirmed, tier frozen at high — and
      // NO rememberTaskTier (the in-process map is empty, as after restart).
      const logPath = join(root, projectionLogPath('change-1'))
      await mkdir(dirname(logPath), { recursive: true })
      await writeFile(
        logPath,
        [
          JSON.stringify({ seq: 1, type: 'intake-confirmed', by: 'user' }),
          JSON.stringify({ seq: 2, type: 'task-tier-frozen', tier: 'high', matched: '架构' }),
        ].join('\n') + '\n',
        'utf8',
      )

      const auto = fakeAuto()
      const ctx = {
        get(name: string): unknown {
          if (name === 'sessionController') return fakeController({ provider: 'baf-route', model: 'auto' })
          if (name === 'bafRouteAuto') return auto.service
          return undefined
        },
      }
      const route = tierRouteSelectorFor(root, ctx, { session: { header: { id: 'sess-1' } } })
      route?.(signalOf('clarify'))
      expect(auto.pins).toEqual([
        { sessionId: 'sess-1', selection: { provider: 'p1', model: 'big-brain', reasoningEffort: 'deep' } },
      ])
    } finally {
      await rm(home, { recursive: true, force: true })
      await rm(root, { recursive: true, force: true })
    }
  })

  it('fix #2: reads the enterprise ceiling through the bafWorkflow service', async () => {
    const home = await mkdtemp(join(tmpdir(), 'baf-route-dispatch-home4-'))
    const root = await mkdtemp(join(tmpdir(), 'baf-route-dispatch-root4-'))
    try {
      process.env.DSH_HOME = home
      writeRouteTierConfigSync(join(home, 'baf-route-config.json'), makeConfig())
      rememberTaskTier(root, 'change-7', { tier: 'high', matched: '架构' })

      const auto = fakeAuto()
      const ctx = {
        get(name: string): unknown {
          if (name === 'sessionController') return fakeController({ provider: 'baf-route', model: 'auto' })
          if (name === 'bafRouteAuto') return auto.service
          // The structural BafWorkflow face the dispatch shell reads (fix
          // pass #2): an explicitly frozen deployment ceiling.
          if (name === 'bafWorkflow') return { frozenEnterprisePolicy: () => ceilingForbiddingHigh() }
          return undefined
        },
      }
      const route = tierRouteSelectorFor(root, ctx, { session: { header: { id: 'sess-1' } } })
      route?.(signalOf('implement', 'change-7'))
      // big-brain is outside the ceiling: the pin falls down the tiers
      // group to cheap-fast (mid lacks coding), never escaping it.
      expect(auto.pins).toEqual([
        { sessionId: 'sess-1', selection: { provider: 'p2', model: 'cheap-fast' } },
      ])
    } finally {
      await rm(home, { recursive: true, force: true })
      await rm(root, { recursive: true, force: true })
    }
  })

  it('returns undefined when routing is inactive or no controller/auto runtime is reachable', async () => {
    const home = await mkdtemp(join(tmpdir(), 'baf-route-dispatch-home2-'))
    try {
      const auto = fakeAuto()
      // No config file: nothing to route by.
      process.env.DSH_HOME = home
      expect(tierRouteSelectorFor('/w', { get: () => undefined }, { session: { header: {} } })).toBeUndefined()

      // Config present but no sessionController service: routing cannot be
      // applied, so no hook is installed (the order runs on the session's
      // current model).
      writeRouteTierConfigSync(join(home, 'baf-route-config.json'), makeConfig())
      expect(tierRouteSelectorFor('/w', { get: () => undefined }, { session: { header: {} } })).toBeUndefined()
      expect(tierRouteSelectorFor('/w', undefined, { session: { header: {} } })).toBeUndefined()

      // 【变更】2026-10-05: the auto runtime carries the pin now — without it
      // there is nothing to route THROUGH, so no hook either.
      const controllerOnly = {
        get(name: string): unknown {
          return name === 'sessionController' ? fakeController({ provider: 'baf-route', model: 'auto' }) : undefined
        },
      }
      expect(tierRouteSelectorFor('/w', controllerOnly, { session: { header: { id: 'sess-1' } } })).toBeUndefined()
      expect(auto.pins).toEqual([])
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})
