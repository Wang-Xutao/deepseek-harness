# @deepseek-ai/dsh-baf-guard

BAF 工具硬门禁（企业级工作流契约 Phase 7.3）：按基线对每一次
`write` / `edit` / `bash` / `pwsh` 工具调用做裁决，对照工作流
projection，含密钥扫描、路径穿越防护与危险/间接 shell 模式识别。
另有一个 `GuardPolicy` 表面回答 verify 阶段对同一份 projection 状态
的查询。

[English](README.md) | 中文

## 为什么

MCP 服务器、子代理与 `bash` shell 都是绕过工作流阶段意图的路径。
硬门禁必须**在权限裁决之后、每次工具主体执行之前**运行——并且每次
调用都要重读 projection 状态（不做进程内缓存），这样 intake 确认、
allowlist 或阶段政策的任何翻转都立即改变门禁。projection 不可读时
门禁 fail-closed：写入持续被拒，直到 projection 修好。

## 两个表面，共享同一策略内核

包导出两个入口，都共享 `policy.ts`（纯路径与字符串处理——无 I/O）：

### `GuardPolicy` —— verify 阶段

```ts
ctx.bafGuard.policy(workspaceRoot): GuardPolicy
```

返回一个 `GuardPolicy.check(input, signal)`，支持两个 action：

- `action: 'verify'` —— 遍历每条 touched path，跑
  `adjudicateStructuralPath(config, root, path)`，返回
  `{ allowed: codes.length === 0, reasonCodes: codes }`。codes 包括
  `protected_path`（基线 `guard.protectedPaths[]`）、
  `system_resource_conflict`（`.git` / `.baf`）、
  `workspace_escape`（绝对路径在工作区根之外）、
  `path_traversal`（相对 `..`）。
- `action: 'secret-scan'` —— 读每条 touched path，跑
  `scanTextSecrets(text)`（AWS access key、GitHub PAT / OAuth token、
  GitLab token、Slack token、通用 `api-key = …`、PEM 私钥块）。
  `baseline.guard.secretScan === 'off'` 短路为
  `{allowed:true, reasonCodes:[]}`。
- 未知 action 返回 `{allowed:false, reasonCodes:['invalid_transition']}`。

### `ToolGuard` —— per-agent 运行时门禁

```ts
ctx.bafGuard.toolGuard({ workspaceRoot }): ToolGuard
```

`ToolGuard` 接 `ToolExecution`，要么返回 `undefined`（允许）要么返回
`[baf-guard] <code>: <message>` 形式的拒绝字符串。它**在**权限系统
**之后、**工具主体**之前**运行；只能拒绝，不能强制允许
（`ToolRuntime` 契约）。只对 BAF 组合暴露的四个变更工具做分类；
只读工具与未来工具直通。

- `classifyToolCall(name, args)` 映射：
  - `write` → `{ kind: 'fs-write', path: args.file_path, content: args.content }`
  - `edit` → `{ kind: 'fs-write', path: args.file_path, content: args.new_string }`
  - `bash` / `pwsh` → `{ kind: 'shell', command: args.command }`
  - 其他 → `{ kind: 'unrecognized' }`（允许）
- `adjudicateFsWrite` 串起：结构 → 密钥扫描 → active change →
  intakeConfirmed → DOC_STAGES change-dir 白 → implement allowlist；
  intake 确认后越界写为 `scope_exceeded`，无 active change 的写为
  `invalid_transition`。
- `adjudicateShell` 拦破坏集（`rm -rf /`、`mkfs`、`dd of=/dev/…`、
  `shutdown|poweroff|halt|reboot`、`git push --force`）+ 间接写集
  （`>` / `>>` 重定向、fd-to-file、heredoc、`tee`、`sed -i`、
  `perl -i`、`truncate`、`shred`、`cp`、`mv`、`rm`、`unzip`、`tar`、
  `wget`、`curl`）。

## projection 状态（同步、不缓存）

`projection-state.ts` **每次调用**都读 `.baf/projection/index.json` +
change log + allowlist（来自 `openspec/changes/<id>/plan.json` 或
`bug-fix-path-ledger.json`）。失败形态：

- index 不可读 → `{active:false, intakeConfirmed:false, allowlist:[]}`
- active change 但 log 不可读 → `{active:true, intakeConfirmed:false}`
  （写入持续失败直到 projection 修好）
- `.baf/baseline.yml` 缺 `guard` 段 → 回落到
  `DEFAULT_GUARD_CONFIG = { secretScan: 'required', protectedPaths: [] }`

## 安装 row（`@deepseek-ai/dsh-baf-guard/install`）

`install.ts` 走 `baf-workflow/commands` 同样模式：非隔离 row 注入
host `agents`，监听 `agent/created` 与 `agent/disposed`，每次创建从
`agent.session.header.cwd ?? process.cwd()` 取工作区，经
`agent.ctx.inject(['tools'], scope => scope.tools.guard(guard))` 装
门禁。Fiber disposal + `ctx.effect(() => async () => …)` 收尾把门禁
绑死在 agent 生命周期。导出 `name = 'baf-guard-install'` 与 preset
的 row id 对齐。

## 稳定 reason codes

| code                          | 何时                                              |
| ----------------------------- | ------------------------------------------------- |
| `intake_confirmation_required`| intake 未确认（或 projection 不可读）             |
| `protected_path`              | path 命中 `baseline.guard.protectedPaths[]`       |
| `secret_detected`             | 文件内容命中凭证模式                               |
| `workspace_escape`            | 绝对路径在工作区根之外                             |
| `path_traversal`              | 相对路径含 `..` 段                                |
| `system_resource_conflict`    | path 解析到 `.git` / `.baf`                       |
| `invalid_transition`          | 无 active change 的写入 / 未知 guard action        |
| `scope_exceeded`              | 写入超出 implement allowlist                      |
| `dangerous_command`           | `rm -rf /`、`mkfs`、`dd of=/dev/…` 等             |
| `shell_indirect_write`        | `>`、`>>`、`tee`、`sed -i`、`cp`、`mv`、`rm` 等   |

每条拒绝字符串都以 code **开头**，调用方（与测试）能直接匹配
`code:` 而不用解析散文。

## API

```ts
import { BafGuard } from '@deepseek-ai/dsh-baf-guard'
import {
  adjudicateFsWrite, adjudicateShell, adjudicateStructuralPath,
  classifyToolCall, createBafToolGuard, loadGuardConfig,
  readGuardWorkflowState, scanTextSecrets,
  type GuardPolicyConfig, type GuardWorkflowState, type GuardReasonCode,
  DEFAULT_GUARD_CONFIG, BAF_GUARD_PREFIX,
} from '@deepseek-ai/dsh-baf-guard'
```

- `BafGuard`（Cordis 服务，名称 `bafGuard`，config `{}`）
- `bafGuard.policy(workspaceRoot)` → `GuardPolicy`
- `bafGuard.toolGuard(options)` → `ToolGuard`
- 策略原语同样导出，供测试与下游调用方使用。

## 测试

```bash
npx vitest run packages/baf/baf-guard
```

20 用例覆盖：策略 reason codes、shell allow/deny 集、classification、
stable-prefix denials、re-adjudication flip、sync disk state（空工作区
→ `intake_confirmation_required`、real projection 驱动到 implement
→ allowlist honored）、`GuardPolicy` actions（`verify` /
`secret-scan` / `off`）、`install` row 装配合约。
