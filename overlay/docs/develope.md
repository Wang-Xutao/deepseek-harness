# BAF 工作区配置文件（二次开发）

面向需要改企业强制项或基线文件的维护者。产品设置页只展示用户可调偏好与只读总览；**企业基线与规则正文不在设置页保存**，请直接改下列文件后刷新设置或重开会话。

## 配置文件一览

| 路径 | 角色 | 谁改 | 设置页 |
|------|------|------|--------|
| `.baf/baseline.yml` | 企业权威基线（流程 / 质量栈 / 护栏 / 规范指针 / `userOverridePolicy`） | 企业维护者 | 只读投影 |
| `.baf/user-prefs.yml` | 用户可调偏好（仅 `userOverridePolicy` 允许的字段） | 开发者；可 git 共享 | **可编辑并保存** |
| `.baf/standards/*.md`（默认 `default-rules.md`） | 工程规则正文（Matt / 企业替换） | 企业维护者 | 只读展开 / 打开源文件 |
| `.baf/projection/` | 变更运行时状态 | 工作流运行时 | 不展示正文 |
| `openspec/` | OpenSpec 变更产物 | 工作流 / 开发者 | 只读路径 |

多模型路由不在本页：设备级文件在 `~/.dsh/baf-route-config.json` 与 `~/.dsh/baf-route-presets.json`，见设置「多模型路由」。

## 如何修改

1. **用户偏好（A）**
   设置 → 工作流 →「用户可调偏好」中改开关后点保存，写入 `.baf/user-prefs.yml`。企业未在 `baseline.userOverridePolicy` 放开的项不会出现。

2. **企业基线（B）**
   编辑 `.baf/baseline.yml`（YAML）。常见段：`workflow`、`stack`（编译器 / 构建 / 测试 / 覆盖率 / analyzers）、`guard`、`openspec`、`standard.mattPocockRulesRef`、`userOverridePolicy`。保存后在设置页点刷新即可看到投影。

3. **规则正文**
   编辑 `mattPocockRulesRef` 指向的 Markdown（默认可为 `.baf/standards/default-rules.md`）。设置页可展开各规则域或打开源文件查看；**没有写回 API**，请用编辑器保存。

4. **新建工作区骨架**
   会话中运行 `/baf-scaffold`，生成 baseline、默认规则与 OpenSpec 目录。

## 质量模块与 bafplugin 对照

| 设置页模块 | 对应能力 | 基线字段（示意） |
|------------|----------|------------------|
| 质量 → 单元测试 | baf-quality Ceedling / 覆盖率 | `stack.compiler`、`stack.build`、`stack.test`、`stack.coverage.*` |
| 质量 → 静态分析 | baf-quality lint（cpplint / cppcheck） | `stack.analyzers` |
| 安全护栏 | baf-guard 相关策略 | `guard.*` |
| 流程 / 门禁图 | baf-workflow 八节点 + 确认门 / 阶段门 | `workflow.*`；门禁注册在产品代码 |

更完整的企业落地设计见 [enterprise-workflow.md](enterprise-workflow.md) 与 [baf/](baf/)。
