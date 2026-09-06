---
description: "BAF enterprise core: shared types, baseline loader, adapter contracts, and the bafCore Cordis service."
kind: "package-reference"
---

# @deepseek-ai/dsh-baf-core

English | [中文](README.zh.md)

## Summary

`dsh-baf-core` is the shared vocabulary and registration point for BAF enterprise mode. It loads and validates enterprise baselines, exposes adapter contracts (OpenSpec, C stack, guard, workflow), and ships Phase 2 unavailable stubs so later phases can fail loudly without real tools. Mount it only under the `bafCore` isolate in the official BAF preset.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Compose `@deepseek-ai/dsh-baf-core` inside an entry-local `cordis:group` with `isolate.bafCore: true`. Call `ctx.bafCore.loadBaseline(path)` after mount when a workspace baseline is available. Read `version()`, `doctor()`, and `help()` for status surfaces. Do not use the unavailable adapters as success paths.

<a id="understand-the-implementation"></a>
## Understand the implementation

- Types: intake, workflow nodes/transitions, projection events, domain results, errors.
- `baseline.ts`: zod schema + semantic checks (allowed routes, fallback groups, BAF version range).
- `adapters.ts`: stable interfaces + unavailable stubs.
- Service key: `bafCore`.

Frozen schemas live under `schema/`. Fixture baseline: `tests/fixtures/baseline/baseline.yml`.

<a id="dev-note"></a>
## Dev Note

Workflow state machine, OpenSpec execution, and ToolGuard land in later BAF packages. This package must not execute external tools or write projection events.
