# BAF 错误码清单（Phase 0 冻结）

> 消费者：`baf-core` 的 `BafError`、slash/CLI formatters、desktop bridge、工作流 Tab。
> 约定：错误码稳定字符串；载荷字段可扩展但不得删除已列必填项；展示文案由 locale 拥有，不把本表当 UI 文案源。

| code | 语义 | 必填载荷字段 | 触发场景 |
| --- | --- | --- | --- |
| `tool_unavailable` | 外部工具不可执行或未探测到 | `toolId`、`adapter`、可选 `versionRequested` | QualityRunner / OpenSpecAdapter / StackAdapter 探测或执行失败；不得伪装为通过 |
| `openspec_unavailable` | OpenSpec CLI/模板不可用 | `cli`、`versionRequested`、可选 `detectDetail` | `OpenSpecAdapter.detect()` 失败或版本不满足 baseline |
| `baseline_unavailable` | baseline 缺失、无法读取或解析失败 | `baselineId?`、`path?`、`cause` | loader 找不到文件、YAML/JSON 非法、schema 校验失败 |
| `baseline_incompatible` | baseline 与当前 BAF/plugin 版本不兼容 | `baselineId`、`bafVersion`、`min`、`max` | `bafCompatibility` 比对失败 |
| `policy_missing` | 企业策略或 baseline 字段为 unavailable 且该阶段硬依赖 | `field`、`consumer` | 企业输入未冻结且阶段不允许 fixture 替代 |
| `invalid_transition` | 转换不在 5.2 表内，或不满足允许条件 | `from`、`to`、`mode?`、`reason` | `WorkflowService.transition()` 拒绝 |
| `intake_confirmation_required` | 分类未确认前禁止写源码或进入 implement | `changeId`、`intakeStatus` | ToolGuard / transition 在确认前拦截 mutating 写 |
| `protected_path` | 写入命中 protected path 或路径逃逸 | `path`、`rule` | GuardPolicy / ToolGuard |
| `secret_detected` | 输出或写入命中 secret scan | `ruleId`、`location?` | GuardPolicy secret scan |
| `verify_required` | archive 或其他终态动作要求 verify 通过 | `changeId`、`lastVerifyStatus` | archive 前置条件失败 |
| `system_resource_conflict` | 试图修改/覆盖/shadow 官方 system 资源 | `resourceId`、`trust`、`operation` | authoring / plugin apply / zip 路径校验 |
| `model_route_unavailable` | 解析后的 provider/model 当前不可用 | `provider`、`model`、`phase`、`source` | route resolver / `resolveModelInfo` 失败 |
| `model_route_incompatible` | route 能力/上下文长度与阶段要求不兼容 | `provider`、`model`、`phase`、`capabilityGap` | route resolver 能力标签或上下文检查失败 |
| `model_fallback_blocked` | 无批准且兼容的 fallback | `provider`、`model`、`phase`、`fallbackGroup?` | fallbackPolicy `approved-only` 且无可用成员 |
| `projection_corrupted` | projection 事件损坏，停在该 seq | `changeId`、`seq`、`cause` | projection replay 单条损坏（不静默丢弃） |
| `scope_exceeded` | 实际修改超出 allowlist | `path`、`changeId` | implement / ToolGuard |
| `writer_conflict` | 第二 writer 争用 projection（不可靠文件锁平台显式拒绝） | `changeId`、`workspace` | projection append 锁 |

相关：`session/model-unavailable` 是 dsh session-controller 的 RemoteError，BAF route 层映射到上表 `model_route_*` 之一，不混用字符串。
