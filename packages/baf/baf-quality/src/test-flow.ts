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

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { QUALITY_PLACEHOLDER, shellExecutor, type QualityExecutor } from './runner.ts'

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

/**
 * Per-step switches persisted at .baf/quality/test-flow.json (all-on default). */
export interface TestFlowToggles {
  readonly [stageId: string]: { readonly enabled: boolean; readonly haltOnError: boolean } | undefined
}

/**
 * 【变更】2026-10-28 (批次三十四 · 用户问题 5): the canonical EXECUTION order of
 * the eight steps — the same order the 测试流图's 全部运行 walks.
 */
export const TEST_FLOW_CHAIN_ORDER = [
  'build',
  'test',
  'instrument',
  'report',
  'gate',
  'lint',
  'analyze',
  'format',
] as const

/**
 * The steps whose execution leaves DURABLE EVIDENCE — the coverage chain
 * (`.baf/reports/ut-coverage.json`) and the static-analysis chain
 * (`.baf/reports/static-analysis.json`). The verify stage runs exactly these:
 * the format step rewrites the customer's source tree and keeps no report, so
 * it stays an explicit customer action (the 测试流图's 全部运行).
 */
export const TEST_FLOW_EVIDENCE_STEPS = [
  'build',
  'test',
  'instrument',
  'report',
  'gate',
  'lint',
  'analyze',
] as const

/**
 * 【变更】2026-10-28 (批次三十四 · 用户问题 5): the baf-wrapped command one
 * 测试流 step runs as — the `baf-quality` CLI's own subcommand contract (the
 * wrapper ships with the quality pack; `test` → ceedling test:all, `check` →
 * gcov 插桩 + gcovr + 覆盖率门禁, `lint` → cpplint + cppcheck). build shares
 * `test` (ceedling compiles inside the test build — no compile-only
 * subcommand); format is NOT here (raw `clang-format -i <arg>`, built by the
 * caller).
 *
 * The mapping lives HERE (not in the client host) so the workflow's verify
 * stage and the 测试流图 run the very same commands.
 * @param stage - the step id.
 * @returns the shell command string.
 */
export function testFlowStageCommand(
  stage: 'build' | 'test' | 'instrument' | 'report' | 'gate' | 'lint' | 'analyze',
): string {
  switch (stage) {
    case 'build':
    case 'test':
      return 'baf-quality test'
    case 'instrument':
    case 'report':
    case 'gate':
      return 'baf-quality check'
    case 'lint':
    case 'analyze':
      return 'baf-quality lint'
  }
}

/**
 * The toolchain members any step command can reach — the not-found probe set.
 */
export const STAGE_TOOL_TOKENS = ['baf-quality', 'ceedling', 'gcovr', 'cpplint', 'cppcheck', 'clang-format', 'gcc', 'ruby'] as const

/**
 * Whether a failed step run means "the tool is not installed" rather than
 * "the tool ran and reported findings".
 *
 * cmd returns exit **1** (not 9009) for a missing command AND the localized
 * 不是内部或外部命令 message arrives GBK-mangled through Node's utf8 decode, so
 * the localized regex never matches. The `'NAME'` quoting prefix is
 * ASCII-stable across locales — with a tiny output it identifies the shell's
 * own not-found line (a real stage failure echoes findings, not a lone quoted
 * command name).
 * @param code - the spawn exit code.
 * @param combined - the run's combined output.
 * @param command - the command that ran.
 * @returns true when the tool was missing.
 */
export function classifyStageToolMissing(code: unknown, combined: string, command: string): boolean {
  const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const tokens = new Set<string>()
  const head = command.split(' ')[0] ?? ''
  if (head !== '') tokens.add(head)
  for (const tool of STAGE_TOOL_TOKENS) tokens.add(tool)
  const shortOutput = typeof code === 'number' && code === 1 && combined.trim().length <= 200
  const shellNotFound = shortOutput
    && [...tokens].some(token => new RegExp(`^'${escapeRe(token)}'`, 'm').test(combined))
  return code === 'ENOENT'
    || code === 9009
    || /not recognized|不是内部或外部命令|无法将|command not found/i.test(combined)
    || shellNotFound
}

