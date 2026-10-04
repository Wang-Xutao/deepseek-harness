/**
 * 多模型路由 M3 批次C — the 工作流 Tab「当前路由」fold: preferred tiers from
 * the config, actual/fallback from the session's `baf/route-resolved` audits.
 */

import { describe, expect, it } from 'vitest'
import type { RouteTierConfig, WorkflowNode } from '@deepseek-ai/dsh-baf-core'
import type { RouteAuditEntry } from '../src/route-audit.ts'
import { buildTierRouteStatus, lastRouteAuditByPhase } from '../src/route-status.ts'

const CONFIG: RouteTierConfig = {
  schema: 1,
  enabled: true,
  tiers: {
    high: { provider: 'p1', model: 'big-brain', reasoningEffort: 'deep' },
    mid: { provider: 'p1', model: 'middle' },
    low: { provider: 'p2', model: 'cheap-fast' },
  },
  phaseTier: { verify: 'low', implement: 'high' },
}

function auditOf(phase: WorkflowNode, overrides: Partial<RouteAuditEntry> = {}): RouteAuditEntry {
  return {
    provider: 'p1',
    model: 'middle',
    source: 'phase',
    phase,
    at: '2026-10-05T00:00:00.000Z',
    sessionId: 's1',
    ...overrides,
  }
}

describe('buildTierRouteStatus (M3 批次C 纯核)', () => {
  it('returns off for a missing or disabled config', () => {
    expect(buildTierRouteStatus(undefined, {})).toEqual({ state: 'off' })
    expect(buildTierRouteStatus({ ...CONFIG, enabled: false }, {
      design: auditOf('design'),
    })).toEqual({ state: 'off' })
  })

  it('folds nine phase rows with preferred tiers from overrides and defaults', () => {
    const status = buildTierRouteStatus(CONFIG, {})
    expect(status.state).toBe('routed')
    if (status.state !== 'routed') return
    expect(status.phases.map(row => [row.phase, row.preferredTier])).toEqual([
      ['intake', 'low'],
      ['open', 'low'],
      ['clarify', 'mid'],
      ['design', 'high'],
      ['plan', 'high'],
      ['implement', 'high'],
      ['verify', 'low'],
      ['archive', 'low'],
      ['drift', 'low'],
    ])
    // The preferred ref is the mapped tier's model; reasoningEffort stays a
    // dispatch concern and never reaches the wire view.
    expect(status.phases.find(row => row.phase === 'design')?.preferred)
      .toEqual({ provider: 'p1', model: 'big-brain' })
    expect(status.tiers.low).toEqual({ provider: 'p2', model: 'cheap-fast' })
  })

  it('marks the last audit per phase as the actual with tier, reason, and fallback', () => {
    const status = buildTierRouteStatus(CONFIG, {
      implement: auditOf('implement', {
        provider: 'p1',
        model: 'big-brain',
        tier: 'high',
        tierReason: 'keyword',
        at: '2026-10-05T00:01:00.000Z',
      }),
      design: auditOf('design', {
        provider: 'p2',
        model: 'cheap-fast',
        source: 'enterprise',
        fallbackFrom: { provider: 'p1', model: 'big-brain', reason: 'not allowed' },
      }),
    })
    if (status.state !== 'routed') throw new Error('expected routed')
    const implement = status.phases.find(row => row.phase === 'implement')?.actual
    expect(implement).toMatchObject({
      provider: 'p1',
      model: 'big-brain',
      tier: 'high',
      tierReason: 'keyword',
      fallbackActive: false,
      at: '2026-10-05T00:01:00.000Z',
    })
    const design = status.phases.find(row => row.phase === 'design')?.actual
    expect(design).toMatchObject({ provider: 'p2', model: 'cheap-fast', fallbackActive: true })
  })

  it('omits tier fields when the audit carries none (pre-M2 logs)', () => {
    const status = buildTierRouteStatus(CONFIG, { verify: auditOf('verify') })
    if (status.state !== 'routed') throw new Error('expected routed')
    expect(status.phases.find(row => row.phase === 'verify')?.actual)
      .toMatchObject({ provider: 'p1', model: 'middle', fallbackActive: false })
    expect(status.phases.find(row => row.phase === 'verify')?.actual?.tier).toBeUndefined()
  })

  it('leaves phases without audits actual-less', () => {
    const status = buildTierRouteStatus(CONFIG, { design: auditOf('design') })
    if (status.state !== 'routed') throw new Error('expected routed')
    expect(status.phases.find(row => row.phase === 'verify')?.actual).toBeUndefined()
  })
})

describe('lastRouteAuditByPhase (cold-log scan)', () => {
  it('keeps the last baf/route-resolved entry per phase in log order', () => {
    const events = [
      { type: 'user/message', data: { content: 'hello' } },
      { type: 'baf/route-resolved', data: auditOf('design', { at: '2026-10-05T00:00:01.000Z' }) },
      { type: 'baf/route-resolved', data: auditOf('implement', { tier: 'high' }) },
      { type: 'assistant/message', data: { content: [] } },
      { type: 'baf/route-resolved', data: auditOf('design', { at: '2026-10-05T00:00:02.000Z' }) },
    ]
    const byPhase = lastRouteAuditByPhase(events)
    expect(byPhase.design?.at).toBe('2026-10-05T00:00:02.000Z')
    expect(byPhase.implement?.tier).toBe('high')
    expect(Object.keys(byPhase).sort()).toEqual(['design', 'implement'])
  })

  it('skips malformed payloads instead of throwing', () => {
    const events = [
      { type: 'baf/route-resolved', data: { nonsense: true } },
      { type: 'baf/route-resolved', data: auditOf('archive', { source: 'failed', failureReason: 'x' }) },
    ]
    const byPhase = lastRouteAuditByPhase(events)
    expect(byPhase.archive?.source).toBe('failed')
    expect(Object.keys(byPhase)).toEqual(['archive'])
  })
})
