# demo31 会话亲和三问题 — 门卡/工单回流客户会话 + verify 拒绝反馈 + 模型轮悬挂收尾 + 假阳性 re-ask 根修

- 日期：2026-10-03（实现 2026-10-02/03）
- 范围：Tier 2（`pnpm build:lib`，未跑 NSIS）
- 前置：`2026-09-30-baf-demo31-five-issues.md` 剩余问题 1/2/3 —— 三条同一因果链（决策面漂移 → 拒绝无反馈 → 等待面悬挂），本批一并落地
- 验证：baf-workflow 411/411 绿（首轮出现过 1 例未留名的瞬时失败，随后两次全量重跑均 0 失败）+ ui-baf-workflow 17/17 绿 + `pnpm build:lib` 零错 + 真机 web walk（demo-afd 工作区，`apps/web/.verify-affinity.mjs` v3）
- 状态：已实现 + 真机验证（walk 会话取证见文末）

## 问题 1 — 门卡/工单落在任务会话而非客户会话（会话亲和）

根因：回合结束的弹卡/派单跟随「最近一个在该 cwd 上结束回合的会话」——工单跑在第二个会话后，客户最初发言的会话彻底沉默，决策随工作漂移（demo31 walk 两次把「看错会话」误读成页面冻结）。

【变更】新模块 `src/session-home.ts`：每工作区一个粘性 home 会话锚（`sharedHostMap`，跨 bundle 副本单实例；与 `session-focus` 同层——会话态，不进投影）。**只有真实客户动作才写锚**，最后一次动作生效：

- `auto-pop.ts` —— pre-question 的「作为新需求开始」点击：这次对话被选为新工作流的 home；
- `commands.ts` —— `/baf-go`、`/baf-go-confirm` 敲入即锚（`anchorHomeSession`，结构读 runtime agent 的 session id）；
- `orchestrator.ts` `popGate`/`popBind` —— 弹卡被点击（含 bind 多活抉择）即锚；
- `ui-baf-workflow/index.ts` —— Tab 两次门操作（resolve/revise）即锚。

读取侧 `orchestrator.ts` `resolveAskSessionId`：回合结束的弹卡/派单/停靠续跑优先指向 home（其 agent 存活时），**home 已死则回退触发会话**——关掉的对话永远不会困住弹卡。回合中的 `baf_gate_ask` 弹卡不重定向（工具自己的回合在等那个答案）。终局收尾：`driveArchive`/`driveAbandon` 成功即 `homeSessionFor(cwd).clear()`——锚属于那条工作流，随工作流终结。

新测试：`tests/session-home.spec.ts`（4 例：记录读取 / 工作区隔离 / 末次动作重锚 / clear）+ `tests/session-affinity.spec.ts`（5 例：**任务会话回合结束 → 弹卡落 home 会话**、无锚回退+点击锚定、死 home 回退不僵尸重定向、以及问题 3 的两例跨会话 abort）。

## 问题 2 — verify 硬校验拒绝吞掉 ask 无反馈

现场：checklist 未全勾点「确认归档」→ 驱动被硬校验拒绝 → 拒绝卡只存在于日志行，ask 条目已消费 → 界面沉默，唯一复活路径是客户自己知道再敲 `/baf-go`。

【变更】`gate-dialog.ts` 新 `reAskGateAfterRefusal`：取拒绝卡首个非空非分隔线行（剥 ✓/✗ 语气标记）作为标题，note 追加「上次选择未生效：…」+「卡片已重新弹出，可直接重选；按提示补齐要求后即可通过。」，重弹同一门。走同一单飞队列：兄弟 surface 正持有同门则折叠为 paused，调用方 isMoot 仍在队首把关。接入两处：

- `orchestrator.ts` `popGate`：error 结果 → re-ask（**故意绕过防打扰账本——这就是复活**）；re-ask 被回答则同卡重派（含 revise 文本 → 修订工单）；
- `auto-pop.ts`：classify 确认 error → re-ask（原为只记日志）。

### 2b. 假阳性 re-ask 根修（2026-10-03 真机 walk 发现）

v2 真机 walk 暴露：classify 确认点击落在模型回合进行中时，`command-drives.ts` 的客户来源 follow-up 派单回报 busy（error-kind、无「已派单」标记），与 ✨ 成功卡拼接成 **kind:'error' 但首行是成功卡**的组合结果 → re-ask 把「已确认并进入 open」当拒绝标题引用，弹出僵尸分类卡盖住会话视图（BafGateComposer 无 dismiss 路径，含「新会话」按钮在内的整个会话面被挡）——而选择明明已生效。

【变更】`auto-pop.ts` re-ask 调用点加 **choice-landed moot 守卫**：`isMoot` 重读投影，intake 已 confirmed / 变更已过 intake / 变更已消失 → 队首直接退休，不弹。与 orchestrator 既有 isMoot（`deriveDueGate` 比对）同一模式——auto-pop 这条是唯一缺守卫的 re-ask 路径。单测 RED→GREEN：`auto-pop.spec.ts`「a busy-model follow-up must not re-ask the landed confirm」（fake agent 带 `followup` + `status:'running'` 复现 busy 形态；修复前第 3 次 ask 弹出，修复后恰 2 次）。

## 问题 3 — 会话模型轮悬挂（composer 永久隐藏）

