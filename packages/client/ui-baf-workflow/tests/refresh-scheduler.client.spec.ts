/**
 * §22.19 R5: the Tab's refresh scheduler (pure unit tests, fake timers).
 *
 * `createRefreshScheduler` owns the two legs of the Tab's real-time follow:
 * the 200 ms trailing debounce over push pokes (one dispatch appends several
 * events — refresh once, after the burst) and the 2 s visible poll that
 * floors the push (a second process writing the workspace, a lost forwarded
 * event). Every run passes the caller's `ready` gate — the view passes
 * "visible && not in flight".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRefreshScheduler } from '../src/client/refresh-scheduler.ts'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('§22.19 R5: createRefreshScheduler', () => {
  it('coalesces a poke burst into ONE trailing refresh', () => {
    const refresh = vi.fn()
    const scheduler = createRefreshScheduler({ refresh, pollMs: 0 })
    scheduler.poke()
    vi.advanceTimersByTime(50)
    scheduler.poke()
    vi.advanceTimersByTime(50)
    scheduler.poke()
    expect(refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200) // 200 ms after the LAST poke (t=100 → t=300)
    expect(refresh).toHaveBeenCalledTimes(1)
    scheduler.dispose()
  })

  it('a poke while a debounce is already pending restarts the trail, not stacks it', () => {
    const refresh = vi.fn()
    const scheduler = createRefreshScheduler({ refresh, pollMs: 0 })
    scheduler.poke()
    vi.advanceTimersByTime(150)
    scheduler.poke() // resets the 200 ms window
    vi.advanceTimersByTime(100)
    expect(refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(refresh).toHaveBeenCalledTimes(1)
    scheduler.dispose()
  })

  it('ready() === false (hidden tab / busy) suppresses both poke and poll runs', () => {
    const refresh = vi.fn()
    const ready = vi.fn(() => false)
    const scheduler = createRefreshScheduler({ refresh, ready, debounceMs: 200, pollMs: 2000 })
    scheduler.poke()
    vi.advanceTimersByTime(500)
    vi.advanceTimersByTime(2000)
    expect(refresh).not.toHaveBeenCalled()
    expect(ready).toHaveBeenCalled()
    scheduler.dispose()
  })

  it('the poll ticks refresh while ready (the floor under the push)', () => {
    const refresh = vi.fn()
    const scheduler = createRefreshScheduler({ refresh, pollMs: 2000 })
    vi.advanceTimersByTime(2000)
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(6000)
    expect(refresh).toHaveBeenCalledTimes(4)
    scheduler.dispose()
  })

  it('pollMs: 0 disables the poll entirely', () => {
    const refresh = vi.fn()
    const scheduler = createRefreshScheduler({ refresh, pollMs: 0 })
    vi.advanceTimersByTime(10_000)
    expect(refresh).not.toHaveBeenCalled()
    scheduler.dispose()
  })

  it('dispose cancels the pending debounce AND the poll; later pokes are no-ops', () => {
    const refresh = vi.fn()
    const scheduler = createRefreshScheduler({ refresh, pollMs: 2000 })
    scheduler.poke()
    scheduler.dispose()
    scheduler.poke() // post-dispose poke must not resurrect anything
    vi.advanceTimersByTime(10_000)
    expect(refresh).not.toHaveBeenCalled()
  })
})
