# bug-fix-path 卡住/瞬时推进三轮根修 + 工单硬化全景（2026-09-27）

需求来源：用户 2026-09-26 工作流 3（verbatim）——「full-go-path流程是对的，但是
bug-fix-path会卡住，不会通过弹窗推进。工作流页面的bug-fix-path卡片也不对，应该和
full-go-path路径一致，但是有裁剪。」验收约束：「工作流相关的修改，完成后需要在
web端确认ok，再生成web让我确认。」

终态契约（三轮修复后全部成立，web 实测）：

1. 分类确认（缺陷修复路径，无字段）→ 变更进入 open，**点击本身绝不推进到
   implement**——模糊占位 → 拒绝卡 + 派单（模型在回合内补记录）；貌似真实的预填 →
   停靠「Bug 记录已完成 · 请确认推进」advance 卡等客户确认。
2. 记录补齐后，advance 卡在**两套 UI 同题同选项**（会话卡 `[data-baf-gate-card]` +
   工作流 Tab 顶部对话框 `[data-live-gate]`）；经 Tab 顶部对话框点击「确认 Bug
   记录」→ `/baf-go-confirm` 解锁 → 进入 implement + 回归先行工单派发。
3. 工作流 Tab 的 bug-fix-path 卡片与 full-go-path 一致但有裁剪：轨道工件恒为
   bug-record.md / plan.json / verify.md（无 proposal.md / tasks.md / clarify.md），
   顶条挂「已跳过 OpenSpec（缺陷修复路径）」横幅。

## 一、根因链（web 走查逐轮暴露，每轮先取证后修）

### Round 1：模糊占位穿透 gate（demo-bugfix2 前置取证）

`VAGUE_PLACEHOLDER`（stages/gates.ts）用 `\b` 断词，而 JS 的 `\b` 基于 ASCII
`\w`——**跟在中文后面永不匹配**，「待定位」「待新建」全部漏网，TODO 草稿直接过
`bugRecordGate` 审。
【变更】`stages/gates.ts`：CJK 备选后去掉 `\b`（仅 `TBD\b` 保留）。单测 27/28 →
28/28；`tmp/repro-instant-advance.mjs` 离线复现：verbatim 模糊预填 → 拒绝。

### Round 2：貌似真实的编造预填 + 平凡分支瞬时推进（demo-bugfix2 实测发现）

模型可以在分类确认的追问回合里把 bug 字段表单预填成「看起来真实」的内容（甚至
纯编造——夹具工作区根本没有 ecum 源码），硬化后的 gate 也拦不住；随后
classify-confirm 的 follow-up（command-drives.ts：`rawInput = change=<id>`，无
confirm token → driveGo 平凡分支）在客户点击路径的同一秒直接 `advanceOpen()` 跳进
implement（会话日志：click → +115ms implement），**客户从未确认过这份记录**。
full-go-path 天然免疫（classify 时 proposal.md 不可能存在）。
【变更】`go-coordinator.ts` open 分支：ask 通道之后、`advanceOpen()` 之前——
bug-fix 且记录已过 gate 时改为 `renderGate('bugfix-open-advance', …)` 停靠（与
advance 家族「无 parked 态」的既有设计一致，command-drives.ts:1251 注释），解锁
动作=`/baf-go-confirm`（卡的「确认」点击或回合尾 `docAdvanceDue` 弹出）。
【变更】`requirement-park.spec.ts`：改名用例「分类确认追问停靠 advance 卡；确认
点击派单」——分类点击后 `current=open`、0 工单、卡含「Bug 记录已完成 · 请确认
推进」；`driveGateResolve(root,'bugfix-open-advance','advance',…,'gate-card',
{changeId,dispatch})` → `current=implement`、1 工单、advance.text 含「已进入
implement」。离线证明：路径点击→open/0 单；确认点击→implement/1 单。

### Round 3：模型自造 changeId 穿透 bootstrap（demo-bugfix4 实测发现）

