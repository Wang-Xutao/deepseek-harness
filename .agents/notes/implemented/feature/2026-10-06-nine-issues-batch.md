# 九问题批 — 轨迹图并入工作流设置+页签「工作流图」/ 模型分级卡片化 / Worker 重定位+功能分类+类级开关 / 关键词「|」+预设词库文件+标签级开关 / 预演实时化+verify 保底说明 / updates 结果下置+热升级确认 / dsh-market 入推荐+「推荐插件」/ 帮助文档再生成 / 卡片插件名

- 日期：2026-10-06
- 范围：Tier 2（ui-baf-tracegraph / ui-baf-workflow / ui-settings-baf-route / ui-settings-updates / ui-settings-featured-plugins 五 client 包 + baf-core/baf-workflow host 面 + overlay 清单与帮助站；NSIS 出包不在本批）
- 触发：客户九点（web + 桌面双端验收）：①通用设置的轨迹图配置项移入「工作流」设置区（置于「工作流」页签开关前），页签改名「工作流图」；②模型分级弃表格改卡片（颜色不变、主次分明、直观易配）；③Worker 重定位为代码实现+文案改动，关键词规则与三档功能分类随之调整，支持类级一键开关，自定义也可带功能分类；④「|」分隔落地、标签不显示等级、预设词库入配置文件可增删改、预设词+自定词都支持标签级开关（样式简单好操作）；⑤预演实时随配置无需保存、解释「模拟 verify 失败重试（保底 Reviewer）」；⑥检查更新结果显示在按钮下方（含完整失败原因）、显示当前+最新可升级版本、确认插件包热升级；⑦确认 dsh-market 集成情况、未集成则入精选并改名「推荐插件」；⑧再生成帮助文档（完整全面清晰通俗；BAF 插件包详介+用法入文档；同步与更新写更新点、与 BAF DSH DESKTOP 说明一致分段分点）；⑨推荐插件卡片标注插件包名（飞书·dsh-feishu 之类）。
- 验证：触点八包定向 spec 全绿——baf-core+baf-workflow+ui-baf-tracegraph+ui-baf-workflow **565/565**、ui-settings-baf-route **57/57**、ui-settings-updates **11/11**、ui-settings-featured-plugins **16/16**、baf-featured **29/29**（含新增真实 overlay 清单守卫）；**双端真机 2×2 全绿**（`webprobe-v3.mjs` / `desktopprobe-v3.mjs` 各两遍：web 3180+Edge 9202、Electron 9201）；`docs:build` 通过。
- 前序：§22.29 UI 三块批（`2026-10-05-baf-route-ui-three-blocks.md`）——本批卡片化与预演实时建立在其三块布局与 300ms debounce 之上。

## 1. 轨迹图并入 + 页签改名（问题 1）

【变更】

- `ui-baf-workflow/src/client/locales.ts`：`view.workflow` zh「工作流图」（呈现的是图）；`settings.workflowTab.title`「工作流图页签」、description「关闭后，对话 Tab 不再显示「工作流图」。」
- 轨迹图设置行（ui-baf-tracegraph `TraceGraphRow`，`traceGraph.title`/`description`）迁入「工作流」设置区（该区本就由 tracegraph 包拥有），排在「工作流图页签」开关**之前**——双端真机断言 `indexOf('轨迹图')=78 < indexOf('工作流图页签')=102`。
- 新测试：`ui-baf-workflow/tests/workflow-tab-locale.client.spec.ts`（页签名+设置行文案）+ `ui-baf-tracegraph/tests/apply.client.spec.ts`。

## 2. 模型分级卡片化（问题 2）

【变更】`ModelRoutingRow.module.css`：`.tiersHead/.tier/.tierRole/.cell` 表格类退役，改：

- `.tierCard`：tier 色左边框（3px `var(--tier-color)`）+ tier 低饱和渐变底、12px 内距——颜色分级不变。
- `.tierCardHead`：色点 + 档名 + 档说明竖排，说明直给职责（「统帅：…」「评审：…」「执行：日常代码实现与文案改动、轻量修改（implement 默认档）」）——主次分明。
- `.tierCardGrid`：`0.8fr 1.2fr 0.9fr` 三列（服务商/模型/思考力度）+ `.field`/`.fieldLabel`（11px tertiary 列标）——一眼可配。
- 断言锚：`route-tiers-head` testid 删除（探针断言 `q('route-tiers-head')===0`）。

