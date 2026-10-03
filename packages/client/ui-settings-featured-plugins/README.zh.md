# @deepseek-ai/dsh-client-ui-settings-featured-plugins

[English](README.md) | 中文

baf-dsh 的「精选插件」设置页：把官方精选的开源 dsh 插件渲染成卡片，支持按状态操作（安装 / 更新 / 启用 / 禁用 / 删除）、批量操作、单插件自动更新开关，以及宿主门禁要求的两类确认（peer 兼容风险、被扣留的构建脚本）。全部事实与操作都走 `featuredPlugins` Remote；宿主通过 `featured-plugins/changed` 事件回报变化。

## Model Experience

无。本包只渲染浏览器配置界面，不进入模型请求。

#### KV Cache effect

无；本包不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **安装进度为阶段级** — 页面展示宿主的安装阶段，不含按字节或按包的下载进度。
- **无取消按钮** — 已开始的安装会跑到结束；取消操作保留在高级 Plugins 页。
- **批量自动更新是客户端循环** — 每个条目一次 Remote 调用，不是一次宿主事务。
