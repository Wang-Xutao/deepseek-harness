# 批次七（2026-10-21）：路由预演独立 + 企业规范右侧文档栏批 — desktop 0.0.29

> 需求原句：1. 设置，多模型路由，关键词规则，预演输入框使用多行文本。在关键词规则后增加预演的tab页，将预演独立出来。提升预演结果的显示ui，要更加醒目直观。2. 工作流页面，企业规范tab：2.1 删除卡片标题区文案；2.2 删除「企业规范资产（方案乙）」和「baf-standard · 工程规范」两个卡片；2.3 企业规范文档的预览不要放到下部，而是放到右侧侧边栏，类似打开文件一样；2.4 确认规范文档来源是否为 `D:\Source\baf-codingplugin\bafplugin` 的 claude code 插件、非 placeholder/现编；2.5 质量监控也按 bafplugin 真实实现（环境搭建、配置、规范文档），不要 placeholder。

## 0. 结论速览

| # | 需求 | 落点 | 状态 |
|---|------|------|------|
| 1 | 预演独立 tab + 多行输入 + 醒目结果 | `ui-settings-baf-route/ModelRoutingRow.tsx` + module.css | ✅ 五 tab、textarea rows=4、hero 判定卡 |
| 2.1 | 删卡头长文案 | `EnterpriseDocsCard.tsx`（cardTitle/desc 行删除） | ✅ web 真机无该文案 |
| 2.2 | 删「方案乙」「工程规范」两卡 | `StandardsOverview.tsx` + `index.ts`（方案乙链路整体退役） | ✅ 企业规范 tab 只剩状态面 + 流程图卡 |
| 2.3 | 预览改右侧侧边栏（打开文件式） | `EnterpriseDocViewer.tsx`（新共享组件）+ `.docSide` 绝对停靠抽屉 | ✅ 460px 全高右抽屉 + 像素级不透明验证 |
| 2.4 | 文档来源核查 | 逐文件 diff vs bafplugin | ✅ 10+6 份全真：仅行尾空白/CRLF 差异 |
| 2.5 | 质量监控真实工具链 | `QualityDocsCard.tsx`（新）+ `QUALITY_DOCS` 目录 + 6 资产 | ✅ 三分组 9 行真文档，占位卡退役 |
| bonus | 修抽屉背景透字 | `.docSide` background 补 `#ffffff` 兜底 | ✅ A/B 像素对比 0 差异 |

构建链全绿：`build:lib` → tsdown client（本包 152ms）→ vitest 135/135（route 5 文件 + standard 全套）→ staged oxlint → brand-web（嵌入 v0.0.29）→ pack-dsh（`packed dsh ->`）→ `dist:dir` 免安装 → 产物 grep 命中（`QUALITY_DOCS`×2 / `baf-quality-docs-card` / `route-tab-preview` / `previewHero` / `dsw-alias-bg-primary,#fff` / assets `enterprise/quality/**`）→ ProductVersion 0.0.29。

## 1. 需求 1：预演独立 tab + 多行输入 + 醒目判定卡

【变更】`ModelRoutingRow.tsx`：

- tab 联合类型 `'tiers' | 'phase' | 'keywords' | 'preview' | 'advanced'` —— 预演插在关键词规则之后、高级之前（第 4 个，五 tab）。
- 预演从关键词面板迁出到独立 `route-panel-preview` tabpanel；输入框 `<textarea rows={4}>`（`data-testid="route-preview-input"`、aria-label、placeholder、受控 `previewText`），可纵向拉伸。
- 判定结果重设计：`data-testid="route-preview"` 容器内 hero 卡 —— `previewHeroLabel`（「派给档位」角色行）+ `previewHeroTier`（19px/700 档位色大字 + 色点）+ `previewHeroModel`（`provider / model` chip）+ `previewDetails`（命中关键词 / 派给模型逐行）；未命中 → 单行 `previewNone` 提示。

【变更】`ModelRoutingRow.module.css`：`.previewInput`（100% 宽、min-height 84px、resize: vertical、与 `.input` 同肤）；`.previewHero` 系（`color-mix(tier-color 14%)` 档位色 tint 背景带 + 圆角 8）；`.previewBlock/.preview` 重排为纵向 tab 体；旧 `.previewBar/.previewOpt/.previewTier` 退役。

【变更】`route-section.client.spec.tsx`：五 tab 布局断言；关键词面板无预演残留；预演面板 `previewBox.tagName === 'TEXTAREA'` 且 `rows >= 2`；热重载/判定用例补 `route-tab-preview` 点击；判定断言覆盖 `previewRole` 文案与 `tierMid` 档位类。

