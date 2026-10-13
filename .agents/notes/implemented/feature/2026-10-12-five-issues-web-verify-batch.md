# 2026-10-12 五问题批 — 路由分页/高级 tab、插件页 switch 化、反馈 baf 签、门禁流程卡、帮助三级导航

> 范围：设置页四处（多模型路由 / 推荐插件 / 用户反馈 / 工作流）+ 帮助中心侧边栏三级目录样式。
> 验证路径：web 端先行（`dev:web` 回路）→ 通过后 `--dir` 模式产 baf-dsh.exe（不产 NSIS 安装包）。

## 问题 → 方案总表

| # | 问题 | 方案 | 涉及包 |
|---|------|------|--------|
| 1.1 | 挡位选择标签删除；下拉只写三档/两档；位置放"恢复默认"原位 | `挡位选择` label 行删除；select 选项文案改「两档/三档」；select 移入 actions 行左端（恢复默认原座） | ui-settings-baf-route |
| 1.2 | 当前 tab 功能未实现，未分页显示 | 根因：`.block` 的 `display:flex` 覆盖了 HTML `hidden` 属性（UA `display:none` 被作者样式覆盖）→ 四个 panel 全部同屏。修复：`.block[hidden] { display:none }` 恢复 hidden 语义 | ui-settings-baf-route (CSS) |
| 1.3 | 新增 tab 页"高级"，恢复默认按钮放入其中 | `routeTab` 增加 `'advanced'`；高级面板 = 影响面说明文案（重置 ~/.dsh/baf-route-config.json 回出厂三档、丢弃已存绑定/规则）+ 恢复默认按钮 | ui-settings-baf-route |
| 2.1 | 顶部"自动更新"（全部禁用后）改为 switch | 批量开关由按钮换 `Switch` 原语，与每卡片 switch 同款；label「全部自动更新」 | ui-settings-featured-plugins |
| 2.2 | 真实 url 与左侧名称显示拉开差距 | 卡片名与 URL 分层：URL 走 `headLink` 样式（mono、次级色、可点击），名称保持品牌名 | ui-settings-featured-plugins (WIP 已有，本批收尾) |
| 3 | 设置-用户反馈也要有 baf 签 | `SettingsRoot` 的 `BAF_EXCLUSIVE` 集合加 `'user-feedback'`（fiber 走查修正，真实 id 非 `feedback`）→ 导航项渲染 `baf` 上标徽标 | ui-settings-general |
| 4.1 | 工作流确认门用流程卡片形式，下拉选详细/简洁 | `GatesOverviewRow` 重写为流程卡：九节点按 FLOW_ORDER 管道排序的 NodeCard（节点名+产物 chip+阶段门行+确认门堆栈）+ 一次性确认门独立卡 + 配置诚实块；`headActions` 里 `详细/简洁` 下拉（简洁模式藏选项列表/条件列表/配置块，节点序保留） | ui-baf-workflow |
| 4.2 | 质量监控、企业规范空白 | 根因：`StatusSurface` 对 no-workspace/no-baseline 返回 null → 整页空白。修复：两种状态渲染指引文案（指向 /baf-scaffold），tab 永不沉默空白 | ui-settings-baf-standard |
| 4.3 | 项目工程显示 git 管控的仓库强相关配置 | 客户确认只加：**基线档案头卡** — baselineId / bafCompatibility 兼容区间 / .baf/baseline.yml 实际路径（三字段都在 summary 线上协议里，零新增后端读取）；置于 grid 首卡 | ui-settings-baf-standard |
| 5 | 帮助页左侧三级目录灰色背景丑 | RTD 主题默认给 toctree-l3（含 .current）涂实心灰块；改为与二级一致的安静树样式：透明背景、muted 文字、当前项 accent 着色、缩进随父级树线 | overlay/docs/help (extra.css) |

## 【变更】明细

### ui-settings-baf-route（问题 1.1/1.2/1.3）

