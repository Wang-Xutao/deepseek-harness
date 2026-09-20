# BAF 跨 isolate 服务解析修复 + 卡片首行统一（全景图）

> 配套本轮修复（§22.17 H，2026-09-20 下午）：两起生产事故的共同根因——`baf-domain` isolate 服务对一切 `ctx.get` 不可见——修在唯一的合法通道 `agentPresets.serviceFor` 上；同时把所有 BAF 卡片首行统一为「点本行展开/折叠详情」、把「用通用提问工具自创工作流选项」明确立法禁止。本图按「原来是什么样 → 现在是什么样」贴 `【变更】`，文末附剩余问题排序。
>
> 关于产物：**没有**生成 `baf-dsh.exe`（用户明确「先不要生成，先确认问题」）。验证 = `pnpm build:lib` 零错误；`packages/baf/ + packages/client/ui-baf-workflow/tests/` 31 spec / 280 用例全绿（其中一轮满载并跑出现 5 例跨文件 timeout、复跑全绿——均为未改动文件上的机器负载 flaky；另把 session-gate 的 `vi.waitFor` 默认 1s 超时放宽到 10s，钉死「仅一次」断言不受负载影响）；根 oxlint 对本轮触碰行零告警（顺手修掉本会话早前引入的 3 处 stylistic 告警 + 1 处既有引号告警）。

---

## 0. 两起事故与一句话根因

**事故一**（`tmp/session/1.jsonl`，§22.17 已修）：门上 `baf_gate_ask` 只返回文本卡、不弹框 → P4 弹窗通道修复。

**事故二**（`tmp/session/2.jsonl`，本轮修）：模型全程行为正确——加载 baf-go 技能 → 检查工作区 → `baf_gate_ask {"gateId":"scaffold"}` → 弹窗弹出 → 客户点「初始化工作区」→ **工具返回 `✗ 初始化服务没有加载`**。此后模型被组件真空卡死，转而用 `ask_user_question` 自创三个选项（「检查/加载预设后重试 / 今天先不动了 / 告诉我怎么加载预设」），把客户引去手动改预设配置——工作流死锁在初始化之前。

**一句话根因**：`bafScaffold / bafQuality / bafGuard` 发布在 preset 的 `baf-domain` **isolate** 组里；isolate realm 对「声明它的组之外」不可见——宿主行 `ctx.get` 看不见，**agent 自己 realm 的 `ctx.get` 也看不见**（[agent-presets/src/index.ts:610-627](../../../../../packages/preset/agent-presets/src/index.ts) 的 API 文档原文：isolate realms "are invisible outside the group that declares them — including to the host"）。此前所有「agent realm 优先、宿主 ctx 兜底」的两域解析在桌面真机上**从未取到过服务**；测试全绿是假象——测试直接往 ctx 注入服务，没有 isolate 边界。

```
弹窗点击「初始化工作区」                        ← 正常（userQuestions 在 isolate 外）
  → driveGateResolve(gateId='scaffold', optionId='init')   ← 正常（注册表派发）
    → toolDriveAdapters → resolveScaffoldService            ← ✗ 双 get 皆盲 → undefined
      → driveScaffold 报「初始化服务没有加载」               ← 客户看到的死锁卡
```

---

## 1. `resolveIsolateService`：唯一合法的跨 isolate 读通道

【变更】[session-gate.ts](../../../../../packages/baf/baf-workflow/src/session-gate.ts) 新增导出：

| 通道 | 条件 | 行为 |
| --- | --- | --- |
| 1. `ctx.get('agentPresets').serviceFor(agent, name)` | agent 带 realm ctx | 平台为跨 isolate 读**专门发布**的 API（session-controller / skill-catalog / settings-controller 同款；实现在 [mount.ts `serviceForAgent`](../../../../../packages/preset/agent-presets/src/mount.ts)：standingMount → 扫 `ctx.reflect.store` 符号 → `withinFiber` 匹配） |
| 2. 两域 `get`（agent realm → 行 ctx） | serviceFor 未命中 / 无 agent | CLI、vitest、无 isolate composition 的兜底，兼容既有全部测试注入方式 |

调用面**全部切换**到它：

| 调用点 | 修前 | 修后 |
| --- | --- | --- |
| `probeMountFlags`（欢迎卡「检查组件」行 / doctor） | 双域 get | `resolveIsolateService('bafGuard'/'bafQuality')` |
| `resolveScaffoldService`（scaffold 解析本体） | 双域 get | 同上（name `bafScaffold`） |
| [gate-dialog.ts](../../../../../packages/baf/baf-workflow/src/gate-dialog.ts) `toolDriveAdapters`（弹窗派发三 adapter） | 双域 get | `resolveIsolateService` ×3 |
| [commands.ts](../../../../../packages/baf/baf-workflow/src/commands.ts) `resolveAdapters`（verify/quality/guard 斜杠行） | 仅行 ctx get | 增 agent 形参 + `resolveIsolateService` ×2 |
| commands.ts `resolveDriveAdapters`（§18 协调器） | 混合 | 同源统一 |
| [cmdline.ts](../../../../../packages/baf/baf-workflow/src/cmdline.ts) scaffold 解析 | 既有 realm 兜底 | 复用新 `resolveScaffoldService`，语义不变 |
| [ui-baf-workflow/src/index.ts](../../../../../packages/client/ui-baf-workflow/src/index.ts)（Tab Remote） | `agentRealmFor` 双域 get | `liveAgentFor`（拿 agent 本体喂 `serviceFor`）+ `resolveIsolateService` / `resolveScaffoldService` |

