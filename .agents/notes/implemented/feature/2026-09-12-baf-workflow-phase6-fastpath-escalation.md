# Agent Note: BAF workflow Phase 6 bug fast-path and T15 escalation

Status: implemented

English | [中文](2026-09-12-baf-workflow-phase6-fastpath-escalation.zh.md)

## Problem

Phase 5 shipped the full-go chain, but the projection already classified low-risk bug fixes as `bug-fast-path` and folded them with `openspecSkipped` — nothing could actually drive that mode: no fast-path open existed, T5/T15 sat in the transition table without callers, and the implement gate hardcoded `mode: 'full-go'` (a latent bug for any future fast-path drive).

## Decision

Ship the fast path as two stage modules plus pipeline wiring, all adjudicated by the same domain table:

- `stages/fastpath.ts`: `driveFastPathOpen` writes `bug-record.md` (problem / root cause / impact scope / regression test / workspace anchors) and a fast-path `plan.json` ledger whose first task is `regression-test`. No OpenSpec skeleton is created. `rootCauseRecorded` reads the root-cause section back from the record — T5 evidence is machine-derived, never a caller assertion. A missing Git revision warns in the record instead of blocking (full-go open blocks).
- Regression-test-first is enforced at `recordTouched` time (`assertRegressionFirst` runs after the allowlist check and before the write): a fix-file write before the regression task is done throws `invalid_transition` with `reasonCodes: ['regression_test_required']`. Refusing at write time keeps the violation recoverable; the gate re-checks membership structurally over the durable ledger as defense in depth.
- `stages/escalate.ts`: `driveEscalate` adjudicates T15 **while the mode is still bug-fast-path**, then appends `stage-failed(implement)` → `mode-upgraded` → installs the OpenSpec backfill → `stage-entered(clarify)`. Ordering is a hard constraint: the `mode-upgraded` fold flips the mode to full-go, and T15 is mode-filtered to bug-fast-path — adjudicating after the event would find no edge.
- Escalation preserves audit: `plan.json` is renamed to `fastpath-ledger.json` so the backfilled plan stage can write a fresh ledger without clobbering the fast-path trail; `proposal.md` is prefilled with the bug context (Why / Problem / Root cause extracted from the bug record) so the upgraded change is a real full-go change and verify's openspec-validate stays meaningful.
- Two trigger paths: automatic (pipeline `driveImplementStage` pre-checks `scopeGrowthFiles` — touched files outside the allowlist — and escalates with a structural cause) and explicit (`driveEscalateStage` for semantic causes such as public-API impact).
- `pipeline.enterStage` gained an idempotent resume (`current === to && nodes[to] === 'in-progress'` → skip adjudication): escalate already records `stage-entered(clarify)`, and re-adjudicating the self-edge would reject on a transition that does not exist in the table.
- Mode-aware verify: `buildVerifyRunner(ctx, changeId, mode)` swaps the required check — fast-path gates on `regression-test` (structural verdict over the ledger) and degrades `openspec-validate` to a non-required row annotated with the intake reason codes ("未走 OpenSpec"). `VerifyReport` carries `mode`. `driveImplementComplete` now derives mode from the projection instead of hardcoding full-go.

## Alternatives considered

### Why reuse `openspec/changes/<id>/` for fast-path artifacts instead of a separate directory?

Archive, drift detection, and the Web Tab all resolve artifacts through the change directory; a parallel layout would fork every consumer for one mode. The bug record plus a `fastPath`-flagged ledger distinguishes the modes without new path rules.

### Why enforce regression-first at recordTouched instead of gate time?

The touched list is append-only in write order; a gate-time check could only reject after the violating write already happened, leaving an unrecoverable order. Refusing the write keeps the ordering rule satisfiable, and the gate re-check remains as belt-and-braces.

### Why rename plan.json aside instead of extending the same ledger after upgrade?

The backfilled plan stage writes its own ledger through `writeArtifact`, which refuses to clobber non-template content. Renaming preserves the fast-path ledger byte-for-byte as audit and gives the full-go plan a clean, honest artifact.

## Consequences

- Fast-path changes run intake → fast-path open → implement (T5) → verify → archive without OpenSpec artifacts; `driveOpenStage` refuses them and `driveFastPathOpenStage` refuses full-go changes.
- Post-upgrade chains backfill clarify → design → plan → implement → verify → archive; completed fast-path stages (open) survive the upgrade with their artifacts.
- `VERIFY_CHECK_NAMES` was removed (zero consumers; the check set is now mode-scoped).
- `tests/fastpath.spec.ts` adds 8 cases: full chain, Git-missing warning, T5 refusal without root cause, full-go-drive refusal on fast-path, regression-first refusal + recovery, auto-escalation on scope growth, escalation refusal outside fast-path implement, and the full post-upgrade backfill. `packages/baf` suite: 56/56 green.
- The regression-test verify row is structural; executing the declared test command live arrives with Phase 7's QualityRunner. Phase 7/8 (ToolGuard, slash/status) remain the MVP gap per plan §17.4.
