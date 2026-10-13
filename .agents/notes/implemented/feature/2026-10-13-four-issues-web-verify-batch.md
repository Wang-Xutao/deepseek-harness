# 2026-10-13 四问题批 — 档位下拉样式对齐/反馈按钮修复/Worker 关键词移除/企业规范·质量监控基线解耦

> 范围：设置页三处（多模型路由 ×2、用户反馈、工作流 ×2）。验证路径：**仅 web 端**（客户本批要求「打开 web 端验证通过」，无 exe 打包）。
> 宿主 `--profile web --port 3180`（`BAF_DSH_FEATURED_MANIFEST` 注入）+ headless Edge CDP 9202；探针 `Temp/baf-verify/webprobe-v8*.mjs`、`v8-switchready2.mjs`。

## 问题 → 方案总表

| # | 问题 | 方案 | 涉及包 |
|---|------|------|--------|
| 1 | 两档/三档下拉样式与通用设置·语言的下拉不一致 | 档位锚点改用新 `.modeSelector` — 逐字镜像 locale/LanguageRow 的 `.selector` pill（36px / radius-md / 14px / gap 12 / Regular 描边 chevron）；原 `.selector`（32px 紧凑卡内选择器族）保留不动 | ui-settings-baf-route |
| 2 | 用户反馈「打开反馈表单」按钮样式异常 | 根因：`<a>` 走 UA 原生样式（下划线 + inline 基线未 reset）。`.btn`/`.btnPrimary` 补 inline-flex + 双轴居中 + box-sizing + text-decoration:none（36px pill） | ui-settings-updates |
| 3 | Worker 是兜底档，不需要关键词规则 | 确认客户判断成立：low 档关键词是**死配置**（escalateOnly 求值 = max(keyword, phase)，phase 下限本来就是 low），且 first-match-wins 下早位 low 规则会**遮蔽**真实升档（「重构这个函数」先命中「函数」）→ 删除纯收益。求值 fold 处按 **coerced 档位**过滤死规则（两档下 mid 同死），intake/backfill/auto-routing/preview 全链继承；低档预设包 routineEdits 同步移除 | baf-core / baf-workflow / ui-settings-baf-route |
| 4 | 企业规范和质量监控不应依赖 BAF 基线 | 客户决策（AskUserQuestion）：企业规范 = **结构常显+内容降级**（8 域结构/阶段分组是产品常量；正文无基线时降级到 /baf-scaffold 指引）；质量监控 = **机制说明常显+卡片依赖基线**（门禁机制是产品内置；stack 卡片字段来自 baseline.yml 的项目参数，与项目工程同类 → 保持 ready-gated） | ui-settings-baf-standard |

## 【变更】明细

### ui-settings-baf-route（问题 1 + 3 呈现面）

- `ModelRoutingRow.module.css`：新增 `.modeSelector`（36px / `var(--dsw-radius-md)` / 14px / 行高 22px / padding 0 14px / gap 12 / inline-flex / bg `--dsw-alias-bg-module-platform` / hover `--dsw-alias-interactive-bg-hover`）——与 `locale/LanguageRow.module.css .selector` 逐字段一致；注释明确两族不得合并（`.selector` 是 32px/16px/13px 卡内紧凑选择器）。样式为拷贝非共享类，语言 pill 将来变更时需同步（见风险 3）。
- `ModelRoutingRow.tsx`：档位锚点 `css.selector` → `css.modeSelector`；chevron `IconChevronDownOutlineMedium` → `IconChevronDownOutlineRegular`（1px 描边，语言下拉同款；Medium 为 1.3px）。锚点 testid `route-tier-mode`、Menu 项〔两档/三档〕、align="end"、portal 均不变。
- 关键词 tab（问题 3 呈现面）：分组渲染源自**已过滤**的 effectiveKeywordRules（baf-core 单点 fold），故 UI 天然只剩 Commander/Reviewer 两组；新增关键词的 adder 只提供这两档；`keywordsHint` 文案改写为「…没命中（或关键词关闭）就兜底给 Worker，所以 Worker 不需要自己的关键词…」；preview 面板 `previewNone` 文案「未命中任何关键词 — 不会因关键词冻结角色」。
- `route-section.client.spec.tsx` / `route-config-service.spec.ts`：断言同步（两组、adder 选项、preview 未命中文案、两档 coerce 过滤）。

