# BAF 门卡交互确认框（gate dialog）全景图

> 配套本轮功能（Phase 8.15 / §22.17）：BAF 确认门从「文本卡 + 模型自说自话」升级为「真弹框等客户选」。本图把每一处"原来是什么样 → 现在是什么样"以 `【变更】` 标注贴出来，文末附剩余风险清单。
>
> 关于产物：**没有**生成 `baf-dsh.exe`。按协议只跑 `pnpm build:lib`（含 `tsc -b` typecheck），**零 TS 错误**。测试：`packages/baf/` 29 spec / 268 用例全绿（两次复跑）；`packages/baf/ + packages/client/ui-baf-workflow/tests/` 合跑 31 spec / 275 用例全绿（早先合跑出现过 1 例 flaky，复跑两次均绿）；`packages/preset/` 中 `baf-mount.spec`（覆盖本次 preset 改动）通过——该包另有 7 例**预先存在**的环境性失败（`mount.spec` 会话隔离 / `discovery.spec` Windows symlink EPERM，均在本次未触碰的文件里，单独跑也复现，与本轮无关）。oxlint（`npx tsx scripts/run-oxlint.ts .`）：改动文件**零**告警，报错均为既有基线。

---

## 0. 事故与一句话方案

**事故**（`tmp/session/1.jsonl`）：模型在确认门上调了 `baf_gate_ask`，工具返回的是**文本卡**——没有任何对话框弹出，客户无从选择；模型随后凭空宣称「已弹框」。会话侧的「卡」是随消息滚走的文本，不满足需求原则「必须弹框让客户选项」。

**一句话方案**：复用平台 `userQuestions` 瀑布（QuestionComposer 接管输入）做弹窗；弹窗点击 = 真实人因输入 → 走既有 `driveGateResolve` 单解析面（source `gate-card`）；`/baf-go` 每次都**重弹**确认框（不再静默解锁）；新增 `/baf-go-confirm` 不弹框直接走正路径。注册表、source 白名单、审计行、i18n 全部复用，**零第二套解析逻辑**。

```
停靠（门 A/B、待决 intake、未初始化、drift 候选）
  │
  ├─ userQuestions 服务在场（desktop 会话）
  │    → askGateDialog() 弹 QuestionComposer ──等客户──┐
  │                                                    │ 点选项（label）
  │    /baf-go 重弹 ◄── 暂停（关框/skip/自定义）        ▼
  │    /baf-go-confirm 直通（不弹）      driveGateResolve(gateId, optionId, 'gate-card')
  │                                                    │
  └─ 无服务（CLI / vitest / 未装）                      ▼
       → §22.14 文本卡（逐字节旧语义，门上二次 /baf-go 解锁）   派发同名 drive → 状态推进
```

---

## 1. 新模块：`gate-dialog.ts`（宿主胶水，baf-workflow 内）

| 导出 | 职责 |
| --- | --- |
| `GateDialogAgent` | `AskUserQuestionRequest['agent']` 的别名（宿主传参用） |
| `resolveUserQuestions(ctx, agent?)` / `resolveUserQuestionsForTool(ctx, agent)` | 两域解析 userQuestions 服务：接收 agent 的 realm ctx 优先、宿主行 ctx 兜底，try/catch 包裹 |
| `makeGateAsk(ctx, agent?)` | 返回 `GateAsk \| undefined`——服务不在场就 `undefined`（软降级的判定点） |
| `toolDriveAdapters(ctx, agent, cwd)` | 为工具路径拼 `DriveAdapters`（stack / guard / scaffold 三 adapter 同源解析） |
| `askGateDialog(service, agent, gate, signal?)` | 弹窗本体：注册表生成 options → `service.ask()` → 答案映射成 `GateAskOutcome` |

**答案映射**（`gate-dialog.spec.ts` 15 项锁定）：

| 客户行为 | outcome |
| --- | --- |
| 点注册表选项（label 命中） | `answered { optionId, label }` |
| 点 `__noop__`（如「暂不初始化」） | `paused / dismissed` |
| skip、custom 自由文本、注册表外的 label | `paused / skipped`（选项集封闭，**不猜最近选项**） |
| 关框（X）/ 会话中止 | `paused / cancelled`（`ASK_CANCELLED` / `ASK_ABORTED`） |
| 服务错误（`NO_PROVIDER` 等） | `unavailable`（调用方降级为卡） |

【变更】resume 门选项不再由注册表静态给出，而是 `gate.resumeCandidates`（调用方从 `pipeline.resumeOptions(changeId)` 算出）动态生成：id `resume-<node>`、label `复位到 <node>`，command `/baf-workflow-resume <node>`——与 Tab 动态按钮同一编码。

**类型分层**：coordinator（域层）对弹窗的全部认知 = `GateAsk` / `GateAskOutcome` 两个抽象类型；`gate-dialog.ts` 对 `@deepseek-ai/dsh-user-questions` 仅 type-only import（`import type {}`，bundle 擦除）。包关系 = peer/dev dependency + tsconfig reference（`packages/baf/baf-workflow/tsconfig.json` 增 `../../interaction/user-questions`），无运行时依赖。

