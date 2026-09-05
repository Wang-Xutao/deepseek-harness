# Agent Note: 官方 BAF 仅内置（禁止用户复制与 user-root 同步）

Status: implemented

[English](2026-09-05-baf-builtin-only-no-user-copy.md) | 中文

## 问题

Phase 1 已将官方 BAF 放进 system preset root，但早期方案仍允许复制到 `~/.dsh/.agent-presets`，桌面插件同步也仍描述把 `agent-presets` 写入该 user root。企业产品确认禁止两者：同事只能使用内置 BAF，不得获得可写用户快照，也不得修改官方 composition。

## 决策

将官方 `baf` 视为仅内置：

- `isPresetCopyable('baf')` 为 false；`copyComposition` 以 built-in-only 错误拒绝；roster 行输出 `copyable: false`。
- 设置页对该行禁用「复制」（`officialNoCopy`）。
- 桌面 `syncPluginIntoDshHome` 只把 `skills/` 同步到 `~/.dsh/skills`，绝不把官方 preset 拷进 `~/.dsh/.agent-presets`。
- Persona 保持中英双语，先中后英。
- 企业输入冻结：OpenSpec=`latest`、C 编译器=`gcc`、覆盖率阈值=`project-config`。

本决策取代 [2026-09-05-baf-system-preset](2026-09-05-baf-system-preset.zh.md) 中「可复制到 user root」的一半；该 note 的 shipped 发现与 system trust 约定仍然有效。

## 考虑过的替代方案

### 为何不保留「复制成快照」给高级用户？

用户快照会与企业更新脱节，可被改成绕过 ToolGuard/baseline 假设，并重新引入已被信任模型否定的 user-root 安装路径。

### 为何不把插件 `agent-presets/` 同步留给非 BAF 包？

官方 BAF 根本不得走该路径。保留同步会让人误把 user-root 安装当成官方交付。现阶段插件包只同步 skills。

## 后果

- Authoring 测试断言拒绝复制；UI 测试断言禁用复制提示。
- 其他 shipped preset 仍按既有 authoring 规则可复制。
- Phase 9 仍负责签名的 managed system root 热更，但不把官方 BAF 写入用户 preset 目录。
