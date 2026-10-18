/**
 * 【变更】2026-10-18 (项目工程 1.3): the surgical `guard.protectedPaths` editor
 * the 设置→工作流→项目工程 tab persists through — validation vocabulary and
 * the comment-preserving rewrite (inline ↔ block, empty list, CRLF, the
 * guard-block ownership refusals) plus a parse roundtrip of the result.
 * 【变更】2026-10-19 (六问题批 4.1b): the same discipline for the 状态脚本
 * map (`hooks.nodes.<node>.enter/exit`) — validate, then rewrite/append/remove
 * ONLY the top-level `hooks:` block.
 */

import { load as loadYaml } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import {
  BAF_VERSION, BafError, parseBaselineManifest, rewriteBaselineNodeHooks,
  rewriteBaselineProtectedPaths, validateNodeHooks, validateProtectedPaths,
} from '../src/index.ts'

/** A schema-valid baseline whose guard block carries an INLINE list. */
const INLINE_BASELINE = `schema: 1
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
  protectedPaths: [config/secrets.env]
  requireHumanConfirmation: [scaffold, archive, abandon]
`

describe('validateProtectedPaths (UI 提案 → 规范清单)', () => {
  it('normalizes separators / ./ / trailing slashes and dedupes after normalization', () => {
    expect(validateProtectedPaths(['.\\docs\\', 'docs', './src/gen', 'src/gen/**'])).toEqual({
      ok: true,
      paths: ['docs', 'src/gen', 'src/gen/**'],
    })
  })

  it('rejects empty / absolute / traversal / misplaced-wildcard / built-in entries', () => {
    const cases: readonly string[] = [
      '', '   ', 'C:/abs', '/abs', 'a/../b', 'a/**/b', 'a/**/**', '.git', '.git/**', '.baf', '.baf/**',
    ]
    for (const entry of cases) {
      expect(validateProtectedPaths([entry]).ok).toBe(false)
    }
    // A lone separator normalizes to nothing — the empty-after-normalize arm.
    expect(validateProtectedPaths(['/'])).toMatchObject({ ok: false })
    // A non-string (runtime caller) is refused, never stringified.
    expect(validateProtectedPaths([undefined as unknown as string]).ok).toBe(false)
  })

  it('keeps a whole-subtree suffix and quotes the offending entry in every message', () => {
    const verdict = validateProtectedPaths(['a/**/b'])
    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.message).toContain('a/**/b')
    expect(validateProtectedPaths(['docs/**']).ok).toBe(true)
  })
})

