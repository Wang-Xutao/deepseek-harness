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
