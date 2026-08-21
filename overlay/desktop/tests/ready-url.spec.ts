import { describe, expect, it } from 'vitest'
import { parseWebReadyUrl } from '../src/ready-url.ts'

describe('parseWebReadyUrl', () => {
  it('reads the loopback URL', () => {
    expect(parseWebReadyUrl('dsh web: http://127.0.0.1:3080')).toBe('http://127.0.0.1:3080')
  })

  it('strips the LAN suffix', () => {
    expect(parseWebReadyUrl('dsh web: http://127.0.0.1:4567 (LAN: http://192.168.1.5:4567)')).toBe(
      'http://127.0.0.1:4567',
    )
  })

  it('rejects other lines', () => {
    expect(parseWebReadyUrl('listening on 3080')).toBeUndefined()
    expect(parseWebReadyUrl('dsh web: http://0.0.0.0:3080')).toBeUndefined()
  })
})
