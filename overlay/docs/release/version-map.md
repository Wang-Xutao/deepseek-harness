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
