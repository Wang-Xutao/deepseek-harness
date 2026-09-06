---
description: "BAF 企业包：核心词汇、工作流、OpenSpec、质量门禁与 guard。"
kind: "subsystem"
---

# baf/

[English](README.md) | 中文

BAF（企业编码 Agent）领域包。官方 preset composition 在 `packages/preset/agent-presets/presets/baf/`；运行时服务在本目录。

| 包 | 职责 |
| --- | --- |
| [`baf-core`](baf-core/README.zh.md) | 共享类型、baseline 加载、adapter 合同、`bafCore` 服务 |
| [`baf-workflow`](baf-workflow/README.zh.md) | 路由解析、路由审计、`bafWorkflow` 服务（projection 在 Phase 4+） |

后续 Phase 在本目录增加 `baf-openspec`、`baf-quality`、`baf-guard` 等包。
