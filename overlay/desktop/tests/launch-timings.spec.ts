import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { enableWrites, mark, reset, snapshot } from '../src/launch-timings.ts'

const temps: string[] = []

afterEach(() => {
  reset()
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('launch-timings', () => {
  it('records phases in mark order', () => {
    mark('app-ready')
    mark('splash-shown')
    expect(snapshot().map(entry => entry.phase)).toEqual(['app-ready', 'splash-shown'])
  })

  it('writes one JSONL line per mark after enableWrites', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baf-launch-'))
    temps.push(dir)
    enableWrites(dir)
    mark('dsh-spawn')
    mark('dsh-ready')
    const lines = readFileSync(join(dir, 'launch-timings.jsonl'), 'utf8')
      .split('\n').filter(Boolean)
    expect(lines).toHaveLength(3)
    expect(JSON.parse(lines[0]!).kind).toBe('run')
    expect(JSON.parse(lines[1]!).phase).toBe('dsh-spawn')
    expect(JSON.parse(lines[2]!).phase).toBe('dsh-ready')
  })

  it('reset clears marks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baf-launch-'))
    temps.push(dir)
    mkdirSync(dir, { recursive: true })
    enableWrites(dir)
    mark('app-ready')
    reset()
    expect(snapshot()).toEqual([])
  })
})