现场：会话 A 中模型的回合内 `baf_gate_ask` 阻塞在一个客户从未见过的对话框上，同一门随后在别的 surface（B 会话弹卡点击 / 敲 `/baf-go`）被解决——驱动成功，但 A 的 ask 条目还在等 → 无 `turn/end` → A 的 composer 永久隐藏，编排器也忽略该会话。

【变更】`ask-queue.ts` 新 `cancelAsksForChangeGates(changeId)`：撤销该变更**所有**在飞/排队的 `gate:` 键 ask（`autopop:` pre-question 与 scaffold 门不带 changeId，天然幸存）。abort 后工具结算为 `paused('cancelled')`，回合得以收尾。三处触发：

- `command-drives.ts` `driveClassify`：intake confirm 落定即无条件撤销（下游 draft 打开/基线拒绝都不能反确认 intake）；
- `command-drives.ts` `driveGateResolve`：success 且带 changeId 即撤销（error/拒绝保留兄弟——门仍真到期，问题 2 的 re-ask 会带理由重弹；误伤的早退休自愈——指纹已动，下个完成回合重弹）；
- `go-coordinator.ts` `driveGo`：typed `/baf-go` 成功即撤销（§18.5 二次敲入过停靠门/推进/续跑）。

新测试：`tests/session-affinity.spec.ts` 2 例（classify 确认点击 abort 另一会话挂着的 intake-classify ask；typed /baf-go 过停靠门 A abort 兄弟 design-confirm ask）+ `ask-queue.spec.ts` 补例。

## 真机验证（demo-afd 工作区，`apps/web/.verify-affinity.mjs` v3）

新鲜全流程变更 `change-20261002-feat-add-export-public-api-for-r-fcf9`（full-go-path，现停 clarify）：

- 散文陈述 → pre-question「作为新需求开始」→ 分类确认「确认 · 完整流程」→ **投影非空判定 current=open**（PASS）；
- **问题 2 假阳性哨兵 PASS**：确认点击落在模型回合进行中（busy-follow 形态全程在场），8×2s 窗口无「上次选择未生效」僵尸卡；
- walk 补写 proposal.md（过 proposalGate 的正文）→ 客户会话回合结束 → **open-advance 卡「提案已完成 · 请确认推进」弹在 home 会话**（PASS）→ 点击「确认提案 · 进入澄清」→ **current=clarify**（PASS）；
- 会话取证（session-3be8f518，zcat v4）：turn 2 客户令「不要调用任何工具…只回复：收到」→ 模型恰好回复「收到」→ 【BAF 工单 · /baf-go 派单】（clarify）经 `agent/inbox/spliced target:next-turn` **落同一 home 会话** → turn 3 模型按工单补齐 clarify.md 并输出【阶段】clarify 汇报——§18/§22 全环闭合；
- 非目标会话 cd7d6189（旧 v2 会话，回合一直在跑）：对 `-fcf9` 零引用、零工单、零弹卡——无漂移。

walk 自身 4 个 FAIL 均为脚本簿记产物，非产品缺陷：二次「新会话」点击两度超时（B 阶段从未建新会话，trivial 消息实际经 inbox splice 进了 home 会话的 turn 2；`newestDir` 排除法把不相关的 cd7d6189 误认成 B）→ B-clean 检查检的其实是 home 视图（卡本就该在）。跨会话判别（非 home 会话回合结束不弹本会话）由 `session-affinity.spec.ts` 集成测试覆盖，真机未复现该形态。

## 剩余问题（按影响排序）

1. **编排器侧 busy-follow 理论边缘**：popGate 的 re-ask 走 `deriveDueGate` isMoot，busy 组合卡若首行恰为成功卡而门已过，isMoot 同样 retiring（已分析自愈）；真正残余是「成功卡文本被当拒绝标题」的显示层歧义——低频（需门在点击瞬间恰好不再到期），未改。
2. **BafGateComposer 无 dismiss 设计**：僵尸卡事件已由 2b 根修消除，但任何未来误弹的会话卡仍会盖住会话面直到作答——设计如此（弹窗原则），风险敞口记录在案。
3. **walk harness 债**：`.verify-affinity.mjs` 的「新会话」role-button 定位两度超时（需 text-evaluate 兜底）；`switchSession` 叶子过滤未排除 `<script>`/`<style>`（`/export/` 匹配到 JS 源码把 script 当侧栏叶子点击，视图实际未切换）。
4. **首轮全量 1 例未留名瞬时失败**：verbose 抓到「1 failed」但失败名被测试名中的 "failed" 字样淹没，随后两次全量（verbose + JSON）均 411/411——按负载抖动记录，未复现。
5. demo-afd 工作区残留：`-fcf9` 变更停 clarify（walk 遗留，可继续推或 abandon）；cd7d6189 旧回合仍在 ACL 马拉松（sandbox `SetNamedSecurityInfoW` 环境问题，与产品无关）。

## 交付

- 代码：`session-home.ts`（新）+ `ask-queue.ts` / `auto-pop.ts` / `command-drives.ts` / `commands.ts` / `gate-dialog.ts` / `go-coordinator.ts` / `orchestrator.ts` / `index.ts` / `ui-baf-workflow/index.ts`（改）；测试 `session-home.spec.ts` / `session-affinity.spec.ts`（新）+ `ask-queue.spec.ts` / `auto-pop.spec.ts` / `gate-dialog.spec.ts`（改）。
- 文档：`overlay/docs/enterprise-workflow.md` §22.24。
- 真机：host 3180（demo-afd），证据 `tmp/webwalk-verify-affinity/`（affinity-log.json + 7 张截图）+ 会话 jsonl 取证。
