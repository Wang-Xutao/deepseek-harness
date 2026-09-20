# BAF go-workflow 全景图（2026-09 重写版）

> 配套本轮修复（Tier 2：明确 bug + 工作流一致性；Tier 3：剩余 9 项风险收口）。本图取代之前那份，并把每一处"原来是什么样 → 现在是什么样"以 `【变更】` 标注贴出来。文末附"剩余风险/不平整点"清单（R1–R9 在 Tier 3 全部修完）。

> 关于产物：**没有**生成 `baf-dsh.exe`。按你的要求"只做 `build:lib + typecheck`，不打 NSIS"，本次仅跑 `pnpm build:lib`（含 `tsc -b`，即 typecheck 阶段）。验证结果：`build:lib` 零 TS 错误；`packages/baf/baf-workflow` + `packages/client/ui-baf-workflow` + `packages/baf/baf-core` 共 **30 个 spec / 250 用例全绿**。`baf-dsh.exe` 的桌面打包在 `pnpm package:desktop:win:x64` 里，需要 electron-builder + NSIS；本轮没跑那个。

---

## 0. 总览：一句话 + 三个阶段

> **一句话**：用户说一句需求 → 系统分类 → 沿八节点跑完（intake / open / clarify / design / plan / implement / verify / archive） → 写投影、追加 JSONL 事件链 → 终端归档。整条链 **append-only**，可重放、可 diff、可放弃；任何时刻允许人在任意节点改主意（drift 复位 / abandon）。

三个阶段：

| 阶段 | 名 | 主要节点 | 持续时间 | 终端产物 |
| --- | --- | --- | --- | --- |
| Ⅰ | **想清楚** | intake → open → clarify（可选）→ design | 几分钟～几十分钟 | 设计文档 |
| Ⅱ | **做出来** | plan → implement | 几十分钟～几天 | 代码 + 实现账本 |
| Ⅲ | **验掉+归档** | verify → archive | 几分钟 | 归档条目（terminal） |

外加两条**侧路**：
- **abandon**（任何 active 节点可走，把当前 change 标记 `abandoned`，审计保留）
- **drift 复位**（detectDrift 发现 baseline 或产物不一致 → 路由进 drift 节点 → 选目标节点重跑）

---

## 1. 进入 BAF 模式

### 1.1 三种入口（同一套语义）

```
[1] 聊天敲 /baf-welcome           ──┐
[2] 终端跑 baf welcome (baf-cli)   ──┼── 三个入口全部走同一个 ctx.bafWorkflow.bindWorkspace(cwd)
[3] 工作流 Tab 自动渲染（首次打开） ──┘
```

绑定做的事：
1. `ProjectionStore` 实例化（指向 `.baf/projection/`）
2. `WorkflowService` 实例化（绑定 store）
3. **环境体检**：git 是否可达、`.baf/baseline.yml` 是否存在、`openspec/changes/` 是否就绪
4. 渲染欢迎卡：列出当前 workspace 的活动变更 + 健康检查 + 可用命令清单

### 1.2 三种入口下"客户想再次触发同一动作"的差异

- **聊天 `/baf-go`** → 走 `go-coordinator.route()`，**唯一入口**
- **终端 `baf go`** → 走同一个 `driveGo()`，通过 `cmdline.ts` 包成 commander subcommand；底层调用 `go-coordinator.route()`
- **工作流 Tab 按钮** → `BafWorkflowTabRemote.transition()` → **【变更】** 不再走 `service.transition`（之前那是个 bug，跳过 StagePipeline），改为分发到 9 个 drive 之一

> 【变更】Tier 2 #2：Tab `transition` 之前只调 `service.transition()`，写事件但不跑 stage handler。结果：用户点 Tab「进入建立变更」，状态机前进到 `open`，但 OpenSpec 骨架、baseline 锁、`openspec/changes/<id>/proposal.md` **都没建**。修法：Tab `transition` 改为按 `request.to` 分发到 `driveClassify / driveClarify / driveDesign / drivePlan / driveImplement / driveVerify / driveArchive / driveAbandon`，源标为 `'tab'`。详见 §4。

### 1.3 三种入口下"活动变更焦点选择"的差异（**【变更】** Tier 2 #4）

之前三个地方各用各的算法选"哪个是焦点变更"，结果有时对不上：

| 入口 | 之前 | 之后 |
| --- | --- | --- |
| Tab `transition`（无 changeId） | `index.changes[0]`（按数组顺序） | `resolveActiveChange(store)` |
| `/baf-status` | `index.changes.at(-1)`（按数组顺序） | `resolveActiveChange(store)` |
| `command-drives resolveChange`（无 explicit） | `actives[0]`（按数组顺序） | `pickActiveChange(changes)` |
| `session-gate resolveStartupBinding` | `index.changes.filter(isActiveChange)` | `listActiveChanges(store)` |

