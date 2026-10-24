# 批次十九（2026-10-24）：会话工作流图页重排 + 测试流图品牌化 + 验证门「跑过的测试必须通过」+ 确认门明细提亮 — desktop 0.0.42

> 需求原句（三部分十一点）：1. 会话tab工作流图页面：1.1 「变更分类」/「阶段产物」/「会话统计」从右侧栏改固定到左侧栏，右侧保留阶段相关的内容。1.2 右侧栏顶部要醒目显示阶段名称。1.3 变更总览不再模态框显示，而是统一到「工作流」的「变更总览」中，要求点击变更项再打开模态框，显示流程图和所有相关的历史记录信息。同时优化下「变更总览」页面的ui设计，要美观炫酷，醒目和谐，直观清晰。1.4 工作流信息增加一项，开始时间，格式2026-10-23 12:34:56 ，增加到顶部信息框，所有按钮右对齐。从左到右依次为「配置、刷新、变更总览」。2. 会话tab测试路图页面：2.1 顶部左侧「测试流图」标签改为BAF标签，和工作流的baf标签保持一致，同时两个标签文字都改为白色。2.2 顶部右侧，全部运行按钮文字和logo也使用白色。2.3 报告时间格式要修改，格式例如：2026-10-23 12:34:56 。2.4 工作流触发的测试流会生成报告，该报告也是验证阶段的必须产物。规定要跑过的测试必须通过才能通过确认门。3. 工作流确认门tab页面：3.1 优化「需求输入」的节点ui界面，当前的不好看。3.2 优化门禁明细界面，状态的明细灰色不好看，确认门节点的明细太繁琐，比如「澄清已完成 · 请确认进入设计」写一遍就够了，嵌套过多。

## 0. 结论速览

| # | 需求 | 落点 | 状态 |
| -- | ---- | ---- | -- |
| 1.1 | 三卡固定到左栏 | `WorkflowView.tsx` / `WorkflowView.module.css` | ✅ 新增 `.leftRail`（固定 300px，无 splitter）+ `.leftRailScroll`；变更分类 / 阶段产物 / 会话统计三卡搬入，右栏只留阶段相关卡片 |
| 1.2 | 右栏顶部显示阶段名称 | `WorkflowView.tsx` | ✅ 新增 `.railStageHead`（`data-testid="rail-stage-head"`）：阶段名大字 + 「已选阶段 / 当前阶段」提示；阶段取选中节点，否则当前阶段 |
| 1.3 | 变更总览去模态框 + 点击开模态框 + 重做 UI | `ChangeOverviewRow.tsx`（重写）/ `src/index.ts`（新增 `changeDetail`）| ✅ 会话 tab 的变更总览模态框整体删除；台账唯一归宿是工作流页「变更总览」页签（卡片式台账，磁贴 + 卡片网格）；点击变更卡片开新模态框（阶段流程 / 阶段产物 / 耗时与 Tokens / 开始时间 / 事件历史时间线）|
| 1.4 | 开始时间 + 按钮右对齐 + 顺序 | `WorkflowView.tsx` / `WorkflowView.module.css` | ✅ 顶部信息框新增「开始时间」（`YYYY-MM-DD HH:mm:ss`）；按钮并入 `.stripActions`（`margin-left:auto`）右对齐，顺序 配置 → 刷新 → 变更总览 |
| 2.1 | 两页 BAF 徽标 + 白字 | `TestFlowView.tsx` / `WorkflowView.tsx` + 两个 `.module.css` | ✅ 两页徽标统一为 `t('view.brandBaf')`（BAF），`color:#fff` + 共享品牌底 `--wf-brand-fill` |
| 2.2 | 全部运行按钮文字与 logo 白色 | `TestFlowView.module.css` | ✅ `.runAllBtn` `color:#fff`（glyph 走 currentColor）+ 同一品牌底 |
| 2.3 | 报告时间格式 | `dashboard-format.ts`（新增 `formatTimestamp`）/ `TestFlowView.tsx` / `dashboard-html.ts` | ✅ 报告时间、执行结果行、右栏时间指标、独立看板「生成时间」全部走共享格式化器 `YYYY-MM-DD HH:mm:ss`（本地时区）|
| 2.4 | 跑过的测试必须通过才能过确认门 | `stages/check-runner.ts` / `stages/gates.ts` / `stages/verify.ts` / `stages/pipeline.ts` / `tab-view.ts` / `go-coordinator.ts` | ✅ 新增共享判定 `checkBlocksVerify`：必需失败 **或**「真跑过且失败」都阻断；「没跑过」（skipped / tool_unavailable / cancelled）不阻断。测试流两份报告纳入 verify 阶段产物与客户产物栏 |
| 3.1 | 需求输入节点 UI 重做 | `GatesOverviewRow.tsx` / `.module.css` | ✅ 入口框重做为金色品牌卡（渐变底 + 实线描边 + 节点图标 + 留白），32px→40px |
| 3.2 | 门禁明细提亮 + 去嵌套 | `GatesOverviewRow.tsx` / `.module.css` | ✅ 灰色分层重做为金色体系（页面自有 `--wf-*` token）；标题只写一次（`showTitle`），嵌套层级拍平 |