describe('rewriteBaselineProtectedPaths (comment-preserving surgical rewrite)', () => {
  it('rewrites an inline list into a block list and keeps every other byte', () => {
    const out = rewriteBaselineProtectedPaths(INLINE_BASELINE, ['docs', 'src/gen/**'])
    expect(out).toContain('  protectedPaths:\n    - docs\n    - src/gen/**\n')
    // The sibling guard keys and the surrounding sections stay untouched.
    expect(out).toContain('  secretScan: required\n')
    expect(out).toContain('  requireHumanConfirmation: [scaffold, archive, abandon]\n')
    expect(out.startsWith('schema: 1\n')).toBe(true)
    // Roundtrip: the rewritten document still parses to the new list.
    const manifest = parseBaselineManifest(loadYaml(out), BAF_VERSION)
    expect([...manifest.guard.protectedPaths]).toEqual(['docs', 'src/gen/**'])
  })

  it('replaces a block list (inner comments and inner blanks go with it; outer text stays)', () => {
    const block = INLINE_BASELINE.replace(
      '  protectedPaths: [config/secrets.env]\n',
      '  protectedPaths:\n    # 客户注释（列表内部，随列表一起换掉）\n    - config/secrets.env\n\n    - legacy/dir\n'
        + '    # deeper note\n  # at-key-indent note (外层注释，保留)\n',
    )
    const out = rewriteBaselineProtectedPaths(block, ['docs'])
    expect(out).toContain('  protectedPaths:\n    - docs\n')
    expect(out).not.toContain('config/secrets.env')
    expect(out).not.toContain('客户注释')
    expect(out).not.toContain('deeper note')
    expect(out).not.toContain('legacy/dir')
    // The at-key-indent comment and the blank that only separates the list from
    // the next sibling key survive verbatim.
    expect(out).toContain('  # at-key-indent note (外层注释，保留)')
    expect(out).toContain('  requireHumanConfirmation: [scaffold, archive, abandon]')
    expect(parseBaselineManifest(loadYaml(out), BAF_VERSION).guard.protectedPaths).toEqual(['docs'])
  })

  it('writes an empty list inline as [] and still parses', () => {
    const out = rewriteBaselineProtectedPaths(INLINE_BASELINE, [])
    expect(out).toContain('  protectedPaths: []\n')
    expect(parseBaselineManifest(loadYaml(out), BAF_VERSION).guard.protectedPaths).toEqual([])
  })

  it('preserves CRLF terminators inside the replaced section (Windows-authored baselines)', () => {
    const crlf = INLINE_BASELINE.replace(/\n/g, '\r\n')
    const out = rewriteBaselineProtectedPaths(crlf, ['docs'])
    expect(out).toContain('  protectedPaths:\r\n    - docs\r\n')
    // No bare-LF lines sneak into a CRLF document.
    expect(out.includes('\n')).toBe(true)
    expect(out.split(/\r\n/).some(line => line === '')).toBe(true)
    expect([...out.matchAll(/(?<!\r)\n/g)]).toHaveLength(0)
  })

  it('refuses a document without a guard: block or without the protectedPaths key', () => {
    expect(() => rewriteBaselineProtectedPaths('', ['docs'])).toThrow(BafError)
    const noGuard = INLINE_BASELINE.replace(/guard:\n(?:  .*\n)+/, '')
    expect(() => rewriteBaselineProtectedPaths(noGuard, ['docs'])).toThrow(BafError)
    const noKey = INLINE_BASELINE.replace('  protectedPaths: [config/secrets.env]\n', '')
    try {
      rewriteBaselineProtectedPaths(noKey, ['docs'])
      expect.unreachable('guard block without protectedPaths must throw')
    } catch (error) {
      expect(error).toBeInstanceOf(BafError)
      expect((error as BafError).code).toBe('baseline_unavailable')
    }
    try {
      rewriteBaselineProtectedPaths(noGuard, ['docs'])
      expect.unreachable('missing guard block must throw')
    } catch (error) {
      expect((error as BafError).code).toBe('baseline_unavailable')
    }
  })

  it('tolerates a guard block whose protectedPaths key sits behind sibling keys', () => {
    const reordered = INLINE_BASELINE.replace(
      'guard:\n  secretScan: required\n  protectedPaths: [config/secrets.env]\n'
        + '  requireHumanConfirmation: [scaffold, archive, abandon]\n',
      'guard:\n  requireHumanConfirmation: [scaffold, archive, abandon]\n  secretScan: required\n'
        + '  protectedPaths: [config/secrets.env]\n',
    )
    const out = rewriteBaselineProtectedPaths(reordered, ['docs'])
    expect(out).toContain('  secretScan: required\n  protectedPaths:\n    - docs\n')
    expect(parseBaselineManifest(loadYaml(out), BAF_VERSION).guard.protectedPaths).toEqual(['docs'])
  })
})

/** A baseline that already carries a hooks block mid-document. */
const WITH_HOOKS = INLINE_BASELINE
  + 'hooks:\n  nodes:\n    implement:\n      exit:\n        - scripts/build.sh\n'

