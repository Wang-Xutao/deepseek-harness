# BAF 能力插件方案：代码库索引 / C 语言 LSP / 经验沉淀与记忆

> 对应用户需求 4、5、6（批次二十五）。三项工作都先做了**开源插件调研**，结论是**生态内已有可用插件**，因此按用户口径进入「推荐插件」清单；本文同时给出**清单之外的落地要求**——插件装上之后，BAF 侧还要做什么，以及每条链路的风险与验证口径。
>
> 清单本体：`overlay/plugin/featured-plugins.json`（schemaVersion 1，revision 3）。面向用户的说明：`overlay/docs/help/featured-plugins.md`。

## 结论速览

| 能力 | 生态内现成插件 | 结论 | 进清单 |
| --- | --- | --- | --- |
| 代码库索引 + 上下文感知 | `@lovedolove/dsh-codebase-memory-mcp` | 有，且上游体量与活跃度领先 | ✅ `dsh-codebase-memory` |
| C 语言 LSP | `dsh-code-navigator`（另有上游通用 LSP 接入层） | 有，且上游自带通用接入 | ✅ `dsh-code-navigator` |
| 经验沉淀与记忆 | `@openviking/dsh-memory-plugin`、`@jacklika/dsh-memory` | 有，且社区供给过剩 | ✅ `dsh-memory`、`dsh-memory-vault` |

上游 DSH **没有**自带的代码索引包与经验沉淀包：`packages/` 下 grep `tree-sitter|repoMap|codeIndex|codebaseIndex|symbolIndex` 与 `lessons-learned|episodic` 只命中无关文件。仓库里与「跨会话记忆」最接近的是 `packages/experimental/tool-ralph`（工作区充当跨轮记忆）与 `packages/experimental/session-search`（原始历史检索，非经验蒸馏）。

## 一、代码库索引（代码索引 + 上下文感知）

### 1.1 选型

`@lovedolove/dsh-codebase-memory-mcp` v0.1.4（MIT），上游 `DeusData/codebase-memory-mcp`（MIT，4.7 万星、3.9 千 fork，近日常有提交）。

它把上游的 tree-sitter + SQLite 知识图谱接成 **DSH 原生工具**（`cbm_search` / `cbm_snippet` / `cbm_arch` / `cbm_trace` / `cbm_search_code` / `cbm_projects`），并自带图谱可视页与 `/cbm` 状态命令。

### 1.2 优势

- **图谱回答结构问题**：调用链、模块归属、架构概览是 grep 给不出的；跨模块改动时模型少走一轮试错。
- **建议贴合现状**：索引携带真实符号与调用关系，模型倾向于顺着现有实现改写，而不是另起一套写法。
- **原生工具而非 MCP 往返**：工具直接挂在 `ctx.tools`，不额外占上下文、不引入 MCP 进程链路。
- **可视化自证**：索引是否建成、覆盖到哪些目录，用户可以在插件自带的图谱页里直接看到。

### 1.3 风险与 BAF 侧必须补的事

1. **插件只是桥**：原生二进制 `codebase-memory-mcp` 需另行安装（`npm i -g codebase-memory-mcp`）。缺原生组件时插件在加载期就不注册工具——**卡片必须写明这一点**，否则用户会以为装完即用。
2. **原生二进制的分发与版本管理**落在桌面端：安装、版本锁定、PATH/EXE 解析、daemon 生命周期。建议把桥接逻辑收进 BAF 自维护包（而不是长期依赖第三方包名），避免上游改名/下架导致清单失效。
3. **Web UI 监听 localhost:9749**：商用分发需要处理端口冲突与本地暴露面。
4. **首次索引耗时**与增量更新策略需要压测后再定是否默认开启。

### 1.4 若清单插件不可用时的完整实现方案（备用路径）

用户口径是「无插件则给出完整实现方案」。本次**有**插件，但备用路径同时留存，便于上游失联时自研：

