# 批次十六（2026-10-23）：splash 版本号/慢启动提示位 + 确认门流程图分支判定块 + 门禁正文全表面分段 + 明细小节化 + 确认门节点可点击 — desktop 0.0.39

> 需求原句（两部分五点）：1. splash：1.1 左下角版本号改到左上角；1.2 停留超过 5s 左下角显示「首次启动耗时较久，请耐心等待」，后跟「后台启动」按钮，点击隐藏 splash 直到主页面显示。2. 工作流确认门页面：2.1 「未发现进行中的工作流」「已有进行中的变更」「多条未完成的变更，请选择接手对象」不是简单先后顺序，有逻辑（scaffold 前置 → 互斥三选一），流程图上要体现；2.2 确认门正文分段显示——检查所有确认门弹窗、工作流顶部弹窗、门禁明细，都做到分段；2.3 门禁明细的阶段门禁文字样式突兀，优化 UI；2.4 阶段门禁/进入下一步的条件/确认门标题不够醒目，做 UI 设计；2.5 确认门节点要能点击；门禁明细中的确认门部分不应在状态节点上，而应在确认门节点上——确认门不是在状态中，而是在状态切换间触发的。

## 0. 结论速览

| # | 需求 | 落点 | 状态 |
| -- | ---- | ---- | ---- |
| 1.1 | splash 版本号左下→左上 | `overlay/desktop/ui/splash.html/.css` | ✅ `<p id="version">` 移到 `.main` 之前、面板左上角；页脚只留 credit |
| 1.2 | 5s 提示行 + 内联「后台启动」 | `overlay/desktop/ui/splash.html/.css`（批次十五 5s 机制复用） | ✅ 左下角单行：提示语改客户措辞「首次启动耗时较久，请耐心等待」+「后台启动」按钮内联其后（原为中列布局）；点击隐藏 splash 后台完成启动 |
| 2.1 | 分支判定块进流程图 | `GatesOverviewRow.tsx` + `.module.css` + `locales.ts` | ✅ 需求进入判定块：`工作区未初始化 · 先行`（串行前置，实线描边芯片）→ 三选一互斥行（条件芯片 + 左侧虚线汇流轨）→ 分类确认汇合 → 接单；接手/绑定分支为虚线回边、不再汇入分类 |
| 2.2 | 正文分段全表面 | `gate-ask.ts`（`peelChangeMarker` 导出 + `parseGateSections` 导出）+ `GatesOverviewRow.tsx`（GateCard）+ `WorkflowView.tsx`（`GateBodySections`） | ✅ 门禁明细 GateCard、pendingGate 卡、工作流顶部横幅三处都按【…】小节渲染（小节标题 + 段落/列表）；`{{change:}}` 标记剥离不再外显；无标题的平铺问题保留单段回退 |
| 2.3 | 条件清单样式优化 | `GatesOverviewRow.module.css`（`.conditions`） | ✅ 突兀的行内代码样式改为软填充面板 + 复选框样式清单（品牌描边空方格 `li::before`，11.5px，list-style none） |
| 2.4 | 三个小节标题醒目化 | `.module.css`（`.sectionLabel` 重设计 + `.sectionLabelGate`） | ✅ 改为 inline-flex chip：品牌 10% 底 + 5px 品牌圆点 + 600 字重；确认门小节用警示色变体（紫 12% 底）区分语义 |
| 2.5 | 确认门节点可点击 + 归属 | `GatesOverviewRow.tsx`（`GatePill` 按钮化 + 选择模型 `gate:<id>`） | ✅ 药丸升级为 `<button>`：hover 实线描边 / 选中警示环 / `aria-pressed` / `aria-label`（含选项与命令）/ title 全文；点击在明细面板打开该门专属详情（确认门徽标 + 变更 chip + 分段正文卡）；状态节点卡不再内嵌门内容，只留阶段说明 + 进入条件 + `确认门 ×N · 点击确认门节点查看` 提示行 |

