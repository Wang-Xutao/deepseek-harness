# 项目级经验沉淀配置 · 方案（待评估，未实现）

> 状态：**方案稿，未实现**。本文只描述「应该怎么做」，供评估后再决定是否落地。
> 作者：2026-10-30 · 对应用户需求：*「项目工程中，增加项目经验的沉淀配置」*

---

## 0. 一句话结论

把「项目经验」做成 **工作区里一份可被审阅、可被版本管理、可被模型按阶段取用的条目库**（`.baf/experience/*.md` + 一份索引 `.baf/experience/index.md`），由 **模型在阶段结束时提出候选、由客户在确认门拍板入库**，由 **检索器按「阶段 + 文件路径 + 关键词」把命中条目注入到该阶段的工单里**。入口放在 `设置 → 工作流 → 项目工程` 的一个新区块「项目经验」，与「受保护路径」「状态进出 hook」并列。

理由：现有开源生态里**没有一个方案同时满足「项目级」「自动沉淀」「按需注入」「不炸上下文」「可审阅」**五项；最接近的两种（AGENTS.md 类静态指令、Claude Code 的 auto memory）各缺一半。详见 §2、§4。

---

## 1. 现状盘点：BAF 今天已经有什么、缺什么

### 1.1 已有的（不要重复造）

| 已有能力 | 位置 | 与「经验沉淀」的关系 |
|---|---|---|
| 基线配置 `.baf/baseline.yml` | `packages/baf/baf-standard/`、`overlay/plugin/standards/baf-baseline-c/` | 项目的**静态**约束（受保护路径、必过门、技术栈）。经验是**动态**的，两者互补而不重叠。 |
| 阶段产物 `openspec/changes/<id>/*.md` | `packages/baf/baf-openspec/` | 单次变更的**过程记录**（提案、设计、计划、账本）。经验是**跨变更**的沉淀。 |
| 文档生命周期（未生成/未填写/已填写/已完成/已更新/待更新） | `packages/baf/baf-core/src/artifact-lifecycle.ts` | 已锁文档的机制可复用：经验条目同样需要「已确认 / 已被推翻」的语义。 |
| 确认门（拍板卡）机制 | `packages/baf/baf-workflow/src/gate-dialog.ts`、`gate-cards.ts` | 经验的**入库审批**天然是一个确认门，不必新造交互。 |
| 模型派单（work order）通道 | `packages/baf/baf-workflow/src/go-dispatch.ts` | 经验注入的落点就是工单正文。 |
| 模型可见 ⟺ 已入日志 | 仓库规约（`AGENTS.md`） | 经验一旦入库并被注入，必须有对应的 session 事件，否则违反仓库规约。 |

### 1.2 缺的（本次要补的）

在 `packages/baf/**` 里全量搜索 `经验 / lesson / pitfall / retro / 复盘 / 沉淀`，命中只有 2 处，且都是无关词（`baf-featured/README.zh.md` 的字面描述、`baf-core/src/route-tier.ts` 的 `tier`）。**结论：BAF 今天没有任何「跨变更的项目经验」概念。**

几个**容易被误认成**「已经有了」的东西，明确排除：

| 东西 | 位置 | 为什么不是项目级经验 |
|---|---|---|
| `standard.mattPocockRulesRef` 指针 | `baseline.yml` 的 `standard` 块 | 它指向一份**外部**的规范文件（`.baf/standards/default-rules.md`），是**人写死的规则**，不是从事实里长出来的经验。 |
| `host-memory`（`sharedHostMap` / `sharedHostSet`） | `packages/baf/baf-workflow/src/host-memory.ts` | 进程态的运行时记忆（派单账本、暂停标志、焦点）——**进程一重启就没了，也从不进版本管理**。 |
| `dsh-memory` 精选插件 | 仓库的精选插件目录 | **用户级**、插件自持的记忆，不属于项目，也不参与 BAF 的变更流程。 |
| `artifact-lifecycle` 六态 | `packages/baf/baf-core/src/artifact-lifecycle.ts` | 描述**单份文档**的状态机，不是跨变更的知识沉淀。 |

### 1.3 用户到底要什么（拆解原话）

> 「项目工程中，增加项目经验的沉淀配置。」

三个关键词：

- **项目工程** → 位置在 `设置 → 工作流 → 项目工程`（`packages/client/ui-settings-baf-standard/src/client/StandardsOverview.tsx`）。
- **沉淀** → 经验是**攒起来的**，来源是过去真实发生的变更，不是人工凭空写的一段说明。
- **配置** → 客户要能**控制**它：开关、范围、审批方式、淘汰策略，而不是被模型单方面改写。

---

## 2. 开源实践调研（已实际抓取的来源）

调研维度固定为五问：**存什么 / 放哪里 / 作用域 / 怎么取用 / 怎么保鲜**。

### 2.1 AGENTS.md —— 事实上的通用指令标准

- 来源：<https://agents.md/> · <https://github.com/agentsmd/agents.md>
- **存什么**：项目给 agent 的上下文与指令（构建、测试、代码风格、PR 规范），本质是「给 agent 的 README」。
- **放哪里**：仓库根目录 `AGENTS.md`；大仓在子目录再放一份，**离被改文件最近的那份优先**。
- **作用域**：仓库级 / 目录级。官方页面列出已支持的工具：Codex、Jules、Factory、Aider、goose、opencode、Zed、Warp、VS Code、Devin、UiPath、Junie。
- **怎么取用**：按目录树就近读取；**用户在对话里明说的话优先级最高**。
- **怎么保鲜**：「把它当成活文档，随时可以改」。
- 规模事实：官方称被 **6 万+ 开源项目**使用。
- 边界：官方 FAQ 明确「没有必填字段，就是普通 Markdown」。**它是人写给 agent 看的，不是机器自动沉淀的。**

