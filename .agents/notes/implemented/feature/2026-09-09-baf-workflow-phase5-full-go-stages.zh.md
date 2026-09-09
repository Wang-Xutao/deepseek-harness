# Agent Note: BAF workflow Phase 5 full-go 各阶段

Status: implemented

[English](2026-09-09-baf-workflow-phase5-full-go-stages.md) | 中文

## 问题

Phase 4 交付了 projection/transition/intake 与工作流 Tab，但没有任何阶段真正可执行：没有代码创建 OpenSpec 变更骨架、写入阶段产物、校验门禁证据或归档变更。Phase 5+ 的 Tab 按钮全部禁用，full-go 主链只存在于状态转换表中。

## 决策

full-go 主链以阶段 handler + 基于 `WorkflowService.transition` 的流水线交付：

- `@deepseek-ai/dsh-baf-openspec` 是独立包与 Cordis service（`BafOpenspec`），提供本地文件模式 `OpenSpecAdapter`：骨架创建（绝不覆盖已有）、读取、结构校验、原子归档（临时目录 → 校验 → rename）。对规格化变更，它取代 `baf-core` 的 unavailable stub。
- `baf-workflow/src/stages/` 每节点一个模块：`open`（git revision 前置 + 骨架）、`clarify`（问题/决策/验收，T6）、`design`（引用仓库路径存在性核验）、`plan`（`plan.md` + 结构化 `plan.json`：任务/allowlist/验证命令/回滚点，T8）、`implement`（任务状态 + allowlist 执行）、`verify`（`CheckRunner` 聚合 openspec-validate 为 `verify-report.json`）、`archive`（人工确认 + T10 `checksPassed` 证据 + 原子归档）。
- `stages/pipeline.ts`（`StagePipeline`）是驱动转换的唯一入口：向 projection 记录 `stage-entered`/`stage-completed`/`transition-rejected`，所有移动都经 domain 转换表裁决，模型声明无法推进阶段。
- 产物写入（`stages/write.ts`）可覆写模板占位但绝不覆盖已填产物；对已填内容的重写按 `invalid_transition` 证据拒绝。
- 桌面分发 force 打包 `baf-openspec`（`pack-dsh.mjs` FORCE_PACKAGES + mustResolve），并把版本嵌入 `baf-product-versions.json`（`bafOpenspec` 字段，`/baf-version` 可见）。

计划 §5.8 的 drift 检测（`drift.ts`）与 abandon（`abandon.ts`）不在本切片；转换表已允许 T12/T16 但尚无检测器写入这些事件。它们作为 Phase 6 起步项。

## 考虑过的替代

### 为何不把 OpenSpec 处理留在 baf-workflow 内？

规格文件所有权（骨架布局、校验规则、原子归档）与工作流编排独立演进，且被 verify/archive 在 route/projection 之外独立消费。独立包保持 capability seam 完整，`baf-core` 只留 stub。

### 为何不让 handler 直接写 projection？

每次阶段移动必须经 domain 转换表并按序记录事件。经 `StagePipeline` → `WorkflowService.transition` 使 append-only projection 保持单写者，阻断乱序与伪造转换。

### 为何用模板覆写而不是删除再写？

删除骨架文件会丢失 OpenSpec adapter 创建的模板契约；匹配占位行（`templateOnly`）保留来源信息，同时仍拒绝覆盖用户已填内容。

## 后果

- BAF composition 在 `baf-core`/`baf-workflow` 旁挂载 `baf-openspec`（`isolate.bafOpenspec`）。
- `baf-workflow` 新增依赖 `@deepseek-ai/dsh-baf-openspec`（workspace）。
- 桌面 0.0.10 嵌入 full-go 主链；`baf-product-versions.json` 含 `bafOpenspec`。
- `tests/stages.spec.ts` 覆盖 happy path `open → … → archive`、verify 失败回 implement、门禁失败与非法进入拒绝。
- Phase 6 以 drift/abandon 检测器起步；quality/guard 检查仍是 `CheckRunner` 之后的 Phase 7 stub。

## 5.8 补齐（2026-09-09 同批次）

- `stages/drift.ts` 落地：5 类触发器（`git-revision-changed` / `baseline-id-changed` / `baseline-content-changed` / `verify-report-stale` / `artifact-missing`），`detectAndRecord(ctx, status, observation, {record})` 写入 `drift-detected`；`earliestAffectedNode` 决定 T13 目标（产物缺失映射所属阶段，否则回当前阶段）。
- `stages/abandon.ts` 落地：`driveAbandon({changeId, humanConfirmed})` 需显式确认 → `change-abandoned`；幂等保留产物，保留全部审计。
- `pipeline.driveDriftStage` / `driveAbandonStage` 接入；`pipeline.driveVerifyStage` 走 T11（必需检查失败回 implement）。
- `baseline-locked` 投影事件 + fold 字段：open-stage 落 baseline id + sourceRevision 锚点，让 drift 检测有不可变对比。
- `tests/stages.spec.ts` 新增 T11（openspec validate 失败回 implement）、drift（artifact 删除触发 + record=false）、abandon（无确认拒绝 + 幂等）三类用例。