## 3. Worker 重定位 + 功能分类 + 类级开关（问题 3）

【变更】

- 文案：`tierLowDesc` zh「执行：日常代码实现与文案改动、轻量修改（implement 默认档）」/ en 同步；预设包 routineEdits zh「代码与文案改动」。
- `TierKeywordRule` 增 `category?: string`（baf-core `route-tier.ts` 类型 + route-config-io 读写透传）；用户规则按 category 分组渲染 `.ruleCategory`（虚线框组 + 组名）。
- `route-store.ts` 新 action：`setCategoryEnabled(category, enabled)` 一键启停整组（map 落每条 `enabled`）；`updateKeyword` 改 merge 语义（patch 缺省字段保留）。
- 新增行带「功能分类（可选）」输入（`route-keyword-add-category`）；行内编辑保存带分类（`commitKeywordEdit(input, category?)`——undefined 不写键防误清）。

## 4. 关键词「|」+ 预设词库文件 + 三级开关（问题 4）

【变更】

- 匹配侧 `|` 分词由 effectiveKeywordRules 词级语义早有；本批 UI 输入通道齐（adder/行内编辑均按 `|` 分词入库）。
- 标签去等级文字：`keywordTagTier` 类退役，等级由所在分组行表达。
- **预设词库文件** `~/.dsh/baf-route-presets.json`：首读从内置种子落盘（本机实证 4 包 309 词：complexEngineering 100 / criticalRelease 37 / qualityAssurance 63 / routineEdits 109），客户可直接增删改、下次任务即生效；损坏回落内置不覆写。`RouteTierConfig` 增 `packs?: Record<string,boolean>`（包级）与 `presetWords?: Record<string,boolean>`（`pack::word` 词级）。
- **标签级开关**（统一 22×12px `tagSwitch` 迷你开关，aria-checked 驱动、停用标签 0.45 透明）：自定词 `route-keyword-toggle`、预设词 `route-preset-toggle`、预设包 `route-pack-toggle`、分类组 `route-category-toggle`；store 对应 `setKeywordEnabled`/`setPresetWordEnabled`/`setPackEnabled`/`setCategoryEnabled`。

## 5. 预演实时化 + verify 保底说明（问题 5）

【变更】

- 预演门移除：`preview()` 不再看 `config.enabled`——无配置/未启用也按文件词库求值；求值统一走 `effectiveRouteKeywordRules`（intake 冻结 / 确认回填 / auto 回落 / 预演四处同源）。
- §22.29 的 300ms debounce 热加载继续生效；本批真机实证「加词→**不点保存**→预演即命中 Commander（`Commander · 预演验证词zzj`）」。
- `previewVerifyHint` 文案（回答客户提问）：「保底规则：真实工作流里 verify 阶段失败的回合，重试时至少用 Reviewer 档执行；勾选后预演按该保底规则演示。」——该复选框模拟的是 §22.25 M4 的 verify 失败重试地板。

## 6. updates 结果下置 + 热升级确认（问题 6）

【变更】`UpdatesSection.tsx`：`onCheck` 不再写底部 message；结果渲染 `.actions` 正下方 `.checkResult` 框（error 态 `checkResultError` 红框）——error 全句 + `当前版本` + `最新可升级版本`（available→目标 / up-to-date→当前 / error→—）。`hotUpgradeHint`：`/baf-update` 检查并热升级、`/baf-update-rollback` 回滚。

**热升级确认已实现（非本批新增）**：baf-workflow `update-surface.ts`（Phase 9）`/baf-update`（状态+检查+弹窗升级）与 `/baf-update-rollback`（热回滚）在位——双端 hint 即指向它们。

## 7. dsh-market 定位 + 推荐插件改名（问题 7）

【结论】npm `dsh-market` 不存在；真身 = **`dshmarket`**（github dsh-market/dsh-market，dshmarket.com，「DSH 可视化插件市场：逛一逛，点一下，装好」，latest 1.66.9）。**客户 web profile 已装 `dshmarket@^1.66.8` 且每次 host 启动加载（日志实证）；repo 分发面零引用**——按「未集成则入清单」指示入推荐。

