# 2026-09-29 · BAF demo23 五问题批次 — 输入确认门 / 放弃收口 / 总览产物 / 设置开关

> 用户问题（原文）：「请修改如下问题，必要时需要打开web端进行调试验证：
> 1. 使用非baf模式，进入会话不需要自动执行baf-welcome
> 2. baf模式下，当用户输入时，首先需要对输入内容进行确认，不要直接进入baf工作流，而是先确认是否是change，是否是需求，判断是再进入工作流，不然就要和用户去确认。
> 3. baf模式下，变更放弃了，在变更总览中，已经生成的产物也是需要显示的。
> 4. 工作流顶部按钮选择放弃变更后，工作流已经结束，会话的弹窗和工作流页面的顶部对话都要取消结束，不能再继续推动工作流了。
> 5. 设置，工作流项，删除当前的placeholder内容，添加一项，是否显示工作流tab的checkbox，开关工作流页面的显示。」

## 0. TL;DR

| # | 问题 | 根因 | 修复 |
|---|---|---|---|
| 1 | 非 BAF 会话自动执行 baf-welcome | 常驻挂载扫装不判预设成员（2026-09-28 预设隔离批的 A1 路径） | 已在树中的 `presetCovers` 判定（`preset-cover.ts`）；本批只做构建+web 验证，无新代码 |
| 2 | 用户输入未经确认直接进工作流 | auto-pop 是「每会话一次」的 offer，第二句起直达模型侧 bootstrap | auto-pop 改为**逐条消息**弹前置确认卡；两个降噪护栏（挂起中跳过、忙工作区跳过） |
| 3 | 放弃的变更在总览中看不到已生成产物 | dashboard 行只带任务/时长/token 汇总，不读产物目录 | host 侧 `generatedArtifacts()` 挂到每个终态行；客户端渲染可点击的产物 chips（右侧栏打开） |
| 4 | 顶部按钮放弃后，会话弹窗+Tab 顶部对话还活着继续推流程 | 弹窗与 Tab 横幅是**同一个挂起 ask**，但终态迁移没有宿主侧撤销通道 | ask-queue 增加 `changeId` 元数据 + `cancelAsksForChange` 终态撤销开关；放弃/归档时统一拉闸 |
| 5 | 设置·工作流项是 placeholder，没有实际开关 | 该 section 从未注册子行 | tracegraph 声明 `settings.workflow.item` 子槽；ui-baf-workflow 提供「工作流页签」开关行 + localStorage 偏好 + Tab 挂载改受偏好门控 |

验证：baf-integration 471 用例（40 文件）+ 客户端 22 用例全绿；`pnpm build:lib` 双面全绿，
产物标记核对（`cancelAsksForChange`/`generatedArtifacts`/`settings.workflow.item`/
`WORKFLOW_TAB_PREF` 均进 lib）；web 端验证见 §7。

## 1. 问题 1 — 非 BAF 模式不执行 baf-welcome（验证批）

根因与修复都是 2026-09-28 预设隔离批（`2026-09-28-baf-preset-isolation.md`）的内容，
本会话开始时仍在工作树中未提交：

- `baf-workflow/src/preset-cover.ts`（新增）——`presetCovers(ctx, agent)` 按 scope 链判
  预设成员关系，无 scope 行降级全覆盖（CLI/测试组合兼容）。
- `baf-guard/src/install.ts`、`baf-workflow/src/session-gate.ts`——挂载期 `agents.list()`
  扫装与 `agent-preset/selected` 同步监听都过 `presetCovers`，标准模式 agent 不再被装上
  BAF 启动门提示词段（baf-welcome 的载体）与硬门禁。

本批工作 = `pnpm build:lib` + 产物核对 + web 端实测（§7.1）：非 BAF 会话首条消息不再出现
baf-welcome 提示段。配套 `install-scoped.spec.ts` / `preset-cover.spec.ts` 也在本树中。

