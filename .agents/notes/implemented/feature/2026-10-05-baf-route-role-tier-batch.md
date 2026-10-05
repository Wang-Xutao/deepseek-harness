# 多模型路由 角色三档批 — Commander/Reviewer/Worker + 顶部操作条 + 三列卡 + 目录下拉 + 纵向流程图 + 内置预设默认启用 + baf 导航签

- 日期：2026-10-05
- 范围：Tier 2（baf-core 纯核 + baf-workflow 派单链 + ui-settings-baf-route host/client 双面 + ui-settings-general / ui-baf-workflow client 面；无 NSIS/打包面改动）
- 触发：客户七点反馈（web + 桌面双端验收）：①高中低档改名为 Commander/Reviewer/Worker（高=统帅、中=评审、低=执行）；②UI 修改——2.1 保存等操作按钮放顶部；2.2 档位低饱和配色（Commander 红 / Reviewer 蓝 / Worker 绿，点缀即可）；2.3 三档配置一行三列卡片、说明按名称语义写、模型下拉用「模型」配置里全部项并显示模型名、样式与通用配置下拉一致；2.4 预设词库默认启用（非开关、可叠加）；2.5 确认预演功能正常；2.6 流程图改与会话 Tab 工作流一致的纵向版；③设置左侧导航 工作流/多模型路由/版本与更新/精选插件 四项文字右上角打 baf 小签（baf 独占标识）
- 验证：route-tier 28/28、route-config-service 9/9、route-section 19/19、settings-root 34/34、baf-core+baf-workflow 506/506、三 client 包 139/139、test-support 120+1 预存（tracegraph 悬空边，非本批）；根 tsc 零错；staged oxlint 零错；**web 真机 e2e 探针全绿**（`route-role-verify.mjs`，见 §7）
- 前序：§22.26 UI 批（`2026-10-05-baf-route-settings-section-ui.md`）；本批在其上换角色话术 + 重排布局 + 预设语义反转

## 1. 角色命名（问题 1）——仅呈现层，线上仍 high/mid/low

【变更】`ui-settings-baf-route/locales`：`tierHigh/tierMid/tierLow` 双语均为 **Commander/Reviewer/Worker**（产品词，两 locale 同形；中文语义落在职责描述里：统帅/评审/执行）。`ui-baf-workflow/locales` 的 `route.tierHigh/Mid/Low` 同步（高档→Commander、中档→Reviewer、低档→Worker），工作流 Tab「当前路由」九行与升档徽标随之换话术。wire、schema、baf-core 枚举 **零改动**（schema 1 兼容，旧配置文件无需迁移）。`keywordTier` 标签、`flowHint`（点击切换角色 Worker → Reviewer → Commander）、`previewNone`（不会冻结角色）等文案同步。

## 2. UI 重排（问题 2.1–2.3）

【变更】**2.1 顶部操作条**：保存/恢复默认从区块底部移入头部之下的 `route-actions` 工具条（右对齐，dirty 徽标同行）——`ModelRoutingRow.tsx` DOM 顺序上先于三列卡（探针断言 compareDocumentPosition）。

【变更】**2.2 低饱和配色**：`--tier-color` 弃用 dsw 状态色别名，直接钉低饱和 hex——Commander `#bc7a7e`（哑红）、Reviewer `#7b8fc7`（哑蓝）、Worker `#7ba984`（哑绿）。点缀位：卡片顶边 2px 色条 + 头部圆点 + 档名文字着色 + 流程节点 border/渐变 tint（10% color-mix）+ 预设行左边条；大面积底色保持 elevated 中性。

