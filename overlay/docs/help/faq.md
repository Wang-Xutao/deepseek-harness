# 常见问题

## 启动后一直停在 splash？

常见原因：本机 Node 版本不符合要求，或内嵌 `dsh web` 未能监听端口。

处理：确认已安装 Node `^22.19 || >=24`；查看 `%APPDATA%\baf-dsh\launch-error.log`；必要时重装安装包让安装器补装 Node。

## 为什么没有 VS Code / Cursor 按钮？

标题栏按钮仅在桌面壳检测到对应 CLI 时显示。请确认已安装并可将 `code` / `cursor` 加入 PATH，然后重启 baf-dsh。

## 帮助文档打不开或空白？

帮助页来自随包的 MkDocs 静态站（`/help/`）。若开发态缺少站点产物，在 `overlay` 下执行 `npm run docs:build`，再重新构建/启动前端。

## 更新如何工作？

- 设置 →「版本与更新」可查看三层产品版本并手动检查。
- splash 会后台检查；有可用更新时，主界面就绪后弹出选择立即/稍后。
- 小改可通过热替换；大改需下载 Setup 覆盖安装。
- 斜杠 `/baf-version` 与设置页字段对齐（BAF DSH DESKTOP / DeepSeek Harness / 各 BAF 插件独立版本）。

## BAF 模式相关？

见 [BAF 模式](baf-mode.md)。

- 只有 **BAF 模式** 才显示「工作流」页签。
- `baf-*` 指令为**系统指令卡**，默认展开分区正文（可点行收起）；不是大模型闲聊。
- full-go / 快路径由 **intake 分类**决定；同变更可升级，不必为换模式新开会话。
- 续跑依赖工作区 `.baf/projection/`；换机需同步该目录。
- 多变更列表：工作流顶栏「变更总览」。

## 和上游 DeepSeek Harness 是什么关系？

baf-dsh 是二次开发桌面产品，使用独立版本号（`overlay/desktop/package.json`）。功能主体仍是上游 `dsh web`；桌面壳、安装器与帮助站位于 `overlay/`。
