# 2026-09-22 · BAF 工作流四修 + 走查补修（第二轮）：禁自动插话 · 产物状态统一 · 顶栏闪烁 · token 统计 · auto-pop 净首跑

> 对应客户报告（2026-09-22，第二轮四项）：
> 1. 工作流自动生成了「【BAF 阶段工作 · open】变更 … 已进入 open 阶段 …」的**插话发送框**——「这个是不允许的，也是没必要的」。
> 2. 阶段产物 rail 状态不统一：proposal/clarify/design/tasks 显示「仍是未填的模板」（带 TODO 清单），plan.md/plan.json 却是「尚未生成」。要求：进入阶段前显示尚未生成；进入该阶段后生成模板；阶段结束后生成真实文档；状态随之改变。
> 3. 工作流页面顶栏（变更总览/刷新/推进 一栏）每 2 秒闪烁一次。
> 4. 工作流页面需要 token 统计功能。
>
> Fix 5 是实机走查中发现的回归（不在客户报告里）：auto-pop 的唯一 offer 会在净初始化工作区上被首条 pre-scaffold 消息烧掉。
>
> 验收：`pnpm build:lib` 全绿 + `apps/web/.auto-check-4fixes.mjs` 实机 web 走查（见文末）。

---

## 全景：这次动了哪五块

| # | 客户诉求 | 根因 | 落点 |
|---|---|---|---|
| 1 | 自动插话不允许 | `stage-brief.ts` 的 `queueStageBrief` + orchestrator 的 `wakeIncompleteAuthoring`/verify 失败分支都用 `agent.followup(createUserMessage({source:{kind:'plugin',plugin:'baf-orchestrator',form:'relay'},…}))` 排合成用户消息，web 端渲染成插话发送框（可编辑可删——等于替客户说话） | 删除整套 relay 通道；模型侧改用**常驻 persona 指令 + 磁盘可观测状态**驱动 |
| 2 | 产物状态统一 | `OpenSpecAdapter.open()` 一次性写 4 个模板（proposal/clarify/design/tasks），而 `beginDocStage` 只补 plan 系——于是「已开阶段=模板」「未开阶段=尚未生成」混在一张 rail 上，但 tasks.md 因为 open() 的急切安装永远显示模板 | open() 只写 proposal.md；`beginDocStage` plan 分支补装 tasks.md；每个产物统一「进阶段→装模板→填完→已填写」 |
| 3 | 顶栏 2s 闪烁 | `createRefreshScheduler` 的 2s 轮询/poke/focus 全走 `run()`，每次 `setBusy(true→false)`，全栏 `disabled={busy}` 按钮闪一下 + busy span 出现又消失 | 自动刷新走新增的 `runSilent`（不动 busy）；`run` 只留给用户点击 |
| 4 | token 统计 | 顶栏 token 槽位一直渲染占位（`view.metrics.totalInputTokens` host 从不填） | 改读 **durable 全日志投影** `tokenUsage`（token-meter）+ `sessionStats`（session-stats）：顶栏合计 + 悬停分解 + 右栏「会话统计」卡 |
| 5 | 走查发现的回归：净初始化工作区上首条需求烧掉 auto-pop 唯一一次 offer | `auto-pop.ts` 的 `apply()` 在进入异步链**之前**就 `offered.add(id)`；而 `offerAutoPop` 的「工作区未初始化」早退只 return、不释放——净工作区上客户先说了需求、scaffold 之后 restatement 永远等不到承诺的分类卡 | 未初始化早退改为经 `releaseOffer` 回调删除 offer 标记：offer 只会在「工作区已就绪」的消息上消耗；配 pristine first-run 回归测试 |

---

## Fix 1 · 自动插话整套拆除

### 根因链

插话框的唯一来源是 `agent.followup(createUserMessage({…, form:'relay'}))`——它把一条**合成的 user 消息**排进客户输入队列，web 端把它渲染成「插话发送」编辑框。这正是 session-gate 注释里早已写明的原则（agent.cordis.yml §287-295）：*a synthetic `user/message` would put words in the customer's mouth*——welcome 卡因此走 `/baf-welcome` 命令而不是合成消息。但 2026-09-22 早间的 web-walk 卡点修复为了「唤醒模型干活」，引入了三条 relay 通道，违反了同一条原则。

三条通道与拆除：

