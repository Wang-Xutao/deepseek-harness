# BAF 分类弹窗 v2（改道可点 + 缺陷草案）+ 状态驱动自动弹 + 通用提问硬拦（全景图）

> 配套本轮修复（§22.17 J，2026-09-20 深夜）：用户指令「全部修改，改好后打包 baf-dsh.exe，不打安装包」——即前一张全景图剩余问题清单的 ②③④⑤ 全部落地（①真机回归随打包完成），并顺带修掉一个排查中暴露的**真机级写入竞态**（writeAtomic rename EPERM）。本图按「原来是什么样 → 现在是什么样」贴【变更】，文末附剩余问题排序。
>
> 验证 = `pnpm build:lib` 零错误；`packages/baf/ + packages/client/ui-baf-workflow/ + packages/client/ui-user-questions/` 37 文件 / 351 用例连跑全绿（含 6 连跑压测）；根 oxlint 对本轮触碰行零告警（输出里仅剩既有基线告警）。便携版 exe 已按流水线打包（--dir，无安装包）。

---

## 0. 四项收口总览（触发三角）

| 工作区状态 | 修前 | 修后 |
| --- | --- | --- |
| 空闲（已初始化、无活动变更），客户直接说需求 | 依赖模型自觉调 `baf_gate_ask`（事故三形态：模型回散文教客户敲命令） | **宿主面自动弹**：新 preset 行 `baf-auto-pop` 订阅 `session/event`，平台保证 |
| 分类确认卡 | 「确认分类」一个按钮，盲选；改道要客户拼 `/baf-workflow-classify confirm mode=…` 长命令 | **两路径直接可点**（确认 · 完整流程 / 确认 · 缺陷修复路径），改判落 `intake-mode-set` 事件 |
| 缺陷场景确认 | 点确认返回「fast-path 缺少 Bug 字段」卡，客户拼五字段长命令 | 模型把五字段草案带进弹窗，**一次点击定路径 + 交字段** |
| 有未决门时模型用 `ask_user_question` 代答 | 只有软规则（H 节第 5 条），违规靠事后审计 | **baf-guard 硬拦**（`gate_pending_ask_blocked`），模型只剩 baf_gate_ask / 斜杠 / Tab 三条合规路 |

三路全部收敛到 `driveGateResolve` 单解析面（§22.1 不变式 2 不破）。

## 1. J1 分类弹窗改道可点

【变更】[events.ts](../../../../packages/baf/baf-core/src/events.ts)：ProjectionEvent union 新增 `intake-mode-set { from, to, by:'user' }`。

【变更】[projection.ts](../../../../packages/baf/baf-workflow/src/projection.ts) fold：`to=bug-fix-path` 镜像 intake-classified 的 bug 分支（openspecSkipped={skipped:true, reasonCodes:['customer-override']}，clarify/design/plan 打 skip 注记 reasonCodes ['fast-path-cut','customer-override']）；`to=full-go-path` 镜像 mode-upgraded（补开被裁剪阶段并清注记）。

【变更】[workflow-service.ts](../../../../packages/baf/baf-workflow/src/workflow-service.ts) 新 `setIntakeMode(store, changeId, to)`：**同模式幂等返回先于已确认检查**（弹窗选项恒带 `mode=`，缺字段停靠后重试 bug 路径确认不应被「已确认不可改道」拒掉）；已确认后异模式 → `invalid_transition`；`from` 由当前态收敛（审计字段）。

【变更】[gate-cards.ts](../../../../packages/baf/baf-workflow/src/gate-cards.ts) intake-classify 选项改三枚：`confirm-full → /baf-workflow-classify confirm mode=full-go-path`、`confirm-bugfix → … mode=bug-fix-path`、`reject`。

【变更】[command-drives.ts](../../../../packages/baf/baf-workflow/src/command-drives.ts) `driveClassify` confirm 分支先消费 `mode=`：值不合法 → 参数卡；setIntakeMode 拒绝 → 「改道失败」卡；随后照旧 confirmIntake → driveOpenStage / driveBugFixPathOpenStage。

## 2. J2 bug-fix 字段进弹窗