测试：`gates-overview.client.spec.tsx` 8/8（重写 DOM 断言 + 新增分段渲染用例）；`ui-baf-workflow` 套件 81/81；包内 tsc + 根 `tsconfig.client.json`（noUncheckedIndexedAccess 严于包配置）双绿。

web 实测（dev:web + CDP 9200 探针两轮，截图 `overlay/scripts/out/batch16-*.png`）：入口标签 `需求进入`（176×22）→ scaffold 芯片 `工作区未初始化 · 先行`（实线品牌描边）→ 三条互斥条件芯片文本正确无截断 + 左侧虚线汇流轨（dashed，跨三行 87px）→ 四枚分支药丸 + `分类确认` 药丸居中主轴、位于 `接单` 卡正上方（y 405 vs 439）→ 15 条带箭头连线；药丸点击 → 确认门详情分段（【状态变化】【完成情况】【确认后】三标题 + 列表行 1/2 + `确认门` 徽标 + 无 `{{change:}}` 裸标记外显）；节点点击 → 三个小节 chip（600 字重，确认门紫底 vs 其余品牌底）+ 3 条复选框清单（11.5px、listStyleType none）+ 提示行 + 节点组内无门卡。视觉复核三截图无重叠/截断/对比度问题。

## 1. splash：版本号移位 + 慢启动提示行（需求 1.1/1.2）

【变更】`overlay/desktop/ui/splash.html`：`<p id="version">` 从页脚移到 `.panel` 首子元素（`.main` 之前），页脚只剩 credit；`#slowBlock` 文案改客户措辞 `首次启动耗时较久，请耐心等待`，与「后台启动」按钮构成**一行内联**（原居中纵列）。

【变更】`overlay/desktop/ui/splash.css`：`.version` 绝对定位于面板左上（`top:10px; left:16px`）；`.slowBlock` 重锚左下角单行布局（提示语在前、按钮随后，max-height 44px 过渡浮出）；页脚右对齐仅 credit。

（5s 计时、`splash:bg-start` IPC、托盘「正在后台启动…」、主窗口就绪后自动出现——批次十五机制原样复用，本批只动布局与文案。）

## 2. 确认门流程图：需求进入判定块（需求 2.1）

此前 intake 节点上方把 scaffold / new-workflow / active-conflict / bind-workflow / classify 五枚药丸当成普通先后链垂直摞放——但真实语义是**判定逻辑**：scaffold 是串行前置（工作区没初始化一切免谈），随后按「进行中的变更数」三选一互斥分支（0 条→新建走分类；1 条→接续推进，不分类；≥2 条→选一个绑定，不分类）。

【变更】`GatesOverviewRow.tsx`：
- 新增分支块几何常量（`ENTRY_TAG_H/BRANCH_ROW_H/BRANCH_ROW_PITCH/PRE_GAP/COND_X/COND_W/CASE_RAIL_X/BRANCH_PILL_X/BRANCH_PILL_W/CAPTION_H`），链路 `let y = intakeY` 从分支块下方起算——五枚 bootstrap 药丸不再挂 intake 节点（`chainPills('intake')` 只剩注册门），intake 节点正确显示「无门禁」。
- 结构：入口标签 `需求进入`（主轴顶）→ 主轴实线 → `工作区未初始化 · 先行` 前置行（条件芯片实线品牌描边 + `初始化工作区` 药丸）→ `按进行中的变更三选一（互斥）` 说明 → 三条 case 行（`无进行中的变更`/`已有一条进行中的变更`/`多条未完成的变更` 条件芯片 + 各自药丸：`新建工作流`/`继续推进变更`/`绑定工作流`）→ 汇流：`新建工作流` 实线贝塞尔汇入 `分类确认` 药丸（主轴居中），`分类确认` 实线下行进 `接单` 卡；`继续推进变更`/`绑定工作流` 为**虚线回边**绕过分类直接回主链（接手/绑定不需要分类确认）。
- 汇流轨刻意不用 SVG path（edgeList 全体带箭头 marker，轨不需要箭头）——CSS 虚线左边框 div（`baf-gates-case-rail`）连接三条 case 行，各芯片 `::before` 短横线接入轨。