模型带**编造的 changeId** 调 `baf_gate_ask`（如 `fix-ecum-export-empty-crash`）；
gate-ask.ts 的 bootstrap 校验条件是 `changeId === undefined` 才做 intake 校验——
有 id 就全跳过，弹出的对话框指向不存在的变更，点击落「无此变更」，全程没有任何
change 目录被铸造。
【变更】`gate-ask.ts`：`intake-classify`/`new-workflow` 门上，传入的 changeId 先查
`ProjectionStore.readIndex()`：不存在且无 `requirement` → 直接返回拒绝卡
（「changeId 由系统铸造，不要自造。请改用 requirement=<客户原话> 重新调用」）；
不存在但有 requirement → 按 requirement 正常铸造（`effectiveChangeId = undefined`）。
card/input/bootstrap 三处全部改用 `effectiveChangeId`。
【变更】`gate-dialog.spec.ts` §22.17 两条新用例：编造 id + requirement → 按
requirement 铸造（恰好 1 个 `/^change-/`）；编造 id 无 requirement → 0 次服务调用、
拒绝文案、无铸造。38/38。

### 附带：工单文案硬化

【变更】go-dispatch 工单 BUG_RECORD_REQUIREMENTS_ZH：Impact scope 节要求「每行
一个 `- 路径`，不是文字描述」；Regression test 节要求「回归测试文件路径与可执行的
运行命令」——配合 `tmp/repro-instant-advance.mjs` 的 verbatim 模糊预填复现，防止
模型用工单外的话术蒙混。`go-dispatch.spec.ts` 两处 toContain 同步。

## 二、工作流 Tab 裁剪面（「卡片一致但有裁剪」的落点）

- advance 卡经 `renderGate('bugfix-open-advance')` 渲染 → Tab `WorkflowView` 的
  LIVE 门对话框（`[data-live-gate]`，Tab 在屏才挂载）与 会话卡
  `[data-baf-gate-card]` 同题同选项（前一批次的统一交互面直接复用）。
- Tab 轨道工件三件套 bug-record.md / plan.json / verify.md（裁掉
  proposal.md/tasks.md/clarify.md）；顶条「模式=缺陷修复路径」「当前=建立变更→实现」
  随推进走。
- 点击走 Tab remote 通道（非会话 command），会话日志里只有 `agent/inbox/spliced`
  工单与 turn 起止为 ground truth。

## 三、web 验收走查（真机、真模型回合，逐轮取证）

验收脚本 `apps/web/.verify-bugfix.mjs`（node + playwright，`node .verify-bugfix.mjs
"<token URL>"`），关键骨架：

- 夹具提示随首条消息注入（「ecum 源码尚不存在……无需向客户提问」）——空夹具工作
  区上模型会停在 `baf_question_ask`（demo-bugfix3 的教训）；
- `answerPendingQuestion()`：各轮询循环兜底应答通用问题卡（ affirmative 选项或
  free-text 直接继续）；
- **tasks.md 是 implement 入口的磁盘标记**（只在真正进入 implement 时写出）：
  分类点击后断言 `click.no-instant-advance`（tasks.md 不存在）；
- `gatePassesOnDisk`：bug-record.md 无 TODO/待定位/待新建、plan.json allowlist
  非空且无占位；模型未及时补齐时探针按 spec 夹具同形状代写（fallback）;
- advance 等待 45 轮（兜底安静时 `/baf-go` 重弹真卡）→ Tab 顶部对话框同题断言
  （`advance.same-title`）→ 经 Tab 点击「确认 Bug 记录」→
  `strip.current-implement` 与 `implement.tasks-md-written` 双断言；
- 终检双面扫描（Tab 文本 + 会话转录；receipt 卡可能只落模型 inbox，页内 ground
  truth= 轨道「实现·进行中」）。

走查台账：

