# TODO: PROJECT_NAME

> 由 `baf-standard apply-constitution` 生成。请替换标题与各节占位。

## 简介

`TODO: 一句话说明本仓库做什么。`

技术栈：**C**（主业务）+ **Python**（工具 / 脚本）。Agent 总则见 [`AGENTS.md`](./AGENTS.md)（[`CLAUDE.md`](./CLAUDE.md) 为其短指针；**分层**：各模块目录成对维护 `AGENTS.md` + `CLAUDE.md`，用到再加载）。

## 构建

```bash
TODO: BUILD_CMD
```

## 测试

```bash
baf-quality test
```

## Verify（须与 CI 相同）

```bash
baf-quality check
```

命令对照表：`.baf/standards/ci-index.md`。

## 文档

| 文档 | 路径 |
|---|---|
| 项目宪法 | [`AGENTS.md`](./AGENTS.md)（[`CLAUDE.md`](./CLAUDE.md) 短指针） |
| OpenSpec 项目约定 | [`openspec/project.md`](./openspec/project.md) |
| 仓级模块清单 | [`docs/api/README.md`](./docs/api/README.md) |
| Doxygen API 真站 | [`docs/api/site/`](./docs/api/site/)（`baf-standard docs-doxygen`） |

## 规范插件（可选）

安装并启用 `baf-standard@baf-marketplace` 后，编码 / 提交 / 分支 / 文档义务由对应 skills 约束。
