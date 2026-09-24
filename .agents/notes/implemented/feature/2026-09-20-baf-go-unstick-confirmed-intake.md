# BAF 工作流卡死修复（/baf-go 推不动 + 确认后再弹框）全景图

> 配套本轮修复（`tmp/session/3.jsonl` 事故）：git 异常恢复后分类弹框不再出现、取消被误判为「确认完整流程」、`/baf-go` 与 `/baf-go-confirm` 双双报错推不动、Tab 工作流页无按钮可推。本图给出完整根因链与每一处「原来是什么样 → 现在是什么样」（`【变更】` 标注），并对后续所有阶段做了同类死锁排查，文末附按严重度排序的剩余问题清单。
>
> 产物：**没有**生成 `baf-dsh.exe`（按协议）。验证：`pnpm build:lib`（host + client）**零 TS 错误**（初跑报 1 处 `resolveViaDialog` 参数类型漏声明 `judgment`，已补，见 §2.A2）；测试 `packages/baf/ + packages/client/ui-baf-workflow/` 合跑 **32 spec / 304 用例全绿**；oxlint（`npx tsx scripts/run-oxlint.ts <目录>`）改动文件**零新增**发现（ui-baf-workflow 的 `WorkflowView.tsx` / `index.ts` 报错与 `projection.ts` 的 unused-disable 警告经 `git stash` 对照确认均为 HEAD 既有基线，projection.ts 发现数还从 3 降到 1）；另用临时工作区副本（`bafdsh_demo1` 的 parked 现场拷贝）做了端到端复放：`baf_gate_ask` 两种入参 **0 弹框 + 说明卡**、无参 `/baf-go`（新会话、无 continue 词）**直达 `已确认并进入 open · 完整流程`**。复放脚本用完即删，demo 工作区现场未动。

---

## 0. 事故与一句话方案

**事故**（`tmp/session/3.jsonl`，变更 `change-20260920-ecum-80de`）：

1. git 环境异常（`.git` 不可用）解除后，分类弹框**不再出现**；客户手输「确认完整流程」后弹框重现，但在其中点**取消**，状态仍被判定为「确认完整流程」。
2. 工作流推不动：`/baf-go`、`/baf-go-confirm` 都报「请选择本会话的工作流」；Tab 工作流图页面也没有能推动的按钮。

**一句话方案**：已确认但被环境阻断的 intake 是「**无待决决策的停靠**」——不许再弹确认框（改出说明卡 + `/baf-go` 直接补完 open）；`/baf-go` 绑定不再要求 continue 词（唯一活跃变更直接绑）；铸造即设会话焦点；Tab intake 卡补齐与弹框同款的两路径确认 + 恢复按钮。零新增解析通道，全部复用 `driveGateResolve` / `driveClassify` 既有路径。

```
git 异常解除后（intake 已确认、open 被阻断、焦点已丢）
  │
  ├─ 模型再调 baf_gate_ask ──► 不弹框，出说明卡「分类已确认，敲 /baf-go 或点 Tab「进入建立变更」」   【变更】(C)
  ├─ /baf-go / /baf-go-confirm（无 continue 词）──► 唯一活跃变更直接绑定 → confirm 尾巴重试 open    【变更】(A)
  │      └─ git 已好 → intake-confirmed + 进 open 成功卡
  └─ Tab 工作流页 intake 卡：确认中→「确认·完整流程 / 确认·缺陷修复路径」双主按钮；
     已确认未 open → 「进入建立变更」按钮（full）或缺陷表单重试（bug）/ 双路径补救（clarify）【变更】(D)
```

---

## 1. 根因链（会话时间线 × 三条根因）

