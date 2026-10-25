import { describe, expect, it } from 'vitest'
import {
  MAX_NOTIFICATION_BODY,
  parseNotificationPayload,
  truncateNotificationText,
} from '../src/notification.ts'

describe('parseNotificationPayload', () => {
  it('accepts a reported event', () => {
    expect(parseNotificationPayload({ kind: 'complete', title: '任务完成', body: '修复登录的会话已完成' }))
      .toEqual({ kind: 'complete', title: '任务完成', body: '修复登录的会话已完成' })
  })

  it('refuses a payload naming an unknown kind', () => {
    expect(parseNotificationPayload({ kind: 'boom', title: 'x', body: 'y' })).toBeUndefined()
  })

  it('refuses a payload with an empty or non-string line', () => {
    expect(parseNotificationPayload({ kind: 'complete', title: '  ', body: 'y' })).toBeUndefined()
    expect(parseNotificationPayload({ kind: 'complete', title: 'x', body: '' })).toBeUndefined()
    expect(parseNotificationPayload({ kind: 'complete', title: 3, body: 'y' })).toBeUndefined()
    expect(parseNotificationPayload({ kind: 'complete', title: 'x', body: null })).toBeUndefined()
  })

  it('refuses a payload that is not an object', () => {
    expect(parseNotificationPayload(null)).toBeUndefined()
    expect(parseNotificationPayload('complete')).toBeUndefined()
    expect(parseNotificationPayload(undefined)).toBeUndefined()
  })

  it('trims the surrounding whitespace of both lines', () => {
    expect(parseNotificationPayload({ kind: 'error', title: ' 任务出错 ', body: ' 会话：boom ' }))
      .toEqual({ kind: 'error', title: '任务出错', body: '会话：boom' })
  })
})

describe('truncateNotificationText', () => {
  it('keeps a short line as it is', () => {
    expect(truncateNotificationText('短的一行')).toBe('短的一行')
  })

  it('shortens a long line with an ellipsis', () => {
    const long = 'x'.repeat(MAX_NOTIFICATION_BODY + 50)
    const shortened = truncateNotificationText(long)
    expect(shortened).toHaveLength(MAX_NOTIFICATION_BODY)
    expect(shortened.endsWith('…')).toBe(true)
  })
})
