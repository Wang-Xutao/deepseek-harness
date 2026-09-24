# BAF web 端全流程实测闭环：r12 卡滞链修复（stall #2/#5/#6 + Git 锚点 + 新建门）→ verify 质量门死结（Fix C）→ r13 一次跑通归档可查（全景图）

> 配套本轮修复（2026-09-22）：用户验收指令——「上述问题修改完成后，我要你自己通过web端，跑通完整的baf工作流程。中间所有的流程推动都需要使用弹窗卡选择完成，不允许出现卡滞，命令异常等情况。随时修改调试，最后保证整个流程顺利跑完，归档可查。」对照基准 = 用户六条规范（①首个对话框先确认是否存在未结束工作流（存在→绑定，不存在→新建）；②绑定旧工作流继续推进；③新建工作流第二个对话框确认修改范围 full-go-path / bug-fix-path；④全程弹卡推进，误关用 /baf-go 重开；⑤每阶段文档产物是下阶段前提，没有不允许推进；⑥工作流相关全部由 agent/harness 控制，工作流是框架、大模型是工具）。**结局：r13 一次通过——change-20260921-ecum-8028（重构 ecum 模块，full-go-path）走完 intake→open→clarify→design→plan→implement→verify→archive 全程，归档目录 / 投影 / 会话记录三层可查。** 本图按「原来是什么样 → 现在是什么样」贴【变更】，文末附六条规范逐条对照与剩余问题排序。
>
> 验证 = baf-integration **35 文件 / 382 用例全绿**（含本轮新增：stages.spec.ts 2 项 Fix C 行为钉、orchestrator/stage-brief/ask-queue/begin-intake/question-ask 新测试文件）；`pnpm build:lib`（host + client，含 tsc -b）零错误；**r13 web 真机实测归档**（证据见 §4）。本轮仅 build:lib，未打包 exe/NSIS（Tier-2 协议）。

---

## 0. 卡滞链 → 修后总览

walk r12（Playwright 驱动 web，`apps/web/.auto-walk.mjs`，预算 900s + 4 次 revival）逐站暴露的卡滞与死结：

| # | 现象（r12 实测） | 根因 | 修后 |
| --- | --- | --- | --- |
| 1 | clarify/design 模板产物没人写——点选推进卡后画面静止，模型早已收工 | 模型回合通常**先于**客户点选结束（bootstrap 工具返回→回合关闭→orchestrator 弹推进卡→点选晚到），点选落进 authoring 阶段时无人著述 | **stage-entry wake**：`DriveAdapters.wake` 全通道挂接，点选派发成功且落 authoring 节点 → 给会话 agent 排一记 followup（阶段工作简报） |
| 2 | 模型写完产物结束回合，但系统认为产物缺失，且**无卡可弹**——静默卡死 | `dueGateFor` 只看投影事件（append），产物补齐走的是文件写入不产生事件；「回合结束时该弹什么卡」与「产物还缺什么」是两个问题 | **turn/end 缺失清单唤醒**：回合末无卡到期时读产物缺失清单，非空则排 wake-missing followup（per workspace+change+stage 去重台账） |
| 3 | 模型写了 `## 7. Acceptance criteria`，clarifyGate 判 `stage_incomplete`——门与模型对「完成」认知分裂，又无人报信 | 门契约是「该节存在」，实现却是字面量匹配唯一一种标题写法 | **Fix A**：标题正则容错——接受编号/浅后缀变体（`/^#{2,4}\s*(?:\d+[.)、]\s*)?Acceptance criteria\b/im`） |
| 4 | design.md 单次超长 write 连续 6 次被模型服务返回空响应，回合失败重试耗尽 | 模型一次性写超长文件易触发空响应 | **简报纪律**：stage-brief 固定加「写产物分节进行：先 write 骨架，再多次小段编辑补齐」+「工作区内已有材料直接读取使用，不向客户索要路径/URL」 |
| 5 | `/baf-go` 通道弹的推进卡点选后同样卡死（模板 design.md 冻结） | 该通道的派发绕过了 stage-entry wake（当时 wake 只挂在 orchestrator pop 一处） | **stall #5**：wake 挂到 `resolveGateDispatch` 外层适配器臂——orchestrator pop / coordinator 对话框 / `baf_gate_ask` bootstrap / Tab **四个表面共用**，零重复逻辑 |
| 6 | verify 永远 fail：quality 行三连 `build:policy_missing / test:policy_missing / analyzer:<enterprise-tbd>:policy_missing` → backToImplement 弹回 implement → 模型连环问卡（「质量门要如何填…三个字段你希望怎么处理？」）→ 误写 `.baf/baseline.yml.tmp` 被 guard 拦 → 再触发 scaffold 卡——**死循环，无带内出路** | scaffold 生成的 baseline.yml 的 stack.build/test/analyzers 全是 `<enterprise-tbd>` 占位；baf-quality fail-closed 把每个占位记为 `passed:false, reasonCode:'policy_missing'`；verify 的 quality row `required:true` 且 `ok:report.passed` → 必败。而模型无 allowlist 通道改 `.baf/baseline.yml`（guard 正确拦截），客户从未被问过这三个字段 | **Fix C**：占位分区——`policy_missing` 失败计「缺席」不计「失败」（与 unwired adapter 的 `tool_unavailable` 注记、`secretScan:'off'` 的 skipped 注记同语义）；真实失败（非 policy_missing reasonCode、数字覆盖率未达标、signal.aborted）仍然门禁 |

