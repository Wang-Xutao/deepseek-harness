import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseManifest } from '../src/update/manifest.ts'
import { buildUpdatePlan } from '../src/update/plan.ts'
import { compareVersions, isNewer } from '../src/update/semver.ts'
import { loadVersions, parseVersions, versionsPath } from '../src/versions.ts'

describe('semver', () => {
  it('orders rc below release', () => {
    expect(compareVersions('0.1.0-rc.8', '0.1.0-rc.9')).toBeLessThan(0)
    expect(compareVersions('0.1.0-rc.9', '0.1.0')).toBeLessThan(0)
    expect(isNewer('0.1.0', '0.1.0-rc.9')).toBe(true)
  })
})

describe('parseVersions', () => {
  it('fills defaults', () => {
    expect(parseVersions({})).toMatchObject({ bafDsh: '0.0.9', bafPlugin: '0.0.2' })
  })
})

describe('loadVersions vs stale persisted snapshot', () => {
  it('lets the running build embed outrank a 0.0.11-era file and fill blank sub-packages', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baf-versions-'))
    try {
      // Real-world shape from a 0.0.11 install: bafCore/bafWorkflow pinned at
      // 0.1.3-alpha.1 and the five sub-packages entirely missing.
      writeFileSync(versionsPath(dir), JSON.stringify({
        bafDsh: '0.0.11',
        dsh: '0.1.5-alpha.1',
        bafPlugin: '0.0.2',
        bafCore: '0.1.3-alpha.1',
        bafWorkflow: '0.1.3-alpha.1',
      }), 'utf8')
      const merged = loadVersions(dir, {
        bafDsh: '0.0.15',
        dsh: '0.1.5-alpha.1',
        bafPlugin: '0.0.2',
        bafCore: '0.0.1',
        bafWorkflow: '0.0.1',
        bafOpenspec: '0.0.1',
        bafStandard: '0.0.1',
        bafQuality: '0.0.1',
        bafGuard: '0.0.1',
        bafScaffold: '0.0.1',
      })
      expect(merged).toMatchObject({
        bafDsh: '0.0.15',
        dsh: '0.1.5-alpha.1',
        bafCore: '0.0.1',
        bafWorkflow: '0.0.1',
        bafOpenspec: '0.0.1',
        bafStandard: '0.0.1',
        bafQuality: '0.0.1',
        bafGuard: '0.0.1',
        bafScaffold: '0.0.1',
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps the persisted bafPlugin identity (independent update channel)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baf-versions-'))
    try {
      writeFileSync(versionsPath(dir), JSON.stringify({ bafPlugin: '0.0.9' }), 'utf8')
      const merged = loadVersions(dir, { bafDsh: '0.0.15', dsh: '0.1.5-alpha.1', bafPlugin: '0.0.2' })
      expect(merged.bafPlugin).toBe('0.0.9')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('manifest + plan', () => {
  const raw = {
    channel: 'stable',
    publishedAt: '2026-08-21T00:00:00.000Z',
    tag: 'baf-dsh-v0.0.3',
    bafDsh: '0.0.3',
    dsh: '0.1.0-rc.9',
    bafPlugin: '0.0.2',
    minShell: '0.0.2',
    force: false,
    notesZh: 'test',
    artifacts: {
      plugin: {
        name: 'baf-plugin-0.0.2.zip',
        sha256: 'a'.repeat(64),
        size: 1,
      },
    },
  }

  it('parses a valid manifest', () => {
    const parsed = parseManifest(raw)
    expect(parsed.ok).toBe(true)
  })

  it('plans a plugin-only update', () => {
    const parsed = parseManifest(raw)
    if (!parsed.ok) throw new Error(parsed.error)
    const plan = buildUpdatePlan(
      { bafDsh: '0.0.3', dsh: '0.1.0-rc.9', bafPlugin: '0.0.1' },
      parsed.value,
    )
    expect(plan.hasUpdate).toBe(true)
    expect(plan.updatePlugin).toBe(true)
    expect(plan.updateRuntime).toBe(false)
    expect(plan.updateShell).toBe(false)
  })
})
