# 批次二十（2026-10-24）：变更总览 / 变更详情 / 确认门三页 UI 升级 + 测试流页签移位 — desktop 0.0.43

> 需求原句（四条）：1. 工作流变更总览界面ui需要优化，要求美观、炫酷、醒目直观、清晰和谐。2. 工作流确认门界面ui需要优化，要求美观、炫酷、醒目直观、清晰和谐。3. 变更总览的变更详情界面ui需要优化，要求美观、炫酷、醒目直观、清晰和谐。要求显示完整的工作流图，和会话工作流界面保持一致，顶部、左侧、右侧都有详细信息，中间是工作流图。4. 将测试流放到确认门和指令集之间。注意保持ui风格的一致性，参考会话的工作流图和测试流图样式。

## 0. 结论速览

| # | 需求 | 落点 | 状态 |
| -- | ---- | ---- | -- |
| 1 | 变更总览页 UI 优化 | `ChangeOverviewRow.tsx` / `ChangeOverviewRow.module.css` | ✅ 改为「金箔仪表台」：BAF 徽标 + 台账抬头、四块带金线的图表面板、变更卡片重做为金色发丝边圆角浮面（状态色左条 / 任务进度条 / 悬停抬升 + 金色光晕）|
| 2 | 确认门页 UI 优化 | `GatesOverviewRow.tsx` / `GatesOverviewRow.module.css` | ✅ 同一套金色材质与动效语言（分层表面 + 金色发丝边 + 顶部高光 + 错峰淡入 + 悬停抬升 + 选中态扫光）|
| 3 | 变更详情界面 UI 优化 + 完整工作流图 + 顶部/左侧/右侧详细信息 | `ChangeOverviewRow.tsx`（重写）/ `FlowCanvas.tsx`（新建，共享）/ `flow-parts.tsx`（新建，共享）/ `index.ts`（`openArtifact` 注入面）| ✅ 重建为**四区工作区**：顶部条（变更 ID / 模式 / 状态 / 开始时间 / 耗时 / Tokens）+ 左侧固定栏（变更分类 + 阶段产物）+ **中间完整工作流图** + 右侧栏（阶段抬头 + 阶段门禁清单 + 阶段详情 + 完整事件历史）；中间的工作流图与会话「工作流图」页**共用同一个画布组件** |
| 4 | 测试流页签移到确认门与指令集之间 | `packages/client/ui-baf-tracegraph/src/client/WorkflowSection.tsx` + `tests/workflow-section.client.spec.tsx` | ✅ 页签序列改为 通用 / 项目工程 / 确认门 / **测试流** / 指令集 / 企业规范 / 变更总览 |

测试：`packages/client/ui-baf-workflow` + `packages/client/ui-baf-tracegraph` **16 文件 / 110 例全绿**（其中 `change-overview.client.spec.tsx` 11 例为本批重写）；`tsc -b tsconfig.client.json` 0 错；`pnpm run build` **9 门全绿**。

**web 真机验证**（`node apps/cli/src/bin.ts web --no-open` + headless Edge CDP 9200，探针 `overlay/scripts/probe-batch20-web.mjs`）：**41 项断言全 PASS，`fail: []`，exit 0**。实测要点：

- 页签序列实测 `["通用","项目工程","确认门","测试流","指令集","企业规范","变更总览"]`，`workflow-tab-quality` 落在 index 3（确认门与指令集之间）；
- 确认门页实测带控制台条「工作流确认门流程图 · 确认门 13 · 阶段门禁 6」，页面内金色元素实测 16 处；需求输入入口实测 `linear-gradient(135deg, color(srgb 0.847529 0.737412 0.390118), rgb(201, 162, 39))`；
- 变更总览台账实测 1 张卡（`change-20261013-ecum-050e` · 已放弃 · 9m29s · 1.9M · 2026-10-21 11:29:02），四块图表面板齐备，BAF 徽标实测 `color=rgb(255, 255, 255)`，页面内金色元素实测 8 处，变更卡圆角 13px + 落地阴影齐备；
- 变更详情工作区实测四区几何：顶部条 x 60→1620 / y 480→552，左栏 x 60→385（325px），中间图 x 385→1259（874px，最宽列），右栏 x 1259→1620（361px）；中间实测 **11 个节点卡 + 15 条带 marker 的边 + 12 个 SVG**（与会话工作流图实测同为 11 节点 / 15 边 = 同一张图）；右栏实测 15 条历史事件行；终态变更实测走「已放弃」结论卡（状态 / 期望产物 / 完成条件）；
- 回归：会话「工作流图」页实测仍为 11 节点 / 15 边，顶部条开始时间实测 `2026-10-14 01:21:11`（共享画布抽取后无回归）。

