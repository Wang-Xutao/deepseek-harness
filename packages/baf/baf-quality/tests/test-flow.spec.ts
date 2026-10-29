/**
 * 测试流 durable-evidence readers (批次十五 6): the toggle map + the completion
 * verdict verify gates on + the placeholder gating predicate.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  readTestFlowToggles,
  runTestFlowChain,
  testFlowCompletion,
  testFlowGated,
  testFlowStageCommand,
  TEST_FLOW_CHAIN_ORDER,
  type QualityCommandResult,
  type QualityExecutor,
} from '../src/test-flow.ts'

const workspaces: string[] = []

afterEach(() => {
  for (const root of workspaces.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function tempWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'baf-testflow-'))
  workspaces.push(root)
  return root
}

function writeToggles(root: string, stages: Record<string, unknown>): void {
  mkdirSync(join(root, '.baf', 'quality'), { recursive: true })
  writeFileSync(join(root, '.baf', 'quality', 'test-flow.json'), JSON.stringify({ stages }), 'utf8')
}

function writeReport(root: string, name: string, body: Record<string, unknown>): void {
  mkdirSync(join(root, '.baf', 'reports'), { recursive: true })
  writeFileSync(join(root, '.baf', 'reports', name), JSON.stringify(body), 'utf8')
}

describe('readTestFlowToggles', () => {
  it('reads the all-on default from a missing file (every step participates)', () => {
    expect(readTestFlowToggles(tempWorkspace())).toEqual({})
  })

  it('tolerates a malformed file as all-on', () => {
    const root = tempWorkspace()
    mkdirSync(join(root, '.baf', 'quality'), { recursive: true })
    writeFileSync(join(root, '.baf', 'quality', 'test-flow.json'), '{not json', 'utf8')
    expect(readTestFlowToggles(root)).toEqual({})
  })

  it('maps stage rows with absent fields reading enabled/halt', () => {
    const root = tempWorkspace()
    writeToggles(root, { lint: { enabled: false }, format: { enabled: true, haltOnError: false } })
    const toggles = readTestFlowToggles(root)
    expect(toggles.lint).toEqual({ enabled: false, haltOnError: true })
    expect(toggles.format).toEqual({ enabled: true, haltOnError: false })
    // Absent rows stay undefined → callers read enabled (the !== false idiom).
    expect(toggles.build).toBeUndefined()
  })
})

describe('testFlowCompletion', () => {
  it('asks for both reports when every step is on — missing files are NOT RUN', () => {
    const verdict = testFlowCompletion(tempWorkspace())
    expect(verdict.ok).toBe(false)
    expect(verdict.problems).toHaveLength(2)
    expect(verdict.problems[0]).toContain('ut_coverage.missing')
    expect(verdict.problems[1]).toContain('static_analysis.missing')
  })

  it('passes when both reports are green', () => {
    const root = tempWorkspace()
    writeReport(root, 'ut-coverage.json', { passed: true, line: 92, minimum: 80 })
    writeReport(root, 'static-analysis.json', { passed: true, errors: 0 })
    const verdict = testFlowCompletion(root)
    expect(verdict).toEqual({ ok: true, problems: [] })
  })

  it('fails on a coverage threshold miss with the numbers quoted', () => {
    const root = tempWorkspace()
    writeReport(root, 'ut-coverage.json', { passed: false, line: 61, minimum: 80 })
    writeReport(root, 'static-analysis.json', { passed: true, errors: 0 })
    const verdict = testFlowCompletion(root)
    expect(verdict.ok).toBe(false)
    expect(verdict.problems.join('\n')).toContain('ut_coverage.failed')
    expect(verdict.problems.join('\n')).toContain('line=61')
  })

  it('fails on static errors > 0 even when passed says true', () => {
    const root = tempWorkspace()
    writeReport(root, 'ut-coverage.json', { passed: true, line: 92, minimum: 80 })
    writeReport(root, 'static-analysis.json', { passed: true, errors: 3 })
    const verdict = testFlowCompletion(root)
    expect(verdict.ok).toBe(false)
    expect(verdict.problems.join('\n')).toContain('static_analysis.failed')
    expect(verdict.problems.join('\n')).toContain('errors=3')
  })

  it('honors the toggles — disabled chains ask for no evidence', () => {
    const root = tempWorkspace()
    // Every coverage-chain step off → only static evidence is demanded.
    writeToggles(root, {
      build: { enabled: false, haltOnError: true },
      test: { enabled: false, haltOnError: true },
      instrument: { enabled: false, haltOnError: true },
      report: { enabled: false, haltOnError: true },
      gate: { enabled: false, haltOnError: true },
    })
    writeReport(root, 'static-analysis.json', { passed: true, errors: 0 })
    expect(testFlowCompletion(root)).toEqual({ ok: true, problems: [] })
  })

  it('one enabled coverage step still demands the coverage report (chain semantics)', () => {
    const root = tempWorkspace()
    writeToggles(root, {
      build: { enabled: false, haltOnError: true },
      test: { enabled: false, haltOnError: true },
      instrument: { enabled: false, haltOnError: true },
      report: { enabled: true, haltOnError: true },
      gate: { enabled: false, haltOnError: true },
    })
    writeReport(root, 'static-analysis.json', { passed: true, errors: 0 })
    const verdict = testFlowCompletion(root)
    expect(verdict.ok).toBe(false)
    expect(verdict.problems.join('\n')).toContain('ut_coverage.missing')
  })
})

describe('testFlowGated', () => {
  it('gates only baselines with a real test command (placeholders never gate)', () => {
    expect(testFlowGated({ stack: { test: '<enterprise-tbd>' } })).toBe(false)
    expect(testFlowGated({ stack: { test: 'ceedling test' } })).toBe(true)
  })
})

describe('runTestFlowChain (批次三十四 · 用户问题 5)', () => {
  /**
   * A recording executor: every command it is handed is remembered, and the
   * outcome is the one the test asks for.
   * @param exitCode - the exit code every command reports.
   * @returns the executor plus the commands it saw.
   */
  function recorder(exitCode: number): { readonly executor: QualityExecutor; readonly commands: string[] } {
    const commands: string[] = []
    const executor: QualityExecutor = async (command) => {
      commands.push(command)
      const result: QualityCommandResult = {
        command,
        stdout: 'ok',
        stderr: '',
        exitCode,
        timedOut: false,
        cancelled: false,
        spawnError: null,
        durationMs: 1,
      }
      return result
    }
    return { executor, commands }
  }

  it('runs one command per distinct step command and reports every step', async () => {
    const root = tempWorkspace()
    const { executor, commands } = recorder(0)
    const result = await runTestFlowChain(root, {
      executor,
      stages: ['build', 'test', 'instrument', 'report', 'gate', 'lint', 'analyze'],
    })
    expect(result.ok).toBe(true)
    // build/test share `baf-quality test`, instrument/report/gate share
    // `baf-quality check`, lint/analyze share `baf-quality lint` — three
    // commands for seven steps.
    expect(commands).toHaveLength(3)
    expect(result.steps.map(step => step.stage)).toEqual([
      'build', 'test', 'instrument', 'report', 'gate', 'lint', 'analyze',
    ])
    expect(result.steps.every(step => step.ok)).toBe(true)
  })

  it('halts the sweep at the first failed step', async () => {
    const root = tempWorkspace()
    const { executor, commands } = recorder(1)
    const result = await runTestFlowChain(root, { executor, stages: ['build', 'test', 'lint'] })
    expect(result.ok).toBe(false)
    expect(commands).toHaveLength(1)
    expect(result.steps.map(step => step.stage)).toEqual(['build'])
  })

  it('classifies a missing tool apart from a failed run', async () => {
    const root = tempWorkspace()
    const executor: QualityExecutor = async command => ({
      command,
      stdout: "'ceedling' 不是内部或外部命令",
      stderr: '',
      exitCode: 1,
      timedOut: false,
      cancelled: false,
      spawnError: null,
      durationMs: 1,
    })
    const result = await runTestFlowChain(root, { executor, stages: ['build'] })
    expect(result.steps[0]?.toolMissing).toBe(true)
  })

  it('maps every step onto its baf-quality subcommand', () => {
    expect(testFlowStageCommand('build')).toBe('baf-quality test')
    expect(testFlowStageCommand('instrument')).toBe('baf-quality check')
    expect(testFlowStageCommand('lint')).toBe('baf-quality lint')
    expect([...TEST_FLOW_CHAIN_ORDER]).toEqual([
      'build', 'test', 'instrument', 'report', 'gate', 'lint', 'analyze', 'format',
    ])
  })
})
