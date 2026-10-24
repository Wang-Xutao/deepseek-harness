# 批次十八（2026-10-23）：splash 慢启动同步 + 验证卡链接白字 + 工作流页面「变更总览」页签 — desktop 0.0.41

> 需求原句（两部分六点）：1. splash 页面：1.1 「首次启动耗时较久，请耐心等待」后增加「…」，和其他保持一致。1.2 将左上角的版本改到左下角显示。1.3 将 5s 触发的「后台运行」按钮改到右上角显示，并增加合适的图标。1.4 按钮的显示要和「首次启动耗时…」文字同步显示，当前是会先显示按钮，再显示文字。2. 会话，工作流图界面：2.1 验证状态卡片的链接「测试流图-ceedling单元测试」改为「测试流图」，文字改为白色。更加醒目。2.2 已放弃的变更也应该放入变更总览中记录。2.3 在工作流页面中最后加一个 tab 页面，命名为「变更总览」，能够看到该项目中的所有变更。

## 0. 结论速览

| # | 需求 | 落点 | 状态 |
| -- | ---- | ---- | ---- |
| 1.1 | 慢启动提示补省略号 | `overlay/desktop/ui/splash.js` | ✅ `SLOW_HINT = '首次启动耗时较久，请耐心等待…'`——与其余六条状态行同款省略号 |
| 1.2 | 版本号移到左下角 | `overlay/desktop/ui/splash.css` | ✅ `.version` 绝对定位改 `bottom:14px; left:16px`（原 `top:10px`）；页脚只剩 credit |
| 1.3 | 后台启动按钮移到右上角 + 图标 | `splash.html` / `splash.css` | ✅ `.bgStart` 绝对定位改 `top:9px; right:14px`；按钮内嵌 16×16 下箭头 SVG（`转入后台` 语义，stroke=currentColor） |
| 1.4 | 按钮与提示语同步 | `overlay/desktop/ui/splash.js` | ✅ 5s 回调内「插队 → 立刻渲染提示语 → 再点亮按钮」同帧完成；批次十七「先出按钮、文字等一圈才补上」的时序消除 |
| 2.1 | 验证卡链接白字 | `WorkflowView.tsx` / `WorkflowView.module.css` | ✅ 标签精简为「测试流图」（阶段名移入 `title` 悬停）；`color:#fff` + 品牌实心渐变底 + 投影 |
| 2.2 | 已放弃的变更入账 | `ChangeOverviewRow.tsx` | ✅ 状态列三态药丸（进行中 / 已完成 / 已放弃），已放弃变更独立成行并保留结束时间、耗时、Tokens |
| 2.3 | 工作流页面末位「变更总览」页签 | `ChangeOverviewRow.tsx` + `WorkflowSection.tsx` + `index.ts` | ✅ 工作流主页面第七个页签（末位）：项目路径 + 四枚汇总磁贴 + 变更台账表（变更 ID / 模式 / 状态 / 计划任务 / 耗时 / Tokens / 结束时间） |

测试：`ui-baf-workflow` + `ui-baf-tracegraph` 15 文件 94 项全绿（新增 `change-overview.client.spec.tsx` 5 例 + 改写页签宿主断言为七页签）；`pnpm run build` 九门全 PASS（host/client 编译 + 聚合 check + Web build）。

出包：`npm run dist -- --dir` → `overlay/desktop/dist/win-unpacked/baf-dsh.exe`（0.0.41，**免安装目录，无 NSIS 安装包**）。

exe 冒烟：exe 真实窗口层 `fail: []`（exit 0，3 条 SKIP 如实记录本机热启动下 splash 4–5.6 s 即销毁）；splash 渲染层 8 项断言全 PASS（exit 0），5 s 那一帧按钮与「首次启动耗时较久，请耐心等待…」同帧出现。

web 实测（`node apps/cli/lib/bin.js --profile web --port 3080 --no-open` + headless Edge CDP 9200，探针 `overlay/scripts/probe-batch18-web.mjs`）：工作流页面页签实测七条「通用 / 项目工程 / 确认门 / 指令集 / 企业规范 / 测试流 / 变更总览」，末位即「变更总览」；页签面板挂载 `baf-change-overview` 真数据（项目 `D:\Source\baf-codingplugin\demo\demo1`，磁贴 进行中 0 / 已完成 0 / 已放弃 1 / 计划任务 0/0，台账行 `change-20261013-ecum-050e` · 完整流程 · 已放弃 · 9m29s · 1.9M · 2026-10-21 03:29）——**已放弃的变更确实入账并有独立状态药丸**；验证卡 chip 实测 `text="测试流图"`、`title="跳转到测试流图的这一步 · ceedling 单元测试"`、`color=rgb(255, 255, 255)`、底色 `linear-gradient(135deg, rgb(201,162,39), …)`。截图 `overlay/scripts/out/batch18-change-overview.png` / `batch18-verify-chip.png` 视觉复核无重叠/截断。

