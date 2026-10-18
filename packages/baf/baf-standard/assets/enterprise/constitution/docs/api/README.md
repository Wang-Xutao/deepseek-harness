# 仓级模块 / 对外面清单

> 由 `baf-standard apply-constitution` 生成。本页是**人手维护的索引**，不是 Doxygen 站。
> **Doxygen 真站**（提交进仓）：[`./site/`](./site/)（入口 [`./site/index.html`](./site/index.html)；由 `baf-standard docs-doxygen` 重生）。

## 生成站

| 项 | 路径 / 命令 |
|---|---|
| 浏览入口 | [`docs/api/site/index.html`](./site/index.html) |
| 重生 | `baf-standard docs-doxygen`（须本机有 `doxygen`；仓根 `Doxyfile`） |
| 打开 | `baf-standard docs-open`（或 `docs-doxygen --open`） |
| 手写禁区 | **不要**在 `docs/api/site/` 内手写内容（下次生成会覆盖） |

## C 公开头文件 / 模块

| 头文件或模块 | 说明 | 模块 README | 状态 |
|---|---|---|---|
| `TODO: include/foo.h` | | `TODO: path/README.md` | draft / stable |

模块 **API 摘要、错误码、关键日志** 写在各模块 `README.md`（固定 9 节），**不要**把详表堆在本页。

## Python 公共模块

| 模块 | 说明 | 状态 |
|---|---|---|
| `TODO: package.api` | | draft / stable |

## 约定

- 仅列出**对外**稳定面；内部 `static` / 私有模块可不列。
- 新增/下线对外模块或头文件：更新本表，并视需要重生 `./site/`。
- 公开签名或注释变更：更新对应模块 `README.md` §API，并跑 `docs-doxygen` 提交 `site/`（见 `sora-docs-standards`）。
- 源码级符号注释见 `sora-c-code-standards`（Doxygen）；本页是**仓级地图**，不替代逐符号注释与模块手册。
