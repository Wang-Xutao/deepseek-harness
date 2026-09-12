# @deepseek-ai/dsh-baf-scaffold

BAF 工作区脚手架（企业级工作流契约 Phase 7.4）：`init` 骨架——
基线模板 + OpenSpec 目录——具备人工确认、不覆盖已存在文件与
时间戳备份能力。

[English](README.md) | 中文

## 为什么

工作区必须在任何工作流阶段运行之前拥有基线（`open` → `plan` →
`verify` → `archive`）与 OpenSpec 变更根目录。运营者通常不会手写
这套布局：他们让入口来脚手架。脚手架绝不能静默覆盖已有内容，且
任何变更工作区的运营动作都列在基线的 `guard.requireHumanConfirmation`
列表中。

## 它做什么

`BafScaffold.scaffold(options)` 落盘：

- `.baf/baseline.yml` —— 结构上对 `parseBaselineManifest` 有效的基线清单，
  每个企业自有值都用 `<enterprise-tbd>` 占位（企业级工作流 §15：脚手架
  绝不臆测企业策略）。
- `openspec/changes/.gitkeep` —— 在任何阶段写入变更前保证目录存在。

每个计划文件：

- 文件不存在 → **创建**
- 文件存在且内容一致 → **跳过**
- 文件存在且内容不同 → 先改名为 `<path>.baf-backup-<iso 时间戳>`，再写入（**已备份**）

结果区分三种情形，方便调用方如实回报。

## 人工确认

`BafScaffold.scaffold({ humanConfirmed: false })` 返回

```ts
{ kind: 'refused', reason: 'human_confirmation_required' }
```

拒绝是一个值，不是异常——调用方（CLI / 智能体）决定如何呈现。

## API

```ts
import { scaffoldWorkspace, planScaffold, applyScaffold, baselineTemplate } from '@deepseek-ai/dsh-baf-scaffold'
```

- `planScaffold({ baselineId? })` → `ScaffoldPlan`
- `applyScaffold(workspaceRoot, plan, at?)` → `ScaffoldChanges`
- `scaffoldWorkspace({ workspaceRoot, baselineId?, humanConfirmed, at? })`
  → `ScaffoldOutcome`
- `BafScaffold`（Cordis 服务，名称 `bafScaffold`）
- `baselineTemplate(baselineId)` —— 渲染 YAML 文本的纯函数

## 测试

```bash
npx vitest run packages/baf/baf-scaffold
```
