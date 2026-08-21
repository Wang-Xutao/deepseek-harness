import { describe, expect, it } from 'vitest'
import { isSupportedNodeVersion } from '../src/node-version.ts'

describe('isSupportedNodeVersion', () => {
  it.each([
    ['v22.19.0', true],
    ['22.19.1', true],
    ['v22.20.0', true],
    ['v24.0.0', true],
    ['v24.1.0', true],
    ['26.0.0', true],
    ['v22.18.0', false],
    ['v22.0.0', false],
    ['v18.20.0', false],
    ['v20.19.0', false],
    ['v23.11.0', false],
    ['', false],
    ['nope', false],
  ])('%s -> %s', (version, expected) => {
    expect(isSupportedNodeVersion(version)).toBe(expected)
  })
})