/**
 * The shipped `baf-quality` CLI resolves by absolute path — via the
 * always-exported `package.json` root (a direct `./baf-quality-cli.cjs` export
 * would trip the typert analyzer, which only walks TypeScript sources) plus
 * an existence stat. Memoized; undefined when the layout lacks it — then the
 * bare `baf-quality …` stays an enterprise-provided PATH wrapper.
 * @returns the CLI's absolute path, or undefined when the package ships none.
 */
let cliPathCache: string | undefined
let cliPathResolved = false
export function bafQualityCliPath(): string | undefined {
  if (!cliPathResolved) {
    cliPathResolved = true
    try {
      const pkgRoot = dirname(createRequire(import.meta.url).resolve('@deepseek-ai/dsh-baf-quality/package.json'))
      const cli = join(pkgRoot, 'baf-quality-cli.cjs')
      cliPathCache = existsSync(cli) ? cli : undefined
    } catch {
      cliPathCache = undefined
    }
  }
  return cliPathCache
}

/**
 * The spawn form of a step's display command: `baf-quality …` becomes
 * `"<node>" "<cli.cjs>" …` so the run needs nothing on PATH — the display
 * contract stays `baf-quality test` and the UI is untouched. Pure.
 * @param display - the customer-facing command.
 * @param cliPath - absolute baf-quality-cli.cjs path (undefined → display unchanged).
 * @param execPath - the node executable to run the CLI under.
 * @returns the shell command to spawn.
 */
export function stageSpawnCommand(display: string, cliPath: string | undefined, execPath: string): string {
  if (cliPath === undefined || !display.startsWith('baf-quality ')) return display
  return `"${execPath}" "${cliPath}"${display.slice('baf-quality'.length)}`
}

/** One step's outcome inside a chain run. */
export interface TestFlowStepOutcome {
  /** The step id. */
  readonly stage: TestFlowStep['id']
  /** Whether the step's command passed. */
  readonly ok: boolean
  /** Whether the step was switched off (never spawned). */
  readonly skipped: boolean
  /** The customer-facing command. */
  readonly command: string
  /** The command's exit code (null when it never started). */
  readonly exitCode: number | null
  /** The command's tail output. */
  readonly output: string
  /** The step's wall-clock duration. */
  readonly durationMs: number
  /** Whether the failure means "the tool is not installed". */
  readonly toolMissing: boolean
}

/** Options for {@link runTestFlowChain}. */
export interface TestFlowChainOptions {
  /** Command executor (tests inject a deterministic one). */
  readonly executor?: QualityExecutor
  /** Per-step timeout; defaults to {@link TEST_FLOW_STAGE_TIMEOUT_MS}. */
  readonly timeoutMs?: number
  /** Cancellation signal. */
  readonly signal?: AbortSignal
  /** The format step's path argument (default `source`). */
  readonly formatPath?: string
  /** The steps to run (default: the enabled ones in canonical order). */
  readonly stages?: readonly TestFlowStep['id'][]
}

/** The chain run's result. */
export interface TestFlowChainResult {
  /** Whether every step that ran passed. */
  readonly ok: boolean
  /** The per-step outcomes, in execution order. */
  readonly steps: readonly TestFlowStepOutcome[]
  /** The sweep's wall-clock duration. */
  readonly durationMs: number
}

/** Per-step command timeout (five minutes — the enterprise toolchain's slowest step). */
export const TEST_FLOW_STAGE_TIMEOUT_MS = 300_000

/**
 * The command one step runs as — the format step keeps its raw clang-format.
 * @param stage - the step id.
 * @param formatPath - the format step's path argument.
 * @returns the shell command string.
 */
export function testFlowCommandFor(stage: TestFlowStep['id'], formatPath: string): string {
  if (stage === 'format') {
    const path = formatPath.trim() === '' ? 'source' : formatPath.trim()
    return `clang-format -i ${path}`
  }
  return testFlowStageCommand(stage)
}

/**
 * Keep the last `max` chars of a step run's combined output.
 * @param text - the raw output.
 * @param max - the cap.
 * @returns the tail.
 */
export function tailOfStageOutput(text: string, max = 1200): string {
  const trimmed = text.trim()
  return trimmed.length <= max ? trimmed : `… [前略] ${trimmed.slice(trimmed.length - max)}`
}