【变更】`makeGateAsk`（userQuestions 解析）**保持**两域 get——它取的服务由 isolate 外的 `tool-ask-user` 行发布，两域可见，不属于本 bug 面（enterprise-workflow.md §22.17 A 已加注区分）。

---

## 2. 卡片首行统一「点本行展开/折叠详情」

【变更】用户要求「所有 baf 指令首行都要以『点本行展开/折叠详情』结尾」。逐处收口：

| 文件 | 修前 | 修后 |
| --- | --- | --- |
| commands.ts `withHint` | 指令全文 | 详情 |
| command-drives.ts `cardTitle` / 错误卡 `${command} · ${error.code}` / `${command} · 失败` | 指令全文 / **无后缀** / **无后缀** | 详情 ×3 |
| cmdline.ts `cardTitle` / missingCwd | 指令全文 | 详情 |
| go-coordinator.ts `errorCard` marker 分支 | 指令全文 | 详情 |
| gate-cards.ts 门卡成功行 / 「信息不全」行 / 「无法识别的确认项」行 | **无后缀** ×3 | 详情 ×3 |
| session-gate.ts 欢迎卡 headline | 详情（已是） | 不变 |

【变更】文档同步：enterprise-workflow.md §18.5 门卡标题 ×2、§19.3 drift 卡示例、§20.2 标题约定（加「统一后缀」注记 + 三行示例）、§20.3 欢迎卡示例——全文 `指令全文` 清零。

---

## 3. 防真空自创：立法禁止通用提问工具代门

事故二里模型的两次 `ask_user_question`（预演分类三问 / 组件缺失后自创三选项）都违反 §22「工作流决策只能走注册表」的立法精神，但规则文本没点名通用提问工具，模型有发挥空间。三处同步加严（enterprise-workflow.md §22.9 记为规则第 5 条）：

- 【变更】session-gate.ts 规则新增：「不得用通用提问工具（如 ask_user_question）替代确认门、预演分类或为工作流决策自创选项：初始化、分类、确认门、放弃、复位等工作流决策只能经 baf_gate_ask 弹出的注册表选项或对应斜杠指令；通用提问工具只用于与工作流走向无关的澄清。」
- 【变更】[gate-ask.ts](../../../../../packages/baf/baf-workflow/src/gate-ask.ts) 工具描述加同义英文段（模型读的就是这段）。
- 【变更】[skills/baf-go/SKILL.md](../../../../../packages/preset/agent-presets/presets/baf/skills/baf-go/SKILL.md) Hard rule 6 追加同款禁令。

## 4. 提示语去术语

【变更】scaffold 组件缺失卡（commands.ts / command-drives.ts / cmdline.ts 三处同文）：「请检查工作流预设是否加载了 baf-scaffold（isolate 组内）后重试」→「请在设置里启用 BAF 工作流预设（含全部 BAF 组件）后，重新打开本会话再试」。「isolate 组内」是实现细节，不进客户卡。（根因修复后此卡在正常桌面路径已不可达，仅防御性保留。）

---

## 5. 测试与验证

| 项 | 内容 |
| --- | --- |
| session-gate.spec +4 | serviceFor 命中（双 get 皆盲、唯 serviceFor 可见——**生产事故回归测试**，注释点名 2.jsonl）；get 兜底（agent 域盲、行 ctx 命中 / 无 agent 只查行 ctx）；双盲 → undefined 不抛 |
| gate-dialog.spec +2 | `toolDriveAdapters` 经 serviceFor 解析三 adapter；双盲时三 adapter 全缺省 |
| go.spec.ts:484 | 注释里钉的首行格式 指令全文 → 详情（断言本身用 `toContain` 不受影响） |
| 全量 | 31 spec / 280 用例绿（修前 275）；`pnpm build:lib` 零错误；根 oxlint 本轮触碰行零告警 |

环境性失败（与本轮无关、修前即有）：`packages/preset` mount.spec 会话隔离 6 例 + discovery.spec Windows symlink EPERM；满载并跑时未改动文件偶发 timeout（复跑全绿）。

## 6. 剩余问题（按 客户可见度 × 修复成本 排序）

1. **真机回归待做**（高可见 / 零代码）：本轮修复尚未打进 exe——`resolveIsolateService` 的 serviceFor 通道在真实 isolate 组合下的端到端效果（弹窗点「初始化工作区」→ 真的生成 `.baf/`）只有真机能证。等待用户确认后打包 `--dir` 版实测。
2. **preset 行注释陈旧**（不可见 / 低成本）：`agent.cordis.yml` 各 BAF 行注释里可能还有「agent realm 可见」一类旧描述，本轮只改了代码侧注释；下次动 preset 时顺手核对。
3. **规则是软约束**（中可见 / 中成本）：第 5 条规则靠模型遵守；硬防线是在 tool-guard / tools 层对 `ask_user_question` 做「工作流上下文内降权/拦截」，需要 baf-guard 配合，值得单独立项。
4. **欢迎卡「检查组件」行曾在真机误报缺失**（修后应消失）：本轮 probeMountFlags 同走 serviceFor，但同样待真机回归确认（见 1）。