| 时刻 | 事件 | 说明 |
| --- | --- | --- |
| 15:08:52 | `baf_gate_ask` 铸造 `change-20260920-ecum-80de` | 分类器判 `clarify-required`（置信 0.4），弹框等客户 |
| 15:09:20 | 客户点弹框「确认 · 完整流程」 | `intake-mode-set(full-go-path)` + `intake-confirmed` **已落账**；随后 `transition-rejected(intake→open, invalid_transition)`——**Git 不可用**，open 被阻断 |
| 15:09:29 | 模型修复 git 环境 | 环境恢复 |
| 15:09:37 | 模型再调 `baf_gate_ask` | 被「已有待确认分类的变更」守卫拦下，**不弹框**——该提示对「已确认」状态是错话，引导了下一步误操作 |
| 15:10:15 | 客户手输「确认 · 完整流程」 | 模型带 changeId 再调 `baf_gate_ask` → 弹框重现 → 客户点**取消** → 「客户暂未选择」。**状态本来就已确认**，取消什么也没改——看起来却像「取消也算确认」 |
| 15:10:47 | `/baf-go` | 报错卡「请选择本会话的工作流」——卡死实锤 |

**根因 1（取消≠误判，是重复弹框 + 错话）**：第一次点击早已 `intake-confirmed`；阻断的是 **open 阶段**的环境前置，不是分类决策。但 (a) 重试守卫的话术是给「pending」状态写的，(b) 工具对「已确认」状态照样重弹确认框——两处叠加把客户逼进了「取消一个已经答过的问卷」。

**根因 2（双命令推不动）**：`resolveBinding` 按 §18.6.4「无 continue 词绝不认领既有变更」执行；而该变更由 `baf_gate_ask` 铸造，`driveOpen` **从不写会话焦点**（焦点是进程内 Map，宿主重启即丢）。于是「焦点为空 + 无 continue 词」→ 认定无绑定 → 报错卡。`/baf-go continue` 其实能走通，但没有任何界面把这个词告诉客户。

**根因 3（Tab 无按钮）**：intake 卡的按钮全部 `confirmation === 'pending'` 才渲染；「已确认未 open」这个停靠态在卡上无任何内联动作（侧栏底部虽有 `进入建立变更` 但不可发现）。

---

## 2. 修复清单（A–G，按文件）

### A. `go-coordinator.ts` — 绑定与路由（事故 2 主修）

1. `resolveBinding`：`【变更】` 删掉 `wantsContinue` 整条通路——**工作区内只有一个未完结变更时直接绑定**，`/baf-go` 与 `/baf-go-confirm` 都不再要 continue 词。多活跃时的卡改为恒展示 `/baf-go change=<id>`（不再分「继续/切换」话术）。文档注释重写，记下 2026-09-20 事故动机。
2. `route()` `case 'intake'`：`【变更】` 在确认尾巴之前插入 **clarify-required 补救分支**——已确认但停在未定路径的变更（旧日志可达：见 F/G），无转换规则可走，classify 门仍是活决策：有 ask 通道就带 `judgmentOf` 弹框，否则渲染 `renderGate('intake-classify')` 卡，每个选项自带 `mode=`。
3. `case 'intake'` 确认尾巴：`【变更】` 注释言明「已确认未 open 无待决客户决策，`/baf-go` 在此就是重试；环境前置失败（Git…）以 drive 自身错误卡呈现，环境恢复后同一条命令即重试」。
4. **A2（build:lib 补漏）**：`resolveViaDialog` 的 `gate` 参数类型补 `readonly judgment?: GateJudgment`（`GateAsk` 本就有该字段，2 号分支传参首次暴露签名窄了）。既有「未确认 + ask」分支的 `judgment` 条件展开保持不变。

### B. `command-drives.ts` — `driveOpen` 铸造即设焦点

`【变更】` mint 成功后 `focusFor(cwd).set(intake.changeId)`。此后工具/自动弹框铸造的变更与会话有了绑定，`/baf-go` 无参即认领（与 A 叠加后，重启丢焦点也不再致命——唯一活跃直接绑）。

### C. `gate-ask.ts` — 已确认的 intake 不再弹框

`【变更】` 新增 `isSettledConfirmation`（`confirmed` 且 mode ≠ `clarify-required`）与 `confirmedIntakeNote(changeId, mode)`（说明「分类已确认（X）但尚未进入建立变更，上次被环境阻断；请敲 `/baf-go` 重试或点工作流页签『进入建立变更』」）。两处生效：

