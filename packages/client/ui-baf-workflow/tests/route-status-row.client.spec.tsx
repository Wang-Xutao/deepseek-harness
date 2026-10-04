// @vitest-environment jsdom
/**
 * 多模型路由 M3 批次C — the 工作流 Tab「当前路由」row: one chip per audited
 * phase (tier·model + 回落/词/失败 badges), nothing at all when routing is off.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { within } from '@testing-library/react'
afterEach(cleanup)
import { RouteStatusRow } from '../src/client/RouteStatusRow.tsx'
import type { WorkflowTabRouteStatus } from '../src/client/tab-types.ts'

const t = (key: string): string => key

function statusOf(phases: WorkflowTabRouteStatus extends { state: 'routed'; phases: infer P } ? P : never): WorkflowTabRouteStatus {
  return {
    state: 'routed',
    tiers: {
      high: { provider: 'p1', model: 'big-brain' },
      mid: { provider: 'p1', model: 'middle' },
      low: { provider: 'p2', model: 'cheap-fast' },
    },
    phases,
  }
}

describe('RouteStatusRow (M3 批次C 当前路由行)', () => {
  it('renders nothing when routing is off', () => {
    const { container } = render(<RouteStatusRow status={{ state: 'off' }} t={t as never} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders one chip per audited phase in workflow order, skipping unaudited ones', () => {
    render(<RouteStatusRow status={statusOf([
      { phase: 'intake', preferredTier: 'low', preferred: { provider: 'p2', model: 'cheap-fast' }, actual: {
        provider: 'p2', model: 'cheap-fast', source: 'phase', tier: 'low', tierReason: 'phase',
        fallbackActive: false, at: '2026-10-05T00:00:00.000Z',
      } },
      { phase: 'design', preferredTier: 'high', preferred: { provider: 'p1', model: 'big-brain' } },
      { phase: 'implement', preferredTier: 'low', preferred: { provider: 'p2', model: 'cheap-fast' }, actual: {
        provider: 'p1', model: 'big-brain', source: 'phase', tier: 'high', tierReason: 'keyword',
        fallbackActive: false, at: '2026-10-05T00:01:00.000Z',
      } },
    ])} t={t as never} />)
    const row = screen.getByTestId('route-status')
    expect(row.textContent).toContain('route.title')
    const chips = within(row).getAllByTestId('route-chip')
    expect(chips.map(chip => chip.textContent)).toEqual([
      'node.intakeroute.tierLow·cheap-fast',
      'node.implementroute.tierHigh·big-brainroute.keyword',
    ])
  })

  it('badges fallback and failed turns, and shows the bare model for pre-M2 audits', () => {
    render(<RouteStatusRow status={statusOf([
      { phase: 'design', preferredTier: 'high', preferred: { provider: 'p1', model: 'big-brain' }, actual: {
        provider: 'p2', model: 'cheap-fast', source: 'enterprise', fallbackActive: true,
        at: '2026-10-05T00:00:00.000Z',
      } },
      { phase: 'verify', preferredTier: 'mid', preferred: { provider: 'p1', model: 'middle' }, actual: {
        provider: 'p1', model: 'middle', source: 'failed', fallbackActive: false,
        at: '2026-10-05T00:02:00.000Z',
      } },
    ])} t={t as never} />)
    const chips = screen.getAllByTestId('route-chip')
    expect(chips[0]?.textContent).toBe('node.designcheap-fastroute.fallback')
    expect(chips[1]?.textContent).toBe('node.verifymiddleroute.failed')
  })

  it('shows the muted hint when routing is on but nothing dispatched yet', () => {
    render(<RouteStatusRow status={statusOf([
      { phase: 'design', preferredTier: 'high', preferred: { provider: 'p1', model: 'big-brain' } },
    ])} t={t as never} />)
    const row = screen.getByTestId('route-status')
    expect(row.textContent).toContain('route.none')
    expect(screen.queryAllByTestId('route-chip')).toEqual([])
  })

  it('M4: badges a verify-escalated turn (tierReason verify-escalation)', () => {
    render(<RouteStatusRow status={statusOf([
      { phase: 'implement', preferredTier: 'low', preferred: { provider: 'p2', model: 'cheap-fast' }, actual: {
        provider: 'p1', model: 'middle', source: 'phase', tier: 'mid', tierReason: 'verify-escalation',
        fallbackActive: false, at: '2026-10-05T00:03:00.000Z',
      } },
    ])} t={t as never} />)
    expect(screen.getByTestId('route-chip').textContent).toBe('node.implementroute.tierMid·middleroute.escalation')
  })

  it('drops the tier label when fallback moved the turn (the label named the preference, not the served model)', () => {
    render(<RouteStatusRow status={statusOf([
      { phase: 'implement', preferredTier: 'low', preferred: { provider: 'p2', model: 'cheap-fast' }, actual: {
        provider: 'p1', model: 'big-brain', source: 'phase', tier: 'mid', tierReason: 'verify-escalation',
        fallbackActive: true, at: '2026-10-05T00:04:00.000Z',
      } },
    ])} t={t as never} />)
    // fallback moved mid→high: the chip shows the SERVED model + both badges,
    // never "mid·big-brain" (the tier label would misname the model's tier).
    expect(screen.getByTestId('route-chip').textContent)
      .toBe('node.implementbig-brainroute.fallbackroute.escalation')
  })
})
