/**
 * Enterprise standards apply (方案乙) — pack mapping + idempotent write.
 */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyEnterpriseStandards,
  detectAppliedEnterprisePacks,
  enterpriseAssetsRoot,
  mapAssetToWorkspace,
  planEnterpriseStandards,
} from '../src/apply-enterprise-standards.ts'

const workspaces: string[] = []

afterEach(() => {
  for (const root of workspaces.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function tempWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'baf-enterprise-'))
  workspaces.push(root)
  return root
}

describe('enterprise assets layout', () => {
  it('resolves the shipped assets root with clang-format present', () => {
    const root = enterpriseAssetsRoot()
    expect(existsSync(join(root, 'c', '.clang-format'))).toBe(true)
    expect(existsSync(join(root, 'commitlint', 'commitlint.config.cjs'))).toBe(true)
    expect(existsSync(join(root, 'quality', 'ceedling', 'project.yml'))).toBe(true)
  })

  it('maps asset paths to workspace destinations', () => {
    expect(mapAssetToWorkspace('c/.clang-format')).toBe('.clang-format')
    expect(mapAssetToWorkspace('commitlint/commitlint.config.cjs')).toBe('commitlint.config.cjs')
    expect(mapAssetToWorkspace('constitution/AGENTS.md')).toBe('AGENTS.md')
    expect(mapAssetToWorkspace('quality/static-analysis/CPPLINT.cfg')).toBe('CPPLINT.cfg')
    expect(mapAssetToWorkspace('scripts/status-blockers.cjs')).toBe('.baf/scripts/status-blockers.cjs')
  })
})

describe('applyEnterpriseStandards', () => {
  it('writes the c pack into an empty workspace', () => {
    const root = tempWorkspace()
    const plan = planEnterpriseStandards(['c'])
    expect(plan.length).toBeGreaterThan(0)
    const changes = applyEnterpriseStandards({ workspaceRoot: root, packs: ['c'], pinStack: false })
    expect(changes.created).toContain('.clang-format')
    expect(changes.created).toContain('.baf/standards/high-risk-review-checklist.md')
    expect(changes.stackPinned).toBe(false)
    expect(existsSync(join(root, '.clang-format'))).toBe(true)
    expect(readFileSync(join(root, '.clang-format'), 'utf8')).toContain('BasedOnStyle')
  })

  it('skips identical re-apply and backs up divergent files', () => {
    const root = tempWorkspace()
    applyEnterpriseStandards({ workspaceRoot: root, packs: ['commitlint'], pinStack: false })
    const again = applyEnterpriseStandards({ workspaceRoot: root, packs: ['commitlint'], pinStack: false })
    expect(again.created).toEqual([])
    expect(again.skipped).toContain('commitlint.config.cjs')

    writeFileSync(join(root, 'commitlint.config.cjs'), '// diverged\n', 'utf8')
    const third = applyEnterpriseStandards({
      workspaceRoot: root,
      packs: ['commitlint'],
      pinStack: false,
      at: new Date('2026-10-13T00:00:00.000Z'),
    })
    expect(third.backedUp).toContain('commitlint.config.cjs')
    expect(readFileSync(join(root, 'commitlint.config.cjs'), 'utf8')).toContain('commitlint')
  })

  it('pins baseline.stack when quality pack is applied', () => {
    const root = tempWorkspace()
    mkdirSync(join(root, '.baf'), { recursive: true })
    writeFileSync(join(root, '.baf', 'baseline.yml'), `schema: 1
baselineId: pin-test
stack:
  language: c
  compiler: gcc
  build: <enterprise-tbd>
  test: <enterprise-tbd>
  coverage:
    required: true
    minimum: project-config
  analyzers:
    - <enterprise-tbd>
`, 'utf8')
    const changes = applyEnterpriseStandards({
      workspaceRoot: root,
      packs: ['quality'],
      pinStack: true,
      at: new Date('2026-10-13T01:00:00.000Z'),
    })
    expect(changes.stackPinned).toBe(true)
    expect(changes.created).toContain('project.yml')
    const baseline = readFileSync(join(root, '.baf', 'baseline.yml'), 'utf8')
    expect(baseline).toContain('build: ceedling files:build')
    expect(baseline).toContain('test: ceedling test:all')
    expect(baseline).toContain('- cpplint')
  })
})

describe('detectAppliedEnterprisePacks', () => {
  it('reports c after apply', () => {
    const root = tempWorkspace()
    expect(detectAppliedEnterprisePacks(root)).toEqual([])
    applyEnterpriseStandards({ workspaceRoot: root, packs: ['c'], pinStack: false })
    expect(detectAppliedEnterprisePacks(root)).toContain('c')
  })
})