### 2.2 Claude Code —— CLAUDE.md + `.claude/rules/` + auto memory

- 来源：<https://docs.claude.com/en/docs/claude-code/memory>
- **存什么**：分三层——
  1. `CLAUDE.md`（项目根 + 子目录）：项目长期指令；
  2. `.claude/rules/`：**带 frontmatter 的规则文件**，可用 `paths:` 声明「只在动这些路径时加载」；
  3. **auto memory**：让 Claude **自动累积 learnings**，并提供 `/memory` 命令让客户**审阅和编辑**这些记忆。
- **放哪里**：`CLAUDE.md` / `.claude/rules/*.md`（可被 symlink 共享到多项目）；auto memory 由产品自己存。
- **作用域**：项目 / 目录 / 路径 / 用户级；规则文件按 `paths:` glob 命中才加载。
- **怎么取用**：项目根 `CLAUDE.md` **常驻**；嵌套 `CLAUDE.md` 与带 `paths:` 的规则**按需加载**（文档原话：compaction 后项目根的 `CLAUDE.md` 会**从磁盘重读并重新注入**，嵌套文件与路径规则「需要时再加载」）。
- **怎么保鲜**：两个关键机制——
  - **体积上限**：超出上限会被判「Over the limit」，对策是「拆成多个 rules 文件，每个各自算额度」；过小的文件则去查别的原因。
  - **`/memory` 审阅面**：客户能看「它到底记了什么」，并直接编辑。
- **边界（对本方案最重要）**：Claude Code 的 auto memory 是**产品级、私有的、不可移植的**——它不落在仓库里、不进版本管理、别的工具读不到。

### 2.3 GitHub Copilot —— 仓库级 + 路径级 + 优先级

- 来源：<https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot>
- **存什么**：自然语言 Markdown 指令，告诉 Copilot「怎么理解这个项目、怎么构建、怎么测试和验证它的改动」。
- **放哪里**：
  - 全仓：`.github/copilot-instructions.md`
  - 路径级：`.github/instructions/NAME.instructions.md`，frontmatter 用 `applyTo: "glob"` 声明适用范围（多个用逗号分隔）；可选 `excludeAgent: "code-review" | "cloud-agent"`。
- **作用域**：个人 > 仓库 > 组织；**三套同时提供**（官方：「Whenever possible, try to avoid providing conflicting sets of instructions」）。
- **怎么取用**：保存即生效，**自动附加到发往 Copilot 的请求里**；路径级只在动匹配文件时生效。
- **怎么保鲜**：可在仓库设置里全局关掉；**PR review 读的是 head 分支上的指令**（所以指令的改动可以和代码改动一起被评审）。

### 2.4 MADR —— 决策记录的结构化范式

- 来源：<https://adr.github.io/madr/>
- **存什么**：一条「有架构意义的决策」及其理由。模板字段：
  - frontmatter：`status`（proposed / rejected / accepted / deprecated / superseded by ADR-0123）、`date`、`decision-makers`、`consulted`、`informed`
  - 正文：`Context and Problem Statement` → `Decision Drivers` → `Considered Options` → `Decision Outcome`（**Chosen option: "X", because …**）→ `Consequences`（Good / Bad / Neutral）→ `Confirmation`（**怎么确认这条决策被落实了**）→ `Pros and Cons of the Options` → `More Information`
- **放哪里**：`docs/decisions/NNNN-title-with-dashes.md`，编号连续；**分类用子目录**（按架构结构分 `backend/` `ui/`）。
- **怎么取用**：靠**被引用**（正文里链到别的 ADR），不靠自动检索；`adr-tools` 这类工具按文件名模式遍历。
- **怎么保鲜**：`status` 字段承载生命周期；`superseded by ADR-0123` 表达「被推翻」。
- **对本方案最大的启发**：`Consequences` 的 **Good / Bad / Neutral** 三分法，和 `Confirmation`（怎么验证落地）——这两节正是「经验」与「决定」的差别所在。

### 2.5 llms.txt —— 「索引 + 按需取详情」

- 来源：<https://llmstxt.org/>
- **存什么**：一个 Markdown 索引。规定顺序：H1 名字（**唯一必填**）→ 引用块摘要 → 可选细节段落 → 若干 H2 分节，每节是「文件清单」（`[名称](url): 备注`）。
- **放哪里**：站点根 `/llms.txt`，或任意子路径（`/docs/llms.txt`），**覆盖其路径下的所有页面**；多个文件并存时**取最具体的那一个**。
- **怎么取用**：**「文件本身要小到能塞进上下文；细节藏在链接后面，需要时才取」**——这正是 BAF「阶段产物按需打开」的同一思路。
- **怎么保鲜**：文档站自动生成（Mintlify、GitBook、Yoast、AIOSEO、Wix）；Chrome Lighthouse 的 agentic browsing 检查会审计它；OpenAI / Anthropic / Gemini 都在自己文档站发布了自己的 `llms.txt`。
- **对本方案最大的启发**：**「短索引 + 长详情」的两段式**。这直接决定了 §4 的注入策略。

### 2.6 Cursor —— Rules / Skills / MCP

- 来源：<https://docs.cursor.com/context/rules>（**注意**：抓取时该 URL 被重定向到 <https://cursor.com/docs> 首页，Rules 细则页未取到正文，因此本节只记已核实部分）。
- 已核实：Cursor 官方文档站设有 **Agent / Rules / Skills / MCP** 的顶层分类，Rules 是其项目级定制的正式位置。
- **未核实**：`.cursor/rules/*.mdc` 的 frontmatter 字段（`description` / `globs` / `alwaysApply`）与目录级 rules 的继承细节——**本方案不依赖这些细节**，仅引用「Rules 是项目级定制」这一层。

