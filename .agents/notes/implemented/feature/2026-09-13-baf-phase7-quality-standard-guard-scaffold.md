# Agent Note: BAF Phase 7 — baseline-driven quality, standard, guard, scaffold

Status: implemented

English | [中文](2026-09-13-baf-phase7-quality-standard-guard-scaffold.zh.md)

## Problem

Phase 5/6 shipped the full-go chain and the fast-path/T15 escalation in `baf-workflow`, and the OpenSpec local-file adapter lives in `baf-openspec`. What remained was the **baseline-driven enforcement layer**: a stage-quality gate that respects the C toolchain the enterprise actually uses, a place for the project's coding-standard rules to surface in the prompt, a hard tool-call gate so MCP / subagent / shell sidesteps cannot bypass workflow policy, and a workspace scaffold so operators do not hand-write baseline manifests from scratch. None of those existed; the verify stage either ran generic checks or skipped quality entirely.

## Decision

Four new workspace packages under `packages/baf/`, plus a verify-stage wiring change in `baf-workflow`. Composition lives in the shipped preset's `baf-domain` isolate; a non-isolated install row delivers the per-agent tool guard.

### `baf-standard` — coding-standard summary + prompt render

`StandardSummary` (`schema: 1`) carries baseline id, source ref, availability (`'ready' | 'policy_missing'`), reason codes, areas (`{id, titleKey, sourceRef}`), and the prompt lines. `summarizeStandard(baseline)` is fail-closed: any `<enterprise-tbd>` placeholder on `standard.mattPocockRulesRef` collapses availability to `policy_missing`, and each area carries `${sourceRef}#${anchor}` so the prompt can point operators at where to replace the placeholder — never substitute defaults. `renderStandardPrompt(summary)` writes one line per area plus a closing note when `availability === 'policy_missing'`. `BafStandard` is a Cordis service named `bafStandard` with `summary()` / `renderPrompt()` / `help()`.

### `baf-quality` — C-stack quality adapter

`QualityInput { workspace, baseline, changeId }` and `QualityReport { schema: 1, baselineId, workspace, revision?, toolVersions, checks, artifacts, passed, diagnostics }` live in `baf-core/src/adapters.ts`. `createCStackAdapter({ timeoutMs?, executor? })` produces a `StackAdapter`:

- `detect(ctx)` probes the baseline's `compiler` and records `{compiler: '<version>'}` into `toolVersions` (placeholder compilers report a probe failure).
- `runQuality(input, signal)` resolves commands from `baseline.stack.build / test / analyzers[]` plus `coverage.{required, minimum}`, runs them through the shell executor (`spawn(command, { shell: true, signal, timeout, killSignal: 'SIGKILL' })`, output capped at 8 KB / 300 s defaults), and emits one `QualityCheck` per row (`kind: 'build' | 'test' | 'coverage' | 'analyzer'`, `command | null`, `passed`, `reasonCode?: 'policy_missing' | 'tool_missing' | 'timeout' | 'cancelled' | 'exit_code' | 'threshold_not_met' | 'coverage_not_reported'`, `exitCode`, `durationMs`, `output`). Placeholder commands are recorded with `passed: false` and `reasonCode: 'policy_missing'`. Coverage numeric minimums fail closed: a numeric `minimum` without a percentage in stdout gets `coverage_not_reported` (cannot silently satisfy the threshold). `passed = executed.length > 0 && checks.every(c => c.passed) && !signal.aborted` where `executed = checks.filter(c => c.kind !== 'coverage' && c.command !== null)`; an all-placeholder baseline emits `'no executable checks (all commands are policy placeholders)'` so the gate is not fooled by an empty execution set. Secret-bearing environment vars are redacted from captured output before the report is returned.

`BafQuality` is a Cordis service named `bafQuality` exposing `adapter(options)` and `help()`.

### `baf-guard` — baseline-driven tool hard gate

Two surfaces, one shared policy core in `policy.ts`:

- `GuardPolicy.check({workspace, baseline, paths, action})` — `action: 'verify'` collects structural reason codes per touched path; `action: 'secret-scan'` reads file content and reports `secret_detected` codes; `'off'` returns `allowed: true` immediately.
- `ToolGuard(execution)` (per-agent) — denies with `[baf-guard] <code>: <message>` for `write` / `edit` / `bash` / `pwsh` calls; anything else is left alone.

