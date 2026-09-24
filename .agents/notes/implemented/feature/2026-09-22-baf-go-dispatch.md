# `/baf-go` 派单（work-order dispatch）：一个指令掌管整个工作流（全景图）

> 触发（2026-09-22，工作区 `demo_1`，变更 `change-20260922-ecum-7897`「重构ecum模块」）：客户在确认弹窗点「推进」，`open` → `clarify`、模板装好，**但模型空闲、clarify.md 一直没人填**；再敲 `/baf-go` 只重渲染同一张 fail-closed 拒绝卡（`invalid_transition` / `stage_incomplete`），客户读作「报异常 / 流程卡住」。
>
> 客户决策：「我想要一个指令 baf-go 掌管整个工作流，任何时候都可以用这个指令触发弹窗和推进流程」「应该要能够通过 /baf-go 触发继续，弹窗也好其他流程也好，要能够接着跑」。形态由客户选定：**独立只读派单条目**（插件署名，绝不渲染成客户打字/可编辑框）。
>
> 本图按「原来是什么样 → 现在是什么样」贴【变更】，文末附剩余问题排序。
>
> 验证 = `pnpm build:lib`（host + client，含 `tsc -b`）零错误；`baf-workflow` **25 文件 / 325 用例全绿**（新增 `go-dispatch.spec.ts` 15 项 + `go.spec.ts` 派单组 7 项）；`session-controller` 队列投影 7 项；`ui-chat` + `ui-trajectory` 51 项。**Web 真机（demo_1，implement/seq 14 停靠点）8/8 判定全过**（§4.1）。本轮仅 build:lib，**未打包 exe/NSIS**（Tier-2 协议）。

---

## 0. 停靠点 → 修后总览

| 「等模型补产物」停靠点 | 修前 | 修后（客户手敲 `/baf-go`） |
| --- | --- | --- |
| `clarify` / `design` / `plan` 模板已装未填（`prepareDoc` 停靠） | coordinator 不动状态，**没有任何东西唤醒模型**；再敲 `/baf-go` 得到同一张拒绝卡 | 派工单（node=clarify/design/plan，missing=`DOC_REQUIREMENTS_ZH[node]`）→ 卡片带「已派单」 |
| `open` 的 proposal 裁决门未过（`openRefusal`） | 拒绝卡 + 等模型自己回来看 | 派工单（node=open，missing=gate.missing） |
| `open` 刚推进到 `clarify`、模板装完（`advanceOpen` 成功卡） | 成功卡上写「等模型在会话中填模板」，**没人叫模型** | 同一张成功卡 + 派工单（node=clarify） |
| `implement` 等 ledger（full-go-path 任务未全 done） | 等待卡 + 静默 | 派工单（node=implement，missing=gate.missing；条件引用 `implementGate` 的 ledger 判定） |
| `verify` 失败退回 `implement`（T11） | 退回卡写「修复后再次 /baf-go」 | 退回卡 + 派工单（node=implement，`cause:'verify-failed'`） |

派单送达后：模型补产物 → **回合结束** → §22.19 orchestrator `docAdvanceDue` 自动重跑文件门并弹下一阶段裁决卡（`implement` 完成分支驱动 verify）。**填完产物后的弹窗零新增工作**。

## 1. 事件链（demo_1，修前实测）

```text
弹窗点「推进」（Tab 面，source='tab'）→ driveGo 把 open 推到 clarify、装模板
   └ gate 弹窗关闭、无人唤醒模型 → turn 结束、模型 idle、clarify.md 保持 TODO 占位
客户敲 /baf-go（source='slash'）→ clarify 文件门 fail-closed
   └ 只渲染「stage_incomplete / 缺 ## Acceptance criteria 节」拒绝卡，模型仍 idle
客户读作「报异常」
```

修后同一条路径：`/baf-go` → 拒绝卡**照旧**（门语义不动）+ 追加派单条目 → 模型在同会话开回合补 `clarify.md` → 回合结束自动弹 `design` 裁决卡。

## 2. 变更明细

### 2.1 新模块 [go-dispatch.ts](../../../../packages/baf/baf-workflow/src/go-dispatch.ts)（派单的纯半边）

【变更】新增 `DispatchSignal { changeId; node: 'open'|'clarify'|'design'|'plan'|'implement'; artifactPath; missing; cause?: 'verify-failed' }`、`GoDispatchOutcome = 'sent' | 'deduped' | 'busy' | 'unavailable'`、`GoDispatch = (signal) => outcome`。