### 2.7 Aider —— 把 AGENTS.md 当作可配置的 read 源

- 来源：agents.md 站点给出的 Aider 配置片段（<https://agents.md/> FAQ）。
- `.aider.conf.yml` 里一行 `read: AGENTS.md` 就能让 Aider 读它。
- 意义：**同一份文件可以被多个工具消费**——这是「用开放格式而不是私有格式」的收益。

### 2.8 更多一手来源（由并行调研实际抓取）

| 来源 | URL | 关键事实 |
|---|---|---|
| **Cline Memory Bank** | <https://docs.cline.bot/best-practices/memory-bank> | 用 Markdown 文件当「记忆银行」，按层级（全局 / 项目 / 角色）组织，靠**链接**把记忆串起来而不是塞进上下文。 |
| **Roo Code Custom Instructions** | <https://docs.roocode.com/features/custom-instructions> | 同样是仓库级指令目录 + 作用域的思路。 |
| **Aider repo map** | <https://aider.chat/docs/repomap.html> | 代码库地图是**分层**的（符号级摘要 + 随需展开），印证「索引常驻、详情按需」。 |
| **Keep the Why** | <https://github.com/oliver-zehentleitner/keep-the-why> | 给决策/改动附「为什么」，字段命名值得抄（`status` / `supersededBy` / `reviewAfter`）。 |
| **Mneme** | <https://github.com/MnemeHQ/mneme> | 记忆的**提案工具只产生非权威提案**，由 host 落盘——与本方案 §4.4 的「模型提议、host 落盘」同构。 |
| **kgai** | <https://github.com/kgaidev/kgai> | 知识图谱化的项目记忆，强调可解释的召回。 |
| **Google eng-practices** | <https://google.github.io/eng-practices/> | code review 的「小改动」准则——评审体验沉淀必须落在**可评审的产物**上。 |
| **ADR（另一套）** | <https://github.com/joelparkerhenderson/architecture-decision-record> | 与 MADR 对照的 ADR 目录约定。 |
| **Cursor Rules / llms.txt** | <https://cursor.com/docs/rules.md> · <https://cursor.com/docs/llms.txt> | Cursor 官方提供 Rules 与 llms.txt 的机器可读入口。 |
| **Claude Code memory（.md 版）** | <https://code.claude.com/docs/en/memory> | 与 `docs.claude.com` 同源，页面更新到 2026-10-27。 |

### 2.9 横向对比表

| 方案 | 存什么 | 放哪里 | 作用域 | 怎么取用 | 怎么保鲜 | 机器自动沉淀？ |
|---|---|---|---|---|---|---|
| AGENTS.md | 人工写的项目指令 | 仓库根 / 子目录 | 仓库·目录 | 就近常驻 | 手改 | ❌ |
| CLAUDE.md | 人工写的项目指令 | 根 / 子目录 | 仓库·目录 | 常驻 | 体积上限 + 手改 | ❌ |
| `.claude/rules/` | 带 `paths:` 的规则 | `.claude/rules/` | 路径 | 按 glob 命中才加载 | 拆分文件 | ❌ |
| Claude auto memory | 模型自己攒的 learnings | 产品私有存储 | 产品/用户 | 私有 | `/memory` 审阅 | ✅（但不可移植） |
| Copilot instructions | 人工写的指令 | `.github/**` | 仓库·路径·组织 | 始终注入 | 仓库设置可关 | ❌ |
| MADR | 决策 + 理由 + 后果 | `docs/decisions/` | 仓库·分类 | 被引用 | `status` 生命周期 | ❌ |
| llms.txt | 索引 + 链接 | 站点/子路径 | 站点 | 索引常驻、详情按需 | 工具自动生成 | ⚠️ 半自动 |
| **BAF 本方案** | **经验条目** | **`.baf/experience/`** | **项目·阶段·路径** | **索引常驻 + 命中条目注入** | **确认门 + 淘汰策略** | **✅（候选机器产出，人拍板）** |

### 2.10 调研得出的五条规律（设计的依据）

1. **永远需要一个「短索引 + 长详情」的两段式**（llms.txt 的核心）。经验条目不能整库塞进上下文。
2. **就近/最具体优先**（AGENTS.md 的目录树规则、llms.txt 的「取最具体的一个」）。作用域要能分层命中。
3. **必须有人工审阅面**（Claude Code 的 `/memory`、MADR 的 `status`、Copilot 的仓库设置开关）。机器沉淀的东西客户必须能看、能改、能关。
4. **必须有体积/数量预算与淘汰机制**（Claude Code 的超限判定）。否则经验库会自己把自己埋掉。
5. **经验与「指令」是两种东西**：指令是人写死的约束；经验是**从事实里长出来的、带后果和适用范围的判断**。所以经验条目至少要带「适用场景 / 结论 / 依据 / 来源」。

---

## 3. 需求再翻译成产品语言

| 用户视角 | 产品语言 |
|---|---|
| 我不想每次都跟模型解释这个项目的老规矩 | 项目级经验条目，在相关阶段自动出现在工单里 |
| 我不想让模型自己偷偷改规则 | 经验入库必须过确认门；客户可编辑、可停用、可删除 |
| 我不想经验库越滚越大、越滚越没用 | 条目有状态（生效/待更新/已失效）、有命中统计、有淘汰规则 |
| 我想知道「它到底记了什么」 | 项目工程页可见全部条目：来源、依据、命中次数、最后命中时间 |
| 我不想它把上一个坑当经验照抄 | 条目必须带**依据**（哪次变更/哪个产物）与**适用范围**，命中时可核对 |

