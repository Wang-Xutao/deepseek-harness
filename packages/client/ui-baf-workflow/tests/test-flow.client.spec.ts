/**
 * 【变更】2026-10-21 (批次十 测试流图): the session tab's contracts —
 *
 * 1. Catalog parity: the client TEST_FLOW_STEPS mirror must equal
 *    baf-quality's TEST_FLOW_STEPS (id/tool/required, in order) so the chart
 *    can never drift from the host list the 质量监控 page renders.
 * 2. projectTestFlowSteps: the report payload → per-step outcome mapping,
 *    including the honesty rules (missing report = 未运行, never a fake
 *    verdict; format keeps no report).
 * 3. The settings snapshot: the new showTestFlowTab defaults on.
 */

import { describe, expect, it } from 'vitest'
// Host source of truth for the parity guard — a relative import: this spec is
// the ONLY baf-quality consumer in the package, and a devDep would force a
// full pnpm install for one spec (the settings-standard twin keeps the dep
// because its package already depends on baf-quality).
import { TEST_FLOW_STEPS as HOST_STEPS } from '../../../baf/baf-quality/src/test-flow.ts'
import {
  TEST_FLOW_STEPS,
  projectTestFlowSteps,
  type WorkflowTabStageRunResult,
  type WorkflowTabTestFlowStatus,
} from '../src/client/tab-types.ts'
import { INITIAL_WORKFLOW_TAB_PREFS } from '../src/workflow-tab-settings.ts'

describe('测试流图 catalog parity (批次十)', () => {
  it('mirrors baf-quality TEST_FLOW_STEPS id/tool/required in execution order', () => {
    expect(TEST_FLOW_STEPS.map(step => [step.id, step.tool, step.required]))
      .toEqual(HOST_STEPS.map(step => [step.id, step.tool, step.required]))
  })

  it('carries a non-empty command for every step', () => {
    for (const step of TEST_FLOW_STEPS) {
      expect(step.command.length, `${step.id} command empty`).toBeGreaterThan(0)
    }
  })

  // 【变更】2026-10-22 (批次十二 2.6): every step names its 配置文件 — the
  // in-tab preview modal's targets. All entries must be workspace-relative
  // (the Host's readWorkspaceFile rejects anything else).
  it('carries workspace-relative 配置文件 for every step (批次十二)', () => {
    for (const step of TEST_FLOW_STEPS) {
      expect(step.configFiles.length, `${step.id} no config files`).toBeGreaterThan(0)
      for (const rel of step.configFiles) {
        expect(rel.startsWith('/') || /^[a-zA-Z]:/.test(rel), `${step.id}:${rel} absolute`).toBe(false)
        expect(rel.split('/').includes('..'), `${step.id}:${rel} escapes`).toBe(false)
      }
    }
    // The format step names the clang-format rules; lint names cpplint's.
    expect(TEST_FLOW_STEPS.find(step => step.id === 'format')?.configFiles).toContain('.clang-format')
    expect(TEST_FLOW_STEPS.find(step => step.id === 'lint')?.configFiles).toContain('CPPLINT.cfg')
  })

  // 【变更】2026-10-22 (批次十二 2.1/2.4): the 运行 buttons spawn the baf-wrapped
  // CLI — one wrapper subcommand per chain, format stays raw clang-format.
  it('maps each stage to its baf-quality wrapper command (批次十二)', async () => {
    const { testFlowStageCommand } = await import('../src/index.ts')
    expect(testFlowStageCommand('build')).toBe('baf-quality test')
    expect(testFlowStageCommand('test')).toBe('baf-quality test')
    expect(testFlowStageCommand('instrument')).toBe('baf-quality check')
    expect(testFlowStageCommand('report')).toBe('baf-quality check')
    expect(testFlowStageCommand('gate')).toBe('baf-quality check')
    expect(testFlowStageCommand('lint')).toBe('baf-quality lint')
    expect(testFlowStageCommand('analyze')).toBe('baf-quality lint')
  })

  // 【变更】2026-10-22 (批次十三 1): the 全部运行 sweep walks the host's
  // canonical order — it must equal the rail's step order so the folded
  // per-stage results land on the cards in the order the customer watched.
  it('the chain order equals the rail order (批次十三)', async () => {
    const { TEST_FLOW_CHAIN_ORDER } = await import('../src/index.ts')
    expect([...TEST_FLOW_CHAIN_ORDER]).toEqual(TEST_FLOW_STEPS.map(step => step.id))
  })
})

