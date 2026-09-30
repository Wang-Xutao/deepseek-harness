# demo31 五问题批次 — 非baf模式欢迎抑制 / 帮助页 / 设置样式 / bug-fix-path 全流程统一 / 推进卡滞根修

- 日期：2026-09-30
- 范围：Tier 2（`pnpm build:lib`，未跑 NSIS）
- 验证：单测（9 个改动测试文件 237/237 + baf-guard 35/35 绿）+ web 端 smoke（问题 2/3 实测）+ demo30 工作区 bug-fix-path 全流程 e2e walk（问题 5 实测）
- 状态：已实现；web 地址见文末

## 问题 1 — 非 baf 模式进入会话不自动执行 baf-welcome

【变更】`packages/baf/baf-workflow/src/session-gate.ts`：`primeGateSnapshot`（会话建立时预置欢迎门）现在读取会话的 mode/preset 覆盖面 —— 非 baf 模式（普通会话、非 baf 预设）不再自动注入 baf-welcome 引导；只有 baf 模式会话保持原行为。`session-gate.spec.ts` 27/27 绿（含新增的非 baf 模式用例）。

## 问题 2 — 帮助页面空白

根因：`build:web` 的 vite 构建 `emptyOutDir` 会清空 `apps/web/dist`，而 `/help/` 目录此前只有 overlay 发布链（`overlay/scripts/build-docs.mjs`）会拷进去 —— 本地 `pnpm build:web` 后启动的 web 端，`/help/index.html` 永远 404，iframe 空白。

【变更】
- `scripts/build.ts`：完整构建链（`tsx scripts/build.ts`）在 `build:web` 之后新增 `syncHelpDocs()` —— spawn `overlay/scripts/build-docs.mjs` 把 mkdocs 产物同步进 `apps/web/dist/help/`。best-effort：mkdocs 不可用时告警不失败（发布链自身的严格校验保持不变）。
- 注意：单独跑 `pnpm build:web` 仍会清掉 help —— 之后需要手动补一次 `node overlay/scripts/build-docs.mjs`（本次交付已同步）。

实测：`GET /help/index.html` 200、6.3KB 内容；应用内「帮助」页签渲染非空白（tmp/webwalk-verify-demo31/smoke-02-help.png）。

## 问题 3 — 设置页样式对齐

- 「工作流」「版本与更新」顶部标题 → 与「Agent 预设」一致：
  - `packages/client/ui-baf-tracegraph/src/client/WorkflowSection.module.css`、`packages/client/ui-settings-updates/src/client/UpdatesSection.module.css`：`.title { margin:0; font-size:18px; font-weight:600 }`，`.intro { margin:0; font-size:13px; color: var(--dsw-alias-label-tertiary) }`（AgentPresetSection 同款）。
- 「轨迹图」「工作流页签」开关 → 与「开发者工具」一致：
  - `TraceGraphRow.tsx` / `WorkflowTabRow.tsx`：去掉自制胶囊开关，换共享 `Switch`（`@deepseek-ai/dsh-client-ui-primitives`）；两个 `.module.css` 只留行布局（flex/space-between/gap 24px/padding 16px 0/border-bottom 0.5px，title 14/20，description 12/18 secondary），与 DeveloperToolsRow 完全同款。`data-testid` 保持不变。
- 顺手清理死键：`ui-baf-workflow/locales.ts` 的 `settings.workflowTab.on/off`、`ui-baf-tracegraph/locales.ts` 的 `traceGraph.on/off`（联合类型 + 双语字典）。

实测（设置页逐节点击）：agent / 工作流 / 版本与更新 三个标题均 18px/600；General 节 2 个 Switch（开发者工具 + 轨迹图）、工作流节 1 个（工作流页签），与开发者工具行同 `_switch_*` 原语类。

## 问题 4 — bug-fix-path 与 full-go-path 流程图/产物完全一致（仅裁剪）

原则：bug-fix-path = 同一张图 + 裁剪。不再有独立「Bug 记录」状态、独立 bug-record.md、独立标题话术。