---

## 4. 推荐方案

### 4.1 命名与文件布局

工作区（项目）根：

```
.baf/
  baseline.yml              # 已有：静态基线
  experience/
    index.md                # 短索引：每条一行，模型常驻可读（≤ 200 条 / ≤ 4000 字）
    E-0001-配置读取必须走统一入口.md
    E-0002-ECUM 解析失败时先看版本号.md
    ...
```

为什么是 `.baf/experience/` 而不是 `openspec/changes/…`：

- 经验是**跨变更**的，`openspec/changes/<id>/` 是**单次变更**的目录，语义不同。
- `.baf/` 已经是 BAF 的项目级配置根（`baseline.yml` 在那里），经验放同根，客户一眼知道「这是项目级的东西」。
- 进版本管理（客户自己决定是否 commit）——这是与 Claude auto memory 的**本质区别**：经验必须能被 code review 评审。

### 4.2 条目数据模型

**文件正文用 Markdown**（人可读、可 diff、可 review），**元数据用 YAML frontmatter**（机器可检索）——这是 Copilot instructions / MADR / Claude rules 的共同做法。

`E-0002-ECUM 解析失败时先看版本号.md`：

```markdown
---
id: E-0002
title: ECUM 解析失败时先看版本号
status: active            # active | superseded | retired
scope:
  stages: [design, implement]   # 哪些阶段取用
  paths: ["ecum/**/*.c"]        # 哪些文件路径相关（glob，可空 = 全局）
  modules: [ecum]
tags: [解析, 版本, 调试]
claim: "ECUM 解析失败时，先确认调用方的协议版本，再看解析器分支"
rationale: "2026-10-28 的变更 change-20261028-ecum-ba15 在版本不匹配时走了 fallback 分支，
            表现与解析 bug 相同，排查耗了两轮"
evidence:
  - change: change-20261028-ecum-ba15
    artifact: openspec/changes/change-20261028-ecum-ba15/design.md
    lesson: "报告里出现 'unexpected protocol version' 时，先比对 design.md 的接口约定"
applies: "仅当改动涉及 ecum 的解析入口或协议版本时适用"
counterExample: "2026-10-30 的 change-20261030-ecum-55df 属于解析逻辑本身的问题，不适用本条"
hits: 3                      # 命中次数（机器维护）
lastHitAt: 2026-10-30
createdAt: 2026-10-29
updatedAt: 2026-10-30
---

## 结论

ECUM 解析失败时，先确认调用方的协议版本，再看解析器分支。

## 依据

（见 frontmatter 的 evidence；正文写给人看的一段展开）

## 适用边界

（什么情况下这条**不**适用——这是经验区别于指令的关键）
```

字段的必要性：

- `claim`：**一句话结论**，模型取用的就是它；没有它模型读不懂这条经验讲了什么。
- `rationale` / `evidence`：**依据**。MADR 的 `Consequences` 和 `Confirmation` 说明「为什么」和「怎么确认落地」，经验没有这两项就只是断言。
- `applies` / `counterExample`：**适用边界**。这是防「把上次的坑当经验照抄」的核心。
- `scope.stages` / `scope.paths`：**取用范围**，把检索从「语义检索」降级为「结构化过滤 + 少量语义」，成本可控。
- `status`：`superseded` / `retired` 让经验能被作废而不被删除（历史可追）。
- `hits` / `lastHitAt`：淘汰策略的输入。

**基线侧的联动（可选、向后兼容）**：`baseline.yml` 可以新增一个**可选**的 `experience:` 块，老 baseline 不受影响：

```yaml
experience:
  enabled: true                  # 总开关
  capture: [failed, rejected, drift]   # 确定性抽取器订阅哪些事件
  injectStages: [design, implement, verify]   # 哪些阶段注入
  requireApproval: false         # true = 入库前必须客户确认（默认 false，见 §4.4）
  maxIndexLines: 200             # 索引体积预算
```

字段命名沿用仓库既有风格（`baf-standard` 的 `workflow` / `routeProfile` / `standard` 块都是小驼峰）。

### 4.3 什么时候产生经验（候选生成时机）

**只在这三个时刻提出候选**，其余时刻一律不产生：

| 时机 | 触发者 | 候选内容 | 为什么是这里 |
|---|---|---|---|
| **A. 阶段完成（verify 通过）** | 编排器在 `change-archived` 之前的回合末 | 本次变更里「踩过又解决了」的非显然结论 | 这是唯一「有事实支撑」的时点：产物已定稿、验证已通过。 |
| **B. 确认门被「退回」** | 客户点了「暂不推进 / 退回」 | 客户为什么退回、模型缺了什么 | 客户的**显式**反馈，是最可靠的经验来源。 |
| **C. 文档漂移（上游改了、下游没跟上）** | 漂移检测器 | 「这条上游文档改动会让下游失效」 | 这正是本仓 `artifact-drift` 已经算出来的事实。 |

**不产生**的时刻：普通回合、模型自述「我学到了」、工具输出。这些是噪音，也是上下文膨胀的来源。

### 4.4 谁来写（写入者与审批）

**双通道采集，一个权威边界。**

#### 通道一 · 确定性抽取器（推荐：零模型、零幻觉、可复现）

从**投影事件**里派生候选——这些是事实，不需要模型总结：

| 事件 | 派生的候选 |
|---|---|
| `stage-failed` | 「这次在 X 阶段失败了 N 次，失败现象是 …」→ 可沉淀为「X 阶段的已知失败模式」 |
| `transition-rejected` | 「从 X 转到 Y 被拒，原因为 …」→ 可沉淀为「X 不能直接转到 Y」 |
| `drift-detected` | 「上游改了 A，下游 B 没跟上」→ 可沉淀为「B 依赖 A 的字段」 |