【变更】新增 `workOrderText(signal)`：唯一内容源 = 裁决门自己的 `missing` 行 + `DOC_REQUIREMENTS_ZH[node]`（`implement` 无表行，改用 `IMPLEMENT_REQUIREMENTS_ZH`，逐字引用 `implementGate` 的 ledger 条件：done 全 true + 改动全在 allowlist——**工单不可能承诺门不检查的东西**），加四条执行要求（直接编辑产物、补齐即结束回合、需决策用 `baf_question_ask`、本单由客户敲 `/baf-go` 生成）。已经在 `missing` 里出现过的条件行会被去重，不印两遍。

【变更】新增 `workOrderMessage(signal)`：`createUserMessage({ content:[{type:'text',text}], source:{ kind:'plugin', plugin:'baf-commands', form:'go-dispatch', changeId, node, missing } })`。**绝不 `kind:'user'`**——插件源 + `form` 决定客户端把它渲染成只读 context 行。

【变更】新增 `artifactPathFor(changeId, node)`：open→`proposal.md`、clarify→`clarify.md`、design→`design.md`、plan/implement→`plan.json`（`implementGate` 判的是 `plan.json` 里的 ledger，不是 `tasks.md`）。

【变更】新增 `makeGoDispatcher(cwd, agent)`：无 `followup` 面（CLI/测试）返回 `undefined`；`agent.status === 'running'` → `'busy'`（不派、账本不记账）；账本命中 → `'deduped'`；否则 `followup(message)` + 记账 → `'sent'`。附 `resetDispatchLedger()` 测试缝。

### 2.2 [go-coordinator.ts](../../../../packages/baf/baf-workflow/src/go-coordinator.ts)（五个派单点）

【变更】`GoInput` / `RouteContext` 新增可选 `dispatch?: GoDispatch`，构建处透传。

【变更】新增 `dispatchWorkOrder(context, node, missing, cause?)`——**双保险**：`dispatch === undefined || source !== 'slash' || confirm` 直接回 `'unavailable'`（CLI、Tab、gate-card、`/baf-go-confirm`、模型工具面全部拿不到派单）。

【变更】新增 `dispatchParts(outcome, next)`：`sent` → 标题 marker「已派单」+「下一步」段改为「工单已送达本会话…模型结束回合后系统自动弹出下一阶段裁决卡」；`deduped` →「已派单 · 等待补齐」；`busy` →「模型回合进行中」；`unavailable` → **文案与派单前逐字节相同**（所以 CLI/测试/confirm 面零影响）。`successCard` 增加可选 marker 形参。

【变更】五个派单点接入：`openRefusal`（node=open）、`advanceOpen` 模板装完成功卡（node=clarify）、`prepareDoc`（签名改为收整个 `context`，三个调用点本就在作用域内；模板装好分支与 `invalid_transition` 拒绝分支都派）、`implement` 等待卡、`driveVerifyNow` 退回卡（`cause:'verify-failed'`）。

【不变】状态转换、门语义、`dueGateFor`、弹窗机制全部不动。派单是 **ask 侧下工单**，不写 projection 事件、不改状态、不是门裁决（§22.1 不变式 2 保持）。

### 2.3 [commands.ts](../../../../packages/baf/baf-workflow/src/commands.ts)

【变更】`SlashHandlerArgs.agent` 加 `followup?(message: UserMessage): void; status?: 'idle'|'running'`；`/baf-go` handler 内 `const dispatch = makeGoDispatcher(cwd, agent)` 并透传进 `driveGo`。**只有这一处**能造出 dispatcher——派单面 = 客户手敲 slash。`/baf-go-confirm` 刻意不动。

### 2.4 客户端：新 `ContextForm 'go-dispatch'`

【变更】[message.ts](../../../../packages/llm/llm/src/message.ts)：`ContextForm` 加 `| 'go-dispatch'`，`ContextFormed` 加 `{ form:'go-dispatch'; changeId; node; missing }`。

【变更】三处 form 表同步（漏一处该页签就降级 opaque 行）：[context-provenance.ts](../../../../packages/client/ui-conversation/src/client/contract/context-provenance.ts) 的 `KnownContextForm`、[event-projection.ts](../../../../packages/client/ui-chat/src/client/conversation-nodes/event-projection.ts) 的 `KNOWN_FORMS`、[trajectory-event-projection.ts](../../../../packages/client/ui-trajectory/src/client/trajectory-event-projection.ts) 的 `KNOWN_FORMS`。

