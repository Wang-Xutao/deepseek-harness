# 2026-09-23 demo2 双问题批次：scaffold 后需求接续（指令驱动不再断流）+ 工作流页顶部决策按钮（全景图）

> 触发：客户在 `demo2` 工作区（会话「重构ecum模块」）测试暴露两个问题。本轮全部修复并加测试钉死；文末附剩余问题排序。
>
> 验证 = `pnpm build:lib` 零错误；`baf-workflow`+`baf-openspec`+`baf-core`+`ui-baf-workflow` **37 文件 / 377 用例全绿**（新增 requirement-park 8 项 + tab-pending-gate 3 项 + auto-pop 停靠断言）；oxlint 触达文件零新增。

---

## 0. 问题与根因（demo2 会话取证）

| # | 客户症状 | 根因 |
| --- | --- | --- |
| 1 | 未初始化工作区：首次 scaffold 弹窗点「暂不初始化」→ `/baf-go` 重弹（正确）→ 点「初始化工作区」后**流程死寂**——模型不触发、后续 `/baf-go` 也不再弹窗，只能靠打「继续」自救 | ① 需求原话只活在会话里：auto-pop 在未初始化工作区收到客户消息时只 `releaseOffer()`，不记忆文本；② `/baf-go` 的未初始化分支弹 scaffold → 点「初始化」→ `driveScaffold` 返回成功卡后**就地结束**，没有接续到下一个决策（新建工作流 → 分类确认）；③ 此后 baseline 已存在 + 无活动变更 → `/baf-go` 只回「没有进行中的工作流」平面卡，无弹窗无派单——指令面永久失效；④ 附带发现：**分类确认（任何面）落地后无人唤醒模型**——`driveGateResolve` 的 classify 分支只跑 `driveClassify`，full-go-path 落在 open 模板 rest、bug-fix-path 落在 open（一步之遥的回归测试台账），模型 idle 时全场沉默（auto-pop / orchestrator 回合末弹窗 / Tab 按钮全中招；只有 gate-ask 中途调用时模型醒着所以没暴露） |
| 2 | 会话里推动流程的指令/弹窗（初始化工作区、完整流程/缺陷修复路径选择）没有在工作流页面（Tab）顶部以按钮形式同步出现；会话与工作流状态要同步 | scaffold 门已有 Tab pendingGate 卡但分类选择**完全没有 Tab 按钮**（rail 里那张卡埋在右侧栏）；门 A/B（design-confirm / verify-archive）的选项按钮也只在 rail 底部；客户要求「合适时间在页面顶部出现对应按钮」 |

## 1. 修复明细

### 1.1 [#1a] 停靠需求记忆：`requirement-park.ts`（新文件）

【变更】[requirement-park.ts](../../../../packages/baf/baf-workflow/src/requirement-park.ts)：宿主面模块级 Map（会话键 → 客户原话），三个动作：

- `parkRequirement(sessionKey, text)`——auto-pop 在**未初始化**工作区收到真实客户消息时停靠原话（原来只 `releaseOffer()`）；工作区初始化后的下一条真实消息**反选**（clear——新陈述接管，预问卡/活动变更接手后续决策，旧停靠不得借 `/baf-go` 还魂）。
- 生命周期：暂停（关掉新建确认框）→ **保留**（`/baf-go` 重弹，与既有「下次 /baf-go 重弹」话术一致）；点「暂不处理」→ 清除；铸造成功 → 清除；工作区出现活动变更 → 清除（冲突/推进流接管）。进程内记忆（与 focus 缓存、派单账本同类），host 重启即忘——代价只是重述一次需求。
- `continueParkedRequirement(ctx, agent, cwd, adapters?)`——**接续链**：有停靠 + baseline 存在 + 无活动变更 → 弹 `new-workflow`（note 引用客户原话）→ 点「新建」→ `beginIntake` 单一铸造 → 弹 `intake-classify`（带判定摘要 §22.17 I）→ 点选经 `driveGateResolve`（携带本会话派单通道）解析——后续由 1.2 的跟进派单唤醒模型。四个客户动作面在初始化落定后调用它：