这条通道的价值：**同样的输入永远得到同样的候选**（可测试、可回放），而且**不需要模型**——没有幻觉，也没有「模型把自己的错误总结成经验」的风险。

#### 通道二 · 模型提议（补充）

模型在回合末调用一个新工具 `baf_experience_propose(条目草稿)`，只**提议**，不落盘。宿主校验后转成候选。

#### 通道三 · 客户手写

项目工程页的「手动添加」。

#### 权威边界：模型写不进经验库

`.baf/**` 已经是 BAF 护栏内的**受保护路径**——模型对它写入会得到 `system_resource_conflict`。这意味着「模型提议、宿主落盘」是**天然成立**的，不需要改护栏，也不需要新增权限模型。

#### 审批：客户拍板，但**不新增门卡**

关键决策：**经验不引入新的确认门。**

理由：BAF 历史上典型的失败模式就是**门卡死锁**——一个非确定性输入（模型提议的内容）如果进 fail-closed 的护栏，一旦模型写坏或客户不答，整条变更就卡死。经验是**增益**，不是**前置条件**。

所以：

- 候选统一落到项目工程页的**候选区**（§4.6），由客户批量处理（沉淀 / 改一改 / 不要）。
- 沉淀**永远不阻塞**任何阶段推进，**归档永不被经验阻塞**（哪怕候选处理失败）。
- 想要更强管控的客户，可以在 `baseline.yml` 里开一个**可选**的 `experience:` 块（见 §4.2），要求「入库前必须客户确认」——但这仍是**增益路径**上的可选开关，不是工作流门。

**为什么不让模型直接写**：AGENTS.md 的 FAQ 说得很直白——「用户在对话里明说的话优先级最高」；CLAUDE Code 也把 auto memory 的编辑权交给 `/memory`。经验一旦落盘进版本库，它就成了**仓库的事实**，必须有人签字。

### 4.5 怎么注入（取用与注入）

**两段式，严格照 llms.txt 的思路：**

**第一段 · 短索引常驻**
每个会话开始（或每个阶段开始）读 `.baf/experience/index.md`，把**索引行**（`id | title | stages | paths | tags`）注入系统提示。预算：≤ 200 行 / ≤ 4000 字。超限就按 `hits` 与 `updatedAt` 淘汰最旧的一批（见 §4.7）。

**第二段 · 命中条目按需注入**
在**派单那一刻**（`go-dispatch.ts` 写工单时）做命中：

```
命中 = 索引中满足以下任一条件的条目：
  · scope.stages ∩ {当前阶段} ≠ ∅            （阶段命中）
  · scope.paths ∩ {本次 allowlist} ≠ ∅        （路径命中）
  · scope.modules ∩ {本次涉及模块} ≠ ∅
且 status == active
```

命中的条目**全文**（不含 frontmatter 的 hits 等机器字段）拼进工单正文的一个固定小节：

```
【项目经验 · 本阶段相关】
- E-0002 ECUM 解析失败时先看版本号
  结论：ECUM 解析失败时，先确认调用方的协议版本，再看解析器分支。
  适用：仅当改动涉及 ecum 的解析入口或协议版本时适用。
```

**预算**：每次派单最多注入 **5 条**、每条最多 **200 字**。超出的按命中强度排序（阶段命中 > 路径命中 > 模块命中；同强度按 `hits` 降序）。

**为什么不整库注入**：CLAUDE Code 的体积上限机制说明了代价——超限的指令文件会被判「Over the limit」并直接失效。整库注入的结果一定是「全都不生效」或「挤掉真正的上下文」。

**模型可见 ⟺ 已入日志**：注入的条目 id 必须随工单进入 session 日志（工单本身已是 `baf-workflow` producer 的消息，所以自动满足）；「命中了哪几条」也要落日志（新增一个 `baf/experience-injected` 事件），否则事后无法解释模型为什么那样写。

**第三段 · 按需拉取（模型主动）**
除了上两段，模型还可以调用 `baf_experience_read(id)` 读某一条的**全文**（含依据与适用边界）。索引行里带上 `id`，模型看到标题不相关时可以自己拉，也可以明确放弃——**这是「短索引 + 长详情」的完整形态**（llms.txt 的原话：「the file itself stays small enough to fit in context; the detail lives behind the links, and is fetched only when needed」）。

### 4.6 客户界面（项目工程页）

在 `packages/client/ui-settings-baf-standard/src/client/StandardsOverview.tsx` 的「项目工程」页新增一个区块，位置在「受保护路径」之后、「状态进出 hook」之前：

```
┌─ 项目经验 ────────────────────────────────────────────────┐
│ 把项目里反复验证过的结论沉淀下来，在相关阶段自动提供给模型。 │
│                                                          │
│ 开关  [●] 自动沉淀      每条入库需确认                    │
│ 命中  [ ] 注入到会话提示（索引常驻）                       │
│                                                          │
│ 经验条目 (12)                              [手动添加]       │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ E-0002  ECUM 解析失败时先看版本号        [生效] 命中 3  │ │
│ │ 结论：先确认调用方协议版本，再看解析器分支               │ │
│ │ 适用：design / implement · ecum/**/*.c                 │ │
│ │ 来源：change-20261028-ecum-ba15 · 2026-10-29           │ │
│ │                              [查看] [停用] [删除]       │ │
│ ├──────────────────────────────────────────────────────┤ │
│ │ E-0007  配置读取必须走统一入口             [生效] 命中 0  │ │
│ │ ...                                                    │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ 候选（待确认） (2)                                        │
│  · E-cand-1  ECUM 协议版本不匹配时不要走 fallback  [沉淀][改]│
│  · E-cand-2  build 脚本必须先跑 lint            [沉淀][改] │
└──────────────────────────────────────────────────────────┘
```

