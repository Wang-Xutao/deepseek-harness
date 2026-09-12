# @deepseek-ai/dsh-baf-quality

BAF quality runner and C-stack `StackAdapter` (Phase 7.1 of the
enterprise-workflow contract): baseline-driven `build` / `test` /
`coverage` / `analyzer` execution with per-check timeout, cancellation,
structured failure reasons, output truncation, and secret redaction.

English | [中文](README.zh.md)

## Why

The verify stage needs to know whether the change broke the C toolchain
the enterprise actually uses. The commands, the compiler, the coverage
threshold all live in `baseline.stack.*` — the runner reads them, runs
them with a hard per-check wall-clock budget, and emits a structured
`QualityReport` whose `passed` flag is computed from structured reasons,
never from free-text diagnostics. Placeholder commands and missing
coverage reports fail closed.

## What it does

`createCStackAdapter(options)` returns a `StackAdapter` with two methods:

- `detect(ctx)` — probes `baseline.stack.compiler` (e.g. `gcc --version`)
  and records `{compiler: '<version>'}` into `toolVersions`. Placeholder
  compilers are recorded as a probe failure in `diagnostics`.
- `runQuality(input, signal)` — reads
  `baseline.stack.{build, test, analyzers[]}` and `coverage.{required,
  minimum}`, runs each command through the shell executor (default
  `spawn(command, { shell: true, signal, timeout, killSignal: 'SIGKILL' })`,
  300 s per check, output capped at 8 KB / stream), and emits one
  `QualityCheck` per row:

  | kind     | where the command comes from                            |
  | -------- | ------------------------------------------------------- |
  | `build`  | `baseline.stack.build`                                  |
  | `test`   | `baseline.stack.test`                                   |
  | `analyzer` | each entry of `baseline.stack.analyzers[]`            |
  | `coverage` | none — derived from the combined captured stdout/stderr |

  Each check carries `passed: boolean`, a `reasonCode` (`'policy_missing' |
  'tool_missing' | 'timeout' | 'cancelled' | 'exit_code' |
  'threshold_not_met' | 'coverage_not_reported' | undefined`),
  `exitCode`, `durationMs`, and truncated + redacted `output`. AWS access
  keys, GitHub PATs / OAuth tokens, GitLab tokens, Slack tokens, generic
  `api-key = …` markers, and PEM private-key blocks are all redacted.

The final `passed` flag is:

```ts
executed.length > 0
  && checks.every(c => c.passed)
  && !signal.aborted
```

where `executed = checks.filter(c => c.kind !== 'coverage' && c.command !== null)`.
An all-placeholder baseline emits `'no executable checks (all commands are
policy placeholders)'` so the gate is not fooled by an empty execution set.
Coverage numeric minimums fail closed: a numeric `minimum` whose tool output
contains no percentage gets `coverage_not_reported` (cannot silently satisfy
the threshold). `'project-config'` / enterprise strings are treated as
informational and pass.

`BafQuality` is a Cordis service named `bafQuality`. Its `Config.checkTimeoutMs`
defaults to 300 000 ms; `adapter(options)` builds an adapter with that
timeout applied to every check.

## API

```ts
import { createCStackAdapter, BafQuality } from '@deepseek-ai/dsh-baf-quality'
import type { QualityCheck, QualityReport, QualityExecutor } from '@deepseek-ai/dsh-baf-quality'
```

- `createCStackAdapter({ timeoutMs?, executor? })` → `StackAdapter`
- `BafQuality` (Cordis service, name `bafQuality`, config `checkTimeoutMs`)
- `parseCoveragePercent(text)` — extract a 0–100 percentage from gcovr
  (`lines: 82.3%`), lcov (`lines......: 82.3%`), or generic `coverage: 82.3%`
  output
- `redactSecrets(text)` / `truncateOutput(text, max?)` — pure helpers
- `shellExecutor()` — production `QualityExecutor` (uses `spawn` because
  baseline commands are enterprise-owned strings, not user input; see
  `src/runner.ts` for the security rationale)
- `QUALITY_PLACEHOLDER` — `<enterprise-tbd>` sentinel
- `DEFAULT_CHECK_TIMEOUT_MS` (300 000), `MAX_CAPTURED_CHARS` (8 000)

## Tests

```bash
npx vitest run packages/baf/baf-quality
```

The suite uses a fake `QualityExecutor` to script deterministic outcomes
(timeout, exit code, coverage percentage) without ever spawning a real
process.