- `ModelRoutingRow.tsx`：actions 行首个子元素改为 `<select data-testid="route-tier-mode">`（两档/三档）；`routeTab` 状态扩为四值 `'tiers'|'phase'|'keywords'|'advanced'`；tab 数组加 `['advanced','advancedTitle']`；新增高级 panel（`route-panel-advanced`）承载 `advancedHint` 文案 + `route-reset` 按钮（disabled={state.saving}）。文件头【变更】2026-10-12 注记。
- `ModelRoutingRow.module.css`：原 `.tierModeRow` 块替换为 `.block[hidden] { display: none; }`（1.2 根修）。
- `locales.ts`：union 加 `advancedTitle|advancedHint`；`tierModeTwo/tierModeThree` 文案改「两档/三档」（en: Two/Three grades）；`advancedHint` 写明重置爆炸半径。
- `route-section.client.spec.tsx`：测试 1 改名断言四 tab + 真分页（`panelOf(id).hasAttribute('hidden')` 随点击翻转）；新增测试 2「挡位下拉驻 actions 左端 + 恢复默认住高级 tab」（options 文案、actions 内无 reset、点高级后 reset 可点且 `face.reset` 被调）。

### ui-settings-featured-plugins（问题 2.1/2.2）

- `FeaturedSection.tsx`：批量条换 `<span data-testid="featured-auto-all">` 内 label + `Switch`（checked = 全部插件 autoUpdate，onChange → `setAllAutoUpdate`）。
- `FeaturedSection.module.css`：`.autoAll` → `.autoBulkSwitch`（inline-flex, gap 10px）+ `.autoBulkLabel`（13px 次级）。
- `locales.ts`：新增 `autoUpdateAll`（en 'Auto-update all' / zh「全部自动更新」）。
- （2.2 的每卡 Switch + headLink URL 样式为前批 WIP 已落，本批验证收尾。）

### ui-settings-general（问题 3）

- `SettingsRoot.tsx`：`BAF_EXCLUSIVE = new Set(['workflow','model-routing','version-updates','featured-plugins','user-feedback'])` — 用户反馈导航项获得 `baf` 上标徽标。
- **web 复核发现（根因修正）**：用户反馈区的真实 section id 是 `user-feedback`（不是 `feedback`）——首版按 `feedback` 入集不命中，live 上无签。CDP React fiber 走查（nav 按钮 fiber 上溯取 `rows` prop）取到全部 section id 后改正。
- `settings-root.client.spec.tsx` 新增「SettingsPanel baf badge」describe 两测：`user-feedback` 行带 `baf` 上标、共享产品区不带（钉死 id 拼写回归）。

### ui-settings-updates（问题 3 连带 — 丢失源码复原）

- **发现**：live UI 一直显示「用户反馈」区，但 src 里并无其注册——它由 `lib/client.js` 的陈旧产物提供（src 侧 `FeedbackSection.tsx` 与 index.ts 的注册段在早前批次丢失，-built lib 存活）。若直接重新构建，该区会静默消失。
- **复原**：从 `lib/client.js.map` 的 `sourcesContent` 逐字恢复 `FeedbackSection.tsx`（飞书表单页，FEEDBACK_URL 不变）+ index.ts 注册段（id `user-feedback`、order 27）+ locales 四键（feedbackNav/Heading/Intro/Button，zh/en）。
- **连带修复（该包从未进任何类型检查图）**：`tsconfig.json` references 由裸 `../locale`、`../ui-settings`（非 composite → TS6306）改指各自 `tsconfig.client.json`；locales union 补 `labelBafCore`（en/zh 字典与 UpdatesSection 都在用，union 却缺）；复原文件去掉未用 import。`tsc -b` + tsdown client 通过。

### ui-baf-workflow（问题 4.1）

- `GatesOverviewRow.tsx` 重写：
  - `FLOW_ORDER = ['intake','open','clarify','design','plan','implement','verify','archive','drift']` 管道序；`NODE_LABEL` 映射 `gates.node.*` 本地化键（九节点中文名：接单/建立变更/澄清/设计/计划/实现/验证/归档/漂移回归）。
  - `GateCard`：gateTitle + bugFix chip + gateQuestion；详细模式加选项列表（含 dynamicOptions 标记 `baf-gate-dynamic-<id>`）。
  - `NodeCard`：nodeHead（节点名 + 产物 mono chip + 推进确认门 chip）+ stageLine（`baf-gate-stage-<node>`；详细 = gateFn + conditions + note；简洁 = conditionsCount）+ gates 堆栈。
  - `GatesFlow`：一次性确认门卡（`baf-gates-once`）+ `.flowCards` 管道 + 配置诚实块（`baf-gates-config`，仅详细模式）。
  - 主组件：`mode` state `'detail'|'concise'`（默认详细）；`<select data-testid="baf-gates-mode">` 在 `headActions`（showBody 时显示）；保留展开/收起 + load-once 缓存 + embeddedInTab 自动展开；testid 兼容：`baf-gates-row/toggle/error`、`baf-gate-confirm-<id>` 全保留。
