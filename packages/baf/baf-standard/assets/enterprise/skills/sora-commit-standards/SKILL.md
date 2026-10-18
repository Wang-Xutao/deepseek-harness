---
name: sora-commit-standards
description: >
  Use when writing git commit messages, amending commits, running git commit,
  reviewing Conventional Commits format, version bumps / release commits that
  must stay isolated from feature changes, or when the user mentions Jira defect
  keys (PROJ-123), Refs/Fixes footers, SORA commitlint rules, Gerrit, Change-Id,
  git commit-msg hooks, commit count, squash, minimizing commits for code
  review (+2), Co-Authored-By, AI co-author trailers, or tooling attribution in
  commits. Prefer this over inventing commit message styles.
  Default: English type/scope, Chinese subject. Prefer fewer commits per change;
  exception: version bump commits must be standalone. Never add Co-Authored-By
  or AI/tooling attribution lines.
---

# SORA 提交信息规范（Agent 短规则）

**权威**：企业 P1.3 拍板 + 完整 [Conventional Commits](https://www.conventionalcommits.org/)。
**分层**：本 skill = 软约束；客户仓 **git `commit-msg` + commitlint** = 硬门；Claude `baf-guard` 再拦 Agent 提交属 **P2**。

入仓：`/baf-standard:apply-commit-lint`（须用户授权）。

## 必过 — 完整 Conventional Commits

```text
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

| 项 | 规则 |
|---|---|
| 形式 | **必须** `type(scope): subject`；**禁止** `[type(scope)]:` 方括号式 |
| `type` | **英文**固定枚举：`feat` `fix` `docs` `style` `refactor` `perf` `test` `build` `ci` `chore` `revert` |
| `scope` | 可选；推荐英文模块名（如 `driver`），与代码目录/包名一致 |
| `subject` | **默认中文**：祈使/陈述、简洁、一行；句末不加句号；专有名词可保留英文（如 `SPI`、`OpenSpec`） |
| body | 可选；默认中文，补充动机与细节 |
| footer | 可选；关键字用英文 `Refs:` / `Fixes:` / `Closes:` / `BREAKING CHANGE:`；说明可用中文；**禁止** AI/工具署名类尾注（见下节） |

**语言约定（hybrid）**

- **英文**：`type`、`scope`、footer 关键字、`BREAKING CHANGE`
- **中文**：`subject` / body（默认）；对外开源仓可由团队另行约定全英文 subject
- commitlint **不**强制语言；`subject-case` 已关闭以兼容中文

**合法示例**

```text
feat(driver): 增加 SPI 轮询模式
fix(driver): 处理空指针中断 (PROJ-123)
chore: 升级工具链版本

fix(i2c): 清除总线挂死

Refs: PROJ-456
```

**非法示例**

```text
[feat(driver)]: 增加 SPI          # 禁止方括号
增加 SPI 支持                     # 缺 type
feat:                             # 缺 subject
功能(driver): 增加 SPI            # 禁止中文 type
```

## 禁止 AI / 工具署名尾注（强制）

提交信息按人类正常 Conventional Commits 书写即可；**禁止**附加任何 AI 或编辑器工具署名。

| 禁止项 | 说明 |
|---|---|
| `Co-Authored-By:` | **一律禁止**（含 Claude / Cursor / 其它模型或机器人邮箱） |
| 工具生成声明 | 如 `Generated with …`、`Made with …`、`Made-with:`、相关 emoji 尾巴等 |
| 正文夹带 | subject / body / footer **均不得**体现上述工具署名或「由某某 AI 生成」类字样 |

**Agent 契约**

1. 代写 `git commit -m` / 多行消息 / amend **时不要**追加上述尾注。
2. 若草稿或工具默认已带上 → **提交前删掉**，只保留 CC 正文（及合法 `Refs:`/`Fixes:`/`Change-Id:` 等）。
3. PR / MR 描述同样不写工具生成声明（除非用户明确要求）。
4. Gerrit `Change-Id:` 由 hook 注入，**不属于**本禁令。

## Jira key（推荐、不强制）

- 公司 Jira **仅缺陷管理**，无需求 → **禁止**要求每笔提交都带 key。
- 用户在修缺陷 / 提供了 Jira 链接或 key 时：**提醒**写入 subject 或 footer，便于追溯。
- 普通 feat/chore **无 key 直接提交**，不要追问「工单号」。
- 若写入 key：格式 `[A-Z][A-Z0-9]+-\d+`（如 `PROJ-123`）；`Fixes: proj-123` / `Fixes: PROJ123` 为非法。

## 压缩提交笔数（Gerrit / Code Review）

**动机**：客户仓常走 Gerrit；每笔 commit 往往需要 **+2**，笔数多会显著增加评审与合入操作成本。
**分层**：构建期本地碎交 = 允许；**归档 / push / 提审前压笔** = 门面强制（`baf-workflow check-commit-span`）；commitlint **不**限制笔数。

### 规格工作流双阶段策略（强制 · 与底层「每任务一交」和解）

| 阶段 | 策略 |
|---|---|
| **构建**（含底层按 task 提交） | **允许**每完成一个 task 提交一次，便于断点恢复与 TDD 留痕；WIP subject 可为英文，但仍须合法 Conventional Commits |
| **验证通过后 → 归档 / push 前** | **必须**将 `base-ref..HEAD`（plan 头 `base-ref`）压到少笔；默认倾向 **1** 笔业务交付；硬检查默认 **`≤3`**（`baf-workflow check-commit-span --base-ref <sha> [--max 3]`） |
| **最终对外消息** | squash 后的 subject **默认中文**（本 skill 语言约定）；然后才做归档元数据提交（可另成一笔 `chore: archive …`） |

**未通过笔数检查** → **不得**宣称可归档完成并 push；先 squash（未 push）或征得用户确认后再改写已推送历史。

**默认策略（非规格碎交场景仍适用）**

1. **同一次变更对外历史**：尽可能压成 **少笔**；默认倾向 **一笔** 覆盖可交付 diff。
2. **禁止**无必要地「每个文件一笔」作为**提审**历史；构建期碎交须在归档前消化。
3. 本地已产生过多笔且**尚未 push**：在用户确认后，用 squash / `rebase` 压笔，或在**同一 Change-Id** 上 `git commit --amend`（Gerrit hook 已就绪时）；**禁止**未获确认就 force push。
4. **push / 提审前**：跑 `check-commit-span`；超限必须 squash；**勿静默**改写已推送历史。

**可正当分笔的例外**

- 用户明确要求分笔或分 Change
- 相互无关的独立修复 / 必须单独 revert
- 大型无关 refactor 与业务改动不宜混在一笔（混在一起反而增加评审成本）
- **版本号 bump / 发版**（见下节）：必须单独一笔，即使同需求收尾
- **归档元数据提交**（`chore: archive …`）可在业务 squash 之后另成一笔

## 版本 bump 提交隔离（强制）

**版本号变更与 bump 提交必须独立，禁止与其它改动掺杂。**

适用于：本插件族发版（`baf` / `baf-workflow` lockstep、`baf-standard`、`baf-quality`），以及客户仓内对**自身版本清单**的显式 bump（若项目有 `VERSION` / `package.json` version / 插件 `plugin.json` 等）。

| 规则 | 要求 |
|---|---|
| 独立提交 | 一笔 commit **只**含版本 bump 及为对齐版本而改的清单文件（版本号字符串、发版说明中的版本字段） |
| 禁止混入 | 同一笔 **不得**含功能、修复、重构、规范正文、文档实质性改写、业务代码等 |
| 顺序 | 行为变更先提交 → 再单独 bump（推荐 `chore(release): …` / `chore(standard): bump …` 等） |
| lockstep | `baf` 与 `baf-workflow` 同号可在**同一笔** bump；其它独立版本插件各自单独 bump 提交 |
| 例外 | **无**。不得以「顺手」「少一笔」为由合并 |

与「压缩笔数」的关系：压缩的是**同阶段业务 diff**；bump 是发版边界，**故意分笔**，不算违规拆分。

## Gerrit / Change-Id

**判定（仅 hook，不用 remote URL）**

- 读 `.git/hooks/commit-msg`（若存在）。
- 内容含 Change-Id 相关逻辑（如 `Change-Id:` / Gerrit commit-msg 特征）→ 视为 **Gerrit 仓已就绪**。

**已就绪时的 Agent 契约**

1. `git commit` **必须**走 `commit-msg` hook（让 hook 注入/保留 `Change-Id:`）。
2. **禁止** `--no-verify` / `-n`（以及等价跳过 hook 的写法）。
3. **禁止**手写或自行算法生成 `Change-Id:`（避免与 hook 双写/冲突）。
4. `git commit --amend` 同 change：仍走 hook，保留已有 `Change-Id:`。
5. 提交后若消息无 `Change-Id:` → 提示 hook 可能未生效并协助检查，**不静默伪造**。
6. 结合上文：**同 Change 尽量少笔**；续作优先 amend / squash，避免为同一评审堆出多笔独立 commit。

**未就绪（无 hook / hook 无 Change-Id 逻辑）**

- 用户明确在推 Gerrit 或上下文表明 Gerrit 工作流 → 提醒安装官方 `commit-msg` hook（从 Gerrit 下载 / `scp` / 项目文档）。
- 非 Gerrit 仓：不提 Change-Id，按上文 CC + Jira 规则即可；**压缩笔数指引仍适用**（MR/PR 评审同样受益）。

**与 commitlint**

- `Change-Id:` 由 Gerrit hook 追加；commitlint **不**把 Change-Id 设为必过。
- 客户同时装 husky 与 Gerrit hook：本 skill 只要求「提交不跳过 hook」；多 hook 链属客户仓运维。

## Agent 契约

1. 代写或建议 `git commit -m` 时必须合规 CC；**默认中文 subject**，除非用户要求英文或目标仓明确约定全英文。
2. 修缺陷且已知 key → 带上；未知则问是否有缺陷 key（可答无）。
3. 提示用户已经 `/baf:init` 或 `apply-commit-lint --install` 时装全硬门时，本地 hook 会硬拦格式错误。
4. **不**在未授权时静默 `npm i`；但 **`/baf:init` → init-apply` 企业预设已含装全 commitlint 硬门**（用户授权 init 即覆盖）。单独 `apply-commit-lint` 无 `--install` 时仍只拷模板。
5. 若存在 Gerrit `commit-msg` hook：禁止 `--no-verify`；**不自行生成** `Change-Id:`；依赖 hook 注入。
6. 规格构建：允许底层「每任务一交」；**归档/push 前必须** `check-commit-span` 合格并保证最终 subject 默认中文。
7. **版本 bump**：必须单独一笔；禁止与功能/修复等同交；用户未要求发版时不要改版本号。
8. **禁止** `Co-Authored-By:` 及任何 AI/工具生成声明；正常 CC 提交即可。

## 反模式

| 借口 | 现实 |
|---|---|
| 「先随便写以后改」 | 格式必过；hook 会拒 |
| 「所有提交都要 Jira」 | 公司无需求 Jira；不强制 |
| 「用中文 type」 | type 必须用上表英文枚举 |
| 「subject 必须英文」 | 对内默认中文；仅在仓规/用户要求时用英文 |
| 「用 `-m` 就跳过 hook」 | 否；`-m` 仍触发 `commit-msg`，除非 `--no-verify` |
| 「URL 像 Gerrit 就造 Change-Id」 | 只认 hook；不自造 |
| 「先 `--no-verify` 再补」 | 禁止 |
| 「TDD/流程每绿一笔再提审」 | 本地可细；**提审/push 前压成少笔**；或全程少笔 |
| 「底层每任务一交所以不用 squash」 | **禁止**原样推碎历史；归档前必须 `check-commit-span` |
| 「每个文件/微步骤一笔」 | 无必要则禁止；Gerrit +2 成本高 |
| 「功能改完顺手 bump 一起交」 | **禁止**；bump 必须独立提交 |
| 「少一笔把 release 混进 feat」 | **禁止**；发版边界故意分笔 |
| 「默认要加 Co-Authored-By」 | **禁止**；删掉后按正常 CC 提交 |
| 「写 Generated with … 方便追溯」 | **禁止**；提交信息不体现工具署名 |
