# 2026-09-23 六问题批次：门确认自续 / plan 原子渲染 / 阶段 token / focus 死端 / 归档终态 / 变更总览（全景图）

> 触发：客户在 `demo1`（工作区 `D:\Source\baf-codingplugin\demo1`，变更 `change-20260922-ecum-78ce`）完整走完一轮工作流后报 6 个问题。本轮全部在真机复现取证后修复；文末附剩余问题排序。
>
> 验证 = `pnpm build:lib` 零错误（含 baf-core/baf-workflow/ui-baf-workflow 新契约）；`baf-workflow`+`baf-openspec`+`baf-core` **35 文件 / 366 用例全绿**（新增派单 origin/confirm 组 + 账本回合重臂 + 终态 focus + token 归因 4 组）；`ui-baf-workflow` 17 项；touched 文件 scoped oxlint 零新增。真机验收 walk：`apps/web/.demo1-verify-walk.mjs`（产物 `tmp/webwalk-demo1-verify/`）。

---

## 0. 根因一览（全部真机取证）

| # | 客户症状 | 根因 | 取证 |
| --- | --- | --- | --- |
| 1 | 确认推进的选项点完「没反应」，模型停 | 门确认走 `driveGateResolve(source='gate-card')`，红线只允许 typed-slash 派单 → 确认后装好模板无人唤醒模型；派单账本**回合结束不重臂**，同缺口永久「已派单 · 等待补齐」而模型 idle | 复现 walk：点击后 90s `model-woke: false`；客户会话 seq 395/397 两次 dedupe + seq 398 「继续」才解 |
| 2 | plan.json 完成后 plan.md 还是模板 | planGate 只裁 plan.json；plan.md 是模板装出后无人管的「人脸」 | gates.ts / plan.ts 源码 |
| 3 | 流程图无每阶段 token 消耗 | `deriveWorkflowMetrics` 只算 duration，token 归因从未落地（注释明说 TODO） | metrics.ts |
| 4 | `/baf-status` 后 `/baf-go` 卡死 | ① 过期 focus 绑到**已终态**变更 → 「当前变更已终态」死端（status 用词法末位所以显示正常，两命令各说各话）；② 账本不重臂（同 #1b） | 复现：status 显示 clarify、紧随的 go 报「已终态」 |
| 5 | 归档确认后卡在归档、旧节点不可点 | 后端归档**成功**（journal seq 27-28 change-archived/completed）——卡的是 Tab：终态节点被硬编码不可点；产物读取只看活目录（归档移动后全部「尚未生成」）；Windows rename 遇文件句柄 EPERM 无重试会真卡 archive 态 | demo1 journal + WorkflowView/onCardActivate + gates.readArtifact |
| 6 | 变更总览只是 id 列表 | 现有 modal 仅 `view.changes` 三字段 | WorkflowView.tsx:1325（改前） |

## 1. 修复明细

### 1.1 [#1a] 门确认即派单：`dispatchOrigin: 'customer'`

【变更】[go-dispatch.ts](../../../../packages/baf/baf-workflow/src/go-dispatch.ts) 新增 `DispatchOrigin = 'customer'`。coordinator 的守卫从 `source==='slash' && !confirm` 改为 **`dispatchOrigin === 'customer'`**：`dispatch` 不带 origin 一律 inert——orchestrator 的 verify 自动驱动复用同一 driveGo 面也永远派不了单。

带 origin 的客户动作面（全部在有活 agent 处构建 dispatcher）：
- typed `/baf-go`、`/baf-go-confirm`（commands.ts——**confirm 现在也派**：客户敲的就是授权）；
- 对话框选项点击：orchestrator `popGate` 解析、`popBind`、auto-pop 分类确认、gate-ask（active-conflict「继续推进」/分类确认）、coordinator `resolveViaDialog`、bind-workflow 选择；
- Tab 点击：`advance`（推进按钮）与 `gateResolve`（门卡选项）远端。

`driveGateResolve` 的 opts 增加 `dispatch`，内部 `/baf-go` 与 `/baf-go-confirm` 再派发时透传 + 盖 origin 章——推进门（open/clarify/design/plan-advance 走 `/baf-go-confirm`）点击 → 装模板 → **当场派单**，红线语义保持「无客户动作不派单」。

### 1.2 [#1b] 派单账本回合重臂 + OFFERED 指纹带产物签名

【变更】`go-dispatch.ts`：新增 `expireDispatchLedger(cwd)`；orchestrator 在每个**完成回合**的 turn/end 先清该工作区账本。语义变为「去重 = 这一单还在排队/在飞」：被派回合结束后缺口仍在 → 客户再敲 `/baf-go` 重派新单（模型已错过一次，重发是正确行为而非刷屏）；回合内连敲仍去重。