- **可编辑**：点「查看」进一个编辑抽屉（正文 + frontmatter 的可编辑子集），保存走同一个确认门。
- **可停用**：改 `status` 为 `retired`（不删文件，历史可追）。
- **可删除**：物理删除 + 从索引移除。
- **候选区**：即使确认门被跳过（比如模型没走门），候选也会落在这里等客户处理——**客户永远能看到「模型想沉淀什么」**。
- 全部文案走 `locales.ts`（zh + en），不许硬编码。

### 4.7 保鲜与淘汰（不做过时的关键）

| 机制 | 规则 |
|---|---|
| **体积预算** | `index.md` ≤ 200 行；超出时按 `lastHitAt` 升序淘汰，淘汰项 `status: retired` 但文件保留。 |
| **失效检测** | 当条目的 `evidence` 指向的变更被归档满 **3 个月**，或该条目 `lastHitAt` 超过 **60 天**，在项目工程页标「可能过时」，并给一个「重新验证」动作（重新走一次确认门）。 |
| **冲突检测** | 同一 `scope` 下若两条 active 条目的 `claim` 语义冲突（实现上：同 tags 且同 stages），入库时提示客户「已有相近条目」，让客户选择「合并 / 替换 / 另存」。 |
| **证据闭环** | 条目的 `evidence` 指向具体变更与产物。产物被改写时（文档生命周期的「已更新」），条目标「依据已变」，进入待复核队列。 |

### 4.8 实施计划（分步、可独立验收）

| 步骤 | 内容 | 主要文件 | 规模 | 验收 |
|---|---|---|---|---|
| **S1 领域模型** | 条目类型、frontmatter 解析、索引读写、命中匹配 | 新 `packages/baf/baf-core/src/experience.ts` | ~300 行 | 单元测试：解析、索引增删、命中匹配 |
| **S2 文件落地** | `.baf/experience/` 的创建、条目写盘、索引维护、淘汰 | 新 `packages/baf/baf-workflow/src/experience-store.ts` | ~250 行 | 单元测试 + 临时目录集成测试 |
| **S3 候选生成** | 时机 A/B/C 的候选抽取；**只抽取，不入库** | `packages/baf/baf-workflow/src/orchestrator.ts`、`go-coordinator.ts` | ~200 行 | 集成测试：三次时机各产出一条候选 |
| **S4 确认门** | 新门 `experience-capture`，含「沉淀 / 改一改 / 不要」三选项与 diff 展示 | `packages/baf/baf-workflow/src/gate-cards.ts`、`gate-dialog.ts` | ~200 行 | 门卡渲染 + 三选项各自的结果 |
| **S5 注入** | 索引常驻 + 命中条目进工单；`baf/experience-injected` 事件 | `packages/baf/baf-workflow/src/go-dispatch.ts`、`baf-core/src/events.ts` | ~150 行 | 集成测试：命中条目出现在工单正文，且日志里有注入记录 |
| **S6 客户界面** | 项目工程页的「项目经验」区块（列表/编辑/停用/删除/候选区） | `packages/client/ui-settings-baf-standard/src/client/`（新组件 + locales） | ~400 行 | 客户端测试：渲染、编辑保存、候选处理 |
| **S7 保鲜** | 体积预算、失效检测、冲突提示 | S1/S2 内 | ~150 行 | 单元测试：超限淘汰、依据变更标记 |

**总计约 1600 行**，跨 6 个步骤，每步独立可测。建议先做 S1+S2+S4+S6 的「最小闭环」（客户手动加条目 → 门卡 → 注入），再补 S3（自动候选）。

### 4.9 与现有架构的契合点

- **门卡**：`GATE_REGISTRY` 加一个条目即可，复用 `gate-dialog.ts` 的单飞队列（`ask-queue.ts` 已经保证「同一变更同一门不重复弹」「一个确认后才触发下一个」）。
- **工单注入**：`go-dispatch.ts` 的 `workOrderText()` 是唯一的工单正文生成点，注入是加一小节的事。
- **事件**：`packages/baf/baf-core/src/events.ts` 加一个 `baf/experience-injected` 事件即可（合并扩展式，遵守仓库规约）。
- **界面**：项目工程页已有多个卡片式区块（受保护路径 / 状态进出 hook / 基线编辑器），新增一个同构区块。
- **模型可见 ⟺ 已入日志**：注入条目随工单进日志；命中记录新增事件。

### 4.10 风险与对策

| 风险 | 表现 | 对策 |
|---|---|---|
| **模型把自己的错误当经验** | 一次失败的尝试被总结成「结论」 | 只有时机 A（验证通过）/ B（客户退回）/ C（漂移）能产候选；候选必须带 `evidence` 指向已定稿的产物；客户拍板 |
| **上下文膨胀** | 经验条目挤掉真正的指令 | 索引常驻（≤200 行）+ 命中条目按需（≤5 条 × ≤200 字）+ 预算硬上限 + 淘汰 |
| **过时经验误导模型** | 老结论套到新场景 | `status` 生命周期 + 依据失效检测 + `counterExample` 必填 + 命中时可核对 |
| **经验与基线冲突** | 经验说 A，baseline 说 B | 检索器**先按 scope 过滤**；命中条目若与基线条款冲突，**基线优先**并在注入小节标注冲突（让模型看到矛盾而不是替模型决定） |
| **敏感信息入库** | 客户在退回意见里写了密钥 | 入库前过一遍**脱敏扫描**（复用仓内已有的 secret-mask 能力，`packages/client/ui-secret-mask/`），命中则拒绝入库并提示 |
| **经验库膨胀无人治理** | 客户不管，条目越积越多 | 项目工程页的「可能过时」角标 + 索引预算自动淘汰 + 候选区必须处理（未处理的候选在项目工程页挂角标） |
| **多项目复制** | A 项目的经验污染 B 项目 | 条目带项目来源标记；「复制到其他项目」是显式动作，不自动 |

