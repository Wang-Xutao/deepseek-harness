# demo6 十四问题修复全景（2026-09-24 需求 → web 实测 22/22 + 13/13）

需求来源：demo5 会话后追加的 14 条反馈（会话统计美化 / 影响范围落定 / 摘要样式 /
总览点击记录 / 完成卡 0 / 类型范围不更新 / 任务计数含义 / 置信度解释 /
输出格式统一 / 默认归属当前变更 / 刷新…常驻 / 底部模块 / 阶段详情增强 / 顶栏闪烁）。
离线 vitest：baf-workflow + baf-core 366/366，ui-baf-workflow 17/17，baf-roster 5/5；
`pnpm build:lib` 通过。真机探针 `apps/web/.demo6-check.mjs` **22/22 全绿**（含 demo5
回归 13 项中的 6 项），`apps/web/.demo5-check.mjs` 回归 **13/13**。种子工作区
`demo5-check`（变更 B 改为无关键词描述，验证类型/范围两个阶段落定），日志与截图在
`tmp/webwalk-demo6-check/`。

## 逐项修复

### 1. 会话统计美化（问题 1）
【变更】`WorkflowView.tsx` SessionStatsCard：三段（概览/工具/Tokens）各自一段
`checklistHead` 标题 + `statsGrid` 宽行键值对（两数字一行、tabular-nums 对齐、
合计高亮 accent），替代原六条单行 strip。实测三段三网格、数字对齐（D1）。

### 2. 影响范围随计划白名单落定（问题 2）
【变更】`pipeline.ts` `completeDocStage('plan')`：计划完成渲染 plan.md/tasks.md 的
同一事务里，若初判范围仍待定则从冻结白名单推导（1→单文件、≤3→局部小改、
否则跨模块）追加 `intake-settled`（reasonCodes `settled-at-plan`）。
【变更】`baf-core events.ts`：`intake-settled` 的 `kind`/`affectedScope` 改为可选
（各事件只落定自己携带且仍待定的字段）；`baf-workflow projection.ts` fold 逐字段
应用、replay 不再追加 reasonCodes。
【变更】`tab-view.ts`（baf-workflow）：载荷新增 `planAllowlist`（plan 完成后读账本；
终态回退归档目录）；rail 影响范围格显示「局部小改 · 白名单 2」，悬停列出全部文件
（D2，实测变更 B 计划完成即显示 局部小改·白名单 2）。

### 3. 摘要样式统一（问题 3）
【变更】摘要并入 `metaRow` 行式布局（键「摘要」+ `summaryText` 可换行值），与
模式/类型/影响范围同行式，不再是游离的 hint 段落（D3）。

### 4. 总览点击状态卡片看全部记录（问题 4）
【变更】`HistoryFlowModal`：画布下方新增 `historyRecords` 列（变更分类卡 + 阶段产物
`ArtifactRail`，每行可点开右侧栏查看，终态变更从归档目录读取）；画布占 60% 高、
记录区独立滚动（D4：分类卡 + ≥3 个可点开产物按钮实测）。

### 5. 完成卡 耗时/Tokens 不为 —（问题 5）
【变更】`FlowCanvas`：当前终态卡（完成/已放弃）显示变更总耗时/总 tokens
（`view.metrics` 总计，无归档用时显示 0s/0K）；非当前终态卡维持 已忽略+—（D5：
完成卡 5.8s/0K 实测）。

### 6. 类型/影响范围按阶段更新（问题 6）
【变更】`workflow-service.ts` `confirmIntake`：确认（分类卡点选路径）即落定类型
（bug-fix→缺陷、full-go→新需求，`settled-at-confirm`），不再等归档；范围在计划完成
落定（见 #2）；归档时双字段兜底落定保留（demo1 十问题 9 逻辑不变，`deriveIntakeSettlement`
改为可选字段事件）。实测：变更 B 确认后类型=新需求、计划完成后范围=局部小改（D6/D2）。

### 7. 「任务 12/12」含义（问题 7）
【变更】总览 tile 与行内进度改标签「计划任务」，悬停解释「plan.json 任务清单已勾选
数量（仅完整流程计数）」（D7 两项实测）。

### 8. 初判置信度解释（问题 8）
【变更】置信度悬停换 `intake.confidenceHelp`：命中关键词 70% / 无命中基准 40%、
只影响最初建议、路径由点选决定、两字段何时落定（D8 实测悬停含「基准 40%」）。

### 9. 状态切换输出格式统一（问题 9）
【变更】`presets/baf/agent.cordis.yml` persona（中英双份）：新增统一四行汇报骨架
【阶段】/【本回合做了什么】/【产物】(关键数字)/【下一步】，要求回合结束与阶段切换
时刻严格遵守、信息具体。模型行为属软约束（见剩余风险 1）。