**exe 冒烟两层全绿**（探针 `overlay/scripts/probe-batch20-exe.mjs` / `probe-batch20-splash-page.mjs`）：

| 层 | 结果 |
| -- | ---- |
| exe 真实窗口 | `fail: []`，exit 0；splash 实测 `v0.0.43`（左下角 x=52/y=238）、主窗口可达（`http://127.0.0.1:2666/`）、启动时序 `app-ready → splash-shown → dsh-spawn → dsh-ready → splash-closed → main-shown → main-load-url`；**冷 profile 那一轮完整复现了 5 s 按钮块**（按钮右上角 x=248/y=45、图标 3 条 path、提示语与按钮同帧、点击后 splash 隐藏且主进程记下 `splash-bg-start`）|
| splash 渲染层 | 9 项断言全 PASS，exit 0；5 s 那一帧按钮与「首次启动耗时较久，请耐心等待…」同帧出现、按钮右上角、图标 3 条 path |

**随包字节核对**：`resources/dsh/node_modules/@deepseek-ai/dsh-client-ui-baf-workflow/lib/client.js` 实测含 `change-detail-graph` / `change-detail-left` / `change-detail-right` / `change-detail-terminal` / `baf-gates-console` / `flow-node-testflow-`；`dsh-client-ui-baf-tracegraph/lib/client.js` 里页签槽位 id 的字节偏移实测 `baf-gates-overview`(104892) → `baf-standard-quality`(104988) → `baf-standard-commands`(105088)——**测试流确实排在确认门与指令集之间**。

**exe 层的 3 条 SKIP（热 profile，如实记录不算缺陷）**：第二次冒烟复用了上一轮的用户目录，dsh 后端 4 秒内就绪，splash 在 5 s 按钮亮起前即销毁，于是「5 s 按钮块」「后台启动点击」「splash-bg-start 标记」三步如实记为 SKIP；同一 exe 的**冷 profile 那一轮三项全部 PASS**，splash 渲染层探针对该行为是**确定性**的（9 项全 PASS）。

## 1. 需求 3 的骨架：为什么是「抽共享画布」而不是「复制一张图」

需求 3 要求变更详情显示**与会话工作流界面一致**的完整工作流图。会话那张图住在一个 2964 行的 `WorkflowView.tsx` 里，于是只有三条路：

1. **复制一份 359 行的平移/缩放画布** —— 下一次改动会出现两张会漂移的图；客户在会话里看到的节点卡与台账里看到的节点卡会分叉。
2. **从 `ChangeOverviewRow.tsx` import `WorkflowView.tsx`** —— 成环（`WorkflowView` 导入画布，画布所在模块再导入 `WorkflowView`）。
3. **把两张图都要的部件抽成一个共享模块** —— 会话页与详情页都 import 它。

选了 3。【新增】`packages/client/ui-baf-workflow/src/client/FlowCanvas.tsx`（会话画布的整段搬迁）与 `flow-parts.tsx`（`ArtifactRail` / `StageChecklist` / `BilingualDetail` 三个只读部件 + 画布几何与阶段辅助函数）。`WorkflowView.tsx` 从 2964 行降到 2282 行，行为不变（107 例全绿）。

【变更】画布的 SVG 箭头 marker id 由固定的 `wf-arrow` 改为 `useId()` 每实例唯一——会话页与详情工作区**可能同屏挂载**（详情工作区是压在台账之上的一层，而台账住在「工作流」页上），固定 id 会让第二个画布的箭头继承第一个的 marker。

【变更】`FlowCanvas` 的 `onOpenTestFlow` 改为**可选**：详情工作区是项目级页面，身后没有会话，也就没有会话的「测试流图」页签可跳。该 chip 是**导航**语义而不是图本身的语义，无通道时直接不渲染——一个看起来能点、点了没反应的按钮比没有更糟。

【变更】`ArtifactRail` 的 `onOpen` 改为可选（缺省渲染静态 chip），因为项目级页面没有会话可借。

