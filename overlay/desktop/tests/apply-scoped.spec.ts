/**
 * §11.6 scoped apply/rollback tests (Phase 9.4).
 *
 * Drives {@link buildScopedUpdatePlans} + {@link applyScopedUpdate} with a
 * stubbed download layer: multi-scope transactions commit independently (a
 * single scope's failure never rolls back the other), the harness installer
 * handoff records state and launches through the injected seam (no electron
 * import anywhere in apply.ts), and a restart failure rolls back exactly
 * the scopes applied in that pass — then revives the child on the old bits.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import type { AppVersions } from '../src/versions.ts'
import { loadVersions, saveVersions } from '../src/versions.ts'
import { buildScopedUpdatePlans, type ScopedPlanResult } from '../src/update/plan.ts'
import { applyScopedUpdate, type ApplyHooks } from '../src/update/apply.ts'
import type { GithubUpdateConfig } from '../src/update/github.ts'
import type { UpdateManifest } from '../src/update/manifest.ts'

const CONFIG: GithubUpdateConfig = { owner: 'o', repo: 'r', channelTag: 'baf-channel-stable' }

// Put System32 first so extract.ts's `tar.exe` resolves bsdtar like packaged
// Electron does — under Git Bash the PATH's tar.exe is MSYS GNU tar, which
// reads `C:\…` paths as rsh remotes and drops to the slow PowerShell fallback.
const sys32Dir = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')
if (existsSync(sys32Dir)) process.env.Path = `${sys32Dir};${process.env.Path}`

const LOCAL: AppVersions = {
  bafDsh: '0.0.23',
  dsh: '0.1.9',
  bafPlugin: '0.0.5',
}

/** Well-formed schema-2 manifest fixture (matches parseManifest contract). */
function manifestFixture(overrides: Record<string, unknown> = {}): UpdateManifest {
  return {
    schema: 2,
    channel: 'stable',
    issuedAt: '2026-09-01T00:00:00.000Z',
    expiresAt: '2026-12-01T00:00:00.000Z',
    releaseEpoch: 5,
    tag: 'baf-dsh-v0.0.24',
    bafDsh: '0.0.24',
    dsh: '0.1.10',
    bafPlugin: '0.0.9',
    bafPreset: '0.0.9',
    baseline: 'std-c',
    presetSchema: 1,
    minShell: '0.0.1',
    compatibility: { minDsh: '0.1.0', maxDsh: '*' },
    force: false,
    notesZh: '',
    artifacts: {
      plugin: { name: 'plugin.zip', sha256: 'a'.repeat(64), size: 1 },
      runtime: { name: 'runtime.zip', sha256: 'b'.repeat(64), size: 1 },
    },
    systemResources: ['presets/baf'],
    rollback: { supported: true, minimumVersion: '0.0.1' },
    signature: { algorithm: 'ed25519', keyId: 'k', asset: 'manifest.sig' },
    ...overrides,
  } as UpdateManifest
}

