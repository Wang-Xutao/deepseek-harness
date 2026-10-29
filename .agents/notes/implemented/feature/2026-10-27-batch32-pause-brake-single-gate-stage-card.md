# Agent Note: Batch 32 (2026-10-27) — the pause is a brake on every surface, a gate is on screen once, and the stage names itself

Status: implemented

## Problem

The customer filed ten changes against the BAF DSH desktop app plus two follow-ups. Three of them were not cosmetic, and two of those had a defect behind them:

1. The confirmation gate 「澄清已完成 · 请确认进入设计」 popped **twice in a row** — the customer had not answered the first one when the second replaced it.
2. 「暂停」 was supposed to mean "the workflow stops moving", but the client still offered 推进 and still popped gates after the brake was on.
3. The design gate offered 「退回，继续澄清需求」, which rewound the projection while the documents stayed as they were.

## Decision

### The gate is on screen once per change, not once per session

The per-session ask queue (`ask-queue.ts`) deduped by **session + key**. The two pops that raced were on **different chains**: the orchestrator's turn-end pop is retargeted to the workspace's home session, while the model's mid-turn `baf_gate_ask` is scoped to the tool's own session. Two chains, two queues, one gate — the dedupe could not see it.

The registry now owns a **change-scoped** slot: `claimChangeGate(changeId, gateId)` takes the slot before the pop and `releaseChangeGate` gives it back when the dialog settles (answered, cancelled, or dropped). The registry hangs off the same process-wide anchor as the queue (`sharedHostMap`), so every bundle copy in the process sees one slot. A second pop for the same gate of the same change stands down as `paused` instead of covering the first.

### The pause brake covers every surface, and the client is one of them

`isChangePaused` already gated the orchestrator's pop and dispatch. What it did **not** cover: the Tab's 推进 button, the TOP advance confirmation card, the parked-gate banner, the `advance` Remote, and the model's own `baf_gate_ask`. A brake that only the orchestrator respects is a brake the customer can drive through.

The flag now reaches all of them: the client hides 推进 and the advance card while `view.paused` is set, the `advance` Remote refuses a paused change (`advance_paused`), and `baf_gate_ask` reads the same flag before it pops. The customer's own commands (`/baf-go`) stay untouched — a lock they cannot unlock is a dead end.

### The way back upstream is the document, not a rollback button

「退回，继续澄清需求」 dispatched `/baf-workflow-clarify`, which rewinds the **projection**; the documents on disk stayed as they were, so the model re-read stale files on the way back. The option is gone from both design gates (`design-advance` and the parked `design-confirm`).

The path that replaces it already exists: the customer edits the upstream document, the drift detector sees the edit, and the 「同步」 button in the flow graph re-authors what the edit invalidated — the model rewrites the stale document against the newest upstream, and every document after it follows.

That change exposed a second inconsistency: the parked card's **question** came from the `awaiting-confirm` snapshot (§13 R5 "replay honesty"), while the session dialog read the live registry — two surfaces offering different buttons for the same decision. The snapshot now keeps the question (the audit record of what was asked) and the **options come from the live registry** (the product's current action surface). A removed option disappears everywhere at once.

## Consequences

- The confirmation gate can no longer appear twice: the change-scoped slot holds from the pop until the dialog settles, and a dropped duplicate stands down instead of replacing the live one.
- A paused change is paused on every surface: the flow graph offers no 推进, the advance card and the gate banner are hidden, the `advance` Remote refuses, and the model's gate ask stays quiet. The 暂停/继续 button itself is the only state indicator — the plain 「工作流已暂停——…」 sentence under the graph was removed, because it repeated what the button and the missing button already said.
- The design gate has two options (确认 / 暂不推进). Going back upstream is: edit the document, press 同步.
- A parked gate's options follow the registry from now on. The question copy still comes from the snapshot, so the record of what was asked is unchanged.
- The stage's own figures (状态 / 耗时 / Tokens / 下一跳 / 条件) moved from the bottom of the 阶段详情 card into the **name card** at the top of the rail, because the customer could not tell which stage they were reading without scrolling. The 阶段详情 keeps the catalog copy, and the purpose blurb that repeated the 目标 section one card lower is gone.
- The change overview's history moved to the **left** rail: it is the change's story, while the right rail is the selected stage's story. The document preview lost its 在侧栏打开 footer — the document is already on screen in that window.
- The browser board's change detail sizes its stage flow to the graph's own pixels (`max-content` track, no 62vh clip), so the board's picture and the app's picture are the same picture and there is no inner scrollbar.
- The running stage card breathes, and the pause stops it: the animation is bound to the in-progress state, not to the card's identity, so a paused workflow looks still.
- The flow toolbar's buttons became solid brand gold with fixed dark ink (9.9:1 on gold in both themes), the change-id tag renders on one line with the full value on hover, and the session statistics read one figure per line under three heavier group headings (概览 / 工具 / Tokens).

## Alternatives considered

- **Dedupe by gate id alone.** Rejected: two different changes can legitimately hold the same gate (the design gate of change A and of change B), and a global slot would silence the second one.
- **Keep the parked snapshot's options.** Rejected: the session dialog and the Tab banner would then offer different buttons for the same decision, and a button the product deleted would keep working in exactly one of them.
- **Keep the rollback and fix the projection to also rewind the documents.** Rejected: rewriting the documents on a rollback destroys work the model wrote; editing the document by hand is the customer's own decision and needs no rewrite.
- **A separate "paused" surface instead of hiding the 推进 button.** Rejected: a disabled button still reads as an available action; the button must be absent so the customer is not offered a move the workflow refuses.
