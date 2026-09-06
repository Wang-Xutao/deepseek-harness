/**
 * route-audit appends typed session events.
 */

import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import {
  appendRouteResolved,
  routeAuditFromFailure,
  routeAuditFromResolution,
} from '../src/route-audit.ts'
import type { RouteResolution } from '@deepseek-ai/dsh-baf-core'

describe('route audit', () => {
  it('appends baf/route-resolved for success and failure', () => {
    const session = Session.create(SessionId('baf-route-audit'))
    const resolution: RouteResolution = {
      provider: 'fixture',
      model: 'primary',
      source: 'phase',
      phase: 'implement',
      fallbackFrom: {
        provider: 'fixture',
        model: 'preferred',
        reason: 'unavailable',
      },
    }
    appendRouteResolved(
      session,
      routeAuditFromResolution({
        resolution,
        sessionId: String(session.id),
        changeId: 'chg-1',
        at: '2026-09-06T00:00:00.000Z',
      }),
    )
    appendRouteResolved(
      session,
      routeAuditFromFailure({
        provider: 'fixture',
        model: 'primary',
        phase: 'design',
        sessionId: String(session.id),
        failureReason: 'model_fallback_blocked: none',
        at: '2026-09-06T00:00:01.000Z',
      }),
    )
    const events = session.snapshotEvents().filter(e => e.type === 'baf/route-resolved')
    expect(events).toHaveLength(2)
    expect(events[0]?.data).toMatchObject({
      provider: 'fixture',
      model: 'primary',
      source: 'phase',
      phase: 'implement',
      changeId: 'chg-1',
    })
    expect(events[1]?.data).toMatchObject({
      source: 'failed',
      phase: 'design',
      failureReason: 'model_fallback_blocked: none',
    })
  })
})
