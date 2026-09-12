# Agent Note: BAF Phase 7 — 基线驱动的 quality / standard / guard / scaffold

Status: implemented

[English](2026-09-13-baf-phase7-quality-standard-guard-scaffold.md) | 中文

## 问题

Phase 5/6 已落地 full-go 链与 fast-path/T15 升级（位于 `baf-workflow`），OpenSpec 本地文件适配器位于 `baf-openspec`。剩下的是**基线驱动的强制层**：按企业真实 C 工具链做工件质量门禁；把项目编码规范暴露到 prompt 里；一道硬工具调用门禁让 MCP / 子代理 / shell 旁路失效；以及一个工作区脚手架，让运营者不再手写基线清单。这些之前都不存在；verify 阶段要么跑通用检查，要么干脆跳过 quality。

## 决策

`packages/baf/` 下四个新工作区包，加 `baf-workflow` 的 verify 阶段接线。组合在 shipped preset 的 `baf-domain` isolate 中；一道非隔离的 install row 把 per-agent 工具门禁装好。

### `baf-standard` — 编码规范摘要 + prompt 渲染

`StandardSummary` (`schema: 1`) 携带 baseline id、source ref、availability（`'ready' | 'policy_missing'`）、reason codes、areas（`{id, titleKey, sourceRef}`）与 prompt 行。`summarizeStandard(baseline)` fail-closed：只要 `standard.mattPocockRulesRef` 还是 `<enterprise-tbd>`，availability 就折叠为 `policy_missing`，每个 area 带 `${sourceRef}#${anchor}`，prompt 指引运营者去替换占位——绝不偷偷塞默认值。`renderStandardPrompt(summary)` 每 area 一行，缺规范时末尾追加说明。`BafStandard` 是 Cordis 服务（`bafStandard`），暴露 `summary()` / `renderPrompt()` / `help()`。

### `baf-quality` — C 栈质量适配器

`QualityInput { workspace, baseline, changeId }` 与 `QualityReport { schema: 1, baselineId, workspace, revision?, toolVersions, checks, artifacts, passed, diagnostics }` 在 `baf-core/src/adapters.ts`。`createCStackAdapter({ timeoutMs?, executor? })` 产出 `StackAdapter`：

- `detect(ctx)` 探 `baseline.stack.compiler`，写入 `{compiler: '<version>'}` 到 `toolVersions`（占位 compiler 记探针失败）。
- `runQuality(input, signal)` 从 `baseline.stack.build / test / analyzers[]` 与 `coverage.{required, minimum}` 取命令，过 shell executor（`spawn(command, { shell: true, signal, timeout, killSignal: 'SIGKILL' })`，输出上限 8 KB / 默认 300 s），产出每行一个 `QualityCheck`（`kind: 'build' | 'test' | 'coverage' | 'analyzer'`，`command | null`，`passed`，`reasonCode?: 'policy_missing' | 'tool_missing' | 'timeout' | 'cancelled' | 'exit_code' | 'threshold_not_met' | 'coverage_not_reported'`，`exitCode`，`durationMs`，`output`）。占位命令记 `passed:false` + `reasonCode:'policy_missing'`。coverage 数值阈值 fail-closed：数字 `minimum` 但 stdout 没百分比 → `coverage_not_reported`（不能默认达标）。`passed = executed.length > 0 && checks.every(c => c.passed) && !signal.aborted`，其中 `executed = checks.filter(c => c.kind !== 'coverage' && c.command !== null)`；全占位基线发出 `'no executable checks (all commands are policy placeholders)'`，防止空执行集骗过门禁。含密钥的环境变量在写入报告前 redact。

`BafQuality` 是 Cordis 服务（`bafQuality`），暴露 `adapter(options)` / `help()`。

### `baf-guard` — 基线驱动的工具硬门禁

两个表面，共享 `policy.ts` 的政策内核：

- `GuardPolicy.check({workspace, baseline, paths, action})` —— `action:'verify'` 收集每条 touched path 的结构化 reason codes；`action:'secret-scan'` 读文件内容报 `secret_detected`；`'off'` 直接 `allowed:true`。
- `ToolGuard(execution)`（per-agent）—— 对 `write` / `edit` / `bash` / `pwsh` 调用以 `[baf-guard] <code>: <message>` 拒绝；其他不动。

