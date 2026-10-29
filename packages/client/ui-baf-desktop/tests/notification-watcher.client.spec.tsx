// @vitest-environment jsdom
/**
 * 【变更】2026-10-28 (问题 4): the desktop-notification observer — the bridge
 * between the frame-wide Session-status snapshot and the controller that
 * settles OS-toast events. The renderer is the only party that sees the
 * Session lifecycle, so these tests prove the observer forwards every fact
 * the controller needs: running transitions, attention requests, and titles.
 */
import { useSyncExternalStore } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { DesktopNotificationWatcher } from '../src/client/DesktopNotificationWatcher.tsx'
import { DesktopNotificationController, type DesktopNotificationEvent } from '../src/client/desktop-notification.ts'

afterEach(cleanup)

const sid = (value: string): SessionId => value as SessionId

interface SessionsState { byId: Record<string, { displayTitle?: string }> }

function makeStores(initialStatus: SessionStatusSnapshot, initialSessions: SessionsState) {
  let status = initialStatus
  let sessions = initialSessions
  const statusListeners = new Set<() => void>()
  const sessionListeners = new Set<() => void>()
  const useSessionStatus = (selector: (state: SessionStatusSnapshot) => unknown): unknown =>
    useSyncExternalStore(
      (onChange) => { statusListeners.add(onChange); return () => { statusListeners.delete(onChange) } },
      () => selector(status),
    )
  const useSessions = (selector: (state: SessionsState) => unknown): unknown =>
    useSyncExternalStore(
      (onChange) => { sessionListeners.add(onChange); return () => { sessionListeners.delete(onChange) } },
      () => selector(sessions),
    )
  return {
    useSessionStatus,
    useSessions,
    setStatus(next: SessionStatusSnapshot): void {
      status = next
      for (const listener of statusListeners) listener()
    },
    setSessions(next: SessionsState): void {
      sessions = next
      for (const listener of sessionListeners) listener()
    },
  }
}

describe('the desktop-notification observer', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('settles a finished turn as one complete event', () => {
    const events: DesktopNotificationEvent[] = []
    const controller = new DesktopNotificationController((event) => { events.push(event) })
    const sessionId = sid('session-1')
    const stores = makeStores(
      new Map([[sessionId, { running: true, pendingInteraction: undefined, completionUnread: false }]]),
      { byId: {} },
    )
    render(<DesktopNotificationWatcher {...stores} controller={controller} />)

    act(() => {
      stores.setStatus(new Map([[sessionId, { running: false, pendingInteraction: undefined, completionUnread: false }]]))
    })
    vi.advanceTimersByTime(500)

    expect(events).toEqual([{ kind: 'complete', sessionId }])
  })

  it('reports an attention request the moment it appears, with its kind', () => {
    const events: DesktopNotificationEvent[] = []
    const controller = new DesktopNotificationController((event) => { events.push(event) })
    const sessionId = sid('session-2')
    const stores = makeStores(
      new Map([[sessionId, { running: true, pendingInteraction: undefined, completionUnread: false }]]),
      { byId: {} },
    )
    render(<DesktopNotificationWatcher {...stores} controller={controller} />)

    act(() => {
      stores.setStatus(new Map([[sessionId, { running: true, pendingInteraction: { kind: 'approval' }, completionUnread: false }]]))
    })

    expect(events).toEqual([{ kind: 'attention', sessionId, attention: 'approval' }])
  })

  it('feeds the session display title to the controller', () => {
    const controller = new DesktopNotificationController(() => {})
    const sessionId = sid('session-3')
    const stores = makeStores(
      new Map([[sessionId, { running: false, pendingInteraction: undefined, completionUnread: false }]]),
      { byId: {} },
    )
    render(<DesktopNotificationWatcher {...stores} controller={controller} />)

    act(() => {
      stores.setSessions({ byId: { [sessionId]: { displayTitle: '对账任务' } } })
    })

    expect(controller.titleOf(sessionId)).toBe('对账任务')
  })
})
