# Agent Note: Batch 24 (2026-10-25) — the two 工作流 pages share one design language, artifacts open in a preview, the session's own model tidies the draft, and the ceedling probe stops flaking

Status: implemented

## Problem

One request carried six unrelated complaints about the baf-dsh desktop build. They looked separate but shared one root cause: **several surfaces had grown their own visual language, their own vocabulary, and their own idea of what "the model" is**, and the inconsistency was only visible once the customer used the product end to end.

1. **The 变更总览 ledger read as an instrument panel, not a ledger.** Its hero band carried two gold-pill buttons of identical weight (导出看板 / 刷新) with no focal point, the card grid had no section head, every card's task bar was gold — including abandoned changes, which therefore said "still running" — and a hover affordance was authored (`@keyframes ovwSweep`) but never wired.
2. **The change detail's document artifacts were a dead end.** Clicking an artifact handed it to the sidebar's document preview — a different window, a different look, and a context switch — while the 测试流图 already had a perfectly good in-place preview modal for exactly this content.
3. **The 确认门 tab had no page of its own.** Its two live counts were printed inside the flow canvas's console bar, so the page's identity had to be inferred from a chart; the tab read as a viewer rather than a ledger.
4. **The left sidebar's 自动化任务 launcher sat in the rail** next to the fixed 插件 launcher, and the rail's **更多** menu offered 浏览更多插件 — a duplicate of the 插件 launcher that already sits in the rail.
5. **Every plugin View added a tab to the session header.** With five core views (对话 / 轨迹 / 轨迹图 / 工作流图 / 测试流图) already in the strip, a sixth plugin tab pushed the row into its width budget and the rest of the views into **更多** — the strip's width became a plugin's problem.
6. **「格式化输入」 was weak.** The local arranger only split paragraphs and promoted enumerations; it could not restructure a long prose draft into headings and lists, which is the case the customer actually had.
7. **The ceedling environment probe flaked.** It reported "environment incomplete" on machines where ceedling was installed and working.

## Decision

### 1. The ledger gets a section head, graded actions, and state-colored rollups

【变更】`packages/client/ui-baf-workflow/src/client/ChangeOverviewRow.tsx` and `ChangeOverviewRow.module.css`:

- The hero's two actions are **graded**: 导出看板 is the gold primary (`.refreshPrimary`), 刷新 is a ghost button (`.refresh`) with a visible `:focus-visible` ring. Two identical gold pills read as one loud band with no focal point.
- The card grid gains a **section head** (`.section`): an eyebrow (`.sectionLabel`, new locale key `ovw.listLabel` — 「变更记录」 / "Change records"), a count (`.sectionCount`), a hint (`.sectionHint`) and one hairline rule. The old free-floating `.hint` paragraph is gone.
- Cards gain `:focus-visible` gold focus rings, and the authored-but-unused `@keyframes ovwSweep` is now wired as a `.card::after` gold-foil sheen on hover.
- The **task rollup is colored by the change's own state**: gold while running, green when completed, grey when abandoned. One gold bar for every card said "everything is running".
- Surface geometry is softened in one pass: hero radius 14→16px, tile radius 12→13px, block bottom border 0.5px→1px, empty state gains a surface and radius.

### 2. Artifacts open in the 测试流图's own preview window

【变更】`packages/client/ui-baf-workflow/src/client/ChangeOverviewRow.tsx`:

- `ChangeOverviewRow` takes an optional `readArtifact?: (path: string) => Promise<string | undefined>` injection, holds a `preview` state, and opens the modal through `openPreview()`. Escape closes it.
- The modal reuses the 测试流图's preview class names and testids (`modalBackdrop / modal / modalHead / modalTitle / modalPath / modalClose / modalBody / modalFoot / modalAction`, testid prefix `change-artifact-preview*`), so the two previews are one window, not two.
- The `ArtifactRail` and the `FlowCanvas` artifact chips both open the preview instead of the sidebar.
- **The preview's footer still offers 「在侧栏打开」** — the preview is a faster read, not a replacement for the sidebar.
- Six new locale keys (`ovw.artifactPreview`, `…Close`, `…Loading`, `…Missing`, `…Failed`, `…Open`) carry the copy in zh and en.
- `packages/client/ui-baf-workflow/src/client/index.ts` injects `readArtifact` by borrowing an active session in the same workspace and calling `remote.bafWorkflowView.readWorkspaceFile`.

