# Agent Note: BAF workflow Phase 3 路由解析

Status: implemented

[English](2026-09-06-baf-workflow-phase3-route.md) | 中文

## 问题

Phase 2 已冻结 baseline `routeProfile` 与错误码，但 BAF 仍缺少独立于 profile 的企业天花板、`resolveRoute()` 优先级，以及「哪次阶段回合用了哪个 provider/model」的 session 审计。阶段执行器否则会临时选模型或静默落到策略外默认。

## 决策

新增 `@deepseek-ai/dsh-baf-workflow`（Phase 3 切片）并扩展 `baf-core`：

- `EnterpriseRoutePolicy` 从**发行/部署配置路径**加载（独立 YAML/JSON），在 session 创建时与 baseline `routeProfile` 一并冻结；baseline 单独不能充当企业天花板。
- `resolveRoute()` 顺序：企业 allowed 天花板 → profile 阶段偏好 → session override（须在 allowed 内）→ dsh 默认；随后 `approved-only` fallback，失败码稳定为 `model_route_*` / `model_fallback_blocked`。
- 每次解析追加类型化 session 事件 `baf/route-resolved`（权威）；工作区 audit JSONL 仅可选派生索引。
- `RouteStatusView` + `buildRouteStatusView` 放在 `baf-core`，供设置页/Tab/`baf status`。
- 阶段回合主路径：将 resolution 映射为 agent `ModelSelection`（请求级）。workflow `agent()` 选项仅用于子代理扇出。
- 官方 BAF composition 在同一 isolate 组挂载 `baf-workflow` 与 `baf-core`。

工作流 Tab UI 仍属 Phase 4/8（用户确认延后）。

## 考虑过的替代

### 为何不把企业策略只写进 baseline routeProfile？

§6.2 要求独立企业策略且只能收紧。并入 profile 会让 `source: enterprise` 变成别名，且无法在不重发整包 baseline 的情况下收紧天花板。

### 为何不经 dsh tool-workflow 传阶段 route？

go 阶段转换不得使用 `tool-workflow`/`ralph`。请求级 ModelSelection 与现有 catalog/默认模型路径一致；worker `agent()` 仍可选用于子代理扇出。

## 后果

- BAF composition 需解析 `@deepseek-ai/dsh-baf-workflow`。
- persistence catalog 须包含 `baf/route-resolved`。
- Phase 4 阶段执行器在模型回合前调用 `resolveAndAudit`；未 freeze 时以 `policy_missing` 失败。