【变更】**2.3 一行三列卡片 + 目录下拉**：`.tiers` 改 `grid-template-columns: repeat(3, 1fr)`（≤640px 折单列）。卡片内 provider/model 两个手输 Input+datalist **删除**，换成与通用设置行一致的 **Menu 选择器**（`ui-primitives` Menu + `css.selector` 锚钮 + `IconChevronDownOutlineMedium`，样式取自 DesktopClosePrefs：36px 高、radius 18、`--dsw-alias-bg-module-platform` 底）。选项 = `session.modelCatalog` 全部模型，**label 用模型名**（`ModelCatalogModel.name`，空回落 id），`selectedId` 对模型 id；选中从目录分组**推导 provider** 一并 dispatch `setTierModel(tier, {provider, model})`——用户不再手输服务商（卡片底部只读显示 `服务商 · p`）。说明按角色语义重写：Commander=统帅：复杂工程、架构与关键决策；Reviewer=评审：常规开发、评审与排查；Worker=执行：轻量改动、格式与日常问答。

【变更】`route-store.ts` `RouteCatalogSuggestions` 重塑：`{providers, models: string[]}` → `{models: {id, name, provider}[]}`；`suggestionsOf` 从 `groups[].models[].name + group.id` 摊平。三个手输 datalist 与其 testid 一并移除。

## 3. 内置预设默认启用（问题 2.4）——预设进 baf-core，客户端只展示

【变更】`baf-core/route-tier.ts` 新增 `BUILTIN_KEYWORD_PRESETS`（四包，词表与 §22.26 客户端版逐字相同）+ `effectiveKeywordRules(userKeywords) = [...user, ...BUILTIN]`——**用户规则在前**（显式意图压内置：手降「架构」为 low 可覆盖内置 high），first-match-wins 语义不变。

【变更】三个求值点统一换 `effectiveKeywordRules`：`workflow-service.ts` intake 冻结（:57）与 confirm 回填（:212）、`ui-settings-baf-route/index.ts` 预演 Remote（:100）。**预演与真实冻结同源**——预演看到什么、confirm 就冻什么。

【变更】`defaults()` Remote 增 `presets` 字段（`BafRouteConfigDefaults.presets`）——Host 单一来源，客户端 `client/presets.ts` 削成 `KEYWORD_PRESET_IDS`（显示名 key 表），词表/档位全走 wire（bundle 纯度门禁不破：客户端仍零 baf-core 值导入）。UI 预设区从「一键加入 chip」反转为**只读说明区**（包名 + 角色色点 + 词表省略号、title 全词表），用户自定义规则区在其下方叠加。test-support `remote-default-responses` 的 `/defaults` 应答同步补四包（镜像 BUILTIN_KEYWORD_PRESETS）。

## 4. 纵向流程图（问题 2.6）——镜像会话 Tab FlowCanvas

【变更】`ModelRoutingRow.tsx`：横向 flex flow 替换为**纵向画布**——常量镜像 WorkflowView（COL_W 248 / ROW_H 128 / NODE_W 208 / NODE_H 96）；主链 8 节点 0 列 0–7 行（intake→…→archive），drift 1 列 5 行（implement 旁）；SVG 贝塞尔边 `M x1 y1 C x1 mid, x2 mid, x2 y2`（底心→顶心）+ `<marker id="route-flow-arrow">` 箭头；implement→drift（证据漂移）与 drift→design（恢复）走虚线。节点卡样式镜像 css.flowNode（radius 12、per-tier color-mix 边框 + 渐变底、hover translateY(-2px)），内容仍是 节点名/角色/模型名，点击仍 Worker→Reviewer→Commander→Worker 循环切档，`data-testid="route-phase-row"` 与工作流 DOM 序保留（既有断言免改）。画布外裹 `max-height 420px overflow auto` 滚动容器（会话 Tab graphWrap 的设置页版）。

## 5. baf 导航签（问题 3）

【变更】`ui-settings-general/SettingsRoot.tsx`：`BAF_EXCLUSIVE = new Set(['workflow','model-routing','version-updates','featured-plugins'])`，导航按钮 label 尾部渲染 `<sup className={css.bafBadge}>baf</sup>`（8px 边框小签、品牌蓝、vertical-align super）。注意：sup 文本计入按钮可访问名（「多模型路由 baf」）——既有 exact-name 断言改前缀正则。

