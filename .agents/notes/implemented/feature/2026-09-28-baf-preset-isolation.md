# 2026-09-28 · BAF 预设隔离 — 工作流/安全门禁/指令只作用于 BAF 模式

> 用户问题（原文）：「有一个严重的问题，baf模式的工作流和安全门禁只适用到baf模式下，
> 不要影响其他模式，比如标准模式等。同时baf指令这些也都只适用baf模式，其他模式不要支持。
> 请修改，既要保证baf模式能够正常使用，又要保证不能影响其他模式。」

## 0. TL;DR

BAF 的模型侧表面（/baf-* 指令、baf_gate_ask / baf_question_ask 工具、agent 事件、
session 事件、工作流页签）**本来就是预设作用域的**——它们经 ScopedLayers /
`scopeTarget` 载体注册，标准模式 agent 的 scope 链上看不到。真正越界的只有两条
**宿主平面的 per-agent 通道**，本批修复把它们全部收进预设作用域：

| 越界路径 | 位置 | 后果（修复前） | 修复 |
|---|---|---|---|
| A1 挂载期 `agents.list()` 全量扫装 | `baf-guard/install.ts`、`baf-workflow/session-gate.ts` | 第一个 BAF 会话（或冷读一份 BAF transcript）挂起 baf 常驻挂载时，旁边**已经活着**的标准模式 agent 会被装上 BAF 硬门禁 + 启动门提示词段 | 扫装前过 `presetCovers` 成员判定 |
| A2 `agent-preset/selected` 缺同步 / 硬编码 id | 同上两处 | 空白会话从 BAF 切到标准模式后硬门禁**永不卸载**；反向（标准 → BAF）session-gate 已修但按字面 id 比较，**用户复制的 BAF 预设副本会被误卸载** | 两行都改为按 scope 链判定的 install/dispose 同步 |

验证：baf-workflow + baf-guard 全量 422 用例绿（含 3 个新 spec）；`pnpm build:lib`
全绿；产物已核对（`presetCovers` 进 lib、跨包 import 正确解析）。

## 1. 作用域架构回顾（为什么大多数表面已经隔离）

- **预设常驻挂载（standing mount）**：`packages/preset/agent-presets` 把每个预设的
  插件树挂在一个以 `{agentPreset: id}` 为 key 的 scope 下，agent 通过
  `bindScopeParent(agent, presetKey)` 加入预设；`recompose`（空白会话换预设）只做
  `binding.rebind()` 重链，**不重发 `agent/created`**。
- **ScopedLayers**（`dsh-scope/store.ts`）：commands、tools、systemPrompt section
  从带 scope 的 ctx 注册时进该 scope 的层——只有 scope 链经过该层的 agent 可见。
  → `/baf-*` 指令（`baf-workflow/commands.ts` 经 `ctx.commands.register`）、
  `baf_gate_ask`/`baf_question_ask` 工具、启动门提示词段本身都天然按预设隔离。
- **事件载体的方向性**（`dsh-scope` `scopeTarget`）：`agent/created`/`agent/disposed`
  经 `scopeTarget(agent, agent)` 派发——带标签的监听者只有当自己的标签在**载体 key
  的祖先链**上才被送达（事件只向上流动）。常驻挂载的行只会听到自己预设下的 agent。
- **例外——两条 per-agent 通道**：`baf-guard-install` 与 `baf-session-gate` 两个行
  需要触达宿主平面的 `agents` 服务（进程级注册表），它们挂在常驻挂载里，但
  `agents.list()` 是**不分区**的全量列表，`agent-preset/selected` 是**不带载体**的
  字符串名事件（全 app 广播）——这正是 A1/A2 两条越界路径的成因。

## 2. 【变更】修复内容（4 个文件 + 依赖）

### 2.1 `baf-workflow/src/preset-cover.ts`（新增）

共享成员判定谓词：

```ts
export function presetCovers(ctx: Context, agent: { ctx: Context }): boolean {
  const own = scopeOf(ctx)
  if (own === undefined) return true          // 无 scope 的行 = CLI/测试组合，保持全覆盖
  return scopeChainOf(scopeOf(agent.ctx)).includes(own)
}
```

要点：

- **按挂载判定、不按预设 id**——用户复制 BAF 预设得到自己的常驻挂载，副本下的
  agent 由副本自己的行覆盖，原预设的行够不着（反之亦然）。
- **无 scope 行降级为全覆盖**：CLI / 测试组合里这些行宿主平面直挂、不存在第二个
  预设，旧行为必须保留（既有 wiring 契约测试用 mock ctx，全部无 scope → 依然绿）。
- 配套同步契约（模块注释中固化）：每个扫装 / `agent/created` 安装都要配一个
  `agent-preset/selected` 监听重估同一谓词——进入装、离开卸，agent 换预设后落到
  与其实际组合完全一致的状态。

### 2.2 `baf-guard/src/install.ts`（改）

- 扫装：`for (const agent of ctx.agents.list()) if (presetCovers(ctx, agent)) install(agent)`。
- 新增 `agent-preset/selected` 监听：按链判定 install / dispose（此前完全缺失——
  这是「离开 BAF 后硬门禁永不卸载」的根）。type-only 引入
  `dsh-agent-preset-registry/types` 拿事件声明，运行时仍只从 scope 链读成员关系。