## 2. 【变更】问题 2 — 每条输入先确认，确认后才进工作流

### 2.1 语义变更（`baf-workflow/src/auto-pop.ts`）

旧行为：会话内第一条有效消息消耗掉唯一一次 offer（`offered` Set + `releaseOffer`），
第二句起直接交给模型侧 bootstrap——客户可能在**从未被询问**的情况下看到工作流启动
（new-workflow → 分类卡）。

新行为：**工作区已初始化且空闲时，每条真实用户消息都弹一次前置确认卡**：
「要把这句话作为新需求开始 BAF 工作流吗？」→「作为新需求开始」才 `beginIntake` +
分类确认；「只是聊天，不开始」什么也不产生。没有任何文本能在客户未点击的情况下
进入工作流。

两个降噪护栏（防止逐条弹卡变成骚扰）：

1. **挂起中跳过**（`hasPendingAsk(sessionId)`）：会话上还有任何未决弹窗时，新消息
   视为那张卡的回答/补充语境，不再叠一张前置卡。这也是问题 4 引入的新查询原语。
2. **忙工作区跳过**（`actives.length > 0`，原逻辑保留）：有进行中变更时输入属于模型
   侧车道，真正的新需求由模型侧 `active-conflict` 门接住。

不变项：slash 输入、`<4` 字符短问候、非 `source.kind === 'user'`（插件注入）过滤照旧；
未初始化工作区前的不停靠（requirement-park）照旧。

### 2.2 测试（`tests/auto-pop.spec.ts`）

- 删「每会话至多一次」用例；新增
  「【变更】2026-09-29 (demo23 问题 2) every genuine message gets its own pre-question」
  （两条消息各弹各的，均点「只是聊天」→ 0 变更）。
- 新增「a message typed while a dialog is pending does not stack another pre-question」：
  锁住第一张卡（latched Promise）期间发第二句 → 仍只有 1 次弹卡，释放后无变更。

## 3. 【变更】问题 3 — 放弃的变更在总览中显示已生成产物

### 3.1 host 侧（`baf-workflow/src/dashboard.ts` + `baf-core/src/tab-view.ts`）

- `baf-core`：`WorkflowDashboardRow` 增加 `artifacts?: readonly WorkflowDashboardArtifact[]`；
  新类型 `WorkflowDashboardArtifact { file, path, state: 'template' | 'planned' | 'filled' }`
  （`types.ts` 同步 re-export）。
- `dashboard.ts` 新增 `generatedArtifacts(workspaceRoot, entry)`：用既有
  `changeArtifactStatus`（live 路径 `openspec/changes/<id>/` 优先、归档回退）读每个文件，
  只留**真实生成**的三态（`missing`/`clipped` 丢弃——没有可展示或可打开的内容）。
  放弃的变更目录本来就原地保留，所以 live 路径直接命中。
- `dashboardRowFor` 把产物读取放在 metrics try 劗**外**：事件日志读不出来也必须带上
  客户正在问的产物；两端返回（成功/降级）都合并 `artifacts`。
- 类型窄化用显式循环（`.filter().map()` 无法把 `ArtifactState` 收窄到三态，tsc -b 报
  TS2322 后改写）。

### 3.2 客户端（`ui-baf-workflow/src/client/WorkflowView.tsx` + `tab-types.ts`）

- `tab-types.ts` 镜像 `artifacts` 字段与 `WorkflowDashboardArtifact`（浏览器安全，
  不拉 baf-core Node 模块）。
- `dashboardRow` 渲染为 fragment：原「切换」按钮不变；终态行有产物时，其下渲染
  「已生成产物」标签 + 一排可点击 chips——点击 = `openArtifact(path)` 在右侧栏打开
  （与 ArtifactRail 同一通道）；chip 的状态角标复用 `artifact.state.*` 文案与 rail 的
  状态样式类。键 `dashboard.artifacts`（zh「已生成产物」/ en「Generated artifacts」）。