## 1. splash：提示语与按钮同帧、版本号左下角、按钮右上角带图标（需求 1.1–1.4）

【变更】`overlay/desktop/ui/splash.js`：

- 状态文案抽为常量 `SLOW_HINT = '首次启动耗时较久，请耐心等待…'`（需求 1.1）——批次十七的 `'首次启动耗时较久，请耐心等待'` 缺尾省略号，与其余六条状态行不齐。
- 5s 回调改为「插队 → 立刻渲染 → 点亮按钮」三步同帧（需求 1.4）：`statuses.splice(i + 1, 0, SLOW_HINT)` 后 `i` 前进一格并立即 `renderStatus()`，随后 `bgStart.classList.add('on')`。批次十七只做 splice，按钮在 5s 当帧浮出、提示语要等下一次轮播（最长 2s）才上屏——正是客户说的「先显示按钮，再显示文字」。现在提示语与按钮在同一帧出现，轮播语义保留（提示语仍每圈轮到一次）。
- `statuses` / `i` / `statusEl` / `bgStart` 提到定时器注册之前（原先声明在 `setTimeout` 之后，靠闭包侥幸可用）；新增 `renderStatus()` 单一渲染出口，轮播与 5s 回调共用。

【变更】`overlay/desktop/ui/splash.css`：

- `.version`：`top:10px` → `bottom:14px`（需求 1.2）——版本徽标移回左下角，与右下角 credit 对称。
- `.bgStart`：`left:16px; bottom:14px` → `top:9px; right:14px`（需求 1.3），并改 `display:inline-flex` + `gap:4px` 容纳图标；`padding` 改 `4px 12px 4px 9px`（左侧让位图标）。
- 新增 `.bgStartIcon`：12×12、`fill:none`、`stroke:currentColor`、`stroke-width:1.5`、圆头圆角——下箭头落入托盘基线（`M8 1.75v6.25` + 箭头 + `M2.75 13.25h10.5`）。

【变更】`overlay/desktop/ui/splash.html`：按钮内嵌 `<svg class="bgStartIcon" viewBox="0 0 16 16" aria-hidden="true">` 三条 path；`#version` 与按钮的注释同步本批改版。

## 2. 验证状态卡片的链接：白字「测试流图」（需求 2.1）

【变更】`packages/client/ui-baf-workflow/src/client/WorkflowView.tsx`：验证卡 chip 标签由 `` `${t('flow.testFlowJump')} · ${t(TEST_FLOW_JUMP_LABEL[jumpStage])}` `` 改为 `t('flow.testFlowJump')` 单标签；阶段名移入 `title`（`跳转到测试流图的这一步 · ceedling 单元测试`），信息不丢、标签更短。

【变更】`WorkflowView.module.css` `.flowNodeTestFlowChip`：`color: var(--wf-accent)` + 12% 淡底 → `color:#fff` + 品牌实心渐变底 `linear-gradient(135deg, var(--wf-accent), color-mix(in srgb, var(--wf-accent) 70%, #141414))` + 同色描边 + 品牌投影；hover 走 `brightness(1.08)`（白字底色不随 hover 变淡）。字号 0.6rem → 0.62rem。

## 3. 工作流页面「变更总览」页签（需求 2.2 / 2.3）

【新增】`packages/client/ui-baf-workflow/src/client/ChangeOverviewRow.tsx` + `.module.css`：工作流主页面末位页签的内容——项目路径 + 四枚汇总磁贴（进行中 / 已完成 / 已放弃 / 计划任务）+ 变更台账表。**已放弃的变更是独立一行**（状态药丸 `data-state="abandoned"`），保留结束时间、耗时、Tokens 与计划任务计数；终态行的阶段列不再重复印一次终态名（阶段即状态），只有进行中的行印阶段。

【新增】`packages/client/ui-baf-workflow/src/client/dashboard-format.ts`：`modeLabel` / `formatDuration` / `formatTokenCount` / `formatTokens` 从 `WorkflowView.tsx` 提出（该文件的四个私有函数删除后改为 import）——会话内的变更总览弹窗与新页签同一套格式化口径，一处修改两处同步。

