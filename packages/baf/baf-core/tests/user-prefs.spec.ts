/**
 * User prefs + override policy merge (settings A/B layering).
 */
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadBaselineFile } from '../src/baseline.ts'
import {
  applyUserPrefsToBaseline,
  DEFAULT_USER_OVERRIDE_POLICY,
  editablePrefIds,
  effectiveExtraPrefs,
  loadUserPrefsFile,
  parseUserPrefs,
  resolveUserOverridePolicy,
  writeUserPrefsFile,
} from '../src/user-prefs.ts'

const FIXTURE = join(import.meta.dirname, 'fixtures', 'baseline', 'baseline.yml')

describe('user-prefs merge', () => {
  it('defaults override policy when baseline omits userOverridePolicy', async () => {
    const baseline = await loadBaselineFile(FIXTURE)
    expect(baseline.userOverridePolicy).toBeUndefined()
    expect(resolveUserOverridePolicy(baseline)).toEqual(DEFAULT_USER_OVERRIDE_POLICY)
    expect(editablePrefIds(resolveUserOverridePolicy(baseline))).toEqual([
      'bugFixPathAllowed',
      'bugFixPathMaxScope',
      'coverageMinimum',
      'projectionGitignore',
      'verifyNotes',
      'changeSlugPrefix',
    ])
  })

  it('applies only allowed overrides onto the baseline', async () => {
    const baseline = await loadBaselineFile(FIXTURE)
    const prefs = parseUserPrefs({
      schema: 1,
      bugFixPath: { allowed: false, maxScope: 'single-file' },
      coverage: { minimum: 72 },
    })
    const locked = {
      ...DEFAULT_USER_OVERRIDE_POLICY,
      bugFixPathAllowed: false,
      coverageMinimum: true,
    }
    const effective = applyUserPrefsToBaseline(baseline, prefs, locked)
    expect(effective.workflow.bugFixPath.allowed).toBe(true)
    expect(effective.workflow.bugFixPath.maxScope).toBe('single-file')
    expect(effective.stack.coverage.minimum).toBe(72)
    expect(baseline.workflow.bugFixPath.allowed).toBe(true)
    expect(baseline.stack.coverage.minimum).toBe('project-config')
  })

  it('filters extras by policy', () => {
    const prefs = parseUserPrefs({
      schema: 1,
      projectionGitignore: true,
      verifyNotes: 'pnpm test',
      changeSlugPrefix: 'feat',
    })
    expect(effectiveExtraPrefs(prefs, {
      ...DEFAULT_USER_OVERRIDE_POLICY,
      verifyNotes: false,
    })).toEqual({
      projectionGitignore: true,
      changeSlugPrefix: 'feat',
    })
  })

  it('round-trips user-prefs file IO', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-prefs-'))
    await mkdir(join(root, '.baf'), { recursive: true })
    expect(await loadUserPrefsFile(root)).toEqual({ schema: 1 })
    await writeUserPrefsFile(root, {
      schema: 1,
      bugFixPath: { allowed: false },
      changeSlugPrefix: 'fix',
    })
    const loaded = await loadUserPrefsFile(root)
    expect(loaded.bugFixPath?.allowed).toBe(false)
    expect(loaded.changeSlugPrefix).toBe('fix')
  })

  it('rejects invalid changeSlugPrefix', () => {
    expect(() => parseUserPrefs({ schema: 1, changeSlugPrefix: 'Bad Prefix' })).toThrow()
  })

  it('writes a valid yaml the loader accepts after a hand edit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-prefs-yaml-'))
    await mkdir(join(root, '.baf'), { recursive: true })
    await writeFile(join(root, '.baf', 'user-prefs.yml'), `schema: 1
bugFixPath:
  allowed: false
  maxScope: cross-module
coverage:
  minimum: 60
projectionGitignore: true
verifyNotes: make check
changeSlugPrefix: hotfix
`, 'utf8')
    const prefs = await loadUserPrefsFile(root)
    const baseline = await loadBaselineFile(FIXTURE)
    const effective = applyUserPrefsToBaseline(baseline, prefs)
    expect(effective.workflow.bugFixPath.allowed).toBe(false)
    expect(effective.workflow.bugFixPath.maxScope).toBe('cross-module')
    expect(effective.stack.coverage.minimum).toBe(60)
  })
})
