# overlay 桌面层

Electron 主进程拉起本机 Node 上的 `dsh web`，解析 stdout 就绪行后把 loopback URL 载入原生标题栏窗口。

产品名 **baf-dsh**，独立版本见 [version-map.md](version-map.md)。

```text
NSIS 安装包（baf-dsh-Setup-x.y.z.exe）
  -> 欢迎/完成页侧栏与页眉 = branding 下由 deepseek.png 生成的 BMP
  -> 详情默认折叠；详情区只显示里程碑；完整步骤写入 install-steps.log
  -> 大依赖以 modules.zip 解压
  -> 检测 Node engines；不合格则装 Node 22.19.0
baf-dsh.exe（原生标题栏，无系统菜单）
  -> 立即显示 splash（状态文案轮播）
  -> spawn node …/dsh/lib/bin.js web --host 127.0.0.1 --port 0
  -> 等待：dsh web: http://127.0.0.1:<port>
  -> 主窗口 loadURL；preload 注入 window.bafDesktop
  -> 关闭：HTML 确认框或按 desktop-prefs.json；偏好也可在 Web「通用设置」末尾修改
```

## 图标与品牌

| 位置 | 文件 |
|------|------|
| exe / 快捷方式 / 任务栏 / 托盘 | `overlay/desktop/branding/icon.ico` |
| 安装欢迎/完成侧栏、页眉 | `prepare-nsis-branding.mjs` 从 `deepseek.png` 生成 BMP |
| splash / 关闭确认框 | `desktop/ui/deepseek.png` |

## Node 与 Electron 分工

- Electron：原生窗口、splash、托盘、子进程监护、关闭 HTML 确认框；启动失败用中文提示框，技术细节写入 `userData/launch-error.log`。
- 系统 Node：跑 `@deepseek-ai/dsh`。
- `afterPack` 将依赖打成 `modules.zip`；安装脚本解压。
- 关闭偏好：`%APPDATA%/baf-dsh/desktop-prefs.json`（`closeAction`: `ask` | `tray` | `quit`），Web 通用设置与关闭确认框共用。
