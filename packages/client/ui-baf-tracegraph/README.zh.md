# @deepseek-ai/dsh-client-ui-baf-tracegraph

[English](README.md) | 中文

BAF overlay 会话视图 **轨迹图**（`trace-graph`）：带图标与动效的会话统计条、带每轮独立时长与 token 计数的轮次导航、带 hover/click 抬升与颜色光晕的 REQUEST→RESPONSE→TOOL 流水线卡，以及通过 `sessions.ensureOpen` 在不切换当前会话的前提下 inline 打开子 Session 轨迹的编排成员区；同时新增「工作流」设置页（nav 顺序 20），提供 `baf-workflow.showTraceGraph` 开关控制该 Tab 是否挂载。

消费既有 Trajectory target 快照与 Chat `workflow-run` 节点；不替代「轨迹」标签页。

## 设置

插件注册一个 `settings.section` 条目 `workflow`（侧栏顺序 20），并声明持久化命名空间 `baf-workflow`，包含一个字段：

| 字段              | 类型      | 默认值  | 对会话视图的影响                                  |
| ----------------- | --------- | ------- | ------------------------------------------------- |
| `showTraceGraph` | `boolean` | `true`  | 为 `true` 时挂载"轨迹图"标签页。关闭即下轮渲染移除。 |

## 模型体验

无。

#### KV Cache 影响

无。

## 已知局限与延后工作

- workflow 脚本 / log / 输出详情不在本表面（未持久化进 Session）。
- 进行中步骤耗时保持空白，与轨迹一致。
- 子会话 inline 加载要求子 Session 仍在列表资格内（或已有 scope）。