/** Zip fixture writer — a real zip so extractZip's tar.exe path runs. */
function writeZip(path: string, entries: Record<string, string>): void {
  const dir = mkdtempSync(join(tmpdir(), 'baf-zip-src-'))
  try {
    for (const [name, content] of Object.entries(entries)) {
      const target = join(dir, name)
      mkdirSync(join(target, '..'), { recursive: true })
      writeFileSync(target, content, 'utf8')
    }
    // Resolve System32 bsdtar explicitly: under Git Bash the PATH's `tar`
    // is MSYS GNU tar, which reads `C:\...` as an rsh remote host.
    const sys32Tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
    const tarBin = existsSync(sys32Tar) ? sys32Tar : 'tar.exe'
    // bsdtar -a picks the zip codec from the .zip extension.
    execFileSync(tarBin, ['-a', '-cf', path, ...Object.keys(entries)], { cwd: dir })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Hooks double: downloads are served from local fixture zips (hash-verified
 * like the real path), child lifecycle and installer are recorded.
 */
function makeHooks(artifacts: Record<string, Record<string, string>>, opts: {
  restartOk?: boolean
  failRestartFirst?: boolean
} = {}): ApplyHooks & { calls: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'baf-apply-'))
  const calls: string[] = []
  const hooks: ApplyHooks & { calls: string[] } = {
    calls,
    userData: dir,
    pluginDir: join(dir, 'plugin'),
    runtimeDir: join(dir, 'dsh'),
    stopChild: () => {
      calls.push('stop')
    },
    restartChild: async () => {
      calls.push('restart')
      if (hooks.calls.filter(c => c === 'restart').length === 1 && opts.failRestartFirst) return false
      return opts.restartOk !== false
    },
    openInstaller: (setupPath) => {
      calls.push(`installer:${setupPath}`)
    },
    onProgress: undefined,
  }
  mkdirSync(hooks.pluginDir, { recursive: true })
  writeFileSync(join(hooks.pluginDir, 'marker.txt'), 'old-plugin', 'utf8')
  mkdirSync(hooks.runtimeDir, { recursive: true })
  writeFileSync(join(hooks.runtimeDir, 'marker.txt'), 'old-runtime', 'utf8')
  saveVersions(hooks.userData, LOCAL)
  // Serve artifact downloads from fixture zips with correct sha256.
  const zips: Record<string, string> = {}
  for (const [name, entries] of Object.entries(artifacts)) {
    const zipPath = join(dir, `${name}.fixture.zip`)
    writeZip(zipPath, entries)
    zips[name] = zipPath
  }
  // Patch github.ts download functions via module-level fetch stub is not
  // possible here — instead the spec passes a patched config through a
  // module cache override set up in installDownloadStub().
  installDownloadStub(zips, dir)
  return hooks
}

/** Stub github.ts resolveReleaseAsset/downloadAssetToFile through fetch. */
function installDownloadStub(zips: Record<string, string>, dir: string): void {
  const realFetch = globalThis.fetch
  stubbedFetch.current = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    if (url.includes('/releases/tags/')) {
      const names = Object.keys(zips)
      return {
        ok: true, status: 200,
        json: async () => ({ tag_name: 'x', assets: names.map((n, i) => ({ id: i, name: n, browser_download_url: '', url: `zip://${n}`, size: 1 })) }),
      } as unknown as Response
    }
    if (url.startsWith('zip://')) {
      const name = url.slice('zip://'.length)
      const bytes = readFileSync(zips[name])
      return {
        ok: true, status: 200,
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      } as unknown as Response
    }
    return realFetch(input)
  }
  stubbedFetch.dir = dir
}

/** Shared mutable stub state (reset per makeHooks call). */
const stubbedFetch: { current: typeof fetch | undefined; dir: string } = { current: undefined, dir: '' }
const realFetch = globalThis.fetch

