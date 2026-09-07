import { describe, expect, it } from 'vitest'
import type { ProjectionEvent } from '@deepseek-ai/dsh-baf-core'
import { deriveWorkflowMetrics } from '../src/metrics.ts'

describe('deriveWorkflowMetrics', () => {
  it('sums intake and stage wall time', () => {
    const events = [
      { type: 'intake-classified', seq: 1, eventId: 'a', at: '2026-01-01T00:00:00.000Z', intake: {} },
      { type: 'intake-confirmed', seq: 2, eventId: 'b', at: '2026-01-01T00:00:05.000Z', by: 'user' },
      { type: 'stage-entered', seq: 3, eventId: 'c', at: '2026-01-01T00:00:05.000Z', node: 'open' },
      { type: 'stage-completed', seq: 4, eventId: 'd', at: '2026-01-01T00:00:15.000Z', node: 'open', artifacts: [] },
    ] as unknown as ProjectionEvent[]

    const derived = deriveWorkflowMetrics(events, Date.parse('2026-01-01T00:00:15.000Z'))
    expect(derived.byNode.intake?.durationMs).toBe(5000)
    expect(derived.byNode.open?.durationMs).toBe(10_000)
    expect(derived.totals.totalDurationMs).toBe(15_000)
  })
})
