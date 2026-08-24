# baf-dsh 与上游 DeepSeek Harness 版本对照

`baf-dsh` 使用独立版本号，不跟随上游 `@deepseek-ai/dsh` 的版本。发布 baf-dsh 时在本表追加一行，记录当时打包所用的上游版本与插件包版本。

| baf-dsh | 上游 DeepSeek Harness（根 package.json） | bafPlugin | 说明 |
|---------|------------------------------------------|-----------|------|
| 0.0.1 | 0.1.0-rc.7 | — | 首个桌面安装包：Electron 托管 `dsh web`，NSIS + Node 检测/随装 |
| 0.0.2 | 0.1.0-rc.8 | 0.0.1 | splash 双 logo；侧栏品牌；GitHub Releases 更新通道与设置「版本与更新」 |
| 0.0.3 | 0.1.0-rc.8 | 0.0.1 | 版本升级能力完整入包（设置页 / splash / UpdateService）；`bafPlugin` 命名 |
| 0.0.4 | 0.1.0-rc.8 | 0.0.1 | 品牌 Hero、IDE 快捷打开、帮助站骨架（MkDocs）；修复 Windows 路径含空格时 VS Code 无法启动 |
