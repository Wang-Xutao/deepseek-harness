# baf-dsh 与上游 DeepSeek Harness 版本对照

`baf-dsh` 使用独立版本号，不跟随上游 `@deepseek-ai/dsh` 的版本。发布 baf-dsh 时在本表追加一行，记录当时打包所用的上游版本。

| baf-dsh | 上游 DeepSeek Harness（根 package.json） | 说明 |
|---------|------------------------------------------|------|
| 0.0.1 | 0.1.0-rc.7 | 首个桌面安装包：Electron 托管 `dsh web`，NSIS + Node 检测/随装 |
| 0.0.2 | 0.1.0-rc.8 | splash 双 logo（SORA + DeepSeek）；侧栏品牌「BAF DSH」+ `v` 版本徽标 |
