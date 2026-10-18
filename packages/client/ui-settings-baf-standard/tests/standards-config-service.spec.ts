/**
 * BAF 工程规范 overview Remote (问题 6 批, 2026-10-06): the pure projections
 * (cards, cwd chain) unit-style, then the mounted Remote over a real tmp
 * workspace — ready / no-workspace / no-baseline / failed / rulesDoc paths.
 * Read-only contract: no method writes anything.
 */
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { loadBaselineFile } from '@deepseek-ai/dsh-baf-core'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BafStandardConfigRemote, projectStandardCards, resolveWorkspaceCwd, type CwdSessionStore,
} from '../src/index.ts'

/** A semantically valid baseline with the product-default rules ref. */
const BASELINE_YAML = `schema: 1
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

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
})

/** A minimal session store double. */
function sessionStore(sessions: Array<{ id: string; cwd?: string }>): CwdSessionStore {
  // Optional props under exactOptionalPropertyTypes: omit the key, don't pass
  // an explicit undefined.
  const list = sessions.map(session => (
    session.cwd === undefined ? { header: {} } : { header: { cwd: session.cwd } }
  ))
  return {
    get: (id) => {
      const found = sessions.find(session => session.id === id)
      if (found === undefined) return undefined
      return found.cwd === undefined ? { header: {} } : { header: { cwd: found.cwd } }
    },
    list: () => list,
  }
}

describe('resolveWorkspaceCwd (session → newest → sandbox root)', () => {
  it('prefers the caller session\'s own cwd', () => {
    const store = sessionStore([{ id: 'a', cwd: '/ws/a' }, { id: 'b', cwd: '/ws/b' }])
    expect(resolveWorkspaceCwd(store, '/root', 'a')).toBe('/ws/a')
  })

  it('falls back to the newest session with a cwd, then the sandbox root', () => {
    const store = sessionStore([{ id: 'a', cwd: '/ws/a' }, { id: 'none' }, { id: 'b', cwd: '/ws/b' }])
    expect(resolveWorkspaceCwd(store, '/root')).toBe('/ws/b')
    expect(resolveWorkspaceCwd(sessionStore([]), '/root')).toBe('/root')
  })

  it('answers undefined when nothing names a workspace', () => {
    expect(resolveWorkspaceCwd(sessionStore([{ id: 'x' }]), undefined)).toBeUndefined()
    expect(resolveWorkspaceCwd(sessionStore([]), '')).toBeUndefined()
  })
})

describe('projectStandardCards (pure projection)', () => {
  it('quotes baseline YAML paths with flattened values, ready availability', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'baf-std-cards-'))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    const path = join(dir, 'baseline.yml')
    await writeFile(path, BASELINE_YAML, 'utf8')
    const manifest = await loadBaselineFile(path)

    const cards = projectStandardCards(manifest)
    expect(cards.map(card => card.id)).toEqual([
      'workflow', 'route', 'openspec', 'standard', 'quality', 'guard',
    ])
    const fields = new Map(cards.flatMap(card => card.fields.map(field => [field.field, field])))
    expect(fields.get('workflow.requireOpenSpec')).toMatchObject({ value: 'true', state: 'ok' })
    expect(fields.get('workflow.bugFixPath.maxScope')).toMatchObject({ value: 'small-local' })
    expect(fields.get('routeProfile.default')).toMatchObject({ value: 'p1 / m1' })
    expect(fields.get('routeProfile.allowed')).toMatchObject({ value: '1' })
    expect(fields.get('openspec.validate.args')).toMatchObject({ value: 'validate --strict' })
    expect(fields.get('stack.coverage.minimum')).toMatchObject({ value: '80' })
    expect(fields.get('stack.analyzers')).toMatchObject({ value: 'clang-tidy, cppcheck' })
    expect(fields.get('guard.requireHumanConfirmation')).toMatchObject({ value: 'scaffold, archive, abandon' })
    expect(fields.get('standard.mattPocockRulesRef')).toMatchObject({
      value: '.baf/standards/default-rules.md', state: 'ok',
    })
    expect(fields.get('standard.availability')).toMatchObject({ value: 'ready', state: 'ok' })
    expect(fields.get('standard.ruleAreas')?.value).toContain('testing-discipline')
  })

  it('marks the enterprise placeholder as 企业待定 + policy_missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'baf-std-tbd-'))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    const path = join(dir, 'baseline.yml')
    await writeFile(path, BASELINE_YAML.replace(
      '.baf/standards/default-rules.md', '<enterprise-tbd>',
    ), 'utf8')
    const cards = projectStandardCards(await loadBaselineFile(path))
    const fields = new Map(cards.flatMap(card => card.fields.map(field => [field.field, field])))
    expect(fields.get('standard.mattPocockRulesRef')).toMatchObject({
      value: '<enterprise-tbd>', state: 'tbd',
    })
    expect(fields.get('standard.availability')).toMatchObject({ value: 'policy_missing', state: 'ok' })
  })
})

describe('BafStandardConfigRemote (mounted)', () => {
  /** A tmp workspace carrying (optional parts of) the BAF skeleton. */
  async function workspace(withBaseline: boolean, withRules: boolean, withGit = false): Promise<{
    cwd: string
    ctx: Context
    remote: BafStandardConfigRemote
  }> {
    const root = await mkdtemp(join(tmpdir(), 'baf-std-ws-'))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const cwd = join(root, 'ws')
    await mkdir(join(cwd, '.baf', 'standards'), { recursive: true })
    if (withGit) await mkdir(join(cwd, '.git', 'hooks'), { recursive: true })
    if (withBaseline) await writeFile(join(cwd, '.baf', 'baseline.yml'), BASELINE_YAML, 'utf8')
    if (withRules) {
      await writeFile(join(cwd, '.baf', 'standards', 'default-rules.md'), '# BAF 工程规范\n\n## testing-discipline 测试纪律\n', 'utf8')
    }
    const ctx = new Context()
    cleanups.push(() => ctx.fiber.dispose())
    ctx.provide('sandboxPolicy', { workspaceRoot: cwd } as never)
    ctx.provide('sessions', sessionStore([]) as never)
    let remote: BafStandardConfigRemote | undefined
    await ctx.plugin({
      inject: ['sessions', 'sandboxPolicy'],
      apply: (scope) => { remote = new BafStandardConfigRemote(scope) },
    })
    return { cwd, ctx, remote: remote! }
  }

  /** A one-off workspace over a custom baseline text (git-shaped on demand). */
  async function customWorkspace(baselineText: string, withGit: boolean): Promise<BafStandardConfigRemote> {
    const root = await mkdtemp(join(tmpdir(), 'baf-std-save-'))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const cwd = join(root, 'ws')
    await mkdir(join(cwd, '.baf', 'standards'), { recursive: true })
    if (withGit) await mkdir(join(cwd, '.git', 'hooks'), { recursive: true })
    await writeFile(join(cwd, '.baf', 'baseline.yml'), baselineText, 'utf8')
    await writeFile(join(cwd, '.baf', 'standards', 'default-rules.md'), '# BAF 工程规范\n', 'utf8')
    const ctx = new Context()
    cleanups.push(() => ctx.fiber.dispose())
    ctx.provide('sandboxPolicy', { workspaceRoot: cwd } as never)
    ctx.provide('sessions', sessionStore([]) as never)
    let remote: BafStandardConfigRemote | undefined
    await ctx.plugin({
      inject: ['sessions', 'sandboxPolicy'],
      apply: (scope) => { remote = new BafStandardConfigRemote(scope) },
    })
    return remote!
  }

  it('projects a scaffolded workspace as ready, cards and all', async () => {
    const { cwd, remote } = await workspace(true, true)
    const summary = await remote.summary()
    expect(summary).toMatchObject({
      status: 'ready',
      cwd,
      baselinePath: join(cwd, '.baf', 'baseline.yml'),
      baselineId: 'spec-baseline',
      standardSourceRef: '.baf/standards/default-rules.md',
      standardAvailability: 'ready',
    })
    expect(summary.cards?.map(card => card.id)).toHaveLength(6)
  })

  it('serves the rules document the ref points at', async () => {
    const { cwd, remote } = await workspace(true, true)
    const doc = await remote.rulesDoc()
    expect(doc).toMatchObject({
      status: 'ready',
      path: join(cwd, '.baf', 'standards', 'default-rules.md'),
    })
    expect(doc.content).toContain('testing-discipline')
  })

  // 【变更】2026-10-07 (九点批 问题 8): the 8 rule areas ride the summary —
  // id + locale titleKey + ANCHORED sourceRef (raw ref while placeholder).
  it('exposes the 8 rule areas with anchored sourceRefs', async () => {
    const { remote } = await workspace(true, true)
    const summary = await remote.summary()
    const areas = summary.standardAreas ?? []
    expect(areas.map(area => area.id)).toEqual([
      'project-charter', 'coding-style', 'interfaces', 'error-handling',
      'logging', 'documentation', 'branch-commit', 'testing-discipline',
    ])
    expect(areas[0]).toEqual({
      id: 'project-charter',
      titleKey: 'baf.standard.area.project-charter',
      sourceRef: '.baf/standards/default-rules.md#project-charter',
    })
    expect(areas[7]?.sourceRef).toBe('.baf/standards/default-rules.md#testing-discipline')
  })

  it('answers no-workspace / no-baseline / failed with distinct statuses', async () => {
    const { remote } = await workspace(false, false)
    // The workspace exists on disk but the sandbox root below names nothing.
    const bare = new Context()
    cleanups.push(() => bare.fiber.dispose())
    bare.provide('sandboxPolicy', { workspaceRoot: '' } as never)
    bare.provide('sessions', sessionStore([]) as never)
    let bareRemote: BafStandardConfigRemote | undefined
    await bare.plugin({
      inject: ['sessions', 'sandboxPolicy'],
      apply: (scope) => { bareRemote = new BafStandardConfigRemote(scope) },
    })
    expect(await bareRemote!.summary()).toEqual({ status: 'no-workspace' })
    expect(await bareRemote!.rulesDoc()).toEqual({ status: 'unavailable', reason: 'no-workspace' })

    const noBaseline = await remote.summary()
    expect(noBaseline).toMatchObject({ status: 'no-baseline' })
    expect(noBaseline.baselinePath).toContain('baseline.yml')

    const dir = await mkdtemp(join(tmpdir(), 'baf-std-bad-'))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    await mkdir(join(dir, '.baf'), { recursive: true })
    await writeFile(join(dir, '.baf', 'baseline.yml'), BASELINE_YAML.replace('default: go', 'default: nogo'), 'utf8')
    const bad = new Context()
    cleanups.push(() => bad.fiber.dispose())
    bad.provide('sandboxPolicy', { workspaceRoot: dir } as never)
    bad.provide('sessions', sessionStore([]) as never)
    let badRemote: BafStandardConfigRemote | undefined
    await bad.plugin({
      inject: ['sessions', 'sandboxPolicy'],
      apply: (scope) => { badRemote = new BafStandardConfigRemote(scope) },
    })
    const failed = await badRemote!.summary()
    expect(failed.status).toBe('failed')
    expect(failed.error).toBeTruthy()
  })

  it('marks the placeholder ref unavailable with policy_missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'baf-std-ph-'))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const cwd = join(root, 'ws')
    await mkdir(join(cwd, '.baf'), { recursive: true })
    await writeFile(join(cwd, '.baf', 'baseline.yml'), BASELINE_YAML.replace(
      '.baf/standards/default-rules.md', '<enterprise-tbd>',
    ), 'utf8')
    const ctx = new Context()
    cleanups.push(() => ctx.fiber.dispose())
    ctx.provide('sandboxPolicy', { workspaceRoot: cwd } as never)
    ctx.provide('sessions', sessionStore([]) as never)
    let remote: BafStandardConfigRemote | undefined
    await ctx.plugin({
      inject: ['sessions', 'sandboxPolicy'],
      apply: (scope) => { remote = new BafStandardConfigRemote(scope) },
    })
    expect(await remote!.rulesDoc()).toEqual({ status: 'unavailable', reason: 'policy_missing' })
    const summary = await remote!.summary()
    expect(summary.standardAvailability).toBe('policy_missing')
  })

  it('reports an unreadable rules document with the IO reason', async () => {
    const { remote } = await workspace(true, false)
    const doc = await remote.rulesDoc()
    expect(doc.status).toBe('unreadable')
    expect(doc.path).toContain('default-rules.md')
    expect(doc.reason).toBeTruthy()
  })

  // 【变更】2026-10-18 (项目工程 1.3): the ONE write this Remote owns — the
  // editable AI 禁改路径 list rides the summary and saves surgically.
  it('carries guardProtectedPaths and the commit 防线 presence on a ready summary', async () => {
    const { remote } = await workspace(true, true)
    const summary = await remote.summary()
    expect(summary.guardProtectedPaths).toEqual(['config/secrets.env'])
    expect(summary.commitGuardHookInstalled).toBe(false)
  })

  it('saves a protected-paths list surgically and installs the commit 防线', async () => {
    const commented = BASELINE_YAML.replace(
      'guard:\n', '# 客户注释（必须原样保留）\nguard:\n',
    ).replace(
      '  protectedPaths: [config/secrets.env]\n',
      '  # 内层注释随旧列表一起换掉\n  protectedPaths: [config/secrets.env]\n',
    )
    const remote = await customWorkspace(commented, true)
    const result = await remote.saveProtectedPaths(['docs', 'src/gen/**'])
    expect(result).toEqual({ status: 'ready', paths: ['docs', 'src/gen/**'], hookInstalled: true })
    const after = await remote.summary()
    expect(after.guardProtectedPaths).toEqual(['docs', 'src/gen/**'])
    expect(after.commitGuardHookInstalled).toBe(true)
    const text = await readFile(join(after.cwd ?? '', '.baf', 'baseline.yml'), 'utf8')
    expect(text).toContain('# 客户注释（必须原样保留）')
    expect(text).toContain('  protectedPaths:\n    - docs\n    - src/gen/**\n')
    expect(text).not.toContain('config/secrets.env')
    expect(text).toContain('  secretScan: required\n')
    expect(await readFile(join(after.cwd ?? '', '.baf', 'hooks', 'pre-commit-check.cjs'), 'utf8'))
      .toContain('baf-dsh-managed')
    expect(await readFile(join(after.cwd ?? '', '.git', 'hooks', 'pre-commit'), 'utf8'))
      .toContain('baf-dsh-managed')
  })

  it('saves an empty list inline without touching the commit 防线', async () => {
    const remote = await customWorkspace(BASELINE_YAML, true)
    const result = await remote.saveProtectedPaths([])
    expect(result).toEqual({ status: 'ready', paths: [] })
    const after = await remote.summary()
    expect(after.commitGuardHookInstalled).toBe(false)
    const text = await readFile(join(after.cwd ?? '', '.baf', 'baseline.yml'), 'utf8')
    expect(text).toContain('  protectedPaths: []\n')
  })

  it('refuses an invalid list and leaves the baseline byte-identical', async () => {
    const remote = await customWorkspace(BASELINE_YAML, true)
    const result = await remote.saveProtectedPaths(['C:/absolute'])
    expect(result).toMatchObject({ status: 'invalid' })
    expect(result.message).toContain('C:/absolute')
    const text = await readFile(join((await remote.summary()).cwd ?? '', '.baf', 'baseline.yml'), 'utf8')
    expect(text).toBe(BASELINE_YAML)
  })

  it('answers no-workspace / no-baseline without touching anything', async () => {
    const bare = new Context()
    cleanups.push(() => bare.fiber.dispose())
    bare.provide('sandboxPolicy', { workspaceRoot: '' } as never)
    bare.provide('sessions', sessionStore([]) as never)
    let bareRemote: BafStandardConfigRemote | undefined
    await bare.plugin({
      inject: ['sessions', 'sandboxPolicy'],
      apply: (scope) => { bareRemote = new BafStandardConfigRemote(scope) },
    })
    expect(await bareRemote!.saveProtectedPaths(['docs'])).toEqual({ status: 'no-workspace' })
    const { remote } = await workspace(false, false)
    expect(await remote.saveProtectedPaths(['docs'])).toEqual({ status: 'no-baseline' })
  })

  it('reports error and keeps the file when the rewrite cannot produce a valid baseline', async () => {
    // A guard: block with no protectedPaths key — the surgical editor refuses
    // to guess where a new key belongs.
    const guardless = await customWorkspace(BASELINE_YAML.replace('  protectedPaths: [config/secrets.env]\n', ''), true)
    const refusal = await guardless.saveProtectedPaths(['docs'])
    expect(refusal).toMatchObject({ status: 'error' })
    // An entry whose text breaks YAML semantics (`a: b` parses as a map) is
    // caught by the whole-document pre-check BEFORE anything reaches disk.
    const semantics = await customWorkspace(BASELINE_YAML, true)
    const broken = await semantics.saveProtectedPaths(['a: b'])
    expect(broken).toMatchObject({ status: 'error' })
    const text = await readFile(join((await semantics.summary()).cwd ?? '', '.baf', 'baseline.yml'), 'utf8')
    expect(text).toBe(BASELINE_YAML)
  })

  it('reports error on unreadable / unwritable baselines without throwing', async () => {
    // baseline.yml as a DIRECTORY: stat passes, readFile cannot.
    const dirWorkspace = await customWorkspace(BASELINE_YAML, false)
    const cwd = (await dirWorkspace.summary()).cwd ?? ''
    await rm(join(cwd, '.baf', 'baseline.yml'))
    await mkdir(join(cwd, '.baf', 'baseline.yml'))
    const unreadable = await dirWorkspace.saveProtectedPaths(['docs'])
    expect(unreadable).toMatchObject({ status: 'error' })
    // A pre-existing tmp DIRECTORY blocks the atomic swap write.
    const blocked = await customWorkspace(BASELINE_YAML, true)
    const blockedCwd = (await blocked.summary()).cwd ?? ''
    await mkdir(join(blockedCwd, '.baf', 'baseline.yml.baf-tmp'))
    const swap = await blocked.saveProtectedPaths(['docs'])
    expect(swap).toMatchObject({ status: 'error' })
    // The real baseline is untouched — only the swap failed.
    expect(await readFile(join(blockedCwd, '.baf', 'baseline.yml'), 'utf8')).toBe(BASELINE_YAML)
  })

  // 【变更】2026-10-19 (六问题批 4.1b): the 状态脚本 map rides the summary
  // and saves through the same surgical discipline; the 生成配置文件 button
  // runs the scaffold with the click as the human confirmation.
  it('carries nodeHooks on a ready summary (empty map when no hooks block)', async () => {
    const { remote } = await workspace(true, true)
    const summary = await remote.summary()
    expect(summary.nodeHooks).toEqual({})
  })

  it('saves the node-hooks map surgically with comments preserved', async () => {
    const commented = `${BASELINE_YAML}# 客户注释（必须原样保留）\nhooks:\n  nodes:\n    implement:\n      exit:\n        - scripts/old-build.sh\n`
    const remote = await customWorkspace(commented, false)
    const result = await remote.saveNodeHooks({
      implement: { exit: ['scripts/build.sh', 'scripts/lint.ps1'] },
      verify: { enter: ['scripts/enter-verify.mjs'] },
    })
    expect(result).toEqual({
      status: 'ready',
      hooks: {
        implement: { exit: ['scripts/build.sh', 'scripts/lint.ps1'] },
        verify: { enter: ['scripts/enter-verify.mjs'] },
      },
    })
    const after = await remote.summary()
    expect(after.nodeHooks).toEqual({
      implement: { exit: ['scripts/build.sh', 'scripts/lint.ps1'] },
      verify: { enter: ['scripts/enter-verify.mjs'] },
    })
    const text = await readFile(join(after.cwd ?? '', '.baf', 'baseline.yml'), 'utf8')
    expect(text).toContain('# 客户注释（必须原样保留）')
    expect(text).toContain('hooks:\n  nodes:\n    implement:\n      exit:\n        - scripts/build.sh\n')
    expect(text).not.toContain('scripts/old-build.sh')
    expect(text).toContain('guard:\n  secretScan: required\n')
  })

  it('removes the hooks block on an empty map and appends nothing when absent', async () => {
    const withBlock = await customWorkspace(
      `${BASELINE_YAML}hooks:\n  nodes:\n    open:\n      enter:\n        - a.sh\n`, false,
    )
    expect(await withBlock.saveNodeHooks({})).toEqual({ status: 'ready', hooks: {} })
    const after = await withBlock.summary()
    expect(after.nodeHooks).toEqual({})
    const text = await readFile(join(after.cwd ?? '', '.baf', 'baseline.yml'), 'utf8')
    expect(text).not.toContain('hooks:')
    // An empty map on a block-less baseline is a no-op, byte-identical.
    const absent = await customWorkspace(BASELINE_YAML, false)
    await absent.saveNodeHooks({})
    const untouched = await readFile(join((await absent.summary()).cwd ?? '', '.baf', 'baseline.yml'), 'utf8')
    expect(untouched).toBe(BASELINE_YAML)
  })

  it('refuses invalid node-hooks drafts and answers no-workspace / no-baseline', async () => {
    const remote = await customWorkspace(BASELINE_YAML, false)
    const invalid = await remote.saveNodeHooks({ verify: { enter: ['scripts/*.sh'] } })
    expect(invalid).toMatchObject({ status: 'invalid' })
    expect(invalid.message).toContain('scripts/*.sh')
    const unknownNode = await remote.saveNodeHooks({ midway: { enter: ['a.sh'] } })
    expect(unknownNode).toMatchObject({ status: 'invalid', message: '未知的工作流节点：midway' })
    const text = await readFile(join((await remote.summary()).cwd ?? '', '.baf', 'baseline.yml'), 'utf8')
    expect(text).toBe(BASELINE_YAML)

    const bare = new Context()
    cleanups.push(() => bare.fiber.dispose())
    bare.provide('sandboxPolicy', { workspaceRoot: '' } as never)
    bare.provide('sessions', sessionStore([]) as never)
    let bareRemote: BafStandardConfigRemote | undefined
    await bare.plugin({
      inject: ['sessions', 'sandboxPolicy'],
      apply: (scope) => { bareRemote = new BafStandardConfigRemote(scope) },
    })
    expect(await bareRemote!.saveNodeHooks({})).toEqual({ status: 'no-workspace' })
    const { remote: noBaseline } = await workspace(false, false)
    expect(await noBaseline.saveNodeHooks({})).toEqual({ status: 'no-baseline' })
  })

  it('generates the missing baseline via the scaffold (ready, anchored, no-destroy)', async () => {
    // withGit: the pre-shaped .git keeps the anchor on its existing-repo fast
    // path — no real git spawns from this test.
    const { remote, cwd } = await workspace(false, false, true)
    const generated = await remote.generateBaseline()
    expect(generated.status).toBe('ready')
    expect(generated.gitNote).toBe('已存在 Git 仓库，未改动')
    expect((generated.createdCount ?? 0)).toBeGreaterThanOrEqual(3)
    const created = await readFile(join(cwd, '.baf', 'baseline.yml'), 'utf8')
    expect(created).toContain('schema: 1')
    expect(created).toContain('baselineId: baf-baseline-init')
    // The scaffolded template parses clean — the summary flips to ready.
    const after = await remote.summary()
    expect(after.status).toBe('ready')

    // A DIFFERENT existing baseline is never destroyed: it moves aside to a
    // timestamped backup and the template lands in its place (no-overwrite +
    // backup semantics come free from the scaffold).
    const existing = await workspace(true, true, true)
    const again = await existing.remote.generateBaseline()
    expect(again.status).toBe('ready')
    // Only the genuinely new skeleton files count as created.
    expect(again.createdCount).toBe(2)
    const text = await readFile(join(existing.cwd, '.baf', 'baseline.yml'), 'utf8')
    expect(text).toContain('baselineId: baf-baseline-init')
    const backups = (await readdir(join(existing.cwd, '.baf')))
      .filter(name => name.startsWith('baseline.yml.baf-backup-'))
    expect(backups).toHaveLength(1)
    expect(await readFile(join(existing.cwd, '.baf', backups[0] ?? ''), 'utf8')).toBe(BASELINE_YAML)
    expect((await existing.remote.summary()).status).toBe('ready')

    const bare = new Context()
    cleanups.push(() => bare.fiber.dispose())
    bare.provide('sandboxPolicy', { workspaceRoot: '' } as never)
    bare.provide('sessions', sessionStore([]) as never)
    let bareRemote: BafStandardConfigRemote | undefined
    await bare.plugin({
      inject: ['sessions', 'sandboxPolicy'],
      apply: (scope) => { bareRemote = new BafStandardConfigRemote(scope) },
    })
    expect(await bareRemote!.generateBaseline()).toEqual({ status: 'no-workspace' })
  })
})