## 2. 需求 3 的四区：每区的信息分工

| 区 | 承载 |
| -- | ---- |
| 顶部条 | 变更 ID（mono）/ 模式 / 状态药丸 / 开始时间 / 耗时 / Tokens |
| 左侧固定栏（300px） | 「变更分类」卡（类型 / 模式 / 影响范围 / 置信度条 / 判定依据 / Openspec 与人工确认标记）+「阶段产物」卡（共享 `ArtifactRail`）+ 打开失败提示 |
| 中间 | **完整工作流图**（共享 `FlowCanvas`：同样的节点卡、连线、状态色、产物 chip、路由徽标；可平移缩放，点节点选中）|
| 右侧栏（360px） | 阶段抬头（大字阶段名 + 状态）+ 阶段门禁清单（共享 `StageChecklist`）+ 阶段详情（共享 `BilingualDetail`）+ **完整事件历史时间线** |

【新增】注入面 `openArtifact?: (cwd: string, path: string) => boolean`：台账页是项目级的，身后没有会话可借文件地址，所以打开器先在 `ctx.sessions.list.getSnapshot().byId` 里找**同工作区**的存活会话，找到才 `ctx.sidebarRight.openResource(fileAddressFor(...))`；找不到返回 `false`，页面在原地说明「该工作区没有可用会话 — 此处的阶段产物仅作只读展示」，**不给死按钮**。

【新增】**终态变更的右栏走结论卡**：一个已放弃/已完成的变更，`view.current` 是终态而不是节点，所以右栏不选任何阶段，而是给一张终态卡（状态 / 期望产物 / 完成条件）——回答的是「这个变更最后怎么了」，而不是随便落到第一个阶段。点图里的节点仍然切到该阶段。

## 3. 设计语言：「金箔仪表台」（三页共用一套词汇）

用户明确要求「保持 UI 风格的一致性，参考会话的工作流图和测试流图样式」，所以本批**不引入新字体、不引入新配色体系**，只在既有 BAF 金色品牌体系内把金色从「平涂」升级成「材质」：

- **金色作为材质**：分层半透明表面 + 1px 金色发丝边 + 顶部高光 + 地面软阴影；
- **三档墨色层级**：`--wf-ink` / `--wf-ink-2` / `--wf-ink-3`（沿用确认门页批次十九定的层级，不回到「到处都是同一个灰」）；
- **动效**：错峰淡入（`animation-delay` 按索引递增）、悬停抬升 2–3px + 边线提亮 + 金色光晕、选中态金色扫光；
- **token 词汇统一**：变更总览页原来自己一套 `--ovw-*`，本批改为与确认门页、与会话页**同一个 `--wf-*` 家族**（accent / surface / ink 三档 / line），三页从此读同一套词。

【变更】`ChangeOverviewRow.module.css` 的 token 块重写为 `--wf-*`；变更详情工作区的作用域内**重新声明会话工作流图的那套 `--wf-card` / `--wf-ink` / `--wf-muted` / `--wf-line` 取值**，保证共享部件渲染出来的图与会话里那张**逐像素一致**。

## 4. 需求 4：页签移位

【变更】`packages/client/ui-baf-tracegraph/src/client/WorkflowSection.tsx` 的 `WORKFLOW_TABS`：`quality`（中文标签「测试流」）从「企业规范」之后移到「确认门」与「指令集」之间。理由：测试流是验证阶段的执行面，而确认门是它的守门人，原来隔着三个页签。

## 5. 测试

【重写】`packages/client/ui-baf-workflow/tests/change-overview.client.spec.tsx`（8 例 → 11 例）：新增四区工作区的断言（顶部条 / 左侧栏 / 中间图 / 右侧栏齐备、图里有节点与 SVG 边、右栏有历史行、左栏有变更分类与阶段产物）、点节点切换阶段详情、产物打开通道（成功调用 `openArtifact(cwd, path)`；返回 `false` 时页面给出提示而不是死按钮）、无注入面时的只读说明。

【变更】`packages/client/ui-baf-tracegraph/tests/workflow-section.client.spec.tsx`：页签序列断言改为新顺序，并补「点测试流页签 → 渲染 `baf-standard-quality` 槽位」。

## 6. 门禁实测