测试：`packages/baf/baf-workflow` + `packages/client/ui-baf-workflow` + `packages/client/ui-baf-tracegraph` **56 文件 626 例全绿**（新增 `verify-gate.spec.ts` 12 例、`test-flow-view.client.spec.tsx` 9 例、`change-overview.client.spec.tsx` 8 例）；`tsc -b tsconfig.host.json` 与 `tsc -b tsconfig.client.json` 均 0 错。

出包：版本 0.0.41 → **0.0.42**（`overlay/desktop/VERSION` + `package.json` + `version-notes.json` + `version-map.md` 补行）；`npm run dist -- --dir` → `overlay/desktop/dist/win-unpacked/baf-dsh.exe`（204,592,128 字节，2026-10-24 18:13:17，**免安装目录，无 NSIS 安装包**）。

**web 真机验证**（`node apps/cli/src/bin.ts web --no-open` + headless Edge CDP 9200，探针 `overlay/scripts/probe-batch19-web.mjs`）：**34 项断言全 PASS，`fail: []`，exit 0**。实测要点：

- 左栏 `aside[aria-label="变更信息"]` 的三张卡标题实测 `["变更分类","阶段产物","会话统计"]`，右栏实测 `["阶段详情"]`——三卡确已搬走；
- 右栏首个子节点即 `rail-stage-head`，阶段名实测「已放弃」，字号 16.8px / 字重 800；
- 顶部信息框实测含「开始时间 2026-10-14 01:21:11」；按钮组实测顺序 `["配置","刷新","变更总览"]`，组右缘 1582 vs 信息框右缘 1598（右对齐）；
- 会话 tab 内 `[role="dialog"]` 计数实测 **0**（变更总览模态框确已移除）；
- 两页 BAF 徽标实测 `text="BAF"`、`color=rgb(255, 255, 255)`、底色 `linear-gradient(135deg, color(srgb 0.497 0.395 0.098), …)`；「全部运行」按钮文字与 glyph 均 `rgb(255, 255, 255)`；
- 测试流图报告时间实测 `2026-10-23 19:20:28`，页面无裸 ISO 残留；
- 变更总览台账实测 1 张卡（`change-20261013-ecum-050e` · 已放弃 · 9m29s · 1.9M），点开后的详情框实测含阶段流程 11 节点、阶段产物 9 项、耗时与 Tokens、开始时间与 **15 条历史记录**；
- 跨页跳转实测：会话顶栏「变更总览」按钮点击后工作流页 `workflow-tab-changes` 的 `aria-selected="true"` 且台账已挂载。

