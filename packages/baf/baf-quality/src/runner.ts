/**
 * QualityRunner: baseline-driven build/test/coverage/analyzer execution with
 * per-check timeout, cancellation, structured failure reasons, output
 * truncation, and secret redaction (enterprise-workflow §8.5, §12.7.1).
 *
 * Fail-closed semantics throughout: a placeholder command is `policy_missing`
 * (never a Ceeding/default command substitution, §15); coverage that must be
 * measured but is not reported fails the report; every check decides pass/fail
 * on structured reasons, not on string matching in diagnostics.
 * @module @deepseek-ai/dsh-baf-quality/runner
 */

import { spawn } from 'node:child_process'
import type {
  AdapterContext,
  BaselineManifest,
  QualityInput,
  QualityReport,
  StackAdapter,
  StackDetection,
} from '@deepseek-ai/dsh-baf-core'

/** Baseline placeholder value enterprises must replace. */
export const QUALITY_PLACEHOLDER = '<enterprise-tbd>'

/** Default per-check wall-clock budget. */
export const DEFAULT_CHECK_TIMEOUT_MS = 300_000

/** Captured output kept per stream before truncation. */
export const MAX_CAPTURED_CHARS = 8_000

/** Structured quality check entry stored in {@link QualityReport.checks}. */
export interface QualityCheck {
  readonly id: string
  readonly kind: 'build' | 'test' | 'coverage' | 'analyzer'
  readonly command: string | null
  readonly passed: boolean
  /** Structured failure reason; undefined when passed or skipped. */
  readonly reasonCode:
    | 'policy_missing'
    | 'tool_missing'
    | 'timeout'
    | 'cancelled'
    | 'exit_code'
    | 'threshold_not_met'
    | 'coverage_not_reported'
    | undefined
  readonly exitCode: number | null
  readonly durationMs: number
  /** Truncated + redacted combined output for diagnostics. */
  readonly output: string
}

/** One executed command's raw outcome (pre-truncation). */
export interface QualityCommandResult {
  readonly command: string
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number | null
  readonly timedOut: boolean
  readonly cancelled: boolean
  readonly spawnError: string | null
  readonly durationMs: number
}

/** Executor abstraction so tests can inject deterministic outcomes. */
export type QualityExecutor = (
  command: string,
  options: { readonly cwd: string; readonly timeoutMs: number; readonly signal: AbortSignal },
) => Promise<QualityCommandResult>

/** Options for {@link createCStackAdapter}. */
export interface CStackAdapterOptions {
  /** Per-check timeout; defaults to {@link DEFAULT_CHECK_TIMEOUT_MS}. */
  readonly timeoutMs?: number
  /** Executor override (tests). */
  readonly executor?: QualityExecutor
}

const SECRET_PATTERNS: readonly RegExp[] = [
  /AKIA[0-9A-Z]{16}/g,
  /\bghp_[A-Za-z0-9]{30,}\b/g,
  /\bgho_[A-Za-z0-9]{30,}\b/g,
  /\bglpat-[A-Za-z0-9\-_]{16,}\b/g,
  /\bsk-[A-Za-z0-9]{16,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9\-]{10,}\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
]

/** Redact common credential shapes from text stored into reports. */
export function redactSecrets(text: string): string {
  let out = text
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, '[REDACTED]')
  return out
}