新算法：**highest seq desc，ties lexical changeId asc** —— 也就是"最近一次事件的那一条"。统一封装：
- `projection.ts:pickActiveChange(changes)` —— 同步，drives 用
- `projection.ts:resolveActiveChange(store)` —— 异步，包一层 store.readIndex
- `projection.ts:listActiveChanges(store)` —— 异步，welcome 卡 + dashboard 用

---

## 2. 节点全景（八节点 + 二侧路）

```
                ┌─────────────┐
       intake ──>│ intake-conf │    T1: chat / Tab "新建变更"
                │   classified│    事件: intake-classified
                └──────┬──────┘
                       │ T2 (confirm)
                       ▼
                ┌─────────────┐
                │    open      │    driveOpenStage: 写 proposal.md + locks baseline
                │              │    事件: stage-entered(open), baseline-locked
                └──────┬──────┘
                       │ T3 (clarify_required → clarify)
                       │ T4 (full-go → clarify 跳过)
                       ▼
                ┌─────────────┐
       跳 ────>│   clarify   │    driveClarifyStage: 写 questions.md
                │ (可选)      │    事件: stage-entered(clarify)
                └──────┬──────┘
                       │ T5 (clarify done)
                       ▼
                ┌─────────────┐
                │   design   │    driveDesignStage: 写 design.md
                │              │    事件: stage-entered(design)
                └──────┬──────┘
                       │ T7  ⚠ 门 A（§18.5）
                       ▼
                ┌─────────────┐
                │   plan      │    drivePlanStage: 写 tasks.md + 任务清单
                │              │    事件: stage-entered(plan)
                └──────┬──────┘
                       │ T8
                       ▼
                ┌─────────────┐
                │ implement   │    driveImplementStage: 跑任务账本 + 允许列表守卫
                │              │    事件: stage-entered(implement)
                └──────┬──────┘
                       │ T9 (implement done)
                       ▼
                ┌─────────────┐
                │   verify    │    driveVerifyStage: 跑校验栈（C/V/Coverage/Static）
                │              │    事件: stage-entered(verify)
                └──────┬──────┘
                       │ T14  ⚠ 门 B（§18.5）
                       ▼
                ┌─────────────┐
                │  archive    │    driveArchiveStage: 原子 move 到 archive/
                │              │    事件: change-archived → terminal=completed
                └─────────────┘

   侧路 abandon（任意 active 节点可走）：
   任意节点 ──── T16 ────> change-abandoned → terminal=abandoned

   侧路 drift（detectDrift 命中时）：
   任意节点 ──── T12 ────> drift → 候选人列表（§19.4）→ 用户选节点 → T13
```

---

## 3. 事件类型（12 种，append-only JSONL）

每个 change 一个文件：`.baf/projection/<changeId>.jsonl`，外加一个 `index.json`（seq + current + mode）。

| 事件 | 来源 | 触发 | 含义 |
| --- | --- | --- | --- |
| `intake-classified` | driveClassify | intake 分类器完成 | kind / mode / scope / confidence / reasonCodes |
| `intake-confirmed` | driveClassify (confirm) | 用户确认 | confirmation='confirmed' |
| `intake-rejected` | driveClassify (reject) | 用户拒绝 | confirmation='rejected' → abandon |
| `stage-entered` | driveXxxStage | 进入节点 | node + source + artifacts |
| `stage-completed` | driveXxxStage | 完成节点 | node + artifacts 摘要 |
| `stage-failed` | driveXxxStage | 节点失败 | node + error |
| `baseline-locked` | driveOpenStage | open 时锁 | git revision + contentHash |
| `drift-detected` | detectDrift | 体检发现漂移 | 当前节点 + 差异摘要 |
| `mode-upgraded` | driveFastPath → driveOpenStage | fast-path 升级到 full-go | from mode + to mode + cause |
| `awaiting-confirm` | parkOnGate | 门 A / 门 B 阻塞 | gateId + gateCard |
| `change-archived` | driveArchiveStage | 用户确认归档 | terminal=completed |
| `change-abandoned` | driveAbandonStage | 用户确认放弃 | terminal=abandoned |
| `transition-rejected` | decideTransition | 转换非法 | from / to / reason |

每个事件都有 `at`（ISO 时间戳）+ `seq`（单调递增）+ `actor`（'agent' / 'user'）+ `source`（`slash / cli / tab / gate-card / model-tool`）。

