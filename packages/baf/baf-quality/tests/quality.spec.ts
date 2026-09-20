/**
 * QualityRunner tests: structured failure reasons, coverage thresholds,
 * placeholder policy handling, truncation, and redaction — all against an
 * injected fake executor (no real toolchain needed).
 */

import { describe, expect, it } from 'vitest'
import type { AdapterContext, BaselineManifest } from '@deepseek-ai/dsh-baf-core'
import {
  createCStackAdapter,
  parseCoveragePercent,
  redactSecrets,
  truncateOutput,
  type QualityCommandResult,
  type QualityExecutor,
} from '../src/runner.ts'

interface ScriptedOutcome {
  readonly exitCode?: number
  readonly stdout?: string
  readonly stderr?: string
  readonly timedOut?: boolean
  readonly cancelled?: boolean
  readonly spawnError?: string
}

function fakeExecutor(script: Record<string, ScriptedOutcome> | ((command: string) => ScriptedOutcome)) {
  const calls: string[] = []
  const executor: QualityExecutor = async (command, options) => {
    calls.push(command)
    const outcome = typeof script === 'function' ? script(command) : (script[command] ?? { exitCode: 0 })
    const result: QualityCommandResult = {
      command,
      stdout: outcome.stdout ?? '',
      stderr: outcome.stderr ?? '',
      exitCode: outcome.spawnError !== undefined ? null : (outcome.exitCode ?? 0),
      timedOut: outcome.timedOut ?? false,
      cancelled: outcome.cancelled ?? false,
      spawnError: outcome.spawnError ?? null,
      durationMs: 5,
    }
    void options
    return result
  }
  return { executor, calls }
}

function baseline(stack: Partial<BaselineManifest['stack']>): BaselineManifest {
  return {
    schema: 1,
    baselineId: 'baf-baseline-c-test',
    bafCompatibility: { min: '0.1.0', max: '0.x' },
    workflow: {
      default: 'go',
      requireOpenSpec: true,
      bugFixPath: { allowed: true, maxScope: 'small-local', requireRegressionTest: true },
    },
    routeProfile: {
      default: { provider: 'p', model: 'm' },
      allowed: [{ provider: 'p', model: 'm', capabilities: ['coding'], fallbackGroup: 'g' }],
      phases: {
        intake: { provider: 'p', model: 'm' },
        open: { provider: 'p', model: 'm' },
        clarify: { provider: 'p', model: 'm' },
        design: { provider: 'p', model: 'm' },
        plan: { provider: 'p', model: 'm' },
        implement: { provider: 'p', model: 'm' },
        verify: { provider: 'p', model: 'm' },
        archive: { provider: 'p', model: 'm' },
      },
      fallbackPolicy: { mode: 'approved-only', groups: { g: [{ provider: 'p', model: 'm' }] } },
    },
    openspec: {
      cli: 'openspec',
      version: 'latest',
      root: 'openspec',
      changeRoot: 'openspec/changes',
      validate: { args: [] },
    },
    standard: { mattPocockRulesRef: 'ref' },
    stack: {
      language: 'c',
      compiler: 'gcc',
      build: 'make -j4',
      test: 'ctest --output-on-failure',
      coverage: { required: true, minimum: 80 },
      analyzers: ['cppcheck --enable=all'],
      ...stack,
    },
    guard: {
      secretScan: 'required',
      protectedPaths: [],
      requireHumanConfirmation: ['archive'],
    },
  }
}

const workspace = { root: 'W:\\repo' } as const

function qualityInput(manifest: BaselineManifest, signal = new AbortController().signal) {
  return { workspace, baseline: manifest, changeId: 'change-1', signal }
}

