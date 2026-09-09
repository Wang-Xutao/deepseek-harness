---
description: "BAF local file-mode OpenSpec adapter: change skeleton, read, validate, and atomic archive."
kind: "package-reference"
---

# @deepseek-ai/dsh-baf-openspec

English | [中文](README.zh.md)

## Summary

`dsh-baf-openspec` implements the `OpenSpecAdapter` contract from `@deepseek-ai/dsh-baf-core` against a workspace-local OpenSpec directory (`openspec/changes/<changeId>/`). Phase 5 uses it for the `open` skeleton, stage artifact read/write, `validate` checks, and the atomic `archive` move. It never shells out: the enterprise OpenSpec CLI integration is a later phase; today's `detect()` reports the local layout as the mode.

No runtime invariant companion is published because the adapter owns no diverging observations: every caller shares the same workspace files it reads and writes.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Callers reach the adapter through `@deepseek-ai/dsh-baf-workflow` stage handlers (`driveOpen`, `driveVerify`, `driveArchive`) or directly:

```ts
import { createLocalOpenSpecAdapter } from '@deepseek-ai/dsh-baf-openspec'

const adapter = createLocalOpenSpecAdapter({ workspaceRoot: cwd })
await adapter.open({ changeId, title, workspace: { root: cwd } })
const report = await adapter.validate({ changeId, path: '' })
```

`open()` refuses to overwrite an existing change directory (`openspec_unavailable` with `exists: true` details); `archive()` moves `changes/<id>` to `archive/<id>` with a temp-dir + rename dance, so a failed archive leaves the source intact.

<a id="understand-the-implementation"></a>
## Understand the implementation

- `layout.ts` owns the frozen directory names: `openspec/changes`, `openspec/changes/archive`, and the per-stage artifact files (`clarify.md`, `design.md`, `plan.md`, `plan.json`).
- `templates.ts` ships the English skeleton bodies for `proposal.md`, `clarify.md`, `design.md`, `tasks.md`; templates are data, not logic.
- `adapter.ts` is the `OpenSpecAdapter` implementation: `detect()` checks the workspace layout, `open()` creates the skeleton, `read()` lists stage artifacts and reports which are complete, `validate()` enforces the Phase 5 structural gate (required sections present), `archive()` atomically moves the change into the archive root.
- No model calls, no process spawns, no network: this adapter is pure workspace file IO plus the shared `DomainResult` envelope.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- The real OpenSpec CLI (`baseline.openspec.cli`) is not executed; validate is structural. Wiring the enterprise CLI through a controlled executor is deferred until enterprise inputs freeze it.
- Single-process assumption: the adapter takes no cross-process file lock; projection already serializes workflow events per workspace.
