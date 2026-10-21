/**
 * 【变更】2026-10-21 (批次十 测试流图): the canonical unit-test execution flow —
 * the ordered steps `baf-quality check` + `lint` + the final format actually
 * run, distilled from the enterprise standards (sora-c-ut-ceedling /
 * sora-c-static-analysis / sora-c-code-standards). Structure only: display
 * strings live in the client locales, and the two browser-side catalogs
 * (质量监控 测试流图卡 + 会话 测试流图 Tab) mirror THIS list with parity specs
 * so the three can never drift — the same contract `HELP_TABLES` holds for the
 * 指令集 tab.
 * @module @deepseek-ai/dsh-baf-quality/test-flow
 */

/** One executable step of the unit-test quality flow. */
export interface TestFlowStep {
  /** Stable step id (wire/display key; unique across the list). */
  readonly id: 'build' | 'test' | 'instrument' | 'report' | 'gate' | 'lint' | 'analyze' | 'format'
  /** The tool the step runs as (probe key where one exists). */
  readonly tool: 'gcc' | 'ceedling' | 'gcov' | 'gcovr' | 'baf-quality' | 'cpplint' | 'cppcheck' | 'clang-format'
  /** Whether the tool is a required environment member (必装 vs 选装). */
  readonly required: boolean
}

/**
 * The eight steps, in execution order. Order is normative — the standards
 * forbid `clang-format -i` before lint converges (代码冻结前最后一步), and the
 * coverage instrumentation only happens on the `check` path (日常 test 不插桩).
 */
export const TEST_FLOW_STEPS: readonly TestFlowStep[] = [
  { id: 'build', tool: 'gcc', required: true },
  { id: 'test', tool: 'ceedling', required: true },
  { id: 'instrument', tool: 'gcov', required: true },
  { id: 'report', tool: 'gcovr', required: true },
  { id: 'gate', tool: 'baf-quality', required: true },
  { id: 'lint', tool: 'cpplint', required: false },
  { id: 'analyze', tool: 'cppcheck', required: false },
  { id: 'format', tool: 'clang-format', required: false },
]
