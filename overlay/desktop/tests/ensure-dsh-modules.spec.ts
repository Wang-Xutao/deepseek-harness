import { spawnSync } from 'node:child_process'
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

  // Regression (2026-10-04): the expand call missed tar's --force-local, so on
  // PATHs where tar is GNU tar every drive-letter path failed with
  // `Cannot connect to D: resolve failed` — first launch of a dir-mode build
  // was bricked. Seeding uses --force-local too; the call UNDER TEST must
  // expand a drive-letter zip without any seed-side help.
  // 【变更】2026-10-28: the seed now mirrors the production fallback — a PATH
  // whose tar is Windows bsdtar rejects `--force-local` outright (System32
  // bsdtar 3.8.9), so an unconditional seed flag failed the probe on
  // bsdtar-only machines before the code under test ever ran.
  it('expands a real modules.zip at a drive-letter path (tar --force-local)', () => {
    const root = mkdtempSync(join(tmpdir(), 'baf-dsh-mod-'))
    temps.push(root)
    const payload = join(root, 'payload')
    const markerDir = join(payload, 'node_modules', '@deepseek-ai', 'dsh', 'lib')
    mkdirSync(markerDir, { recursive: true })
    writeFileSync(join(markerDir, 'bin.js'), 'export {}\n')
    const zipPath = join(root, 'modules.zip')
    let seed = spawnSync(
      'tar',
      ['-a', '--force-local', '-cf', zipPath, '-C', payload, '.'],
      { encoding: 'utf8', windowsHide: true },
    )
    if (seed.status !== 0 && /force-local/.test(seed.stderr ?? '')) {
      seed = spawnSync(
        'tar',
        ['-a', '-cf', zipPath, '-C', payload, '.'],
        { encoding: 'utf8', windowsHide: true },
      )
    }
    expect(seed.status).toBe(0)

    ensureDshModulesExpanded(root)
    expect(dshModulesReady(root)).toBe(true)
  })
})
