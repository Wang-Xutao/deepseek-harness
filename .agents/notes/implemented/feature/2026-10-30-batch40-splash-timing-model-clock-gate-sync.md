# Agent Note: Batch 40 (2026-10-30) — the splash breathes again, the clock counts only the model's time, the gates cancel in sync, and the graph wears gold

Status: implemented

## Problem

The customer filed ten changes against the BAF DSH desktop app (2026-10-30):

1. The splash's 「首次启动耗时较久，请耐心等待…」 row sat too far from the golden mark — the gap batch37 opened (38px) read as an empty band.
2. Switching projects on 项目工程 flashed the red 「当前会话工作区还没有配置文件（.baf/baseline.yml）」 banner and then recovered.
3. 项目工程 needed a **项目经验的沉淀配置** — project-level experience capture, to be designed against the open-source practice and reviewed before implementation.
4. 会话耗时 counted the customer's waiting: a confirmation-gate wait, a workflow pause and a stopped model all landed in the total, and `change-20261029-ecum-a090` read 「704m6s」 on a change whose model had been idle for hours.
5. The change detail's left rail carried three cards with two nested scrollbars; 变更类型 printed `new-requirement`, the confirmation state printed `confirmed`, 判定依据 printed raw reason codes, and the customer's own requirement was nowhere.
6. The session's confirmation dialog and the workflow graph's confirmation did not cancel in sync: answering in the conversation let the graph's banner come straight back.
7. The confirmation gates could overlap; the same gate could pop twice.
8. The graph's 「暂停」 and the conversation's stop-the-model were different actions; the graph's 「继续」 and typing 「继续」 were different actions.
9. The confirmation modal covered more than the conversation tab.
10. The graph's 「推进」 button sat there while the model was running.

## Decision

### The splash gap is a rhythm, not a number

`.logos { margin-top: 38px }` (batch37) put the mark 36px under the hint's text — too much. It is now **20px**, which clears the hint text by ~18px: the same distance the mark keeps to the wordmark below it. The splash window shrank back from 380×340 to **380×324** so the stack does not float over an empty band. `probe-batch37-splash-page.mjs` now measures the gap from the hint TEXT (the row also holds the taller 后台启动 button, so the row's bottom was never the visual anchor) and pins it to 12–26px.

### 会话耗时 counts the model's time, not the wall clock

The fold measured **stage occupancy**: the time between `stage-entered` and `stage-completed`. A change whose stage never completed kept its window open forever, so `change-20261029-ecum-a090` — parked in 设计 since 00:17 — read 704 minutes of "work" that was mostly the customer away from the keyboard.

The fold now measures **the model's active spans**: the session log brackets every turn with `turn/start` → `turn/end`, and a stage's duration is the overlap of its window with those turns. A gate wait, a workflow pause, a stopped model and an idle afternoon all fall out. `change-20261029-ecum-a090` now reads **10m36s** — exactly the sum of its stage cards (0s + 29ms + 1m16s + 9m19s).

Three rules compose:

- **the park** (batch37): a parked confirmation gate closes the stage windows until the answer;
- **the approval wait** (batch38): the customer's approval decision is taken out;
- **the model's turn** (this batch): everything outside a turn is not work.

The `running` flag — which freezes the client clock — now also requires the model to be running **now**, so a session nobody is working in stops ticking. A turn with no `turn/end` (an interrupted session) is closed at the log's last event: the model cannot have worked past the last thing the log recorded.

### The stage cards and the top strip agree by construction

Two separate sources were at work. The **terminal card** (完成 / 已放弃) carried the change's **total**, so every sum over the cards was double the top strip's figure. It now carries the total under an explicit **合计** label — the sum the customer computes is the strip's number, and the card says so. The **token cell** read the session-wide `tokenUsage` projection (which counts the turns before the change and the streaming retries the per-stage fold never sees) while the cards read the host's per-node rollup; the strip now reads the rollup — the very sum the cards add up to. The per-stage cards read **阶段耗时 / 阶段 Tokens** so a stage figure is never mistaken for a session-wide one.

### The gates cancel in sync

