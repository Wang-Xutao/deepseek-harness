# 六问题批·第二轮 — 模型名去后缀 / 档位英文命名 / 保底规则文案 / OpenSpec×Matt 融合 / 更新故障码 / 工程规范总览

- 触发：客户 2026-10-06 对前批（`2026-10-06-six-issues-batch.md`）的六项追问，四项产品决策经确认：保底规则=保留不动仅改文案；Matt 落实=产品自带默认规则文档（开箱即生效，企业可覆盖）；配置页形态=设置→工作流「规范总览·只读」；故障码=码+一句人话。
- 交付：六项全部落地；新增双端包 `packages/client/ui-settings-baf-standard`（规范总览 Host Remote + 客户端行）。
- 验证：构建链全绿（`pnpm build:lib` + 触及包定向 vitest）+ **web/桌面双端运行时探针全绿**（探针脚本与断言明细见「构建与验证环境记录」）；桌面端规范总览首帧读到的是旧会话态、点一次「刷新」即就绪（host RPC 始终就绪，已列剩余风险 #1）。

## 问题 1 — 多模型路由模型菜单 label 去供应商后缀

【变更】`packages/client/ui-settings-baf-route/src/client/route-store.ts` `suggestionsOf`：label 即 `model.name`；仅当**同一供应商内**存在同名模型时才 `${name} · ${id}` 消歧（id 是稳定键，provider 名不再出现在任何菜单 label 里）。跨供应商同名（`baf/MiniMax-M3` vs `minimax-cn/MiniMax-M3`）本来就被菜单的供应商分组隔开（`ModelRoutingRow.tsx` 每档下拉先按 provider 过滤），后缀是重复信息。
测试：`route-section.client.spec.tsx` 三处断言改口径（distill 消歧仅同供应商、fixture labels、menuitem 文本）。

## 问题 2 — 档位命名改英文

【变更】`ui-settings-baf-route/src/client/locales.ts` zh：`tierHigh/tierMid/tierLow` = `Commander/Reviewer/Worker`；三个 Desc 以中文职责前缀（如「旗舰档：强推理、复杂工程、关键设计与发布、架构决策」）——英文是名，中文是解释，与工作流 Tab（`ui-baf-workflow` locales，一直英文）对齐。`description`/`flowHint` 同步（流程循环写 `（Worker → Reviewer → Commander）`）。en 侧 `Flagship→Commander` 等。断言走 i18n 键，测试零改动。

## 问题 3 — 保底规则文案通俗化（逻辑零改动）

【变更】同文件 `previewVerifyHint`：改写为「这是真实规则：验证不通过的返工回合至少派 Reviewer 档重做，防止低档模型反复失败；勾选只是让预演按此演示」。`route-dispatch.ts` 的 verify-escalation floor（`cause === 'verify-failed'` → 档位下限 mid）原样保留。en 同步。

## 问题 4+6a — OpenSpec × Matt 融合（BAF 模式核心）

**诊断**：OpenSpec 侧机制完备（模板→阶段门禁→工单只引用门禁条件→verify→archive）；Matt 侧 `baf-standard` 的 `summarizeStandard`（8 规则域 + sourceRef + promptLines）在 baf-workflow **零消费者**，出厂 ref 为 `<enterprise-tbd>` → `policy_missing`，模型写 design/plan 时看不到任何工程规范 — OpenSpec 管住了流程形状，没管住工程内容。

**融合架构 — 一个规则源，三级抓手**：
- **规则源（单一事实）**：`.baf/standards/default-rules.md`（产品默认，scaffold 生成），baseline `standard.mattPocockRulesRef` 指向它；企业改 ref 即整体替换。文档按 8 规则域组织（`## <anchor> 中文` 标题使 `sourceRef#anchor` 可解析），testing-discipline 域写明 Bug 修复先写回归测试（与既有 fast-path 硬门禁 `assertRegressionFirst` 呼应）。
- **抓手 1 · 提示词（软约束，本批落地）**：session 级 system-prompt section `baf:standard-rules`（order 606，紧随 OpenSpec section）— 模型撰写任何 OpenSpec 产物的每个回合都能看到规则源与规则域。挂 `session-gate.ts` 现成 install 路径：preset 过滤 + 每工作区缓存 + 失败 containment（读不到 baseline → provider 现成的 policy_missing 三行，绝不阻断会话）。
- **抓手 2 · 模板锚点（结构约束，本批轻量落地）**：`baf-openspec/templates.ts` design/tasks 模板 TODO 行点名规则源锚点（「偏离工作区规则源处需注明」「测试类任务遵循 testing-discipline 锚点」）。不新增门禁条件 → 工单/门禁「单一来源」纪律不破。
- **抓手 3 · 硬门禁（保持现状）**：已有的 plan 门禁（每任务 files/verify/rollback）、bug fast-path 回归测试先行、verify 阶段 quality 覆盖率门禁即 Matt 纪律的骨架。`hasStandardArea` 接 plan 校验列为后续 Tier 1 升级项（见剩余风险）。