/** Install the stub before every scenario (fresh per hooks). */
function activateStub(): void {
  if (stubbedFetch.current !== undefined) globalThis.fetch = stubbedFetch.current
}

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('buildScopedUpdatePlans', () => {
  it('plans plugin+runtime applies for a hot manifest and freezes baseline', () => {
    const scoped = buildScopedUpdatePlans(LOCAL, manifestFixture())
    const byScope = Object.fromEntries(scoped.plans.map(p => [p.scope, p]))
    expect(byScope.harness.action).toBe('apply')
    expect(byScope.harness.targetVersion).toBe('0.1.10')
    expect(byScope.harness.restartRequired).toBe(true)
    expect(byScope.plugin.action).toBe('apply')
    expect(byScope.plugin.targetVersion).toBe('0.0.9')
    expect(byScope.baseline.action).toBe('none')
    expect(scoped.blocked).toBeUndefined()
  })

  it('plans the installer handoff when minShell outranks the desktop', () => {
    const scoped = buildScopedUpdatePlans(LOCAL, manifestFixture({
      minShell: '0.0.99',
      artifacts: {
        plugin: { name: 'plugin.zip', sha256: 'a'.repeat(64), size: 1 },
        shell: { name: 'setup.exe', sha256: 'c'.repeat(64), size: 1 },
      },
    }))
    const harness = scoped.plans.find(p => p.scope === 'harness')
    const plugin = scoped.plans.find(p => p.scope === 'plugin')
    expect(harness?.action).toBe('installer')
    expect(harness?.required).toBe(true)
    // The installer dominates: the plugin only stages for the next version.
    expect(plugin?.action).toBe('download')
  })

  it('blocks every scope on an expired manifest (policy first)', () => {
    const scoped = buildScopedUpdatePlans(LOCAL, manifestFixture(), { now: new Date('2027-06-01T00:00:00.000Z') })
    expect(scoped.blocked).toBeDefined()
    expect(scoped.plans.every(p => p.action === 'none')).toBe(true)
  })

  it('refuses a replayed epoch', () => {
    const scoped = buildScopedUpdatePlans(LOCAL, manifestFixture(), { lastReleaseEpoch: 6 })
    expect(scoped.blocked).toContain('releaseEpoch')
  })

  it('gates the plugin when the runtime falls outside compatibility', () => {
    const scoped = buildScopedUpdatePlans(
      { ...LOCAL, dsh: '0.0.1' },
      manifestFixture({ artifacts: { plugin: { name: 'plugin.zip', sha256: 'a'.repeat(64), size: 1 } } }),
    )
    const plugin = scoped.plans.find(p => p.scope === 'plugin')
    expect(plugin?.action).toBe('none')
    expect(plugin?.reason).toContain('兼容下限')
  })
})

