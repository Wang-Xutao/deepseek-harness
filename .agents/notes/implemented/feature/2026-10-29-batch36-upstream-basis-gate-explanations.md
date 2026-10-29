# Agent Note: Batch 36 (2026-10-29) — the upstream document is the basis, the gate explains itself, and the flow graph names files

Status: implemented

## Problem

The customer filed nine changes against the BAF DSH desktop app, all reported from the demo1 workspace session of 2026-10-28 (23:35 → 00:17 +08). The session log was decoded (`tmp/demo1-session.decoded.jsonl`, 1,393 events) and the nine reports were checked against it, the projection log (`.baf/projection/change-20261028-ecum-ba15.jsonl`) and the archived documents.

1. The desktop `baf-dsh.exe` still carried the old whale icon.
2. The 项目工程 page answered the first visit with an error banner that vanished a moment later.
3. The 指令集 cards were a wall of text — four left-aligned lines per command, nothing to look at.
4. 置信度 was a bare percentage with its explanation hidden in a hover title.
5. The flow graph named every document in three characters (立项书 / 检查单 / 计划账 …) instead of the file name the 阶段产物 rail lists; the rail's own state chips were four and seven characters long and only the state chip was right-aligned.
6. The confirmation gates offered bare buttons: the only option with an explanation was 暂不推进.
7. The clarify gate popped twice, the second one covering the first.
8. 「产物不同步：clarify.md 在 design.md 之后被修改」 — the customer asked whether the model really rewrote an earlier document, and said the earlier document should be the basis.
9. 「实现已完成 · 请确认进入验证」 could not be confirmed, the test flow was enabled but never ran, and the archive dialog popped twice.

## Decision

### The upstream document is the basis, and the guard now says so

The decode settled question 8: the alarm was **correct**. The model edited `clarify.md` **eight times after** `design.md` and `plan.json` had been written (23:51:36, 00:01:08, 00:01:14, 00:01:20, 00:04:39, 00:05:58, 00:06:04), and it said so itself — 「clarify is upstream, I shouldn't modify it」 — and then modified it anyway. Three drift work orders followed. The detector was not a false alarm; the write was the problem.

So the fix is not a quieter detector but a write discipline, enforced where it cannot be argued with:

- `baf-guard` locks the hand-edited upstream documents (proposal.md / clarify.md / design.md) for every stage after the one that authored them. A model write to them is refused with `upstream_document_locked` and a message that names the way out: change the downstream document, or — when the customer really wants the upstream changed — let the customer edit the file and press 「同步」.
- The one authorized rewrite is the customer's own: the guard reads the change's stale documents (a document whose upstream is newer) and lets exactly those be re-authored. That is the 同步 path, and the customer's click is the explicit request.
- The stage work orders now say which way a fix goes: 「上游文档是基准，不要改写；发现本阶段文档与上游不一致时，改本阶段文档让它跟上上游」.

The plan stage's documents stay writable: they are rendered from the ledger, and the implementation ticks the ledger.

### One gate, one pop, one explanation

- Every option of every registry gate now carries a `hint` — one short Chinese sentence saying what the click does. The rendered option line leads with the hint and keeps the technical invocation in parentheses, so the model's own reading of the card and the customer's reading of the dialog say the same thing.
- The dynamic gates (`resume`, `bind-workflow`) derive their options in the registry too, so they explain themselves as well; the dialog used to re-derive them and lose the hint.
- The change-scoped gate classification lives next to the registry (`isChangeScopedGate`). The model's own `baf_gate_ask` resolves the active change when the model omits it, so the pop is change-scoped and the change-scoped slot can hold it. A second pop of the same gate stands down instead of covering the first; a same-session dedupe covers the case where no change id exists at all.
- The 确认门 overview projection publishes each option's hint, and the client renders it under the option.

### The graph names files, the rail reads as one column

- The flow graph's artifact chip carries the file name (`plan.md`, `checklist.md`) again — 批次三十四's three-character labels are gone; the customer reads the graph by the same name the 阶段产物 rail lists.
- Every 阶段产物 state chip is three characters (未生成 / 未填写 / 已计划 / 已填写 / 已裁剪) and the drift tag (已修改 / 待同步 / 已同步) rides the same right-aligned group, so the row reads as one column. The change detail page uses the same rail and gets it for free.

### The first visit shows a loading line, not an error

The controller read the summary at plugin activation and again when the panel mounts; the two reads were unsequenced, and the activation read can land before the workspace Remote is up. Its failure painted the error banner, and the mount read's success replaced it one frame later — the 「错误状态一闪而过」.

Now the reads are sequenced (only the newest answers), the activation read is a warm-up whose failure does not answer the page, and a failed read never clears a summary the customer already sees — it becomes a notice line beside the content.

### The archive decision has one door

The demo1 session archived the change **24 ms** after its verify stage completed — with 25 unticked checklist boxes, no `awaiting-confirm` record, and no customer answer, even though the workspace baseline lists `archive` under `guard.requireHumanConfirmation`.