### 3. The 确认门 tab gets the same page skeleton as the ledger

【变更】`packages/client/ui-baf-workflow/src/client/GatesOverviewRow.tsx` and `GatesOverviewRow.module.css`:

- `GatesFlow` now returns a **hero band** (`data-testid="baf-gates-hero"`: BAF mark, eyebrow, title, description) and **three figure plates** (`data-testid="baf-gates-tiles"`: 确认门 / 阶段门禁 / 状态节点, tones `confirm` / `stage` / `states`).
- The console bar's two count chips are **removed** — those numbers are now page-level figures — and the bar regains a one-line hint (`gates.canvasHint`).
- Five new locale keys (`gates.heroLabel`, `gates.heroTitle`, `gates.heroHelp`, `gates.tileStates`, `gates.canvasHint`) carry the copy in zh and en.
- The dead `.consoleStats / .statChip / .statLabel / .statValue` rules are deleted rather than left in the stylesheet.

The ledger and the gate tab now share one skeleton: **hero → figures → content**. They are siblings, not two products.

### 4. 自动化任务 moves into 更多; 更多 loses 浏览更多插件

【变更】`packages/client/ui-sidebar/src/client/panel-pins.ts`: a new `DEFAULT_UNPINNED_PANELS = ['schedules']` seeds the in-memory unpinned list, so 自动化任务 starts in **更多** and the rail keeps only the surfaces a user opens constantly. The launcher stays one click away and can be pinned back.

【变更】`packages/client/ui-entry-customization/src/client/EntryMenuContent.tsx`: the **sidebar** region's More menu now lists the unpinned launchers as navigation rows (before the Creator action); the plugin-discovery row is removed from that region only. The conversation and right-bar regions keep 浏览更多插件 and keep their folded-View rows.

### 5. The session strip keeps five primary views; everything else folds into 更多会话视图

【变更】`packages/client/ui-conversation/src/client/view-pins.ts` exports `PRIMARY_VIEW_IDS = ['chat', 'trajectory', 'trace-graph', 'baf-workflow', 'baf-test-flow']`.

【变更】`packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx` filters the strip by that whitelist: the fixed Chat view still leads, and a plugin View no longer widens the header — it stays one click away in **更多会话视图**. The existing width budget still folds a primary view into More when the row is narrow.

### 6. 「格式化输入」 runs on the session's own model, and falls back to the local arranger

This is the batch's one architectural decision, and it is the reason the note exists.

- **The model path rides the existing `bafWorkflowView` Remote.** 【变更】`packages/client/ui-baf-workflow/src/index.ts` adds `@Remote('formatDraft') formatDraft(request: BafWorkflowDraftFormatRequest)`. It runs one `ctx.llm.stream({...})` with `purpose: 'draft-format'`, the draft as the **only** user message, the new `DRAFT_FORMAT_SYSTEM` prompt, and `DRAFT_FORMAT_MAX_TOKENS = 4096`; `BlockAssembler` assembles the answer. Every failure answers `{ status: 'unavailable', reason: 'no-model' | 'failed' | 'empty' }` — **it never throws**, because a provider hiccup must not surface as an error the user has to dismiss.
- **The route is the session's own.** `draftRouteFor(sessionId)` reads, in order: the live agent's `options.provider/model`, the agent's last logged `requestHeader().config`, then the cold log's own header epoch (`readSessionRouteScan`). The **Auto pseudo route is skipped** — it is not a provider, so a session sitting on it has no direct route and the caller falls back. The user therefore needs no second provider and no configuration.
- **The call is auxiliary, not a turn.** Nothing is appended to the session log: the draft is the user's, and the arranged text is the user's too — the model only shaped it. The composer persists the draft as before, so the model-visible content stays reconstructible from the session log.
- **The answer is sanitized before it reaches the draft.** 【变更】`packages/client/ui-baf-desktop/src/client/draft-format.ts` exports `sanitizeModelDraft(raw)`: strips a wrapping fence (keeping an inner fence intact), strips the leading courtesy line (Chinese 「以下是…」/「下面是…」 family, English "Here is the formatted draft" family), strips the trailing courtesy line, collapses runs of 3+ blank lines to one, normalizes line endings, and trims.
- **The local arranger keeps its exact previous behavior** and becomes the **fallback**: no routed model, a provider error, or an empty answer all land on it. Its 25 pre-existing assertions are unchanged.
- **The control's states are explicit.** 【变更】`packages/client/ui-baf-desktop/src/client/DraftFormatButton.tsx` adds a `DraftFormatInjected` face with `formatWithModel?: (draft: string) => Promise<string | undefined>`. With no model path the control stays **synchronous** (this preserves the existing component contract); with a model path it becomes asynchronous, shows a spinner (`draft.working`, `IconRefreshOutlineMedium` + CSS rotation, motionless under `prefers-reduced-motion`), and reports 「整理期间草稿被修改，已放弃本次整理」 when the author edited during the call.
- **The author's input wins.** The draft is compared against a snapshot taken before the call; if it changed, the model's answer is **discarded** rather than overwriting newer text.
- **The model's answer is a proposal, not a command.** The sanitizer + the fallback mean a hallucinating or chatty model degrades to "no change", never to a corrupted draft.

