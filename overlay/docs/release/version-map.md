# baf-dsh 与上游 DeepSeek Harness 版本对照

`baf-dsh`（设置页显示为 **BAF DSH DESKTOP**）使用独立 semver，源文件为 [`overlay/desktop/VERSION`](../../desktop/VERSION)，发布前用 `npm run bump-desktop -- <X.Y.Z>` 更新。不跟随上游 `@deepseek-ai/dsh` 版本。

BAF 各插件包（`baf-core` / `baf-workflow` 等）在各自 `package.json` 中独立管理 semver，与 dsh 版本无关。插件 zip 的内部 `plugin-manifest.json` 版本仅用于更新通道工件身份，不在设置页展示。

| BAF DSH DESKTOP | DeepSeek Harness（根 package.json） | 说明 |
|-----------------|--------------------------------------|------|
| 0.0.1 | 0.1.0-rc.7 | 首个桌面安装包：Electron 托管 `dsh web`，NSIS + Node 检测/随装 |
| 0.0.2 | 0.1.0-rc.8 | splash 双 logo；侧栏品牌；GitHub Releases 更新通道与设置「版本与更新」 |
| 0.0.3 | 0.1.0-rc.8 | 版本升级能力完整入包（设置页 / splash / UpdateService） |
| 0.0.4 | 0.1.0-rc.8 | 品牌 Hero、IDE 快捷打开、帮助站骨架（MkDocs）；修复 Windows 路径含空格时 VS Code 无法启动 |
| 0.0.5 | 0.1.0-rc.8 | splash/关闭对话框打磨；侧栏 Sora 标与空状态「BAF」徽标；modules.zip 启动自解压 |
| 0.0.5（开发同步） | 0.1.3-alpha.1 | `baf` 合并 upstream 至 0.1.3-alpha.1；适配移除 `dsh-client-runtime`；企业工作流设计已定稿，尚未发桌面版号 |
| 0.0.6 | 0.1.3-alpha.1 | Phase 0/1：官方 BAF shipped preset（仅内置、不可复制）；企业输入 OpenSpec latest / gcc / 覆盖率工程可配；桌面不同步 agent-presets 到 user root |
| 0.0.7 | 0.1.3-alpha.1 | Phase 2：`@deepseek-ai/dsh-baf-core`（baseline loader、adapter stub、`bafCore` isolate 挂载） |
| 0.0.8 | 0.1.3-alpha.1 | Phase 3–4：`baf-workflow` route/projection/intake + 工作流 Tab；版本页改为展示各 BAF 包独立 semver |
| 0.0.9 | 0.1.3-alpha.1 | Phase 4 工作流 Tab 半交互；设置版本明细与独立 VERSION bump；splash/通用设置打磨 |
| 0.0.10 | 0.1.3-alpha.1 | Phase 5 full-go 七阶段（open/clarify/design/plan/implement/verify/archive）与门禁；baf-openspec 独立包并入桌面产物 |
| 0.0.11 | 0.1.3-alpha.1 | Phase 5.8：drift 检测（git revision / baseline id / baseline 内容 / verify-report 过期 / 已完成产物删除）+ abandon（T16）+ T11 修复回环；baseline-locked 投影锚点 |
| 0.0.12 | 0.1.3-alpha.1 | Phase 6：bug 快路径（T3 最小 bug-record / T5 根因证据 / 回归测试先行）+ T15 风险升级（自动/显式升级 full-go、fastpath-ledger 审计保留、OpenSpec 补建）；verify 按 mode 交换检查集 |
| 0.0.13 | 0.1.3-alpha.1 | Phase 7：baseline 驱动的质量门（StackAdapter/QualityReport 占位）+ 工具调用硬门禁（baf-guard：结构路径裁决 + 同步 projection 读 + 密钥扫描）+ 工作区脚手架（baf-scaffold：基线模板 + openspec 目录，人工确认与备份语义）；shipped preset baf-domain isolate 增 4 键 4 row + `baf-guard/install` 非隔离 row |
| 0.0.14 | 0.1.3-alpha.1 | Phase 8：slash 命令全集（`/baf-*` 经 `command-drives.ts` 委派，11 个 drive）+ `baf-cli` standalone CLI（`baf-cli/cmdline.ts` Commander 树，复用同一 drive；用 `--from-default-profile baf --patch packages/baf/baf-workflow/overlays/baf-cli.cordis.patch.yml` 启用，无新增 bin、`verify-application-entrypoints` 仍绿）+ `bafWorkflowView.listChanges` Typert Remote（Dashboard 表面，typert 边界类型在 `types.ts`）+ `surface-parity.spec.ts` 四入口一致性 snapshot |
| 0.0.15 | 0.1.3-alpha.1 | 启动性能优化（splash 提早关闭 + Node 路径缓存 + plugin sync fingerprint 跳过；spawn→shown 中位数 17.7s → 15.1s / -14.9%；新增 `overlay/scripts/bench-spawn-to-shown.mjs` A/B bench）+ P1 Phase 8.12 门卡 Tab 交互（`tab-view.pendingGate` + `BafWorkflowTabRemote.gateResolve` 注册表派发 + WorkflowView 按钮 + `baf_gate_ask` 模型工具）+ P2 Phase 8.13 机械强制（confirm 边 source 白名单 `'slash'/'cli'/'tab'/'gate-card'` vs `'model-tool'`/缺失 → `gate_confirmation_required`；guard 内置 `BAF_CONTROLLED_PATHS = ['.baf/**','openspec/**']` 恒生效）+ P3 Phase 8.14 收口（gate-resolve 审计行 `[baf] … session baf:gate gateId=… option=… change=… source=… baseline=…`；i18n 键冻结（zh 与 §22 GATE_REGISTRY 逐字节对齐）；resume `candidates[0] === anchor` 钉死；E2E 验收 / Remote 源覆写 spec） |
| 0.0.17 | 0.1.3-alpha.1 | `/baf-go` 派单（work-order dispatch）：客户手敲 `/baf-go` 时，凡「等模型补产物」的停靠点（clarify/design/plan 模板已装未填、open 的 proposal 裁决未过、implement 等 ledger、verify T11 退回）向本会话模型派一张**只读工单**（插件署名 `form=go-dispatch`，无 composer/不可编辑/绝不冒充客户原话），内容 = 裁决门自己的 `missing` 行 + 四条执行要求；模型补齐 → 回合结束 → §22.19 `docAdvanceDue` 自动弹下一阶段裁决卡。派单面仅 slash（Tab/门卡/`/baf-go-confirm`/模型工具/CLI 双保险拒绝），进程内账本同缺口只派一次、缺口变小重派、回合进行中不派；另：插件排队的 next-turn 消息改投 `placement:'context'`，不再进 QueueDock 可编辑窗口。**0.0.16 内容未单独发版，一并合并入本版**（弹窗可靠性四连修 + 卡死修复 A–G） |
| 0.0.18 | 0.1.3-alpha.1 | 六问题批次：① 门确认/Tab 推进/`/baf-go-confirm` 点击即派单（`dispatchOrigin:'customer'` 盖章制，宿主内部驱动仍拒绝）；派单账本**回合结束重置 + 按会话分账**（模型没补完缺口再敲 `/baf-go` 重派；`/baf-status` 后 `/baf-go` 不再死端——终态 focus 落回活动变更，两命令同源选择）+ OFFERED 指纹带产物签名（填完产物必重弹裁决卡）。② `plan.md` 由 `plan.json` 账本自动渲染（plan 完成/implement 完成两挂点，构造性一致）。③ 流程图每阶段 token 消耗（会话 usage 事件按阶段时间窗归因，节点卡点亮）。④ 归档终态可见：流程图全节点可点（含历史）、产物归档目录回读（rail 打开仍有效）、Windows rename 占用重试。⑤ 变更总览 dashboard（comet 风格：四统计磁贴 + 进行中/归档两表，任务进度/耗时/token）。全景图 `.agents/notes/implemented/feature/2026-09-23-baf-six-issues.md` |
| 0.0.20 | 0.1.3-alpha.1 | merge master 后八问题批次：设置页三修（轨迹图开关改 localStorage 设备本地偏好 `baf.trace-graph.pref` 并真正生效；「BAF流程模式」→「BAF 模式」·第二位·描述突出企业级定位且新会话默认进入；工作流=分支/版本与更新=下载图标区分）+ 工作流五修（新会话自动触发 baf-welcome——默认预设改 baf；斜杠指令卡默认展开；**/baf-go「format v4 message requires a producer-owned source kind」根修**——工单 source 由已废除的 `kind:'plugin'` 改 producer-owned `kind:'baf-workflow'`+`form:'go-dispatch'`（llm MessageSourceMap 新契约，UI 渲染「BAF 工作流」只读行），demo8 卡死的 clarify→design→plan 全链打通；右侧栏阶段详情删「通俗说明」项·全条目通俗化·修掉「已确认 · full-go-path」裸枚举泄漏）。另：0.0.19 为 merge 后重建版（未列行）。全景图 `.agents/notes/implemented/feature/2026-09-25-baf-post-merge-eight-issues.md` |
