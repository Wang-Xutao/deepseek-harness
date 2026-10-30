/**
 * 【变更】2026-10-30 (用户问题 2/6/7): the ONE per-second duration clock the
 * workflow surfaces share.
 *
 * The host folds the projection into per-stage durations and totals and stamps
 * the fold (`metrics.computedAt`). Between two host polls the client adds the
 * wall-clock elapsed since that stamp, so the number on screen ticks every
 * second instead of jumping every two.
 *
 * The clock FREEZES whenever the host says the change is not running
 * (`metrics.running === false`): the change rests on a customer decision —
 * a confirmation gate (the customer answers the card) or an approval wait
 * (the customer answers 「允许 / 拒绝」). Neither is work time, so neither
 * counts toward 流程耗时. While the model works, the clock runs.
 *
 * Every surface (the top strip, the rail's stage card, the graph's terminal
 * card) reads the SAME hook, so they can never disagree about the elapsed
 * time.
 *
 * @module ui-baf-workflow/client/live-duration
 */

import { useEffect, useRef, useState } from 'react'

/** Options of {@link useLiveDurationMs}. */
export interface LiveDurationOptions {
  /**
   * The view snapshot the value belongs to. A NEW identity means the host
   * sent a fresh fold, so the interpolation re-anchors on that fold's stamp.
   */
  readonly view: unknown
  /** The host's value at the anchor (ms). Undefined → nothing to show. */
  readonly baseMs: number | undefined
  /**
   * The host's `metrics.running` flag: false = the change rests on a customer
   * decision (gate / approval), so the clock must not advance.
   */
  readonly running: boolean | undefined
  /** The host's fold stamp (`metrics.computedAt`) — the anchor. */
  readonly computedAt: number | undefined
}

/**
 * The elapsed duration, advanced once per second while the change works.
 *
 * The value never steps BACKWARDS within one base value: a poll that trails
 * the painted interpolation (clock skew between the host and the browser)
 * would otherwise read as a stuck timer. A base value that DROPS (the host
 * corrected itself — e.g. it just recognized an approval wait and took that
 * time out of the total) is accepted as-is: the correction is the truth.
 * @param options - see {@link LiveDurationOptions}.
 * @returns the live duration in ms, or undefined when the host has no value.
 */
export function useLiveDurationMs(options: LiveDurationOptions): number | undefined {
  const { view, baseMs, running, computedAt } = options
  // The anchor of the CURRENT fold: the host's own stamp when it has one (the
  // totals were computed at that moment), else the local arrival.
  const anchor = useRef<{ key: unknown; at: number }>({ key: undefined, at: Date.now() })
  if (anchor.current.key !== view) {
    anchor.current = { key: view, at: computedAt ?? Date.now() }
  }
  // The last painted value — the monotonic floor (see the doc comment).
  const floor = useRef<{ base: number; shown: number } | null>(null)

  const ticking = running !== false && baseMs !== undefined
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!ticking) return
    const timer = window.setInterval(() => { setTick(tick => tick + 1) }, 1000)
    return () => { window.clearInterval(timer) }
  }, [ticking, view])

  if (baseMs === undefined) return undefined
  if (!ticking) {
    floor.current = { base: baseMs, shown: baseMs }
    return baseMs
  }
  const value = baseMs + Math.max(0, Date.now() - anchor.current.at)
  const last = floor.current
  if (last !== null && last.base <= baseMs) {
    const shown = Math.max(value, last.shown)
    floor.current = { base: baseMs, shown }
    return shown
  }
  floor.current = { base: baseMs, shown: value }
  return value
}
