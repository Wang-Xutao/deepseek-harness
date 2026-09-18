import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fingerprintTree, syncSkillTree } from '../src/plugin-sync.ts'

const temps: string[] = []

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function makeTree(root: string, files: Record<string, string>, mtime: Date = new Date()): void {
  for (const [name, contents] of Object.entries(files)) {
    const path = join(root, name)
    const slash = name.lastIndexOf('/')
    if (slash > 0) mkdirSync(join(root, name.slice(0, slash)), { recursive: true })
    writeFileSync(path, contents, 'utf8')
    utimesSync(path, mtime, mtime)
  }
}

describe('fingerprintTree', () => {
  it('returns the empty string for a missing root', () => {
    const root = mkdtempSync(join(tmpdir(), 'baf-sync-'))
    temps.push(root)
    expect(fingerprintTree(join(root, 'missing'))).toBe('')
  })

  it('is identical for two byte-identical trees', () => {
    const a = mkdtempSync(join(tmpdir(), 'baf-sync-a-'))
    const b = mkdtempSync(join(tmpdir(), 'baf-sync-b-'))
    temps.push(a, b)
    const mtime = new Date('2026-09-18T00:00:00Z')
    makeTree(a, { 'one.md': 'hello', 'two/nested.md': 'world' }, mtime)
    makeTree(b, { 'one.md': 'hello', 'two/nested.md': 'world' }, mtime)
    expect(fingerprintTree(a)).toBe(fingerprintTree(b))
  })

  it('differs when a file content changes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'baf-sync-'))
    temps.push(root)
    makeTree(root, { 'one.md': 'hello' })
    const before = fingerprintTree(root)
    // bump mtime so the fingerprint field changes even on fast filesystems
    await new Promise(resolve => setTimeout(resolve, 20))
    makeTree(root, { 'one.md': 'hello world' })
    expect(fingerprintTree(root)).not.toBe(before)
  })
})

describe('syncSkillTree', () => {
  it('does not copy when the marker matches', () => {
    const root = mkdtempSync(join(tmpdir(), 'baf-sync-'))
    temps.push(root)
    const from = join(root, 'pack', 'skills')
    const to = join(root, 'home', 'skills')
    const marker = join(root, 'home', 'plugin-skills-sync.json')
    mkdirSync(from, { recursive: true })
    makeTree(from, { 'one.md': 'hello' })
    const first = syncSkillTree(from, to, marker)
    expect(first.synced).toBe(true)
    expect(existsSync(join(to, 'one.md'))).toBe(true)
    const second = syncSkillTree(from, to, marker)
    expect(second.synced).toBe(false)
    expect(second.fingerprint).toBe(first.fingerprint)
  })

  it('returns an empty fingerprint for an empty pack', () => {
    const root = mkdtempSync(join(tmpdir(), 'baf-sync-'))
    temps.push(root)
    const result = syncSkillTree(join(root, 'pack'), join(root, 'home'), join(root, 'home', 'm.json'))
    expect(result.synced).toBe(false)
    expect(result.fingerprint).toBe('')
  })

  it('persists the marker so a later launch skips the copy', () => {
    const root = mkdtempSync(join(tmpdir(), 'baf-sync-'))
    temps.push(root)
    const from = join(root, 'pack', 'skills')
    const to = join(root, 'home', 'skills')
    const marker = join(root, 'home', 'plugin-skills-sync.json')
    mkdirSync(from, { recursive: true })
    makeTree(from, { 'two.md': 'world' })
    syncSkillTree(from, to, marker)
    const recorded = readFileSync(marker, 'utf8').trim()
    expect(recorded.length).toBeGreaterThan(0)
  })
})
