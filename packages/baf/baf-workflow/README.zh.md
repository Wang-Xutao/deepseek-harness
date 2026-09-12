---
description: "BAF go 工作流域：路由、projection、intake、转换。"
---

# @deepseek-ai/dsh-baf-workflow

[English](README.md) | 中文

拥有 BAF go 工作流域。Phase 3：`resolveRoute()`、session `baf/route-resolved` 审计、请求级 `ModelSelection`。Phase 4：append-only 工作区 projection、转换裁决、intake 分类与 `WorkflowService`。Phase 5：`src/stages/` 阶段处理器（open、clarify、design、plan、implement、verify、archive）与 `StagePipeline`——唯一经由域表驱动阶段转换的入口。Phase 6：bug 快路径（`stages/fastpath.ts`——open 时最小 bug 记录、T5 根因证据从记录读回、`recordTouched` 处回归测试先行强制）与 T15 风险升级（`stages/escalate.ts`——范围扩大或语义原因升级为 full-go，保留 fast-path ledger 审计，补建 OpenSpec change，回到 clarify 补走）。Web Tab Remote 在 `@deepseek-ai/dsh-client-ui-baf-workflow`。

不发布运行时 invariant companion：阶段管线把每次转换都经 `WorkflowService.transition` 走，独立观测不会与 projection 分叉。

仅在官方 BAF preset 中与 `baf-core` 同组、`isolate.bafWorkflow: true` 下挂载。

## Model Experience

路由解析可改变后续 turn 的 provider/model；projection 事件落在工作区，调用方写入 session 事件前对模型不可见。阶段处理器只在 change 目录下写产物；模型声明不推进阶段——`StagePipeline` 把 entered/completed/rejected 事件全部记入 projection。bug 快路径上，回归测试写完前编辑修复文件会在 `recordTouched` 时被拒（`regression_test_required`）；verify 报告携带 `mode: bug-fast-path` 并显式标注「未走 OpenSpec」，捷径始终可见。

## Known Limitations and Deferred Work

- Phase 4 的 intake `suggest()` 为启发式；规则引擎仍是权威。
- Electron IPC 属 Phase 8。
- `quality` / `guard` / `secret-scan` 检查桩在 `CheckRunner` 中保留直到 Phase 7 接真实实现。
- fast-path 的 `regression-test` verify 行对 durable ledger 做结构判定（任务完成 + 文件已触达）；实际执行声明的测试命令随 Phase 7 QualityRunner 到来。