## 4. 【变更】问题 4 — 放弃后所有确认面一起收口

### 4.1 通道分析（为什么改 ask-queue）

放弃的三条表面（slash `/baf-workflow-abandon`、Tab 顶部「放弃变更」按钮的 gateResolve、
会话弹窗点击）都汇入 `driveAbandon`。但会话弹窗和 Tab 顶部横幅渲染的是**同一个挂起
ask**（ui-user-questions 的 PendingQuestion 载体：abort → ASK_ABORTED reject → finally
`remove()`，两块 UI 同时消失）——所以宿主侧只要能撤销那条 ask，两个面就一起死。
缺的是「按变更撤销」的注册表。

### 4.2 `baf-workflow/src/ask-queue.ts`

- `AskQueueEntry<T>` 增加可选 `changeId`（变更作用域的弹卡才带；scaffold、auto-pop
  前置卡等工作区/会话作用域的不带，**必须存活**）。
- `SessionQueue` 增加 `entries: Map<key, { controller, changeId }>`——入队登记、
  早退/结算清除。
- 新增 `cancelAsksForChange(changeId)`：全队列扫 `changeId` 命中的条目逐个
  `controller.abort()`，返回撤销数。底层 `service.ask` 在每个表面同时以 ASK_ABORTED
  结束：客户端载体注销 pendingInteraction（会话弹窗消失、Tab 横幅同死）、模型侧
  in-flight 的 `baf_gate_ask` 落为 paused('cancelled')。
- 队列头守卫从只查外部 `entry.signal` 扩为 `entry.signal?.aborted ||
  controller.signal.aborted`——**排队中被撤销**的条目到头也不许再弹（本轮补的洞）。
- 新增 `hasPendingAsk(sessionId)`（问题 2 的护栏查询）。

### 4.3 接线

- `gate-dialog.ts`：`askGateDialogQueued` 的 enqueueAsk 透传 `gate.changeId`。
- `command-drives.ts`：`driveArchive` / `driveAbandon` 在终态迁移后调
  `cancelAsksForChange(changeId)`，状态行追加 `已同步关闭 N 张未决确认卡`（N>0 才出现，
  既有测试断言不受扰）。
- `gate-ask.ts`：paused 分支先读 `ProjectionStore.readStatus` 的终态——变更已
  放弃/归档时，返回**终态说明**（「这张确认卡已随放弃关闭，不会再重弹…按新工作流处理」），
  取代旧的「系统会在你下一个回合结束时自动重新弹出这张卡」假承诺（对已终态变更这句
  是谎言）。读失败 catch 降级旧文案。

### 4.4 测试（`tests/ask-queue.spec.ts` 新 describe）

- in-flight 撤销：ASK_ABORTED 透传、key 释放、队列未毒化（后续同 key 正常跑）。
- 排队中撤销：到头 `dropped: 'aborted'`，run 从未执行（对应 4.2 的队头补洞）。
- 无 changeId 的弹卡与其他变更不受影响；`hasPendingAsk` 各态。
- 跨会话撤销：同一变更的两条 ask（会话 A 弹窗 + 会话 B）一次清零。

## 5. 【变更】问题 5 — 设置·工作流：真开关替换 placeholder

### 5.1 槽位（ui-settings 契约 + tracegraph section）

- `ui-settings/src/client/contract/slots.ts`：声明
  `'settings.workflow.item': { kind: 'list'; scope: 'root'; owner: SettingsWorkflowItemOwnerProps }`
  （与 `settings.general.item` 同构的叠加座位；owner 空标记类型），client 入口
  re-export 新类型。**这是修编译的根**：槽名不进 SlotMap，tracegraph 的 children 声明
  与 ui-baf-workflow 的 `slots.inject` 都过不了类型。