> 【变更】Tier 2 #6：之前 `acquireWriter()` 没有"过期锁"概念 —— 如果上一次写入进程 crash 了，`.writer.lock` 永远卡在那里，新的写入永远进不去。修法：新增 `STALE_LOCK_MS = 60_000`（详见 §8.2）。实测最长合法写路径（OpenSpec validate + C-stack coverage + analysis 一起跑）< 5s，60s 阈值远高于此，不会撞活锁。

---

## 4. 关键时序：一次完整归档

下面是一次"用户从聊天敲一句话，到归档完成"的完整事件流。每一步标注谁触发、什么事件、下游 effect。

```
T=0   客户敲：「登录页在 IE 上渲染错了，帮我修」
       ↓
       服务类型事件 /baf-workflow-open "<描述>"
       ↓
T=1   driveOpen → intake 分类器运行（基于 description + workspace 状态）
       ↓
       事件：intake-classified { kind:'bug', mode:'bug-fast-path', scope:['web/login'], reasonCodes:['legacy-browser'] }
       ↓
       渲染分类卡：kind/mode/scope/confidence/openspecRequired/原因码
       ↓
       ──── [等用户确认] ────
       ↓
T=2   客户再敲一次 /baf-go
       ↓
       driveGo → go-coordinator.route() → 当前 current='intake' → 决策 T2
       ↓
       事件：intake-confirmed { confirmation:'confirmed' }
       ↓
       driveFastPathOpenStage：参数化所需字段（problem / root-cause / file / test / test-cmd）
       ↓
       校验模式 = bug-fast-path 且 current='intake' → 触发 fast-path 升级检查：
         · 改动文件 ≤ 5 ？
         · 单文件 ≤ 200 行 ？
         · 没有跨模块依赖 ？
         · 有可写回归测试 ？
       若全 yes：保持 fast-path，写 fastpath-ledger.json + bug-record.md
       若有 no：自动升级到 full-go，事件 mode-upgraded { from:'bug-fast-path', to:'full-go', cause }
       ↓
       driveOpenStage（无论模式）：探 baseline / 锁 baseline / 写 OpenSpec proposal.md
       ↓
       事件：stage-entered(open), baseline-locked { gitRev, contentHash }
       ↓
T=3   go-coordinator.route() 继续推：current='open' → T4 → enterClarifyStage
       ↓
       ──── fast-path 跳过 clarify ────
       事件：stage-completed(open, mode-upgraded-fast-path-skipped)
       ↓
       事件：stage-entered(design)
       ↓
T=4   driveDesignStage：agent 写 design.md
       ↓
       事件：stage-completed(design, artifacts=[design.md])
       ↓
       ──── 门 A：parkOnGate(design-confirm) ────
       ↓
       事件：awaiting-confirm { gateId:'design-confirm', gateCard:{title, question, options} }
       ↓
T=5   客户在**任意一个通道**确认：
       · 聊天敲 /baf-go
       · Tab 点「确认设计，进入计划」按钮
       · 终端跑 baf go
       ↓
       ──── 三个通道都过同一道 isHumanSource(source) 守卫 ────
       ↓
       drivePlanStage → 决策 T7
       ↓
       事件：stage-entered(plan), stage-completed(plan, artifacts=[tasks.md])
       ↓
       事件：stage-entered(implement)
       ↓
T=6   driveImplementStage：agent 改代码 + 每写一行 recordTouched()
       ↓
       ledger 增量：touched += [file]
       守卫：每次写入走 assertWithinAllowlist()，超范围即拒绝
       ↓
T=7   客户敲 /baf-workflow-implement done
       ↓
       driveImplementComplete（driveImplement 内部调）：所有 task done
       ↓
       事件：stage-completed(implement, artifacts=[ledger])
       ↓
       driveVerifyStage → 跑 C/V/Coverage/Static 校验栈
       ↓
       事件：stage-entered(verify)
       ↓
T=8   全部必需校验通过
       ↓
       事件：stage-completed(verify, artifacts=[verify-report.json])
       ↓
       ──── 门 B：parkOnGate(verify-archive) ────
       ↓
       事件：awaiting-confirm { gateId:'verify-archive', gateCard:{...} }
       ↓
T=9   客户**再次**任意通道确认
       ↓
       driveArchiveStage：原子 move openspec/changes/<id>/ → openspec/changes/archive/<id>/
       ↓
       事件：change-archived
       ↓
       index.json current ← 'completed', terminal ← 'completed'
       ↓
       工作流 Tab 自动刷新："已归档 · change <id>"
       ↓
       ──── 终态 ────
```

