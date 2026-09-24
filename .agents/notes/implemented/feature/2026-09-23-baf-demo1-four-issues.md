# 2026-09-23 demo1 四问题批次 — 分类确认误读 / 变更分类栏 / 模板出处 / 推进=虚假推进

> 依据：demo1 工作区会话 `session-42473572-b33b-46bc-bf2c-0248a6e55478`
> （`~/.dsh/sessions/--D-Source-baf-codingplugin-demo1--/`，2026-09-23 10:51–11:05 本地时间）
> 的 zstd 会话日志 + `.baf/projection/change-20260923-ecum-f93e.jsonl` 投影日志。
> 真机验收：隔离 host（`--port 3280`）+ scratch 工作区 `demo1v4`，
> 探针 `apps/web/.demo1-4fixes-verify.mjs`（问题 1/2 全流程）与
> `apps/web/.demo1-issue4-round2.mjs`（问题 4 复测），证据在 `tmp/webwalk-demo1v4-4fixes/`。
>
> **第五轮（同日晚，用户复测后五问题）追加于本文末尾 §7**——plan 卡滞根治
> （plan.json 键名不匹配 + 回合末缺口派单）、plan.md 账本渲染、节点卡分阶段
> tokens、右栏三卡紧凑化。真机证据 `tmp/webwalk-demo1v5-5issues/`。

## 0. demo1 会话取证（修复前的事实）

| 证据 | 内容 |
| --- | --- |
| seq 48–52 | 用户敲 `/baf-go`（cmd-8）→ 分类确认弹窗 → 点「确认 · 完整流程」→ 投影 `intake-mode-set full-go-path` + `intake-confirmed` + `stage-entered open (source=gate-card)`，工单已派发（seq 49），模型 turn 2 填 proposal.md、turn 3 填 clarify.md |
| seq 52 command/done | `kind:"error"`，标题首卡 `✓ 分类确认 / 拒绝 · ★★ · 已确认并进入 open · 完整流程` + 次卡 `✗ open 裁决门未通过 · proposal 未完成 · 已派单` |
| seq 98–99 | `/baf-go`（cmd-9）→ clarify-advance 弹窗被暂停 → done 卡「等待你的确认」 |
| 投影 seq 9 | `stage-entered design source=tab`——用户点工作流页「推进」；此后会话零写入、无工单、无模型回合，change 停在 design 模板 |

## 1. 问题一：分类确认被「拒绝」

**根因（两层叠加）：**
1. `resolveGateDispatch` classify 分支的跟进（command-drives.ts）把
   `kind: follow.kind` 直接镜像——跟进 driveGo 停在 open 裁决门（proposal
   还是模板）按 §22 设计返回 `kind:'error'` 的停靠卡（带「已派单」标记），
   整条 `/baf-go` 结果就被记成 error：会话页整行错误态。
2. 卡片标题来自 SLASH_DESC 的静态能力描述「分类确认 / **拒绝** · ★★」，
   折叠行读起来像「分类被拒绝了」。

**【变更】修复：**
- `go-coordinator.ts`：导出 `DISPATCH_SENT_MARKER = '已派单'`（sent 与
  deduped 两处标记统一引用）。
- `command-drives.ts` classify 跟进：`kind` 仅在跟进**真失败**时才 error；
  跟进卡带「已派单」标记（模型正在补产物）→ 组合结果保持 `success`。
- `command-format.ts` SLASH_DESC + `commands.ts` 描述：`分类确认 / 拒绝 · ★★`
  → `分类确认 · ★★`（结果已在标题尾部：已确认并进入 open / 已拒绝 <id>）。

**真机证据（demo1v4）：** `/baf-go` → 分类弹窗 →「确认 · 完整流程」→
command/done `kind=success`，标题 `✓ 分类确认 · ★★ · 已确认并进入 open · 完整流程`，
含「已派单」，工单 1 条。单测：requirement-park.spec「a full-go classify
confirm reports success…」。

## 2. 问题二：右侧栏「变更分类」的字段语义

**根因：** 分类器是 Phase 4 的关键词启发式（intake.ts）——「重构ecum模块」
不命中 feat/bug 关键词 → `kind='unknown'`、`confidence=0.4`、`affectedScope
='unknown'`；用户在弹窗点「完整流程」只写 mode。投影 fold 在
`intake-confirmed` 时只改 confirmation，kind/scope/confidence 永远停在初判值。
而侧栏直接渲染原始枚举（`unknown`、`full-go-path`），无任何出处说明；
标题还带行话后缀「（intake）」。

