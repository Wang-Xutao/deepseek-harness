/**
 * Identity helpers and change-id format.
 */

import { describe, expect, it } from 'vitest'
import { generateChangeId, slugifyChangeTitle, projectionLogPath } from '../src/identity.ts'

describe('change identity', () => {
  it('slugifies titles and builds the frozen change-id pattern', () => {
    expect(slugifyChangeTitle('Fix Login Bug!')).toBe('fix-login-bug')
    expect(slugifyChangeTitle('')).toBe('change')

    const id = generateChangeId('Fix Login', () => new Date(Date.UTC(2026, 8, 6)), () => Buffer.from([0xab, 0xcd]))
    expect(id).toBe('change-20260906-fix-login-abcd')
    expect(projectionLogPath(id)).toBe(`.baf/projection/${id}.jsonl`)
  })
})
