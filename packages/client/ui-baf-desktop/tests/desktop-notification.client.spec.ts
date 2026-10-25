/**
 * Desktop-notification controller: the settled events one Session produces.
 *
 * 【变更】2026-10-25 (批次二十六 3): new file.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  DesktopNotificationController,
  type DesktopNotificationEvent,
} from '../src/client/desktop-notification.ts'

const sid = (value: string): SessionId => value as SessionId

describe('DesktopNotificationController', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('reports a finished turn once', () => {
    const events: DesktopNotificationEvent[] = []
    const controller = new DesktopNotificationController((event) => { events.push(event) })
    const session = sid('session-1')

    controller.observeRunning(session, true)
    controller.observeRunning(session, false)
    vi.advanceTimersByTime(500)

    expect(events).toEqual([{ kind: 'complete', sessionId: session }])
  })

  it('reports nothing for a Session that was already idle', () => {
    const events: DesktopNotificationEvent[] = []
    const controller = new DesktopNotificationController((event) => { events.push(event) })

    controller.observeRunning(sid('session-1'), false)
    vi.advanceTimersByTime(500)

    expect(events).toEqual([])
  })

  it('reports each finished turn of a Session that runs again', () => {
    const events: DesktopNotificationEvent[] = []
    const controller = new DesktopNotificationController((event) => { events.push(event) })
    const session = sid('session-1')

    controller.observeRunning(session, true)
    controller.observeRunning(session, false)
    vi.advanceTimersByTime(500)
    controller.observeRunning(session, true)
    controller.observeRunning(session, false)
    vi.advanceTimersByTime(500)

    expect(events).toEqual([
      { kind: 'complete', sessionId: session },
      { kind: 'complete', sessionId: session },
    ])
  })

  // 【变更】2026-10-25 (批次二十六 3): the failure and the running-state drop
  // arrive in either order — one turn must still produce exactly one toast,
  // and it must name the failure.
  it('reports the failure instead of the completion, whichever came first', () => {
    const failureFirst: DesktopNotificationEvent[] = []
    const first = new DesktopNotificationController((event) => { failureFirst.push(event) })
    const session = sid('session-1')
    first.observeRunning(session, true)
    first.observeError(session, 'boom')
    first.observeRunning(session, false)
    vi.advanceTimersByTime(500)
    expect(failureFirst).toEqual([{ kind: 'error', sessionId: session, detail: 'boom' }])

    const stopFirst: DesktopNotificationEvent[] = []
    const second = new DesktopNotificationController((event) => { stopFirst.push(event) })
    const other = sid('session-2')
    second.observeRunning(other, true)
    second.observeRunning(other, false)
    second.observeError(other, 'boom')
    vi.advanceTimersByTime(500)
    expect(stopFirst).toEqual([{ kind: 'error', sessionId: other, detail: 'boom' }])
  })

  it('reports a blocking request once, when it appears', () => {
    const events: DesktopNotificationEvent[] = []
    const controller = new DesktopNotificationController((event) => { events.push(event) })
    const session = sid('session-1')

    controller.observeAttention(session, false)
    controller.observeAttention(session, true, 'approval')
    controller.observeAttention(session, true, 'approval')
    expect(events).toEqual([{ kind: 'attention', sessionId: session, attention: 'approval' }])

    controller.observeAttention(session, false)
    controller.observeAttention(session, true, 'question')
    expect(events).toEqual([
      { kind: 'attention', sessionId: session, attention: 'approval' },
      { kind: 'attention', sessionId: session, attention: 'question' },
    ])
  })

  it('remembers the display title of a Session', () => {
    const controller = new DesktopNotificationController(() => {})
    const session = sid('session-1')
    expect(controller.titleOf(session)).toBeUndefined()
    controller.observeTitle(session, '修复登录')
    expect(controller.titleOf(session)).toBe('修复登录')
  })

  it('reports nothing after it was disposed', () => {
    const events: DesktopNotificationEvent[] = []
    const controller = new DesktopNotificationController((event) => { events.push(event) })
    const session = sid('session-1')

    controller.observeRunning(session, true)
    controller.observeRunning(session, false)
    controller.dispose()
    vi.advanceTimersByTime(500)

    expect(events).toEqual([])
  })
})