---

## 5. 备选方案与对比

### 备选 A：只做「静态规则文件」（AGENTS.md 式）

在 `.baf/` 放一份 `rules.md`，客户手写，模型常驻。

- **优点**：实现量最小（~150 行），无沉淀/审批/保鲜问题，和 AGENTS.md 生态一致。
- **缺点**：完全不满足「沉淀」二字——经验不会自己长出来；没有「什么时候取用」的机制（要么全量要么全无）；没有淘汰。
- **与推荐方案的差别**：推荐方案 = A + 自动候选 + 确认门 + 按需检索 + 保鲜。

### 备选 B：只用「会话记忆」式（Claude auto memory 式）

模型自动把 learnings 写进产品私有存储，下次会话注入。

- **优点**：客户零操作，感知最强。
- **缺点**：**不进版本管理 → 不可 code review、不可追溯、不可跨工具**；**不可移植**；**客户看不见到底记了什么**（Claude Code 专门做了 `/memory` 来补这个洞）；出错的经验无法被追责。
- **与推荐方案的差别**：推荐方案把「自动」收窄到**候选产出**，把「入库」交给人，代价是多一次点击，收益是经验是**资产**而不是**缓存**。

### 备选 C：经验放进阶段产物（`openspec/changes/<id>/retro.md`）

每条变更自己写一份复盘。

- **优点**：与现有产物体系完全一致，复用文档生命周期。
- **缺点**：**跨变更检索**极难（要扫所有变更目录）；**没有项目级视图**（客户要进 N 个变更目录）；注入时无法按 scope 精确命中。
- **与推荐方案的差别**：推荐方案是「每条变更的复盘」+「项目级索引与命中」两层，复盘仍写在变更目录里（作为 evidence），索引与条目在 `.baf/experience/`。

### 三者对比

| 维度 | 推荐方案 | A 静态规则 | B 会话记忆 | C 变更内复盘 |
|---|---|---|---|---|
| 自动沉淀 | ✅（候选） | ❌ | ✅ | ⚠️（每变更手写） |
| 人工审批 | ✅ | ✅（写的时候就是） | ❌（Claude 用 `/memory` 补） | ✅ |
| 进版本管理 | ✅ | ✅ | ❌ | ✅ |
| 按需检索 | ✅ | ❌ | ⚠️ | ❌ |
| 保鲜/淘汰 | ✅ | ⚠️（只能手改） | ❌（私有黑盒） | ⚠️ |
| 客户可见 | ✅ | ✅ | ⚠️ | ✅ |
| 实现量 | ~1600 行 | ~150 行 | ~400 行 | ~250 行 |

**结论**：推荐方案多花的是「检索 + 保鲜 + 审批」的工程量，换来的是「沉淀」真正可用。A 可以在 S1 之前先落地做一个 20 分钟的尝鲜版。

### 5.1 明确否决的方案（连同理由）

| 方案 | 否决理由 |
|---|---|
| **经验并进规范文档**（写进 `baseline.yml` 或 `rules.md` 的正文） | 无法**逐条失效**——一条过时经验会把整份规范拖下水；且违反「一条一事」——无法按阶段/路径精确命中，等于整库常驻。 |
| **向量 RAG 检索经验** | 引入离线依赖（嵌入模型 + 索引），且**召回不可解释**——客户无法回答「为什么模型看到了这条」。BAF 的护栏与门都是 fail-closed 的，不能引入不可解释的输入源。 |
| **外部知识库**（Confluence / Notion / 语雀） | 项目经验必须**随代码走**、随版本管理、随 code review——外部库做不到这三点。留作后续演进方向，不做第一版。 |
| **经验驱动门禁**（拿经验去决定某阶段能否过门） | **非确定性输入进 fail-closed 护栏**。经验是主观归纳，拿它当门禁条件会让工作流的判定变得不可复现、不可追责。经验只能**增益**，不能**拦截**。 |
| **让模型直接写经验文件** | 模型会把一次失败的尝试总结成「结论」。必须走「候选 + 人工拍板」。 |

---

## 6. 端到端例子

**项目**：`D:\Source\baf-codingplugin\demo\demo6`（ECUM 相关）

**第 1 步 · 踩坑（2026-10-28）**
变更 `change-20261028-ecum-ba15` 在实现阶段反复改 `clarify.md`；最终 `design.md` 定稿时写明「协议版本不匹配时走 fallback 分支」。

**第 2 步 · 候选产出（时机 A：验证通过）**
编排器在归档前发现：本次变更有**非显然的结论**（fallback 分支掩盖了版本问题），且该结论在同模块的其它变更里已经重复出现两次 → 产出候选：

```
E-cand-1  ECUM 协议版本不匹配时不要走 fallback
  结论：解析入口收到未知协议版本时直接报错，不要 fallback 到默认分支。
  依据：change-20261028-ecum-ba15 的 design.md「接口约定」小节。
  适用：design / implement · ecum/**
```

**第 3 步 · 客户拍板**
项目工程页的候选区出现这条候选，diff 形态展示将要写入的 `.baf/experience/E-0003-ECUM-协议版本不匹配时不要走-fallback.md`。客户点「沉淀」→ 文件落盘，`index.md` 加一行。**（不弹门卡，不阻塞任何阶段推进。）**