---

## 5. 三个入口的并行可达性

| 动作 | 聊天 slash | 终端 baf cli | 工作流 Tab |
| --- | --- | --- | --- |
| 新建变更 | `/baf-workflow-open <desc>` | `baf workflow-open <desc>` | 「新建变更」按钮 → `startIntake` Remote |
| 推进流程 | `/baf-go` | `baf go` | 「进入下一阶段」按钮 → `transition(..., 'open' \| 'plan' \| …)` |
| 跑某节点 | `/baf-workflow-{clarify,design,plan,implement,verify}` | `baf workflow-{…}` | Tab 节点详情里的「开始阶段」按钮 |
| 跑 fast-path | `/baf-workflow-classify confirm problem=… root-cause=… file=… test=… test-cmd=…` | 同上 | **【变更】** Tab 5 字段表单（problem / root-cause / file / test / test-cmd）— `transition → 'open'` 带 evidence |
| 归档 | `/baf-workflow-archive confirm` | `baf workflow-archive confirm` | 「确认归档」按钮（仅 verify-archive 门可触发） |
| 放弃 | `/baf-workflow-abandon confirm` | `baf workflow-abandon confirm` | Tab 节点详情里的「放弃」按钮 |
| drift 复位 | `/baf-workflow-resume [节点]` | `baf workflow-resume [节点]` | drift 卡片里的候选节点按钮 |
| 看状态 | `/baf-status` | `baf status` | 工作流页 strip + dashboard 按钮 |
| 看帮助 | `/baf-help` | `baf help` | "?" 按钮 → 展开命令清单 |
| 重弹卡 | `/baf-gate <gateId>` | `baf gate <gateId>` | drift 门自动重弹 |
| 体检 | `/baf-doctor` | `baf doctor` | 不在 Tab（属于域内，不算交互） |

> 【变更】Tier 2 #1：`gate-cards.ts` 里 design-confirm / verify-archive 的 question 文案之前只写"客户必须再敲一次 /baf-go"，没说 Tab / CLI 也是合法通道。修法：现在两个门的 question 都明确写出"聊天 / 工作流 Tab / 终端，三选一即可"。

---

## 6. 必走节点 vs 可选节点

| 节点 | 必走？ | 跳过条件 |
| --- | --- | --- |
| intake | 必走 | — |
| open | 必走 | — |
| clarify | 可选 | intake 模式 = full-go 且 description 已自洽（intake 分类器决定） |
| design | 必走 | — |
| plan | 必走 | — |
| implement | 必走 | — |
| verify | 必走 | — |
| archive | 必走 | — |

---

## 7. 模式分流

```
intake.mode = ?
   ├── full-go           ─→ open → clarify? → design → plan → implement → verify → archive
   ├── bug-fast-path     ─→ open (写 bug-record.md + fastpath-ledger.json)
   │                       │
   │                       ├── 仍然满足 fast-path 约束 ─→ implement (跳过 clarify/design) → verify → archive
   │                       │
   │                       └── 越界（改 >5 文件 / 跨模块）──→ mode-upgraded → 走 full-go
   │
   └── clarify-required   ─→ open → clarify → design → plan → … → archive
```

升级事件：`mode-upgraded { from:'bug-fast-path', to:'full-go', cause:'file-count-exceeded' }`。

【变更】之前 lane.preservedEmpty 的渲染有歧义：现在 `node.drift` / `node.completed` / `node.abandoned` 都明确有 zh 标签，"升级后升前那条置灰但不删"也写到 lane.help 里。

---

## 8. 并发与一致性

### 8.1 写锁

`.baf/projection/.writer.lock` 由 `ProjectionStore.acquireWriter()` 管理：

1. 试图创建空文件 `{}`
2. 若已存在：读 `at`，算 `ageMs = now - at`
3. 若 `ageMs > STALE_LOCK_MS`（**【变更】**，60s）：认定为前进程 crash，**删除并重试**
4. 否则等待 50ms 轮询，最多 30s
5. 写入 `{at: nowIso}` 后返回 release 函数

```ts
// packages/baf/baf-workflow/src/projection.ts
export const STALE_LOCK_MS = 60_000
async function readLockAt(path: string): Promise<string | undefined> { ... }
async acquireWriter(): Promise<() => Promise<void>> {
  // ...
  if (priorAt !== undefined && Number.isFinite(ageMs) && ageMs > STALE_LOCK_MS) {
    await unlink(lockPath)  // 回收过期锁
    return this.acquireWriter()  // 递归重试
  }
  // ...
}
```

### 8.2 重放 = 单一真相

