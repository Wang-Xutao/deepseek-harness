# AGENTS.md — 项目宪法（客户仓 · 仓库根）

> 由 `baf-standard apply-constitution` 生成。请把下方 `TODO` 换成本项目实情。
> **成对约定**：凡有 `AGENTS.md` 的目录必须有同级 **`CLAUDE.md`**，且 `CLAUDE.md` **仅**短指针指向同级 `AGENTS.md`；细则只写在本文件及各模块 `AGENTS.md`。

---

## 0. AGENTS.md 分层策略（强制）

**原则：不同文件夹 / 不同模块使用不同的 `AGENTS.md`；用到哪里，加载哪里。禁止把所有模块细则塞进唯一的根文件。**

| 层级 | 路径 | 写什么 | 何时加载 |
|---|---|---|---|
| **项目级（本文件）** | 仓库根 `AGENTS.md` + 同级 `CLAUDE.md` | 身份、栈、工作流、verify=CI、全局规范与安全；CLAUDE 仅指针 | **每次**进入本仓任务时先读 AGENTS |
| **模块 / 目录级** | 如 `src/driver/AGENTS.md` + 同级 `CLAUDE.md` | 仅本模块增量；CLAUDE 仅指针 | **进入该目录、改其下文件、或任务明确落在该模块时**再读 |
| **更细子模块** | 子目录可再放成对 `AGENTS.md` / `CLAUDE.md` | 仅增量差异；勿重复粘贴根宪法全文 | 同左，按路径叠加 |

### AGENTS.md ↔ CLAUDE.md 成对规则（强制）

1. **有 `AGENTS.md` 必有同级 `CLAUDE.md`**；反之若仅有 `CLAUDE.md` 且含实质约定，须先抽出真源为 `AGENTS.md`，再收指针。
2. **`CLAUDE.md` 只允许**：标题 + 指向同级 `./AGENTS.md` 的说明 +（可选）一句分层加载提示。禁止写构建命令、禁区、栈、规范细则等。
3. **真源唯一**：所有 Agent 约定的增删改只发生在 `AGENTS.md`（根或模块）。

### 违规纠偏（发现即改，勿只提醒）

| 违规 | 处理 |
|---|---|
| `CLAUDE.md` 含引用以外的约定 / 命令 / 禁区等 | **迁入**同级 `AGENTS.md`（合并去重），再把 `CLAUDE.md` 收成短指针 |
| 有 `AGENTS.md`、无同级 `CLAUDE.md` | **补**短指针 `CLAUDE.md`（可参照 `.baf/standards/module-CLAUDE.example.md`） |
| 有 `CLAUDE.md`、无同级 `AGENTS.md` | 有实质内容 → **先抽出**建 `AGENTS.md` 再收指针；无有效内容 → 按该层是否需要宪法决定删或补齐成对 |
| `CLAUDE.md` 未指向同级 `AGENTS.md`（错链、只指根、无关联） | **改**为指向同级 `./AGENTS.md` |
| 两文件细则重复 | 以合并进 `AGENTS.md` 为准，`CLAUDE.md` 只留指针 |
| **合并后与原有 `AGENTS.md` 条款冲突** | **全部候选条款写入 `AGENTS.md`（标明冲突）并交用户评审**；在用户拍板前不要擅自删任一侧语义 |

纠偏属文档/宪法合规义务：相关路径上发现违规 → **高警**并在同一任务内修正（冲突项等用户确认后再定稿）。

### 加载顺序（Agent 必须遵守）

1. 读**根** `AGENTS.md`（本文件）。
2. 根据当前工作路径（正在编辑的文件、或用户指定的模块），自仓库根沿路径向下，**依次加载**路径上每一层存在的 `AGENTS.md`（例如改 `src/i2c/foo.c` → 若存在则再读 `src/AGENTS.md`、`src/i2c/AGENTS.md`）。
3. **近路径优先**：模块级与根冲突时，以**更靠近当前文件**的 `AGENTS.md` 为准（模块可收紧规则，不得无说明地放宽根级安全/授权红线）。
4. 任务跨多个模块时：根 + **每个涉及模块**各自的 `AGENTS.md` 都要读；不要假设「只读过根就够」。
5. 新建有独立边界的模块/目录时：**应同时新增**该目录成对的 `AGENTS.md` + `CLAUDE.md`（可复制 `.baf/standards/module-AGENTS.example.md` 与 `module-CLAUDE.example.md`）；缺模块宪法且模块非平凡 → **高警**并建议补齐。
6. 加载路径上若发现成对规则或短指针违规 → 按上表**纠偏**（冲突合并交用户评审）。

### 反模式

- 只维护根 `AGENTS.md`，把各驱动/各服务细节全部写进去。
- 改 `foo/` 下代码却不打开 `foo/AGENTS.md`（若存在）。
- 模块 `AGENTS.md` 复制整份根宪法导致双份漂移。
- 用 `CLAUDE.md` 代替模块约定，或只改 `CLAUDE.md` 不改 `AGENTS.md` 真源。
- 有 `AGENTS.md` 却无同级 `CLAUDE.md`，或两者无关联。
- 发现违规只口头提醒、不修正。

模块骨架示例：`.baf/standards/module-AGENTS.example.md`、`.baf/standards/module-CLAUDE.example.md`（由 `apply-constitution` 写入）。

---

## 1. 项目身份

| 项 | 填写 |
|---|---|
| 项目名称 | `TODO: PROJECT_NAME` |
| 一句话目标 | `TODO: 一句话说明本仓库做什么` |
| 主语言 | **C**（业务 / 固件 / 库） |
| 辅语言 | **Python**（工具、脚本、测试辅助） |

