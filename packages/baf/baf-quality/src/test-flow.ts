/**
 * 【变更】2026-10-21 (批次十 测试流图): the canonical unit-test execution flow —
 * the ordered steps `baf-quality check` + `lint` + the final format actually
 * run, distilled from the enterprise standards (sora-c-ut-ceedling /
 * sora-c-static-analysis / sora-c-code-standards). Structure only: display
 * strings live in the client locales, and the two browser-side catalogs
 * (质量监控 测试流图卡 + 会话 测试流图 Tab) mirror THIS list with parity specs
 * so the three can never drift — the same contract `HELP_TABLES` holds for the
 * 指令集 tab.
 *
 * 【变更】2026-10-22 (批次十五 6): the durable-evidence readers — toggle map +
 * completion verdict — so verify (baf-workflow) can require 测试流全部完成成功
 * without re-deriving the report contract.
 * @module @deepseek-ai/dsh-baf-quality/test-flow
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { QUALITY_PLACEHOLDER } from './runner.ts'

/** One executable step of the unit-test quality flow. */
export interface TestFlowStep {
  /** Stable step id (wire/display key; unique across the list). */
  readonly id: 'build' | 'test' | 'instrument' | 'report' | 'gate' | 'lint' | 'analyze' | 'format'
  /** The tool the step runs as (probe key where one exists). */
  readonly tool: 'gcc' | 'ceedling' | 'gcov' | 'gcovr' | 'baf-quality' | 'cpplint' | 'cppcheck' | 'clang-format'
  /** Whether the tool is a required environment member (批次十二: all 必装). */
  readonly required: boolean
}

/**
 * The eight steps, in execution order. Order is normative — the standards
 * forbid `clang-format -i` before lint converges (代码冻结前最后一步), and the
 * coverage instrumentation only happens on the `check` path (日常 test 不插桩).
 *
 * 【变更】2026-10-22 (批次十二 3): every member is `required: true` — 客户决策
 * 「没有选装，都是必装」. The former 必装/选装 split (lint/analyze/format optional)
 * is gone; the two browser mirrors flip with this list (parity specs lock them).
 */
export const TEST_FLOW_STEPS: readonly TestFlowStep[] = [
  { id: 'build', tool: 'gcc', required: true },
  { id: 'test', tool: 'ceedling', required: true },
  { id: 'instrument', tool: 'gcov', required: true },
  { id: 'report', tool: 'gcovr', required: true },
  { id: 'gate', tool: 'baf-quality', required: true },
  { id: 'lint', tool: 'cpplint', required: true },
  { id: 'analyze', tool: 'cppcheck', required: true },
  { id: 'format', tool: 'clang-format', required: true },
]

/** Per-step switches persisted at .baf/quality/test-flow.json (all-on default). */
export interface TestFlowToggles {
  readonly [stageId: string]: { readonly enabled: boolean; readonly haltOnError: boolean } | undefined
}

/**
 * Read the workspace's per-stage 测试流 switches. The file the settings canvas
 * writes (saveQualityTestFlowToggle, post-cascade) is authoritative; a missing
 * or malformed file means every step participates (the all-on default the
 * canvas also falls back to).
 * @param workspaceRoot - absolute workspace root.
 * @returns stage-id → {enabled, haltOnError} with absent rows reading enabled.
 */
export function readTestFlowToggles(workspaceRoot: string): TestFlowToggles {
  try {
    const raw = JSON.parse(readFileSync(
      join(workspaceRoot, '.baf', 'quality', 'test-flow.json'),
      'utf8',
    )) as { stages?: unknown }
    const stages = raw?.stages
    if (stages === undefined || typeof stages !== 'object' || stages === null) return {}
    const toggles: Record<string, { enabled: boolean; haltOnError: boolean } | undefined> = {}
    for (const [id, value] of Object.entries(stages as Record<string, unknown>)) {
      if (value === null || typeof value !== 'object') continue
      const entry = value as { enabled?: unknown; haltOnError?: unknown }
      toggles[id] = {
        enabled: entry.enabled !== false,
        haltOnError: entry.haltOnError !== false,
      }
    }
    return toggles
  } catch {
    return {}
  }
}

