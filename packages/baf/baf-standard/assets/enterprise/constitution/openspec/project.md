# Project context（OpenSpec）

> 由 `baf-standard apply-constitution` 生成。填写 `TODO`；与根 `AGENTS.md`、`.baf/standards/ci-index.md` 保持一致。

## Tech stack

| 层 | 选择 |
|---|---|
| 主业务 | **C**（`.c` / `.h`） |
| 工具 / 脚本 | **Python** 3.x |
| 不在本期默认栈 | 其它语言须单独评审后写入本节 |

## Dependencies

- **禁止**未评审直接引入新第三方库 / SDK。
- C：高风险或第三方代码走白名单流程（若已 `apply-c-templates`，见 `.baf/standards/third-party-whitelist.json`）。
- Python：新增依赖记入本文件「已批准依赖」表，并说明用途。

### 已批准依赖（占位）

| 名称 | 语言 | 用途 | 批准说明 |
|---|---|---|---|
| `TODO` | C / Python | | |

## Directory conventions（占位）

```text
TODO: 例如
  AGENTS.md / CLAUDE.md   # 项目级宪法 + 短指针（成对）
  src/
    AGENTS.md / CLAUDE.md # 可选：src 层约定 + 短指针
    i2c/
      AGENTS.md / CLAUDE.md  # 模块级（有独立边界则建；成对）
      *.c / *.h
  scripts/
    AGENTS.md / CLAUDE.md # Python 工具树约定 + 短指针
  tests/
  docs/api/README.md      # 仓级模块清单（人手）
  docs/api/site/          # Doxygen 真站（docs-doxygen 生成并提交）
  openspec/               # 规格与变更
```

**AGENTS 分层 + CLAUDE 成对**：根写全局；各模块目录各自维护 `AGENTS.md`，同级 `CLAUDE.md` 仅短指针；Agent 用到该模块时再加载。违规纠偏见根 `AGENTS.md` §0。

按实际仓库改写上表；公开头文件与 Python 公共模块须在 `docs/api/README.md` 有清单行；模块 API 摘要在各模块 `README.md`；符号级文档在源码 Doxygen → `docs/api/site/`。

## Quality gates

| 项 | 默认 | 覆写 |
|---|---|---|
| 单元测试覆盖率 | **≥ 80%** | 可按模块在下表覆写 |
| 本地 verify | 与 CI **同一命令** | 见 `AGENTS.md` 与 `ci-index.md` |

### 模块覆盖率覆写（可选）

| 模块 / 路径 | 目标 | 理由 |
|---|---|---|
| | | |

## Commands（占位 — 须与 CI 一致）

| 名称 | 命令 |
|---|---|
| build | `TODO: BUILD_CMD` |
| test | `baf-quality test` |
| verify | `baf-quality check` |
