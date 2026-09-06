# baf-dsh 与上游 DeepSeek Harness 版本对照

`baf-dsh` 使用独立版本号，不跟随上游 `@deepseek-ai/dsh` 的版本。发布 baf-dsh 时在本表追加一行，记录当时打包所用的上游版本与插件包版本。

| baf-dsh | 上游 DeepSeek Harness（根 package.json） | bafPlugin | 说明 |
|---------|------------------------------------------|-----------|------|
| 0.0.1 | 0.1.0-rc.7 | — | 首个桌面安装包：Electron 托管 `dsh web`，NSIS + Node 检测/随装 |
| 0.0.2 | 0.1.0-rc.8 | 0.0.1 | splash 双 logo；侧栏品牌；GitHub Releases 更新通道与设置「版本与更新」 |
| 0.0.3 | 0.1.0-rc.8 | 0.0.1 | 版本升级能力完整入包（设置页 / splash / UpdateService）；`bafPlugin` 命名 |
| 0.0.4 | 0.1.0-rc.8 | 0.0.1 | 品牌 Hero、IDE 快捷打开、帮助站骨架（MkDocs）；修复 Windows 路径含空格时 VS Code 无法启动 |
| 0.0.5 | 0.1.0-rc.8 | 0.0.1 | splash/关闭对话框打磨；侧栏 Sora 标与空状态「BAF」徽标；modules.zip 启动自解压 |
| 0.0.5（开发同步） | 0.1.3-alpha.1 | 0.0.1 | `baf` 合并 upstream 至 0.1.3-alpha.1；适配移除 `dsh-client-runtime`；企业工作流设计已定稿，尚未发桌面版号 |
| 0.0.6 | 0.1.3-alpha.1 | 0.0.2 | Phase 0/1：官方 BAF shipped preset（仅内置、不可复制）；企业输入 OpenSpec latest / gcc / 覆盖率工程可配；桌面不同步 agent-presets 到 user root |
| 0.0.7 | 0.1.3-alpha.1 | 0.0.2 | Phase 2：`@deepseek-ai/dsh-baf-core`（baseline loader、adapter stub、`bafCore` isolate 挂载） |
| 0.0.8 | 0.1.3-alpha.1 | 0.0.2 | Phase 3：`@deepseek-ai/dsh-baf-workflow`（`resolveRoute`、`baf/route-resolved`、`RouteStatusView`） |
