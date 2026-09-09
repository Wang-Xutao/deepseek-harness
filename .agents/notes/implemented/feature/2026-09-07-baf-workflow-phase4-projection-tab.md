# Agent Note: BAF workflow Phase 4 projection, intake, and 工作流 Tab

Status: implemented

English | [中文](2026-09-07-baf-workflow-phase4-projection-tab.zh.md)

## Problem

Phase 3 froze routes, but BAF had no durable per-change state, no intake classification gate, and no user-visible surface for the go state machine: stage status, skip reasons, and legal transitions existed only as design tables, so a session could not confirm an intake decision or see where a change stood.

## Decision

Ship Phase 4 as domain projection/transition/intake plus a Web conversation Tab「工作流」that renders the authoritative go graph from `baf-core` (`NODE_CATALOG`, `WORKFLOW_GRAPH`, `TRANSITIONS`). Electron IPC stays in Phase 8. The Tab mounts only while the current session's `agentPreset` is `baf`. Slash help/status commands register outside the `bafDomain` isolate via `@deepseek-ai/dsh-baf-workflow/commands`. Settings formerly labeled「工作流」for the Trace Graph switch are renamed「轨迹图」so the two features stay distinct.

Host Typert Remote `bafWorkflowView` reads/writes `<cwd>/.baf/projection/` through the same `ProjectionStore` the agent isolate uses: single writer, atomic rename, replayable event log.

Surfaces:

- `packages/baf/baf-core`: catalog, graph, tab-view model
- `packages/baf/baf-workflow`: projection store, intake, transition, workflow service; slash plugin `@deepseek-ai/dsh-baf-workflow/commands` (non-isolated preset row)
- `packages/client/ui-baf-workflow`: Host Remote + flowchart Tab (theme tokens; BAF-preset-only tab registration)
- `overlay/docs/help/baf-mode.md`: end-user help
- `overlay/docs/enterprise-workflow.md`: progress + Phase 4 confirmation

## Alternatives considered

### Why not Electron IPC for the Tab data?

Electron IPC would duplicate the transport the Web client already owns and fork status reads per shell. The Typert Remote rides the existing session-scoped channel, so browser-only deployments get the Tab for free; IPC remains a Phase 8 additive surface.

### Why not render the graph from live agent state?

Live agent state is reconstructable only from the projection; rendering from anything else would invent a second state machine. The append-only projection under `<cwd>/.baf/` is the single writer both the isolate and the Tab read.

## Consequences

- The Tab is read/confirm/transition only; stage execution buttons stay disabled until Phase 5 ships the pipeline.
- Trace Graph settings copy renamed to「轨迹图」; two tabs coexist with distinct responsibilities.
