---
name: sora-branch-standards
description: >
  Use when creating git branches, renaming branches, opening OpenSpec/baf
  change directories, naming change-ids, or when the user mentions hotfix,
  Jira defect keys (PROJ-123), or git push. Prefer this for branch/change
  naming and local-vs-push rules. Never push without explicit user confirmation.
---

# SORA 分支与变更命名（Agent 短规则）

**权威**：企业 P1.4 拍板（与 P1.3 Jira 策略对齐）。
**分层**：本 skill = 软约束；远程推送靠 **用户确认** 强管控；Claude `baf-guard` 硬拦属 **P2**。

## 命名

| 场景 | 分支 | 变更目录名（change-id） |
|---|---|---|
| 日常 | `<type>/<short-name>` | `<type>-<short-name>` |
| 有缺陷 key | `<type>/<KEY>-<short-name>` | `<type>-<KEY>-<short-name>` |

| 项 | 规则 |
|---|---|
| `type` | **英文**子集：`feat` `fix` `chore` `docs` `refactor` `test` `ci` `hotfix` |
| 修缺陷 | 默认 `fix/`；紧急线上修可用 `hotfix/` |
| `short-name` | 小写英文 **kebab-case**（ASCII）；禁空格与中文路径段 |
| key | `[A-Z][A-Z0-9]+-\d+`（如 `PROJ-123`）；非法：`proj-123` / `PROJ123` |

**合法示例**

```text
feat/spi-polling
fix/PROJ-123-null-irq
hotfix/PROJ-456-bus-hang
chore/upgrade-toolchain

feat-spi-polling
fix-PROJ-123-null-irq
```

**非法示例**

```text
feature/spi          # type 不在子集
fix/proj-123-x       # key 大小写非法
feat/增加轮询        # short-name 非 ASCII kebab
SPI_POLLING          # 缺 type 前缀 / 分隔符
```

## Jira key（推荐、不强制）

- 公司 Jira **仅缺陷管理**，无需求 → **禁止**要求每次建分支/开变更都带 key。
- 用户在修缺陷 / 提供了 Jira 链接或 key 时：**提醒**写入分支名、变更目录名，并配合 `sora-commit-standards` 写入提交信息。
- 普通 feat/chore **无 key 直接推进**，不要追问「工单号」、**不要阻断** open。
- 已知 key 却未写入名称时：提醒一次；用户坚持无 key 则继续。

## 本地强管控（强制）

1. **默认可做（本地）**：`git checkout -b` / `git switch -c`、本地 rename、说明意图后删除**未推送**本地分支。
2. **禁止未获用户明确同意时执行**：`git push`、`git push -u`、`git push --force` / `--force-with-lease`、以及任何会推到远程的封装脚本。
3. 需要推远程时：先说明**分支名、远程名、是否设 upstream**，明确询问确认；**仅在用户同意后**再执行。
4. 不要把「已创建本地分支」说成「已推送到远程」。

## Agent 契约

1. 建议或创建分支 / 变更目录名时必须符合上表。
2. 修缺陷且已知 key → 分支、变更名、提交信息均带上（提交侧见 `sora-commit-standards`）。
3. 未知是否有缺陷 key：可问一次；可答无；答无则无 key 推进。
4. **永不静默 push**；本地操作不代替远程发布授权。

## 反模式

| 借口 | 现实 |
|---|---|
| 「先 push 再建 MR」 | push 须确认；先本地分支 |
| 「所有分支都要 Jira」 | 公司无需求 Jira；不强制 |
| 「中文分支名更直观」 | short-name 必须 ASCII kebab |
| 「open 没 key 不能开」 | 无 key **不阻断** open |
| 「-u 只是设跟踪不算 push」 | `push -u` 仍是 push，须确认 |
