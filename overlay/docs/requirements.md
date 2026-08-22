# 二次开发需求总账

后续需求追加到本文件。实现前先改这里，再改代码。

## 总原则

- 二次开发会改原始仓库；优先把新代码放在 `overlay/`，减少与上游的路径重叠。
- 不绑定上游贡献流程；以安装后能稳定使用为准。
- 产品名为 **baf-dsh**，使用独立版本号；与上游对照见 [version-map.md](version-map.md)。
- 安装包与应用程序图标直接使用 `overlay/desktop/branding/icon.ico`，不要再做 PNG→ICO 转换。
- 安装向导欢迎/完成页侧栏与页眉使用由 `deepseek.png` 生成的 BMP（`installerSidebar.bmp` / `installerHeader.bmp`）。

## 需求 1：Web 改装桌面端并打 Windows 安装包

状态：已落地；产物名为 `baf-dsh-Setup-<version>.exe`。

- Electron 托管现有 `dsh web`。打包时必须把 dsh 依赖解引用为真实文件（electron-builder 不会可靠复制 pnpm 符号链接），否则安装后会启动失败。
- 启动失败由 Electron 层转成用户可读提示，不直接展示底层错误码或堆栈。
- Windows NSIS 安装包；安装详情默认折叠，点击「显示详细信息」展开；进度开始前即开始写入详情并持续输出；完整步骤另写入安装目录 `install-steps.log`。
- 卸载页不显示详情日志框，仅进度条。
- 大体量依赖以单个 `modules.zip` 进入安装包，安装末段再解压。
- 安装器检测 Node `^22.19.0 || >=24.0.0`；不合格则静默安装 Node 22.19.0 x64 MSI。
- 图标：`desktop/branding/icon.ico`；安装侧栏/页眉：由 `deepseek.png` 生成的 BMP。
- splash：同一行显示 `sora.png`（左）与 `deepseek.png`（右）；资源同时放在 `branding/` 与 `ui/`，黑底需做成透明。
- 启动内嵌 `dsh web` 时使用 `--no-open`，不另外打开系统浏览器。
- 无系统菜单栏；使用系统原生标题栏；启动时先显示 splash。
- 关闭行为可在 Web「设置 → 通用设置」末尾配置（每次询问 / 托盘 / 退出）；与关闭确认框「下次不再询问」共用 `%APPDATA%/baf-dsh/desktop-prefs.json`。
- 不随包装 pnpm；不做 macOS/Linux 安装包。

数据目录仍为 `%USERPROFILE%\.dsh`。API key 仍由 Web 设置页写入。

## 需求 2：版本管理、发布与升级

状态：已落地骨架（GitHub Releases 通道 + 设置页 + splash 后台检查；主界面就绪后对话框提示；plugin/runtime 热更与壳层 Setup）。

- 三层版本：`bafDsh` / `dsh` / `bafPlugin`（本地 `%APPDATA%/baf-dsh/versions.json`）。不展示工具链版本。
- 设置 →「版本与更新」（`order: 25`）：展示三版本，「检查更新」「更新」。
- splash 仅后台检查；无更新或检查失败直接进主界面；有更新则主窗就绪后对话框选择立即/稍后。
- 发版：在 `baf` 上打 tag `baf-dsh-vX.Y.Z` → Actions 构建并上传 Release，并刷新 `baf-channel-stable` 的 manifest。
- 小改：plugin / runtime zip 热替换后重启 `dsh`；大改：下载 Setup 覆盖安装。
- 公开仓：不使用 GitHub Token，不验签；私有通道后续再开。

## 需求 3：品牌 Hero、IDE 快捷打开与帮助占位

状态：已落地（MkDocs 正文仍为占位）。

- 空状态主标题改为「探索未至之境，拉启智能篇章」；左侧鲸鱼标、右侧黑白 Sora 标，预览版徽标保留；排版需与标题同排对齐。
- splash 检测 PATH（及 Windows 常见安装目录）中 `code`（VS Code）与 `cursor` CLI；若可用，主界面右上角显示对应品牌图标（含空会话 Hero 态）；点击后以当前工作区路径打开该 IDE（无工作区则提示）。
- 侧栏「设置」上方增加「帮助」；点击后在右侧打开 MkDocs 帮助文档占位页，可关闭回到对话。
