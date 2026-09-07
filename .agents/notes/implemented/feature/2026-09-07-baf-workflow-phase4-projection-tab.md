---
title: BAF Phase 4 projection, intake, and 工作流 Tab
date: 2026-09-07
status: implemented
---

# BAF Phase 4: projection + intake + 工作流 Tab

## Decision

Ship Phase 4 as domain projection/transition/intake plus a Web conversation Tab「工作流」that renders the authoritative go graph from `baf-core` (`NODE_CATALOG`, `WORKFLOW_GRAPH`, `TRANSITIONS`). Electron IPC stays in Phase 8. The Tab mounts only while the current session's `agentPreset` is `baf`. Slash help/status commands register outside the `bafDomain` isolate via `@deepseek-ai/dsh-baf-workflow/commands`. Settings formerly labeled「工作流」for the Trace Graph switch are renamed「轨迹图」so the two features stay distinct.

## Why

Users need a single visual place to see every stage, live status, skip reasons, OpenSpec cut codes, and semi-interactive confirm/transition actions without inventing a second state machine in the UI. Host Typert Remote `bafWorkflowView` reads/writes `<cwd>/.baf/projection/` through the same `ProjectionStore` the agent isolate uses.

## Surfaces

- `packages/baf/baf-core`: catalog, graph, tab-view model
- `packages/baf/baf-workflow`: projection store, intake, transition, workflow service; slash plugin `@deepseek-ai/dsh-baf-workflow/commands` (non-isolated preset row)
- `packages/client/ui-baf-workflow`: Host Remote + flowchart Tab (theme tokens; BAF-preset-only tab registration)
- `overlay/docs/help/baf-mode.md`: end-user help
- `overlay/docs/enterprise-workflow.md`: progress + Phase 4 confirmation
