# BAF 一切选择皆弹卡：active-conflict 门 + baf_question_ask 非工作流选择通道（全景图）

> 配套本轮修复（§22.18，2026-09-21）：用户指令「tmp\session\6.jsonl 根据该 session，修改 baf 模式的工作流，所有需要让用户选择的提问，都要以弹窗卡的形式，让用户点击」。session 6.jsonl 暴露两处死局：**转 1**（line 29-40）`baf_gate_ask(intake-classify)` 撞上已有活动变更只回纯文字拒绝，模型转散文「A/B」让客户打字回「A」；**转 2**（line 78）模型散文「问题1 A/B + 问题2 A/B/C…请回 1A 2C」，会话搁置至终。本图按「原来是什么样 → 现在是什么样」贴【变更】，文末附剩余问题排序。
>
> 验证 = `pnpm build:lib:host` + `pnpm build:lib:client` 零错误；baf-integration **31 文件 / 325 用例全绿**；ui-baf-workflow 2 文件 / 7 用例绿；oxlint 本轮新写行零告警（仓库既有基线告警不动，见 §4）。本轮仅 build:lib，**未打包 exe/NSIS**（Tier-2 协议）。

---

## 0. 死局 → 修后总览

| session 6.jsonl 场景 | 修前 | 修后 |
| --- | --- | --- |
| 转 1：已有活动变更时客户新提需求 | `baf_gate_ask` 回纯文字拒绝 → 模型散文「A. 继续推进 / B. 新开」→ 客户打字回「A」 | 工具**直接弹 active-conflict 门**：继续推进（`/baf-go change=<id>`）/ 放弃（`/baf-workflow-abandon confirm change=<id>`）/ 暂不处理；点放弃后返回文本指示模型用客户原话重调 intake-classify，**新需求零打字续上** |
| 转 2：与工作流走向无关的内容选择（design.md 写法 / proposal 补不补） | 无官方通道 → 模型散文「请回 1A 2C」→ 无人应答，会话死 | 新工具 **`baf_question_ask`**：一次弹多问卡（1-4 问 × 2-4 选项）阻塞等点选，逐问回「客户选择：<label>」 |
| 防线 | 仅 gate_pending 场景硬拦 ask_user_question（§22.17 J4） | baf-guard 新 **`ask_options_blocked`**：带选项的 ask_user_question**任何状态**都拦；纯文本澄清不受影响 |

规则升格：凡要客户在选项里做选择——无论是否影响工作流走向——必须弹卡点选；打字回答选择的时代结束。

## 1. active-conflict 门（转 1 死局）

【变更】[gate-cards.ts](../../../../packages/baf/baf-workflow/src/gate-cards.ts)：GateId union + GATE_REGISTRY 新成员 `'active-conflict'`（第 12 个注册门），三选项 `advance → /baf-go`、`abandon → /baf-workflow-abandon confirm`、`pause → __noop__`；渲染测试钉死 `change=CHG-006` 真派发串。

【变更】[gate-dialog.ts](../../../../packages/baf/baf-workflow/src/gate-dialog.ts)：GateDialogInput 新可选 `note: readonly string[]`——弹窗 detail 在 question 与 judgment 之间追加纯中文上下文段（本门用于「现有变更进行到哪 / 客户新需求原话」两行）。

【变更】[gate-ask.ts](../../../../packages/baf/baf-workflow/src/gate-ask.ts)（核心）：actives 拒绝分支从纯文字改为——`pickActiveChange`（projection 的最高 seq 排序，与全表面一致）选焦（ambiguous 取首候选）→ `askGateDialog` 弹 active-conflict（note 带焦点变更 current 阶段 + requirement 原话）→ `outcome.kind === 'answered'` 时经 `driveGateResolve(cwd, 'active-conflict', optionId, …, 'gate-card', { changeId })` 真派发；**点 abandon 的返回文本追加指令**：立刻用客户原话（requirement=…）重调 `baf_gate_ask(intake-classify)`。paused → 冲突卡 + 「再次调用 baf_gate_ask 重弹这张卡」；unavailable → 冲突卡 + 不可用说明。工具描述新增「与 baf_question_ask 的分工」段（工作流决策走本工具，其余一切选择走 baf_question_ask；**绝不散文 A/B 或「回 1A 2C」**）+ active-conflict 行为段 + gateId 参数枚举全部 12 门。

【变更】[command-drives.ts](../../../../packages/baf/baf-workflow/src/command-drives.ts)：`driveGateResolve` 的 `/baf-workflow-abandon` 分支派发串带 `change=<opts.changeId>`——多活动时放弃的就是卡上点名的那条，不误杀。

## 2. baf_question_ask（转 2 死局）

【新增】[question-ask.ts](../../../../packages/baf/baf-workflow/src/question-ask.ts)：新工具（`inject: ['tools']`，参数 `questions`）。`parseQuestions` 校验 1-4 问、每问 2-4 选项、label 非空且同问内不重复——不合法回「参数不合法，未弹出」拒绝卡（不弹半形卡）。有 answerer：`service.ask` 一次弹全部问题，返回卡逐问报告 `客户选择：<label>` / `客户补充：「<custom>」` / `客户未选择（该问题被跳过）——不要替客户补一个答案`；ASK_CANCELLED/ASK_ABORTED → 「客户暂未选择…不要替客户决定；可再次调用本工具重弹这张卡」；其它错误 → 弹卡失败卡。无 answerer → 降级逐字转述卡，**明令不得改为消息里罗列 A/B/C**（唯一许可的非弹窗形态，仍不许散文选项）。