| 调用面 | 位置 | 行为 |
| --- | --- | --- |
| typed `/baf-go`、`/baf-go-confirm` | [commands.ts](../../../../packages/baf/baf-workflow/src/commands.ts) | driveGo 返回后调用；有接续卡则与原卡合并返回（`/baf-go-confirm` 的接续**仍弹新建确认卡**——spec §1：创建决策必须落卡，confirm 模式也不例外） |
| orchestrator 回合末 scaffold 弹窗 | [orchestrator.ts](../../../../packages/baf/baf-workflow/src/orchestrator.ts) ① | popGate（scaffold）后调用；点「暂不初始化」时 baseline 仍缺 → no-op |
| Tab「初始化工作区」按钮 | [ui-baf-workflow/index.ts](../../../../packages/client/ui-baf-workflow/src/index.ts) gateResolve | `scaffold + init` 解析后调用；接续卡只记日志（remote 契约是返回刷新后的视图），弹窗落在会话里 |

**demo2 全链路（修复后）**：说需求（停靠）→ scaffold 弹窗 → 暂不 → `/baf-go` 重弹 → 初始化 → **系统自动弹「新建工作流」（引用原话）** → 新建 → 分类确认弹窗 → 确认·完整流程 → open 模板装好 → **工单派发，模型开始填 proposal.md** → 回合结束 → orchestrator 弹 open-advance……全程卡片驱动，一次指令都不用再敲。中途任何一步关掉弹窗，`/baf-go` 都能重弹（停靠保留 / `gate=intake-classify` 显式回门 / 门条件仍在的 pendingGate）。

### 1.2 [#1b] 分类确认后必派单：resolveGateDispatch classify 分支跟进

【变更】[command-drives.ts](../../../../packages/baf/baf-workflow/src/command-drives.ts) `resolveGateDispatch` 的 `/baf-workflow-classify` 分支：confirm 类选项 + `driveClassify` 成功 + 调用方带 `dispatch` → **跟进一次 `driveGo`（`dispatchOrigin:'customer'`，`change=` 已知时携带）**。协调器路由到确认后落地的 authoring rest：full-go-path → open 的 proposal 裁决门拒绝卡 + open 工单；bug-fix-path → 进入 implement + implement 工单（见 1.3）。模型在跑时 dispatcher 报 busy、不排单——gate-ask 中途调用的原语义零变化。一处修复覆盖**所有**分类确认面：对话框点击（coordinator resolveViaDialog / orchestrator 回合末 / auto-pop / gate-ask）、Tab 顶部与 rail 的分类按钮、接续链。返回卡 = 分类确认卡 + 跟进卡合并。

### 1.3 [#1c] bug-fix open→implement rest 补派单点

【变更】[go-coordinator.ts](../../../../packages/baf/baf-workflow/src/go-coordinator.ts) `route` case `open` 的 bug-fix 分支（`advanceOpen`）：原来 `enterImplementStage` 后裸卡返回，是六问题批（2026-09-23 #1）漏掉的第五个派单点——现在同样 `dispatchParts(dispatchWorkOrder('implement', …))`（先写回归测试 + allowlist 纪律）。

### 1.4 [#1d] Tab transition 面的同类唤醒

【变更】[ui-baf-workflow/index.ts](../../../../packages/client/ui-baf-workflow/src/index.ts) `transition` remote 的 `case 'open'`（「进入建立变更」重试路径）：confirm 成功且有活 agent → 跟进 `driveGo`（tab/gate-card 源 + customer origin）落 rest 派单——堵住 Tab 确认-却-沉默的最后一条缝。

### 1.5 [#2a] Tab 顶部决策按钮：intake-classify pendingGate + 门 A/B 横幅