**exe 冒烟两层全绿**（探针 `overlay/scripts/probe-batch19-exe.mjs` / `probe-batch19-splash-page.mjs`）：

| 层 | 结果 |
| -- | ---- |
| exe 真实窗口 | `fail: []`，exit 0；splash 实测 `v0.0.42`（左下角 x=52/y=238）、主窗口可达、启动时序 `app-ready → splash-shown → dsh-spawn → dsh-ready → splash-closed → main-shown → main-load-url` |
| splash 渲染层 | 9 项断言全 PASS，exit 0；5 s 那一帧按钮与「首次启动耗时较久，请耐心等待…」同帧出现、按钮右上角、图标 3 条 path |

**随包字节核对**（新增判据）：`resources/dsh/node_modules/@deepseek-ai/dsh-client-ui-baf-workflow/lib/client.js` 实测含 `rail-stage-head` / `baf-test-flow-brand` / `change-detail-modal`，同包 `lib/index.js` 含 `changeDetail`，`dsh-baf-workflow/lib/index.js` 含 `checkBlocksVerify`——本批改动确实进了 exe。

**exe 层的 3 条 SKIP（本机热启动，如实记录不算缺陷）**：本机 dsh 后端就绪快，splash 在 5 s 按钮亮起前即销毁，因此「5 s 按钮块」「后台启动点击」「splash-bg-start 标记」三步在本机热 profile 上无法复现；同一 exe 的冷 profile 那一次完整复现了按钮块（按钮右上角、带下箭头图标、与提示语同帧）。splash 渲染层探针（无头 Edge 加载随包 splash 资源）对该行为是**确定性**的，9 项断言全 PASS。

## 1. 会话·工作流图页：左栏固定 + 阶段抬头 + 去模态框 + 开始时间（需求 1.1–1.4）

【新增】`WorkflowView.module.css` `.leftRail` / `.leftRailScroll`：固定 300px 宽的左列（**无 splitter**——客户要求「固定」），承接「变更分类 / 阶段产物 / 会话统计」三卡；`.body` 改为三段式（左列 + 画布 + 右栏）。

【新增】`WorkflowView.tsx` `.railStageHead`（`data-testid="rail-stage-head"` / `rail-stage-name`）：右栏最上方的阶段抬头——阶段名大字 + 一行提示（选中节点优先，否则取变更当前阶段）。阶段名取 `CATALOG_ZH[node].purpose` 的业务说明，不暴露内部枚举。

【变更】`WorkflowView.tsx`：会话 tab 的**变更总览模态框整体删除**（`dashboardOpen` / `dashboardData` / `dashboardBusy` 状态、`loadDashboard`、`openDashboardExternal`、模态框 JSX、注入面 `dashboard` 一并移除）。顶栏「变更总览」按钮改为 `openChangeOverview()`——跨包请求工作流页的「变更总览」页签。

【新增】跨包跳转通道 `packages/client/ui-baf-workflow/src/client/workflow-page-nav.ts` 与 `packages/client/ui-baf-tracegraph/src/client/workflow-page-nav.ts`（常量两侧镜像，互加注释）：localStorage one-shot（`baf.workflow-page.tab-request`）+ window 事件（`baf:workflow-page:tab-request`）双通道——**仓库没有「客户端包依赖另一客户端包」的先例**，跨包只能走浏览器事件；双通道覆盖「目标页签已挂载」与「尚未挂载」两种情形。

【新增】host 面 `@Remote('changeDetail')`（`packages/client/ui-baf-workflow/src/index.ts`）：单条变更的详情——`buildWorkflowTabView(store, changeId)` + `store.readEvents(changeId)` 扁平化。取**工作区口径**而非会话口径，因为工作流页签本身没有会话在身后。