`adjudicateStructuralPath` covers **path** policy (traversal, workspace escape, `.git` / `.baf` system resources, protected paths from `baseline.guard.protectedPaths[]`). It runs first on every `verify` call — independent of stage. `adjudicateFsWrite` chains: structural → secret scan → active-change → intakeConfirmed → DOC_STAGES change-dir allowance → implement allowlist; anything outside the allowlist after intake confirmation is `scope_exceeded`, writes with no active change are `invalid_transition`. `adjudicateShell` denies the destructive set (`rm -rf /`, `mkfs`, `dd if=… of=/dev/…`, `shutdown|poweroff|halt|reboot`, `git push --force`) plus the indirect-write set (`>` / `>>` redirect, fd-to-file, heredoc, `tee`, `sed -i`, `perl -i`, `truncate`, `shred`, `cp`, `mv`, `rm`, `unzip`, `tar`, `wget`, `curl`). Secret scanning recognizes AWS access keys, GitHub PATs / OAuth tokens, GitLab tokens, generic `api-key = …`, Slack tokens, and PEM private-key blocks.

`projection-state.ts` reads `.baf/projection/index.json` + change log + allowlist (from `openspec/changes/<id>/plan.json` or `fastpath-ledger.json`) **on every call** — no cache, no in-process state. Corrupted tail → fail-closed: unreadable index returns `{active:false, intakeConfirmed:false, allowlist:[]}`; unreadable log for an active change returns `{active:true, intakeConfirmed:false}` so writes keep failing until the projection is repaired.

`install.ts` mirrors the `baf-workflow/commands` pattern: a non-isolated row that injects host `agents`, registers `agent/created` and `agent/disposed` listeners, and on each creation resolves the workspace from `agent.session.header.cwd ?? process.cwd()` and installs the guard via `agent.ctx.inject(['tools'], scope => scope.tools.guard(guard))`. Fiber disposal + `ctx.effect(() => async () => …)` teardown keep the guard scoped to its agent. The exported `name = 'baf-guard-install'` matches the row id the preset uses.

### `baf-scaffold` — workspace init with confirmation and backup

`planScaffold({ baselineId? })` emits `.baf/baseline.yml` (structurally valid against `parseBaselineManifest`, every enterprise-owned value as `<enterprise-tbd>` — §15 forbids defaults) and `openspec/changes/.gitkeep`. `applyScaffold(workspaceRoot, plan, at?)` is no-overwrite: missing → created, identical → skipped, divergent → renamed to `<path>.baf-backup-<iso-timestamp>` then written; the outcome separates `created` / `skipped` / `backedUp` so callers can report exactly what changed. `scaffoldWorkspace({ workspaceRoot, baselineId?, humanConfirmed, at? })` is the entry point: `humanConfirmed: false` returns `{ kind: 'refused', reason: 'human_confirmation_required' }` (the refusal is a value, not an exception — `scaffold` is in `baseline.guard.requireHumanConfirmation`). `BafScaffold` is a Cordis service named `bafScaffold` exposing `scaffold(options)` and `help()`.

### Verify-stage wiring in `baf-workflow`

`StageContextOptions` gained `stack?: StackAdapter` + `guard?: GuardPolicy`; `StagePipeline` forwards them through `createStageContext`. `buildVerifyRunner(ctx, changeId, mode, options)` runs three new rows:

- **quality**: `required: ctx.stack && ctx.baseline`, runs `ctx.stack.runQuality({workspace, baseline, changeId}, signal)`, maps each failed check into a `diagnostics` entry as `${id}:${reasonCode}`, sets `ok = report.passed`, and merges `Object.assign(options.toolVersions, report.toolVersions)` so the report carries compiler versions for the Web Tab.
- **guard**: runs `ctx.guard.check({workspace, baseline, paths: touchedPaths(), action: 'verify'}, signal)` for every touched path; reason codes roll into diagnostics and `ok = report.allowed`.
- **secret-scan**: gated on `baseline.guard.secretScan !== 'off'`; otherwise produces `ok: true` annotated as skipped.

Rows that find no wired adapter annotate `tool_unavailable` and stay `required: false` so the existing 39/39 stage tests stay green; composition decides whether the gate is required.

## Alternatives considered

### Why four separate packages instead of one `baf-platform`?