【新增】host 面 `@Remote('changeOverview')`（`packages/client/ui-baf-workflow/src/index.ts`）：工作区口径的变更台账。取值路径与 `dashboard` 相同（`buildWorkflowDashboard` 同一构造器、同一 token 归因规则），差别只在**工作区解析**：`dashboard` 是会话口径（`contextFor(sessionId)`），`changeOverview` 取「最新一个带 cwd 的存活会话」的工作区（`workspaceCwd()`，会话按创建序，末位最新）——工作流主页面没有会话在身后，必须自己认项目。无工作区时回 `{status:'no-workspace'}`，页面显示自己的空态说明。

【新增】`packages/client/ui-baf-workflow/src/types.ts` `BafWorkflowChangeOverviewResult` 与 `src/client/tab-types.ts` 的客户端镜像；`src/client/index.ts` 注册 `settings.workflow.item` 行（id `baf-change-overview`，order 16，紧随门禁总览 15）。

【变更】`packages/client/ui-baf-tracegraph/src/client/WorkflowSection.tsx`：页签表加末位 `{ id: 'changes', labelKey: 'tabs.changes', slotIds: ['baf-change-overview'] }`；`locales.ts` 加 `tabs.changes`（变更总览 / Change overview）。页签渲染沿用既有 `renderSlot('settings.workflow.item', {}, { only })` 机制，页签只声明槽位 id、内容由 ui-baf-workflow 提供——与「项目工程 / 确认门 / 指令集 / 企业规范 / 测试流」同款分权。

## 4. 测试

【新增】`packages/client/ui-baf-workflow/tests/change-overview.client.spec.tsx`（5 例）：已放弃变更入账且状态药丸正确（active / completed / abandoned 三态）；项目路径与四枚磁贴读数；空项目空态文案；无工作区空态；加载失败报错 + 刷新重读。

【变更】`packages/client/ui-baf-tracegraph/tests/workflow-section.client.spec.tsx`：页签断言由六条改七条（末位 `workflow-tab-changes`），并断言点击后渲染 `baf-change-overview` 槽位。

## 5. 打包

版本 0.0.40 → 0.0.41（`overlay/desktop/VERSION` + `package.json` + `version-notes.json` 批次十八中英文注记；`baf-product-versions.json` 由 pack-dsh 重写）。`overlay/docs/release/version-map.md` 补 0.0.37–0.0.41 五行（该表此前停在 0.0.36）。

出包链：`pnpm run build`（九门全 PASS）→ `node overlay/scripts/brand-web.mjs`（内嵌标题「BAF DSH」/ 版本标签「v0.0.41」）→ `node overlay/scripts/pack-dsh.mjs` → `overlay/desktop` `npm run dist -- --dir`（**仅免安装目录，不产 NSIS 安装包**）→ `dist/win-unpacked/baf-dsh.exe`。

exe 冒烟分两层：「exe 真实窗口」（CDP 骑 splash 窗口）与「splash 渲染层」（无头 Edge 加载随包发布的 splash 资源）——探针 `overlay/scripts/probe-batch18-exe.mjs` 与 `overlay/scripts/probe-batch18-splash-page.mjs`。实测详见 §6。

## 6. exe 冒烟结果

产物：`overlay/desktop/dist/win-unpacked/baf-dsh.exe`（204,592,128 字节，2026-10-24 00:53:28 产出，**无安装包**）。打包链一次跑通：`pnpm run build`（九门 PASS）→ `brand-web.mjs`（内嵌 `v0.0.41`）→ `pack-dsh.mjs` → `npm run dist -- --dir`（`DIST_EXIT=0`）。

**第一处卡点（已解决）**：首次 `dist` 被 `electron-builder.mjs` 的 `assertNoRunningBafDsh` 拦下——上一批遗留的 4 个 `baf-dsh.exe` 进程占着 `dist/`。`taskkill /IM baf-dsh.exe /F` 后重跑即通过（该守卫是仓库自带的保护，不要绕过）。

**冒烟拆成两层**（探针：`overlay/scripts/probe-batch18-exe.mjs`、`overlay/scripts/probe-batch18-splash-page.mjs`）：

| 层 | 手段 | 结果 |
| -- | ---- | ---- |
| exe 真实窗口 | `probe-batch18-exe.mjs`（CDP 骑 splash 窗口） | `fail: []`，exit 0 |
| splash 渲染层 | `probe-batch18-splash-page.mjs`（无头 Edge 加载随包发布的 `overlay/desktop/ui/splash.html?version=0.0.41`） | 8 项断言全 PASS，exit 0 |