| 层 | 方案 | 落点 |
| --- | --- | --- |
| 解析层 | tree-sitter 解析 C/C++/Python/TS，抽取符号表（定义、引用、继承、include） | 新包 `packages/baf/baf-code-index`，语言适配器一个目录 |
| 索引层 | SQLite + FTS5 落库，符号表 + 文本块双索引；文件 mtime/hash 增量更新 | 同包，`index/` 子目录 |
| 图谱层 | 符号 → 定义边、符号 → 引用边、文件 → 包含边；调用链用调用点 AST 匹配 | 同包，`graph/` 子目录 |
| 感知层 | 「上下文感知」= 按当前任务（文件、符号、错误栈、对话提及）装配上下文包：定义 + 调用方 + 被调用方 + 相关测试 | 同包，`context/` 子目录，返回裁剪后的片段集 |
| 工具层 | 暴露 `code_index_search` / `code_index_snippet` / `code_index_refs` / `code_index_architecture` / `code_index_context` 五个只读工具 | 走 `ctx.tools`，与上游 `tool-lsp` 同风格 |
| 工作流挂接 | 实现阶段自动注入「本阶段相关文件清单 + 上下文包」到工单产物要求；确认门前给出「影响面」提示 | `packages/baf/baf-workflow` 的 route/产物要求 |
| 生命周期 | 索引随工作区建立、随变更重建增量；缓存放工作区 `.dsh/index`，不入 session 日志 | 同上 |

关键取舍：**索引是可重建的派生物**，不进会话日志（模型可见内容仍可从 session 日志重建）；只把「模型读过的片段摘要」写进工单产物，索引本体留在工作区。

## 二、C 语言 LSP

### 2.1 选型

上游 DSH **自带通用 LSP 接入层**：`packages/lsp/lsp`（能力 seam `ctx.lsp`，按扩展名选 provider）+ `packages/lsp/lsp-stdio`（通用 stdio provider）+ `packages/lsp/tool-lsp`（模型侧 `lsp` 工具）。

`packages/lsp/README.md` 明确写着：「Deployments must supply and configure their language servers; **this group ships none**.」——语言服务要部署方自己配。

因此 **C 语言本身不需要新插件**，只需配置：

```yaml
lsp:
  servers:
    c:
      command: clangd
      extensionToLanguage:
        '.c': c
        '.h': c
        '.cpp': cpp
        '.hpp': cpp
```

社区插件 `dsh-code-navigator` v0.1.0（MIT）补的是「自带语言服务器 + clangd 引导」这一段（也内置 pyright / typescript-language-server），并提供 C/C++ 的配置说明。清单收录它，是因为**开箱即用**比让用户自己写配置更合适。

### 2.2 优势

- **编译器级事实**：clangd 读编译配置与头文件索引，定义/引用/实现/悬停是确定答案。
- **零 provider 成本**：语言服务在本地跑，不消耗模型配额。
- **provider 中立的上游**：`packages/lsp/lsp` 的模型侧协议不随语言变化，换 server 不改 schema；`finalExtension()` 同时按两种路径分隔符切分，Windows 路径已处理。
- **许可干净**：clangd 属 LLVM（Apache-2.0 WITH LLVM-exception），可再分发。

### 2.3 风险与 BAF 侧必须补的事

1. **只读**：上游 `lsp` 只覆盖 4 个操作（goToDefinition / findReferences / goToImplementation / hover），**没有 diagnostics / 格式化 / rename**。C 编译错误闭环要另接诊断类插件（如 `dsh-lsp-diagnostics`），否则「改了 C 代码但编译不过」只能靠用户自己贴报错。
2. **clangd 不随包分发**：必须做缺失检测 + 一键安装引导（`dsh-code-navigator` 的做法可参考）。
3. **大工程开销**：clangd 建索引吃内存与 CPU；上游 `lsp-stdio` 默认 `maxDocumentBytes` 4MB、单工作区串行查询。
4. **peer 范围不合**：该插件声明 `@deepseek-ai/dsh-fs` 等 `^0.1.2-alpha.3`，本仓为 0.2.1-rc.3，装机会弹一次「兼容确认卡」——清单里以 `peerExemptionExpected: true` 标注。

