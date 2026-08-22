# @deepseek-ai/dsh-client-ui-baf-desktop

[English](README.md) | 中文

面向 baf-dsh 的桌面 UI：空状态标题后的黑白 Sora 标、会话标题栏可选的 VS Code / Cursor 打开按钮，以及侧栏「帮助」与 MkDocs 文档占位面板。

## Model Experience

无。本包只贡献浏览器界面，不进入模型请求。

#### KV Cache effect

无；本包不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **IDE 按钮依赖 Electron 桥** — 没有 `window.bafDesktop.getIdeTools` 时标题栏不显示按钮。
- **帮助文档仍为占位** — 尚未随包提供 MkDocs 内容。