【变更】[ContextBody.tsx](../../../../packages/client/ui-chat/src/client/chat/ContextBody.tsx)：新增 `GoDispatchBody`（头部 `[data-context-go-dispatch-head]`「`/baf-go 派单` · node · changeId」+ `[data-context-go-dispatch-missing]` 缺口列表 + 折叠的工单全文 `[data-context-go-dispatch-text-label]`）；`contextBody` switch 加 case，折叠摘要「`/baf-go 派单 · <node> · 待补 N 项`」。工单全文**默认折叠**——正文逐字重复上方列表，展开默认会把同一份清单印两遍并把后面的内容挤出屏幕；折叠后行内只有「该补什么」。字段不可读时回退 opaque 只读行（仍是只读，不是客户文本）。

【变更】[locale.ts](../../../../packages/client/ui-chat/src/client/locale.ts)：zh/en 各加 `message.context.goDispatch` / `.head` / `.summary` / `.text`（折叠标签）。

【回归防护】旧客户端遇未知 form → `null` → opaque 只读行（`event-projection.ts` 既有降级路径），仍不是客户气泡、无 composer。

### 2.5 队列投影：[control.ts](../../../../packages/api/session-controller/src/control.ts)

【变更】`queueItemsFromInbox`：`next-turn` 条目按来源分位——`source.kind === 'user'` → `placement:'queued'`，其余（含本派单）→ `placement:'context'`。**`queued` 是 QueueDock 提供 编辑/删除/插话 的可编辑窗口**，把插件派的工单放进那里等于给客户一份「他们没写过的话」的真实编辑权。这与既有 `next-step` 的非用户条目规则一致（`/goal` 回合驱动、任务完成通知、schedule、headless、webhook、sdk server 全是插件源）。

### 2.6 Persona 加固（belt-and-braces）

【变更】[agent.cordis.yml](../../../../packages/preset/agent-presets/presets/baf/agent.cordis.yml) baf persona 中/英各加一句：见到「【BAF 工单 · /baf-go 派单】」条目按「缺什么」逐项补齐、补齐后结束回合；并明确该条目是**客户授权的工作单，不是客户原话**。`- id: baf-commands` 行上方补设计注释（为何这不是已拆除的宿主 relay）。

## 3. 测试（as-built，全绿）

- 新 [go-dispatch.spec.ts](../../../../packages/baf/baf-workflow/tests/go-dispatch.spec.ts) 15 项：工单文本（变更/阶段/产物/缺口行/完成条件/四条执行要求/manifest 缺 implement 表行时引用 ledger/`verify-failed` 标题/缺口为空时的兜底行/条件行去重）、`artifactPathFor` 五阶段、消息 must-be-plugin-source、dispatcher（无 followup 面 → undefined；sent；同缺口 deduped；**缺口变小重派**；按 cwd/change 分账；reset 重臂；running → busy 且不记账、转 idle 后仍能派）。
- 扩 [go.spec.ts](../../../../packages/baf/baf-workflow/tests/go.spec.ts) 新组「`/baf-go` work-order dispatch」7 项：模板装好停靠点的 signal 精确断言（missing === `DOC_REQUIREMENTS_ZH.clarify`、状态仍停在 clarify/in-progress）、文档门拒绝、`open` 拒绝、implement 等待、**confirm / Tab / gate-card 零派单**、deduped/busy 文案、无 dispatcher 时文案与派单前一致。
- [control-queue.host.spec.ts](../../../../packages/api/session-controller/tests/control-queue.host.spec.ts) 新 1 项：插件源 `next-turn` 投影为 `{ placement:'context' }`，绝不进可编辑队列。
- [chat-branch-tails.client.spec.tsx](../../../../packages/client/ui-chat/tests/chat-branch-tails.client.spec.tsx)：折叠摘要「`/baf-go 派单 · clarify · 待补 2 项`」、`data-context-form="go-dispatch"`、头部与缺口列表、模型面文本、不可读字段降级。
- [event-projection.client.spec.ts](../../../../packages/client/ui-trajectory/tests/event-projection.client.spec.ts)：form 循环加 `go-dispatch`。

## 4. 验收命令