**数据**：【变更】baf-core [tab-view.ts](../../../../packages/baf/baf-core/src/tab-view.ts) `WorkflowTabPendingGate` 扩为 `gateId: 'scaffold' | 'intake-classify'` + `changeId?` + `detail?`（判定摘要行）；【变更】baf-workflow [tab-view.ts](../../../../packages/baf/baf-workflow/src/tab-view.ts) 新 `attachIntakePendingGate`——聚焦变更停在 intake 且（未确认 / clarify-required）时挂 change 级 pendingGate（选项 = 注册表 confirm-full / confirm-bugfix / reject 原样；detail = 系统初步判断 + 需求摘要）。停靠点判断与 `dueGateFor`/`explicitGatesFor` 同一条规则——Tab 按钮与会话弹窗**构造性同拍**。`attachWorkspaceGates` 改为 scaffold 优先（无 baseline 时环境门盖过分类门），否则保留视图已带的分类门。

**渲染**：【变更】[WorkflowView.tsx](../../../../packages/client/ui-baf-workflow/src/client/WorkflowView.tsx)：

- pendingGate 卡（strip 正下方）：分类门用自己的标题 + detail 逐行渲染；点击带 `changeId` 走 `gateResolve`；`confirm-bugfix` 裸点（未填五字段）的 tooltip 提示先填右栏表单。
- **新门 A/B 顶部横幅**：`view.gate`（design-confirm / verify-archive）在页顶渲染 question + 选项按钮（`gateResolve` 派发；verify-archive 的 confirm 走 §13 R1 破坏性确认 modal，与 rail 主按钮同规）。rail 原按钮保留（横幅是顶部对位面，不是替换）。
- rail 的分类按钮（确认·完整流程 / 确认·缺陷修复路径 / 拒绝 / clarify-required 救援）与 **bug-fix 五字段表单**全部改走 `gateResolve('intake-classify', …)`——表单值经 `bugFixExtraArgs`（客户端版 `kv` 引号规则）作 `extraArgs` 随点选提交（§22.17 J），且点击自动获得 1.2 的跟进派单。原 `transition('open')` 通道只留给「进入建立变更」重试（该路径由 1.4 唤醒）。
- 【变更】[types.ts](../../../../packages/client/ui-baf-workflow/src/types.ts) `BafWorkflowGateResolveRequest` 加 `extraArgs?: readonly string[]`（typert wire 直通，无需协议改动）；host gateResolve 透传给 `driveGateResolve` opts。

**同步**：出现/消失由既有投影推送（mint → 200ms 去抖刷新出现；classify-confirm → 消失）+ 2s 可见轮询兜底；scaffold 门无投影事件，靠轮询/聚焦刷新（与现状一致）。点击全部落同一投影面，回推刷新让会话与页签收敛到同一停靠点。

## 2. 测试（as-built，全绿）

- **新** [`requirement-park.spec.ts`](../../../../packages/baf/baf-workflow/tests/requirement-park.spec.ts) 8 项：demo2 全链路（停靠 → 初始化 → 新建 → 分类确认 → **工单送达**，断言订单文本含【BAF 工单】、变更落 open、停靠已清）；暂不处理清停靠；关框保留停靠（卡含 /baf-go 提示）；分类关框落 intake + `gate=intake-classify` 提示；无停靠/未初始化/忙工作区三 decline（忙清停靠）；模型 running 零排队（中途对位）；park/clear 原语；**bug-fix confirm+extraArgs 直连 resolve 通道** → 落 implement + 工单送达。
- **新** [`tab-pending-gate.spec.ts`](../../../../packages/baf/baf-workflow/tests/tab-pending-gate.spec.ts) 3 项：待确认分类 → pendingGate（gateId/changeId/三选项原序/判定 detail）；setIntakeMode+确认后 → 无门；无 baseline → scaffold 优先。
- [`auto-pop.spec.ts`](../../../../packages/baf/baf-workflow/tests/auto-pop.spec.ts)：未初始化消息**停靠**断言；pristine 首跑——初始化后重述**反选**停靠。
- 全量：37 文件 / 377 项（原 366 + 新 11）全绿——gate-dialog §22.17 组、go.spec 派单组、orchestrator、e2e-acceptance 均未动断言而通过（classify 跟进对无 dispatch 的调用面零影响）。

