---
name: sora-docs-standards
description: >
  Use when changing public APIs, module boundaries, or externally visible
  behavior; when editing README or docs/api; when creating a C module (needs
  module README); or when the user asks about project documentation
  obligations, API indexes, Doxygen site (docs/api/site), or missing docs.
  Prefer this for documentation sync; use sora-c-code-standards for C style
  and Doxygen symbol comments.
---

# SORA 文档规范（Agent 短规则）

**权威**：企业 P1.5（项目宪法与文档骨架）+ **P1.6**（C 模块 README）+ **docs/api/site Doxygen 真站**。
**分层**：本 skill = Agent 义务；**verify/archive 前**由 `baf-workflow status` **机读【阻塞】**（公开头变更须 site 同步等）；hook/CI warn-as-error 仍属后期。

入仓骨架：`/baf-standard:apply-constitution`（须用户授权）→ 根 `README.md`、`docs/api/README.md`（仓级清单）、`AGENTS.md`。
C 模块手册样板：`templates/c/module-README.template.md`（`apply-c-templates` 后见 `.baf/template/`）。
真站：仓根 `Doxyfile` + `baf-standard docs-doxygen` → `docs/api/site/`（提交进仓）；浏览：`baf-standard docs-open`。
完整操作法见用户手册 **「API 文档工作流」**（`/baf:docs` 站点）。

## 何时必须同步文档

触及以下任一情况时，**同一变更内**同步文档（或明确说明「无对外影响」及理由）：

1. **公开 API**：C 对外头文件 / 导出符号；Python 公共模块或 CLI 用户接口。
2. **模块边界**：目录职责、包对外入口、集成方式变化。
3. **对外行为**：默认配置、错误语义、兼容性承诺变化。
4. **C 模块错误码 / 关键日志 / 配置项**变化。
5. **公开符号 Doxygen 注释**变化（须重生真站）。

## 写哪里（强制分工 · 减少冗余）

| 内容 | 默认路径 | 读者 |
|---|---|---|
| 如何构建 / 测试 / verify | 根 `README.md` | 人 |
| 仓级模块 / 对外面清单 | `docs/api/README.md` | 人 |
| Doxygen API 真站（HTML，提交） | `docs/api/site/`（入口 `index.html`） | 人 |
| **C 模块开发维护手册**（9 节，含 API **摘要**） | `<module>/README.md` | 人 |
| 栈 / 覆盖率 / 禁依赖 | `openspec/project.md` | 人+Agent |
| Agent 总则（项目级） | 根 `AGENTS.md`（**唯一真源**） | Agent |
| Agent 约定（模块级） | `<模块>/AGENTS.md`（**唯一真源**） | Agent |
| 分层检索短指针 | 根/模块 `CLAUDE.md` → 同级 `./AGENTS.md` | Claude Code |

**硬规则**：细则只改 `AGENTS.md`；`CLAUDE.md` 禁止写构建命令/禁区/规范正文。模块 API **详表/摘要**只写模块 `README.md`，**禁止**堆进 `docs/api/README.md`。`docs/api/site/` **禁止手写**（仅 `docs-doxygen` 生成）。

### C 模块 `README.md`（P1.6 · 强制软约束）

路径：与 `<module>.c` / `<module>.h` 同目录。结构**禁止删节**（无内容写 N/A）：

1. 模块描述
2. 目录与入口
3. API 接口（摘要；细节见源码 Doxygen / `docs/api/site`）
4. **错误码与关键日志**（错误码表 + 关键日志说明）
5. 配置项
6. 构建与验证
7. 依赖与集成
8. 变更记录
9. 维护说明

新建 C 模块时须与源码**一次写齐**（主路径 = AI 按模板；`new-module` CLI 可选、非工作流必经）。清单补一行；触及公开头后跑 `docs-doxygen`。

## 严重级

| 情况 | 处理 |
|---|---|
| 相关改动缺根 README 或公共面无仓级清单行 | **【警告】→ 宜补** `docs/api/README.md`；verify 阶段缺清单时高优补齐 |
| **有独立边界的 C 模块缺 `<module>/README.md`，或 9 节不全** | **【阻塞】API 文档**（公开头所在目录缺 README 时 `status` 机拦）：对照模板补齐 |
| 改公开 API / 错误码 / 关键日志 / 配置未同步模块 README 对应节 | **【阻塞】**（Agent 义务；与公开头变更一并在构建期完成） |
| 改公开 API / 公开注释却未重生并提交 `docs/api/site/`（或缺 Doxyfile / doxygen / 生成失败） | **【阻塞】API 文档**：跑 `baf-standard docs-doxygen`；`status` 检查 site 相对变更有更新；勿假装已更新真站 |
| 新建/调整有独立边界的模块却无模块 `AGENTS.md` | **高警→宜升阻塞宣称就绪**：从 example 复制，并成对补 `CLAUDE.md` |
| 有 `AGENTS.md` 无同级 `CLAUDE.md`，或 `CLAUDE.md` 未指向同级 `AGENTS.md` | **高警**：按根 `AGENTS.md` §0 补指针 / 改链 |
| `CLAUDE.md` 含引用以外的细则 | **高警**：迁入同级 `AGENTS.md` 并收成短指针；与已有条款冲突 → 合并进 `AGENTS.md` **交用户评审** |
| 仅内部重构、无行为/API/注释/公开头变化 | 可不改清单与 site；若 README 仍有效可不动 |
| 用户明确推迟文档 | 记录推迟项；**不得**在未授权时把 `verify_result` 标 pass 或 archive |

## 与其它规范

- **不替代** C 逐符号 Doxygen（`sora-c-code-standards`）；本 skill 管 README / 清单 / **真站重生义务**。
- **AGENTS 分层 + CLAUDE 成对**：根/模块细则只写 `AGENTS.md`；`CLAUDE.md` 仅短指针；违规须纠偏（见根 `AGENTS.md` §0、`workflow-facade`）。
- 编码风格仍走 `sora-c-code-standards` / `sora-python-code-standards`。
- `本地 verify = CI` 写在宪法与 `.baf/standards/ci-index.md`，改命令时三处对齐。

## 反模式

- 把模块 API 详表写进 `docs/api/README.md`，或用手写 Markdown 冒充 `docs/api/site/`。
- 改了对外头文件 / 公共 Python API 却不更新模块 README / 仓级清单。
- 改了公开注释却不跑 `docs-doxygen`、不提交 `site/`。
- 有 C 模块源码却无模块 `README.md`，或只有错误码表而无关键日志说明（也未标 N/A）。
- 只改 `CLAUDE.md`、或把细则写进 `CLAUDE.md` 却不维护 `AGENTS.md` 真源。
- 有 `AGENTS.md` 却无同级 `CLAUDE.md`，或两者无关联；发现违规只提醒不修正。
- 把所有模块细则塞进唯一根 `AGENTS.md`，或改模块代码却不读该模块 `AGENTS.md`。
- 把「以后再写文档」当成默认结束条件且不提示阻塞。
- 改了公开头却不跑 `docs-doxygen`、不提交 `site/`，仍宣称验证完成或 archive。
- 把「先跑 new-module」当成文档合规的唯一路径。