【变更】[gate-dialog.ts](../../../../packages/baf/baf-workflow/src/gate-dialog.ts)：新 `GateBugPlan`（problem/rootCause/files/test/testCmd 全可选）、`hasBugField()`、`bugPlanParagraph()`（「缺陷修复草案（模型整理，点「确认 · 缺陷修复路径」时一并提交）—— 现象：…；根因：…；…」单段落——composer 折叠单换行）、`bugPlanExtraArgs()`（`key="value"` 化，值内引号/换行先剥除——§12 tokenizer 无转义）；`GateDialogInput.bugPlan?` 进 detail。

【变更】[gate-ask.ts](../../../../packages/baf/baf-workflow/src/gate-ask.ts)：工具参数加五字段；execute 组装 bugPlan，intake-classify 时带进弹窗；answered 后经 `driveGateResolve` 新 `opts.extraArgs` 拼进 confirm 派发——**一次点击定路径 + 交字段**；无草案点缺陷路径照旧缺字段卡（改道事件已落，补齐再点）。工具描述同步。

## 3. J3 状态驱动自动弹（平台保证）

【变更】[auto-pop.ts](../../../../packages/baf/baf-workflow/src/auto-pop.ts)（新模块，包导出 `@deepseek-ai/dsh-baf-workflow/auto-pop`）：preset 行 `baf-auto-pop`，`inject ['agents','userQuestions']`，订阅 `ctx.on('session/event')`。触发条件全部为代码判定：`user/message` 且 `source.kind==='user'`（真打字，插件/工具注入不算）、非 `/` 斜杠、≥4 字符、工作区已初始化且无活动变更、每会话至多一次。先弹预问卡「要把这句话作为新需求开始 BAF 工作流吗？」（作为新需求开始 / 只是聊天，不开始）——**只有点击才铸变更**，闲聊零审计垃圾。点开始 → `driveOpen(source 'gate-card')` → 带判断 + 两路径按钮的分类弹窗 → 点击经 driveGateResolve 落证；行日志 `baf:auto-pop change=… / classify outcome=… / resolved result=…`（result=error 时附卡片摘要 160 字——本次排查的定位利器）。与模型并发调 `baf_gate_ask` 天然互斥（待决 intake / 活动变更守卫拒新开并点名 changeId）。

【变更】[agent.cordis.yml](../../../../packages/preset/agent-presets/presets/baf/agent.cordis.yml) 加行；[tsdown.config.ts](../../../../packages/baf/baf-workflow/tsdown.config.ts) + [package.json](../../../../packages/baf/baf-workflow/package.json) 加 auto-pop 入口与导出。

## 4. J4 通用提问工具硬拦

【变更】[policy.ts](../../../../packages/baf/baf-guard/src/policy.ts)：GuardReasonCode 加 `gate_pending_ask_blocked`；`GuardWorkflowState.gatePending?`。

【变更】[projection-state.ts](../../../../packages/baf/baf-guard/src/projection-state.ts)：同步重放产出 `gatePending`（intake 未确认，或事件尾 `awaiting-confirm` 即停靠门 A/B——同协调器 log-tail 口径）；损坏尾 fail-closed 为 true。

【变更】[tool-guard.ts](../../../../packages/baf/baf-guard/src/tool-guard.ts)：首分支——工具名 `ask_user_question` 且 `active && gatePending === true` → 拒绝并指路 `baf_gate_ask`。无未决门时保持合法（无关澄清是通用提问的本职；空闲工作区归 J3）。

## 5. 排查副产品：writeAtomic rename EPERM 竞态（真机级修复）

auto-pop 快乐路径测试偶发（约 1/7）「确认链 60s 不落证」。给行链路加审计日志后抓到现行：铸变更 → 弹窗已答 → **driveGateResolve 180ms 内返回 error 卡**——不是挂起，是 `改道失败` 卡吞了 `setIntakeMode` 追加事件时的瞬时异常。根因：[projection.ts](../../../../packages/baf/baf-workflow/src/projection.ts) `writeAtomic` 的裸 `rename(tmp, path)` 在 Windows 上撞并发读句柄（Tab 刷新 / 测试轮询正打开 index.json 或变更 jsonl）→ EPERM 瞬时失败 → 客户的确认点击死在错误卡上。**这在真机上同样成立**（Tab 刷新轮询同款形态）。

