# @deepseek-ai/dsh-client-ui-baf-desktop

[English](README.md) | 中文

面向 baf-dsh 的桌面 UI：空状态标题后的黑白 Sora 标、baf-dsh 自有标题行（覆盖 `ui-brand-official` 的上游品牌字），以及侧栏「帮助」面板（内嵌 MkDocs `/help/`，可在浏览器中打开）。

## Model Experience

无。本包只贡献浏览器界面，不进入模型请求。

#### KV Cache effect

无；本包不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **品牌字覆盖上游 wordmark** — `ui-brand-official` 在 `sidebar.brand.name` 注册 "DeepSeek Harness"；baf-desktop 之后挂载并注册 `baf-dsh v0.0.14` 让标题行展示正确品牌。需要随 `overlay/desktop/VERSION` 一起 bump。
- **帮助站依赖静态产物** — 需将 `overlay/site` 同步到 `apps/web/dist/help/`（`overlay` 下 `npm run docs:build` 或 `brand-web`）。
- **「在浏览器中打开」** — 桌面壳走 `window.bafDesktop.openExternal`；纯浏览器则用 `window.open`。
