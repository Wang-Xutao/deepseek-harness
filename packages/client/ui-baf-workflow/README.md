---
description: "BAF go-workflow conversation Tab and Host Remote for projection/intake."
---

# @deepseek-ai/dsh-client-ui-baf-workflow

English | [中文](README.zh.md)

Conversation Tab **「工作流」** for BAF sessions: SVG flowchart of the go state machine, intake confirmation card, stage detail rail, and semi-interactive actions. Host half owns the `bafWorkflowView` Typert Remote that reads/writes workspace projection via `@deepseek-ai/dsh-baf-workflow`.

No runtime invariant companion is published because Tab state is owned by the `baf-workflow` projection; this package renders and forwards actions without diverging observations.

## Workflow page surfaces

The project-scoped 工作流 page is assembled from the rows this package registers under `settings.workflow.item`: the **变更总览** ledger, the **确认门** ledger, and the **测试流图** row. Two of them share one page skeleton — a hero band (BAF mark, eyebrow, title, purpose), a row of figure plates, then the content — so the page reads as one surface rather than three screens that happen to sit in the same menu.

### 变更总览 — the change ledger

The ledger lists every change of the current project, including the abandoned ones, as recorded rows. Its hero band carries two **graded** actions: 导出看板 is the gold primary, 刷新 is a ghost button with a visible keyboard focus ring. Below it, a section head (eyebrow, count, hint, one hairline rule) introduces the card grid, and each card carries the change's own state on its task rollup — gold while running, green when completed, grey when abandoned. Hovering a card lays a gold-foil sheen across it, and the card is focusable. The gold here is an accent, not a fill: the hero wash, the selected rings, the card edges and the state chips each carry a fraction of the weight they carried before, so the page reads as a ledger with a gold identity rather than as a gold field.

### 确认门 — the confirmation-gate ledger

The gate ledger shows the flow with the gate that guards each stage. Its hero band names the page, and three figure plates carry the live counts (确认门 / 阶段门禁 / 状态节点). The counts used to sit inside the flow canvas's console bar, which made the page's identity something the reader had to infer from a chart; they are now page-level figures, and the console bar says what the frame is again. The「需求输入」node is the page's first mark and keeps its place in the entrance order, but it is no longer a solid gold slab: it is a light surface with a gold hairline and a faint gold ring, so it no longer outweighs the canvas it sits on.

### Artifact preview

A document artifact of a change opens in an in-place preview window — the same window the 测试流图's configuration files use (title, path, body, and an 「在侧栏打开」 footer action). The preview is a faster read, not a replacement for the sidebar: its footer action still hands the artifact to the right sidebar. The page is project-scoped and has no conversation behind it, so the reader borrows a live session of the same workspace to read the document.

## Model Experience

### Composer tidy-up request

#### What the model sees

The author's draft, as the single user message of one auxiliary request, under the fixed `DRAFT_FORMAT_SYSTEM` prompt. Nothing else from the session enters the request, and the arranged answer is not written back into the session log — the composer persists the draft, so the session log still reconstructs exactly what the model saw.

#### Token effect

One auxiliary request per press (`purpose: 'draft-format'`), capped at `DRAFT_FORMAT_MAX_TOKENS` output tokens and sent on the session's current route, so no second provider and no second key are involved. A press that finds no routed model sends nothing at all.

#### KV Cache effect

The request carries a fixed system prompt and one user message with no session prefix, so it neither reads nor writes a session-scoped cache; the fixed prompt is a stable prefix a provider may cache on its own.

## Known Limitations and Deferred Work

- Stage start / archive confirmation buttons are visible but disabled until Phase 5 handlers exist.
- Electron `baf:getWorkflowStatus` IPC is Phase 8; Web uses Typert Remote only.
- Tab list entry is registered for the web surface; content requires `agentPreset === baf`.
- **The tidy-up request needs a routed model** — a session that has never sent a request has no route, so `formatDraft` answers `unavailable` and the composer's local arranger takes over.
- **The route follows the agent loop's own order** — the recorded session selection, then the agent's live route options, then the last request header, with the deployment's per-step route resolver mapping the BAF「自动」pseudo route to a concrete provider/model. The pseudo route is never handed to a provider, and a session with none of the three answers `unavailable`.
- **The artifact preview needs a live session in the same workspace** — the page has no conversation of its own to read through, so with no session in the workspace the preview reports that it cannot read the document.