【变更】`packages/llm/llm/src/types.ts` and `packages/llm/deepseek-llm-api-extensions/src/types.ts` extend the `purpose` union with `'draft-format'`; the mirrored type-equiv block in `docs/subsystems/llm-streaming.md` and `.zh.md` is updated in the same change (that block is compared against the source by the type-equiv gate).

【变更】`packages/client/ui-baf-desktop/src/client/index.ts` registers the session-scoped `conversation.input.right` slot with an `inject` that calls `ctx.remote.bafWorkflowView.formatDraft({ sessionId, draft })`; the package therefore depends on `@deepseek-ai/dsh-api-remotes` at runtime and on `@deepseek-ai/dsh-client-ui-baf-workflow` for types only.

### 7. The ceedling probe gets per-tool timeouts, one retry, and a careful version read

【变更】`packages/client/ui-settings-baf-standard/src/index.ts`:

- **Per-tool timeouts** (`QUALITY_PROBE_TIMEOUTS`): ruby 20s, ceedling 30s, everything else 4s. The old probe ran serially with no timeout, so one slow tool stalled the whole check.
- **Up to two attempts** (`QUALITY_PROBE_ATTEMPTS = 2`), and **only a timeout or a spawn resource error retries** — a tool that ran and reported a real error is not retried, because that would hide a genuine failure behind a second attempt.
- **Both stdout and stderr are read.** ceedling reports its version on stderr in some setups; reading only stdout read an empty string as "no version".
- **The version is read from the first 8 lines only**, a labelled version line wins over an unlabelled one, and **path lines are skipped** — the old parser could pick a Ruby version out of a gem path and report it as ceedling's version, which then failed the environment check.

The verdict semantics ("the environment is incomplete") are unchanged; only the measurement became reliable.

## Alternatives considered

**A new `ui-baf-desktop` Remote for the model path.** The tidy-up control lives in `ui-baf-desktop`, so a dedicated Remote there would look natural. Rejected: it would add a Typert namespace to `packages/api/remotes`, a new generator surface, and a second mount point for the same host service. The `bafWorkflowView` Remote already exists, already owns workflow-scoped I/O for the same sessions, and already sits in the same client package the control talks to. One namespace, one mount, one code path.

**A separate provider/model picker for the tidy-up.** Rejected: the customer asked for the model to be *implicit*. A picker makes the user configure a second model to format a sentence, and the session already has the model the user is talking to. The session's own route is the only choice that needs no configuration.

**Writing the model call into the session log as an event.** Rejected: it would make a formatting call a logged turn, which changes what "the session log" means for replay and forces the session-format-catalog and event-vocabulary gates to grow a new entry. The arranged draft is the user's own text; the composer already persists it, so the model-visible content stays reconstructible without a new event.

