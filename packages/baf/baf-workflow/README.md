---
description: "BAF go-workflow domain: route, projection, intake, transitions."
---

# @deepseek-ai/dsh-baf-workflow

Owns the BAF go-workflow domain. Phase 3: `resolveRoute()`, session `baf/route-resolved` audit, request-level `ModelSelection`. Phase 4: append-only workspace projection, transition executor, intake classifier, and `WorkflowService`. The Web Tab Remote lives in `@deepseek-ai/dsh-client-ui-baf-workflow`.

Mount the Cordis service only under the `bafWorkflow` isolate beside `baf-core` in the official BAF preset.

## Model Experience

Route resolution can change the provider/model of later turns; projection events are workspace-local and not model-visible until session events are appended by callers.

## Known Limitations and Deferred Work

- Stage handlers (open…archive) land in Phase 5.
- LLM-backed intake `suggest()` is heuristic in Phase 4; rule engine remains authoritative.
- Electron IPC bridge is Phase 8.
