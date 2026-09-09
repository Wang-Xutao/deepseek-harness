---
description: "BAF go-workflow domain: route, projection, intake, transitions, and the full-go stage pipeline."
kind: "package-reference"
---

# @deepseek-ai/dsh-baf-workflow

English | [中文](README.zh.md)

Owns the BAF go-workflow domain. Phase 3: `resolveRoute()`, session `baf/route-resolved` audit, request-level `ModelSelection`. Phase 4: append-only workspace projection, transition executor, intake classifier, and `WorkflowService`. Phase 5: `src/stages/` stage handlers (open, clarify, design, plan, implement, verify, archive) plus `StagePipeline`, the only entry that drives stage transitions through the domain table. The Web Tab Remote lives in `@deepseek-ai/dsh-client-ui-baf-workflow`.

No runtime invariant companion is published because the stage pipeline routes every transition through `WorkflowService.transition`, so independent observations cannot diverge from the projection.

Mount the Cordis service only under the `bafWorkflow` isolate beside `baf-core` and `baf-openspec` in the official BAF preset.

## Model Experience

Route resolution can change the provider/model of later turns; projection events are workspace-local and not model-visible until session events are appended by callers. Stage handlers write artifacts under the change directory only; model claims never advance a stage — `StagePipeline` records entered/completed/rejected events in the projection.

## Known Limitations and Deferred Work

- Drift detection (`drift.ts`) and abandon (`abandon.ts`) are Phase 6.
- LLM-backed intake `suggest()` is heuristic in Phase 4; rule engine remains authoritative.
- Electron IPC bridge is Phase 8.
