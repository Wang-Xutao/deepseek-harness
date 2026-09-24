# 2026-09-22 · 四项 web 反馈修复：open 提案门 / 阶段耗时 / 弹窗排队 / 推进按钮管控

用户在 web 验收后报告四个问题（变更 170b 暴露的系统性漏洞，8028 归档产物齐全是幸存者偏差——模型配合时全对，不配合时无门拦截）：

1. **产物原则失守**：proposal/clarify/design/plan 等文档未生成也能推进工作流——「每阶段产物是下阶段前提，这是原则」
2. **阶段统计缺失**：工作流页面每阶段耗时和 tokens 统计不存在
3. **弹窗不排队**：下一问题弹窗覆盖上一问题，答完下一个上一个又弹出来
4. **推进按钮失控**：推进按钮一直可点，点了就推进，没有产物管控

投影取证（`tmp/zcat-session.mjs`，170b 的事件日志）：`open<-gate-card` 之后的 `clarify<-tab@00:57:21`、`design<-tab@00:57:52` 两次 **source:tab** 越权推进——模板态 clarify.md/design.md 未过门，Tab 按钮直接放行。这是四问题的交汇点。

---

## Fix D · open 阶段提案门（问题 1 的根因）

**根因**：open 是被遗漏的著述阶段——proposal.md 是它的产物，但 dueGateFor 对 open 无条件弹卡、无完成门、guard 禁写、AUTHORING_NODES 不含 open。模型不写提案，系统照样弹「推进」卡。

**修复**（产物是推进的前提，所有出口同判）：

| 文件 | 变更 |
|---|---|
| `packages/baf/baf-workflow/src/stages/gates.ts` | 新增 `proposalGate(input)`：bug-fix 路径短路 ok；文件缺 → fail + 「敲 /baf-go 安装模板」；templateOnly → fail 列 Why/Scope/Impact 缺项；无 `## Why` 节 → fail。容错正则 `^#{2,4}\s*(?:\d+[.)、]\s*)?Why\b[^\n]*$/im`（编号标题也算）。DOC_REQUIREMENTS_ZH 加 open 三条要求 |
| `packages/baf/baf-workflow/src/go-coordinator.ts` | case 'open' 重构为 `openRefusal()` async helper：confirm/ask/plain 三条出口全过门——fail 时 `wake({changeId, node:'open'})` + errorCard（原因/产物路径/缺什么/满足条件/下一步）。dueGateFor `case 'open'` 返回 undefined，改由 docAdvanceDue 文件感知 |
| `packages/baf/baf-workflow/src/orchestrator.ts` | docAdvanceDue 加 open case（proposalGate 过 → 'open-advance'）；authoringMissing 加 open case |
| `packages/baf/baf-workflow/src/stage-brief.ts` | AUTHORING_NODES +open（open/clarify/design/plan/implement）；demands.open = 写 proposal.md（Why+Scope+Impact、清 TODO 占位、粒度到客户能确认范围）；stageWorkRemains 加 open case——wake 链路接通，resting 在 open 且提案未写会排 follow-up 简报 |
| `packages/baf/baf-guard/src/policy.ts` | DOC_STAGES 后定向放行 `${changeDirRel}/proposal.md`（open 阶段只许写提案，不整体放开 open——防提前写 clarify.md） |
| `packages/baf/baf-workflow/src/gate-cards.ts` | open-advance 卡改为「提案已完成 · 请确认推进」，question 引 Why/Scope/Impact——这张卡只在过门后弹，是客户对产物本身的确认 |

**语义**：这张卡弹出即证明 proposal.md 已过门（提案完成 → 客户确认 → 进澄清），不再是裸的「下一步」点头卡。

## Fix E · 推进按钮就绪态（问题 4）

**根因**：Tab「推进」按钮只要存在 active change 就渲染、恒可点——170b 的两次 `clarify<-tab`/`design<-tab` 就是这么来的。

**修复**：

