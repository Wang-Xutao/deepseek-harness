/**
 * Desktop notification payloads for the states that need the user's attention
 * (a finished task, a failed task, a task blocked on an approval).
 *
 * The renderer reports the event; the shell decides whether to show it — the
 * `desktopNotifications` pref is the switch, and the shell owns it, so
 * flipping the setting takes effect without a reload.
 */

/** What happened, from the shell's point of view. */
export type DesktopNotificationKind = 'complete' | 'error' | 'attention'

export type DesktopNotificationPayload = {
  readonly kind: DesktopNotificationKind
  /** Bold line of the toast: what happened. */
  readonly title: string
  /** Detail line of the toast: which Session, and the failure text. */
  readonly body: string
}

const KINDS: readonly DesktopNotificationKind[] = ['complete', 'error', 'attention']

/** Longest toast body the shell shows; longer text is truncated with an ellipsis. */
export const MAX_NOTIFICATION_BODY = 200

/**
 * Truncate one notification line to the toast's readable length.
 * @param text - the text to shorten.
 * @returns the text, shortened with an ellipsis when it exceeds the budget.
 */
export function truncateNotificationText(text: string): string {
  if (text.length <= MAX_NOTIFICATION_BODY) return text
  return `${text.slice(0, MAX_NOTIFICATION_BODY - 1)}…`
}

/**
 * Read one renderer-reported notification event.
 *
 * The renderer is a peer, not a trusted caller: a payload naming an unknown
 * kind or an empty line is refused instead of shown as a blank toast.
 * @param raw - the payload as received over IPC.
 * @returns the payload, or undefined when the shape does not hold.
 */
export function parseNotificationPayload(raw: unknown): DesktopNotificationPayload | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const record = raw as { kind?: unknown, title?: unknown, body?: unknown }
  const kind = record.kind
  if (typeof kind !== 'string' || !KINDS.includes(kind as DesktopNotificationKind)) return undefined
  const title = record.title
  const body = record.body
  if (typeof title !== 'string' || title.trim() === '') return undefined
  if (typeof body !== 'string' || body.trim() === '') return undefined
  return {
    kind: kind as DesktopNotificationKind,
    title: truncateNotificationText(title.trim()),
    body: truncateNotificationText(body.trim()),
  }
}