### 2.3 `baf-workflow/src/session-gate.ts`（改）

- 扫装同样过 `presetCovers`。
- `agent-preset/selected` 监听从 `agentPreset === 'baf'` 字面比较改为
  `presetCovers` 链判定（保留 2026-09-25 demo8 回归注释并【变更】标注）。
  字面比较的两处伤：离开 baf 用 `!== 'baf'` 卸载会误卸**副本预设**的启动门；
  副本进入时 `=== 'baf'` 不成立又会漏装。

### 2.4 `baf-workflow/src/index.ts` + 两包 package.json

- `index.ts` re-export `presetCovers`（供 `dsh-baf-guard/install` 运行时引用）。
- baf-workflow deps 增 `dsh-scope`；baf-guard devDeps 增测试所需六包（scope/
  system-prompt/tools/llm/session/agent-preset-registry）。

## 3. 【变更】测试（3 个新 spec，全绿）

| spec | 覆盖 |
|---|---|
| `baf-workflow/tests/preset-cover.spec.ts`（5 例） | 谓词本身：无 scope 行全覆盖；按挂载精确覆盖；rebind 随链移动成员（recompose 路径）；副本预设只认自己的行；被覆盖 agent 的嵌套子域（子代理扇出）仍覆盖 |
| `baf-guard/tests/install-scoped.spec.ts`（1 例，真 Cordis 树端到端） | 真 ToolRuntime + 真 `createBafToolGuard`：标准 agent 先于挂载存活→扫装跳过（`mkfs` 探针命令照常执行）；baf agent 经自己载体 created→被硬门禁拒绝（`dangerous_command`）而 `echo` 放行；标准 agent 的 created 载体到不了 baf 行；rebind+selected 离开→门禁卸载、回来→重装；副本预设由自己的行覆盖 |
| `baf-workflow/tests/session-gate.spec.ts` 新增 preset isolation 描述（1 例） | 真 SystemPrompt `assemble({scope})` 观察 `baf:session-gate` 段：扫装跳过标准 agent；created 装上；rebind+selected 离开卸段、回来复装 |

测试手法备忘（复用价值）：真 `new Context()` + `ctx.provide('agents', …)` 假注册表 +
`createScope`/`bindScopeParent` 铸真 scope；`ctx.serial(scopeTarget(agent, agent),
'agent/created', …)` 真派发；`binding.rebind()` + `ctx.emit('agent-preset/selected',
id, presetId)` 模拟 recompose；观察通道走真服务的公开行为（工具执行被拒 /
assemble 出段），不窥内部 fibers。安装/卸载是异步 fiber 激活，断言一律
`vi.waitFor`。

## 4. 隔离面全景表（修复后状态）

| 表面 | 机制 | 状态 |
|---|---|---|
| `/baf-*` 斜杠指令 | ScopedLayers（commands），常驻 ctx 注册 | ✅ 原有 |
| `baf_gate_ask` / `baf_question_ask` 工具 | ScopedLayers（tools） | ✅ 原有 |
| BAF 工具硬门禁（guard） | `baf-guard-install` 行 per-agent inject | ✅ 本批收口（A1+A2） |
| 启动门提示词段 + 欢迎卡 | `baf-session-gate` 行 per-agent inject | ✅ 本批收口（A1+字面 id） |
| `agent/created` / `agent/disposed` | `scopeTarget(agent, agent)` 载体 | ✅ 原有 |
| `session/event`（auto-pop / orchestrator） | 会话载体按创建者 scope | ✅ 原有（排查确认非泄漏） |
| 工作流页签（Web Tab） | 客户端按 `agentPreset === 'baf'` 投影 | ✅ 原有 |
| `agent-preset/selected` 广播本身 | 字符串名事件，全 app 广播 | 按 id 语义本就该全局；监听侧已全部改为链判定 |

## 5. 剩余风险 / 不平整点（按 可见性 × 修复成本 排序）

1. **已安装 profile 才是运行时**（中可见 / 低成本，操作项）：改动在 repo bundle 内，
   `dsh web` 从 `~/.dsh/profiles/web/` 跑——验证前必须同步已装 profile（既有流程），
   否则现场复现的还是旧行为。
2. **`agent-preset/selected` 双行竞争**（低可见 / 低成本）：事件无载体全 app 广播，
   baf 与副本两个常驻挂载的行都会收到；靠各自 `presetCovers` 判定互不误装——谓词
   测试已钉死，但「同一 agent 短时间内反复切换」时两个行的 install/dispose 都是
   fire-and-forget 异步 fiber，极端竞速下卸载可能晚于下一次装载（`fibers.has` 去重
   兜底，最坏是晚一拍卸掉，不是双装）。
3. **`agents.list()` 快照语义**（低可见 / 高成本）：扫装用的是调用时刻的快照，依赖
   `agent/created` 监听补增量；宿主侧若存在「先 list 后 created 重放」窗口，理论上
   漏装一拍（现状与修复前一致，`agent/created` 载体路径一直在）。
4. **CLI/测试组合的全覆盖语义保留**（信息项）：无 scope 的行覆盖一切是刻意保留
   （CLI 单预设世界）；若未来 CLI 也引入多预设，需要给 CLI 组合补 scope key。