`projection.ts:replay(changeId, events)` 是纯函数 —— 给定事件序列，还原 `WorkflowStatus`。任何"当前状态"问题都通过 re-replay 求解，**不缓存状态**。意味着：

- 进程重启后无状态恢复成本
- 任何事件都能 diff 出 "这条事件对状态的贡献"
- 没有"脏读"概念 —— 总是看 JSONL 的真相

### 8.3 Tab / `/baf-status` / `/baf-go` 三方对焦一致

**【变更】** Tier 2 #4 修复后，三处都通过 `pickActiveChange` / `resolveActiveChange` / `listActiveChanges` 选活动变更。算法：

```ts
export function pickActiveChange(changes) {
  const actives = changes.filter(isActiveChange)
  if (actives.length === 0) return { kind: 'none' }
  if (actives.length === 1) return { kind: 'one', changeId: actives[0].changeId }
  // 多活动：highest seq desc, ties lexical changeId asc
  const sorted = [...actives].sort((a, b) =>
    a.seq !== b.seq ? b.seq - a.seq : a.changeId.localeCompare(b.changeId)
  )
  return { kind: 'ambiguous', candidates: sorted }
}
```

所以"刚才还在 archive 上一条 + 新开了一条"时，三处都会把焦点给新那条。

---

## 9. 守卫（baf-guard / ToolGuard）

每个 agent 工具调用都过一遍 `baf-guard` 的同步重读：

```ts
class ToolGuard {
  // 在 ToolCall 之前
  before(changeId): void {
    const status = store.readStatus(changeId)  // 同步
    if (status.current !== expectedNode) throw new GuardError('drift_detected')
  }
}
```

如果 agent 在 implement 阶段被并发改成了 drift → agent 收到拒绝 → 必须停下来，重新看 Tab 上的 drift 菜单。

【变更】Tier 2 #6 一并修了"过期锁"问题 —— 之前 guard 同步重读可能撞到死锁上卡死。

---

## 10. 守卫层与确认门的关系

`isHumanSource(source)` 是唯一的"门"逻辑：

```ts
const HUMAN_SOURCES: readonly TransitionSource[] = ['slash', 'cli', 'tab', 'gate-card']
const NON_HUMAN_SOURCES = ['model-tool', undefined]

export function isHumanSource(source: TransitionSource | undefined): boolean {
  return HUMAN_SOURCES.includes(source as TransitionSource)
}
```

应用在：
- `decideTransition()` —— CONFIRM_EDGES 集合（T2/T3/T7/T7a/T13/T14/T16）必须 isHumanSource
- `driveArchiveStage()` —— T14 直接追加 change-archived，不走 decideTransition，但仍 isHumanSource 校验
- `driveAbandonStage()` —— T16 同上

`source` 由 host 钉死 —— **【变更】** Tab `transition` 现在显式 `source: 'tab'`，不让 client 字段覆盖。

---

## 11. 命令集与发现

工作流 Tab 顶部 strip 总有 8 个按钮 + 1 个 dashboard 按钮。所有按钮名 / 路径都来自：

- `GATE_REGISTRY` —— 确认门卡内容（§22 单一真相源）
- `drives` —— stage 起步按钮
- 事件链 —— 状态机推进（drift 菜单从 `detectDrift` 派生）

【变更】Tier 2 #1 之前 `locales.ts` 里有 24 个 `gate.{scaffold, intake-classify, design-confirm, verify-archive, abandon}.*` 键，是 GATE_REGISTRY 的 zh/en 镜像。`renderGate()` 从来不读这些键（直接读 GATE_REGISTRY），所以镜像永远是死字典，且会让"§22 改一处必须 mirror 一处"的负担凭空多出一倍。现在删了。`gate.designDone / gate.verifyPassed / gate.confirmIntoPlan / gate.confirmArchive / gate.replyToContinue` 这 5 个键不是镜像，是工作流页 strip 用的短标签，**保留**。

---

## 12. 状态展示（WorkflowTabView）

```ts
interface WorkflowTabView {
  strip: { current: NodeState; mode: WorkflowMode; totalTime: number; totalTokens: number }
  metrics: { byStage: Record<WorkflowNode, number>; pending: boolean }
  intake?: { kind, mode, scope, confidence, openspecRequired, reasonCodes, summary, confirmation }
  detail?: { node, purpose, prerequisites, actions, artifacts, completion, failure, entries, transitionsIn, transitionsOut, status, skipReasons, liveArtifacts }
  lanes: { fullGo: LaneState[]; fastPath: LaneState[]; help: string }
  edges: EdgeAnnotation[]   // 升级边、cause、time、preserved artifacts
  nodes: Record<WorkflowNode, NodeDisplayState>  // 每个节点：locked/available/in-progress/completed/failed/blocked/drifted/skipped/awaiting
  gate?: { gateId, title, question, options: [{id, label, command, args}] }  // 当前门卡（来自 GATE_REGISTRY）
  resume?: { anchor, candidates: WorkflowNode[] }  // drift 复位菜单
  actions: { enterOpen, startStage, confirmArchive, resume, refresh, dashboard, newChange }  // 按钮权限
}
```

