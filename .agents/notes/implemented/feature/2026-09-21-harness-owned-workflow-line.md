# BAF 编排权收归 harness：单一铸造 · 弹窗单飞 · 排序统一 · bind 门 · orchestrator · Tab 实时推送（全景图）

> 配套本轮修复（§22.19，2026-09-21）：用户原则（不可协商）——「工作流是一条固定的单线，什么时候弹窗、什么时候等输入、什么时候推进全部固定在代码里；所有工作流控制归 agent（harness 代码），与项目无关，大模型不能操控和跳过转移，只做业务逻辑；弹窗卡一律 agent 弹，工作流需要或大模型反馈需要用户选择时强制弹」。触发事件 = 真机 web 端 session 7.jsonl 六连锁事故（R1 双铸 / R2 弹窗覆盖 / R3 三套排序 / R4 多活动纯文字卡 / R5 Tab 纯拉取死画面 / R6 模型终局散文）。本图按「原来是什么样 → 现在是什么样」贴【变更】，文末附剩余问题排序。
>
> 验证 = `tsc -b` host + client 两面零错误；baf-integration **34 文件 / 360 用例全绿**；ui-baf-workflow + api-remotes（thread-safe）**5 文件 / 22 用例绿**。本轮仅 build:lib，**未打包 exe/NSIS**（用户指示：web 调试完一起打包）。

---

## 0. 事故链 → 修后总览

| session 7.jsonl 事故 | 修前 | 修后 |
| --- | --- | --- |
| R1 同一句话双铸两条变更 | auto-pop 预问与模型 `baf_gate_ask` 并发，各自检查时对方未落盘（TOCTOU）；`driveOpen` 零守卫，5 个 mint 面全走它 | **beginIntake 单一铸造**：per-cwd 互斥 + 锁内重读 index；三态 minted/reused/refused-active；全部 mint 面收编 |
| R2 第二张卡盖掉第一张 | 平台允 N 个并发 ask，客户端同优先级后到顶先到 | **ask-queue 每会话单飞**：BAF 内一切 ask 只经 FIFO 队列（key 去重 + moot + abort）；同时至多一张 BAF 卡在飞 |
| R3 写 A 被要求先确认 B | guard 按 updatedAt / Tab 按字典序（含终态）/ 驱动按 pickActiveChange | **一套排序**：写入路径 → 会话 focus → pickActiveChange（seq 降序）；guard 与 Tab 兜底全部改走它 |
| R4 多活动绑定纯文字「回复 change=`<id>`」 | `/baf-go` ≥2 活动从不走 userQuestions | **bind-workflow 注册门**：动态候选「接手 `<id>`」，点选 → focus 记录 → 同一解析面派发；暂停回停卡 |
| R5 Tab 停在「已放弃」死画面 | 纯拉取：仅 mount/聚焦/可见/手动刷新 | **进程内全局投影总线 + 常驻 store 池 → 转发事件 → 客户端 200ms 尾去抖 + 2s 可见轮询**；Dashboard 行可点；终态死端出「回到进行中的变更」 |
| R6 模型手把手教斜杠命令 | 被拒后散文「A/B 二选一 + 请点工作流页签 / 敲 /baf-xxx」 | **orchestrator 宿主行**：每 completed 回合由系统重derive 停靠点并弹到期门；规则面明令模型不得指导客户点页签/敲命令 |

## 1. beginIntake 单一铸造入口（R1）

【新增】[begin-intake.ts](../../../../packages/baf/baf-workflow/src/begin-intake.ts)：`beginIntake(cwd, rawInput, source?)` per-cwd 进程内互斥（Promise 链）+ **锁内重读 index**（杀 TOCTOU）；零活动 → minted（原 driveOpen 函数体：校验+baseline+intake+focus.set，记录 lastRequirement）；唯一活动是未确认 intake 且同需求 → reused（重启无记录时无条件复用，绝不双铸）；其它 → refused-active（携排序活动列表）。

