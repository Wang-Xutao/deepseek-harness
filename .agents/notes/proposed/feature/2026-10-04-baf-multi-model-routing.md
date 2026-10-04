# Agent Note: BAF 模式多模型路由（高/中/低三档）

Status: proposed

## 需求还原

客户在 设置-工作流 提出三项路由需求：

1. **复杂度分档**：不同复杂度的任务使用不同大模型，模型分高/中/低三档；
2. **关键词触发**：可自定义关键词，命中即触发对应档位的模型；
3. **工作流状态映射**：按工作流阶段选档——设计用高级、实现用低级、审核用中级。

本文给出可直接落地的实施方案。**尚未实现**，落地时按里程碑推进并在本文勾选验收项。

## 现状地基（已建成、可直接复用）

2026-09 Phase 3 已铺好完整的企业路由地基，当前处于「已建成、未接线」状态（baseline 里全是 `<enterprise-tbd>` 占位，无生产调用方）：

| 已有资产 | 位置 | 说明 |
|---|---|---|
| `RouteProfile`（8 阶段 phases + allowed + fallback 组） | `packages/baf/baf-core/src/route-policy.ts` | 每阶段一个 provider/model |
| `EnterpriseRoutePolicy`（企业上限） | 同上 + `route-policy-loader.ts` | session 冻结的 ceiling，只收紧不放宽 |
| `resolveRoute` 解析链 | `packages/baf/baf-workflow/src/route.ts` | enterprise → phase → session-override → dsh-default，approved-only fallback |
| 阶段能力要求 | `route-policy.ts` `PHASE_REQUIRED_CAPABILITIES` | design 需 reasoning+long-context 等 |
| `BafWorkflow` 服务（freeze/resolve/审计） | `packages/baf/baf-workflow/src/index.ts` | `resolveAndAudit` 已写 `baf/route-resolved` 会话审计事件 |
| 每回合换模机制 | `packages/core/agent/src/model-selection.ts` | `installModelSelection`：`selection.current` → 覆写该回合 `agent/request` 的 provider/model |
| 会话级选模入口 | `packages/api/session-controller/src/agent.ts` | `ctx.sessionController.selectForNextRequest(agent, selection)`（落 `model/selection` 事件 + UI 投影） |
| 派单链（主接线点） | `packages/baf/baf-workflow/src/go-dispatch.ts` + `commands.ts` | `/baf-go`/门卡/Tab 点击 → `makeGoDispatcher(cwd, agent)` → `agent.followup(workOrder)` |
| 设置-工作流 页 | `packages/client/ui-baf-tracegraph`（`settings.workflow.item` 行槽） | feature 包注册行即可扩页 |

**设计原则：不新造并行路由系统。** 三档配置在编译期翻译成既有 `RouteProfile`，解析链、企业 ceiling、能力校验、fallback、审计全部原样复用。

## 总体设计

```
客户配置（设置-工作流，Remote 持久化）
  tiers: { high, mid, low } × provider/model/effort
  phaseTier: 阶段 → 档位（默认 设计=high 实现=low 审核=mid，可改）
  keywords: [ { words, tier } ]        ← 可自定义关键词
        │
        ▼ intake 时评估一次（纯函数），结果冻结到 change（复杂度档随变更走）
  taskTier = resolveTaskTier(需求文本, keywords)
        │
        ▼ 每次派单回合（/baf-go 工单）
  effectiveTier = escalateOnly ? max(taskTier, phaseTier[node]) : phaseTier[node]
        │
        ▼ 编译成 ModelRef
  resolveRoute(enterprise, profile, node, …)   ← 既有链：ceiling/能力/fallback/审计
        │
        ▼ 生效
  ctx.sessionController.selectForNextRequest(agent, selection)
        │
        ▼ 该回合请求
  installModelSelection 覆写 provider/model + 会话内切换通知
```

三条红线（与既有产品纪律一致）：

- **只路由 BAF 派单回合**（工单、门卡驱动、Tab 推进）。客户手聊回合永远用会话当前模型——不劫持客户选择；
- **企业策略优先**：有 `EnterpriseRoutePolicy` 时，三档模型必须在 allowed 内，否则走既有 approved-only fallback 并在审计记 `fallbackFrom`；
- **派单纪律不变**：路由发生在客户动作之后（`dispatchOrigin: 'customer'` 语义原样），不新增任何自动唤醒。