## 3. 验收命令

```bash
npx vitest run packages/baf/baf-workflow/tests packages/baf/baf-openspec/tests packages/baf/baf-core/tests packages/client/ui-baf-workflow/tests
pnpm build:lib
npx oxlint packages/baf/baf-workflow/src packages/client/ui-baf-workflow/src
```

真机验收建议（demo2 重放）：新会话说需求 → scaffold 弹窗暂不 → `/baf-go` 重弹 → 初始化 → 观察系统自动弹「新建工作流」（note 引用原话）→ 新建 → 分类卡 → 确认 → 会话出现 `/baf-go 派单` 只读条目且模型开始填 proposal.md；工作流页签顶部应在分类待确认时出现三按钮、门 A/B 时出现确认横幅。

## 5. Web 真机复测返工（2026-09-23 10:00，第二轮）

> 复测取证：demo1 会话 jsonl（09:39–09:43）时间线还原——gate-ask 中途弹 scaffold（点暂不）→ **回合末 orchestrator 又弹同一张**（点暂不）→ `/baf-go` 重弹（这次点了初始化，scaffold 成功）→ **接续链没跑** → 后续 `/baf-go` 永远「没有进行中的工作流」。两个新根因：

### 5.1 【根因】tsdown 按 preset 入口独立打包 → 模块级单例每 bundle 一份

`auto-pop.js` / `commands.js` / `orchestrator.js` / `gate-ask.js` / Tab remote 的 `index.js` 各自内联整棵依赖树——`requirement-park` 的 PARKED Map、`session-focus` 的 focus 缓存、`begin-intake` 的 mint 锁与 lastRequirement、`go-dispatch` 的 SENT 账本、`ask-queue` 的会话队列，全部在跨 bundle 时**各看各的拷贝**。本轮停靠记忆写读分属两个 bundle，硬失败；此前派单账本回合重臂、R1 双铸锁、R2 弹窗单飞在 web/desktop 打包形态下也一直隐性失效（单测全走同一模块实例所以看不见）。

【变更】新文件 [host-memory.ts](../../../../packages/baf/baf-workflow/src/host-memory.ts)：`sharedHostMap/sharedHostSet` 锚定 `globalThis`。上述五处单例全部改锚（PARKED、focusByCwd、locks+lastRequirement、SENT、ask queues）。回归测试：requirement-park.spec「bundle-split regression」——用 `import('…?bundle-copy')` 造第二个模块实例（同 globalThis 不同模块态）钉死共享性。

### 5.2 【根因】orchestrator 的 scaffold「每会话一次」只数自己弹过的

中途 gate-ask 的 scaffold 弹窗不进 orchestrator 的 SCAFFOLD_SEEN → 回合末立即重弹同一问题（复测症状①）。

【变更】新文件 [scaffold-offer.ts](../../../../packages/baf/baf-workflow/src/scaffold-offer.ts)：共享标记（host-memory 锚定），由 `askGateDialogQueued`——一切 scaffold 弹窗的唯一咽喉——在**解析后**记录（弹窗确实渲染过，或 duplicate 让位给在飞的那张；入队时记录会自噬 orchestrator 自己的队首 moot 检查，已踩掉）。orchestrator ① 改查共享标记（SCAFFOLD_SEEN 删除，resetOrchestrator 清共享标记）。`/baf-go` 重弹不受标记约束（客户的显式复活路径）。测试：orchestrator.spec「他渠道弹过 → 回合末不重弹」+ requirement-park.spec「咽喉点记录」。