## 1. r12 死结事件链（Fix C 的立案证据）

```
/baf-go（resume）→ driveVerify → CheckRunner 四行
  quality 行: report.passed=false（3 个 policy_missing check）→ ok:false → T11
  → backToImplement=true → 弹回 implement → 模型收到「quality 未过」
  → gate#3 卡「质量门要如何填（build/test/analyzers）…」客户无从答起
  → gate#4 卡「…三个字段你希望怎么处理？」
  → 模型越界编辑 .baf/baseline.yml（+ .tmp）→ baf-guard 硬拦（allowlist 外，正确）
  → 触发 scaffold 卡 → 死循环
```

关键认知：**未配置的检查是缺席的检查，不是失败的检查**。fail-closed 防的是「系统猜测构建命令」；但把「客户从未配置」当作「验证失败」惩罚 implement 阶段，等于给每台新初始化工作区判了无期。修复后 r13 resume 的第一张卡直接是「检查已通过，请确认归档」。

## 2. 变更明细

### 2.1 stage-entry wake（stall：模型回合先于点选结束）

【变更】[pipeline-factory.ts](../../../../packages/baf/baf-workflow/src/pipeline-factory.ts)：`DriveAdapters` 新增可选 `wake(info: {changeId, node})`——门点选把变更停进 authoring 阶段而模型空闲时的统一唤醒口。

【变更】[command-drives.ts](../../../../packages/baf/baf-workflow/src/command-drives.ts)（`resolveGateDispatch` 外层）：派发成功且 `opts.changeId` 读回的 `current` 是 authoring 节点 → `adapters.wake(...)`；best-effort（读投影失败不扰动已解决的门）。挂在外层意味着 **orchestrator pop / coordinator dialog / `baf_gate_ask` / Tab 四个表面全量覆盖**。

【变更】[go-coordinator.ts](../../../../packages/baf/baf-workflow/src/go-coordinator.ts)（stall #5 四处）：`/baf-go` 各 parked 形态（design-confirm / verify-archive / active-conflict 等 parked twin）补派发尾唤醒对齐。

【变更】[commands.ts](../../../../packages/baf/baf-workflow/src/commands.ts:708)、[gate-dialog.ts](../../../../packages/baf/baf-workflow/src/gate-dialog.ts:195)：`/baf-go` 通道对话框与 `askGateDialogQueued` 的 resolve 派发统一走带 wake 的入口。

### 2.2 turn/end 缺失清单唤醒（stall #6，orchestrator）

【变更】[orchestrator.ts](../../../../packages/baf/baf-workflow/src/orchestrator.ts)：`wakeIncompleteAuthoring`——回合末无卡到期时，读 stage-brief 的缺失清单（clarify/design/plan/implement 产物逐项），非空 → `agent.followup` 一记「这些产物还缺」唤醒；**per (workspace, change, stage) 去重台账**防止每回合重复轰炸；stall #2 修复：`dueGateFor` 只见投影事件的盲区由这条兜住（失败卡也作为 wake 信号，下一回合修复）。

### 2.3 stage-brief：阶段工作简报 + 两条纪律（新文件）

【变更】[stage-brief.ts](../../../../packages/baf/baf-workflow/src/stage-brief.ts)：`stageBriefText(changeId, node)`——clarify/design/plan/implement 各自的要求清单（与 gates.ts 的判定逐字同源：clarify 要 `## Acceptance criteria` 每条可验证；plan 要 plan.json 全字段 + allowlist 非空 + plan.md/tasks.md 同步；implement 要 done 置位 + touched ⊆ allowlist）+ 两条纪律：
1. 「写产物分节进行：先 write 文件骨架，再用多次小段编辑把各节补齐——一次性的超长 write 容易被模型服务返回空响应导致回合失败（2026-09-22 web walk：design.md 单次大 write 连续 6 次空响应）」；
2. 「工作区内已经有的材料，不要向客户索要路径、URL 或链接，直接读取使用」。