- `GatesOverviewRow.module.css`：新增 `.headActions/.modeSelect`（与路由页同款 pill）、`.flowCards/.nodeCard`（左 3px accent 边）等流程卡样式族；`.option` nowrap→word-break。
- `locales.ts`：+17 键（gates.modeAria/modeDetail/modeConcise/onceTitle/onceHint/advancePrefix/conditionsCount/node.intake…drift 及 en 对应）。
- `gates-overview.client.spec.tsx` 重写：同 fixture（15 确认门 + 6 阶段门）；新增简洁模式测试（切 mode 后标题在、选项列表/配置块消失、stage 显示 conditionsCount 不显示 conditions）。

### ui-settings-baf-standard（问题 4.2/4.3）

- `StandardsOverview.tsx`：
  - `StatusSurface`：no-workspace/no-baseline 各渲染 `baf-standard-empty` 指引文案（4.2 根修 — 指向 /baf-scaffold，一步生成基线）。
  - `StandardsProjectOverview`：ready 分支 grid 首卡新增**基线档案头卡**（`baf-standard-card-baseline`）— FieldTable 三行：`baselineLabel`→baselineId、`compatLabel`→`min ~ max`、`configFileLabel`→baselinePath（可选字段 `?? '—'` 兜底）（4.3 客户确认项）。
  - `AreaRow` 删除未用 `area` prop（TS6133）。
- `locales.ts`：+`cardTitleBaseline/cardDescBaseline`（zh「基线档案（git 管控）」/ en 'Baseline archive (git-managed)'，desc 写明"改它即改全部规则"）。
- `standards-overview.client.spec.tsx`：4.2 测试改为断言 `baf-standard-empty` 含 `statusNoBaseline`；新增 4.3 describe 两测（档案卡含 b1 / 0.0.0 ~ 9.9.9 / /ws/.baf/baseline.yml 且先于 scaffold 卡；未 ready 不渲染档案卡）。

### overlay/docs/help（问题 5）

- `extra.css`：l2 规则后新增 toctree-l3 块 — li/a 及 `.current/.on-page` 背景 `transparent !important` 重置；l3 > a 12.5px/400 muted、padding 4px 10px 4px 14px；hover 文字+hover 底；current/on-page → accent 着色无底。需 `node overlay/scripts/build-docs.mjs` 重建 mkdocs 站点随包分发。

## 测试与类型

- 六个 spec 全绿：`route-section / gates-overview / featured-section / standards-overview / settings-root / updates-section` — **114/114 passed**（含 +2 档案卡测试、+2 badge 测试）。
- 类型：根 `tsc -b tsconfig.client.json` 全绿；ui-settings-updates（根图排除包）包内 `tsc -b tsconfig.json` 修复 references 后全绿；涉改包 client+host 双面绿。

## Web 端验证记录（CDP 真机回路，2026-10-12）

宿主：`node apps/cli/lib/bin.js --profile web --port 3180 --no-open` + `BAF_DSH_FEATURED_MANIFEST` 指向 `overlay/plugin/featured-plugins.json`（web 宿主默认无该 env → 推荐插件恒空，非代码缺陷）；探针 `C:/Users/12402/AppData/Local/Temp/baf-verify/webprobe-v7.mjs`，headless Edge CDP 9202。**全项通过（fail: []）**：

- 1.1/1.2/1.3：四 tab 真分页（单 panel 可见）、挡位 select 驻 actions 左端、选项恰为 两档/三档、恢复默认住高级 tab 且可见。
- 2.1/2.2：批量「全部自动更新」为 `role="switch"`；4 张卡；URL 与名称样式分离（字体/颜色断言过）。
- 3：用户反馈 + 工作流 导航行均带 `baf` 上标（fiber 取 id 复核：`user-feedback`）。
- 4.1：九节点全序 `intake→…→drift`（无门禁节点保留卡 + 「本节点无门禁」行——web 复核补修）；简洁模式 0 选项列表/无配置块/6 条完成条件数行。
- 4.2：三 tab 均非空（project 1380 / standard 985 / quality 301 字符）。
- 4.3：demo50 工作区 ready 态基线档案头卡真实数据（baf-baseline-init / 0.1.0 ~ 0.x / D:\…\demo50\.baf\baseline.yml）。
- 5：/help/baf-mode.html 五个 toctree-l3，透明背景 + 12.5px。

## 桌面端验证记录（baf-dsh.exe CDP 9200 真机，2026-10-12）

