---
description: "BAF go 工作流会话 Tab 与 Host Remote（projection/intake）。"
---

# @deepseek-ai/dsh-client-ui-baf-workflow

[English](README.md) | 中文

BAF 会话的 **「工作流」** Tab：go 状态机 SVG 流程图、intake 分类卡、阶段详情轨与半交互操作。Host 半边提供 `bafWorkflowView` Typert Remote，经 `@deepseek-ai/dsh-baf-workflow` 读写工作区 projection。

## Model Experience

无 — 仅展示与 Host projection I/O；不产生模型可见 prompt 或工具。

## Known Limitations and Deferred Work

- 阶段开始 / 归档确认按钮在 Phase 5 handler 落地前可见但禁用。
- Electron `baf:getWorkflowStatus` IPC 属 Phase 8；Web 仅走 Typert Remote。
- Tab 在 web 面注册；内容要求 `agentPreset === baf`。