【变更】[package.json](../../../../packages/baf/baf-workflow/package.json) + [tsdown.config.ts](../../../../packages/baf/baf-workflow/tsdown.config.ts)：新导出 `./question-ask`（types + default + files + dts 块）。

【变更】[agent.cordis.yml](../../../../packages/preset/agent-presets/presets/baf/agent.cordis.yml)：宿主面（isolate 外）新行 `baf-question-ask → @deepseek-ai/dsh-baf-workflow/question-ask`（紧随 baf-gate-ask）。

## 3. 硬拦 + 规则面

【变更】[tool-guard.ts](../../../../packages/baf/baf-guard/src/tool-guard.ts)：新 `hasOptionBearingQuestion(args)`——ask_user_question 参数里任一 question 的 options 数组非空即真。`gate_pending_ask_blocked` 之后命中 → 拒 `ask_options_blocked`（提示改 baf_question_ask；工作流决策 baf_gate_ask；不带选项的纯文本澄清仍合法）。未决门时 gate_pending 优先（先命中先拒）。

【变更】[session-gate.ts](../../../../packages/baf/baf-workflow/src/session-gate.ts)：通用提问规则收紧为「与工作流走向无关、**且不带选项**的纯文本澄清」；新增独立条——多选项选择无论是否影响走向必须弹卡（工作流决策 baf_gate_ask / 其余 baf_question_ask），**不得罗列 A/B/C 让客户回编号字母（如「回 1A 2C」）**；客户没点选就如实说明，聊天里的字母/口头同意不算点选。

【变更】[SKILL.md](../../../../packages/preset/agent-presets/presets/baf/skills/baf-go/SKILL.md)：新规则 7（每个选择都弹卡：baf_gate_ask / baf_question_ask；绝不散文 A/B 或「1A 2C」）；规则 8 改写为 active-conflict 弹窗行为（撞活动变更时工具自己弹门，模型不得散文转述）；原 8/9 顺延 9/10。

## 4. 测试（as-built，全绿）

- [gate-cards.spec.ts](../../../../packages/baf/baf-workflow/tests/gate-cards.spec.ts)：EXPECTED_GATE_IDS + active-conflict；渲染测试（两真派发命令带 change / 暂不处理）。
- [gate-dialog.spec.ts](../../../../packages/baf/baf-workflow/tests/gate-dialog.spec.ts)：note 段渲染；新组「active-conflict: the collision pops as a dialog」3 项（`mintOpenedChange` 铸 open 态：弹卡形态与 note；点「继续推进」→ clarify 卡 + 仍 1 活动；点「放弃」→ 已放弃 + 重调指令 + requirement 原话 + 0 活动）。
- [question-ask.spec.ts](../../../../packages/baf/baf-workflow/tests/question-ask.spec.ts) 新 8 项：session-6 双问一弹 / 点选标签逐字 / custom 补充 / 跳过问不代答 / 取消暂停措辞 / 无 answerer 降级 / 单选项拒绝 / 越界与重复 label 拒绝。（schema 层 ToolArgsError 会先拒「整缺 options」——测试改用单选项数组走 parser。）
- [tool-guard.spec.ts](../../../../packages/baf/baf-guard/tests/tool-guard.spec.ts) +3：带选项 ask 全工作流状态拦（ask_options_blocked + 指向 baf_question_ask）/ 未决门优先级 / 纯文本与空选项放行。
- 全量：baf-integration **31 文件 / 325 项**；ui-baf-workflow 2 文件 / 7 项；`build:lib:host` + `build:lib:client` 零错误。
- lint：本轮新写行零告警。仓库既有基线（command-drives.ts / session-gate.ts / tool-guard.spec.ts 的 `!== false` 等共 ~15 条）在 HEAD 即存在（stash 对照核实），未动。

## 5. 剩余问题（按优先级）

1. **`/baf-go` 绑定守卫卡多活动边界**：会话已有工作流、`/baf-go` 又试图绑另一条时，「本会话已有工作流」卡仍是纯文字（单活动场景已被 active-conflict 门覆盖；多活动罕见）。修法同款：注册表化或复用 active-conflict。
2. **ask_options_blocked 是结构化扫描**：只识别 `options` 数组非空；模型若把选项写进 question 文本（「选 A 还是 B？」）拦不住——靠 SKILL/session-gate 规则与事后审计兜底。可加文本启发式（正则找「A/…B/」模式）但有误伤风险，暂缓。
3. **真机回归未做**：本轮仅 build:lib（Tier-2 协议不出 NSIS）；两处死局的真机复验（重放 session 6 两个场景）随下一次打包轮。
4. 仓库既有 oxlint 基线告警（command-drives / session-gate 等，HEAD 即有）——与本次无关，留待专项清理。
