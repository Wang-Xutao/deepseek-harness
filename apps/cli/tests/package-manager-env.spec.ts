import { describe, expect, it } from 'vitest'
import { PACKAGE_MANAGER_ENV, packageManagerFromEnv } from '../src/package-manager-env.ts'

const silence = (): void => {}

describe('packageManagerFromEnv', () => {
  it('returns undefined for an absent or empty value', () => {
    expect(packageManagerFromEnv(undefined, silence)).toBeUndefined()
    expect(packageManagerFromEnv('  ', silence)).toBeUndefined()
  })

  it('parses a complete fact', () => {
    const fact = packageManagerFromEnv(
      JSON.stringify({ command: 'node', args: ['--expose-internals', 'pnpm.mjs'], env: { PATH: 'bin' } }),
      silence,
    )
    expect(fact).toStrictEqual({ command: 'node', args: ['--expose-internals', 'pnpm.mjs'], env: { PATH: 'bin' } })
  })

  it('parses a bare command without args or env', () => {
    expect(packageManagerFromEnv('{"command":"pnpm"}', silence)).toStrictEqual({ command: 'pnpm' })
  })

  it('rejects malformed JSON with a warning', () => {
    const warnings: string[] = []
    expect(packageManagerFromEnv('{not json', message => warnings.push(message))).toBeUndefined()
    expect(warnings).toStrictEqual([`${PACKAGE_MANAGER_ENV} is not valid JSON; using the PATH package manager`])
  })

  it('rejects a missing or non-string command', () => {
    expect(packageManagerFromEnv('{"args":[]}', silence)).toBeUndefined()
    expect(packageManagerFromEnv('{"command":""}', silence)).toBeUndefined()
    expect(packageManagerFromEnv('{"command":42}', silence)).toBeUndefined()
  })

  it('rejects non-string args and env values', () => {
    expect(packageManagerFromEnv('{"command":"pnpm","args":["--x",1]}', silence)).toBeUndefined()
    expect(packageManagerFromEnv('{"command":"pnpm","args":"--x"}', silence)).toBeUndefined()
    expect(packageManagerFromEnv('{"command":"pnpm","env":{"PATH":7}}', silence)).toBeUndefined()
    expect(packageManagerFromEnv('{"command":"pnpm","env":["PATH"]}', silence)).toBeUndefined()
  })
})