describe('validateNodeHooks (状态脚本 提案 → 规范清单)', () => {
  it('normalizes separators, dedupes per list, and drops empty lists/nodes', () => {
    const verdict = validateNodeHooks({
      implement: { exit: ['scripts\\build.sh', 'scripts/build.sh', './lint.ps1'] },
      open: { enter: [], exit: undefined },
    })
    expect(verdict).toEqual({
      ok: true,
      hooks: { implement: { exit: ['scripts/build.sh', 'lint.ps1'] } },
    })
  })

  it('rejects unknown nodes and bad entries with the offending text quoted', () => {
    expect(validateNodeHooks({ midstream: { enter: ['a.sh'] } })).toMatchObject({
      ok: false, message: '未知的工作流节点：midstream',
    })
    for (const entry of ['', 'C:/abs.ps1', '/abs.sh', 'a/../b.mjs', 'scripts/*.sh']) {
      const verdict = validateNodeHooks({ verify: { enter: [entry] } })
      expect(verdict.ok).toBe(false)
      expect(verdict.ok === false && verdict.message).toContain(entry === '' ? '不能为空' : entry)
    }
    // drift is a workflow node — configuring it is legal vocabulary even
    // though the engine never fires hooks on the parking lot.
    expect(validateNodeHooks({ drift: { enter: ['d.sh'] } }).ok).toBe(true)
  })
})

describe('rewriteBaselineNodeHooks (surgical hooks block rewrite)', () => {
  it('appends a new block at EOF when absent and the map is non-empty', () => {
    const out = rewriteBaselineNodeHooks(INLINE_BASELINE, {
      implement: { exit: ['scripts/build.sh', 'scripts/lint.ps1'] },
    })
    expect(out.endsWith('hooks:\n  nodes:\n    implement:\n      exit:\n        - scripts/build.sh\n        - scripts/lint.ps1\n')).toBe(true)
    // The rest of the document is untouched.
    expect(out.startsWith(INLINE_BASELINE)).toBe(true)
    // Roundtrip: the manifest parses back to exactly the written map.
    const manifest = parseBaselineManifest(loadYaml(out), BAF_VERSION)
    expect(manifest.hooks?.nodes.implement).toEqual({ exit: ['scripts/build.sh', 'scripts/lint.ps1'] })
  })

  it('returns an untouched document when the map is empty and no block exists', () => {
    expect(rewriteBaselineNodeHooks(INLINE_BASELINE, {})).toBe(INLINE_BASELINE)
  })

  it('replaces an existing block in place; surrounding sections stay byte-identical', () => {
    const out = rewriteBaselineNodeHooks(WITH_HOOKS, { verify: { enter: ['scripts/enter-verify.mjs'] } })
    expect(out).toContain('hooks:\n  nodes:\n    verify:\n      enter:\n        - scripts/enter-verify.mjs\n')
    // The old node is gone from the hooks block (routeProfile's phases still
    // mention implement — different section, untouched).
    const hooksSection = out.slice(out.indexOf('hooks:'))
    expect(hooksSection).not.toContain('implement')
    expect(out).not.toContain('scripts/build.sh')
    expect(out.endsWith('hooks:\n  nodes:\n    verify:\n      enter:\n        - scripts/enter-verify.mjs\n')).toBe(true)
    expect(parseBaselineManifest(loadYaml(out), BAF_VERSION).hooks?.nodes.verify)
      .toEqual({ enter: ['scripts/enter-verify.mjs'] })
  })

  it('removes the whole block when the map goes empty', () => {
    const out = rewriteBaselineNodeHooks(WITH_HOOKS, {})
    expect(out).not.toContain('hooks:')
    expect(out).toBe(INLINE_BASELINE)
    expect(parseBaselineManifest(loadYaml(out), BAF_VERSION).hooks).toBeUndefined()
  })

  it('renders a both-lists-empty node as an inline {} (defensive shape)', () => {
    const out = rewriteBaselineNodeHooks(INLINE_BASELINE, { open: {} })
    expect(out).toContain('hooks:\n  nodes:\n    open: {}\n')
  })

  it('keeps CRLF terminators when replacing an existing CRLF block', () => {
    const crlf = WITH_HOOKS.replace(/\n/g, '\r\n')
    const out = rewriteBaselineNodeHooks(crlf, { open: { enter: ['a.sh'] } })
    expect(out).toContain('hooks:\r\n  nodes:\r\n    open:\r\n      enter:\r\n        - a.sh\r\n')
    expect([...out.matchAll(/(?<!\r)\n/g)]).toHaveLength(0)
  })
})