describe('projectTestFlowSteps outcome mapping', () => {
  it('undefined or no-cwd status paints every step idle', () => {
    for (const status of [undefined, { status: 'no-cwd' } as WorkflowTabTestFlowStatus]) {
      const outcomes = projectTestFlowSteps(status)
      for (const step of TEST_FLOW_STEPS) {
        expect(outcomes[step.id].state, `${JSON.stringify(status)} ${step.id}`).toBe('idle')
      }
    }
  })

  it('a workspace with no reports yet stays all-idle (未运行, not failed)', () => {
    const outcomes = projectTestFlowSteps({ status: 'ready' })
    for (const step of TEST_FLOW_STEPS) {
      expect(outcomes[step.id].state).toBe('idle')
    }
  })

  it('the check chain follows the coverage report; the gate reads its verdict', () => {
    const outcomes = projectTestFlowSteps({
      status: 'ready',
      coverage: { line: 83.3, minimum: 80, passed: true, generatedAt: '2026-10-21T10:00:00Z' },
      thresholdLine: 0.8,
    })
    expect(outcomes.build.state).toBe('passed')
    expect(outcomes.test.state).toBe('passed')
    expect(outcomes.instrument.state).toBe('passed')
    expect(outcomes.report.state).toBe('passed')
    expect(outcomes.report.metric).toBe('2026-10-21T10:00:00Z')
    expect(outcomes.gate.state).toBe('passed')
    expect(outcomes.gate.metric).toBe('83.3%（≥ 80%）')
    // No static report yet.
    expect(outcomes.lint.state).toBe('idle')
    expect(outcomes.analyze.state).toBe('idle')
    // Format never fabricates a result.
    expect(outcomes.format.state).toBe('idle')
  })

  it('a failed gate turns only the gate red; the chain stays green (it ran)', () => {
    const outcomes = projectTestFlowSteps({
      status: 'ready',
      coverage: { line: 42, minimum: 80, passed: false },
    })
    expect(outcomes.build.state).toBe('passed')
    expect(outcomes.gate.state).toBe('failed')
  })

  it('a coverage report without a verdict field stays 未判定 (idle)', () => {
    const outcomes = projectTestFlowSteps({ status: 'ready', coverage: { line: 90 } })
    expect(outcomes.gate.state).toBe('idle')
  })

  it('lint/analyze share the static report; errors drive the verdict and metric', () => {
    const clean = projectTestFlowSteps({ status: 'ready', staticAnalysis: { errors: 0, passed: true } })
    expect(clean.lint.state).toBe('passed')
    expect(clean.analyze.state).toBe('passed')
    expect(clean.analyze.metric).toBe('0')

    const dirty = projectTestFlowSteps({ status: 'ready', staticAnalysis: { errors: 5, passed: false } })
    expect(dirty.lint.state).toBe('failed')
    expect(dirty.analyze.state).toBe('failed')
    expect(dirty.analyze.metric).toBe('5')

    // passed absent + errors absent: idle (no fabricated verdict).
    const unknown = projectTestFlowSteps({ status: 'ready', staticAnalysis: {} })
    expect(unknown.lint.state).toBe('idle')
  })

  it('falls back to the config threshold when the report carries no minimum', () => {
    const outcomes = projectTestFlowSteps({ status: 'ready', coverage: { line: 81 }, thresholdLine: 0.8 })
    expect(outcomes.gate.metric).toBe('81%（≥ 80%）')
  })
})

describe('测试流图 settings snapshot', () => {
  it('showTestFlowTab defaults on (old snapshots keep the tab visible)', () => {
    expect(INITIAL_WORKFLOW_TAB_PREFS.showTestFlowTab).toBe(true)
    expect(INITIAL_WORKFLOW_TAB_PREFS.showWorkflowTab).toBe(true)
  })
})