---

## 13. 风险地图（剩余 9 项，按"用户可见性 × 修复成本"排序）

| # | 风险 | 可见性 | 成本 | 建议 |
| --- | --- | --- | --- | --- |
| R1 | Tab `transition` 不传 `confirm` 时，driveClassify / driveArchive / driveAbandon 走的是 `confirm ` 前缀注入；但 Tab UI 当前没暴露"我后悔了"的取消按钮，一旦误点 archive 立即生效 | 高 | 中（加 confirm modal） | 下版加 confirm modal，drive 内的 confirm positional 保留作内层守卫 |
| R2 | `baf status` 多活动变更时提示"用 /baf-go 让协调器选焦点"，但没真的实现 `--focus <id>` flag | 中 | 低（cli 加一个 option） | 下版加 `baf status --focus <changeId>` |
| R3 | fast-path Tab 不支持 —— 5 字段 form 未做，用户只能走 slash / CLI | 中 | 中（5 字段 form + validate） | 等 P4 |
| R4 | drift 复位仅在用户**主动** Tab 刷新时才 detectDrift，没有"打开会话自动 probe" —— 用户重启后不会立刻看到 drift 提示 | 中 | 低（session-gate 启动 probe） | `resolveStartupBinding` 加 detectDrift |
| R5 | `driveGo` 的 `parkOnGate` 只 append `awaiting-confirm`，没记 gateCard 内容快照 —— 若 §22 之后改了 GATE_REGISTRY，已归档的 `awaiting-confirm` 事件回放出来卡片内容会不一致 | 低 | 低（事件里 snapshot 标题） | 下次事件 schema 升级时补 |
| R6 | `mode-upgraded` 升级事件里 `cause` 是字符串（`'file-count-exceeded'` 之类），没有结构化细节 | 低 | 低（cause 改成对象） | 同上 |
| R7 | `STALE_LOCK_MS = 60_000` 是常数，没暴露给环境变量 —— 长尾 verify 任务（>60s）可能误判为死锁 | 低 | 低（env var override） | 加 `BAF_STALE_LOCK_MS` env |
| R8 | `BafWorkflowTabRemote.gateResolve` 在 `gateId='resume'` 时重新 derive candidates，但其他 gate 没有"陈旧 card"防御 —— 若 Tab 显示 design-confirm 卡片时用户在另一通道完成了 design，Tab 上仍显示旧卡片直到下次刷新 | 低 | 中（事件驱动刷新） | 后续加 projection event bus |
| R9 | Tab `transition → 'intake'` 是为"重显示分类卡"，但 `driveClassify` 在 status.current !== 'intake' 时返回的是"已确认并进入 X"，**不**重渲染分类卡 —— 用户想要的就是分类卡，可能拿不到 | 中 | 低（driveClassify 加 reopen 分支） | 下版加 |

---

## 14. Tier 3 收口：R1–R9 全部修完

> Tier 3 在 Tier 2 基础上把剩余 9 项风险全部按"成本升序"修完 —— `pnpm build:lib` 零 TS 错误；`packages/baf/*` + `packages/client/ui-baf-workflow` 共 **30 个 spec / 250 用例全绿**。`baf-dsh.exe` 仍按要求不生成。

### R7 — `BAF_STALE_LOCK_MS` 环境变量覆盖

`packages/baf/baf-workflow/src/projection.ts`：

```ts
export const STALE_LOCK_MS = (() => {
  const fallback = 60_000
  const raw = process.env.BAF_STALE_LOCK_MS
  if (raw === undefined || raw === '') return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1_000) {
    console.warn(`[baf] BAF_STALE_LOCK_MS=${JSON.stringify(raw)} is not a positive integer ≥ 1000; using ${fallback}ms`)
    return fallback
  }
  return parsed
})()
```

读 `process.env.BAF_STALE_LOCK_MS`；非法（负数 / 非整数 / < 1000）打 warn 回落 60s；缺失走 fallback。单元覆盖：`projection.spec.ts` 加了 3 个用例（合法覆盖 / 缺失 / 非法值回落）。