**exe 层实测**：splash 渲染 `v0.0.41` 且落在左下角（`atBottomLeft: true`，x=52/y=238）；5 s 前按钮 `opacity: 0` + `pointer-events: none`（不可点）；主窗口起来（`http://127.0.0.1:12094/`）；主进程启动时序 `app-ready 0 → splash-shown 135 → dsh-spawn 316 → dsh-ready 5587 → splash-closed 5620 → main-shown 5621`（取自 `<userData>/launch-timings.jsonl`）。

**exe 层的 3 条 SKIP（本机热启动，如实记录不算缺陷）**：本机 dsh 后端 **4–5.6 s 就绪**，splash 在 5 s 按钮亮起前 0.2–0.6 s 被销毁（`closeSplash()`），因此「5 s 按钮块」「后台启动点击」「splash-bg-start 标记」三步在本机无法复现，探针判为 SKIP 并写明原因。

**同一 exe 的冷启动运行实测过 5 s 按钮块**：那次 dsh 后端就绪耗时 40.8 s（首次冷读约 1 GB 运行时导致），按钮与提示语在**同一次采样**中出现——`status: "首次启动耗时较久，请耐心等待…"`、`topRight: true`、`iconPaths: 3`、`text: "后台启动"`；截图 `overlay/scripts/out/batch18-exe-splash-slow.png` 目视复核：按钮在右上角（带下箭头图标），提示语在轮播行，版本号在左下角。点击「后台启动」后主进程写出 `splash-bg-start` 标记，主窗口随后就绪。

**渲染层实测（确定性）**：5 s 那一帧按钮 `.on` 与提示语同帧出现（`status === "首次启动耗时较久，请耐心等待…"`）、按钮右上角（`topRight: true`）、图标 3 条 path（`iconPaths: 3`）、文案仍是「后台启动」、提示语随后仍按圈轮播。

**随包字节核对**：`dist/win-unpacked/resources/app.asar` 内含 `首次启动耗时较久，请耐心等待…`（带省略号）与 `bgStartIcon`（新增图标类），确认改动确实进了 exe。

**探针自身的三处修正**（都是判据/健壮性问题，非产品缺陷）：

1. 「splash 消失」原判据是「CDP target 消失」——错。`ipcMain.on('splash:bg-start')` 走的是 `splashWindow.hide()`（隐藏非销毁），target 要等后端就绪才被 `closeSplash()` 销毁（本机 40 s 级），15 s 内必然判失败。改为「窗口自报 hidden」或「target 消失」双信号任一成立即算隐藏。
2. CDP `send()` 无超时：splash target 在飞行中被销毁时 pending promise 永不 settle，探针会挂死。已加 15 s→6 s 超时 + 一次重试 + 同步求值（去掉 `awaitPromise`）。
3. `process.exit()` 与 libuv 句柄拆除赛跑 → `win/async.c` 断言（exit 3221226505）。已在 kill 后延迟 800 ms 再退出。

## 7. 遗留问题（按影响排序）

1. **快机器上「后台启动」按钮几乎看不到**：按钮在 5.0 s 亮起，而后端就绪即销毁 splash——本机 dsh 热启动 4.0–5.6 s 就绪，两者只差 0.2–0.6 s（实测 `dsh-ready 5587 → splash-closed 5620`）。慢机器（客户场景，后端 20 s+）上按钮与提示语才有实际停留时间。本批未改这个节奏（客户要的正是「慢启动时给个出口」）；若客户反馈「按钮闪一下就没了」，正解是把按钮出现时刻改为「后端超过 N s 未就绪」的事件驱动，而不是固定 5 s 定时器。
2. **「变更总览」页签的工作区解析依赖存活会话**：页签取「最新一个带 cwd 的存活会话」认项目（与「项目工程」页同一口径）。全部会话退出后页面回「未绑定工作区」空态，而不是报「该项目无变更」——文案已如实说明，但客户若期望「无会话也看得到历史」，需要给页签一条显式的项目选择器（本批未做）。
3. **页签与项目工程页的项目口径同源**：两者都跟随「最新存活会话」，客户在两个页面间切换时看到的项目路径一致；若将来引入显式项目选择，两处要一起改。
4. **变更总览弹窗仍在会话内**：会话顶栏「变更总览」按钮打开的弹窗保留（它额外提供「点击行在流程图聚焦」与「在浏览器中打开」看板）；新页签是项目级只读台账，两者共用同一份构造器数据，不会出现口径分歧。
5. **splash 提示语仍按圈轮播**：提示语进了旋转列表，每圈（14s）轮到一次；按钮在 5s 当帧与其同现后保持可见（不随之闪烁）。客户若要提示语常驻，需再改一轮。
