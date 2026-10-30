/**
 * 【变更】2026-10-30 (用户问题 3.1): the answered-gate rendezvous between the
 * session's confirmation dialog and the workflow graph's parked-gate banner.
 *
 * The two surfaces show the SAME decision and live in different React trees,
 * so the answer travels through this store. The rule the customer asked for:
 * answering in one tab cancels the other, and a NEW decision is not silenced by
 * the previous answer.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  answeredGateFor,
  clearAnsweredGate,
  noteGateAnswered,
  noteGateShown,
  subscribeAnsweredGates,
} from '../src/client/gate-sync.ts'

describe('gate-sync (用户问题 3.1 — the confirmation gates cancel in sync)', () => {
  beforeEach(() => {
    clearAnsweredGate('session-1')
    clearAnsweredGate('session-2')
  })

  it('records the answer and tells the listening surfaces', () => {
    let notified = 0
    const off = subscribeAnsweredGates(() => { notified += 1 })
    noteGateAnswered('session-1', { changeId: 'change-1', gateId: 'design-confirm' })
    expect(answeredGateFor('session-1')).toEqual({ changeId: 'change-1', gateId: 'design-confirm' })
    expect(notified).toBe(1)
    off()
  })

  it('keeps the sessions apart — one session never silences another', () => {
    noteGateAnswered('session-1', { changeId: 'change-1', gateId: 'design-confirm' })
    expect(answeredGateFor('session-2')).toBeUndefined()
  })

  it('a NEW gate on screen clears the previous answer', () => {
    // The customer answered 「设计已完成 · 请确认进入计划」 and the workflow moved
    // on to the archive gate: the archive gate is a different decision and must
    // not be silenced by the design gate's answer.
    noteGateAnswered('session-1', { changeId: 'change-1', gateId: 'design-confirm' })
    noteGateShown('session-1', 'verify-archive')
    expect(answeredGateFor('session-1')).toBeUndefined()
  })

  it('the SAME gate on screen keeps the answer', () => {
    // The card re-renders with the same carrier — the answer still holds, so the
    // parked-gate banner stays down.
    noteGateAnswered('session-1', { changeId: 'change-1', gateId: 'design-confirm' })
    noteGateShown('session-1', 'design-confirm')
    expect(answeredGateFor('session-1')).toEqual({ changeId: 'change-1', gateId: 'design-confirm' })
  })

  it('an identical answer does not re-notify the surfaces', () => {
    let notified = 0
    const off = subscribeAnsweredGates(() => { notified += 1 })
    noteGateAnswered('session-1', { changeId: 'change-1', gateId: 'design-confirm' })
    noteGateAnswered('session-1', { changeId: 'change-1', gateId: 'design-confirm' })
    expect(notified).toBe(1)
    off()
  })
})
