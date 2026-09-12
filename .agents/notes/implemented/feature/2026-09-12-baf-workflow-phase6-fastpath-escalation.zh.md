# Agent Note: BAF 工作流 Phase 6 bug 快路径与 T15 升级

Status: implemented

[English](2026-09-12-baf-workflow-phase6-fastpath-escalation.md) | 中文

## Problem

Phase 5 交付了 full-go 链，但 projection 早已把低风险 bug 修复分类为 `bug-fast-path` 并在 fold 中标记 `openspecSkipped`——该模式却无人能真正驱动：没有 fast-path open，T5/T15 在转换表里没有调用方，implement 门禁还硬编码 `mode: 'full-go'`（对未来任何 fast-path 驱动都是潜伏 bug）。

## Decision

快路径以两个 stage 模块 + pipeline 接线落地，全部经同一张域表裁决：

- `stages/fastpath.ts`：`driveFastPathOpen` 写 `bug-record.md`（问题 / 根因 / 影响范围 / 回归测试 / Workspace 锚点）与 fast-path 版 `plan.json` ledger（首个任务为 `regression-test`），不创建 OpenSpec 骨架。`rootCauseRecorded` 从记录读回根因段——T5 证据是机器推导的，绝不采信调用方声明。Git revision 缺失仅在记录中告警而不阻断（full-go open 才阻断）。
- 回归测试先行在 `recordTouched` 时强制（`assertRegressionFirst` 位于 allowlist 检查之后、写入之前）：回归任务完成前写修复文件抛 `invalid_transition` 且 `reasonCodes: ['regression_test_required']`。写入时拒绝使违规可恢复；门禁再对 durable ledger 做结构复核作为纵深防御。
- `stages/escalate.ts`：`driveEscalate` **在 mode 仍为 bug-fast-path 时**裁决 T15，随后追加 `stage-failed(implement)` → `mode-upgraded` → 安装 OpenSpec 补建 → `stage-entered(clarify)`。顺序是硬约束：`mode-upgraded` 的 fold 会把 mode 翻成 full-go，而 T15 按模式过滤为 bug-fast-path——事件之后裁决将找不到这条边。
- 升级保留审计：`plan.json` 改名为 `fastpath-ledger.json`，让补走的 plan 阶段能写全新 ledger 而不覆盖 fast-path 轨迹；`proposal.md` 预填 bug 上下文（Why / Problem / Root cause 从 bug record 提取），升级后的 change 是真正的 full-go change，verify 的 openspec-validate 保持有意义。
- 两条触发路径：自动（pipeline `driveImplementStage` 预检 `scopeGrowthFiles`——touched 文件越出 allowlist——以结构性原因升级）与显式（`driveEscalateStage`，用于公共 API 影响等语义原因）。
- `pipeline.enterStage` 增加幂等续入（`current === to && nodes[to] === 'in-progress'` → 跳过裁决）：escalate 已写入 `stage-entered(clarify)`，对自环重新裁决会撞上表中不存在的边。
- mode 感知 verify：`buildVerifyRunner(ctx, changeId, mode)` 交换必需检查——fast-path 以 `regression-test`（对 ledger 的结构判定）为门禁，`openspec-validate` 降级为非必需行并标注 intake reason codes（「未走 OpenSpec」）。`VerifyReport` 携带 `mode`。`driveImplementComplete` 的 mode 改由 projection 推导，不再硬编码 full-go。

## Alternatives considered

### fast-path 工件为什么复用 `openspec/changes/<id>/` 而不是独立目录？

归档、drift 检测、Web Tab 都经 change 目录解析产物；为一个模式分叉出平行布局会迫使所有消费方改造。bug record + 带 `fastPath` 标记的 ledger 即可区分模式，无需新路径规则。

### 回归先行为什么在 recordTouched 强制而不是门禁时？

touched 按写入顺序 append-only；门禁时检查只能在违规写入已发生后拒绝，留下不可恢复的顺序。写入时拒绝让顺序规则始终可满足，门禁复核保留为双保险。

### 升级后为什么把 plan.json 改名而不是扩展同一 ledger？

补走的 plan 阶段经 `writeArtifact` 写自己的 ledger，而 `writeArtifact` 拒绝覆盖非模板内容。改名逐字节保留 fast-path ledger 作为审计，并给 full-go plan 一个干净、诚实的产物。

## Consequences

- fast-path change 走 intake → fast-path open → implement（T5）→ verify → archive，全程无 OpenSpec 工件；`driveOpenStage` 拒绝它们，`driveFastPathOpenStage` 拒绝 full-go change。
- 升级后补走 clarify → design → plan → implement → verify → archive；已完成的 fast-path 阶段（open）带着产物在升级中存活。
- 移除了 `VERIFY_CHECK_NAMES`（零消费者；检查集现在按 mode 划分）。
- `tests/fastpath.spec.ts` 新增 8 例：全链路、Git 缺失告警、无根因拒 T5、fast-path 上拒 full-go 驱动、回归先行拒绝 + 恢复、范围扩大自动升级、非 fast-path implement 拒绝升级、升级后完整补走。`packages/baf` 套件 56/56 绿。
- regression-test verify 行是结构判定；实际执行声明的测试命令随 Phase 7 QualityRunner 到来。Phase 7/8（ToolGuard、slash/status）仍是计划 §17.4 的 MVP 缺口。