【变更】落地：
1. `baf-scaffold/src/scaffold.ts`：`planScaffold` 3 文件（新增 `.baf/standards/default-rules.md`，沿用 created/skipped/backedUp 语义）；baseline 模板 ref 改相对路径 `.baf/standards/default-rules.md`。
2. `baf-workflow/src/session-gate.ts`：新 section `baf:standard-rules`（`renderStandardPrompt(summarizeStandard(baseline))`，install 时异步加载缓存）；baf-workflow tsconfig/package 增 `baf-standard` 依赖。
3. `baf-openspec/src/templates.ts`：两处 TODO 锚点（新测试文件 `templates.spec.ts` 锁定）。
4. `overlay/plugin/standards/baf-baseline-c/baseline.yml` + README 同步（ref + bugFixPath 修复）。

## 问题 6b — 设置→工作流「BAF 工程规范（规范总览·只读）」

【变更】新双端包 `packages/client/ui-settings-baf-standard`（照 ui-settings-baf-route 解剖）：
- **Host Remote `bafStandardConfig`**（`src/index.ts`，inject `sessions`+`sandboxPolicy`，纯只读契约）：
  - `summary()`：cwd 解析链 最新 `sessions.list()` 带 cwd 项→`sandboxPolicy.workspaceRoot`（workspace-files 先例）；`stat` 存在性检查先于 `loadBaselineFile`（ENOENT→no-baseline 指 /baf-scaffold；解析错→failed 带技术一行）；ready 投影 6 卡片（workflow/route/openspec/standard/quality/guard，字段路径=baseline YAML 原路径，`<enterprise-tbd>`→「企业待定」chip）。【变更】2026-10-06 运行时探针：签名从 `summary(sessionId?)` 改**零参** — typert 客户端代理按位置参数个数精确校验（见「构建与验证环境记录」），@Remote 方法须零参或全必填。
  - `rulesDoc()`：ref 相对 cwd 解析读全文；占位→unavailable(policy_missing)；IO 错→unreadable(reason)。同上零参化；store 侧 `reload`/`loadRules` 全 try/catch 包裹 — 代理调用 reject 不再把行晾在 loading。
  - 纯函数 `projectStandardCards`/`resolveWorkspaceCwd` 导出供单测（10 测试：cwd 链 3、投影 2、mounted 5）。
- **Client 行**（`src/client/`）：`settings.workflow.item` slot 行（order 20，排多模型路由行后）；ready 态 = meta 行（baseline/compat/cwd/配置文件路径）+ 7 卡片网格（6 host 卡 + 静态 scaffold 卡：三产物文件与命令入口）+ 规则文档查看器（折叠展开读全文）；空态三分支（no-workspace/no-baseline/failed）均指 /baf-scaffold。client 6 测试（卡数、tbd chip、空态、规则展开、policy_missing 指引、refresh 语义）。
- **注册八点**：tsconfig.base 别名 3 条（顺手补 featured-plugins/updates/sidebar-textpreview 三处历史缺口，`verify-tsconfig-paths` 由红转绿）+ 根双聚合 references + api/remotes（devDep/import/$mount/tsconfig×2）+ web-app（patch 行/dep/roster 测试）+ remote-default-responses（仅 `summary` — boot 会调；`rulesDoc` 用户触发不设默认，防哑失效）。
- **HTML 语义**：卡片字段表 `<table>`，规则全文 `<pre>`（pre-wrap, max-height 滚动），testid 全覆盖（`baf-standard-card-*`/`-field-*`/`-rules-*`/`-refresh`）。

## 问题 5 — 版本与更新故障码

