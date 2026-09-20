# BAF 分类弹窗补全 + 题卡说明行渲染修复（全景图）

> 配套本轮修复（§22.17 I，2026-09-20 晚）：用户带着两张实测截图提出两点——① 题卡「第二行」显示异常，问是工作流还是桌面应用的锅；② 弹窗是谁控制的，并立法「所有推动 baf 工作流的操作都必须弹出问题卡片让客户点选推动」，截图里 full-go-path / bug-fix-path 的选择没有弹。本图按「原来是什么样 → 现在是什么样」贴【变更】，文末附剩余问题排序。
>
> 验证 = `pnpm build:lib` 零错误；`packages/baf/ + packages/client/ui-baf-workflow/tests/ + packages/client/ui-user-questions/tests/` 36 文件 / 339 用例全绿（新增 7 项）；根 oxlint 对本轮触碰行零告警（输出里仅剩既有基线文件的告警）。**未生成 exe**（按惯例等用户确认）。

---

## 0. 两问的结论

**问题一（题卡第二行显示异常）：桌面应用的锅。** 工作流发的文本正确（`spec.question` 一句话），坏在客户端 QuestionComposer 的样式：`.detail { margin: 0 2px 8px }` 左缘只缩 2px（标题内缩 24px、选项列 12px），说明行紧贴卡片边、比标题凸出 22px；且 detail 用 `MarkdownText` 渲染，继承聊天气泡的 `p { margin: 16px 0 }`，说明行上下被撑开——看起来「又大又飘又不出内缩」。字体随「设置-字号」缩放是平台设计（与聊天正文同源 `--dsw-font-markdown-base`），不是 bug。

**问题二（弹窗控制权 + 没弹出来）：通道和内容 100% 是我们的，触发是混合的；没弹是两个结构性缺口 + 模型选了写文字。** 详见 §2。dsh **可以**自定义强制弹出，无需平台改动：`ctx.userQuestions.ask()` 是宿主面服务（§22.17 门弹窗用的就是它），宿主行还能 `ctx.on('session/event', …)` 做状态驱动触发。

---

## 1. 题卡说明行（detail）渲染修复

【变更】[QuestionComposer.module.css](../../../../packages/client/ui-user-questions/src/client/QuestionComposer.module.css)：

| 项 | 修前 | 修后 |
| --- | --- | --- |
| 左内缩 | 2px（贴边） | 24px（对齐标题；窄屏媒体查询 18px 同步） |
| 右内缩 | 2px | 16px（对齐 header 右内缩） |
| 段落距 | `.markdown p` 的 16px 0（气泡级） | `.card .detail p { margin: 0 }`（`.card` 前缀提升特异性，压过 MarkdownText 自带样式表且不依赖打包顺序；`p + p` 8px） |

修复对象是**所有** userQuestions 题卡（`ask_user_question` 工具、门弹窗、plan review 同一组件），不只 BAF。

## 2. 弹窗控制权三分 + 设计原则（§22.17 I 立法）

**原则**：所有推动 BAF 工作流的决策，必须以注册表弹卡（或 Tab 按钮 / 斜杠指令）呈现给客户，由客户点选推动；模型只能触发弹窗、转述结果，不能文字复述步骤、让客户拼命令、或用通用提问工具代答。

| 层 | 控制方 | 事实 |
| --- | --- | --- |
| 通道（能不能弹） | 平台 + 我们（宿主面） | `ctx.userQuestions.ask()` 任何 preset 行随时可调；`session/event` 钩子可做状态驱动 |
| 内容（弹什么） | 我们（GATE_REGISTRY） | 封闭选项集，模型注入不了第三项 |
| 触发（何时弹） | 混合 | 确定性：停靠即弹 / Tab / 派发。软：`baf_gate_ask`——模型可以选择不调（事故三形态） |

**事故三（截图 18:05）复盘**：scaffold 弹窗已正常（H 节修复生效，图 1 可证）；随后模型回长文教客户手动点按钮。根因一半是**结构性的**：变更只能由斜杠 / Tab 建立，模型没有工具能走到分类弹窗——「写文字」是它唯一能做的事。

## 3. 两处补全（工作流侧）

