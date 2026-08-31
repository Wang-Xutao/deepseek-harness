# 上游触达清单

记录二次开发改过的、位于 `overlay/` 之外的路径，方便 merge 上游。需求总账见 [../product/requirements.md](../product/requirements.md)。

关闭偏好必须改 harness 源码本身：Web「通用设置」由 `@deepseek-ai/dsh-client-ui-settings-general` 渲染，运行时从该包 `lib/client.js` 动态加载（不是 Vite 打进 `apps/web`）。仅改 `overlay/` 无法在设置页挂上控件。

| 路径 | 原因 |
|------|------|
| `packages/client/ui-settings-general/` | 在「通用设置」末尾增加桌面关闭偏好（仅 Electron `window.bafDesktop` 时显示）。改源码后须 `bundle`，再 `pack-dsh` 打进安装包。 |
| `packages/client/ui-settings-updates/` | 设置「版本与更新」页（order 25）；经 `window.bafDesktop` 调用桌面 UpdateService。 |
| `packages/client/ui-baf-desktop/` | Hero 尾标、IDE 打开按钮、帮助面板（iframe `/help/` + 浏览器打开）；依赖桌面 `window.bafDesktop`。 |
| `packages/client/ui-baf-tracegraph/` | 会话「轨迹图」Tab + 设置「工作流」section：每轮独立时长 / token、hover/click 动效、图标；`baf-workflow.showTraceGraph` 控制 Tab 挂载。依赖 `sessions.ensureOpen` 与 `sessionStats.toolCalls`。 |
| `packages/client/ui-conversation/` | Hero 文案与 `conversation.hero.brand.trailing` 槽位；空会话时仍浮显 `header.utilities`（IDE 打开按钮）。 |
| `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` | 侧栏品牌回退读取 `DSH_CLIENT_TITLE` / `DSH_CLIENT_BUILD_LABEL`（未设置时仍为「DSH Local Build」+ commit 徽标）。打包时由 `overlay/scripts/brand-web.mjs` 注入「BAF DSH」与 `v<version>`。 |
| `packages/client/runtime/` | `sessions.ensureOpen(id)`：打开历史窗口但不切换 `current`（轨迹图 inline 子 Session）。 |
| `packages/session/session-stats/` | `sessionStats.toolCalls` 全日志工具调用计数（轨迹图顶部汇总）。 |
| `packages/bundle/web-app/cordis.patch.yml` + `package.json` | 挂载 `ui-settings-updates`、`ui-baf-desktop`、`ui-baf-tracegraph`。 |