【变更】[orchestrator.ts](../../../../packages/baf/baf-workflow/src/orchestrator.ts)：popGate 的 OFFERED 指纹从 `v${projectionVersion}` 扩为 **`v${version}:${artifactSize}-${mtimeMs}`**（`artifactFingerprintOf`，仅 open/clarify/design/plan/implement 五节点）。模型填产物不写 projection 事件，版本不动 → 曾被 pause 的推进门永不重弹的缝被产物签名补上。

### 1.3 [#2] plan.md 由 plan.json 渲染（原子绑定）

【变更】[plan.ts](../../../../packages/baf/baf-workflow/src/stages/plan.ts) 新增 `renderPlanMdFromLedger`：读 plan.json → 渲染任务表（含 ✅/⬜ done 态）+ allowlist，头部注明「本文档由 plan.json 账本自动渲染（单一数据源）」。挂点：pipeline `completeDocStage('plan')` 完成时、`completeStage('implement')` 后（done 落定再刷一遍）。**plan.json 是唯一裁决源，plan.md 是它的渲染脸**——同一转换里生成，永不出现「账本完成而文档还是模板」，两文件构造性一致。渲染失败容忍（门已裁过账本，文档刷新不许回滚完成的阶段）。

### 1.4 [#3] 每阶段 token 归因

【变更】[metrics.ts](../../../../packages/baf/baf-workflow/src/metrics.ts)：`deriveWorkflowMetrics(events, nowMs, usagePoints)` 按阶段时间窗归因 token。数据通路：会话事件自带 epoch-ms `time`、`assistant/message` 自带该步 `usage` → Tab 远端 `readSessionUsagePoints`（经 `ctx.sessionQuery.observeSession` 冷读，不唤醒不修复；服务缺失/失败降级空表）+ `stat` revision 缓存（轮询只在日志增长时重折）。`buildWorkflowTabView` 增加 `usagePoints` 选项；节点卡既有 `card.tokens` 槽位直接点亮，`totals` 补 `totalInput/OutputTokens`。归因规则：usage 事件落进哪个 `[stage-entered, 下一窗口)` 窗口就算哪个阶段；跨回合边界算结束侧；intake 前的前导回合不归因（by design）。

### 1.5 [#4] 终态 focus 不再死端 + /baf-status 同源选择

【变更】[go-coordinator.ts](../../../../packages/baf/baf-workflow/src/go-coordinator.ts) `resolveBinding`：focus 仍活动 → 直接绑；focus 已终态**且还有活动变更** → 落到活动挑选（lone-active 直绑）；仅当无任何活动变更时才绑终态 focus（出「已终态」卡——客户需要知道他的工作流结束了）。

【变更】[commands.ts](../../../../packages/baf/baf-workflow/src/commands.ts) `/baf-status`：选择器从词法末位改为与 driveGo 同源（focus-活动 → lone active → 最新活动 → 全终态时最新一条）。status 与紧随的 go 永远指向同一条变更。

### 1.6 [#5] 归档终态可见 + 产物归档回读 + rename 重试

【变更】[WorkflowView.tsx](../../../../packages/client/ui-baf-workflow/src/client/WorkflowView.tsx)：流程图**全部节点可点**（含 completed/abandoned——选中只开详情面板，从不驱动转换）；`tabIndex=0`+键盘可达。
【变更】[gates.ts](../../../../packages/baf/baf-workflow/src/stages/gates.ts)：`readArtifact` 活目录失败回读 `openspec/changes/archive/<id>/`；`changeArtifactStatus` 行路径跟随文件实际位置——rail 的打开按钮归档后仍有效。
【变更】[adapter.ts](../../../../packages/baf/baf-openspec/src/adapter.ts)：archive 的 `rename` 对 EPERM/EBUSY/EACCES 重试 4 次（400ms 递增）——Windows 下编辑器/监视句柄通常一两秒放手，不再把变更滞留在 archive 态。
归档后的「进入完成」由折叠既有行为承担（change-archived → current=completed）；本条修复的是 Tab 看不见 + 文档失联 + 偶发移动失败三个真凶。

### 1.7 [#6] 变更总览 dashboard（样式/数据参考 rpamis/comet 的 opencode dashboard）

【变更】数据：baf-core 契约 `WorkflowDashboardRow/View`（types 子路径导出）；[dashboard.ts](../../../../packages/baf/baf-workflow/src/dashboard.ts) `buildWorkflowDashboard(store)`——每条变更一行（阶段、任务 done/total、duration、token，任务数活目录+归档目录双读），摘要四数（active/archived/abandoned/tasksDone/Total），全部 best-effort。远端 `@Remote('dashboard')`。
【变更】UI：modal 重写为 comet 式布局——头部（标题+刷新+关闭）、四枚统计 tile（进行中变更 / 任务 done÷total / 完成率+进度条 / 已归档）、「进行中的变更」表（每行：id、模式+阶段 pill+结束时间、任务进度条、耗时、token、「查看工作流」整行点击聚焦）、「归档历史」表（终态行同结构，点击聚焦后 rail 从归档目录读产物——与 #5 打通）。CSS：`.dashboardTiles/Tiles/Tile/TileBar/Section/Phase/RowMetrics/Progress*`；面板加宽 520→680。