【变更】**分类弹窗从盲选变明选**：[gate-dialog.ts](../../../../packages/baf/baf-workflow/src/gate-dialog.ts) `GateDialogInput` 增 `judgment?: GateJudgment`（`Pick<ChangeIntake, 'mode'|'kind'|'summary'|'confidence'>`，`judgmentOf(intake)` 投影）；`askGateDialog` 的 detail 变三段：注册表问句（+变更号）→「系统初步判断：完整流程 · 新需求 · 置信 0.86」→「需求摘要：<客户原话>」。段间用 `\n\n`（markdown 单换行会折成一行）。`GateAsk` 函数类型同步加 `judgment` 可选参。

【变更】**协调器带上判断**：[go-coordinator.ts](../../../../packages/baf/baf-workflow/src/go-coordinator.ts) intake 停靠弹窗传入 `judgmentOf(status.intake)`。

【变更】**`baf_gate_ask` 增 `requirement` 参数（intake 引导）**：[gate-ask.ts](../../../../packages/baf/baf-workflow/src/gate-ask.ts) `gateId=intake-classify` 且无 changeId 时：
- `requirement` 缺失 → 讲明用法不弹；
- 工作区未初始化 → **改弹 scaffold 门**（真正的下一个决策；客户初始化后模型带同一 requirement 重试）；
- 已有待决 intake → 拒新开，点名复用其 changeId；已有其他活动变更 → §18.6 拒绝（一个会话一条工作流）；
- 否则 `driveOpen(cwd, requirement, 'model-tool')` 铸变更（source 非人因——open 不算确认）→ 读 status 附 judgment → 弹窗 → 点击经 `driveGateResolve('gate-card')` 落证。
- 工具描述、session-gate 规则第 6 条、baf-go SKILL Hard rule 7（原 7 顺位 8）三面同步「客户陈述新需求 → 一调弹卡，不得罗列手动步骤」。

## 4. 测试

| 文件 | 增项 |
| --- | --- |
| [gate-dialog.spec.ts](../../../../packages/baf/baf-workflow/tests/gate-dialog.spec.ts) | judgment 渲染进 detail / 无 judgment 保持原样 / requirement 引导四连：弹明示分类弹窗+点选后 open / 未初始化重定向弹 scaffold / 已有待决 intake 拒新开 / 缺参讲用法不弹 |
| [go.spec.ts](../../../../packages/baf/baf-workflow/tests/go.spec.ts) | 协调器 intake 弹窗携带 judgment（mode full-go-path），暂停分支状态不动 |

工具测试通过捕获 `apply` 注册的 `defineTool` 配置直接调 `execute`（假 row ctx + agent realm 携带 userQuestions double），真 FS 工作区（go.spec 同款 baseline+git 配方）。

## 5. 剩余问题（按 客户可见度 × 修复成本 排序）

1. **真机回归待做**（高可见 / 零代码）：judgment 明示与 requirement 引导未进 exe；实测路径 = 便携版里直接说一句需求，应看到模型一调 `baf_gate_ask`、弹「需求分类待确认」且 detail 带系统初步判断。
2. **分类弹窗的「改道」选项**（高可见 / 中成本）：客户点「确认分类」只能照单全收分类器的路径判断，想改走另一条路只能「重新描述需求」重来。做成「确认 · 完整流程」「确认 · 缺陷修复路径」两个独立选项需 baf-core 新事件 `intake-mode-set`（客户改判，审计友好）+ driveClassify `mode=` 覆盖 + 注册表选项改版——核心 schema 变更，建议单独立项。
3. **bug-fix-path 确认缺字段**（中可见 / 中成本）：分类判为缺陷修复路径时，弹窗点「确认分类」会返回缺 `problem/root-cause/file/test/test-cmd` 的卡（既有设计遗留，斜杠路径同样），客户需拼长命令。应把模型整理的缺陷字段带进弹窗一并确认。与 2 同属「分类弹窗 v2」。
4. **状态驱动自动弹**（中可见 / 中成本）：宿主面 `session/event` 监听「客户裸陈述需求」自动铸变更+弹分类卡，把「直接描述需求，分类卡自动弹出」从依赖模型变成平台保证。
5. **硬防线**（低可见 / 中成本）：baf-guard 对工作流上下文里的 `ask_user_question` 降权 / 拦截（H 节遗留项 3）。
