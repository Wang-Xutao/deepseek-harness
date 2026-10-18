---
name: sora-standards-overview
description: >
  Use when the user asks what baf-standard provides, how to apply constitution,
  C templates or commitlint into a repo, where whitelist or high-risk checklist
  live, or how soft skills relate to hard git hooks/CI. Prefer language-specific
  skills when actively editing C, Python, commit messages, branch/change naming,
  or documentation obligations.
---

# baf-standard 概览

SORA 企业规范插件：与 `baf` / `baf-workflow` **独立发版**。

## Skills

| Skill | 用途 |
|---|---|
| `sora-c-code-standards` | C（主业务）；Doxygen / 文件头 / **最终 clang-format（代码冻结）**；**新建与重构同等**；完整件 |
| `sora-python-code-standards` | Python 工具/脚本 |
| `sora-commit-standards` | Conventional Commits（英 type + 中文 subject）；Jira key 推荐不强制；**禁止 Co-Authored-By / 工具署名**；**版本 bump 须独立提交** |
| `sora-branch-standards` | 分支 / 变更目录命名；本地操作；**push 须用户确认** |
| `sora-docs-standards` | README / 仓级清单 `docs/api/README.md` / **真站 `docs/api/site/`** / 模块完整件；公开头变更时 verify 前 **status【阻塞】** |
| 本页 | 地图与入仓入口 |

> 风格/静态分析（cpplint + cppcheck）见 **`baf-quality`**：`sora-c-static-analysis`、`/baf-quality:lint`。

本期语言：**C + Python**（其它语言后续）。
共性强制：源文件 **UTF-8 无 BOM**（中文注释必备；见 C/Python skill）。
**AGENTS 分层 + CLAUDE 成对**：细则只写 `AGENTS.md`；`CLAUDE.md` **仅**短指针；人读手册写 `README.md`；工作流按路径加载 AGENTS，发现违规须纠偏（见 `workflow-facade` / 根 §0）。

## 命令

| 命令 | 作用 |
|---|---|
| `/baf-standard:init` | **一键入仓**：宪法 + C 模板 + commitlint（执行即授权） |
| `/baf-standard:apply-constitution` | 仅项目宪法与文档骨架（须授权） |
| `/baf-standard:apply-c-templates` | 仅 C 规范资产（含仓根 Doxyfile；须授权） |
| `/baf-standard:apply-commit-lint` | 仅 commitlint + husky（须授权） |
| `/baf-standard:docs-doxygen` | 重生并提示提交 `docs/api/site/`（须本机 doxygen；可选 `--open`） |
| `/baf-standard:docs-open` | 用默认浏览器打开 `docs/api/site/index.html` |
| `/baf-standard:new-module` | **可选**脚手架：`<name>/` + `.c/.h` + `README` + `AGENTS`/`CLAUDE`（**非工作流必经**） |
| `/baf-standard:help` / `version` | 帮助 / 版本 |

## 分层

| 层 | 作用 |
|---|---|
| Skills | 软约束 |
| git `commit-msg` + commitlint | 仓内提交硬门（P1.3） |
| `baf-guard` / CI | Agent/流水线硬拦（P2+） |

安装：`/plugin install baf-standard@baf-marketplace` — **禁止**静默安装或静默入仓。
