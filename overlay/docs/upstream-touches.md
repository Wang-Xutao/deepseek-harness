# 上游触达清单

记录二次开发改过的、位于 `overlay/` 之外的路径，方便 merge 上游。

关闭偏好必须改 harness 源码本身：Web「通用设置」由 `@deepseek-ai/dsh-client-ui-settings-general` 渲染，运行时从该包 `lib/client.js` 动态加载（不是 Vite 打进 `apps/web`）。仅改 `overlay/` 无法在设置页挂上控件。

| 路径 | 原因 |
|------|------|
| `packages/client/ui-settings-general/` | 在「通用设置」末尾增加桌面关闭偏好（仅 Electron `window.bafDesktop` 时显示）。改源码后须 `bundle`，再 `pack-dsh` 打进安装包。 |
| `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` | 侧栏品牌回退读取 `DSH_CLIENT_TITLE` / `DSH_CLIENT_BUILD_LABEL`（未设置时仍为「DSH Local Build」+ commit 徽标）。打包时由 `overlay/scripts/brand-web.mjs` 注入「BAF DSH」与 `v<version>`。 |