### 10. 默认归属当前变更（问题 10）
【变更】persona + `gate-ask.ts` 工具描述（双份）：工作流进行中客户的每句话默认围绕
当前变更（补充/追问/微调直接处理，不询问是否新开）；只有明显无关的新工作才走
`baf_gate_ask(requirement=…)` 弹 active-conflict 卡；确需并行请客户新建会话/工作区
（一工作区一活动变更，§18.6）。语义判断在模型侧（见剩余风险 1）。

### 11. 「刷新…」常驻（问题 11）
【变更】根因是 dashboard effect 把 `dashboardBusy` 列入 deps 且在内部翻转 busy →
false→true→false 死循环（一直刷新一直显示）。改为 `loadDashboard` 回调 + 仅
`dashboardOpen` 翻转时触发；手动刷新复用同一回调且不清空旧数据（无闪烁）（D9：
打开 3s 后无 刷新… 残留）。

### 12. 底部模块（问题 12）
【变更】删除右侧栏底部通用 actions 卡（「启动 intake；确认前不写源码」+ 进入建立
变更/开始阶段/确认归档）：进入建立变更是分类卡自带的重试、门确认在顶部横幅+顶部条
（推进/放弃）、新建变更是空态工具条+对话。每个决策一个入口，都在页面上方（D10：
开始阶段 按钮不再出现）。

### 13. 阶段详情增强（问题 13）
【变更】`BilingualDetail` 统一结构（状态行→目标→前置→期望产物→完成条件→失败处理）
后新增两节：**通俗说明**（每阶段一段客户视角白话：谁在动、你在等什么）与
**常见失败与处理**（错误码 chip + 语义 + 处理，取自 error-codes.md 客户可行动子集；
implement 4 项、verify 3 项、open 3 项等）。验证阶段的 checklist 由既有
「本阶段清单」卡承载（todo/done 勾选态）。实测实现卡显示 scope_exceeded 等 4 条
速查（D11 两项）。

### 14. 顶栏刷新闪烁（问题 14）
【变更】顶栏手动刷新改走 `runSilent`（不翻转 busy），删除 busy 时的「刷新…」文本；
轮询/focus 刷新本就静默。点击刷新不再禁用整条顶栏按钮（探针难以断言视觉闪烁，
以代码路径为准：手动刷新不再触碰 busy 状态）。

## 验证矩阵

- `apps/web/.demo6-check.mjs`（22 项）：D1-D11（十四问题中可自动化断言的 11 项）+
  demo5 回归 C1/C2/C3/C4a/C4b×3/C5 —— 全绿，exit 0。
- `apps/web/.demo5-check.mjs`（13 项回归）—— 全绿，exit 0。
- 真机环境：`node --import tsx/esm apps/cli/src/bin.ts web --port 3347`（r24），
  工作区 demo5-check（探针只点「暂不推进」精确无操作标签）。
- 排障：workspace.json 被并行会话覆写（只剩 demo6）→ 重新注册 demo5-check 并重启
  host（注册表启动时读取）；顶栏切换按钮在已连接工作区时显示工作区名而非「选择
  工作区」，探针连接逻辑已适配。

## 剩余风险（按优先级）

1. **#9/#10 属模型软约束**：统一输出格式与「默认归属当前变更」写在 persona 与工具
   描述里，依赖模型遵循；无机器门禁兜底。若实测仍出现输出格式漂移或误弹
   active-conflict，下一步可在工单/派单文本里注入同款格式模板强化。
2. **「另开工作流→新会话」未自动化**：客户确认另开时只能引导手动新建会话（工具层
   无法从 baf_gate_ask 直接创建会话并注入需求）；active-conflict 卡文案已说明去处。
3. **fold 对历史日志的兼容**：`intake-settled` 改可选字段后，旧日志（双字段必填）
   回放不受影响（fold 逐字段应用）；新日志由三个写入点（确认/计划/归档）产生，
   单测覆盖 rely 于 vitest 全绿，但未加专门的分阶段落定用例——建议后续补
   `projection-intake.spec.ts` 用例。
4. **D5 断言较宽**：完成卡 metrics 的选择器会命中全部含「完成」文本的节点卡
   （各阶段卡状态含「已完成」），断言的是「被匹配卡均无 —」——完成卡本身（5.8s/0K）
   在列，通过；后续可收紧为按节点 title 精确匹配「完成」卡。
5. **挂载隔离测试失败（与本批无关）**：`packages/preset/agent-presets` 的
   mount/discovery 7 例失败（Windows symlink EPERM + 会话工具隔离），git 工作区
   未改这两个测试相关代码，baf-roster 5/5 通过；疑似环境/既有问题，待独立排查。

## 未改动但相关

- demo5 批次的全部修复保持不变（回归 13/13）。
- `deriveIntakeSettlement`（归档兜底）行为不变，仅事件字段可选化。