### ui-settings-updates（问题 2）

- `UpdatesSection.module.css`：`.btn` / `.btnPrimary` 补 `display:inline-flex; align-items/justify-content:center; box-sizing:border-box; text-decoration:none`（FeedbackSection 复用该样式表的 `css.btn`）。
- `FeedbackSection.tsx` 本身未动（10-12 批从 lib/client.js.map sourcesContent 复原，仍 untracked）。

### baf-core / baf-workflow（问题 3 求值面）

- `route-tier.ts`：
  - `effectiveKeywordRules` 新增 `options.tierMode`；`alive(tier) = coerceTierForMode(tier, mode) !== 'low'` — user 规则与 preset 包先过 alive 过滤再进结果。死规则不进列表 → 单点修复，四个消费链（intake 求值 / backfill / auto-routing / 设置页 preview）全部继承。
  - `BUILTIN_KEYWORD_PRESETS` 移除 low 档 `routineEdits` 包（死配置 + 遮蔽源；「实现/函数/文案/README/typo…」这类词本就该落到兜底 Worker 而非被关键词截住）。
  - 文档注释写明判定依据：escalateOnly（默认开）下选择是 `max(keyword, phase)`，phase 下限即 low → low 关键词永不改变结果；escalateOnly 关闭时关键词整体不参与。两档模式 mid coerce 到 low → mid 规则同死（`alive` 检查的是 coerce 后档位）。
- `route-config-io.ts`：`effectiveRouteKeywordRules` 透传 `config.tierMode` 给上述过滤。
- `types.ts`：公共导出加 `TierMode`。
- 存量配置兼容：旧 `~/.dsh/baf-route-config.json` 里已存的 low 档用户规则**读侧被过滤**（不再参与求值、不再显示），保存后自然从文件消失；无迁移逻辑（见风险 2）。

### ui-settings-baf-standard（问题 4）

- `StandardsOverview.tsx`：
  - `StandardsEnterpriseOverview`：`AREA_META`（8 规则域）+ `STAGE_AREA_GROUPS`（6 阶段分组）为客户端常量 → 结构（`baf-standard-areas` 块 + `baf-standard-stage-*` 分节 + 8 个 `baf-standard-area-*` 行）**无条件渲染**；正文三态：rules ready → 锚点切片 `baf-standard-area-body-*`；unavailable（无基线）→ `baf-standard-area-needs-*` 降级文案（指向 /baf-scaffold）；undefined → 读取中。
  - `StandardsQualityOverview`：`baf-standard-quality-mechanism` 机制卡（「门禁机制（产品内置）」产品常量文案）**常显**；`baf-standard-card-quality` stack 卡保持 ready-gated（字段来自 baseline.yml manifest.stack）；无基线时 banner 指引。
- `standards-store.ts`：**loadRules settle 修复（本批 web 复核中自发现的 bug）** — 原实现 `summary?.status !== 'ready'` 时早退，`rules` 留 undefined，而组件把 undefined 渲染成「正在读取工作区基线…」→ 无基线工作区展开任一规则域永远转圈。改为：summary 已落地且非 ready 时 settle `rules = { status:'unavailable', reason: summary.status }`，两个消费面（域展开 + 文档查看器）立即降级；summary 仍在 loading（undefined）时照常发起 RPC（不再早退，消掉「展开赶在 summary 前」的空窗）。
- `locales.ts`：`areaNeedsBaseline` / `qualityMechanism*` / `rulesUnavailable*` 等键。
- `standards-overview.client.spec.tsx`：+2 controller 级测试（no-baseline settle 且零 RPC；summary 未落地时照常 fetch），组件级断言 unavailable → needsBaseline testid；共 14/14。

## 测试与类型

- 六个 spec 全绿：`route-tier / route-config-io / route-section / route-config-service / standards-overview / updates-section` — **137/137 passed**。
- 类型：涉改包 client 面 `tsc -b tsconfig.client.json` 全绿（ui-settings-baf-standard 本窗口复跑 0 错）。
- 构建链（本批无 exe）：涉改包 host lib `npx tsdown` + client bundle `DSH_BUILD_FACE=client npx tsdown --env.DSH_BUILD_FACE client --config-loader native`，surgical 重建后 `writeClientBuildRecord` 重写 `.dsh-build/client-build-environment.json`（413 artifacts，digest 对账通过）。

