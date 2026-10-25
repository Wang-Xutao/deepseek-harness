/**
 * Desktop-notification events for the Session states that need the user: a
 * finished task, a failed task, and a task blocked on an approval or a
 * question.
 *
 * 【变更】2026-10-25 (批次二十六 3): new file. The renderer is the only party
 * that sees the Session lifecycle, so it reports the event; the Electron
 * shell decides whether to raise the toast (the `desktopNotifications` pref
 * is the switch, and the shell owns it).
 *
 * A stopped turn is not yet a settled outcome: the Agent reports the failure
 * and the running state drops in the same breath, in either order. The
 * controller therefore settles a turn once, after a short window, and reports
 * the failure instead of the completion when the failure arrived.
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** What the user needs to know. */
export type DesktopNotificationEventKind = 'complete' | 'error' | 'attention'

/** One settled event, ready for the shell to show. */
export interface DesktopNotificationEvent {
  /** What happened. */
  readonly kind: DesktopNotificationEventKind
  /** The Session the event belongs to. */
  readonly sessionId: SessionId
  /** Which blocking request waits, for an `attention` event. */
  readonly attention?: string
  /** The failure text, for an `error` event. */
  readonly detail?: string
}

/**
 * How long a stopped turn waits before its outcome is reported.
 *
 * The window covers the gap between the Agent's failure report and the
 * running-state drop, so one turn produces exactly one toast.
 */
export const NOTIFICATION_SETTLE_MS = 250

/** What the controller remembers about one Session. */
interface SessionWatch {
  /** Latest known running state; absent until the list establishes it. */
  running: boolean | undefined
  /** Whether the Session currently waits on the user. */
  attention: boolean
  /** The latest failure text, consumed by the next settle. */
  error: string | undefined
  /** The pending settle timer, when one is armed. */
  timer: ReturnType<typeof setTimeout> | undefined
}

/**
 * Turns Session lifecycle observations into settled notification events.
 *
 * The controller owns every transition so the React surface stays a plain
 * observer: the same running/attention/error observations always produce the
 * same events, whatever order the Host reports them in.
 */
export class DesktopNotificationController {
  private readonly watches = new Map<SessionId, SessionWatch>()
  private readonly titles = new Map<SessionId, string>()

  /**
   * @param publish - receives every settled event.
   * @param settleMs - how long a stopped turn waits for its failure line.
   */
  constructor(
    private readonly publish: (event: DesktopNotificationEvent) => void,
    private readonly settleMs: number = NOTIFICATION_SETTLE_MS,
  ) {}

  /**
   * Report the latest running state of one Session.
   * @param sessionId - the Session whose state changed.
   * @param running - whether its Agent is running now.
   */
  observeRunning(sessionId: SessionId, running: boolean | undefined): void {
    const watch = this.watchFor(sessionId)
    const previous = watch.running
    watch.running = running
    // Only a turn that was running and stopped settles; the first observation
    // of an idle Session is a baseline, not an outcome.
    if (running !== false || previous !== true) return
    this.armSettle(sessionId)
  }

  /**
   * Report that one Session's Agent failed.
   * @param sessionId - the Session whose Agent failed.
   * @param message - the user-safe failure description.
   */
  observeError(sessionId: SessionId, message: string): void {
    const watch = this.watchFor(sessionId)
    watch.error = message
    this.armSettle(sessionId)
  }

  /**
   * Report whether one Session waits on the user.
   * @param sessionId - the Session whose blocking state changed.
   * @param waiting - whether a request waits for the user now.
   * @param kind - which request waits, when one does.
   */
  observeAttention(sessionId: SessionId, waiting: boolean, kind?: string): void {
    const watch = this.watchFor(sessionId)
    const previous = watch.attention
    watch.attention = waiting
    if (!waiting || previous === true) return
    this.publish({ kind: 'attention', sessionId, ...(kind === undefined ? {} : { attention: kind }) })
  }

  /**
   * Record the display title of one Session.
   * @param sessionId - the Session the title belongs to.
   * @param title - its display title.
   */
  observeTitle(sessionId: SessionId, title: string): void {
    this.titles.set(sessionId, title)
  }

  /**
   * Read the display title of one Session.
   * @param sessionId - the Session to look up.
   * @returns its display title, or undefined when the list has not reported one.
   */
  titleOf(sessionId: SessionId): string | undefined {
    return this.titles.get(sessionId)
  }

  /** Drop every armed timer; a torn-down controller reports nothing. */
  dispose(): void {
    for (const watch of this.watches.values()) {
      if (watch.timer !== undefined) clearTimeout(watch.timer)
    }
    this.watches.clear()
  }

  private watchFor(sessionId: SessionId): SessionWatch {
    const existing = this.watches.get(sessionId)
    if (existing !== undefined) return existing
    const watch: SessionWatch = { running: undefined, attention: false, error: undefined, timer: undefined }
    this.watches.set(sessionId, watch)
    return watch
  }

  /** Arm the one settle window for a Session; an armed window is kept. */
  private armSettle(sessionId: SessionId): void {
    const watch = this.watchFor(sessionId)
    if (watch.timer !== undefined) return
    watch.timer = setTimeout(() => {
      watch.timer = undefined
      const error = watch.error
      watch.error = undefined
      this.publish(error === undefined
        ? { kind: 'complete', sessionId }
        : { kind: 'error', sessionId, detail: error })
    }, this.settleMs)
  }
}