- 图：`baf-core/src/graph.ts` + `tab-view.ts` —— `placementsForMode` 对 bug-fix-path 复用 `FULL_GO_PATH_ROWS`，clarify/design/plan 三节点 `onPath:false`（图上仍是同一排布）。`tab-types.ts` 新增 `NodeStatusId 'clipped'`。
- 状态：`WorkflowView.tsx` —— `statusClass` 的 `clipped` → idle 样式；`stageActionsDone` 含 `clipped`（已完成动作）；流程经过时直接显示「已裁剪」并跳过。
- 产物：`stages/gates.ts` —— `BUG_FIX_PROPOSAL_FILE = ARTIFACT_FILES.proposal`（即 proposal.md，bug-record.md 消失）；`BUG_FIX_ARTIFACT_ORDER` 与 full-go 同序（proposal → clarify → design → plan → plan.json → tasks → checklist → verify.md），`BUG_FIX_CLIPPED_FILES = {clarify.md, design.md, plan.md}` 裁剪三件。产物文档名称与全流程一致。
- 裁决门：`bugRecordGate` 改判 proposal.md（Problem/Root cause/Impact scope/Regression test 四节 + plan.json 台账），失败话术直接指向 `/baf-workflow-classify confirm mode=bug-fix-path`；`changeArtifactStatus` 的 proposal 行按 mode 分流（**LOAD-BEARING**：改名后 `file === BUG_FIX_PROPOSAL_FILE` 在 full-go 也命中，必须 `mode === 'bug-fix-path'` 守卫，否则 full-go 的 Why/Scope/Impact 提案会被 bug 模板规则误判为未填）。
- 门卡：`gate-cards.ts` —— `bugfix-open-advance` 标题/按钮与 `open-advance` 完全一致（「提案已完成 · 请确认推进」/「确认提案 · 进入实施」），仅【完成情况】【确认后】保留裁剪路径语义（根因/回归先行）。
- guard：`policy.ts` open 段 —— proposal.md 两种模式都放行（不再按 mode 分叉）；bug-fix 独有的是 plan.json。
- 派单/协调：`go-dispatch.ts` `artifactPathFor` 去掉 mode 参数（两模式同路径）；`DispatchSignal.mode` 只负责选完成条件（BUG_RECORD_REQUIREMENTS_ZH vs DOC_REQUIREMENTS_ZH.open）。`orchestrator.ts` / `go-coordinator.ts` / `command-drives.ts` / `gate-dialog.ts` 同步去掉 mode 分叉与旧命名。
- 升级回填（T15）：`stages/escalate.ts` —— 读 bug 记录改为先读 proposal.md，再 `renameAsideIfExists(proposal.md → proposal.bug-fix.md)`，然后写升级版 proposal.md（`writeArtifact` 对非模板已填内容会抛「artifact already filled」，必须先挪走）。

## 问题 5 — 流程图页顶部「可以推进工作流」非标样式 + verify 卡滞根修 + demo30 实测

### 5a. 推进弹窗改成标准门卡语法
`WorkflowView.tsx` 的 `advanceDialog`（`data-advance-dialog`）重写为与 liveGate（`data-live-gate`）一致的标准卡：标题「进入{to} · 请确认」，正文按空行分段渲染 —— 单行【…】节标题用 `gateSectionTitle` 样式，其余 `hint` 段落；主按钮「确认推进 · 进入{to}」。`locales.ts` 新增 `advanceDialog.confirm`（中英）。

### 5b. demo30 卡滞根因与根治
现场（change-20260929-ecum-bf35，11 个事件停在 implement 二次进入）：verify 失败 → T11 回 implement → 修复需要新建 lite_hsm.h/lite_queue.h/lite_sequence.h（demo30 源码 include 了这三个头但文件不存在）→ `scope_exceeded` 硬拒 → 模型得出「所选修复不可行」的结论并用文字向客户求重选（违反弹窗设计原则）。

【变更】
- `baf-guard/policy.ts` `scope_exceeded` 拒绝文案带上合法逃生路径：implement 阶段 change 目录可写 → 先把新文件加进 plan.json 的 allowlist（并补任务）再创建；范围决策拿不准就用 baf_question_ask 问客户。
- `go-dispatch.ts` `workOrderText` verify-failed 工单新增规则 1a，把 allowlist 扩展路径写在工单最前面。

### 5c. demo30 e2e 实测（`apps/web/.verify-bugfix-demo31.mjs` + `.continue-652e.mjs` / `.finish-archive-652e.mjs`）

新鲜缺陷（真实、可编译验证）：ecum.c 调用 EcuM_SM_Init/EcuM_SM_Task 前无声明（ecum.h 未含 ecum_sm.h）→ C11 隐式声明编译错误。修复=一行 include；回归测试=tests/test_ecum_sm_decl_link.c（桩链接 + 断言五桩各命中一次）—— 修复前编译失败、修复后 PASS（离线已双验证证）。

**实测结果（change-20260929-bug-…-652e，已走通到归档；证据 tmp/demo31-walk.log + tmp/demo31-continue.log）：**
- A 放弃卡滞变更 → projection `current:"abandoned"`（7 个历史变更全部 terminal），40s 静默窗口无新事件、无工单、不归档。
  - **实测澄清**：web 端敲 `/baf-workflow-abandon confirm`，host 因缺 human-source 标记拒绝直驱，由模型弹「请确认：放弃当前变更」卡 —— 客户点「确认放弃」才落 terminal。用户此前的「放弃了又会接着跑」正是确认卡未完成的样子（demo30 projection 里根本没有任何 terminal 事件）；确认完成后不再复现。