【变更】[command-drives.ts](../../../../packages/baf/baf-workflow/src/command-drives.ts)：`driveOpen` 签名不变、内部委托 beginIntake（斜杠面与既有测试零改动）；三处「事后 diff index 识别刚铸变更」改读结构化结果；`driveGateResolve` 新第 6 位参数 `bindCandidates?: readonly string[]`（change-targets 选项臂 + `/baf-go` 派发 duplicate-change= 守卫）。

【变更】[gate-ask.ts](../../../../packages/baf/baf-workflow/src/gate-ask.ts) / [auto-pop.ts](../../../../packages/baf/baf-workflow/src/auto-pop.ts) / [go-coordinator.ts](../../../../packages/baf/baf-workflow/src/go-coordinator.ts)：mint 识别全部改结构化（reused → set focus；refused → 弹 active-conflict）。

【变更】[ui-baf-workflow/src/index.ts](../../../../packages/client/ui-baf-workflow/src/index.ts)：Tab remote `startIntake`（原直调 `service.intake`，第 5 个无守卫 mint 面）收编走 beginIntake。

## 2. ask-queue 弹窗单飞（R2）

【新增】[ask-queue.ts](../../../../packages/baf/baf-workflow/src/ask-queue.ts)：`enqueueAsk({sessionId, key, isMoot?, signal?, run})`——每会话 FIFO；**同 key 在队/在飞 → dropped/duplicate**（三路同门收敛机制）；队首 moot 重检；AbortSignal 桥接。

【变更】[gate-dialog.ts](../../../../packages/baf/baf-workflow/src/gate-dialog.ts)：`askGateDialogQueued` 包装（key `gate:<gateId>:<changeId>`），全部弹卡调用方改走它；GateDialogInput + `bindCandidates`。

【变更】auto-pop 预问入队（key `autopop:<sid>` + per-agent AbortController，agent/disposed 中止）；[question-ask.ts](../../../../packages/baf/baf-workflow/src/question-ask.ts) 入队（key `question:<qid>`，exec.signal 桥接）。

## 3. 排序统一（R3）

【变更】[baf-guard/projection-state.ts](../../../../packages/baf/baf-guard/src/projection-state.ts) + [tool-guard.ts](../../../../packages/baf/baf-guard/src/tool-guard.ts)：选择顺序 = ① 写入路径落在活动变更目录内 → 它；② `focusFor(cwd).get()` 命中 → 它；③ pickActiveChange（seq 降序，替换 updatedAt）。

【变更】[baf-workflow/tab-view.ts](../../../../packages/baf/baf-workflow/src/tab-view.ts)：Tab 兜底弃字典序（含终态那条路）改 pickActiveChange（全终态取最近终态展示）。

【变更】[session-focus.ts](../../../../packages/baf/baf-workflow/src/session-focus.ts)：`focusFor` 自包根导出（guard 依赖该包）。

## 4. bind-workflow 门（R4）

【变更】[gate-cards.ts](../../../../packages/baf/baf-workflow/src/gate-cards.ts)：GateId + `'bind-workflow'`、dynamicOptions + `'change-targets'`（选项 `接手 <id>` → `/baf-go change=<id>`）；[gate-dialog.ts](../../../../packages/baf/baf-workflow/src/gate-dialog.ts) dialogOptions 加同臂。

【变更】[go-coordinator.ts](../../../../packages/baf/baf-workflow/src/go-coordinator.ts)：`resolveBinding` 多活动 + ask 通道 → 排队弹 bind-workflow → 点选解码校验 → **focus 记录在派发之外**（内层派发看不到会话 focus）→ driveGateResolve；暂停/无 answerer → 与旧文字卡字节一致（既有测试钉死）；新增导出纯函数 `dueGateFor(status, events)`（Phase 5 复用）。

## 5. orchestrator 宿主行（用户原则核心，R6）

