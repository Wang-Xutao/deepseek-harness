/**
 * 【变更】2026-10-21 (批次十 测试流图): the BROWSER-side display mirror of the
 * unit-test execution flow (host source of truth: baf-quality's
 * `TEST_FLOW_STEPS`). Rich display fields live ONLY here (labels ride the
 * locale keys; commands / 规范依据 / 产物 are presentation); a client spec
 * asserts id/tool/required parity against the host list so the two can never
 * drift — the same contract `baf-commands-catalog` holds for the 指令集 tab.
 * @module @deepseek-ai/dsh-client-ui-settings-baf-standard/client
 */

/** Step ids, mirroring baf-quality `TestFlowStep['id']` in execution order. */
export type QualityFlowStepId =
  | 'build' | 'test' | 'instrument' | 'report'
  | 'gate' | 'lint' | 'analyze' | 'format'

/** One mirrored step (display fields only — no IO, no status). */
export interface QualityFlowStep {
  readonly id: QualityFlowStepId
  /** The tool chip (probe key where the 环境 card has one). */
  readonly tool: string
  /** 必装 (blocks the UT environment verdict) vs 选装. */
  readonly required: boolean
  /** Mono command line the step runs as. */
  readonly command: string
  /** Applicable standards docs (enterprise/quality catalog ids), clickable. */
  readonly docIds: readonly string[]
  /** Artifacts the step leaves on disk (workspace-relative); may be empty. */
  readonly artifacts: readonly string[]
}

/** The mirror, in the host list's execution order (顺序即规范). */
export const QUALITY_FLOW_STEPS: readonly QualityFlowStep[] = [
  {
    id: 'build',
    tool: 'gcc',
    required: true,
    command: 'ceedling test:all（gcc 编译源码 + 测试桩）',
    docIds: ['env-ut', 'cfg-project'],
    artifacts: ['build/artifacts/test'],
  },
  {
    id: 'test',
    tool: 'ceedling',
    required: true,
    command: 'baf-quality test · ceedling test:all',
    docIds: ['ut', 'uttpl'],
    artifacts: [],
  },
  {
    id: 'instrument',
    tool: 'gcov',
    required: true,
    command: 'ceedling gcov:all（仅 check 路径插桩）',
    docIds: ['ut'],
    artifacts: ['build/gcov'],
  },
  {
    id: 'report',
    tool: 'gcovr',
    required: true,
    command: 'gcovr（check 内聚合）',
    docIds: ['cfg-config', 'env-ut'],
    artifacts: ['build/coverage/coverage_report.html', 'build/coverage/coverage_report.xml'],
  },
  {
    id: 'gate',
    tool: 'baf-quality',
    required: true,
    command: 'baf-quality check',
    docIds: ['ut', 'cfg-config'],
    artifacts: ['.baf/reports/ut-coverage.json'],
  },
  {
    id: 'lint',
    tool: 'cpplint',
    required: false,
    command: 'baf-quality lint（cpplint · CPPLINT.cfg）',
    docIds: ['static', 'cfg-cpplint'],
    artifacts: [],
  },
  {
    id: 'analyze',
    tool: 'cppcheck',
    required: false,
    command: 'baf-quality lint（cppcheck · suppressions）',
    docIds: ['static', 'cfg-cppcheck'],
    artifacts: ['.baf/reports/static-analysis.json'],
  },
  {
    id: 'format',
    tool: 'clang-format',
    required: false,
    command: 'clang-format -i <触及的 .c/.h>',
    docIds: ['code', 'static'],
    artifacts: [],
  },
]
