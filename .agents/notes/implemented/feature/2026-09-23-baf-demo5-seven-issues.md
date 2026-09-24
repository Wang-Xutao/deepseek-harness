# demo5 七问题修复全景（2026-09-23 需求 → 09-24 web 实测 13/13）

需求来源：demo5 工作区会话回放。所有修复合入 baf 分支工作区（未提交），
离线 366 测试通过，`pnpm build:lib` 通过，Playwright 真机探针
`apps/web/.demo5-check.mjs` 对 3347 端口 host 13/13 全绿（种子工作区
`D:\Source\baf-codingplugin\demo\demo5-check`，探针日志与截图在
`tmp/webwalk-demo5-check/`）。

## 验收矩阵（探针检查项 → 用户问题）

| 检查 | 问题 | 结果 |
| --- | --- | --- |
| C1 阶段清单中文 | #7 | PASS zhHits=3，无英文回落 |
| C2 已执行阶段无 — | #2 | PASS 已完成/进行中节点全为实数或 0 |
| C3 rail 有 verify.md 无 verify-report.json | #3 | PASS |
| C4a plan.json 已填写（计划账本先行） | #1/#4 | PASS |
| C4b 弹窗卡 = plan-advance 且提到 tasks.md | #1/#4 | PASS |
| C4b 确认前 rail 已是 plan.md 已填写 + tasks.md 已计划 | #1 | PASS |
| C5 历史流程图模态 5s 后仍在、总览未被子模态顶掉 | #5 | PASS |
| C5 历史模态含全部节点与冻结耗时 | #5 | PASS |
| C6 会话统计 概览/工具/Tokens 三段 | #6 | PASS |

---

## 1. 计划产物未生成就弹「推进到实现」（问题 #1、#4）

**现象**：计划阶段完成时 plan.md/tasks.md 仍是未填模板，用户点「推进到实现」后产物才突然更新——卡片与 rail 自相矛盾。

**根因**：两条弹窗路径都只做「门检查通过即弹」，没人先落 stage-completed 事件并渲染产物：
- 回合结束自动弹窗 `orchestrator.ts popDueGate`：`dueGateFor` 只读 projection 标记，作者写完 plan.json 后 `nodes.plan` 仍 in-progress，弹窗与模板态并存。
- `/baf-go` 路径 `go-coordinator.ts`：`prepareDoc` 在弹窗前没有 completeDocStage。

【变更】`orchestrator.ts` popDueGate 弹窗前 settle：`docAdvanceDue` 判定可推进后，先跑与点击后相同的 `pipeline.completeDocStage(changeId, node)`（落 stage-completed 事件 + 从 plan.json 渲染 plan.md/tasks.md），刷新 `live` 状态（fingerprint 与 projection push 都读新版本），再等 350ms 让 rail 刷新先于弹窗绘制。settle 与后续驱动天然一致：完成的节点 resting 点仍欠同一个 advance 门（dueGateFor: nodes.X completed → X-advance），弹窗与队头 moot 复核按构造一致。
【变更】`go-coordinator.ts` plan 路径：`prepareDoc(context,'plan',at('plan'))` → `completeDocStage` 先于 `resolveViaDialog(plan-advance)`，弹窗 scopeNote 明确「共 N 个任务；tasks.md 任务清单已生成，确认后开始落代码并逐项完成」。
【变更】`orchestrator.ts` 弹窗卡上下文对齐：turn-end 弹的 plan-advance 卡同样携带 ledger scopeNote（影响范围文件列表 + tasks.md 句），两条通道对同一决策展示相同信息。planNote 从 `readLedger` 读取，读取失败静默退化为无 note（不阻断弹窗）。
【变更】fingerprint 由 projection 版本号改为「版本号 + 产物文件 size+mtime」：模型改产物不发事件，暂停过的门在下一回合产物变化后能重新弹出（否则用户只能反复手敲 /baf-go）。

**现在时序**（探针实测）：rail 先翻 plan.md=已填写、tasks.md=已计划 → 350ms → 弹窗卡出现，卡内即引用 tasks.md 已生成。产物生成后客户确认才推动工作流。

## 2. 已完成阶段 tokens/耗时显示 —（问题 #2）

【变更】`WorkflowView.tsx` `stageDuration`/`stageTokens`：状态为 completed/in-progress 的节点，无耗时显示 0s、无 tokens 显示 0K；仅锁定/空闲/忽略（未执行到）的节点显示 —。归档/历史流程图同口径。实测：已完成节点全部「耗时 1.1s Tokens 0K」形态，锁定节点保持 —。

## 3. 验证阶段产物应为 verify.md（问题 #3）

【变更】`tab-view.ts` 阶段产物清单第 7 行由 verify-report.json 改为 verify.md（人类可读验收文档）；JSON 报告仍落盘供机器消费（baf-verification skill 引用不变），rail 只展示人类文档。`lanes.spec.ts` 期望同步为 7 行并断言 verify.md missing 态。