【变更】`GatesOverviewRow.module.css`：`.entryTag`（品牌胶囊）/ `.pickCaption`（说明行）/ `.caseRail`（虚线轨）/ `.condChip`（22px 绝对定位芯片，不透明底——主轴线穿过 scaffold 行，虚线描边 + `-14px` 接轨短线）/ `.condChipPre`（前置行实线品牌描边变体，无接轨短线）。

【变更】`locales.ts`：`gates.entryTag/entryCondScaffold/entryPickCaption/entryCondNone/entryCondOne/entryCondMany`（中英双语）。

## 3. 门禁正文分段：全表面统一（需求 2.2）

线协议（段落 `\n\n` 连接；首非空段可带 `{{change:<id>}}` 标记；`【…】` 小节标题独占行或引导行；`- ` 列表项；`- {{art:<path>}} <label>` 产物 token）此前只有确认门**弹窗**（`gateAskViewOf`）解析，门禁明细卡、pendingGate 卡、工作流顶部横幅都把 question 当一段纯文本直排。

【变更】`gate-ask.ts`：
- `parseGateSections(text)` 导出——把 `gateAskViewOf` 内联的【…】小节解析器提为公共函数（无标题导语段 + 每标题一段；连续 `- ` 行折叠列表块；标题行尾随文本拆为该节导语），供所有持原始 question 字符串的表面复用。
- `peelChangeMarker(text)` 导出——剥离首非空段的 `{{change:<id>}}` 标记（前导空段不阻挡剥离），`gateAskViewOf` 重构为 Peel → Parse 两步；门禁明细 GateCard 同样先剥离——`{{change:}}` 在任何表面都不再外显。

【变更】`GatesOverviewRow.tsx`（GateCard）：`peelChangeMarker` → `parseGateSections` → 有标题才走分段渲染（`.gateQuestionSections`：`.qSection` 警示色左边框 + `.qSectionTitle` + 文本段 + `.qList` 列表，列表项 `::before` 4px 警示色方点）；纯平铺问题保留单段 `.gateQuestion` 回退（如 classify 的口语化 question）。

【变更】`WorkflowView.tsx`：新 `GateBodySections` 组件（复用批次十三已落地的 `.gateSection/.gateSectionTitle/.gateList` 样式），pendingGate 卡与工作流顶部横幅两处 `<p>{question}</p>` 替换——**确认门弹窗（gateAskViewOf 渠道）、工作流顶部弹窗、门禁明细**三表面分段 parity 达成。

## 4. 门禁明细改版（需求 2.3/2.4）

【变更】`GatesOverviewRow.module.css`：
- `.sectionLabel` 从灰字标签重设计为 inline-flex chip：品牌 10% 底、`::before` 5px 品牌圆点、600 字重、11px——「阶段门禁」「进入下一步的条件」用它。
- `.sectionLabelGate` 警示色变体（紫 12% 底 + 紫点）——「确认门」小节语义区分。
- `.conditions` 从行内代码样式改为复选框清单：软填充面板 + `li::before` 10px 品牌描边空方格（未勾选语义=待满足条件）、`list-style:none`、11.5px、行距收紧。

## 5. 确认门节点可点击 + 详情归属（需求 2.5）

【变更】`GatesOverviewRow.tsx`：
- `GatePill` 从 `<div>` 升级为 `<button type="button">`：`font:inherit`、hover 实线描边、`:focus-visible` 焦点环、选中态实线 + 警示环、`aria-pressed`、`title={gate.question}` 全文、`aria-label={gateDetailText(gate,t)}`（小节归属 + 标题 + 问题 + 选项及命令）——键盘可达。
- 选择模型：`selected` 取 `node-id` 或 `gate:<id>`；画布上全部药丸（分类 + 分支 + 链上 + 回退）汇入 `allCanvasGates` 供命中。
- 明细面板双模式：门模式（`baf-gates-detail-gate-<id>`：`确认门` 徽标 + 目标节点名 + GateCard 分段正文）优先；节点模式（`baf-gates-detail-node-<id>`：阶段说明 + 进入条件清单 + `确认门 ×N · 点击确认门节点查看` 提示行）——**门卡从节点组移除**，因为门在状态切换间触发，详情归门节点。
- `locales.ts`：`gates.gateHintClick`（点击确认门节点查看 / click a gate pill to open it）。

