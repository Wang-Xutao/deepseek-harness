# BAF 模式在 dsh 中的企业级落地实施方案

> **读者**：BAF 实现工程师、企业落地负责人、dsh 维护者。
> **目标**：把旧版「Claude Code + Comet + Superpowers + vibe + marketplace + hooks」的工作流指南，重构为 dsh 原生、可随桌面应用分发、可签名升级回滚的企业级 Agent 实施方案；工程师按本文档落地，不再做关键架构决策。
> **用法**：第 0 章是导航；**文首「实现进度」是仓库实况（已完成 / 未完成）**；第 1–11 章是设计与 contract（what/why）；**第 12 章是从零到一的逐步实施计划（how，每一步列出文件、做法和验收）**；第 13–16 章是清单、测试、企业输入和完成定义；**第 17 章是评审结论（遗漏、风险、可落地性、MVP 裁剪）**。
> **对照基准**：仓库现状 2026-09-14（分支 `baf`；dsh `0.1.5-alpha.1`；桌面 **baf-dsh 0.0.14**）。**Phase 0–8 已落地**（见下表）；`overlay/desktop` 更新链路已有 manifest/plan/apply/service 骨架且**公开仓默认不验签**；`packages/client/ui-baf-desktop` 为品牌/IDE/帮助；`packages/client/ui-baf-workflow` 为 BAF 会话「工作流」Tab（与「轨迹图」无关）；官方 BAF **仅**以 shipped preset（`trust: system`）交付，桌面**不再**把 `agent-presets` 同步到 `~/.dsh/.agent-presets`，且官方 `baf` **不可复制、不可由用户修改**；`baf-core` 已提供 baseline loader、adapter stub、`NODE_CATALOG`/`WORKFLOW_GRAPH`；`baf-workflow` 已提供 route、projection、transition、intake 与 `WorkflowTabView` Web Remote；`baf-openspec` 提供本地文件模式 OpenSpec adapter；`baf-workflow` `stages/` 提供 full-go-path 七阶段 handler 与 `StagePipeline` 编排；Phase 8 进一步把 slash 全集、`baf-cli` standalone CLI、`listChanges` Remote + Dashboard 入口都接通，并随 `baf-dsh 0.0.14` 桌面应用分发。
> **评审结论（摘要）**：架构方向可落地；按第 12 章 Phase 0→10 可逐步实现。MVP 完成线（Phase 0–8 + Phase 7 的 ToolGuard）已随 `baf-dsh 0.0.14` 出包；签名三 scope 更新（Phase 9，**baseline scope 暂缓——baseline 当前随 plugin zip 以 `overlay/plugin/standards/baf-baseline-c/baseline.yml` 静态 fixture 形式发布，无独立版本号/独立 hot-update 路径，Phase 9 先交 harness + plugin 两 scope**）与 release 门禁（Phase 10）仍属后续硬化工作。必须先纠正「dsh workflow 工具 ≠ BAF go 状态机」「独立 `baf` bin 违规」「plugin 写 user root」三处概念/现状错误，签名两 scope 更新（Phase 9）可并行但不应挡主链。
> **本文档完全取代**旧版面向 Claude Code 的建设指南：Comet、Superpowers、vibe workflow、Claude Code marketplace、`enabledPlugins`、Claude Code hooks 不再是新架构的组成部分。

---



## 实现进度（仓库实况 · 2026-09-17）

> 本表是**当前仓库事实**，不是计划。设计正文（第 1–11、12 章步骤）仍描述目标态；实现时以本表为准判断「已做完什么」。



### 总览


| Phase | 目标                                                                         | 状态      |
| ----- | -------------------------------------------------------------------------- | ------- |
| **0** | 企业输入登记、错误码、兼容矩阵、route 核查、baseline schema/fixture、projection/change id 冻结   | **已完成** |
| **1** | shipped `presets/baf`、`trust: system`、skills、locale、roster/authoring 测试与金标 | **已完成** |
| **2** | `baf-core` 骨架 + baseline loader + adapter stub                             | **已完成** |
| **3** | route resolver + 审计                                                        | **已完成** |
| **4** | intake + projection + transition + Web 工作流 Tab（半交互）                        | **已完成** |
| 5     | full-go-path 各阶段                                                                | **已完成** |
| 6     | bug-fix-path / 升级                                                         | **已完成** |
| 7     | quality / standard / guard / scaffold                                      | **已完成** |
| **8** | slash 全集 + `baf-cli` standalone CLI + desktop IPC + **变更 Dashboard（listChanges Remote）** | **已完成**（commit `3ab67a934f`；`baf-dsh 0.0.14` 已出包） |
| **8.7** | `baf-go` 自动驱动 + 两个强制确认门（design 完成 → plan 之前、verify 通过 → archive 之前） + 单会话单工作流约束 | **已完成（2026-09-17）**：命令行主路径 + Tab 门高亮 + §18.4.3 双泳道视图均落地；细节见 §18.9 / §18.11 |
| **8.8** | 会话启动门：绑定 / 新建工作流选择 + 必须工具链体检 + BAF 欢迎语（缺件引导下载） | **已完成（2026-09-17）**：`session-gate.ts` + preset 行 `baf-session-gate`、`/baf-welcome` slash + `baf welcome` CLI、`/baf-doctor` 复用同一探针，`tests/session-gate.spec.ts` 18 例通过；落地细节见 §18.10。**待出包后在桌面里看首屏观感**（与 §8.7.8 同批） |
| **8.9** | `/baf-workflow-resume`：N8 drift 的交互式复位入口（T13 合法目标集，客户选点） | **已完成（2026-09-17）**：域层 `driveResumeStage` + slash + CLI + Tab 按钮 + `BafWorkflowTabRemote.resume()` + `pipeline-factory.ts` 共用 provider 全部接通；细节见 §18.11 / §19。`tests/resume.spec.ts` 12 例通过；顺带修掉 §21.6/§21.7 两个假阳性与 park 语义 bug |
| **8.10** | BAF 工作流输出规范（状态行 / 卡片 / 日志统一格式 + i18n key 清单） | **设计阶段**（§20 + Phase 12 §8.10；代码未动） |
| 9     | harness + plugin 两 scope 更新、签名、managed system root（热更）；baseline scope 暂缓（baseline 仍随 plugin zip 以 `overlay/plugin/standards/baf-baseline-c/baseline.yml` 静态 fixture 形式发布，无独立版本号/独立 hot-update 路径） | **未开始** |
| 10    | release 门禁                                                                 | **未开始** |


MVP 完成线（Phase 0–8 + Phase 7 的 ToolGuard）**已落地**并随桌面 **baf-dsh 0.0.14** 分发（commit `3ab67a934f`，commit `cb814b7be2` 配套修了 Windows `tar` `--force-local` 与 5 个 dsh client 包版本对齐 `0.1.5-alpha.1`）；full-go-path 主链（open→clarify→design→plan→implement→verify→archive，含门禁与非法转换拒绝）随 0.0.12 起桌面分发；bug fast-path 与 T15 风险升级（Phase 6）随 0.0.12 起；baseline 驱动的 quality/standard/guard/scaffold（Phase 7）随 0.0.13 起；slash 全集 + `baf-cli` standalone CLI + `listChanges` Remote（Phase 8）随 **0.0.14** 起。`packages/baf` 域层 **22/22 文件 / 166/166 用例绿**（2026-09-17 复跑，含 §18 coordinator、§19 resume 与 §18.3 会话启动门的新增用例）；`surface-parity.spec.ts` 锁住 slash / CLI / Remote / drives 四入口命名一致性 6/6 绿。
**已知问题（2026-09-14 复核，均非 Phase 8 引入）**：① `agent-presets` 通用测试 `mount.spec.ts`「scopes prompt sections…」1 例失败——merge `9c2aa8a6d4` 带入的上游 system-prompt 变更所致（Phase 8 提交未触及相关源码；BAF 专属 roster/mount 测试 7/7 绿）；② `packages/baf` 未达仓库 per-file 100% 覆盖率门禁（`pnpm run test:coverage` 会失败；Phase 2 起累积的债），需专项补测试或做豁免决策。

### Phase 4 — 已完成明细


| 项                                 | 状态  | 落点                                                                |
| --------------------------------- | --- | ----------------------------------------------------------------- |
| `NODE_CATALOG` / `WORKFLOW_GRAPH` | 已完成 | `baf-core` `catalog.ts` / `graph.ts`（§5.1–5.3 权威，UI 只渲染）          |
| append-only projection + replay   | 已完成 | `baf-workflow` `projection.ts`；单 writer + atomic rename；损坏诊断      |
| `transition` 裁决                   | 已完成 | `transition.ts`；表外 → `invalid_transition`                         |
| intake 规则引擎 + confirm             | 已完成 | `intake.ts`（启发式 suggest + 规则 review/decide/confirm）               |
| `WorkflowService` 实现              | 已完成 | `workflow-service.ts`；挂到 `BafWorkflow`                            |
| Web `WorkflowTabView` Remote      | 已完成 | `baf-workflow` Typert Remote；按 session cwd 读写 projection          |
| 会话 Tab「工作流」                       | 已完成 | `packages/client/ui-baf-workflow/`；仅 `agentPreset === baf` 显示；半交互 |
| 与「轨迹图」隔离                          | 已完成 | 设置原「工作流」section 改名为「轨迹图」；两 Tab 并存、职责分离                            |

### Phase 5 — 已完成明细

| 项                                        | 状态  | 落点                                                                                              |
| ---------------------------------------- | --- | ----------------------------------------------------------------------------------------------- |
| `baf-openspec` 独立包（Cordis Service）          | 已完成 | `packages/baf/baf-workflow-openspec/`；本地文件模式 OpenSpec adapter（骨架、读取、校验、原子归档）+ `BafOpenspec` service |
| 阶段运行时上下文                                  | 已完成 | `baf-workflow` `stages/context.ts`；绑定 projection store / adapter / workspace / baseline            |
| N1 `open` 骨架创建                            | 已完成 | `stages/open.ts`；Git revision 前置检查 + change skeleton + `stage-entered`                          |
| N2 `clarify` 产物 + T6 门禁                     | 已完成 | `stages/clarify.ts`；阻塞问题/验收条件/非目标渲染，模板态可覆写、已填态拒绝                        |
| N3 `design` 产物 + 引用核验                      | 已完成 | `stages/design.ts`；设计引用仓库路径存在性检查，缺失即 `invalid_transition`                          |
| N4 `plan` 产物 + T8 门禁                      | 已完成 | `stages/plan.ts`；`plan.md` + `plan.json`（任务/allowlist/验证命令/回滚点）                       |
| N5 `implement` 任务状态 + allowlist             | 已完成 | `stages/implement.ts`；任务开始/完成/阻塞记录 + 越界修改拒绝                                       |
| N6 `verify` 检查聚合                          | 已完成 | `stages/verify.ts`；`CheckRunner` 接 OpenSpec validate + `verify-report.json`                       |
| N7 `archive` 人工确认 + 原子归档                  | 已完成 | `stages/archive.ts`；verify 报告作为 T10 证据 + OpenSpec 原子归档 + `change-archived`                  |
| `StagePipeline` 编排                        | 已完成 | `stages/pipeline.ts`；绑定 `WorkflowService.transition`，进入/完成/拒绝事件全程入 projection            |
| N8 `drift` 检测 + `baseline-locked` 锚点       | 已完成 | `stages/drift.ts`；Git revision / baseline id / baseline 内容 / verify-report 过期 / 已完成产物删除五个触发器；`pipeline.driveDriftStage` 写入 `drift-detected`，T13 由调用方经 `decideTransition` 走回最早受影响节点；open-stage 落 `baseline-locked` 事件锁定 baseline + sourceRevision |
| T11 verify 失败回 implement（修复回环）        | 已完成 | `stages/pipeline.ts` `driveVerifyStage`；必需检查失败 → `stage-failed` + `verify → implement` 重新进入 |
| `abandon` 入口（T16）                          | 已完成 | `stages/abandon.ts`；`driveAbandon` 需显式确认 → `change-abandoned`；幂等保留产物，保留全部审计             |
| 阶段测试（happy path + 门禁失败 + 非法进入 + 全链路 + T11 + drift + abandon） | 已完成 | `baf-workflow` `tests/stages.spec.ts`                                                          |
| 桌面分发                                      | 已完成 | `pack-dsh.mjs` force 打包 `baf-openspec`；`baf-product-versions.json` 嵌入 `bafOpenspec` 字段          |

### Phase 6 — 已完成明细（2026-09-12）

| 项                                        | 状态  | 落点                                                                                              |
| ---------------------------------------- | --- | ----------------------------------------------------------------------------------------------- |
| fast-path open（T3 + 最小 Bug 记录）           | 已完成 | `stages/fastpath.ts` `driveFastPathOpen` + `pipeline.driveFastPathOpenStage`；`bug-record.md`（问题/根因/影响范围/回归测试/Workspace 锚点）+ fast-path 版 `plan.json` ledger（regression-test 任务先行）；Git revision 缺失仅告警不阻断（full-go-path 会阻断）；不创建 OpenSpec 骨架 |
| T5 机器证据（root cause recorded）           | 已完成 | `fastpath.ts` `rootCauseRecorded` 从 bug-record 读回根因段判定；`pipeline.enterImplementStage` 以该裁决为 T5 evidence，证据缺失 → `invalid_transition` 且停留在 open |
| 回归测试先行（regression-test-first）           | 已完成 | `fastpath.ts` `assertRegressionFirst` 挂在 `implement.recordTouched`（allowlist 检查之后、写入之前拒绝 → 可恢复）；`gates.ts` implement 门禁 fast-path 分支按 durable ledger 复核（任务存在、done、回归文件已 touched，否则 `regression_test_required`） |
| fast-path verify 检查集                        | 已完成 | `stages/verify.ts` `buildVerifyRunner(ctx, changeId, mode)`；fast-path：`regression-test` 为必需检查（结构性判定 ledger），`openspec-validate` 降级为非必需并标注「未走 OpenSpec：intake reason codes」；报告新增 `mode` 字段（`check-runner.ts`） |
| T15 升级（结构化范围扩大自动触发）                | 已完成 | `stages/escalate.ts` `driveEscalate` + `pipeline.driveImplementStage` 预检 `scopeGrowthFiles`（touched ∉ allowlist）；顺序约束：先在 mode 仍为 bug-fix-path 时裁决 T15，再写 `stage-failed(implement)` + `mode-upgraded`（否则表过滤会吞掉该边） |
| T15 升级（语义原因显式触发）                      | 已完成 | `pipeline.driveEscalateStage({changeId, cause})`；非 fast-path implement 拒绝（`invalid_transition`）并留 `transition-rejected` 审计 |
| 升级后 OpenSpec 补建 + 审计保留                | 已完成 | `escalate.ts`：`plan.json` → `fastpath-ledger.json` 原子改名保留 fast-path 审计；安装携带 bug 上下文（Problem/Root cause）的 `proposal.md` 与 `tasks.md` 模板；随后 `stage-entered(clarify)`，`pipeline.enterStage` 幂等续入（同节点 in-progress 直接续跑），补走 clarify → design → plan → implement → verify → archive |
| mode 感知实现门禁修复                            | 已完成 | `implement.ts` `driveImplementComplete` 不再硬编码 `full-go-path`，mode 由 projection status 读出 |
| 阶段测试（fast-path 全链路 / T5 / 回归先行拒绝 / 自动升级 / 显式升级 / 升级后补走） | 已完成 | `baf-workflow` `tests/fastpath.spec.ts`（8 用例）；`packages/baf` 全量 56/56 绿 |

### Phase 8 — 已完成明细（2026-09-14）

| 项                                        | 状态  | 落点                                                                                              |
| ---------------------------------------- | --- | ----------------------------------------------------------------------------------------------- |
| slash 全集（`/baf-help` `/baf-version` `/baf-status` `/baf-list` `/baf-doctor` + 11 个阶段 / quality / guard 驱动器） | 已完成 | `packages/baf/baf-workflow/src/commands.ts`；handler 仅委派 `command-drives.ts`，统一错误码走 `CommandResult` |
| 命令驱动器（slash / CLI 共源）                     | 已完成 | `packages/baf/baf-workflow/src/command-drives.ts` + `src/cli-args.ts`；slash / CLI / Remote / drives 四入口读同一 `WorkflowService` |
| standalone CLI（Commander 树，无新增 bin）       | 已完成 | `packages/baf/baf-workflow/src/cmdline.ts`（subpath `./cmdline`）；启用：`dsh --from-default-profile baf --patch packages/baf/baf-workflow/overlays/baf-cli.cordis.patch.yml -- <subcommand>`；`verify-application-entrypoints` 仍绿 |
| CLI enable patch                          | 已完成 | `packages/baf/baf-workflow/overlays/baf-cli.cordis.patch.yml`：把默认 disable 的 `baf-cli` row 翻成 enabled；普通 `baf` agent session 不引入此 row |
| `baf-cli` row（默认 disable）                | 已完成 | `packages/preset/agent-presets/presets/baf/agent.cordis.yml` 末尾新增 `@deepseek-ai/dsh-baf-workflow/cmdline` row，`disabled: true`，普通 preset 不引入 |
| desktop bridge（framed-byte IPC → api-gateway → Typert Remote） | 已完成 | `packages/api/remotes` + `packages/client/ui-baf-workflow`（`BafWorkflowTabRemote`）；desktop-host child process 在 Phase 4–7 已提供，本步仅新增 `listChanges` |
| 工作流 Tab（Electron） | 已完成 | Web Tab + Typert Remote 已在 Phase 4 落地；Phase 8 不另起 Electron Tab，复用同一 `WorkflowTabView` / domain service |
| `listChanges` Remote（变更 Dashboard） | 已完成 | `BafWorkflowTabRemote.listChanges`（`packages/client/ui-baf-workflow/src/index.ts`）；typert 边界类型 `BafWorkflowChangeRow` 在 `types.ts` 自有（避免 root-realm 类型穿越）；读 projection index，返回 `changeId / mode / current / seq / updatedAt` |
| 四入口一致性 snapshot                          | 已完成 | `packages/baf/baf-workflow/tests/surface-parity.spec.ts`：slash / CLI / Remote / drives 命名 / 命令表一致 5/5 绿 |
| 桌面分发                                  | 已完成 | `baf-dsh 0.0.14` 已构建：`overlay/desktop/dist/win-unpacked/baf-dsh.exe`（≈ 205 MB），含 `cmdline.js`（140.58 kB）、`listChanges` Remote、7 个 `dsh-baf-*` 包版本 `0.1.5-alpha.1` |
| 配套修复                                  | 已完成 | commit `cb814b7be2`：`scripts/release/tarball.ts` + `apps/desktop/scripts/prepare-package-set.ts` 给 tar 调用加 `--force-local`（Windows 上 GNU tar 把 `D:\...` 解析为 `user@host:path`）；5 个 dsh client 包（`ui-baf-desktop / ui-baf-tracegraph / ui-baf-workflow / ui-settings-general / ui-settings-updates`）从 `0.1.3` bump 到 `0.1.5-alpha.1` 对齐 dsh family |


### Phase 7 — 已完成明细（2026-09-13）

| 项                                        | 状态  | 落点                                                                                              |
| ---------------------------------------- | --- | ----------------------------------------------------------------------------------------------- |
| `baf-standard` 独立包（Cordis Service）         | 已完成 | `packages/baf/baf-standard/`；`StandardSummary` schema + `summarizeStandard` + `renderStandardPrompt`；占位态返回 `policy_missing` 并给出 `sourceRef#anchor` 指引，prompt 渲染走 service 表面 |
| `baf-quality` 独立包（Cordis Service）          | 已完成 | `packages/baf/baf-check-quality/`；`createCStackAdapter` 接 C 栈（compiler probe / build / test / coverage / analyzers）；`QualityReport` schema 含 `toolVersions / checks / passed / diagnostics`；占位命令以 `policy_missing` 标记，coverage 数字阈值 fail-closed |
| `baf-guard` 独立包（service + install row）      | 已完成 | `packages/baf/baf-check-guard/`；`BafGuard` 服务暴露 `policy(root)`（action `verify`/`secret-scan`），同步从 `.baf/projection/index.json` + change log + allowlist 重读裁决；`./install` 非隔离 row 经 host `agents` 服务给每个 agent 装 `tools.guard`（同 baf-commands 模式） |
| 工具硬门禁裁决                              | 已完成 | `baf-guard/src/policy.ts`：fs write 走结构路径→密钥扫描→active change→intakeConfirmed→DOC_STAGES change dir → implement allowlist；shell 走危险模式（rm-root / format / shutdown / git-force-push）+ 间接写（`>`/`>>` 重定向、fd-to-file、heredoc、tee、sed -i、perl -i、truncate、shred、cp/mv、unzip/tar、wget/curl）双重识别 |
| `baf-scaffold` 独立包（Cordis Service）        | 已完成 | `packages/baf/baf-scaffold/`；`planScaffold` 生成 `.baf/baseline.yml`（含 §15 占位）与 `openspec/changes/.gitkeep`；`applyScaffold` 不覆盖：相同内容跳过、内容不同→`<path>.baf-backup-<iso 时间戳>`；`scaffoldWorkspace` 必须 `humanConfirmed:true`，否则返回 `{kind:'refused', reason:'human_confirmation_required'}` |
| verify CheckRunner 接线 stack/guard      | 已完成 | `baf-workflow` `stages/context.ts` 收 `stack?: StackAdapter` + `guard?: GuardPolicy`；`stages/verify.ts` 新增 quality row（`required: ctx.stack && ctx.baseline`）与 guard row（`ctx.guard.check({action:'verify', paths})`），secret-scan row 在 `baseline.guard.secretScan === 'off'` 时跳过；`toolVersions` 通过 `buildVerifyRunner(ctx, changeId, mode, options)` 注入并经 `Object.assign` 合并到报告 |
| verify 阶段测试（Phase 7 wiring）             | 已完成 | `baf-workflow` `tests/stages.spec.ts`：quality 失败→T11 + 结构化 reasons + toolVersions 合并；guard 失败→`protected_path` 门禁；双通过→完成 |
| 工具硬门禁测试                               | 已完成 | `baf-guard` `tests/tool-guard.spec.ts`：策略 reason codes、shell allow/deny 集、classification、stable-prefix denials、re-adjudication flip、sync disk state（空 workspace→`intake_confirmation_required`、real projection 驱动到 implement→allowlist honored）、GuardPolicy actions（verify/secret-scan/off）、install row 装配合约 |
| baf 域 isolate 新成员                          | 已完成 | `presets/baf/agent.cordis.yml` `baf-domain` group 增 `bafStandard/bafQuality/bafGuard/bafScaffold` 至 isolate；新 row `baf-guard-install`（`@deepseek-ai/dsh-baf-guard/install`）位于 isolate 之外触达 host `agents`；`baf-roster.spec.ts` 增 Phase 7 断言；`baf-mount.spec.ts` 新测 Phase 7 服务在 isolate 下共享实例 |
| workspace 自动发现 + pnpm 链接                  | 已完成 | `pnpm-workspace.yaml` `packages/*/*` 自动纳入；`tsconfig.base.json` 新增 4 条 path mapping；`pnpm install` 完成 workspace 链接 |
| 桌面打包 FORCE_PACKAGES 补齐                    | 已完成 | `overlay/scripts/pack-dsh.mjs` FORCE_PACKAGES 新增 `baf-standard/baf-check-quality/baf-check-guard/baf-scaffold` |
| 桌面版本说明                                  | 已完成 | `overlay/desktop/version-notes.json` Phase 7 desktop 注释 + 4 个新包 entries |
| 阶段测试（standard/quality/guard/scaffold + verify 接线） | 已完成 | `packages/baf` 全量 17/17 文件 / 103/103 用例绿（无新增失败） |






### Phase 4 确认结论（2026-09-07）

1. **范围**：Domain（projection/transition/intake/status）+ Web 工作流 Tab + Web Typert Remote；Electron `baf:getWorkflowStatus` IPC 仍属 Phase 8。
2. **Tab 名**：「工作流」；BAF 模式专有 go 状态机可视化；与「轨迹图」（执行轨迹）无关。
3. **可见性**：仅当前 session `agentPreset === baf` 时注册会话 Tab。
4. **交互**：半交互——可确认/拒绝/补充分类、查看详情、合法 transition；archive/阶段执行等 Phase 5+ 按钮展示但禁用。
5. **详情字段**：`NODE_CATALOG` 含前置/动作/产物/完成条件/失败处理/转换条件；叠加 live 状态、skip 理由、OpenSpec 裁剪 reason codes、baseline/route/projection 元数据。
6. **视觉**：跟随 `--dsw-`* 主题（亮/暗）；自研 SVG/CSS，不做拖拽编排。
7. **空态**：无 active change 仍渲染完整模板图 + 顶栏引导。
8. **顺序**：文档 → domain → UI（本落地已按此执行）。



### Phase 3 — 已完成明细


| 项                                    | 状态                   | 落点                                                                             |
| ------------------------------------ | -------------------- | ------------------------------------------------------------------------------ |
| `EnterpriseRoutePolicy` 类型/schema/加载 | 已完成                  | `baf-core` `route-policy.ts` + `schema/enterprise-route-policy.schema.json`    |
| 加载入口冻结                               | 已完成                  | **发行/部署配置路径**（独立文件，session 创建冻结）；登记见 `enterprise-inputs.md` / `route-notes.md` |
| `resolveRoute()`                     | 已完成                  | `packages/baf/baf-workflow/src/route.ts`；§6.2 边界测试 `tests/route.spec.ts`       |
| `baf/route-resolved` 审计              | 已完成                  | `route-audit.ts`；session log 权威                                                |
| `RouteStatusView`                    | 已完成                  | `baf-core` `buildRouteStatusView`；`BafWorkflow.routeStatus()`                  |
| 阶段 route → agent ModelSelection      | 已完成                  | `phase-route.ts`（主路径）；workflow `agent()` 仅扇出                                   |
| composition 挂载 `baf-workflow`        | 已完成                  | `presets/baf/agent.cordis.yml`（`isolate.bafWorkflow`）                          |
| 工作流 Tab UI                           | **Phase 4 已完成（Web）** | Electron IPC 仍属 Phase 8                                                        |




### Phase 0 — 已完成明细


| 项                                 | 状态  | 落点                                                                                            |
| --------------------------------- | --- | --------------------------------------------------------------------------------------------- |
| `enterprise-inputs.md`            | 已完成 | `overlay/docs/baf/enterprise-inputs.md`（OpenSpec/gcc/覆盖率已确认；其余多为 `unavailable`）               |
| `error-codes.md`                  | 已完成 | `overlay/docs/baf/error-codes.md`                                                             |
| `compatibility-matrix.md`         | 已完成 | `overlay/docs/baf/compatibility-matrix.md`（模板 + fixture 行）                                    |
| `route-notes.md`                  | 已完成 | `overlay/docs/baf/route-notes.md`（Phase 0 核查 + Phase 3 接线）                                    |
| baseline / routeProfile schema    | 已完成 | `packages/baf/baf-core/schema/*`                                                              |
| fixture baseline                  | 已完成 | `overlay/plugin/standards/baf-baseline-c/` + `packages/baf/baf-core/tests/fixtures/baseline/` |
| projection / change id 规则冻结       | 已完成 | 记入 `enterprise-inputs.md` §8                                                                  |
| 包落点冻结 `packages/baf/`             | 已完成 | 同上                                                                                            |
| InstalledVersions schema 2 字段映射登记 | 已完成 | `enterprise-inputs.md` §7（**实现代码仍属 Phase 9**）                                                 |
| fixture 校验脚本                      | 已完成 | `overlay/scripts/verify-baf-baseline-fixture.mjs`（`npm run verify-baf-baseline`）              |




### Phase 1 — 已完成明细


| 项                                                       | 状态  | 落点                                                                                  |
| ------------------------------------------------------- | --- | ----------------------------------------------------------------------------------- |
| `presets/baf/preset.yml`                                | 已完成 | `order: 2`；与 `ptc` 并列时按 id 排在 `standard` 后                                          |
| `agent.cordis.yml`                                      | 已完成 | 自 `standard` 复制；BAF persona **先中后英**；domain group 挂载 `baf-core` + `baf-workflow`    |
| skills `baf-go` / `baf-c-guidance` / `baf-verification` | 已完成 | preset skills 树；`skill-filesystem.customSkillDirs` 指向 `skills/`                     |
| display / UI locale 键                                   | 已完成 | `presetBafName` / `presetBafDescription`                                            |
| `baf-roster.spec.ts` + shipped-root / display / locales | 已完成 | unit 已绿；**拒绝 copy 官方 baf**                                                          |
| CLI e2e 列表 + **挂载冒烟**（工具目录 + BAF skills + persona）      | 已完成 | `apps/cli/tests/web-agent-presets.e2e.ts`                                           |
| Web authoring/selection 金标                              | 已手改 | `apps/web/tests/expected/agent-preset-*`；验收以设置页为准                                   |
| 桌面不同步官方 preset 到 user root                              | 已完成 | `overlay/desktop/src/main.ts` 仅同步 `skills/`                                         |
| 官方 BAF 不可复制（API + UI）                                   | 已完成 | `isPresetCopyable` / `copyable: false` / `officialNoCopy`                           |
| 本地 `dist:dir` 产物                                        | 已打出 | `overlay/desktop/dist/win-unpacked/baf-dsh.exe`（含 shipped `presets/baf`）            |
| Agent Note                                              | 已完成 | `.agents/notes/implemented/feature/2026-09-05-baf-system-preset`；内置-only 见同日后续 note |
| `pack-dsh` 打包后复检注释                                      | 已完成 | `overlay/scripts/pack-dsh.mjs`                                                      |




### 明确尚未完成（Phase 0/1 范围外或债）


| 项                                               | 说明                                                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `packages/baf/baf-core` 运行时包                    | **已完成**（`@deepseek-ai/dsh-baf-core`；baseline loader + unavailable adapters + RouteStatusView） |
| composition 启用 `baf-core` / `baf-workflow` row  | **已完成**（`isolate.bafCore` + `isolate.bafWorkflow` + `isolate.bafOpenspec`）                        |
| go 状态机 / intake / projection                    | **Phase 4 已完成**；full-go-path 阶段 handler 与 `StagePipeline` **Phase 5 已完成**；Web 工作流 Tab 已落地                |
| ToolGuard / quality / OpenSpec adapter          | **全部已完成**：OpenSpec `baf-openspec`（本地文件模式）；quality `baf-quality`；ToolGuard `baf-guard`（Phase 7，含 per-agent 非隔离 install row） |
| slash / `baf` CLI profile / desktop bridge      | 只读 slash 子集已先行（`/baf-help` `/baf-status` `/baf-version` `/baf-doctor`，`baf-workflow/commands`）；阶段命令、CLI profile、desktop IPC 属 Phase 8 |
| `overlay/plugin` → `~/.dsh/.agent-presets` 官方同步 | **已关闭**（桌面不同步 `agent-presets`；官方 BAF 仅 shipped）                                               |
| 更新签名强制 / InstalledVersions schema 2 代码          | 未实现（Phase 9）                                                                                  |
| 企业输入真值（模型清单/公钥等）                                | 部分已填：OpenSpec=`latest`、编译器=`gcc`、覆盖率=`project-config`；其余仍 `unavailable`                       |




### Phase 0/1 确认结论（2026-09-05）

1. `order: 2` **与** `ptc` **并列**：同意；roster 保持 `standard → baf → ptc → minimal → cordis`。
2. **BAF persona**：中英双语，**先中后英**（已写入 `agent.cordis.yml`）。
3. **企业输入**：OpenSpec 用 **latest**；C 编译器用 **gcc**；覆盖率阈值 **可在工程配置中配置**（baseline fixture 已登记）。
4. **官方 BAF 交付**：**只能使用内置 BAF**；禁止同步到用户目录；**用户不允许修改**，亦**不允许复制**官方 BAF 成 user 快照（需求变更，已落地 API/UI）。
5. **验收**：以「设置 → Agent 预设 → 见 BAF 模式（内置）」为准。
6. **Ed25519**：正式密钥由企业另发；开发仅本地生成，不提交私钥。

---



## 0. 怎么读这份文档（逻辑地图）


| 问题                           | 看哪章                 |
| ---------------------------- | ------------------- |
| **哪些已实现、哪些没有、有何待确认**         | **文首「实现进度」与「确认结论」** |
| 要做什么、给谁用、不做什么                | 第 1、2 章             |
| 架构分几层、每层谁负责、复用哪些现有代码         | 第 3 章               |
| 官方资源如何隔离（内置-only，不可复制）       | 第 4 章               |
| **工作流怎么走、每个节点做什么**           | **第 5 章（核心）**       |
| **一条命令驱动整个工作流（`baf-go` + 两个确认门）** | **第 18 章** |
| **会话打开时怎么绑定/新建工作流、体检工具链、欢迎语长什么样** | **第 18.3 节 + 第 20.3 节** |
| **drift（依据漂移）之后怎么回到合法节点** | **第 19 章** |
| **日志、卡片、状态行按什么格式打印** | **第 20 章** |
| **还有哪几项没拍板（开工前要确认）** | **第 21 章** |
| 不同阶段怎么用不同模型                  | 第 6 章               |
| 企业规则和工具从哪里来                  | 第 7 章               |
| 代码怎么拆成插件、命令长什么样              | 第 8、9 章             |
| 用户看到什么：preset、roster、工作流 Tab | 第 10 章              |
| 桌面应用怎么打包、升级、回滚               | 第 11 章              |
| **从零到一按什么顺序做、每步怎么做**         | **第 12 章（核心）**      |
| 怎么证明做完了                      | 第 13–16 章           |
| 有无遗漏/风险、能否落地、MVP 怎么裁         | **第 17 章**          |


三条主线贯穿全文：

1. **信任主线**：system 资源只读、user 资源可写、企业策略最高优先（第 4、7、11 章）；
2. **状态主线**：所有工作流状态只由 domain service 改写，模型只能建议（第 5 章）；
3. **单一事实主线**：slash、CLI、desktop、工作流 Tab 全部读写同一 projection 和 domain service（第 3.7、9、10 章）。

落地前必读的三条硬澄清（细节见第 2.3、3.9、9.1、17 章）：

1. **BAF** `go` **工作流 ≠ dsh** `workflow` **工具**：后者是模型编写编排脚本、扇出子代理的能力；前者是企业固定状态机，由 `baf-workflow` domain service 执行，禁止用 `tool-workflow`/`ralph` 脚本“实现”阶段转换。
2. **独立** `baf` **Node 应用入口违规**：dsh 只允许经 `dsh --profile …` 启动 Node 应用；`baf` CLI 必须是 profile/patch 或 thin wrapper，不能新增绕过 launcher 的 package bin。
3. **官方 BAF 内置-only**：不得同步或复制到 `~/.dsh/.agent-presets`；用户不可修改、不可复制官方 `baf`（见第 4 章与文首确认结论）。

---



## 1. 需求结论：要做什么、给谁用、解决什么问题



### 1.1 你要做的东西

在 dsh 中实现一个名为 **“BAF 模式”** 的企业级代码 Agent。它不是一个提示词，也不是散落在用户目录里的脚本，而是由以下部分组成、可随桌面应用交付的产品能力：

1. 一个 dsh 原生 Agent preset，规定 Agent 使用哪些工具、插件、技能和系统提示词；
2. 一组 BAF 官方插件，负责企业工作流、OpenSpec、C 语言质量检查、安全门禁、项目初始化和状态诊断；
3. 一套固定但可分类的 `go` 开发工作流：新需求走完整流程，低风险 Bug 走受控快速通道，由统一的 change intake 分类器决定；
4. 一套企业基线，规定 OpenSpec、Matt Pocock 轻量工程实践、C 工具链、质量阈值和安全策略；
5. 一套统一的 slash command、独立 `baf` CLI 和桌面 UI/更新入口，桌面端含可视化工作流 Tab（流程图 + 当前位置）；
6. 一套随桌面应用打包、签名、升级、校验和回滚的官方资源分发机制。



### 1.2 给谁用

BAF 面向企业同事。普通用户可以：

- 选择和使用官方 BAF；
- 查看官方 BAF 摘要。

普通用户不能：

- 复制官方 BAF 到 user root（官方 BAF 为内置-only）；
- 修改、删除、替换或覆盖官方 BAF；
- 通过 user root 同名目录 shadow 官方 BAF；
- 关闭企业硬门禁、签名校验、兼容性检查、审计或 rollback；
- 修改官方 provider/model allowed list、fallback 集合或 route policy；
- 跳过 intake 分类强行进入实现阶段。



### 1.3 用来解决什么问题

- 所有人使用同一套企业规定的工作流；
- 需求、设计、实现和验证结果有可追溯产物；
- Bug 和新需求自动分流：小 Bug 不被官僚流程拖慢，大 Bug 不被草率流程放过；
- Agent 不能通过自然语言跳过必要阶段或伪造“已完成”；
- 编译、测试、覆盖率、静态分析和安全扫描有机器可验证的结果；
- 官方规则不会被用户目录中的同名资源覆盖；
- 企业可以发布新版本，并安全地升级和回滚；
- 后续可以增加 GitLab、Jira、Python 和知识库适配，而不重写核心工作流。



### 1.4 明确不做什么（第一期）

- 不再使用 Comet；
- 不再使用 Superpowers 这类重型外部编排框架；
- 不保留 vibe workflow；BAF 选中后直接采用 `go`；
- 不以 Claude Code marketplace、`enabledPlugins` 或 Claude Code hooks 作为运行时架构；
- 不把官方 BAF 同步或复制到 `~/.dsh/.agent-presets`；
- 不允许用户复制或修改官方 BAF；
- 不在 workflow 代码中写死某个 OpenSpec 次版本号、某个覆盖率数字（OpenSpec 跟 latest；覆盖率读工程配置；编译器固定 gcc）；
- 第一期不接 GitLab、Jira、远程知识库和 Python；
- 第一期不自动 push、不提供强制 reset、不允许普通用户关闭官方安全门禁；
- 第一期工作流 Tab 只做固定流程图展示和受控操作，不做拖拽式自定义编排。

---



## 2. BAF 的本质：它是什么，不是什么



### 2.1 产品定义

> **一个由 dsh preset 装配的企业 Agent 产品；preset 决定能力边界，插件提供业务能力，工作流负责过程状态，企业基线负责具体规则和工具，桌面应用负责受控分发和升级。**

```text
BAF = dsh Host
    + 官方 system preset(id = baf)
    + BAF plugins
    + go workflow(含 intake 分类和 bug fast path)
    + enterprise baseline
    + local C adapters
    + guard/quality gates
    + workflow tab(流程图可视化)
    + desktop packaging/update
```

BAF 不是：单独的一段 system prompt、单独的 `baf` 命令、单独的 `agent.cordis.yml`、一个大插件、一个把用户目录当安装目录的 zip 包。

### 2.2 BAF 的核心对象


| 对象                  | 作用                                        | 是否官方锁定                    |
| ------------------- | ----------------------------------------- | ------------------------- |
| `baf` preset        | 描述 Agent 采用哪些 dsh 插件、工具、prompt 和 skill    | 是                         |
| BAF plugin          | 提供 workflow、OpenSpec、quality、guard 等服务和命令 | 官方版本锁定                    |
| enterprise baseline | 提供规则、模板、工具路径、版本、阈值和 route profile         | 是                         |
| workflow projection | 保存当前项目的可恢复阶段状态                            | 可写，但必须由 domain service 维护 |
| change intake 结果    | 每个 change 的分类、模式、理由和用户确认记录                | 可写，同上                     |
| update manifest     | 描述可验证的升级内容、版本、hash 和签名                    | 官方签名                      |




### 2.3 与 dsh 原生「workflow」能力的边界（必读）


| 概念                                               | 所有者                           | 做什么                             | BAF 是否使用                                         |
| ------------------------------------------------ | ----------------------------- | ------------------------------- | ------------------------------------------------ |
| BAF `go` 工作流                                     | `baf-workflow` domain service | 固定阶段状态机、intake 分类、projection、门禁 | **是，核心**                                         |
| dsh `workflow` / `tool-workflow` / `ralph`       | `packages/workflow/*`         | 模型编写编排脚本，扇出子代理                  | **否**，不得驱动阶段转换                                   |
| dsh workflow `agent({ provider, model, phase })` | `workflow-worker-thread`      | 子代理请求级 route 转发                 | **可选复用**：仅当某阶段需要子代理扇出时借用 route 字段；阶段权威仍在 BAF 状态机 |


实现红线：

- 阶段转换只经 `WorkflowService.transition()`；模型回复、workflow 脚本 `return`、子代理完成，都不构成转换证据；
- BAF composition 可保留 standard 里的 `tool-workflow`/`ralph` 行供实现阶段内部使用，但必须由 ToolGuard 禁止它们改写 projection / 跳过 verify / 扩大 allowlist；
- 文档与代码中凡写 `workflow` 必须标明是 **BAF go** 还是 **dsh workflow tool**，禁止混称。

---



## 3. 自下而上的总体架构

下层提供稳定能力，上层只能调用下层公开 contract，不能反向越界。

### 3.1 第 0 层：操作系统与本地项目

文件系统、进程、环境变量、Git 工作区、C 编译器、构建/测试/静态分析工具。都属于外部依赖，不能假设存在。

- 所有外部命令通过受控执行器运行；
- 记录命令、工作目录、环境摘要、版本、退出码、stdout/stderr、耗时和取消状态；
- 不把 secret 放进日志；
- 路径必须经过 workspace containment 检查；
- 缺少工具返回结构化 `tool_unavailable`，不用“看起来成功”的文本代替结果。



### 3.2 第 1 层：dsh Host Plane（复用，不重写）

由 dsh 宿主提供：Cordis runtime 和 scope、Agent/session 生命周期、provider/model route（第 6 章）、shell sandbox 和审批、filesystem、search、web、jobs、session persistence、plugin/skill/command registry、desktop bridge、更新下载和重启能力。

已确认的复用点（实现时直接引用，不新建平行实现）：


| 能力                            | 位置                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| preset 发现/挂载/复制/删除            | `packages/preset/agent-presets/src/{index,discovery,mount,authoring,session}.ts`                                                           |
| standard composition          | `packages/preset/agent-presets/presets/standard/agent.cordis.yml`                                                                          |
| 人类命令 registry                 | `packages/interaction/commands`（`@deepseek-ai/dsh-commands`）：`CommandRuntime.register()`、`parseCommand()`、`CommandResult`、lifecycle events |
| launcher 参数边界                 | `packages/boot/cmdline` 的 `parseCmdline()`                                                                                                 |
| workflow worker 与 phase route | `packages/workflow/workflow-worker-thread/src/{runtime,host,meta}.ts`（`agent()` 支持 `provider`/`model`）                                     |
| session 模型选择                  | `packages/api/session-controller/src/{agent,commands,catalog}.ts`（projection、header 恢复、`session/model-unavailable`）                        |
| 默认模型                          | `packages/core/agent-default-model`                                                                                                        |
| usage/定价                      | `packages/llm/token-meter`                                                                                                                 |
| desktop 更新                    | `overlay/desktop/src/update/{manifest,github,plan,apply,service}.ts`、`overlay/desktop/src/versions.ts`                                     |


host-plane service 不得放进 preset 的 per-agent isolate realm，否则产生实例泄漏、重复注册或桌面侧无法读取。

### 3.3 第 2 层：BAF Domain Core（`baf-core`）

负责：BAF/preset/baseline 版本标识；统一错误码和诊断；workspace/Git/change identity；**change intake classifier**；domain service 接口（`WorkflowService` 等）；workflow/quality/guard 公共类型；command descriptor；desktop bridge 只读状态 contract。

不负责：直接执行 OpenSpec、直接跑 C 编译器、直接下载更新、把 UI 文案当业务状态、绕过 dsh 的 shell/审批/persistence。

### 3.4 第 3 层：Provider/Adapter 层

- `OpenSpecAdapter`：OpenSpec CLI、目录布局、模板和 validate；
- `StandardBaselineProvider`：企业规则和 Matt Pocock 轻量实践；
- `StackAdapter`：C 工程探测和工具链；
- `QualityRunner`：编译、测试、覆盖率、静态分析；
- `GuardPolicy`：安全、路径和流程门禁；
- `GitProvider`：本地 Git 状态、分支和变更；
- `UpdateCoordinator`：更新检查/应用/回滚抽象，不复制下载实现。

adapter 的职责是“把具体工具转换成统一结果”，不决定工作流顺序。工作流只调接口，不知道企业用 Make 还是 CMake。

### 3.5 第 4 层：BAF Business Plugins

第一期：`baf-core`、`baf-workflow`、`baf-openspec`、`baf-standard`、`baf-quality`、`baf-guard`、`baf-scaffold`（详细职责第 8 章）。

后续：`baf-integrate`（GitLab/Jira/远程 Git）、`baf-stack`（Python 等）、`baf-knowledge`（企业知识库）、`baf-observe`（审计/治理/指标）。

### 3.6 第 5 层：官方 BAF preset

```text
packages/preset/agent-presets/presets/baf/
  preset.yml
  agent.cordis.yml
  skills/
    baf-go/
    baf-c-guidance/
    baf-verification/
```

`agent.cordis.yml` 从 standard 完整复制（当前 dsh 无 preset 继承机制，不自创 patch 语义），保留全部 dsh 基础能力 rows，替换 persona，追加 BAF domain rows。所有带 service 的 row 放在正确的 `cordis:group`/`isolate` 结构内。

### 3.7 第 6 层：交互面

```text
slash command  ─┐
standalone CLI ─┤
desktop bridge ─┼─> BAF domain service ─> provider/adapters
workflow tab   ─┘
```

不得为四个入口各写一套 workflow 逻辑。

### 3.8 第 7 层：分发与升级

桌面应用携带官方 system resource；更新包经 manifest、hash、签名、兼容性和路径校验后才能更新 system resource；user payload 永远不能覆盖 system resource。三 scope 分发模型见第 11 章。

### 3.9 代码落点决策（packages vs overlay）


| 落点                                                               | 放什么                                          | 理由                                                         |
| ---------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------- |
| `packages/preset/agent-presets/presets/baf/`                     | 官方 preset 本体                                 | shipped-root 发现已内建于该包；`trust: system` 最直接                  |
| `packages/baf/*` 或 `packages/experimental/baf-*`（二选一，Phase 0 冻结） | BAF domain 插件源码                              | 需 Cordis 挂载、workspace 依赖、类型与测试；与现有 `@deepseek-ai/dsh-*` 同构 |
| `packages/client/ui-baf-workflow/`                               | 工作流 Tab UI                                   | 与现有 `ui-baf-desktop` 同层；走 slots + i18n                     |
| `overlay/desktop`、`overlay/scripts`、`overlay/plugin`             | 打包、更新、managed system root、baseline bundle 分发 | 二次开发层；减少与上游热文件冲突                                           |
| **禁止** `~/.dsh/.agent-presets` 作为官方安装目标                          | —                                            | 该路径是 user root；写进去则无法满足 system trust                       |


**推荐冻结**：domain 插件进 `packages/baf/`（pnpm workspace 已 glob `packages/*/`*）；若上游合入冲突面过大，再迁 `packages/experimental/` 并在 release 打包时显式纳入。`overlay/AGENTS.md`「优先 overlay」适用于桌面壳与安装器，**不**适用于必须进入 shipped preset root 与 Cordis composition 的 Agent 能力。

**现状（已关闭官方 user-root 同步）**：桌面启动只同步 `overlay/plugin/skills` → `~/.dsh/skills`；**不同步** `agent-presets`。官方 BAF 仅存在于 dsh shipped preset root。`overlay/plugin/README.md` 与 `overlay/docs/engineering/architecture.md` 与此一致。Phase 9 仍负责 managed system root 热更与签名，但不把官方 BAF 写入 user root。

---



## 4. Trust boundary 与资源分层



### 4.1 两类资源


| 层              | 来源                         | dsh trust | 用户权限                       |
| -------------- | -------------------------- | --------- | -------------------------- |
| system/shipped | 桌面安装包或企业签名更新               | `system`  | 可使用、查看摘要；**不可复制、编辑、删除、覆盖** |
| user           | 用户自建或其他允许的扩展（**不含**官方 BAF） | `user`    | 可按 dsh 规则编辑、删除、运行          |


官方 BAF 必须在 shipped/managed system root 被发现为 `trust: system`。禁止同步到 `~/.dsh/.agent-presets`（user root）。官方 `baf` 的 `copyable` 为 `false`。

### 4.2 必须实现的边界规则

1. user root 中与官方 `baf` 同名的目录不能 shadow 官方 BAF（现有 shipped-root-first 语义已保证，测试固化）；
2. user plugin 不能覆盖官方 preset、插件、baseline 或 system resource；
3. **禁止**通过 authoring API 复制官方 `baf`（`isPresetCopyable('baf') === false`）；UI 禁用复制并提示「仅内置」；
4. 桌面不同步官方 `agent-presets` 到 user root；
5. 官方更新不依赖、不触碰用户目录中的假冒 `baf`；
6. system payload 和 user payload 使用不同目标目录和写入权限；
7. zip 路径拒绝 `..`、绝对路径、符号链接逃逸和目录外写入；
8. system resource 更新后重新执行 discovery、trust、composition health check；
9. 官方资源缺失或损坏显示 broken system row，不静默隐藏；
10. UI 不向普通用户提供编辑、打开官方 canonical 目录或复制官方 BAF 的入口。



### 4.3 host-plane 与 agent-plane

- host-plane：更新服务、全局 registry、session persistence、凭证、审批、桌面桥接、共享网络服务；
- agent-plane：preset 为某个 Agent 提供的 tools、prompt、skills 和 per-agent state。

BAF plugin 每个 service row 的放置位置（realm）在设计阶段逐项标记；测试验证无 root-realm leak、无重复 registration、无跨 session 污染。桌面/CLI 需要读取的 BAF 状态（workflow status 等）通过 session projection / api controller 暴露，而不是塞进 root realm。

---



## 5. 完整工作流：状态机、流程图和每个节点的定义（核心章）



### 5.1 总流程图

所有入口（session 自然语言、`/baf-workflow-open`、`baf open`、工作流 Tab“新建变更”）先经过 N0 分类，再进入对应模式。`[方括号]` = 状态机节点；`●` = 终态；返回箭头 = 允许的回环。

```text
用户输入（消息 │ /baf-workflow-open │ baf open │ Tab“新建变更”）
   │
   ▼
[N0 intake 分类]
   │  判定：变更类型 + 影响范围 + 企业策略
   │
   ├─ 新需求 / 行为变化 ──────────────► mode = full-go-path
   ├─ Bug + 低风险 + baseline 允许 ───► mode = bug-fix-path
   ├─ Bug + 高风险 ──────────────────► mode = full-go-path
   └─ 信息不足 ──► 向用户提问澄清 ──►（回到 N0 重新分类）

full-go-path 主链（新需求 / 高风险 Bug）：

[N1 open] ──► [N2 clarify] ──► [N3 design] ──► [N4 plan] ──► [N5 implement] ──► [N6 verify]
 建立变更      澄清需求          技术设计          任务计划          实现+测试          全量验证
                                                                                                 │
                                                                  ┌────────────────────────────┤
                                                                  │      ├─ 通过且无 drift ──► [N7 archive] ──► ● 完成
                                                                  │      ├─ 任一检查失败 ────► 回 [N5 implement]（修复后重验）
                                                                  │      └─ drift ──► [N8 drift 处理] ──► 回 [N6 verify]

bug-fix-path 主链（低风险 Bug）：

[N1 open] ──► [N5 implement] ──► [N6 verify] ──► [N7 archive] ──► ● 完成
 建立变更+      修复+回归测试        含回归测试的验证       写最终 Bug 记录
 根因记录           │                    │
                    │                    ├─ 失败 ──► 回 [N5 implement]
                    │                    └─ 发现范围/风险扩大 ──► 升级 full-go-path，补走 N2→N3→N4 → N5 → N6
                    │
                    └─（图中必须标注“未走 OpenSpec：reason codes”）

横切（不属于固定顺序节点，任何 active 阶段都可触发）：

[当前 active 节点] ──依据变化──► [N8 drift 处理] ──► 最早受影响节点（重新执行/重新确认）
[resume]         崩溃/重开/换机后从最后一致阶段恢复
[abandon]        任意 active change 经用户确认进入 ● 已放弃（保留全部审计记录）
[archive 延后]   N7 可延后，change 保持 active 状态，不谎称已归档
```

要点：

- 图上每条边对应 5.2 转换表中一条合法转换，其余转换一律被 domain service 拒绝；
- verify 失败回 implement、drift 后回最早受影响节点、fast path 升级 full-go-path 是仅有的三类回环，模型不能创造第四类；
- `● 完成` 与 `● 已放弃` 是仅有的两个终态；`active`（archive 延后）是合法的非终态驻留。



### 5.2 状态转换表


| #   | 当前状态                | 目标状态            | 允许条件（由 domain service 检查）                                                |
| --- | ------------------- | --------------- | ------------------------------------------------------------------------ |
| T1  | （无 change）          | intake          | 任何 BAF 输入                                                                |
| T2  | intake              | open（full-go-path）   | 分类确认为新需求或高风险 Bug                                                         |
| T3  | intake              | open（fast path） | 确认为低风险 Bug 且 baseline 策略允许                                               |
| T4  | open                | clarify         | full-go-path、change skeleton 创建成功且 clarify 未并入 open                           |
| T4a | open                | design          | full-go-path、change skeleton 创建成功且 clarify 已按 5.5 并入 open，合并产物和理由已记录          |
| T5  | open                | implement       | fast path 且根因/影响范围记录完成                                                   |
| T6  | clarify             | design          | 阻塞问题已回答或明确延期；验收条件可测试                                                     |
| T7  | design              | plan            | 设计引用可验证文件/API 并被确认，且 design 未并入 plan                                     |
| T7a | design              | implement       | design 已按 5.5 并入 plan；合并的设计理由、任务、文件范围、验证命令和回滚点均已记录                       |
| T8  | plan                | implement       | 计划有文件范围、验证命令和回滚点                                                         |
| T9  | implement           | verify          | 全部任务有结果且无越界修改                                                            |
| T10 | verify              | archive         | 全部必需检查通过且无 drift（full-go-path 与 fast path 均进入 archive；fast path 在此写最终 Bug 记录） |
| T11 | verify              | implement       | 任一必需检查失败（修复回环）                                                           |
| T12 | 任意 active 节点        | drift           | 检测到依据变化（文件/分支/baseline/规格/composition/报告）并记录来源节点及最早受影响节点                 |
| T13 | drift               | 最早受影响节点         | 依据已恢复或经用户重新确认；目标由 drift evidence 决定，不得跳过尚未完成或已失效阶段                       |
| T14 | archive             | 完成              | 人工确认且原子归档成功                                                              |
| T15 | fast-path implement | clarify（补充）     | 风险升级为 full-go-path，补齐 N2/N3/N4                                                |
| T16 | 任意 active           | 已放弃             | 用户显式确认                                                                   |


不在表中的转换一律返回结构化 `invalid_transition`。模型在回复里声称“已进入下一阶段”不构成转换条件。

### 5.3 每个节点的详细定义

每个节点回答七个问题：前置条件、输入、要做的动作、产物、完成条件、失败处理、入口和路由。

#### N0 `intake` — 变更分类（所有入口的第一站）

- 前置条件：BAF session 已建立；workspace 可读。
- 输入：用户原始描述；workspace/Git 当前事实；已有 active change 列表；baseline 分类策略；企业 bug-fix-path 许可策略。
- 要做的动作：
  1. 解析用户意图，提取候选变更类型、涉及文件猜测和需要澄清的问题（模型只做建议）；
  2. 规则引擎复核：文件范围、公共 API、数据格式、并发、安全、性能、规格影响、回滚难度；
  3. 计算 `affectedScope`（single-file / small-local / cross-module / public-api / unknown）和 `confidence`；
  4. 判定 mode：新需求或高风险 Bug → `full-go-path`；低风险 Bug 且 baseline 允许 → `bug-fix-path`；信息不足 → `clarify-required` 并向用户提问，答案回流后重新执行本节点；
  5. 若 `requiresUserConfirmation` 为真，向用户展示分类卡（类型、理由、影响范围、是否需要 OpenSpec、推荐流程），等待确认；
  6. 确认后将 `ChangeIntake` 写入 projection 事件日志。
- 产物：`ChangeIntake { kind, mode, openspecRequired, reasonCodes, affectedScope, confidence }` 分类卡和确认记录。
- 完成条件：分类结果和用户确认（如需要）已写入 projection。
- 失败处理：baseline 缺失 → `policy_missing`/`baseline_unavailable`，禁止启用 fast path；无法分类 → `clarify-required`，不写源码。
- 入口：session 消息、`/baf-workflow-open`、`baf open`、工作流 Tab“新建变更”。
- 模型路由：轻量低延迟 route（第 6 章）。
- 硬规则：**分类确认之前禁止任何源码写入**；用户要求跳过 full-go-path 但规则判定必须走时，拒绝并展示 reason codes。



#### N1 `open` — 建立变更身份

- 前置条件：intake 已确认；workspace 可读；本地 Git 可用（不可用时 full-go-path 阻断、fast path 警告并留档）；baseline 可解析。
- 输入：`ChangeIntake`；Git branch/revision；baseline id/version。
- 要做的动作：探测 workspace/Git/baseline/OpenSpec 可用性；多个 active change 时要求用户显式选择或新建；生成唯一 change id；创建 change skeleton（full-go-path 建 OpenSpec change 目录，fast path 建最小 Bug 记录）；锁定 baseline 并记录 source revision。
- 产物：change id；skeleton 文件；初始化后的 workflow projection。
- 完成条件：change id 唯一、目标非空、目录合法；baseline lock 已记录。
- 失败处理：OpenSpec 不可用且流程需要规格 → `openspec_unavailable`；不覆盖任何已有文件。
- 入口：intake 自动进入；`/baf-workflow-open`、`baf open`、Tab 节点“开始”。
- 模型路由：轻量 route。



#### N2 `clarify` — 澄清需求（full-go-path）

- 前置条件：N1 完成。
- 输入：用户目标；intake 结果；N0 未闭合的问题。
- 要做的动作：枚举阻塞问题；记录每个答案、决策人/确认来源和时间；区分“已决定/待决定/明确不做”；写出可测试的验收条件；非阻塞问题可延期但记录原因。
- 产物：clarify 文档 / 决策记录。
- 完成条件：阻塞问题已回答或明确延期；验收条件可测试。
- 失败处理：用户未回答 → 阶段保持 in-progress；模型推测不得标记为用户确认。
- 入口：自动于 N1 后；`/baf-workflow-clarify`、Tab。
- 模型路由：低成本、长上下文整理 route。



#### N3 `design` — 技术设计（full-go-path）

- 前置条件：N2 完成。
- 输入：clarify 产物；仓库实际代码。
- 要做的动作：阅读实际仓库不凭空设计；确定接口、数据流、错误路径、风险和兼容性；优先复用现有抽象；每个结论附可验证文件/API 引用；对计划改动路径做 guard 预检查。
- 产物：design 文档、风险清单。
- 完成条件：设计引用实际文件/API 并符合 baseline；被用户/规则确认。
- 失败处理：读取后仓库已变化 → drift 标记；引用无法验证 → 不允许进入 plan。
- 入口：自动于 N2 后；`/baf-workflow-design`、Tab。
- 模型路由：高推理、长上下文 route。



#### N4 `plan` — 任务计划（full-go-path）

- 前置条件：N3 完成。
- 输入：design 产物。
- 要做的动作：将设计拆成任务（每项有输入、输出、影响文件、验证方法、回滚点）；固化允许修改的文件 allowlist；写出每个任务的验证命令和可观察完成标准；对 guard policy 做 snapshot。
- 产物：plan 文档、任务列表、文件 allowlist、guard snapshot。
- 完成条件：每项任务可执行、可验证、可回滚。
- 失败处理：计划不能只写“实现功能”；计划变化必须记录新事件，不得静默扩大范围。
- 入口：自动于 N3 后；`/baf-workflow-plan`、Tab。
- 模型路由：高推理、结构化输出 route。



#### N5 `implement` — 实现与测试

- 前置条件：full-go-path 要求 N4 完成；fast path 要求 N1 完成（含根因记录）。
- 输入：plan 或 Bug 记录；文件 allowlist；guard snapshot。
- 要做的动作：每任务开始前检查当前阶段和 guard；只修改 allowlist 内文件（新增范围需重新确认或触发风险升级）；先写最小实现和测试再扩大变更；同步更新规格（full-go-path）；外部命令记录结构化结果；记录每个任务的开始/完成/阻塞状态。
- 产物：源码、测试、规格变更；任务结果记录。
- 完成条件：全部任务有结果；没有越界修改；没有把测试跳过当作通过。
- 失败处理：guard 拒绝 → blocked + 稳定 reason code；取消 → 不产生虚假 completed；fast path 发现范围扩大 → T15 升级。
- 入口：自动转换；`/baf-workflow-implement`、`baf implement`、Tab。
- 模型路由：代码生成、工具调用 route。



#### N6 `verify` — 验证

- 前置条件：N5 任务全部结束；报告环境可用。
- 输入：implement 结果；baseline；source revision；route metadata。
- 要做的动作：运行 OpenSpec validate（full-go-path 或升级后）；运行 baseline 指定的 C 编译、测试、覆盖率、静态分析、格式检查；运行 secret scan 和 guard；fast path 必须运行回归测试；聚合结构化报告（绑定 baseline id/version、tool versions、workspace identity、source revision）；校验报告新鲜度。
- 产物：结构化 quality/guard/openspec 报告。
- 完成条件：全部必需检查通过且报告未过期。
- 失败处理：任一检查失败 → T11 回 implement；工具不可用 → `tool_unavailable` blocked；超时/取消可区分；依据变化 → T12 drift。质量通过不等于安全通过。
- 入口：自动转换；`/baf-workflow-verify`、`baf verify`、Tab。
- 模型路由：稳定、严谨、结构化报告分析 route；机器门禁结果优先于模型解释。



#### N7 `archive` — 归档

- 前置条件：N6 通过且无 drift；人工确认。
- 输入：verify 报告；change 全部产物。
- 要做的动作：展示变更摘要、验证结果和审计引用；请求人工确认；通过 OpenSpec adapter 原子归档（full-go-path）或写最终 Bug 记录（fast path）；写最终 projection 状态。
- 产物：archived change / 最终记录、摘要、最终 projection。
- 完成条件：归档原子完成，不能伪造成功。
- 失败处理：保持原 change 可恢复，不产生半归档状态；可重试且幂等。
- 入口：`/baf-workflow-archive`、Tab“确认归档”。
- 模型路由：低延迟、严格指令遵循 route；模型不能自行触发归档。



#### N8 `drift` — 漂移处理（横切）

- 触发：文件删除、分支变化、baseline 变化、报告过期、composition 变化、规格与 projection 冲突。
- 动作：标记受影响阶段为 `drifted`；要求重新验证（回 N6）或经用户重新确认；不静默修复。
- 说明：OpenSpec 文件始终是规格权威，projection 是可恢复索引；两者冲突时标记 drift。



#### 横切行为 `resume` / `abandon`

- `resume`：崩溃、重开 session、child 重启后，从最后一致阶段恢复，并恢复分类结果、裁剪理由、baseline lock 和 route 语义。**注意与 drift 复位的区别**：`resume` 是自动恢复（阶段不变），drift 之后的显式复位是**客户决策**（阶段可能回退），入口是 `/baf-workflow-resume`（第 19 章）；两者语义不能混用，也不能互相替代；
- `abandon`：任意 active change 经用户确认进入 `已放弃` 终态；保留全部产物与审计记录；不自动删除 OpenSpec change（用户选择保留或手工清理，选择被记录）。



### 5.4 约束分级

- 软约束：persona、system prompt、skill、示例和建议顺序——引导 Agent；
- 半硬约束：projection、阶段命令、前置条件、人工确认、drift 检查——违反时暂停；
- 硬约束：guard、路径 containment、secret scan、OpenSpec validate、C 质量门禁、签名验证、system trust——失败时拒绝继续。

模型只能触碰软约束；半硬约束由 domain service 执行；硬约束任何角色都不能关闭。

### 5.5 受控裁剪规则


| 裁剪                                              | 允许条件                         | 必须保留                                           |
| ----------------------------------------------- | ---------------------------- | ---------------------------------------------- |
| clarify 并入 open                                 | 小变更                          | 目标、边界、验收记录                                     |
| design 并入 plan                                  | 纯文案/单行配置                     | “为何不需要独立设计”的理由                                 |
| Bug fast path（clarify+design+plan+OpenSpec 全跳过） | 低风险 Bug + baseline 允许 + 用户确认 | change identity、根因、回归测试、implement、verify、guard |
| archive 延后                                      | 用户选择                         | change 保持 active，不谎称已归档                        |
| open / plan（full-go-path 内） / implement / verify     | 不可删除                         | 即使单任务也要有完成条件；无代码变更可 no-op 并记录                  |


轻量策略只能减少阶段文档，不得关闭硬门禁。第一期只实现 full-go-path、bug-fix-path 和上表合并规则，不实现任意自定义流程图。

### 5.6 阶段如何被驱动（自然语言 ≠ 转换）

每个阶段有两种合法驱动，禁止第三种：


| 驱动     | 谁发起                             | domain service 做什么                                         |
| ------ | ------------------------------- | ---------------------------------------------------------- |
| 显式命令   | `/baf-*`、`baf *`、Tab 按钮         | 校验前置 → `transition` → 可选启动带 phase route 的 agent turn → 写事件 |
| 受控阶段工具 | 模型调用 `baf_stage_*`（只读建议或「请求转换」） | 工具体只调用同一 `WorkflowService`；成功才改状态；失败返回 reason code         |


禁止：

- 仅凭模型自然语言「我已完成 design」推进阶段；
- 仅凭 prompt/skill 软约束当作门禁；
- 旁路 ToolGuard 的 filesystem/shell/MCP 写入（见 8.6、17.2）。

> **被确认门挡住时的唯一动作**：调用 `baf_gate_ask(gateId)` 弹 §22 注册表里的标准选项卡；选项由注册表决定，不得自创。详见 §22。

会话内连续对话仍可发生：用户在 clarify/design 阶段用自然语言回答问题；**写入产物与阶段完成判定**仍由 stage handler 在命令/工具路径上执行完成条件检查。

### 5.7 Session 事件与 workspace projection 双轨

- **权威审计（model-visible / resume）**：凡影响模型请求身份或阶段可见事实的事件，必须进入 dsh session log（`SessionEventMap` 声明合并，例如 `baf/route-resolved`、`baf/intake-confirmed`、`baf/stage-transition`）；满足「model-visible ⟺ logged」。
- **工作区可恢复索引**：`<workspace>/.baf/projection/` 是跨 session、跨机器的 change 状态索引，由同一 domain 事件派生，不是第二套权威。
- 冲突时：OpenSpec 文件 > session 已提交事实 > projection 索引；冲突标记 drift，不静默覆盖。

---



## 6. 多模型路由：复用 dsh 原生能力



### 6.1 dsh 已有的原生 contract

- workflow `agent()` options 支持 `provider`、`model`，由 workflow worker 转发到 host（`packages/workflow/workflow-worker-thread/src/{runtime,host}.ts`）；
- workflow metadata 的 phase 支持 `provider`、`model`（`packages/workflow/tool-workflow`、`.../meta.ts`）；
- child agent 继承当前 phase route，也可显式指定；
- session、resume、token meter 和 route pricing 已将 provider/model 作为正式请求身份和用量归因字段；
- 已有模型 catalog（`packages/api/session-controller/src/catalog.ts`）、默认模型服务（`packages/core/agent-default-model`）和 `session/model-unavailable` 错误。

BAF 不新建 LLM client、provider registry 或第二套模型切换协议。

### 6.2 BAF 的实现边界

1. dsh host 负责 provider 适配、请求发送、凭证、重试边界和底层 usage 记录；BAF 只负责企业 route policy、阶段映射和权限约束；
2. 企业发行配置提供允许的 provider/model 清单及能力标签，解析为独立、只读的 `EnterpriseRoutePolicy`；session 创建时连同 route profile 一起冻结，普通用户不能任意添加；
3. route 解析优先级固定为：**企业强制策略 → BAF route profile → 当前 workflow phase → 受策略约束的 session override → dsh 默认 route**；较高优先级只能收紧或覆盖较低优先级；resolver 必须显式接收企业策略，不能把 `source: enterprise` 仅当作 route profile 的别名；
4. phase route 只改变该阶段新启动的 model request，不改变 workflow identity、change identity、projection、baseline lock、session composition 或阶段状态；
5. child agent 默认继承 phase route；显式覆盖必须再次经过 allowed-model、能力和上下文兼容性检查；
6. provider/model 不可用、超时、限流或上下文不兼容时，只能切换到企业批准且能力兼容的 fallback；fallback 不存在或不合规时阻断并返回 `model_route_unavailable`、`model_route_incompatible` 或 `model_fallback_blocked`；
7. 每次实际请求记录 provider、model、route source、phase、fallback、时间、失败原因和 session/change identity；不得静默降级。

模型只负责生成建议、文档、代码和报告解释；阶段转换、OpenSpec validate、质量门禁、guard 和 archive 条件始终由 domain service/adapter 的机器结果决定。

### 6.3 阶段与模型能力映射


| 阶段          | 首选模型能力          | 路由目的                                 | 失败处理                                               |
| ----------- | --------------- | ------------------------------------ | -------------------------------------------------- |
| `intake`    | 低延迟、基础工具调用      | 快速分类和影响范围判断                          | 批准的轻量 fallback；无可用 route 则 `clarify-required` 人工兜底 |
| `open`      | 低延迟、基础工具调用      | 快速检查 workspace、Git 和 change identity | 批准的轻量 fallback；无可用 route 则阻断                       |
| `clarify`   | 低成本、长上下文整理      | 提取问题、边界、非目标和验收条件                     | 同等能力 fallback；不得跳过记录                               |
| `design`    | 高推理、长上下文、仓库分析   | 接口、数据流、错误路径和风险方案                     | 仅允许能力兼容 fallback；产物仍须人工/规则确认                       |
| `plan`      | 高推理、结构化输出       | 任务分解、文件范围、验证命令和回滚点                   | route 失败则暂停，不生成未验证的计划                              |
| `implement` | 代码生成、工具调用、上下文保持 | 按计划修改源码和测试                           | 不得因模型切换扩大允许文件范围                                    |
| `verify`    | 稳定、严谨、结构化报告分析   | 解释机器报告并识别未解决问题                       | 机器门禁优先；无合规 route 不能声称通过                            |
| `archive`   | 低延迟、严格指令遵循      | 展示摘要并请求归档确认                          | 归档条件由 domain service 判断                            |




### 6.4 模型切换的硬约束

- phase 切换时新请求使用新 phase route；已开始的请求不在中途切换；
- workflow projection、OpenSpec 文件、baseline lock 和报告有效性不因模型切换自动改变；
- resume 恢复原 phase、route source 和实际 provider/model（除非企业策略允许重新解析并留痕）；
- verify 报告记录实际 provider/model，但有效性由 source revision、baseline、规格和工具报告决定；
- token meter 按实际 routed provider/model 归因，审计同时保留首选和 fallback route；
- 普通用户可查看 route 状态（设置页、工作流 Tab），但只能在企业策略内选 session override。

---



## 7. 企业基线和适配器：具体规则放在哪里



### 7.1 企业基线是什么

企业维护、版本化、审批后发布的标准答案包，至少规定：OpenSpec 版本/CLI/模板/目录/validate 参数；Matt Pocock 规则正式来源；C 编译器、构建系统、测试框架、覆盖率和静态分析工具；覆盖率阈值、受保护路径、secret scan、Git 规则；bug-fix-path 许可策略；routeProfile；规则生效版本、兼容 BAF 版本和变更日期。

BAF 不能在七个插件里分别硬编码这些值。

### 7.2 最小 manifest 结构（schema 冻结后不允许第二种格式）

```yaml
schema: 1
baselineId: baf-baseline-c-2026.1
bafCompatibility:
  min: 0.1.0
  max: 0.x
workflow:
  default: go
  requireOpenSpec: true
  bugFixPath:
    allowed: true
    maxScope: small-local
    requireRegressionTest: true
routeProfile:
  default: <企业批准的默认 provider/model>
  allowed:
    - provider: <provider id>
      model: <model id>
      capabilities: [reasoning, coding, structured-output]
      fallbackGroup: <group id>
  phases:
    intake: { provider: <provider id>, model: <model id> }
    open: { provider: <provider id>, model: <model id> }
    clarify: { provider: <provider id>, model: <model id> }
    design: { provider: <provider id>, model: <model id> }
    plan: { provider: <provider id>, model: <model id> }
    implement: { provider: <provider id>, model: <model id> }
    verify: { provider: <provider id>, model: <model id> }
    archive: { provider: <provider id>, model: <model id> }
  fallbackPolicy:
    mode: approved-only
    groups: {}
openspec:
  cli: <冻结的可执行文件或 launcher>
  version: <精确版本或兼容范围>
  root: <项目相对路径>
  changeRoot: <change 相对路径>
  validate:
    args: [<固定参数>]
standard:
  mattPocockRulesRef: <企业规则/模板引用>
stack:
  language: c
  compiler: <企业指定编译器>
  build: <adapter id>
  test: <adapter id>
  coverage:
    required: true
    minimum: <企业阈值>
  analyzers: [<adapter id>]
guard:
  secretScan: required
  protectedPaths: [<workspace-relative paths>]
  requireHumanConfirmation: [scaffold, archive, abandon]
```

`routeProfile` 必须经过 schema、allowed-model 和企业策略校验。缺 route、首选 route 不兼容或无批准 fallback 时返回结构化错误，不回退到 dsh 任意默认模型。baseline 缺失/解析失败/版本不兼容/工具不可执行时返回 `baseline_unavailable`/`baseline_incompatible` 并阻断依赖阶段。

### 7.3 稳定 provider contract（`baf-core` 暴露）

```ts
interface OpenSpecAdapter {
  detect(ctx: AdapterContext): Promise<DetectResult>
  open(input: OpenInput): Promise<DomainResult<ChangeRef>>
  read(change: ChangeRef): Promise<DomainResult<ChangeState>>
  validate(change: ChangeRef): Promise<ValidationReport>
  archive(change: ChangeRef, signal: AbortSignal): Promise<DomainResult<ArchiveResult>>
}

interface StackAdapter {
  detect(ctx: AdapterContext): Promise<StackDetection>
  runQuality(input: QualityInput, signal: AbortSignal): Promise<QualityReport>
}

interface GuardPolicy {
  check(input: GuardInput, signal: AbortSignal): Promise<GuardReport>
}

interface WorkflowService {
  intake(input: IntakeInput): Promise<IntakeResult>
  status(input: WorkflowIdentity): Promise<WorkflowStatus>
  transition(input: TransitionInput): Promise<TransitionResult>
  resume(input: WorkflowIdentity): Promise<ResumeResult>
}
```

统一结果至少带：`status`、`diagnostics`、`artifacts`、`exitCode`（如适用）、`startedAt`、`finishedAt`、`baselineVersion`、`sourceEventSeq`。

projection 落盘位置和 change id 生成规则是 Phase 0 冻结项（推荐 `<workspace>/.baf/`，是否提交由企业 Git policy 决定）。

---



## 8. 插件详细职责和边界



### 8.1 `baf-core`

公共类型、版本、错误码、workspace identity、baseline loader、intake 规则引擎、domain service 注册、command adapter contract；对外提供 `status`/`version`/`doctor`/`help` 只读能力。不直接执行外部工具、不实现 UI、不复制 `UpdateService`。

### 8.2 `baf-workflow`

- change intake 分类确认、Bug 影响范围评估、full-go-path/bug-fix-path 策略选择；
- 5.2 转换表的执行、拒绝和审计；
- go 阶段枚举和允许转换表；
- 每阶段 route profile 解析、phase-level provider/model 传递和 fallback 选择；
- workflow projection 持久化；
- resume、drift detection、报告过期判断、风险升级（T15）；
- 当前 change 选择、abandon；
- 阶段 prompt/skill；
- `intake` 到 `archive` 的命令 handler。

分类必须先于阶段转换；分类结果、规则依据、用户确认和策略升级都写入 projection。Bug fast path 不绕过 guard：仍经过 change identity、受控 implement、verify 和质量/安全检查。route resolver 调用 dsh 原生 route contract，不直接调 LLM SDK；路由失败阻止需要模型产物的阶段。OpenSpec 文件是规格权威，projection 是可恢复索引；冲突标记 drift。

### 8.3 `baf-openspec`

OpenSpec CLI 探测、版本检查、change skeleton、需求/设计/计划文件读写、validate、archive adapter。本地运行，不联网，不自行下载工具。

### 8.4 `baf-standard`

加载 baseline 中的项目宪法、C 编码规则、接口和错误处理规则、日志/文档规则、分支提交要求和 Matt Pocock 轻量实践；输出供 prompt、plan 和 guard 使用的结构化规则摘要。

### 8.5 `baf-quality`

执行 baseline 指定的 C 编译、测试、覆盖率、格式和静态分析，生成统一报告：

```json
{
  "schema": 1,
  "baselineId": "...",
  "workspace": "...",
  "revision": "...",
  "toolVersions": {},
  "checks": [],
  "artifacts": [],
  "passed": false,
  "diagnostics": []
}
```

报告缺失、工具版本不匹配、超时、取消、退出码异常、阈值不足都必须是可区分的失败原因。

### 8.6 `baf-guard`

protected path 检查；path traversal 和 workspace escape 检查；危险 shell/强制 Git 阻断；secret scan；未完成流程阶段时阻断越权操作；未通过 verify 禁止 archive；system resource 覆盖阻断；人工确认点（archive、abandon、scaffold 覆盖）。`baf-guard` 必须通过 BAF agent 的 `agent.ctx` 调用现有 `ctx.tools.guard()` 注册单调 ToolGuard：它在全部 `tools/pre-execute` listener 之后、tool body 之前运行，对 filesystem、shell 及其他可修改 workspace 的 tool/action 分类并拒绝不合规调用；分类未确认时拒绝全部源码写入，进入 implement 后仍逐次校验 allowlist、阶段和 guard snapshot。不能只在 BAF 自有 stage handler 内检查，因为普通自然语言消息和既有工具入口同样必须受控。每次拒绝返回稳定 reason code：`intake_confirmation_required`、`protected_path`、`secret_detected`、`verify_required`、`system_resource_conflict`、`invalid_transition` 等。

**旁路面（测试必须覆盖）**：

- MCP 工具若可写文件系统，同样过 ToolGuard 或在 BAF composition 中禁用未分类 MCP；
- 子代理继承 initiator 的 guard/allowlist；显式扩大范围需重新确认或触发 T15；
- `tool-workflow` / `ralph` 不得作为跳过阶段或扩大 allowlist 的通道；
- shell 间接写入（重定向、脚本）按 shell 策略拒绝或要求 allowlist 内路径；
- listener 顺序不能 force-allow：`tools/pre-execute` 的 allow 不能覆盖随后的 monotonic guard。



### 8.7 `baf-scaffold`

初始化 OpenSpec、C 构建/测试骨架和 baseline 引用。先检查已有文件，默认不覆盖；覆盖需用户确认并使用可恢复备份或原子写入。

---



## 9. 命令设计



### 9.1 统一实现原则

slash command 复用 `@deepseek-ai/dsh-commands`（`CommandRuntime.register()`、`parseCommand()`、`CommandResult`、`command/run`/`command/done` lifecycle、cancellation/attachment/错误归一化）。`packages/boot/cmdline` 只处理 launcher flags。

`baf` **CLI 启动 contract（硬规则）**：

- dsh 禁止新增绕过 `dsh` launcher 的 Node 应用 bin（见 `docs/architecture.md` Application launch）；
- 允许形态 A：`dsh --profile baf-cli -- <subcommand>…`（推荐；profile + patch 挂载 BAF plugins，复用同一 Cordis 树）；
- 允许形态 B：安装器提供的 thin wrapper `baf.cmd`/`baf`，内部只 `exec` 到上述 `dsh --profile baf-cli`，不自建 Cordis 树、不直接 `node` 进业务包；
- CLI 拥有自己的 Commander tree 并通过 `parseCmdline(ctx, program)` 接入；**不复制** slash handler 业务逻辑；
- 禁止：`packages/*/package.json` 增加可执行 Node 入口冒充独立应用。



### 9.2 命令表

独立 CLI 使用 `baf <command>`；slash 形式 `/baf-<command>`（现有 command name 是单层名称）。


| 命令                        | 作用                                                         | 是否改变状态      |
| ------------------------- | ---------------------------------------------------------- | ----------- |
| `help`                    | 展示命令和规则说明                                                  | 否           |
| `version`                 | 展示 BAF、preset、baseline、dsh/runtime 版本                      | 否           |
| `status`                  | 展示 preset、Git、OpenSpec、workflow（含分类和当前阶段）、quality、guard 状态 | 否           |
| `doctor`                  | 诊断 composition、工具、目录、权限、配置和更新元数据                           | 否           |
| `docs`                    | 打开或输出企业文档和基线引用                                             | 否           |
| `init`                    | 初始化 BAF/OpenSpec/C 项目骨架（与 `/baf-scaffold` 同源；详见 §22）              | 是，需确认       |
| `open`                    | 新建或选择 change（先走 intake 分类）                                 | 是           |
| `classify`                | 对当前输入重新执行/查看 intake 分类                                     | 是（重分类需确认）   |
| `clarify`                 | 记录需求问题和决策                                                  | 是           |
| `design`                  | 创建/更新技术设计                                                  | 是           |
| `plan`                    | 创建任务计划和允许文件范围                                              | 是           |
| `implement`               | 执行或恢复实现阶段                                                  | 是           |
| `verify`                  | 运行所有必要检查                                                   | 写入报告        |
| `archive`                 | 归档已验证 change                                               | 是，需确认       |
| `abandon`                 | 放弃当前 active change                                         | 是，需确认       |
| `baf-workflow-*`           | 阶段单步驱动器（保留 §5.6 「命令 + 阶段工具」入口，便于脚本化复跑）           | 各阶段         |
| `baf-workflow-resume [节点]` | **drift 复位**：列出 T13 合法目标节点，客户交互式选点后回退并重跑；无参数时只列候选不猜；详见 §19      | drift       |
| `baf-go [描述]`            | **自动驱动**：无参数为主——把本 session 推进到下一个需要客户动作的点并重放待决卡片；停靠在确认门 / 待决 intake / 未初始化工作区时**重新弹出 §22.17 交互确认框**（无弹窗通道时退化为卡片，门上再敲一次 `baf-go` 即确认）；drift 时自动转 `/baf-workflow-resume`；带描述仅在「未绑定」时等价于直接说需求；详见 §18 / §22.17 | 各阶段 |
| `baf-go-confirm`           | **不弹确认框直接继续**：走确认门正路径（门 A 进 plan / 门 B 归档）、确认待决 intake、未初始化工作区直接 scaffold；drift 仍强制弹候选（§19 永不自动选点）；详见 §22.17 | 确认门 / intake / scaffold |
| `quality`                 | 运行或查看 C 质量检查                                               | 写入报告        |
| `guard`                   | 查看或运行策略门禁                                                  | 写入诊断        |
| `update check`            | 检查三类 scope 的签名 manifest 和本地兼容性                             | 否           |
| `update download [scope]` | 下载并校验指定 scope，不改变当前生效版本                                    | 否，受策略许可     |
| `update apply [scope]`    | 应用已下载更新；必要时重启 child 或交接 installer                          | 是，需策略许可     |
| `update rollback [scope]` | 回滚指定 scope 最近一次成功更新                                        | 是，需管理员/策略许可 |
| `update status`           | 展示三类 scope 当前版本和状态                                         | 否           |
| `git status`              | 展示本地 Git 信息                                                | 否           |


普通用户不能通过命令关闭官方 guard、降低质量阈值、修改 system preset、跳过 intake 分类或跳过签名验证。

---



## 10. 官方 preset、UI 和工作流 Tab



### 10.1 preset

新增 `packages/preset/agent-presets/presets/baf/{preset.yml,agent.cordis.yml,skills/**}`。metadata 固定 id `baf`、显示名 `BAF 模式`、固定 order（排在 standard 之后）。standard 保持 `default: standard`。

composition 从 standard 完整复制，替换 persona 为 BAF persona，追加 BAF plugin rows（见 12 章 Phase 1 具体写法）。workflow metadata 声明或引用企业 `routeProfile`；preset 不携带 provider 凭证或私有 endpoint。session 创建时冻结 preset composition、route profile 版本和 baseline lock。

### 10.2 preset roster UI（`packages/client/ui-agent-preset`）

- BAF 显示为“内置”；standard 继续显示默认；
- BAF 可选择、查看摘要；**不可复制、不可删除**、不显示打开官方目录；
- broken system BAF 保留在列表并显示修复/升级提示；
- default 改变只影响新 session；session 创建后 composition 固定；
- 创造模式在企业发行版默认隐藏（是否显示由发行配置决定，不删 dsh 通用实现）。



### 10.3 BAF 工作流 Tab（流程图页面）

BAF session 中新增专用工作流页面，是 workflow projection 的可视化 + 受控半交互入口，不自维护第二份状态。与设置/会话中的「轨迹图」（agent 执行轨迹）**无关**；设置里原「工作流」开关已改名为「轨迹图」。

**页面目标**：看到 change 类型、模式、当前阶段（流程图高亮）、已完成阶段及产物、当前阶段前置条件/任务/阻塞、未开始阶段、OpenSpec 状态、baseline/route/fallback 状态、drift/过期报告/待确认事项。

**可见性**：仅 `agentPreset === baf` 的 session 注册会话 Tab「工作流」；非 BAF session 不出现该 Tab。

**流程图展示**：直接渲染第 5.1 状态图（`WORKFLOW_GRAPH` + `TRANSITIONS` + `NODE_CATALOG` 由 `baf-core` 导出，UI 只渲染）。Host 组装 `WorkflowTabView` 下发给客户端。fast path 图中明确标注“未创建/未更新 OpenSpec（reason codes）”，不把被裁剪阶段伪装成已完成；升级 full-go-path 后追加缺失阶段且不清除已完成阶段。无 active change 时仍画完整模板图并显示空态引导。节点状态：

```text
locked / available / in-progress / completed / failed / blocked / drifted / skipped（skipped 必须显示裁剪理由）
```

键盘导航、颜色之外的状态表达、窄窗口和无障碍文本齐备。节点点击展示 5.3 对应的结构化详情。普通用户只能触发 domain 允许的动作；不能点节点跳阶段；不做拖拽编排。视觉跟随 `--dsw-*` 主题。

**Phase 4 半交互**：可「确认分类 / 补充信息 / 拒绝并退出」、查看详情、在前置满足时请求合法 `transition`。archive 确认、阶段「开始执行」等 Phase 5+ 动作展示但禁用并标注原因。没有“跳过 OpenSpec”类绕过按钮。

**Phase 8.11 确认门标准卡**（§22）：Tab 在「无活动变更 / 停靠确认门 / drift」三种状态下额外渲染 **pendingGate 门卡**（与 §18.11 drift 卡同款 `cardDrift` 模式），按 §22 注册表派生选项 + 按钮。点击走 `BafWorkflowTabRemote.gateResolve(gateId, optionId)` → 宿主按 option.command 派发**同名 slash drive**，与 slash 共源，无第二套逻辑。Intake 分类的现有按钮迁移到同一注册表渲染。

**数据和刷新**：Web 经 Typert Remote（`bafWorkflow` 视图 API）按 session `cwd` 读写统一 projection；Electron IPC（`baf:getWorkflowStatus` 等）留 Phase 8。客户端在打开/焦点/操作后刷新；页面显示 `sourceRevision`、baseline lock、projection version 和最后更新时间；无 active change、多 change 未选、baseline 缺失或 projection 损坏时显示明确空态/阻断态。

**实施边界**：UI 只做展示和交互适配；阶段判定、分类、OpenSpec、前置条件、裁剪、drift、门禁和模型路由全部由 `baf-workflow`/`baf-core` 负责。落地包：`packages/client/ui-baf-workflow/`（与 `ui-baf-desktop` 同层）。

---



## 11. 桌面打包、更新、签名和回滚



### 11.1 打包

修改 `overlay/scripts/{pack-dsh,pack-plugin,build-release}.mjs`、`overlay/plugin/README.md` 和 desktop resource preparation。要求：canonical BAF 进入 packaged dsh shipped root（不只是 `overlay/plugin/agent-presets`）；打包后用真实 roster 检查 `baf`、`trust: system`、composition health 和 `standard` default；plugin zip manifest 增加 schema、payload scope、逐文件 hash、preset schema、BAF version 和 system resource 声明；system/user payload 不同目标目录；user payload 不覆盖 system id。

### 11.2 Manifest schema and compatibility（`overlay/desktop/src/update/manifest.ts`）

```json
{
  "schema": 2,
  "channel": "stable",
  "tag": "baf-dsh-v...",
  "issuedAt": "2026-01-01T00:00:00Z",
  "expiresAt": "2026-02-01T00:00:00Z",
  "releaseEpoch": 1,
  "bafDsh": "...",
  "dsh": "...",
  "bafPlugin": "...",
  "bafPreset": "...",
  "baseline": "...",
  "presetSchema": 1,
  "compatibility": { "minDsh": "...", "maxDsh": "..." },
  "artifacts": { "plugin": {}, "runtime": {}, "shell": {} },
  "systemResources": ["presets/baf", "baseline/..."],
  "rollback": { "supported": true, "minimumVersion": "..." },
  "signature": { "algorithm": "ed25519", "keyId": "...", "asset": "manifest.sig" }
}
```

`update/plan.ts` 统一负责 channel、版本、兼容范围、minimum version、降级保护、signed `issuedAt`/`expiresAt`/`releaseEpoch` 和 system resource 声明检查。验签后才解释这些字段；生产以可信系统时钟校验有效期并允许发行配置给出有限 clock skew，时钟不可用/明显回拨时阻断 apply；离线包同样受有效期和单调 `releaseEpoch` 约束，除非管理员使用独立签名的离线例外策略，防止重放旧但签名有效的 manifest。

### 11.3 Manifest 签名和下载

`generate-manifest.mjs` 生成 canonical JSON、artifact SHA-256、逐文件 hash 和 Ed25519 signature；CI 私钥只来自 secret；`public-key.ts` 用正式公钥和 key id；生产强制签名（缺签名/错 key/签名不匹配/过期直接拒绝）；开发模式跳过必须显式配置且不进生产构建；`github.ts` 继续负责下载校验。

### 11.4 应用和回滚

复用 `overlay/desktop/src/update/apply.ts` 的 pending、`.next`、`.bak`、原子交换、停止 child、重启和 rollback。流程：下载 pending → 校验签名和 hash → 校验 scope/路径/system-user 目标 → 记录旧版本 → 停 child → 解压 `.next` + 完整性检查 → 原子交换 → 重启 child → 检查 roster/trust/composition/default → 任一步失败恢复 `.bak` 和旧版本 → 成功保存 manifest hash/channel/key id/rollback 来源。`baf:update`、桌面按钮和 CLI 复用 `UpdateService`。

### 11.5 三类更新的统一模型


| 更新 scope   | 更新内容                                           | 推荐分发方式                                                       | 是否重装桌面应用            | 默认策略                      |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------ | ------------------- | ------------------------- |
| `harness`  | dsh 源码、runtime、桌面壳和随壳核心资源                      | 官方签名 installer 或完整 runtime payload；Windows 优先现有 installer 路径 | installer 原地升级；不先卸载 | 后台检查；安全/兼容强制更新，普通更新提示后更新  |
| `baseline` | OpenSpec、Matt 规则/模板、C 工具链描述、版本和阈值              | 版本化 baseline bundle；baseline manager 安装到 managed 目录          | 不需要                 | 默认只检查和下载；安装/切换需确认或管理员策略   |
| `plugin`   | BAF 插件、preset、skills、workflow、system resources | 签名 system payload，原子替换 managed system root                   | 不需要，但需重启 dsh child  | 可后台下载；安全点提示并重启；强制兼容更新不得跳过 |


目录边界：

```text
harness installer/payload  →  Electron 安装目录或 packaged resources
plugin system payload      →  managed system root（只读挂载，不落 user root）
baseline bundle            →  managed baselines/<baselineId>/<version>/（激活指针原子切换）
user preset/plugin         →  ~/.dsh/...（只能作为 user trust）
```

baseline bundle 第一期只含签名的规则、模板、配置、版本约束、适配器配置、校验和来源声明；不含未经企业确认的第三方二进制。若企业决定分发工具二进制：每个工具是单独、签名、带平台/架构和 hash 的 managed tool artifact，独立目录安装，纳入权限、许可证、离线包和回滚测试。baseline 激活前完成 schema、签名、版本、工具探测和兼容检查；session 执行期间不改变已锁定的 baseline。

**推荐混合更新**：

1. harness 用签名 installer 覆盖安装（不先删除桌面应用；失败由 installer/desktop rollback 恢复；仅安装器损坏/目录不可写/企业要求全新安装时给人工修复指引）；
2. plugin 和可热替换 runtime 用 `UpdateService` 的下载、hash、签名、`.next`、`.bak`、原子交换和 child restart（不触碰用户复制品，不写 user root）；
3. 第三方工具链是企业 baseline 受控依赖：先检查版本是否满足，再按策略下载安装，安装后重新探测、校验、生成 baseline lock；项目执行中只允许下载不热替换；
4. 三类更新都先验证 manifest/schema、签名、hash、版本兼容、目标 scope 和降级规则；不越权写入另一类 scope。



### 11.6 版本、兼容性和更新状态

`AppVersions` 迁移为带 schema 的结构：

```ts
type InstalledVersions = {
  schema: 2
  harness: { desktop: string, dsh: string, runtime: string }
  plugin: { baf: string, presetSchema: number }
  baseline: { id: string, version: string, openspec: string, matt: string, stack: string }
}
```

`parseVersions()` 接受旧格式经显式 `migrateVersions()` 转换；不把旧 `bafPlugin` 猜成 baseline/tool 版本；迁移幂等、留备份标记、临时文件 + 原子 rename；`dsh` 版本始终从 packaged/source seed 读取（现有行为保持）；升级失败不以缓存版本冒充运行版本。

版本状态包含：安装版本和来源、target/manifest 版本和 hash、channel/keyId、routeProfile 版本和各 phase route/fallback 状态、每个 scope 状态（`current/available/downloading/ready/applying/restart_required/blocked/failed/rolled_back`）、最后检查/成功更新时间、失败原因和 rollback source、兼容矩阵、是否需管理员/人工确认、事务 id 和待完成 installer handoff。

更新计划按 scope 返回：

```ts
type UpdateScope = 'harness' | 'plugin' | 'baseline'
type UpdateAction = 'none' | 'download' | 'apply' | 'restart' | 'installer'

type ScopedUpdatePlan = {
  scope: UpdateScope
  action: UpdateAction
  currentVersion: string
  targetVersion: string
  required: boolean
  restartRequired: boolean
  reason: string
}
```

更新顺序和事务边界：校验 manifest（失败停在 `blocked`）→ 判断 harness 最低版本/强制安全/兼容范围 → harness installer handoff（记录状态安全退出，新版本恢复重查；installer 失败不删旧安装）→ 重读 source 版本 → plugin/baseline 分别下载到各自 pending 并离线校验 → 安全点应用 plugin（停/重启 child；child/roster/trust/composition 失败仅回滚 plugin）→ baseline 装新目录、探测后原子切 active pointer（失败保留旧）→ 多 scope 操作记录各自事务独立提交（后续失败不误回滚已验证 scope；兼容矩阵要求整体一致则标记 `blocked` 并恢复上一个兼容组合）→ 最后重跑 roster/composition/baseline compatibility/`doctor` 并写版本状态、审计和 rollback 来源。

依赖关系在 manifest 显式表达：`plugin`/`baseline` 不得要求尚未安装的 harness 版本；baseline 工具变更不影响已创建 session 的固定 baseline。

### 11.7 Splash 启动检查

splash 职责从“显示正在检查更新”明确为“启动前非阻塞更新探测 + 必要安全阻断”，决策在 main process，splash 只展示：

1. 读取本地版本、策略和上次检查缓存；
2. 后台请求签名 manifest，短超时可取消；网络失败不阻止普通启动；
3. 达到超时继续普通启动并标记 stale/error，不无限等待；
4. 检查结果按 scope 分开；
5. 普通 plugin/baseline 更新先启动主界面，完成后显示可关闭通知；
6. harness 强制更新/低于最低版本/签名完整性错误/核心不兼容时，在 child 启动前阻断对话框（“立即更新”或“退出/按企业策略修复”）；
7. installer 更新：splash 展示下载/交接状态，启动 installer 后安全退出，不删除自身；
8. plugin 更新：主界面确认后停 child、原子替换、重启 child，失败恢复旧版；
9. baseline 更新默认不在 splash 自动安装；
10. splash 不实现更新逻辑，只调 `UpdateService`。

`promptUpdateAfterReady()` 按 scope 和 `required` 分别处理，不再只看 `plan.force`。

### 11.8 设置中的版本和更新选项

三部分：**版本信息（只读）**：BAF Desktop/harness、dsh/runtime、plugin 和 preset schema、baseline id/version、route profile/phase route/实际 provider/model/fallback、OpenSpec/Matt 版本、C 工具链探测、channel/manifest 时间/最后检查和更新结果。

**用户可配置更新策略（受企业上限约束）**：自动检查（默认开）、检查频率（启动时/每日/手动，默认启动时 + 最长缓存间隔 + 退避）、后台下载（plugin 默认开、baseline 自动安装默认关）、空闲自动应用 plugin（默认关，提示重启）、channel（stable 默认；beta/offline 仅发行配置允许时可见）、企业更新源/代理/离线包（如允许）、route 清单内 session 默认模型选择、fallback 提示级别和手动重试。

**不可关闭策略**：签名校验、hash 和路径校验、system resource trust、最低 harness 版本和强制安全更新、兼容性检查、rollback 和审计、企业 channel/更新源/管理员审批。

按钮“立即检查/查看详情/下载/立即应用重启/查看历史/回滚（若允许）”全部调 `UpdateService`。修改设置只影响未来检查和普通更新。

### 11.9 更新命令

```text
baf update status | check | download [scope] | apply [scope] | rollback [scope]
```

slash 对应 `/baf-update-status` 等；scope 只能取 `harness`/`plugin`/`baseline`；未指定时按依赖顺序生成计划；`apply harness` 需 installer 时输出交接信息并安全退出。

---



## 12. 可落地详细实施计划：每一步怎么做

> **约定**：
>
> - 新包统一放 `packages/baf/<name>/`，命名 `@deepseek-ai/dsh-<name>`（与仓库现有 `packages/<scope>/<name>` 约定一致），每个包含 `src/`、`tests/`（`*.spec.ts`）、`package.json`、`tsconfig.json`、`tsdown.config.ts`（参照 `packages/core/agent-default-model` 结构）。落点争议见 3.9。
> - 每个步骤完成后立即跑该 package 的测试与 lint；每个 Phase 结束跑一次全量相关测试 + `baf doctor` 对应子集。触及 `packages/` 上游门禁时，按变更面跑 focused tests / `test:coverage` 相关包；非平凡变更同 PR 写 Agent Note（overlay 例外见 `overlay/AGENTS.md`，但 **packages/baf 不享受该例外**）。
> - 所有“企业待定值”用 `<enterprise-tbd>` 标记并集中登记在 `overlay/docs/baf/enterprise-inputs.md`，禁止猜测。**缺少企业输入不阻塞 Phase 0–4**；Phase 5+ 用 fixture baseline 跑通，真实阈值/工具在企业输入冻结后替换。
> - 每个 Phase 的验收是下一个 Phase 的准入条件（依赖链：能被发现 → 有骨架 → 通路由 → 有状态 → 走流程 → 走捷径 → 上门禁 → 见用户 → 谈分发 → 发布）。
> - **MVP 裁剪（见 17.4）**：对外可演示的最小完成线是 Phase 0–5 + Phase 7 的 ToolGuard + Phase 8 的 slash/`status`；fast-path、工作流 Tab、三 scope 签名更新可并行但可后置。
> - **工时量级（单人熟悉 dsh，仅供排期）**：Phase 0–1 ≈ 3–5 人日；2–4 ≈ 8–12；5 ≈ 10–15；6 ≈ 3–5；7 ≈ 8–12；8 ≈ 10–15；9 ≈ 10–20；10 ≈ 3–5。合计约 8–12 人周到 MVP，12–20 人周到企业可分发（含签名与打包 hardening）。



### Phase 0：冻结企业输入和公共 contract（不写业务代码）



#### 0.1 建立企业输入登记表

- 新建 `overlay/docs/baf/enterprise-inputs.md`：按第 15 章清单逐项列条目，每项含“字段、消费者、当前值（默认 `unavailable`）、决定人、冻结版本”。
- 新建 `overlay/docs/baf/error-codes.md`：冻结错误码清单（`tool_unavailable`、`openspec_unavailable`、`baseline_unavailable`、`baseline_incompatible`、`policy_missing`、`invalid_transition`、`intake_confirmation_required`、`protected_path`、`secret_detected`、`verify_required`、`system_resource_conflict`、`model_route_unavailable`、`model_route_incompatible`、`model_fallback_blocked`），每个含语义、载荷字段和触发场景。
- 新建 `overlay/docs/baf/compatibility-matrix.md`：dsh/BAF-plugin/baseline 版本兼容矩阵模板和 rollback minimum version 字段。



#### 0.2 冻结 schema 与 fixture

- 新建 `packages/baf/baf-core/schema/baseline.schema.yaml`（第 7.2 结构）与 `routeProfile` JSON Schema；schema 文件先于实现落地，作为 contract 冻结物。
- 新建 `overlay/plugin/standards/baf-baseline-c/baseline.yml` 示例 fixture（所有具体值 `<enterprise-tbd>`），并复制到 `packages/baf/baf-core/tests/fixtures/baseline/` 供单测使用。
- 冻结 projection 落盘决定：`<workspace>/.baf/projection/<changeId>.jsonl`（事件日志，append-only）+ `<workspace>/.baf/projection/index.json`；是否 gitignore 由企业 Git policy 决定，写入 enterprise-inputs。
- 冻结 change id 规则：`change-<yyyymmdd>-<slug>-<4 位随机>`，slug 限 `[a-z0-9-]`、长度 ≤ 32。



#### 0.3 确认 dsh 原生 route 边界

- 只读核查（写进 `overlay/docs/baf/route-notes.md`）：发行配置注入 allowed provider/model 的入口（settings/deployment config）；session override 的存储；child 继承语义；dsh 是否有原生 fallback（结论决定 BAF fallback 层的实现位置）；usage/审计字段。结论标注“复用点/缺口”，缺口进 Phase 3 任务。



#### 0.4 冻结更新模型决定

- 在 enterprise-inputs 中登记：channel 策略、Ed25519 key id 和公钥（用 `overlay/scripts/gen-update-keypair.mjs` 生成测试对，正式 key 由企业出）、rollback 保留窗口、管理员审批范围、`InstalledVersions` schema 2 字段映射。
- 验收：三份文档评审通过；schema 可被 `ajv`/`zod` 解析；fixture 循环校验通过。



### Phase 1：BAF 成为真正可发现的 system preset



#### 1.1 创建 preset 目录与 metadata

- 新建 `packages/preset/agent-presets/presets/baf/preset.yml`：

```yaml
name: BAF 模式
description: 企业级受控编码 Agent：intake 分类 + go 工作流 + OpenSpec + C 质量门禁 + 安全 guard。
order: 2
```



#### 1.2 创建 composition

- 新建 `packages/preset/agent-presets/presets/baf/agent.cordis.yml`：逐行复制 `presets/standard/agent.cordis.yml`，仅做三处修改：
  1. `persona` 行的 `text` 换成 BAF persona（“你是 BAF 企业编码 Agent，遵循 go 工作流：intake 分类 → open → clarify → design → plan → implement → verify → archive。阶段转换由 domain service 决定，你不能自行跳过或宣称完成……”）；
  2. 文件头注释改为 BAF 说明；
  3. 文件末尾追加 BAF domain group（Phase 2 起逐个填实；Phase 1 先留注释占位，避免引用不存在的包导致 broken）：

```yaml
# ── BAF domain（entry-local realm；桌面/CLI 经 session projection 读取状态）──
# Phase 2 起启用：
# - id: baf-domain
#   name: cordis:group
#   group: true
#   isolate:
#     bafCore: true
#   config:
#     - id: baf-core
#       name: '@deepseek-ai/dsh-baf-core'
#     - id: baf-workflow
#       name: '@deepseek-ai/dsh-baf-workflow'
#     - id: baf-openspec
#       name: '@deepseek-ai/dsh-baf-openspec'
#     - id: baf-standard
#       name: '@deepseek-ai/dsh-baf-standard'
#     - id: baf-quality
#       name: '@deepseek-ai/dsh-baf-quality'
#     - id: baf-guard
#       name: '@deepseek-ai/dsh-baf-guard'
#     - id: baf-scaffold
#       name: '@deepseek-ai/dsh-baf-scaffold'
```



#### 1.3 创建最小 skills

- 新建 `packages/preset/agent-presets/presets/baf/skills/baf-go/SKILL.md`（go 工作流总览：引用第 5 章节点定义，声明“阶段转换必须经 domain service”）；
- 新建 `skills/baf-c-guidance/SKILL.md`（C 规范入口，内容引用 baseline，不内嵌具体规则值）；
- 新建 `skills/baf-verification/SKILL.md`（verify 检查集合与报告解读指引）。



#### 1.4 roster 测试

- 新建 `packages/preset/agent-presets/tests/baf-roster.spec.ts`：断言 shipped roster 含 `baf`、`trust === 'system'`、`standard` 仍是 default、`baf` 排序在 standard 后、composition health 通过；
- 检查并更新 `tests/{display,shipped-root,composition-inventory}.spec.ts` 中按 preset 枚举的快照/断言；
- 新增 authoring 用例：**拒绝**复制官方 `baf`、删除 system `baf` 抛 `agent-preset/read-only`、user 目录名 `baf` 不 shadow shipped；roster 对 `baf` 输出 `copyable: false`。



#### 1.5 roster UI

- 更新 `packages/client/ui-agent-preset` 的 fixture/快照：BAF 显示“内置”、standard 显示默认；跑该包 e2e（`apps/web/tests/agent-preset-authoring.e2e.ts`、`apps/cli/tests/web-agent-presets.e2e.ts` 如有枚举断言则更新）。



#### 1.6 打包链路检查

- `overlay/scripts/pack-dsh.mjs` 打包后用真实 roster 复检 `baf` 存在、trust 正确（临时脚本或手工验证步骤写入脚本注释）。
- **验收**：开发模式 roster 可见 BAF 并能挂载真实 session；全部 preset 测试绿；standard 仍是默认。



### Phase 2：`baf-core` 骨架、baseline loader 和 adapter contract



#### 2.1 建包

- 新建 `packages/baf/baf-core/`（`package.json` 名 `@deepseek-ai/dsh-baf-core`，依赖 `zod`、`@deepseek-ai/dsh-agent-presets` 等按需）；同步在 workspace 依赖注册。



#### 2.2 公共类型

- `src/intake.ts`：`ChangeKind`、`WorkflowMode`、`AffectedScope`、`ChangeIntake`（5.3 N0 结构）；
- `src/workflow.ts`：`WORKFLOW_NODES`、`WorkflowNode`、`NodeStatus`、`TerminalState`、`TransitionRule` 与 5.2 转换表常量 `TRANSITIONS`（唯一权威，UI 与 domain 共用）、`WorkflowStatus`（含 change id、mode、当前节点、每节点状态、route 摘要、baseline lock、sourceRevision、projection version）；
- `src/events.ts`：projection 事件联合类型：

```ts
export type ProjectionEvent =
  | { type: 'intake-classified'; intake: ChangeIntake; at: string; seq: number }
  | { type: 'intake-confirmed'; by: 'user' | 'rule'; at: string; seq: number }
  | { type: 'stage-entered'; node: WorkflowNode; at: string; seq: number }
  | { type: 'stage-completed'; node: WorkflowNode; artifacts: string[]; at: string; seq: number }
  | { type: 'stage-failed'; node: WorkflowNode; reason: string; at: string; seq: number }
  | { type: 'drift-detected'; node: WorkflowNode; cause: string; at: string; seq: number }
  | { type: 'mode-upgraded'; from: 'bug-fix-path'; to: 'full-go-path'; cause: string; at: string; seq: number }
  | { type: 'change-archived'; at: string; seq: number }
  | { type: 'change-abandoned'; at: string; seq: number }
```

- `src/errors.ts`：错误码常量 + `BafError` 类（`code`、`message`、`details`）；
- `src/identity.ts`：workspace identity（root、Git branch/revision 探测接口）、change id 生成（Phase 0 冻结规则）；
- `src/result.ts`：`DomainResult<T>`（`status`、`diagnostics`、`artifacts`、`exitCode`、`startedAt`、`finishedAt`、`baselineVersion`、`sourceEventSeq`）。



#### 2.3 baseline loader

- `src/baseline.ts`：用 zod 实现 Phase 0 schema 的解析与校验；校验项：schema 版本、`bafCompatibility` 与当前 BAF 版本比对、`routeProfile.default` 在 `allowed` 内、每个 phase route 在 `allowed` 内、fallback group 存在且成员在 `allowed` 内、`bugFixPath.maxScope` 合法、openspec/stack/guard 字段完整；失败返回 `baseline_unavailable`/`baseline_incompatible`。
- `tests/baseline.spec.ts`：合法 fixture、缺字段、版本不兼容、route 不在 allowed、fallback group 缺失、fast path 策略非法各一例。



#### 2.4 adapter contract 与 stub

- `src/adapters.ts`：7.3 的四个 interface + `AdapterContext`；提供每个 adapter 的 `unavailable` 实现（全部返回结构化 `tool_unavailable`/`baseline_unavailable`），保证后续 Phase 在无真实工具时也能走通失败路径。



#### 2.5 启用 composition rows

- 打开 `presets/baf/agent.cordis.yml` 中 `baf-core` row（此时其余仍注释）；`mount.spec.ts` 增加 BAF 挂载用例（含 isolate realm 断言：无 root-realm 注册、重复挂载不冲突）。
- **验收**：`packages/baf/baf-core` 测试绿；BAF session 挂载后能注册 `baf-core` 服务；坏 baseline 被结构化拒绝。



### Phase 3：接通 dsh 原生模型路由



#### 3.1 route resolver

- 新建 `packages/baf/baf-workflow/src/route.ts`：

```ts
export interface RouteResolution {
  provider: string
  model: string
  source: 'enterprise' | 'route-profile' | 'phase' | 'session-override' | 'dsh-default'
  phase: WorkflowNode
  fallbackFrom?: { provider: string; model: string; reason: string }
}

// 解析顺序（只收紧不放宽）：
// enterprise policy → routeProfile.phases[phase] → session override（须在 allowed 内）→ dsh default
// 每步检查 allowed-list、capability 标签、上下文长度；失败查 fallbackGroup（approved-only）
export function resolveRoute(
  enterprisePolicy: EnterpriseRoutePolicy, // 发行配置提供，session 创建时冻结，独立于 baseline/profile
  profile: RouteProfile,            // session 创建时冻结
  phase: WorkflowNode,
  sessionOverride: ModelSelection | undefined,
  availability: ProviderAvailability, // 来自 dsh llm.listProviders/resolveModelInfo
): RouteResolution
```

- `tests/route.spec.ts`：覆盖 6.2 的 1–7 条边界（企业策略独立于 profile 且只能收紧、override 不在 allowed 被拒、fallback 不兼容被拒、无 fallback 返回 `model_fallback_blocked` 等）。



#### 3.2 phase route 传递

- **优先路径**：阶段启动 agent turn 时，经 session/agent 请求级 API 设置该 turn 的 `provider`/`model`（与 catalog / default-model 同源），不强制经过 dsh `workflow` 工具。
- **可选路径**：仅当该阶段需要子代理扇出时，把 `resolveRoute()` 结果写入 dsh `agentOptions.provider/model`（复用 `workflow-worker-thread` 转发）；phase metadata 从冻结的 `routeProfile.phases` 生成。
- 无论哪条路径，route 失败都阻断需要模型产物的阶段；不得静默落到企业策略外的默认模型。



#### 3.3 route 审计

- `src/route-audit.ts`：每次解析先向 dsh session log 追加 typed `baf/route-resolved` 事件，载荷为 `RouteAuditEntry { provider, model, source, phase, fallbackFrom, at, sessionId, changeId, failureReason? }`；这是重放模型请求身份和 fallback 原因的权威记录，满足“所有 model-visible 输入可由 session log 重建”。`<workspace>/.baf/audit/route.jsonl` 仅作为可选派生索引，由 session/projection 事件生成，不能成为唯一记录；token usage 归因沿用 dsh token-meter 原生记录，不重复计费。



#### 3.4 route 状态暴露

- `baf-core` 增加 `RouteStatusView`（routeProfile 版本、默认 route、各 phase 首选/实际 route、fallback 状态），供设置页、Tab、`baf status` 读取。
- **验收**：route 失败阻断阶段且错误码稳定；resume 保留 route 语义；换模型不能改变 projection/门禁结果。



### Phase 4：intake 分类器 + workflow projection + 状态查询 + Web 工作流 Tab



#### 4.1 建包与事件存储

- 在已有 `packages/baf/baf-workflow/` 实现 `src/projection.ts`：append-only 事件日志（单 writer queue + workspace/change lock；每次 append 携带 `expectedSeq`，在锁内重读尾部并 compare-and-swap，随后以临时文件 + fsync + atomic rename 提交；多进程不支持可靠文件锁的平台显式拒绝第二 writer，而不是退化为无锁写入）、`replay()` 从事件重建 `WorkflowStatus`、事件 schema 版本迁移、损坏文件诊断（单条损坏 → 停在该 seq 并报 `projection_corrupted`，不静默丢弃）。`index.json` 仅是由 change 日志重建的派生索引，与事件提交同一临界区更新；启动时若 revision/seq 不一致则重建，不能把 index 当权威。
- `tests/projection.spec.ts`：重放一致性、相同 event id 的幂等追加、stale `expectedSeq` 拒绝、同进程并发序列化、双 writer 冲突、事件已提交但 index 更新中断后的重建、损坏检测。



#### 4.2 转换执行器

- `src/transition.ts`：输入 `(current, target, evidence)`，按 `TRANSITIONS` 表和 5.2 条件裁决；表外 → `invalid_transition`；每次放行/拒绝都追加审计事件。



#### 4.3 intake 规则引擎

- `src/intake.ts`：`suggest()` 可用启发式（Phase 4）或模型（后续）产出候选分类；`review()` 用规则引擎复核；`decide()` 合成最终 `ChangeIntake` + `requiresUserConfirmation`；`confirm()` 接收用户确认写事件。
- 规则清单代码化：`cross-module`/`public-api`/数据格式/并发/安全/性能/集成 → 强制 full-go-path；`single-file`/`small-local` 且 baseline 允许且可写回归测试 → 允许 fast path；证据不足 → `clarify-required`。
- `tests/intake.spec.ts`：新需求、单文件低风险 Bug、跨模块 Bug、公共 API Bug、用户误报、低置信度、baseline 缺失各一例；断言“分类确认前 `implement` 转换被拒”。



#### 4.4 状态查询 service + Web Tab

- `src/workflow-service.ts`：`WorkflowService.intake/status/transition/resume`；`BafWorkflow` 暴露同一实现。
- `src/tab-view.ts` + Typert Remote：按 session `cwd` 组装 `WorkflowTabView`（含 `NODE_CATALOG` 详情与允许动作）。
- `packages/client/ui-baf-workflow/`：会话 Tab「工作流」（仅 BAF preset）；半交互；跟随主题的 SVG 流程图。
- `baf-core`：`NODE_CATALOG`、`WORKFLOW_GRAPH`。
- 暴露选型：**Web Typert Remote（不进 root realm 的 domain 逻辑仍在 isolate；Remote 为读投影/写确认的 Host 面）**；Electron IPC 留 Phase 8。记入 route-notes。
- **验收**：非法转换被拒；事件重放一致；分类未确认时无法进入 implement；BAF session 可见工作流 Tab 且与 projection 一致。



### Phase 5：full-go-path 全阶段实现



#### 5.1 open（`baf-openspec` 建包）

- 新建 `packages/baf/baf-workflow-openspec/`：`OpenSpecAdapter` 实现——`detect()`（探测 CLI 与版本，走受控执行器）、`open()`（创建 change skeleton 目录与初始文档，不覆盖已有）、`read()`、`validate()`、`archive()`（原子：临时目录 → 校验 → rename）。
- `baf-workflow/src/stages/open.ts`：探测 workspace/Git/baseline/OpenSpec；多 active change 强制选择；change id 生成；写 `stage-entered`。
- `tests/openspec.spec.ts`：用本地 OpenSpec CLI fixture（或 stub 执行器）覆盖 validate 成功/失败/不可用。



#### 5.2 clarify

- `src/stages/clarify.ts` + `skills/baf-go` 补 clarify 指引：产出 `openspec/<change>/clarify.md`（问题、决策含确认来源、非目标、验收条件）；完成校验：阻塞问题全部有答案或 `deferred` 标记 + 验收条件存在。



#### 5.3 design

- `src/stages/design.ts`：产出 `design.md`（引用实际文件/API、风险清单）；guard 预检查调 `baf-guard` stub（Phase 7 替换为真实实现）；完成校验：引用路径存在（抽样验证）。



#### 5.4 plan

- `src/stages/plan.ts`：产出 `plan.md` + 结构化 `plan.json`（任务数组：输入/输出/影响文件/验证命令/回滚点）+ `allowlist`（文件集合）+ guard snapshot；完成校验：每个任务有验证命令和影响文件。



#### 5.5 implement

- `src/stages/implement.ts`：按任务驱动 Agent 编辑（模型只产出编辑建议，写入经 dsh filesystem/shell 工具并受 allowlist 检查）；任务状态记录；取消处理；越界写 → blocked + `protected_path`/`scope_exceeded`。
- guard 检查点：每次文件写入前比对 allowlist。



#### 5.6 verify（骨架）

- `src/stages/verify.ts`：`CheckRunner` 聚合框架（注册 checks：openspec-validate 已接、quality/guard/secret 为占位接口）；报告聚合为 `verify-report.json`（含 source revision、baseline、tool versions、route metadata、新鲜度字段）；T11/T12 触发逻辑。



#### 5.7 archive

- `src/stages/archive.ts`：人工确认（复用 dsh 审批/ask-user 机制）→ `OpenSpecAdapter.archive()` 原子归档 → 写 `change-archived`；失败保持 active；幂等重试。



#### 5.8 resume/drift/abandon

- `src/drift.ts`：检测文件删除、branch/revision 变化、baseline 变化、报告过期（verify-report 的 revision ≠ 当前）、composition 变化；`src/abandon.ts`：确认后写 `change-abandoned`，保留产物。
- `tests/stages/*.spec.ts`：每阶段 happy path + 完成校验失败 + 非法进入。
- 打开 composition 中 `baf-openspec` row。
- **验收**：happy path `open → … → archive` 全链路（fixture 仓库）跑通；verify 失败回 implement；drift 标记正确；模型声明不推动转换。

> **Phase 5 完成记录（2026-09-09）**：5.1–5.8 全部落地（落点见文首「Phase 5 — 已完成明细」）；5.8 新增 `stages/drift.ts` 检测 5 类触发器（git revision 变化 / baseline id 变化 / baseline 内容变化 / verify-report 过期 / 已完成产物删除），`stages/abandon.ts` 提供 T16 `driveAbandon` 入口（显式确认 + 幂等）；`pipeline.driveVerifyStage` 落 T11（必需检查失败回 implement），`pipeline.driveDriftStage` 落 T12（写入 `drift-detected`），T13 由调用方经 `decideTransition` 裁决；新增 `baseline-locked` 投影事件 + fold 字段，让 drift 检测有不可变锚点。`tests/stages.spec.ts` 在原覆盖基础上新增 T11（openspec validate 失败回 implement）、drift（artifact 删除触发 + record=false）、abandon（无确认拒绝 + 幂等）三类用例。验收中「模型声明不推动转换」由 `WorkflowService.transition` 裁决保证。



### Phase 6：bug-fix-path 与风险升级

- `src/fastpath.ts`：仅当 projection 中 intake 为 `bug-fix + fast path + 已确认` 时允许 T5；open 阶段创建最小 Bug 记录（问题/根因/影响范围/回归测试占位）；implement 强制先写回归测试；verify 必跑回归测试；图中/报告中标注“未走 OpenSpec：reason codes”。
- `src/escalate.ts`：implement 中检测范围扩大（实际修改文件 ∉ allowlist、或发现公共 API/数据格式影响）→ 自动 T15 升级：写 `mode-upgraded` 事件、生成待补的 clarify/design/plan 阶段、要求补 OpenSpec change；原 identity 和审计保留。
- `tests/fastpath.spec.ts`：低风险 Bug 全链路、范围扩大升级、升级后补阶段、fast path 试图跳回归测试被拒。



### Phase 7：C quality、standard 和 guard 硬门禁



#### 7.1 `baf-quality` 建包

- 新建 `packages/baf/baf-check-quality/`：`StackAdapter`/`QualityRunner` 实现——从 baseline `stack` 读取编译器/构建/测试/覆盖率/分析器配置；每个 check 独立受控执行（超时、取消、退出码、stdout/stderr 截断脱敏）；产出 `QualityReport`（8.5 结构）。
- verify 的 `CheckRunner` 接入全部 quality checks + 阈值判定。



#### 7.2 `baf-standard` 建包

- 新建 `packages/baf/baf-standard/`：`StandardBaselineProvider` 加载 baseline `standard` 段，输出结构化规则摘要（供 prompt 注入、plan 校验、guard 引用）；不内嵌具体规则值。



#### 7.3 `baf-guard` 建包

- 新建 `packages/baf/baf-check-guard/`：protected path、workspace escape、path traversal、危险命令清单、secret scan（正则规则来自 baseline）、`invalid_transition`、`verify_required`、system_resource_conflict；通过 BAF agent 的 `agent.ctx` 注册现有 `ctx.tools.guard()` 单调 guard，覆盖所有 mutating filesystem/shell tool，而不只覆盖 stage handler。guard 从 projection 读取 intake 确认、当前阶段、allowlist 和 snapshot：确认前任何源码写入返回 `intake_confirmation_required`，implement 外或越界写入返回稳定策略错误；每次 tool body 前重新判定，listener 顺序不能 force-allow。补 `tests/tool-guard.spec.ts` 覆盖普通自然语言触发的工具调用、slash/CLI/Tab 旁路尝试、shell 间接写入、scope 隔离和 disposer/HMR 清理。
- 打开 composition 中 `baf-quality`/`baf-standard`/`baf-guard` rows。



#### 7.4 `baf-scaffold` 建包

- 新建 `packages/baf/baf-scaffold/`：`init` 命令实现（OpenSpec 目录、C 构建测试骨架、baseline 引用；不覆盖已有文件，覆盖需确认 + 备份）；打开对应 composition row。
- **验收**：verify 报告结构化且区分失败原因；任一门禁失败阻断 archive；guard 测试全绿。



### Phase 8：统一交互面——slash、CLI、desktop bridge 和工作流 Tab



#### 8.1 slash commands

- 新建 `packages/baf/baf-workflow/src/commands.ts`：用 `CommandRuntime.register()` 注册第 9.2 全部命令（`/baf-help`、`/baf-status`、`/baf-doctor`、`/baf-version`、`/baf-workflow-open`、`/baf-workflow-classify`、`/baf-workflow-clarify`、`/baf-workflow-design`、`/baf-workflow-plan`、`/baf-workflow-implement`、`/baf-workflow-verify`、`/baf-workflow-archive`、`/baf-workflow-abandon`、`/baf-check-quality`、`/baf-check-guard`、`/baf-update-*`）；每个 handler 只调 `WorkflowService`/`UpdateService`，统一错误码转 `CommandResult`。



#### 8.2 standalone CLI

- 按 9.1：新建 `baf-cli` profile（或 patch）+ 可选 thin wrapper；Commander tree，`parseCmdline(ctx, program)` 接入；命令表同 9.2；输出格式与 slash 一致（同一 formatters 模块）。
- 验收：`verify-application-entrypoints` 不因新增 Node 应用 bin 失败。



#### 8.3 desktop bridge

- `overlay/desktop/src/preload-desktop.ts` 增加 IPC：`baf:getWorkflowStatus`、`baf:confirmIntake`、`baf:getRouteStatus`、`baf:getUpdateState`；main process 转发到 domain service（经 api controller/projection），UI 不直接碰文件。



#### 8.4 工作流 Tab（Electron 补齐；Web 已在 Phase 4）

- Web Tab（`packages/client/ui-baf-workflow/`）与 Typert Remote 已在 Phase 4 落地；本步仅补 8.3 Electron IPC 到同一 `WorkflowTabView` / domain service，并做四入口一致性快照。
- 组件分层已存在：`WorkflowGraph`、`IntakeCard`、`NodeDetail`、`StatusStrip`、空态/阻断态；补 desktop 桥接测试与断线重连用例。



#### 8.5 一致性测试

- `tests/surface-parity.spec.ts`：同一 projection 状态下 slash/CLI/desktop/Tab 的 status 输出快照一致。
- **验收**：四入口同状态；Tab 无法触发转换表外操作。



#### 8.6 变更 Dashboard（归档总览；本 Phase 交付）

> 开发方案正文在此；**不进**用户帮助 site（`overlay/docs/help` / `overlay/site`）。

**目标**：在同一工作区列出全部变更（含 archived / abandoned），支持筛选、聚焦与只读导出；UI 不直接读写 projection 文件。

**先行（Phase 4 已落地）**：工作流 Tab 顶栏「变更总览」按钮 → 模态列出 `WorkflowTabView.changes`（无筛选/导出）。完整能力仍属本 Phase。

| 项 | 说明 |
| --- | --- |
| 入口 | 工作流 Tab 明确按钮（已有）；可选后续加 `/baf-changes` |
| 数据 | Typert Remote 读 projection index + 各 change 摘要；禁止 Browser 直读 `.baf/` |
| 列表列 | changeId、mode、current、updatedAt、archive 标记 |
| 筛选 | active / archived / abandoned；按 mode |
| 操作 | 聚焦到图（set focus）；只读打开产物路径提示；禁止未授权 transition |
| 导出 | JSON/CSV 摘要（可选，非 MVP 阻断） |
| 空态 | 引导「新建变更」/ intake |
| 验收 | 多变更夹杂 archived 时列表正确；聚焦切换后顶栏与图一致；与 `/baf-status` 焦点一致 |

落点建议：`packages/client/ui-baf-workflow/` 面板升级 + `baf-workflow` Remote `listChanges`（若现有 `getTabView` 不足）；desktop IPC 复用 8.3。

#### 8.x Phase 8 落地状态（baf-dsh 0.0.14）

> 落地 commit：Phase 8 主交付在 `3ab67a934f`；`cb814b7be2` 配套修 Windows `tar` `--force-local` 与 5 个 dsh client 包版本对齐 `0.1.5-alpha.1`，让 `pnpm run release:pack --family dsh` 走通。

- **8.1 slash 全集**：`packages/baf/baf-workflow/src/commands.ts` 注册 `/baf-help` `/baf-version` `/baf-status` `/baf-list` `/baf-doctor` + 11 个阶段/quality/guard 驱动器；handler 只委派 `command-drives.ts`，统一错误码走 `CommandResult`。
- **8.2 standalone CLI**：`packages/baf/baf-workflow/src/cmdline.ts`（subpath `./cmdline`）用 `commander` 构建 `baf` 树，所有 subcommand 与 slash 一一对应；handler 同样只委派 `command-drives.ts`。启用方式：`dsh --from-default-profile baf --patch packages/baf/baf-workflow/overlays/baf-cli.cordis.patch.yml -- <subcommand>`（**无新增 bin**，`verify-application-entrypoints` 仍绿）。
- **8.3 desktop bridge**：Typert Remote `bafWorkflowView` 经 `packages/api/remotes` 走 api-gateway；desktop-host child process 已在 Phase 4–7 提供 framed-byte IPC。Phase 8.6 的 `listChanges` 是同一管线的新方法。
- **8.4 工作流 Tab（Electron）**：Web Tab（`ui-baf-workflow`）+ Typert Remote（`BafWorkflowTabRemote`）已在 Phase 4 落地；Phase 8 仅补 8.6 listChanges。
- **8.5 一致性测试**：`packages/baf/baf-workflow/tests/surface-parity.spec.ts` 锁住 slash / CLI / Remote / drives 四入口的命名一致性（5/5 用例绿）。
- **8.6 变更 Dashboard**：`BafWorkflowTabRemote.listChanges`（`packages/client/ui-baf-workflow/src/index.ts`）读 projection index，typert 边界类型 `BafWorkflowChangeRow` 在 `types.ts` 自有（避免 root-realm 类型穿越）。UI 表/筛选/导出后置；MVP 仅暴露 Remote 方法。
- **桌面 0.0.14 出包**：`overlay/desktop/dist/win-unpacked/baf-dsh.exe`（≈ 205 MB，`ProductVersion 0.0.14.0`）；7 个 `dsh-baf-*` 包版本 `0.1.5-alpha.1`；`cmdline.js`（140.58 kB）与 `BafWorkflowChangeRow` 边界已在 unpacked `resources/dsh/node_modules` 内可见。`baf-product-versions.json` 嵌入 bafDsh / dsh / bafCore / bafWorkflow / bafOpenspec 五项版本。

#### 8.7 `baf-go` 自动驱动 + 强制确认 + 单会话单工作流（落点：Phase 8.7）

> 不再增 `baf` CLI bin；只在 `commands.ts` / `cmdline.ts` 加 `/baf-go` 与 `baf go` 两条新入口，把 §18 的路由 + 强制确认门 + 单会话约束复用现有 drive 链。`baf-workflow-*` 与 `baf-check-*` 全保留。
>
> **形态定调（§18.2）**：`/baf-go` **无参数**是主用法——「把本 session 推进到下一个需要客户动作的点，并重放那张卡片」；需求一律用自然语言说（启动门 → intake → 分类卡），不存在 `baf-go + 需求` 这个主路径，也不存在 `baf-go confirm` 子命令（门上再敲一次 `baf-go` 即确认）。（2026-09-20 §22.17 修订后半句：`/baf-go` 在门上改为**重弹交互确认框**，另增 `/baf-go-confirm` 不弹框直接继续。）

- 8.7.1 新增 `packages/baf/baf-workflow/src/go-coordinator.ts`：`driveGo(cwd, rawInput, ctx?)` 读 projection + session 焦点，按 §18.4 路由表派发；返回结构与现有 drive 同形（`CommandResult`），命令报告卡走同一 `formatCommandReport`（§20.2）；**不写新 drive 函数，只组合现有 drive**。
- 8.7.2 路由表实现：状态机是单一权威——`projection.status.current` 决定下一个 drive；fast-path 与 full-go-path 在同一表内分支；T15 升级后**不换 session**，coordinator 按 `clarify` 继续走 full-go-path 链（§18.4.2）；状态非法 / 无绑定走 §18.7 错误卡。
- 8.7.3 两个强制确认门：N3 design 完成（`completeDocStage('design')` 返回成功）→ 卡住、打印「设计已实现，请客户确认是否进入 plan」；N7 archive 之前（`pipeline.driveArchiveStage` 前的 `enterStage('archive')` 路径）→ 卡住、打印「verify 已通过，请客户确认是否归档」。**解锁方式统一为「客户再敲一次 `/baf-go`」**；卡片副标题明确 `awaiting_customer_confirm`。
- 8.7.4 单会话单工作流守卫：session 焦点缓存到 `BafWorkflow.bindWorkspace(cwd)` 旁路（**不写 projection**）；客户在已有 active change 的 session 里说另一个需求 → 返回「请新开一个 session」卡，不在原 session 跨变更；`>= 2` active change 时必须客户显式选一条，不自动猜。
- 8.7.5 slash 与 CLI 接入：`/baf-go`（无参数）和 `baf go`；与 `/baf-workflow-*` 完全平行注册；help 文本把 `baf-go` 标为「推进当前工作流 · 单条命令」。
- 8.7.6 一致性测试：`tests/surface-parity.spec.ts` 扩 `baf-go` 行——slash / CLI / Remote 三入口读同一 coordinator，输出 bit-identical；加 §18.4 路由表每条边的快照。
- 8.7.7 工作流 Tab 适配：「工作流」Tab 在确认门状态下高亮当前节点为 `awaiting_customer_confirm` 并把对应驱动按钮改为「确认进入下一阶段」；T15 升级时切到**双泳道视图**（§18.4.3）。
- 8.7.8 桌面分发：随下一个 `baf-dsh` 出包携带 `go-coordinator.ts`；无新依赖、无新 bin、`verify-application-entrypoints` 与 `baf-roster.spec.ts` 仍绿。
- **验收**：新 session 启动门报告「无未完成工作流」→ 客户直接说需求 → 分类卡弹出；确认后一次走到 N3 design 完成卡住；客户 `/baf-go` 后继续到 N6 verify；N7 archive 前再次卡住；客户 `/baf-go` 后归档；同 session 再说另一个需求必须返回「请新开 session」；dashboard 行显示 `awaiting_customer_confirm` 标记。

**Phase 8.7 落地实况（2026-09-17）**

| 子项 | 状态 | 落点 / 证据 |
| --- | --- | --- |
| 8.7.1 coordinator | 已完成 | `packages/baf/baf-workflow/src/go-coordinator.ts`：`driveGo(input)` 是**纯路由器**——`route()` 按 `status.current` × `status.mode` 派发到既有 drive / `pipeline` 方法，自身不拥有任何 transition |
| 8.7.2 路由表 | 已完成 | §18.4.2 每行都有对应用例（`open` 两分支由 `reachDesign` / `reachImplement` 夹具覆盖，`drift` 行在 drift handoff 组）；细节见 §18.9 |
| 8.7.3 两个确认门 | 已完成 | `gateUnlocked()` / `parkOnGate()`；两张卡的标题与 §18.5 逐字一致（含 `awaiting_customer_confirm` 标记），由 `tests/go.spec.ts` 的「names both gate cards with the awaiting_customer_confirm marker」逐字断言 |
| 8.7.4 单会话单工作流守卫 | 已完成 | `src/session-focus.ts`：`focusFor(cwd)` 按 workspace root 键控的进程内缓存（**不写 projection**）；`resolveBinding()` 六步判定，五种拒绝卡见 §18.9 |
| 8.7.5 slash / CLI 接入 | 已完成 | `commands.ts` 注册 `/baf-go`（与其它 slash 同层、非 isolate）；`cmdline.ts` 新增 `baf go` subcommand + doctor 行 + 两份 help 文本首行 |
| 8.7.6 一致性测试 | 已完成 | `tests/surface-parity.spec.ts` 增 `baf-go` 行与 `go` 的「第三类入口」说明；`tests/cmdline.spec.ts` 子命令名单增 `go`；`npx vitest run packages/baf` → 22 文件 / 166 用例全绿（含 8.8 新增，见 §18.10） |
| 8.7.7 工作流 Tab 适配 | **未完成** | 确认门节点高亮、`awaiting_customer_confirm` 配色与「确认进入下一阶段」按钮、双泳道视图（§18.4.3）均未实现——与 §19.5 的 Tab 复位按钮同批做，属于纯 UI 层，不阻塞命令行主路径 |
| 8.7.8 桌面分发 | 待下次出包 | 无新依赖、无新 bin（未动 `package.json` 的 `bin` 字段）；`verify-application-entrypoints` 不受影响 |

#### 8.8 会话启动门 + 必须工具链体检 + BAF 欢迎语（落点：Phase 8.8）

> 需求：**BAF 模式必须依托工作流才能落代码**——所以会话一打开就要先定「这条 session 绑哪条工作流」，同时把必须工具链体检一遍、打印成欢迎语。硬门禁其实**已经存在**（`baf-guard` 的 `adjudicateFsWrite` 在 `!state.active` 时直接 `deny('intake_confirmation_required', 'no active change: …')`），本 Phase 只补「让客户看得见、知道该干什么」这一层 UX，不新增门禁。

- 8.8.1 新增 `packages/baf/baf-workflow/src/session-gate.ts`：导出 `probeToolchain(cwd)`（只读探测，返回每项 `ok/state/hint`）与 `renderWelcomeCard(binding, probe)`。挂载行 `baf-session-gate`（非 isolate，同 `baf-guard-install` 模式，`inject: ['agents']`，`agent/created` 时对每个 agent 装一次），落在 `packages/preset/agent-presets/presets/baf/agent.cordis.yml`。
- 8.8.2 绑定判定：读 `ProjectionStore.readIndex()` 数 `current ∉ {completed, abandoned}` 的 change；`0 / 1 / >=2` 三种分支按 §18.3.1 出卡；客户选「继续」时把 changeId 写入 session 焦点缓存（`BafWorkflow` 旁路，**不写 projection**），选「新开」时置空焦点。
- 8.8.3 工具链体检：抽取 `baf-doctor`（`commands.ts` / `command-drives.ts` 既有探测）里的探测逻辑成共享函数，`probeToolchain` 与 `baf-doctor` 共用一份实现；检查项见 §18.3.2（workspace / baseline / Git / OpenSpec / C 工具链 / guard+quality / 版本）。逐项超时（建议 1.5s）降级为「未探测」，**不阻断会话打开**。
- 8.8.4 欢迎卡渲染走 §20.3 模板（首行结论 + `【环境体检】` + `【本会话绑定】` + `【可用指令】`）；缺件行用 `✗` + 一行安装引导；齐备行用 `✓`。
- 8.8.5 测试：三绑定分支、体检缺件不阻断、超时降级、继续型会话（已有 active change）重跑体检、焦点缓存不落 projection。
- **验收**：新 session 首屏出欢迎卡；工作区已有未完成 change 时出「继续 / 新开」选择卡；删掉 `openspec/` 时体检行变 `✗` 且给安装引导；未选绑定直接让模型改代码 → guard 拒绝且 reason code 稳定。

**Phase 8.8 落地实况（2026-09-17）**

| 子项 | 状态 | 落点 / 证据 |
| --- | --- | --- |
| 8.8.1 gate row | 已完成 | `packages/baf/baf-workflow/src/session-gate.ts`：`apply()` 对每个 agent 装一次（`agents.list()` 补装已存在的 + `agent/created` / `agent/disposed`）；preset 行 `baf-session-gate` 落在 `agent.cordis.yml` 的 `baf-commands` **之后**；`package.json` `exports` 与 `tsdown.config.ts` 各加一个入口（第四入口）。细节见 §18.10 |
| 8.8.2 绑定判定 | 已完成（口径微调） | `resolveStartupBinding(cwd)` 读 `ProjectionStore.readIndex()` + 复用 `isActiveChange()`——与 `baf-go` 同一个谓词，不另写一份「什么算未完成」；`0 / 1 / ≥2` 三分支按 §18.3.1 出卡。**卡是只读的**：不替客户落绑定，改由卡片【下一步】印出 `/baf-go continue`（或 `/baf-go change=<id>`），绑定仍走 §18.6 `resolveBinding`（§18.10-2） |
| 8.8.3 工具链体检 | 已完成 | `probeToolchain(cwd, options)`：七项 = workspace / baseline / Git / OpenSpec / C / guard+quality / 版本；逐项预算 1.5s，超时记 `?` 并把仍能拿到的判定照常显示；`/baf-doctor` 与启动卡共用 `renderProbeLines()`，两处不可能不一致 |
| 8.8.4 欢迎卡渲染 | 已完成 | §20.3 骨架：首行结论（`BAF 模式已就绪 · <目录> · 无未完成工作流 / 检测到未完成工作流 <id>（当前 N<k>）· 继续还是新开？`）+【环境体检】+【本会话绑定】+【下一步】+【可用指令】+【版本】；缺件 `✗` + `↳ 引导` 行，未探测 `?`，`info` 行不带符号 |
| 8.8.5 测试 | 已完成 | `tests/session-gate.spec.ts` **18 例**：探针七项不抛 / 目录不存在降级为 `✗` / guard+quality 未挂载点名 / **C 工具链首屏不 spawn**（§21.4）/ TTL 内复用同一次探针 / 符号逐态渲染 / **挂住的外部命令降级为 `?`**（真写一个 `openspec.cmd` 存根挂住 PATH）/ 三分支 + 已归档不计入 / 全缺件仍出可用卡 / §20.4 日志行只含元数据且不泄露变更内容 / 模型侧 section 先报「进行中」再报事实 / 卡片投递方式（执行 `/baf-welcome`，缺失时只记日志）/ **命令层抛异常也出卡** / 每 agent 一段 section + 挂载标志读取 |
| 验收项状态 | 已由测试固定 | 「首屏出卡」「三分支」「缺件不阻断」「超时降级」「不替客户选」都有逐字断言（含「卡片里绝不出现凭空绑定」与「焦点缓存不落 projection」）。**未覆盖**：真正的桌面首屏观感——要出包后在 GUI 里看，与 §8.7.8 同批；guard 的拒绝 reason code 是 Phase 0 既有能力，本 Phase 未改一行 guard |

#### 8.9 `/baf-workflow-resume`：drift 交互式复位（落点：Phase 8.9）

> **这是当前仓库的真实能力缺口**：`stages/drift.ts` 把 `drift-detected` 写进 projection、`WorkflowService.transition()` 在 T13 上允许 `drift → 最早受影响节点`，但**没有任何 slash / CLI / Tab 入口暴露 T13**；`stages/pipeline.ts:480` 的 `{@link driveResumeStage}` 是一个指向不存在方法的失效引用。客户一旦 drift，UI 上无路可走。本 Phase 补这条出口。

- 8.9.1 `stages/pipeline.ts` 新增公开方法 `driveResumeStage(changeId, target, evidence?)`：调 `WorkflowService.transition({from:'drift', to:target, evidence})` 并落 `stage-entered`；同时改正 480 行的失效 JSDoc 引用。目标集必须由 `earliestAffectedNode()` 裁定为候选，客户只能选候选内节点。
- 8.9.2 `command-drives.ts` 新增 `driveResume`：先 `pipeline.driveDriftStage(changeId, …, {record:false})` 做只读检测 → 无信号则返回「当前无漂移」卡（不写事件）→ 有信号则渲染候选卡；带 `<节点>` 参数时校验 ∈ 候选集，否则 `invalid_transition`。
- 8.9.3 `commands.ts` 注册 `/baf-workflow-resume`，`cmdline.ts` 注册 `baf workflow-resume`，两入口共用 `driveResume`；`tier` 前缀沿用 2026-09-14 既有约定。
- 8.9.4 Tab：drift 节点加「复位到…」按钮 + 候选下拉；选中后调 `BafWorkflowTabRemote.resume(node)`。
- 8.9.5 测试：候选集计算（五类 drift 触发器 → 目标节点）、非法目标 `invalid_transition`、幂等（已在目标节点时不重复写）、无 drift 时 no-op（`projectionVersion` 不变）、复位后 `drifted` 标注不回滚已完成节点。
- **验收**：`git checkout` 到别的 revision 触发 `git-revision-changed` 后，`/baf-workflow-resume` 列出 `verify` 候选；选 `verify` 后 `current === 'verify'` 且 `nodes.verify === 'in-progress'`；`/baf-go` 在 drift 状态下自动渲染同一张候选卡且**不自动选点**。

#### 8.10 输出规范落地（落点：Phase 8.10）

- 8.10.1 `command-format.ts` 增语义化封装 `cardTitle(kind, …)` / `statusLine(status)`（§20.1 L1/L2），把 §20.2 的固定 section 顺序与 §20.5 的符号语义固化在代码里，而非散在各 drive 的字符串拼接里。
- 8.10.2 全量替换 `/baf-*`、`baf *`、Remote 的文案输出走 §20.2 骨架；新增 §20.4 的结构化日志行 `[baf] <iso> <changeId> <node> <event> key=value…`（只打元数据，不打内容）。
- 8.10.3 i18n：按 §20.7 冻结的 key 清单登记到 `packages/client/ui-baf-workflow` 字典；`verify-client-ui-i18n` 必须绿。
- **验收**：所有 `baf-*` 输出首行可折叠读；确认门卡片首行含动作词；日志行无内容/无凭证；i18n 门禁绿。

### Phase 9：桌面打包、三 scope 更新、签名和回滚



#### 9.1 版本 schema 迁移

- `overlay/desktop/src/versions.ts`：实现 `InstalledVersions`（schema 2）+ `migrateVersions()`（旧三字段 → 新结构；旧 `bafPlugin` 只映射到 `plugin.baf`，baseline 字段置 `unknown`）；写入用临时文件 + rename；`dsh` 永远取 seed（保持现有行为）；`tests/versions-migrate.spec.ts`：旧格式、幂等、损坏文件。



#### 9.2 manifest schema 2

- `overlay/desktop/src/update/manifest.ts`：parser 扩展（11.2 字段、signed `issuedAt`/`expiresAt`/`releaseEpoch`、signature 块、systemResources、rollback）；缺字段/坏类型拒绝；定义可信时钟、允许 clock skew、时钟回拨与离线包例外策略。



#### 9.3 签名链

- `overlay/scripts/generate-manifest.mjs`：canonical JSON + artifact SHA-256 + 逐文件 hash + Ed25519 签名（`manifest.sig`）；`public-key.ts` 换正式 key/keyId（测试 key 标注不进生产）；生产强制校验，开发跳过须显式 env。
- `tests/manifest-sign.spec.ts`：缺签名、错 key、篡改、过期、降级各拒。



#### 9.4 scoped plan

- `overlay/desktop/src/update/plan.ts`：`buildUpdatePlan()` 返回 `ScopedUpdatePlan[]`（11.6 结构）；`service.ts` 按 11.6 顺序协调；`apply.ts` 拆 per-scope apply/rollback（plugin：pending→`.next`→原子交换→child restart→roster/trust/composition 复检→失败仅回滚 plugin；baseline：装 `managed baselines/<id>/<v>/` → 探测 → 原子切 active pointer；harness：installer handoff，记录状态安全退出）。
- `tests/apply-scoped.spec.ts`：多 scope 事务、单 scope 失败不误回滚他 scope、installer handoff 状态。



#### 9.5 splash 与设置

- `overlay/desktop/src/main.ts`：splash 按 11.7 十条实现（按 scope 展示、超时放行、强制阻断、installer 交接）；`promptUpdateAfterReady()` 改按 scope+required。
- 设置页三区（11.8）：只读版本区、策略区（受企业上限）、操作区；新增 route/baseline 状态展示。



#### 9.6 命令接入

- `baf update status|check|download|apply|rollback` 与 `/baf-update-*` 接 `UpdateService`。



#### 9.7 打包与分发

- `pack-plugin.mjs`：plugin zip manifest 增加 schema、payload scope、逐文件 hash、preset schema、BAF version、systemResources 声明；system/user payload 目标分离；zip 路径校验（拒 `..`/绝对路径/symlink 逃逸）。
- `pack-dsh.mjs`/`build-release.mjs`：canonical BAF 进 shipped root；打包后 roster 复检脚本化。
- **验收**：11.6 全部事务边界测试绿；离线/超时/强制更新/installer 退出/plugin 回滚各有确定行为。



### Phase 10：发布门禁和后续扩展

- `.github/workflows/baf-dsh-release.yml` 增加门禁：BAF 存在、system trust、standard default、composition health、plugin/preset/runtime/baseline 版本一致、manifest schema、hash 和签名、打包后真实启动、rollback smoke test、artifact completeness。
- 后续按 provider contract 开发 `baf-integrate`（GitLab/Jira/远程 Git）、`baf-stack`（Python）、`baf-knowledge`、`baf-observe`，不改变 core workflow contract。

---



## 13. 文件实施清单



### 新增

- `packages/preset/agent-presets/presets/baf/{preset.yml,agent.cordis.yml,skills/**}`；
- `packages/baf/baf-core/`、`packages/baf/baf-workflow/`、`packages/baf/baf-workflow-openspec/`、`packages/baf/baf-standard/`、`packages/baf/baf-check-quality/`、`packages/baf/baf-check-guard/`、`packages/baf/baf-scaffold/`（各含 `src/`、`tests/`）；
- `packages/client/ui-baf-workflow/`（工作流 Tab）；
- `packages/baf/baf-workflow/src/{go-coordinator.ts,session-gate.ts}`（Phase 8.7 / 8.8：自动驱动协调器 + 会话启动门与工具链体检）；
- `overlay/docs/baf/{enterprise-inputs,error-codes,compatibility-matrix,route-notes}.md`；
- `overlay/plugin/standards/baf-baseline-c/`（baseline fixture）；
- baseline/workflow/quality/guard/manifest/signature 各类 fixture 与 spec。



### 修改

- `packages/preset/agent-presets/tests/{display,shipped-root,composition-inventory,authoring}.spec.ts`（BAF roster 断言）+ 新增 `tests/baf-roster.spec.ts`；
- `packages/client/ui-agent-preset` 快照与 e2e（`apps/web/tests/agent-preset-authoring.e2e.ts`、`apps/cli/tests/web-agent-presets.e2e.ts`）；
- `overlay/desktop/src/versions.ts`（schema 2 迁移）；
- `overlay/desktop/src/update/{manifest,github,public-key,plan,apply,service}.ts`（schema 2、签名、scoped plan/apply）；
- `overlay/desktop/src/{main.ts,preload-desktop.ts}`（splash、IPC）；
- `overlay/scripts/{pack-plugin,pack-dsh,generate-manifest,build-release}.mjs`；
- `packages/baf/baf-workflow/src/{commands.ts,cmdline.ts,command-drives.ts,command-format.ts,stages/pipeline.ts,index.ts}`（Phase 8.7–8.10：`/baf-go`、`/baf-workflow-resume`、输出规范、`driveResumeStage`）；
- `packages/preset/agent-presets/presets/baf/agent.cordis.yml`（新增 `baf-session-gate` row）+ `skills/baf-go/SKILL.md`（补「说需求 → 分类卡 → baf-go 推进」的入口语义）；
- `packages/client/ui-baf-workflow/`（确认门节点态、双泳道视图、复位按钮、i18n 字典）；
- `overlay/docs/baf/error-codes.md`（仅在决定为「未绑定工作流」单列 `workflow_binding_required` 时改；否则复用 `intake_confirmation_required`）；
- `overlay/plugin/README.md`；
- `.github/workflows/baf-dsh-release.yml`。

---



## 14. 测试和验收标准



### 14.1 Preset 和信任

shipped roster 有 BAF 且 `trust === system`、`copyable === false`；standard 仍是 default；BAF 可选、**不可复制**、不可删除；桌面不同步官方 preset 到 user root；user 同名不 shadow；broken system BAF 不隐藏；session 创建后 composition 固定、child 继承。

### 14.2 Workflow 和分类

intake 区分新需求、低风险 Bug、高风险 Bug、维护、未知；新需求默认 full-go-path + OpenSpec；fast path 仅在 baseline 允许且满足范围/风险条件；fast path 保留 identity、根因、回归测试、implement、verify、quality、guard；高风险/不确定/范围扩大 → full-go-path；分类、确认、裁剪理由、升级可审计可 resume；分类确认前不能写源码；用户不能强关企业要求的 OpenSpec；5.2 表内转换按条件放行、表外全部 `invalid_transition`；三条回环（T11/T12+T13/T15）正确；各阶段产物和前置条件正确；多 change 不自动猜测；projection 可重建；文件删除/分支变化/baseline 变化/报告过期 → drift；resume 从最后一致阶段恢复；archive 仅 verify 通过 + 人工确认；archive 失败可重试无半归档；abandon 保留审计。

### 14.3 工作流 Tab

流程图正确显示分类、当前、已完成、未开始、失败、阻断、drift、受控裁剪；fast path 标注“未走 OpenSpec” + reason codes；升级后追加缺失阶段不清除已完成；四入口同 projection；刷新/重连/旧事件正确；分类卡只有“确认/补充/退出”；键盘导航和非色彩状态表达可验收。

### 14.4 Provider 和 C quality

baseline 缺失/格式错误/版本不兼容阻断；OpenSpec validate 成功/失败/不可用可区分；C 编译/测试/覆盖率/静态分析/格式结果结构化；覆盖率不足、报告缺失、超时、取消、并发隔离有测试；phase route 正确传递、child 继承、显式 override 校验；provider 不可用/批准 fallback/被阻断有确定错误；resume 保留 route；token meter 按实际 route 归因；日志有诊断无 secret。

### 14.5 Guard

protected path、workspace escape、路径穿越、危险命令、强制 Git、secret、未 verify archive、表外转换全拒；每次拒绝有稳定 reason code；普通用户无关闭 guard 或降阈值入口。

### 14.6 Command/UI/desktop

slash、CLI、desktop、Tab 同输入同状态；`baf status/doctor/version/classify/update` 输出稳定；launcher flags 不被 BAF 污染；打包后真实应用能发现挂载 BAF；UI 将官方 BAF 标为内置且禁用复制。

### 14.8 `baf-go` / 会话启动门 / drift 复位 / 输出规范（Phase 8.7–8.10）

会话启动门在 `0 / 1 / >=2` 三条 active-change 分支下给出正确卡片；体检缺件不阻断会话、超时降级为「未探测」、继续型会话重跑体检；焦点变更缓存不落 projection。直接说需求即触发 intake 并弹出分类卡；对话中断后 `/baf-go` 能重放同一张卡且幂等。确认门 A/B 只认 `/baf-go`，自然语言「继续」不推进任何状态；门上再敲一次 `baf-go` 才进入下一阶段。同 session 第二个需求被硬拒并提示新开 session；≥2 active change 时必须客户显式选一条。`/baf-workflow-resume` 的五类 drift 触发器各自算出正确候选集，非候选目标返回 `invalid_transition`，无 drift 时 `projectionVersion` 不变，`baf-go` 在 drift 下只渲染候选卡不自动选点。T15 升级后不换 session 继续 full-go-path 链，Tab 双泳道视图保留 fast-path 产物并画出升级边。全部 `baf-*` 输出首行可折叠读、确认门卡片首行含动作词、日志行只打元数据（无内容/无凭证）、i18n key 清单登记且 `verify-client-ui-i18n` 绿。

### 14.7 Update/release

三 scope 目录/平台边界不混淆；baseline 默认无未审批二进制（如有则逐工具签名/许可证/平台/hash 可验证）；`AppVersions` 迁移幂等不伪造版本、dsh 版本以 seed 为准；manifest canonical/hash/Ed25519 正确；缺签名、错 key、篡改、过期、降级、不兼容均拒；system/user 目标不互换；installer 覆盖升级不先卸载、handoff/失败恢复可验证；离线/超时不阻塞启动、强制更新 child 前阻断；plugin 独立下载/原子应用/重启/回滚；baseline 独立安装/探测/激活/回滚；多 scope 事务边界正确；child 启动失败/composition broken/roster 缺失完整回滚；release 在缺 BAF、错 trust、错 default、未签名、artifact 不完整时失败；clean build、开发运行、打包运行、升级回滚 fixture 全过。

---



## 15. 企业必须提供的输入

必须由企业在 Phase 0 提供（缺失时系统显示 unavailable 或 policy missing，不得使用 Ceedling、gcc、gcovr、cpplint、cppcheck 等旧默认值）：

1. OpenSpec 的确切版本、安装方式、CLI 和模板；
2. Matt Pocock 规则的企业正式来源；
3. C 编译器、构建系统、测试框架、覆盖率和静态分析工具；
4. 覆盖率、复杂度和其他质量阈值；
5. protected paths、secret scan 规则和 Git policy；
6. bug-fix-path 许可策略：允许的影响范围上限、回归测试要求；
7. baseline manifest 的发布和兼容策略；
8. stable/beta/offline channel 策略；
9. 正式 Ed25519 公钥、key id、轮换和吊销策略；
10. 管理员权限、更新审批和回滚权限；
11. 企业是否允许普通用户看到完整 composition、创造模式和调试信息；
12. allowed provider/model 清单、能力标签、fallback group 和 route policy 版本。

---



## 16. 完成定义

同时满足以下条件才算企业可分发版本：

- 官方 BAF 位于 shipped/managed system root，`trust: system`，**仅内置、不可复制、不可由用户修改**；
- standard 仍是默认 preset；
- 桌面不把官方 BAF 同步到 `~/.dsh/.agent-presets`；
- intake 分类、full-go-path、bug-fix-path、风险升级、转换表、resume、drift 全部按第 5 章可验证；
- 工作流 Tab 流程图与 domain 状态一致，四个交互面共享同一 projection；
- OpenSpec、企业 baseline、C quality 和 guard 通过统一 adapter 工作；
- 官方资源无法被 user payload shadow 或覆盖；
- update manifest、hash、Ed25519 签名、兼容检查、降级保护和 rollback 可证明；
- clean build、真实打包启动、UI/CLI e2e、更新/回滚测试全部通过；
- 本文档已完全脱离 Comet、Superpowers、vibe、Claude Code marketplace 和 hooks 主架构。

任何只把文件复制到 `~/.dsh/.agent-presets`、只加 prompt、只实现 CLI、或只实现可下载 zip 而没有 system trust、真实 packaged roster、签名和 rollback 的方案，都不算完成。

---



## 17. 评审结论：遗漏、风险、可落地性与逐步实现门禁

> 本章回答：需求是否理解完整、文档有无漏洞、计划能否按步落地、第一期如何裁剪。**结论先行：能落地；按 Phase 顺序可一步步做出基于 dsh 的公司级自定义 Agent；但必须先纠正三处硬错误，并用 MVP 裁剪控制爆炸半径。**



### 17.1 需求理解核对

你要的产品能力可压缩为六句话（与第 1 章对齐）：

1. 同事打开桌面应用就能选「BAF 模式」，能力边界由官方 preset 锁定；
2. 任何变更先经 intake 分类：新需求走完整 go，低风险 Bug 走受控快路径，不能口头跳过；
3. 阶段状态、OpenSpec 产物、质量/安全报告可追溯、可 resume，模型不能伪造完成；
4. C 工具链与企业规则来自可版本化 baseline，不写死在七个插件里；
5. slash / CLI / 桌面 / 工作流 Tab 共读同一 projection；
6. 官方资源随桌面签名升级回滚，用户目录不能 shadow 官方。

文档主线覆盖了上述需求；下列缺口是「写全了方向但实现前必须补 contract」的项，不是方向错误。

### 17.2 遗漏与必须补充（已部分回填正文）


| #   | 缺口                                               | 影响                                     | 处置                                                                  |
| --- | ------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------- |
| G1  | **dsh** `workflow` **工具与 BAF go 状态机混称**          | 实现者会误用 model-authored 脚本驱动阶段           | 已补 2.3；代码命名强制区分                                                     |
| G2  | **独立** `baf` **Node bin 违规**                     | 会被 `verify-application-entrypoints` 拒绝 | 已补 9.1 / Phase 8.2：profile + thin wrapper                           |
| G3  | **现状 plugin → user root**                        | 与 system trust / 完成定义矛盾                | 已补 3.9；Phase 1/9 关闭；改 overlay 文档与同步逻辑                               |
| G4  | **自然语言如何推进阶段**                                   | 只有状态机没有驱动面                             | 已补 5.6：命令 + `baf_stage_`* 工具                                        |
| G5  | **session log vs** `.baf/projection` **权威**      | 双写漂移、resume 不一致                        | 已补 5.7                                                              |
| G6  | **MCP / 子代理 / ralph 旁路 ToolGuard**               | 硬门禁被绕过                                 | 已补 8.6 旁路面；Phase 7 测试清单                                             |
| G7  | **包落点 packages vs overlay**                      | 与二次开发策略冲突、上游合并难                        | 已补 3.9 决策表                                                          |
| G8  | **公开仓默认不验签**                                     | Phase 9 假设生产强制签名                       | Phase 0 登记：企业通道开启 `signatureVerificationEnabled`；公开演示仓可保留跳过但企业发行禁止  |
| G9  | **Windows 投影锁与 fsync**                           | 多进程/杀进程半写                              | Phase 4 显式测：atomic rename、损坏检测、第二 writer 拒绝；不依赖 POSIX flock         |
| G10 | **阶段 route 不经 dsh workflow 时如何传 provider/model** | 文档过度绑定 `agent()` options               | Phase 3：优先 session/agent 请求级 API；仅子代理扇出时复用 workflow `agent()`       |
| G11 | **UI i18n / slots**                              | Tab 文案硬编码会被 `verify-client-ui-i18n` 拒绝 | Phase 8 按 `ui-baf-desktop` 模式注册 locale                              |
| G12 | **conversation 内阶段提示**                           | 仅 Tab 时用户在聊天里看不见当前阶段                   | Phase 8 可选：conversation header/status strip 只读投影；第一期可后置             |
| G13 | **plan mode / todo 与 BAF plan 阶段关系**             | 两套「计划」概念冲突                             | 冻结：BAF `plan` 阶段产物权威；dsh plan mode 在 BAF session 默认关闭或只读提示，不双写      |
| G14 | **OpenSpec CLI 分发**                              | baseline 不含二进制时 verify 不可用             | Phase 0 企业输入：安装方式；fixture 用 stub 执行器；真实环境 `openspec_unavailable` 阻断 |
| G15 | **多 change / 多 workspace**                       | 文档有选择逻辑但缺并发矩阵                          | Phase 4 验收：同 workspace 多 change 强制选择；跨 workspace 状态不串               |
| G16 | **企业输入阻塞感过强**                                    | 误以为 Phase 0 齐才能开工                      | 已补第 12 章：0–4 不阻塞；5+ 用 fixture                                       |




### 17.3 风险登记（按严重度）


| 风险                             | 等级  | 为何危险                          | 缓解                                              |
| ------------------------------ | --- | ----------------------------- | ----------------------------------------------- |
| R1 用 prompt/skill 冒充门禁         | 高   | Agent 一句话跳过 OpenSpec/verify   | ToolGuard + `WorkflowService` 表驱动；测试「模型声称完成」不推进 |
| R2 官方资源落在 user root            | 高   | 用户可改/删/shadow；升级污染用户副本        | managed system root；shipped-root-first 测试       |
| R3 把 BAF go 做成 dsh workflow 脚本 | 高   | 状态不可审计、可被模型改写                 | 2.3 红线；code review checklist                    |
| R4 更新验签未开就宣称企业可分发              | 高   | 供应链攻击面                        | 完成定义绑定强制验签；公开仓演示与企业发行通道分离                       |
| R5 C 工具链环境差异                   | 中   | CI 绿、同事机红                     | `tool_unavailable` 结构化；doctor；不伪造通过             |
| R6 projection 损坏/半写            | 中   | 无法 resume 或谎报阶段               | append-only + CAS + 损坏停在 seq；archive 原子         |
| R7 上游 dsh 合入冲突                 | 中   | `packages/baf` 与 preset 改动难回灌 | 3.9；尽量少改 host 热文件；preset 新增优于改 standard         |
| R8 一期范围过大（Tab+三 scope+全质量）     | 中   | 半年无可用产品                       | 17.4 MVP 裁剪                                     |
| R9 intake 规则误杀/漏放              | 中   | 小 Bug 过重或大改走快路径               | 用户确认卡；reason codes；升级 T15；规则可测                  |
| R10 企业输入长期 `unavailable`       | 低   | 永远停在 fixture                  | 产品可演示；企业发行 checklist 单独门禁                       |




### 17.4 能否落地 / 计划是否够细 / 如何一步步做

**能否落地：能。** 复用面已在仓库核实：

- preset shipped root + `trust: system` + copy-only authoring（`agent-presets`）；
- `ctx.tools.guard()` 单调门禁（`dsh-tools`）；
- commands registry、session projection、desktop UpdateService 骨架、phase `provider`/`model` 转发。

缺的是 BAF domain 与「user root → system root」迁移，不是重写 dsh。

**计划是否够细：主链够细，可按 Phase 执行；** 第 12 章已到文件级。仍须在每个 Phase 开工前写该 Phase 的短任务单（接口签名、fixture 路径、测试名），避免 1300 行设计文档直接当 sprint backlog。

**推荐逐步实现顺序（严格门禁）**：

```text
Phase 0  contract/fixture
   ↓
Phase 1  roster 可见 BAF（system trust）     ← 第一个可演示里程碑
   ↓
Phase 2  baf-core + baseline loader
   ↓
Phase 3  route resolver（可先 stub availability）
   ↓
Phase 4  intake + projection + transition        ← 第二个里程碑：状态机可测
   ↓
Phase 5  full-go-path 主链（OpenSpec stub 可先）   ← 第三个里程碑：端到端 go
   ↓
Phase 7' ToolGuard（可从 Phase 5 并行插入）  ← 硬门禁；无此不算 Agent
   ↓
Phase 8' slash + status（Tab 可后置）         ← 第四个里程碑：MVP 可用
   ↓
Phase 6  fast-path
Phase 7  完整 C quality
Phase 8  Tab + CLI profile + desktop bridge
Phase 9  system root 迁移 + 签名三 scope
Phase 10 release 门禁
```

**MVP（对内可用）完成线**：Phase 0–5 + ToolGuard + slash/`status`/`doctor`；官方 BAF 已是 system trust；full-go-path 在 fixture 仓库跑通；非法转换与分类前写码均被拒。

**企业可分发完成线**：MVP + Phase 6–10 + 第 15 章企业输入齐 + 第 16 章全部勾选。

### 17.5 第一期明确仍不做（防范围漂移）

与 1.4 一致，并追加：

- 不做拖拽自定义编排、不做任意流程图编辑器；
- 不把 BAF go 编译成 dsh workflow 脚本；
- 不接 GitLab/Jira/知识库/Python（provider contract 预留即可）；
- 不自动 push / 强制 reset；
- 不在公开演示通道关闭验签的同时声称「企业供应链安全已完成」；
- 不把 `overlay/plugin` 同步到 user presets 当作临时「也行」长期留下。



### 17.6 给实现负责人的开工检查单

开始写代码前只确认这 8 项：

1. Phase 0 四份文档目录已建，`<enterprise-tbd>` 可暂时 unavailable；
2. 已理解 2.3：不会用 `tool-workflow` 实现 go；
3. 已理解 3.9：关闭 user-root 官方安装路径；
4. 已理解 9.1：`baf` CLI 走 dsh profile；
5. 已理解 5.6：阶段推进只有命令/阶段工具；
6. 第一个 PR 只做 Phase 1（preset + roster 测试），不夹带更新/UI；
7. 每个 Phase PR 带该 Phase 验收用例；
8. 企业发行前对照第 15–16 章，而不是对照「演示过一次」。

Phase 8.7–8.10 开工前追加确认这 4 项：

1. 已理解 §18.2：`/baf-go` **无参数**是主用法，需求走自然语言；不实现 `baf-go + 需求` 主路径，也不实现 `baf-go confirm`（2026-09-20 §22.17 增补：`/baf-go-confirm` 是独立命令、非 `baf-go` 子命令）；
2. 已理解 §18.3.3：BAF 模式下**没有 guard 之外的落码通道**——启动门是 UX，硬门禁在 ToolGuard，不要为「未绑定工作流」另建第二套拦截；
3. 已理解 §19.4：`baf-go` 在 drift 下**只渲染候选、永不自动选点**；
4. 已理解 §20.1：**不新增第四套输出通道**——所有输出落在状态行 / 卡片 / 日志三层里。

### 17.7 `baf-go`、会话启动门、drift 复位与输出规范的运行时影响

> 与 §18、§19、§20 配套：本节是评审视角的运行时风险登记，方便实现 Phase 8.7–8.10 时一一对照。

| 风险                                                | 等级  | 为什么                                                        | 缓解                                                                                          |
| ------------------------------------------------- | --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| R11 coordinator 自己写了第二套转换规则，与 §5.2 转换表分叉         | 高   | 状态机权威被稀释，resume / audit 不一致                            | coordinator 必须是纯路由器：不调 `WorkflowService.transition`，所有状态改走现有 drive                                                |
| R12 coordinator 把单步驱动器（`/baf-workflow-*`）偷偷替换或废弃       | 中   | 客户脚本化复跑被破坏                                              | §18.1 明确：单步驱动器原样保留；coordinator 是上层习惯，不强制门禁                                                            |
| R13 确认门 A/B 被模型用自然语言绕过（「继续」「好的」「下一步」）                | 中   | 误把客户在会话中说的「继续」当作 confirm；跳过 review              | confirm 只认**人因入口**：§22.17 弹窗点击（source `gate-card`）或 `/baf-go-confirm` / 二次 `/baf-go` 斜杠命令（§18.5）；自然语言回复不触发任何 drive，`baf_gate_ask` 工具只弹框不代答；确认门卡片第一行必须出现动作词（「确认弹窗点确认 / 回复 /baf-go-confirm」） |
| R14 同 session 跨变更（active change = 1 + 新描述）被模型自动开第二条   | 中   | 工作流视图按 session 分组时被多条变更污染；审计链路交叉                  | §18.6 守卫 5：硬返回「请新开 session」卡，coordinator 不调 driveOpen                                                |
| R15 drift / 已放弃 / completed 状态下 `/baf-go` 误把旧变更当新需求启动 | 中 | 失去终态语义 | §18.7 边界表：drift → 转 §19 候选卡（不自动选点）；终态一律返回错误卡，走新会话新 intake |
| R16 verify 报告过期，confirm 后仍直接 archive                | 低   | 依赖新鲜度未校验                                              | coordinator confirm 路径重读 `verify-report.json` 时间戳与 source revision，不匹配返回 `verify_stale` 卡                      |
| R17 coordinator 与 §8.6 listChanges 的会话维度冲突             | 低   | dashboard 列全 cwd 变更；Tab 只列本 session 焦点变更；客户误读为 bug | §18.6 明确两个视图分工：dashboard = cwd 全集；Tab = session 焦点；文案区分                                                |
| R18 drift 下 `/baf-go` 自动替客户选回退节点                     | 中   | 客户没意识到哪些已完成工作被判失效，静默丢工作                          | §19.4 明确：`baf-go` 只做检测 + 渲染候选卡，**永不自动选节点**；选点是客户对「哪些工作作废」的决策                                    |
| R19 会话启动门体检失败/超时阻塞会话打开                          | 中   | 缺一个外部工具就打不开 BAF 会话，比不体检更糟                          | §18.3 体检是**只读 + 不阻断**：超时降级为「未探测」，缺件只影响对应阶段（如缺 OpenSpec → full-go-path 启动时才 `openspec_unavailable`）        |
| R20 启动门在 `agent/created` 做 I/O 拖慢首屏                   | 低   | 首屏白屏或卡顿                                            | 体检异步、结果缓存到 session 焦点旁路；首屏先出绑定结论，体检明细后填                                                       |
| R21 双 path 视图把 fast-path ledger 与 full-go-path 产物画成一条线     | 中   | 客户看不懂「从哪跳的」，追溯断裂                                  | §18.4.3 明确**两泳道 + 一条升级边**；fast-path 产物（`fastpath-ledger.json`、最小 bug 记录）永久保留并单独标注                           |
| R22 日志行泄露内容或凭证                                     | 中   | 排障日志把源码/密钥写进会话                                          | §20.4 只打 `key=value` 元数据；不打文件内容、不打 token；受 `secret-scan` 门禁                                        |
| R23 新增 i18n key 漏登记，落地时被 `verify-client-ui-i18n` 卡住 | 低   | 实现阶段返工                                              | §20.7 先冻结 key 清单；客户端文案一律走字典，禁止硬编码                                                              |
| R24 新增 `awaiting-confirm` 事件但漏改 `projection.ts` replay 的穷尽 `switch` | **高** | `default` 分支抛 `projection_corrupted`，**任何含该事件的 projection 重放全部判损坏**，已归档审计链一起失效 | §18.8 已注明：加事件的同一次提交必须加 `case`；PR 检查单列为必查项；`tests/projection.spec.ts` 加未知事件用例 |


---



## 18. `baf-go`：会话启动门、自动驱动与强制客户确认

> 本章与 5.6「阶段如何被驱动」、9「命令」、12「实施计划」、17「评审结论」并列（第 19 章是它的 drift 出口，第 20 章是它的输出格式）。三条定调：
>
> 1. **BAF 模式下不存在「绕过工作流的开发」**。想落代码，就必须有一条 active change 且处于 implement——这条硬规则**已经落地**：`baf-guard` 的 `adjudicateFsWrite()` 在 `!state.active` 时直接 `deny('intake_confirmation_required', 'no active change: start and confirm one in the workflow tab first')`。所以会话一打开的第一件事是**确定本会话绑哪条工作流**（§18.3）。
> 2. **客户永远用自然语言说需求**。不需要背 `/baf-go 需求` 这种形式——直接说要做什么，分类卡会自己弹出来（§18.2）。
> 3. **`baf-go` 是「推」不是「输」**。它把当前 session 推进到下一个需要客户动作的点，并把那张卡片重放一遍；它适配所有工作流状态——在途、待确认、drift、终态——每种状态触发不同的阶段操作或错误卡（§18.4）。

### 18.1 设计目标与四条典型路径

把 §5.1 状态机对客户的暴露从「按顺序敲 9 个 slash」压缩成「说需求 → 需要时回一句 `baf-go`」。

1. **新需求（主路径）**：用户打开 BAF 会话 → 启动门报告「无未完成工作流」+ 工具链体检（§18.3）→ 用户**直接说需求**（「增加用户登录」）→ intake 分类器跑完弹出**分类卡** → 客户在卡上选 `确认 / 补充 / 退出` → 确认后走 full-go-path → clarify / design / plan / implement / verify 自动推进 → **N3 design 完成后停下** → 客户 `/baf-go` → **N7 archive 前再次停下** → 客户 `/baf-go` 归档。
2. **继续会话**：客户在启动门选「继续 `<changeId>`」→ 之后只管说人话（clarify 阶段答问题、implement 阶段提修改意见）→ 需要推动阶段时敲 `/baf-go`（无参数）→ coordinator 读 projection 当前节点并路由到下一步。
3. **崩溃 / 换机 / 换 session 后恢复**：换机后 `cwd` 还是同一工作区，开新 session → 启动门读到 projection 里那条未完成 change → 客户选「继续」→ 起点与之前完全一致（projection 是 cwd 绑定、跨 session 共享的可恢复索引，§5.7）。
4. **依据漂移（drift）**：启动门或任意 `/baf-go` 前检测到 drift → coordinator **不自动猜**，转 `/baf-workflow-resume` 让客户交互式选合法目标节点（第 19 章）。

**不做什么**：`baf-go` 不替代 §5.6 的硬规则——`WorkflowService.transition` 仍是唯一权威；模型仍然必须经命令或阶段工具才能动状态机。`baf-go` 只是把分散的驱动器组合成一个自动推进器，并在两个确认门强制停。

### 18.2 入口语义：说需求 vs 推流程

| 客户动作 | 触发什么 | 要 `/baf-go` 吗 |
| --- | --- | --- |
| **直接说需求**（自然语言） | 启动门 →（新开时）intake 分类 → 弹**分类卡** | **不要**。这是主路径 |
| **分类卡被错过 / 对话中断后想重新弹出** | coordinator 重放那张待决卡 | 要：`/baf-go` |
| **在途阶段想推到下一步**（clarify 答完、design 写完、plan 写完、implement 做完…） | 路由表派发到对应 drive | 要：`/baf-go` |
| **停在确认门上**（门 A / 门 B） | **重新弹出 §22.17 交互确认框**；弹窗里点「确认」即进入下一阶段 | 要：`/baf-go`（不弹框直接继续用 `/baf-go-confirm`，见 §22.17） |
| **drift 状态** | 自动转 `/baf-workflow-resume` 的交互式选点 | 要：`/baf-go`（自动映射） |
| **终态**（completed / abandoned） | 错误卡：请新开工作流 | 要：`/baf-go`（只报错） |

**`baf-go` 的统一定义**：*「把本 session 推进到下一个需要客户动作的点，并渲染那张卡片」*。它**幂等**——已经停在同一张待决卡上时再敲一次只是重渲同一张卡，不重复推进状态、不产生新事件。

**没有 `/baf-go <描述>` 这个主用法**。需求一律用自然语言表达。带描述的形式只在两种边缘场景保留（脚本化、CLI 一次性投喂），且行为被明确定义为：**未绑定时**等价于说需求；**已绑定**时返回「请新开 session」卡（§18.6 守卫 5）。

**`/baf-go-confirm` 是什么**（2026-09-17 曾拍板「不做 confirm 子命令」，2026-09-20 §22.17 引入弹窗通道后**修订**）：`/baf-go` 在确认门上改为**重新弹出交互确认框**——它不再兼作「静默确认」，因为「客户想再看看那张确认框」和「客户已确认」是两个不同的动作，合在一个命令上就分不清。`/baf-go-confirm` 是那个**不弹框的正路径**：门 A 直接进 plan、门 B 直接归档、待决 intake 直接确认、未初始化工作区直接 scaffold（drift 除外——§19 永不自动选点）。原决策担心的「`confirm` 一词两义」并未复发：`/baf-workflow-classify confirm` 与 `/baf-go-confirm` 是两个完整命令名，路径依旧不通用（见 §18.5 统一约定）。

| 形态 | 调用 | 描述参数处理 |
| --- | --- | --- |
| slash（**主用法**） | `/baf-go` | 无参数 |
| slash（边缘） | `/baf-go <描述...>` | 未绑定 → 等价于说需求；已绑定 → 「请新开 session」卡 |
| slash | `/baf-workflow-resume [节点]` | 见第 19 章 |
| slash（§22.17） | `/baf-go-confirm` | 无参数；不弹框直接走确认门 / intake / scaffold 正路径 |
| standalone CLI | `dsh --from-default-profile baf --patch packages/baf/baf-workflow/overlays/baf-cli.cordis.patch.yml -- go` | 同 slash 无参形态 |
| standalone CLI（§22.17） | `… -- go-confirm` | 同 `/baf-go-confirm`；CLI 无弹窗通道，`baf go` 保持「门上再敲一次即确认」的既有语义 |
| desktop 工作流 Tab | 顶栏「继续 / 自动驱动」按钮 | 不带描述 |
| Remote（Typert） | `BafWorkflowTabRemote.go()` | 与 slash / CLI 共源 |

### 18.3 会话启动门（Session Binding Gate）

> 需求：**BAF 模式必须依托工作流才能进行**——session 想继续、想落代码，就必须走工作流或受控裁剪。所以会话一打开就先把「这条 session 绑哪条工作流」定下来，同时把必须工具链体检一遍、打印成欢迎语。

**触发时机**：`agent/created` 时安装，**第一次模型 turn 之前**呈现。挂载行与 `baf-guard-install` 同层（非 isolate row，`inject: ['agents']`；实现另需 `commands`——卡片是**执行 `/baf-welcome`** 投递的，见 §18.10-5），见 §12 Phase 8.8。此时还没有任何模型请求，客户看到的第一屏就是启动卡。

**三件事，一次呈现**：

| 步骤 | 做什么 | 输出 |
| --- | --- | --- |
| 3.1 绑定判定 | 读 `<workspace>/.baf/projection/index.json`，数 `current ∉ {completed, abandoned}` 的 change | `0` / `1` / `>= 2` 条 |
| 3.2 工具链体检 | 只读探测必须工具链（§18.3.2） | 每项 `✓ / ✗ / ?` + 缺失引导 |
| 3.3 欢迎语 | 把 3.1 + 3.2 合成一张 BAF 欢迎卡（模板见 §20.3） | 一张卡，一次呈现 |

#### 18.3.1 绑定判定

| projection 现状 | 卡片 | 客户可选 |
| --- | --- | --- |
| 无 active change | 「无未完成工作流 · 请描述需求」 | 直接说需求 |
| 恰好 1 条 active change | 「检测到未完成工作流 `<id>`（当前 `N<x>` · `mode`）· 继续还是新开？」 | `继续` / `新开` |
| `>= 2` 条 active change | 列出候选（id · 模式 · 当前节点 · 最后活动时间） | 选一条继续 / 新开 |

- 选「**继续**」→ 该 `changeId` 成为本 session 的**焦点变更**，缓存在 `BafWorkflow.bindWorkspace()` 旁路（**不写 projection**）；后续说需求视为对该变更的补充，**不再走新 intake**。
  - 实现口径：启动卡**只读**，不替客户落绑定（§18.10-2）。客户说「继续」= 敲卡片【下一步】里印出的那条命令——单条时 `/baf-go continue`，多条时 `/baf-go change=<id>`；绑定走 §18.6 `resolveBinding` 既有路径，不新增判定分支。
- 选「**新开**」→ **硬拦**（§21.2 已决）：只要 cwd 里还存在未终态 change，就**拒绝**新开并提示「请新开一个会话」，焦点保持不变。理由：需求 3「一个对话条目下仅支持一个工作流」；同一 session 里堆第二条 active change 会让工作流视图按 session 分组时被污染。客户要换工作流，就先 `abandon` 旧的（`/baf-workflow-abandon`）——那本身是一个显式决策。
- **唯一允许新开的场景**：cwd 里 `active change === 0`（此时「新开」=「说需求」，直接进 intake）。
- 选「**drift 复位**」→ 直接转 `/baf-workflow-resume`（第 19 章）。

#### 18.3.2 必须工具链体检（同一张卡片打印）

| 检查项 | 探测方式 | 缺失时的引导 |
| --- | --- | --- |
| workspace | `cwd` 存在且可写 | 换目录打开 |
| baseline | `.baf/baseline.yml` 可读可解析 | `baf scaffold` 生成 / 导入企业 baseline |
| Git | `git rev-parse HEAD`（drift 锚点） | 初始化仓库 |
| OpenSpec | `openspec` CLI 可执行（超时则记 `?`，见下） + `openspec/` 存在（full-go-path 硬前置） | 安装 OpenSpec CLI / `baf scaffold` |
| C 工具链 | **首屏不探测**（§21.4 已决）：显示 `? 未探测 · 首次进入 verify 时检查`；逐项探测交给 Phase 7 QualityRunner | 进入 verify 时按 baseline 逐项给出（如 `pip install gcovr`） |
| guard / quality | `baf-guard` / `baf-quality` 挂载情况 | 检查 preset composition |
| 版本 | `resolveBafProductVersions()`：`baf-dsh` / dsh / 四个 `baf-*` | 提示更新 |

- 体检是**只读探测**：不写 projection、不改状态、不触发任何 transition。
- **缺件不阻断会话打开**；但缺 OpenSpec 时 full-go-path 一启动就会返回 `openspec_unavailable`（§18.7）——在启动时把这句说清楚，比在 N1 报错好。
- 逐项**超时（建议 1.5s）降级**为 `? 未探测`，绝不因为一个外部命令卡住首屏。
  - 降级是**逐项**的，不是整卡失败：同一行里已经拿到的判定照常显示。OpenSpec 行就是这样——CLI 探测超时（首次经 shell 拉起 `openspec.cmd` 在 Windows 上实测可达 1.4s）时该行记 `? … · CLI 未探测（超时）`，而 `openspec/changes` 的**目录判定照常给出**，因此缺目录时仍然带 `baf scaffold` 引导。这一行**不能**写成 `✗`：那会把已经装好的客户打发去重装一个只是慢的 CLI。
- 结果缓存到 session 焦点旁路；**继续型会话同样重跑**（换 session 可能换了机器 / 换了 baseline 版本）。

#### 18.3.3 与 ToolGuard 的关系：「必须依托工作流」的强制力

启动门本身是**引导**，不是硬门禁。硬门禁在 ToolGuard（§5.4）：未绑定任何 active change、或绑定到的 change 不在 implement 阶段时，`write` / `edit` / `bash` / `pwsh` 的写入被拒。因此即使客户跳过启动卡不选，也**落不了代码**——这就是需求 1 的「必须依托工作流才能落代码」。错误码复用既有集合（`intake_confirmation_required` / `scope_exceeded` / `protected_path` …）；「未绑定工作流」的码**已定：复用 `intake_confirmation_required`**（§21.1），不新增。

### 18.4 自动驱动流程（路由表）

`driveGo` 读 `ProjectionStore.readStatus(changeId)`，按 `status.current` 与 `status.mode` 派发；所有判定走 §5.2 转换表 + 阶段门禁（**不允许在 coordinator 里另写转换规则**）。下表是路由图，`→` 表示「本步完成后下一步自动路由到」，`■` 表示「停下等客户」。

#### 18.4.1 前置：session 绑定

| session 状态 | 下一步 | 停下？ |
| --- | --- | --- |
| 未绑定 + 无 active change | 渲染启动卡：「无未完成工作流 · 请描述需求」 | **■** |
| 未绑定 + 有 active change | 渲染启动卡：「继续 / 新开」 | **■** |
| 未绑定 + 客户此时说了需求（新开） | `driveOpen` → intake 分类卡 | **■** |
| 已绑定焦点 change | 进入下面的节点路由 | — |

#### 18.4.2 节点路由

| 当前节点 + 模式 | 下一步 drive（coordinator 委派） | 完成后 | 停下？ |
| --- | --- | --- | --- |
| `intake`（未 confirm） | 重放 intake 分类卡 | — | **■** |
| `intake`（已 confirm，未 open） | `pipeline.driveOpenStage` / `driveFastPathOpenStage`（mode 由 intake 决定） | `open` | — |
| `open` | `pipeline.beginDocStage('clarify')` | `clarify` in-progress | — |
| `clarify` in-progress | `pipeline.completeDocStage('clarify')` | `design` | — |
| `clarify` available（已装模板未填） | 等模型在会话中填模板；coordinator 不动 | `design` | — |
| `design` in-progress | `pipeline.completeDocStage('design')` | **进入门 A** | **■** |
| `plan` in-progress | `pipeline.completeDocStage('plan')` | `implement` | — |
| `plan` available | 等模型写 `plan.json`；coordinator 不动 | `implement` | — |
| `implement` in-progress（full-go-path） | 检查 `plan.json`：有未完成 → 等模型；全 done → `driveImplementStage` | `verify` | — |
| `implement` in-progress（fast-path） | 检查 `fastpath-ledger.json`：有未完成 → 等模型；全 done → `driveImplementStage` | 触发 T15 则升级（见下）；否则 `verify` | — |
| `verify`（`enterStage` 成功） | `pipeline.driveVerifyStage` | 通过 → **门 B**；失败 → 回 `implement` | 通过时 **■** |
| `archive`（已通过 verify） | `pipeline.driveArchiveStage(..., humanConfirmed: true)`（**只在客户确认后**） | `archived` | **■** |
| `drift` | **转 `/baf-workflow-resume` 候选卡**（§19.4） | 客户选点后回到该节点 | **■** |
| `completed` / `abandoned` | 错误卡「当前工作流已终态；请新开一个会话」 | — | — |

**T15 升级后不换 session**：fast-path 在 implement 阶段升级为 full-go-path 时，`driveEscalateStage` 写 `mode-upgraded` + `stage-entered('clarify')`，`status.current` 变成 `clarify`。下一次 `/baf-go` **自然命中** `clarify in-progress` 那一行，按 full-go-path 继续走 clarify → design → plan → implement → verify。这是**预期行为**，不需要新 session、不需要额外命令；卡片必须显式说明「已升级 full-go-path · 当前 clarify · 缺少的 clarify/design/plan 将补走」，避免客户看到流程图回退而困惑。同时 Tab 切到双泳道视图（§18.4.3）。

实现要点：

- coordinator **不重写** drive 函数；`driveGo` 是纯路由器（switch over `status.current` × `status.mode`），只调现有 `driveOpen` / `driveClassify` / `pipeline.{beginDocStage,completeDocStage,driveImplementStage,driveVerifyStage,driveArchiveStage}`。
- 「等模型在会话中填模板」分支：coordinator 返回「当前在 N2 clarify，请回答模板问题后再次 `/baf-go`」卡，**不阻塞新 turn**——模型在同一 session 的下一次自然语言回复中继续写产物。
- `verify` 失败回 `implement` 是 §5.2 T11 既有路径；`driveVerifyStage` 返回 `backToImplement` 时 coordinator 直接渲染「修复后再次 `/baf-go`」卡，不另写逻辑。

#### 18.4.3 双泳道视图（fast-path → full-go-path 升级）

需求：fast-path 跑到一半升级到 full-go-path 时，工作流 Tab **必须同时体现两条 path 的流程**，并清楚看到「从之前什么位置跳到 full-go-path 的什么位置」，且**保留升级前 path 生成的 spec 文档记录**以便追溯。

```
fast-path 泳道（升级后置灰，但永远保留、可追溯）
  [open]──►[implement]──►[verify]──►[archive]
                │
                │  T15 升级边（范围扩大 / 语义原因）
                │  证据：mode-upgraded 事件 + escalate 原因
                ▼
full-go-path 泳道（从升级落点接续，缺失阶段补走）
  [open]──►[clarify]──►[design]──►[plan]──►[implement]──►[verify]──►[archive]
                ▲
                └── 升级落点：clarify
```

- 两条泳道各自渲染 `nodes` 状态（`completed` / `in-progress` / `drifted` / `skipped`），中间一条**升级边**标注 `T15 · <原因> · <时间>`。
- 升级前 fast-path 的产物**不删**：`fastpath-ledger.json`、最小 bug 记录、回归测试、`verify-report.json`（若已有）在泳道旁单独列出并标注「未走 OpenSpec」。
- 升级后**追加**缺失阶段，**不清除**已完成节点（既有 §14.3 验收条款）；`mode-upgraded` 与 `stage-entered` 事件都在 projection 里，图由事件重建，不靠 UI 记忆。
- 泳道标签与升级边文案走 i18n（§20.7：`baf.tab.lane.fastpath` / `baf.tab.lane.fullgo` / `baf.tab.edge.upgraded`）。
- **数据来源（实现工作量，别低估）**：projection 目前只有**一套** `nodes` + `mode` + `mode-upgraded` 事件，`deriveWorkflowMetrics(events)` 也只产出**单链**指标。双泳道必须**从事件时间轴切分**：以 `mode-upgraded` 事件为分界点，其之前的 `stage-entered`/`stage-completed` 归 fast-path 泳道（置灰保留），其之后的归 full-go-path 泳道；升级落点取该事件相邻的 `stage-entered('clarify')`。**不要**给 projection 加 lane 字段（会破坏 append-only 的既有事件形状）——切分放在 Tab 派生层做，属于 Phase 8.7 的显式工作量。
- **落地状态（2026-09-17）**：**未实现**。Phase 8.7 交付的是命令行主路径（`go-coordinator.ts`），双泳道是 Tab 派生层的活，与确认门高亮一并留在 §8.7.7，见 §18.9 末尾的「未落地项」。domain 侧无需改动——`mode-upgraded` + `stage-entered` 事件已经齐全，缺的只是 Tab 怎么画。

### 18.5 两个强制客户确认门

> 这两处是**产品决策**而不是硬门禁——`/baf-workflow-*` 单步驱动器仍可绕过；`baf-go` 必须停。理由：N3 design 是客户对实现方向的最终背书；N7 archive 是客户对全部工作的最终背书——错过一次，返工成本最高。

**门 A：N3 design 完成 → N4 plan 之前**

- 触发：`pipeline.completeDocStage('design')` 返回成功、`status.current === 'design'` 且 `status.nodes.design === 'completed'` 时，coordinator **不**自动调用 `beginDocStage('plan')`。
- 卡片标题：`自动驱动 · 设计文档已实现 · awaiting_customer_confirm · 点本行展开/折叠详情`。
- **解锁（§22.17 通道在场，desktop 主路径）**：coordinator 停靠时即弹 §22.17 交互确认框（复用 `userQuestions` 瀑布）；之后 `/baf-go` 每次都**重弹**确认框，弹窗里点「确认设计，进入计划」→ `beginDocStage('plan')`；`/baf-go-confirm` 不弹框直接进 plan。
- **解锁（无 §22.17 通道，CLI / 测试 / 降级）**：客户再敲一次 `/baf-go`。coordinator 收到后从 projection 重读状态、确认当前为 `design completed`，再 `beginDocStage('plan')`（既有语义原样保留）。
- 客户回复别的内容：卡片重放、状态不动；模型可以在同 session 自然语言里继续讨论设计修改，但 `completeDocStage('design')` 不会被 coordinator 重跑，直到客户确认。
- 修改路径：若客户在确认前要求改设计，coordinator 返回「请 `/baf-workflow-design approach="..." ref="..."` 重跑」卡（不阻塞，但**不**自动重跑——客户得显式动作，避免 coordinator 反复自动覆盖设计）。

**门 B：N6 verify 通过 → N7 archive 之前**

- 触发：`pipeline.driveVerifyStage` 返回 `result.backToImplement === undefined` 且 `status.current === 'verify'` 且 `status.nodes.verify === 'completed'` 时，coordinator **不**自动调用 `pipeline.driveArchiveStage`。
- 卡片标题：`自动驱动 · verify 已通过 · awaiting_customer_confirm · 点本行展开/折叠详情`。
- **解锁（§22.17 通道在场）**：停靠时即弹确认框；`/baf-go` 重弹、弹窗点「确认归档」→ coordinator 校验 verify 报告未过期、依赖未漂移（与 §5.3 N7 既有 `verify-report.json` 新鲜度判定一致）→ `driveArchiveStage(changeId, humanConfirmed: true)`；`/baf-go-confirm` 不弹框直接归档。
- **解锁（无 §22.17 通道）**：客户敲 `/baf-go` → 同上校验后归档（既有语义原样保留）。
- 客户回复别的内容：卡片重放、状态不动。

**统一约定**

- 两个确认门都用 `awaiting_customer_confirm` 标记，落 projection：新增 `awaiting-confirm` 事件类型（只记录客户确认时间戳与门名，**不参与门禁拦截**）。
- **confirm 一词两义要分清**（这是最容易踩的坑）：
  - **intake 分类的 confirm** = `/baf-workflow-classify confirm [title=...]`，把 intake 分类确认下来（并顺手推进 open）；**只**在 intake 阶段有效。
  - **门 A / 门 B 的 confirm** = §22.17 弹窗里点「确认」选项，或 `/baf-go-confirm`；**只**在两个确认门上有效。
  - 两条路径的命令**不通用**：在 intake 阶段敲 `/baf-go` 只会重弹分类确认框；在确认门上敲 `/baf-workflow-classify` 会返回「当前不在 intake」。
- 工作流 Tab（§10.3）：`awaiting_customer_confirm` 节点状态的配色与文案与 `blocked` 区分；按钮文字改为「确认进入下一阶段」，且只有这一个按钮可点；其余合法 `transition` 仍可经 §5.6 阶段驱动器触发（**不锁 Tab**）。
- 「`/baf-workflow-*` 跳过确认门」是**允许的**——这是 §5.6「命令 + 阶段工具」契约的一部分。理由：脚本化复跑、CI 自动化、人工细控需要绕过确认门。`baf-go` 只是上层习惯，不强制全流程门禁。

### 18.6 单一会话单工作流约束

> 投影是 **cwd 绑定**（不是 session 绑定），所以「多变更可同 cwd 并存」是 §5.7 既定事实。本约束是 **session 维度**的额外约束：**一个 dsh 会话（一次打开的 desktop conversation）只承载一个 active change**，这样工作流视图按 session 分组时不会被多条变更污染。

**约束规则**

1. 进入 `driveGo` 第一步：读 `ProjectionStore.readIndex()`，数 `current ∉ {completed, abandoned}` 的 change。
2. `=== 0`：按 §18.4.1「未绑定」分支走（提示描述需求）。
3. `=== 1`：该 change 即本 session 焦点（缓存到 `BafWorkflow.bindWorkspace(cwd)` 旁路，**不写 projection**），后续所有 `/baf-go` 都作用在它上面。
4. `>= 2`：coordinator 返回选择卡列出候选，**要求客户显式选一条**；不自动猜（与 §5.6「多 change 强制选择」同一原则）。
5. **「同 session 内开第二条」硬禁用**：客户在已有 active change 的 session 里描述另一个需求 → coordinator 立即返回「请新开一个 session」卡，**不**在原 session 内开第二个 active change。原因：工作流视图按 session 分组时，混入会破坏视图完整性，也让审计链路交叉。
6. **跨 session 跑同一条 change 是设计而非 bug**：工作流状态**全部基于文件记录**（`<workspace>/.baf/projection/`），session 不记录状态。所以 A 会话推进到 design、B 会话（同 cwd）接着推进 plan 是**合法且预期**的——coordinator 只读 projection 决定起点，聊天记录不参与状态判定。§18.6 的约束是「**一个 session 不允许同时有两条 active change**」，**不是**「一条 change 只能被一个 session 碰」。

**Tab 配合**：会话 Tab「工作流」只展示本 session 焦点变更的图；其他 active change 仅在「变更总览」（§8.6 `listChanges`）里以「其他 session / 其他时间窗口」标记，不污染本 session 视图。

**与既有 §5.6「多 change 强制选择」的关系**：§5.6 是 **workspace 维度**（同一 cwd 下多变更），§18.6 是 **session 维度**（同一会话只一条 active change）。两者正交：cwd 可有 N 个变更、跨 N 个 session；每个 session 只承载其中 1 条。客户在 dashboard（§8.6）看到的是 cwd 全集；进任一 session 只看到自己那条。

### 18.7 边界与错误处理

| 场景 | 返回卡片（标题 + 副标题） | 后续动作 |
| --- | --- | --- |
| 缺 cwd | `缺少工作区`（同 `missingCwd`） | 同既有 |
| baseline 缺失 / 不兼容 | `baseline_unavailable` / `baseline_incompatible` | 提示 `baf scaffold` 或导入企业 baseline |
| **OpenSpec 不可用（fixture 模式或未装 CLI）** | `openspec_unavailable · full-go-path 需要 OpenSpec · 下一步安装 CLI 或 baf scaffold` | 客户装 CLI 后 `/baf-go` 重试 |
| 会话未绑定 + 空描述 | `请先描述需求，或选择「继续」已有工作流` | 客户说需求 / 选继续 |
| active change `>= 2` | `多个活动变更，需显式指定` | 客户在卡上选一条 |
| active change = 1 + 新描述 | `本 session 已有工作流 · 请新开一个会话`（§18.6 守卫 5） | 客户新开 conversation |
| 当前 `intake` 未 confirm | `请 /baf-workflow-classify confirm` | 客户补 confirm |
| 当前 `drift` | `drift detected · 请选择复位目标节点`（转第 19 章候选卡） | 客户选点 |
| 当前 `completed` / `abandoned` | `当前 change 已终态` | 客户 `/baf-go <新描述>` 或放弃 |
| `verify` 失败（T11） | `必需检查失败 · T11 回实现` | 客户修复后 `/baf-go` 续跑 |
| T15 升级（fast-path 范围扩大） | `T15 已升级 full-go-path · 当前 clarify · 补齐 clarify/design/plan 后继续` | 客户 `/baf-go` 续跑 |
| 两个确认门任一处客户回复自然语言（非命令 / 非弹窗点击） | 卡片重放（幂等，状态不动） | 客户敲 `/baf-go`（重弹确认框）或 `/baf-go-confirm` |
| 模型在确认前重跑设计（`/baf-workflow-design`） | 单步驱动器成功；coordinator 不视为冲突，继续等确认 | 客户最终 `/baf-go` |

**错误码全部沿用 §0.1**（`tool_unavailable` / `openspec_unavailable` / `baseline_unavailable` / `baseline_incompatible` / `policy_missing` / `invalid_transition` / `intake_confirmation_required` / `scope_exceeded` / `protected_path` / `verify_required` …）；coordinator 不引入新错误码。

**待决项（已决，2026-09-17）**：「未绑定任何 active change 就调 mutating 工具」复用 `intake_confirmation_required`（`baf-guard` 的 `adjudicateFsWrite` 已有这条分支），**不新增错误码**——见 §21.1。取舍原文：语义上是「分类未确认」，实际含义是「压根没有工作流」，因此曾考虑在 `error-codes.md` 增补 `workflow_binding_required`；结论是 Phase 0 冻结的错误码清单是给企业看的 contract，为命名美感动它不划算，卡片首行的中文文案负责把话说清楚。

### 18.8 落地实现要点（与 §12 Phase 8.7–8.10 对齐）

- **不写新 drive 函数**：coordinator 仅组合既有 `command-drives.ts` / `pipeline.ts` 入口（唯一例外是 Phase 8.9 新增 `driveResumeStage`，那是补 §19 的能力缺口）。
- **不写新 bin**：`baf go` / `baf workflow-resume` 走 §9.1 形态 A（profile + patch），与 `baf workflow-*` 同树。
- **不破坏既有入口**：`/baf-help` 输出加 `baf-go` 与 `baf-workflow-resume` 各一行，不删 `baf-workflow-*` 与 `baf-check-*` 任何一项。
- **projection 新事件**：仅新增 `awaiting-confirm`（门 A/B 确认时间戳与门名）；不引入新 schema 字段。**⚠ 必须同时在 `projection.ts` 的 replay `switch` 里加一个 `case 'awaiting-confirm'`（空实现即可）**——那个 switch 是**穷尽**的，`default` 分支会 `throw new BafError('projection_corrupted', 'unknown projection event type')`。漏了这一步，任何含该事件的 projection 重放都会直接判损坏，属于「上线才发现」级别的事故。
- **i18n**：文案走 §10.2 既有 i18n；新增 key 清单在 §20.7 冻结，登记到 `packages/client/ui-baf-workflow` 字典。
- **桌面出包携带**：与 Phase 8 一并走 `pack-dsh.mjs`；`session-gate.ts` 需要 `agent.cordis.yml` 加一行 `baf-session-gate`，`baf-product-versions.json` 不增字段（仍 7 个 `dsh-baf-*` 包）。
- **测试新增**：单测覆盖 §18.4 路由表每条边 + §18.5 两个确认门 + §18.6 单会话守卫 + §18.3 三条绑定分支；`surface-parity.spec.ts` 加 `/baf-go`、`/baf-workflow-resume` 与 `baf go`、`baf workflow-resume` 两组一致性行。
- **风险**：① 模型在两个确认门之间反复 `/baf-go` → coordinator 幂等（重读 status 后无 op）；② 客户在确认门内改 cwd → 投影不可见（`readIndex` 空）；③ 多 session 同 cwd 并行写 projection → §4.7 既定单 writer + CAS 仍兜底；④ 启动门体检在首屏做 I/O → 见 §17.7 R19/R20。

### 18.9 Phase 8.7 落地记录（2026-09-17）

> §18.4–§18.6 是**规范**；本节记录实现时规范没写到、但必须定下来的五处细节。与 §21.6 / §21.7 同一性质：事后回溯「为什么这么写」的唯一依据。落点：`packages/baf/baf-workflow/src/go-coordinator.ts` + `src/session-focus.ts`。

**文件分工**

| 文件 | 职责 |
| --- | --- |
| `go-coordinator.ts` | `driveGo(input)`：绑定判定 → 读 status → 路由 → 渲染卡片。**纯路由**，不拥有任何 transition |
| `session-focus.ts` | `focusFor(cwd)`：本 session 焦点变更的进程内缓存（§18.6 守卫 3 的「旁路」） |

`driveGo` **故意不放进 `command-drives.ts`**：`surface-parity.spec.ts` 的 `DRIVE_TO_SLASH` 是「一个 drive = 一次阶段转换」的严格映射，coordinator 组合 drive 却不拥有转换，放进那张表会让映射语义失真。它也**不是第五个入口**——它是「入口的组合」，四条表面（slash / CLI / Remote / drives）照旧，`/baf-go` 只是在 slash 与 CLI 两条上各加一行。

**五处实现细节（就地拍板）**

1. **`intake` 已 confirm 但未 open → 继续把它 open 完，不报错。** §18.4.2 该行的「下一步」写的是 `pipeline.driveOpenStage` / `driveFastPathOpenStage`；coordinator 用 `driveClassify(cwd, 'confirm change=<id>')` 达成同一效果。理由：其余三入口都把「confirm + open」当**一个动作**，在这里反过来要求客户重敲命令是把实现细节泄漏给客户。
2. **`baf-go <描述>` 的拒绝判定放在焦点判定之前。** 只要 cwd 里存在 active change，带需求的调用一律返回「本会话已有工作流」卡——**即使**焦点就是那条 change。理由：需求文本是「开始新工作」的信号（§18.6 守卫 5），焦点不能把它降级成「对当前变更的补充说明」。补充说明直接对模型说即可，那作用于当前变更，不需要走命令。
3. **焦点变更已终态时仍然绑定，渲染「已终态」卡。** `resolveBinding` 的 `known` 参数取自 `index.changes` 全量 id（不只是 active 的），所以归档后客户再敲 `/baf-go` 看到的是「当前工作流已终态；请新开一个会话」，而不是「无未完成工作流」。理由：前者是**事实**（他刚归档了一条工作流），后者像是状态凭空消失。
4. **门的解锁判定是「看事件尾巴」。** `gateUnlocked()` 只读 `events.at(-1)`：尾事件是 `awaiting-confirm` 且 `gate` 匹配 → 视为本次调用就是客户确认；否则 `parkOnGate()` 补写一条 `awaiting-confirm`。这个「看尾巴」的写法正是解锁**恰好消耗一次**的原因——确认后流程往前推进、尾巴变成 `stage-entered`，再敲就又是「还没 park 过」。若改成「扫一遍事件里有没有该门」，卡会永久处于已解锁状态，客户能在设计未过目时被推到 plan。
5. **`awaiting-confirm` 是审计事件，不参与门禁判定。** 门是开是关，唯一依据是 `status.current` + `status.nodes.<node> === 'completed'`（与 §18.5 的「触发」条件逐字对应）；事件的唯一用途是「这次调用算不算确认」和审计时间戳。所以 §18.8 要求的 replay `case 'awaiting-confirm'` 是**空实现**。

**未落地项（明确记账，别当成已完成）**

- §18.4.3 双泳道视图：Tab 派生层从事件时间轴切分，未开始（§8.7.7）。
- 确认门在 Tab 上的高亮 / 按钮文案：未开始（§8.7.7）。
- 启动门（§18.3）在**本节写作时尚未实现**，是 Phase 8.8 的交付物——`resolveBinding` 已经把绑定判定的逻辑跑通，8.8 复用同一套判定而不是另写一份。**已于同日落地，见 §18.10**。

### 18.10 Phase 8.8 落地记录（2026-09-17）

> §18.3 / §20.3 / §20.4 是**规范**；本节记录实现时规范没写到、但必须定下来的八处细节。与 §18.9 同一性质：事后回溯「为什么这么写」的唯一依据。落点：`packages/baf/baf-workflow/src/session-gate.ts`（新增）+ `src/commands.ts` / `src/cmdline.ts`（接入）。

**文件分工**

| 文件 | 职责 |
| --- | --- |
| `session-gate.ts` | 探针（`probeToolchain`）+ 绑定判定（`resolveStartupBinding`）+ 卡片（`renderWelcomeCard`）+ 日志行（`sessionGateLogLine`）+ 模型侧 section（`sessionGateSection`）+ 挂载行（`apply`） |
| `commands.ts` | `/baf-welcome`：**卡片的唯一渲染入口**（门也走它）；`/baf-doctor` 改为消费同一份探针与渲染函数 |
| `cmdline.ts` | `baf welcome`（与 slash 同源渲染，§9.1 一致性）+ `baf doctor` 增体检块 |
| `projection.ts` | `isActiveChange()` 参数放宽为最小结构——`baf-go` / 门 / `command-drives.ts` 三处共用同一谓词 |

**八处实现细节（就地拍板）**

1. **探针缓存按 `cwd` + 挂载标志键控，TTL 30s。** 门跑完会**立刻**执行 `/baf-welcome`，两次渲染必须共用同一次 `git rev-parse` / `openspec --version`——否则首屏要等两遍外部命令（实测裸 workspace 合计约 1.7s，其中 `openspec` 首次经 Windows shell 拉起占 1.38s）。键里带上 `guardMounted` / `qualityMounted` 是因为那两项的结果取决于 composition，只按 `cwd` 键控会复用一份「preset 还没挂 guard」的旧结论。用 TTL 而不是「一会话一次」：长会话里工作区事实会变（中途 `baf scaffold` 装好 baseline），30s 既能压掉首屏的重复，又让客户手动重看时拿到新结果。
2. **门只读，不替客户落绑定。** §18.3.1 写的是「客户选『继续』→ 焦点缓存」，实现里**没有**把「选」做成一等步骤：卡片列出候选并印出**要敲的那条命令**（单条 `/baf-go continue`，多条 `/baf-go change=<id>`）。理由：绑定是一次**采纳**（§18.6 守卫 4），必须有明确的客户动作；首屏卡片是非交互文本，把「点一下」伪装成选择，会让「这条 session 是怎么绑上这条工作流的」在审计上无从追溯。所以「继续」= 敲那条命令，绑定仍只有 `resolveBinding` 一个入口，卡的【下一步】与 §18.6 的拒绝卡是同一套话术。
3. **`openspec --version` 经 shell 执行，超时降级为 `?` 而不是 `✗`。** 必须走 shell：Windows 上 npm 装的 CLI 是 `openspec.cmd`，而 `execFile` 在 `shell: false` 下拒绝启动 `.cmd`（Node 对 CVE-2024-27980 的修复）——同仓 `baf-quality` 包（`src/runner.ts:111-116`）用 `spawn(..., { shell: true })` 拉外部 CLI，是既有先例。安全性靠**命令串是字面量**：没有任何工作区数据插进 shell（变化的部分全部作为参数或作为独立探测项）。降级为 `?` 而不是 `✗`：把「探测不到」报成「没装」会把已经装好的客户打发去重装一个只是慢的 CLI；实测首次调用 1.38s，超过 1.5s 的项预算并非罕见。
4. **`/baf-doctor` 复用探针，而不是「从 doctor 里抽出来」。** §8.8.3 写的是「抽取 `baf-doctor` 既有探测逻辑成共享函数」，实现方向相反：新建 `probeToolchain`，doctor 改成它的消费方（`renderProbeLines()`）。理由：doctor 的既有探测散在 `commands.ts` + `command-drives.ts` 两处，先「抽出来」等于先合并两份再抽——多一步且仍可能抽出第三份；而两处的关注面本来就不同（doctor 是自检、卡是首屏），共享**渲染函数**比共享命令更容易保证逐字一致。
5. **卡片经 `ctx.commands.execute(agent, '/baf-welcome', [])` 投递。** 这是唯一能在**首个模型 turn 之前**把卡片放进转录的机制：`system/message` 要求有未结束的 turn（`packages/core/session/src/invariant.ts:145`），而合成的 `user/message` 会把话语强加给客户——等于替他做了「继续还是新开」的选择。代价有两条，都已在 preset 注释里写死：gate 行因此需要 `commands` 注册表（`inject: ['agents', 'commands']`），且**必须排在 `baf-commands` 之后**，否则首个 agent 创建时 `/baf-welcome` 还没注册。命令层缺失或抛异常都降级为一条 `logger.warn` + 一行日志（§17.7 R19）——**工作区再破也必须能开会话**，卡片退化成无卡但会话可用。
6. **模型侧事实走同步 section，读的是缓存快照。** `systemPrompt.section` 的 `text()` 是同步的，所以 section 只能读 `snapshotCache`。快照缺席时**不返回空串**而是返回「体检进行中」——模型需要在客户开口前就知道「暂时别假设已有工作流」，空串等于让它自由发挥。section 用 `order: 605`（`PLAN_POLICY: 500` / `TEAM_POLICY: 600` 之后、`PTC_ONLY: 800` 之前），名字 `baf:session-gate`。
7. **`tsconfig.base.json` 手工补三条映射，不重跑生成器。** `…/baf-workflow/session-gate`、`…/baf-workflow/cmdline`、`…/baf-guard/install` 三个说明符**在 HEAD 上就不存在**（既有的预置行早就解析不了，与本次改动无关）；`verify-cordis-config.ts` 现在只剩一条预先存在的 `apps/cli/tests/profiles/acp/cordis.yml` 报错。没有跑 `gen-tsconfig-paths` 重生成：它会重写整段生成区，并顺手带回无关漂移（`@deepseek-ai/dsh-baf-core/types` 一条手工映射会被删掉）。把「补缺件」和「重排生成区」分成两件事，是这次刻意留下的取舍。
8. **`版本` 在卡上只出现一次。** 写文档核对样张时发现首版实现把它印了两遍：一次是 `info` 态的体检行（`versionItem()`，与 §20.3 样张一致），一次是卡尾一个独立的 `【版本】` 分区（`versionLine()`，逐字相同的字符串）。删掉分区，并顺手去掉 `renderWelcomeCard` 的 `versions` 入参——那个入参只喂给了被删的分区，改由 `versionItem()` 自己调 `resolveBafProductVersions()`，留着会让「能注入版本号」成为一句空话（体检行根本不读它）。

**一条工具坑（不是代码问题，但会误导后来人）**

`npx tsx scripts/run-oxlint.ts <某个子目录>` 会报出成片的假阳性（`no-unnecessary-type-conversion` / `no-unsafe-*` / `require-await`）。原因：`.oxlintrc.json` 开了 `typeAware: true`，tsgolint 需要**整仓项目图**；只给它一个子树时部分类型退化成 `any`，规则就开始按错的前提开火。落地时实测：`packages/baf/baf-workflow` 子树报 47 条，其中一条落在**从未改动**的 `tests/fastpath.spec.ts` 上——同一个文件在仓库根调用下干净。判定标准是**仓库根**调用（`npx tsx scripts/run-oxlint.ts .`）：本次改动涉及的所有文件在根调用下**一条诊断都没有**。注意根调用本身也不是零基线（客户端 spec / `apps/web/tests` / `baf-guard/src/service.ts` 等未改动文件有约 28 条既有诊断，且**退出码为 0**），所以「lint 全绿」这句话不要写，能写的标准是「我改的文件不出现在输出里」。

**未落地项（明确记账，别当成已完成）**

- 桌面首屏的真实观感（卡片在 GUI 里的折行、`↳` 引导行是否够醒目）：要出包后在桌面里看，与 §8.7.8 同批。
- §8.7.7 的 Tab 确认门高亮与 §18.4.3 双泳道视图：仍未开始（属 §8.7.7）。
- §19.5 的 Tab 复位按钮 + `BafWorkflowTabRemote.resume()`：仍未开始。
- §20.2 骨架接线 / §20.7 i18n key 登记到 `packages/client/ui-baf-workflow` 字典：属 Phase 8.10；当前卡片文案是 `session-gate.ts` 里的字面量，**尚未**走 i18n。
- `gen-tsconfig-paths` 下次被谁调用时仍会报告 stale（它不认手工补的三条）——第 7 条已说明取舍。

### 18.11 Phase 8.10 落地记录（2026-09-17）

> §8.7.7 / §18.4.3 / §18.5 / §19.5 是**规范**；本节记录 Tab 上的三件配套落地：双泳道视图、确认门高亮 + 按钮、Tab 复位按钮 + `BafWorkflowTabRemote.resume()`。与 §18.9 / §18.10 同一性质。落点：`packages/baf/baf-workflow/src/lanes.ts`（新增）+ `src/pipeline-factory.ts`（新增）+ `src/tab-view.ts` + `src/command-drives.ts` + `src/index.ts`，以及 `packages/baf/baf-core/src/graph.ts` / `src/tab-view.ts`，以及 `packages/client/ui-baf-workflow/src/{client,types,index,typert.remote-client}` + `typert-artifacts/typert.remote-client.d.ts` + `client/remote-types.ts`。

**文件分工**

| 文件 | 职责 |
| --- | --- |
| `baf-workflow/src/lanes.ts` | `deriveLanes(events)`：在事件时间轴上以 `mode-upgraded` 为切点折两条泳道；纯函数、无副作用，Tab 每次刷新都重跑 |
| `baf-workflow/src/pipeline-factory.ts` | `pipelineFor(cwd)`：workspace → baseline + git revision + pipeline 的统一构造器；slash / CLI / Tab Remote 三入口共用 |
| `baf-core/src/graph.ts` | 把私有的 `FAST_PATH_ROWS` / `FULL_GO_ROWS` 提升为导出常量（§18.4.3 泳道行序的唯一定义者） |
| `baf-core/src/tab-view.ts` | 新增 `gateToTabView` 单源谓词、`'confirm-gate' \| 'resume'` 两个 action ID；`statusToTabView` 加 4th `extras` 参数 |
| `baf-workflow/src/tab-view.ts` | `buildWorkflowTabView` 接受 `resume?` provider；只有 `current === 'drift'` 时才调用 |
| `baf-workflow/src/command-drives.ts` | 复用 `pipeline-factory.ts` 的 helper；保留 `driveResumeStage` 的暴露 |
| `client/ui-baf-workflow/src/{client,types,index,typert.remote-client}` | i18n key 16 条、`<LanePanel>` / `<ResumeCard>` / `stripGate` UI、`@Remote('resume')` 方法 |
| `typert-artifacts/typert.remote-client.d.ts` + `client/remote-types.ts` | `resume` namespace 注册到 host `$bafWorkflowView` + client `$626166576f726b666c6f7756696577`，与 5 个既有 descriptor 并列 |

**五处实现细节（就地拍板）**

1. **§18.4.3 双泳道在派生层实现，projection schema 不动。** `lanes.ts` 是**读 events 不写 events** 的纯函数；`mode-upgraded` 事件是唯一切点，切点前/后的 slice 各折一份 per-node status。这样既符合 §18.4.3 「不要给 projection 加 lane 字段」的约束，又让 UI 可以在每次刷新时重画两条泳道而无需重建事件流。**实现陷阱**：intake 节点没有自己的 `stage-entered` 事件，其生命周期是 `intake-classified` + `intake-confirmed` 两条，fold 时必须**显式映射**，否则两条泳道上 `intake` 永远是空状态。
2. **升级边 `from`/`to` 从事件里读，不写死常量。** §18.4.3 要求图能「看」跳的是哪条边——硬编码 `implement → clarify` 会骗人。`from = lastEntered(before)` / `to = firstEntered(after) ?? DEFAULT_LANDING`，退化日志（升级前/后都为空）时降级到 `from = to = 'clarify'`，至少让边在屏上能看见而不是整个泳道视图塌掉。
3. **保留产物从 `stage-completed` 拼，不从 `nodes` 终态推。** 这是 §18.4.3 「升级前 fast-path 的产物不删」的落实路径：升级前 slice 里的 `stage-completed` 事件自带的 `artifacts` 数组是该节点真正写入磁盘的产物清单，把它平铺出来作为 `preservedArtifacts` 比从当前 status 推可靠（status 不保留文件路径，只保留阶段状态）。**lintspec 捕到一个**：`before.flatMap(event => event.type === 'stage-completed' ? event.artifacts : [])` 即可，不要先 `.filter` 再 `.flatMap`——TS 在 `.filter` 之后已收窄类型，比较就成冗余。
4. **§18.5 确认门用 `gateToTabView` 单源谓词。** 之前有至少两处独立判定「design 完成 / verify 完成 → 是否可推」，一处忘改另一处就成隐性 bug。集中后 `statusToTabView` 只问「当前节点是不是 parked 在 design/verify 且节点已完成」，命中则生成 `{ id, node, actionKey }` 让 UI 直接渲染按钮。i18n key `gate.confirmIntoPlan` / `gate.confirmArchive` 与按钮文案一一对应。
5. **§19 Tab 复位按钮复用 slash 候选集的同一份 provider。** `getTabView` 接受 `resume: (changeId) => Promise<{anchor, candidates}>`，provider 内部调 `pipelineFor(cwd).resumeOptions(changeId)`——`pipeline.driveResumeStage` 与 Tab 的「重置」按钮读的是**同一份** `earliestAffectedNode(status, signals)`。slash / CLI / Tab 三处候选集永远一致：避免「slash 里列 open/plan，Tab 里只剩 open」的隐性分叉。

**三条工具坑（不是代码问题，但会误导后来人）**

- **`stale src/*.js` 把 vitest 引入歧路。** 老旧的 `packages/*/src/*.js`（gitignored，但本地残留）在 Vite 解析下比 `.ts` 优先级更高——本节落地初期 lanes 测试全 9 例因 `gateToTabView is not a function` 红屏，根因是 `baf-core/src/tab-view.ts` 旁边的 `tab-view.js` 是上一轮的产物。清掉 `src/**/*.js` + `src/**/*.d.ts` + `src/**/*.js.map` + `src/**/*.d.ts.map`（共 115 文件）后立刻恢复。**怎么判定**：同一个测试在仓库根 `vitest run` 下报错，在已删 `.js` 的 git stash 下干净——就是 stale shadow。**记入[[baf-dsh-stale-src-js-shadowing]]**。
- **`tsc -b` 报 TS5055「Cannot write file '.../lib/types/types.d.ts' because it would overwrite input file」**——根因是 host (`tsconfig.host.json`) 与 client (`tsconfig.client.json`) 共用同一 `outDir: lib/types`，上一轮的 buildinfo 把 host 输出的 `types.d.ts` 标记为 client 的 dirty input。修法：删 `lib/tsconfig.client.tsbuildinfo` + `lib/` 整目录，再补 `src/types.ts` / `src/invariant.ts` 到 client 的 `files` 列表（`remote-types.ts` 引用它们）。
- **`.tsx` 模板字面量类型 = `WorkflowTabKey`**，无需 `as WorkflowTabKey` 断言——TS 已经把 `` `node.${WorkflowNodeId}` `` 收窄成 `WorkflowTabKey`，断言是 lint 上的噪音。本节落地时连带修了 `WorkflowView.tsx` 的 7 条诊断：`arrow-parens` × 1、`no-confusing-void-expression` × 4、`no-unnecessary-type-assertion` × 4、`no-unnecessary-type-conversion` × 2。

**未落地项（明确记账，别当成已完成）**

- 桌面首屏的真实观感（卡片在 GUI 里的折行、`↳` 引导行是否够醒目）：要出包后在桌面里看，与 §8.7.8 同批。
- §20.7 i18n key 与 `baf-welcome` 卡片的 i18n 化：16 条 lane/gate/resume key 已登记到 `packages/client/ui-baf-workflow` 字典；`session-gate.ts` 里的卡片文案仍是字面量（属 §8.10 的下一批）。
- 升级边当前**不带 stage 标签**（只标 from/to）；要不要按 §18.4.5 在边上画「fast-path 走 N0→N5、升级后走 N2→N7」的节奏条——属于视觉细节，等首屏观感回来再决定。
- `gen-tsconfig-paths` 下次被谁调用时仍会报告 stale（它不认手工补的三条）——§18.10 第 7 条已说明取舍。

---


## 19. `/baf-workflow-resume`：drift 之后的交互式复位

> **本章补的是一条曾经完全缺失的出口**。落地前的事实核对：
> - `packages/baf/baf-workflow/src/stages/drift.ts` 的 `detectAndRecord()` 会把 `drift-detected` 写进 projection，replay 后 `state.current = 'drift'`、被影响节点标 `drifted`；
> - `WorkflowService.transition()`（`workflow-service.ts`）在 T13 上允许 `drift → 最早受影响节点`；
> - `TransitionService` 之前的出口**没有任何 slash / CLI / Tab / Remote 入口暴露 T13**——`commands.ts` 注册的 11 个驱动器里没有 drift 或 resume；
> - `stages/pipeline.ts:480` 的 JSDoc 写着 `{@link driveResumeStage}`，但该方法**不存在**（失效引用）。
>
> 结果曾是：一旦 drift，客户在 UI 上**无路可走**，只能手工编辑 `.baf/projection/*.jsonl`。
>
> **现状（Phase 8.9 已落地）**：drive / slash / CLI 三层出口已接通，`driveResumeStage` 已存在且 JSDoc 引用有效；Tab 与 Remote 的入口见 §19.5 的「待完成」。

### 19.1 语义与边界

- 只解决 **N8 drift 的出口**（T13），**不引入第四条回环**；`verify → implement`（T11）与 `fast-path → full-go-path`（T15）各走既有入口。
- 目标节点**由 drift evidence 决定候选集**，客户在候选集内选；**不允许跳到「尚未完成或已失效」的阶段**（§5.2 T13 原文约束）。
- 复位写 `stage-entered`（附客户选择理由与触发信号），**不删除**任何已完成产物；已完成但失效的节点保持 `drifted` 标注。
- **与 `resume`（自动恢复）区分**：`resume` 是崩溃/重开后的**自动**恢复，阶段不变；drift 复位是**客户决策**，阶段可能回退。两者不能互相替代（§5.3）。

### 19.2 候选集怎么算出来

复用 `stages/drift.ts` 已有的纯函数 `earliestAffectedNode(status, signals)`，它已经实现了下面这张表；命令把它当**默认项**：

| 触发信号 | 最早受影响节点 |
| --- | --- |
| `artifact-missing`（如 `design.md` 被删） | 该产物所属节点（按 `STAGE_ORDER` 找最早的那个） |
| `git-revision-changed` / `baseline-id-changed` / `baseline-content-changed` | 在途节点（`status.current`）；已终态则 `verify` |
| `verify-report-stale` | `verify` |

候选集 = `earliestAffectedNode()` 及其**之前**的已完成节点（客户可以退得更早、不能跳得更晚），去掉不可重跑的 `intake` / `open`（这两步的记录不会被漂移作废），按**从晚到早**排列，第 0 项是推荐默认。`open` 时就被影响的退化场景里候选集退化为 `[anchor]`。

**已落地（Phase 8.9）**，三条落地时才暴露出来、文档必须记住的规则：

1. **锚点可复原**：`drift-detected` 落库后 `status.current` 被停到伪节点 `drift`，此时再调 `earliestAffectedNode()` 必须**从被标 `drifted` 的节点反查锚点**（`nodes[anchor] === 'drifted'`），否则会算出 `drift` 本身。函数已按「artifact-missing → 被标 drifted 的节点 → 在途节点 → `verify`」四段判定，**记录路径与复位路径共用同一个函数**（§21.5）。
2. **两条写 `drift-detected` 的路径已合并为一条**：`workflow-service.ts` 里 `to === 'drift'` 的那条分支**已删除**，`decideTransition()` 直接以 `invalid_transition` 拒绝调用方发起的 `transition({to:'drift'})`，调用方被指向 `driveDriftStage()` → `detectAndRecord()`。T12 的锚点算法全仓只有一份。
3. **所有比较都是「两侧都能观测」才成立**：`compareToLocked()` 在 `observation.baseline === undefined` 时**不再报 `baseline-id-changed`**。原先那条会把「探测方没挂 baseline」误判成「baseline 被删」，于是任何没有 baseline 的入口（如 `pipelineFor()` 在缺 `.baf/baseline.yml` 的目录里）都会把健康变更判成漂移。同理 `baseline-locked` 现在**记录 `contentHash`**（取自 manifest，而不是取自只存身份字段的 lock），否则内容哈希永远对不上，同样造成「每次都漂移」的假阳性；旧日志没有该字段时**跳过内容比较**而不是报警。

### 19.3 交互协议

`/baf-workflow-resume`（**无参数**）：

1. 先跑一次**只读**检测（`pipeline.resumeOptions(changeId)`，内部 `detectDrift(..., {record:false})`）——**不写事件**。
2. 无信号 → 卡片「当前无漂移，无需复位」+ 当前节点；`projectionVersion` 不变。
3. 有信号 → 卡片列出候选节点 + 每个候选的「为什么」（触发信号）+ 回退后需要重跑的阶段：

```
✗ drift detected · chg-0007 · 当前节点失效 · 请选择复位目标 · 点本行展开/折叠详情
────────────────────────────────
类型：系统斜杠指令（不是大模型回复）

【漂移证据】
  git-revision-changed  HEAD 从 4f2c1ab 移到 9d3e802（open 时锁定）
  verify-report-stale   verify-report.json 绑定 4f2c1ab，现为 9d3e802

【候选复位目标】（只能往更早选，不能跳过未完成阶段）
  /baf-workflow-resume verify     ← 默认 · 只重跑 verify
  /baf-workflow-resume plan       重跑 plan → implement → verify
  /baf-workflow-resume design     重跑 design → plan → implement → verify

【不做任何事的后果】
  流程停在 drift，所有 mutating 工具被 guard 拒绝
```

> **证据行的回退**：漂移是**早先**记录的时候，重新检测可能**一个信号都复现不出来**（它要比较的锚点正是它自己作废掉的那批）。这种情况下证据区**回退到 `drift-detected` 事件里记下的 `cause`**（`status.annotations.drift.detail`），卡片绝不允许出现「声称有漂移但不给理由」的空证据区。

4. 客户回一条带节点的命令（`/baf-workflow-resume verify`）→ 校验目标 ∈ 候选集（否则 `invalid_transition`）→ `pipeline.driveResumeStage(changeId, target)` → `WorkflowService.transition` 裁决 T13（`findRule` 里 T13 的判定**先于**通用 `to` 过滤，因此 `drift → <任意候选>` 都合法；终态目标仍归 T14/T16 自己的规则，证据检查不被跳过）→ 落 `stage-entered`（`cause = "drift-resume: <anchor> → <target> (<触发信号>)"`）→ coordinator 把 `current=<node>` 交回 §18.4.2 继续。
5. **幂等**：已在目标节点 in-progress 时返回「已在 `<node>`」卡，不重复写事件。
6. **不允许模型替客户选节点**——沿用 §5.6「多 change 强制选择」的同一原则：候选集由机器算，选择由客户做。

**复位同时清掉「停在 drift」这个状态**：`stage-entered` 会在 replay 时删掉 `nodes.drift`（它表示「当前停在 drift」，不是「历史上漂过」——审计靠 projection 里的 `drift-detected` 事件）。`WorkflowService.resume().drifted` 因此只看 `status.current === 'drift'`。被漂移作废的那个节点**保持 `drifted` 标注**，作为「它的产物已失效」的痕迹。

### 19.4 `baf-go` 的自动映射

- drift 状态下敲 `/baf-go` **不报错**，而是直接执行 19.3 的检测 + 候选卡片（这就是「`baf-go` 在 drift 状态下自动映射触发 resume」）。
- **`baf-go` 永不自动选节点**。原因：回退到哪个节点，等于客户在回答「哪些已做过的工作算作废」——这是产品决策，不能由模型或 coordinator 代答（§17.7 R18）。
- 客户在候选卡上选完节点后，再敲一次 `/baf-go` 即从该节点继续自动推进。

### 19.5 入口与落点

| 形态 | 调用 |
| --- | --- |
| slash | `/baf-workflow-resume [节点]` |
| standalone CLI | `dsh … -- workflow-resume [节点]` |
| desktop Tab | drift 节点上的「复位到…」按钮 → 候选下拉 |
| Remote（Typert） | `BafWorkflowTabRemote.resume(node?)` |

落点：`command-drives.ts` 新增 `driveResume`（组合只读检测 + 候选卡 + `pipeline.driveResumeStage`）；`stages/pipeline.ts` 新增公开只读 `resumeOptions(changeId)` 与写路径 `driveResumeStage(changeId, target, observation?)`（顺带改正原 480 行的失效 JSDoc）；`stages/drift.ts` 新增 `resumeCandidates()` 与 `rerunChain()`；`commands.ts` 注册 `/baf-workflow-resume`、`cmdline.ts` 注册 `baf workflow-resume`；`tab-remote` 加 `resume()`。

**已完成**：drive / slash / CLI 三层已接通（`surface-parity.spec.ts` + `cmdline.spec.ts` 快照同步更新）。
**待完成**：§19.5 表里的 Tab 按钮与 `BafWorkflowTabRemote.resume()` 仍是空缺——Tab 侧目前只能靠 slash/CLI 复位。

### 19.6 输出与错误

| 场景 | 卡片 | 错误码 |
| --- | --- | --- |
| 无 drift | `当前无漂移，无需复位` | — |
| 有 drift，列出候选 | `drift detected · 请选择复位目标节点` | — |
| 参数不在候选集 | `目标节点不在候选集内` | `invalid_transition` |
| 已在目标节点 in-progress | `已在 <节点>`（幂等，不写事件） | — |
| change 已是终态 | `当前 change 已终态，无需复位` | — |
| projection 损坏 | `projection_corrupted · 停在 seq <n>` | `projection_corrupted` |

---

## 20. BAF 工作流输出规范（状态行 / 卡片 / 日志）

> 需求：「工作流的日志打印需要标准和规范，需要明确状态等有用信息，要求打印关键信息，直观，易读，醒目，完整。」本章把这条需求落成**可执行的格式约定**；所有 `/baf-*`、`baf *`、Tab、Remote 输出共用同一套，不新增第四套输出通道。

### 20.1 三层输出，各司其职

| 层 | 谁看 | 载体 | 硬约束 |
| --- | --- | --- | --- |
| **L1 状态行** | 客户扫一眼 | CLI 末行 / Tab 顶栏 | ≤ 120 字符、单行、恒含 `change · 节点 · 下一步` |
| **L2 卡片** | 客户读 | `formatCommandReport()` 文本 | 首行 = 折叠态标题；展开 = 固定顺序分段正文 |
| **L3 日志** | 排障 / 审计 | `ctx.logger` + projection 事件 | 结构化 `key=value`、只打元数据、与 projection 同源 |

模型自然语言回复**不算** BAF 输出（§5.6：自然语言不是转换证据，也不是状态展示）。

### 20.2 L2 卡片统一骨架

沿用既有 `formatCommandReport(ok, headline, sections)`：

```
✓ <headline>                              ← 折叠态只看这一行
────────────────────────────────
类型：系统斜杠指令（不是大模型回复）

【状态】
【本次动作】
【产物】
【下一步】
【可用指令】
```

- section **顺序固定**、按需裁剪；**不许**自创 section 名。
- **标题（headline）约定**（沿用 2026-09-14 commit 的 tier-prefix 约定；2026-09-20 §22.17 H 起全部 BAF 卡片首行统一以 `· 点本行展开/折叠详情` 结尾——含错误卡 / 门卡 / 缺参卡，不再是「指令全文」措辞或无后缀）：
  - 成功：`自动驱动 · <阶段> 已完成 · 下一步 <节点> · 点本行展开/折叠详情`
  - 待确认：`自动驱动 · <阶段> 已完成 · awaiting_customer_confirm · 点本行展开/折叠详情`
  - 错误：`<错误码> · <一句话结论> · 下一步 <客户动作> · 点本行展开/折叠详情`
- `【状态】`恒含五项：change id、mode、当前节点、节点状态、「距离完成还差 N 步」。
- `【下一步】`必须写成**客户能照做的动作**（「回复 `/baf-go`」「回复 `/baf-workflow-resume verify`」），不写「继续工作」这类空话。

### 20.3 会话启动卡（欢迎语）模板

§18.3 的启动门输出，固定用这个骨架：

```
✓ BAF 模式已就绪 · <workspace 名> · 无未完成工作流 · 点本行展开/折叠详情
────────────────────────────────
类型：系统斜杠指令（不是大模型回复）

【环境体检】
  ✓ workspace      D:\Source\...\deepseek-harness
  ✓ baseline       baf-baseline-c@1.2.0（2026-09-01 冻结）
  ✓ Git            4f2c1ab（drift 锚点）
  ✓ OpenSpec       1.4.2 · openspec/changes 存在
  ? C 工具链        未探测 · 首次进入 verify 时检查
  ✓ guard/quality  已挂载
  版本             baf-dsh 0.0.15 · dsh 0.1.5-alpha.1 · baf-* 0.1.5-alpha.1

【本会话绑定】
  无 —— 直接描述你的需求即可开始（intake 分类卡会自动弹出）

【下一步】
  直接描述你的需求（自动进入 intake 分类）；也可回复 /baf-go 重新查看本卡。

【可用指令】
  /baf-welcome                 重印本卡（绑定 + 体检）
  /baf-go                      推进当前工作流到下一个需要你确认的点
  /baf-workflow-resume [节点]   drift 后复位到合法节点
  /baf-status                  完整状态 · /baf-doctor 体检明细
  /baf-help                    全部指令与用法
```

- 首行结论随绑定分支变化：`无未完成工作流` / `检测到未完成工作流 <id>（当前 N<x>）· 继续还是新开？` / `检测到 <n> 条未完成工作流 · 请选择`。
- 缺件行 `✗` + 一行**可直接照做**的安装引导（缩进 `↳`）；未探测到用 `?`，**不伪装成 ✓**。
- `版本` 是**体检行的最后一行**（`info` 态、**不带符号**），不再另起一个同名分区——同一张卡里同一个数字出现两次违反「醒目、易读」。

### 20.4 L3 结构化日志行

```
[baf] <iso8601> <changeId> <node> <event> key=value key=value …
```

例：

```
[baf] 2026-09-17T10:22:03Z chg-0007 design  stage-completed        artifacts=design.md
[baf] 2026-09-17T10:22:03Z chg-0007 design  awaiting-customer-confirm gate=A
[baf] 2026-09-17T10:23:41Z chg-0007 plan    stage-entered          source=user-confirm
[baf] 2026-09-17T10:31:10Z chg-0007 drift   drift-detected         trigger=git-revision-changed from=4f2c1ab to=9d3e802
```

规则：

- **一行一事**；`key=value` 不引号、不嵌套、值内不含空格（需要空格时转 `_`）。
- **永不打印**：文件内容、prompt、token、凭证、绝对路径之外的私有信息——受 `secret-scan` / `secret_detected` 门禁。
- 日志是 projection 事件的**投影**，不是第二权威（§5.7）：`projection` 决定状态，日志只解释状态。

### 20.5 醒目度约定

| 符号 | 固定语义 | 不许挪用 |
| --- | --- | --- |
| `✓` | 成功 / 就绪 | 不用来表示「有内容」 |
| `✗` | 失败 / 缺失 | — |
| `?` | 未探测 / 未知 | 不许写成 ✓ |
| `■` | 停下等客户 | 不使用在自动推进路径 |
| `→` | 下一步 | — |

- **结论永远在第一行**（折叠态可读）。
- **需要客户动作的卡片，首行必须出现动作词**（「请确认」「请选择」「请新开 session」）。
- **无颜色依赖**（§14.3：非色彩状态表达），颜色只是增强。

### 20.6 i18n

所有 L1 / L2 / L3 文案（含卡片标题、体检行、引导语、Tab 泳道标签）走既有 i18n（§10.2），禁止硬编码——`verify-client-ui-i18n` 门禁会拦。

- 门禁的实际覆盖范围是**客户端面**（`packages/client/ui-*/src`、`packages/*/*/src/client/**`、`apps/web/src`、`apps/desktop` 渲染层），域层卡片文案不在它的 glob 里。因此域层（如 `session-gate.ts`）的中文字面量**目前不会被这条门禁拦下**——它是一条待办，不是已生效的保证（见 §18.10 未落地项）。

### 20.7 新增 i18n key 清单（Phase 8.7–8.10 冻结）

| key | zh | 用在哪 |
| --- | --- | --- |
| `baf.sessionGate.noActive` | 无未完成工作流 · 请描述需求 | §18.3 启动卡 |
| `baf.sessionGate.oneActive` | 检测到未完成工作流 {changeId}（当前 {node} · {mode}）· 继续还是新开？ | 同上 |
| `baf.sessionGate.multiActive` | 检测到 {count} 条未完成工作流 · 请选择一条继续，或选择新开 | 同上 |
| `baf.sessionGate.choiceContinue` / `.choiceNew` | 继续 / 新开 | 同上 |
| `baf.probe.ok` / `.missing` / `.unknown` | 就绪 / 缺失 / 未探测 | §20.3 体检行 |
| `baf.probe.hint.openspec` | 安装 OpenSpec CLI 或运行 baf scaffold | §18.3.2 |
| `baf.probe.hint.baseline` | 运行 baf scaffold 或导入企业 baseline | §18.3.2 |
| `baf.gate.awaitingCustomerConfirm` | 待客户确认 | §18.5 |
| `baf.gate.designDone` | 设计文档已实现 · 请确认是否进入 plan | §18.5 门 A |
| `baf.gate.verifyPassed` | verify 已通过 · 请确认是否归档 | §18.5 门 B |
| `baf.gate.replyToContinue` | 回复 /baf-go 继续 | §20.5 |
| `baf.go.cardTitle.continue` | 自动驱动 · {node} 已完成 · 下一步 {next} | §20.2 |
| `baf.resume.noDrift` | 当前无漂移，无需复位 | §19.3 |
| `baf.resume.candidates` | 检测到漂移 · 请选择复位目标节点 | §19.3 |
| `baf.resume.invalidTarget` | 目标节点不在候选集内 | §19.6 |
| `baf.binding.newSessionRequired` | 当前 session 已有工作流 · 请新开一个会话 | §18.6 |
| `baf.tab.lane.fastpath` / `.lane.fullgo` | 缺陷快路径（升级前） / 完整流程（升级后） | §18.4.3 |
| `baf.tab.edge.upgraded` | T15 升级：{from} → {to} | §18.4.3 |

---

## 21. 已拍板事项（Phase 8.7–8.10，2026-09-17 确认）

> 21.1–21.5 已由产品负责人确认；21.6 / 21.7 是 Phase 8.9 落地时才暴露、按同一原则（单一算法、不留分叉）就地拍板的补充项；21.8 / 21.9 分别是 Phase 8.7 / 8.8 的落地补充（细节记在 §18.9 / §18.10，本表只登记「有这件事」）。均按「结论」一栏实施；原始取舍记录保留在下面，便于日后回溯为什么这么定。

| # | 结论 | 影响 |
| --- | --- | --- |
| 21.1 | **复用 `intake_confirmation_required`**，不新增错误码 | 不动 Phase 0 冻结的错误码 contract；卡片中文文案负责把「没有工作流」说清楚 |
| 21.2 | **硬拦**：启动门选「新开」且 cwd 仍有未终态 change → 拒绝并提示新开会话 | §18.3.1 的「新开」分支改为硬拦；与 §18.6 守卫 5 合流 |
| 21.3 | **保留** `/baf-go <描述>` 边缘形式（未绑定时等价于说需求） | CLI / 脚本一次性投喂可用 |
| 21.4 | **C 工具链不进首屏**：显示 `? 未探测 · 首次进入 verify 时检查` | §18.3.2 检查表首屏只探低成本项 |
| 21.5 | **删掉** `transition({to:'drift'})` 分支，只留 `earliestAffectedNode()` 一条算法 | Phase 8.9 改 `workflow-service.ts` + `transition.ts` |
| 21.6 | drift 信号**两侧都能观测**才判定；`baseline-locked` 增补 `contentHash` | 修掉「每次检测都报漂移」的两个假阳性 |
| 21.7 | drift 锚点可从 `nodes[*] === 'drifted'` 反查；`nodes.drift` 只表示「当前停在 drift」 | 复位能算出候选集；复位后 `resume().drifted` 正确归 false |
| 21.8 | Phase 8.7 落地期五处原文未覆盖的细节，按「单一判定点 / 幂等 / 不猜」就地拍板 | 见 §18.9；只影响 `go-coordinator.ts` 内部，不改 §18 规范 |
| 21.9 | Phase 8.8 落地期八处原文未覆盖的细节（探针缓存键与 TTL / 门只读不代绑 / shell 拉 CLI + 超时记 `?` / doctor 反向复用探针 / 卡片经 `/baf-welcome` 投递 / 同步 section 读快照 / 三条 tsconfig 映射手工补 / 卡片上 `版本` 只出现一次） | 见 §18.10；不改 §18.3 规范，只有 §18.3.2 的 OpenSpec 行与 §20.3 样张按实现收紧 |
| 21.10 | 确认门统一走 §22 注册表 + 标准卡；模型被门挡住时只能调 `baf_gate_ask(gateId)`，不得自创选项 | 见 §22；session-gate 规则第 4 条 + SKILL.md Hard rules 第 6 条同步 |

### 21.1 「未绑定工作流」是否单列错误码

- **现状**：`baf-guard` 的 `adjudicateFsWrite()` 在 `!state.active` 时直接 `deny('intake_confirmation_required', 'no active change: start and confirm one in the workflow tab first')`——**「必须依托工作流才能落代码」这条硬门禁今天就已经生效**。
- **问题**：`intake_confirmation_required` 的语义是「分类未确认」，实际含义是「压根没有工作流」，reason code 名不达意。
- **选项 A（采纳）**：复用现有码。零改动；卡片首行的中文文案把话说清楚即可。
- **选项 B（未采纳）**：在冻结的 `overlay/docs/baf/error-codes.md` 增补 `workflow_binding_required`。语义准确；代价是动一次 Phase 0 冻结清单 + guard 分支 + 测试 + i18n。
- **理由**：Phase 0 错误码清单是给企业看的 contract，为命名美感动一次冻结清单不划算。

### 21.2 启动门选「新开」但 cwd 仍有未终态 change 时，硬拦还是提示

- **冲突点**：需求 3 要求「一个对话条目下仅支持一个工作流」，而 §18.6 守卫 5 只在「session 已有**绑定**的 active change」时硬拦。启动门选「新开」会把焦点置空，于是客户可以在同一 session 里建第二条 active change（cwd 里就同时挂着两条）。
- **选项 A（采纳）**：**硬拦**。选「新开」且 cwd 存在未终态 change → 卡片拒绝并提示「请新开一个会话」，与需求 3 的原意一致。
- **选项 B（未采纳）**：允许，只在卡上提示「旧的 `<id>` 仍 active，建议新开会话」。灵活，但会在 cwd 里堆 active change，dashboard 视图变吵。
- **理由**：如果客户确实要在同一会话里换工作流，让他先 `abandon` 旧的——这个动作本身也是显式决策。

### 21.3 `/baf-go <描述>` 边缘形式是否保留

- **选项 A（采纳）**：保留。只在「未绑定」时等价于说需求；已绑定时拒绝。CLI / 脚本一次性投喂需要它，且不破坏主路径。
- **选项 B（未采纳）**：彻底删除，`/baf-go` 只接受零参数。语义最干净，但 CLI 自动化只能靠「先启动门、再走 intake」两步。

### 21.4 启动门体检范围：C 工具链是否进首屏

- **问题**：C 编译 / 测试 / 覆盖率 / 静态分析要 spawn 多个外部进程（gcc / gcovr / cppcheck…），全部放进首屏体检会让欢迎卡慢几秒，且大部分会话在 clarify/design 阶段根本用不到。
- **选项 A（采纳）**：首屏只探测**低成本项**（workspace / baseline / Git / OpenSpec / guard 与 quality 挂载 / 版本）；C 工具链那一行显示 `? 未探测 · 首次进入 verify 时检查`，真正的逐项探测交给 Phase 7 的 QualityRunner。
- **选项 B（未采纳）**：全部进首屏，逐项 1.5s 超时。体检最全，代价是首屏最慢。

### 21.5 drift 的两条写入路径统一口径

- **问题**：`stages/drift.ts` 与 `workflow-service.ts` 各有一条写 `drift-detected` 的路径，算「最早受影响节点」的算法不同（详见 §19.2 的告警框）。
- **选项 A（采纳）**：`transition({to:'drift'})` 那条分支**删掉**（当前无用户入口），只保留 `driveDriftStage` → `detectAndRecord` → `earliestAffectedNode` 一条算法；`WorkflowService` 若仍需暴露 drift，改为转调同一函数。
- **选项 B（未采纳）**：两条都保留，但都改调 `earliestAffectedNode()`。
- **理由**：少一条路径就少一处分叉——这正好是 §17.7 R11「coordinator 不许自建第二套转换规则」的同一个道理。
- **落地补充**：拒绝点放在 `decideTransition()`（唯一决策点），而不是 `applyAcceptedTransition()`；`workflow-service.ts` 只删掉旧的 `drift-detected` 写入分支。见 §21.7。

### 21.6 drift 信号的判定口径：「两侧都能观测」才成立

- **问题**（Phase 8.9 落地时才暴露，是**两个真 bug**，不是文档笔误）：
  1. `baseline-locked` 只记 `baselineId` / `sourceRevision` / `lockedAt`，而 `lockedFromStatus()` 拿 `hashCanonical(status.baseline)`——**拿 lock 去比 manifest 的哈希，永远不相等**，于是任何有 baseline 的变更**每次检测都报 `baseline-content-changed`**。
  2. `compareToLocked()` 把 `observation.baseline === undefined` 解读成「baseline 被删了」。但探测方没挂 baseline（如 `pipelineFor()` 跑在没有 `.baf/baseline.yml` 的目录）与 baseline 真的被删，在这里**无法区分**——结果是把健康变更判成漂移。
- **选项 A（采纳）**：
  - `BaselineLock` 增补可选字段 `contentHash`，在 open 时**从 manifest 取值**落库；旧日志没有该字段时**跳过内容比较**（而不是报警，否则归档日志会永远自报漂移）。
  - `compareToLocked()` 的 baseline 分支加 `observation.baseline !== undefined` 前置条件，与 git revision、verify report 两条比较的既有口径（都是「两侧都有才比」）**对齐**。
- **选项 B（未采纳）**：把「baseline 缺失」当硬漂移，靠调用方保证探测完整。语义更严，但每个入口都得记住挂 baseline，漏一个就把健康变更钉死在 drift。
- **理由**：检测器的契约是「比较我**能**观测到的东西」。观测不到的事实不是变更证据。而「文件真被删」的场景在 Git 侧已经由 `git-revision-changed` 覆盖。

### 21.7 drift 锚点的可复原性与 park 语义

- **问题**：
  1. `drift-detected` 落库后 `status.current === 'drift'`，此时再调 `earliestAffectedNode()` 会返回 `drift` 本身——复位命令算不出候选集。
  2. `nodes.drift === 'drifted'` 在复位后**永不清除**，于是 `WorkflowService.resume().drifted` 仍报 `true`，session 启动门会把已复位的变更判成漂移状态。
- **选项 A（采纳）**：
  - `earliestAffectedNode()` 增补一段「从 `nodes[anchor] === 'drifted'` 反查锚点」，置于「在途节点」判定**之前**；记录路径与复位路径共用这一个函数（与 §21.5 同一原则）。
  - `nodes.drift` 语义收窄为「**当前**停在 drift」：`stage-entered` 在 replay 时删除该键；`WorkflowService.resume().drifted` 只看 `status.current === 'drift'`。历史由 projection 里的 `drift-detected` 事件承担。
  - 被漂移作废的那个节点**保持 `drifted` 标注**（不清），作为「它的产物已失效」的痕迹。
- **选项 B（未采纳）**：新增一个 `drift-resolved` 事件显式清除。更显式，但多一种事件类型、多一处 replay 分支，而 `stage-entered` 已经蕴含了「离开 park」这个语义。

### 21.8 Phase 8.7 落地期的五处实现细节

- **来源**：写 `go-coordinator.ts` 时暴露的边界，§18 原文没写到。与 21.6 / 21.7 同类：**规范不动，只把实现的口径钉住**。
- **五条**：① `intake` 已 confirm 未 open 时用 `driveClassify confirm` 走完，而不是要求客户重敲命令；② 带需求的 `baf-go` 在任何 active change 存在时都拒绝，**先于**焦点判定；③ 焦点变更已终态时仍绑定，渲染「已终态」而非「无未完成工作流」；④ 门解锁靠**读事件尾巴**（`events.at(-1)`），这才保证解锁恰好消耗一次；⑤ `awaiting-confirm` 只做审计，门禁判定一律看 `status.current` + `nodes`。
- **详细理由与反例**：见 §18.9 —— 那份记录是给日后改 coordinator 的人看的，别只读本节的一行摘要。

---

## 22. 确认门标准提问卡（Gate Cards · 2026-09-18 设计）

> 适用范围：BAF 工作流所有需要客户决策的点（intake 分类、design / archive / abandon 确认、drift 复位、**首次进入工作区的 scaffold**）。共六门，统一渲染、统一语义、唯一事实源。本章与 §5.6「阶段如何被驱动」、§9「命令」、§18「baf-go」配套；并对 §17 R12「未来可能被自创选项绕过的风险」打补丁。

### 22.1 三条不变式

1. **每个确认点只有一种提问形态**。问题文案、选项列表、每个选项触发的命令全部由域层注册表定义；会话卡 / 工作流 Tab / CLI 终端从同一份注册表渲染，**逐字一致**。
2. **Ask 与 Resolve 能力分离**。模型（以及任何自动驱动器）只能**弹卡**（ask）；只有真实人因输入才能**答题**（resolve）——GUI 按钮点击、输入框 slash 键击、Tab 按钮、CLI 键击。**模型侧不存在任何 resolve 工具**——「代答」不是被禁止，而是物理不存在。
3. **标准外操作不接受 = 机械强制**。confirm 类转换在状态机层校验 `evidence.source`（由宿主入口写死，模型不可传参伪造）；`.baf/` 与 `openspec/` 列入 `baf-guard` 防护路径，**「模型手写 scaffold」物理不可能**。

### 22.2 现状缺口（与本章一起补齐）

| 缺口 | 修复点 |
| --- | --- |
| 选项无注册表 → 模型在 system prompt 挡住时自由发挥编出第二路径 | §22.3 域层 `GATE_REGISTRY` 单一事实源 |
| scaffold 当时没有 slash / CLI 入口 → 模型只能问「请在 GUI 里点」 | §22.4 补 `/baf-scaffold` slash + `baf scaffold` CLI + Tab 按钮（与 §9.2 命令表同步） |
| 模型可调 `baf_stage_*` 直推 confirm 门（自然语言推动也是其中一种） | §22.7 `checkEvidence` 增加 `source` 白名单校验 |
| `.baf/baseline.yml` 可被模型用写文件工具伪造 | §22.8 guard `protectedPaths` 默认增 `.baf/**`、`openspec/**` |
| Tab 缺常驻门卡按钮（仅会话内弹文本卡） | §22.5 `tabView.pendingGate` 派生态，drift 卡同款模式 |
| 模型对「被门挡住」缺乏唯一动作指引 | §22.9 模型侧规则第 4 条 + `baf_gate_ask` 工具 |

### 22.3 核心：`GATE_REGISTRY`（域层唯一事实源）

新增 `packages/baf/baf-workflow/src/gate-cards.ts`：

```ts
/** 一个选项 = 一个文案 + 一个既有 slash 派发。模型不可增删。 */
export interface GateOptionSpec {
  readonly id: string              // 'init' | 'cancel' | ...
  readonly label: string           // i18n key（§20.7 体系）
  readonly command: string         // 只能映射到已注册 slash，如 '/baf-scaffold'
  readonly args?: readonly string[]
}

export interface GateSpec {
  readonly id: GateId
  readonly title: string           // 卡片标题
  readonly question: string        // 一句话问题，简洁直观
  readonly options: readonly GateOptionSpec[]   // 2~3 个；含唯一正向项与取消项
  readonly dynamicOptions?: 'resume-targets'    // resume 等动态选项：由 projection 派生，仍域层生成
}

export const GATE_REGISTRY: Readonly<Record<GateId, GateSpec>>
export function renderGateCard(spec: GateSpec, ctx?: GateContext): CommandResult
// 复用 formatCommandReport；卡片结构固定：标题 → 问题 → 编号选项行 → 「请点击工作流页签按钮，或输入对应命令」
```

首期注册六门：

| `GateId` | 触发时机 | 选项（→ 派发的 slash） |
| --- | --- | --- |
| `scaffold` | 会话绑定的工作区无 `.baf/baseline.yml` | [初始化工作区 → /baf-scaffold] [暂不初始化 → 取消] |
| `intake-classify` | intake 分类待确认 | [确认 · 完整流程 → /baf-workflow-classify confirm mode=full-go-path] [确认 · 缺陷修复路径 → /baf-workflow-classify confirm mode=bug-fix-path] [拒绝，重新描述 → /baf-workflow-classify reject]（§22.17 J 两路径改道可点） |
| `design-confirm` | design 完成、T?→plan 门 | [确认设计，进入计划 → /baf-go] [退回澄清 → /baf-workflow-clarify] |
| `verify-archive` | verify 通过、T14 门 | [确认归档 → /baf-go] [退回实现 → /baf-workflow-implement] |
| `abandon` | T16 | [确认放弃 → /baf-workflow-abandon] [取消 → 取消] |
| `resume` | drift（T13） | 目标节点选项由 `resumeCandidates()` 派生，仍域层生成 |

**关键约束**（写进 `gate-cards.ts` 顶部注释）：选项只能映射到已注册 slash 命令；新增门 = 改注册表 + 补测试，三端自动同步，**模型永远只引用 `gateId`**。

### 22.4 scaffold 三入口（解「选项 2：模型手写 scaffold」的痛点）

- **slash** `/baf-scaffold`：[commands.ts](packages/baf/baf-workflow/src/commands.ts) 加一条（tier-1 core，与 §9.2 命令表同步），handler → 新 `driveScaffold`；`humanConfirmed: true` 的依据就是「客户敲了这条命令」。
- **CLI**：[cmdline.ts](packages/baf/baf-workflow/src/cmdline.ts) 加 `baf scaffold` 子命令，镜像输出（既有 1:1 模式）。
- **Tab 按钮**：见 §22.5。
- **包边界**：baf-workflow 不直接依赖 baf-scaffold，沿用 `DriveAdapters` 注入模式，加 `scaffoldWorkspace` adapter（与 stack / guard adapters 同列）。

`scaffold` 命令在 §9.2 命令表的 `init` 行旁补一行；`/baf-scaffold` 是 `/baf-workflow-*` 之外的 tier-1 core 命令（同 `/baf-welcome` / `/baf-status` 同层）。

### 22.5 工作流 Tab 常驻门卡（与流程图分清）

[Tab 视图数据](packages/baf/baf-workflow/src/tab-view.ts)（`tab-view.ts` 的 projection）的门卡分两个作用域（详设见 §22.14）：**change 级门扩展既有 `gate?: WorkflowTabGate` 字段**（`gateToTabView` 单源谓词已存在，§18.11，映射 design 停靠 → `design-confirm`、verify 停靠 → `verify-archive`，并携带注册表的 question + options）；**工作区级门（scaffold）新增 `pendingGate?: { gateId, question, options[] }`**——两者都由域层从注册表+当前状态算出，客户端零判断逻辑，纯渲染按钮。

- **Tab 卡常驻**：「工作区状态 + 注册表」**实时派生**——无 baseline → `scaffold` 门卡；design 停靠 → `design-confirm` 门卡。只要门条件成立，卡就一直在 Tab 上，客户任何时刻切过去都能操作（**不是弹一次就消失的 toast**）。
- **会话卡一次性**：模型 / 协调器弹到会话里的文本卡会随消息滚走。**找回方式 = `/baf-go`**：停靠点上重跑 = 重弹 §22.17 确认框（无弹窗通道时重渲染卡片）、不写任何状态——「取消后再弹」场景零新逻辑。
- **取消 = 关卡不关门**：纯取消类选项（如「暂不初始化」）是 **no-op dismiss**——会话卡收起、状态不动、门条件未解除 → Tab 的 `pendingGate` 仍在。客户改主意有两条路：直接在 Tab 点，或敲 `/baf-go` 让卡重回会话。
- **真实转换项除外**：「退回实现」「退回澄清」这类选项本身是合法 transition，照常走 `WorkflowService.transition()` 并记 evidence——它们不是取消，是换方向。选项 → 命令的映射必须尊重 §5.2 转换表，注册表只登记表里存在的边。

### 22.6 scaffold 与流程图的关系

**不画进泳道 / 节点，作为「泳道区上方的前置条件卡」展示。**

**不放进流程图的三个理由：**

1. **作用域不同**。流程图画的是「一条变更」的状态机（changeId 作用域）；scaffold 是「一个工作区」的前置条件（workspace 作用域）。一个工作区可有多条变更共享同一份 baseline——把 scaffold 画进任何一条变更的泳道，要么在每条变更里重复出现，要么挂错归属。
2. **状态机契约不收它**。§5.2 转换表是变更级契约，scaffold 不在表里。硬塞进去要动域层事件、投影、恢复逻辑——而 scaffold 完成与否根本不是变更推进的一个「阶段」，是「能不能有变更」的**入场券**。

**放进 Tab 的折中形态**：Tab 在「无活动变更」时本来就显示模板态（参见 §20.4 「模板 = 尚无活动变更时的参考图」），而这恰好是 scaffold 未完成时的唯一可能状态。在该状态下于泳道区上方渲染前置条件卡（与 drift 卡 [§18.11 实现要点 4](overlay/...) 同款 `cardDrift` 模式）：探测无 `.baf/baseline.yml` → 显示注册表的 `scaffold` 门卡 + 按钮 → 点击走同一 `gateResolve` → 派发 `/baf-scaffold`。客户在 Tab 一步可达，**流程图语义分毫不动**。

> 一句话：**scaffold 是入场券，不是赛程中的一站——票根贴在门口（前置卡），不画进赛道（泳道）。**

### 22.7 转换层的 source 白名单（机械强制第二防线）

- `TransitionInput.evidence` 增加约定字段 `source: 'slash' | 'cli' | 'tab' | 'gate-card' | 'model-tool'`，**由各宿主入口写死**：
  - `commands.ts` 处理器写 `'slash'`
  - `cmdline.ts` 写 `'cli'`
  - Tab Remote 写 `'tab'`
  - 门卡按钮写 `'gate-card'`
  - `baf_stage_*` 工具体写 `'model-tool'`
  - **evidence 是服务端收到的对象，模型无法通过工具参数注入这四个值**
- [transition.ts](packages/baf/baf-workflow/src/transition.ts) `checkEvidence`：confirm 类转换（T14、T16、design→plan、verify→archive、scaffold）遇 `source === 'model-tool'` 或 source 缺失 → 拒绝，reason `gate_confirmation_required`，返回值非异常（沿用 refusal-as-value）。
- 自然语言推动：本就不是 evidence（SKILL.md 硬规则 2），source 白名单把这条规则从「约定」变成「校验」。

### 22.8 guard `protectedPaths`（机械强制第三防线）

- 基线 guard 默认 `protectedPaths` 增加 `.baf/**` 与 `openspec/**`（[baseline.schema.yaml](packages/baf/baf-core/schema/baseline.schema.yaml) 默认值 + scaffold 模板同步）。
- **存量基线兼容修正**（P2 实施要点，详见 §22.15）：工作区的 `protectedPaths` 是从 `.baf/baseline.yml` 读的——只改 schema 默认值**只保护新 scaffold 的工作区**，存量工作区与旧 fixture 不受保护。因此 P2 的正确做法是 guard 代码内置 `BAF_CONTROLLED_PATHS`（`.baf/**`、`openspec/**`）**恒生效**，基线只可在其上**增收**路径、不可减少这两条。
- baf-guard 是**模型工具写防护层**，宿主服务（scaffold drive、workflow drives）不经过它，所以合法流程不受影响；模型在任何阶段试图直写 `.baf/baseline.yml` 或伪造 `openspec/changes/**` 一律被工具层拦下。
- 效果：上一轮那个「选项 2」**不仅不该出现，而且做了也做不成**——双重保险。

### 22.9 模型工具 `baf_gate_ask`（模型唯一新增能力 · **P1 落地**）

```ts
tool: 'baf_gate_ask'
input:
  gateId: string                     // 必填，注册表 id
  changeId?: string                  // 变更域门（intake-classify / design-confirm / verify-archive / abandon / resume）需要
  requirement?: string               // §22.17 I：intake-classify 无 changeId 时传客户原话——铸变更 + 弹分类卡一步完成
  problem?: string                   // §22.17 J：缺陷修复草案·现象（与下四项同组，全部可选）
  rootCause?: string                 // §22.17 J：草案·根因
  files?: string[]                   // §22.17 J：草案·涉及文件
  test?: string                      // §22.17 J：草案·回归测试
  testCmd?: string                   // §22.17 J：草案·测试命令
行为:
  - gateId 不在注册表 → 返回结构化拒绝 { ok: false, reason: 'unknown_gate' }（值，不是异常）
  - 在注册表 + userQuestions 服务在场（§22.17）→ 弹出 §22.17 交互确认框并【等待客户选择】；
    客户点选项 → 经 driveGateResolve(gateId, optionId, source 'gate-card') 解析，
    工具返回的是【选择之后的真实结果卡】（如下一步阶段卡 / 复位结果卡），不是选项清单
  - intake-classify + requirement（无 changeId，§22.17 I）→ driveOpen(source 'model-tool') 铸变更后弹分类卡
    （detail 带系统初步判断与需求摘要）；未初始化 → 改弹 scaffold 门；已有待决 intake / 其他活动变更 → 结构化拒绝
  - intake-classify + 任一 bug 字段（§22.17 J）→ 分类弹窗 detail 追加「缺陷修复草案」一段；
    客户点「确认 · 缺陷修复路径」时五字段经 driveGateResolve 的 extraArgs 拼进 confirm 派发——
    一次点击同时定路径 + 交字段；缺必填字段照旧返回缺字段卡（改道事件已落，补齐再确认即可）
  - 在注册表 + 无弹窗通道（CLI / 测试 / 未装服务）→ 渲染标准卡返回卡片全文（含选项原文），
    客户经 Tab 按钮或斜杠命令自行解析
```

**落地形态**（详设见 §22.14，弹窗通道见 §22.17）：新入口 `@deepseek-ai/dsh-baf-workflow/gate-ask`，preset 加行、与 `baf-commands` 同层（isolate 外——工具注册表是宿主服务）。工具**只 ask 不 resolve**——弹窗里的点击是**客户的动作**，解析发生在 driveGateResolve（evidence source `gate-card`，§22.15 白名单），工具自己不构造任何 evidence、不替客户选。

配套改三处模型可见文本（**这是防自创选项的第一防线**）：

- [session-gate.ts](packages/baf/baf-workflow/src/session-gate.ts) 规则列表加第 4 条：**「被确认门挡住时，唯一动作是调用 `baf_gate_ask(gateId)` 弹标准选项卡；选项由注册表决定，不得增删、改写或在卡外建议其他路径；客户口头同意不是证据，请其点卡或敲命令」**。
  - **P0 已落地过渡版**：规则第 4 条已进 section（措辞为「按 §22 注册表弹出标准选项卡」，未点名工具）；P1 工具上线时措辞改为点名 `baf_gate_ask`。
  - **§22.17 H 加第 5 条**（2026-09-20）：「不得用通用提问工具（如 `ask_user_question`）替代确认门、预演分类或为工作流决策自创选项：初始化、分类、确认门、放弃、复位等工作流决策只能经 `baf_gate_ask` 弹出的注册表选项或对应斜杠指令；通用提问工具只用于与工作流走向无关的澄清」——堵第二起事故里「组件缺失真空 → 自创三选项」的路径。
  - **§22.17 I 加第 6 条**（2026-09-20 晚）：「客户陈述新需求（工作区已初始化、无进行中变更）时，唯一动作是调用 `baf_gate_ask`（gateId=intake-classify，requirement=客户原话）：工具会建立变更并弹出分类确认卡，客户点选后返回真实结果；工作区未初始化时该调用会自动弹初始化确认卡。不得用文字罗列手动步骤、不得让客户自己拼命令」——堵第三起事故里「分类决策点变成散文手动步骤」的路径。
- [skills/baf-go/SKILL.md](packages/preset/agent-presets/presets/baf/skills/baf-go/SKILL.md) Hard rules 同步加条目（P0 已落规则本体，P1 同步点名工具，§22.17 H 同步禁通用提问工具）。
- 工具返回给模型的就是卡片全文 —— 模型复述即可，**不组织选项，就没有发挥空间**。

### 22.10 防绕过清单

| 绕过尝试 | 挡在哪层 |
| --- | --- |
| 模型散文里自创第三选项 | section / SKILL 规则 + 工具只返回注册表卡片（第一防线，软） |
| 模型调 `baf_stage_*` 直推 confirm 门 | `checkEvidence` `source='model-tool'` → `gate_confirmation_required`（硬） |
| 模型直写 `.baf/baseline.yml` 伪造基线 | guard `protectedPaths`（硬） |
| 客户口头「你直接写吧」 | 模型标准回应 = 重新弹卡；且上两条硬防线兜底 |
| 客户敲了选项编号（非点击/命令） | 自然语言不是 evidence（既有 §5.6 规则，保持） |
| 有未决门时模型用 `ask_user_question` 代答 / 代问 | guard `gate_pending_ask_blocked`（硬，§22.17 J4） |

### 22.11 端到端时序（用 §22.2 事故重演验证）

```
客户: （描述需求）
模型: 工作区无基线 → 调 baf_gate_ask('scaffold')
     ← 卡片全文: "## 工作区未初始化
        需要先创建 .baf/baseline.yml 与 openspec/changes。
        [1] 初始化工作区（执行 scaffold）  → /baf-scaffold
        [2] 暂不初始化                     → 取消
        请点击工作流页签按钮，或输入对应命令"
     模型复述卡片，然后停住（无事可做）
客户: 点 Tab 上的「初始化工作区」按钮（或敲 /baf-scaffold）
宿主: driveScaffold(humanConfirmed: true, source 'gate-card')
     → baseline.yml / openspec/changes 落盘（备份语义照旧）→ projection 记证
模型: 下一轮看到绑定事实 → intake 分类 → 又到门 → baf_gate_ask('intake-classify') …
```

对照旧输出：**没有「选项 2」的位置**——注册表里没有它，模型工具造不出它，guard 也写不进。

### 22.12 分阶段落地

**P0 落地状态（2026-09-18 已合入 baf 分支，25 测试文件 / 197 项全绿，tsc 无新增错误）**：

| P0 交付物 | 状态 |
| --- | --- |
| `gate-cards.ts` 注册表 + `renderGateCard` / `renderGate` / `isGateResolvingCommand` | ✅ 已落地（`renderGate` 对未知 id 返回 `unknown_gate` 拒绝值，参数收 `string` 以承接 JSON 入参） |
| `/baf-scaffold` slash + `baf scaffold` CLI + `driveScaffold`（adapter 注入） | ✅ 已落地（`ScaffoldAdapter` 进 `DriveAdapters`；slash / CLI / 弹窗 / Tab 均经 `resolveScaffoldService` → `resolveIsolateService`（§22.17 H）解析，preset 的 `baf-domain` 组已含 `bafScaffold` isolate） |
| section / SKILL 第 4 条规则 | ✅ 已落地（过渡措辞，见 §22.9） |
| 测试 | ✅ `gate-cards.spec.ts`（16 项，含未知 gateId 拒绝）、`drive-scaffold.spec.ts`（6 项桩适配器）、surface-parity / cmdline / session-gate 快照同步 |
| 包边界 | ✅ baf-workflow **零**直接依赖 baf-scaffold（曾误加 dependency，核查时已移除——与 §22.13 取舍 2 对齐） |

**P0 明确未含、归并 P1 的两项**（原表把 `baf_gate_ask` 写进了 P0，实施时移入 P1，理由如下）：

1. `baf_gate_ask` 工具注册 —— 工具是「模型的 ask 面」，与 coordinator 自动弹卡、Tab pendingGate 同属「让注册表卡真正出现在客户眼前」的一批改动；单独上线工具而没有自动弹卡，模型仍无门可弹。P0 先把工具依赖的 `renderGate` 契约（含 `unknown_gate` 拒绝值）做实并测试锁定。
2. go-coordinator / session-gate 自动弹卡 —— 会话侧弹注册表卡（§18.5 两处停靠点 + 欢迎卡无基线分支），与工具、Tab 同批联调一次到位。

| 阶段 | 内容 | 测试 |
| --- | --- | --- |
| **P0**（✅ 已落地，即 Phase 8.11） | `gate-cards.ts` 注册表 + 渲染；`/baf-scaffold` slash + `baf scaffold` CLI + `driveScaffold`（adapter 注入）；section / SKILL 第 4 条规则（过渡措辞） | `gate-cards.spec.ts`（注册表快照 / 未知 gateId 拒绝 / 渲染含选项原文）；`drive-scaffold.spec.ts` |
| **P1**（Tab 交互 + 全部 ask 面，Phase 8.12，详设 §22.14）✅ | tab-view 门卡字段扩展（`gateId/question/options` + `pendingGate`）+ `driveGateResolve`（注册表派发，Remote 唯一解析面）+ `BafWorkflowTabRemote.gateResolve` + WorkflowView 按钮 + go-coordinator/session-gate 自动弹注册表卡 + `baf_gate_ask` 工具 | `surface-parity` 增加 `gateResolve` + `driveGateResolve` Remote-only 哨兵；`session-gate.spec` 欢迎卡补基线缺失/在场分支；`go.spec` 门 A 改查注册表标题 |
| **P2**（机械强制，Phase 8.13，详设 §22.15）✅ | evidence.source 白名单 + confirm 门校验；guard `protectedPaths` 内置恒生效（`BAF_CONTROLLED_PATHS` = `.baf/**` / `openspec/**`，详见 §22.15 D）；T14/T16 旁路 decideTransition 时也走源守卫；enterStage 把 source 透传进 evidence 让 checkEvidence 看见 | `transition.spec.ts` (38 用例：7 confirm 边 × 6 source × control T4)；`tool-guard.spec` 增 `openspec/**` + `.baf/baseline.yml` 拒写用例；`stage` 系列补 source stamp；`policy.ts` 导出 `BAF_CONTROLLED_PATHS` |
| **P3**（完善收口，Phase 8.14，详设 §22.16）✅ | 审计行（driveGateResolve `opts.audit` → `[baf] ... session baf:gate gateId=… option=… change=… source=… baseline=…`）；i18n 键冻结（zh = §22 GATE_REGISTRY 原文逐字；en 翻译；领域层渲染不切键，文档记「已冻结、可一次性切换」）；resume 动态选项 `candidates[0] === anchor` 钉死；E2E 验收流 `e2e-acceptance.spec`；Remote 源覆写 + 审计接线 `remote-source.spec` | `gate-i18n.spec`（zh 与 GATE_REGISTRY 逐字节对齐 + en 非空）；`e2e-acceptance.spec`（driveGateResolve 审计行 + 字段）；`remote-source.spec`（service.transition source 覆写 + 审计回调 + 沉默路径）；`resume.spec` 加 anchor pin |
| **P4**（弹窗通道，Phase 8.15，详设 §22.17）✅ | `gate-dialog.ts`（userQuestions 复用 + `GateAsk` 抽象）；go-coordinator 停靠即弹 + `/baf-go` 重弹 + `/baf-go-confirm` 不弹框直接继续；`baf_gate_ask` 工具升级为真弹窗（等待客户、返回结果卡）；`driveGateResolve` 内层 `/baf-go` 派发补 `change=` 绑定 | `gate-dialog.spec`（15 项答案映射 / 服务解析）；`go.spec` §22.17 组（10 项：门 A/B 弹+确认 / 暂停重弹 / go-confirm 零弹窗直通 / scaffold 门弹窗）；cmdline / surface-parity 快照同步 |

### 22.13 两个明确取舍（通俗版）

1. **一次性 token 不进 P0**：source 白名单已足够挡「模型代答」（source 由宿主写死，不可伪造）；token 防的是卡片重放，本地单机桌面威胁模型里优先级低。若后续要多端 / 远程会话，再补 TTL token（签发 / 消费 / 审计），架构上预留了 `gateId` 维度，不返工。**类比**：source 白名单 = 检票口只认四种真人渠道、且印章由检票口自己盖；token = 给票加防伪码防复制。本地剧场里票没有流通渠道，先不加码。
2. **scaffold 走 adapter 注入而非直接依赖**：保持 baf-workflow 与 baf-scaffold 的包边界，与既有 `DriveAdapters`（stack / guard）同一模式，测试里可塞桩。**类比**：直接依赖 = 把电器焊死在墙内线路里，换电器要砸墙；adapter = 装个标准插座，官方插头、测试假插头随插随换。

### 22.14 P1 完整设计（Tab 交互 + 全部 ask 面 · Phase 8.12）

> 目标：让注册表卡**真正出现在客户眼前**。P0 交付了注册表与渲染契约；P1 把三个 ask 面（会话 coordinator 弹卡、模型 `baf_gate_ask` 工具、Tab 常驻门卡）全部接到注册表上，并给 Tab 一个 resolve 通道（`gateResolve`）。

#### A. Tab 门卡字段（baf-core 单源扩展，不建第二派生点）

| 落点 | 改动 |
| --- | --- |
| [tab-view.ts](packages/baf/baf-core/src/tab-view.ts) `WorkflowTabGate` | 扩展字段：`gateId`（§22 `GateId`）、`question`、`options: { id, label }[]`（注册表原文）。既有 `id`/`node`/`actionKey` 保留（门高亮 Phase 8.10 消费者不受影响） |
| 同文件 `GATE_NODE` 旁 | 增映射表：`'design-to-plan' → 'design-confirm'`、`'verify-to-archive' → 'verify-archive'`（`confirmGateOf()` 谓词本身不动） |
| 同文件 `WorkflowTabView` | 新增 `pendingGate?: { gateId: 'scaffold'; question; options[] }` —— 仅工作区级门；`buildEmptyTabView` 分支按「探测无 `.baf/baseline.yml`」挂载（scaffold 未完成时 Tab 只可能是模板态，见 §22.6） |
| resume 动态门 | 复用既有 `WorkflowTabResume`（anchor + candidates，§19.4）：Tab 上 drift 视图的每个候选节点按钮即 resume 门的动态选项，点击走同一 `gateResolve(gateId='resume', optionId='resume-<node>')` |

#### B. Remote `gateResolve`（resolve 通道，typed 边界变更）

```ts
// packages/client/ui-baf-workflow/src/client/remote-types.ts
// + lib/typert.remote-client.d.ts（提交物，需 typert 工件再生成）
gateResolve: (request: BafWorkflowGateResolveRequest) => Promise<RemoteResult<WorkflowTabView>>

interface BafWorkflowGateResolveRequest {
  cwd: string
  changeId?: string          // resume / change 级门需要；scaffold 门为空
  gateId: string             // §22 GateId（运行时校验）
  optionId: string           // 必须命中注册表 options（或动态生成的 resume-* id）
}
```

宿主行为：① 校验 `gateId` / `optionId` 命中注册表（未命中 → 结构化拒绝值，**不猜最近选项**）；② 按 `option.command` 派发**同名 slash drive**（与 slash 共源，无第二套逻辑；`__noop__` 选项 = 直接返回刷新后的 TabView，不派发）；③ evidence `source='gate-card'`（P2 打点，见 §22.15）；④ 响应返回刷新后的 `WorkflowTabView`（与既有 Remote 方法一致）。**幂等**：门已解锁后再收 `gateResolve` → 返回「门已过」卡 + 当前 TabView，不报错（防双击/迟到点击）。

#### C. WorkflowView 门卡 UI

- 门卡渲染区：change 级挂在停靠节点上方（drift 卡 `cardDrift` 同款模式，§18.11 实现要点 4）；scaffold 前置卡挂在泳道区上方（§22.6）。
- busy 态：任一选项请求期间禁用整卡按钮（防双击派发两次）；失败显示拒绝卡原文 + 重试按钮。
- **intake 按钮迁移**：现有 `startIntake` / `confirmIntake` / `rejectIntake` Remote 按钮迁移为按注册表 `intake-classify` 门卡渲染（行为不变，渲染同源）；Remote 方法本身保留（迁移期双通道，P3 复盘收拢，见 §22.16）。

#### D. 会话侧自动弹卡（go-coordinator / session-gate）

| 落点 | 改动 |
| --- | --- |
| [go-coordinator.ts](packages/baf/baf-workflow/src/go-coordinator.ts) 门 A 停靠（`case 'design'` 的 `gateUnlocked` 未解锁分支） | 手写 `errorCard`（「确认门 A（需求 2）」段落）改为 `renderGate('design-confirm', { cwd, changeId })` 逐字卡，`statusLines` 段落拼在卡后。（§22.17 演进：停靠时即弹交互确认框，`/baf-go` 重弹、`/baf-go-confirm` 直通；无弹窗通道时本行为原样保留） |
| 同文件门 B 停靠（`case 'verify'` 同构分支） | 改为 `renderGate('verify-archive', …)` 同上（§22.17 同上演进） |
| [session-gate.ts](packages/baf/baf-workflow/src/session-gate.ts) 欢迎卡「无基线」分支 | 现在只有引导文案行；追加 `renderGate('scaffold', { cwd })` 卡片段（与 Tab pendingGate 同文，客户一步可达）。规则第 4 条同步点名 `baf_gate_ask` 会**弹出确认框并等待选择**（§22.17） |

#### E. `baf_gate_ask` 工具注册

- 新入口 `@deepseek-ai/dsh-baf-workflow/gate-ask`；preset `agent.cordis.yml` 加行，置于 `baf-commands` 同层（**isolate 外**——工具注册表是宿主服务，与 session-gate 同理由）。
- 工具体：入参 `{ gateId: string }` → `renderGate(gateId, ctx)`（P0 已实现；未知 id 返回 `unknown_gate` 拒绝值）→ 投递会话卡 + 触发 Tab pendingGate 刷新 → 返回卡片全文给模型。**只 ask 不 resolve**——不调用任何 drive，不构造 evidence。（§22.17 演进：`userQuestions` 服务在场时升级为**真弹窗**——工具阻塞等待客户选择，点击经 `driveGateResolve` 解析，工具返回**选择后的结果卡**；工具描述同步声明「等待客户、如实转述、客户没选不代答」。）
- section / SKILL 第 4 条规则措辞从「按 §22 注册表弹出标准选项卡」改为点名 `baf_gate_ask`（§22.9）。

#### F. 测试清单

`tab-view.spec`（change 级门扩展字段派生：design 停靠 → `design-confirm` 选项原文；无 baseline → `pendingGate` scaffold；resume 动态选项与 anchor 标注）；`go.spec`（到门即弹注册表卡、重跑重弹、卡文与注册表快照一致）；`gate-ask` 工具单测（渲染 / unknown_gate / 不触碰 drive）；surface-parity 快照 `REMOTE_METHODS` 增 `gateResolve`；e2e：点 Tab 门卡按钮 → 状态推进 → 门卡消失。

#### G. 风险与对策

| 风险 | 对策 |
| --- | --- |
| typert 工件（`lib/*.d.ts` 提交物）忘记再生成 → 客户端类型缺方法 | surface-parity 快照 + 构建步骤核对（§18.11 既定流程） |
| 双击 / 迟到点击派发两次 | busy 禁用整卡 + `gateResolve` 幂等（门已过 → 「门已过」卡，不报错） |
| intake 双通道（既有按钮 + gateResolve）行为漂移 | 两条入口都走同一 drive、同一 source 打点；迁移期并存，P3 复盘 |
| `WorkflowTabGate` 扩展是 baf-core 类型变更 | workspace tsconfig 映射既有，下游 ui-baf-workflow 同批编译；旧消费者只读旧字段不受影响 |

### 22.15 P2 完整设计（机械强制 · Phase 8.13）

> 目标：把 §22.1 不变式 3 从「规则约束」变成「校验拒绝」。两条硬防线：转换层 source 白名单（第二防线）+ guard protectedPaths（第三防线）。
> §22.15 已落地（commit `feat(baf): P2-C1 打点` → `P2-C2 confirm 边 source 白名单 + guard 内置受控路径`），下面记 as-built 收紧项。

#### A. confirm 类转换的精确规则集（以 §5.2 TRANSITIONS 表为准）

`T2`、`T3`（intake 分类确认）、`T7`、`T7a`（design 确认，含合并变体）、`T13`（drift 复位——目标节点由客户选定）、`T14`（archive 人因确认）、`T16`（abandon 人因确认）。共七条边。**scaffold 不在集合内**：它是工作区级操作、不是转换，人因确认由入口本身承担（§22.4）。full-go-path 的机器门禁转换（T4/T6/T8/T9/T10 等）不是 confirm 类，不受影响、无需 source。

#### B. source 白名单与校验语义

- `TransitionInput.evidence` 增加约定字段 `source: 'slash' | 'cli' | 'tab' | 'gate-card' | 'model-tool'`，**由各宿主入口写死**（evidence 是服务端收到的对象，模型无法经工具参数注入）。
- [transition.ts](packages/baf/baf-workflow/src/transition.ts) `checkEvidence`：上述七条 confirm 边遇 `source === 'model-tool'` **或 source 缺失** → 拒绝值 `gate_confirmation_required`（refusal-as-value，非异常）。
- **as-built**：发现并修了一处 C1 留下的失防 — pipeline `enterStage` 之前只把 `source` 盖到 `stage-entered` 事件下游、却没合并进 `decideTransition` 的 evidence，导致 checkEvidence 永远读不到 source、每条 confirm 边都被 C2 错拒。C2 把 `enterStage` 改为 `evidence = { ...evidence, ...(source ? { source } : {}) }`，并 T14/T16 旁路 decideTransition 时各自加直接 `isHumanSource` 守卫（拒绝文案含「走 /baf-* drive」指引）。
- **source 顺序**：driveAbandon (T16) 把源检查放到 humanConfirmed 检查**之前**，以便「缺源 + 缺确认」只暴露上游错误。

#### C. 打点清单（与校验同批落地——漏一处即客户操作被误拒，这是 P2 最大回归面）

| 入口 | source |
| --- | --- |
| [commands.ts](packages/baf/baf-workflow/src/commands.ts) 全部 slash 处理器 | `'slash'`（含 `/baf-go`——coordinator 从 log tail 观察到的解锁本就源自客户键击） |
| [cmdline.ts](packages/baf/baf-workflow/src/cmdline.ts) 全部子命令 | `'cli'` |
| Remote `startIntake` / `confirmIntake` / `rejectIntake` / `transition` | `'tab'` |
| Remote `gateResolve`（P1 新增） | `'gate-card'` |
| `baf_stage_*` 模型工具（若/当注册，见 D） | 宿主包装写死 `'model-tool'` |

**as-built 默认源策略 = 混合式**：drive 层（command-drives.ts）每个公开方法默认 `source: TransitionSource = 'slash'`；pipeline 层方法 `source?: TransitionSource` 可选无默认（confirm 边缺失即拒——留给 C2 的后备防线）。覆盖点只有 cmdline（`'cli'`）/ Remote（`'tab'` / `'gate-card'`）。

实施顺序：**先加全部打点（不开校验）跑全量测试 → 再开校验**；两步可拆两个 commit 便于二分定位（C1 / C2 两次提交）。

#### D. `baf_stage_*` 现状事实（设计输入）

仓库当前**没有**注册过任何 `baf_stage_*` 模型工具（全仓 grep 验证；仅 §5.6 文档作为远期提及）。因此 P2 的白名单是**前置防御**：若/当 `baf_stage_*` 注册，其宿主包装必须写死 `source='model-tool'`；在此之前，「缺失即拒」已兜底任何未打点路径。

#### E. guard protectedPaths 内置恒生效（存量兼容的正确解法）

- [baf-guard](packages/baf/baf-guard) 代码内置 `BAF_CONTROLLED_PATHS = ['.baf/**', 'openspec/**']`，**无论基线写什么恒生效**；基线 `protectedPaths` 只可在其上**增收**，不可减少这两条（收紧单向）。
- **as-built 放置点**：`BAF_CONTROLLED_PATHS` 检查**只**放在 [`adjudicateFsWrite`](packages/baf/baf-guard/src/policy.ts) — change-dir 放行之后、implement allowlist 之前。**不放**进 `adjudicateStructuralPath`，因为 verify 时的 `GuardPolicy.check('verify', …)` 会扫历史 touched 集，其中合法的 openspec change-dir 工件不能误伤。
- baseline.schema.yaml 默认值 + scaffold 模板同步更新，仅为文档一致性（不再承担保护职责）。
- **合法写入不受影响的根据**：clarify/design/plan 阶段产物由宿主 pipeline（drive stage handler）写盘，不经 guard；guard 只拦模型工具写。模型在任何阶段直写 `.baf/**` / `openspec/**` → 工具层拒绝卡 + 指引走 drive。

#### F. 测试清单

`transition.spec`：七条 confirm 边 × `{model-tool, 缺失, slash, cli, tab, gate-card}` 矩阵（合法放行 / 非法拒绝值 `gate_confirmation_required`）；非 confirm 边（T4 等）无 source 照常放行。**as-built**: `transition.spec.ts` 38 用例 — 7 confirm 边 × 6 source + T4 control + CONFIRM_EDGES 集合锁。
`tool-guard.spec`：写 `.baf/baseline.yml`、`openspec/changes/x/design.md` 被拦；基线增收路径仍拦；基线试图减少内置路径被拒。既有 transition / go / drives 测试补 source 打点断言；fixture 更新（内置路径对旧基线也生效后，个别直写 fixture 的用例改宿主写或显式豁免）。

#### G. 风险与对策

| 风险 | 对策 |
| --- | --- |
| 打点遗漏 → 客户合法操作被误拒 | 打点先行、校验后开的两个 commit；发布说明写明错误码与排查（`evidence.source` 可从审计行直接读） |
| 事件回放 / 投影重建路径构造 TransitionInput 无 source → 误拒 | replay 构造处显式置 `'slash'`（历史事件本就源自人因入口）；**不**按 projectionVersion 分界——保持规则无时间例外 |
| 内置路径影响存量测试 fixture | 测试清单 F 已列；一次性迁移，CI 兜底 |
| guard 错误信息未指引出路 | 拒绝卡文案带「走 /baf-* drive」指引（与 §5.6 唯一动作规则同文） |
| **enterStage 源未透传给 decideTransition（C1 失防）** | C2 显式合并进 evidence；T14/T16 直接源守卫兜底 |

### 22.16 P3 完整设计（审计、i18n、E2E 收口 · Phase 8.14）

> §22.16 已落地（commit `feat(baf): P3 收口`），下面记 as-built 收紧项。

#### A. 审计行（§20.4 体系）

- 门 resolve 派发后、验证通过后记一行：`[baf] <ISO8601> - session baf:gate gateId=<id> option=<optId> change=<id|-> source=<src> baseline=<id|->`；`__noop__` 取消不记（无状态变更）。
- 实施位：[command-drives.ts `driveGateResolve`](packages/baf/baf-workflow/src/command-drives.ts) 增可选 `opts?: { changeId?, audit?: (line: string) => void }`；`baseline` 经 `loadWorkspaceBaseline(cwd)` 懒读（失败即 `-`）。
- Remote 接线：[BafWorkflowTabRemote.gateResolve](packages/client/ui-baf-workflow/src/index.ts) 把 `audit` 接到 `this.ctx.logger.info`，`__noop__` 路径不调 audit（已记 dismissed 替代）。
- 事件证据 vs 审计行：门卡 `gateId`/`optionId` 只进审计行、**不**进 projection 事件 —— `awaiting-confirm` 事件已带 gate；事件是事实记录、审计行是运营仪表盘的输入。
- 测试：`e2e-acceptance.spec` 校验行格式（ISO8601 + `session baf:gate gateId=… option=… change=… source=gate-card`）；`remote-source.spec` 校验 Remote 路径 + service.transition source 覆写。

#### B. i18n key 冻结（§20.7 体系；Phase 8.10 已建 `ui-baf-workflow` 字典）

- key 规范：`gate.<gateId>.title` / `gate.<gateId>.question` / `gate.<gateId>.option.<optId>`；注册表 label 改存 key，zh 文案为 fallback 源；会话卡 / Tab / CLI 三端读同一字典。
- 既有 `GATE_ACTION_KEY` 两个 key（`gate.confirmIntoPlan` / `gate.confirmArchive`）并入同一前缀命名。
- **本次实施**：注册 + 快照冻结（zh 与 GATE_REGISTRY 逐字节对齐；en 翻译；**领域层渲染不切键** —— GATE_REGISTRY 仍是 single source of truth，字典是 1:1 镜像）。一次性切换留给后续 P0——切键工作面是 §20.7 全量 i18n 切换（不在 §22.16 范围）。
- 测试：[`gate-i18n.spec.ts`](packages/client/ui-baf-workflow/tests/gate-i18n.spec.ts) 注册表 ↔ zh 字典逐字节锁。

#### C. resume 动态选项收口

candidates 排序 latest-first、index 0 为推荐默认（对齐 `WorkflowTabResume` 语义）；anchor 标注已在 P0 `renderGateCard` 实现；Tab 动态按钮 = `gateResolve(gateId='resume', optionId='resume-<node>')`（P1 通道）。

本次实施：`resume.spec` 加 `expect(options.candidates[0]).toBe(options.anchor)`，钉死默认即锚点的契约。

#### D. E2E 验收流

- 以 Remote 层直连为主（不启 GUI）：`e2e-acceptance.spec.ts` 验证 `driveGateResolve` 审计行 + 字段；`remote-source.spec.ts` 验证 Remote 源覆写 + 审计回调 + 沉默路径。
- GUI 冒烟一条：`overlay/scripts/bench-spawn-to-shown.mjs`（P0 既有），运行窗口 shown 即视作 GUI 端通；不打 GUI 自动化框架。

#### E. 收口项

- intake 双通道（既有 Remote 按钮 vs `gateResolve`）：**本期保留双通道**。intake 按钮走 `confirmIntake/rejectIntake` Remote 直写、`gateResolve` 走 `gateId='intake-classify'` 注册表派发；两条路径都需人因入口（按钮或门卡点击）。收拢为单通道需 UX 评估（按钮消失是否影响快捷键用户），不在 P3 范围。
- §9.2 / §10.3 / §18 ↔ §22 交叉引用核对：本章随 P2/P3 实现收紧；与 §22.15 D `BAF_CONTROLLED_PATHS` 互文。
- error-codes 表：增 `gate_confirmation_required`（commit P2-C2 落地）。

### 22.17 交互确认框（gate dialog · Phase 8.15 · 2026-09-20 落地）

> **背景事故**（`tmp/session/1.jsonl`）：模型在门上调了 `baf_gate_ask`，工具返回的只是**文本卡**——没有对话框弹出，客户无从选择；模型随后凭空宣称「已弹出确认框」。§22.14 交付的三个 ask 面里，会话侧的「卡」终究是随消息滚走的文本，而需求原则要求**必须弹框让客户选项**（或 Tab 点按钮——这条 §22.14 已有）。本章把弹窗做成第一公民：**复用平台 `userQuestions` 瀑布**（QuestionComposer 接管输入），弹窗里的点击是**真实人因输入**，经 §22.1 既有的 `driveGateResolve` 单解析面落证据——注册表、source 白名单、审计行、i18n 全部原样复用，**零第二套解析逻辑**。

#### A. 弹窗通道：`gate-dialog.ts`（新宿主胶水模块）

- **复用而非新建 UI**：`ctx.userQuestions.ask({ questions, agent, signal })`（`@deepseek-ai/dsh-user-questions`，与 tool-ask-user 同款机制）——question 从 §22 `GATE_REGISTRY` 逐字生成（title 为问题、question 为 detail、options 带 description），resume 门由调用方传入的 `resumeCandidates` 动态生成（id `resume-<node>`、label `复位到 <node>`）。
- **答案映射**（`askGateDialog` 返回 `GateAskOutcome`）：`selected[0]` 的 label → 注册表 optionId，`answered`；`__noop__` 选项（如「暂不初始化」）→ `paused/dismissed`；skip、custom 自由文本、注册表未提供的 label → `paused/skipped`（§22 选项集封闭，不猜最近选项）；`ASK_CANCELLED` / `ASK_ABORTED` → `paused/cancelled`；其余错误（`NO_PROVIDER` 等）→ `unavailable`（调用方降级）。
- **服务解析**（`makeGateAsk(ctx, agent)`）：**两域**——接收 agent 的 realm ctx 优先，宿主行 ctx 兜底，try/catch 包裹；拿不到服务 → `undefined`，调用方软降级。（userQuestions 由 isolate 外的 `tool-ask-user` 行发布，两域 `get` 可见；弹窗派发所需的 stack/guard/scaffold 三个 adapter **不走这条路**——见 H 节 `resolveIsolateService`。）
- **类型分层**：coordinator（域层）对弹窗的全部认知 = 抽象类型 `GateAsk` / `GateAskOutcome`（[go-coordinator.ts](packages/baf/baf-workflow/src/go-coordinator.ts)）；`gate-dialog.ts` 是宿主胶水，对 `@deepseek-ai/dsh-user-questions` 仅 **type-only import**（`import type {}`，bundle 时擦除，无运行时依赖）；包关系 = peer/dev dependency + tsconfig reference（不进 runtime deps）。

#### B. coordinator：停靠即弹 + `/baf-go` 重弹

- `GoInput` 增两个可选参：`ask?: GateAsk`（弹窗通道）与 `confirm?: boolean`（不弹框直通）。
- **五个停靠点接弹窗**：未初始化工作区（scaffold 门）、待决 intake（intake-classify 门）、门 A（design-confirm）、门 B（verify-archive）、drift 复位（resume 门，仅当候选非空；§19 仍**永不自动选点**——弹窗只是让客户选，不是替客户选）。
- **门 A / B 新语义**（有 ask 通道时）：停靠即弹；此后每次 `/baf-go` 都**重弹**确认框——不再「静默解锁」。理由：「客户想再看一眼确认框」与「客户已确认」是两个动作，不能共用一条命令。弹窗里点确认 → `driveGateResolve` → 内层派发 `/baf-go`（source `gate-card`、**不带 ask**，防递归弹窗）→ 既有 log-tail 解锁检查 → 走正路径。
- **暂停语义**（dismissed / cancelled / skipped）：返回带【继续】提示的结果卡——`/baf-go 重新弹出确认框`、`/baf-go-confirm 不弹框直接继续`；状态不动、门不解除（「关卡不关门」，Tab pendingGate 仍在，§22.5）。
- **降级兼容（硬承诺）**：`ask === undefined` 时（CLI、vitest、未装 userQuestions 服务的 composition），全部行为与 §22.14 **逐字节一致**——门上第二次 `/baf-go` 即解锁的旧语义原样保留；既有 181 项 baf 测试零改动通过。

#### C. `/baf-go-confirm`：不弹框直接继续

- **正路径直通**：门 A → `beginDocStage('plan')`；门 B → `driveArchiveStage(humanConfirmed: true)`；待决 intake → `driveClassify('confirm change=<id>')`；未初始化工作区 → `driveScaffold`。drift 例外——仍转 §19 候选卡（自动选点 = 替客户决定哪些工作作废，永远不做）。
- **入口**：slash `/baf-go-confirm` + CLI `baf go-confirm`（`cmdline.ts` 镜像注册，HELP_FLOW 增行）；evidence source = `slash` / `cli`（§22.15 白名单内的人因入口）。
- **与 §21 拍板的关系**：2026-09-17 拍板「不做 `baf-go confirm` 子命令」针对的是 `baf-go confirm` **子命令形态**（怕与 intake 的 confirm 一词两义）；本次是**独立命令** `/baf-go-confirm`，两个完整命令名不冲突，路径依旧不通用（§18.5）。

#### D. `baf_gate_ask` 工具升级：从「返回卡片」到「等待客户」

- `userQuestions` 服务在场：工具**阻塞等待**客户在弹窗里选择 → 点击经 `driveGateResolve(source 'gate-card')` 解析 → 工具返回**选择之后的真实结果卡**（如下一阶段卡 / 复位结果卡）。工具描述同步改写：等待客户、返回的是结果、客户没选就如实说明、**口头同意不是证据**——模型不再有「拿到选项清单后自说自话」的空间。
- 无服务 / 无 cwd / 无接收 agent：卡-only（§22.14 行为，legacy）。
- session-gate 规则第 4 条措辞同步（§22.9）：「调用 `baf_gate_ask(gateId)`：它会向客户弹出确认框**并等待选择**，返回的就是选择后的真实结果」。

#### E. as-built 修复：`driveGateResolve` 内层 `/baf-go` 派发缺 change 绑定

GATE_REGISTRY 选项（如门 A「确认设计」）的 `command: '/baf-go'` 在 `driveGateResolve` 内层派发时原先**不带焦点变更参数**——单变更工作区侥幸可用，多变更（或焦点未缓存）时内层 `/baf-go` 落进「请选择本会话的工作流」守卫卡。这是潜伏 bug（既有 e2e 测试恰逢单变更而容忍）。修复：派发 rawInput 追加 `change=<opts.changeId>` 参数。§22.17 新测试（多变更弹出场景）锁定。

#### F. 测试清单（as-built）

- [`gate-dialog.spec.ts`](packages/baf/baf-workflow/tests/gate-dialog.spec.ts)（17 项）：label→optionId 映射（含 scaffold init）、`__noop__` → dismissed、skip/custom/未知 label → skipped、`ASK_CANCELLED`/`ASK_ABORTED` → cancelled、`NO_PROVIDER` → unavailable、resume 动态选项生成、question 构造（title/question/options 逐字）、`makeGateAsk` 两域解析（无服务 → undefined；agent realm 优先）、`toolDriveAdapters` 经 serviceFor 解析 / 双盲缺省（H 节）。
- [`go.spec.ts`](packages/baf/baf-workflow/tests/go.spec.ts) §22.17 组（10 项）：门 A 弹+确认 → plan；暂停 → 提示卡 + 状态不动；停靠后 `/baf-go` 重弹（非静默解锁）；门 B 弹+确认 → 归档（`terminal === 'completed'`）；intake 弹+确认 → confirmed；`go-confirm` 首次即过门 A（零弹窗）；`go-confirm` 归档已停靠门 B；未初始化工作区弹 scaffold 门；scaffold 暂停卡含双【继续】提示。
- `cmdline.spec`（子命令名单 + `go-confirm`）、`surface-parity`（`baf-go-confirm` slash / CLI 一致性）快照同步。
- 全量：`packages/baf/` + `packages/client/ui-baf-workflow/tests/` = 31 文件 / 280 项全绿（H 节修订后）；`pnpm build:lib` 通过。

#### G. 风险与对策

| 风险 | 对策 |
| --- | --- |
| 客户搁置弹窗 → `/baf-go` / 工具调用长时间挂起 | `exec.signal` 透传给 ask；会话取消走 `ASK_ABORTED` → paused（不报错）；结果卡的【继续】提示给出 `/baf-go-confirm` 捷径 |
| 弹窗与 Tab 双通道行为漂移 | 两条通道都收敛到 `driveGateResolve` 单解析面（§22.1 不变式 2 不破）；source 统一 `gate-card`，审计行可分辨 |
| 宿主 composition 未挂 userQuestions → 弹窗静默缺席 | `makeGateAsk` 返回 undefined → 逐字节降级为 §22.14 卡行为（测试锁定）；CLI 天然无弹窗，`baf go` 保持旧语义 |
| 内层派发递归弹窗（弹窗确认又触发弹窗） | 内层 `/baf-go` 派发**不带 ask**；`confirm` 与 `ask` 互斥分支先查 confirm |
| 多变更工作区内层派发丢绑定 | E 节修复 + 测试锁定 |

#### H. as-built 修订：跨 isolate 服务解析 + 首行统一（2026-09-20 下午）

> **第二起事故**（`tmp/session/2.jsonl`，0.0.15 便携版实测）：模型行为全部正确——先问需求、再调 `baf_gate_ask {"gateId":"scaffold"}`、客户在弹窗里点了「初始化工作区」——但工具返回 `✗ 初始化服务没有加载`。弹窗、点击路由、`driveGateResolve` 全部正常，**坏在最后一步取服务**：`bafScaffold / bafQuality / bafGuard` 都发布在 `baf-domain` **isolate** 里，而 isolate realm 对「声明它的组之外」的一切 `ctx.get` 都不可见——包括宿主行 ctx，**也包括 agent 自己的 realm ctx**。此前 `agent.ctx.get('bafScaffold')` 两域写法在桌面真机上**从未生效过**；测试没抓到是因为测试直接往 ctx 注入服务（没有 isolate）。组件缺失的真空随后被模型用通用提问工具 `ask_user_question` 自创三个选项填补（已违规，见 D 节规则），把客户引去「手动改预设配置」——工作流死锁在初始化前。

- **修法（唯一跨 isolate 读通道）**：agent-presets 发布的 `ctx.get('agentPresets').serviceFor(agent, name)`（session-controller / skill-catalog 同款）。新增 [`resolveIsolateService(ctx, agent, name)`](packages/baf/baf-workflow/src/session-gate.ts)：通道 1 = `serviceFor`（agent 带 realm 时）；通道 2 = 既有两域 `get` 兜底（CLI / 测试 / 无 isolate composition）。`probeMountFlags`（欢迎卡「检查组件」行）、`resolveScaffoldService`、`toolDriveAdapters`（弹窗派发）、`/baf-scaffold` 等斜杠行的 stack/guard 解析、Tab Remote（`ui-baf-workflow` 的 `resolveAdapters` / `tryGetScaffoldAdapter`）**全部改走它**——弹窗点「初始化工作区」后派发真的能拿到服务。
- **首行统一**：所有 BAF 卡片首行统一以 `· 点本行展开/折叠详情` 结尾（原「点本行展开/折叠指令全文」及无后缀的错误卡 / 门卡 / 缺参卡全部收口，§20.2 标题约定同步）。
- **提示语去术语**：scaffold 组件缺失卡的处理行从「请检查工作流预设是否加载了 baf-scaffold（isolate 组内）后重试」改为「请在设置里启用 BAF 工作流预设（含全部 BAF 组件）后，重新打开本会话再试」——isolate 是实现细节，不该漏给客户。
- **规则加严（防真空自创）**：session-gate 规则新增「不得用通用提问工具（如 ask_user_question）替代确认门、预演分类或为工作流决策自创选项」；`baf_gate_ask` 工具描述与 baf-go SKILL Hard rule 6 同步——工作流决策（初始化 / 分类 / 确认门 / 放弃 / 复位）只能经 `baf_gate_ask` 弹出的注册表选项或对应斜杠指令，通用提问工具只用于与工作流走向无关的澄清。
- **测试**：`session-gate.spec` +4（serviceFor 命中 / 生产事故回归：双 get 皆盲唯 serviceFor 可见 / get 兜底与双盲 → undefined）、`gate-dialog.spec` +2（`toolDriveAdapters` 经 serviceFor 解析三 adapter / 双盲全缺省）。全量 31 文件 / 280 项绿。

#### I. 弹窗所有权与设计原则 + 分类弹窗补全（2026-09-20 晚）

> **第三起事故**（0.0.15 便携版实测截图，18:03 / 18:05）：scaffold 弹窗**正常弹出且可点**（H 节修复生效）；但随后的「完整流程还是缺陷修复路径」决策点，模型回了**一段罗列手动步骤的长文**（「点工作流页签按钮 / 输入 /baf-scaffold / 再 /baf-workflow-open…我会在确认门里给你两种模式选」）——弹窗没有出现。由此确立下面的设计原则，并补全两处结构性缺口。

**设计原则（立法）：所有推动 BAF 工作流的决策，必须以注册表弹卡（或 Tab 按钮 / 斜杠指令）呈现给客户，由客户点选推动；模型只能触发弹窗、转述结果，不能用文字复述步骤、让客户自己拼命令，或用通用提问工具代答。**

**弹窗控制权三分（谁控制什么）**：

| 层 | 控制方 | 事实 |
| --- | --- | --- |
| 弹窗通道（能不能弹） | **平台 + 我们（宿主面）**，与模型无关 | `ctx.userQuestions.ask()` 是 isolate 外的宿主面服务，任何 preset 行随时可调；dsh 无需新增任何能力即可「自定义强制弹出」——§22.17 的门弹窗、`ask_user_question` 工具用的是同一通道。宿主面还可经 `ctx.on('session/event', …)` 订阅会话事件做状态驱动触发（acp / schedule 行同款），纯代码问题 |
| 弹窗内容（弹什么选项） | **我们（注册表）**，模型只读 | §22 `GATE_REGISTRY` 封闭选项集；模型调 `baf_gate_ask` 时无法注入第三个选项，乱点 label 落 `paused/skipped` |
| 弹窗触发（何时弹） | **混合**——这是我们补全的部分 | 确定性触发（我们的代码）：停靠即弹（`/baf-go` 五个停靠点）、Tab 按钮、`driveGateResolve` 派发。模型触发（软）：`baf_gate_ask` 工具——模型**可以选择不调**而改写文字，这是事故三的形态；靠规则 + 本节的工具补全压缩，硬拦截见「后续」 |

**本轮补全（两处结构性缺口）**：

1. **分类弹窗从「盲选」变「明选」**：原 intake-classify 弹窗 detail 只有注册表问句——客户点「确认分类」时**看不到系统判的是完整流程还是缺陷修复路径**。现 `GateDialogInput` 增 `judgment`（`judgmentOf(intake)` 取 mode/kind/summary/confidence），detail 追加两段：「系统初步判断：完整流程 · 新需求 · 置信 0.86」「需求摘要：<客户原话>」。协调器停靠弹窗与 `baf_gate_ask`（changeId 或 requirement 通道）都会带上。
2. **`baf_gate_ask` 增 `requirement` 参数（intake 引导）**：事故三的根因是**结构性**的——变更只能由斜杠 / Tab 建立（§22.9「模型唯一能力 = 问」），分类弹窗前的 open 无模型工具可达，客户陈述需求后模型只剩「写文字教客户敲命令」一条路。现 `gateId=intake-classify` 且不带 changeId 时可传 `requirement=<客户原话>`：工具经 `driveOpen`（source `model-tool`，非人因——open 不算确认）建立变更 → 弹分类弹窗 → 客户点选经 `driveGateResolve` 落证。守卫：工作区未初始化 → **自动改弹 scaffold 门**（工作流真正的下一个决策）；已有待决 intake → 拒新开并点名复用 `changeId`；已有其他活动变更 → 按 §18.6 拒绝（一个会话一条工作流）。规则三面同步：session-gate 规则第 6 条、工具描述、baf-go SKILL Hard rule 7。

**附带修复（客户端渲染，非工作流）**：QuestionComposer 卡片说明行（detail）原样式 `margin: 0 2px 8px`——左缘紧贴卡片边（标题内缩 24px），且沿用聊天气泡的 16px 段落距，视觉上「第二行」错位漂浮。已改为内缩 24px / 右 16px + 段落距收平（[QuestionComposer.module.css](packages/client/ui-user-questions/src/client/QuestionComposer.module.css)），窄屏媒体查询同步 18px。字体随「设置-字号」缩放是平台设计（与聊天正文一致），保留。

**测试**：`gate-dialog.spec` +6（judgment 渲染 / 无 judgment 保持原样 / requirement 引导：弹明示分类弹窗+点选后 open / 未初始化重定向弹 scaffold / 已有待决 intake 拒新开 / 无 changeId 无 requirement 讲明用法不弹）、`go.spec` +1（协调器 intake 弹窗携带 judgment，暂停分支状态不动）。

**后续（按序）**：① 分类弹窗把「完整流程 / 缺陷修复路径」做成**独立可点选项**；② bug-fix-path 分类在弹窗里带上模型整理的 problem/root-cause 字段；③ 宿主面 `session/event` 状态驱动自动弹；④ baf-guard 对工作流上下文里的 `ask_user_question` 拦截。——**四项已全部落地，见 §22.17 J**（①真机回归随 0.0.16 便携版打包）。

#### J. 四项收口：改道可点 / bug 字段进弹窗 / 状态驱动自动弹 / 通用提问硬拦（2026-09-20 深夜）

> I 节「后续」①②③④ 全部落地。设计原则（I 节立法）不变——本节把「弹窗触发」从混合收成**平台保证为主、模型触发为辅**，并把 H 节规则第 5 条（禁通用提问工具代答）从软规则升级为机械拦截。

**J1. 分类弹窗改道可点（原①）**：intake-classify 注册表选项从「确认分类 / 拒绝」改为三个——**确认 · 完整流程**（`/baf-workflow-classify confirm mode=full-go-path`）、**确认 · 缺陷修复路径**（`confirm mode=bug-fix-path`）、拒绝，重新描述。客户与系统判断不一致时点另一条路径即可，不再需要自己拼长命令。改判落新核心事件 **`intake-mode-set`**（baf-core events union 新成员；fold 语义：full→bug 镜像 intake-classified 的 bug 分支——`openspecSkipped={skipped:true, reasonCodes:['customer-override']}`、clarify/design/plan 打 skip 注记；bug→full 镜像 mode-upgraded——补开被裁剪阶段并清注记）。新服务面 `setIntakeMode(store, changeId, to)`：**同模式幂等返回先于已确认检查**（弹窗选项恒带 `mode=`，缺字段停靠后重试 bug 路径确认不应被「已确认不可改道」拒掉）；已确认后异模式改道 → `invalid_transition`。`driveClassify` 的 confirm 分支先消费 `mode=`：值不合法 → 参数卡；setIntakeMode 拒绝 → 「改道失败」卡；随后照旧 confirmIntake。

**J2. bug-fix 字段进弹窗（原②）**：`baf_gate_ask` 增可选参数 `problem / rootCause / files / test / testCmd`（模型从客户陈述整理的缺陷修复草案）。有任一字段时分类弹窗 detail 追加一段「缺陷修复草案（模型整理，点「确认 · 缺陷修复路径」时一并提交）—— 现象：…；根因：…；涉及文件：…；回归测试：…；测试命令：…」。客户点「确认 · 缺陷修复路径」时，`driveGateResolve` 新 `opts.extraArgs` 把五字段以 `key="value"` 形式拼进 confirm 派发（§12 tokenizer 无转义支持，值内引号/换行先剥除）——**一次点击同时定路径 + 交字段**。无草案点缺陷路径照旧返回「fast-path 缺少 Bug 字段」卡，但改道事件已落（`intake-mode-set`），补齐字段再点一次即进 fast path。协调器停靠弹窗（无草案）不受影响。

**J3. 状态驱动自动弹（原③，平台保证）**：新 preset 行 `baf-auto-pop`（宿主面 isolate 外，`inject: ['agents','userQuestions']`，新包导出 `@deepseek-ai/dsh-baf-workflow/auto-pop`）订阅 `ctx.on('session/event')`：**真打字**（`user/message` 且 `source.kind === 'user'`，插件/工具注入不算）、非斜杠、≥4 字符的消息落在**已初始化且无活动变更**的工作区时，先弹一问小卡「要把这句话作为新需求开始 BAF 工作流吗？」（作为新需求开始 / 只是聊天，不开始）。点「开始」→ `driveOpen(source 'gate-card')` 铸变更 → 弹带判断 + 两路径按钮的分类弹窗（J1）→ 点选经 `driveGateResolve` 落证，行日志记 `baf:auto-pop change=… classify/resolved`；点「只是聊天」/取消 → 什么也不发生（闲聊零审计垃圾）。每会话至多主动问一次；未初始化（scaffold 卡的事）/ 有活动变更（进行中变更自己的下一个决策）不弹。**「直接描述需求，分类卡自动弹出」自此是宿主面代码保证，不再依赖模型自觉**；模型并发调 `baf_gate_ask` 也不会双铸（既有待决 intake / 活动变更守卫拒新开并点名 changeId）。

**J4. 通用提问工具硬拦（原④，H 节遗留）**：baf-guard 新拦截分支——工具名 `ask_user_question` 且投影态 `gatePending`（intake 未确认，或事件尾为 `awaiting-confirm` 即停靠门 A/B）时拒绝：`[baf-guard] gate_pending_ask_blocked`（提示改用 `baf_gate_ask` 弹注册表确认卡）。投影态由 projection-state 同步重放 .baf 目录得到（与 guard 既有状态面同源，含 J1 新事件）。无未决门时通用提问保持合法——与工作流走向无关的澄清是其本职；空闲工作区的触发归 J3 的自动弹。H 节规则第 5 条自此有硬强制，违规不再只靠事后审计发现。

**触发三角覆盖图**（I 节「弹窗触发混合」收口）：

| 工作区状态 | 谁保证弹窗 |
| --- | --- |
| 空闲（已初始化、无活动变更），客户陈述需求 | J3 宿主面自动弹（平台保证，模型可缺席） |
| 有未决门（分类 / 门 A / 门 B） | J4 硬拦通用提问——模型只剩 `baf_gate_ask` / 斜杠 / Tab 三条合规路 |
| 任意时刻模型主动 | `baf_gate_ask`（带判断 + 草案 + 两路径按钮） |

三路全部收敛到 `driveGateResolve` 单解析面（§22.1 不变式 2 不破）。

**J5. 附带修复：projection 原子写 rename EPERM 竞态（2026-09-20 深夜，真机级）**：J3 落地后的满载压测抓到 auto-pop 确认链偶发（约 1/7）返回错误卡——给行链路加 `classify/resolved` 审计日志后定位：`writeAtomic` 的裸 `rename(tmp, path)` 在 Windows 上撞并发读句柄（Tab 刷新轮询 / 测试轮询正打开 index.json 或变更 jsonl）→ EPERM 瞬时失败 → `setIntakeMode` 的追加被 `改道失败` 卡吞掉 → 客户的确认点击死在错误卡上。**真机同款形态**（Tab 刷新就是并发读方）。修法：rename 对 EPERM/EBUSY/EACCES 短退避重试（25ms 起步 ×5，读方毫秒级释放）。配套：BAF 集成测试套（`packages/baf/*/tests/**`）在 vitest 配置里独立成 `baf-integration` 项目（`testTimeout: 60_000`）——满载并行下多阶段流水线测试屡撞默认 5s 预算（stages/bug-fix-path/lanes/resume/gate-dialog/tool-guard 各中过一次，都在 ~5.0s 顶点），单测默认 5s 不变。

**测试（as-built）**：[`auto-pop.spec.ts`](packages/baf/baf-workflow/tests/auto-pop.spec.ts) 新 5 项（真需求 → 预问 → 分类 → 确认全链落到 confirmed；「只是聊天」零铸；斜杠 / 短句 / 插件源不弹；未初始化 / 忙工作区不弹；每会话至多一次）；[`gate-dialog.spec.ts`](packages/baf/baf-workflow/tests/gate-dialog.spec.ts) §22.17 J 组 3 项（草案五字段渲染进 detail；full 判定点缺陷路径 → `已确认并进入 open` + `intake-mode-set` 事件落证 + openspecSkipped；无草案点缺陷路径 → 缺字段卡但改道已记录）；`gate-cards.spec` 两路径选项与 `mode=` 派发串；`go.spec` askAnswer 改 `confirm-full`；[`tool-guard.spec.ts`](packages/baf/baf-guard/tests/tool-guard.spec.ts) §22.17 J 组 4 项（未决门拦并指向 baf_gate_ask / 无未决门放行 / 空闲工作区放行（J3 之域）/ 磁盘态：未确认 intake ⇒ gatePending，confirm ⇒ 清除）。全量 `packages/baf/` + `packages/client/ui-baf-workflow/` + `packages/client/ui-user-questions/` = 37 文件 / 351 项 **6 连跑全绿**（含 J5 修复后压测）。

---

## Dev Note（非权威）

评审工作笔记 — 点击展开

对照基准日核过的仓库事实：`workflow-worker-thread` 的 `SUPPORTED_AGENT_OPTIONS` 含 `provider`/`model`；`ctx.tools.guard` 在 `tools/pre-execute` 之后单调拒绝；`overlay/desktop` 的 `signatureVerificationEnabled` 公开仓默认关；`overlay/plugin` README 仍写同步到 `~/.dsh/.agent-presets`；`ui-baf-desktop` 尚无工作流 Tab。若上游行为变化，以代码为准并回改本章表项。