/** The completion verdict verify gates on (批次十五 6). */
export interface TestFlowCompletion {
  /** True when every ENABLED evidence-bearing step's report is green. */
  readonly ok: boolean
  /** One human-readable line per problem (empty when ok). */
  readonly problems: readonly string[]
}

/**
 * Whether THIS baseline owes 测试流 evidence at verify (批次十五 6). A
 * scaffolded baseline ships `stack.test` as the `<enterprise-tbd>`
 * placeholder — the enterprise never configured a unit-test flow, so verify
 * asks for no test-flow evidence. This is the same fail-closed-but-never-
 * gate-dead semantics the quality check gives placeholder commands
 * (2026-09-22 web walk deadlock): gating an unconfigured workspace would fail
 * every fresh verify with no in-band fix.
 * @param baseline - the governing baseline manifest.
 * @returns true when the baseline configures a real test command.
 */
export function testFlowGated(baseline: { readonly stack: { readonly test: string } }): boolean {
  return baseline.stack.test !== QUALITY_PLACEHOLDER
}

/**
 * The 测试流's durable-evidence verdict: has the flow completed successfully?
 * The coverage chain (build/test/instrument/report/gate) leaves
 * `.baf/reports/ut-coverage.json`; lint+analyze leave
 * `.baf/reports/static-analysis.json`; format keeps no persistent artifact
 * (its tool presence is warned by status-blockers, nothing to re-check here).
 * A report that does not exist counts as NOT RUN — the verdict says so — and
 * disabled steps (`.baf/quality/test-flow.json` toggles) ask for no evidence.
 * @param workspaceRoot - absolute workspace root.
 * @returns completion verdict with per-problem lines.
 */
export function testFlowCompletion(workspaceRoot: string): TestFlowCompletion {
  const toggles = readTestFlowToggles(workspaceRoot)
  const enabled = (id: TestFlowStep['id']): boolean => toggles[id]?.enabled !== false
  const problems: string[] = []
  const readJson = (path: string): unknown | undefined => {
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as unknown
    } catch {
      return undefined
    }
  }

  const coverageSteps: readonly TestFlowStep['id'][] = ['build', 'test', 'instrument', 'report', 'gate']
  if (coverageSteps.some(enabled)) {
    const raw = readJson(join(workspaceRoot, '.baf', 'reports', 'ut-coverage.json'))
    const report = raw !== undefined && typeof raw === 'object' && raw !== null
      ? raw as { readonly passed?: boolean; readonly line?: number; readonly minimum?: number }
      : undefined
    if (report === undefined) {
      problems.push('ut_coverage.missing: 覆盖率报告未生成——测试流（覆盖率链）尚未完成；在会话测试流图运行后重试')
    } else if (report.passed !== true) {
      problems.push(
        `ut_coverage.failed: 覆盖率未达标 line=${String(report.line)} minimum=${String(report.minimum)}`,
      )
    }
  }

  const staticSteps: readonly TestFlowStep['id'][] = ['lint', 'analyze']
  if (staticSteps.some(enabled)) {
    const raw = readJson(join(workspaceRoot, '.baf', 'reports', 'static-analysis.json'))
    const report = raw !== undefined && typeof raw === 'object' && raw !== null
      ? raw as { readonly passed?: boolean; readonly errors?: number }
      : undefined
    if (report === undefined) {
      problems.push('static_analysis.missing: 静态分析报告未生成——测试流（lint/静态分析）尚未完成；在会话测试流图运行后重试')
    } else if (report.passed !== true || (typeof report.errors === 'number' && report.errors > 0)) {
      problems.push(`static_analysis.failed: 静态分析未通过 errors=${String(report.errors)}`)
    }
  }

  // The empty case (every step disabled) is ok: the customer switched the
  // whole flow off and verify asks for nothing.
  return { ok: problems.length === 0, problems }
}
