# Agent Note: Batch 29 (2026-10-26) — the 格式化输入 button calls the model again, the settings nav clusters, and 变更总览 gets real sort controls and a readable board

Status: implemented

## Problem

The customer asked for six changes to the BAF DSH desktop app:

1. The conversation's 「格式化输入」 button reports 「模型未响应」 — find out why and fix it.
2. In Settings, 「多模型路由」「版本与更新」「推荐插件」「用户反馈」 must read as **one run**, immediately after 「Agent 预设」, never split by another plugin.
3. The 「BAF DSH DESKTOP」 notes in 「版本与更新」 must be **listed item by item**, each item its own paragraph.
4. The 工作流 page's 项目工程 / 测试流 / 指令集 / 企业规范 need a **fade-in** entrance, consistent with 「确认门」.
5. In 变更总览, the **排序** and **流程** dropdowns must look like the 设置 → 通用设置 → 权限 dropdown; the sort list gains 「耗时」「耗token」「开始时间」, and a **linked 「升序/降序」** dropdown is added.
6. The 变更总览 board opened in the browser needs **filtering and sorting**, and clicking a change must **open its detail** — the content mirrors the 变更总览 page.

## Decision

### ① 「模型未响应」 was a missing Cordis `inject`, not a missing model

The button's model path reads `ctx.remote.bafWorkflowView` and calls `formatDraft`. A Remote namespace is a **Cordis service of its own**, named `remote.bafWorkflowView` — it is not a property hanging off the `remote` service. Reading `ctx.remote.bafWorkflowView` therefore asks the context resolver for the service *name* `remote.bafWorkflowView`, and a plugin may only read a service it declared in its `inject` array. `ui-baf-desktop` declared `['slots', 'locale', 'shortcuts', 'remote']` — the namespace name was missing, so the read threw

> cannot get property "remote.bafWorkflowView" without inject

The button swallowed the throw in `catch { answer = undefined }` and fell back to the **local arranger**, printing 「模型未响应，已用本地规则整理结构」 — while the host answered the very same call. The fix is one entry: `'remote.bafWorkflowView'` in the plugin's `inject`.

The host side gained a second, independent fix: a **fresh session** (the case a user arranges a draft in — nothing sent yet) owns no recorded selection, no agent and no request header, so every route candidate was empty. `defaultRouteFor` now reads the deployment's default model (`agentDefaultModel.currentSelection()`) as the last resort, and the route passes through the per-step resolver so a default that IS the BAF 「自动」 pseudo entry resolves to the tier route instead of the pseudo pair. The formatter also **logs** the "no route" case now, so a future 「模型未响应」 has a ground truth instead of silence.

### ② The nav cluster is pinned after the sort, not by order values

The four sections are registered by **four separate plugins**. Their `order` values cannot keep each other adjacent: the runtime 技能 section owns no repo package and can register *between* them — the live nav read 通用设置 / 模型 / 内置插件 / Agent 预设 / 多模型路由 / **技能** / 版本与更新 / 推荐插件 / 用户反馈 / 插件市场, i.e. 技能 split the cluster in half. The nav projection therefore **lifts the four rows out and re-inserts them as one run behind the 「Agent 预设」 anchor**, after the order sort. A deployment that does not carry all four rows keeps its natural order.

### ③ The notes are a list, and the list is data

The settings page already split the notes on `\n` and rendered one `<p>` per line — but `margin: 0` collapsed the paragraphs into one wall of text, so the row read as a blob. Each paragraph now carries a bullet, an indent and its own spacing. The copy itself became a real list: `version-notes.json`'s `desktop.notesZh` (the shipped source) and the desktop fallback in `versions.ts` both carry **one point per line**, and the release notes for this batch were written the same way.

### ④ One keyframe, four pages

The 确认门 tab's entrance (`gatesFadeUp`) became the family's recipe. 项目工程 / 测试流 / 指令集 / 企业规范 each gained the same `wfFadeUp`: the page header lands in 320ms, the figure plates in 360ms staggered 40/80/120/160ms, the cards in 380ms. The fill mode is `backwards`, so the animation never pins an element's final transform — a card that lifts on hover stays free to do so once the entrance is over.

### ⑤ The sort became a dimension plus a direction

The sort field used to **bake the direction into the id** (`durationDesc` / `durationAsc`), so 「最短优先」 was reachable from the duration field alone and every other field was stuck on one direction. Now:

- 「排序」 names the **field**: 默认顺序 / 耗时 / 耗token / 开始时间 / 任务完成率,
- 「升降序」 names the **direction**: 降序 / 升序, and flips whatever field 「排序」 names.