1. **阶段简报（stage-brief.ts，整文件删除）**——`stageBriefText` 生成「【BAF 阶段工作 · open】…」全文（客户引用的正是它），`queueStageBrief` 排 relay 消息，`stageBriefWake` 是 DriveAdapters.wake 的实现（60s WOKE 去重）。
2. **orchestrator 的 wake-missing（orchestrator.ts）**——`wakeIncompleteAuthoring`/`authoringMissing`/`WAKE_MISSING` 台账整段删除；`popDueGate` 在「回合结束、门未过、无卡可弹」时改为静默 return。
3. **verify 失败分支的 followup**——改为注释说明三个可观测通道：投影（current 回到 implement）、磁盘上的 verify 报告（模型文件工具可读）、Tab；`/baf-go` 按需打印同一张卡。

配套拆除：
- `pipeline-factory.ts`：`DriveAdapters` 接口删掉 `wake?` 字段（只剩 stack/guard/scaffold）。
- `commands.ts` / `gate-dialog.ts`：`resolveDriveAdapters`/`toolDriveAdapters` 不再接 wake。
- `command-drives.ts`：`driveGateResolve` 派发后的 wake 调用删除。
- `go-coordinator.ts`：5 处 `adapters.wake?.({...})` 调用删除；open 拒绝卡「下一步」从「等待/提示模型填写 proposal.md（已排阶段简报唤醒）…」改为「对模型说补齐『缺什么』列出的项（或直接编辑上方产物文件）」。
- `stage-brief.ts` 及其 spec 删除；它从未进 package index 导出，也不是 tsdown 打包入口（entries 固定为 index/commands/cmdline/session-gate/gate-ask/question-ask/auto-pop/orchestrator），删除即净。

### 模型怎么知道该干什么（不靠插话之后）

**常驻 persona 指令**（agent.cordis.yml `persona.prefix`，中英双语各一段）：

> 每个回合开始时，先用文件工具读 `.baf/projection/index.json` 和 `openspec/changes/<变更>/` 下的产物，判断当前阶段与未完成的工作：仍是 TODO 模板的阶段产物就是你的首要任务（按 gates 的完成条件填写）。系统不会向你注入消息或代替客户发言；产物完成后直接结束回合，下一阶段的确认卡由系统在回合结束时弹出。写产物分节进行：先写文件骨架，再用多次小段编辑补齐各节。需要客户决策时必须调用 baf_question_ask 弹卡提问。

模型侧的完整信号面：
- 每回合自读投影 + 产物文件（persona 常驻指令）；
- 客户的下一条真实消息；
- `/baf-go` 按需打印「缺什么」清单（`DOC_REQUIREMENTS_ZH` + gate missing 列表）；
- verify 失败：投影回 implement + 磁盘 verify-report.json + Tab 卡。