## 三、经验沉淀与记忆

### 3.1 选型

社区供给过剩，两个方向各取一个：

- `@openviking/dsh-memory-plugin` v0.5.29（Apache-2.0，volcengine/OpenViking）：**近月下载量 36,584**，记忆类里遥遥领先。
- `@jacklika/dsh-memory` v0.1.7-rc.40（MIT，JackLiKa）：Obsidian 兼容的 Markdown 经验库，自带 curator（`memory_recall` / `memory_capture`，行动前回忆、关键工作后沉淀，带冲突检测与可选人工确认），近月下载量 3,870。

### 3.2 优势

**`dsh-memory`（通用记忆）**

- **用量与维护度**：36.6k/月 vs 清单里飞书的 1.4k/月，是本清单里除插件市场外用量最高的。
- **跨会话复用**：项目级共享记忆，换窗口接着干不用重新交代背景。
- **peer 范围干净**：`dsh-llm` / `dsh-mcp-client` / `dsh-skill-filesystem` 都是 `>=0.1.0-rc.6 <1.0.0-0`，本仓 0.2.1-rc.3 在范围内——安装不必走兼容确认卡。

**`dsh-memory-vault`（经验沉淀）**

- **沉淀的是经验**：curator 在动作前先回忆既有经验、在关键工作后提炼可复用结论，沉淀物本身就是下一次的可用知识。
- **冲突可控**：新沉淀与既有经验冲突时会被检测出来，并可选择人工确认，避免把错误结论固化。
- **人可读、可版本管理**：经验落在 Markdown 库里，能读、能 diff、能进 Git；离线可用，不依赖向量服务。
- **取舍提示**：rc/alpha 版本号，接口可能变，清单里要锁版本范围。

### 3.3 风险与 BAF 侧必须补的事

1. **中文召回质量须自建评测**：各家都自研 CJK 检索，宣称口径不一，不能凭宣传语定胜负。
2. **并发写入**：Markdown 库与大批量并发写需要评审（curator 已做串行写）。
3. **许可条款**：OpenViking 是 Apache-2.0（含专利条款）；Serena、`aoci-code` 等 GitHub license 均为 `NOASSERTION`（非 OSI 标准许可），**商用产品存在授权风险，不建议收录**。
4. **与 BAF 工作流阶段的贴合度**待验证：记忆条目是否需要绑定 BAF 的阶段（分类 / 设计 / 实现 / 验证），当前两个插件都不知道 BAF 的阶段模型。

## 四、验证口径（本批实测）

- npm 上四个包均存在，版本、仓库、许可、peer 范围、engines 已逐条核对（`npm view`）。
- 近月下载量取自 `https://api.npmjs.org/downloads/point/last-month/<pkg>`（2026-10-25 实测）：`@openviking/dsh-memory-plugin` 36,584 / `@jacklika/dsh-memory` 3,870 / `@jacklika/dsh-memory-curator` 2,074 / `@lovedolove/dsh-codebase-memory-mcp` 1,045 / `dsh-code-navigator` 998 / `dshmarket` 601,430 / `@dsh-feishu/dsh-feishu` 1,355。
- 清单字段由 `packages/baf/baf-featured` 的 `parseFeaturedManifest` 校验，并由 `packages/baf/baf-featured/tests/featured.spec.ts` 锁定 revision 与条目 id 列表。

## 五、遗留与下一步

- 代码索引的**原生二进制分发**（桌面端安装/版本/daemon 生命周期）未做，需先做一轮 clangd 与 `codebase-memory-mcp` 的跨平台安装路径验证。
- C 语言 diagnostics（编译错误闭环）未接，当前只有 4 个只读导航操作。
- 记忆插件与 BAF 阶段模型的贴合度需要一次真实项目的中文召回评测。
- 记忆类插件在 Linux/macOS 上的安装路径未验证（本批只在 Windows 上核对了 npm 元数据）。
