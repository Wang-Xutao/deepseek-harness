# Agent Note: BAF workflow Phase 5 full-go stages

Status: implemented

English | [中文](2026-09-09-baf-workflow-phase5-full-go-stages.zh.md)

## Problem

Phase 4 shipped projection/transition/intake and the workflow Tab, but no stage could actually run: nothing created OpenSpec change skeletons, wrote stage artifacts, enforced gate evidence, or archived changes. Every Phase 5+ Tab action stayed disabled and the full-go chain existed only as a state table.

## Decision

Ship the full-go chain as stage handlers plus a pipeline over `WorkflowService.transition`:

- `@deepseek-ai/dsh-baf-openspec` is a standalone package and Cordis service (`BafOpenspec`) exposing the local file-mode `OpenSpecAdapter`: skeleton creation (never overwrites), read, structural validate, atomic archive (temp dir → validate → rename). It replaces the `baf-core` unavailable stub for spec-backed changes.
- `baf-workflow/src/stages/` owns one module per node: `open` (git-revision precondition + skeleton), `clarify` (questions/decisions/acceptance, T6), `design` (cited repo paths verified to exist), `plan` (`plan.md` + structured `plan.json` with tasks/allowlist/verify commands/rollback points, T8), `implement` (task states + allowlist enforcement), `verify` (`CheckRunner` aggregating openspec-validate into `verify-report.json`), `archive` (human confirmation + T10 `checksPassed` evidence + atomic archive).
- `stages/pipeline.ts` (`StagePipeline`) is the only entry that drives transitions: it records `stage-entered`/`stage-completed`/`transition-rejected` in the projection and routes every move through the domain transition table, so model claims cannot advance a stage.
- Artifact writes (`stages/write.ts`) may overwrite template placeholders but never filled artifacts; refilled content is rejected as `invalid_transition` evidence.
- Desktop distribution packs `baf-openspec` (`pack-dsh.mjs` FORCE_PACKAGES + mustResolve) and embeds its version in `baf-product-versions.json` (`bafOpenspec` field surfaced by `/baf-version`).

Drift detection (`drift.ts`) and abandon (`abandon.ts`) from plan §5.8 were not part of the initial slice; the transition table already admitted T12/T16 but no detector wrote those events yet. They are now landed in this batch (see "5.8 addendum" below).

## Alternatives considered

### Why not keep OpenSpec handling inside baf-workflow?

Spec-file ownership (skeleton layout, validation rules, atomic archive) evolves independently of workflow orchestration and is consumed by verify/archive independently of route/projection. A separate package keeps the capability seam complete and lets `baf-core` keep only stubs.

### Why not let handlers call projection writes directly?

Every stage move must pass the domain transition table and record its event in order. Routing through `StagePipeline` → `WorkflowService.transition` keeps the append-only projection the single writer and blocks out-of-order or fabricated transitions.

### Why template-overwrite instead of delete-then-write?

Deleting skeleton files loses the template contract the OpenSpec adapter created; matching placeholder lines (`templateOnly`) preserves provenance while still refusing to clobber user-filled content.

## Consequences

- BAF composition mounts `baf-openspec` beside `baf-core`/`baf-workflow` (`isolate.bafOpenspec`).
- `baf-workflow` now depends on `@deepseek-ai/dsh-baf-openspec` (workspace).
- Desktop bump 0.0.10 embeds the full-go chain; `baf-product-versions.json` carries `bafOpenspec`.
- `tests/stages.spec.ts` covers happy-path `open → … → archive`, verify-failure return to implement, gate failures, and illegal entry rejection.
- Phase 6 begins with drift/abandon detectors; quality/guard checks remain Phase 7 stubs behind the `CheckRunner` seam.

## 5.8 addendum (same day)

- `stages/drift.ts` ships five triggers (`git-revision-changed`, `baseline-id-changed`, `baseline-content-changed`, `verify-report-stale`, `artifact-missing`); `detectAndRecord(ctx, status, observation, {record})` writes `drift-detected`. `earliestAffectedNode` maps artifact-missing back to the owning stage, otherwise the current active node, and the caller drives T13 through `decideTransition`.
- `stages/abandon.ts` exposes `driveAbandon({changeId, humanConfirmed})`: explicit confirmation writes `change-abandoned`; idempotent on retry; never deletes OpenSpec artifacts or audit history.
- `pipeline.driveDriftStage` / `driveAbandonStage` wire the new handlers; `pipeline.driveVerifyStage` executes T11 (a required-check failure records `stage-failed` and re-enters `implement`).
- A new `baseline-locked` projection event and fold field capture the immutable anchors at open time so drift detection has something to compare against for the rest of the chain.
- `tests/stages.spec.ts` adds three new cases: T11 (openspec-validate failure back to implement), drift (artifact deletion trigger + record=false probe), abandon (refusal without confirmation + idempotency).