**Replacing the local arranger with the model.** Rejected: the arranger is deterministic, free, offline, and instant. It is also the only thing that works when the session has no routed model (a fresh session that never sent a request). Model-first with a local fallback gives both; model-only gives neither.

**Sanitizing the model's answer with a prompt instead of a code-level cleaner.** Rejected: a prompt is a request, not a guarantee. The cleaner is a deterministic pass that runs on whatever the model returns, so a chatty or fenced answer still cannot corrupt the draft.

**Folding every session View into 更多 (no primary list at all).** Rejected: the customer named five views they open constantly. A whitelist keeps the frequent ones one click away and folds the rest, which is the asymmetry that matters. A fixed "five" also means the strip does not silently shrink when a plugin leaves.

**Moving 自动化任务 out of the rail by deleting the registration.** Rejected: the launcher must remain reachable. The pin store already models "in the rail" vs "in More"; the change is one default value, not a registration change.

**Deleting 浏览更多插件 everywhere.** Rejected: the conversation and right-bar regions have no 插件 launcher of their own, so removing the row there would remove the only path to plugin discovery. It is removed from the sidebar region only, where the rail's fixed 插件 launcher already provides it.

**Retrying the ceedling probe on any non-zero exit.** Rejected: a non-zero exit is the tool's own verdict. Retrying it would turn "the tool failed" into "the tool failed twice, slower", and would mask the real reason. Only timeouts and spawn resource errors — which are the machine being busy, not the tool being broken — retry.

**Reading the version from the whole stdout/stderr.** Rejected: the old parser scanned everything and took the first number it found, which is how a gem path's Ruby version became ceedling's version. The first 8 lines, a labelled line preferred, and path lines skipped is the narrowest read that still finds a real version.

## Testing

**Unit and type gates**

| Gate | Result |
| --- | --- |
| `vitest run packages/client/ui-baf-workflow packages/client/ui-baf-desktop` | 14 files / **139 tests green** |
| `tsc -p tsconfig.client.json --noEmit` / `tsconfig.host.json --noEmit` (ui-baf-workflow) | 0 errors each |
| `tsc -p tsconfig.json --noEmit` (ui-baf-desktop) | 0 errors |
| `tsc -p tsconfig.json --noEmit` (`packages/llm/llm`, `packages/llm/deepseek-llm-api-extensions`) | 0 errors each |
| `pnpm run build:artifacts` | **8 gates passed, 0 failed** (native, Typert, host compile, host bundle, desktop bundle, client compile, client bundle, web build) |
| `pnpm run build:check` | **2 gates passed, 0 failed** (host + client aggregate type checks) |

Two pre-existing failures remain on this branch and are **not** from this batch: `ui-conversation`'s `chat-apply` spec (the `remote` service is registered twice at the root) and `ui-sidebar-documentpreview`'s bundled-license spec (it needs built artifacts).

**Web end-to-end probe** (`overlay/scripts/probe-batch24-web.mjs`, a stable `start:web` server plus a headless Edge over CDP): **37 assertions, all PASS, `fail: []`, `skipped: []`**

| Group | Measured |
| --- | --- |
| Sidebar | the rail carries `插件 / 工作流 / 更多` — no 自动化任务 row; **更多** carries `自动化任务` + `创建你的插件`, and no 浏览更多插件 |
| Session strip | the visible tabs are exactly `对话 / 轨迹 / 轨迹图 / 工作流图 / 测试流图`; **更多会话视图** holds `上下文` |
| Change ledger | the section head reads `变更记录 1 点击变更项可展开它的流程图与完整历史记录。`; 导出看板 paints a gold gradient while 刷新 paints none (the two are graded) |
| Artifact preview | `proposal.md` opens in the preview window with its path, its body and the 在侧栏打开 action, and the window closes on demand |
| Confirmation gates | the hero reads `BAF 确认门台账 工作流确认门 …`; the three plates read `13 确认门 / 6 阶段门禁 / 11 状态节点` with tones `confirm / stage / states`; the console bar reads `工作流确认门流程图 点击节点或门禁查看明细` and carries **0** count chips |
| Quality environment | the ceedling row reads `Ceedling / 必装 / 单元测试构建（gem） / project.yml.baf/quality/ceedling-config.json / 1.0.1 / 已就绪`; after a re-check the verdict reads `当前工作区支持单元测试环境` **twice in a row** and the row is byte-identical |
| Composer tidy-up | the control shows its working state (`data-baf-draft-format-working="true"`) while the model is asked, then the draft reads `包括：\n\n- 用户信息模块\n\n- 权限模块\n\n- 订单模块` and the control turns into 回退 |