Two doors led there: the session's `verify-archive` gate card (the host path) and the Tab's parked-gate banner → the client's own 「确认归档」 modal, which resolved through `transition(changeId, 'archive')` → `driveArchive` — a path that never touched the gate registry, the checklist gate, or the baseline's human-confirmation list.

Now every archive lands in ONE host entry point (`driveArchiveDecision`), which owns the rules: the verify stage must have completed, every checklist box must be ticked, the baseline's `requireHumanConfirmation` must be honoured (the `verify-archive` gate is offered and answered), and a second concurrent request for the same change stands down instead of opening a second dialog. The client's 「确认归档」 button goes through that same entry point instead of its own drive.

### The implement→verify confirm reads the checklist

Three surfaces judged 「may this change enter verify?」 and disagreed: the coordinator (checklist + test flow), the orchestrator's turn-end pop (checklist + test flow) and the Tab's 推进 readiness (ledger + test flow, no checklist). The Tab therefore offered a button the coordinator would refuse — the customer clicked it and got an error.

One shared verdict (`verifyEntryVerdict`) now answers for all of them, and the test flow is resolved BY the transition: a gated workspace whose evidence is missing runs the chain itself instead of refusing the entry. A test flow that was never configured no longer reads as 「全部通过」.



### The confidence number explains itself

置信度 is the keyword pre-judgment's strength: 70% on a feature/bug keyword hit, 40% when nothing matched. It shapes the first suggestion only — the path is the one the customer picks on the classification card. The explanation was a hover title; it is now a line on the 变更分类 card and on the change detail's classification card.

### The command cards read as cards

The 指令集 rows are cards: a brand accent bar, the command id in a mono chip, the help-table rating as a filled/hollow badge, and 功能 / 运行结果 side by side under the emphasized 作用 line.

## Consequences

- The model can no longer rewrite proposal.md / clarify.md / design.md after their stage settled. A run that would have raised 「产物不同步」 now either proceeds or asks the customer to edit the file and press 「同步」.
- The customer's own edit of an upstream document still works exactly as before: the drift row appears, 「同步」 re-authors the documents that depend on it, and the guard lets that one rewrite through.
- Every confirmation option says what it does, on the dialog, on the Tab's pending gate and in the 确认门 overview.
- A change-scoped gate pops once. The second pop stands down instead of covering the answer.
- The 项目工程 page shows 「正在读取工作区基线…」 on the first visit and then the content. A read that fails while the content is on screen is a notice, not a banner.
- The flow graph's nodes name files again; the 阶段产物 column is three characters wide and right-aligned.

## Alternatives considered

- **Quiet the drift detector (content hashing instead of mtimes).** Rejected as the answer: the demo1 drift was real, so a quieter detector would have hidden a genuine desync. The mtime signal stays; the write that caused it is gone. (A content-based rule remains worth having for the customer-edit path, where a save with identical bytes would still raise a row.)
- **Let the model rewrite an upstream document with an approval token.** Rejected: an approval token is a new product surface for a case the customer already has — editing the file themselves and pressing 「同步」.
- **Drop the 阶段产物 state chips to a symbol or a dot.** Rejected: the customer asked for three characters, not fewer.
- **Merge the archive confirmation into one surface by removing the Tab's destructive modal.** Rejected: the modal is the 客户确认 the baseline's `guard.requireHumanConfirmation: [archive]` asks for, and it is the only surface where the customer sees the change id before the move.

## 遗留

- The pre-existing `packages/baf/baf-guard/tests/install-scoped.spec.ts` failure (`ToolExecutorUnavailableError` — the test's composition loads no tool executor) is not caused by this batch; it reproduces with this batch's guard changes stashed.
- The drift DETECTOR still compares mtimes. With the guard lock in place the only writer of an upstream document is the customer, so a row now means a real customer edit — but a customer save with identical bytes would still raise one. A content-based rule (a hash recorded when the stage settled) stays worth having.

## 验证

- `npx vitest run packages/baf/baf-workflow packages/baf/baf-quality` — 49 files / 628 用例全绿。
- `npx vitest run packages/baf/baf-guard` — 58 用例，57 绿；唯一失败是上面那条既有失败（与本批无关，stash 本批改动后同样失败）。
- `npx vitest run packages/client/ui-baf-workflow packages/client/ui-settings-baf-standard` — 20 文件 / 256 用例全绿。
- `pnpm run build:artifacts` — 8 门全过（host typert / host compiler / host bundle / desktop bundle / client compiler / client bundle / web build）。
- web 端真机（`dsh web` + 内置浏览器，demo1 工作区）：项目工程页首访无错误横幅，直接出「项目信息 + 路径/配置」与无基线提示；指令集卡片为「mono 指令名 + 星级徽标 + 作用/功能/结果」；确认门台账每个选项下方都有白话解释（「按完整流程走：澄清→设计→计划→实现→验证→归档」「当作缺陷处理：先写回归测试，再修根因」「分类不对，重新说一遍这次要做什么」）；变更详情的变更分类卡上「置信度 40%」下方直接写明它是什么、有什么用；阶段产物状态列为三字「已填写」。
