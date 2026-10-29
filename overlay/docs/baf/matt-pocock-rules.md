# Matt Pocock 规则 × OpenSpec 工作流（标准规则使用说明）

> 「Matt (Pocock) rules」在 BAF 里不是一份独立文档，而是一条贯穿 OpenSpec 各阶段的规则管线：规则源 → 会话指针 → 产物模板引用 → 阶段门禁校验。本文说明它如何并入 OpenSpec 流程；权威实现见 `packages/baf/baf-standard/src/provider.ts` 与 `packages/baf/baf-scaffold/src/scaffold.ts`。

## 1. 规则源：一份活文档

初始化工作区时，scaffold 在铺 baseline 的同时落下默认规则文档：

| 文件 | 说明 | 代码锚点 |
| --- | --- | --- |
| `.baf/standards/default-rules.md` | Matt Pocock 实践集的产品化默认值，8 个规则域按 `## <anchor>` 标题组织 | `baf-scaffold/src/scaffold.ts` `defaultRulesTemplate()` |
| `.baf/baseline.yml` 的 `standard.mattPocockRulesRef` | 默认即指向上面的文档，开箱生效；企业把这一项改为自有规则文档路径即可整体替换 | `baf-scaffold/src/scaffold.ts:160` |

规则文档是活文档：直接编辑内容即可，后续产物与引用按新内容执行，无需改产品代码。

## 2. 八个规则域（稳定契约）

域 id 与文档锚点一一对应（`baf-standard/src/provider.ts:33-42`，`STANDARD_AREAS`）：

| 锚点 | 域 |
| --- | --- |
| `project-charter` | 项目章程：每个 proposal 一句话说明服务于章程哪一项 |
| `coding-style` | 编码风格 |
| `interfaces` | 接口约定 |
| `error-handling` | 错误处理 |
| `logging` | 日志纪律 |
| `documentation` | 文档纪律 |
| `branch-commit` | 分支与提交：一个变更一个分支，提交信息说「为什么」 |
| `testing-discipline` | 测试纪律：行为变更带测试；Bug 修复先写回归测试（红→绿） |

`baf-standard` 只嵌入指针、不复制规则文本——规则源是唯一事实来源，模型按指针读文件。

## 3. 并入 OpenSpec 流程的四个融入点

| 阶段 | 融入行为 | 代码锚点 |
| --- | --- | --- |
| 会话（每阶段） | `baf:standard-rules` 指针块注入会话提示：列出 8 域锚点 + 「撰写 design.md / plan.json 前先读规则源对应锚点」；baseline 变更后 mtime 缓存自动重读 | `baf-workflow/src/session-gate.ts`（`renderStandardPrompt`；行为由 `tests/session-gate.spec.ts`「renders the rules-source pointer」用例锁定） |
| design | design 模板自带偏离声明条款：与规则源不一致的设计必须在文档内注明偏离的锚点与原因 | `baf-openspec/src/templates.ts:67-69` |
| plan / tasks | tasks 模板指向 `testing-discipline` 锚点：加测试的任务遵循测试纪律，Bug 修复先落回归测试（红，再绿） | `baf-openspec/src/templates.ts:85-88` |
| implement（缺陷修复路径） | 回归测试先行是硬门：修复代码的写入会被拒绝，直到回归测试文件已记录（与 `testing-discipline` 域同一条规则） | `baf-workflow/src/stages/implement.ts`（`assertRegressionFirst`） |

## 4. 未配置时（占位符语义）

企业尚未冻结规则来源时（`mattPocockRulesRef: <enterprise-tbd>`），`summarizeStandard` 判为 `policy_missing`：不加载任何规则值，也不允许模型即兴发明编码规范（`baf-standard/src/provider.ts:86-91`）。企业输入登记见 [enterprise-inputs.md](enterprise-inputs.md) 第 1 节「Matt Pocock 规则企业正式来源」。

> 注意：当前 scaffold 默认值已指向自带的 `default-rules.md`，开箱即 `ready`；占位符语义只影响手工把 ref 改回 `<enterprise-tbd>` 的工作区。