- B 新缺陷 → fieldless 缺陷修复路径 confirm → mint。
- C 提案卡是「提案已完成 · 请确认推进」（无「Bug 记录」字样；状态变化 提案（已完成，通过完成门）→ 实施（待开始））；Tab/任务会话顶部点「确认提案 · 进入实施」→ implement，tasks.md 由推进写入。
- D implement：plan.json 两个任务全 done（allowlist=ecum/service/ecum.c + tests/test_ecum_sm_decl_link.c），回归测试先行 + 一行修复（ecum.c:28 `#include "ecum_sm.h"`）。
- E verify-advance「确认检查单 · 开始验证」→ 机器门禁实跑（verify-report.json：regression-test/quality/guard/secret-scan 全 ✅，gcc 16.1.0 记录在 verify.md）→ checklist 10/10 全 [x] → gate B「确认归档」→ `openspec/changes/archive/<id>/`（proposal/verify/checklist/plan/tasks/verify-report，**无 bug-record.md**，文档类型与全流程一致）+ index.json `current:"completed"`，ledger 13 事件含 awaiting-confirm → change-archived。

**实测发现的产品级问题（harness 视角，均已在会话文件/projection 取证）：**
1. **门卡落在 BAF 任务会话，不在客户会话**：classify 之后的工作单轮次与后续门卡（gate A/verify-entry/gate B）都出现在 BAF 自建的任务会话（侧边栏「ECUM Service Bug Fix Chan… 待回答」），客户最初发言的会话不再弹卡 —— 客户需要切会话才能看到卡（walk 连续两轮「页面冻结」实为看错会话）。
2. **verify 硬校验拒绝会吞掉门卡 ask**：checklist 未全勾时点「确认归档」被静默拒绝（无 ledger 事件、无新卡），ask 条目已消费；必须再敲一次 `/baf-go` 重新弹卡。§18.5 的 awaiting-confirm park/unlock 语义让「/baf-go 即确认」成立，但拒绝路径没有任何反馈。
3. **会话模型轮可悬挂**：客户会话里 classify-confirm 派生的模型轮在 `baf_gate_ask` 后永不收尾（session transcript 无 turn/end），该会话 composer 永久隐藏 —— 用户「工作流是乱的」体感的一部分。
4. 任务会话内 shell 被 sandbox ACL 拦（SetNamedSecurityInfoW grantWrite 失败）→ 模型诚实地不勾运行时项（4/6/7），靠系统机器门禁 verify-report.json 反证后补勾 —— 行为正确，但「任务会话跑不了 gcc」限制值得知晓。

## 剩余问题（按优先级）

1. **门卡/工单落在 BAF 任务会话而非客户会话**（5c 实测发现 1）：classify 之后客户会话不再弹卡，须切到侧边栏「待回答」的任务会话点卡。这是 walk 连续误判「页面冻结」的根因，也可能正是用户「工作流是乱的」体感来源 —— 建议下一批优先整改（卡回流客户会话，或客户会话显示跳转引导）。
2. **verify 硬校验拒绝吞 ask 无反馈**（5c 实测发现 2）：checklist 未全勾点「确认归档」→ 静默拒绝 + ask 已消费，需重敲 /baf-go。建议拒绝路径弹「裁决门未通过」卡（模型侧已有该概念）或至少 toast。
3. **会话模型轮悬挂**（5c 实测发现 3）：classify-confirm 派生轮 baf_gate_ask 后无 turn/end，客户会话 composer 永久隐藏。取证：session transcript 尾部无 turn/end。
4. **abandon 的直驱命令面**：web 敲 `/baf-workflow-abandon confirm` 目前依赖模型弹卡 + 客户点「确认放弃」两跳。弹窗设计原则下这本身合规（客户决策=可点卡片），但「敲了命令还要再点一次卡」的体验和其它命令（/baf-go 直驱）不一致 —— 可考虑把 typed abandon 直接标记 human-source 落 terminal，或统一所有确认类命令都走卡。**未改，待客户定夺。**
5. verify 的 regression-test 检查目前是台账结构性判定（任务 done + 文件 touched），不实跑声明的测试命令 —— 本轮机器门禁（verify-report.json）已补上实跑，但 checklist 勾选仍凭模型自觉。Phase 7 QualityRunner 落地前的已知缝隙。
6. 单独 `pnpm build:web` 仍会清掉 `/help/`（syncHelpDocs 只挂在完整构建链上）；也可以把它挪进 apps/web 的 build 脚本本身。
7. 设置页各节是点击挂载（nav rail）—— smoke 探针需要逐节点击才能读到节内样式，自动化验收脚本已按此编写（apps/web/.smoke-demo31.mjs）。

## 交付

web 端（本机构建+实跑）：`http://127.0.0.1:3080/?token=PMitMZJd11FUSOMZGDVVeIzOdlZLVEX80-ptrQ-Qpds`

- 问题 1：任意非 baf 模式新会话，无 baf-welcome。
- 问题 2：左侧「帮助」页。
- 问题 3：设置 → 各节标题 + General 节「轨迹图」/ 工作流节「工作流页签」开关。
- 问题 4/5：demo30 工作区 —— 已归档变更 `change-20260929-bug-ecum-service-ecum-c-ecum-sm-652e`（openspec/changes/archive/ 下，7 个产物、无 bug-record.md）；侧边栏「ECUM Service Bug Fix Chan…」任务会话可见全程卡片对话；工作流页签可见已裁剪流程图 + 已完成状态。
