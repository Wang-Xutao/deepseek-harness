/**
 * 【变更】2026-10-18 (项目工程 1.3, 客户决策: 任何 AI agent 都不得修改管控
 * *文件夹): the preset-independent protected-paths ToolGuard every agent
 * carries — fs write/edit denials under a baseline entry or a built-in system
 * resource, shell mutation-shaped commands that reference a protected path,
 * and the `git commit --no-verify` denial — while standard-mode agents keep
 * their full shell surface for everything else.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { createProtectedPathsGuard } from '../src/global-guard.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
})

/** A schema-valid baseline whose guard.protectedPaths the test varies. */
function baseline(protectedPaths: string): string {
  return `schema: 1
baselineId: spec-baseline
bafCompatibility:
  min: 0.0.0
  max: 999.0.0
workflow:
  default: go
  requireOpenSpec: true
  bugFixPath:
    allowed: true
    maxScope: small-local
    requireRegressionTest: true
routeProfile:
  default: { provider: p1, model: m1 }
  allowed:
    - { provider: p1, model: m1, capabilities: [coding], fallbackGroup: g1 }
  phases:
    intake: { provider: p1, model: m1 }
    open: { provider: p1, model: m1 }
    clarify: { provider: p1, model: m1 }
    design: { provider: p1, model: m1 }
    plan: { provider: p1, model: m1 }
    implement: { provider: p1, model: m1 }
    verify: { provider: p1, model: m1 }
    archive: { provider: p1, model: m1 }
  fallbackPolicy:
    mode: approved-only
    groups:
      g1: [{ provider: p1, model: m1 }]
openspec:
  cli: openspec
  version: 0.9.0
  root: openspec
  changeRoot: changes
  validate:
    args: [validate, --strict]
standard:
  mattPocockRulesRef: .baf/standards/default-rules.md
stack:
  language: c
  compiler: clang
  build: make
  test: ctest
  coverage:
    required: true
    minimum: 80
  analyzers: [clang-tidy, cppcheck]
guard:
  secretScan: required
  protectedPaths: ${protectedPaths}
  requireHumanConfirmation: [scaffold, archive, abandon]
`
}

/** A tmp workspace whose baseline guards `docs` (plus the given extras). */
async function workspace(protectedPaths: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'baf-global-guard-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, '.baf'), { recursive: true })
  await writeFile(join(root, '.baf', 'baseline.yml'), baseline(protectedPaths), 'utf8')
  return root
}

function exec(name: string, args: unknown): Readonly<ToolExecution> {
  return { name, arguments: args, callId: 'c1', rootCallId: 'c1', token: 't1' } as never
}

describe('createProtectedPathsGuard (every agent, no preset required)', () => {
  it('denies fs writes and edits under a protected entry, allows everything else', async () => {
    const root = await workspace('[docs, <enterprise-tbd>]')
    const guard = createProtectedPathsGuard({ workspaceRoot: root })
    expect(guard(exec('write', { file_path: join(root, 'docs', 'a.md'), content: 'x' })))
      .toContain('protected_path')
    expect(guard(exec('edit', { file_path: join(root, 'docs', 'sub', 'b.c'), new_string: 'x' })))
      .toContain('protected_path')
    // Unrelated targets stay writable — this light guard fences ONLY the
    // customer-configured paths (no stage/intake policy of its own).
    expect(guard(exec('write', { file_path: join(root, 'src', 'a.c'), content: 'x' }))).toBeUndefined()
    expect(guard(exec('write', { file_path: join(root, '.gitignore'), content: 'x' }))).toBeUndefined()
  })

  it('fences the built-in .git/.baf resources even when the baseline omits them', async () => {
    const root = await workspace('[]')
    const guard = createProtectedPathsGuard({ workspaceRoot: root })
    expect(guard(exec('write', { file_path: join(root, '.git', 'config'), content: 'x' })))
      .toContain('产品内建保护')
    expect(guard(exec('write', { file_path: join(root, '.baf', 'baseline.yml'), content: 'x' })))
      .toContain('产品内建保护')
  })

  it('denies shell mutations that reference a protected path, keeps other shell use open', async () => {
    const root = await workspace('[docs, <enterprise-tbd>, config]')
    const guard = createProtectedPathsGuard({ workspaceRoot: root })
    expect(guard(exec('bash', { command: 'echo x > docs/a.md' }))).toContain('间接修改')
    expect(guard(exec('bash', { command: 'rm -rf config' }))).toContain('间接修改')
    // Mutation-shaped but referencing nothing protected — standard-mode agents
    // keep their full shell surface for ordinary work.
    expect(guard(exec('bash', { command: 'echo x > build/a.log' }))).toBeUndefined()
    expect(guard(exec('bash', { command: 'ls docs && cat docs/a.md' }))).toBeUndefined()
    // A bare `git commit` is fine — only the hook-skipping form is denied.
    expect(guard(exec('bash', { command: 'git commit -m "x"' }))).toBeUndefined()
  })

  it('denies git commit --no-verify only while protected paths are configured', async () => {
    const guarded = createProtectedPathsGuard({ workspaceRoot: await workspace('[docs]') })
    expect(guarded(exec('bash', { command: 'git commit --no-verify -m x' }))).toContain('--no-verify')
    // Placeholder-only (or empty) configuration keeps the escape hatch open.
    const dormant = createProtectedPathsGuard({ workspaceRoot: await workspace('[<enterprise-tbd>]') })
    expect(dormant(exec('bash', { command: 'git commit --no-verify -m x' }))).toBeUndefined()
  })

  it('ignores unrecognized tools and degenerate entries instead of guessing', async () => {
    const root = await workspace('[/]')
    const guard = createProtectedPathsGuard({ workspaceRoot: root })
    // A read tool is not a mutation; a write without a file path is malformed.
    expect(guard(exec('read', { file_path: join(root, 'docs', 'a.md') }))).toBeUndefined()
    expect(guard(exec('write', { content: 'x' }))).toBeUndefined()
    // An entry that normalizes to nothing references nothing (defensive arm).
    expect(guard(exec('bash', { command: 'echo x > build/a.log' }))).toBeUndefined()
  })
})
