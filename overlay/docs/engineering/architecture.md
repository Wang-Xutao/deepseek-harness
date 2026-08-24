# overlay 桌面层

Electron 主进程拉起本机 Node 上的 `dsh web`，解析 stdout 就绪行后把 loopback URL 载入原生标题栏窗口。

产品名 **baf-dsh**，独立版本见 [../release/version-map.md](../release/version-map.md)。

```text
NSIS 安装包（baf-dsh-Setup-x.y.z.exe）
  -> 欢迎/完成页侧栏与页眉 = branding 下由 deepseek.png 生成的 BMP
  -> 详情默认折叠；详情区只显示里程碑；完整步骤写入 install-steps.log
  -> 大依赖以 modules.zip 解压
  -> 检测 Node engines；不合格则装 Node 22.19.0
baf-dsh.exe（原生标题栏，无系统菜单）
  -> 立即显示 splash（状态文案轮播，含「正在检查更新」；后台拉取更新通道）
  -> spawn node …/dsh/lib/bin.js web --host 127.0.0.1 --port 0
  -> 等待：dsh web: http://127.0.0.1:<port>
  -> 主窗口 loadURL；preload 注入 window.bafDesktop（含更新 API）
  -> 若后台检查发现可用更新：主界面就绪后弹出对话框（立即更新 / 稍后）；检查失败则直接进主界面
  -> 关闭：HTML 确认框或按 desktop-prefs.json；偏好也可在 Web「通用设置」末尾修改
```

## 版本与更新

- 本地版本：`%APPDATA%/baf-dsh/versions.json`（`bafDsh` / `dsh` / `bafPlugin`）。
- 插件包：`%APPDATA%/baf-dsh/plugin/`（首次从安装包 `resources/plugin` 种子拷贝）；将 `agent-presets/*` / `skills/*` 同步到 `~/.dsh/.agent-presets/` 与 `~/.dsh/skills/`（建议使用 `baf-` 前缀 id）。
- 热更 runtime：`%APPDATA%/baf-dsh/runtime/`（若存在则优先于安装目录 `resources/dsh`）。
- 通道：GitHub Release tag `baf-channel-stable` 的 `manifest.json`；版本资产挂在 `baf-dsh-v*` Release。公开仓无需 Token / 验签。
- 设置页：`@deepseek-ai/dsh-client-ui-settings-updates`（「版本与更新」）。

## 图标与品牌

| 位置 | 文件 |
|------|------|
| exe / 快捷方式 / 任务栏 / 托盘 | `overlay/desktop/branding/icon.ico` |
| 安装欢迎/完成侧栏、页眉 | `prepare-nsis-branding.mjs` 从 `deepseek.png` 生成 BMP |
| splash / 关闭确认框 | `desktop/ui/`：splash 为 `sora.png` + `deepseek.png`；关闭框仍用 `deepseek.png` |

## Node 与 Electron 分工

- Electron：原生窗口、splash、托盘、子进程监护、关闭 HTML 确认框、UpdateService；启动失败用中文提示框，技术细节写入 `userData/launch-error.log`。启动 `dsh web` 时带 `--no-open`，只在 Electron 窗口内打开 UI，不唤起系统默认浏览器。
- 系统 Node：跑 `@deepseek-ai/dsh`。
- `afterPack` 将依赖打成 `modules.zip`；安装脚本解压。
- 关闭偏好：`%APPDATA%/baf-dsh/desktop-prefs.json`（`closeAction`）；Web 通用设置与关闭确认框共用。
