import { describe, expect, it } from 'vitest'
import { DEFAULT_READY_TIMEOUT_MS, readyTimeoutMs } from '../src/ready-timeout.ts'

describe('readyTimeoutMs', () => {
  it('defaults to a budget that absorbs a first-run antivirus scan', () => {
    expect(readyTimeoutMs({})).toBe(DEFAULT_READY_TIMEOUT_MS)
    expect(DEFAULT_READY_TIMEOUT_MS).toBeGreaterThanOrEqual(180_000)
  })

  it('honours the diagnostic override', () => {
    expect(readyTimeoutMs({ BAF_DSH_READY_TIMEOUT_MS: '5000' })).toBe(5000)
  })

  // A zero or negative budget would expire before the child can ever print, and
  // a non-numeric one would otherwise reach setTimeout as NaN and fire at once.
  it('falls back when the override is not a positive number', () => {
    for (const value of ['0', '-1', '', 'abc', 'NaN']) {
      expect(readyTimeoutMs({ BAF_DSH_READY_TIMEOUT_MS: value })).toBe(DEFAULT_READY_TIMEOUT_MS)
    }
  })
})
