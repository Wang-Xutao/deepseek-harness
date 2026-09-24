/**
 * §22.19 R5 — the workflow Tab's real-time refresh scheduler (pure, DOM-free).
 *
 * Session 7.jsonl R5: the Tab was pull-only (mount / focus / visibility /
 * manual), so a chat-side mint never reached it and it sat on a dead
 * 「已放弃」view. The fix has two legs, both owned here:
 *
 * - **push**: the host emits `baf-workflow/projection-appended` after every
 *   appended event; each notification is a `poke()`. One dispatch appends
 *   several events (mint + confirm + open), so pokes land on a **200 ms
 *   trailing debounce** — the refresh fires once, after the burst.
 * - **poll**: a 2 s interval tick refreshes while the Tab is visible. The
 *   in-process bus cannot see a second process writing the same workspace
 *   (projection.ts §13 R8 note), and the forwarded event can be lost on a
 *   flaky connection — the poll is the floor under the push, never the
 *   ceiling.
 *
 * Every run is gated by `ready()` (the view passes "visible && not busy"),
 * so hidden tabs and in-flight actions stay quiet. Kept DOM-free so the
 * debounce / gate / poll behavior is unit-testable with fake timers.
 * @module ui-baf-workflow/refresh-scheduler
 */

/** Handle returned by {@link createRefreshScheduler}. */
export interface RefreshScheduler {
  /** One push notification arrived — refresh on the trailing debounce. */
  poke(): void
  /** Cancel the pending debounce and the poll; pokes after this are no-ops. */
  dispose(): void
}

/** Construction options; every field except `refresh` has a default. */
export interface RefreshSchedulerOptions {
  /** Perform one refresh (the caller's own busy/visibility guards apply). */
  readonly refresh: () => void
  /** Gate consulted before every run; return false to skip silently. */
  readonly ready?: () => boolean
  /** Trailing-debounce window for pokes. @default 200 */
  readonly debounceMs?: number
  /** Poll interval; `0` disables the poll. @default 2000 */
  readonly pollMs?: number
}

/**
 * Create the scheduler. The poll starts immediately; the debounce timer only
 * exists while pokes are pending.
 * @param options - see {@link RefreshSchedulerOptions}.
 * @returns the scheduler handle.
 */
export function createRefreshScheduler(options: RefreshSchedulerOptions): RefreshScheduler {
  const refresh = options.refresh
  const ready = options.ready ?? (() => true)
  const debounceMs = options.debounceMs ?? 200
  const pollMs = options.pollMs ?? 2000
  let timer: ReturnType<typeof setTimeout> | undefined
  let poll: ReturnType<typeof setInterval> | undefined
  let disposed = false

  const run = (): void => {
    if (ready()) refresh()
  }

  if (pollMs > 0) {
    poll = setInterval(run, pollMs)
  }

  return {
    poke(): void {
      if (disposed) return
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        if (disposed) return
        run()
      }, debounceMs)
    },
    dispose(): void {
      disposed = true
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      if (poll !== undefined) {
        clearInterval(poll)
        poll = undefined
      }
    },
  }
}