/**
 * 【变更】2026-10-28 (批次三十四 · 用户问题 5): run the 测试流's steps and
 * report what each one did.
 *
 * The workflow's verify stage calls this so the 测试流 actually RUNS during
 * verification (the customer filed 「测试流都没有触发」); until now only the
 * 测试流图's buttons ran it, and the verify stage merely READ the reports the
 * buttons had left behind.
 *
 * Two steps that share a command (`build`/`test` → `baf-quality test`,
 * `instrument`/`report`/`gate` → `baf-quality check`) share ONE execution:
 * the outcome is the same command's outcome, and the sweep does not pay for
 * the same toolchain twice.
 * @param workspaceRoot - absolute workspace root.
 * @param options - executor, timeout, steps.
 * @returns the per-step outcomes and the sweep's verdict.
 */
export async function runTestFlowChain(
  workspaceRoot: string,
  options: TestFlowChainOptions = {},
): Promise<TestFlowChainResult> {
  const started = Date.now()
  const toggles = readTestFlowToggles(workspaceRoot)
  const steps = options.stages ?? TEST_FLOW_CHAIN_ORDER.filter(id => toggles[id]?.enabled !== false)
  const executor = options.executor ?? shellExecutor()
  const timeoutMs = options.timeoutMs ?? TEST_FLOW_STAGE_TIMEOUT_MS
  const signal = options.signal ?? new AbortController().signal
  const cliPath = bafQualityCliPath()
  const outcomes: TestFlowStepOutcome[] = []
  const byCommand = new Map<string, Omit<TestFlowStepOutcome, 'stage'>>()
  for (const stage of steps) {
    const command = testFlowCommandFor(stage, options.formatPath ?? '')
    const shared = byCommand.get(command)
    if (shared !== undefined) {
      outcomes.push({ ...shared, stage })
      continue
    }
    const outcome = await runTestFlowStep(command, workspaceRoot, { executor, timeoutMs, signal, cliPath })
    byCommand.set(command, outcome)
    outcomes.push({ ...outcome, stage })
    if (!outcome.ok && toggles[stage]?.haltOnError !== false) break
  }
  return {
    ok: outcomes.every(outcome => outcome.ok),
    steps: outcomes,
    durationMs: Date.now() - started,
  }
}

/**
 * Run one step's command and classify the outcome.
 * @param command - the customer-facing command.
 * @param workspaceRoot - absolute workspace root.
 * @param options - executor, timeout, signal, CLI path.
 * @returns the step's outcome (the caller attaches the step id).
 */
async function runTestFlowStep(
  command: string,
  workspaceRoot: string,
  options: {
    readonly executor: QualityExecutor
    readonly timeoutMs: number
    readonly signal: AbortSignal
    readonly cliPath: string | undefined
  },
): Promise<Omit<TestFlowStepOutcome, 'stage'>> {
  const result = await options.executor(
    stageSpawnCommand(command, options.cliPath, process.execPath),
    { cwd: workspaceRoot, timeoutMs: options.timeoutMs, signal: options.signal },
  )
  const combined = `${result.stdout}\n${result.stderr}`
  const failed = result.cancelled || result.timedOut || result.spawnError !== null || result.exitCode !== 0
  return {
    ok: !failed,
    skipped: false,
    command,
    exitCode: result.exitCode,
    output: tailOfStageOutput(combined),
    durationMs: result.durationMs,
    toolMissing: failed && classifyStageToolMissing(result.spawnError ?? result.exitCode, combined, command),
  }
}

/**
 * 【变更】2026-10-29 (批次三十六 · 用户问题 9): the workspace's 测试流
 * configuration — the file's PRESENCE and its per-stage switches, read apart.
 *
 * Why the presence matters: a missing file means 「every step participates」
 * (the all-on default the canvas falls back to), but it does NOT mean the
 * customer configured a test flow. The distinction decides whether the
 * workflow OWES test-flow evidence (see {@link testFlowGated}): a workspace
 * that never touched the file is untouched by the flow, while a workspace that
 * switched the stages on asked for the flow to run.
 */
export interface TestFlowConfig {
  /** Whether `.baf/quality/test-flow.json` exists and carries a stages map. */
  readonly present: boolean
  /** The explicit per-stage rows (an absent row reads enabled). */
  readonly toggles: TestFlowToggles
}

/**
 * Read the workspace's 测试流 switches AND whether the file exists at all.
 * The file the settings canvas writes (saveQualityTestFlowToggle, post-cascade)
 * is authoritative; a missing or malformed file means every step participates
 * (the all-on default) and reads as NOT configured.
 * @param workspaceRoot - absolute workspace root.
 * @returns the configuration state.
 */
