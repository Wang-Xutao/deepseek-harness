/**
 * The frame-wide observer that reports Session events to the desktop shell.
 *
 * 【变更】2026-10-25 (批次二十六 3): new file. The observer lives in the
 * frame-wide `shell.overlay` layer so it sees every Session in the list —
 * not only the open one — and it renders nothing: the toast belongs to the
 * operating system, not to the page.
 */
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopNotificationController } from './desktop-notification.ts'

/** The controller the observer feeds. */
export interface DesktopNotificationWatcherInjected {
  controller: DesktopNotificationController
}

/** Props of the desktop-notification observer. */
export type DesktopNotificationWatcherProps =
  PropsRuntime<'shell.overlay'>
  & InjectFace<DesktopNotificationWatcherInjected>

/**
 * Report every Session's lifecycle and blocking state to the controller.
 * @param props - the session status hooks and the controller.
 * @returns nothing; the observer renders no surface.
 */
export function DesktopNotificationWatcher({ useSessionStatus, useSessions, controller }: DesktopNotificationWatcherProps): ReactNode {
  const status = useSessionStatus(snapshot => snapshot)
  const summaries = useSessions(state => state.byId)

  useEffect(() => {
    for (const [sessionId, entry] of status) {
      controller.observeRunning(sessionId, entry.running)
      controller.observeAttention(
        sessionId,
        entry.pendingInteraction !== undefined,
        entry.pendingInteraction?.kind,
      )
      const summary = summaries[sessionId]
      if (summary !== undefined) controller.observeTitle(sessionId, summary.displayTitle)
    }
  }, [status, summaries, controller])

  return null
}