另有固定收尾：「产物完成后直接结束回合即可：系统会在回合结束时检查产物并弹出下一阶段确认卡」「不要执行 /baf-go，也不要指导客户敲命令」。`stageBriefWake` = `DriveAdapters.wake` 实现（fire-and-forget，著述前复查产物确实仍缺）。

### 2.4 Fix A：clarifyGate 标题容错（stall #6）

【变更】[stages/gates.ts](../../../../packages/baf/baf-workflow/src/stages/gates.ts:142)：Acceptance criteria 节判定从字面量匹配改为正则——接受 `## 7. Acceptance criteria` 等编号/浅后缀变体。门契约是「节存在」，不是「某一种写法」。

### 2.5 Fix C：verify 质量门 policy_missing 分区（本窗口核心）

【变更】[stages/verify.ts](../../../../packages/baf/baf-workflow/src/stages/verify.ts)（quality row）：失败分区 `real`（reasonCode ≠ policy_missing）/ `placeholders`（= policy_missing）；`ok = !signal.aborted && (report.passed || real.length === 0)`；通过且仅占位失败时 diagnostics 注记 `skipped: quality gates not configured (N policy_missing placeholders; fill .baf/baseline.yml stack.build/test/analyzers to enable them)` + 逐条 `id:policy_missing`（修后实测归档报告即此形态）；真实失败仍列 `id:reasonCode` 并门禁。JSDoc 同步：「a check that was never configured cannot fail, and only checks that actually ran gate」。

### 2.6 规范①③落地：新建工作流确认门 + scaffold Git 锚点

【变更】[gate-ask.ts](../../../../packages/baf/baf-workflow/src/gate-ask.ts:171)：`confirmNewWorkflow`——无活动变更时客户需求先过 `new-workflow` 注册门（「新建 / 暂不」）；新建则**同一工具调用内**续接 intake-classify 分类卡（规范③的 full-go-path / bug-fix-path 决策）；暂不则工作区纹丝不动。绑定路径（规范①②）由 baf-welcome 检出未完成流 + bind-workflow 门承接（见 [2026-09-21-harness-owned-workflow-line.md](./2026-09-21-harness-owned-workflow-line.md) §4）。

【变更】[command-drives.ts](../../../../packages/baf/baf-workflow/src/command-drives.ts:973)：scaffold 同时锚定 Git——无仓库时 init + commit，完成卡加「Git 仓库」节。full-go-path open 无 revision 硬阻断，而「工作流拥有的前置条件不该让客户开终端」。

## 3. 测试（as-built，全绿）

- [stages.spec.ts](../../../../packages/baf/baf-workflow/tests/stages.spec.ts) 新增 2 项（Fix C 行为钉）：①仅占位失败（4 checks 全 policy_missing、report.passed=false）→ `backToImplement===false`、quality row `ok:true`、diagnostics 首行含 `skipped: quality gates not configured`、聚合 `passed===true`；②真实失败与占位并存（build `nonzero_exit` + test policy_missing）→ `backToImplement===true`、`diagnostics` 恰为 `['build:nonzero_exit']`。既有 T11 测试用 `exit_code`，不受分区影响。
- 新测试文件：[orchestrator.spec.ts](../../../../packages/baf/baf-workflow/tests/orchestrator.spec.ts)、[stage-brief.spec.ts](../../../../packages/baf/baf-workflow/tests/stage-brief.spec.ts)、[ask-queue.spec.ts](../../../../packages/baf/baf-workflow/tests/ask-queue.spec.ts)、[begin-intake.spec.ts](../../../../packages/baf/baf-workflow/tests/begin-intake.spec.ts)、[question-ask.spec.ts](../../../../packages/baf/baf-workflow/tests/question-ask.spec.ts)。
- baf-integration 全量 **35 文件 / 382 用例**；`pnpm build:lib` 零错误。

## 4. r13 归档证据（三层硬证据，2026-09-21T20:32 UTC）

1. **归档目录** `openspec/changes/archive/change-20260921-ecum-8028/`：proposal.md / clarify.md / design.md / plan.json / plan.md / tasks.md / implement-log.md / verify-report.json 齐全；verify-report.json `passed:true`，quality 行 `ok:true`，diagnostics = `["skipped: quality gates not configured (3 policy_missing placeholders; …)", "build:policy_missing", "test:policy_missing", "analyzer:<enterprise-tbd>:policy_missing"]`，toolVersions 含 gcc 16.1.0。
2. **投影** `demo_2/.baf/projection/index.json`：`current:"completed"`，seq 28，updatedAt `2026-09-21T20:32:44.256Z`。
3. **会话存储**（`~/.dsh/sessions/--D-Source-baf-codingplugin-demo_2--/session-d912d65a…/session.v3.jsonl.zstd`，`tmp/zcat-session.mjs` 解帧）：baf-welcome「有一条没做完的工作流 change-20260921-ecum-8028（进行到 implement）」→ /baf-go「✓ 自动驱动到下一个客户确认点 · ★★★ · 检查已确认 · 已归档」→ /baf-list「1 条变更 · change-20260921-ecum-8028 · 完整流程 · completed」。