### 5.3 第二轮验证

全量 37 文件 / **380 用例**全绿（+3：bundle-split 共享 / 咽喉点记录 / 他渠道抑制）；`pnpm build:lib` 零错误；产物确认 `lib/auto-pop.js`、`lib/commands.js` 均含锚点引用。web host 已重启（3080，token 已换新）。

### 5.4 第三轮（demo3，10:10–10:30）：统一「取消后 /baf-go 重弹」规则

> 复测确认：scaffold 弹窗逻辑已正确（取消→/baf-go 重弹→确认推进）。新报告：「新建工作流」弹窗点暂不后 /baf-go 无法重弹。demo3 会话取证：10:09:35 初始化成功 → 接续弹出新建确认 → 客户点**暂不处理** → 停靠被清（第二轮设计的「显式暂不=丢弃」）→ /baf-go 死卡。

**全弹窗 × 取消重弹矩阵审查**：scaffold / intake-classify（待分类）/ bind-workflow / open·clarify·design·plan-advance / design-confirm / verify-archive / resume 本就满足（route 每次重弹）；缺口两处——new-workflow（暂不清停靠）与 active-conflict（忙工作区直接清停靠）。

【变更】[requirement-park.ts](../../../../packages/baf/baf-workflow/src/requirement-park.ts) 统一规则——**停靠只在需求真正落定时清除**：铸造成功 / 冲突卡点「继续推进现有变更」/ 被更新陈述取代；**两种取消形态（关框、点暂不处理）都保留**，/baf-go 重弹同一决策。忙工作区不再丢弃停靠：改为弹注册表 **active-conflict**（note 引用原话与现有变更进度）——「继续推进现有变更」驱动现有变更并清停靠；「放弃现有变更」腾出工作区后**同一次 /baf-go 内直接续走新建→分类链**（gate-ask bootstrap 同款舞步）；「暂不处理」/关框保留停靠。接续卡文案与 new-workflow 注册表 hold 提示统一带「再敲 /baf-go 可重弹」。gate-cards.spec 的「无斜杠广告」断言放宽为 `→ /baf-`（选项派发命令形状）不出现——复活提示不算广告。

**测试**：requirement-park.spec 13 项（暂不保留停靠 / 冲突弹窗重弹 / 放弃→续走创建链（断言 terminal=abandoned + 新变更落 open + 工单送达）/ 推进→清停靠）。全量 37 文件 / 383 用例全绿；build:lib 零错；host 已重启。

## 6. 剩余问题（第三轮后修订）

1. **顶部 bug-fix 裸点确认的报错形态**（高可见 · 低成本）：未填五字段点顶部「确认 · 缺陷修复路径」→ host 返回缺项错误卡 → 前端 strip 长文本报错。tooltip 已提示；更优做法是把五字段表单搬进顶部卡。
2. **new-workflow / active-conflict / bind-workflow 无 Tab 对位按钮**（中可见 · 中成本）：停靠接续弹窗与冲突/接手门只在会话里弹；pendingGate 数据面已就绪，缺宿主派生与渲染。
3. **scaffold 门 Tab 状态只靠轮询**（低可见 · 低成本）：空工作区无投影事件，推送不可用。
4. **停靠记忆进程内**（低可见 · 低成本）：host 重启即忘；跨会话不共享。
5. **orchestrator 回合末不主动接续停靠**（低可见 · 低成本）：交给 `/baf-go`（防骚扰考量）。
6. **classify 跟进对 gate-ask 中途调用的卡内噪音**（极低可见 · 极低成本）。
7. **其余 bundle-态隐性差异**：`session-gate` 的探针缓存在 baf-session-gate.js 与 commands.js 两份拷贝（只损失缓存，无正确性影响）；orchestrator 的 OFFERED 台账单 bundle 内自洽（gate-ask/auto-pop 不读它）——如未来他面需要读，须同样上锚。
