---
description: "OpenSpec 本地文件适配器：变更骨架、读取、校验、原子归档。"
---

# @deepseek-ai/dsh-baf-openspec

[English](README.md) | 中文

## 摘要

`dsh-baf-openspec` 基于「工作区本地 OpenSpec 目录」（`openspec/changes/<changeId>/`）实现 `@deepseek-ai/dsh-baf-core` 的 `OpenSpecAdapter` 契约。Phase 5 用它完成 `open` 骨架、阶段产物读写、`validate` 检查和原子 `archive`。它不执行外部进程：企业 OpenSpec CLI 集成属后续阶段；当前 `detect()` 报告的模式是本地文件布局。

## 目录

- [使用](#use-this-package)
- [实现说明](#understand-the-implementation)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用

调用方一般经由 `@deepseek-ai/dsh-baf-workflow` 的阶段处理器（`driveOpen`、`driveVerify`、`driveArchive`），也可直接使用：

```ts
import { createLocalOpenSpecAdapter } from '@deepseek-ai/dsh-baf-openspec'

const adapter = createLocalOpenSpecAdapter({ workspaceRoot: cwd })
await adapter.open({ changeId, title, workspace: { root: cwd } })
const report = await adapter.validate({ changeId, path: '' })
```

`open()` 拒绝覆盖已存在的变更目录（返回 `openspec_unavailable` 并带 `exists: true`）；`archive()` 通过「临时目录 + rename」把 `changes/<id>` 移入 `archive/<id>`，失败时源目录保持原样。

<a id="understand-the-implementation"></a>
## 实现说明

- `layout.ts` 持有冻结的目录名：`openspec/changes`、`openspec/changes/archive`，以及各阶段产物文件（`clarify.md`、`design.md`、`plan.md`、`plan.json`）。
- `templates.ts` 提供英文骨架正文（`proposal.md`、`clarify.md`、`design.md`、`tasks.md`）；模板是数据，不是逻辑。
- `adapter.ts` 是 `OpenSpecAdapter` 实现：`detect()` 检查工作区布局，`open()` 创建骨架，`read()` 列出阶段产物并报告完成情况，`validate()` 执行 Phase 5 结构化门禁（必需章节齐全），`archive()` 把变更原子移入归档根目录。
- 无模型调用、无进程派生、无网络：该适配器只做工作区文件 IO 与共享的 `DomainResult` 封装。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- 未执行真实 OpenSpec CLI（`baseline.openspec.cli`）；validate 是结构性的。企业 CLI 接入（经受控执行器）待企业输入冻结后落地。
- 单进程假设：适配器不加跨进程文件锁；工作流事件已由 projection 按工作区串行化。
