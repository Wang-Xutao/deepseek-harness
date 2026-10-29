/**
 * 【变更】2026-10-28 (批次三十三 · 用户问题 2): the PAUSE control's host
 * contract — the brake, the interrupted-turn record, and the 「继续」 instruction
 * the resume hands the model.
 *
 * The shipped bug the interrupted record pins: 暂停 stopped the workflow but
 * left the MODEL running, so the conversation carried on while the graph said
 * the change was paused — two truths on one screen. The control now cuts the
 * model's turn, and 继续 hands that cut turn back the customer's own word.
 */

import { describe, expect, it } from 'vitest'
import {
  RESUME_INSTRUCTION,
  clearPausedChanges,
  isChangePaused,
  resumeMessage,
  setChangePaused,
  wasChangeInterrupted,
} from '../src/pause.ts'

const CWD = 'D:/ws-pause'
const CHANGE = 'change-pause-1'

describe('the pause brake', () => {
  it('records whether the pause cut a running model turn', () => {
    clearPausedChanges(CWD)
    setChangePaused(CWD, CHANGE, true)
    expect(isChangePaused(CWD, CHANGE)).toBe(true)
    // A pause that caught the model idle has no turn to resume.
    expect(wasChangeInterrupted(CWD, CHANGE)).toBe(false)

    setChangePaused(CWD, CHANGE, false)
    expect(isChangePaused(CWD, CHANGE)).toBe(false)
    expect(wasChangeInterrupted(CWD, CHANGE)).toBe(false)
  })

  it('keeps the interrupted record until the brake comes off', () => {
    clearPausedChanges(CWD)
    setChangePaused(CWD, CHANGE, true, { interrupted: true })
    expect(wasChangeInterrupted(CWD, CHANGE)).toBe(true)
    // Resuming reads the record BEFORE the brake comes off — so the read has
    // to happen while the change is still paused.
    expect(isChangePaused(CWD, CHANGE)).toBe(true)
    setChangePaused(CWD, CHANGE, false)
    expect(wasChangeInterrupted(CWD, CHANGE)).toBe(false)
  })

  it('scopes the brake per workspace and change', () => {
    clearPausedChanges(CWD)
    setChangePaused(CWD, 'change-a', true)
    expect(isChangePaused(CWD, 'change-a')).toBe(true)
    expect(isChangePaused(CWD, 'change-b')).toBe(false)
    expect(isChangePaused('D:/ws-other', 'change-a')).toBe(false)
    clearPausedChanges(CWD)
    expect(isChangePaused(CWD, 'change-a')).toBe(false)
  })
})

describe('the resume instruction', () => {
  it('is the customer\'s own word, carried by the workflow producer', () => {
    const message = resumeMessage()
    expect(message.role).toBe('user')
    expect(message.content).toEqual([{ type: 'text', text: RESUME_INSTRUCTION }])
    expect(RESUME_INSTRUCTION).toBe('继续')
    // Never `kind: 'user'` — the chat renders the workflow's context
    // read-only, not as words the customer typed.
    expect(message.source.kind).toBe('baf-workflow')
  })
})
