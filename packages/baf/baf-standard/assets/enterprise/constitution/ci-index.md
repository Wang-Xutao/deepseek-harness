# CI 命令索引（占位）

> 由 `baf-standard apply-constitution` 复制到客户仓 `.baf/standards/ci-index.md`。
> **规则**：本地 verify / 构建 / 测试命令必须与 CI job **使用同一命令**（见根 `AGENTS.md`）。
> **本文件不是**可跑的 GitHub Actions / GitLab CI；真流水线属企业 P2+。

## 命令对照

| 名称 | 本地命令 | CI job 名称（占位） | 备注 |
|---|---|---|---|
| build | `TODO: BUILD_CMD` | `TODO: build` | 须与本地相同 |
| test | `baf-quality test` | `test` | 覆盖率默认 ≥80%，见 `openspec/project.md` |
| verify | `baf-quality check` | `verify` | 入库前验收入口 |

## 维护

1. 先改本表与 `AGENTS.md` / `openspec/project.md` 中的命令占位，保持三处一致。
2. 接入真实 CI 时：job script **直接调用**上表命令，禁止另写一套「仅 CI 能过」的脚本而不文档化。
3. 流水线 YAML 模板可后续由企业 P2 / scaffold 提供；P1 只要求索引与原则。