The direction control rests while the sort is 默认顺序 (there is nothing to flip). A row that cannot answer the dimension — no duration, no tokens, no start time — sorts **last in both directions**: an unknown value is not the smallest one. 「开始时间」 needed a fact that did not exist, so the dashboard row now carries `startedAt` (the first projection event's timestamp, folded the same way the Tab view folds it).

The two dropdowns (and 「流程」) use the 设置 → 通用设置 → 权限 recipe: a pill trigger (`--dsw-alias-bg-module-platform`, 12px radius, 26px tall, 12px text) plus the shared `Menu` primitive, instead of the browser's native select.

### ⑥ The board became a reader

The exported board is a **static file** — it cannot ask the host for a change's detail when the customer clicks it. The export therefore reads **every** change's detail up front (in parallel) and embeds the flattened answers in the document; every label is resolved client-side, so the page only prints. A change whose detail cannot be read still gets a card (the overlay says so) instead of failing the whole export.

The page carries the ledger's own view controls — the change-state categories, the workflow mode, the search box, the sort dimension and the asc/desc direction — and a per-change **detail overlay** whose body mirrors 变更总览 field for field: 开始时间, 结束时间, 耗时, Tokens, 任务进度, 状态, 变更分类, 变更类型, 模式, 影响范围, 置信度, 判定依据, 阶段产物, 阶段流程, 历史记录.

Because the export now reads every detail before the board can open, the 「在浏览器中打开」 button shows a spinner while it works.

## Verification

- **web 端真机探针**（headless Edge CDP 9200，1680×1050）全项 PASS：
  - 格式化输入 —— 点击后发出 `POST /api/bafWorkflowView/formatDraft`，提示从 `local` 变成 `optimized`；
  - 设置导航 —— 通用设置 / 模型 / 内置插件 / Agent 预设 / 多模型路由baf / 版本与更新baf / 推荐插件baf / 用户反馈baf / 技能 / 插件市场；
  - 版本说明 —— 每条独立成段（带项目符号）；
  - 淡入 —— 四页的动画直方图与确认门同族（0.32s / 0.36s 交错 / 0.38s）；
  - 下拉 —— 排序 = 默认顺序/耗时/耗token/开始时间/任务完成率，升降序 = 降序/升序（默认顺序时置灰，选耗时后启用且标签翻为升序），流程 = 全部流程/完整流程/Bug 修复路径/待澄清；三者的触发器与权限选择器同配方（bg rgb(245,246,247)、border 0px none、radius 12px、height 26px、font 12px、chevron svg）；
  - 浏览器看板 —— 30996 字节，带筛选/排序/详情浮层。
- **单测**：`change-overview.client.spec` 12/12、`settings-root.client.spec` 全绿（顺带修好了两处 HEAD 预存红：空项目说明 `ovw.empty` 被批次二十八丢掉、宽栏触发器的快捷键绑定对辅助技术不可见）。
- **typecheck**：全部改动包干净。
- **打包产物真机复核**（`overlay/desktop/dist/win-unpacked/baf-dsh.exe`，0.0.53，CDP 9200）六项全过：
  - 格式化输入 —— 点击后发出 `POST /api/bafWorkflowView/formatDraft`，按钮的 `data-baf-draft-format-notice` 由 `local` 变成 `optimized`；
  - 设置导航 —— 通用设置 / 模型 / 内置插件 / Agent 预设 / 多模型路由baf / 版本与更新baf / 推荐插件baf / 用户反馈baf / 技能 / 插件市场；
  - 版本说明 —— 六个 `<p class="OIsWla_notes">`，每条独立成段（首段 marginTop 0，其后每段 4px，paddingLeft 11px）；
  - 淡入 —— 只数**可见**面板的动画：项目工程 / 测试流 / 指令集 / 企业规范 均为 `wfFadeUp` 家族（0.32s 页头 / 0.36s 图版交错 0.04·0.08·0.12 / 0.38s 卡片），与确认门的 `gatesFadeUp` 同族；
  - 下拉 —— 排序 = 默认顺序/耗时/耗token/开始时间/任务完成率，升降序 = 降序/升序（默认顺序时 disabled=true，选「耗时」后启用，选「升序」后标签翻转），流程 = 全部流程/完整流程/Bug 修复路径/待澄清；三者触发器 bg rgb(245,246,247)、border 0px none、radius 12px、height 26px、font 12px、带 chevron svg，与权限选择器同配方；
  - 浏览器看板 —— 桌面桥把 32263 字节的看板写到 `%TEMP%/baf-dsh/baf-dsh-change-overview.html` 并用系统浏览器打开；看板内有 boardSort / boardOrder / boardMode / boardSearch / data-cat(all·active·completed·abandoned) / boardDetail；实测分类筛选、流程筛选、搜索都改变计数（1/1 → 0/1），点变更弹出详情浮层，内容含 开始时间 2026-10-14 01:21:11 / 结束时间 / 耗时 9m29s / Tokens 1.9M / 任务进度 / 状态 / 变更分类 / 变更类型 / 模式 / 影响范围 / 置信度 / 判定依据 / 阶段产物 / 阶段流程 / 历史记录，与变更总览逐项对齐。

## 打包链

`pnpm run build`（10/10 门 PASS）→ `node overlay/scripts/brand-web.mjs`（写入标题「BAF DSH」/ 版本 v0.0.53）→ `node overlay/scripts/pack-dsh.mjs`（`packed dsh -> overlay/desktop/resources/dsh`）→ `cd overlay/desktop && npm run dist:dir`（electron-builder `--dir`，**不出安装包**）→ `cd overlay && node scripts/generate-manifest.mjs`（schema 2 / epoch 6 / keyId baf-test-2026q4）。

产物：`overlay/desktop/dist/win-unpacked/baf-dsh.exe`（204 MB，无安装包）。

## Notes / caveats

- `packages/baf/baf-workflow/tests/route-auto.spec.ts` 的「registers as the step route resolver…」在 **干净 HEAD 上即红**（`cannot get property "asymmetricMatch" without inject`），与本批次无关。
- `session-gate.spec.ts` / `orchestrator.spec.ts` 在低内存下偶发红，单文件复跑即绿（预存 flake）。