/** Cap captured output length with an explicit truncation marker. */
export function truncateOutput(text: string, max = MAX_CAPTURED_CHARS): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n… [truncated ${text.length - max} chars]`
}

function isPlaceholder(value: string): boolean {
  return value.trim() === QUALITY_PLACEHOLDER
}

/**
 * Real executor: runs baseline-provided command strings through the shell in
 * the workspace root, enforcing timeout and abort.
 */
export function shellExecutor(): QualityExecutor {
  return async (command, options) => {
    const started = Date.now()
    return await new Promise<QualityCommandResult>((resolveRun) => {
      const child = spawn(command, {
        shell: true,
        cwd: options.cwd,
        windowsHide: true,
        signal: options.signal,
        timeout: options.timeoutMs,
        killSignal: 'SIGKILL',
      })
      let stdout = ''
      let stderr = ''
      let timedOut = false
      let cancelled = false
      let settled = false
      child.stdout?.on('data', (chunk: Buffer) => {
        if (stdout.length < MAX_CAPTURED_CHARS * 4) stdout += String(chunk)
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderr.length < MAX_CAPTURED_CHARS * 4) stderr += String(chunk)
      })
      child.once('error', (err) => {
        if (settled) return
        settled = true
        resolveRun({
          command,
          stdout,
          stderr,
          exitCode: null,
          timedOut: false,
          cancelled: false,
          spawnError: err.message,
          durationMs: Date.now() - started,
        })
      })
      child.once('close', (code, signal) => {
        if (settled) return
        settled = true
        timedOut = signal === 'SIGKILL' && Date.now() - started >= options.timeoutMs - 250
        cancelled = options.signal.aborted
        resolveRun({
          command,
          stdout,
          stderr,
          exitCode: code,
          timedOut,
          cancelled,
          spawnError: null,
          durationMs: Date.now() - started,
        })
      })
    })
  }
}

function commandFailureReason(result: QualityCommandResult): QualityCheck['reasonCode'] {
  if (result.cancelled) return 'cancelled'
  if (result.timedOut) return 'timeout'
  if (result.spawnError !== null) return 'tool_missing'
  return 'exit_code'
}

function combine(result: QualityCommandResult): string {
  return truncateOutput(redactSecrets(
    result.stderr.length > 0 ? `${result.stdout}\n${result.stderr}` : result.stdout,
  ))
}

/**
 * Parse a coverage percentage from tool output. Understands gcovr
 * (`lines: 82.3%`), lcov-style summaries (`lines......: 82.3%`), and generic
 * `coverage: 82.3%` markers.
 * @returns percentage 0–100 or undefined when not reported.
 */
export function parseCoveragePercent(text: string): number | undefined {
  const patterns: readonly RegExp[] = [
    /\blines[^\d\n]*:?\s*\.?\s*(\d+(?:\.\d+)?)\s*%/i,
    /\bcoverage[^\d\n]*:?\s*(\d+(?:\.\d+)?)\s*%/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1] === undefined) continue
    const value = Number(match[1])
    if (Number.isFinite(value) && value >= 0 && value <= 100) return value
  }
  return undefined
}

interface CheckSpec {
  readonly id: string
  readonly kind: QualityCheck['kind']
  readonly command: string
}

interface CoverageSpec {
  readonly required: boolean
  readonly minimum: number | 'project-config' | string
}

function deriveCheckSpecs(baseline: BaselineManifest): {
  commands: readonly CheckSpec[]
  coverage: CoverageSpec
} {
  const { stack } = baseline
  const commands: CheckSpec[] = []
  if (!isPlaceholder(stack.build)) commands.push({ id: 'build', kind: 'build', command: stack.build })
  if (!isPlaceholder(stack.test)) commands.push({ id: 'test', kind: 'test', command: stack.test })
  for (const analyzer of stack.analyzers) {
    if (isPlaceholder(analyzer)) continue
    commands.push({ id: `analyzer:${analyzer}`, kind: 'analyzer', command: analyzer })
  }
  return {
    commands,
    coverage: { required: stack.coverage.required, minimum: stack.coverage.minimum },
  }
}

async function runQualityReport(
  input: QualityInput,
  options: Required<Pick<CStackAdapterOptions, 'timeoutMs'>> & {
    executor: QualityExecutor
    signal: AbortSignal
  },
): Promise<QualityReport> {
  const { baseline, workspace } = input
  const timeoutMs = options.timeoutMs
  const executor = options.executor
  const signal = options.signal
  const { commands, coverage } = deriveCheckSpecs(baseline)
  const checks: QualityCheck[] = []
  const diagnostics: string[] = []

  // Placeholder commands are recorded as policy_missing checks (fail-closed).
  const placeholderKinds: { id: string; kind: QualityCheck['kind']; command: string }[] = []
  if (isPlaceholder(baseline.stack.build)) placeholderKinds.push({ id: 'build', kind: 'build', command: baseline.stack.build })
  if (isPlaceholder(baseline.stack.test)) placeholderKinds.push({ id: 'test', kind: 'test', command: baseline.stack.test })
  for (const analyzer of baseline.stack.analyzers) {
    if (isPlaceholder(analyzer)) placeholderKinds.push({ id: `analyzer:${analyzer}`, kind: 'analyzer', command: analyzer })
  }
  for (const spec of placeholderKinds) {
    checks.push({
      id: spec.id,
      kind: spec.kind,
      command: null,
      passed: false,
      reasonCode: 'policy_missing',
      exitCode: null,
      durationMs: 0,
      output: '',
    })
  }

  const toolVersions: Record<string, string> = {}
  if (!isPlaceholder(baseline.stack.compiler)) {
    const probe = await executor(`${baseline.stack.compiler} --version`, {
      cwd: workspace.root,
      timeoutMs: Math.min(timeoutMs, 30_000),
      signal: new AbortController().signal,
    })
    const versionLine = `${probe.stdout}${probe.stderr}`.split(/\r?\n/).find(line => line.trim().length > 0)
    if (probe.exitCode === 0 && versionLine !== undefined) {
      toolVersions[baseline.stack.compiler] = versionLine.trim()
    } else {
      diagnostics.push(`compiler probe failed: ${baseline.stack.compiler}`)
    }
  }

  let combinedCoverageText = ''
  for (const spec of commands) {
    if (signal.aborted) break
    const result = await executor(spec.command, { cwd: workspace.root, timeoutMs, signal })
    combinedCoverageText += `${result.stdout}\n${result.stderr}\n`
    const failed = result.cancelled || result.timedOut || result.spawnError !== null || result.exitCode !== 0
    checks.push({
      id: spec.id,
      kind: spec.kind,
      command: spec.command,
      passed: !failed,
      reasonCode: failed ? commandFailureReason(result) : undefined,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      output: combine(result),
    })
  }

  // Coverage gate: fail-closed when required and numerically bounded.
  if (coverage.required) {
    if (typeof coverage.minimum === 'number') {
      const percent = parseCoveragePercent(combinedCoverageText)
      if (percent === undefined) {
        checks.push({
          id: 'coverage',
          kind: 'coverage',
          command: null,
          passed: false,
          reasonCode: 'coverage_not_reported',
          exitCode: null,
          durationMs: 0,
          output: '',
        })
      } else {
        const met = percent >= coverage.minimum
        checks.push({
          id: 'coverage',
          kind: 'coverage',
          command: null,
          passed: met,
          reasonCode: met ? undefined : 'threshold_not_met',
          exitCode: null,
          durationMs: 0,
          output: `coverage ${percent.toFixed(2)}% (minimum ${coverage.minimum}%)`,
        })
      }
    } else {
      // 'project-config' or enterprise string: informational presence check.
      checks.push({
        id: 'coverage',
        kind: 'coverage',
        command: null,
        passed: true,
        reasonCode: undefined,
        exitCode: null,
        durationMs: 0,
        output: `coverage threshold delegated to project config (${String(coverage.minimum)})`,
      })
    }
  }

  const executed = checks.filter(check => check.kind !== 'coverage' && check.command !== null)
  const passed = executed.length > 0
    && checks.every(check => check.passed)
    && !signal.aborted
  if (executed.length === 0) diagnostics.push('no executable checks (all commands are policy placeholders)')
  if (signal.aborted) diagnostics.push('quality run cancelled')

  const report: QualityReport = {
    schema: 1,
    baselineId: baseline.baselineId,
    workspace: workspace.root,
    ...(workspace.git?.revision !== undefined ? { revision: workspace.git.revision } : {}),
    toolVersions,
    checks,
    artifacts: [],
    passed,
    diagnostics,
  }
  return report
}

/**
 * Create the C-stack quality adapter from runner options.
 * @param options - timeout/executor overrides.
 * @returns a {@link StackAdapter} whose runQuality executes baseline checks.
 */
export function createCStackAdapter(options: CStackAdapterOptions = {}): StackAdapter {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS
  const executor = options.executor ?? shellExecutor()
  return {
    async detect(ctx: AdapterContext): Promise<StackDetection> {
      const compiler = ctx.baseline?.stack.compiler
      if (compiler === undefined) return { available: false, detail: 'no baseline loaded' }
      if (isPlaceholder(compiler)) return { available: false, detail: `compiler is ${QUALITY_PLACEHOLDER}` }
      const probe = await executor(`${compiler} --version`, {
        cwd: ctx.workspace.root,
        timeoutMs: Math.min(timeoutMs, 30_000),
        signal: ctx.signal ?? new AbortController().signal,
      })
      const versionLine = `${probe.stdout}${probe.stderr}`.split(/\r?\n/).find(line => line.trim().length > 0)
      if (probe.exitCode === 0 && versionLine !== undefined) {
        return { available: true, compiler, detail: versionLine.trim() }
      }
      return { available: false, compiler, detail: probe.spawnError ?? `probe exit ${String(probe.exitCode)}` }
    },
    async runQuality(input: QualityInput, signal: AbortSignal): Promise<QualityReport> {
      return runQualityReport(input, { timeoutMs, executor, signal })
    },
  }
}