【变更】

- `overlay/plugin/featured-plugins.json` revision 1→2：增 id `dshmarket`（package `dshmarket`、`^1.66.9`、nameZh 插件市场、registryFirst npmmirror、autoUpdateDefault、peerExemptionExpected——peer `dsh-settings ^0.1.x||^0.2.0-rc.1` 与本机 0.2.1-alpha.1 预发布元组不合、首装一次兼容确认卡；`verified` 留空不声明）。
- 排除项记档：`dsh-plugin-market`（veloce-ailab）deps 带 `workspace:^`/`link:` npm 不可装；`dsh-plugin-marketplace`（Scorp1o117）另一作者的市场插件。
- 改名「精选插件」→「推荐插件」：locales（nav/title/intro/loadFailed/emptyList/manifestProblem）+ `src/client/index.ts` 注释；设置注册表分区 id 仍 `featured-plugins`（纯文案改名）。

## 8. 帮助文档再生成（问题 8）

【变更】`overlay/docs/help/`：

- 新页 `baf-packages.md`：七包逐个「是什么 / 你怎么用到它」（含入口指令表；core 无命令、workflow 全部 go 指令、quality/guard/scaffold 各自 check/scaffold 指令、openspec 产物目录、standard 无命令）。
- 新页 `updates.md`：三层版本（与设置页 BAF DSH DESKTOP 说明一致）/ 检查更新（结果下置、404 全句例、当前+最新）/ 应用更新三步 + 更新点分段分点 / 热升级双指令 / 两问 FAQ。
- `featured-plugins.md` 全文重写（推荐插件 + 卡片包名说明 + 飞书/插件市场两卡）；`baf-mode.md`/`getting-started.md`/`faq.md`/`index.md` 同步页签改名与新页链接；`mkdocs.yml` nav 增两页+改名；`docs:build` 通过并同步 `apps/web/dist/help`。

## 9. 卡片插件名（问题 9）

【变更】`FeaturedSection.tsx` 卡头名称旁挂 `.cardId` span（`data-testid="featured-card-id"`，12px tertiary）显示 `card.id`——「飞书 dsh-feishu」「插件市场 dshmarket」；双端真机断言 ids == ['dsh-feishu','dshmarket']。

## 10. 验证记录

- **定向 spec**：route 57/57（新增：卡片布局 / 分类组与组开关 / 三级标签开关 store 行为 / adder 分类 / presetsFileHint+previewVerifyHint 文案）；updates 11/11（error 全句下置 / current+latest / hot hint）；featured client 16/16；baf-featured 29/29（新增真实 overlay 清单守卫：parse 干净 + revision 2 + 两 id + dshmarket 元数据锚）；baf-core/baf-workflow/tracegraph/ui-baf-workflow 565/565。
- **双端真机 2×2**：`C:/Users/12402/AppData/Local/Temp/baf-verify/webprobe-v3.mjs`（3180 host + Edge 9202；host 带 `BAF_DSH_FEATURED_MANIFEST` 直指 overlay 清单）与 `desktopprobe-v3.mjs`（Electron 9201）各跑两遍 `fail:[]`。桌面要点：404 全句 + 当前版本 0.0.23 + 最新可升级版本：— 在按钮正下方；热升级双指令 hint；推荐插件双卡双 id；三档卡无表头；轨迹图(78)<工作流图页签(102)。web 要点：未保存草稿加词→预演即命中（问题 5 实证）；60 预设词开关 + 4 包开关；web updates 桌面限定说明（既定行为）。
- 预设词库文件首读落盘实证（4 包 309 词）。

## 11. 遗留（按影响排序）

1. updates 包 `tsc` TS6306 等 HEAD 既有红（见测试备忘清单，不修）。
2. dshmarket 卡在 web 端经 CLI host 不显示（`BAF_DSH_FEATURED_MANIFEST` 由桌面 main.ts 注入、CLI web 不注）——web 推荐清单为空是既定行为非回归；装包通道以桌面为准。
3. 预设词库文件无注释/备份（JSON schema 不支持注释；损坏自动回落内置，客户改坏最多回到内置词库）。
4. 「|」多词输入后标签展示为整串原文（匹配按词库语义分词；展示粒度待客户反馈再定）。
