import { describe, expect, it } from 'vitest'
import type { ProjectionEvent } from '@deepseek-ai/dsh-baf-core'
import { deriveWorkflowMetrics, type UsagePoint } from '../src/metrics.ts'

describe('deriveWorkflowMetrics', () => {
  it('sums stage wall time — the intake customer-wait window is excluded (2026-09-28 用户问题 4 停表)', () => {
    const events = [
      { type: 'intake-classified', seq: 1, eventId: 'a', at: '2026-01-01T00:00:00.000Z', intake: {} },
      { type: 'intake-confirmed', seq: 2, eventId: 'b', at: '2026-01-01T00:00:05.000Z', by: 'user' },
      { type: 'stage-entered', seq: 3, eventId: 'c', at: '2026-01-01T00:00:05.000Z', node: 'open' },
      { type: 'stage-completed', seq: 4, eventId: 'd', at: '2026-01-01T00:00:15.000Z', node: 'open', artifacts: [] },
    ] as unknown as ProjectionEvent[]

    const derived = deriveWorkflowMetrics(events, Date.parse('2026-01-01T00:00:15.000Z'))
    // [intake-classified → intake-confirmed] is pure customer wait — the row
    // keeps no duration and the total counts stage time only.
    expect(derived.byNode.intake?.durationMs).toBeUndefined()
    expect(derived.byNode.open?.durationMs).toBe(10_000)
    expect(derived.totals.totalDurationMs).toBe(10_000)
  })

  it('2026-09-28 用户问题 4 停表: flags whether the timer is running at the fold', () => {
    // An authoring window still open at fold end → the client keeps ticking.
    const running = deriveWorkflowMetrics(
      [{ type: 'stage-entered', seq: 1, eventId: 'a', at: '2026-01-01T00:00:00.000Z', node: 'open' }] as unknown as ProjectionEvent[],
      Date.parse('2026-01-01T00:00:30.000Z'),
    )
    expect(running.totals.running).toBe(true)
    expect(running.totals.totalDurationMs).toBe(30_000)

    // Every window folded (or intake-only) → the change rests on the
    // customer; the live timer freezes.
    const stopped = deriveWorkflowMetrics([
      { type: 'intake-classified', seq: 1, eventId: 'a', at: '2026-01-01T00:00:00.000Z', intake: {} },
      { type: 'intake-confirmed', seq: 2, eventId: 'b', at: '2026-01-01T00:00:05.000Z', by: 'user' },
    ] as unknown as ProjectionEvent[], Date.parse('2026-01-01T00:00:30.000Z'))
    expect(stopped.totals.running).toBe(false)
    // Zero duration is omitted from the wire shape entirely.
    expect(stopped.totals.totalDurationMs).toBeUndefined()
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

  it('2026-10-30 (用户问题 7): takes the approval WAIT out of 流程耗时', () => {
    // The model works the open stage; the customer is asked to allow an
    // operation and answers 40 s later. The wait is not work time.
    const events = [
      { type: 'stage-entered', seq: 1, eventId: 'a', at: '2026-01-01T00:00:00.000Z', node: 'open' },
    ] as unknown as ProjectionEvent[]

    const t = (s: string): number => Date.parse(`2026-01-01T00:${s}.000Z`)
    const derived = deriveWorkflowMetrics(events, t('01:30'), [], [
      { startMs: t('00:30'), endMs: t('01:10') },
    ])
    // 90 s of wall time minus the 40 s the customer spent deciding.
    expect(derived.byNode.open?.durationMs).toBe(50_000)
    expect(derived.totals.totalDurationMs).toBe(50_000)
    // The wait is over and the model works again — the timer runs.
    expect(derived.totals.running).toBe(true)
  })

  it('2026-10-30 (用户问题 7): a PENDING approval freezes the live clock', () => {
    const events = [
      { type: 'stage-entered', seq: 1, eventId: 'a', at: '2026-01-01T00:00:00.000Z', node: 'open' },
    ] as unknown as ProjectionEvent[]

    const t = (s: string): number => Date.parse(`2026-01-01T00:${s}.000Z`)
    const pending = deriveWorkflowMetrics(events, t('01:00'), [], [
      { startMs: t('00:30') },
    ])
    // The window is still open, but the change is blocked on the customer:
    // the clock must freeze, and the wait so far is not work time.
    expect(pending.totals.running).toBe(false)
    expect(pending.totals.totalDurationMs).toBe(30_000)
  })

  it('2026-10-30 (用户问题 7): a DANGLING approval ask never freezes the clock forever', () => {
    // The demo6 session carried four asks with no decision (the session was
    // interrupted). A stale ask is not evidence of a live wait — it must not
    // freeze the change's clock nor eat its duration.
    const events = [
      { type: 'stage-entered', seq: 1, eventId: 'a', at: '2026-01-01T00:00:00.000Z', node: 'open' },
    ] as unknown as ProjectionEvent[]

    // Two hours later: the ask is long dead.
    const stale = deriveWorkflowMetrics(events, Date.parse('2026-01-01T02:00:00.000Z'), [], [
      { startMs: Date.parse('2026-01-01T00:00:00.000Z') },
    ])
    expect(stale.totals.running).toBe(true)
    expect(stale.totals.totalDurationMs).toBe(7_200_000)
  })

  it('2026-10-30 (用户问题 2.3): counts only the time the model was actually running', () => {
    // The stage sat open for ten minutes; the model ran two of them and came
    // back for two more. The other six were the customer's.
    const events = [
      { type: 'stage-entered', seq: 1, eventId: 'a', at: '2026-01-01T00:00:00.000Z', node: 'open' },
      { type: 'stage-completed', seq: 2, eventId: 'b', at: '2026-01-01T00:10:00.000Z', node: 'open', artifacts: [] },
    ] as unknown as ProjectionEvent[]

    const derived = deriveWorkflowMetrics(events, Date.parse('2026-01-01T00:10:00.000Z'), [], [], {
      spans: [
        { startMs: Date.parse('2026-01-01T00:00:00.000Z'), endMs: Date.parse('2026-01-01T00:02:00.000Z') },
        { startMs: Date.parse('2026-01-01T00:07:00.000Z'), endMs: Date.parse('2026-01-01T00:09:00.000Z') },
      ],
      running: false,
    })
    expect(derived.byNode.open?.durationMs).toBe(4 * 60_000)
    expect(derived.totals.totalDurationMs).toBe(4 * 60_000)
  })

  it('2026-10-30 (用户问题 2.3): a STOPPED model freezes the clock on an open stage', () => {
    // The change's stage never completed and the model was stopped at 00:10 —
    // the timer used to run forever against the open window.
    const events = [
      { type: 'stage-entered', seq: 1, eventId: 'a', at: '2026-01-01T00:00:00.000Z', node: 'open' },
    ] as unknown as ProjectionEvent[]

    const derived = deriveWorkflowMetrics(events, Date.parse('2026-01-01T01:00:00.000Z'), [], [], {
      spans: [{ startMs: Date.parse('2026-01-01T00:00:00.000Z'), endMs: Date.parse('2026-01-01T00:10:00.000Z') }],
      running: false,
    })
    expect(derived.totals.running).toBe(false)
    expect(derived.totals.totalDurationMs).toBe(10 * 60_000)
  })

  it('2026-10-30 (用户问题 2.3): an OPEN turn runs while the agent is running', () => {
    const events = [
      { type: 'stage-entered', seq: 1, eventId: 'a', at: '2026-01-01T00:00:00.000Z', node: 'open' },
    ] as unknown as ProjectionEvent[]

    const derived = deriveWorkflowMetrics(events, Date.parse('2026-01-01T00:30:00.000Z'), [], [], {
      spans: [{ startMs: Date.parse('2026-01-01T00:00:00.000Z') }],
      running: true,
    })
    expect(derived.totals.running).toBe(true)
    expect(derived.totals.totalDurationMs).toBe(30 * 60_000)
  })

  it('2026-10-30 (用户问题 2.3): a parked gate is excluded even inside a running turn', () => {
    // The gate pops INSIDE the turn — the model is blocked on the customer
    // while its turn is open — so the turn span alone would count the wait.
    // The park closes the window; the two rules compose.
    const events = [
      { type: 'stage-entered', seq: 1, eventId: 'a', at: '2026-01-01T00:00:00.000Z', node: 'open' },
      { type: 'awaiting-confirm', seq: 2, eventId: 'b', at: '2026-01-01T00:01:00.000Z' },
      { type: 'stage-entered', seq: 3, eventId: 'c', at: '2026-01-01T00:03:00.000Z', node: 'open' },
      { type: 'stage-completed', seq: 4, eventId: 'd', at: '2026-01-01T00:06:00.000Z', node: 'open', artifacts: [] },
    ] as unknown as ProjectionEvent[]

    const derived = deriveWorkflowMetrics(events, Date.parse('2026-01-01T00:06:00.000Z'), [], [], {
      spans: [{ startMs: Date.parse('2026-01-01T00:00:00.000Z'), endMs: Date.parse('2026-01-01T00:06:00.000Z') }],
      running: false,
    })
    // One minute before the gate, three minutes after the answer — the two
    // minutes the customer took are NOT counted, although the turn was open.
    expect(derived.byNode.open?.durationMs).toBe(4 * 60_000)
  })
})