| 轮 | 工作区 | 结果 | 发现/取证 |
|---|---|---|---|
| 1 | demo-bugfix2 | 崩溃→改脚本 | 模型回合内插 `/baf-go` 不可行（composer 隐藏 180s 超时）；顺带实测出 Round 2 瞬时推进（click+115ms） |
| 2 | demo-bugfix3 | abort | 模型停在 `baf_question_ask` → 夹具提示 + answerPendingQuestion |
| 3 | demo-bugfix4 | FAIL draft | 模型编造 changeId → Round 3 根修（gate-ask 校验） |
| 4 | demo-bugfix5 | 15/17 | 2 FAIL 均为检查面错扫（receipt 只落模型 inbox/Tab）；会话日志证明 17:23:41.547 `agent/inbox/spliced` 工单（阶段：implement · 回归先行）与 click 同秒、turn 2 跑满 21s；截图 08 证实 Tab「实现·进行中」+ 三件套 + 横幅 |
| 5 | demo-bugfix6 | **17/17 全绿（0 fail）** | 终检改双面扫描后重跑：模型自己补齐记录（record-model-completed=true，探针 fallback 未触发）；全链路断言绿——分类点击后无 tasks.md、双 UI 同题 advance 卡、Tab 点击→实现、tasks.md 写出、轨道三件套、无死态 |

（本轮结果见验证台账）

## 四、验证台账

| 门 | 结果 |
|---|---|
| vitest baf-integration（baf-workflow） | 364/364（requirement-park / gate-dialog 38 / go-dispatch 更新后） |
| oxlint（root） | 无新增（gate-ask.ts max-len 140 已修；repo 2199 条均先在） |
| 离线复现 | tmp/repro-instant-advance.mjs：verbatim 模糊预填 → 拒绝；点击→open/0 单；确认→implement/1 单 |
| web 走查 demo-bugfix5 | 15/17（2 条检查面错扫，产品行为全绿） |
| web 走查 demo-bugfix6 | 17/17 全绿（0 fail） |
| 全量 `pnpm run build` | EXIT 0，273 client artifacts（与上一轮全量构建持平）；构建前按 watcher-race 梯子停 dev:web + 全量 purge + 恢复 deploy 树桩 + 两个 excluded 包单独 tsc -b |
| 产物新鲜度锚点 | `baf-workflow/lib/types/go-coordinator.js` 含 bugfix-open-advance×4、`gate-ask.js` 含「由系统铸造」、`stages/gates.js` 含 VAGUE_PLACEHOLDER、`ui-conversation` hero 双串、`ui-baf-workflow/lib/client.js` 含 data-live-gate |
| 生产 serve smoke | hero 标题/BAF badge 绿；demo-bugfix6 既有会话（含 agent 回合）打开后工作流页签挂载绿（脚本 `apps/web/.verify-prod-{smoke,tab}.mjs`） |

## 五、剩余风险 / 不平整点（按 用户可见度 × 修复成本 排序）

1. **Tab 派单 receipt 不落任何客户面**（可见度中/成本低）：经 Tab remote 通道的
   `/baf-go-confirm` 派单，工单直接 splice 进模型 inbox；会话页打 `/baf-go` 时有的
   「已派单」回执卡在 Tab 点击路径上不渲染——客户只能从轨道「实现·进行中」+ token
   燃烧间接感知。候选修复：Tab 通道 resolve 后短暂挂 receipt 卡。
2. **模型预填「貌似真实」内容仍可过 gate**（可见度低/成本高）：gate 只能拦占位与
   形状，拦不住语义编造（夹具工作区里编 `ecum/export.js`）。停靠 advance 卡后这
   已不是绕过（客户确认前不推进），但确认卡上可考虑展示记录摘要供客户过目。
3. **验收脚本未入库**（低/低）：`apps/web/.verify-bugfix.mjs` untracked；连同
   verify-batch/verify-timer 一起决定入库或移 tmp。
4. **demo 夹具工作区残留探针铸造的 change**（低/低）：demo-bugfix2~6 各有 1 个
   change-20260926-bug-ecum-* 目录（走查产物）；不影响后续走查（fresh 工作区每次
   新建），需要时可人工清理。
