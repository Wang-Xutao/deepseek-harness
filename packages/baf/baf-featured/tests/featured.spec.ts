/** Featured-plugins service orchestration: manifest join, install folding, bulk, state, and version checks. */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type PluginManager from '@deepseek-ai/dsh-plugin-manager'
import type { BundleInfo } from '@deepseek-ai/dsh-plugin-manager'
import type { ProfileContext } from '@deepseek-ai/dsh-app-boot'
import { DSH_HOME_ENV } from '@deepseek-ai/dsh-home-paths'
import FeaturedPlugins from '../src/index.ts'
import { appendDedupeRows, overlappingRowIds, stripDedupeRows } from '../src/dedupe.ts'
import { FEATURED_MANIFEST_ENV, parseFeaturedManifest, readFeaturedManifest } from '../src/manifest.ts'
import { compareVersions, rangeSatisfies } from '../src/registry.ts'
import { FEATURED_STATE_FILENAME, readFeaturedState } from '../src/state.ts'

const FEISHU_SPEC = '@dsh-feishu/dsh-feishu@^0.3.5'

const MANIFEST = {
  schemaVersion: 1,
  revision: 3,
  plugins: [
    {
      id: 'dsh-feishu',
      package: '@dsh-feishu/dsh-feishu',
      version: '^0.3.5',
      nameZh: '飞书', nameEn: 'Feishu',
      descriptionZh: '接入飞书', descriptionEn: 'Feishu integration',
      homepage: 'https://github.com/PGZXB/dsh-feishu',
      registryFirst: 'https://registry.npmmirror.com',
      autoUpdateDefault: true,
      peerExemptionExpected: true,
      verified: true,
    },
    {
      id: 'second',
      package: '@example/second',
      version: '1.0.0',
      nameZh: '示例', nameEn: 'Example',
      descriptionZh: '第二个', descriptionEn: 'Second entry',
      homepage: 'https://example.com/second',
      autoUpdateDefault: false,
    },
  ],
}

/** A minimal fake answering the manager surface this service drives. */
function fakeManager() {
  return {
    listBundles: vi.fn(async () => [] as unknown[]),
    installBundle: vi.fn(async () => ({ changed: true, application: 'applied' as const })),
    setBundleEnabled: vi.fn(async () => ({ changed: true, application: 'applied' as const })),
    removeBundle: vi.fn(async () => ({ changed: true, application: 'applied' as const })),
    setVersionExemption: vi.fn(async () => ({ changed: true, application: 'applied' as const })),
  }
}

let home = ''
let savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'baf-featured-'))
  savedEnv = { [DSH_HOME_ENV]: process.env[DSH_HOME_ENV], [FEATURED_MANIFEST_ENV]: process.env[FEATURED_MANIFEST_ENV] }
  process.env[DSH_HOME_ENV] = home
  const manifestPath = join(home, 'featured-plugins.json')
  writeFileSync(manifestPath, `${JSON.stringify(MANIFEST)}\n`)
  process.env[FEATURED_MANIFEST_ENV] = manifestPath
})

afterEach(() => {
  // Static keys, matching the repo's env-restore precedent for the lint rule.
  if (savedEnv.DSH_HOME === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedEnv.DSH_HOME
  if (savedEnv.BAF_DSH_FEATURED_MANIFEST === undefined) delete process.env.BAF_DSH_FEATURED_MANIFEST
  else process.env.BAF_DSH_FEATURED_MANIFEST = savedEnv.BAF_DSH_FEATURED_MANIFEST
  rmSync(home, { recursive: true, force: true })
})

/** Context with the featured service mounted over a fake or absent manager. */
async function fixture(withManager = true) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  const manager = fakeManager()
  if (withManager) ctx.provide('pluginManager', manager as unknown as PluginManager)
  await ctx.plugin(FeaturedPlugins, { autoUpdateIntervalMs: 60_000 })
  return { ctx, manager, featured: ctx.featuredPlugins }
}

