---
description: "BAF 工作流域：路由解析、审计，以及后续 projection/转换。"
kind: "package-reference"
---

# @deepseek-ai/dsh-baf-workflow

[English](README.md) | 中文

## 摘要

`dsh-baf-workflow` 拥有 BAF go 工作流领域服务。Phase 3 提供 `resolveRoute()`、session 的 `baf/route-resolved` 审计，以及请求级 `ModelSelection` 映射。projection、转换与 intake 在 Phase 4。仅在官方 BAF preset 中与 `baf-core` 同组、`isolate.bafWorkflow: true` 下挂载。

## 目录

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在与 `baf-core` 相同的 `cordis:group` 中组合 `@deepseek-ai/dsh-baf-workflow`，并设 `isolate.bafWorkflow: true`。session 冻结企业策略与 baseline 时调用 `freezeRouteContext(policy, profile)`（或 `freezeFromPolicyFile`）。每次模型回合前调用 `resolveAndAudit(session, phase, availability)`，再 `selectionForTurn(resolution)` 设置 agent 请求模型。路由失败抛出稳定 `BafError`，并仍追加失败审计事件。

<a id="understand-the-implementation"></a>
## 实现说明

- `route.ts`：企业天花板 → profile 阶段 → session override → dsh 默认；approved-only fallback。
- `route-audit.ts`：类型化 `baf/route-resolved` session 事件（权威审计）。
- `phase-route.ts`：将 resolution 映射为 agent `ModelSelection` 或 workflow worker 扇出选项。
- 服务键：`bafWorkflow`。

企业策略文件使用 `baf-core` 的 `EnterpriseRoutePolicy` schema；路径来自发行/部署配置，不单独依赖 baseline。

<a id="dev-note"></a>
## 开发备注

不要用 dsh `tool-workflow`/`ralph` 驱动 go 阶段转换。Phase 4 将增加 projection 追加/重放与 `WorkflowService.transition`。