- 需求自举分支：读 parked 状态，`isSettledConfirmation` → 返回说明卡，**不铸造不弹框**；
- changeId 分支：judgment 补齐逻辑里，`isSettledConfirmation && current === 'intake'` → 说明卡，**不弹框**。

工具描述追加指引：「返回卡说 intake 已确认但未 open（被环境阻断）时，不要再弹：让客户敲 `/baf-go`（重试 open）或点 Tab『进入建立变更』按钮」。根因 1 的两处叠加（错话 + 重弹）就此拆除。

### D. `WorkflowView.tsx` + `locales.ts` — Tab intake 卡补齐（事故 2 Tab 缺口）

`【变更】` intake 卡整段重写：

- `pending`：两个主按钮 **确认 · 完整流程** / **确认 · 缺陷修复路径**（分别 `transition(changeId,'open',{mode})`，与弹框 §22.17 J 同款）+ 危险色退出 + bug-fix 选中时 `BugFixPathForm`（提交带 mode）；
- `confirmed && current==='intake'`：full → **进入建立变更**（`transition(changeId,'open')`，复用 `t('action.enterOpen')`）；bug → `BugFixPathForm` 重试；clarify-required → 双路径补救按钮（与 A.2 的弹框/卡对齐）。

props 解构移除 `confirmIntake`（接口保留、宿主接线不动）。`locales.ts` WorkflowTabKey en/zh 新增 `intake.confirmFull(Help)` / `intake.confirmBugFix(Help)` / `intake.enterOpenHelp` 五键。

### E. `stages/pipeline.ts` — 审计归因不再误导

`【变更】` open 被 git 前置阻断时，`recordRejectionQuiet` 的 reason 由 `invalid_transition` 改为 **`git_unavailable`**（抛出的 `BafError.code` 仍是 `invalid_transition`——错误码注册表 Phase-0 冻结，只动审计 reason）。本次排障第一轮就是被旧行误导的。

### F. `command-drives.ts` — `driveClassify` 确认必须带 mode（同类死锁预防）

`【变更】` 调 `confirmIntake` 前新增守卫：状态为 `clarify-required + pending` 且**未传 `requestedMode`** → 返回错误卡「分类器未定路径，需要客户选择」+ 用法行（`mode=full-go-path` / `mode=bug-fix-path` / reject），**不再半确认**。原实现会把变更「确认」在一条没有任何转换规则可走的 mode 上——那是第二颗与事故同类的死锁雷。

### G. `workflow-service.ts` + `projection.ts` — `setIntakeMode` 补救臂（legacy 日志可救）

`【变更】` `setIntakeMode`：`mode === to` 幂等返回；**已确认 + drivable mode** 仍拒绝改道；**已确认 + `clarify-required`** 放行 override（正是 F 堵住、旧日志已存在的 parked 态的唯一出口）。`projection.ts` 的 `intake-mode-set` 折叠臂做镜像收窄：`confirmed && mode !== 'clarify-required'` 才 break。重放旧日志与在线新写状态机结论一致。

另：`session-gate.ts` 欢迎提示微调为「回复 /baf-go 接着做 <id>」（删「continue」字样，与 A 的新世界一致）。

---

## 3. 系统性排查：后续阶段还有没有同类死锁？

判定标准：**任何停靠态至少有一个可达的推动面**（弹框 / slash / Tab / 工具说明卡），且重启/换会话后仍可达。