describe('manifest parsing', () => {
  it('accepts the curated manifest and reports its revision', () => {
    const { manifest, problems } = parseFeaturedManifest(MANIFEST)
    expect(problems).toEqual([])
    expect(manifest?.revision).toBe(3)
    expect(manifest?.plugins.map(plugin => plugin.id)).toEqual(['dsh-feishu', 'second'])
  })

  it.each([
    ['not an object', 42],
    ['wrong schema', { schemaVersion: 2, revision: 1, plugins: [] }],
    ['missing revision', { schemaVersion: 1, plugins: [] }],
  ])('rejects a broken document: %s', (_name, value) => {
    expect(parseFeaturedManifest(value).manifest).toBeUndefined()
  })

  it('rejects duplicate ids and missing required fields with named problems', () => {
    const { problems } = parseFeaturedManifest({
      schemaVersion: 1, revision: 1,
      plugins: [MANIFEST.plugins[0], MANIFEST.plugins[0], { id: 'x' }],
    })
    expect(problems.join('\n')).toContain('duplicate id "dsh-feishu"')
    expect(problems.join('\n')).toContain('plugins[2]: package must be a non-empty string')
  })

  it('treats an unset path as an empty manifest and a broken file as an error', () => {
    expect(readFeaturedManifest(undefined)).toEqual({})
    const path = join(home, 'broken.json')
    writeFileSync(path, '{nope')
    expect(readFeaturedManifest(path).error).toContain('broken.json')
  })
})

describe('version ranges', () => {
  it('orders numeric cores, prereleases, and lexicographic tails', () => {
    expect(compareVersions('0.3.5', '0.3.6')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('0.3.5-rc.1', '0.3.5')).toBeLessThan(0)
    expect(compareVersions('0.3.10', '0.3.9')).toBeGreaterThan(0)
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0)
  })

  it('admits in-range versions and excludes ceilings and strangers', () => {
    expect(rangeSatisfies('^0.3.5', '0.3.5')).toBe(true)
    expect(rangeSatisfies('^0.3.5', '0.3.9')).toBe(true)
    expect(rangeSatisfies('^0.3.5', '0.4.0')).toBe(false)
    expect(rangeSatisfies('^0.3.5', '0.3.4')).toBe(false)
    expect(rangeSatisfies('^1.2.3', '1.9.0')).toBe(true)
    expect(rangeSatisfies('^1.2.3', '2.0.0')).toBe(false)
    expect(rangeSatisfies('0.3.5', '0.3.5')).toBe(true)
    expect(rangeSatisfies('0.3.5', '0.3.6')).toBe(false)
  })
})