**字段语义（用户问的四个点）：**
- **类型 kind** ∈ 新需求 / 缺陷 / 维护 / 待定——关键词启发式初判，谁都不再改写；
- **模式 mode** = 你在分类卡上点的路径（完整流程 / 缺陷修复路径 / 需先澄清）；
- **影响范围 affectedScope** ∈ 单文件 / 局部小改 / 跨模块 / 公共 API / 待定——
  同为初判，后续阶段产物（proposal/design）里人工细化，字段本身不回写；
- **置信度 confidence** = 启发式自评（未命中 0.4 / 命中关键词 0.7），
  不是用户确认度；确认分类不会改写它。

**【变更】修复：**
- 折叠层（projection.ts `intake-mode-set`）：客户改选 **bug-fix-path** 即断言
  「这是缺陷」——`kind:'unknown'` 落定为 `bug`（reasonCode
  `kind-settled-by-path`）；full-go 不落定（特征/重构/跨模块缺陷都走它）。
- 展示层（WorkflowView.tsx + locales.ts）：kind/scope/mode/confirmation 全部
  本地化（待定/完整流程/…）；新增「确认状态」行（待你确认 / 已确认（路径由
  你的点选落定）/ 已拒绝）；新增启发式说明行（类型/影响范围/置信度=系统
  关键词初判，确认不改写；模式=你的点选；选缺陷路径会定类型为缺陷）；
  标题 `变更分类（intake）` → `变更分类`（en 同步）。

**真机证据：** 侧栏文本 `类型 待定 / 模式 完整流程 / 影响范围 待定 / 置信度
40% / 确认状态 已确认（路径由你的点选落定）`，无裸枚举、无（intake）。
单测：projection-intake.spec「settles kind = bug…」。

## 3. 问题三：阶段产物模板的出处与标准

**结论：我们自己定义的，不是 openspec 上游带的。**
- 模板源：`packages/baf/baf-openspec/src/templates.ts`（proposal / clarify /
  design / tasks 四个骨架函数，TODO 占位）。
- 安装：scaffold/open 推进时由 StagePipeline 写入
  `openspec/changes/<changeId>/*.md`。
- **标准 = 各阶段裁决门（`baf-workflow/src/stages/gates.ts`）**，与模板一一对应：
  - proposal 门：非 TODO 占位 + 有 `## Why` 节；
  - clarify 门：阻塞问题已答/缓议 + `## Acceptance criteria` 可命令或可行为验证；
  - design 门：`## Approach` + `## Repository references`（结论必须引用真实
    文件/API）；
  - plan 门：plan.json 账本（每任务 id/title/files/verify/rollback）。
- 完成条件表随工单引用同一张表（`DOC_REQUIREMENTS_ZH`），门、卡、工单三者
  永远一致。本轮无代码变更，仅在此立档。

## 4. 问题四：Tab「推进」= 虚假推进

**根因（三层，逐层剥出）：**
1. **设计层**：advance remote 原来是 `/baf-go-confirm` 语义（`confirm:true`
   不弹窗），用户要求与 `/baf-go` 完全一致（弹窗+派单）。
2. **host 注入层（致命）**：`BafWorkflowTabRemote.static inject` 没声明
   `'agents'`，cordis 对 `ctx.agents` 抛 `cannot get property "agents"
   without inject`，被 `liveAgentFor` 的 catch 吞成 undefined →
   `makeGoDispatcher` 无 agent → **dispatch 永远 NONE**（demo1 上午「没有
   触发大模型的参与」的直接原因）；`makeGateAsk` 只能落到 host 级
   userQuestions，无会话作用域 → ask `unavailable` → driveGo 返回暂停卡，
   remote 只回 view → **点击后什么都没发生**（无弹窗、无推进、无报错）。
3. **旁路洞**：transition remote 的 clarify/design/plan/implement 分支直连
   `driveDocStage`，装完模板不派单（Tab 门 A 解锁按钮走到这里同样静默）。

**【变更】修复：**
- `static inject` 补 `'agents'`（一行，核心）。
- advance remote：`makeGateAsk(ctx, agent)` + `makeGoDispatcher(cwd, agent)` 与
  commands.ts 的 `/baf-go` 同对构造；`ask` 可用即弹窗语义，无弹窗通道才回落
  `confirm:true`。tooltip 文案同步改为「与在对话里输入 /baf-go 完全一致：会弹
  确认框，模型落定的阶段会收到工单派单」。
