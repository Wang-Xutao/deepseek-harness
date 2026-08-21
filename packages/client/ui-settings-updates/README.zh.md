# @deepseek-ai/dsh-client-ui-settings-updates

[English](README.md) | 中文

面向桌面的设置页：展示 baf-dsh / 开源 dsh / BAF 插件包版本，并通过 `window.bafDesktop` 检查与执行更新。非 Electron 环境仅提示需使用桌面应用。

## Model Experience

无。本包只渲染浏览器配置界面，不进入模型请求。

#### KV Cache effect

无；本包不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **更新依赖 Electron 桥** — 没有 `window.bafDesktop` 时本页仅作说明。
- **工具链版本延期** — 本页暂不展示外部工具链版本。
- **私有仓 Token / 验签延期** — 当前仅支持公开 Release 通道。