**第 4 步 · 复用（2026-10-30）**
新变更 `change-20261030-ecum-55df` 进入 design 阶段，`allowlist` 含 `ecum/parser.c`。
- 索引命中 E-0003（阶段命中 + 路径命中）。
- 派单工单正文出现：

```
【项目经验 · 本阶段相关】
- E-0003 ECUM 协议版本不匹配时不要走 fallback
  结论：解析入口收到未知协议版本时直接报错，不要 fallback 到默认分支。
  适用：design / implement · ecum/**
```

- 模型据此在 design.md 里写明「未知协议版本直接报错」，避免了第三次返工。
- 命中记录落日志：`baf/experience-injected { ids: ['E-0003'], stage: 'design', changeId: 'change-20261030-ecum-55df' }`。
- `hits` 变为 1，`lastHitAt` 更新。

**第 5 步 · 保鲜（2026-12）**
E-0003 的 `evidence` 指向的 `change-20261028-ecum-ba15` 已归档满 3 个月 → 项目工程页标「可能过时」，给出「重新验证」动作（重走一次确认门）。客户确认它仍然成立 → `updatedAt` 刷新，继续有效。

---

## 7. 待评估的问题（需要拍板）

1. **入库粒度**：一次沉淀一条（当前方案），还是允许一次沉淀一个「小节」（多条相关经验打包）？
2. **候选的默认行为**：默认「只生成候选，不弹门」（省打断），还是默认弹门？当前方案取前者 + 候选区兜底。
3. **跨项目复制**：是否需要「把本项目的某条经验复制到另一个项目」？当前方案没做。
4. **与 `baseline.yml` 的关系**：经验是否允许覆盖基线的保护路径？当前方案：**不允许**，基线永远优先，冲突只提示。
5. **是否要给经验单独的权限**：客户可能希望「只有架构师能沉淀经验」。当前方案没做（BAF 现在也没有角色模型）。

---

## 8. 附：本文引用的来源（均为实际抓取）

- <https://agents.md/> — AGENTS.md 规范、6 万+ 项目、嵌套优先、FAQ、兼容工具列表、Aider / Gemini CLI 配置片段
- <https://github.com/agentsmd/agents.md> — AGENTS.md README 与最小示例
- <https://docs.claude.com/en/docs/claude-code/memory> — CLAUDE.md、`.claude/rules/`、`paths:` 路径规则、体积上限、`/memory`、auto memory、compaction 后重读
- <https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot> — `.github/copilot-instructions.md`、`.github/instructions/NAME.instructions.md`、`applyTo` / `excludeAgent`、优先级、仓库设置开关、PR 读 head 分支
- <https://adr.github.io/madr/> — MADR 模板全文、`status` / `date` / `decision-makers` / `consulted` / `informed`、命名规范、分类子目录、markdownlint
- <https://llmstxt.org/> — llms.txt v2 规范、章节顺序与必填项、覆盖路径与「取最具体」、`.md` 版本与 link 关系、自动生成方、Lighthouse 审计
- <https://docs.cursor.com/context/rules> — Cursor 的 Rules/Skills/MCP 顶层分类（**该页抓取时被重定向到文档首页，Rules 细则未取到正文**）
- <https://aider.chat/docs/usage/conventions.html> — Aider 约定文件（经 agents.md 站点引用）
- <https://docs.cline.bot/best-practices/memory-bank> — Cline Memory Bank：Markdown 记忆银行 + 层级组织 + 链接式取用
- <https://docs.roocode.com/features/custom-instructions> — Roo Code 的仓库级自定义指令
- <https://aider.chat/docs/repomap.html> — Aider repo map：分层符号地图（摘要常驻、详情按需）
- <https://github.com/oliver-zehentleitner/keep-the-why> — Keep the Why：`status` / `supersededBy` / `reviewAfter` 字段范式
- <https://github.com/MnemeHQ/mneme> — Mneme：提案工具只产生非权威提案、host 落盘
- <https://github.com/kgaidev/kgai> — kgai：可解释召回的知识图谱式项目记忆
- <https://google.github.io/eng-practices/> — Google eng-practices：评审体验必须落在可评审的产物上
- <https://github.com/joelparkerhenderson/architecture-decision-record> — 另一套 ADR 目录约定
- <https://cursor.com/docs/rules.md> · <https://cursor.com/docs/llms.txt> — Cursor 的机器可读入口
- <https://code.claude.com/docs/en/memory> — Claude Code memory（与 docs.claude.com 同源，页面更新至 2026-10-27）

**未能直接打开**（故正文未引用其内容）：`docs.cursor.com/context/rules`（重定向）、`adr/madr` 的 raw template 与 0001、`docs.continue.dev/customize/rules.md`、`google.github.io/eng-practices/review/developer/small-changes.html`（只读到目录页）。

**仓库内已核实**（用于 §1 现状盘点）：
- `packages/baf/baf-core/src/artifact-lifecycle.ts` — 文档生命周期六态
- `packages/baf/baf-workflow/src/gate-cards.ts` — 门卡注册表
- `packages/baf/baf-workflow/src/gate-dialog.ts` — 弹窗单飞队列与 `__noop__` 语义
- `packages/baf/baf-workflow/src/ask-queue.ts` — 单飞/去重
- `packages/baf/baf-workflow/src/go-dispatch.ts` — 工单正文生成（注入落点）
- `packages/baf/baf-workflow/src/orchestrator.ts` — 回合末编排（候选生成落点）
- `packages/client/ui-settings-baf-standard/src/client/StandardsOverview.tsx` — 项目工程页（界面落点）
- `packages/client/ui-settings-baf-standard/src/default-baseline.ts` — 基线形状（与经验的分工参照）