`adjudicateStructuralPath` 覆盖**路径**政策（traversal、workspace escape、`.git` / `.baf` 系统资源、`baseline.guard.protectedPaths[]`）。在每次 `verify` 调用开头跑——与阶段无关。`adjudicateFsWrite` 串起：结构 → 密钥扫描 → active change → intakeConfirmed → DOC_STAGES change-dir 白 → implement allowlist；intake 确认后任何越界写入是 `scope_exceeded`，无 active change 的写入是 `invalid_transition`。`adjudicateShell` 拦破坏集（`rm -rf /`、`mkfs`、`dd if=… of=/dev/…`、`shutdown|poweroff|halt|reboot`、`git push --force`）+ 间接写集（`>` / `>>` 重定向、fd-to-file、heredoc、`tee`、`sed -i`、`perl -i`、`truncate`、`shred`、`cp`、`mv`、`rm`、`unzip`、`tar`、`wget`、`curl`）。密钥扫描识别 AWS access key、GitHub PAT / OAuth、GitLab token、通用 `api-key = …`、Slack token、PEM 私钥块。

`projection-state.ts` **每次调用**都重读 `.baf/projection/index.json` + change log + allowlist（来自 `openspec/changes/<id>/plan.json` 或 `fastpath-ledger.json`）—— 不缓存、无进程状态。损坏尾部 fail-closed：index 不可读 → `{active:false, intakeConfirmed:false, allowlist:[]}`；active change 但 log 不可读 → `{active:true, intakeConfirmed:false}`，写入持续失败直到 projection 修好。

`install.ts` 走 `baf-workflow/commands` 同样的非隔离模式：注入 host `agents`，挂 `agent/created` 与 `agent/disposed` 监听，每次创建从 `agent.session.header.cwd ?? process.cwd()` 取工作区，经 `agent.ctx.inject(['tools'], scope => scope.tools.guard(guard))` 装门禁。Fiber disposal + `ctx.effect(() => async () => …)` 收尾把门禁绑死在 agent 生命周期。导出 `name = 'baf-guard-install'` 与 preset 的 row id 对齐。

### `baf-scaffold` — 工作区 init 骨架（确认 + 备份）

`planScaffold({ baselineId? })` 产出 `.baf/baseline.yml`（对 `parseBaselineManifest` 结构有效，每个企业自有值仍是 `<enterprise-tbd>` —— §15 不许默认）与 `openspec/changes/.gitkeep`。`applyScaffold(workspaceRoot, plan, at?)` 不覆盖：缺失 → 创建；一致 → 跳过；不同 → 改名为 `<path>.baf-backup-<iso 时间戳>` 再写入；结果分 `created` / `skipped` / `backedUp` 三段，调用方能精确回报。`scaffoldWorkspace({ workspaceRoot, baselineId?, humanConfirmed, at? })` 是入口：`humanConfirmed:false` 直接返回 `{ kind:'refused', reason:'human_confirmation_required' }`（拒绝是一个值，不是异常 —— `scaffold` 在 `baseline.guard.requireHumanConfirmation` 里）。`BafScaffold` 是 Cordis 服务（`bafScaffold`），暴露 `scaffold(options)` / `help()`。

### `baf-workflow` verify 阶段接线

`StageContextOptions` 增 `stack?: StackAdapter` + `guard?: GuardPolicy`；`StagePipeline` 经 `createStageContext` 透传。`buildVerifyRunner(ctx, changeId, mode, options)` 跑三行新检查：

- **quality**：`required: ctx.stack && ctx.baseline`，调 `ctx.stack.runQuality({workspace, baseline, changeId}, signal)`，每条失败检查映射到一条 `${id}:${reasonCode}` 的 diagnostic，`ok = report.passed`，并 `Object.assign(options.toolVersions, report.toolVersions)` 让报告带 compiler 版本供 Web Tab 展示。
- **guard**：对每条 touched path 跑 `ctx.guard.check({workspace, baseline, paths: touchedPaths(), action:'verify'}, signal)`；reason codes 折进 diagnostic，`ok = report.allowed`。
- **secret-scan**：仅当 `baseline.guard.secretScan !== 'off'` 跑；否则 `ok:true` 标 skipped。

未挂载 adapter 的行记 `tool_unavailable` 并保持 `required:false`，保证原有 39/39 阶段测试全绿；是否必需由组合决定。

## 备选方案

### 为什么是四个独立包，而不是一个 `baf-platform`？

每个对应 §12.7 的独立能力，各自的类型表（`StandardSummary` / `QualityReport` / `GuardReport` / `ScaffoldOutcome`）。合一个包会强行把类型系统耦合在一起，下游要用任何一个都得依赖全部四个。Cordis isolate 键（`bafStandard / bafQuality / bafGuard / bafScaffold`）与 preset row 本来就按一服务一包形态走。

