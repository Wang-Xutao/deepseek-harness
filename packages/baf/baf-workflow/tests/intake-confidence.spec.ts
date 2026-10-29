/**
 * 【变更】2026-10-29 (批次三十七 · 用户问题 4): the intake classifier's three
 * layers — keywords (a direct hit is 100%), the model (a real percentage),
 * and the rules (the last word on which path may run).
 */

import { describe, expect, it } from 'vitest'
import { loadBaselineFile } from '@deepseek-ai/dsh-baf-core'
import { fileURLToPath } from 'node:url'
import {
  classifyIntake,
  classifyIntakeWithConfidence,
  matchIntakeKeywords,
  suggestIntake,
  type IntakeConfidenceEvaluator,
} from '../src/intake.ts'

/** The baseline that allows the bug-fix fast path for a small scope. */
const BASELINE_PATH = fileURLToPath(
  new URL('../../baf-core/tests/fixtures/baseline/baseline.yml', import.meta.url),
)

describe('the keyword layer (批次三十七 · 用户问题 4)', () => {
  it('matches Chinese keywords — the old regex could never match them', () => {
    // The old classifier's Chinese alternatives sat behind ASCII word
    // boundaries, so a pure-Chinese requirement never hit: it always read
    // 「待定 · 40%」.
    const signals = matchIntakeKeywords('修复登录崩溃的问题')
    expect(signals.bug).toBe(true)
    expect(signals.feature).toBe(false)

    const feature = matchIntakeKeywords('给报表模块新增一个导出功能')
    expect(feature.feature).toBe(true)
    expect(feature.bug).toBe(false)
  })

  it('does not match a keyword inside a longer ASCII word', () => {
    expect(matchIntakeKeywords('the prefix is wrong').bug).toBe(false)
    expect(matchIntakeKeywords('fix the parser crash').bug).toBe(true)
  })

  it('a direct keyword hit answers 100% and names its path', () => {
    const bug = suggestIntake({
      description: '修复登录崩溃',
      workspace: { root: '/tmp' },
      affectedScopeHint: 'single-file',
    })
    expect(bug.confidence).toBe(1)
    expect(bug.confidenceSource).toBe('keyword')
    expect(bug.recommendedMode).toBe('bug-fix-path')
    expect(bug.kind).toBe('bug')

    const rework = suggestIntake({
      description: '重构 ecum 模块',
      workspace: { root: '/tmp' },
    })
    expect(rework.confidence).toBe(1)
    expect(rework.recommendedMode).toBe('full-go-path')
    // 【变更】2026-10-29 (批次三十七): 重构 reaches across modules.
    expect(rework.affectedScope).toBe('cross-module')
  })

  it('a requirement that reads as both a defect and a rework stays undecided', () => {
    const both = suggestIntake({
      description: '修复新增功能导致的崩溃',
      workspace: { root: '/tmp' },
    })
    expect(both.confidenceSource).toBe('default')
    expect(both.reasonCodes).toContain('keyword-ambiguous')
  })

  it('a keyword-free requirement falls back to the honest default', () => {
    const unknown = classifyIntake({
      description: 'ecum 模块的登录态老是丢失',
      workspace: { root: '/tmp' },
    })
    expect(unknown.confidenceSource).toBe('default')
    expect(unknown.mode).toBe('clarify-required')
  })
})

describe('the model layer (批次三十七 · 用户问题 4)', () => {
  it('asks the model only when the keywords could not decide', async () => {
    const baseline = await loadBaselineFile(BASELINE_PATH)
    let calls = 0
    const evaluator: IntakeConfidenceEvaluator = async () => {
      calls++
      return {
        kind: 'bug',
        affectedScope: 'single-file',
        pathConfidence: { 'full-go-path': 22, 'bug-fix-path': 91 },
        reason: '影响面很小',
      }
    }

    const hit = await classifyIntakeWithConfidence({
      description: '修复登录崩溃',
      workspace: { root: '/tmp' },
    }, evaluator)
    expect(calls).toBe(0)
    expect(hit.confidence).toBe(1)

    const judged = await classifyIntakeWithConfidence({
      description: 'ecum 模块的登录态老是丢失',
      workspace: { root: '/tmp' },
      baseline,
    }, evaluator)
    expect(calls).toBe(1)
    expect(judged.confidenceSource).toBe('llm')
    expect(judged.confidence).toBe(0.91)
    expect(judged.recommendedMode).toBe('bug-fix-path')
    expect(judged.pathConfidence).toEqual({ 'full-go-path': 22, 'bug-fix-path': 91 })
  })

  it('a failed evaluation never blocks the intake', async () => {
    const failing: IntakeConfidenceEvaluator = async () => {
      throw new Error('provider down')
    }
    const judged = await classifyIntakeWithConfidence({
      description: 'ecum 模块的登录态老是丢失',
      workspace: { root: '/tmp' },
    }, failing)
    expect(judged.confidenceSource).toBe('default')
    expect(judged.mode).toBe('clarify-required')
  })

  it('a low model score sends the requirement to clarification', async () => {
    const unsure: IntakeConfidenceEvaluator = async () => ({
      kind: 'unknown',
      affectedScope: 'unknown',
      pathConfidence: { 'full-go-path': 30, 'bug-fix-path': 25 },
    })
    const judged = await classifyIntakeWithConfidence({
      description: 'ecum 模块的登录态老是丢失',
      workspace: { root: '/tmp' },
    }, unsure)
    expect(judged.mode).toBe('clarify-required')
    expect(judged.confidence).toBe(0.3)
  })
})