## 2. 技术栈与依赖

- 允许栈：**C + Python**。引入新第三方依赖须评审；细节与禁止项见 `openspec/project.md`。
- C 侧第三方白名单流程可参考企业规范入仓资产（`.baf/standards/`，若已 `apply-c-templates`）。
- 源文件编码：**UTF-8 无 BOM**。

## 3. 工作流（对外用语）

- 使用 **baf** 五阶段：`open` → `design` → `build` → `verify` → `archive`。
- 斜杠入口：`/baf-workflow:*`（及元插件 `/baf:*` 运维类）。
- 各阶段执行时遵守上文 **§0 分层加载**（见编排门面 `workflow-facade`）。
- 未获用户明确授权时：**禁止**静默安装插件、改 `enabledPlugins`、或把规范模板写入仓库。

## 4. 本地 verify = CI（必读）

- **本地用于验收的命令必须与 CI job 命令一致**（同一脚本 / 同一入口）。
- 在下表与 `.baf/standards/ci-index.md` 中维护同一套命令；改一处须同步另一处。
- **模块**可有额外测试命令：写在该模块 `AGENTS.md`，且不得与根/CI 总入口矛盾（可调用总入口或作为其子集）。

| 阶段 | 本地命令（占位） | CI 对应 |
|---|---|---|
| 构建 | `TODO: BUILD_CMD` | 与左列相同 |
| 测试 | `baf-quality test` | 与左列相同 |
| verify（入库前） | `baf-quality check` | 与左列相同 |

> 可跑的 CI 流水线正文属企业 P2+；本宪法只约束「命令一致」，不替代流水线配置。

## 5. 工程规范（baf-standard）

启用 `baf-standard@baf-marketplace` 后，Agent 应遵循：

| Skill | 用途 |
|---|---|
| `sora-c-code-standards` | C 编码 |
| `sora-python-code-standards` | Python |
| `sora-commit-standards` | Conventional Commits（英 type + 中文 subject） |
| `sora-branch-standards` | 分支 / 变更命名；**push 须用户确认** |
| `sora-docs-standards` | README / 对外 API / **C 模块 README** / 模块 AGENTS 文档义务（缺则高警） |
| `sora-c-code-standards` | C 编码 + **Doxygen 注释**；新建模块完整件 |

入仓工具：

- **推荐**：`/baf-standard:init`（一次写入宪法 + C 模板 + commitlint；执行即授权）
- 或单条：`/baf-standard:apply-constitution`（本套文件）/ `apply-c-templates` / `apply-commit-lint`

## 6. 文档义务

### 6.1 写哪里（强制分工）

| 内容 | 路径 | 读者 |
|---|---|---|
| 如何构建 / 测试 / verify / 找文档 | 根 `README.md` | 人 |
| 仓级模块 / 对外面清单 | `docs/api/README.md` | 人 |
| Doxygen API 真站（提交） | `docs/api/site/`（入口 `index.html`；`baf-standard docs-doxygen`） | 人 |
| C 模块 9 节开发维护手册（含 API 摘要） | `<module>/README.md` | 人 |
| Agent 总则 / 模块增量约定 | 根或 `<module>/AGENTS.md`（**真源**） | Agent |
| 分层检索短指针 | 同级 `CLAUDE.md` → `./AGENTS.md` | Claude Code |

**禁止**把 9 节手册或符号详表塞进 `docs/api/README.md` / `AGENTS.md`；**禁止**在 `docs/api/site/` 内手写；`CLAUDE.md` 不得写细则（与 §0 一致）。

### 6.2 同步义务

- **C 模块完整件**：每个有独立边界的 C 模块须有 `<module>/README.md`（固定 9 节；含错误码与关键日志）+ 成对 `AGENTS.md`/`CLAUDE.md`；新建时与 `.c/.h`、Doxygen **一次写齐**（AI 主路径；`new-module` 可选）。
- 改动触及公开 API、模块边界、错误码/关键日志/配置或对外行为时：**须同步**模块 `README.md`；清单行变化时更新 `docs/api/README.md`；公开注释/API 变更时跑 **`baf-standard docs-doxygen`** 并提交 `docs/api/site/`；缺文档 → **高警**（见 `sora-docs-standards`）。
- 模块边界 / Agent 约定变化时：同步该模块 `AGENTS.md`（勿只改 `CLAUDE.md`）；`CLAUDE.md` 违规按 §0 纠偏。
- **新建与重构**触及的自研 C 代码均须遵循 `sora-c-code-standards`（文件头、注释、`clang-format`）。

## 7. 质量门槛（默认）

- 单元测试覆盖率默认 **≥ 80%**（可按模块在 `openspec/project.md` 或模块 `AGENTS.md` 覆写）。
- 提交信息、分支命名遵循上表 skills；关联缺陷时 **推荐**带 Jira key，不强制。
- 提交信息**禁止** `Co-Authored-By:` 及工具生成声明；按正常 Conventional Commits 即可（见 `sora-commit-standards`）。
- 规格构建允许按任务本地碎交；**归档 / push 前**须压笔（`baf-workflow check-commit-span`），最终 subject **默认中文**。
- 提交格式硬门：经 `/baf:init` 或 `baf-standard apply-commit-lint --install` 装全后，不合规 message 会被 hook 拒绝。

## 8. 安全与变更

- 不把密钥、内网地址、未授权生产配置写入仓。
- 不静默 `git push`（含 `-u` / force）；须用户明确同意后再推远程。
- 根级安全与授权红线：**模块 `AGENTS.md` 不得擅自取消**。