describe('quality runner', () => {
  it('passes when build/test/analyzers exit 0 and coverage meets the numeric minimum', async () => {
    const { executor, calls } = fakeExecutor({
      'gcc --version': { exitCode: 0, stdout: 'gcc (GCC) 13.2.0\n' },
      'make -j4': { exitCode: 0, stdout: 'build ok\n' },
      'ctest --output-on-failure': { exitCode: 0, stdout: '100% tests passed\nlines: 85.4%\n' },
      'cppcheck --enable=all': { exitCode: 0, stdout: 'no findings\n' },
    })
    const adapter = createCStackAdapter({ executor })
    const report = await adapter.runQuality(qualityInput(baseline({})), new AbortController().signal)
    expect(report.passed).toBe(true)
    expect(report.schema).toBe(1)
    expect(report.baselineId).toBe('baf-baseline-c-test')
    expect(report.workspace).toBe('W:\\repo')
    expect(report.toolVersions['gcc']).toContain('13.2.0')
    expect(calls).toEqual([
      'gcc --version',
      'make -j4',
      'ctest --output-on-failure',
      'cppcheck --enable=all',
    ])
    const coverage = report.checks.find(check => (check as { id: string }).id === 'coverage')
    expect(coverage).toMatchObject({ passed: true, output: expect.stringContaining('85.40%') })
    expect(report.checks.every(check => (check as { passed: boolean }).passed)).toBe(true)
  })

  it('distinguishes structured failure reasons: exit_code, timeout, tool_missing', async () => {
    const { executor } = fakeExecutor({
      'gcc --version': { exitCode: 0, stdout: 'gcc 13\n' },
      'make -j4': { exitCode: 2, stderr: 'make: *** Error 2\n' },
      'ctest --output-on-failure': { timedOut: true },
      'cppcheck --enable=all': { spawnError: 'ENOENT' },
    })
    const adapter = createCStackAdapter({ executor })
    const report = await adapter.runQuality(qualityInput(baseline({})), new AbortController().signal)
    expect(report.passed).toBe(false)
    const byId = new Map(report.checks.map(check => [(check as { id: string }).id, check]))
    expect(byId.get('build')).toMatchObject({ reasonCode: 'exit_code', exitCode: 2 })
    expect(byId.get('test')).toMatchObject({ reasonCode: 'timeout' })
    expect(byId.get('analyzer:cppcheck --enable=all')).toMatchObject({ reasonCode: 'tool_missing' })
  })

  it('fails closed when required numeric coverage is below threshold or unreported', async () => {
    const low = fakeExecutor({
      'gcc --version': { exitCode: 0, stdout: 'gcc 13\n' },
      'make -j4': { exitCode: 0 },
      'ctest --output-on-failure': { exitCode: 0, stdout: 'lines: 42.0%\n' },
    })
    const adapter = createCStackAdapter({ executor: low.executor })
    const below = await adapter.runQuality(qualityInput(baseline({})), new AbortController().signal)
    expect(below.passed).toBe(false)
    expect(below.checks.find(check => (check as { id: string }).id === 'coverage'))
      .toMatchObject({ reasonCode: 'threshold_not_met' })

    const none = fakeExecutor({
      'gcc --version': { exitCode: 0, stdout: 'gcc 13\n' },
      'make -j4': { exitCode: 0 },
      'ctest --output-on-failure': { exitCode: 0, stdout: 'all tests passed\n' },
    })
    const adapter2 = createCStackAdapter({ executor: none.executor })
    const unreported = await adapter2.runQuality(qualityInput(baseline({})), new AbortController().signal)
    expect(unreported.passed).toBe(false)
    expect(unreported.checks.find(check => (check as { id: string }).id === 'coverage'))
      .toMatchObject({ reasonCode: 'coverage_not_reported' })
  })

  it('treats project-config coverage as an informational presence check, not a numeric gate', async () => {
    const { executor } = fakeExecutor({
      'gcc --version': { exitCode: 0, stdout: 'gcc 13\n' },
      'make -j4': { exitCode: 0 },
      'ctest --output-on-failure': { exitCode: 0 },
    })
    const adapter = createCStackAdapter({ executor })
    const report = await adapter.runQuality(
      qualityInput(baseline({ coverage: { required: true, minimum: 'project-config' } })),
      new AbortController().signal,
    )
    expect(report.passed).toBe(true)
    const coverage = report.checks.find(check => (check as { id: string }).id === 'coverage')
    expect(coverage).toMatchObject({ passed: true })
  })

  it('records placeholder commands as policy_missing and never substitutes defaults', async () => {
    const { executor, calls } = fakeExecutor({})
    const adapter = createCStackAdapter({ executor })
    const report = await adapter.runQuality(
      qualityInput(baseline({
        compiler: '<enterprise-tbd>',
        build: '<enterprise-tbd>',
        test: '<enterprise-tbd>',
        analyzers: ['<enterprise-tbd>'],
        coverage: { required: false, minimum: 'project-config' },
      })),
      new AbortController().signal,
    )
    expect(report.passed).toBe(false)
    expect(report.diagnostics.some(line => line.includes('policy placeholders'))).toBe(true)
    for (const check of report.checks) {
      expect((check as { reasonCode?: string }).reasonCode).toBe('policy_missing')
    }
    // Nothing ran: no invented commands or probes for placeholders.
    expect(calls).toEqual([])
  })

  it('redacts secrets and truncates captured output before storing checks', async () => {
    const { executor } = fakeExecutor({
      'gcc --version': { exitCode: 0, stdout: 'gcc 13\n' },
      'make -j4': { exitCode: 0 },
      'ctest --output-on-failure': { exitCode: 0 },
    })
    const redacted = redactSecrets('token AKIAIOSFODNN7EXAMPLE ghp_' + 'a'.repeat(36))
    expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE')
    expect(redacted).toContain('[REDACTED]')

    const long = 'x'.repeat(50_000)
    const cut = truncateOutput(long)
    expect(cut.length).toBeLessThan(long.length)
    expect(cut).toContain('[truncated')
    expect(cut.endsWith(']')).toBe(true)

    const adapter = createCStackAdapter({ executor })
    const report = await adapter.runQuality(qualityInput(baseline({})), new AbortController().signal)
    for (const check of report.checks) {
      expect(((check as { output: string }).output).length).toBeLessThanOrEqual(9_000)
    }
  })

  it('marks cancelled runs failed with a cancelled reason and diagnostic', async () => {
    const controller = new AbortController()
    const { executor } = fakeExecutor((command) => {
      if (command === 'ctest --output-on-failure') controller.abort()
      return { exitCode: 0, cancelled: controller.signal.aborted }
    })
    const adapter = createCStackAdapter({ executor })
    const report = await adapter.runQuality(qualityInput(baseline({}), controller.signal), controller.signal)
    expect(report.passed).toBe(false)
    expect(report.diagnostics.some(line => line.includes('cancelled'))).toBe(true)
  })

  it('detect reports unavailable for placeholder or missing compilers', async () => {
    const { executor } = fakeExecutor({ 'gcc --version': { exitCode: 0, stdout: 'gcc 13.2.0\n' } })
    const adapter = createCStackAdapter({ executor })
    const ctx: AdapterContext = { workspace, baseline: baseline({}) }
    expect(await adapter.detect(ctx)).toMatchObject({ available: true, compiler: 'gcc' })

    const placeholderCtx: AdapterContext = { workspace, baseline: baseline({ compiler: '<enterprise-tbd>' }) }
    expect((await adapter.detect(placeholderCtx)).available).toBe(false)

    const missing = fakeExecutor({ 'badcc --version': { spawnError: 'ENOENT' } })
    const adapter2 = createCStackAdapter({ executor: missing.executor })
    const missingCtx: AdapterContext = { workspace, baseline: baseline({ compiler: 'badcc' }) }
    expect((await adapter2.detect(missingCtx)).available).toBe(false)
  })

  it('parses gcovr, lcov-style, and generic coverage markers', () => {
    expect(parseCoveragePercent('  lines: 82.3% ...')).toBeCloseTo(82.3)
    expect(parseCoveragePercent('  lines......: 45.0%')).toBeCloseTo(45)
    expect(parseCoveragePercent('Overall coverage: 99%')).toBeCloseTo(99)
    expect(parseCoveragePercent('no markers here')).toBeUndefined()
  })
})
