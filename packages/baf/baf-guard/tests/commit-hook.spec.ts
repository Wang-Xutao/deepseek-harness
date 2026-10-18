/**
 * 【变更】2026-10-18 (项目工程 1.3, 客户决策: git 提交时再校验禁改路径): the
 * commit 防线 — shim ownership (`isManagedShim`, whose marker rides line 2
 * behind the shebang), the dependency-free baseline line-scan, staged-file
 * membership, install/preserve/idempotence in real tmp workspaces, the
 * generated checker run against a REAL git repository, and the policy-side
 * `git commit --no-verify` denial.
 */

import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  HOOK_MARKER, checkerScript, commitGuardHookInstalled, installCommitGuardHook,
  isManagedShim, parseHookProtectedPaths, shimScript, stagedViolations,
} from '../src/commit-hook.ts'
import { adjudicateShell, type GuardPolicyConfig, type GuardWorkflowState } from '../src/policy.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
})

describe('parseHookProtectedPaths (dependency-free baseline line scan)', () => {
  it('reads block lists and inline lists, skipping the enterprise placeholder', () => {
    expect(parseHookProtectedPaths('guard:\n  secretScan: required\n  protectedPaths:\n    - docs\n    - src/gen/**\n'))
      .toEqual(['docs', 'src/gen/**'])
    expect(parseHookProtectedPaths('guard:\n  protectedPaths: ["docs", \'src/x\']\n'))
      .toEqual(['docs', 'src/x'])
    expect(parseHookProtectedPaths('guard:\n  protectedPaths: [docs, <enterprise-tbd>]\n'))
      .toEqual(['docs'])
    expect(parseHookProtectedPaths('guard:\n  protectedPaths: []\n')).toEqual([])
  })

  it('answers an empty list for anything it cannot locate (fail-open by design)', () => {
    expect(parseHookProtectedPaths('stack:\n  language: c\n')).toEqual([])
    expect(parseHookProtectedPaths('guard:\n  secretScan: required\n')).toEqual([])
    // A deeper key (routeProfile:) between guard: and the next top-level block
    // must not be mistaken for the guard body once indentation resets.
    expect(parseHookProtectedPaths('guard:\n  secretScan: required\nstack:\n  language: c\n'))
      .toEqual([])
    // Quoted inline values are unquoted; whitespace-only entries drop out.
    expect(parseHookProtectedPaths('guard:\n  protectedPaths: [ , docs , ]\n')).toEqual(['docs'])
  })
})

describe('stagedViolations (staged file ↔ entry membership)', () => {
  it('flags files under an entry or dir/** and normalizes separators', () => {
    const paths = ['docs', 'src/gen/**']
    expect(stagedViolations(['docs/a.md', 'docs', 'src/gen/x/y.c', 'src/gen', 'src/other.c'], paths))
      .toEqual(['docs/a.md', 'docs', 'src/gen/x/y.c', 'src/gen'])
    expect(stagedViolations(['src\\gen\\y.c'], paths)).toEqual(['src/gen/y.c'])
    expect(stagedViolations(['docsx/a.md'], paths)).toEqual([])
    expect(stagedViolations(['docs/a.md'], ['<enterprise-tbd>'])).toEqual([])
  })
})

describe('isManagedShim (marker rides line 2 behind the shebang)', () => {
  it('owns its own shim output but not a customer hook or empty file', () => {
    expect(isManagedShim(shimScript())).toBe(true)
    expect(isManagedShim('#!/bin/sh\necho custom\n')).toBe(false)
    expect(isManagedShim('')).toBe(false)
    // A managed shim regenerated with a shebang variant still counts: any of
    // the first three lines may carry the marker.
    expect(isManagedShim(`#!/usr/bin/env sh\n# noise\n${HOOK_MARKER} — do not edit;\n`)).toBe(true)
  })
})

