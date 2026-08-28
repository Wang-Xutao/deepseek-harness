import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { dshModulesReady, ensureDshModulesExpanded } from '../src/ensure-dsh-modules.ts'

const temps: string[] = []

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('ensureDshModulesExpanded', () => {
  it('no-ops when node_modules marker already exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'baf-dsh-mod-'))
    temps.push(root)
    const markerDir = join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib')
    mkdirSync(markerDir, { recursive: true })
    writeFileSync(join(markerDir, 'bin.js'), 'export {}\n')
    expect(dshModulesReady(root)).toBe(true)
    ensureDshModulesExpanded(root)
  })

  it('throws when neither node_modules nor modules.zip exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'baf-dsh-mod-'))
    temps.push(root)
    expect(() => ensureDshModulesExpanded(root)).toThrow(/modules\.zip/)
  })
})
