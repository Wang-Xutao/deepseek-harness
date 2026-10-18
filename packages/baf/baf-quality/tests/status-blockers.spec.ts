/**
 * Status blockers (方案乙) — baseline / clang-format / reports.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectStatusBlockers } from '../src/status-blockers.ts'

const workspaces: string[] = []

afterEach(() => {
  for (const root of workspaces.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function tempWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'baf-blockers-'))
  workspaces.push(root)
  return root
}

describe('collectStatusBlockers', () => {
  it('errors when baseline is missing', () => {
    const root = tempWorkspace()
    const report = collectStatusBlockers({ workspaceRoot: root, whichFn: () => '' })
    expect(report.ok).toBe(false)
    expect(report.blockers.some(row => row.id === 'baseline.missing')).toBe(true)
  })

  it('warns when clang-format config is missing but baseline exists', () => {
    const root = tempWorkspace()
    mkdirSync(join(root, '.baf'), { recursive: true })
    writeFileSync(join(root, '.baf', 'baseline.yml'), 'schema: 1\n', 'utf8')
    const report = collectStatusBlockers({ workspaceRoot: root, whichFn: () => '' })
    expect(report.blockers.some(row => row.id === 'clang-format.config_missing')).toBe(true)
    expect(report.blockers.some(row => row.id === 'baseline.missing')).toBe(false)
  })

  it('errors when ut-coverage.json reports failure', () => {
    const root = tempWorkspace()
    mkdirSync(join(root, '.baf', 'reports'), { recursive: true })
    writeFileSync(join(root, '.baf', 'baseline.yml'), 'schema: 1\n', 'utf8')
    writeFileSync(join(root, '.clang-format'), 'BasedOnStyle: LLVM\n', 'utf8')
    writeFileSync(join(root, 'commitlint.config.cjs'), 'module.exports = {}\n', 'utf8')
    writeFileSync(
      join(root, '.baf', 'reports', 'ut-coverage.json'),
      JSON.stringify({ passed: false, line: 40, minimum: 80 }),
      'utf8',
    )
    const report = collectStatusBlockers({
      workspaceRoot: root,
      whichFn: () => '/usr/bin/clang-format',
    })
    expect(report.ok).toBe(false)
    expect(report.blockers.some(row => row.id === 'ut.coverage_failed')).toBe(true)
  })
})