- transition remote：新增 `followWithDispatch` 私有方法，open/clarify/design/
  plan/implement 成功后以 customer-origin 通道跟进一次 driveGo（派单落定
  模板停靠点）；跟进带「已派单」标记不计为 error（同问题一规则）。
- 顺带修复（本轮真机复测中暴露）：**停靠需求未随铸造落定清除**——模型
  `baf_gate_ask` 引导链两处 `beginIntake` 后补 `clearParkedRequirementFor(agent)`
  （Tab `startIntake` 同）；`continueParkedRequirement` 入口新增短路：活动变更
  的 intake.summary 就是停靠原话 → 花掉停靠、不再弹 active-conflict
  （`pickSettledActive`）。

**真机证据（demo1v4，round2 探针）：** 点「推进」→ 会话页弹
「提案已完成 · 请确认推进」→ 点「确认提案 · 进入澄清」→ clarify 工单派发
（orders 1→2，node=clarify）→ 模型自起回合（turnStarts 2→3）→ 投影
open→clarify（seq 6→7）。域层另有 go.spec:1252 既有用例钉死
ask+dispatch 在 open 停靠点的行为。

## 5. 验证记录

- `npx vitest run packages/baf packages/client/ui-baf-workflow`：41 文件 /
  446 用例全绿（本批新增 3 例：full-go 分类确认 kind、kind 落定 fold、
  停靠已落定短路；改 1 例旧断言 requirement-park「error→success」）。
- `pnpm build:lib` 零错（含 tsc -b 全量类型检查）。
- oxlint：本轮 hunk 零新增（WorkflowView.tsx:1892/2018 与 projection.ts:82
  为存量）。
- 真机：见各节「真机证据」；未打包 exe（tier2 协议）。

## 6. 剩余风险 / 不平整点（按 用户可见度 × 修复成本 排序）

1. **推进弹窗在会话页而非工作流页顶部**——用户在工作流页点「推进」，弹窗
   渲染在会话视图（平台 ask 通道行为）。可见度高、成本低：可考虑弹窗全局
   浮层或自动切回会话页。本轮未动（平台层）。
2. **类型/影响范围在 full-go 路径下永远是「待定」**——语义上是诚实的（启发式
   未定、无人改写），但用户可能期待「确认后变成确定的类型」。根治 = LLM 分类
   （Phase 4 注释里预留的升级位），属 Tier 1。
3. **置信度语义易误读**——已加说明行，但「40%」仍可能被读成「系统只有 40%
   把握做这件事」。可考虑仅在待确认时显示，确认后隐藏。
4. **transition remote 的 verify/archive 分支仍无 dispatch 跟进**——这两个
   阶段产物是系统生成的（验证报告/归档移动），无模型创作停靠点，当前判断
   不需要；若后续 verify 修复循环（T11）从 Tab 触发需补。
5. **advance 的 confirm:true 回落路径无弹窗**——仅在无 live agent / 无
   userQuestions 的组合下出现（CLI/测试形态）；桌面/web 正常组合不会走。
6. **停靠匹配按 intake.summary 全等**——>500 字的陈述按 startsWith 兜底，
   极端截断边界（恰好 500 字处差异）会误判为未落定，回退到 active-conflict
   弹窗（安全侧）。
7. **demo1v4 工作区残留**——真机验收的注册表项与变更数据保留在
   `~/.dsh/storages/workspace.json` 与 `D:\Source\baf-codingplugin\demo1v4`
   （证据现场），不需要时手动删除。

## 7. 第五轮：用户复测后的五问题（2026-09-23 晚）

> 取证： relocated 工作区 `D:/Source/baf-codingplugin/demo/demo1`（change
> `change-20260923-ecum-795e`，会话 `session-428f0f6d`）。真机验收 scratch
> `demo1v5`（离线种子推到 plan 停靠，探针 `apps/web/.demo1-5issues-verify.mjs`）。

### 问题 1+3：推进到「计划」后弹窗丢失、/baf-go 无法触发、流程卡滞

**根因（一层，三个面共谋）**：plan.json 模板装的是空数组（无键名示例），
工单/满足条件文案说「缺 affected files / verify 命令 / rollback 点」，模型据此写
`affected_files` / `verify_cmd`（字符串而非数组）/ `rollback_point`；裁决门只认
`files` / `verify` / `rollback` → 永远报缺 → 工单反复派同一缺口（会话 seq 199–238
的循环）→ 门永不过 → 回合末无到期确认卡（弹窗「丢失」的真身）。

