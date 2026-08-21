# overlay — 二次开发约定

本目录是 DeepSeek Harness 的二次开发层。后续改桌面壳、安装器、自研需求时先读这里，再读 [docs/requirements.md](docs/requirements.md)。

## 目标

在上游开源仓库上做二次开发，安装后以桌面 exe 使用 `dsh web` 的全部 GUI 能力。上游会继续更新，因此 **新代码优先放 `overlay/`**，必须改上游时把冲突面压到最小，并记入 [docs/upstream-touches.md](docs/upstream-touches.md)。

## 冲突策略

1. 桌面壳、安装器、图标、打包脚本、二次开发文档：只放 `overlay/`。
2. 必须改上游时：新增文件优于改热文件；追加一行优于改一段逻辑。
3. 不要把桌面壳塞进现有 `packages/` 包里「顺便改」。
4. `overlay/` 不加入 pnpm workspace；此处用独立 `npm`，避免和根 `pnpm-workspace.yaml` 缠在一起。
5. 不绑定上游流程：不强制双语配对、doc-sync 预算、Agent Note、knip、`packages/*/src` 100% coverage。以功能稳定为准。若上游 CI 误伤本目录，再在排除清单里追加 `overlay/**`。

## 运行模型

Electron **只做窗口**。harness 仍由系统（或安装器装上的）Node 启动 `dsh web`。Electron 内嵌 Node 版本对不齐 `^22.19 || >=24`，禁止用它跑 `dsh`。

产品名 **baf-dsh**，独立版本号，对照表见 [docs/version-map.md](docs/version-map.md)。

安装包与运行中的 exe/托盘图标直接使用 `desktop/branding/icon.ico`；安装向导 logo 使用 `desktop/branding/deepseek.png`。禁止再做 PNG→ICO 转换。关闭窗口时须提供「最小化到托盘 / 退出」选择。

## 打包

命令与产物见 [docs/build.md](docs/build.md)。产物在 `desktop/dist/`。