【新增】[orchestrator.ts](../../../../packages/baf/baf-workflow/src/orchestrator.ts) + [package.json](../../../../packages/baf/baf-workflow/package.json)/[tsdown.config.ts](../../../../packages/baf/baf-workflow/tsdown.config.ts) 导出 `./orchestrator` + [agent.cordis.yml](../../../../packages/preset/agent-presets/presets/baf/agent.cordis.yml) 宿主面行（isolate 外，inject agents+userQuestions）：订阅 `session/event`，**completed 回合**（aborted/error/blocked/max-tokens 不算）→ 无 baseline 弹 scaffold（每会话一次，SCAFFOLD_SEEN + 台账）；多活动无 focus → 弹 bind-workflow（点选 → focus + 派发）；否则 `dueGateFor` 停靠点 → 到期门经 askGateDialogQueued 弹（duplicate 即三路收敛；intake-classify 带判定摘要；resume 带实时候选）→ 点选经 driveGateResolve 派发。防骚扰台账 `cwd|changeId|gateId → projectionVersion`：同投影不重弹。

【变更】[gate-ask.ts](../../../../packages/baf/baf-workflow/src/gate-ask.ts)：描述降权改写（§22.19 分工：系统拥有弹卡单线，模型不得指导客户点页签/敲斜杠命令；paused/conflict 提示改「系统会在你下一个回合结束时自动重弹」）。

【变更】[session-gate.ts](../../../../packages/baf/baf-workflow/src/session-gate.ts)：新固定单线规则（弹卡/等待/推进由系统固定驱动；客户没点选就如实说明状态，不得指导客户操作）。

【变更】[baf-go/SKILL.md](../../../../packages/preset/agent-presets/presets/baf/skills/baf-go/SKILL.md)：规则 6 重写（bind-workflow 入列 + 「绝不指导客户点页签/敲命令——投诉 #4 的出处」）+ 新规则 6a（§22.19 分工声明；baf_gate_ask 仅剩需求 bootstrap 与显式重弹两个回合中例外）。

## 6. Tab 实时推送 + 死端修复（R5）

【变更】[projection.ts](../../../../packages/baf/baf-workflow/src/projection.ts)：§13 R8 追加通知从 **per-instance 升格 per-workspace 进程内全局**（`WORKSPACE_LISTENERS` Map，key = resolve + win32 小写）——驱动们各自 new 的短命 store 的 append 也能 poke 常驻订阅者；这是推送能成立的前提（此前该 API 零使用方，语义升格无迁移面）。

【变更】[ui-baf-workflow/src/index.ts](../../../../packages/client/ui-baf-workflow/src/index.ts)：`createProjectionStorePool(ctx)`——remote 弃每 RPC 一次性 store，改 **per-cwd 常驻单实例**；每次 append → `ctx.emit('baf-workflow/projection-appended', {cwd, changeId})`；dispose 逐个退订（进程内全局总线不退订即泄漏——测试当场抓出）；`contextFor` 走池。

【变更】[ui-baf-workflow/src/types.ts](../../../../packages/client/ui-baf-workflow/src/types.ts)：`BafWorkflowProjectionAppended` + cordis `Events` 声明（`@mode emit`）；[api/remotes/remote-events.ts](../../../../packages/api/remotes/src/remote-events.ts) 白名单 + 该事件；[api/remotes/index.ts](../../../../packages/api/remotes/src/index.ts) type-pull 块加 ui-baf-workflow/types（该 devDependency 已在）。

【变更】[client/index.ts](../../../../packages/client/ui-baf-workflow/src/client/index.ts)：注入面 + `subscribe`（`ctx.remote.$on` + cwd 比对，返 disposer）与 `refresh(changeId?)`。

【新增】[refresh-scheduler.ts](../../../../packages/client/ui-baf-workflow/src/client/refresh-scheduler.ts)：纯函数调度器——推送 poke → **200ms 尾去抖**（一次派发连发多事件只刷一次）；**2s 可见轮询兜底**（跨进程写/丢事件的地板，pollMs 可关）；`ready` 门 + dispose 全清（防骚扰与测试确定性）。

【变更】[WorkflowView.tsx](../../../../packages/client/ui-baf-workflow/src/client/WorkflowView.tsx) + [WorkflowView.module.css](../../../../packages/client/ui-baf-workflow/src/client/WorkflowView.module.css) + [locales.ts](../../../../packages/client/ui-baf-workflow/src/client/locales.ts)：新 effect 接线（inFlight ref 同步门 + visibility 门）；**Dashboard 列表行改可点按钮**（`refresh(changeId)` 聚焦任意变更含终态，dashboardPick 样式）；**终态死端行动条「回到进行中的变更」**（有活动变更时出现，裸 refresh() 走 §3 排序兜底落回活动变更，bannerActions 样式）；tsconfig.client.json files 列表补 refresh-scheduler.ts。