Each maps to a distinct Phase 7 §12.7 capability with its own contract surface (`StandardSummary`, `QualityReport`, `GuardReport` / `ToolGuard`, `ScaffoldOutcome`). Composing them as one package would couple the type systems and force downstream consumers to depend on all four to use any one. The Cordis isolate keys (`bafStandard / bafQuality / bafGuard / bafScaffold`) and the preset rows are already shaped to one service per package.

### Why a separate `BafGuard.policy(root)` and a `ToolGuard`, not just one?

`BafGuard.policy` answers "is this set of paths legal for action X under the current projection?" (sync, batch — used by verify and secret-scan). The per-agent `ToolGuard` answers "is this single tool call legal right now?" (sync, per-call — used by `tools.guard`). Both must read the same projection state but they are called at different cadences from different layers; collapsing them would force either verify to install per-agent guards or the agent runtime to admit a batch interface.

### Why fail-closed when projection state is unreadable, not skip?

`guard` is the last line of defense; if the projection is unparseable, the agent's audit trail is gone and the operator cannot reconstruct what was allowed. Returning `{allowed:false, reasonCodes:['intake_confirmation_required']}` forces a re-run of intake, restoring the trail. Returning `{allowed:true}` would silently widen the gate every time the file system hiccups.

### Why does `applyScaffold` rename on divergence instead of refusing or merging?

Scaffold is the operator's "give me a workspace that fits" entry point — refusing on a divergent file blocks bootstrap; merging silently loses user edits. Renaming preserves both: the operator gets the new template plus the previous content in a timestamped file with a constant suffix that grep can find.

### Why does `verify` use `touchedPaths()` from the ledger, not the diff against `sourceRevision`?

The ledger already records writes in write order with the allowlist membership adjudicated at write time. Re-diffing against the source revision would re-do the allowlist check, hide fast-path upgrades (the upgraded change's pre-implement artifacts came from the bug record), and produce a different allowlist than the gate that wrote them. Reusing the ledger keeps the gate and the verify report symmetric.

## Consequences

- Phase 7 wired into the shipped preset: `baf-domain` isolate gains four keys and four rows; the new non-isolated row reaches the host `agents` service. Roster tests assert the rows; mount tests assert that `bafStandard` (and by extension `bafQuality / bafGuard / bafScaffold`) shares one instance across sessions via the isolate.
- The verify gate is now baseline-aware: empty baseline or missing adapter → `tool_unavailable` (no false positive); enterprise-wired baseline → hard fail on toolchain regression.
- Every tool call (`write` / `edit` / `bash` / `pwsh`) is re-adjudicated against the projection on every agent. A flip in intake confirmation, in the allowlist, or in the stage policy immediately changes the gate — there is no in-process cached decision.
- Workspace scaffold refuses without explicit `humanConfirmed: true`, so `/init` (and any future slash) cannot silently overwrite user data; divergent files land as `.baf-backup-<iso>` alongside the template.
- `tsconfig.base.json` gained four path mappings; `pnpm-workspace.yaml` already picks them up via the `packages/*/*` glob. `overlay/scripts/pack-dsh.mjs` FORCE_PACKAGES now copies the four new packages into the desktop node_modules; `overlay/desktop/version-notes.json` documents them.
- Total Phase 7 footprint: 4 new packages, 4 README + 4 README.zh + 2 README.i18n.yaml (quality / guard skipped README for now — they're internal contracts; will land alongside the Web Tab in Phase 8), one preset diff, one verify-stage diff. `packages/baf` full vitest run is 17/17 files / 103/103 tests green.
- Pre-existing parallel-test flakes (Windows symlink permission + persona session-schemas) are unrelated to Phase 7; verified by running `git stash` + the same `npx vitest run` and observing the same 14 failures before any Phase 7 change.

## Followups (out of Phase 7 scope)

- Phase 8 slash / CLI / desktop IPC exposes the new services: `/status` shows `standard.policy_missing` reason codes; `/scaffold` carries the confirmation prompt; `/verify` re-runs the gate without driving a full transition.
- Web `WorkflowTabView` Remote needs `verify-report.toolVersions` and `bafStandard.summary` rendered (currently the report schema carries them; the Remote does not).
- README + README.zh for `baf-quality` and `baf-guard` (the contracts are stable; the prose is what a future contributor needs first).
- Phase 9 will wire `bafStandard.promptLines` into the agent's system-prompt build path so the standard is consulted without an explicit call.