【重写】`ChangeOverviewRow.tsx` + `.module.css`（需求 1.3 的 UI 重做）：台账从「表格行」改为**卡片式**：项目路径 hero 区 + 四枚金色磁贴 + 卡片网格（变更 ID / 状态药丸 / 模式 / 阶段 / 耗时 / Tokens / 结束时间）；点击卡片开新模态框——紧凑阶段流程链、阶段产物、耗时与 Tokens、开始时间、事件历史时间线（每类事件一个本地化标签）。**没有搬运会话 tab 那张 148KB 的 `FlowCanvas`**，而是新建了一条紧凑流程链（大重构不划算，且客户要的是「直观清晰」）。

【新增】「开始时间」数据链：`WorkflowStatus.startedAt`（baf-core）→ 投影折叠取首个事件 `at`（baf-workflow/projection）→ `WorkflowTabView.startedAt`（baf-core/tab-view + `statusToTabView`）→ 客户端 `tab-types.ts` 镜像 → strip 的 `strip-started-at`。取的是**投影首个事件时间戳**，不是会话创建时间。

【变更】`WorkflowView.module.css` `.stripActions`：按钮组 `margin-left:auto` 右对齐，顺序 配置 → 刷新 → 变更总览；条件性的「放弃 / 推进」并入同组末尾。

## 2. 测试流图页：BAF 徽标 + 白字 + 时间格式（需求 2.1–2.3）

【新增】`packages/client/ui-baf-workflow/src/client/dashboard-format.ts` 的 `formatTimestamp(raw)`：本地时区 `YYYY-MM-DD HH:mm:ss`；无法解析时**回落为原串**（绝不编造日期），缺值回落 `—`。测试流图页的「报告时间」、两条执行结果行、右栏的时间指标，以及独立看板的「生成时间」全部走它。

【变更】`TestFlowView.tsx`：左上角标签由 `t('view.testFlow')`（测试流图）改为 `t('view.brandBaf')`（BAF），与工作流图页同一个词标（`data-testid="baf-test-flow-brand"` / `baf-workflow-brand`）。

【变更】`TestFlowView.module.css` / `WorkflowView.module.css`：**白字需要深底**。品牌金 `#c9a227` 对白字只有 2.4:1，原填充（72% 白混合 1.9:1）更不可读——所以新增共享 token `--wf-brand-fill`（金色向主题暗墨 `#241a08` 混合 55%→62%，实测 5.6:1 … 4.9:1）。`.stripBrand` 与 `.runAllBtn` 都取它，glyph 走 `currentColor` 故与文字同白。

【变更】`locales.ts`：新增 `view.brandBaf`（zh/en 均为 BAF）——徽标文案改由 locale 拥有，两个页面读同一个键，不可能再走偏。

## 3. 验证门：「跑过的测试必须通过」（需求 2.4，host 侧业务规则）

【新增】`packages/baf/baf-workflow/src/stages/check-runner.ts` 的共享判定三件套：

- `checkDidNotRun(check)`：**每一条**诊断都是未跑标记（`skipped:` / `tool_unavailable:` / `cancelled`）才算「没跑过」——一条真实原因码就说明它跑过。
- `checkActuallyRanAndFailed(check)`：`!ok && !didNotRun`。
- `checkBlocksVerify(check)`：`(required && !ok) || actuallyRanAndFailed`——**确认门与聚合报告读同一条规则**，两者不可能对「跑过的测试必须通过」产生分歧。

【变更】`stages/gates.ts` `verifyGate`：过滤条件从 `required && !ok` 换成 `checkBlocksVerify`；原因码保持冻结的企业码 `verify_required`；`missing` 里给出人话——`验证未通过：<名>（非必需，但检查已执行）—— <诊断>`。

