# @deepseek-ai/dsh-baf-scaffold

BAF workspace scaffold (Phase 7.4 of the enterprise-workflow contract):
the `init` skeleton — baseline template + OpenSpec layout — with human
confirmation, no-overwrite semantics, and timestamped backups.

English | [中文](README.zh.md)

## Why

The workspace must carry a baseline (`open` → `plan` → `verify` → `archive`)
and an OpenSpec change root before any workflow stage can run. Operators
rarely hand-write this layout: they ask the entry to scaffold it. The
scaffold must never silently overwrite existing work, and any operator
action that mutates the workspace is in the baseline's
`guard.requireHumanConfirmation` list.

## What it does

`BafScaffold.scaffold(options)` lays down:

- `.baf/baseline.yml` — a baseline manifest structurally valid against
  `parseBaselineManifest`, with every enterprise-owned value stamped as
  `<enterprise-tbd>` (enterprise-workflow §15: the scaffold never guesses
  enterprise policy).
- `openspec/changes/.gitkeep` — guarantees the change directory exists
  before any stage writes a change.

For each planned file:

- file does not exist → **created**
- file exists with identical content → **skipped**
- file exists with different content → moved to
  `<path>.baf-backup-<iso-timestamp>` then re-written (**backedUp**)

The result distinguishes the three outcomes so callers can report
exactly what happened.

## Human confirmation

`BafScaffold.scaffold({ humanConfirmed: false })` returns

```ts
{ kind: 'refused', reason: 'human_confirmation_required' }
```

The refusal is a value, not an exception — callers (CLI / agent) decide
how to surface it.

## API

```ts
import { scaffoldWorkspace, planScaffold, applyScaffold, baselineTemplate } from '@deepseek-ai/dsh-baf-scaffold'
```

- `planScaffold({ baselineId? })` → `ScaffoldPlan`
- `applyScaffold(workspaceRoot, plan, at?)` → `ScaffoldChanges`
- `scaffoldWorkspace({ workspaceRoot, baselineId?, humanConfirmed, at? })`
  → `ScaffoldOutcome`
- `BafScaffold` (Cordis service, name `bafScaffold`)
- `baselineTemplate(baselineId)` — pure helper that renders the YAML text

## Tests

```bash
npx vitest run packages/baf/baf-scaffold
```
