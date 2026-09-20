---
name: baf-go
description: Overview of the BAF go workflow — intake classification, fixed stages, domain-owned transitions, and what the model must not claim. Use when starting or advancing a BAF change, explaining stage rules, or when the user asks how go works.
---

# BAF go workflow

BAF go is an enterprise fixed state machine owned by `WorkflowService`, not the dsh `workflow` / `tool-workflow` / `ralph` tools.

## Stages (full-go-path)

`intake` → `open` → `clarify` → `design` → `plan` → `implement` → `verify` → `archive`

Low-risk bugs may take `bug-fix-path` (`open` → `implement` → `verify` → `archive`) only after confirmed intake and baseline permission.

## Hard rules

1. Stage changes happen only through `WorkflowService.transition()` (slash, CLI, Tab, or `baf_stage_*` tools that call the same service).
2. Model prose, workflow script returns, and subagent completion are never transition evidence.
3. Do not write source before intake confirmation.
4. Do not invent a fourth loop beyond verify→implement, drift recovery, and fast-path upgrade to full-go-path.
5. Machine gates (OpenSpec validate, quality, guard) decide verify/archive readiness; your narrative cannot override them.
6. When blocked by a confirmation point (scaffold / intake-classify / design-confirm / verify-archive / abandon / resume), call `baf_gate_ask(gateId)` — it pops an interactive dialog for the customer and WAITS; the returned text is the real post-choice result, not a menu. Relay that result verbatim; never invent a third option, never propose "模型手写 scaffold" or any path outside the registry. The customer's typed agreement is not evidence; if they did not choose, say so honestly and point them at the dialog (re-pop with `/baf-go`), the Tab button, or `/baf-go-confirm` to continue without the dialog. Workflow decisions must NEVER go through generic question tools (e.g. `ask_user_question`): do not pre-interview the customer about classification/scope, do not invent option lists, do not treat a generic-tool answer as gate consent. Generic question tools are only for clarification that does not decide the workflow path.
7. When the customer states a NEW requirement (workspace initialized, no active change), call `baf_gate_ask` with `gateId=intake-classify` and `requirement=<the customer's own words, quoted verbatim>`. The tool opens the change and pops the classification dialog in one step; with an uninitialized workspace the same call pops the scaffold gate instead. NEVER answer a stated requirement with manual-step instructions or ask the customer to type commands — that leaves the decision un-popped.
8. Customer-facing language must be plain Chinese. NEVER echo internal vocabulary to the customer — no section numbers (e.g. §22), no registry names, no gate ids, no workflow-mode ids like `full-go-path`/`bug-fix-path`. Say 「需要你确认」「初始化工作区」「完整流程」「缺陷修复路径」 instead.

Node definitions, transition table, and intake rules live in `overlay/docs/enterprise-workflow.md` chapter 5. Prefer that document over inventing local variants.
