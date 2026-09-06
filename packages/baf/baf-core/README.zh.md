---
description: "BAF 企业核心：共享类型、baseline 加载、adapter 合同，以及 bafCore Cordis 服务。"
kind: "package-reference"
---

# @deepseek-ai/dsh-baf-core

[English](README.md) | 中文

## 摘要

`dsh-baf-core` 是 BAF 企业模式的共享词汇与注册点。它加载并校验企业 baseline，暴露 adapter 合同（OpenSpec、C 工具链、guard、workflow），并提供 Phase 2 的 unavailable stub，让后续阶段在无真实工具时也能结构化失败。仅在官方 BAF preset 的 `bafCore` isolate 下挂载。

## 目录

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在带 `isolate.bafCore: true` 的 entry-local `cordis:group` 中组合 `@deepseek-ai/dsh-baf-core`。挂载后若有 workspace baseline，调用 `ctx.bafCore.loadBaseline(path)`。状态面读取 `version()`、`doctor()`、`help()`。不要把 unavailable adapter 当成功路径使用。

<a id="understand-the-implementation"></a>
## 实现说明

- 类型：intake、workflow 节点/转换、projection 事件、domain result、错误码。
- `baseline.ts`：zod schema + 语义检查（allowed 路由、fallback 组、BAF 版本范围）。
- `adapters.ts`：稳定接口 + unavailable stub。
- 服务键：`bafCore`。

冻结合同在 `schema/`。Fixture：`tests/fixtures/baseline/baseline.yml`。

<a id="dev-note"></a>
## 开发备注

工作流状态机、OpenSpec 执行与 ToolGuard 由后续 BAF 包实现。本包不执行外部工具，不写 projection 事件。