产物：`overlay/desktop/dist/win-unpacked/baf-dsh.exe`（0.0.24，`--dir` 模式、无 NSIS；打包链 help 资产已核：`resources/dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/help/index.html` 存在）。探针 `Temp/baf-verify/desktopprobe-v1.mjs`；启动需 `env -u ELECTRON_RUN_AS_NODE`（泄漏时 exe 以纯 node 起动直接报 `bad option`）。更新通道 404 为已知未发版态（U-01），非缺陷。除 4.3 ready 态外全项通过：

- 1.x：四 tab 分页 + select 位置/文案 + 高级 tab 恢复默认 ✓。
- 2.1：批量「全部自动更新」switch ✓，4 张插件卡 ✓（desktop 打包自带 `resources/plugin/featured-plugins.json` 并自设 env）。
- 2.2：URL/名称分层 ✓。
- 3：用户反馈 + 工作流 双 `baf` 徽标 ✓。
- 4.1：九节点序 + 无门禁节点（intake/archive/drift）「本节点无门禁」行 + 简洁模式 ✓。
- 4.2：三 tab 非空（143/139/127 字符）✓。
- 5：随包 `dist/help/stylesheets/extra.css` 含 11 处 toctree-l3 规则 ✓（注意：l3 规则在 verbatim 拷贝的 `stylesheets/extra.css`，不在编译产物 css/theme_extra.css）。
- 4.3 ready 态：桌面共用 home（~/.dsh 30+ 工作区）上 `resolveWorkspaceCwd` 的"最新带 cwd 会话"启发式选不中 demo50（新建会话在无消息时 shell 不落地 cwd；重开旧会话点击未命中），改用**字节同一性**闭环：`cmp` 证实打包 host `dsh-baf-standard/lib/index.js` 与 client `dsh-client-ui-settings-baf-standard/lib/client.js`（含 `baf-standard-card-baseline`）均与 web 端 live 过 ready 态的工作区 lib 逐字节一致 → 桌面 ready 态呈现与 web 已验一致；桌面 no-baseline 态真机渲染正确（scaffold 指引文案）。

## 发布物（本批）

- web 端 dev 回路验证 → `pnpm run build` → `brand-web.mjs`（先）→ `pack-dsh.mjs` → `overlay/desktop npm run dist -- --dir`（**不产 NSIS**）→ `generate-manifest.mjs`；exe = `overlay/desktop/dist/win-unpacked/baf-dsh.exe`，CDP 9200 端口真机复核。

## 剩余风险（排位）

1. **4.1 门禁卡数据面**：`gateOverview` payload 的 `dynamicOptions/bugFix/node` 字段由 host 侧组装 — 本批只动了客户端呈现，若 host fixture 外的某些门缺 `options`，简洁/详细两模式都按"有则显示"降级，不会白屏但信息可能偏少；真机过一个带 dynamicOptions 的门复核。
2. **4.3 档案卡可选字段**：老工作区 baseline.yml 若缺 `compatibility`，卡上显示 `—`（不阻断）；升级链路上无迁移逻辑（基线本来就由 /baf-scaffold 生成，schema 稳定）。
3. **5 帮助 l3 样式**：mkdocs RTD 主题版本升级可能改 `.on-page` 类名；打包链里 build-docs 若被跳过，dist/help 会退回旧 CSS（brand-web 会兜底同步 overlay/site，但 overlay/site 本身要先重建）。
4. **1.2 的 hidden 语义修复是全 selector 级**：`.block[hidden]` 选择器作用于整个路由页 — 若未来有人在其它 `.block` 上用 hidden 做局部折叠，行为现在才正确（原来根本折不起来），属于修复而非回归面。
5. **4.3 工作区归属启发式（环境面）**：`resolveWorkspaceCwd(sessions, workspaceRoot)` 取"最新带 `header.cwd` 的会话"判定当前工作区 — 多工作区共用的 home 上，「项目工程」tab 跟随最近活跃的那个工作区，且新建会话不发消息时 cwd 不落盘。产品行为可接受（用户通常单工作区活跃），但真机演示 demo50 前需先在该工作区跑一条会话让 cwd 落地。
6. **web 宿主 featured 清单 env**：`BAF_DSH_FEATURED_MANIFEST` 不设时 `readFeaturedManifest(undefined)` 静默返回空清单 — web dev 复核推荐插件前必须给宿主进程显式注入该 env（desktop 打包自设，web 裸宿主不设）。