## Web 端验证记录（CDP 真机回路，2026-10-13）

宿主 3180（featured env 注入）+ Edge 9202。**双分支全绿（fail: []）**：

- **问题 1**：语言锚点 vs 档位锚点 computed style 逐项一致（height 36 / borderRadius / fontSize 14 / lineHeight 22 / padding / gap 12 / display / alignItems / backgroundColor / color / fontFamily）；菜单恰为〔两档，三档〕（role=menuitem）；无原生 select 残留。
- **问题 2**：`<a>` 36px 高、内容居中、`text-decoration-line: none`（computed display 为 flex —— inline-flex 作为 flex item 的块化，渲染正确）。
- **问题 3**：关键词 tab 只剩 Commander/Reviewer 两组；36 个升档标签（无 README/文案/typo 类死词）；3 个预设包开关；adder 选项恰为〔Commander, Reviewer〕；hint 兜底文案；live RPC preview 输入「补充 README 安装说明」→「未命中任何关键词 — 不会因关键词冻结角色」。
- **问题 4 无基线分支**（demo10，reload 后 fresh store）：企业规范结构常显（areas 块 + 6 阶段 + 8 域行）+ no-baseline banner；展开 logging 域 → 「该域的规则内容需要基线定位规则文档。在会话里运行 /baf-scaffold 生成基线后即可展开阅读。」（settle 修复后的降级文案，修复前此处永远转圈）；质量监控机制卡在、stack 卡不渲染。
- **问题 4 ready 分支**（demo50）：banner 消失、summary 完整投影；展开 logging 域 → 真实规则切片「## logging 日志 - 记状态迁移与决策点（选择了什么、为什么）…」；质量监控机制卡 + stack 卡（「baf-quality · 质量门禁…」）双在。
- 截图：`v8-1-lang-menu / v8-1-tiermode-menu / v8-2-feedback / v8-3-keywords / v8e-*-nobaseline / v8-ready2-*`（Temp/baf-verify）。

### 环境知识（验证回路沉淀）

- **工作区切换入口**：全局 picker 只存在于**新会话草稿 composer** 的「选择工作区」chip（aria-label 选择工作区、text=当前工作区名）——已有会话界面没有全局切换按钮；在旧会话界面找 picker 必然失败。切换 → 选 demo50 → 发一条消息（workspace 先于会话创建被选中才会落 cwd）→ reload。
- **standards store 每次客户端 boot 只取一次 summary**：换工作区后不 reload 就打开设置页看到的仍是旧快照（此前 v8b 假阴性的根因）。
- web 宿主 boot token 单次使用：`location.href` 赋值带 token 的 URL 只能一次（二次赋值 401）；之后一律 `window.location.reload()`。
- fresh 宿主 boot 后页面按钮数阈值：`>15`（landing 态约 19 个，`>25` 会误超时）。

## 剩余风险（排位）

1. **resolveWorkspaceCwd 多工作区启发式**（与 10-12 批风险 5 同源）：无 sessionId 时取「最新带 header.cwd 的 live 会话」判定当前工作区 — 多工作区共用 home 时，企业规范/质量监控/项目工程跟随最近活跃工作区；新会话不发消息 cwd 不落盘。产品行为可接受（用户通常单工作区活跃），演示特定工作区前先在该工作区跑一条会话。
2. **存量 low 档用户规则静默清洗**：旧配置文件里的 low 档关键词规则读侧被过滤、保存后从文件消失 — 刻意不做迁移/提示（规则本来就不参与求值），但客户若手工翻看文件会注意到规则少了。
3. **`.modeSelector` 是样式拷贝非共享类**：语言下拉 pill 将来调样式时两处需手动同步（该 pill 族在产品内已有 `.selector` 紧凑变体 + 本次 `.modeSelector` 两份独立定义，模式与现状一致）。
4. **问题 4 结构常显的文案边界**：8 域/6 阶段/机制说明是客户端常量 — 若未来基线 schema 新增第 9 域或门禁机制变化，需同步 `AREA_META`/`STAGE_AREA_GROUPS`/机制卡文案（当前与 /baf-scaffold 生成的默认规则文档一一对应）。
