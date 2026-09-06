# Agent Note: BAF core Phase 2 包

Status: implemented

[English](2026-09-06-baf-core-phase2.md) | 中文

## 问题

Phase 1 已交付可发现的官方 BAF preset，但 composition 尚不能挂载 domain 服务，也没有共享的 baseline 加载器、错误词汇或 adapter 合同。后续 workflow/OpenSpec/quality 阶段否则会各自发明平行类型，并在无工具时静默失败。

## 决策

在 `packages/baf/` 新增 `@deepseek-ai/dsh-baf-core`：

- 公开类型：intake、workflow 转换表（`TRANSITIONS`）、projection 事件、domain result、`BafError`。
- Zod baseline 加载器，含语义检查（allowed 路由、fallback 组、BAF 版本范围），对齐 Phase 0 fixture schema。
- Adapter 接口，以及 OpenSpec / stack / guard / workflow 的 unavailable stub。
- Cordis `BafCore` 服务（`bafCore`），仅在 `presets/baf/agent.cordis.yml` 的 `bafDomain` isolate 下挂载。
- 在 `apps/cli` 与 `web-app` 声明依赖，使 shipped preset 解析与 `verify-cordis-config` 通过。

## 考虑过的替代方案

### 为何现在不把工作流状态机放进 baf-core？

Phase 4 拥有 projection 追加/重放与转换执行。Phase 2 只冻结转换表并提供 stub，供 Phase 3–4 稳定导入。

### 为何用 unavailable stub 而不是省略 adapter？

调用方需要已注册对象并返回 `tool_unavailable` / 结构化失败；可选 undefined 会鼓励静默跳过。

## 后果

- BAF composition 健康检查现在必须能解析 `@deepseek-ai/dsh-baf-core`。
- Phase 3 route resolver 与 Phase 4 `baf-workflow` 从此包导入类型。
- 真实 OpenSpec/C/guard 实现替换 stub 时无需改接口。