describe('list', () => {
  it('joins manifest entries with bundles and persisted state', async () => {
    const { featured, manager } = await fixture()
    manager.listBundles.mockResolvedValue([
      { name: '@dsh-feishu/dsh-feishu', version: '0.3.5', enabled: true, installed: true },
    ])
    writeFileSync(join(home, FEATURED_STATE_FILENAME), `${JSON.stringify({
      schemaVersion: 1, autoUpdate: {}, latestKnown: { 'dsh-feishu': '0.3.6' }, lastCheck: 1,
    })}\n`)
    const listing = await featured.list()
    expect(listing.revision).toBe(3)
    const feishu = listing.plugins.find(card => card.id === 'dsh-feishu')
    expect(feishu).toMatchObject({
      state: 'enabled', installedVersion: '0.3.5', latestKnown: '0.3.6',
      updateAvailable: true, autoUpdate: true, manageable: true,
    })
    expect(listing.plugins.find(card => card.id === 'second')).toMatchObject({
      state: 'not-installed', autoUpdate: false,
    })
  })

  it('marks disabled, failed, unverified, and managerless entries', async () => {
    const { featured, manager } = await fixture()
    manager.listBundles.mockResolvedValue([
      { name: '@dsh-feishu/dsh-feishu', version: '0.3.5', enabled: false, installed: true },
      { name: '@example/second', version: '1.0.0', enabled: true, installed: true, error: { code: 'incompatible-version' } },
    ])
    let listing = await featured.list()
    expect(listing.plugins.find(card => card.id === 'dsh-feishu')?.state).toBe('disabled')
    expect(listing.plugins.find(card => card.id === 'second')?.state).toBe('unavailable')

    manager.listBundles.mockResolvedValue([
      { name: '@dsh-feishu/dsh-feishu', version: '0.3.5', enabled: true, installed: true },
    ])
    process.env[FEATURED_MANIFEST_ENV] = join(home, 'unverified.json')
    writeFileSync(process.env[FEATURED_MANIFEST_ENV], JSON.stringify({
      ...MANIFEST, plugins: [{ ...MANIFEST.plugins[0], verified: false }],
    }))
    listing = await featured.list()
    expect(listing.plugins.find(card => card.id === 'dsh-feishu')?.state).toBe('unavailable')

    const { featured: bare } = await fixture(false)
    const without = await bare.list()
    expect(without.plugins.every(card => card.state === 'unavailable' && !card.manageable)).toBe(true)
  })

  it('reports an unreadable manifest without failing the call', async () => {
    const { featured } = await fixture()
    writeFileSync(process.env[FEATURED_MANIFEST_ENV]!, '{broken')
    const listing = await featured.list()
    expect(listing.plugins).toEqual([])
    expect(listing.manifestError).toBeTruthy()
    expect(listing.revision).toBeUndefined()
  })
})

describe('install and update', () => {
  it('installs the curated spec through the manager and folds success', async () => {
    const { featured, manager } = await fixture()
    const result = await featured.installPlugin('dsh-feishu')
    expect(manager.installBundle).toHaveBeenCalledWith(FEISHU_SPEC, {
      enabled: true, registry: 'https://registry.npmmirror.com',
    })
    expect(result).toEqual({ ok: true, application: 'applied' })
    await featured.update('dsh-feishu', { requestId: 'req-1', approvedBuilds: ['protobufjs'] })
    expect(manager.installBundle).toHaveBeenLastCalledWith(FEISHU_SPEC, {
      enabled: true, requestId: 'req-1', approvedBuilds: ['protobufjs'], registry: 'https://registry.npmmirror.com',
    })
  })

  it('surfaces a compatibility refusal as a risk confirmation until accepted', async () => {
    const { featured, manager } = await fixture()
    const refusal = {
      changed: false, application: 'failed' as const, stage: 'install' as const, target: FEISHU_SPEC,
      error: {
        code: 'incompatible-version' as const,
        incompatible: [{ name: '@dsh-feishu/dsh-feishu', version: '0.3.5', runtimeVersion: '0.2.0-rc.2', peers: { '@deepseek-ai/dsh-agent': '^0.1.7-rc.2' } }],
      },
    }
    manager.installBundle
      .mockResolvedValueOnce(refusal)
      .mockResolvedValueOnce(refusal)
    const asked = await featured.installPlugin('dsh-feishu')
    expect(asked.ok).toBe(false)
    expect(asked.needsRiskAck?.[0]?.runtimeVersion).toBe('0.2.0-rc.2')
    expect(manager.setVersionExemption).not.toHaveBeenCalled()

    const accepted = await featured.installPlugin('dsh-feishu', { acceptRisk: true })
    expect(manager.setVersionExemption).toHaveBeenCalledWith('@dsh-feishu/dsh-feishu@0.3.5', '0.2.0-rc.2', true, true)
    // One call from the refused ask, then the accepted ask's initial run and its retry.
    expect(manager.installBundle).toHaveBeenCalledTimes(3)
    expect(accepted.ok).toBe(true)
  })

  it('keeps the exemption failure when granting the risk fails', async () => {
    const { featured, manager } = await fixture()
    manager.installBundle.mockResolvedValue({
      changed: false, application: 'failed' as const, stage: 'install' as const, target: FEISHU_SPEC,
      error: {
        code: 'incompatible-version' as const,
        incompatible: [{ name: '@dsh-feishu/dsh-feishu', version: '0.3.5', runtimeVersion: '0.2.0-rc.2', peers: {} }],
      },
    })
    manager.setVersionExemption.mockResolvedValue({
      changed: false, application: 'failed' as const, stage: 'enable' as const, target: '@dsh-feishu/dsh-feishu@0.3.5',
    })
    const result = await featured.installPlugin('dsh-feishu', { acceptRisk: true })
    expect(result.ok).toBe(false)
    expect(manager.installBundle).toHaveBeenCalledTimes(1)
  })

  it('forwards held build scripts for approval and refuses unknown ids', async () => {
    const { featured, manager } = await fixture()
    manager.installBundle.mockResolvedValue({
      changed: false, application: 'failed' as const, stage: 'install' as const, target: FEISHU_SPEC,
      pendingBuilds: ['protobufjs'],
    })
    const result = await featured.installPlugin('dsh-feishu')
    expect(result.pendingBuilds).toEqual(['protobufjs'])
    expect(await featured.installPlugin('missing-id')).toMatchObject({ ok: false, error: { code: 'unknown-plugin' } })
  })

  it('refuses every mutation without a manager', async () => {
    const { featured } = await fixture(false)
    for (const outcome of [
      await featured.installPlugin('dsh-feishu'),
      await featured.update('dsh-feishu'),
      await featured.removePlugin('dsh-feishu'),
      await featured.setEnabled('dsh-feishu', true),
    ]) {
      expect(outcome).toMatchObject({ ok: false, error: { code: 'operation-error' } })
    }
  })
})