**Desktop exe** — `overlay/desktop/dist/win-unpacked/baf-dsh.exe`, **204,592,128 bytes**, built with `electron-builder --dir` (no installer). The packaged `resources/dsh/baf-product-versions.json` reads `bafDsh: 0.0.48`, and the bundled `lib/client.js` of `dsh-client-ui-baf-desktop` / `dsh-client-ui-baf-workflow` / `dsh-client-ui-sidebar` / `dsh-client-ui-conversation` carries this batch's strings (`draft.working`, `sanitizeModelDraft`, `change-artifact-preview`, `baf-gates-hero`, `baf-gates-tiles`, `ovw.listLabel`, `schedules`, `trace-graph`, `baf-test-flow`).

**Desktop exe end-to-end probe** (`overlay/scripts/probe-batch24-exe-ui.mjs`, the packaged app over CDP): **24 assertions, all PASS, `fail: []`, `skipped: []`** — the version marker (`0.0.48`), the sidebar's **更多** (`自动化任务` present, 浏览更多插件 absent, the rail carrying neither), the session strip (`对话 / 轨迹 / 轨迹图 / 工作流图 / 测试流图`, with `上下文` folded into **更多会话视图**), the ledger's `变更记录` section head, the graded 导出看板 / 刷新, the 确认门 hero + three plates + chip-free console bar, and the composer tidy-up (working state → Markdown list → 回退) all hold **inside the desktop application**.

## Consequences

**Bought**

- The 变更总览 and 确认门 tabs now read as one product: same skeleton, same gold material, same eyebrow-and-figures rhythm. The abandoned-change bar finally looks abandoned.
- A document artifact is readable in place, in the same window the 测试流图 uses, with the sidebar still one click away.
- The rail carries only what is opened constantly; the session strip carries only the five core views. Both stop growing as plugins ship.
- 「格式化输入」 handles the case it was failing at (a long prose draft that needs headings and lists), on the model the user already chose, with no configuration and no error surface.
- The ceedling check stops reporting false failures on healthy machines.

**Cost**

- The tidy-up is no longer free: a model call costs tokens and takes time. The control says so (`draft.working`) and the local arranger remains the zero-cost path whenever no model answers.
- The model path is asynchronous where the old control was synchronous. The component's injected face carries an optional `formatWithModel`; a consumer without one keeps the synchronous contract.
- `packages/client/ui-baf-workflow` now injects `llm`, depends on `@deepseek-ai/dsh-llm`, and hosts a second Remote method; `packages/client/ui-baf-desktop` now depends on `@deepseek-ai/dsh-api-remotes` and on the workflow client's remote types. Both changes widen the package dependency graph.
- The `purpose` union in the LLM package grew a value, and the mirrored type-equiv block in the llm-streaming docs had to move with it.

**Deferred**

- The arranged draft is one snapshot: pressing the control twice does not undo the first arrangement (the revert action still restores the pre-tidy-up text).
- A draft holding @ file references is still left alone — the composer writes the draft as plain text, which would drop the reference chips.
- The model path is not recorded per draft, so the UI cannot show which model arranged the text.

**Versions and artifacts**

- Desktop version **0.0.47 → 0.0.48** (`overlay/desktop/VERSION`, `overlay/desktop/package.json`, `overlay/desktop/version-notes.json`, `overlay/docs/release/version-map.md`).
- Artifact: `overlay/desktop/dist/win-unpacked/baf-dsh.exe` — the unpacked directory, **no installer**. (The `dist/` folder still holds a `baf-dsh-Setup-0.0.38.exe` from an earlier batch; this batch produced none.)