The session's dialog and the graph's banner are the **same decision** and already answered through the same carrier — but the graph's banner is suppressed while the dialog is up, and the **projection still carries the park** after the answer, so the banner came straight back. The customer saw the confirmation they had just dismissed reappear, and could never reach the 「推进」 button.

A small shared store (`client/gate-sync.ts`) now carries the answered gate between the two surfaces: answering in the conversation records it, and the graph keeps its banner down for exactly that gate until a **different** gate arrives. The 「推进」 button is then the way forward — and it already drives the same `/baf-go` a typed command would.

### The gates do not stomp each other

Already true host-side, and now verified rather than assumed: `ask-queue.ts` serialises every ask per session (one card at a time), `claimChangeGate` holds a change-scoped slot so the same gate of the same change cannot be on screen twice even across two sessions, and `gateAlreadyOnScreen` dedupes by GATE id so a pop that carries no change id still stands down behind the one that does.

### One brake, two surfaces

The graph's 「暂停」 already cut the model's turn; the conversation's stop did not — the two were different actions with different visible results. The orchestrator now reads the turn's end: a **user cancellation** pauses the change, so stopping the model in the conversation puts the same brake on the graph. In the other direction, the customer typing **「继续」** releases the brake, exactly like the graph's 「继续」 button (which hands the model the same word). The word is scoped to the **current turn** — a 「继续」 typed two turns ago must not keep releasing the brake.

### The modal's scope is the conversation tab

The overlay is pinned to the conversation pane's rect, so the app's left sidebar was already outside it — but the **fallback** was the stylesheet's `inset: 0`, a viewport-wide blocker that covered the sidebar too, and the pane lookup had not answered on the first frame. The card now renders **inline** in the conversation column when there is no pane to pin to, and nothing renders until the lookup answers: the modal's scope is the conversation tab, always.

### The graph wears gold

The selected card's frame was one declaration — `border-color: var(--wf-ink)` — a 1px near-black box the customer called 「很丑的黑色选中框」. The frame is now a **pseudo-element ring drawn outside the card**: a gold border, two glow layers, and a slow breathe. It is a pseudo-element because the card's own `box-shadow` belongs to the running pulse (a CSS animation overwrites a static box-shadow on every frame) — a ring painted with `box-shadow` would vanish the moment the selected stage started running.

The running halo was a 0→8px ring fading to nothing. It now spreads 2→14px, carries a real outer glow, and lifts the card's brightness: the live stage is unmistakable. `prefers-reduced-motion` now spares it too (the rule used to omit the running card, so a reduced-motion user still got a pulsing graph).

### The 变更分类 card speaks the customer's language

变更类型 reads 新需求 / 缺陷 / 维护 (the raw enum `new-requirement` was printed verbatim). The confirmation state reads 已确认（路径由你的点选落定）instead of `confirmed`. 判定依据 — the raw reason codes — is gone. **需求摘要** is new: the customer's own requirement text rides the card first, because a change whose summary is missing cannot be reviewed. 「需要 Openspec ✓」 now explains itself on hover. The three cards (变更分类 / 阶段产物 / 历史记录) stack in one scroller — the rail carried two nested scrollbars in 320px.

### 项目经验 is a design, not a feature

The customer asked for the design first. `overlay/docs/product/project-experience-proposal.md` (44 KB) answers it against what the ecosystem actually does — AGENTS.md, CLAUDE.md + `.claude/rules/` + auto memory, GitHub Copilot's repository and path instructions, MADR, llms.txt, Cline's memory bank, Aider's repo map, Keep the Why, Mneme, kgai — and recommends `.baf/experience/`: a short index that lives in the prompt plus entries fetched on demand, captured by a **deterministic extractor** (projection events, no model, no hallucination) and a **model proposal** (which never writes), both approved by the customer in 项目工程, with no new gate card — the brake is never allowed to block an archive.

## Consequences