【变更】`stages/verify.ts`：`checkVerdictZh` 的非必需行从 `⚠️ 未通过（非必需，不阻断）` 改为 `❌ 失败（检查已执行，阻断归档）` / `⚠️ 未执行（不阻断）`——**文案不再说「不阻断」而实际阻断**。报告新增「已执行检查 通过 X/Y」一行，结论句同时覆盖「必需项」与「已执行项」。质量检查在被中止时补 `cancelled` 诊断（原先中止的失败没有诊断，会被新规则误读成「跑过且失败」）。

【新增】`stages/gates.ts` `TEST_FLOW_REPORT_FILES` + `testFlowReportPaths(root)`：测试流的两份持久化报告（`.baf/reports/ut-coverage.json` / `static-analysis.json`）作为 verify 阶段产物——`pipeline.ts` 的 stage-completed 产物表带上它们，`changeArtifactStatus` 的客户产物栏各加一行。

【变更】`baf-workflow/tab-view.ts`：verify 分支的推进就绪读 `verify-report.json`，把**真正阻断的检查**写进 `missing`（原来只说「验证尚未完成」）。

【变更】`go-coordinator.ts`：T11 返工卡标题从「必需检查未通过」改为「检查未通过」，失败详情只列**阻断项**。

## 4. 确认门页：需求输入节点 + 门禁明细（需求 3.1 / 3.2）

【重做】`GatesOverviewRow.tsx` / `.module.css`：页面自有 `--wf-*` token 块（accent `#c9a227` / accent-ink `#1a1406` / surface / ink 层级），需求输入入口框改为金色渐变底 + 实线描边 + 节点图标 + 留白（`ENTRY_H` 32→40）；门禁明细的灰色分层整体换成金色体系（原文的 `--dsw-alias-brand-primary` 实为中性墨色，不是蓝色）。

【变更】确认门明细**标题只写一次**：卡片新增 `showTitle`，面板标题已由 `baf-gates-detail` 头部承担，卡片不再重复；`.qSection` 包裹层删除（标题 / 段落 / 列表直接作子节点），嵌套层级拍平——「澄清已完成 · 请确认进入设计」这类句子不再在标题与正文各写一遍。

## 5. 测试

【新增】`packages/baf/baf-workflow/tests/verify-gate.spec.ts`（12 例）：三条判定的语义（真实原因码 = 跑过且失败；三种未跑标记 = 没跑过；带真实原因码又带未跑标记 = 跑过）；`verifyGate` 阻断 / 不阻断两侧；`CheckRunner.aggregate` 与门禁口径一致；测试流报告进 stage-completed 产物与产物栏（存在时有行、没跑过时**不编造**「尚未生成」行）；Tab 推进就绪点名阻断检查。

【新增】`packages/client/ui-baf-workflow/tests/test-flow-view.client.spec.tsx`（9 例）：徽标文案绑定真实 zh 字典为 `BAF`；报告时间等于独立算出的本地时间且匹配 `^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$`；页面无裸 ISO 残留；CSS 断言 `.stripBrand` / `.runAllBtn` 为 `color:#fff` + 品牌底；全部运行按钮带 SVG glyph。

【变更】`packages/client/ui-baf-workflow/tests/change-overview.client.spec.tsx`：挂载补 `loadChangeDetail`；新增三例（模态框含流程 + 历史、关闭、未知变更）。

【变更】`packages/client/ui-baf-workflow/tests/test-flow.client.spec.ts`：两条**动态 import 宿主入口**的用例补显式 30 s 预算——该 import 拉起整个 baf-workflow 图，泳道负载高时会跑出 Vitest 默认的 5 s 预算（本批新增的渲染用例加重了同包负载，暴露了这个既有脆弱点）。

【重命名】`tests/test-flow.client.spec.tsx` → `tests/test-flow-view.client.spec.tsx`：仓库已有同基名的 `.ts` 文件（目录/投影契约），同名双扩展名容易误读。

## 6. 门禁实测

