# @deepseek-ai/dsh-client-ui-baf-desktop

[English](README.md) | 中文

面向 baf-dsh 的桌面 UI：空状态标题后的黑白 Sora 标、baf-dsh 自有标题行（覆盖 `ui-brand-official` 的上游品牌字）、侧栏「帮助」面板（内嵌 MkDocs `/help/`，可在浏览器中打开），以及会话框的「美化 / 回退」控件。

## Composer tidy-up control

「美化 / 回退」控件位于会话框右侧操作区，在模型选择与发送按钮之前。它用本地确定性格式化器把当前草稿整理成 Markdown 结构——分段、要点列表、代码围栏——不改写、不重排、不删除作者写的任何一个字。同一份草稿永远得到同一结果：不调用模型、不联网、不读时钟。整理之后控件变为「回退」，按下即还原作者原文。

## Model Experience

无。本包只贡献浏览器界面，不进入模型请求。

#### KV Cache effect

无；本包不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **品牌字覆盖上游 wordmark** — `ui-brand-official` 在 `sidebar.brand.name` 注册 "DeepSeek Harness"；baf-desktop 之后挂载并注册 `baf-dsh v0.0.14` 让标题行展示正确品牌。需要随 `overlay/desktop/VERSION` 一起 bump。
- **帮助站依赖静态产物** — 需将 `overlay/site` 同步到 `apps/web/dist/help/`（`overlay` 下 `npm run docs:build` 或 `brand-web`）。
- **「在浏览器中打开」** — 桌面壳走 `window.bafDesktop.openExternal`；纯浏览器则用 `window.open`。
- **含 @ 文件引用的草稿不动** — 会话框以纯文本回写草稿，那会丢掉作者挂上的引用 chip。控件保持可见但拒绝处理这份草稿，并说明原因。