describe('installCommitGuardHook (real tmp workspaces)', () => {
  /** A tmp workspace shaped like a git repository (`.git/hooks` present). */
  async function repo(initialUserHook?: string): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'baf-commit-hook-'))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    await mkdir(join(root, '.git', 'hooks'), { recursive: true })
    await mkdir(join(root, '.baf'), { recursive: true })
    if (initialUserHook !== undefined) {
      await writeFile(join(root, '.git', 'hooks', 'pre-commit'), initialUserHook, 'utf8')
    }
    return root
  }

  it('installs checker + shim and reports installed afterwards', async () => {
    const root = await repo()
    expect(await commitGuardHookInstalled(root)).toBe(false)
    const result = await installCommitGuardHook(root)
    expect(result).toEqual({ ok: true })
    expect(await commitGuardHookInstalled(root)).toBe(true)
    const checker = await readFile(join(root, '.baf', 'hooks', 'pre-commit-check.cjs'), 'utf8')
    expect(checker).toContain(HOOK_MARKER)
    const shim = await readFile(join(root, '.git', 'hooks', 'pre-commit'), 'utf8')
    expect(shim).toContain('node "$root/.baf/hooks/pre-commit-check.cjs"')
    // The shim itself is a managed one (the ownership round-trip).
    expect(isManagedShim(shim)).toBe(true)
  })

  it('preserves a customer hook as pre-commit.user and chains it', async () => {
    const root = await repo('#!/bin/sh\necho customer-lint\n')
    expect(await installCommitGuardHook(root)).toEqual({ ok: true })
    const preserved = await readFile(join(root, '.git', 'hooks', 'pre-commit.user'), 'utf8')
    expect(preserved).toContain('customer-lint')
    const shim = await readFile(join(root, '.git', 'hooks', 'pre-commit'), 'utf8')
    expect(shim).toContain('sh "$user"')
  })

  it('is idempotent: reinstalling over our shim never moves anything aside', async () => {
    const root = await repo()
    await installCommitGuardHook(root)
    await installCommitGuardHook(root)
    expect(await readFile(join(root, '.git', 'hooks', 'pre-commit'), 'utf8')).toContain(HOOK_MARKER)
    // No preserved user hook appeared — there was no user hook to preserve.
    await expect(readFile(join(root, '.git', 'hooks', 'pre-commit.user'), 'utf8')).rejects.toThrow()
  })

  it('keeps the FIRST preserved user hook when the shim is later replaced by hand', async () => {
    const root = await repo('#!/bin/sh\necho customer-lint\n')
    await installCommitGuardHook(root)
    // A hand-replaced shim (e.g. another tool overwrote pre-commit) must not
    // clobber the already-preserved original on reinstall.
    await writeFile(join(root, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho foreign\n', 'utf8')
    await installCommitGuardHook(root)
    const preserved = await readFile(join(root, '.git', 'hooks', 'pre-commit.user'), 'utf8')
    expect(preserved).toContain('customer-lint')
    expect(preserved).not.toContain('foreign')
  })

  it('reports a message instead of throwing when the workspace refuses the install', async () => {
    // No `.git` directory at all: the shim write fails (ENOENT) — ok:false.
    const root = await mkdtemp(join(tmpdir(), 'baf-commit-hook-bare-'))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const result = await installCommitGuardHook(root)
    expect(result.ok).toBe(false)
    expect(result.message).toBeTruthy()
  })
})

describe('generated checker against a REAL git repository', () => {
  /** A real git repo with a baseline + staged files; runs the generated .cjs. */
  async function stagedRepo(baselineGuard: string, files: readonly string[]): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'baf-commit-e2e-'))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const run = (cmd: string, args: readonly string[]) => {
      const answer = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' })
      expect(answer.status).toBe(0)
    }
    run('git', ['init'])
    await mkdir(join(root, '.baf'), { recursive: true })
    await writeFile(join(root, '.baf', 'baseline.yml'), `schema: 1\nbaselineId: b\n${baselineGuard}\n`, 'utf8')
    await installCommitGuardHook(root)
    for (const file of files) {
      await mkdir(join(root, file, '..'), { recursive: true })
      await writeFile(join(root, file), 'content\n', 'utf8')
      run('git', ['add', file])
    }
    return root
  }

  const runChecker = (root: string) => spawnSync(
    process.execPath, [join(root, '.baf', 'hooks', 'pre-commit-check.cjs')], { cwd: root, encoding: 'utf8' },
  )

  it('REJECTS a commit whose staged files touch a protected entry (exit 1 + 提示)', async () => {
    const root = await stagedRepo(
      'guard:\n  protectedPaths:\n    - docs\n    - src/gen/**\n',
      ['docs/plan.md', 'src/other.c'],
    )
    const answer = runChecker(root)
    expect(answer.status).toBe(1)
    expect(answer.stderr).toContain('提交被拒绝')
    expect(answer.stderr).toContain('docs/plan.md')
    expect(answer.stderr).not.toContain('src/other.c')
    // The generated copy names the human escape (仓库所有者在自己终端确认).
    expect(checkerScript()).toContain('仓库所有者')
  })

  it('passes a clean staging set, an empty list, and a missing baseline (fail-open)', async () => {
    const clean = await stagedRepo(
      'guard:\n  protectedPaths:\n    - docs\n', ['src/other.c'],
    )
    expect(runChecker(clean).status).toBe(0)

    const empty = await stagedRepo('guard:\n  protectedPaths: []\n', ['docs/plan.md'])
    expect(runChecker(empty).status).toBe(0)

    const none = await stagedRepo('guard:\n  secretScan: required\n', ['docs/plan.md'])
    expect(runChecker(none).status).toBe(0)
  })
})

describe('policy: git commit --no-verify (the model loses the escape)', () => {
  const withProtected: GuardPolicyConfig = { secretScan: 'required', protectedPaths: ['docs'] }
  const withoutProtected: GuardPolicyConfig = { secretScan: 'required', protectedPaths: [] }
  const state: GuardWorkflowState = {
    active: false, intakeConfirmed: false, allowlist: [],
  }

  it('denies --no-verify and bare -n for the model while protected paths exist', () => {
    for (const command of ['git commit --no-verify', 'git commit --no-verify=hooks', 'git commit -n -m x']) {
      const verdict = adjudicateShell(withProtected, state, command)
      expect(verdict).toMatchObject({ allowed: false, reasonCode: 'protected_path' })
    }
  })

  it('keeps plain commits and push --dry-run legal, and the whole rule dormant without protected paths', () => {
    expect(adjudicateShell(withProtected, state, 'git commit -m "x"').allowed).toBe(true)
    // `git push -n` is --dry-run, a different flag that never skipped hooks.
    expect(adjudicateShell(withProtected, state, 'git push -n origin main').allowed).toBe(true)
    // No protected paths configured → the escape hatch stays open (old surface).
    expect(adjudicateShell(withoutProtected, state, 'git commit --no-verify').allowed).toBe(true)
  })
})
