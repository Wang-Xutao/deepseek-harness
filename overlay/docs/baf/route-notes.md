# BAF route 边界核查笔记（Phase 0，只读）

> 对照日：2026-09-05。结论标注「复用点 / 缺口」；缺口进 Phase 3，本文件不改 host 代码。
> 设计权威：[enterprise-workflow.md](../enterprise-workflow.md) 第 6 章。

## 1. 发行配置注入 allowed provider/model

| 项 | 结论 |
| --- | --- |
| 现状 | dsh **没有**独立的「企业 allowed-list」服务。可用模型来自已注册 LLM adapter 的 `ctx.llm.listProviders()` + `resolveModelInfo()`（`packages/api/session-controller/src/catalog.ts`）。默认模型来自 composition/`agent-default-model` settings（`packages/core/agent-default-model`）。 |
| 复用点 | catalog 列举、resolve、`session/model-unavailable` RemoteError。 |
| 缺口 | **EnterpriseRoutePolicy**（只读 allowed + 能力标签 + fallback group）需 BAF/发行配置提供；session 创建时冻结。注入入口候选：desktop/deployment config、或 BAF baseline 外独立 policy 文件——Phase 3 选型并登记回 [enterprise-inputs.md](enterprise-inputs.md)。 |

## 2. Session override 存储

| 项 | 结论 |
| --- | --- |
| 现状 | Agent 级 `ModelSelectionRef`（`packages/core/agent/src/model-selection.ts`）：`current` 影响下一 turn 的 prompt assembly 与 `agent/request` 的 provider/model；`assembled` 在进入 prompt 时快照。session-controller 命令路径调用 `agents.selectForNextRequest` 并可选 `agentDefaultModel.saveSelection`。 |
| 复用点 | 请求级切换已存在；换模型不自动改 session composition。 |
| 缺口 | BAF 必须在 override **写入前**校验 allowed/capability；dsh 原生不执行企业收紧。 |

## 3. Child 继承语义

| 项 | 结论 |
| --- | --- |
| 现状 | dsh `workflow` worker 的 `agent()` 支持 `provider`/`model`（`SUPPORTED_AGENT_OPTIONS`，`workflow-worker-thread`）；phase meta 亦可带 provider/model。child 可继承当前 phase route 或显式指定。 |
| 复用点 | 子代理扇出时可选转发 route 字段。 |
| 缺口 / 红线 | BAF **go 状态机不得**用 `tool-workflow`/`ralph` 驱动阶段转换。优先路径：阶段启动 agent turn 时经 session/agent 请求级 API 设 provider/model；仅扇出时借用 workflow `agent()`。显式 child override 须再次过 BAF resolver。 |

## 4. 原生 fallback

| 项 | 结论 |
| --- | --- |
| 现状 | **无**企业级「批准 fallback group」语义。存在的是：adapter 内传输/目录 fallback、retry 包、默认 context/maxTokens 等——均非 BAF 的 `fallbackPolicy.mode: approved-only`。 |
| 复用点 | 无直接复用；availability 仍用 `listProviders` / `resolveModelInfo`。 |
| 缺口 | BAF Phase 3 在 `baf-workflow/src/route.ts` 实现 fallback 选择；失败码 `model_fallback_blocked` / `model_route_*`（见 [error-codes.md](error-codes.md)）。 |

## 5. Usage / 审计字段

| 项 | 结论 |
| --- | --- |
| 现状 | token-meter 按实际 provider/model 归因（`packages/llm/token-meter`）；session log 可重建 model-visible 请求。 |
| 复用点 | 用量归因不重做。 |
| 缺口 | 每次 BAF `resolveRoute()` 须追加 typed session 事件 `baf/route-resolved`（载荷含 source/phase/fallbackFrom）；`.baf/audit/route.jsonl` 仅可选派生索引。 |

## 6. Phase 3 任务摘录

1. 冻结 `EnterpriseRoutePolicy` 加载入口（发行配置 vs 独立文件）。
2. 实现 `resolveRoute()` 优先级：enterprise → routeProfile.phases[phase] → session override（须在 allowed 内）→ dsh default；只收紧不放宽。
3. 阶段 turn 优先走 session/agent 请求级 API；扇出可选 workflow `agent()`。
4. 注册 `baf/route-resolved` 事件；暴露 `RouteStatusView`。
5. 测试覆盖 enterprise-workflow §6.2 边界 1–7。
