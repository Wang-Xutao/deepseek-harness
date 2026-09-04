import { describe, expect, it } from 'vitest'
import { parseWebReadyUrl } from '../src/ready-url.ts'

describe('parseWebReadyUrl', () => {
  it('parses a loopback readiness line', () => {
    expect(parseWebReadyUrl('dsh web: http://127.0.0.1:3080')).toBe('http://127.0.0.1:3080')
  })

  it('keeps the auth token query on the loopback URL', () => {
    expect(parseWebReadyUrl(
      'dsh web: http://127.0.0.1:11934/?token=g5vNmb__SlOyXUEw0iJV9jJ8XnBzJ8TO7tU0Gco-Ixg',
    )).toBe('http://127.0.0.1:11934/?token=g5vNmb__SlOyXUEw0iJV9jJ8XnBzJ8TO7tU0Gco-Ixg')
  })

  it('prefers the loopback URL when a LAN alternate is printed', () => {
    expect(parseWebReadyUrl('dsh web: http://127.0.0.1:4567 (LAN: http://192.168.1.5:4567)')).toBe(
      'http://127.0.0.1:4567',
    )
  })

  it('keeps the token when a LAN alternate follows', () => {
    expect(parseWebReadyUrl(
      'dsh web: http://127.0.0.1:4567/?token=abc (LAN: http://192.168.1.5:4567/?token=abc)',
    )).toBe('http://127.0.0.1:4567/?token=abc')
  })

  it('rejects non-readiness lines', () => {
    expect(parseWebReadyUrl('listening on 3080')).toBeUndefined()
    expect(parseWebReadyUrl('dsh web: http://0.0.0.0:3080')).toBeUndefined()
  })
})