## 6. 测试与验证

【变更】`tests/gates-overview.client.spec.tsx`：断言重写为新 DOM 序（分支药丸先于 intake 节点）、分支块解剖（入口标签/四芯片/说明/汇流轨）、默认节点详情无门卡、节点点击出提示行、药丸点击开门详情（`aria-pressed` 序列：节点选中→药丸选中后节点让位）、哨兵用例先点药丸再断言门卡；新增分段渲染用例（`{{change:}}` + 三小节 fixture：断言剥离无裸标记、三标题、列表行、平铺回退为 null）。

验证链：包内 tsc → 根 `tsc -b tsconfig.client.json`（抓出两处 noUncheckedIndexedAccess 索引访问，已用 `firstCaseRow/lastCaseRow` 局部守卫修复）→ vitest 81/81 → dev:web 真机 CDP 探针两轮（见结论速览）→ 三截图视觉复核。

## 7. 打包

版本 0.0.38 → 0.0.39（`overlay/desktop/package.json` + `VERSION` + `version-notes.json` 批次十六中英文注记；`baf-product-versions.json` 由 pack-dsh 重写）。全量 `pnpm run build` 9 门全过 → brand-web → pack-dsh → `overlay/desktop npm run dist -- --dir`（仅免安装目录，不产 NSIS）→ `dist/win-unpacked/baf-dsh.exe`。

exe 冒烟（`overlay/scripts/probe-batch16-exe.mjs`，CDP 9200 骑 splash 全生命周期）：`v0.0.39` 渲染于面板左上（`atTop:true`、页脚无 #version，截图 `batch16-exe-splash-early.png`）；提示行初始 `max-height:0` 不可见，5s 后浮出——「首次启动耗时较久，请耐心等待」+「后台启动」按钮同一行内联跟随、锚左下（截图 `batch16-exe-splash-slow.png`；探针 `oneRow` 严格 y 相等断言因按钮与文字 flex 居中的几像素高差为 false，视觉复核确认是一行）；点击「后台启动」后主窗口照常拉起（`http://127.0.0.1:6018/?token=…`），启动链未受影响（splash `hide()` 不销毁窗口，CDP target 残留属批次十五语义非缺陷）。启动日志仅更新通道 404（U-01，仓库未发 Release，已知状态）。

## 8. 遗留问题（按影响排序）

1. **分支块几何为固定列宽**（芯片 142px + 药丸 158px 适配 416px 画布列）：更长的门标题会截断（title/aria-label 兜底可读全文）；当前 8 枚药丸实测无一截断，未来加门需关注。
2. **虚线回边跨度**：接手/绑定两支回边从 case 行绕到主链，case 行增多时曲线变长；当前三行实测与 scaffold 行无视觉交叉，行数变化时需复核。
3. **splash 提示语与托盘提示不统一**（面板「首次启动耗时较久，请耐心等待」 vs 托盘「正在后台启动…」）：语义不同（等待提示 vs 状态提示），暂保留；客户若要统一可再调。
4. **平铺回退仍是单段**：无【…】标题的门 question（如 classify 口语化文案）保留单段渲染——协议未带结构时无法凭空分段，属预期行为。
5. **门禁明细 GateCard 不渲染产物 chips**：`parseGateSections` 已解析 `{{art:}}` token 为列表项文本，但明细卡未实现弹窗同款可点击产物 chip（当前 BAF 门 question 未使用产物 token，无实际影响）。
