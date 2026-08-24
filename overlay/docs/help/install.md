# 安装与启动

## 安装

1. 获取 `baf-dsh-Setup-<version>.exe`（GitHub Releases 或内部渠道）。
2. 运行安装向导；需要管理员权限时按提示提升。
3. 安装器会检测 Node 版本；不合格时静默安装 Node 22.19.0 x64。
4. 完成后可从开始菜单或桌面快捷方式启动 **baf-dsh**。

数据目录仍为 `%USERPROFILE%\.dsh`。桌面偏好在 `%APPDATA%\baf-dsh\`。

## 启动

1. 先显示 splash（含品牌图与状态文案）。
2. 本机 Node 启动内嵌 `dsh web`（不另开系统浏览器）。
3. 就绪后进入主界面。

若启动失败，窗口会给出中文提示；技术细节写入 `%APPDATA%\baf-dsh\launch-error.log`。

## 卸载

通过「应用和功能」卸载即可。用户数据目录默认保留，可按需手动删除。