describe('applyScopedUpdate — independent per-scope transactions', () => {
  it('applies runtime+plugin in one pass with one restart', async () => {
    const m = manifestFixture()
    const hooks = makeHooks({
      'runtime.zip': { 'dsh/marker.txt': 'new-runtime' },
      'plugin.zip': { 'marker.txt': 'new-plugin' },
    })
    // Fix the fixture hashes into the manifest the plan carries.
    const scoped: ScopedPlanResult = { plans: [], manifest: patchHashes(m), summaryZh: '' }
    scoped.plans = buildScopedUpdatePlans(loadVersions(hooks.userData, LOCAL), scoped.manifest).plans
    activateStub()
    const result = await applyScopedUpdate(CONFIG, scoped, loadVersions(hooks.userData, LOCAL), hooks)
    expect(result.ok).toBe(true)
    expect(result.scopes.map(s => `${s.scope}:${s.ok}`)).toEqual(['harness:true', 'plugin:true'])
    expect(result.restartedChild).toBe(true)
    expect(readFileSync(join(hooks.runtimeDir, 'marker.txt'), 'utf8')).toBe('new-runtime')
    expect(readFileSync(join(hooks.pluginDir, 'marker.txt'), 'utf8')).toBe('new-plugin')
    expect(hooks.calls.filter(c => c === 'restart')).toHaveLength(1)
    // Versions advanced for both scopes.
    expect(loadVersions(hooks.userData, LOCAL).dsh).toBe('0.1.10')
    expect(loadVersions(hooks.userData, LOCAL).bafPlugin).toBe('0.0.9')
  }, 30000)

  it('rolls back ONLY the failed scope when plugin download is broken', async () => {
    const m = manifestFixture()
    const hooks = makeHooks({
      'runtime.zip': { 'dsh/marker.txt': 'new-runtime' },
    })
    const scoped: ScopedPlanResult = { plans: [], manifest: patchHashes(m), summaryZh: '' }
    scoped.plans = buildScopedUpdatePlans(loadVersions(hooks.userData, LOCAL), scoped.manifest).plans
    activateStub()
    const result = await applyScopedUpdate(CONFIG, scoped, loadVersions(hooks.userData, LOCAL), hooks)
    // The plugin artifact has no served zip → its transaction fails, the
    // runtime's committed swap must survive (独立事务).
    expect(result.ok).toBe(false)
    const plugin = result.scopes.find(s => s.scope === 'plugin')
    expect(plugin?.ok).toBe(false)
    expect(plugin?.rolledBack).toBe(true)
    expect(readFileSync(join(hooks.runtimeDir, 'marker.txt'), 'utf8')).toBe('new-runtime')
    expect(loadVersions(hooks.userData, LOCAL).dsh).toBe('0.1.10')
    // The child still restarted (runtime applied this pass needs validation).
    expect(result.restartedChild).toBe(true)
  }, 30000)

  it('rolls back this pass\'s scopes and revives the child when restart fails', async () => {
    const m = manifestFixture()
    const hooks = makeHooks({
      'runtime.zip': { 'dsh/marker.txt': 'new-runtime' },
      'plugin.zip': { 'marker.txt': 'new-plugin' },
    }, { failRestartFirst: true })
    const scoped: ScopedPlanResult = { plans: [], manifest: patchHashes(m), summaryZh: '' }
    scoped.plans = buildScopedUpdatePlans(loadVersions(hooks.userData, LOCAL), scoped.manifest).plans
    activateStub()
    const result = await applyScopedUpdate(CONFIG, scoped, loadVersions(hooks.userData, LOCAL), hooks)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('未能就绪')
    expect(readFileSync(join(hooks.runtimeDir, 'marker.txt'), 'utf8')).toBe('old-runtime')
    expect(readFileSync(join(hooks.pluginDir, 'marker.txt'), 'utf8')).toBe('old-plugin')
    // Best-effort revive ran (second restart attempt on old bits).
    expect(hooks.calls.filter(c => c === 'restart')).toHaveLength(2)
    expect(loadVersions(hooks.userData, LOCAL).bafPlugin).toBe('0.0.5')
  }, 30000)

  it('hands off to the injected installer seam and records the handoff state', async () => {
    const m = manifestFixture({
      minShell: '0.0.99',
      artifacts: {
        plugin: { name: 'plugin.zip', sha256: 'a'.repeat(64), size: 1 },
        shell: { name: 'setup.exe', sha256: 'c'.repeat(64), size: 1 },
      },
    })
    const hooks = makeHooks({
      'setup.exe': { 'stub': 'installer' },
      'plugin.zip': { 'marker.txt': 'staged-plugin' },
    })
    const scoped: ScopedPlanResult = { plans: [], manifest: patchHashes(m), summaryZh: '' }
    scoped.plans = buildScopedUpdatePlans(loadVersions(hooks.userData, LOCAL), scoped.manifest).plans
    activateStub()
    const result = await applyScopedUpdate(CONFIG, scoped, loadVersions(hooks.userData, LOCAL), hooks)
    expect(result.launchedInstaller).toBe(true)
    expect(result.ok).toBe(true)
    expect(hooks.calls.some(c => c.startsWith('installer:'))).toBe(true)
    // Handoff record exists for the next version's re-check (9.6 status).
    const handoff = join(hooks.userData, 'updates', 'installer-handoff.json')
    expect(existsSync(handoff)).toBe(true)
    const record = JSON.parse(readFileSync(handoff, 'utf8')) as Record<string, unknown>
    expect(record.tag).toBe('baf-dsh-v0.0.24')
    expect(record.keyId).toBe('k')
    // Old install untouched: no stop/restart happened during handoff.
    expect(hooks.calls).not.toContain('stop')
  }, 30000)
})

/** Rewrite artifact sha256s to the real fixture-zip hashes (download verify). */
function patchHashes(manifest: UpdateManifest): UpdateManifest {
  const hashes = fixtureHashes()
  const artifacts = { ...manifest.artifacts }
  for (const key of ['plugin', 'runtime', 'shell'] as const) {
    const art = artifacts[key]
    if (art === undefined) continue
    const h = hashes[art.name]
    if (h === undefined) continue
    artifacts[key] = { ...art, sha256: h }
  }
  return { ...manifest, artifacts }
}

/** zip-name → sha256 of the currently registered fixtures. */
function fixtureHashes(): Record<string, string> {
  const dir = stubbedFetch.dir
  const out: Record<string, string> = {}
  if (dir === '') return out
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.fixture.zip')) continue
    out[f.replace('.fixture.zip', '')] = createHash('sha256').update(readFileSync(join(dir, f))).digest('hex')
  }
  return out
}