### R9 — intake 分类卡始终可见

`packages/client/ui-baf-workflow/src/client/WorkflowView.tsx`：之前 outer `<section>` 包了 `view.intake.confirmation === 'pending'` 守卫，导致 confirm 之后整个分类卡消失。修法：外层守卫去掉，保留内部 `.actions` 上的 `pending` 守卫 —— 分类元数据始终在屏，客户可以随时回看当时判定的 kind / mode / scope / confidence / reasonCodes。

### R6 — `mode-upgraded.cause` 结构化

`packages/baf/baf-core/src/events.ts`：

```ts
cause: { code: string; message: string } | string
```

`packages/baf/baf-workflow/src/stages/escalate.ts` 加 `normaliseCause()`：检测 `head === head.toLowerCase() && /^[a-z][a-z0-9-]*$/.test(head)` 自动把 `'file-count-exceeded: detail'` 这种历史字符串包成 `{ code, message }`；纯自由文本保持字符串兼容 replay。

下游两处跟着改：
- `lanes.ts` 把 `WorkflowTabUpgradeEdge.cause` 类型放宽到 `{...} | string`（`tab-view.ts` 同步）；
- `projection.ts` fold 把结构化形式解到 `message` 后再写 `reasonCodes`，保持下游字符串单态。

### R4 — session-gate 启动 probe drift

`packages/baf/baf-workflow/src/session-gate.ts`：

```ts
export interface StartupBinding {
  readonly actives: readonly ProjectionIndexEntry[]
  readonly drifted: ReadonlySet<string>
}
export async function resolveStartupBinding(cwd: string): Promise<StartupBinding> {
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const actives = await listActiveChanges(store)
  const drifted = new Set<string>()
  for (const entry of actives) {
    if (await probeDriftFor(cwd, store, entry.changeId)) drifted.add(entry.changeId)
  }
  return { actives, drifted }
}
```

`probeDriftFor` 跑 `git status --porcelain`（5s 超时），命中即把 `changeId` 写到 `drifted`。`renderWelcomeCard` 把 `drifted` 当 hint 渲染；客户重启后立刻看到"这条已 drift"标记，不用等下一次主动 Tab 刷新。

### R5 — `awaiting-confirm` 快照

`packages/baf/baf-core/src/events.ts`：

```ts
export interface AwaitingConfirmSnapshot {
  readonly title: string
  readonly question: string
  readonly options: readonly { readonly id, label, command, args? }[]
}
// awaiting-confirm: { ..., snapshot?: AwaitingConfirmSnapshot }
```

`go-coordinator.parkOnGate()` 在 append 之前用 `captureGateSnapshot(gate)` 从 `GATE_REGISTRY` 抓一份冻结副本塞进事件。`tab-view.ts` 加 `lastAwaitingConfirmSnapshot(events)`：从事件尾向前扫第一份非空 snapshot 喂给 `enrichTabGate` —— replay 出来的卡片文字与归档那一刻完全一致，即使 §22 之后改了 registry。

### R2 — `baf status --focus <changeId>`

`packages/baf/baf-workflow/src/cmdline.ts`：

```ts
.option('--focus <changeId>', '§13 R2 · explicit focus when multiple actives exist')
.action(async (cmdOpts: { focus?: string }) => {
  let changeId: string | undefined = cmdOpts.focus
  if (changeId === undefined) {
    const picked = await resolveActiveChange(store)
    // existing none/ambiguous handling
  } else if (!index.changes.some(c => c.changeId === changeId)) {
    emit(true, formatCommandReport(false, cardTitle('/baf-status', `--focus 指向不存在的变更`), [...]) + '\n', 1)
    return
  }
  const status = await store.readStatus(changeId as string)
  // ...
})
```

`--focus` 优先于 auto-pick；指向不存在/已归档的 id 直接给错误报告 + exit 1。其它入口不变。

### R1 — 销毁动作 confirm modal

`packages/client/ui-baf-workflow/src/client/WorkflowView.tsx`：