## 配置模型（schema 1）

```jsonc
// ~/.dsh/baf-route-config.json（host 进程级，全工作区共享）
{
  "schema": 1,
  "enabled": true,
  "tiers": {
    "high": { "provider": "deepseek-official", "model": "…", "reasoningEffort": "high" },
    "mid":  { "provider": "deepseek-official", "model": "…" },
    "low":  { "provider": "deepseek-official", "model": "…" }
  },
  "phaseTier": {                     // 缺省阶段用 defaults，允许部分覆写
    "design": "high", "plan": "high", "clarify": "mid",
    "implement": "low", "verify": "mid",
    "intake": "low", "open": "low", "archive": "low", "drift": "low"
  },
  "keywords": [
    { "words": "重构|架构|性能优化|安全", "tier": "high", "note": "复杂任务" },
    { "words": "文案|注释|README", "tier": "low" }
  ],
  "escalateOnly": true               // 关键词档只升不降：effective = max(task, phase)
}
```

校验（zod，baf-core `route-tier.ts`）：三档 provider/model 必填；`words` 按设备 locale 不区分大小写、`|` 分隔多词、整词匹配（复用 demo33 的 CJK 边界教训：中文后不用 `\b`，用字符类边界或包含匹配）；`tier` 引用必须存在；同词多规则取先命中。`enabled=false` 或三档未配齐 → 整个路由旁路（行为与今天完全一致）。

### 档位默认能力标签（编译进 RouteProfile.allowed）

| 档位 | capabilities 默认 | 依据（PHASE_REQUIRED_CAPABILITIES） |
|---|---|---|
| high | reasoning, long-context, tool-use, structured-output | design/plan 的要求 |
| mid | structured-output, tool-use, long-context | verify/clarify 的要求 |
| low | coding, tool-use, low-latency | implement/intake/open/archive 的要求 |

用户在 UI 选了不满足的模型时不硬拒——`resolveRoute` 的能力校验自然fallback 并留审计（UI 端给非阻断预警即可）。

## 决策算法（纯函数，全部进 baf-core + 单测）

```ts
// packages/baf/baf-core/src/route-tier.ts
resolveTaskTier(text: string, keywords: KeywordRule[]): { tier: Tier; matched?: string } | undefined
effectiveTier(node: WorkflowNode, taskTier: Tier | undefined, config): { tier: Tier; reason: 'keyword' | 'phase' }
compileTierRouteProfile(config, opts?): RouteProfile   // tiers+phaseTier → phases/allowed/default/fallback 组
```

- `resolveTaskTier`：按规则顺序首个命中者胜；无命中返回 undefined；
- 关键词评估**只在 intake 分类确认时跑一次**，结果写进 change projection（`taskTier` + `taskTierMatched`），中途改配置不追溯已冻结的变更——与 `freezeRouteContext` 的会话冻结语义对齐，避免同一变更前后回合模型漂移；
- `compileTierRouteProfile`：`phases[node] = tiers[phaseTier[node]]`；`default = tiers.mid`；`allowed = 三档去重`（带上表能力标签）；`fallbackPolicy.groups['tiers'] = [high, mid, low]`（approved-only，首选失败按序回落）。

## 落地点（接线，逐文件）

### M1 配置 + 服务 + Remote（约 0.5–1 天）

- [ ] `packages/baf/baf-core/src/route-tier.ts`：schema、`resolveTaskTier`、`effectiveTier`、`compileTierRouteProfile` + `tests/route-tier.spec.ts`；
- [ ] `BafWorkflow` 增配置装载：启动读 `~/.dsh/baf-route-config.json`，`enabled && 三档齐` 时 `freezeRouteContext(enterprise ?? 内置宽松策略, compileTierRouteProfile(config))`；无企业策略文件时内置一份「allowed=三档」的本地策略（个人版默认无 ceiling）；
- [ ] Remote `bafRouteConfig`（get/save/reset + `baf-route-config/changed` 事件），完全照 `dsh-baf-featured` 的 registry/service/client 三件套模板（`packages/baf/baf-featured/src/registry.ts`）。