【变更】
- `overlay/desktop/src/update/github.ts`：错误分类带 `code`（U-01 通道未发布/404、U-02 网络失败、U-03 通道数据异常、U-04 安全校验拒绝）——分类靠 code 不靠字符串解析，技术细节保留在 message 供日志。
- `overlay/desktop/src/update/service.ts` `checkForUpdate` catch：按 code 组装「故障码 U-01 · 更新服务尚未就绪（详见 帮助文档→版本与更新）」式用户文案（`FAULT_TEXT_ZH` 表），error result 只存用户文案。
- `overlay/docs/help/updates.md`：删内嵌长例，新增 U-01~U-04 故障码表（码/一句人话/技术原因/处理指引）；`npm run docs:build` 重建帮助站（`apps/web/dist/help/updates.html` 已含 5 处 U-0x 表项）。
- 测试：`manifest-sign.spec.ts` 补 code 断言；`update.spec.ts` U-02 文案对齐；`updates-section.client.spec.tsx` fixture 换 U-01 短文案。

## 构建与验证环境记录

- 全仓 host 面 tsdown 单进程 OOM（`| tail` 吞了退出码，exit 0 是假象）：按 mtime 规则重生成 `rebuild-list.tmp.json`（8 包）→ `CHUNK=0 npx tsdown --config tsdown.chunk.config.ts` 一次过 → `typert-emit-all.mjs`（8GB heap）→ 新包 `typert.remote-client.js` 含 `summary`/`rulesDoc` 描述符（20 处 namespace）、baf-route remote-client 三字段（category/presetWords/packs）健在 → 根 client tsc → 变更包 client 面 bundle。
- 依赖目录门 `verify-dependency-catalog` 绿；`verify-tsconfig-paths` 绿（补 4 包别名后）。
- （运行时探针记录，2026-10-06 回填）

  **双端运行时环境**（隔离验证态）：`DSH_HOME=C:/Users/12402/AppData/Local/Temp/baf-verify/dsh-home-fresh` — 混合家目录：`profiles` 为指向真实 `~/.dsh/profiles` 的 junction（保住已装插件 bundle/模型配置/设置），`sessions`/`storages` 全新（首启态），`baf-route-config.json`/`baf-route-presets.json` 拷贝；工作区 `ws-standards-batch`（含 `/baf-scaffold` 三产物）经 host `workspace/create` RPC + 界面选择器选中 + 新建会话后成为最新带 cwd 会话。web host：`node apps/cli/lib/bin.js --profile web --port 3080 --no-open`（+`BAF_DSH_FEATURED_MANIFEST`，cwd=工作区）；桌面：`overlay/desktop` `npx electron . --remote-debugging-port=9201`（env 清 `ELECTRON_RUN_AS_NODE`，host 端口从页面 `location.origin` 探得）。

  **根因排障（本批最重要的教训）**：规范总览行首测卡「正在读取工作区基线…」永久挂起。CDP `Runtime.exceptionThrown` 捕获真凶：`client api: bafStandardConfig/summary expected 1 argument(s), got 0` — typert 客户端代理在 `gateway/src/client/index.ts:497` 对**位置参数个数**精确校验，生成的 zod schema 允许 `z.union([z.undefined(), z.string()])` 也没用，可选参数位仍必须传。结论：**@Remote 方法必须零参或全必填**（仓内惯例；agent-presets 的 `resolve(id?: string)` 无 @Remote 正因此）。修复 = summary/rulesDoc 零参化 + store 侧 try/catch 兜底（reject → failed 态而非挂起）→ 重建链重跑 → 行亮 ready。host 侧 HTTP RPC 全程正确（此前「host 侧坏」是误诊）。

  **探针取证配方**（均可复用）：HTTP RPC 直呼 `POST /api/<ns>/<method>` body `{"type":"client-request","rpcId":"…","method":"<ns>/<method>","payload":{"args":{<具名参数>}}}` — 鉴权靠浏览器 `dsh-auth` cookie（CDP `Network.getCookies` 提取；URL `?token=` **不**鉴权 RPC），参数名来自 TS 形参名（`workspace/create` 要 `request` 不是 `input`）。CDP 卫生：浏览器级端点（`/json/version` 的 `webSocketDebuggerUrl`）先 `Target.closeTarget` 清光残留页再 `Target.createTarget`（残留 chrome-error/about:blank 页会偷走 `connect(port, urlIncludes)` 匹配）；探针必须带 URL argv（裸跑会把页签导航到字面 "undefined"）。

  **Web 端结果**（`C:\Users\12402\AppData\Local\Temp\baf-verify\webprobe-v5.mjs`，`fail: []`）：
  - A 规范总览：标题「BAF 工程规范（规范总览·只读）」+ 7 卡片（workflow/route/openspec/standard/quality/guard/scaffold testid 全中）+ meta「基线：standards-batch / 兼容范围：0.1.0 ~ 0.x / 工作区：…ws-standards-batch / 配置文件：….baf\baseline.yml」+ 刷新按钮；`workflow.requireOpenSpec=true`、`standard.mattPocockRulesRef=.baf/standards/default-rules.md`、availability=「已就绪（规则文档已挂接）」（本批 locale 修复的实证）；规则查看器展开 = 真实 default-rules.md 全文含 `testing-discipline` 锚点。
  - B/C 档位与保底：`Commander/Reviewer/Worker` 三名全中 + 「旗舰档：/评审档：/执行档：」职责前缀 + 「（旗舰/评审/执行）」括注 + 「这是真实规则…Reviewer」通俗文案。
  - D 模型菜单：5 项 label 全裸名（MiniMax-M3、glm-5.3-flash、deepseek-v4-flash、deepseek-v4.1-flash、glm-5.3），零 ` · ` 后缀。
  - 截图：`v5-web-standards-overview.png`、`v5-web-route-menu.png`。

  **桌面端结果**（`desktopprobe-v5.mjs`，CDP 9201，U/B/C/D 一次全绿，A 刷新后绿）：
  - U 故障码：「检查更新失败：故障码 U-01 · 更新服务尚未就绪（详见 帮助文档→版本与更新）」+「当前版本：0.0.23 / 最新可升级版本：—」；全文无 HTTP 404/Release/gh-release 技术细节泄漏（U-01 即真实 404 通道的预期用户态；绿路径单测覆盖）。
  - A 规范总览：行首帧读到旧会话态（no-baseline 空态）→ 点一次「刷新」→ meta「基线：standards-batch / 工作区：…ws-standards-batch / 配置文件：…baseline.yml」+ availability 已就绪 + 规则全文含 testing-discipline。同期对桌面 host 自身端口直呼 `bafStandardConfig/summary` 返回 `{ok:true,status:'ready',cwd:'…ws-standards-batch'}` — host 数据路径全程正确，仅前端 store 首帧未重读（剩余风险 #1）。
  - B/C/D 与 web 同款断言全中（同 5 个裸模型名）。
  - 截图：`v5-desktop-updates-u01.png`、`v5-desktop-standards-overview.png`、`v5-desktop-route-menu.png`。

  **构建链补充教训**：client 包重建顺序必须 `tsc -b`（刷 lib/types）**先于** `tsdown`（bundle 吃 lib/types/client/index.js）— 本次顺序跑反过一次，locale 新值被旧 lib 静默盖住（grep lib 有键无新值抓现行），重跑即好。