---

## 2. go-coordinator：停靠即弹 + `/baf-go` 重弹 + `/baf-go-confirm`

【变更】`GoInput` 增两个可选参：`ask?: GateAsk`、`confirm?: boolean`。两者都不传 = 旧行为（逐字节），全部既有测试零改动通过。

五个停靠点的行为矩阵：

| 停靠点 | 有 ask（弹窗） | confirm=true（直通） | 都没有（legacy） |
| --- | --- | --- | --- |
| 未初始化工作区 | 弹 scaffold 门；选「初始化」→ `driveScaffold` | 直接 `driveScaffold` | scaffold 文本卡 |
| 待决 intake | 弹 intake-classify 门；确认 → `driveClassify('confirm change=…')` | 直接 confirm | 重放分类卡 |
| 门 A（design 停靠） | **停靠即弹**；`/baf-go` 重弹；确认 → 内层 `/baf-go` 解锁进 plan | 直接进 plan | 第二次 `/baf-go` 解锁（旧语义保留） |
| 门 B（verify 停靠） | 同上；确认 → 归档（terminal `completed`） | 直接归档 | 同上 |
| drift（有 resume 候选） | 弹 resume 门（动态选项）；选点 → 复位 | **仍弹候选**（§19 永不自动选点） | 候选卡 |

【变更】门 A/B 语义修订：此前「门上再敲一次 `/baf-go` = 确认」；现在有 ask 通道时 `/baf-go` = **重弹确认框**——「客户想再看一眼」和「客户已确认」是两个动作，不再共用一条命令。不弹框的确认走 `/baf-go-confirm`。

【变更】暂停（dismissed / cancelled / skipped）返回带【继续】段的结果卡：`/baf-go 重新弹出确认框`、`/baf-go-confirm 不弹框直接继续`；状态不动、门不解除（Tab `pendingGate` 仍在，「关卡不关门」）。

【变更】弹窗确认的派发链：`answered` → `driveGateResolve(gateId, optionId, …, 'gate-card', { changeId })` → 选项 command `/baf-go` → 内层 `driveGo` **不带 ask**（防递归弹窗）→ 既有 log-tail 解锁检查放行 → 正路径。evidence source 全程 `gate-card`（§22.15 白名单人因入口，审计行照记）。

【变更】`driveVerifyNow` 从散参重构为收 `RouteContext`（pipeline/changeId/source 等已由 route 算好），implement→verify 的连续推进改经 `route()` 重入——同一条路由表，无第二套分支。

---

## 3. `/baf-go-confirm`（新命令，四表面同构）

【变更】新 slash `/baf-go-confirm`（`commands.ts`，★★）+ CLI `baf go-confirm`（`cmdline.ts`，source `'cli'`）+ HELP_FLOW 行 + SLASH_DESC。surface-parity / cmdline 快照同步。

与 2026-09-17 拍板「不做 `baf-go confirm` 子命令」的关系：拍板反对的是 **`baf-go` 的 confirm 子命令形态**（怕与 intake confirm 一词两义）；本次是**独立命令**，两个完整命令名不冲突，路径依旧不通用（§18.5）。

---

## 4. `baf_gate_ask` 工具：从「返回卡片」到「等待客户」

【变更】`gate-ask.ts` 重写：

| 维度 | 之前 | 之后 |
| --- | --- | --- |
| 行为 | 渲染注册表卡、返回卡片全文（模型复述） | `userQuestions` 在场：**弹窗阻塞等待** → 客户点击 → `driveGateResolve` → 返回**选择后的真实结果卡** |
| 无服务时 | 同上（唯一路径） | 降级为旧行为（卡-only），legacy 保留 |
| 工具描述 | 「渲染标准选项卡」 | 「弹出确认框并**等待选择**；返回的是选择后的真实结果；客户没选就如实说明，**口头同意不是证据**」 |
| 暂停时返回 | —— | 卡 + 【结果】段（选择了「暂不」/ 关闭了确认框 / 跳过了确认框）+ 两条【继续】提示 |

配套（防自创选项第一防线）：
- 【变更】`session-gate.ts` 规则第 4 条：点名工具会「**向客户弹出确认框并等待选择**，返回的就是选择后的真实结果」。
- 【变更】preset `agent.cordis.yml` baf-gate-ask 行注释、`skills/baf-go/SKILL.md` Hard rule 6 同步（工具等待、转述结果、没选不代答、三条出路：重弹 `/baf-go` / Tab 按钮 / `/baf-go-confirm`）。

---

## 5. as-built 顺手修复

