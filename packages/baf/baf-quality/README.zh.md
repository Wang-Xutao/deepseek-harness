# @deepseek-ai/dsh-baf-quality

BAF 质量执行器与 C 栈 `StackAdapter`（企业级工作流契约 Phase 7.1）：
按基线驱动的 `build` / `test` / `coverage` / `analyzer` 执行，含逐项超时、
可取消、结构化失败原因、输出截断与密钥 redact。

[English](README.md) | 中文

## 为什么

verify 阶段需要知道变更是否破坏了企业真正在用的 C 工具链。命令、
编译器、覆盖率阈值都位于 `baseline.stack.*`——执行器读它们、按硬性
逐项预算跑、产出结构化 `QualityReport`，`passed` 标志位由结构化原因
算出，绝不从自由文本 diagnostic 推断。占位命令与缺失的覆盖率报告
均 fail-closed。

## 它做什么

`createCStackAdapter(options)` 返回一个 `StackAdapter`，含两个方法：

- `detect(ctx)` —— 探 `baseline.stack.compiler`（例如 `gcc --version`），
  把 `{compiler: '<version>'}` 写入 `toolVersions`。占位编译器在
  `diagnostics` 记探针失败。
- `runQuality(input, signal)` —— 读 `baseline.stack.{build, test,
  analyzers[]}` 与 `coverage.{required, minimum}`，每条命令经 shell
  执行器（默认 `spawn(command, { shell: true, signal, timeout,
  killSignal: 'SIGKILL' })`，逐项 300 s，每流输出上限 8 KB），产出每行
  一个 `QualityCheck`：

  | kind       | 命令来源                                     |
  | ---------- | ---------------------------------------- |
  | `build`    | `baseline.stack.build`                   |
  | `test`     | `baseline.stack.test`                    |
  | `analyzer` | `baseline.stack.analyzers[]` 的每一条     |
  | `coverage` | 无——从合并的 stdout/stderr 推出             |

  每条检查携带 `passed: boolean`、`reasonCode`（`'policy_missing' |
  'tool_missing' | 'timeout' | 'cancelled' | 'exit_code' |
  'threshold_not_met' | 'coverage_not_reported' | undefined`）、
  `exitCode`、`durationMs`、截断 + redact 后的 `output`。AWS access key、
  GitHub PAT / OAuth token、GitLab token、Slack token、通用 `api-key = …`、
  PEM 私钥块全部 redact。

最终 `passed` 标志位：

```ts
executed.length > 0
  && checks.every(c => c.passed)
  && !signal.aborted
```

其中 `executed = checks.filter(c => c.kind !== 'coverage' && c.command !== null)`。
全占位基线发出 `'no executable checks (all commands are policy placeholders)'`，
防止空执行集骗过门禁。coverage 数值阈值 fail-closed：数字 `minimum`
但工具输出无百分比 → `coverage_not_reported`（不能默认达标）。
`'project-config'` / 企业字符串视为信息性，通过。

`BafQuality` 是 Cordis 服务（`bafQuality`）。`Config.checkTimeoutMs` 默认
300 000 ms；`adapter(options)` 用该超时构造适配器。

## API

```ts
import { createCStackAdapter, BafQuality } from '@deepseek-ai/dsh-baf-quality'
import type { QualityCheck, QualityReport, QualityExecutor } from '@deepseek-ai/dsh-baf-quality'
```

- `createCStackAdapter({ timeoutMs?, executor? })` → `StackAdapter`
- `BafQuality`（Cordis 服务，名称 `bafQuality`，config `checkTimeoutMs`）
- `parseCoveragePercent(text)` —— 从 gcovr（`lines: 82.3%`）、lcov
  （`lines......: 82.3%`）、通用 `coverage: 82.3%` 输出提取 0–100 百分比
- `redactSecrets(text)` / `truncateOutput(text, max?)` —— 纯函数
- `shellExecutor()` —— 生产 `QualityExecutor`（用 `spawn` 因为基线命令是
  企业自有字符串、不是用户输入；安全理由见 `src/runner.ts`）
- `QUALITY_PLACEHOLDER` —— `<enterprise-tbd>` 哨兵
- `DEFAULT_CHECK_TIMEOUT_MS`（300 000）、`MAX_CAPTURED_CHARS`（8 000）

## 测试

```bash
npx vitest run packages/baf/baf-quality
```

测试套件用 fake `QualityExecutor` 编排确定性结果（超时、退出码、覆盖率
百分比），不真实 spawn 进程。