| 文件 | 变更 |
|---|---|
| `packages/baf/baf-core/src/tab-view.ts` | WorkflowTabView 加 `advance?: { ready: boolean; missing: readonly string[] }` |
| `packages/baf/baf-workflow/src/tab-view.ts` | 新增 `deriveAdvanceReadiness(cwd, changeId, status)`：与 /baf-go 跑**同一套文件门**（open→proposalGate、clarify/design/plan→各自门、implement→账本+implementGate、verify→completed、intake→confirmed）；terminal/drift → undefined；门读失败 fail-closed |
| `packages/client/ui-baf-workflow/src/client/tab-types.ts` | 客户端副本同步 advance 字段 |
| `packages/client/ui-baf-workflow/src/client/WorkflowView.tsx` | 按钮重写：ready → btnPrimary + advanceHelp tooltip；!ready → btnGhost + **disabled** + tooltip 带缺项清单；advance 缺失（空视图/旧形状）→ 不渲染。onClick 再守卫 `advance?.ready !== true` |

**语义**：点不到会被拒的推进——按钮与 /baf-go 同一判断，UI 不再是旁路。

## Fix F · 弹窗 FIFO（问题 3）

**根因**：`packages/client/ui-session/src/client/index.ts` 的 publishPendingInteractions 用 `precedence >= previous.precedence`——后到的同级 pending **替换**正在展示的那个；被顶掉的回到队列，settle 后再弹，客户看到的就是「覆盖→又弹出来」。

**修复**：`>=` → `>`。同级先到先展示（FIFO），settle 后下一个浮出；严格高级（plan-review=2）仍可抢占普通（1）。

## Fix G · 阶段耗时统计（问题 2 的数据面）

**根因**：`packages/client/ui-baf-workflow/src/index.ts` 的 getTabView/resume 传 `includeMetrics:false`（「让 Tab 画得快」）——metrics.ts 的 deriveWorkflowMetrics 本就产出 byNode durationMs + totals，UI 渲染位早已存在（strip 574 / 节点卡 870 / 详情 1661），纯粹是数据被关掉。

**修复**：去掉 includeMetrics:false。折叠是单 change 事件日志一遍 O(n)（几十条），比每次 paint 的 artifact-status 读还便宜。

**tokens 列为已知缺口**：usage 只存在于 live stream，session 帧无 usage 字段——需要 session-usage 持久化，另行立项（见剩余问题 #1）。

---

## 验证

- **单测**：370 项全绿（baf-workflow + baf-guard + ui-session；新增 proposalGate 4 态、open 越权拒绝×3、guard 定向放行、advance readiness 2 项、FIFO 2 项；35 项走过 open 的 fixture 补写 proposal 后修复）
- **build:lib**：exit 0 ×2；watcher 0 errors；host 重启带修复
- **web 真机（demo2，无侵入）**：strip 实测「BAF当前设计 模式完整流程 变更耗时112m21s 变更tokens—」+ 节点卡逐个耗时（2.8s/45ms/31.2s/111m47s）+ 推进按钮就绪态与 tooltip 正常（design.md 已过门 → 可点）；首卡即 170b 的「进入计划·请确认」（design-advance），点「暂不推进」零推进
- **web 真机（demo3 沙箱，change-20260922-feat-api-csv-6007）**：全回路通过——需求→初始化→新建工作流→确认完整流程→**模型著述 proposal（proposalState: authored）→「提案已完成·请确认推进」卡弹出（提案过门才弹，Fix D）→确认进 clarify（投影 `clarify<-gate-card`，非 tab 越权）→strip 推进按钮 disabled:true + tooltip 列三条缺项（Blocking questions 结论/Acceptance criteria/Non-goals，Fix E）**；at-open 时按钮可点（过门）与 at-clarify 禁用（模板态）对照成立；节点卡逐个耗时渲染（1.8s/36ms/5.9s，Fix G）。日志：`tmp/checkfix/log-demo3.json`

## 剩余问题（按用户可见度 × 修复成本排序）

1. **tokens 统计无数据源**（高可见/中成本）：session 帧持久化 usage 需要动 api 层——建议立项「session-usage 持久化 + metrics tokens 聚合」，当前 UI 如实显示 —
2. **workflow view 挂载门槛**（中可见/低成本）：新会话首个 agent 回合前「工作流」页签不出现（agentPreset face 未实体化）——属设计内行为，但首条消息后自动弹卡+页签出现的时序可再打磨
3. **170b 遗留状态**（低可见/零成本）：demo_2 的 170b 停在 design、产物已齐——按新门管控待用户自然推进或放弃即可，不做数据迁移