describe('duplicate-row repair', () => {
  /** The live shape: the web-app layer mounts the three packages under its own row ids. */
  const BUNDLES = [
    { name: '@deepseek-ai/dsh-web-app', overrides: [], rows: [
      { rowId: 'connection', moduleName: '@deepseek-ai/dsh-client-connection' },
      { rowId: 'file-upload', moduleName: '@deepseek-ai/dsh-client-file-upload' },
      { rowId: 'session-controller', moduleName: '@deepseek-ai/dsh-api-session-controller' },
    ] },
    { name: '@dsh-feishu/dsh-feishu', overrides: [], rows: [
      { rowId: 'feishu', moduleName: '@dsh-feishu/dsh-feishu' },
      { rowId: 'client-connection', moduleName: '@deepseek-ai/dsh-client-connection' },
      { rowId: 'client-file-upload', moduleName: '@deepseek-ai/dsh-client-file-upload' },
      { rowId: 'api-session-controller', moduleName: '@deepseek-ai/dsh-api-session-controller' },
    ] },
  ] as unknown as BundleInfo[]

  it('names rows whose package another bundle mounts under a different id', () => {
    expect(overlappingRowIds(BUNDLES, '@dsh-feishu/dsh-feishu')).toEqual([
      'client-connection', 'client-file-upload', 'api-session-controller',
    ])
    // An id another layer also declares is an override, never a duplicate.
    const shared = [
      { name: '@deepseek-ai/dsh-web-app', overrides: [], rows: [
        { rowId: 'connection', moduleName: '@deepseek-ai/dsh-client-connection' },
      ] },
      { name: '@dsh-feishu/dsh-feishu', overrides: [], rows: [
        { rowId: 'connection', moduleName: '@deepseek-ai/dsh-client-connection' },
      ] },
    ] as unknown as BundleInfo[]
    expect(overlappingRowIds(shared, '@dsh-feishu/dsh-feishu')).toEqual([])
    expect(overlappingRowIds(BUNDLES, '@not/installed')).toEqual([])
  })

  it('appends managed disable rows without touching existing bytes, and strips them', async () => {
    const patchPath = join(home, 'cordis.patch.yml')
    writeFileSync(patchPath, '# my layer\n- id: mine\n  name: example\n')
    // 'mine' is already declared by the person's own row and stays theirs.
    expect(await appendDedupeRows(patchPath, ['client-connection', 'mine'])).toBe(true)
    const text = readFileSync(patchPath, 'utf8')
    expect(text.startsWith('# my layer\n- id: mine\n  name: example\n')).toBe(true)
    expect(text).toContain('# baf-featured dedupe: client-connection mounts a package another bundle already provides\n- id: client-connection\n  disabled: true')
    expect(await appendDedupeRows(patchPath, ['client-connection'])).toBe(false)
    await stripDedupeRows(patchPath, ['client-connection'])
    expect(readFileSync(patchPath, 'utf8')).toBe('# my layer\n- id: mine\n  name: example\n')
    await stripDedupeRows(patchPath, ['client-connection'])
  })

  it('repairs a duplicate-registration failure through the profile patch', async () => {
    const { ctx, featured, manager } = await fixture()
    const patchPath = join(home, 'cordis.patch.yml')
    ctx.profileContext = { patchPath } as unknown as ProfileContext
    manager.listBundles.mockResolvedValue(BUNDLES)
    manager.installBundle.mockResolvedValueOnce({
      changed: true, application: 'failed' as const, stage: 'install' as const, target: FEISHU_SPEC,
      error: { code: 'operation-error', diagnostic: 'dsh: warning: 3 entries did not activate' },
    })
    const result = await featured.installPlugin('dsh-feishu')
    expect(result).toMatchObject({ ok: true })
    expect(manager.setBundleEnabled).toHaveBeenCalledWith('@dsh-feishu/dsh-feishu', true)
    expect(readFileSync(patchPath, 'utf8')).toContain('- id: client-connection\n  disabled: true')
  })

  it('lets a refusal that changed nothing on disk reach the caller unrepaired', async () => {
    const { ctx, featured, manager } = await fixture()
    const patchPath = join(home, 'cordis.patch.yml')
    ctx.profileContext = { patchPath } as unknown as ProfileContext
    manager.listBundles.mockResolvedValue(BUNDLES)
    manager.installBundle.mockResolvedValueOnce({
      changed: false, application: 'failed' as const, stage: 'install' as const, target: FEISHU_SPEC,
      error: {
        code: 'incompatible-version' as const,
        incompatible: [{ name: '@dsh-feishu/dsh-feishu', version: '0.3.4', runtimeVersion: '0.2.0-rc.2', peers: {} }],
      },
    })
    const result = await featured.update('dsh-feishu')
    // The risk confirmation must survive: recomposition cannot clear a refusal
    // that never reached the applying stage.
    expect(result.ok).toBe(false)
    expect(result.needsRiskAck).toBeInstanceOf(Array)
    expect(manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(existsSync(patchPath)).toBe(false)
  })

  it('leaves a clean install with no overlapping rows untouched', async () => {
    const { ctx, featured, manager } = await fixture()
    const patchPath = join(home, 'cordis.patch.yml')
    ctx.profileContext = { patchPath } as unknown as ProfileContext
    manager.listBundles.mockResolvedValue([
      { name: '@dsh-feishu/dsh-feishu', overrides: [], rows: [{ rowId: 'feishu', moduleName: '@dsh-feishu/dsh-feishu' }] },
    ] as unknown as BundleInfo[])
    expect(await featured.installPlugin('dsh-feishu')).toMatchObject({ ok: true })
    expect(manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(existsSync(patchPath)).toBe(false)
  })

  it('strips its managed rows after a successful removal', async () => {
    const { ctx, featured, manager } = await fixture()
    const patchPath = join(home, 'cordis.patch.yml')
    ctx.profileContext = { patchPath } as unknown as ProfileContext
    await appendDedupeRows(patchPath, ['client-connection', 'client-file-upload'])
    manager.listBundles.mockResolvedValue(BUNDLES)
    expect(await featured.removePlugin('dsh-feishu')).toMatchObject({ ok: true })
    expect(readFileSync(patchPath, 'utf8')).toBe('')
  })
})

describe('remove, enablement, and bulk', () => {
  it('removes and toggles through the manager by package name', async () => {
    const { featured, manager } = await fixture()
    expect(await featured.removePlugin('dsh-feishu')).toEqual({ ok: true, application: 'applied' })
    expect(manager.removeBundle).toHaveBeenCalledWith('@dsh-feishu/dsh-feishu')
    expect(await featured.setEnabled('second', false)).toEqual({ ok: true, application: 'applied' })
    expect(manager.setBundleEnabled).toHaveBeenCalledWith('@example/second', false)
  })

  it('installs only missing entries and toggles only changed ones', async () => {
    const { featured, manager } = await fixture()
    manager.listBundles.mockResolvedValue([
      { name: '@example/second', version: '1.0.0', enabled: false, installed: true },
    ])
    const installed = await featured.bulkInstall()
    expect(installed.outcomes.map(outcome => outcome.id)).toEqual(['dsh-feishu'])
    expect(manager.installBundle).toHaveBeenCalledTimes(1)

    const enabled = await featured.bulkSetEnabled(true)
    expect(enabled.outcomes.map(outcome => outcome.id)).toEqual(['second'])
    expect(manager.setBundleEnabled).toHaveBeenCalledWith('@example/second', true)
  })
})

describe('state and version checks', () => {
  it('persists auto-update overrides beside the home', async () => {
    const { featured } = await fixture()
    expect(await featured.setAutoUpdate('dsh-feishu', false)).toEqual({ ok: true })
    const state = readFeaturedState(home)
    expect(state.autoUpdate['dsh-feishu']).toBe(false)
    const listing = await featured.list()
    expect(listing.plugins.find(card => card.id === 'dsh-feishu')?.autoUpdate).toBe(false)
  })

  it('refreshes latest-known versions and flags only in-range updates', async () => {
    const { featured, manager } = await fixture()
    manager.listBundles.mockResolvedValue([
      { name: '@dsh-feishu/dsh-feishu', version: '0.3.5', enabled: true, installed: true },
      { name: '@example/second', version: '1.0.0', enabled: true, installed: true },
    ])
    const fetch = vi.fn(async (url: string) => new Response(JSON.stringify({
      version: url.includes('dsh-feishu') ? '0.3.6' : '9.9.9',
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    onTestFinished(() => vi.unstubAllGlobals())
    const listing = await featured.checkUpdates()
    expect(fetch).toHaveBeenCalledWith('https://registry.npmmirror.com/@dsh-feishu/dsh-feishu/latest', expect.anything())
    expect(listing.plugins.find(card => card.id === 'dsh-feishu')).toMatchObject({
      latestKnown: '0.3.6', updateAvailable: true,
    })
    expect(listing.plugins.find(card => card.id === 'second')).toMatchObject({
      latestKnown: '9.9.9', updateAvailable: false,
    })
    const state = readFeaturedState(home)
    expect(state.latestKnown['dsh-feishu']).toBe('0.3.6')
    expect(state.lastCheck).toBeGreaterThan(0)
  })

  it('survives an unreadable state file with defaults', async () => {
    writeFileSync(join(home, FEATURED_STATE_FILENAME), '{broken')
    const { featured } = await fixture()
    const listing = await featured.list()
    expect(listing.plugins.find(card => card.id === 'dsh-feishu')?.autoUpdate).toBe(true)
  })

  it('emits the change event after mutations', async () => {
    const { featured } = await fixture()
    const changed = vi.fn()
    featured.ctx.on('featured-plugins/changed', changed)
    await featured.setAutoUpdate('dsh-feishu', true)
    expect(changed).toHaveBeenCalled()
  })
})
