/**
 * Route-tier config file IO: default path, roundtrip, bypass semantics
 * (missing/corrupt → undefined), parent-dir creation, and reset.
 */

import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, afterEach } from 'vitest'
import {
  readRouteTierConfigSync,
  resetRouteTierConfigSync,
  routeTierConfigPath,
  writeRouteTierConfigSync,
} from '../src/route-config-io.ts'

const tmpRoot = mkdtempSync(join(tmpdir(), 'baf-route-config-'))
const cleanups: string[] = []

afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tmpFile(name: string): string {
  const dir = join(tmpRoot, name)
  mkdirSync(dir, { recursive: true })
  cleanups.push(dir)
  return join(dir, 'baf-route-config.json')
}

describe('routeTierConfigPath', () => {
  it('resolves under the DSH home (DSH_HOME-aware)', () => {
    const saved = process.env.DSH_HOME
    delete process.env.DSH_HOME
    try {
      expect(routeTierConfigPath()).toBe(join(homedir(), '.dsh', 'baf-route-config.json'))
      process.env.DSH_HOME = tmpRoot
      expect(routeTierConfigPath()).toBe(join(tmpRoot, 'baf-route-config.json'))
    } finally {
      if (saved === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = saved
    }
    expect(routeTierConfigPath('/tmp/custom.json')).toBe('/tmp/custom.json')
  })
})

describe('readRouteTierConfigSync', () => {
  it('returns undefined when the file is missing', () => {
    expect(readRouteTierConfigSync(tmpFile('missing'))).toBeUndefined()
  })

  it('returns undefined on corrupt JSON or schema-invalid documents', () => {
    const path = tmpFile('corrupt')
    writeFileSync(path, '{not json', 'utf8')
    expect(readRouteTierConfigSync(path)).toBeUndefined()
    writeFileSync(path, JSON.stringify({ schema: 1, enabled: true, tiers: {} }), 'utf8')
    expect(readRouteTierConfigSync(path)).toBeUndefined()
  })
})

describe('writeRouteTierConfigSync + readRouteTierConfigSync', () => {
  it('roundtrips a valid config through the file', () => {
    const path = tmpFile('roundtrip')
    writeRouteTierConfigSync(path, {
      schema: 1,
      enabled: true,
      tiers: {
        high: { provider: 'p', model: 'big', reasoningEffort: 'high' },
        mid: { provider: 'p', model: 'mid' },
        low: { provider: 'p', model: 'cheap' },
      },
      phaseTier: { design: 'high' },
      keywords: [{ words: '架构|refactor', tier: 'high', note: '复杂任务' }],
      escalateOnly: true,
    })
    const loaded = readRouteTierConfigSync(path)
    expect(loaded).toBeDefined()
    expect(loaded?.tiers.high).toEqual({ provider: 'p', model: 'big', reasoningEffort: 'high' })
    expect(loaded?.phaseTier).toEqual({ design: 'high' })
    expect(loaded?.keywords).toEqual([{ words: '架构|refactor', tier: 'high', note: '复杂任务' }])
  })

  it('overwrites an existing file atomically (no .tmp litter)', () => {
    const path = tmpFile('overwrite')
    writeRouteTierConfigSync(path, {
      schema: 1,
      enabled: false,
      tiers: {
        high: { provider: 'p', model: 'a' },
        mid: { provider: 'p', model: 'b' },
        low: { provider: 'p', model: 'c' },
      },
    })
    writeRouteTierConfigSync(path, {
      schema: 1,
      enabled: true,
      tiers: {
        high: { provider: 'q', model: 'a2' },
        mid: { provider: 'q', model: 'b2' },
        low: { provider: 'q', model: 'c2' },
      },
    })
    expect(readRouteTierConfigSync(path)?.tiers.high.provider).toBe('q')
    const dir = join(path, '..')
    const litter = readFileSync(path, 'utf8') // sanity: file itself readable
    expect(litter).toContain('"q"')
    const leftovers = readdirSync(dir).filter(name => name.startsWith('baf-route-config.json.tmp'))
    expect(leftovers).toEqual([])
  })
})

describe('resetRouteTierConfigSync', () => {
  it('removes an existing file and is a no-op when missing', () => {
    const path = tmpFile('reset')
    writeRouteTierConfigSync(path, {
      schema: 1,
      enabled: true,
      tiers: {
        high: { provider: 'p', model: 'a' },
        mid: { provider: 'p', model: 'b' },
        low: { provider: 'p', model: 'c' },
      },
    })
    resetRouteTierConfigSync(path)
    expect(readRouteTierConfigSync(path)).toBeUndefined()
    expect(() => resetRouteTierConfigSync(path)).not.toThrow()
  })
})