web 真机（CDP 9200 探针）：预演 tab 第 4 位；输入「重构整体架构并上线」→ hero「派给档位 Commander」`tierHigh`、`baf / glm-5.3-flash`、命中关键词「架构」、派给模型行齐；无匹配输入 → 「未命中任何关键词」。

## 2. 需求 2.1/2.2：企业规范 tab 删繁

【变更】`EnterpriseDocsCard.tsx`：卡头 `cardTitleStandard`/描述整行删除（画布即卡主体）；导出 `NODE_LABEL_KEYS` 供质量卡复用。
【变更】`StandardsOverview.tsx` + `index.ts`：企业规范 tab 只渲染状态面 + `EnterpriseDocsCard`；「企业规范资产（方案乙）」卡与其 i18n 键、`baf-standard · 工程规范` 卡、相关 locale 键（`enterprisePacks*` 6 键、`enterpriseBlockers*`、`enterpriseCommandHint`、`enterpriseFlowTitle/Desc`、`qualityMechanismTitle/Body`）整体退役。zh/en 键集对称性保持。

web 真机：企业规范 tab 无卡头长文案；`baf-enterprise-docs-card` 存在、方案乙/工程规范 testid 不存在；8 节点画布照常。

## 3. 需求 2.3：右侧停靠文档抽屉（IDE 打开文件式）

**几何约束**：工作流内容列仅 732px，画布 224 + 详情 min 280 + 文档 min 280 + 间距 = 812px——行内第三列在任何窗口宽都放不下。**方案**：`.card { position: relative }` 锚定，`.docSide` 改绝对停靠抽屉（`position:absolute; top/right/bottom:0; width:min(460px, 84%)`）——贴卡右缘全高、左侧投影分层（`-14px 0 28px`），IDE 文件面板语义，732px 窄列下任何宽度可用。

【新增】`EnterpriseDocViewer.tsx`（共享组件）：`DocViewer` 判别联合 + `viewerOf(openId, doc)` 状态推导（loading/ready/unknown/unreadable）；头部双语标题 + 「打开文件」（title= 真实资产绝对路径）/「关闭」；正文 `<pre>` verbatim 全文滚动。企业规范卡与质量监控卡渲染**同一个**右侧面板（`docBody` flex 撑满抽屉高）。

【变更】`StandardsOverview.module.css`：`.docSide`（绝对停靠全套）+ `.docViewerHead/.docViewerTitle` + `.docBody`（`flex:1 1 auto; min-height:0`，去 max-height 上限）；`.qualitySplit/.qualityGroups/.qualityGroup/.qualityGroupLabel` 新增；`.mechanismCard` 退役。

## 4. 需求 2.4：文档来源核查（结论：全部为 bafplugin 真实资产）

逐文件 diff `packages/baf/baf-standard/assets/enterprise/**` vs `D:\Source\baf-codingplugin\bafplugin`：

| 目录 id | bafplugin 源 | diff 结果 |
|---|---|---|
| overview / docs / code / sri / risk / branch / commit | `plugins/baf-standard`（skills/ + templates/c/） | 仅行尾空白（markdown 硬换行 `␠␠`）+ CRLF，零内容漂移 |
| static / ut / utlist | `plugins/baf-quality/skills` | 同上 |
| quality/ceedling（project.yml 2204B、config.json 780B）| `plugins/baf-quality` 模板 | 字节级真实文件 |
| quality/static-analysis（CPPLINT.cfg 1548B、cppcheck-suppressions.xml 634B）| 同上 | 字节级真实文件 |

无任何 placeholder/现编内容。查看器「打开文件」按钮的 title 即资产绝对路径，可在资源管理器对源复核。

## 5. 需求 2.5：质量监控真实工具链

【变更】`packages/baf/baf-standard/src/enterprise-docs.ts`：新增 `QUALITY_DOCS` 6 条目录（`quality/ceedling/project.yml`、`quality/ceedling/config.json`、`quality/static-analysis/CPPLINT.cfg`、`quality/static-analysis/cppcheck-suppressions.xml`、两 README），group ∈ env/config；`readEnterpriseDoc()` 同时查两目录。
【新增】`QualityDocsCard.tsx`：三分组行卡 —— 环境搭建（2，baf-quality · templates）/ 配置（4）/ 规范文档（3，复用企业目录 static/ut/utlist id，meta 行标注适用状态串联）；点击条目在共享右侧查看器打开全文；门禁机制占位卡退役。stack 配置只读投影卡保留（真实 baseline 投影，非占位）。
【变更】`enterprise-docs-catalog.ts`：客户端镜像 `QUALITY_DOC_ROWS`；与 ENTERPRISE id 不相交（质量 UI 经 `STANDARD_DOC_IDS` 显式复用三个企业 id，镜像 parity spec 双向锁定）。
【变更】`locales.ts`：`qualityToolchainTitle/qualityGroupEnv/qualityGroupConfig/qualityGroupStandard/qualityDocsPick` zh/en；`panelQualityDescription` 改「stack 配置只读投影 + baf-quality 真实工具链资产」。
【变更】`tsconfig.client.json` files 补两个新 tsx。

