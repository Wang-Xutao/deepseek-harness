/**
 * BAF 工程规范 overview Remote (问题 6 批, 2026-10-06): the pure projections
 * (cards, cwd chain) unit-style, then the mounted Remote over a real tmp
 * workspace — ready / no-workspace / no-baseline / failed / rulesDoc paths.
 * Read-only contract: no method writes anything.
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
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
  async function workspace(withBaseline: boolean, withRules: boolean): Promise<{
    cwd: string
    ctx: Context
    remote: BafStandardConfigRemote
  }> {
    const root = await mkdtemp(join(tmpdir(), 'baf-std-ws-'))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const cwd = join(root, 'ws')
    await mkdir(join(cwd, '.baf', 'standards'), { recursive: true })
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
})