### 测试
- `orchestrator.spec.ts`：「wakes the model with the missing list (stall #6)」反转为「stays silent (user report #1)」——回合结束在未完成的 authoring 阶段上：**无弹卡、无 followup**（两段 settle 后双断言）。
- `go.spec.ts`：「refuses a plain /baf-go … and wakes the model」去掉 wake 断言与 adapters.wake 传参，只断言拒绝卡文本（缺什么清单本身就是给模型的提示）。

---

## Fix 2 · 阶段产物状态统一（进阶段才装模板）

### 根因

`OpenSpecAdapter.open()`（baf-openspec/src/adapter.ts）在 open 阶段一次性写 4 个模板：

```ts
const bodies = { proposal, clarify, design, tasks }   // 旧代码：4 个全写
```

而 clarify/design/plan 的模板另有 `beginDocStage`（baf-workflow/src/stages/pipeline.ts）在**阶段进入时**懒安装。两张机制叠在一起 → rail 上「open 就装好的 4 个」永远显示模板，「plan 系」显示尚未生成——正是客户看到的不一致。

### 变更

1. **adapter.open() 只写 proposal.md**（open 阶段自己的产物）：
   ```ts
   const bodies = { [ARTIFACT_FILES.proposal]: proposalTemplate(input.changeId, input.title) }
   ```
   未使用的 clarifyTemplate/designTemplate/tasksTemplate import 移除。
2. **beginDocStage 的 plan 分支补装 tasks.md**（与 plan.md/plan.json 同期）：
   ```ts
   await writeArtifact(root, changeId, ARTIFACT_FILES.tasks, tasksTemplate(changeId))
   ```
   `writeArtifact` 本身「拒绝覆盖真实内容、可覆盖模板」→ 重入幂等。`tasksTemplate` 经 baf-openspec barrel（`export * from './templates.ts'`）导出，baf-workflow 直接引。
3. 统一后的产物时间线（rail 状态机，`changeArtifactStatus` 读盘判定无需改）：

   | 时点 | proposal | clarify | design | plan.md | plan.json | tasks |
   |---|---|---|---|---|---|---|
   | open 后 | 模板 | 尚未生成 | 尚未生成 | 尚未生成 | 尚未生成 | 尚未生成 |
   | 进 clarify | 模板/已填写 | 模板 | 尚未生成 | 尚未生成 | 尚未生成 | 尚未生成 |
   | 进 design | … | 已填写 | 模板 | 尚未生成 | 尚未生成 | 尚未生成 |
   | 进 plan | … | … | 已填写 | 模板 | 模板 | 模板 |
   | 各阶段完成 | → 已填写（真实文档=门禁判定 stage-completed） |

   漂移复位（driveResumeStage）只记 stage-entered 不装模板——但复位目标只会是第一轮已装过模板的阶段，文件已在盘上，无缺口。gates 对 missing 文件的 missing 文案（「/baf-go 安装模板」）保持不变，作为文件被外部删除的兜底。

### 测试
- `lanes.spec.ts`「artifact exposure」：断言更新为 proposal=template、clarify=template、**design=missing（missing 列表为空）**、tasks=missing、plan.json=missing——锁定新契约。
- baf-openspec 的 openspec.spec 只断言 proposal 存在与 templateOnly，懒装后天然通过；stages.spec 快乐路径手写 tasks.md，不受影响；全部实测绿（openspec+stages+lanes 41 例、go+orchestrator+gate-dialog 93 例、e2e+session-gate 24 例）。

---

## Fix 3 · 顶栏 2s 闪烁

### 根因

`WorkflowView.tsx` 的刷新分三层：`createRefreshScheduler`（投影推送 poke 200ms 去抖 + 2s 可见轮询）、focus/visibilitychange 重同步、按钮点击。三层全走同一个 `run()`：

```ts
const run = async op => { setBusy(true); setError(null); try { applyView(await op()) } finally { setBusy(false) } }
```

于是**每 2s 一次**：busy=true → 全栏 `disabled={busy}` 的按钮（变更总览/刷新/推进/放弃…）集体失能又恢复 + `{busy && <span>刷新…</span>}` 布局闪现。

### 变更

新增静默通道，自动刷新不再动 busy：

```ts
const runSilent = async op => { try { applyView(await op()) } catch { /* 瞬态失败保留已绘制图 */ } }
```

- `refreshNow`（scheduler tick/poke）→ `runSilent`
- focus / visibilitychange 处理器 → `runSilent`
- 静默失败不写 error：下一 tick 自然重试，2s 一闪的报错条与按钮闪烁同类
- `run` 保留给**用户点击**（按钮 busy 是真实反馈）；mount 首刷仍走 `run`（一次性加载态，非重复闪烁）

效果：轮询期间 busy 恒 false，按钮常亮、无 busy span；数据照常每 2s 静默刷新。

---

## Fix 4 · token 统计

### 数据源选型

不用 host 填 `view.metrics`（host 从未填过，且 per-stage 归因成本高），改读两个 **durable 全日志会话投影**（与输入栏下方 StatsPills 同源同口径）：

- `tokenUsage`（token-meter 包，host 平台常驻）：`uncachedInputTokens / cacheReadTokens / cacheWriteTokens / outputTokens`，四桶不交叠，reasoning 已含在 output 内。整会话累计，分页/压缩不改变。
- `sessionStats`（session-stats 包）：turns/steps/toolCalls/llmMs/toolMs/ttftMs/ttftSteps。

两个 key 通过 `useProjection` 读（WorkflowView 本就解构了它）；**类型合并用 type-only import**（bundle 时擦除，纯度门不触发，也不需要 module-table 行）：

```ts
import type {} from '@deepseek-ai/dsh-session-stats/client'
import type { SessionStatsProjection } from '@deepseek-ai/dsh-session-stats/client'
import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
```

### UI

1. **顶栏 token 槽位**（原「变更 tokens」占位）：改为「会话 tokens」，值 = 三桶输入 + 输出（`billedTotalTokens`，与 StatsPills `billedInputTokens+output` 同口径），紧凑格式（517 / 12.2K / 1.2M）；悬停 title 列出 合计/输入（未命中）/缓存读/缓存写/输出 五行分解。投影未到值（首个计费步骤前）显示 `—`，title 回退「分阶段 tokens 将在后续版本写入」。
2. **右栏「会话统计」卡**（ArtifactRail 下方，session 级、与变更无关，任一投影有值即渲染）：
   - metaRow（5.2rem key 栏网格）：回合 / 步骤 / 工具调用 / 模型耗时 / 工具耗时 / 首字延迟（ttft 均值）
   - tokens 分解：合计 / 输入（未命中）/ 缓存读 / 缓存写 / 输出 / 缓存命中%
   - 无 usage 时显示「暂无用量——完成一个步骤后统计会出现」

### 工程配套
- `package.json`：devDependencies + `@deepseek-ai/dsh-session-stats`、`@deepseek-ai/dsh-token-meter`（tracegraph 同款 type-only 消费模式：devDeps + 无 peer、无 dsh.client.inject——值经会话投影通道到达，无运行时 import）。
- `tsconfig.client.json`：references 增加 `../../session/session-stats`、`../../llm/token-meter`（否则 tsc 从源码解析越 rootDir，TS6059/TS6307）。
- `locales.ts`：新增 `stats.*` 17 个 key（中英），`strip.totalTokens` 文案 改「会话 tokens / Session tokens」。
- `exactOptionalPropertyTypes`：SessionStatsCard props 显式 `| undefined`。

---

## Fix 5 · auto-pop 的净初始化首跑烧 offer（走查中发现的回归）

### 根因

§22.17 J 的 auto-pop 行承诺「直接描述需求，分类卡自动弹出」，每会话只 offer 一次。但 web 走查（04:39 轮）发现净工作区的第一次会话永远等不到分类卡：客户的第一句话落在 **scaffold 之前**（工作区未初始化），`apply()` 已经 `offered.add(id)`，而 `offerAutoPop` 的「无 baseline」早退只 `return`——offer 就这么烧掉了。scaffold 之后客户再 restatement，`offered.has(id)` 为真，静默跳过。整条「平台保证」在真实首跑路径上恰好失效。

### 变更

【变更】2026-09-22 `packages/baf/baf-workflow/src/auto-pop.ts`：

- `offerAutoPop(..., releaseOffer)` 增加释放回调参数；「无 baseline」早退从裸 `return` 改为 `releaseOffer(); return`。
- `apply()` 在 `offered.add(id)` 后传入 `() => { offered.delete(id) }`。
- 模块头注释补一句契约：**pre-init 消息不消耗 offer**——scaffold 卡才是那个工作区的下一个决策，首个 post-init 消息才是值得 offer 的需求。

其余早退路径（busy 工作区、无 agent、无 userQuestions）**保持消耗 offer**——它们发生在工作区已就绪之后，重弹只会打扰；模型侧 `baf_gate_ask`、Tab、slash 三个表面仍然兜底。

### 测试

【变更】`tests/auto-pop.spec.ts`：`setup()` 拆出 `initWorkspace(root)`；新增 `a requirement stated before initialization does not burn the offer (pristine first-run)`——先在裸目录上发消息（0 次 ask），`initWorkspace` 后再发同一句，断言 pre-question 弹出。6/6 绿。

---

---

## 验证

- **单测**：`npx vitest run packages/baf/baf-workflow/tests/`（仓库根）——24 个文件 / **303 全绿**（含 Fix 5 的 pristine first-run 回归；2026-09-22 14:02）。
- **构建**：`pnpm build:lib` 全绿（tsc -b + tsdown 全包，含 Fix 5 后复跑）。
- **web 实机走查**：`apps/web/.auto-check-4fixes.mjs` v5（playwright 驱动真实模型回合，demo_3_check 沙箱，净工作区起步，host 隔离在 `--port 3180`），06:01:43–06:03:12 一轮全绿：
  - 净首跑链：首条需求 → scaffold 卡（初始化工作区）→ 新建工作流卡 → 需求分类卡（完整流程）→ mint `change-20260922-feat-api-csv-668d`——全程客户点卡（投影事件 source 全为 `gate-card`），无一条合成消息；
  - #1 看门狗全程扫 `【BAF` 合成简报签名（v4 教训：裸扫「插话」会撞上输入框自己的占位文案「Cmd/Ctrl+Enter 插话发送全部排队消息」）→ **0 命中**；
  - #2 open 后 rail=`proposal.md 仍是未填的模板` + 其余 5 项 `尚未生成`；确认推进后 clarify=`仍是未填的模板`、`proposal.md 已填写`、design/plan/plan.json/tasks 仍 `尚未生成`；磁盘交叉验证：变更目录里只有 `proposal.md + clarify.md`；投影事件序 `intake-classified → … → stage-entered:open:gate-card → baseline-locked → stage-completed:open → stage-entered:clarify:gate-card` 与设计一致；
  - #3 稳态 7s@250ms 采样：刷新按钮 disabled 翻转 0 次、busy span 出现 0 次（连续第二轮 0/0）；
  - #4 真实回合完成后：顶栏 `会话 tokens 102K` + 会话统计卡 `回合1 步骤7 工具调用9 模型耗时53.1s 工具耗时6.9s 首字延迟5.1s 合计102K（输入未命中16.5K / 缓存读84.4K / 输出1.1K）缓存命中84%`；
  - 结束 abandon 沙箱变更（探针这步把索引字段 `changeId` 误读为 `.id` 发出 `change=undefined`，实际未生效——沙箱事后手工重置，不影响四项结论）。日志 tmp/check4fixes/log.json + 截图（rail-at-open / open-advance-card / stats-after-turn / rail-at-clarify / flicker-end）。
  - 探针方法论沉淀（v4 教训，已写进脚本注释）：① 看门狗扫签名不扫单词；② 流中回车只**排队**不发送（输入框占位文案翻成「插话发送全部排队消息」），探针的 send() 检测该占位并用 Ctrl+Enter 冲洗队列，否则 restatement 永远不落地为 `user/message` 事件；③ 隔离端口 3180 防其它会话的 host 复活者抢 3080。

---

## 剩余风险 / 不平整点（按 客户可见度 × 修复成本 排序）

1. **【中】模型自律依赖 persona 常驻指令**：插话拆除后，「回合开始自读投影与产物」是指令而非机制。模型若一回合只聊天不干活， resting point 静默（无卡、无唤醒）——客户需要再发一条消息或敲 `/baf-go`（卡片会列缺什么）。缓解已内置（指令 + /baf-go + Tab rail），但「系统保证推进」的强度低于插话时代。可选后续：turn/end 时若门未过，由 orchestrator 弹一张**问客户的**卡（「模型还没填完，催一下还是等？」）——机制级兜底且不替客户说话。
2. **【中】会话统计与变更不同域**：tokenUsage/sessionStats 是整会话累计，一个会话先后跑两个变更时数字合流。变更级 token 归因需要 host 侧按 changeId 切分事件窗口，成本高；当前口径与输入栏 StatsPills 一致（「这个会话花了多少」），顶栏文案已明确写「会话 tokens」。
3. **【低】verify 失败只回 implement 静默**：模型的修复线索是投影 + 磁盘报告 + persona 指令；若模型不看投影，客户需 /baf-go 打印失败卡。与 #1 同根，同卡兜底方案可覆盖。
4. **【低】流中回合 token 不实时**：tokenUsage 投影随 provider usage 事件更新，流式输出中数字滞后到 step 落盘；顶栏 2s 轮询取到的已是最新已落盘值。与 StatsPills 行为一致。
5. **【低】漂移复位到从未装过模板的阶段（理论缺口）**：resume 只能选第一轮已走过的节点，模板已在盘；但「外部删文件 + 漂移复位」叠加时 rail 显示尚未生成而 gate 的 missing 文案仍指 `/baf-go`——文案兜底存在，不新增修复。
6. **【低】`.auto-check-4fixes.mjs` 是一次性探针**：挂在 apps/web 下未进 git 索引约定（与 .auto-walk.mjs 同类，.gitignore 覆盖）。已知小瑕疵不修：结尾 abandon 把索引字段 `changeId` 误读为 `.id`；`disk-files` 的 readdirSync 会撞上 `.gitkeep`（文件非目录）抛 ENOTDIR 吞掉整段——磁盘契约本次已手工复核。长期回归以单测 + build:lib 为准。
7. **【低】auto-pop 预问句的出场窗口很窄**：v5 走查里 scaffold→新建工作流→分类的**卡链**在 restatement 落地前就完成了 mint（投影 source=`gate-card`），auto-pop 的预问句根本没有出场——这是健康的（客户全程在点卡，平台保证成立）；但意味着「首条消息落在 scaffold 前」的窗口内，需求语义只活在模型上下文里，分类判断靠 `beginIntake` 的启发式而非模型理解。busy 后的 restatement 不再弹预问句（offer 已消耗或工作区非空闲，设计语义，Tab/slash 兜底）。
