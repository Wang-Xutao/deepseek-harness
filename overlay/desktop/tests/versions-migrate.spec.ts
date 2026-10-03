/**
 * §11.6 InstalledVersions schema 2 migration tests (Phase 9.1).
 *
 * Pins the frozen enterprise-inputs.md §7 mapping on the explicit
 * `migrateVersions()` path: legacy three-field flat file → scoped schema 2,
 * one-way with a backup marker, idempotent on re-read, corrupt files left
 * untouched, and `bafPlugin` never guessed into baseline/tool versions.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_VERSIONS,
  UNKNOWN_VERSION,
  loadInstalledVersions,
  loadVersions,
  migrateVersions,
  parseInstalledVersions,
  parseVersions,
  saveInstalledVersions,
  saveVersions,
  versionsPath,
} from '../src/versions.ts'

const SEED = {
  ...DEFAULT_VERSIONS,
  bafDsh: '0.0.23',
  dsh: '0.1.9',
  bafPlugin: '0.0.5',
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'baf-versions-migrate-'))
}

describe('migrateVersions — frozen §7 mapping', () => {
  it('maps the legacy three fields and nothing else', () => {
    const migrated = migrateVersions({ bafDsh: '0.0.11', dsh: '0.1.5-alpha.1', bafPlugin: '0.0.9' })
    expect(migrated).toEqual({
      schema: 2,
      harness: { desktop: '0.0.11', dsh: '0.1.5-alpha.1', runtime: UNKNOWN_VERSION },
      plugin: { baf: '0.0.9', presetSchema: 0 },
      baseline: {
        id: UNKNOWN_VERSION,
        version: UNKNOWN_VERSION,
        openspec: UNKNOWN_VERSION,
        matt: UNKNOWN_VERSION,
        stack: UNKNOWN_VERSION,
      },
    })
  })

  it('never guesses bafPlugin into baseline or tool versions', () => {
    const migrated = migrateVersions(parseVersions({ bafPlugin: '9.9.9' }))
    expect(migrated.plugin.baf).toBe('9.9.9')
    // No baseline field may inherit the plugin's version.
    expect(new Set(Object.values(migrated.baseline))).toEqual(new Set([UNKNOWN_VERSION]))
  })
})

describe('parseInstalledVersions — strict schema 2', () => {
  it('accepts a well-formed file', () => {
    const parsed = parseInstalledVersions(loadInstalledVersionsFromSeed())
    expect(parsed?.schema).toBe(2)
  })

  it('rejects missing fields, wrong schema, and bad types', () => {
    const good = loadInstalledVersionsFromSeed()
    expect(parseInstalledVersions({ ...good, schema: 1 })).toBeUndefined()
    expect(parseInstalledVersions({ ...good, harness: { desktop: '0.0.1', dsh: '0.1.0' } })).toBeUndefined()
    expect(parseInstalledVersions({ ...good, plugin: { ...good.plugin, presetSchema: '0' } })).toBeUndefined()
    expect(parseInstalledVersions({ ...good, baseline: { ...good.baseline, id: 7 } })).toBeUndefined()
    expect(parseInstalledVersions(null)).toBeUndefined()
  })
})

/** Fresh schema-2 shape from the loader (seed path) for reuse in parse tests. */
function loadInstalledVersionsFromSeed() {
  const dir = tempDir()
  try {
    return loadInstalledVersions(dir, SEED)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('loadInstalledVersions — disk migration', () => {
  it('migrates a legacy flat file once, keeps a backup, and is idempotent', () => {
    const dir = tempDir()
    try {
      const legacy = { bafDsh: '0.0.11', dsh: '0.1.5-alpha.1', bafPlugin: '0.0.9', bafCore: '0.1.3-alpha.1' }
      writeFileSync(versionsPath(dir), JSON.stringify(legacy), 'utf8')
      const first = loadInstalledVersions(dir, SEED)
      // Seed authority: desktop/dsh from the running binary; plugin persisted.
      expect(first.harness).toEqual({ desktop: '0.0.23', dsh: '0.1.9', runtime: UNKNOWN_VERSION })
      expect(first.plugin.baf).toBe('0.0.9')
      // The file is now schema 2 on disk, and the legacy bytes are preserved.
      const onDisk = JSON.parse(readFileSync(versionsPath(dir), 'utf8')) as Record<string, unknown>
      expect(onDisk.schema).toBe(2)
      expect(onDisk.bafPlugin).toBeUndefined()
      expect(existsSync(join(dir, 'versions.legacy.bak'))).toBe(true)
      expect(JSON.parse(readFileSync(join(dir, 'versions.legacy.bak'), 'utf8'))).toEqual(legacy)
      // Idempotent: re-reading yields the same shape without re-backing-up.
      const second = loadInstalledVersions(dir, SEED)
      expect(second).toEqual(first)
      // And the schema-2 round trip survives a strict re-parse.
      expect(parseInstalledVersions(second)?.plugin.baf).toBe('0.0.9')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('seeds a missing file with schema 2', () => {
    const dir = tempDir()
    try {
      const installed = loadInstalledVersions(dir, SEED)
      expect(installed.harness.desktop).toBe('0.0.23')
      const onDisk = JSON.parse(readFileSync(versionsPath(dir), 'utf8')) as Record<string, unknown>
      expect(onDisk.schema).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('leaves a corrupt file on disk and returns the seed shape unsaved', () => {
    const dir = tempDir()
    try {
      writeFileSync(versionsPath(dir), '{not json', 'utf8')
      const installed = loadInstalledVersions(dir, SEED)
      expect(installed.harness.desktop).toBe('0.0.23')
      // Evidence preserved: the corrupt bytes are untouched.
      expect(readFileSync(versionsPath(dir), 'utf8')).toBe('{not json')
      expect(existsSync(join(dir, 'versions.legacy.bak'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('flat adapter keeps the embed-override policy across the migration', () => {
    const dir = tempDir()
    try {
      writeFileSync(versionsPath(dir), JSON.stringify({
        bafDsh: '0.0.11',
        dsh: '0.0.1-ancient',
        bafPlugin: '0.0.9',
        bafCore: '0.1.3-alpha.1',
      }), 'utf8')
      const flat = loadVersions(dir, SEED)
      expect(flat.bafDsh).toBe('0.0.23')
      expect(flat.dsh).toBe('0.1.9')
      expect(flat.bafPlugin).toBe('0.0.9')
      expect(flat.bafCore).toBe(SEED.bafCore)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('saveVersions — schema-2 merge keeps probe-owned scopes', () => {
  it('preserves runtime/presetSchema/baseline across a plugin-channel save', () => {
    const dir = tempDir()
    try {
      loadInstalledVersions(dir, SEED)
      // A probe wrote runtime + baseline identity after first launch.
      const probed = loadInstalledVersions(dir, SEED)
      saveInstalledVersions(dir, {
        ...probed,
        harness: { ...probed.harness, runtime: 'node-22.11.0' },
        baseline: { ...probed.baseline, id: 'std-c', version: '2026.10' },
      })
      // A later plugin-channel flat save must not clobber the probe-owned scopes.
      saveVersions(dir, { ...SEED, bafPlugin: '0.0.11' })
      const after = loadInstalledVersions(dir, SEED)
      expect(after.plugin.baf).toBe('0.0.11')
      expect(after.harness.runtime).toBe('node-22.11.0')
      expect(after.baseline.id).toBe('std-c')
      expect(after.baseline.version).toBe('2026.10')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