【变更】`writeAtomic` rename 对 EPERM/EBUSY/EACCES 短退避重试（25ms 起步 ×5 次，读方毫秒级释放）；文档 §22.17 J 记录。

## 6. 稳定性收口（测试侧）

| 文件 | 变更 |
| --- | --- |
| [vitest.config.ts](../../../../vitest.config.ts) | BAF 集成套（`packages/baf/*/tests/**`）独立成 `baf-integration` 项目，`testTimeout: 60_000`——满载并行下多阶段流水线测试屡撞默认 5s（stages / bug-fix-path / lanes / resume / gate-dialog / tool-guard 各中过一次，都在 ~5.0s 顶点），收口为一处项目级预算；其它包单测默认 5s 不变 |
| [auto-pop.spec.ts](../../../../packages/baf/baf-workflow/tests/auto-pop.spec.ts) | 固定 settle 改轮询（waitForConfirmed 默认 60s 预算）；row 日志收集进测试、失败时附在断言信息里；测试预算 120s；Windows rm ENOTEMPTY 加 maxRetries + catch 兜底 |
| [stages.spec.ts](../../../../packages/baf/baf-workflow/tests/stages.spec.ts) | 七阶段全链 happy path 默认 5s 在满载并行下偶发超时（实测 5055ms 触顶）→ 显式 60s |
| [gate-dialog.spec.ts](../../../../packages/baf/baf-workflow/tests/gate-dialog.spec.ts) | harness 提升到模块顶（oxlint no-identical-functions）；§22.17 J 组 3 项（草案渲染 / full 判定点缺陷路径全链 / 无草案缺字段卡但改道已记录） |
| [gate-cards.spec.ts](../../../../packages/baf/baf-workflow/tests/gate-cards.spec.ts) [go.spec.ts](../../../../packages/baf/baf-workflow/tests/go.spec.ts) | 两路径选项与 `mode=` 派发串；askAnswer 改 `confirm-full` |
| [tool-guard.spec.ts](../../../../packages/baf/baf-guard/tests/tool-guard.spec.ts) | §22.17 J 组 4 项（未决门拦并指路 / 无未决门放行 / 空闲放行（J3 之域）/ 磁盘态门开关） |

## 7. 文档同步

【变更】[enterprise-workflow.md](../../../../overlay/docs/enterprise-workflow.md)：§22.3 注册表表行改两路径；§22.9 工具契约加五字段与 extraArgs 语义；§22.10 防绕过清单加 `gate_pending_ask_blocked` 行；§22.17 I「后续」标记完成；新增 §22.17 J 全章（J1-J4 + 触发三角覆盖图 + as-built 测试清单）。[baf-mode.md](../../../../overlay/docs/help/baf-mode.md)：三步上手加自动弹说明；新增「分类卡：明选，不是盲选」小节；确认门段加硬拦一句。

## 8. 剩余问题（按 客户可见度 × 修复成本 排序）

1. **真机回归**（高可见 / 零代码）：①的清单——便携版直接说需求 → 预问卡 → 分类卡（判断 + 两路径 + 缺陷草案）；有未决门时让模型试 ask_user_question 应被拦。
2. **auto-pop 每会话一次的边界**（中可见 / 低成本）：客户第一条是闲聊、第二条才是需求时本轮不再自动弹（留给模型工具 / Tab / 斜杠）。可按实测反馈放宽为「空闲即弹、每会话限 N 次」。
3. **触发词法门槛是启发式**（低可见 / 低成本）：≥4 字符 + 非斜杠的门槛对极短真需求 / 长闲聊都会误判方向，预问卡兜底（选「只是聊天」零成本）已把代价压到一次点击；若实测打扰感强再引入分类器预判。
4. **writeAtomic 重试只覆盖 rename**（低可见 / 低成本）：`open(tmp,'w')` 撞 AV 扫描同名 tmp 的残余竞态未重试（同名仅发生在重复写同体，概率极低）。
5. **gatePending 的 log-tail 口径**（低可见 / 中成本）：`awaiting-confirm` 判定看事件尾 type（与协调器一致）；若未来在门 A/B 后追加非门事件需两处同步维护。
