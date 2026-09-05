# Agent Note: 官方 BAF system preset 进入 shipped root

Status: implemented

[English](2026-09-05-baf-system-preset.md) | 中文

## 问题

企业 BAF 模式必须与 `standard` 一样出现在 shipped roster，且 `trust: system`，不能只装进 `~/.dsh/.agent-presets`（user trust）。若没有一等公民 shipped preset，后续 domain 插件没有可挂载的 composition，桌面 roster 也无法展示官方 BAF。

## 决策

在 `packages/preset/agent-presets/presets/baf/` 与其他内置 preset 并列交付：

- `preset.yml` 使用 `order: 2`（与 `ptc` 并列时按 id 打破平局，roster 顺序为 `standard`、`baf`、`ptc`、`minimal`、`cordis`）。
- `agent.cordis.yml` 从 `standard` 完整复制，替换 BAF persona，并以注释预留 Phase 2+ domain group（暂不引用尚未存在的包名）。
- 在 preset skills 树下提供 `baf-go`、`baf-c-guidance`、`baf-verification`，并通过 `skill-filesystem.customSkillDirs` 从 composition `baseUrl` 解析 `skills/`（与创造模式相同）。
- 在 `dsh-agent-presets/display` 与 `ui-agent-preset` 词典中增加 `presetBafName` / `presetBafDescription`。

`standard` 仍为部署默认。禁止删除 system `baf`；user 目录同名 `baf` 不能 shadow shipped root。官方 `baf` **禁止**复制到 user root — 见后续决策 [2026-09-05-baf-builtin-only-no-user-copy](2026-09-05-baf-builtin-only-no-user-copy.zh.md)。

## 考虑过的替代方案

### 为何不只通过 `overlay/plugin` 同步到 user root？

该路径得到 `trust: user`，可被覆盖/删除，无法满足 `overlay/docs/enterprise-workflow.md` 中的企业信任与更新模型。

### 为何 Phase 1 不把 domain 包写进 composition？

这些包要到 Phase 2+ 才存在。现在引用会导致挂载健康检查失败。用注释预留 `baf-domain` group，供后续启用。

### 为何不给 BAF 单独的 `order`，而与 `ptc` 共用 `2`？

Phase 1 计划冻结 `order: 2`。discovery 已对相同 order 按 id 打破平局；`baf` 会紧跟 `standard`，无需重排 `ptc`/`minimal`/`cordis`。

## 后果

- Roster、展示文案、CLI e2e id 列表与 web agent-preset 金标均包含 BAF。
- Phase 2 必须启用真实的 `@deepseek-ai/dsh-baf-*` 行并补挂载测试；桌面已不再把官方 preset 同步到 user root（见 [仅内置 note](2026-09-05-baf-builtin-only-no-user-copy.zh.md)）。
- BAF 仍保留 `tool-workflow`/`ralph` 供实现阶段可选扇出；Phase 7 的 ToolGuard 仍须禁止它们改写 projection 或跳过 verify。