### 为什么 `BafGuard.policy(root)` 与 `ToolGuard` 分开，而不是一个？

`BafGuard.policy` 答"这一组 path 在当前 projection 下，对 action X 合不合法？"（同步、批——verify 和 secret-scan 用）。per-agent `ToolGuard` 答"这一次工具调用此刻合不合法？"（同步、单次——`tools.guard` 用）。两者都要读同一份 projection 但被不同层、不同节奏调用；合并要么让 verify 装 per-agent 守卫，要么让 agent 运行时接批接口，都不干净。

### 为什么 projection 不可读时 fail-closed 而不是 skip？

guard 是最后防线；projection 解析不了，agent 的审计链就断了，运营者也还原不出哪些动作曾被允许。返回 `{allowed:false, reasonCodes:['intake_confirmation_required']}` 强制重跑 intake 修复审计；返回 `{allowed:true}` 等于每次文件系统抖一下都偷偷放宽门禁。

### 为什么 `applyScaffold` 改名而不是拒绝/合并？

scaffold 是运营者"给我一份能跑的工作区"的入口；遇到差异就拒绝卡住引导，静默合并又会丢用户改动。改名两边都留：运营者拿到新模板，原内容进带固定后缀（`.baf-backup-<iso>`）的时间戳文件，grep 一搜就到。

### 为什么 `verify` 用 ledger 里的 `touchedPaths()` 而不是与 `sourceRevision` 的 diff？

ledger 已经按写入顺序记了 touched 与 allowlist 归属（在写入时就过了一次）。重新 diff `sourceRevision` 等于重做一次 allowlist 判定、把 fast-path 升级藏起来（升级后 change 在 implement 之前的产物来自 bug 记录），还和当初写入时的门禁算出不同的 allowlist。复用 ledger 让门禁与 verify 报告对称。

## 影响

- shipped preset 启用 Phase 7：`baf-domain` isolate 增 4 个键与 4 个 row；新非隔离 row 触达 host `agents` 服务。`baf-roster.spec.ts` 断言新 row；`baf-mount.spec.ts` 断言 `bafStandard`（以及 `bafQuality / bafGuard / bafScaffold`）在 isolate 下跨会话共享实例。
- verify 门禁现在基线感知：空基线或缺 adapter → `tool_unavailable`（不假阳性）；企业真实基线挂上 → 工具链回归就硬 fail。
- 每次工具调用（`write` / `edit` / `bash` / `pwsh`）在每个 agent 上重裁。intake 确认 / allowlist / 阶段政策任何一项翻转，门禁立即变化——没有进程内缓存决定。
- 工作区 scaffold 在没有 `humanConfirmed:true` 时直接拒绝，`/init`（和未来的 slash）不会再静默覆盖用户数据；差异文件落在 `.baf-backup-<iso>` 旁边。
- `tsconfig.base.json` 加 4 条 path mapping；`pnpm-workspace.yaml` 用 `packages/*/*` glob 自动收录。`overlay/scripts/pack-dsh.mjs` FORCE_PACKAGES 复制新 4 包到桌面 node_modules；`overlay/desktop/version-notes.json` 记录。
- Phase 7 体量：4 个新包、4 份 README + 4 份 README.zh + 2 份 README.i18n.yaml（baf-quality / baf-guard 暂未写 README——契约稳定但散文待补；和 Phase 8 Web Tab 一起）、一处 preset 改动、一处 verify 阶段改动。`packages/baf` 全量 vitest 17/17 文件 / 103/103 用例绿。
- 预先存在的并行测试 flake（Windows symlink 权限 + persona session-schemas）与 Phase 7 无关；`git stash` 后跑同一 `npx vitest run`，14 个失败原样出现，已确认无关。

## 后续（Phase 7 之外）

- Phase 8 slash / CLI / 桌面 IPC 暴露新服务：`/status` 显示 `standard.policy_missing` 的 reason codes；`/scaffold` 带确认提示；`/verify` 不推进 transition 重跑门禁。
- Web `WorkflowTabView` Remote 需渲染 `verify-report.toolVersions` 与 `bafStandard.summary`（报告 schema 已带，Remote 还没接）。
- `baf-quality` / `baf-guard` 的 README + README.zh（契约稳了，散文是后续贡献者第一手要看的）。
- Phase 9 把 `bafStandard.promptLines` 接入 agent 系统 prompt 构建，让规范无需显式调用就被参考。
