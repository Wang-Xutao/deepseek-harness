# Agent Note: Batch 37 (2026-10-29) — the splash breathes, the logos lose their white plate, the classifier speaks in real percentages, and the documents walk one ladder

Status: implemented

## Problem

The customer filed seven changes against the BAF DSH desktop app (2026-10-29):

1. The splash's 「首次启动耗时较久，请耐心等待…」 row sat almost on top of the golden mark — no breathing room between them.
2. Every logo carried an opaque WHITE plate: the exe, the taskbar and tray icon, the website and the installer icons were a blue whale on a white square.
3. The 项目工程 page answered the first visit with a red error banner that vanished a moment later.
4. The classification confidence was one of TWO fixed tiers (70% / 40%), the keyword lists could never match Chinese, and the confirmation gate never said which path it recommended.
5. The workflow graph's top strip read 「变更耗时」 and counted the customer's waiting time.
6. The stage-artifact logic was broken end to end: the model reported 「变更建立时的 proposal.md 还是空白模板（Why / Scope / Impact 均为占位），而澄清阶段不允许我改写它」 — the proposal stayed a template AND the guard forbade writing it.
7. The documents had no lifecycle: no 未填写 / 已填写 / 已完成 / 已更新 / 待更新, no lock on a confirmed document, no sync prompt when a confirmed document was edited.

## Decision

### The splash gives the mark its own space

The logo group no longer floats in the panel's vertical middle: it starts under a fixed offset (`.logos { margin-top: 38px }`, `justify-content: flex-start`), and the splash window grew from 380×300 to 380×340 so the whole stack still fits. The gap between the slow-start row and the mark is now ~31px (was ~5px) — `probe-batch37-splash-page.mjs` pins the viewport to the real window size and asserts it.

### The logos lose their white plate

The brand mark (whale + dashed ring) and the whale were painted as flat blue over an opaque WHITE square. `overlay/scripts/make-transparent-brand-icons.mjs` rebuilds every brand asset from the transparent sources (`desktop/branding/mark.png`, `desktop/branding/deepseek.png`): the plate is removed by unpremultiplying the artwork against white, so the silhouette, the ring and the anti-aliased edges are the ORIGINAL pixels — only the plate becomes transparent. `png-to-ico.mjs` now writes the multi-size ICO through the same codec, because a generic PNG→ICO converter flattens the alpha and leaves a black or white plate behind the logo.

### The classifier speaks in real percentages

The old classifier answered 0.7 on a keyword hit and 0.4 otherwise, and its Chinese alternatives sat behind ASCII `\b` boundaries — so a pure-Chinese requirement NEVER matched and always read 「待定 · 40%」.

Three layers now answer, in order:

1. **Keywords** — plain substring lists (Chinese-safe), covering 新增/需求/实现/支持/接入, 修复/缺陷/报错/崩溃/失效, 重构/迁移/架构/改造 (a rework reaches across modules → 跨模块) and 大范围/多模块/跨模块. A requirement that hits exactly ONE path keyword is a direct hit: **100%**. A requirement that reads as both a defect and a rework is ambiguous and is left to the model.
2. **The model** — when the keywords cannot decide, the host plane asks the model for a REAL percentage per path (`packages/client/ui-baf-workflow/src/intake-evaluator.ts`, `purpose: 'intake-confidence'`); the higher score is the recommended path. A failed evaluation never blocks the intake — the keyword answer stands.
3. **The rules** — the baseline and the blast radius still have the last word on which path may run at all.