- tracegraph `WorkflowSection.tsx` 重写为容器：标题 + 简介 +
  `renderSlot('settings.workflow.item', {})`；placeholder 行/样式/文案键全部删除
  （locales 的 `placeholder.*` 键与联合类型一并清理，intro 改为「BAF 企业工作流相关选项。」）。
- tracegraph `index.ts` 的 section 注册声明
  `children: { 'settings.workflow.item': { kind: 'list', scope: 'root' } }`
  （与 General section 声明 `settings.general.item` 同款）。

### 5.2 开关行与偏好（ui-baf-workflow 拥有）

- `src/workflow-tab-settings.ts`（新）：`WORKFLOW_TAB_PREF_KEY =
  'baf.workflow-tab.pref'`、默认 `showWorkflowTab: true`、`INITIAL_WORKFLOW_TAB_PREFS`。
  **localStorage 的 createSnapshotStore 快照不跨实例同步**——所以用独立键，不与
  tracegraph 的偏好 store 撞。
- `src/client/WorkflowTabRow.tsx`（新）：镜像 TraceGraphRow 的胶囊开关行
  （`role="switch"`，`settings.workflowTab.title/description/on/off` 文案），注入面
  `{ hooks: { settings: HostObservable<…> }, setShowWorkflowTab }`。
- `client/index.ts`：注册 `settings.workflow.item` 行（id `workflow-tab`）；
  Tab 挂载 effect 的判定从 `agentPreset === 'baf'` 扩为
  `=== 'baf' && prefs.getSnapshot().showWorkflowTab`，prefs.subscribe 接进重渲染链——
  **拨开关立即挂/卸 Tab，无需重启**。
- 依赖接线：`package.json` dsh.client.inject + devDependencies 增加
  `@deepseek-ai/dsh-client-store`（偏好 store）与 `@deepseek-ai/dsh-client-ui-settings`
  （type-only 槽契约，`import type {} from '…/client'` 引入 SlotMap 合并）；
  `tsconfig.client.json` 增 reference 与两个新文件（该包用显式 files 列表，漏列 =
  TS6307）。

## 6. 构建与验证记录

- vitest：`--project baf-integration` 40 文件 471 用例全绿；ui-baf-workflow +
  ui-baf-tracegraph 22 用例全绿。
- `pnpm build:lib`：首轮报 dashboard TS2322（ArtifactState 未窄化）与客户端面
  TS2769/TS6307（槽未声明 + 文件未列），按 §3.1/§5 修复后全绿。
- 产物核对：`lib/index.js` 含 `cancelAsksForChange`/`generatedArtifacts`；
  `lib/gate-ask.js` 含终态说明；`lib/auto-pop.js` 含 `hasPendingAsk`；tracegraph
  `lib/client.js` 含 `settings.workflow.item`；ui-baf-workflow `lib/client.js` 含
  `WORKFLOW_TAB_PREF`/`dashboardArtifacts`。（防 tsc-watcher 竞速的静默旧产物。）

## 7. web 端验证（dev:web + dsh web，host 经 lib 加载）

（验证结论见 §9「验证结果」——五问题 2026-09-30 web 端实测全绿。）

### 7.1 计划清单

1. 问题 1：标准模式（agentPreset 非 baf）新建会话发首条消息——无 baf-welcome
   启动段、无 BAF 硬门禁；BAF 模式会话行为不变。
2. 问题 2：BAF 会话、已初始化空闲工作区发「随便聊聊…」→ 弹前置卡；点「只是聊天」
   → 无变更；再发一句正式需求 → **再**弹前置卡；点「作为新需求开始」→ 分类确认 →
   确认后进入工作流。
3. 问题 3：造一个走到 design 的变更 → 顶部按钮放弃 → 变更总览该行下方出现
   「已生成产物」chips（proposal.md/design.md…），点击在右侧栏打开。
4. 问题 4：变更停在 design-confirm 弹窗打开时，从 Tab 顶部按钮放弃 → 会话弹窗与
   Tab 顶部横幅**同时**消失；模型下一回合不再收到「会重新弹卡」的指引。