| 门禁 | 结果 |
| ---- | ---- |
| `vitest run packages/baf/baf-workflow packages/client/ui-baf-workflow packages/client/ui-baf-tracegraph` | **56 文件 / 626 例全绿** |
| `tsc -b tsconfig.host.json` | 0 错（首轮抓到两处真实错误，见 §7） |
| `tsc -b tsconfig.client.json` | 0 错 |
| `oxlint`（本批新增/改动文件） | 0 错（修掉 4 条：`arrow-parens` / `max-len` / `comma-dangle` / `no-unnecessary-type-assertion`） |
| `verify-no-unknown-casts` | 本批文件 **0 处** `as unknown`（把 `as unknown as` 降级为仓库既有惯例的普通 `as`）|
| `verify-client-ui-i18n` | 33 条**全为基线既有**（逐条比对 diff 的新增行，本批未引入硬编码 UI 串）|

## 7. 本批踩到的三个真问题

1. **宿主面类型错误，客户端 tsc 看不见**：`src/types.ts` 同时进 host 与 client 两个 tsconfig，但 `baf-core` 的 `.d.ts` 是在**宿主 tsconfig**（`exactOptionalPropertyTypes: true`）下编译的，而客户端镜像用的是宽松可选属性语义。`pnpm run build` 的 host compiler 门因此抓到两处客户端门禁漏掉的错误——`flattenChangeEvent` 的 `node` 显式赋 `undefined`（可选属性必须**缺席**而非 `undefined`）与 `store.readEvents()` 返回 `{events, corruptedAt}` 而非数组。教训：**客户端 tsc 通过不等于 host tsc 通过**，出包前必须跑整条 `pnpm run build`。
2. **`as unknown as` 触仓库门禁**：`verify-no-unknown-casts` 禁止新增对 `unknown` 的断言。根因是宿主 payload 类型与客户端镜像在**可选属性可空性**上不可直接赋值；仓库既有惯例（`testFlowStatus`）用普通 `as` 桥接，本批照此改写后门禁归零。
3. **web 真机探针跑的是旧前端**：web 宿主直接服务**已构建**的客户端产物（`packages/client/*/lib`）。本批改完源码后首次探针看到的是 11:37 的旧 bundle（工作流图页签选中但面板空白）。必须先 `pnpm run build` 再探针——**探针红不一定是产品缺陷，可能是产物没重建**。
4. **随包字节核对要看对地方**：`app.asar` 只有 215 KB，装的是 Electron 壳（main/preload）；客户端包与宿主包都在 `resources/dsh/node_modules/@deepseek-ai/*` 下。字节判据查 `app.asar` 会得到假阴性——判据本身也要跟产物结构对齐。

## 8. 遗留问题（按影响排序）

1. **「变更总览」页签的项目口径依赖存活会话**：页签取「最新一个带 cwd 的存活会话」认项目。全部会话退出后回「未绑定工作区」空态；客户若期望「无会话也看得到历史」，需给页签一条显式项目选择器。
2. **测试流报告的工作区级属性**：报告落在工作区 `.baf/reports/`（不在变更目录里），所以产物栏那两行的路径是**工作区相对路径**（`.baf/reports/…`），与其他按变更目录计的产物路径不同源；客户端的「打开」入口两种都能处理，但客户若按「产物都在变更目录下」的心智模型核对会困惑。
3. **「跑过且失败」的失败无诊断时按失败处理**（fail-closed）：一条 `ok:false` 且诊断为空的行会被判为「跑过且失败」并阻断。判据是「没有证据证明它没跑」——若某些适配器会返回「无诊断的未跑」，需要它们补 `skipped:` 前缀。
4. **两处「不阻断」的旧口径已清理，但冻结原因码未动**：`verify_required` 是企业冻结码表里的，本次沿用；拒绝文案改在 `detail` / `missing` 上。
5. **左栏固定 300px 不可拖拽**：客户要求「固定到左侧栏」，故未给 splitter；若日后要可调宽度，得同时处理画布与右栏的联動。