## 7. 测试（as-built，全绿）

- [begin-intake.spec.ts](../../../../packages/baf/baf-workflow/tests/begin-intake.spec.ts)：含 session 7 并发竞态重放（双 beginIntake → 一 minted 一 reused、index 恰一条）。
- [ask-queue.spec.ts](../../../../packages/baf/baf-workflow/tests/ask-queue.spec.ts)：同会话串行 / 同 key duplicate（service 只见一次）/ moot 丢弃 / signal 中止映射暂停。
- [tool-guard.spec.ts](../../../../packages/baf/baf-guard/tests/tool-guard.spec.ts) + tab-view 排序组：双活动写 A 目录 B 更新鲜按 A 裁决；focus 指 A 写两者之外按 A；一条已放弃（字典序靠后）+ 一条活动 → 选活动；全终态不崩。
- [gate-cards.spec.ts](../../../../packages/baf/baf-workflow/tests/gate-cards.spec.ts) / [gate-dialog.spec.ts](../../../../packages/baf/baf-workflow/tests/gate-dialog.spec.ts)：bind-workflow 注册行形状、渲染、候选动态生成、拒绝路径。
- [go.spec.ts](../../../../packages/baf/baf-workflow/tests/go.spec.ts) §22.19 R4 组 3 项：点选绑定（弹卡恰一次、focus 落定、twin 不受扰）/ 暂停停卡 / 无 answerer 与旧卡字节一致。
- [orchestrator.spec.ts](../../../../packages/baf/baf-workflow/tests/orchestrator.spec.ts) 8 项：门 A 弹+点选入 plan / implement 沉默 / aborted·max-tokens 不弹 / 同投影不重弹·新投影弹新门 / 同 key 在飞 collapse（一 ask）/ 空闲沉默 / scaffold 每会话一次（跨会话各一次）/ 多活动 bind 弹 + focus 落定。
- [projection-broadcast.host.spec.ts](../../../../packages/client/ui-baf-workflow/tests/projection-broadcast.host.spec.ts) 4 项：**跨实例 append（驱动形态）→ 转发 {cwd, changeId}**（同时钉死 projection.ts 总线升格）/ 同 cwd 单实例（含尾分隔符拼写）/ cwd 隔离 / dispose 退订（此项当场抓出真泄漏 bug）。
- [refresh-scheduler.client.spec.ts](../../../../packages/client/ui-baf-workflow/tests/refresh-scheduler.client.spec.ts) 6 项：poke 风暴合并一次 / 尾重起不叠加 / ready=false 抑制 / 轮询地板 4 tick / pollMs:0 全关 / dispose 后 poke 复活无效。
- 全量：baf-integration **34 文件 / 360 项**；ui-baf-workflow + api-remotes（thread-safe）**5 文件 / 22 项**；`tsc -b` host + client 两面零错误。

## 8. 剩余问题（按优先级）

1. **跨进程 mint 锁**：第二个 host/CLI 子进程同 cwd 仍可双铸（进程内互斥管不到）；`.baf/intake.lock` + STALE_LOCK_MS 回收模式留待。
2. **focus 持久化**：会话绑定重启即失（内存单例）；跨重启的绑定语义需要落盘设计。
3. **orchestrator 回合粒度**：blocked/error 回合与 step 粒度（回合中模型长跑时的中途停靠）未响应；目前只认 completed。
4. **ask_user_question 文本内嵌选项识别**（§22.18 遗留②延续）：结构化扫描只认 options 数组。
5. **GUI 自动化端到端**：弹窗串行 + Tab 推送的真机链路本轮手工回归（dev:web + dsh web 重放 session 7）；自动化留待。
6. **双 GUI 会话同 cwd 的 focus 语义**：focusFor 是 per-cwd 单例，两个会话窗口会互抢焦点；bind-workflow 已把选择权交给客户，但语义仍需成文。
7. 真机回归与打包同前（用户指示：调试完一起打包，本轮不出 NSIS）。
