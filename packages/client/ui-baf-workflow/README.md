---
description: "BAF go-workflow conversation Tab and Host Remote for projection/intake."
---

# @deepseek-ai/dsh-client-ui-baf-workflow

English | [中文](README.zh.md)

Conversation Tab **「工作流」** for BAF sessions: SVG flowchart of the go state machine, intake confirmation card, stage detail rail, and semi-interactive actions. Host half owns the `bafWorkflowView` Typert Remote that reads/writes workspace projection via `@deepseek-ai/dsh-baf-workflow`.

No runtime invariant companion is published because Tab state is owned by the `baf-workflow` projection; this package renders and forwards actions without diverging observations.

## Model Experience

None — presentation and Host projection I/O only; no model-visible prompts or tools.

## Known Limitations and Deferred Work

- Stage start / archive confirmation buttons are visible but disabled until Phase 5 handlers exist.
- Electron `baf:getWorkflowStatus` IPC is Phase 8; Web uses Typert Remote only.
- Tab list entry is registered for the web surface; content requires `agentPreset === baf`.