**【变更】修复**：

- 新 `stages/plan-ledger.ts`：宽容规范化（别名 files/affected_files/affectedFiles…、
  verify/verify_cmd/…（字符串→单元素数组）、rollback/rollback_point/…；顶层
  allowlist/allow_list、touched；`bugFixPath` 标记透传）。三个读者统一走它：
  `gates.ts readPlan`（plan 门）、`implement.ts readLedger`（implement 门 +
  allowlist 硬门禁）、`plan.ts renderPlanMdFromLedger`。
- 模板带 `_schema` 自述（`PLAN_SCHEMA_HINT`，读者剥离）；门的缺失清单与
  `DOC_REQUIREMENTS_ZH.plan` 改为点名规范键名并声明认别名。
- **回合末缺口派单**（orchestrator `dispatchRestingGap`）：门未过的停靠阶段，
  回合结束把剩余缺口作为工单发给模型（同 /baf-go 通道与 SENT 账本；同缺口
  下回合重臂后再派——与 /baf-go 语义一致）。旧的「完全沉默」就是卡滞形态：
  模型闲坐在被拒绝的产物旁，直到客户手敲 /baf-go。

**真机**：demo1v5 停 plan → `/baf-go` → 拒绝卡+工单 → 模型回合填 plan.json →
**回合结束自动弹「进入实现 · 请确认」** → 确认 → implement（seq 14）。用户
demo/demo1 的 change-795e 用修复后的门离线验证 ok=true（无需手工修数据）。

### 问题 2：plan.md 与 plan.json 同步

plan 完成时从账本渲染 plan.md 的机制本轮之前已存在（pipeline 两处
`renderPlanMdFromLedger`），但从未触发——plan 门从未通过。随问题 1 修复后
自然生效；渲染器改走宽容规范化（模型写别名键也能渲染出任务行）。
**真机**：确认进入实现后 plan.md 含 `### ⬜ T01-create-ecum-core …` 任务行
与「本文档由 plan.json 账本自动渲染」头，不再是 TODO 模板。

### 问题 4：节点卡分阶段 tokens

metrics 折叠（窗口归属）与节点卡渲染均已存在，真机却是 '—'——**同一个
cordis inject 吞错类**：`ctx.sessionQuery` 未声明 inject，`usagePointsFor`
的 try/catch 把抛错吞成永久空数组。`static inject` 补 `'sessionQuery'`（构建
产物核实）后：真机节点卡 `计划 398869 / 实现 570099`（离线种子的文档阶段
'—'——无模型工作量的真实语义）。

### 问题 5：右栏三卡紧凑化

- 变更分类：删两段解释文案；字段序改为 模式（已定决策）→ 类型/影响范围/
  置信度（初判）→ 确认状态；字段语义说明改为置信度单元格的悬停 title；
  待确认用 `.metaValueWarn` 高亮为唯一异常点；摘要保留为尾行。
- 阶段产物：删解释行与每行「打开」按钮（文件名即打开控件，虚下划线链接式）；
  缺失清单折叠为一行「缺 N 项（悬停查看）」（`.artifactGap`，warn 色）。
- 会话统计：删解释行；活动行（回合/步骤/工具调用/模型耗时/工具耗时）+
  成本行（合计/输出/缓存命中）两行紧凑 grid；token 明细（输入/缓存读/写）
  移入合计的悬停 title。

**真机**：三卡无行话；stats 9 个可见键值对；artifacts 带折叠缺口行。

### 第五轮测试与遗留

- `packages/baf` 446+ 用例全绿（新增：plan 门别名接受 + readLedger 同形 +
  renderPlanMdFromLedger 渲染别名行 + orchestrator 回合末缺口派单含重臂语义；
  改 1 例「stays silent」→「dispatches the remaining gap」）。`pnpm build:lib`
  零错。
- 遗留：① tasks.md 与 plan.md/plan.json 语义重叠，rail 里永久显示「仍是未填
  的模板」（建议下轮从 rail 剔除或停装）；② 回合末缺口派单每个模型回合一次，
  模型反复无法完成时会持续重派（语义即 /baf-go，可接受但可加频控）；③
  `_schema` 提示键在用户手工编辑的 plan.json 里会留存（读者剥离，无害）。