- The splash reads as one band again: the hint at the top, the mark clear of it.
- A change that has been parked for a week reads its real work time, and the stage cards add up to the strip's number by construction.
- The confirmation the customer dismissed does not come back; the 「推进」 button is the way forward.
- Stopping the model in the conversation pauses the graph; typing 「继续」 resumes it.
- The confirmation modal never covers the app's left sidebar.
- The selected stage wears a gold halo; the running stage is unmistakable.

## Alternatives considered

- **Keep the wall-clock duration and label it 「流程耗时」.** Rejected: the customer asked for the model's time specifically, and the wall clock is what made a parked change read 704 minutes.
- **Clip the durations to the model's turns but leave the token cell on the session projection.** Rejected: the two would still disagree, which is the complaint.
- **Let the model write the experience entries directly.** Rejected: `.baf/**` is already a protected path — the model cannot write there, which is exactly the authority boundary the design wants, for free.
- **Add a confirmation gate for experience capture.** Rejected: a non-deterministic input inside a fail-closed guard is how BAF gets gate deadlocks. The candidates wait in 项目工程; nothing blocks.
- **Paint the selection frame with `box-shadow`.** Rejected: the running card's pulse animation owns `box-shadow` and overwrites it every frame.

## 遗留

- The deep research for 项目经验 could not reach `docs.cursor.com/context/rules` (it redirects to the docs home), so Cursor's rule-file frontmatter is **not** quoted in the proposal — only the verified top-level structure.
- The confirmation-gate 「不重叠 / 不重复弹」 guarantee is verified by reading the host code and the existing ask-queue tests, not by a new end-to-end run: the two overlapping pops need two live sessions in one workspace, which the demo workspaces do not have.
- 3.5 (「推进」 hidden while the model runs) and 3.3 (the brake's two surfaces) need a live model to observe; the DeepSeek key in this environment answers 401, so the web run verified the read-only surfaces (the ledger's duration, the change detail, the graph's card figures, the selected card's classes) and the code paths are covered by unit tests.

## 验证

- `npx vitest run packages/baf/baf-workflow packages/client/ui-baf-workflow packages/client/ui-settings-baf-standard` — 69 文件 / 886 用例全绿。
- `npx vitest run packages/baf/baf-workflow/tests/metrics.spec.ts` — 11 用例全绿（新增 4 条：只算模型在跑的时间、停掉的模型冻结计时、开放回合照常走、停靠的门在回合内也不计时）。
- `node overlay/scripts/probe-batch37-splash-page.mjs` — 8 项断言全过（提示行到 logo 的可视间距 17.9px，落在 12–26px 区间；进度条与署名之间无空洞 15px；版本号 v0.0.61 渲染）。
- `corepack pnpm run build:artifacts` — 8 道闸门全过（native addon / Host Typert / host compiler / Host bundle / Desktop bundle / client compiler / Client bundle / Web build）。
- `npx tsx scripts/run-oxlint.ts packages/client/ui-baf-workflow/src packages/baf/baf-workflow/src packages/baf/baf-core/src packages/client/ui-settings-baf-standard/src` — 本批新增/改动的文件零告警（余下的告警都在本批未触碰的既有文件里）。

### Web 端实跑（demo6 工作区，变更 change-20261029-ecum-a090）

- 变更总览的账本：会话耗时 **704m6s → 10m36s**，Tokens 2.6M 不变（阶段卡之和 0K + 0K + 430K + 2.2M = 2.63M ≈ 2.6M ✓）。
- 变更详情左栏：需求摘要「重构ecum」在最上；变更类型「新需求」；确认状态「已确认（路径由你的点选落定）」；判定依据已删除；「需要 Openspec ✓」在位并带说明；三个卡片共用一条滚动条。
- 工作流图：阶段卡的文案已是「阶段耗时 / 阶段 Tokens」，选中卡片带 `nodeSelected` 类。
- 控制台：仅 1 条无害 warning（`[connection] generation is still not ready after 3000ms`），无 error。

### 桌面产物

- `cd overlay && npm run dist:dir` — 产出 `overlay/desktop/dist/win-unpacked/baf-dsh.exe`（0.0.61，未打安装包）。
- `verify-desktop-dir-launch` 通过：打包后的 `dsh web` 起来了，打包后的 exe 也冒烟启动成功。
