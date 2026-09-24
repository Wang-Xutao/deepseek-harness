import { describe, expect, it } from 'vitest'
import type { ProjectionEvent } from '@deepseek-ai/dsh-baf-core'
import { deriveWorkflowMetrics, type UsagePoint } from '../src/metrics.ts'

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

  it('2026-09-23 issue #3: attributes usage points to stages by their time windows', () => {
    const events = [
      { type: 'intake-classified', seq: 1, eventId: 'a', at: '2026-01-01T00:00:00.000Z', intake: {} },
      { type: 'intake-confirmed', seq: 2, eventId: 'b', at: '2026-01-01T00:00:05.000Z', by: 'user' },
      { type: 'stage-entered', seq: 3, eventId: 'c', at: '2026-01-01T00:00:05.000Z', node: 'open' },
      { type: 'stage-completed', seq: 4, eventId: 'd', at: '2026-01-01T00:01:00.000Z', node: 'open', artifacts: [] },
      { type: 'stage-entered', seq: 5, eventId: 'e', at: '2026-01-01T00:01:00.000Z', node: 'clarify' },
      { type: 'stage-completed', seq: 6, eventId: 'f', at: '2026-01-01T00:02:00.000Z', node: 'clarify', artifacts: [] },
    ] as unknown as ProjectionEvent[]

    const t = (s: string): number => Date.parse(`2026-01-01T00:${s}.000Z`)
    const usage: UsagePoint[] = [
      // A preamble turn before intake even classified — unattributed.
      { time: Date.parse('2025-12-31T23:59:00.000Z'), inputTokens: 100, outputTokens: 10 },
      // The open stage's authoring turn.
      { time: t('00:40'), inputTokens: 1_000, outputTokens: 200 },
      // The clarify stage's turn.
      { time: t('01:30'), inputTokens: 3_000, outputTokens: 500 },
      // A turn after the last completed window — nothing open, unattributed.
      { time: t('05:00'), inputTokens: 7, outputTokens: 7 },
    ]
    const derived = deriveWorkflowMetrics(events, t('02:00'), usage)
    expect(derived.byNode.open?.inputTokens).toBe(1_000)
    expect(derived.byNode.open?.outputTokens).toBe(200)
    expect(derived.byNode.clarify?.inputTokens).toBe(3_000)
    expect(derived.byNode.clarify?.outputTokens).toBe(500)
    expect(derived.totals.totalInputTokens).toBe(4_000)
    expect(derived.totals.totalOutputTokens).toBe(700)
  })

  it('keeps re-entered stages as separate windows (T11 verify→implement→verify)', () => {
    const events = [
      { type: 'stage-entered', seq: 1, eventId: 'a', at: '2026-01-01T00:00:00.000Z', node: 'implement' },
      { type: 'stage-completed', seq: 2, eventId: 'b', at: '2026-01-01T00:01:00.000Z', node: 'implement', artifacts: [] },
      { type: 'stage-entered', seq: 3, eventId: 'c', at: '2026-01-01T00:01:00.000Z', node: 'verify' },
      { type: 'stage-failed', seq: 4, eventId: 'd', at: '2026-01-01T00:01:30.000Z', node: 'verify' },
      { type: 'stage-entered', seq: 5, eventId: 'e', at: '2026-01-01T00:01:30.000Z', node: 'implement' },
      { type: 'stage-completed', seq: 6, eventId: 'f', at: '2026-01-01T00:02:00.000Z', node: 'implement', artifacts: [] },
    ] as unknown as ProjectionEvent[]

    const t = (s: string): number => Date.parse(`2026-01-01T00:${s}.000Z`)
    const usage: UsagePoint[] = [
      { time: t('00:30'), inputTokens: 100, outputTokens: 0 },
      { time: t('01:45'), inputTokens: 400, outputTokens: 0 },
    ]
    const derived = deriveWorkflowMetrics(events, t('02:00'), usage)
    // Both implement windows roll into the same node; the verify window got
    // none of them.
    expect(derived.byNode.implement?.inputTokens).toBe(500)
    expect(derived.byNode.implement?.durationMs).toBe(90_000)
    expect(derived.byNode.verify?.inputTokens).toBeUndefined()
  })
})