### M2 派单接线（约 1 天）

- [ ] `go-dispatch.ts`：`makeGoDispatcher` 增可选参数 `route?: (signal: DispatchSignal) => ModelSelection | undefined`，在 `followup(workOrder)` 前调用并暂存——**纯工厂保持可测**；
- [ ] `commands.ts` 三处派单构造点（`/baf-go`、`/baf-go-confirm`、门卡/Tab 复用点）：用 `ctx.bafWorkflow.resolveAndAudit(session, node, availability, undefined, changeId)` + `selectionForTurn` 接成 `route` 回调，经 `ctx.sessionController.selectForNextRequest(agent, selection)` 生效；
- [ ] intake 冻结：`begin-intake.ts` 分类确认时评估 `resolveTaskTier` 并写入 change projection；
- [ ] 审计：既有 `appendRouteResolved`（`route-audit.ts`）已写 `baf/route-resolved`，补 `tier`/`reason` 字段。

### M3 设置 UI（约 1–1.5 天）

- [ ] 新包 `packages/client/ui-settings-baf-route`：注册 `settings.workflow.item` 行 `id: model-routing`（「多模型路由」）：
  - 总开关 + 三档卡片（provider/model 下拉，选项来自 `session/modelCatalog`，支持手输）；
  - 阶段映射表：9 行（8 阶段 + drift）× 档位分段控件；
  - 关键词列表：增删行（词组 + 档位 + 备注）；
  - 「预演」输入框：一段任务描述 → 显示 `resolveTaskTier` 将命中的档位与规则（纯函数本地跑，不发请求）；
  - 保存走 Remote；校验错误行内提示；`changed` 事件刷新。
- [ ] 工作流 Tab「当前路由」行：读 `RouteStatusView`（`buildRouteStatusView` 已有），显示各阶段 preferred/actual 与 fallback 状态。

### M4 可选增强（0.5 天）

- [ ] verify 失败升级：T15 升级通道触发时用 `max(tier, mid)` 重试（「审核不过 → 换更强模型再审」的状态路由延伸）。

## 风险与边界

| 风险 | 处置 |
|---|---|
| 换模会在会话插 `[model changed: …]` 通知 | 接受（`installModelSelection` 既有行为）——客户看得见每阶段用了哪个模型，正是需求要的可视性；不希望可见可改用 `selectionFor(agent).current`（不落日志），默认选可审计版 |
| 会话模型选择器随派单翻转 | `model/selection` 投影更新 composer 显示——与上一条同源，视为特性；`escalateOnly` 保证只升不降减少来回跳 |
| 企业 allowed 不含所选模型 | 既有 approved-only fallback + 审计 `fallbackFrom`；UI 在企业模式下显示 ceiling 提示 |
| 关键词误命中（常见词升档） | `escalateOnly` 默认开 + 预演框让客户先试规则；规则按声明顺序首个命中，可调整顺序 |
| 配置只影响模型档位 | 不触碰 tools/guard/权限——guard 门禁与模型路由正交 |
| GitHub/供应商不可用 | `ProviderAvailability.isAvailable` 拒绝 → fallback 组内回落，`model_fallback_blocked` 时工单照发（当前会话模型），路由失败不阻塞派单 |

## 验收清单

- [ ] 三档各配不同模型后，design/plan 工单回合请求头是 high 档模型，implement 是 low 档，verify 是 mid 档（看 `baf/route-resolved` 审计 + 会话 request header）；
- [ ] 需求文本含关键词「架构」时 intake 冻结 taskTier=high，后续 design 回合仍为 high（即使 phaseTier 被改成 mid）；
- [ ] `escalateOnly=false` 时 implement 回合被关键词降到… 不降——`max()` 只升；改为 exact 模式（`escalateOnly` 关）时按 phaseTier 走；
- [ ] 客户手聊回合模型不变（不产生 `model/selection` 事件）；
- [ ] 设置页改动即存即生效（下一个工单用新配置），`changed` 事件多端同步；
- [ ] `enabled=false` 时行为与今天完全一致（全链路旁路，无审计噪音）；
- [ ] 企业策略存在且不含 high 档模型时：design 回落 mid 并在审计可见，工单不失败。
