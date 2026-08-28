import { describe, expect, it } from 'vitest'
import { parseManifest } from '../src/update/manifest.ts'
import { buildUpdatePlan } from '../src/update/plan.ts'
import { compareVersions, isNewer } from '../src/update/semver.ts'
import { parseVersions } from '../src/versions.ts'

describe('semver', () => {
  it('orders rc below release', () => {
    expect(compareVersions('0.1.0-rc.8', '0.1.0-rc.9')).toBeLessThan(0)
    expect(compareVersions('0.1.0-rc.9', '0.1.0')).toBeLessThan(0)
    expect(isNewer('0.1.0', '0.1.0-rc.9')).toBe(true)
  })
})

describe('parseVersions', () => {
  it('fills defaults', () => {
    expect(parseVersions({})).toMatchObject({ bafDsh: '0.0.5', bafPlugin: '0.0.1' })
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