```bash
# 纯逻辑 + coordinator（仓库根跑）
npx vitest run packages/baf/baf-workflow/tests/go.spec.ts packages/baf/baf-workflow/tests/go-dispatch.spec.ts
npx vitest run packages/baf/baf-workflow/tests            # 25 文件 / 325 项
npx vitest run packages/api/session-controller/tests/control-queue.host.spec.ts
npx vitest run packages/client/ui-chat packages/client/ui-trajectory

pnpm build:lib
npx oxlint packages/baf/baf-workflow/src packages/client/ui-chat/src \
  packages/client/ui-trajectory/src packages/llm/llm/src packages/api/session-controller/src
```

Web 真机探针 = [apps/web/.demo1-dispatch-probe.mjs](../../../../apps/web/.demo1-dispatch-probe.mjs)（产物 `tmp/webwalk-demo1-dispatch/`：`log.json` / `summary.json` / 截图）。**不带需求文本**——lone-active 变更直接绑定，裸敲 `/baf-go` 即路由到 implement 停靠点（带需求文本会弹 active-conflict 门，其「放弃」选项绝不能由 harness 代点）。

### 4.1 真机结果（2026-09-22 22:12，demo_1，8/8 全过）

一次 `/baf-go`（新会话、模型 idle、implement / seq 14、`plan.json` 0/9 done）：

```text
/baf-go → 等待卡 · 已派单 + 只读「/baf-go 派单 · implement · 待补 1 项」行
        （editable=0 / composer=0 / 到达即折叠 / 工单全文在嵌套 <details>）
→ 模型自起回合（turn/start 0→1；store: inbox/spliced seq6 → user/message seq12，恰好一单）
→ 模型照单干活：plan.json 0/9 → 9/9 done、JSON 合法、allowlist 达标（+7 -6）
→ 回合结束 → orchestrator 自动驱动：implement 完成(seq15) → verify 进入(seq16)
   → verify 通过、verify-report.json 落盘(seq17) → 门 B「检查已通过，请确认归档」(seq18)
→ 看门狗零命中（【BAF 阶段工作 前缀，DOM + store 双查）
```

demo_1 现停靠在 **verify / 门 B（`awaiting-confirm verify-to-archive`）**——归档与否是客户决策，真机跑完验证腿后**刻意停在这里**。

### 4.2 探针两课（写进探针注释，防复发）

- **harness 代点门选项必须白名单精确匹配**：v1 的「暂不|稍后|取消」正则匹配到了 active-conflict 门「放弃现有变更，**稍后**再提新需求」，一次点击把受测变更 abandon 了。修复 = 手工回滚 projection journal 的 `change-abandoned`（seq15，备份 `.bak-probe-damage`）+ index 还原到 seq14；探针改为只点 `暂不处理/暂不/取消/关闭` 精确标签，含 放弃/退出/删除/拒绝/重新/确认/推进/继续 的标签**永不代点**，报为 finding。
- **zcat 数据行截断 240 字符**：`source.form:'go-dispatch'` 排在长 content 之后，被整段截掉——按 `go-dispatch` 计数恒为 0。工单计数改为数 `user/message` 行首的 `【BAF 工单 · /baf-go 派单` 标记（inbox/spliced 是另一事件类型，不会重复计）。

## 5. 剩余问题（按优先级）

1. **账本进程内**：host 重启后同缺口会再派一次。工单是幂等散文，重复无害；若要严格一次，需把 `key` 落盘到 `.baf/`（暂不做）。
2. **同缺口去重的真机腿未单独走**：真机一轮里模型直接把活干完、缺口消失，去重路径只有单测覆盖（`go-dispatch.spec` deduped/缺口变小重派 + `go.spec` 同缺口二敲）。如需真机复看：等一个模型干不完的停靠点（长 implement），10 秒内连敲两次 `/baf-go`。
3. **fast-path 泳道未派单**：`fastpath-ledger.json` 的等待分支仍是静默停靠（客户尚未在该泳道踩到；改动面与前缀一致，随时可补）。
4. **工单是散文**：模型若忽略工单（persona 未生效），系统仍无强制手段——真机本轮模型照单执行（0/9 → 9/9），但这是 §22「模型自律」观察窗口 #1 的结构性残余，下一步候选是回合末 `docAdvanceDue` 发现「本回合未改产物」时补一张提示卡（已有 3 个候选修复方案备查，客户当前决定先观察）。
5. **门 B 待客户点选**：demo_1 停在 `verify / awaiting-confirm verify-to-archive`，归档是客户决策，探针刻意不代点。
