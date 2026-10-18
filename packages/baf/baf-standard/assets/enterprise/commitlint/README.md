# SORA commitlint 模板（baf-standard P1.3）

完整 **Conventional Commits** 为格式必过；**Jira key 推荐不强制**（出现则校验 `PROJ-123` 形态）。
语言约定：**英文** `type`/`scope`/footer 关键字 + **默认中文** `subject`（例：`feat(driver): 增加 SPI 轮询模式`）。
**笔数 / 中文**：commitlint **不**强制；靠 `sora-commit-standards` + 归档前 `baf-workflow check-commit-span`。

## 一键入仓（推荐）

在客户仓库（须用户授权）：

```bash
# 环境开机（企业预设已含装全硬门）
# /baf:init → baf-workflow init-apply

# 或单独：
baf-standard apply-commit-lint --install
```

## 仅拷模板

```bash
baf-standard apply-commit-lint
# 或 /baf-standard:apply-commit-lint
```

然后按 CLI 打印的步骤安装依赖并启用 husky；或改用 `--install`。

## 手动安装

```bash
npm i -D @commitlint/cli @commitlint/config-conventional husky
npx husky init
# 将本目录 commit-msg 覆盖到 .husky/commit-msg
# 将 commitlint.config.cjs 放到仓库根（与 package.json 同级）
git config core.hooksPath .husky
```

## 规则摘要

| 规则 | 行为 |
|---|---|
| Conventional Commits | `type(scope): subject` 必过；type 英文；subject 默认中文（工具不拦语言） |
| Jira | 无 key → 通过；`Refs:/Fixes:/Closes:` 后 key 非法 → 失败；`PROJ123` 缺连字符 → 失败 |
| AI / 工具署名 | `Co-Authored-By:` / `Generated with …` / `Made with …` 等 → 失败 |

## 硬门分层

- 本 hook：终端 / IDE / Agent 经 git 的提交格式
- 归档前 `check-commit-span`：压笔数（门面强制）
- `baf-guard`（P2）：再拦 Agent Bash `git commit`
- 仅 skill：软约束中文 subject；不能替代本 hook
