# BAF 确认卡点选同步到大模型：scaffold 分流续接分类 + 点选结果卡可读化（全景图）

> 配套本轮修复（2026-09-22）：用户报告「我已经在弹出卡选项中选择了初始化工作区，为什么没有同步到大模型，还需要再回答选择呢？应该是在弹出选项卡中就能推动工作流」（日志 `tmp\session\1.jsonl`）。核查结论：**点选其实已经传到了大模型**——`baf_gate_ask` 挂起 8.3 秒等到客户点「初始化工作区」，scaffold 真执行（新增 `.baf/baseline.yml` + `openspec/changes/.gitkeep`），完成卡作为工具结果返回（seq 32）。死局在**返回卡的可读性与续接**：工具返回的是面向客户的斜杠报表卡原文，首行 ✓ 标题 + 「类型：系统斜杠指令，无需大模型」，全卡没有一句「客户已点选」，模型读成「门已弹出但客户还没点击」（seq 35），退化成散文 A/B 二选一——正是 §22.9 明令禁止的反模式；且 scaffold 腿走完调用即终止，requirement 只活在模型上下文里，§22.19 回合末自动重弹无物可弹（日志在 seq 39 turn/end 后终）。本图按「原来是什么样 → 现在是什么样」贴【变更】，文末附剩余问题排序。
>
> 验证 = `pnpm build:lib`（host + client，含 tsc -b）零错误；baf-workflow **24 文件 / 289 用例全绿**（gate-dialog.spec.ts 35 项含本轮新增 2 项）。本轮仅 build:lib，**未打包 exe/NSIS**（Tier-2 协议）。

---

## 0. 死局 → 修后总览

| session 1.jsonl 场景 | 修前 | 修后 |
| --- | --- | --- |
| 未初始化工作区 + 客户提新需求 → 模型调 `baf_gate_ask(intake-classify, requirement)` → 分流到 scaffold 门 | 工具等客户点「初始化工作区」→ 返回 scaffold 完成卡**原文**（「类型：系统斜杠指令，无需大模型」） | 同一工具调用内**续接**：scaffold 成功后 `beginIntake(requirement)` 铸变更，**分类确认卡立刻作为第二段弹出等待点选**；一次工具调用从「未初始化」推进到真实分类决策，零散文往返 |
| answered 返回卡的内容 | 派发结果卡单独返回，不陈述客户点了什么 | 每段 answered 结果前加「【客户选择】客户已在确认框点选「<label>」…不要把客户已经选过的选项再用文字问一遍」头部；卡内「系统斜杠指令，无需大模型」行替换为「客户点选后的真实执行结果（确认门已推进）」 |
| 分类腿被客户暂停（关掉确认框） | requirement 随模型上下文漂流失联 | `beginIntake` 已铸变更（durable），卡上如实报告「已选择初始化 + 暂未选择分类」，§22.19 回合末自动重弹有物可弹 |
| classify confirm 派发抛 `BafError`（如无 Git 工作区 full-go-path open 阻断） | 异常漏出工具调用 → 模型只收到崩溃的工具错误 | 工具面 catch：投影里已记录 parked 态 → 返回「分类已确认但被环境阻断」诚实卡（复用 confirmedIntakeNote），或通用阻断卡；**选择已落库的事实不会被崩溃吞掉** |

## 1. 事件链（session 1.jsonl，修前实测）

```
seq 3-6   /baf-welcome + /baf-gate scaffold（系统斜杠指令，弹 scaffold 门卡）
seq 7-14  客户输入「重构ecum模块」→ turn 1 开场（启动门事实：工作流配置 ✗ 未初始化）
seq 31    模型调 baf_gate_ask(gateId=intake-classify, requirement=重构ecum模块)   t=…55919
          └ gate-ask.ts:261 loadWorkspaceBaseline undefined → 分流 input={gateId:'scaffold'}
seq 32    工具结果返回 scaffold 完成卡（✓ 初始化工作区 · 新增 2 项 … 类型：系统斜杠指令，无需大模型） t=…64221
          └ 8.3s = 客户点选 + driveGateResolve('scaffold','init') → driveScaffold 真执行
seq 35    模型散文：「工作区初始化门已弹出…但客户还没点击…**需要你确认（请二选一）**」 ← 误读返回卡 + 无续接指令
seq 39    turn/end；此后无事件 —— beginIntake 从未执行，requirement 无 durable 载体，§22.19 无门可弹
```

确认边来源不变：两段 answered 派发仍走 `driveGateResolve(…, 'gate-card', …)` 单通道（§22.14/§22.15），审计行 source=`gate-card`。

## 2. 变更明细（全部在 [gate-ask.ts](../../../../packages/baf/baf-workflow/src/gate-ask.ts)）

【变更】新增 `choiceHeader(gateId, outcome)`：每段 answered 返回的首两行——「【客户选择】客户已在确认框点选「<label>」（gate=… option=…），选择已生效并执行完毕。下面是执行后的真实状态卡：如实转述即可，不要把客户已经选过的选项再用文字问一遍」。active-conflict 分支的 answered 返回同样加头。

【变更】新增 `modelFacingCardText(text)`：工具结果内把 `formatCommandReport` 面向客户 UI 的「类型：系统斜杠指令，无需大模型」行替换为「类型：客户点选后的真实执行结果（确认门已推进）」。斜杠/命令面（commands.ts、客户 UI 卡）不受影响——只改模型读到的副本。

