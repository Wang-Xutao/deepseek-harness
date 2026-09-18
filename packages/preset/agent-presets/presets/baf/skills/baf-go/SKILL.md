---
name: baf-go
description: Overview of the BAF go workflow — intake classification, fixed stages, domain-owned transitions, and what the model must not claim. Use when starting or advancing a BAF change, explaining stage rules, or when the user asks how go works.
---

# BAF go workflow

BAF go is an enterprise fixed state machine owned by `WorkflowService`, not the dsh `workflow` / `tool-workflow` / `ralph` tools.

## Stages (full-go)

`intake` → `open` → `clarify` → `design` → `plan` → `implement` → `verify` → `archive`

Low-risk bugs may take `bug-fast-path` (`open` → `implement` → `verify` → `archive`) only after confirmed intake and baseline permission.

## Hard rules

1. Stage changes happen only through `WorkflowService.transition()` (slash, CLI, Tab, or `baf_stage_*` tools that call the same service).
2. Model prose, workflow script returns, and subagent completion are never transition evidence.
3. Do not write source before intake confirmation.
4. Do not invent a fourth loop beyond verify→implement, drift recovery, and fast-path upgrade to full-go.
5. Machine gates (OpenSpec validate, quality, guard) decide verify/archive readiness; your narrative cannot override them.
6. When blocked by a gate (scaffold / intake-classify / design-confirm / verify-archive / abandon / resume), call `baf_gate_ask(gateId)` (§22.9) and read the spec from `packages/baf/baf-workflow/src/gate-cards.ts` (`GATE_REGISTRY`) — render the card verbatim, never invent a third option, never propose "模型手写 scaffold" or any path outside the registry. The customer's typed agreement is not evidence; point them at the Tab button or the mapped slash command. (§22)

Node definitions, transition table, and intake rules live in `overlay/docs/enterprise-workflow.md` chapter 5. Prefer that document over inventing local variants.
