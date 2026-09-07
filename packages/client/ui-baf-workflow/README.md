---
description: "BAF go-workflow conversation Tab and Host Remote for projection/intake."
---

# @deepseek-ai/dsh-client-ui-baf-workflow

Conversation Tab **「工作流」** for BAF sessions: SVG flowchart of the go state machine, intake confirmation card, stage detail rail, and semi-interactive actions. Host half owns the `bafWorkflowView` Typert Remote that reads/writes workspace projection via `@deepseek-ai/dsh-baf-workflow`.

## Model Experience

None — presentation and Host projection I/O only; no model-visible prompts or tools.

## Known Limitations and Deferred Work

- Stage start / archive confirmation buttons are visible but disabled until Phase 5 handlers exist.
- Electron `baf:getWorkflowStatus` IPC is Phase 8; Web uses Typert Remote only.
- Tab list entry is registered for the web surface; content requires `agentPreset === baf`.