| 停靠点 | slash | 弹框 | Tab | 工具再调 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 未初始化（scaffold 门） | `/baf-go` 重弹 | ✅ §22.17 | ✅ §22.14 卡 | ✅ pops scaffold | 健康（上轮已修） |
| intake pending | `/baf-go` 重弹卡 | ✅ 带 judgment | ✅ 本轮 D 双按钮 | ✅ pops | 健康 |
| **intake confirmed 未 open**（本次事故态） | ✅ 本轮 A | ✅ 本轮 C 不重弹改说明 | ✅ 本轮 D 进入建立变更 | ✅ 本轮 C 说明卡 | **已修** |
| intake confirmed@clarify-required（legacy） | ✅ 本轮 A.2 补救 | ✅ 带 judgment 重弹 | ✅ 本轮 D 双路径 | ✅ pops | **已修（G 出口）** |
| open / clarify / design / plan / implement / verify 各停靠 | `/baf-go` 推进或重弹 | ✅ 门上重弹（§22.17 每门） | ✅ §22.14 门卡按钮 | 门上工具即弹 | 健康（绑定修复 A 覆盖所有「重启丢焦点」入口） |
| drift | `/baf-go` 弹 resume 候选 | ✅ resumeCandidates | ✅ 卡 | — | 健康 |
| 多活跃变更 | `/baf-go change=<id>` 恒展示 | — | — | — | 可恢复（按 §18.6 设计仍需显式点名） |
| open 被 git 阻断重试 | `/baf-go` 即重试（A.3 注释） | — | ✅ D 按钮 | — | **已修**（E 保证下次审计可辨） |

结论：本轮修完后，全部停靠点满足判定标准；没有发现第三颗同类雷。

---

## 4. 测试

- `tests/go.spec.ts`：`【变更】` 原「never adopts without continue」重写为 **adopts the lone unfinished change without a continue word**（断言 `clarify 已进入` + 焦点已设）；新增 **recovers a confirmed-but-blocked intake with a plain /baf-go (incident 3.jsonl)**（`.git`→`.git-away` 制造现场：classify confirm 报 invalid_transition、intake confirmed、`.git` 复原、全新焦点 `/baf-go` → `已确认并进入 open`、current=open）；新增 **classify confirm without mode= on a clarify-required verdict refuses instead of half-confirming**（守卫卡断言 → 带 `mode=full-go-path` 后直达 open）。fs 导入加 `rename`。
- `tests/gate-dialog.spec.ts`：`【变更】` 新 describe「confirmed-but-never-opened intake: explain, do not re-pop」3 例——需求自举 → 0 弹框 + 说明；changeId → 0 弹框 + 说明；confirmed@clarify-required 仍弹且点「确认·完整流程」端到端重路由到 open。本地 `mintConfirmed` 助手（driveOpen + service confirmIntake，校验分类器 mode 符合预期）。
- `tests/session-gate.spec.ts`：期望句更新「回复 /baf-go 接着做 CHG-ONE」。
- 端到端（复放后即删）：`bafdsh_demo1` 现场拷贝上 `baf_gate_ask {requirement}` 与 `{changeId}` 均 `dialog pops: 0` + 准确说明卡；无参 `/baf-go`（重置焦点缓存模拟新会话）`kind=success`「已确认并进入 open · 完整流程」。

合跑 **32 spec / 304 用例全绿**（vitest exit 0）。

---

## 5. 剩余问题（按严重度排序）

1. **`error-codes` 注册表 Phase-0 冻结**：open 被 git 阻断时抛出的 `BafError.code` 仍只能是 `invalid_transition`，按 code 渲染文案的客户端面仍显示通用措辞（审计 reason 已是 `git_unavailable`，E）。要彻底，需一次注册表扩容（另开一轮）。
2. **会话焦点仍为进程内状态**：重启丢焦点不再致命（A 兜底唯一活跃直绑），但**多活跃 + 重启**的组合仍需客户按卡的提示带 `change=<id>`（设计如此，非缺陷；提示已恒展示）。
3. **ui-baf-workflow 既有 lint 基线**：`WorkflowView.tsx` 的 no-confusing-void-expression ×~13、`index.ts` 的 no-base-to-string ×2 等为 HEAD 既有（stash 对照确认），与本轮无关，待专项清理。
4. **demo 工作区 `bafdsh_demo1` 仍停在现场态**：`.baf/projection/change-20260920-ecum-80de.jsonl` 未动（复放全用临时拷贝）。新构建装上后，客户在该工作区敲 `/baf-go` 即可恢复（正是 A 验证的场景）。
5. **事故日志中的误导审计行**：`3.jsonl` 时段写下的 `transition-rejected(invalid_transition)` 是历史事实，不回写；新写入已归因准确（E）。