1. 【变更】**`driveGateResolve` 内层 `/baf-go` 派发丢 change 绑定**（潜伏 bug）：门卡选项 command `/baf-go` 派发时原不带焦点变更参数——单变更工作区侥幸可用，多变更/焦点未缓存时内层落进「请选择本会话的工作流」守卫卡（既有 e2e 恰逢单变更而容忍）。修法：派发 rawInput 追加 `change=<opts.changeId>`。§22.17 新测试锁定。
2. 【变更】**`session-gate.ts` 双触发守卫回归**（预先存在于工作区，非本轮引入）：`gateFired` WeakSet 误在 `apply()` 内部创建——每次 apply 一个新集合，守卫永不生效，「欢迎卡只弹一次」测试失败。修法：移到模块级（与 `inflight` 同列）。
3. 【变更】`gate-cards.ts` 门 A/B 的 question 文本改为枚举全部确认方式（弹窗 / Tab / `/baf-go-confirm` / `baf go-confirm`，并写明 `/baf-go` 会重弹）——卡与弹窗同文，客户两条通道看到同一套指引。

---

## 6. 文档同步

- 【变更】`overlay/docs/enterprise-workflow.md`：新增 **§22.17**（弹窗通道完整设计 A–G）；§22.12 阶段表增 **P4/Phase 8.15** 行；§9.2 命令表增 `baf-go-confirm` 行并改写 `baf-go` 行；§18.2（入口表 + confirm 段 + 形态表）、§18.5（门 A/B 解锁双轨语义 + 统一约定）、§18.7（边界行）、§22.5 / §22.9 / §22.14 D/E（演进注记）；§17.6 / §17.7 / R13 历史段落加「2026-09-20 修订」指针（原文保留）。
- 【变更】`overlay/docs/help/baf-mode.md`：命令表增 `/baf-go-confirm`；「两个必须停下确认的门」一节改为三种确认方式。
- 【变更】`skills/baf-go/SKILL.md` Hard rule 6（见 §4）。

---

## 7. 测试

| 文件 | 内容 |
| --- | --- |
| `tests/gate-dialog.spec.ts`（新，15 项） | label→optionId 映射、`__noop__`/skip/custom/未知 label→paused、CANCELLED/ABORTED→cancelled、NO_PROVIDER→unavailable、resume 动态选项（id/label/候选一致）、question 逐字构造、`makeGateAsk` 两域解析与优先级 |
| `tests/go.spec.ts` §22.17 组（10 项） | 门 A 弹+确认→plan；暂停→提示卡+状态不动；停靠后 `/baf-go` **重弹**（非静默解锁）；门 B 弹+确认→归档 `terminal === 'completed'`；intake 弹+确认；`go-confirm` 首调零弹窗过门 A；`go-confirm` 归档已停靠门 B；未初始化弹 scaffold 门（路由正确性用「初始化服务没有加载」哨兵证明）；scaffold 暂停卡含双【继续】提示 |
| `tests/cmdline.spec.ts` | 子命令名单 + `go-confirm` |
| `tests/surface-parity.spec.ts` | SLASH_NAMES + `baf-go-confirm`；direct set + `go-confirm` |

既有 181 项 baf 测试**零改动**通过（降级路径 bit-identical 的硬证据）。

---

## 8. 剩余风险 / 不平整点（按 客户可见度 × 修复成本 排序）

1. **弹窗挂起无超时**（中可见 / 低成本）：客户搁置弹窗时，`/baf-go` 的工具调用一直等待（signal 透传已接，会话中止会走 `ASK_ABORTED`→paused，但单条会话内无主动超时）。若实测困扰，可在 `askGateDialog` 加 `AbortSignal.timeout()` 包一层。当前判断：桌面单客户场景，挂起即「还没决定」，语义无害。
2. **弹窗 vs Tab 双通道并存**（低可见 / 中成本）：同一门既弹窗又有 Tab 常驻卡，两条通道都收敛 `driveGateResolve`（行为一致），但客户可能在弹窗未关时去点 Tab——弹窗不会自动关闭，需客户手动关（→ `ASK_CANCELLED`→paused，状态无损）。彻底方案是弹窗挂起期间 Tab 卡置灰（需 Remote 事件，跨包改动）。
3. **CLI 侧 `baf go` 仍是旧语义**（低可见 / 已按设计）：终端无弹窗通道，门上二次 `baf go` = 确认（文档已写明）；`baf go-confirm` 与之语义重叠但共存无害（都走 driveGo，confirm 标志位不同）。将来若统一，可让 CLI 的 `go` 也要求显式 `go-confirm`——会破坏 181 项测试的既有契约，值得单独立项再动。
4. **`GateDialogAgent` 一处受控断言**（不可见 / 低成本）：`commands.ts` 里 `agent as unknown as GateDialogAgent`——宿主回调的 agent 形参是结构化的 `{ ctx? }`，而品牌类型 `SessionId` 使严格转换不可行。收敛点在 dsh-commands 的处理器签名泛化，不在本包。
5. **合跑偶发 flaky**（不可见 / 观察中）：`packages/baf/ + ui-baf-workflow` 合跑曾出现 1 例未定位失败，复跑两次均绿；`packages/preset/` 的 mount/discovery 失败为预先存在的环境问题（Windows symlink 权限 + 会话隔离），单独跑也复现、与本次改动无关，但值得在 CI（Linux）上确认基线。