| 门禁 | 结果 |
| ---- | ---- |
| `vitest run packages/client/ui-baf-workflow packages/client/ui-baf-tracegraph` | **16 文件 / 110 例全绿** |
| `tsc -b packages/client/ui-baf-workflow/tsconfig.client.json --force` | 0 错 |
| `pnpm run build`（九门） | **9 passed, 0 failed, 0 skipped**（native addon / host compiler / Host bundle / host aggregate check / Desktop bundle / client compiler / client aggregate check / Client bundle / Web build） |
| `oxlint`（本批文件） | 本批**新增的两个文件**（`FlowCanvas.tsx` / `flow-parts.tsx`）**0 错**——抽取时连同原文件里的 7 条类型感知告警一起修掉（`no-confusing-void-expression` ×2、`no-unnecessary-type-assertion` ×3、`no-unnecessary-type-conversion` ×1、`no-unnecessary-boolean-literal-compare` 等） |
| `verify-client-ui-i18n` | 33 条**全为基线既有**（本批文件 0 处） |
| `verify-no-unknown-casts` | 本批文件 **0 处** |
| `verify-agent-note-classification` | 418 份笔记结构一致，绿 |

**「单文件 oxlint 会产生类型感知误报」这一坑值得记下来**：单独 `oxlint <file>` 时 `WorkflowView.tsx` / `index.ts` 会报出几十条 `no-confusing-void-expression` / `no-unsafe-assignment`，而这些模式在 HEAD 上就存在（子代理在自己的文件上核对过同样两条）——仓库的权威判据是整仓跑 `pnpm run lint`。本批不与误报缠斗，只保证**新文件** 0 错，并把确实可以顺手修掉的告警修掉。

## 7. 本批踩到的真问题

1. **`exactOptionalPropertyTypes` 传染到内部组件**：注入面的可选成员 `openArtifact?` 在传给内部组件时，若内部组件也声明成可选属性，「可能是 `undefined`」与「必须缺席」两种语义在严格可选属性下不可互换——内部组件改声明为 `((...) => boolean) | undefined`（必填但可为 undefined）。
2. **共享部件依赖祖先作用域的 token**：`ArtifactRail` / `StageChecklist` / `BilingualDetail` / `FlowCanvas` 都读 `--wf-*`，而这些 token 原本定义在 `WorkflowView.module.css` 的 `.root` 上。详情工作区若不带作用域，共享部件会全部失去配色——所以工作区作用域内重新声明了会话那套取值。
3. **画布 marker id 冲突**：会话页与详情工作区同屏挂载时，固定 `wf-arrow` id 会让第二个画布的箭头继承第一个的 marker（视觉上箭头的颜色/大小串台）。`useId()` 每实例唯一。
4. **终态变更的右栏落错了地方（真机才发现）**：终态变更（已放弃/已完成）的 `view.current` 是终态而不是节点，初版代码在找不到对应节点时回退到「第一个节点」，于是右栏显示的是「分类」而不是「这个变更最后怎么了」。改成：终态变更不选任何阶段，右栏给终态卡（状态 / 期望产物 / 完成条件）——与会话栏对终态变更的处理一致。**这是探针逼出来的，不是读代码读出来的**。
5. **构建期偶发 Windows 文件锁**：第一次 `pnpm run build` 撞到 `packages/experimental/inspector/lib/devtools` 的 `EPERM rename`（Windows 上目标目录被占），原样重跑即通过；`pack-dsh` 也偶发 `cdn.sheetjs.com` 的 `UND_ERR_CONNECT_TIMEOUT`，重跑即通过。两者都是环境噪声，不是代码缺陷。

## 8. 遗留问题（按影响排序）

1. **项目级页签仍依赖存活会话**（批次十九遗留）：「变更总览」页签取「最新一个带 cwd 的存活会话」认项目；全部会话退出后回「未绑定工作区」空态。
2. **详情工作区在暗色主题下与共享部件存在色差**：会话工作流图自身的 `--wf-card` 兜底是 `#fff`（历史遗留，亮色主题下与新页面一致），暗色主题下共享部件仍是白底而页面本身是暗底——本批未改会话页的 token 取值（会改变已验证的亮色外观），暗色主题的完整对齐留待下一批。
3. **测试流页签的槽位仍是「质量资产」内容**：`baf-standard-quality` 渲染的是企业规范包的质量资产卡，本批只移了页签位置，未改其内容。
