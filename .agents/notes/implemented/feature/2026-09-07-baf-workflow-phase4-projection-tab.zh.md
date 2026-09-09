# Agent Note: BAF workflow Phase 4 projection、intake 与工作流 Tab

Status: implemented

[English](2026-09-07-baf-workflow-phase4-projection-tab.md) | 中文

## 问题

Phase 3 冻结了路由，但 BAF 仍缺少按变更持久的状态、intake 分类门禁，以及 go 状态机的用户可见界面：阶段状态、跳过理由与合法转换只存在于设计表中，会话无法确认 intake 决策，也看不到变更当前所处的位置。

## 决策

Phase 4 以 domain projection/transition/intake + Web 会话 Tab「工作流」交付，Tab 从 `baf-core`（`NODE_CATALOG`、`WORKFLOW_GRAPH`、`TRANSITIONS`）渲染权威 go 图。Electron IPC 仍属 Phase 8。Tab 仅在当前 session `agentPreset === 'baf'` 时挂载。Slash help/status 命令经 `@deepseek-ai/dsh-baf-workflow/commands` 注册在 `bafDomain` isolate 之外。设置里原标注「工作流」的轨迹图开关改名为「轨迹图」，两个功能保持区分。

Host Typert Remote `bafWorkflowView` 经 agent isolate 使用的同一个 `ProjectionStore` 读写 `<cwd>/.baf/projection/`：单写者、原子 rename、可重放事件日志。

落点：

- `packages/baf/baf-core`：catalog、graph、tab-view 模型
- `packages/baf/baf-workflow`：projection store、intake、transition、workflow service；slash 插件 `@deepseek-ai/dsh-baf-workflow/commands`（非 isolate preset row）
- `packages/client/ui-baf-workflow`：Host Remote + 流程图 Tab（主题 token；仅 BAF preset 注册）
- `overlay/docs/help/baf-mode.md`：终端用户帮助
- `overlay/docs/enterprise-workflow.md`：进度 + Phase 4 确认

## 考虑过的替代

### 为何不用 Electron IPC 作 Tab 数据通道？

Electron IPC 会复制 Web client 已有的传输层，并让每个 shell 各自读状态。Typert Remote 搭乘现有 session 级通道，纯浏览器部署免费获得 Tab；IPC 保持为 Phase 8 的增量面。

### 为何不从 live agent 状态渲染图？

live agent 状态只能从 projection 重建；从别处渲染等于发明第二台状态机。`<cwd>/.baf/` 下的 append-only projection 是 isolate 与 Tab 共同读取的单写者。

## 后果

- Tab 仅支持读取/确认/转换；阶段执行按钮在 Phase 5 交付流水线前保持禁用。
- 轨迹图设置文案改名为「轨迹图」；两个 Tab 并存、职责分离。
