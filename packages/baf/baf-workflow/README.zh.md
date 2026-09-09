---
description: "BAF go 工作流域：路由、projection、intake、转换。"
---

# @deepseek-ai/dsh-baf-workflow

拥有 BAF go 工作流域。Phase 3：`resolveRoute()`、session `baf/route-resolved` 审计、请求级 `ModelSelection`。Phase 4：append-only 工作区 projection、转换裁决、intake 分类与 `WorkflowService`。Web Tab Remote 在 `@deepseek-ai/dsh-client-ui-baf-workflow`。

仅在官方 BAF preset 中与 `baf-core` 同组、`isolate.bafWorkflow: true` 下挂载。

## Model Experience

路由解析可改变后续 turn 的 provider/model；projection 事件落在工作区，调用方写入 session 事件前对模型不可见。

## Known Limitations and Deferred Work

- Phase 4 的 intake `suggest()` 为启发式；规则引擎仍是权威。
- Electron IPC 属 Phase 8。
- `quality` / `guard` / `secret-scan` 检查桩在 `CheckRunner` 中保留直到 Phase 7 接真实实现。
