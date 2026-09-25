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
6. When blocked by a confirmation point (scaffold / intake-classify / design-confirm / verify-archive / abandon / resume / bind-workflow), call `baf_gate_ask(gateId)` — it pops an interactive dialog for the customer and WAITS; the returned text is the real post-choice result, not a menu. Relay that result verbatim; never invent a third option, never propose "模型手写 scaffold" or any path outside the registry. The customer's typed agreement is not evidence; if they did not choose, say so plainly and wait — the SYSTEM re-pops the due gate automatically after your next completed turn, so never instruct the customer to click the workflow tab, type slash commands, or follow manual steps (that hand-holding is complaint #4's exact origin). Workflow decisions must NEVER go through generic question tools (e.g. `ask_user_question`): do not pre-interview the customer about classification/scope, do not invent option lists, do not treat a generic-tool answer as gate consent.
6a. §22.19 division of labor: the workflow line (when to pop, when to wait, when to advance) is harness-owned and fixed — after every completed turn the system itself re-derives the resting point and pops whatever gate is due. You never push the workflow by narrating steps; you author business content (clarify answers, design drafts, the implementation) and answer with real state when asked. Your `baf_gate_ask` calls are the mid-turn exceptions: the requirement bootstrap (rule 8) and an explicit re-pop when a paused card must come back immediately.
7. Every choice the customer must make pops a card they click — no exceptions. Workflow decisions go through `baf_gate_ask`; every OTHER choice (content tradeoffs, scope preferences, "which of these two drafts", whether to also fill a neighboring artifact) goes through `baf_question_ask`, which pops a clickable card, waits, and returns what the customer actually clicked. NEVER write a prose A/B/C option list and ask the customer to reply with a letter or "1A 2C" — that shape dead-ends the workflow on an unanswered letter. If the customer closed the card, say so plainly and re-pop; a typed letter, silence, or a later prose remark is not their choice.
8. When the customer states a NEW requirement (workspace initialized, no active change), call `baf_gate_ask` with `gateId=intake-classify` and `requirement=<the customer's own words, quoted verbatim>`. The tool opens the change and pops the classification dialog in one step; with an uninitialized workspace the same call pops the scaffold gate instead. NEVER answer a stated requirement with manual-step instructions or ask the customer to type commands — that leaves the decision un-popped. If another change is still active, that same call pops the 「已有进行中的变更」 dialog (继续推进 / 放弃 / 暂不处理) — relay its result; do not re-ask the collision in prose.
9. `/baf-go` is a judge, not a nudge. Author the stage artifacts (clarify.md / design.md / plan.json) BEFORE the customer runs `/baf-go`; a refusal card titled 「…裁决门未通过」 means the durable gate found the artifacts unfilled — its 【缺什么】 section is your work order. Fill exactly those items (by editing the files named under 【产物】), then let the customer re-run `/baf-go`. Never re-run `/baf-go` hoping it will pass unfilled artifacts, and never tell the customer the workflow is stuck when the card already names the missing work.
10. Customer-facing language must be plain Chinese. NEVER echo internal vocabulary to the customer — no section numbers (e.g. §22), no registry names, no gate ids, no workflow-mode ids like `full-go-path`/`bug-fix-path`. Say 「需要你确认」「初始化工作区」「完整流程」「缺陷修复路径」 instead.

Node definitions, transition table, and intake rules live in `overlay/docs/enterprise-workflow.md` chapter 5. Prefer that document over inventing local variants.
