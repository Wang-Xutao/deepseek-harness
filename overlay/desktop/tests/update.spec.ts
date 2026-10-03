import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseManifest } from '../src/update/manifest.ts'
import { buildUpdatePlan } from '../src/update/plan.ts'
import { compareVersions, isNewer } from '../src/update/semver.ts'
import { UpdateService } from '../src/update/service.ts'
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
    schema: 2,
    channel: 'stable',
    issuedAt: '2026-08-21T00:00:00.000Z',
    expiresAt: '2027-08-21T00:00:00.000Z',
    releaseEpoch: 1,
    tag: 'baf-dsh-v0.0.3',
    bafDsh: '0.0.3',
    dsh: '0.1.0-rc.9',
    bafPlugin: '0.0.2',
    bafPreset: '0.0.2',
    baseline: 'std-c',
    presetSchema: 1,
    minShell: '0.0.2',
    compatibility: { minDsh: '0.1.0-rc.9', maxDsh: '*' },
    force: false,
    notesZh: 'test',
    systemResources: ['presets/baf'],
    rollback: { supported: true, minimumVersion: '0.0.1' },
    signature: { algorithm: 'ed25519', keyId: 'test-key-1', asset: 'manifest.sig' },
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

  it('rejects schema-1 and field-damaged manifests', () => {
    const { schema, ...legacy } = raw
    expect(parseManifest({ ...legacy, publishedAt: '2026-08-21T00:00:00.000Z' }).ok).toBe(false)
    expect(parseManifest({ ...raw, signature: undefined }).ok).toBe(false)
    expect(parseManifest({ ...raw, releaseEpoch: 0 }).ok).toBe(false)
    expect(parseManifest({ ...raw, expiresAt: raw.issuedAt }).ok).toBe(false)
    void schema
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

describe('dispatchUpdateRequest (9.6 子→主命令回路)', () => {
  /** Service over a scratch userData with a rejecting fetch (offline child). */
  function makeService(): { service: UpdateService, dir: string, restore: () => void } {
    const dir = mkdtempSync(join(tmpdir(), 'baf-dispatch-'))
    const originalFetch = globalThis.fetch
    globalThis.fetch = ((): Promise<Response> => Promise.reject(new Error('网络不可用'))) as typeof fetch
    const service = new UpdateService({
      userData: dir,
      seedVersions: { bafDsh: '0.0.23', dsh: '0.1.10', bafPlugin: '0.0.23' },
      github: { owner: 'baf', repo: 'dsh', channelTag: 'baf-dsh-stable' },
      pluginDir: join(dir, 'plugin'),
      runtimeDir: join(dir, 'runtime'),
      stopChild: () => {},
      restartChild: async () => true,
      openInstaller: () => {},
    })
    const restore = (): void => {
      globalThis.fetch = originalFetch
      rmSync(dir, { recursive: true, force: true })
    }
    return { service, dir, restore }
  }

  it('check maps a failed pull to ok:false + error (never throws)', async () => {
    const { service, restore } = makeService()
    try {
      const r = await service.dispatchUpdateRequest({ id: 'req-1', command: 'check' })
      expect(r.ok).toBe(false)
      expect(r.error).toContain('网络不可用')
      expect(r.check?.status).toBe('error')
    } finally {
      restore()
    }
  })

  it('apply with nothing available answers ok:false without touching hooks', async () => {
    const { service, restore } = makeService()
    try {
      const r = await service.dispatchUpdateRequest({ id: 'req-2', command: 'apply' })
      expect(r.ok).toBe(false)
      expect(r.error).toContain('网络不可用')
      expect(r.apply?.launchedInstaller).toBe(false)
      expect(r.apply?.scopes).toEqual([])
    } finally {
      restore()
    }
  })

  it('rollback without a .bak answers ok:false (no child restart)', async () => {
    const { service, restore } = makeService()
    try {
      const r = await service.dispatchUpdateRequest({ id: 'req-3', command: 'rollback', scope: 'plugin' })
      expect(r.ok).toBe(false)
      expect(r.error).toContain('没有可回滚的备份')
      expect(r.rollback?.scope).toBe('plugin')
    } finally {
      restore()
    }
  })

  it('unknown commands and unparseable ids get a refusal, not a crash', async () => {
    const { service, restore } = makeService()
    try {
      const r = await service.dispatchUpdateRequest({ id: 'req-4', command: 'download' })
      expect(r.ok).toBe(false)
      expect(r.error).toContain('未知更新命令')
      const corrupt = await service.dispatchUpdateRequest('garbage')
      expect(corrupt.ok).toBe(false)
    } finally {
      restore()
    }
  })
})