5. 问题 5：设置 → 工作流：placeholder 行消失，出现「工作流页签」开关；关掉 →
   对话页签区「工作流」立即消失；打开 → 立即回来；刷新后偏好保持。

## 8. 遗留问题（按优先级）

1. **问题 2 的护栏边界**：`hasPendingAsk` 只看 BAF 自己的 ask-queue——平台层
   （ui-user-questions 之外的 ask_user_question 工具弹卡）挂起时仍会叠前置卡。
   实际重叠面小（BAF 模式下模型被指引用 baf_gate_ask），先观察。
2. **问题 3 的 chip 状态集**：`clipped`（bug-fix 裁剪行）与 `missing` 不显示。若客户
   想「看到没生成什么」，需要另一个展示语义（当前是「已生成产物」的正向清单）。
3. **问题 4 的模型侧残留回合**：撤销的是弹卡，模型**当前生成中**的回合仍会跑完——
   gate-ask 的终态说明保证它不会接着推流程，但客户会看到那一回合的自然收尾。
   若要硬停回合需要 agent 取消通道，超出本批范围。
4. **问题 5 的偏好作用域**：开关是设备本地（localStorage）。多端/桌面端各持一份，
   与轨迹图开关同款取舍；若要跟随账号需上 host 设置镜像。
5. auto-pop 前置卡在**多个并行会话**同工作区空闲时各自可弹（会话作用域判定）；
   isMoot 队头复查保证不会双开变更，最坏情况是两张卡短暂先后出现、第二张自动静默。

## 9. 【变更】验证结果（2026-09-30 web 端实测，全绿）

环境：`dsh web` 独立宿主（`node --import tsx/esm apps/cli/src/bin.ts web --no-open`，
3080 端口，host 经各包 `lib/` 加载本批构建产物）；验证工作区 `D:\Source\baf-codingplugin\demo\demo23v3`。
脚本与取证：`logs/probe-demo23-stageA.mjs`（RPC+zcat 取证）、`logs/ui-walk-demo23.mjs`（问题 2/3/4/5 全程）、
`logs/ui-walk-demo23-popup.mjs`（问题 4 会话页半边）；截图 `logs/uiwalk/*.png`、结论文本 `logs/uiwalk/findings*.txt`。

| # | 检查点 | 实测 |
|---|---|---|
| 1 | 标准预设会话 vs BAF 预设会话的 baf-welcome | baf：welcome-runs=1、gate 段存在；standard：welcome-runs=0、gate 段不存在 ✓ |
| 2a | 聊天消息弹前置卡，「只是聊天」关闭 | 弹卡 ✓；关闭后卡消失、0 变更 ✓ |
| 2b | 第二条消息**再**弹前置卡，「作为新需求开始」进流程 | 再弹 ✓；进入分类确认 ✓ |
| 3 | 放弃变更在总览显示已生成产物 | 「已生成产物」标签 ✓；`proposal.md` chip（状态角标「已填写」）✓；点击走右侧栏打开通道 ✓ |
| 4 | Tab 顶部按钮放弃后两个确认面同死 | Tab 顶部横幅消失 ✓；切回会话页弹窗连同「确认 · 完整流程」按钮消失 ✓；工作流页显示「已放弃」终态 ✓ |
| 5 | 设置·工作流开关 | placeholder 消失 ✓；「工作流页签」行出现 ✓；开关 true→false 页签立即隐藏 ✓；再开立即恢复 ✓ |

备注：问题 3 的产物由脚本在放弃后的变更目录落一个真实 proposal.md（该变更停在分类阶段、
本无产物；host 侧 `changeArtifactStatus` 按文件内容判「已填写」）。问题 4 的「模型下一回合不再
重弹」为 gate-ask 终态说明路径，无 API key 环境跑不了模型回合，由单测（ask-queue/gate-ask spec）覆盖。