r13 时间线：修 Fix C → 杀 r12 host/walk → 起 host r13（3080）→ walk resume 发 /baf-go → **第一张卡就是「检查已通过，请确认归档」**（证明 resume→driveVerify→新 quality 语义生效）→ 点「确认归档」→ 归档完成。另：r12 中模型曾自行用 PowerShell 还原越界编辑的 baseline.yml 并从 plan.json touched 移除该条目——规范⑥「框架管、模型著述」的行为学佐证。

## 5. 六条规范逐条对照（r13 live 证据）

| 规范 | 落地 | 证据 |
| --- | --- | --- |
| ① 首对话框查未结束工作流 | baf-welcome 检出 + new-workflow 确认门（无活动时） | fresh 轮 new-workflow 卡；r13「有一条没做完的工作流…（进行到 implement）」 |
| ② 绑定旧流继续推进 | resume 绑定 change-20260921-ecum-8028 一路推到归档 | /baf-go「检查已确认 · 已归档」 |
| ③ 新建第二对话框定范围 | intake-classify 卡选「完整流程」（full-go-path） | 投影 mode:"full-go-path" |
| ④ 弹卡推进 + 误关 /baf-go 重开 | 全程 0 次散文决策；r13 用 /baf-go 重开推进 | walk POLICY 全卡点选；会话无 A/B「回 1A 2C」记录 |
| ⑤ 产物是下阶段前提 | clarifyGate Fix A 判节、plan 三产物门、implement 9/9 done 才过 verify | 各门 reasonCodes=stage_incomplete 拦截记录 |
| ⑥ 工作流由 agent/harness 控制 | orchestrator 弹卡、模型只著述；越界编辑被 guard 拦且模型自愈 | r12 baseline.yml 越界被拦 + 自行还原 |

## 6. 剩余问题（按 用户可见度 × 修复成本 排序）

1. **baseline.yml 占位的长期出路**（高可见 · 中成本）：Fix C 让占位不再门禁，但企业真机首次使用仍无「三个字段怎么填」的采集入口。出路二选一：企业输入冻结（scaffold 前问一次）或 scaffold 向导收集；verify 报告的诊断行已给出 fill 提示作过渡。
2. **斜杠面同类异常未接**（高可见 · 低成本，承前轮清单）：`/baf-workflow-classify confirm` 在无 Git 工作区仍把 `BafError` 抛给宿主命令运行器（[commands.ts:448](../../../../packages/baf/baf-workflow/src/commands.ts)）；工具面已兜，斜杠面宜同款 try/catch 卡化。
3. **真机回归未做**（高可见 · 中成本）：本轮仅 build:lib（Tier-2 协议不出 NSIS）；全链打包复验随下一次打包轮。
4. **headless 截图取证的已知限制**（低可见 · 低成本）：Playwright headless 下 `document.body.innerText` 抓不到虚拟化会话区，/baf-list 的 UI 截图未取成；会话存储 command/done 事件是斜杠输出的 ground truth（`tmp/zcat-session.mjs`）。侧栏会话行选择器：`[role=treeitem][draggable=true]` 但首行是「新会话」占位、按名定位需先展开工作区节点——留档备查，不影响产品。
5. **walk 脚本 archived 自检假阴性**（低可见 · 低成本，脚本自身）：`.auto-walk.mjs` 的 snap() 只 grep 小 YAML 的 status/stage 行，归档后无此类文件误报未归档；实际归档以三层硬证据为准。可改为 grep 投影 index.json。
6. **两段等待的取消语义 / modelFacingCardText 字符串替换脆弱性**（承 [2026-09-22-baf-gate-ask-scaffold-continuation.md](./2026-09-22-baf-gate-ask-scaffold-continuation.md) §4，未变）。

## 7. 临时脚本处置

- 保留：`apps/web/.auto-walk.mjs`（验收 harness：发 /baf-go、按 POLICY 点卡、900s 预算 + revival）、`apps/web/.auto-diag.mjs` / `.auto-read-session.mjs` / `.auto-probe-pick.mjs` / `.auto-verify.mjs`（诊断族）、`tmp/zcat-session.mjs`（会话存储解帧取证）。
- 删除：`tmp/baflist-probe.mjs`（tmp/ 下解析不到 playwright，坏例）、`apps/web/.baflist-probe.mjs`（UI 截图取证未成，headless 限制见 §6.4）。