The recommended path rides the confirmation gate: the option that matches it carries a 「推荐」 badge (the session dialog's option description carries the marker; the Tab's button row renders the badge from the option's `recommended` flag), and the judgment line quotes the real percentage (「置信 92%」, not 「置信 0.92」).

### 会话耗时 excludes the customer's waiting time

The strip reads 「会话耗时」 and counts the change's WORK time only: a parked confirmation gate closes the open work windows and reopens them when the answer arrives, and the intake and drift windows (both customer decisions) accrue no duration.

### The documents walk one ladder

Six states, one rule, shared by the workflow (which shows it) and the guard (which locks it) — `packages/baf/baf-core/src/artifact-lifecycle.ts`:

| state | label | colour | meaning |
|---|---|---|---|
| missing | 未生成 | grey | the document does not exist |
| template | 未填写 | amber | the template exists, its placeholders do not |
| filled | 已填写 | blue | real content, the gate has not confirmed it |
| completed | 已完成 | green | the gate confirmed it — it is locked |
| updated | 已更新 | orange | a confirmed document was edited afterwards |
| stale | 待更新 | red | a document of a later stage, now out of sync |

The stage flow says which stage FILLS a document and which stage's entry CONFIRMS it (proposal.md is filled by the clarify stage and confirmed when the design stage is entered). A confirmed document is locked in the guard (`document_locked`): the model may not rewrite the customer's own words; only the customer may (by editing the file, or by pressing 「同步」). The implementation's own ledger and the verify checklist stay writable — the workflow ticks them.

And the complaint that started it: the guard's upstream lock covered `proposal.md` from the CLARIFY stage on, so the model could never fill the proposal it was being asked about. The document the current stage fills is no longer upstream — the clarify stage really writes the proposal (the work order says so), and the lock starts when the gate in front of it is passed.

## Consequences

- The splash reads as one band: the slow-start row at the top, the mark clear of it.
- Every brand icon (exe, taskbar, tray, website, installer) is transparent; the logo is the whale, not a white card.
- The 项目工程 page shows a notice instead of a red banner on a first-visit read failure (the reads are sequenced, the warm-up read never answers the page).
- A Chinese requirement is classified by its own words; an ambiguous one is judged by the model and answers with a real percentage; the gate marks the recommended path.
- 会话耗时 counts the change's work, not the customer's waiting.
- A confirmed document is frozen; editing it turns it 已更新 and its downstream documents 待更新, and the workflow prompts for the sync.

## Alternatives considered

- **Keep the two tiers and just add more keywords.** Rejected: the customer asked for a real percentage, and the fixed tiers are what made the number meaningless.
- **Let the model call the LLM from the domain package.** Rejected: `baf-workflow` is a pure domain package with no runtime; the evaluator is injected (a process-wide registry in `intake-confidence.ts`, plus a session-bound one for the Tab's own mint), so the domain stays testable and the CLI keeps working without a model.
- **Add a `recommended` field to the platform's `AskUserQuestionOption`.** Rejected: the pending-question schema is strict, so the extra field would be rejected; the marker rides the option description instead, and the BAF composer parses it into a real badge.
- **Lock every confirmed document, including the task ledger.** Rejected: the implementation ticks the ledger's `done` markers and the verify stage ticks the checklist — the workflow's own mechanics would break. Those two stay writable; everything else is frozen.
- **Relax the open gate so the proposal may still be a template when the clarify stage starts.** Rejected: the open gate is the existing 「每阶段产物是推进前提」 rule; the fix is that the clarify stage may now FILL the proposal, not that the gate stops checking it.

## 遗留

- The pre-existing `packages/baf/baf-guard/tests/install-scoped.spec.ts` failure (`ToolExecutorUnavailableError` — the test's composition loads no tool executor) is not caused by this batch; it reproduces with this batch's guard changes stashed.
- The model evaluation runs on the deployment's DEFAULT model (the Tab's own mint runs on the session's route). A deployment with no model falls back to the keyword answer.
- The 「用户明确要求修改已锁死的文档」 confirmation gate (a NEW gate id for the customer's explicit change request) is not implemented yet: today the customer's way back is editing the file and pressing 「同步」, which the lock's denial message names.

## 验证

- `npx vitest run packages/baf/baf-workflow packages/baf/baf-guard` — 52 文件 / 670 用例；唯一失败是上面那条既有失败（与本批无关，stash 本批改动后同样失败）。
- `npx vitest run packages/baf/baf-workflow/tests/intake-confidence.spec.ts` — 8 用例全绿（中文关键词命中 100%、重构→跨模块、歧义交给模型、模型失败不阻塞、低置信度转澄清）。
- `npx vitest run packages/baf/baf-workflow/tests/artifact-lifecycle.spec.ts` — 2 用例全绿（未生成→未填写→已填写→已完成；已完成后被改→已更新，后续阶段→待更新）。
- `node overlay/scripts/probe-batch37-splash-page.mjs` — 6 项断言全过（提示行在左上、按钮在右上、间距 30.9px、整叠内容在面板内、版本号渲染）。
- `node overlay/scripts/make-transparent-brand-icons.mjs` — 6 个资产重建；`icon.ico` 的 7 个尺寸全部 0 个白色像素、四角透明。

### Web 端实跑（demo1 工作区，变更 change-20261029-ecum-9752）

- 分类：输入「重构 ecum 模块的配置解析部分，把散落各处的配置读取逻辑迁移到统一配置中心」→ 分类卡显示「完整流程 · 新需求 · 跨模块 · 初判置信度 100%」，「确认 · 完整流程」选项带「推荐」徽标。
- 会话耗时：顶栏「会话耗时 33m6s」（旧变更）与「会话耗时 33ms」（新变更）；确认门等待期间计时停走；每个阶段节点各带自己的「会话耗时」。
- 红色异常：首次打开「工作流图」tab 直接正常渲染，刷新后 console 仅 1 条无害 warning（`[connection] generation is still not ready after 3000ms`），无 error 级条目、无红色异常闪现。
- 产物状态链（六态在真实运行中逐级走通）：
  - 澄清开始 → proposal.md「未填写 缺 3 项（悬停查看）」（黄），其余 7 个文档「未生成」（灰）；
  - 澄清阶段真实写入 proposal.md → proposal.md「已填写」（蓝），clarify.md 装模板后同样「未填写」（黄）；
  - 澄清完成门通过、进入设计 → proposal.md 与 clarify.md 同时「已完成」（绿，DOM class `artifactStateCompleted`），design.md 转为「未填写」（黄）。
- 拍板卡推荐样式：澄清阶段连续弹出 5 道拍板题（配置中心落点 / 入口粒度 / Theme 两个调用 / NVM 写方向 / 失败处理），每道的推荐选项都带独立的「推荐」徽标。
- 旧变更（change-20261028-ecum-ba15）漂移：顶部横幅「产物不同步…在确认完成后被修改，其后的文档需要重新同步」，proposal.md 显示绿色「已完成」，横幅带「同步」按钮（`flow-drift-sync`）与「工作流在此暂停推进」提示（`flow-drift-hold`）。
- 磁盘侧核对：`openspec/changes/change-20261029-ecum-9752/proposal.md` 的 Why / 现状事实 / Scope / Impact 均为澄清阶段真实写入的实质内容，无占位符残留。
