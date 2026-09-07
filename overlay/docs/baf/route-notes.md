# BAF route 边界核查笔记（Phase 0 只读 + Phase 3 接线）

> 对照日：2026-09-05（核查）；Phase 3 接线 2026-09-06。
> 设计权威：[enterprise-workflow.md](../enterprise-workflow.md) 第 6 章。

## 1. 发行配置注入 allowed provider/model

| 项 | 结论 |
| --- | --- |
| 现状 | dsh **没有**独立的「企业 allowed-list」服务。可用模型来自已注册 LLM adapter 的 `ctx.llm.listProviders()` + `resolveModelInfo()`（`packages/api/session-controller/src/catalog.ts`）。默认模型来自 composition/`agent-default-model` settings（`packages/core/agent-default-model`）。 |
| 复用点 | catalog 列举、resolve、`session/model-unavailable` RemoteError。 |
| **Phase 3 选型** | **`EnterpriseRoutePolicy` 独立 YAML/JSON 文件**，路径由发行/部署配置注入（desktop deployment config 或 cordis overlay 配置键）；**session 创建时冻结**，与 baseline `routeProfile` 一并传入 `BafWorkflow.freezeRouteContext`。baseline 不得单独充当企业天花板。加载器：`baf-core` `loadEnterpriseRoutePolicyFile` / `parseEnterpriseRoutePolicy`。 |

## 2. Session override 存储

| 项 | 结论 |
| --- | --- |
| 现状 | Agent 级 `ModelSelectionRef`（`packages/core/agent/src/model-selection.ts`）：`current` 影响下一 turn 的 prompt assembly 与 `agent/request` 的 provider/model；`assembled` 在进入 prompt 时快照。session-controller 命令路径调用 `agents.selectForNextRequest` 并可选 `agentDefaultModel.saveSelection`。 |
| 复用点 | 请求级切换已存在；换模型不自动改 session composition。 |
| **Phase 3** | `resolveRoute(..., sessionOverride)` 在写入前校验 `allowSessionOverride` 与 enterprise/profile allowed；违规则 `model_route_incompatible`。阶段回合主路径：`toModelSelection(resolution)` → 设置 `selection.current`。 |

## 3. Child 继承语义

| 项 | 结论 |
| --- | --- |
| 现状 | dsh `workflow` worker 的 `agent()` 支持 `provider`/`model`（`SUPPORTED_AGENT_OPTIONS`，`workflow-worker-thread`）；phase meta 亦可带 provider/model。child 可继承当前 phase route 或显式指定。 |
| 复用点 | 子代理扇出时可选转发 route 字段（`toWorkflowAgentOptions`）。 |
| 缺口 / 红线 | BAF **go 状态机不得**用 `tool-workflow`/`ralph` 驱动阶段转换。优先路径：阶段启动 agent turn 时经 session/agent 请求级 API 设 provider/model；仅扇出时借用 workflow `agent()`。显式 child override 须再次过 BAF resolver。 |

## 4. 原生 fallback

| 项 | 结论 |
| --- | --- |
| 现状 | **无**企业级「批准 fallback group」语义。存在的是：adapter 内传输/目录 fallback、retry 包、默认 context/maxTokens 等——均非 BAF 的 `fallbackPolicy.mode: approved-only`。 |
| 复用点 | availability 仍用 `listProviders` / `resolveModelInfo`（Phase 3 测试用 stub `ProviderAvailability`）。 |
| **Phase 3** | `baf-workflow/src/route.ts` 实现 fallback；失败码 `model_fallback_blocked` / `model_route_*`（见 [error-codes.md](error-codes.md)）。 |

## 5. Usage / 审计字段

| 项 | 结论 |
| --- | --- |
| 现状 | token-meter 按实际 provider/model 归因（`packages/llm/token-meter`）；session log 可重建 model-visible 请求。 |
| 复用点 | 用量归因不重做。 |
| **Phase 3** | 每次 `resolveRoute()` 经 `resolveAndAudit` 追加 typed session 事件 `baf/route-resolved`；`.baf/audit/route.jsonl` 仍仅可选派生索引（未实现）。 |

## 7. Phase 4 暴露选型（2026-09-07）

| 项 | 结论 |
| --- | --- |
| Domain | `ProjectionStore` + `WorkflowService` 在 `baf-workflow`；agent isolate 的 `BafWorkflow` 可 `bindWorkspace`。 |
| Web UI | `packages/client/ui-baf-workflow` Host `bafWorkflowView` Typert Remote（按 session `cwd` 读写 projection）；**不进 root realm 的 go 状态机逻辑仍在 isolate / 文件投影**。 |
| Electron IPC | 仍属 Phase 8。 |
| 空态 | `buildEmptyTabView()` 渲染完整模板图。 |