export function readTestFlowConfig(workspaceRoot: string): TestFlowConfig {
  try {
    const parsed = JSON.parse(readFileSync(
      join(workspaceRoot, '.baf', 'quality', 'test-flow.json'),
      'utf8',
    )) as { stages?: unknown } | null | undefined
    const stages = parsed === null || parsed === undefined ? undefined : parsed.stages
    if (stages === undefined || typeof stages !== 'object' || stages === null) {
      return { present: false, toggles: {} }
    }
    const toggles: Record<string, { readonly enabled: boolean; readonly haltOnError: boolean } | undefined> = {}
    for (const [id, value] of Object.entries(stages as Record<string, unknown>)) {
      if (value === null || typeof value !== 'object') continue
      const entry = value as { enabled?: unknown; haltOnError?: unknown }
      toggles[id] = {
        enabled: entry.enabled !== false,
        haltOnError: entry.haltOnError !== false,
      }
    }
    return { present: true, toggles }
  } catch {
    return { present: false, toggles: {} }
  }
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
  return readTestFlowConfig(workspaceRoot).toggles
}

/**
 * 【变更】2026-10-29 (批次三十六 · 用户问题 9): whether the customer EXPLICITLY
 * turned the 测试流 on — the workspace's `test-flow.json` carries at least one
 * stage row that is not switched off.
 *
 * The customer's complaint (「测试流使能了但没有跑」): the stages were enabled
 * in the settings canvas while the baseline's `stack.test` was still the
 * `<enterprise-tbd>` placeholder, so the workflow read the flow as "not
 * configured" and skipped it. This predicate is the second half of the gating
 * rule — the customer's explicit switch now counts.
 * @param workspaceRoot - absolute workspace root.
 * @returns true when the workspace explicitly enabled at least one stage.
 */
export function testFlowStagesEnabled(workspaceRoot: string): boolean {
  const config = readTestFlowConfig(workspaceRoot)
  if (!config.present) return false
  return Object.values(config.toggles).some(entry => entry?.enabled !== false)
}

/**
 * 【变更】2026-10-29 (批次三十六 · 用户问题 9): the evidence-producing steps
 * that are switched ON, in the canonical order — the ONE step list the verify
 * stage and the implement→verify transition both run.
 *
 * The switches decide what participates: a customer who switched the coverage
 * chain off is not asked for a coverage report. The format step is out by
 * construction (it leaves no report and rewrites the source tree).
 * @param workspaceRoot - absolute workspace root.
 * @returns the enabled evidence steps, in canonical order.
 */
export function testFlowEvidenceSteps(workspaceRoot: string): readonly TestFlowStep['id'][] {
  const toggles = readTestFlowToggles(workspaceRoot)
  return TEST_FLOW_EVIDENCE_STEPS.filter(id => toggles[id]?.enabled !== false)
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
 *
 * 【变更】2026-10-29 (批次三十六 · 用户问题 9): the customer's EXPLICIT switch
 * counts as a configuration too. The complaint (「测试流使能了但没有跑」): the
 * stages were switched on in the settings canvas while the baseline still
 * carried the `<enterprise-tbd>` placeholder, so the workflow read the flow as
 * "not configured", skipped it, and the verify verdict read 「全部通过」 without
 * a single real test. The rule is now:
 *
 * - the baseline configures a real test command → the workflow requires the
 *   evidence (unchanged), OR
 * - the workspace's `.baf/quality/test-flow.json` explicitly enables at least
 *   one stage → the workflow requires the evidence too (the customer asked for
 *   the flow; the placeholder in the baseline does not un-ask it).
 *
 * A workspace that never touched the file and kept the placeholder stays
 * untouched by the whole flow (never gate-dead).
 *
 * @param baseline - the governing baseline manifest.
 * @param workspaceRoot - absolute workspace root; omitted → the baseline alone
 *   decides (the placeholder never gates).
 * @returns true when the workflow requires test-flow evidence.
 */
export function testFlowGated(
  baseline: { readonly stack: { readonly test: string } },
  workspaceRoot?: string,
): boolean {
  if (baseline.stack.test !== QUALITY_PLACEHOLDER) return true
  return workspaceRoot !== undefined && testFlowStagesEnabled(workspaceRoot)
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
