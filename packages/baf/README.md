---
description: "BAF enterprise packages: core vocabulary, workflow, OpenSpec, quality, and guard."
kind: "subsystem"
---

# baf/

English | [中文](README.zh.md)

BAF (enterprise coding agent) domain packages. Official preset composition lives in `packages/preset/agent-presets/presets/baf/`; runtime services live here.

| Package | Role |
| --- | --- |
| [`baf-core`](baf-core/README.md) | Shared types, baseline loader, adapter contracts, `bafCore` service |
| [`baf-workflow`](baf-workflow/README.md) | Route resolver, route audit, `bafWorkflow` service (projection in Phase 4+) |

Later phases add `baf-openspec`, `baf-quality`, `baf-guard`, and related packages under this group.