## 6. 测试（as-built，均 RED→GREEN）

- `route-tier.spec`（baf-core）28/28：新增 4 例——四包 id/词表形状、effectiveKeywordRules 顺序（user 前 builtin 后）、零用户规则命中内置（架构→high / typo→low / 单元测试→mid）、同词用户规则压内置（架构→low）。
- `route-config-service.spec` 9/9：预演改动 2 例——`keywords: []` 时预演命中内置（架构→high、README→low·readme）；`defaults().presets` 四包形状。原「README→null」断言按新语义改写（README 正是内置词）。
- `projection-intake.spec` 12/12：新增「零用户关键词冻结内置档」；原「无命中不冻结」用例的 README 描述换成无内置词描述（补充安装说明与注意事项）。
- `route-section.client.spec` 19/19：重写——目录模型带 name/provider；三卡选择器锚钮显模型名、无 combobox；Menu 点选派 provider+model；顶部工具条先于卡（compareDocumentPosition）；纵向画布 9 节点 + ≥9 path + marker；内置预设 4 行只读（无 chip、点击不 addKeyword）；角色名 Commander/Reviewer/Worker 断言。
- `settings-root.client.spec` 34/34：新增 baf 签 4 有 2 无；glyph 用例 Multi-model routing 改前缀匹配。
- 回归：baf-core+baf-workflow 506/506、三 client 包 139/139、shell 9/9。

## 7. 构建 + 双端

- 定向重建：`baf-core` → `baf-workflow`（host 面）、`ui-settings-baf-route`（host+client+types）、`ui-settings-general`、`ui-baf-workflow`（client 面）。`defaults()` 返回类型变化走 lib/types 刷新即可——生成式 typert.remote-client.d.ts 按名引用 `BafRouteConfigDefaults`，无需 typert-emit-all；根 `tsc -b tsconfig.client.json` 零错。
- **web 真机 e2e**（headless Edge CDP 9200，`C:/Users/12402/AppData/Local/Temp/baf-verify/route-role-verify.mjs`）：直写 enabled+空关键词配置 → 探针全绿——导航 4 项带 baf 签；三卡选择器（目录外模型显 id 回落）；工具条先于卡；纵向画布 9 节点工作流序（受理→…→漂移）+10 path+marker，角色映射正确（设计/规划=Commander、澄清/验证=Reviewer、其余 Worker）；内置预设 4 行、旧 chip 0；**2.5 预演**：「梳理整体架构」→ Commander · 架构、「补充 README 安装说明」→ Worker · readme、「帮我看看这个问题」→ 不会冻结角色（内置包零用户关键词即命中，预演=冻结同源）；真目录下拉 8 项真实模型名（MiniMax-M3/glm-5.3/deepseek-v4-flash…）点选回写锚钮；「恢复默认」后配置文件移除（机器还原到未配置态）。截图：`role-nav/role-section-top/role-preview/role-menu.png`。
- 桌面：overlay/desktop 重启（`env -u ELECTRON_RUN_AS_NODE npm start`，坑：继承该 env 时 electron 以纯 Node 起动报 BrowserWindow 导出缺失）加载新 lib，交客户验收。

## 8. 遗留（按影响排序）

1. **（中）预演读已保存配置**（§22.26 遗留未变）：未保存改动预演滞后，仅 dirty 徽标提示。
2. **（低）reasoningEffort 不可在角色卡编辑**（M1–M4 遗留未变）：保存往返原样保留。
3. **（低）M4 verify 升级地板对预演不可见**（M1–M4 遗留未变）：预演只试关键词匹配。
4. **（低）目录外模型锚钮显 id**：旧配置里的模型已从目录下线时回落显 id（本批有意为之——不丢数据）；重新保存前该档仍按旧模型派单。
5. **（低）同 provider 双模型重名**：目录里同名模型（如两台 MiniMax-M3）下拉出现两行同名项，选中都按各自 id/provider 落值——显示不区分，行为正确。