## 4. tasks.md 状态机（问题 #4）

四态：尚未生成（missing）→ 未填模板（template）→ 已计划（planned，计划完成从 plan.json 渲染 todo list）→ 已填写（filled，实现完成全部 [x]）。
【变更】`stages/plan.ts` `renderTasksMdFromLedger` 渲染 `- [ ] id title（验证：…）` + allowlist 脚注；`drivePlan` 完成时落账本并渲染两文档。
【变更】`stages/implement.ts` `completeTask` 勾选后 re-render tasks.md；`driveImplementStage` 全部 done 后重新渲染为全 [x]。
【变更】`escalate.ts` `preserveBugFixPathLedger`：fast-path 升级时 plan.md/tasks.md 与 plan.json 一起改名留档（plan.fast-path.md / tasks.fast-path.md），OpenSpec 回填的模板安装不再被 writeArtifact 的已填守卫拒绝（修复 "artifact already filled: tasks.md"）。
【变更】rail chip 文案与门禁：所有阶段产物未就绪时推进门缺项可读（proposalGate 系列沿用）。

## 5. 变更总览历史被当前顶掉 + 计时不停（问题 #5）

【变更】`WorkflowView.tsx` 历史流程图改为独立模态 `[role="dialog"][aria-label="历史流程图"]`，与变更总览模态分层（非嵌套替换）；打开终态行时 `openHistory` 用 `refresh(changeId)` 的**返回值**喂 historyPick（不再订阅下一次轮询覆盖），轮询刷新不回收已打开的历史视图。实测打开 5s 后历史模态仍在、总览在其下完好。
【变更】终态变更计时冻结：归档后 stageDuration 停在归档时刻（历史模态耗时列 = 冻结值），只有进行中变更的当前节点继续走表。

## 6. 会话统计三类分组（问题 #6）

【变更】`WorkflowView.tsx` `SessionStatsCard` 重组为三段 checklistHead：概览（回合/步骤/模型耗时）、工具（工具调用/工具耗时）、Tokens（合计/输出/缓存命中，分桶明细在合计 hover title）。数据源不变（sessionStats + tokenUsage 投影）。

## 7. 阶段清单中文化（问题 #7）

【变更】新增 `ui-baf-workflow/src/client/catalog-i18n.ts`：`CATALOG_ZH` 与 `baf-core/src/catalog.ts` 逐节点索引对齐（purpose/prerequisites/actions/artifacts/completion/failure 全字段），作为显示源；英文目录仅作缺项回落。`BilingualDetail` 与 `StageChecklist`（本阶段清单卡）改读 CATALOG_ZH，去掉中英混排。实测设计卡 zhHits=3、无英文泄漏。

---

## 验证方式

- 离线：`pnpm vitest run packages/baf/baf-workflow packages/baf/baf-core` 366/366；`pnpm build:lib` 通过；ui-baf-workflow 17/17。
- 真机：`apps/web/.demo5-check.mjs`（Playwright）对 `node --import tsx/esm apps/cli/src/bin.ts web --port 3347`：
  - 种子 `tmp/seed-demo5check.mjs`（无模型驱动）：Change A 全路径归档（真实跨阶段间隔、全 [x] tasks.md、verify.md），Change B 停在 plan 且 plan.json 已填——问题 #1 的精确时刻。
  - 探针只点精确无操作标签「暂不推进」；绝不点「确认进入实现」。
- 排障记录：host 侧 baf-workflow 经包 exports 加载 `lib/` 构建产物，改 `src/` 后必须 `pnpm build:lib` 才生效（仅重启 host 无效）——本轮 C4b 二次失败即此因。

## 剩余风险（按优先级）

1. **vitest 偶发 1 例失败**：4 轮全量中 2 轮出现 1 failed（未捕获到用例名，随后 2 轮全绿）。机器高载（9 个并行 Claude 会话 + dev:web watch + host）下疑似计时敏感用例抖动。待低载复跑定位；不影响本轮结论（两轮全绿 + 真机 13/13）。
2. **verify-advance 卡片时间戳文案**：plan-advance 有 ledger scopeNote，design-advance/verify-advance 卡无对称 note（verify-advance 已点名 verify.md，design-advance 无）——不同门的上下文丰富度不一致，客户可能再报「信息不够」。
3. **种子工作区为手工投影**：demo5-check 的 baseline.yml 是测试夹具，正式工作区首个回合的 intake 分类弹窗路径未在本次真机探针覆盖（探针从既有变更续走）；intake 弹窗此前已在 demo1 批次验证。
4. **历史模态与总览的数据新鲜度**：历史视图用打开时快照，若归档目录在模态开着时被外部改动不会自动刷新（有刷新按钮，手动可解）。

## 未改动但相关

- `verify-report.json` 仍写盘（机器消费面：baf-verification skill、审计），仅 rail 不再展示。
- overlay/docs 中 verify-report.json 的 skill 文档引用维持原样（机器报告语义正确）。
