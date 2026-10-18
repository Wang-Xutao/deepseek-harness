# CLAUDE.md

本仓库的 **项目级** Agent 总则以根目录 **[`AGENTS.md`](./AGENTS.md)** 为准。

**分层（强制）**：不同文件夹 / 模块应有各自成对的 `AGENTS.md` + `CLAUDE.md`（本文件形态：仅短指针）。开始任务时先读根 `AGENTS.md`；进入某模块或修改其下文件时，再沿路径加载该模块及祖先目录中的 `AGENTS.md`（近路径优先）。模块骨架见 `.baf/standards/module-AGENTS.example.md` 与 `module-CLAUDE.example.md`。

**合规**：本文件除指向同级 `AGENTS.md` 外不得写细则。若发现多写内容、缺成对文件、或未关联同级 `AGENTS.md`，须按根 `AGENTS.md` §0「违规纠偏」修正；与 `AGENTS.md` 冲突的条款合并进 `AGENTS.md` 后交用户评审。

编码、提交、分支、文档规范由企业插件 **`baf-standard`** 的 skills 约束；模板入仓须用户明确授权（推荐 `/baf-standard:init`，或单条 `/baf-standard:apply-*`）。
