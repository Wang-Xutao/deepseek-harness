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