## 2. 测试（as-built，全绿）

- `go-dispatch.spec`：新增「回合到期重臂（仅本工作区）」；其余 15 项原样通过（回合内去重语义不变）。
- `go.spec` 派单组：全部 dispatch 调用补 `dispatchOrigin:'customer'`；「confirm/Tab/gate-card 零派单」改为「**Tab 点击带 origin 派单**（客户动作）+ **gate-card 无 origin 零派单**（宿主内部复用面永远 inert）」；新增「confirm 模式派单（客户敲的命令）」「终态 focus + 活动变更不死端（abandon 后 beginIntake 第二条 + driveGo 不出「已终态」）」。
- `metrics.spec`：新增 token 窗口归因（前导回合不归因、跨阶段各归各）与 T11 重入多窗口两用例。
- 全量：`npx vitest run packages/baf/baf-workflow/tests packages/baf/baf-openspec/tests packages/baf/baf-core/tests`（35 文件 366 项）+ `packages/client/ui-baf-workflow/tests`（4 文件 17 项）。

## 3. 验收命令

```bash
npx vitest run packages/baf/baf-workflow/tests/go.spec.ts packages/baf/baf-workflow/tests/go-dispatch.spec.ts packages/baf/baf-workflow/tests/metrics.spec.ts
npx vitest run packages/baf/baf-workflow/tests packages/baf/baf-openspec/tests packages/baf/baf-core/tests packages/client/ui-baf-workflow/tests
pnpm build:lib
npx oxlint packages/baf/baf-workflow/src packages/baf/baf-openspec/src packages/client/ui-baf-workflow/src
```

真机验收（demo1，clarify 停靠起步，2026-09-23 18:39 完成）：`node apps/web/.demo1-verify-walk.mjs <token-url>`（产物 `tmp/webwalk-demo1-verify/`）。**全链路走通**：

```text
/baf-status → /baf-go（issue #4：不卡死）→ 派单 → 模型补 clarify.md → 回合结束
→ 进入设计卡 → view-switch + 点击 → clarify→design + 派单（issue #1a，session store 有工单+turn 证据）
→ …… → plan 派单回合（模型补 plan.json）→ 进入实现卡 → 点击 → implement
→ /baf-go 派 implement 工单 → turn 3（11 步）裁决门全过 → verify → 门 B
→ 点击 确认归档 → current=completed（seq 20）+ 目录移入 openspec/changes/archive/（issue #5）
→ 工作流页：strip「当前 完成 · 耗时 179m31s · 会话 tokens 941K」；11 个目录节点全部 tabIndex=0 可点（issue #5b）
→ 归档目录 plan.md 头部「本文档由 plan.json 账本自动渲染」+ ✅ 任务行（issue #2）
→ 变更总览 modal：tiles [0, 11/11, 100%, 2]，进行中（0）+ 归档历史（2）两节、4 行（issue #6）
```

补充两个真机暴露、随后修掉的洞：
- **clarify→design 与 plan→implement 的推进是裸卡**（不走 prepareDoc）——issue #1 的派单点漏了这两处；真机 18:01 点击后 90s 无 turn 取证后补上 `dispatchParts(dispatchWorkOrder(...))`（单测「answered advance DIALOG」两跳覆盖）。
- **账本必须按会话分账**：第一轮探针的工单停在场外会话 A（turn 停在提问卡上），新会话 B 的 /baf-go 被去重死锁——key 加 session 段（`sessionKeyOf`）后 18:16 一敲即派（session store seq 91 工单 + turn/start 证据）。

## 4. 剩余问题（按优先级）

0. **plan 回合结束后裁决卡未自动弹（观察到一次）**：18:19 plan 派单回合完成后的 ~6 分钟里 turn-end pop 未出现，靠下一次 /baf-go 兜出「进入实现」卡（自愈）。随后 implement→门 B 的 turn-end pop 正常弹出。未定位到根因（OFFERED 指纹已含产物签名；无相关 host 日志可查）——若复现，优先查 orchestrator turn/end 的 catch 分支日志与 ask 队列的 stale 项。

1. **token 归因的时间窗粒度**：usage 事件按自身 time 落窗，跨阶段长回合归到结束侧；会话日志缺失 usage（部分适配器）时显示「—」。可接受；严格化需把 checkpoint 落进 projection 契约（暂不做）。
2. **`usageCache` 进程内**：host 重启后首刷重折全日志（一次性成本，正确性无影响）。
3. **dashboard 无翻页/筛选**：变更极多时一屏滚动；comet 参考亦有边界，后续按需加。
4. **门确认即派单放宽了原红线表述**：现语义为「无客户动作不派单」（typed slash / 对话框点击 / Tab 点击均可派），enterprise-workflow §22.1 段落已同步改写；若客户后续要求回收紧门，去掉非 slash 面的 origin 盖章即可（单点开关）。