## 剩余风险（按用户可见性×修复成本排序）

1. **规范总览行不随会话/工作区切换自动重读**（桌面首帧读到旧会话态，host RPC 已就绪，需点一次「刷新」）。用户可见性：中（晚加载会话store的机器上，客户看到的是「先 /baf-scaffold」引导而非数据）；修复成本：低 — standards-store 监听会话态变化或设置面板切到该节时重触发 `reload()`。本批未动（改动涉及 store 生命周期，留独立小批）。
2. **`_no-cwd` 空白会话无 cwd 印记**：未先在选择器里选好工作区就「新建会话」→ 会话落 `_no-cwd`，`resolveWorkspaceCwd` 跳过它。属产品会话语义而非缺陷，但客户「先建会话后选工作区」的顺序会看不到规范数据。可见性：中低；成本：中（要动会话创建时的 cwd 印记规则）。
3. **@Remote 可选参数无机器强制**：可选参过 zod/类型门但在客户端运行时按 arity 抛错（本批踩过）。可见性：仅开发者；成本：中 — 可加约定 lint 或让 gateway arity 校验识别可选尾参。
4. **tsdown 先于 tsc 的静默陈旧**：顺序跑反 = 新 mtime 旧内容，所有后续构建静默跳过。可见性：仅开发者；成本：低中 — tsdown 配置里加「lib 产物含本次改动关键词」前置检查不现实，务实做法是文档化（本文件 + 记忆）。
5. **工作区目录残留**：混合家目录启用前的第一次 `workspace/create` 把 `ws-standards-batch` 写进了真实 `~/.dsh/storages/workspace.json`。无害（目录存在、条目可用、UI 两击可删）；一次性清理即可，无产品修复。
6. **hasStandardArea 接 plan 校验（Tier 1 升级项）**：testing-discipline 就绪时 plan.json 应含测试任务或显式豁免行 — 本批「抓手 3」按计划保持现状，未加新门禁。
7. **guard 拒绝消息引用规则域锚点**：同上 Tier 1 备选，成本中、可见性低（拒绝消息已够用）。