// 【变更】2026-10-22 (批次十四 5): the failed run's 错误解析 classifier —
// ordered pattern rules over the REAL exit code + output tail. The identity
// `t` echoes the key, so asserting the returned cause/fix string pins WHICH
// rule fired; the two placeholder rules run under a key→template `t` to pin
// the {tool}/{code} substitution too.
describe('analyzeRunFailure classifier (批次十四 5)', () => {
  const identity = (key: string) => key
  const run = (over: Partial<WorkflowTabStageRunResult>) =>
    ({ status: 'ready', exitCode: 1, ...over }) as WorkflowTabStageRunResult

  it('returns undefined for clean or non-runnable results', async () => {
    const { analyzeRunFailure } = await import('../src/client/TestFlowView.tsx')
    expect(analyzeRunFailure('build', 'gcc', run({ exitCode: 0 }), identity)).toBeUndefined()
    expect(analyzeRunFailure('build', 'gcc', { status: 'no-cwd' }, identity)).toBeUndefined()
    expect(analyzeRunFailure('build', 'gcc', { status: 'disabled' }, identity)).toBeUndefined()
  })

  it('exit 124 or a timeout note classifies as timeout', async () => {
    const { analyzeRunFailure } = await import('../src/client/TestFlowView.tsx')
    expect(analyzeRunFailure('test', 'ceedling', run({ exitCode: 124 }), identity)?.cause)
      .toBe('tflow.errTimeoutCause')
    expect(analyzeRunFailure('test', 'ceedling', run({ output: '命令超时，已被终止' }), identity)?.fix)
      .toBe('tflow.errTimeoutFix')
  })

  it('tool-missing names the tool the output names, else the step tool', async () => {
    const { analyzeRunFailure } = await import('../src/client/TestFlowView.tsx')
    const t = (key: string) => key === 'tflow.errToolCause' ? 'TOOL {tool}' : key
    expect(analyzeRunFailure('test', 'ceedling', { status: 'tool-missing' }, t)?.cause)
      .toBe('TOOL ceedling')
    // Windows shell phrasing, no known token in the output → the step's tool.
    expect(analyzeRunFailure('format', 'clang-format',
      run({ output: "'gcc' 不是内部或外部命令，也不是可运行的程序" }), t)?.cause)
      .toBe('TOOL gcc')
    expect(analyzeRunFailure('format', 'clang-format',
      run({ output: 'whatever 不是内部或外部命令' }), t)?.cause)
      .toBe('TOOL clang-format')
  })

  it('a config-file miss classifies as missing template', async () => {
    const { analyzeRunFailure } = await import('../src/client/TestFlowView.tsx')
    expect(analyzeRunFailure('test', 'ceedling',
      run({ output: 'ERROR: Ceedling could not find `project.yml`...' }), identity)?.cause)
      .toBe('tflow.errCfgCause')
    expect(analyzeRunFailure('format', 'clang-format',
      run({ output: "clang-format: error: no such file or directory: '.clang-format'" }), identity)?.cause)
      .toBe('tflow.errCfgCause')
  })

  // 批次十四 5 复核 — live case from demo1: clang-format's INPUT dir absent.
  // No config template named → the path rule, not the generic fallback.
  it('a non-config path miss classifies as missing path (批次十四 5 复核)', async () => {
    const { analyzeRunFailure } = await import('../src/client/TestFlowView.tsx')
    expect(analyzeRunFailure('format', 'clang-format',
      run({ output: 'clang-format -i source\nsource: no such file or directory' }), identity)?.cause)
      .toBe('tflow.errPathCause')
    expect(analyzeRunFailure('build', 'gcc',
      run({ output: 'cc1.exe: error: stdio.h: No such file or directory' }), identity)?.fix)
      .toBe('tflow.errPathFix')
  })

  it('permission phrasings classify as locked/permission', async () => {
    const { analyzeRunFailure } = await import('../src/client/TestFlowView.tsx')
    expect(analyzeRunFailure('build', 'gcc',
      run({ output: 'Permission denied accessing build/artifact.o' }), identity)?.cause)
      .toBe('tflow.errPermCause')
  })

  it('lint/analyze failures are static findings even though their output says error + .c', async () => {
    const { analyzeRunFailure } = await import('../src/client/TestFlowView.tsx')
    const lintOut = 'src/led.c:99:  Missing space before { [whitespace/braces] [5]\nTotal errors found: 12'
    expect(analyzeRunFailure('lint', 'cpplint', run({ output: lintOut }), identity)?.cause)
      .toBe('tflow.errStaticCause')
    expect(analyzeRunFailure('analyze', 'cppcheck', run({ exitCode: 1 }), identity)?.fix)
      .toBe('tflow.errStaticFix')
  })

  it('compile errors, FAILED tests, and below-threshold coverage each classify', async () => {
    const { analyzeRunFailure } = await import('../src/client/TestFlowView.tsx')
    expect(analyzeRunFailure('build', 'gcc',
      run({ output: 'test/test_led.c:12:1: error: expected \';\' before \'return\'' }), identity)?.cause)
      .toBe('tflow.errCompileCause')
    expect(analyzeRunFailure('test', 'ceedling',
      run({ output: '-----------------------\nFAILED tests:\n  TestLed_SetValue' }), identity)?.cause)
      .toBe('tflow.errTestCause')
    expect(analyzeRunFailure('gate', 'baf-quality',
      run({ output: 'line coverage 42.0% is below the 80% minimum' }), identity)?.cause)
      .toBe('tflow.errCoverageCause')
  })

  it('an unmatched failure falls back to the honest generic rule with the exit code', async () => {
    const { analyzeRunFailure } = await import('../src/client/TestFlowView.tsx')
    const t = (key: string) => key === 'tflow.errGenericCause' ? 'EXIT {code}' : key
    expect(analyzeRunFailure('format', 'clang-format',
      run({ exitCode: 3, output: 'some novel breakage' }), t)?.cause)
      .toBe('EXIT 3')
  })
})