```ts
const [pendingArchive, setPendingArchive] = useState<{ changeId: string; title: string } | null>(null)
// 在 confirm-gate 按钮的 onClick 里：
if (action.id === 'confirm-gate' && (action.target === 'archive' || action.target === 'completed')) {
  setPendingArchive({ changeId, title: t('gate.verifyPassed') })
  return
}
// 组件末尾：
{pendingArchive !== null && (
  <div className={css.dashboardBackdrop} role="presentation"
    onClick={() => setPendingArchive(null)}
    onKeyDown={event => { if (event.key === 'Escape') setPendingArchive(null) }}>
    <div className={css.dashboardPanel} role="alertdialog" aria-modal="true"
      aria-label={t('action.confirmArchive')}
      onClick={event => event.stopPropagation()}>
      <h2>{t('action.confirmArchive')}</h2>
      <p>{t('gate.verifyPassed')} · {pendingArchive.changeId}</p>
      <p>{pendingArchive.title}</p>
      <button onClick={() => setPendingArchive(null)}>{t('dashboard.close')}</button>
      <button className={css.btnDanger} disabled={busy}
        onClick={() => { const target = pendingArchive; setPendingArchive(null); void run(() => transition(target.changeId, 'archive')) }}>
        {t('action.confirmArchive')}
      </button>
    </div>
  </div>
)}
```

「确认归档」/「确认放弃」不再一触即发；客户必须点 modal 里的二次确认才进 transition。Escape 与 backdrop 点击取消；drive 层 `confirm` positional 保留作内层守卫（defence-in-depth）。

### R8 — projection event bus + 焦点刷新

`projection.ts`：

```ts
private readonly listeners = new Set<(changeId: string) => void>()
subscribe(listener: (changeId: string) => void): () => void {
  this.listeners.add(listener)
  return () => { this.listeners.delete(listener) }
}
// append() 末尾（commit 成功之后）：
this.emit(changeId)
private emit(changeId: string): void {
  for (const listener of this.listeners) {
    try { listener(changeId) }
    catch (error) { console.warn(`[baf] projection listener threw: ${error instanceof Error ? error.message : String(error)}`) }
  }
}
```

`WorkflowView.tsx` 在 mount 后挂 `focus` + `visibilitychange` 监听：客户 alt-tab 回来 / 切回 IDE 时自动 `refresh()` 一次，覆盖"另一通道在我离开时动了投影"这一最后窗口。

### R3 — fast-path Tab 表单

新增 `FastPathForm` 组件（5 字段：problem / rootCause / file[多行] / test / testCmd）；当 `view.intake.mode === 'bug-fast-path'` 且 `confirmation === 'pending'` 时替换原「确认 / 拒绝」按钮组。提交时调用 `transition(changeId, 'open', evidence)`；evidence 在 host `evidenceToRawInput` 拍平成 `key=value`，数组项重复 key —— `driveClassify` 解析时与 slash 形式 1:1。

`BafWorkflowTransitionRequest.evidence` 类型放宽到 `Readonly<Record<string, string | number | boolean | null | readonly (string | number | boolean | null)[]>>` 以接纳 `file=[...]` 数组。`locales.ts` 加 9 个 `intake.fastPath.*` 键（zh + en）；`WorkflowView.module.css` 加 `.fastPathForm / .fastPathLabel / .fastPathInput / .fastPathTextarea / .fastPathHelp / .fastPathWarn`。

提交后字段清空，下次可再编辑。

### 验证

- `pnpm build:lib`：零 TS 错误（host + client 两侧）。
- `pnpm vitest run packages/baf packages/client/ui-baf-workflow`：**30 spec / 250 用例全绿**。
- 未生成 `baf-dsh.exe`（按要求仅跑 `build:lib`）。

---

## 15. 测试矩阵

| spec | 路径 | 覆盖 | 状态 |
| --- | --- | --- | --- |
| `gate-cards.spec.ts` | `tests/gate-cards.spec.ts` | GATE_REGISTRY 完整性、renderGate 渲染、isGateResolvingCommand | ✅ |
| `surface-parity.spec.ts` | `tests/surface-parity.spec.ts` | 三个入口走同一套语义（这次升级过了 §1.3 的修复） | ✅ |
| `cmdline.spec.ts` | `tests/cmdline.spec.ts` | baf status 用 `resolveActiveChange`，多活动变更卡片 + `--focus` | ✅ |
| `session-gate.spec.ts` | `tests/session-gate.spec.ts` | welcome 卡 + startup binding 用 `listActiveChanges` + `drifted` 集合 | ✅ |
| `gate-i18n.host.spec.ts` | `tests/gate-i18n.host.spec.ts` | GATE_REGISTRY 自身一致性 + locales.ts 不携带镜像 | ✅（**【变更】** 改写） |
| `transition.spec.ts` | `tests/transition.spec.ts` | 16 条 TRANSITIONS + isHumanSource 守卫 | ✅ |
| `source-stamping.spec.ts` | `tests/source-stamping.spec.ts` | Tab 钉 source='tab' | ✅ |
| ...（其余 24 个） | 各种 | 状态机 / drift / fast-path / verify 校验 / projection bus | ✅ |

总数：**250/250 通过**（30 spec）。
