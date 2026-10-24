# Agent Note: 合并上游 master 时用通用 stepRouteResolver 接缝保住 baf 的 auto 路由

Status: implemented

[English](2026-10-24-upstream-master-merge-route-resolver-seam.md) | 中文

## 问题

上游 master 把模型所有权移出了 session controller：`packages/core/agent/src/model-selection.ts` 引入了 `AgentModel` 面与 `modelSelectionProjectionDefinition`，`ApiSessionAgentController` 也不再提供 `selectionFor` / `selectForNextRequest` / `consumeSelection` / `installSelection`。

baf 的多模型「auto」路由原本在 session controller 内解析 auto 伪模型，上游这次重构正好拆掉了 baf 唯一的接入点。若直接合并 master，auto 路由要么消失，要么得把 baf 私有知识塞进上游包。

## 决定

- 接缝由上游拥有。`packages/core/agent-loop/src/route-resolver.ts` 定义 `stepRouteResolver` 服务契约（`resolveStepRoute(session, route)`）与上下文查找器（`resolveStepRoute(ctx, session, route)`）；agent loop 每步的路由读取走它（`packages/core/agent-loop/src/agent.ts`）。
- baf 在 `packages/baf/baf-workflow/src/route-auto.ts`（`BafRouteAutoRuntime`）实现该契约，并以服务名 `stepRouteResolver` 通过 `ctx.provide` 注册。上游永不 import baf 包，依赖方向保持单向。
- `packages/api/session-controller` 保留面向 baf 的桥（`route-auto-bridge.ts`：`routeAutoOf` / `autoCatalogGroups`），但不再拥有模型选择：`selectForNextRequest` 即 `agent.model.select`，`rawSelectionOf` 即 `agent.model.current()`。
- auto 伪模型的解析顺序：baf 路由配置里的档位路由 → 会话上次请求路由 → 部署默认。伪模型绝不进入 provider。
- `model/selection` 事件照旧记录伪模型；`request/header` 记录解析后的档位模型。
- 整次合并的策略：双方都新增的取并集；上游删除或重构掉的 API，按新架构重基 baf，而不是复活旧实现。

## 备选方案

### 为什么不在 session controller 里继续解析？

session controller 在上游已不拥有模型选择，解析器放在那里就得伸手进 `AgentModel` 状态再推一遍每步路由。这等于把上游刚拆掉的耦合又装回去，下次上游重构会再坏一次。

### 为什么不让上游依赖 baf 的路由包？

那样上游的 agent loop 就依赖 baf 包，每个上游使用者都要带上 baf 路由代码，上游树也不再能独立使用。服务契约让依赖保持单向：上游声明接缝，baf 提供实现。

### 为什么不在会话级解析一次，而不是每步解析？

会话级解析会把模型固定在整个会话期间，会话内变化的档位就看不见了——同一次任务里的关键词升档、验证阶段该切到 Reviewer 的绑定，都会停在第一次的选择上。每步读取才让关键词升档与阶段绑定真正生效。

### 为什么不复活上游删掉的 selection API？

上游那次重构是有意为之：模型所有权搬进 `AgentModel` 面，好让投影只有一个事实来源。在 session controller 里复活 `selectForNextRequest` / `installSelection`，等于给同一个事实再放一个写者。

## 后果

- baf 的 auto 路由不靠任何上游包知道 baf 就扛过了上游模型选择重构，这个接缝也能被别的路由策略复用。
- `packages/api/session-controller` 失去了它曾暴露的写选择 API，调用方改走 `AgentModel`；baf 桥保留的读面（`routeAutoOf`、`autoCatalogGroups`）没变。
- 上游对模型选择投影的任何改动，现在只经一次服务调用到达 baf，不再穿过 session controller 内部，上游重基时触及的 baf 文件更少。
- 合并本身按「双方新增取并集」处理依赖、导出与 CSS 类，按「上游删除的 API 逐个重基」处理旧接口。`packages/README.i18n.yaml` 与六语字典是重算的而不是照抄，所以 baf 的键在上游如今提供的每种语言里都在。
- 合并还暴露出 baf 自己的 preset 里有一行失效插件行；那次修复记在 [preset 行体检笔记](../process/2026-10-24-baf-plugin-row-health-check.zh.md)。

## 测试

- `pnpm run typecheck` 五关全过；`pnpm run build` 十关全过。
- `packages/baf/baf-workflow/tests/route-auto.spec.ts` 覆盖解析器契约与服务注册；`packages/api/session-controller/tests/route-auto-bridge.host.spec.ts` 覆盖桥在新 `AgentModel` 面下的行为。
- 合并后的 web 真机走查确认了 baf 界面：BAF 徽标、侧栏「工作流」面板、「BAF 模式」预设座、直接「设置」触发器、四个带 baf 徽标的设置分区，以及多模型路由区的五个页签与 Commander / Reviewer / Worker 三档。
- 打包后的桌面产物经 CDP 探针（`overlay/scripts/probe-merge-exe.mjs`）确认随包字节真的带上实现：`dsh-agent-loop/lib/index.js` 有 `stepRouteResolver`，`dsh-baf-workflow/lib/route-auto.js` 有它的实现。

## 相关

- [preset 行体检笔记](../process/2026-10-24-baf-plugin-row-health-check.zh.md)
- `docs/upgrade-guide/v0.2.1-rc.1/subagent-control-tools/guide.md` — preset 修复所依据的上游迁移说明。