【变更】bootstrap 分流记录 `scaffoldDiversion = requirement`（原注释「the model retries this call」的设计意图落空处即在此——没人告诉模型要重试）。

【变更】主弹卡段重构为**两段循环**：leg 1 弹当前 input（scaffold 或原 gate）；answered → 派发 → 结果卡（带头、经 modelFacingCardText）入 `parts`；若 `leg===1 && scaffoldDiversion && input.gateId==='scaffold' && result.kind==='success'` → `beginIntake(cwd, requirement)`（minted/reused 均续）→ `input={gateId:'intake-classify', changeId}` → `continue` 弹分类卡；mint 拒绝则其卡追加进 parts 一并返回。leg 2 的分类 enrich（judgmentOf / settled-confirmation 早退 / bugPlan 合并）在循环内按 input 重跑；leg>1 时为暂停回退重渲 `renderGate('intake-classify')`。暂停/不可用返回 = `parts + 当前门卡 + 统一暂停注`（措辞不变）。

【变更】派发包 try/catch：`driveGateResolve` 抛错（实测：无 Git 工作区 classify confirm → `StagePipeline.driveOpenStage` 抛 `BafError: full-go-path open blocks when local Git is unavailable`，pipeline 先 `recordRejectionQuiet` 落库再抛）→ 重读投影；`intake-classify` 命中 settled-confirmation → 返回 `confirmedIntakeNote`（分类已确认、进入被阻断、/baf-go 重试）；否则通用「客户点选已执行，但推进被环境阻断」卡。工具面从此不向模型漏异常。

入口表面平价（scaffold→classify 续接后）：

| 表面 | scaffold 点选后 | 分类决策 |
| --- | --- | --- |
| `baf_gate_ask`（模型，本轮修） | 同调用续接弹分类卡 | 同上，answered 即派发 |
| `/baf-scaffold` → `/baf-workflow-open`（斜杠，客户手动） | 客户自己敲两条 | classify confirm |
| Tab 按钮（pendingGate） | 点「初始化工作区」= 同派发 | §22.19 回合末自动重弹 |

三确认门（§18.5 门 A design-confirm / 门 B verify-archive / scaffold）与 bug-fix-path 升轨路径不受本轮影响；scaffold 门选项仍为 `init → /baf-scaffold`、`cancel → __noop__`（暂停形，不派发）。

## 3. 测试（as-built，全绿）

- [gate-dialog.spec.ts](../../../../packages/baf/baf-workflow/tests/gate-dialog.spec.ts) 新组「scaffold diversion continues the bootstrap (2026-09-22, session 1.jsonl)」2 项：
  1. 点「初始化工作区」→ **两次弹卡**（scaffold → 需求分类待确认），返回文本含【客户选择】+「初始化工作区」、**不含**「系统斜杠指令，无需大模型」，投影恰 1 条活动变更（classify confirm 走通）；
  2. 分类腿跳过（selected:[]）→ 返回 = scaffold 选择头 + 结果 + 「客户暂未选择」，投影仍 1 条 intake 变更（durable，§22.19 有物可弹）。
- 辅助件：`scriptedService`（逐 ask 剧本回复）、`fakeScaffoldService`（**同步**写 fixture baseline——真实 `bafScaffold.scaffold` 是同步签名，`driveScaffold` 调用处无 await，async 伪件会变未处理拒绝，首轮已踩）、`runTool` 加可选 `realm` 参数把 `bafScaffold` 注入 agent ctx。
- 回归：baf-workflow **24 文件 / 289 项全绿**；`pnpm build:lib`（host+client，含 tsc -b）零错误。第 1 项测试的 BafError 修复前红→修复后绿，兼作 catch 分支的行为钉。

## 4. 剩余问题（按 用户可见度 × 修复成本 排序）

1. **斜杠面同类异常未接**（高可见 · 低成本）：`/baf-workflow-classify confirm` 在无 Git 工作区同样把 `BafError` 抛给宿主命令运行器（[commands.ts:448](../../../../packages/baf/baf-workflow/src/commands.ts) 直接 `return driveClassify(...)`）。工具面本轮已兜，斜杠面宜同款 try/catch 卡化。
2. **真机回归未做**（高可见 · 中成本）：本轮仅 build:lib（Tier-2 协议不出 NSIS）；「未初始化工作区 + 提需求 → 点初始化 → 分类卡接力 → 点完整流程」全链真机复验随下一次打包轮。
3. **两段等待的取消语义**（中可见 · 低成本）：scaffold 腿已答、分类腿等待中客户若中断会话（exec.signal 触发），`askGateDialogQueued` 返回 paused——durable 态没问题，但返回卡是「暂未选择」措辞，可考虑区分「等待被中断」。
4. **`modelFacingCardText` 是字符串替换**（低可见 · 低成本）：依赖 `formatCommandReport` 的固定行文案；该文案若改动，替换静默失效（退化为原文，choiceHeader 头仍在，只是防线下移）。
5. **分类腿弹卡前无「已初始化」过渡反馈**（低可见 · 中成本）：第二段弹卡间隔仅 mint 耗时，但客户看不到「初始化完成 → 正在分类」的中间态；可在 dialog detail 加一行 note（沿用 §22.18 note 通道）。
6. **beginIntake 跨进程竞态仍是文档化遗留**（低可见 · 高成本）：per-cwd 互斥仅进程内（既有注记），与本轮无关，留待专项。