web 真机：三分组 2+4+3 = 9 行；`cfg-cpplint` 打开真实 `set noparent / # SORA — customized cpplint…`；关闭抽屉行 deselect；门禁机制卡不存在。

## 6. 测试

- `route-section.client.spec.tsx`：五 tab + textarea + 判定 hero（上文）。
- `standards-overview.client.spec.tsx`：目录镜像 parity（QUALITY id 序/标题/分组 ↔ Host `QUALITY_DOCS`）+ 与企业 id 不相交；质量 describe 重写（三分组资产渲染、无 baseline 常显、共享查看器 open/close 走 `cfg-cpplint` 真 id、`openPath` 收到真实路径、stack 投影 ready）。
- `standards-config-service.spec.ts`：Host 资产守卫扩展 —— 遍历 `QUALITY_DOCS` 逐条必须 `ready`、标题匹配、path 含 `assets`、内容 >30 字符（env 组含 H1）。
- 合跑：`vitest run packages/client/ui-settings-baf-route packages/client/ui-settings-baf-standard` → 5 文件 135 用例全绿。

## 7. web 真机验证 + 像素取证（本批方法论亮点）

- 探针链路：headless Edge CDP 9200（隔离 profile）→ token URL → 设置/工作流导航 → testid 点击 → 原生 value setter 输入 → `scrollIntoView` + 截图。
- **透字 bug 发现与闭环**：视觉模型两次报告抽屉「透字/重影」，而 computed style 曾实锤 `rgba(0,0,0,0)`（`--dsw-alias-bg-primary` 在本页面未定义且 CSS 无 fallback）→ 修为 `var(--dsw-alias-bg-primary, #ffffff)` → tsdown 重打包 → 刷新后 computed `rgb(255,255,255)`。**像素级终验**：同文档开抽屉，A（行可见）/B（`visibility:hidden` 藏行）双截图，抽屉区域 32256 采样点 **0 差异** —— 修复后视觉模型的「重影」报告系降采样误读（把抽屉左侧可见的行读成透字），以像素证据为准。
- React 18 批处理：点击后同 tick 读 DOM 得旧态，sleep 后复读。

## 8. 发布

- desktop 0.0.29（`overlay/desktop/package.json` + `VERSION`）；version-notes desktop 条目重写 + `dsh-baf-standard` 包条目补 QUALITY_DOCS；version-map 追加 0.0.29 行。
- 管线：brand-web（嵌入 v0.0.29）→ pack-dsh（`packed dsh ->`，新鲜度扫描过）→ `dist:dir` 免安装（不打 NSIS）。
- 产物 grep：`dsh-baf-standard/lib/index.js` 含 `QUALITY_DOCS`；`dsh-client-ui-settings-baf-standard/lib/client.js` 含 `baf-quality-docs-card` + `dsw-alias-bg-primary,#fff`；`dsh-client-ui-settings-baf-route/lib/client.js` 含 `route-tab-preview` + `previewHero`；`assets/enterprise/quality/**` 7+ 文件在包；exe ProductVersion 0.0.29。

## 9. 遗留问题（按影响排序）

1. **（低）抽屉为覆盖式而非推挤式** —— 732px 内容列放不下行内第三列，抽屉覆盖卡右部（IDE 文件面板语义）。窗口更宽时也不推挤列表；若客户想要「推挤布局」，需要把工作流内容列放宽或把卡提出内容列（结构性改动）。
2. **（低）查看器仍是纯文本 `<pre>`** —— markdown 不渲染（批次六遗留，未变）；与「打开文件」所见即资产原文的取舍保持。
3. **（低）跨 tab 抽屉状态共享** —— 质量监控打开的文档切到企业规范 tab 仍显示（共享 `enterpriseDocId` store 字段）。行为一致可视为特性（面板跟随用户跨 tab）；若要「切 tab 即关」，在 tab 切换处调 `closeEnterpriseDoc()` 一行即可。
4. **（-info）旧 `rulesDoc` RPC 仍在 Host 面** —— 批次六遗留，客户端无消费者，留作回退窗口。

## 10. 验证截图

`C:\Users\12402\AppData\Local\Temp\batch6-probe\`：`batch7-route-preview2.png`（需求 1）、`batch7-enterprise-viewer2.png`（2.1/2.2/2.3）、`batch7-quality-viewer2.png`（2.5）、`batch7-qa-A/B.png`（透字修复像素取证对）。
