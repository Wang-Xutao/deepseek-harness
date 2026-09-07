# BAF 模式在 dsh 中的企业级落地实施方案

> **读者**：BAF 实现工程师、企业落地负责人、dsh 维护者。
> **目标**：把旧版「Claude Code + Comet + Superpowers + vibe + marketplace + hooks」的工作流指南，重构为 dsh 原生、可随桌面应用分发、可签名升级回滚的企业级 Agent 实施方案；工程师按本文档落地，不再做关键架构决策。
> **用法**：第 0 章是导航；**文首「实现进度」是仓库实况（已完成 / 未完成）**；第 1–11 章是设计与 contract（what/why）；**第 12 章是从零到一的逐步实施计划（how，每一步列出文件、做法和验收）**；第 13–16 章是清单、测试、企业输入和完成定义；**第 17 章是评审结论（遗漏、风险、可落地性、MVP 裁剪）**。
> **对照基准**：仓库现状 2026-09-07（分支 `baf`；dsh `0.1.3-alpha.1`；桌面 **baf-dsh 0.0.8**）。**Phase 0–4 已落地**（见下表）；`overlay/desktop` 更新链路已有 manifest/plan/apply/service 骨架且**公开仓默认不验签**；`packages/client/ui-baf-desktop` 为品牌/IDE/帮助；`packages/client/ui-baf-workflow` 为 BAF 会话「工作流」Tab（与「轨迹图」无关）；官方 BAF **仅**以 shipped preset（`trust: system`）交付，桌面**不再**把 `agent-presets` 同步到 `~/.dsh/.agent-presets`，且官方 `baf` **不可复制、不可由用户修改**；`baf-core` 已提供 baseline loader、adapter stub、`NODE_CATALOG`/`WORKFLOW_GRAPH`；`baf-workflow` 已提供 route、projection、transition、intake 与 `WorkflowTabView` Web Remote。
> **评审结论（摘要）**：架构方向可落地；按第 12 章 Phase 0→10 可逐步实现。必须先纠正「dsh workflow 工具 ≠ BAF go 状态机」「独立 `baf` bin 违规」「plugin 写 user root」三处概念/现状错误，并把 MVP 裁到「可发现 system preset + intake/projection + full-go 主链 + ToolGuard」，签名三 scope 更新可并行但不应挡主链。
> **本文档完全取代**旧版面向 Claude Code 的建设指南：Comet、Superpowers、vibe workflow、Claude Code marketplace、`enabledPlugins`、Claude Code hooks 不再是新架构的组成部分。

---



## 实现进度（仓库实况 · 2026-09-07）

> 本表是**当前仓库事实**，不是计划。设计正文（第 1–11、12 章步骤）仍描述目标态；实现时以本表为准判断「已做完什么」。



### 总览


| Phase | 目标                                                                         | 状态      |
| ----- | -------------------------------------------------------------------------- | ------- |
| **0** | 企业输入登记、错误码、兼容矩阵、route 核查、baseline schema/fixture、projection/change id 冻结   | **已完成** |
| **1** | shipped `presets/baf`、`trust: system`、skills、locale、roster/authoring 测试与金标 | **已完成** |
| **2** | `baf-core` 骨架 + baseline loader + adapter stub                             | **已完成** |
| **3** | route resolver + 审计                                                        | **已完成** |
| **4** | intake + projection + transition + Web 工作流 Tab（半交互）                        | **已完成** |
| 5     | full-go 各阶段                                                                | **未开始** |
| 6     | bug-fast-path / 升级                                                         | **未开始** |
| 7     | quality / standard / guard / scaffold                                      | **未开始** |
| 8     | slash / CLI / desktop IPC + **变更 Dashboard（归档总览）** | **未开始**（工作流页「变更总览」入口已先行） |
| 9     | 三 scope 更新、签名、managed system root（热更）                                      | **未开始** |
| 10    | release 门禁                                                                 | **未开始** |


MVP 完成线（Phase 0–5 + ToolGuard + slash/`status`）**尚未达到**；当前到「roster + route + projection/intake/transition + BAF 工作流 Tab」。

### Phase 4 — 已完成明细


| 项                                 | 状态  | 落点                                                                |
| --------------------------------- | --- | ----------------------------------------------------------------- |
| `NODE_CATALOG` / `WORKFLOW_GRAPH` | 已完成 | `baf-core` `catalog.ts` / `graph.ts`（§5.1–5.3 权威，UI 只渲染）          |
| append-only projection + replay   | 已完成 | `baf-workflow` `projection.ts`；单 writer + atomic rename；损坏诊断      |
| `transition` 裁决                   | 已完成 | `transition.ts`；表外 → `invalid_transition`                         |
| intake 规则引擎 + confirm             | 已完成 | `intake.ts`（启发式 suggest + 规则 review/decide/confirm）               |
| `WorkflowService` 实现              | 已完成 | `workflow-service.ts`；挂到 `BafWorkflow`                            |
| Web `WorkflowTabView` Remote      | 已完成 | `baf-workflow` Typert Remote；按 session cwd 读写 projection          |
| 会话 Tab「工作流」                       | 已完成 | `packages/client/ui-baf-workflow/`；仅 `agentPreset === baf` 显示；半交互 |
| 与「轨迹图」隔离                          | 已完成 | 设置原「工作流」section 改名为「轨迹图」；两 Tab 并存、职责分离                            |




### Phase 4 确认结论（2026-09-07）

1. **范围**：Domain（projection/transition/intake/status）+ Web 工作流 Tab + Web Typert Remote；Electron `baf:getWorkflowStatus` IPC 仍属 Phase 8。
2. **Tab 名**：「工作流」；BAF 模式专有 go 状态机可视化；与「轨迹图」（执行轨迹）无关。
3. **可见性**：仅当前 session `agentPreset === baf` 时注册会话 Tab。
4. **交互**：半交互——可确认/拒绝/补充分类、查看详情、合法 transition；archive/阶段执行等 Phase 5+ 按钮展示但禁用。
5. **详情字段**：`NODE_CATALOG` 含前置/动作/产物/完成条件/失败处理/转换条件；叠加 live 状态、skip 理由、OpenSpec 裁剪 reason codes、baseline/route/projection 元数据。
6. **视觉**：跟随 `--dsw-`* 主题（亮/暗）；自研 SVG/CSS，不做拖拽编排。
7. **空态**：无 active change 仍渲染完整模板图 + 顶栏引导。
8. **顺序**：文档 → domain → UI（本落地已按此执行）。



### Phase 3 — 已完成明细


| 项                                    | 状态                   | 落点                                                                             |
| ------------------------------------ | -------------------- | ------------------------------------------------------------------------------ |
| `EnterpriseRoutePolicy` 类型/schema/加载 | 已完成                  | `baf-core` `route-policy.ts` + `schema/enterprise-route-policy.schema.json`    |
| 加载入口冻结                               | 已完成                  | **发行/部署配置路径**（独立文件，session 创建冻结）；登记见 `enterprise-inputs.md` / `route-notes.md` |
| `resolveRoute()`                     | 已完成                  | `packages/baf/baf-workflow/src/route.ts`；§6.2 边界测试 `tests/route.spec.ts`       |
| `baf/route-resolved` 审计              | 已完成                  | `route-audit.ts`；session log 权威                                                |
| `RouteStatusView`                    | 已完成                  | `baf-core` `buildRouteStatusView`；`BafWorkflow.routeStatus()`                  |
| 阶段 route → agent ModelSelection      | 已完成                  | `phase-route.ts`（主路径）；workflow `agent()` 仅扇出                                   |
| composition 挂载 `baf-workflow`        | 已完成                  | `presets/baf/agent.cordis.yml`（`isolate.bafWorkflow`）                          |
| 工作流 Tab UI                           | **Phase 4 已完成（Web）** | Electron IPC 仍属 Phase 8                                                        |




### Phase 0 — 已完成明细


| 项                                 | 状态  | 落点                                                                                            |
| --------------------------------- | --- | --------------------------------------------------------------------------------------------- |
| `enterprise-inputs.md`            | 已完成 | `overlay/docs/baf/enterprise-inputs.md`（OpenSpec/gcc/覆盖率已确认；其余多为 `unavailable`）               |
| `error-codes.md`                  | 已完成 | `overlay/docs/baf/error-codes.md`                                                             |
| `compatibility-matrix.md`         | 已完成 | `overlay/docs/baf/compatibility-matrix.md`（模板 + fixture 行）                                    |
| `route-notes.md`                  | 已完成 | `overlay/docs/baf/route-notes.md`（Phase 0 核查 + Phase 3 接线）                                    |
| baseline / routeProfile schema    | 已完成 | `packages/baf/baf-core/schema/*`                                                              |
| fixture baseline                  | 已完成 | `overlay/plugin/standards/baf-baseline-c/` + `packages/baf/baf-core/tests/fixtures/baseline/` |
| projection / change id 规则冻结       | 已完成 | 记入 `enterprise-inputs.md` §8                                                                  |
| 包落点冻结 `packages/baf/`             | 已完成 | 同上                                                                                            |
| InstalledVersions schema 2 字段映射登记 | 已完成 | `enterprise-inputs.md` §7（**实现代码仍属 Phase 9**）                                                 |
| fixture 校验脚本                      | 已完成 | `overlay/scripts/verify-baf-baseline-fixture.mjs`（`npm run verify-baf-baseline`）              |




### Phase 1 — 已完成明细


| 项                                                       | 状态  | 落点                                                                                  |
| ------------------------------------------------------- | --- | ----------------------------------------------------------------------------------- |
| `presets/baf/preset.yml`                                | 已完成 | `order: 2`；与 `ptc` 并列时按 id 排在 `standard` 后                                          |
| `agent.cordis.yml`                                      | 已完成 | 自 `standard` 复制；BAF persona **先中后英**；domain group 挂载 `baf-core` + `baf-workflow`    |
| skills `baf-go` / `baf-c-guidance` / `baf-verification` | 已完成 | preset skills 树；`skill-filesystem.customSkillDirs` 指向 `skills/`                     |
| display / UI locale 键                                   | 已完成 | `presetBafName` / `presetBafDescription`                                            |
| `baf-roster.spec.ts` + shipped-root / display / locales | 已完成 | unit 已绿；**拒绝 copy 官方 baf**                                                          |
| CLI e2e 列表 + **挂载冒烟**（工具目录 + BAF skills + persona）      | 已完成 | `apps/cli/tests/web-agent-presets.e2e.ts`                                           |
| Web authoring/selection 金标                              | 已手改 | `apps/web/tests/expected/agent-preset-*`；验收以设置页为准                                   |
| 桌面不同步官方 preset 到 user root                              | 已完成 | `overlay/desktop/src/main.ts` 仅同步 `skills/`                                         |
| 官方 BAF 不可复制（API + UI）                                   | 已完成 | `isPresetCopyable` / `copyable: false` / `officialNoCopy`                           |
| 本地 `dist:dir` 产物                                        | 已打出 | `overlay/desktop/dist/win-unpacked/baf-dsh.exe`（含 shipped `presets/baf`）            |
| Agent Note                                              | 已完成 | `.agents/notes/implemented/feature/2026-09-05-baf-system-preset`；内置-only 见同日后续 note |
| `pack-dsh` 打包后复检注释                                      | 已完成 | `overlay/scripts/pack-dsh.mjs`                                                      |




### 明确尚未完成（Phase 0/1 范围外或债）


| 项                                               | 说明                                                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `packages/baf/baf-core` 运行时包                    | **已完成**（`@deepseek-ai/dsh-baf-core`；baseline loader + unavailable adapters + RouteStatusView） |
| composition 启用 `baf-core` / `baf-workflow` row  | **已完成**（`isolate.bafCore` + `isolate.bafWorkflow`）                                            |
| go 状态机 / intake / projection                    | **Phase 4 已完成**（阶段 handler 仍属 Phase 5）；Web 工作流 Tab 已落地                                        |
| ToolGuard / quality / OpenSpec adapter          | 未实现（Phase 5/7）                                                                                |
| slash / `baf` CLI profile / desktop bridge      | 未实现（Phase 8）                                                                                  |
| `overlay/plugin` → `~/.dsh/.agent-presets` 官方同步 | **已关闭**（桌面不同步 `agent-presets`；官方 BAF 仅 shipped）                                               |
| 更新签名强制 / InstalledVersions schema 2 代码          | 未实现（Phase 9）                                                                                  |
| 企业输入真值（模型清单/公钥等）                                | 部分已填：OpenSpec=`latest`、编译器=`gcc`、覆盖率=`project-config`；其余仍 `unavailable`                       |




### Phase 0/1 确认结论（2026-09-05）

1. `order: 2` **与** `ptc` **并列**：同意；roster 保持 `standard → baf → ptc → minimal → cordis`。
2. **BAF persona**：中英双语，**先中后英**（已写入 `agent.cordis.yml`）。
3. **企业输入**：OpenSpec 用 **latest**；C 编译器用 **gcc**；覆盖率阈值 **可在工程配置中配置**（baseline fixture 已登记）。
4. **官方 BAF 交付**：**只能使用内置 BAF**；禁止同步到用户目录；**用户不允许修改**，亦**不允许复制**官方 BAF 成 user 快照（需求变更，已落地 API/UI）。
5. **验收**：以「设置 → Agent 预设 → 见 BAF 模式（内置）」为准。
6. **Ed25519**：正式密钥由企业另发；开发仅本地生成，不提交私钥。

---



## 0. 怎么读这份文档（逻辑地图）


| 问题                           | 看哪章                 |
| ---------------------------- | ------------------- |
| **哪些已实现、哪些没有、有何待确认**         | **文首「实现进度」与「确认结论」** |
| 要做什么、给谁用、不做什么                | 第 1、2 章             |
| 架构分几层、每层谁负责、复用哪些现有代码         | 第 3 章               |
| 官方资源如何隔离（内置-only，不可复制）       | 第 4 章               |
| **工作流怎么走、每个节点做什么**           | **第 5 章（核心）**       |
| 不同阶段怎么用不同模型                  | 第 6 章               |
| 企业规则和工具从哪里来                  | 第 7 章               |
| 代码怎么拆成插件、命令长什么样              | 第 8、9 章             |
| 用户看到什么：preset、roster、工作流 Tab | 第 10 章              |
| 桌面应用怎么打包、升级、回滚               | 第 11 章              |
| **从零到一按什么顺序做、每步怎么做**         | **第 12 章（核心）**      |
| 怎么证明做完了                      | 第 13–16 章           |
| 有无遗漏/风险、能否落地、MVP 怎么裁         | **第 17 章**          |


三条主线贯穿全文：

1. **信任主线**：system 资源只读、user 资源可写、企业策略最高优先（第 4、7、11 章）；
2. **状态主线**：所有工作流状态只由 domain service 改写，模型只能建议（第 5 章）；
3. **单一事实主线**：slash、CLI、desktop、工作流 Tab 全部读写同一 projection 和 domain service（第 3.7、9、10 章）。

落地前必读的三条硬澄清（细节见第 2.3、3.9、9.1、17 章）：

1. **BAF** `go` **工作流 ≠ dsh** `workflow` **工具**：后者是模型编写编排脚本、扇出子代理的能力；前者是企业固定状态机，由 `baf-workflow` domain service 执行，禁止用 `tool-workflow`/`ralph` 脚本“实现”阶段转换。
2. **独立** `baf` **Node 应用入口违规**：dsh 只允许经 `dsh --profile …` 启动 Node 应用；`baf` CLI 必须是 profile/patch 或 thin wrapper，不能新增绕过 launcher 的 package bin。
3. **官方 BAF 内置-only**：不得同步或复制到 `~/.dsh/.agent-presets`；用户不可修改、不可复制官方 `baf`（见第 4 章与文首确认结论）。

---



## 1. 需求结论：要做什么、给谁用、解决什么问题



### 1.1 你要做的东西

在 dsh 中实现一个名为 **“BAF 模式”** 的企业级代码 Agent。它不是一个提示词，也不是散落在用户目录里的脚本，而是由以下部分组成、可随桌面应用交付的产品能力：

1. 一个 dsh 原生 Agent preset，规定 Agent 使用哪些工具、插件、技能和系统提示词；
2. 一组 BAF 官方插件，负责企业工作流、OpenSpec、C 语言质量检查、安全门禁、项目初始化和状态诊断；
3. 一套固定但可分类的 `go` 开发工作流：新需求走完整流程，低风险 Bug 走受控快速通道，由统一的 change intake 分类器决定；
4. 一套企业基线，规定 OpenSpec、Matt Pocock 轻量工程实践、C 工具链、质量阈值和安全策略；
5. 一套统一的 slash command、独立 `baf` CLI 和桌面 UI/更新入口，桌面端含可视化工作流 Tab（流程图 + 当前位置）；
6. 一套随桌面应用打包、签名、升级、校验和回滚的官方资源分发机制。



### 1.2 给谁用

BAF 面向企业同事。普通用户可以：

- 选择和使用官方 BAF；
- 查看官方 BAF 摘要。

普通用户不能：

- 复制官方 BAF 到 user root（官方 BAF 为内置-only）；
- 修改、删除、替换或覆盖官方 BAF；
- 通过 user root 同名目录 shadow 官方 BAF；
- 关闭企业硬门禁、签名校验、兼容性检查、审计或 rollback；
- 修改官方 provider/model allowed list、fallback 集合或 route policy；
- 跳过 intake 分类强行进入实现阶段。



### 1.3 用来解决什么问题

- 所有人使用同一套企业规定的工作流；
- 需求、设计、实现和验证结果有可追溯产物；
- Bug 和新需求自动分流：小 Bug 不被官僚流程拖慢，大 Bug 不被草率流程放过；
- Agent 不能通过自然语言跳过必要阶段或伪造“已完成”；
- 编译、测试、覆盖率、静态分析和安全扫描有机器可验证的结果；
- 官方规则不会被用户目录中的同名资源覆盖；
- 企业可以发布新版本，并安全地升级和回滚；
- 后续可以增加 GitLab、Jira、Python 和知识库适配，而不重写核心工作流。



### 1.4 明确不做什么（第一期）

- 不再使用 Comet；
- 不再使用 Superpowers 这类重型外部编排框架；
- 不保留 vibe workflow；BAF 选中后直接采用 `go`；
- 不以 Claude Code marketplace、`enabledPlugins` 或 Claude Code hooks 作为运行时架构；
- 不把官方 BAF 同步或复制到 `~/.dsh/.agent-presets`；
- 不允许用户复制或修改官方 BAF；
- 不在 workflow 代码中写死某个 OpenSpec 次版本号、某个覆盖率数字（OpenSpec 跟 latest；覆盖率读工程配置；编译器固定 gcc）；
- 第一期不接 GitLab、Jira、远程知识库和 Python；
- 第一期不自动 push、不提供强制 reset、不允许普通用户关闭官方安全门禁；
- 第一期工作流 Tab 只做固定流程图展示和受控操作，不做拖拽式自定义编排。

---



## 2. BAF 的本质：它是什么，不是什么



### 2.1 产品定义

> **一个由 dsh preset 装配的企业 Agent 产品；preset 决定能力边界，插件提供业务能力，工作流负责过程状态，企业基线负责具体规则和工具，桌面应用负责受控分发和升级。**

```text
BAF = dsh Host
    + 官方 system preset(id = baf)
    + BAF plugins
    + go workflow(含 intake 分类和 bug fast path)
    + enterprise baseline
    + local C adapters
    + guard/quality gates
    + workflow tab(流程图可视化)
    + desktop packaging/update
```

BAF 不是：单独的一段 system prompt、单独的 `baf` 命令、单独的 `agent.cordis.yml`、一个大插件、一个把用户目录当安装目录的 zip 包。

### 2.2 BAF 的核心对象


| 对象                  | 作用                                        | 是否官方锁定                    |
| ------------------- | ----------------------------------------- | ------------------------- |
| `baf` preset        | 描述 Agent 采用哪些 dsh 插件、工具、prompt 和 skill    | 是                         |
| BAF plugin          | 提供 workflow、OpenSpec、quality、guard 等服务和命令 | 官方版本锁定                    |
| enterprise baseline | 提供规则、模板、工具路径、版本、阈值和 route profile         | 是                         |
| workflow projection | 保存当前项目的可恢复阶段状态                            | 可写，但必须由 domain service 维护 |
| change intake 结果    | 每个 change 的分类、模式、理由和用户确认记录                | 可写，同上                     |
| update manifest     | 描述可验证的升级内容、版本、hash 和签名                    | 官方签名                      |




### 2.3 与 dsh 原生「workflow」能力的边界（必读）


| 概念                                               | 所有者                           | 做什么                             | BAF 是否使用                                         |
| ------------------------------------------------ | ----------------------------- | ------------------------------- | ------------------------------------------------ |
| BAF `go` 工作流                                     | `baf-workflow` domain service | 固定阶段状态机、intake 分类、projection、门禁 | **是，核心**                                         |
| dsh `workflow` / `tool-workflow` / `ralph`       | `packages/workflow/*`         | 模型编写编排脚本，扇出子代理                  | **否**，不得驱动阶段转换                                   |
| dsh workflow `agent({ provider, model, phase })` | `workflow-worker-thread`      | 子代理请求级 route 转发                 | **可选复用**：仅当某阶段需要子代理扇出时借用 route 字段；阶段权威仍在 BAF 状态机 |


实现红线：

- 阶段转换只经 `WorkflowService.transition()`；模型回复、workflow 脚本 `return`、子代理完成，都不构成转换证据；
- BAF composition 可保留 standard 里的 `tool-workflow`/`ralph` 行供实现阶段内部使用，但必须由 ToolGuard 禁止它们改写 projection / 跳过 verify / 扩大 allowlist；
- 文档与代码中凡写 `workflow` 必须标明是 **BAF go** 还是 **dsh workflow tool**，禁止混称。

---



## 3. 自下而上的总体架构

下层提供稳定能力，上层只能调用下层公开 contract，不能反向越界。

### 3.1 第 0 层：操作系统与本地项目

文件系统、进程、环境变量、Git 工作区、C 编译器、构建/测试/静态分析工具。都属于外部依赖，不能假设存在。

- 所有外部命令通过受控执行器运行；
- 记录命令、工作目录、环境摘要、版本、退出码、stdout/stderr、耗时和取消状态；
- 不把 secret 放进日志；
- 路径必须经过 workspace containment 检查；
- 缺少工具返回结构化 `tool_unavailable`，不用“看起来成功”的文本代替结果。



### 3.2 第 1 层：dsh Host Plane（复用，不重写）

由 dsh 宿主提供：Cordis runtime 和 scope、Agent/session 生命周期、provider/model route（第 6 章）、shell sandbox 和审批、filesystem、search、web、jobs、session persistence、plugin/skill/command registry、desktop bridge、更新下载和重启能力。

已确认的复用点（实现时直接引用，不新建平行实现）：


| 能力                            | 位置                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| preset 发现/挂载/复制/删除            | `packages/preset/agent-presets/src/{index,discovery,mount,authoring,session}.ts`                                                           |
| standard composition          | `packages/preset/agent-presets/presets/standard/agent.cordis.yml`                                                                          |
| 人类命令 registry                 | `packages/interaction/commands`（`@deepseek-ai/dsh-commands`）：`CommandRuntime.register()`、`parseCommand()`、`CommandResult`、lifecycle events |
| launcher 参数边界                 | `packages/boot/cmdline` 的 `parseCmdline()`                                                                                                 |
| workflow worker 与 phase route | `packages/workflow/workflow-worker-thread/src/{runtime,host,meta}.ts`（`agent()` 支持 `provider`/`model`）                                     |
| session 模型选择                  | `packages/api/session-controller/src/{agent,commands,catalog}.ts`（projection、header 恢复、`session/model-unavailable`）                        |
| 默认模型                          | `packages/core/agent-default-model`                                                                                                        |
| usage/定价                      | `packages/llm/token-meter`                                                                                                                 |
| desktop 更新                    | `overlay/desktop/src/update/{manifest,github,plan,apply,service}.ts`、`overlay/desktop/src/versions.ts`                                     |


host-plane service 不得放进 preset 的 per-agent isolate realm，否则产生实例泄漏、重复注册或桌面侧无法读取。

### 3.3 第 2 层：BAF Domain Core（`baf-core`）

负责：BAF/preset/baseline 版本标识；统一错误码和诊断；workspace/Git/change identity；**change intake classifier**；domain service 接口（`WorkflowService` 等）；workflow/quality/guard 公共类型；command descriptor；desktop bridge 只读状态 contract。

不负责：直接执行 OpenSpec、直接跑 C 编译器、直接下载更新、把 UI 文案当业务状态、绕过 dsh 的 shell/审批/persistence。

### 3.4 第 3 层：Provider/Adapter 层

- `OpenSpecAdapter`：OpenSpec CLI、目录布局、模板和 validate；
- `StandardBaselineProvider`：企业规则和 Matt Pocock 轻量实践；
- `StackAdapter`：C 工程探测和工具链；
- `QualityRunner`：编译、测试、覆盖率、静态分析；
- `GuardPolicy`：安全、路径和流程门禁；
- `GitProvider`：本地 Git 状态、分支和变更；
- `UpdateCoordinator`：更新检查/应用/回滚抽象，不复制下载实现。

adapter 的职责是“把具体工具转换成统一结果”，不决定工作流顺序。工作流只调接口，不知道企业用 Make 还是 CMake。

### 3.5 第 4 层：BAF Business Plugins

第一期：`baf-core`、`baf-workflow`、`baf-openspec`、`baf-standard`、`baf-quality`、`baf-guard`、`baf-scaffold`（详细职责第 8 章）。

后续：`baf-integrate`（GitLab/Jira/远程 Git）、`baf-stack`（Python 等）、`baf-knowledge`（企业知识库）、`baf-observe`（审计/治理/指标）。

### 3.6 第 5 层：官方 BAF preset

```text
packages/preset/agent-presets/presets/baf/
  preset.yml
  agent.cordis.yml
  skills/
    baf-go/
    baf-c-guidance/
    baf-verification/
```

`agent.cordis.yml` 从 standard 完整复制（当前 dsh 无 preset 继承机制，不自创 patch 语义），保留全部 dsh 基础能力 rows，替换 persona，追加 BAF domain rows。所有带 service 的 row 放在正确的 `cordis:group`/`isolate` 结构内。

### 3.7 第 6 层：交互面

```text
slash command  ─┐
standalone CLI ─┤
desktop bridge ─┼─> BAF domain service ─> provider/adapters
workflow tab   ─┘
```

不得为四个入口各写一套 workflow 逻辑。

### 3.8 第 7 层：分发与升级

桌面应用携带官方 system resource；更新包经 manifest、hash、签名、兼容性和路径校验后才能更新 system resource；user payload 永远不能覆盖 system resource。三 scope 分发模型见第 11 章。

### 3.9 代码落点决策（packages vs overlay）


| 落点                                                               | 放什么                                          | 理由                                                         |
| ---------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------- |
| `packages/preset/agent-presets/presets/baf/`                     | 官方 preset 本体                                 | shipped-root 发现已内建于该包；`trust: system` 最直接                  |
| `packages/baf/*` 或 `packages/experimental/baf-*`（二选一，Phase 0 冻结） | BAF domain 插件源码                              | 需 Cordis 挂载、workspace 依赖、类型与测试；与现有 `@deepseek-ai/dsh-*` 同构 |
| `packages/client/ui-baf-workflow/`                               | 工作流 Tab UI                                   | 与现有 `ui-baf-desktop` 同层；走 slots + i18n                     |
| `overlay/desktop`、`overlay/scripts`、`overlay/plugin`             | 打包、更新、managed system root、baseline bundle 分发 | 二次开发层；减少与上游热文件冲突                                           |
| **禁止** `~/.dsh/.agent-presets` 作为官方安装目标                          | —                                            | 该路径是 user root；写进去则无法满足 system trust                       |


**推荐冻结**：domain 插件进 `packages/baf/`（pnpm workspace 已 glob `packages/*/`*）；若上游合入冲突面过大，再迁 `packages/experimental/` 并在 release 打包时显式纳入。`overlay/AGENTS.md`「优先 overlay」适用于桌面壳与安装器，**不**适用于必须进入 shipped preset root 与 Cordis composition 的 Agent 能力。

**现状（已关闭官方 user-root 同步）**：桌面启动只同步 `overlay/plugin/skills` → `~/.dsh/skills`；**不同步** `agent-presets`。官方 BAF 仅存在于 dsh shipped preset root。`overlay/plugin/README.md` 与 `overlay/docs/engineering/architecture.md` 与此一致。Phase 9 仍负责 managed system root 热更与签名，但不把官方 BAF 写入 user root。

---



## 4. Trust boundary 与资源分层



### 4.1 两类资源


| 层              | 来源                         | dsh trust | 用户权限                       |
| -------------- | -------------------------- | --------- | -------------------------- |
| system/shipped | 桌面安装包或企业签名更新               | `system`  | 可使用、查看摘要；**不可复制、编辑、删除、覆盖** |
| user           | 用户自建或其他允许的扩展（**不含**官方 BAF） | `user`    | 可按 dsh 规则编辑、删除、运行          |


官方 BAF 必须在 shipped/managed system root 被发现为 `trust: system`。禁止同步到 `~/.dsh/.agent-presets`（user root）。官方 `baf` 的 `copyable` 为 `false`。

### 4.2 必须实现的边界规则

1. user root 中与官方 `baf` 同名的目录不能 shadow 官方 BAF（现有 shipped-root-first 语义已保证，测试固化）；
2. user plugin 不能覆盖官方 preset、插件、baseline 或 system resource；
3. **禁止**通过 authoring API 复制官方 `baf`（`isPresetCopyable('baf') === false`）；UI 禁用复制并提示「仅内置」；
4. 桌面不同步官方 `agent-presets` 到 user root；
5. 官方更新不依赖、不触碰用户目录中的假冒 `baf`；
6. system payload 和 user payload 使用不同目标目录和写入权限；
7. zip 路径拒绝 `..`、绝对路径、符号链接逃逸和目录外写入；
8. system resource 更新后重新执行 discovery、trust、composition health check；
9. 官方资源缺失或损坏显示 broken system row，不静默隐藏；
10. UI 不向普通用户提供编辑、打开官方 canonical 目录或复制官方 BAF 的入口。



### 4.3 host-plane 与 agent-plane

- host-plane：更新服务、全局 registry、session persistence、凭证、审批、桌面桥接、共享网络服务；
- agent-plane：preset 为某个 Agent 提供的 tools、prompt、skills 和 per-agent state。

BAF plugin 每个 service row 的放置位置（realm）在设计阶段逐项标记；测试验证无 root-realm leak、无重复 registration、无跨 session 污染。桌面/CLI 需要读取的 BAF 状态（workflow status 等）通过 session projection / api controller 暴露，而不是塞进 root realm。

---



## 5. 完整工作流：状态机、流程图和每个节点的定义（核心章）



### 5.1 总流程图

所有入口（session 自然语言、`/baf-open`、`baf open`、工作流 Tab“新建变更”）先经过 N0 分类，再进入对应模式。`[方括号]` = 状态机节点；`●` = 终态；返回箭头 = 允许的回环。

```text
用户输入（消息 │ /baf-open │ baf open │ Tab“新建变更”）
   │
   ▼
[N0 intake 分类]
   │  判定：变更类型 + 影响范围 + 企业策略
   │
   ├─ 新需求 / 行为变化 ──────────────► mode = full-go
   ├─ Bug + 低风险 + baseline 允许 ───► mode = bug-fast-path
   ├─ Bug + 高风险 ──────────────────► mode = full-go
   └─ 信息不足 ──► 向用户提问澄清 ──►（回到 N0 重新分类）

full-go 主链（新需求 / 高风险 Bug）：

[N1 open] ──► [N2 clarify] ──► [N3 design] ──► [N4 plan] ──► [N5 implement] ──► [N6 verify]
 建立变更      澄清需求          技术设计          任务计划          实现+测试          全量验证
                                                                                                 │
                                                                  ┌────────────────────────────┤
                                                                  │      ├─ 通过且无 drift ──► [N7 archive] ──► ● 完成
                                                                  │      ├─ 任一检查失败 ────► 回 [N5 implement]（修复后重验）
                                                                  │      └─ drift ──► [N8 drift 处理] ──► 回 [N6 verify]

bug-fast-path 主链（低风险 Bug）：

[N1 open] ──► [N5 implement] ──► [N6 verify] ──► [N7 archive] ──► ● 完成
 建立变更+      修复+回归测试        含回归测试的验证       写最终 Bug 记录
 根因记录           │                    │
                    │                    ├─ 失败 ──► 回 [N5 implement]
                    │                    └─ 发现范围/风险扩大 ──► 升级 full-go，补走 N2→N3→N4 → N5 → N6
                    │
                    └─（图中必须标注“未走 OpenSpec：reason codes”）

横切（不属于固定顺序节点，任何 active 阶段都可触发）：

[当前 active 节点] ──依据变化──► [N8 drift 处理] ──► 最早受影响节点（重新执行/重新确认）
[resume]         崩溃/重开/换机后从最后一致阶段恢复
[abandon]        任意 active change 经用户确认进入 ● 已放弃（保留全部审计记录）
[archive 延后]   N7 可延后，change 保持 active 状态，不谎称已归档
```

要点：

- 图上每条边对应 5.2 转换表中一条合法转换，其余转换一律被 domain service 拒绝；
- verify 失败回 implement、drift 后回最早受影响节点、fast path 升级 full-go 是仅有的三类回环，模型不能创造第四类；
- `● 完成` 与 `● 已放弃` 是仅有的两个终态；`active`（archive 延后）是合法的非终态驻留。



### 5.2 状态转换表


| #   | 当前状态                | 目标状态            | 允许条件（由 domain service 检查）                                                |
| --- | ------------------- | --------------- | ------------------------------------------------------------------------ |
| T1  | （无 change）          | intake          | 任何 BAF 输入                                                                |
| T2  | intake              | open（full-go）   | 分类确认为新需求或高风险 Bug                                                         |
| T3  | intake              | open（fast path） | 确认为低风险 Bug 且 baseline 策略允许                                               |
| T4  | open                | clarify         | full-go、change skeleton 创建成功且 clarify 未并入 open                           |
| T4a | open                | design          | full-go、change skeleton 创建成功且 clarify 已按 5.5 并入 open，合并产物和理由已记录          |
| T5  | open                | implement       | fast path 且根因/影响范围记录完成                                                   |
| T6  | clarify             | design          | 阻塞问题已回答或明确延期；验收条件可测试                                                     |
| T7  | design              | plan            | 设计引用可验证文件/API 并被确认，且 design 未并入 plan                                     |
| T7a | design              | implement       | design 已按 5.5 并入 plan；合并的设计理由、任务、文件范围、验证命令和回滚点均已记录                       |
| T8  | plan                | implement       | 计划有文件范围、验证命令和回滚点                                                         |
| T9  | implement           | verify          | 全部任务有结果且无越界修改                                                            |
| T10 | verify              | archive         | 全部必需检查通过且无 drift（full-go 与 fast path 均进入 archive；fast path 在此写最终 Bug 记录） |
| T11 | verify              | implement       | 任一必需检查失败（修复回环）                                                           |
| T12 | 任意 active 节点        | drift           | 检测到依据变化（文件/分支/baseline/规格/composition/报告）并记录来源节点及最早受影响节点                 |
| T13 | drift               | 最早受影响节点         | 依据已恢复或经用户重新确认；目标由 drift evidence 决定，不得跳过尚未完成或已失效阶段                       |
| T14 | archive             | 完成              | 人工确认且原子归档成功                                                              |
| T15 | fast-path implement | clarify（补充）     | 风险升级为 full-go，补齐 N2/N3/N4                                                |
| T16 | 任意 active           | 已放弃             | 用户显式确认                                                                   |


不在表中的转换一律返回结构化 `invalid_transition`。模型在回复里声称“已进入下一阶段”不构成转换条件。

### 5.3 每个节点的详细定义

每个节点回答七个问题：前置条件、输入、要做的动作、产物、完成条件、失败处理、入口和路由。

#### N0 `intake` — 变更分类（所有入口的第一站）

- 前置条件：BAF session 已建立；workspace 可读。
- 输入：用户原始描述；workspace/Git 当前事实；已有 active change 列表；baseline 分类策略；企业 bug-fast-path 许可策略。
- 要做的动作：
  1. 解析用户意图，提取候选变更类型、涉及文件猜测和需要澄清的问题（模型只做建议）；
  2. 规则引擎复核：文件范围、公共 API、数据格式、并发、安全、性能、规格影响、回滚难度；
  3. 计算 `affectedScope`（single-file / small-local / cross-module / public-api / unknown）和 `confidence`；
  4. 判定 mode：新需求或高风险 Bug → `full-go`；低风险 Bug 且 baseline 允许 → `bug-fast-path`；信息不足 → `clarify-required` 并向用户提问，答案回流后重新执行本节点；
  5. 若 `requiresUserConfirmation` 为真，向用户展示分类卡（类型、理由、影响范围、是否需要 OpenSpec、推荐流程），等待确认；
  6. 确认后将 `ChangeIntake` 写入 projection 事件日志。
- 产物：`ChangeIntake { kind, mode, openspecRequired, reasonCodes, affectedScope, confidence }` 分类卡和确认记录。
- 完成条件：分类结果和用户确认（如需要）已写入 projection。
- 失败处理：baseline 缺失 → `policy_missing`/`baseline_unavailable`，禁止启用 fast path；无法分类 → `clarify-required`，不写源码。
- 入口：session 消息、`/baf-open`、`baf open`、工作流 Tab“新建变更”。
- 模型路由：轻量低延迟 route（第 6 章）。
- 硬规则：**分类确认之前禁止任何源码写入**；用户要求跳过 full-go 但规则判定必须走时，拒绝并展示 reason codes。



#### N1 `open` — 建立变更身份

- 前置条件：intake 已确认；workspace 可读；本地 Git 可用（不可用时 full-go 阻断、fast path 警告并留档）；baseline 可解析。
- 输入：`ChangeIntake`；Git branch/revision；baseline id/version。
- 要做的动作：探测 workspace/Git/baseline/OpenSpec 可用性；多个 active change 时要求用户显式选择或新建；生成唯一 change id；创建 change skeleton（full-go 建 OpenSpec change 目录，fast path 建最小 Bug 记录）；锁定 baseline 并记录 source revision。
- 产物：change id；skeleton 文件；初始化后的 workflow projection。
- 完成条件：change id 唯一、目标非空、目录合法；baseline lock 已记录。
- 失败处理：OpenSpec 不可用且流程需要规格 → `openspec_unavailable`；不覆盖任何已有文件。
- 入口：intake 自动进入；`/baf-open`、`baf open`、Tab 节点“开始”。
- 模型路由：轻量 route。



#### N2 `clarify` — 澄清需求（full-go）

- 前置条件：N1 完成。
- 输入：用户目标；intake 结果；N0 未闭合的问题。
- 要做的动作：枚举阻塞问题；记录每个答案、决策人/确认来源和时间；区分“已决定/待决定/明确不做”；写出可测试的验收条件；非阻塞问题可延期但记录原因。
- 产物：clarify 文档 / 决策记录。
- 完成条件：阻塞问题已回答或明确延期；验收条件可测试。
- 失败处理：用户未回答 → 阶段保持 in-progress；模型推测不得标记为用户确认。
- 入口：自动于 N1 后；`/baf-clarify`、Tab。
- 模型路由：低成本、长上下文整理 route。



#### N3 `design` — 技术设计（full-go）

- 前置条件：N2 完成。
- 输入：clarify 产物；仓库实际代码。
- 要做的动作：阅读实际仓库不凭空设计；确定接口、数据流、错误路径、风险和兼容性；优先复用现有抽象；每个结论附可验证文件/API 引用；对计划改动路径做 guard 预检查。
- 产物：design 文档、风险清单。
- 完成条件：设计引用实际文件/API 并符合 baseline；被用户/规则确认。
- 失败处理：读取后仓库已变化 → drift 标记；引用无法验证 → 不允许进入 plan。
- 入口：自动于 N2 后；`/baf-design`、Tab。
- 模型路由：高推理、长上下文 route。



#### N4 `plan` — 任务计划（full-go）

- 前置条件：N3 完成。
- 输入：design 产物。
- 要做的动作：将设计拆成任务（每项有输入、输出、影响文件、验证方法、回滚点）；固化允许修改的文件 allowlist；写出每个任务的验证命令和可观察完成标准；对 guard policy 做 snapshot。
- 产物：plan 文档、任务列表、文件 allowlist、guard snapshot。
- 完成条件：每项任务可执行、可验证、可回滚。
- 失败处理：计划不能只写“实现功能”；计划变化必须记录新事件，不得静默扩大范围。
- 入口：自动于 N3 后；`/baf-plan`、Tab。
- 模型路由：高推理、结构化输出 route。



#### N5 `implement` — 实现与测试

- 前置条件：full-go 要求 N4 完成；fast path 要求 N1 完成（含根因记录）。
- 输入：plan 或 Bug 记录；文件 allowlist；guard snapshot。
- 要做的动作：每任务开始前检查当前阶段和 guard；只修改 allowlist 内文件（新增范围需重新确认或触发风险升级）；先写最小实现和测试再扩大变更；同步更新规格（full-go）；外部命令记录结构化结果；记录每个任务的开始/完成/阻塞状态。
- 产物：源码、测试、规格变更；任务结果记录。
- 完成条件：全部任务有结果；没有越界修改；没有把测试跳过当作通过。
- 失败处理：guard 拒绝 → blocked + 稳定 reason code；取消 → 不产生虚假 completed；fast path 发现范围扩大 → T15 升级。
- 入口：自动转换；`/baf-implement`、`baf implement`、Tab。
- 模型路由：代码生成、工具调用 route。



#### N6 `verify` — 验证

- 前置条件：N5 任务全部结束；报告环境可用。
- 输入：implement 结果；baseline；source revision；route metadata。
- 要做的动作：运行 OpenSpec validate（full-go 或升级后）；运行 baseline 指定的 C 编译、测试、覆盖率、静态分析、格式检查；运行 secret scan 和 guard；fast path 必须运行回归测试；聚合结构化报告（绑定 baseline id/version、tool versions、workspace identity、source revision）；校验报告新鲜度。
- 产物：结构化 quality/guard/openspec 报告。
- 完成条件：全部必需检查通过且报告未过期。
- 失败处理：任一检查失败 → T11 回 implement；工具不可用 → `tool_unavailable` blocked；超时/取消可区分；依据变化 → T12 drift。质量通过不等于安全通过。
- 入口：自动转换；`/baf-verify`、`baf verify`、Tab。
- 模型路由：稳定、严谨、结构化报告分析 route；机器门禁结果优先于模型解释。



#### N7 `archive` — 归档

- 前置条件：N6 通过且无 drift；人工确认。
- 输入：verify 报告；change 全部产物。
- 要做的动作：展示变更摘要、验证结果和审计引用；请求人工确认；通过 OpenSpec adapter 原子归档（full-go）或写最终 Bug 记录（fast path）；写最终 projection 状态。
- 产物：archived change / 最终记录、摘要、最终 projection。
- 完成条件：归档原子完成，不能伪造成功。
- 失败处理：保持原 change 可恢复，不产生半归档状态；可重试且幂等。
- 入口：`/baf-archive`、Tab“确认归档”。
- 模型路由：低延迟、严格指令遵循 route；模型不能自行触发归档。



#### N8 `drift` — 漂移处理（横切）

- 触发：文件删除、分支变化、baseline 变化、报告过期、composition 变化、规格与 projection 冲突。
- 动作：标记受影响阶段为 `drifted`；要求重新验证（回 N6）或经用户重新确认；不静默修复。
- 说明：OpenSpec 文件始终是规格权威，projection 是可恢复索引；两者冲突时标记 drift。



#### 横切行为 `resume` / `abandon`

- `resume`：崩溃、重开 session、child 重启后，从最后一致阶段恢复，并恢复分类结果、裁剪理由、baseline lock 和 route 语义；
- `abandon`：任意 active change 经用户确认进入 `已放弃` 终态；保留全部产物与审计记录；不自动删除 OpenSpec change（用户选择保留或手工清理，选择被记录）。



### 5.4 约束分级

- 软约束：persona、system prompt、skill、示例和建议顺序——引导 Agent；
- 半硬约束：projection、阶段命令、前置条件、人工确认、drift 检查——违反时暂停；
- 硬约束：guard、路径 containment、secret scan、OpenSpec validate、C 质量门禁、签名验证、system trust——失败时拒绝继续。

模型只能触碰软约束；半硬约束由 domain service 执行；硬约束任何角色都不能关闭。

### 5.5 受控裁剪规则


| 裁剪                                              | 允许条件                         | 必须保留                                           |
| ----------------------------------------------- | ---------------------------- | ---------------------------------------------- |
| clarify 并入 open                                 | 小变更                          | 目标、边界、验收记录                                     |
| design 并入 plan                                  | 纯文案/单行配置                     | “为何不需要独立设计”的理由                                 |
| Bug fast path（clarify+design+plan+OpenSpec 全跳过） | 低风险 Bug + baseline 允许 + 用户确认 | change identity、根因、回归测试、implement、verify、guard |
| archive 延后                                      | 用户选择                         | change 保持 active，不谎称已归档                        |
| open / plan（full-go 内） / implement / verify     | 不可删除                         | 即使单任务也要有完成条件；无代码变更可 no-op 并记录                  |


轻量策略只能减少阶段文档，不得关闭硬门禁。第一期只实现 full-go、bug-fast-path 和上表合并规则，不实现任意自定义流程图。

### 5.6 阶段如何被驱动（自然语言 ≠ 转换）

每个阶段有两种合法驱动，禁止第三种：


| 驱动     | 谁发起                             | domain service 做什么                                         |
| ------ | ------------------------------- | ---------------------------------------------------------- |
| 显式命令   | `/baf-*`、`baf *`、Tab 按钮         | 校验前置 → `transition` → 可选启动带 phase route 的 agent turn → 写事件 |
| 受控阶段工具 | 模型调用 `baf_stage_*`（只读建议或「请求转换」） | 工具体只调用同一 `WorkflowService`；成功才改状态；失败返回 reason code         |


禁止：

- 仅凭模型自然语言「我已完成 design」推进阶段；
- 仅凭 prompt/skill 软约束当作门禁；
- 旁路 ToolGuard 的 filesystem/shell/MCP 写入（见 8.6、17.2）。

会话内连续对话仍可发生：用户在 clarify/design 阶段用自然语言回答问题；**写入产物与阶段完成判定**仍由 stage handler 在命令/工具路径上执行完成条件检查。

### 5.7 Session 事件与 workspace projection 双轨

- **权威审计（model-visible / resume）**：凡影响模型请求身份或阶段可见事实的事件，必须进入 dsh session log（`SessionEventMap` 声明合并，例如 `baf/route-resolved`、`baf/intake-confirmed`、`baf/stage-transition`）；满足「model-visible ⟺ logged」。
- **工作区可恢复索引**：`<workspace>/.baf/projection/` 是跨 session、跨机器的 change 状态索引，由同一 domain 事件派生，不是第二套权威。
- 冲突时：OpenSpec 文件 > session 已提交事实 > projection 索引；冲突标记 drift，不静默覆盖。

---



## 6. 多模型路由：复用 dsh 原生能力



### 6.1 dsh 已有的原生 contract

- workflow `agent()` options 支持 `provider`、`model`，由 workflow worker 转发到 host（`packages/workflow/workflow-worker-thread/src/{runtime,host}.ts`）；
- workflow metadata 的 phase 支持 `provider`、`model`（`packages/workflow/tool-workflow`、`.../meta.ts`）；
- child agent 继承当前 phase route，也可显式指定；
- session、resume、token meter 和 route pricing 已将 provider/model 作为正式请求身份和用量归因字段；
- 已有模型 catalog（`packages/api/session-controller/src/catalog.ts`）、默认模型服务（`packages/core/agent-default-model`）和 `session/model-unavailable` 错误。

BAF 不新建 LLM client、provider registry 或第二套模型切换协议。

### 6.2 BAF 的实现边界

1. dsh host 负责 provider 适配、请求发送、凭证、重试边界和底层 usage 记录；BAF 只负责企业 route policy、阶段映射和权限约束；
2. 企业发行配置提供允许的 provider/model 清单及能力标签，解析为独立、只读的 `EnterpriseRoutePolicy`；session 创建时连同 route profile 一起冻结，普通用户不能任意添加；
3. route 解析优先级固定为：**企业强制策略 → BAF route profile → 当前 workflow phase → 受策略约束的 session override → dsh 默认 route**；较高优先级只能收紧或覆盖较低优先级；resolver 必须显式接收企业策略，不能把 `source: enterprise` 仅当作 route profile 的别名；
4. phase route 只改变该阶段新启动的 model request，不改变 workflow identity、change identity、projection、baseline lock、session composition 或阶段状态；
5. child agent 默认继承 phase route；显式覆盖必须再次经过 allowed-model、能力和上下文兼容性检查；
6. provider/model 不可用、超时、限流或上下文不兼容时，只能切换到企业批准且能力兼容的 fallback；fallback 不存在或不合规时阻断并返回 `model_route_unavailable`、`model_route_incompatible` 或 `model_fallback_blocked`；
7. 每次实际请求记录 provider、model、route source、phase、fallback、时间、失败原因和 session/change identity；不得静默降级。

模型只负责生成建议、文档、代码和报告解释；阶段转换、OpenSpec validate、质量门禁、guard 和 archive 条件始终由 domain service/adapter 的机器结果决定。

### 6.3 阶段与模型能力映射


| 阶段          | 首选模型能力          | 路由目的                                 | 失败处理                                               |
| ----------- | --------------- | ------------------------------------ | -------------------------------------------------- |
| `intake`    | 低延迟、基础工具调用      | 快速分类和影响范围判断                          | 批准的轻量 fallback；无可用 route 则 `clarify-required` 人工兜底 |
| `open`      | 低延迟、基础工具调用      | 快速检查 workspace、Git 和 change identity | 批准的轻量 fallback；无可用 route 则阻断                       |
| `clarify`   | 低成本、长上下文整理      | 提取问题、边界、非目标和验收条件                     | 同等能力 fallback；不得跳过记录                               |
| `design`    | 高推理、长上下文、仓库分析   | 接口、数据流、错误路径和风险方案                     | 仅允许能力兼容 fallback；产物仍须人工/规则确认                       |
| `plan`      | 高推理、结构化输出       | 任务分解、文件范围、验证命令和回滚点                   | route 失败则暂停，不生成未验证的计划                              |
| `implement` | 代码生成、工具调用、上下文保持 | 按计划修改源码和测试                           | 不得因模型切换扩大允许文件范围                                    |
| `verify`    | 稳定、严谨、结构化报告分析   | 解释机器报告并识别未解决问题                       | 机器门禁优先；无合规 route 不能声称通过                            |
| `archive`   | 低延迟、严格指令遵循      | 展示摘要并请求归档确认                          | 归档条件由 domain service 判断                            |




### 6.4 模型切换的硬约束

- phase 切换时新请求使用新 phase route；已开始的请求不在中途切换；
- workflow projection、OpenSpec 文件、baseline lock 和报告有效性不因模型切换自动改变；
- resume 恢复原 phase、route source 和实际 provider/model（除非企业策略允许重新解析并留痕）；
- verify 报告记录实际 provider/model，但有效性由 source revision、baseline、规格和工具报告决定；
- token meter 按实际 routed provider/model 归因，审计同时保留首选和 fallback route；
- 普通用户可查看 route 状态（设置页、工作流 Tab），但只能在企业策略内选 session override。

---



## 7. 企业基线和适配器：具体规则放在哪里



### 7.1 企业基线是什么

企业维护、版本化、审批后发布的标准答案包，至少规定：OpenSpec 版本/CLI/模板/目录/validate 参数；Matt Pocock 规则正式来源；C 编译器、构建系统、测试框架、覆盖率和静态分析工具；覆盖率阈值、受保护路径、secret scan、Git 规则；bug-fast-path 许可策略；routeProfile；规则生效版本、兼容 BAF 版本和变更日期。

BAF 不能在七个插件里分别硬编码这些值。

### 7.2 最小 manifest 结构（schema 冻结后不允许第二种格式）

```yaml
schema: 1
baselineId: baf-baseline-c-2026.1
bafCompatibility:
  min: 0.1.0
  max: 0.x
workflow:
  default: go
  requireOpenSpec: true
  bugFastPath:
    allowed: true
    maxScope: small-local
    requireRegressionTest: true
routeProfile:
  default: <企业批准的默认 provider/model>
  allowed:
    - provider: <provider id>
      model: <model id>
      capabilities: [reasoning, coding, structured-output]
      fallbackGroup: <group id>
  phases:
    intake: { provider: <provider id>, model: <model id> }
    open: { provider: <provider id>, model: <model id> }
    clarify: { provider: <provider id>, model: <model id> }
    design: { provider: <provider id>, model: <model id> }
    plan: { provider: <provider id>, model: <model id> }
    implement: { provider: <provider id>, model: <model id> }
    verify: { provider: <provider id>, model: <model id> }
    archive: { provider: <provider id>, model: <model id> }
  fallbackPolicy:
    mode: approved-only
    groups: {}
openspec:
  cli: <冻结的可执行文件或 launcher>
  version: <精确版本或兼容范围>
  root: <项目相对路径>
  changeRoot: <change 相对路径>
  validate:
    args: [<固定参数>]
standard:
  mattPocockRulesRef: <企业规则/模板引用>
stack:
  language: c
  compiler: <企业指定编译器>
  build: <adapter id>
  test: <adapter id>
  coverage:
    required: true
    minimum: <企业阈值>
  analyzers: [<adapter id>]
guard:
  secretScan: required
  protectedPaths: [<workspace-relative paths>]
  requireHumanConfirmation: [scaffold, archive, abandon]
```

`routeProfile` 必须经过 schema、allowed-model 和企业策略校验。缺 route、首选 route 不兼容或无批准 fallback 时返回结构化错误，不回退到 dsh 任意默认模型。baseline 缺失/解析失败/版本不兼容/工具不可执行时返回 `baseline_unavailable`/`baseline_incompatible` 并阻断依赖阶段。

### 7.3 稳定 provider contract（`baf-core` 暴露）

```ts
interface OpenSpecAdapter {
  detect(ctx: AdapterContext): Promise<DetectResult>
  open(input: OpenInput): Promise<DomainResult<ChangeRef>>
  read(change: ChangeRef): Promise<DomainResult<ChangeState>>
  validate(change: ChangeRef): Promise<ValidationReport>
  archive(change: ChangeRef, signal: AbortSignal): Promise<DomainResult<ArchiveResult>>
}

interface StackAdapter {
  detect(ctx: AdapterContext): Promise<StackDetection>
  runQuality(input: QualityInput, signal: AbortSignal): Promise<QualityReport>
}

interface GuardPolicy {
  check(input: GuardInput, signal: AbortSignal): Promise<GuardReport>
}

interface WorkflowService {
  intake(input: IntakeInput): Promise<IntakeResult>
  status(input: WorkflowIdentity): Promise<WorkflowStatus>
  transition(input: TransitionInput): Promise<TransitionResult>
  resume(input: WorkflowIdentity): Promise<ResumeResult>
}
```

统一结果至少带：`status`、`diagnostics`、`artifacts`、`exitCode`（如适用）、`startedAt`、`finishedAt`、`baselineVersion`、`sourceEventSeq`。

projection 落盘位置和 change id 生成规则是 Phase 0 冻结项（推荐 `<workspace>/.baf/`，是否提交由企业 Git policy 决定）。

---



## 8. 插件详细职责和边界



### 8.1 `baf-core`

公共类型、版本、错误码、workspace identity、baseline loader、intake 规则引擎、domain service 注册、command adapter contract；对外提供 `status`/`version`/`doctor`/`help` 只读能力。不直接执行外部工具、不实现 UI、不复制 `UpdateService`。

### 8.2 `baf-workflow`

- change intake 分类确认、Bug 影响范围评估、full-go/bug-fast-path 策略选择；
- 5.2 转换表的执行、拒绝和审计；
- go 阶段枚举和允许转换表；
- 每阶段 route profile 解析、phase-level provider/model 传递和 fallback 选择；
- workflow projection 持久化；
- resume、drift detection、报告过期判断、风险升级（T15）；
- 当前 change 选择、abandon；
- 阶段 prompt/skill；
- `intake` 到 `archive` 的命令 handler。

分类必须先于阶段转换；分类结果、规则依据、用户确认和策略升级都写入 projection。Bug fast path 不绕过 guard：仍经过 change identity、受控 implement、verify 和质量/安全检查。route resolver 调用 dsh 原生 route contract，不直接调 LLM SDK；路由失败阻止需要模型产物的阶段。OpenSpec 文件是规格权威，projection 是可恢复索引；冲突标记 drift。

### 8.3 `baf-openspec`

OpenSpec CLI 探测、版本检查、change skeleton、需求/设计/计划文件读写、validate、archive adapter。本地运行，不联网，不自行下载工具。

### 8.4 `baf-standard`

加载 baseline 中的项目宪法、C 编码规则、接口和错误处理规则、日志/文档规则、分支提交要求和 Matt Pocock 轻量实践；输出供 prompt、plan 和 guard 使用的结构化规则摘要。

### 8.5 `baf-quality`

执行 baseline 指定的 C 编译、测试、覆盖率、格式和静态分析，生成统一报告：

```json
{
  "schema": 1,
  "baselineId": "...",
  "workspace": "...",
  "revision": "...",
  "toolVersions": {},
  "checks": [],
  "artifacts": [],
  "passed": false,
  "diagnostics": []
}
```

报告缺失、工具版本不匹配、超时、取消、退出码异常、阈值不足都必须是可区分的失败原因。

### 8.6 `baf-guard`

protected path 检查；path traversal 和 workspace escape 检查；危险 shell/强制 Git 阻断；secret scan；未完成流程阶段时阻断越权操作；未通过 verify 禁止 archive；system resource 覆盖阻断；人工确认点（archive、abandon、scaffold 覆盖）。`baf-guard` 必须通过 BAF agent 的 `agent.ctx` 调用现有 `ctx.tools.guard()` 注册单调 ToolGuard：它在全部 `tools/pre-execute` listener 之后、tool body 之前运行，对 filesystem、shell 及其他可修改 workspace 的 tool/action 分类并拒绝不合规调用；分类未确认时拒绝全部源码写入，进入 implement 后仍逐次校验 allowlist、阶段和 guard snapshot。不能只在 BAF 自有 stage handler 内检查，因为普通自然语言消息和既有工具入口同样必须受控。每次拒绝返回稳定 reason code：`intake_confirmation_required`、`protected_path`、`secret_detected`、`verify_required`、`system_resource_conflict`、`invalid_transition` 等。

**旁路面（测试必须覆盖）**：

- MCP 工具若可写文件系统，同样过 ToolGuard 或在 BAF composition 中禁用未分类 MCP；
- 子代理继承 initiator 的 guard/allowlist；显式扩大范围需重新确认或触发 T15；
- `tool-workflow` / `ralph` 不得作为跳过阶段或扩大 allowlist 的通道；
- shell 间接写入（重定向、脚本）按 shell 策略拒绝或要求 allowlist 内路径；
- listener 顺序不能 force-allow：`tools/pre-execute` 的 allow 不能覆盖随后的 monotonic guard。



### 8.7 `baf-scaffold`

初始化 OpenSpec、C 构建/测试骨架和 baseline 引用。先检查已有文件，默认不覆盖；覆盖需用户确认并使用可恢复备份或原子写入。

---



## 9. 命令设计



### 9.1 统一实现原则

slash command 复用 `@deepseek-ai/dsh-commands`（`CommandRuntime.register()`、`parseCommand()`、`CommandResult`、`command/run`/`command/done` lifecycle、cancellation/attachment/错误归一化）。`packages/boot/cmdline` 只处理 launcher flags。

`baf` **CLI 启动 contract（硬规则）**：

- dsh 禁止新增绕过 `dsh` launcher 的 Node 应用 bin（见 `docs/architecture.md` Application launch）；
- 允许形态 A：`dsh --profile baf-cli -- <subcommand>…`（推荐；profile + patch 挂载 BAF plugins，复用同一 Cordis 树）；
- 允许形态 B：安装器提供的 thin wrapper `baf.cmd`/`baf`，内部只 `exec` 到上述 `dsh --profile baf-cli`，不自建 Cordis 树、不直接 `node` 进业务包；
- CLI 拥有自己的 Commander tree 并通过 `parseCmdline(ctx, program)` 接入；**不复制** slash handler 业务逻辑；
- 禁止：`packages/*/package.json` 增加可执行 Node 入口冒充独立应用。



### 9.2 命令表

独立 CLI 使用 `baf <command>`；slash 形式 `/baf-<command>`（现有 command name 是单层名称）。


| 命令                        | 作用                                                         | 是否改变状态      |
| ------------------------- | ---------------------------------------------------------- | ----------- |
| `help`                    | 展示命令和规则说明                                                  | 否           |
| `version`                 | 展示 BAF、preset、baseline、dsh/runtime 版本                      | 否           |
| `status`                  | 展示 preset、Git、OpenSpec、workflow（含分类和当前阶段）、quality、guard 状态 | 否           |
| `doctor`                  | 诊断 composition、工具、目录、权限、配置和更新元数据                           | 否           |
| `docs`                    | 打开或输出企业文档和基线引用                                             | 否           |
| `init`                    | 初始化 BAF/OpenSpec/C 项目骨架                                    | 是，需确认       |
| `open`                    | 新建或选择 change（先走 intake 分类）                                 | 是           |
| `classify`                | 对当前输入重新执行/查看 intake 分类                                     | 是（重分类需确认）   |
| `clarify`                 | 记录需求问题和决策                                                  | 是           |
| `design`                  | 创建/更新技术设计                                                  | 是           |
| `plan`                    | 创建任务计划和允许文件范围                                              | 是           |
| `implement`               | 执行或恢复实现阶段                                                  | 是           |
| `verify`                  | 运行所有必要检查                                                   | 写入报告        |
| `archive`                 | 归档已验证 change                                               | 是，需确认       |
| `abandon`                 | 放弃当前 active change                                         | 是，需确认       |
| `quality`                 | 运行或查看 C 质量检查                                               | 写入报告        |
| `guard`                   | 查看或运行策略门禁                                                  | 写入诊断        |
| `update check`            | 检查三类 scope 的签名 manifest 和本地兼容性                             | 否           |
| `update download [scope]` | 下载并校验指定 scope，不改变当前生效版本                                    | 否，受策略许可     |
| `update apply [scope]`    | 应用已下载更新；必要时重启 child 或交接 installer                          | 是，需策略许可     |
| `update rollback [scope]` | 回滚指定 scope 最近一次成功更新                                        | 是，需管理员/策略许可 |
| `update status`           | 展示三类 scope 当前版本和状态                                         | 否           |
| `git status`              | 展示本地 Git 信息                                                | 否           |


普通用户不能通过命令关闭官方 guard、降低质量阈值、修改 system preset、跳过 intake 分类或跳过签名验证。

---



## 10. 官方 preset、UI 和工作流 Tab



### 10.1 preset

新增 `packages/preset/agent-presets/presets/baf/{preset.yml,agent.cordis.yml,skills/**}`。metadata 固定 id `baf`、显示名 `BAF 模式`、固定 order（排在 standard 之后）。standard 保持 `default: standard`。

composition 从 standard 完整复制，替换 persona 为 BAF persona，追加 BAF plugin rows（见 12 章 Phase 1 具体写法）。workflow metadata 声明或引用企业 `routeProfile`；preset 不携带 provider 凭证或私有 endpoint。session 创建时冻结 preset composition、route profile 版本和 baseline lock。

### 10.2 preset roster UI（`packages/client/ui-agent-preset`）

- BAF 显示为“内置”；standard 继续显示默认；
- BAF 可选择、查看摘要；**不可复制、不可删除**、不显示打开官方目录；
- broken system BAF 保留在列表并显示修复/升级提示；
- default 改变只影响新 session；session 创建后 composition 固定；
- 创造模式在企业发行版默认隐藏（是否显示由发行配置决定，不删 dsh 通用实现）。



### 10.3 BAF 工作流 Tab（流程图页面）

BAF session 中新增专用工作流页面，是 workflow projection 的可视化 + 受控半交互入口，不自维护第二份状态。与设置/会话中的「轨迹图」（agent 执行轨迹）**无关**；设置里原「工作流」开关已改名为「轨迹图」。

**页面目标**：看到 change 类型、模式、当前阶段（流程图高亮）、已完成阶段及产物、当前阶段前置条件/任务/阻塞、未开始阶段、OpenSpec 状态、baseline/route/fallback 状态、drift/过期报告/待确认事项。

**可见性**：仅 `agentPreset === baf` 的 session 注册会话 Tab「工作流」；非 BAF session 不出现该 Tab。

**流程图展示**：直接渲染第 5.1 状态图（`WORKFLOW_GRAPH` + `TRANSITIONS` + `NODE_CATALOG` 由 `baf-core` 导出，UI 只渲染）。Host 组装 `WorkflowTabView` 下发给客户端。fast path 图中明确标注“未创建/未更新 OpenSpec（reason codes）”，不把被裁剪阶段伪装成已完成；升级 full-go 后追加缺失阶段且不清除已完成阶段。无 active change 时仍画完整模板图并显示空态引导。节点状态：

```text
locked / available / in-progress / completed / failed / blocked / drifted / skipped（skipped 必须显示裁剪理由）
```

键盘导航、颜色之外的状态表达、窄窗口和无障碍文本齐备。节点点击展示 5.3 对应的结构化详情。普通用户只能触发 domain 允许的动作；不能点节点跳阶段；不做拖拽编排。视觉跟随 `--dsw-*` 主题。

**Phase 4 半交互**：可「确认分类 / 补充信息 / 拒绝并退出」、查看详情、在前置满足时请求合法 `transition`。archive 确认、阶段「开始执行」等 Phase 5+ 动作展示但禁用并标注原因。没有“跳过 OpenSpec”类绕过按钮。

**数据和刷新**：Web 经 Typert Remote（`bafWorkflow` 视图 API）按 session `cwd` 读写统一 projection；Electron IPC（`baf:getWorkflowStatus` 等）留 Phase 8。客户端在打开/焦点/操作后刷新；页面显示 `sourceRevision`、baseline lock、projection version 和最后更新时间；无 active change、多 change 未选、baseline 缺失或 projection 损坏时显示明确空态/阻断态。

**实施边界**：UI 只做展示和交互适配；阶段判定、分类、OpenSpec、前置条件、裁剪、drift、门禁和模型路由全部由 `baf-workflow`/`baf-core` 负责。落地包：`packages/client/ui-baf-workflow/`（与 `ui-baf-desktop` 同层）。

---



## 11. 桌面打包、更新、签名和回滚



### 11.1 打包

修改 `overlay/scripts/{pack-dsh,pack-plugin,build-release}.mjs`、`overlay/plugin/README.md` 和 desktop resource preparation。要求：canonical BAF 进入 packaged dsh shipped root（不只是 `overlay/plugin/agent-presets`）；打包后用真实 roster 检查 `baf`、`trust: system`、composition health 和 `standard` default；plugin zip manifest 增加 schema、payload scope、逐文件 hash、preset schema、BAF version 和 system resource 声明；system/user payload 不同目标目录；user payload 不覆盖 system id。

### 11.2 Manifest schema and compatibility（`overlay/desktop/src/update/manifest.ts`）

```json
{
  "schema": 2,
  "channel": "stable",
  "tag": "baf-dsh-v...",
  "issuedAt": "2026-01-01T00:00:00Z",
  "expiresAt": "2026-02-01T00:00:00Z",
  "releaseEpoch": 1,
  "bafDsh": "...",
  "dsh": "...",
  "bafPlugin": "...",
  "bafPreset": "...",
  "baseline": "...",
  "presetSchema": 1,
  "compatibility": { "minDsh": "...", "maxDsh": "..." },
  "artifacts": { "plugin": {}, "runtime": {}, "shell": {} },
  "systemResources": ["presets/baf", "baseline/..."],
  "rollback": { "supported": true, "minimumVersion": "..." },
  "signature": { "algorithm": "ed25519", "keyId": "...", "asset": "manifest.sig" }
}
```

`update/plan.ts` 统一负责 channel、版本、兼容范围、minimum version、降级保护、signed `issuedAt`/`expiresAt`/`releaseEpoch` 和 system resource 声明检查。验签后才解释这些字段；生产以可信系统时钟校验有效期并允许发行配置给出有限 clock skew，时钟不可用/明显回拨时阻断 apply；离线包同样受有效期和单调 `releaseEpoch` 约束，除非管理员使用独立签名的离线例外策略，防止重放旧但签名有效的 manifest。

### 11.3 Manifest 签名和下载

`generate-manifest.mjs` 生成 canonical JSON、artifact SHA-256、逐文件 hash 和 Ed25519 signature；CI 私钥只来自 secret；`public-key.ts` 用正式公钥和 key id；生产强制签名（缺签名/错 key/签名不匹配/过期直接拒绝）；开发模式跳过必须显式配置且不进生产构建；`github.ts` 继续负责下载校验。

### 11.4 应用和回滚

复用 `overlay/desktop/src/update/apply.ts` 的 pending、`.next`、`.bak`、原子交换、停止 child、重启和 rollback。流程：下载 pending → 校验签名和 hash → 校验 scope/路径/system-user 目标 → 记录旧版本 → 停 child → 解压 `.next` + 完整性检查 → 原子交换 → 重启 child → 检查 roster/trust/composition/default → 任一步失败恢复 `.bak` 和旧版本 → 成功保存 manifest hash/channel/key id/rollback 来源。`baf:update`、桌面按钮和 CLI 复用 `UpdateService`。

### 11.5 三类更新的统一模型


| 更新 scope   | 更新内容                                           | 推荐分发方式                                                       | 是否重装桌面应用            | 默认策略                      |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------ | ------------------- | ------------------------- |
| `harness`  | dsh 源码、runtime、桌面壳和随壳核心资源                      | 官方签名 installer 或完整 runtime payload；Windows 优先现有 installer 路径 | installer 原地升级；不先卸载 | 后台检查；安全/兼容强制更新，普通更新提示后更新  |
| `baseline` | OpenSpec、Matt 规则/模板、C 工具链描述、版本和阈值              | 版本化 baseline bundle；baseline manager 安装到 managed 目录          | 不需要                 | 默认只检查和下载；安装/切换需确认或管理员策略   |
| `plugin`   | BAF 插件、preset、skills、workflow、system resources | 签名 system payload，原子替换 managed system root                   | 不需要，但需重启 dsh child  | 可后台下载；安全点提示并重启；强制兼容更新不得跳过 |


目录边界：

```text
harness installer/payload  →  Electron 安装目录或 packaged resources
plugin system payload      →  managed system root（只读挂载，不落 user root）
baseline bundle            →  managed baselines/<baselineId>/<version>/（激活指针原子切换）
user preset/plugin         →  ~/.dsh/...（只能作为 user trust）
```

baseline bundle 第一期只含签名的规则、模板、配置、版本约束、适配器配置、校验和来源声明；不含未经企业确认的第三方二进制。若企业决定分发工具二进制：每个工具是单独、签名、带平台/架构和 hash 的 managed tool artifact，独立目录安装，纳入权限、许可证、离线包和回滚测试。baseline 激活前完成 schema、签名、版本、工具探测和兼容检查；session 执行期间不改变已锁定的 baseline。

**推荐混合更新**：

1. harness 用签名 installer 覆盖安装（不先删除桌面应用；失败由 installer/desktop rollback 恢复；仅安装器损坏/目录不可写/企业要求全新安装时给人工修复指引）；
2. plugin 和可热替换 runtime 用 `UpdateService` 的下载、hash、签名、`.next`、`.bak`、原子交换和 child restart（不触碰用户复制品，不写 user root）；
3. 第三方工具链是企业 baseline 受控依赖：先检查版本是否满足，再按策略下载安装，安装后重新探测、校验、生成 baseline lock；项目执行中只允许下载不热替换；
4. 三类更新都先验证 manifest/schema、签名、hash、版本兼容、目标 scope 和降级规则；不越权写入另一类 scope。



### 11.6 版本、兼容性和更新状态

`AppVersions` 迁移为带 schema 的结构：

```ts
type InstalledVersions = {
  schema: 2
  harness: { desktop: string, dsh: string, runtime: string }
  plugin: { baf: string, presetSchema: number }
  baseline: { id: string, version: string, openspec: string, matt: string, stack: string }
}
```

`parseVersions()` 接受旧格式经显式 `migrateVersions()` 转换；不把旧 `bafPlugin` 猜成 baseline/tool 版本；迁移幂等、留备份标记、临时文件 + 原子 rename；`dsh` 版本始终从 packaged/source seed 读取（现有行为保持）；升级失败不以缓存版本冒充运行版本。

版本状态包含：安装版本和来源、target/manifest 版本和 hash、channel/keyId、routeProfile 版本和各 phase route/fallback 状态、每个 scope 状态（`current/available/downloading/ready/applying/restart_required/blocked/failed/rolled_back`）、最后检查/成功更新时间、失败原因和 rollback source、兼容矩阵、是否需管理员/人工确认、事务 id 和待完成 installer handoff。

更新计划按 scope 返回：

```ts
type UpdateScope = 'harness' | 'plugin' | 'baseline'
type UpdateAction = 'none' | 'download' | 'apply' | 'restart' | 'installer'

type ScopedUpdatePlan = {
  scope: UpdateScope
  action: UpdateAction
  currentVersion: string
  targetVersion: string
  required: boolean
  restartRequired: boolean
  reason: string
}
```

更新顺序和事务边界：校验 manifest（失败停在 `blocked`）→ 判断 harness 最低版本/强制安全/兼容范围 → harness installer handoff（记录状态安全退出，新版本恢复重查；installer 失败不删旧安装）→ 重读 source 版本 → plugin/baseline 分别下载到各自 pending 并离线校验 → 安全点应用 plugin（停/重启 child；child/roster/trust/composition 失败仅回滚 plugin）→ baseline 装新目录、探测后原子切 active pointer（失败保留旧）→ 多 scope 操作记录各自事务独立提交（后续失败不误回滚已验证 scope；兼容矩阵要求整体一致则标记 `blocked` 并恢复上一个兼容组合）→ 最后重跑 roster/composition/baseline compatibility/`doctor` 并写版本状态、审计和 rollback 来源。

依赖关系在 manifest 显式表达：`plugin`/`baseline` 不得要求尚未安装的 harness 版本；baseline 工具变更不影响已创建 session 的固定 baseline。

### 11.7 Splash 启动检查

splash 职责从“显示正在检查更新”明确为“启动前非阻塞更新探测 + 必要安全阻断”，决策在 main process，splash 只展示：

1. 读取本地版本、策略和上次检查缓存；
2. 后台请求签名 manifest，短超时可取消；网络失败不阻止普通启动；
3. 达到超时继续普通启动并标记 stale/error，不无限等待；
4. 检查结果按 scope 分开；
5. 普通 plugin/baseline 更新先启动主界面，完成后显示可关闭通知；
6. harness 强制更新/低于最低版本/签名完整性错误/核心不兼容时，在 child 启动前阻断对话框（“立即更新”或“退出/按企业策略修复”）；
7. installer 更新：splash 展示下载/交接状态，启动 installer 后安全退出，不删除自身；
8. plugin 更新：主界面确认后停 child、原子替换、重启 child，失败恢复旧版；
9. baseline 更新默认不在 splash 自动安装；
10. splash 不实现更新逻辑，只调 `UpdateService`。

`promptUpdateAfterReady()` 按 scope 和 `required` 分别处理，不再只看 `plan.force`。

### 11.8 设置中的版本和更新选项

三部分：**版本信息（只读）**：BAF Desktop/harness、dsh/runtime、plugin 和 preset schema、baseline id/version、route profile/phase route/实际 provider/model/fallback、OpenSpec/Matt 版本、C 工具链探测、channel/manifest 时间/最后检查和更新结果。

**用户可配置更新策略（受企业上限约束）**：自动检查（默认开）、检查频率（启动时/每日/手动，默认启动时 + 最长缓存间隔 + 退避）、后台下载（plugin 默认开、baseline 自动安装默认关）、空闲自动应用 plugin（默认关，提示重启）、channel（stable 默认；beta/offline 仅发行配置允许时可见）、企业更新源/代理/离线包（如允许）、route 清单内 session 默认模型选择、fallback 提示级别和手动重试。

**不可关闭策略**：签名校验、hash 和路径校验、system resource trust、最低 harness 版本和强制安全更新、兼容性检查、rollback 和审计、企业 channel/更新源/管理员审批。

按钮“立即检查/查看详情/下载/立即应用重启/查看历史/回滚（若允许）”全部调 `UpdateService`。修改设置只影响未来检查和普通更新。

### 11.9 更新命令

```text
baf update status | check | download [scope] | apply [scope] | rollback [scope]
```

slash 对应 `/baf-update-status` 等；scope 只能取 `harness`/`plugin`/`baseline`；未指定时按依赖顺序生成计划；`apply harness` 需 installer 时输出交接信息并安全退出。

---



## 12. 可落地详细实施计划：每一步怎么做

> **约定**：
>
> - 新包统一放 `packages/baf/<name>/`，命名 `@deepseek-ai/dsh-<name>`（与仓库现有 `packages/<scope>/<name>` 约定一致），每个包含 `src/`、`tests/`（`*.spec.ts`）、`package.json`、`tsconfig.json`、`tsdown.config.ts`（参照 `packages/core/agent-default-model` 结构）。落点争议见 3.9。
> - 每个步骤完成后立即跑该 package 的测试与 lint；每个 Phase 结束跑一次全量相关测试 + `baf doctor` 对应子集。触及 `packages/` 上游门禁时，按变更面跑 focused tests / `test:coverage` 相关包；非平凡变更同 PR 写 Agent Note（overlay 例外见 `overlay/AGENTS.md`，但 **packages/baf 不享受该例外**）。
> - 所有“企业待定值”用 `<enterprise-tbd>` 标记并集中登记在 `overlay/docs/baf/enterprise-inputs.md`，禁止猜测。**缺少企业输入不阻塞 Phase 0–4**；Phase 5+ 用 fixture baseline 跑通，真实阈值/工具在企业输入冻结后替换。
> - 每个 Phase 的验收是下一个 Phase 的准入条件（依赖链：能被发现 → 有骨架 → 通路由 → 有状态 → 走流程 → 走捷径 → 上门禁 → 见用户 → 谈分发 → 发布）。
> - **MVP 裁剪（见 17.4）**：对外可演示的最小完成线是 Phase 0–5 + Phase 7 的 ToolGuard + Phase 8 的 slash/`status`；fast-path、工作流 Tab、三 scope 签名更新可并行但可后置。
> - **工时量级（单人熟悉 dsh，仅供排期）**：Phase 0–1 ≈ 3–5 人日；2–4 ≈ 8–12；5 ≈ 10–15；6 ≈ 3–5；7 ≈ 8–12；8 ≈ 10–15；9 ≈ 10–20；10 ≈ 3–5。合计约 8–12 人周到 MVP，12–20 人周到企业可分发（含签名与打包 hardening）。



### Phase 0：冻结企业输入和公共 contract（不写业务代码）



#### 0.1 建立企业输入登记表

- 新建 `overlay/docs/baf/enterprise-inputs.md`：按第 15 章清单逐项列条目，每项含“字段、消费者、当前值（默认 `unavailable`）、决定人、冻结版本”。
- 新建 `overlay/docs/baf/error-codes.md`：冻结错误码清单（`tool_unavailable`、`openspec_unavailable`、`baseline_unavailable`、`baseline_incompatible`、`policy_missing`、`invalid_transition`、`intake_confirmation_required`、`protected_path`、`secret_detected`、`verify_required`、`system_resource_conflict`、`model_route_unavailable`、`model_route_incompatible`、`model_fallback_blocked`），每个含语义、载荷字段和触发场景。
- 新建 `overlay/docs/baf/compatibility-matrix.md`：dsh/BAF-plugin/baseline 版本兼容矩阵模板和 rollback minimum version 字段。



#### 0.2 冻结 schema 与 fixture

- 新建 `packages/baf/baf-core/schema/baseline.schema.yaml`（第 7.2 结构）与 `routeProfile` JSON Schema；schema 文件先于实现落地，作为 contract 冻结物。
- 新建 `overlay/plugin/standards/baf-baseline-c/baseline.yml` 示例 fixture（所有具体值 `<enterprise-tbd>`），并复制到 `packages/baf/baf-core/tests/fixtures/baseline/` 供单测使用。
- 冻结 projection 落盘决定：`<workspace>/.baf/projection/<changeId>.jsonl`（事件日志，append-only）+ `<workspace>/.baf/projection/index.json`；是否 gitignore 由企业 Git policy 决定，写入 enterprise-inputs。
- 冻结 change id 规则：`change-<yyyymmdd>-<slug>-<4 位随机>`，slug 限 `[a-z0-9-]`、长度 ≤ 32。



#### 0.3 确认 dsh 原生 route 边界

- 只读核查（写进 `overlay/docs/baf/route-notes.md`）：发行配置注入 allowed provider/model 的入口（settings/deployment config）；session override 的存储；child 继承语义；dsh 是否有原生 fallback（结论决定 BAF fallback 层的实现位置）；usage/审计字段。结论标注“复用点/缺口”，缺口进 Phase 3 任务。



#### 0.4 冻结更新模型决定

- 在 enterprise-inputs 中登记：channel 策略、Ed25519 key id 和公钥（用 `overlay/scripts/gen-update-keypair.mjs` 生成测试对，正式 key 由企业出）、rollback 保留窗口、管理员审批范围、`InstalledVersions` schema 2 字段映射。
- 验收：三份文档评审通过；schema 可被 `ajv`/`zod` 解析；fixture 循环校验通过。



### Phase 1：BAF 成为真正可发现的 system preset



#### 1.1 创建 preset 目录与 metadata

- 新建 `packages/preset/agent-presets/presets/baf/preset.yml`：

```yaml
name: BAF 模式
description: 企业级受控编码 Agent：intake 分类 + go 工作流 + OpenSpec + C 质量门禁 + 安全 guard。
order: 2
```



#### 1.2 创建 composition

- 新建 `packages/preset/agent-presets/presets/baf/agent.cordis.yml`：逐行复制 `presets/standard/agent.cordis.yml`，仅做三处修改：
  1. `persona` 行的 `text` 换成 BAF persona（“你是 BAF 企业编码 Agent，遵循 go 工作流：intake 分类 → open → clarify → design → plan → implement → verify → archive。阶段转换由 domain service 决定，你不能自行跳过或宣称完成……”）；
  2. 文件头注释改为 BAF 说明；
  3. 文件末尾追加 BAF domain group（Phase 2 起逐个填实；Phase 1 先留注释占位，避免引用不存在的包导致 broken）：

```yaml
# ── BAF domain（entry-local realm；桌面/CLI 经 session projection 读取状态）──
# Phase 2 起启用：
# - id: baf-domain
#   name: cordis:group
#   group: true
#   isolate:
#     bafCore: true
#   config:
#     - id: baf-core
#       name: '@deepseek-ai/dsh-baf-core'
#     - id: baf-workflow
#       name: '@deepseek-ai/dsh-baf-workflow'
#     - id: baf-openspec
#       name: '@deepseek-ai/dsh-baf-openspec'
#     - id: baf-standard
#       name: '@deepseek-ai/dsh-baf-standard'
#     - id: baf-quality
#       name: '@deepseek-ai/dsh-baf-quality'
#     - id: baf-guard
#       name: '@deepseek-ai/dsh-baf-guard'
#     - id: baf-scaffold
#       name: '@deepseek-ai/dsh-baf-scaffold'
```



#### 1.3 创建最小 skills

- 新建 `packages/preset/agent-presets/presets/baf/skills/baf-go/SKILL.md`（go 工作流总览：引用第 5 章节点定义，声明“阶段转换必须经 domain service”）；
- 新建 `skills/baf-c-guidance/SKILL.md`（C 规范入口，内容引用 baseline，不内嵌具体规则值）；
- 新建 `skills/baf-verification/SKILL.md`（verify 检查集合与报告解读指引）。



#### 1.4 roster 测试

- 新建 `packages/preset/agent-presets/tests/baf-roster.spec.ts`：断言 shipped roster 含 `baf`、`trust === 'system'`、`standard` 仍是 default、`baf` 排序在 standard 后、composition health 通过；
- 检查并更新 `tests/{display,shipped-root,composition-inventory}.spec.ts` 中按 preset 枚举的快照/断言；
- 新增 authoring 用例：**拒绝**复制官方 `baf`、删除 system `baf` 抛 `agent-preset/read-only`、user 目录名 `baf` 不 shadow shipped；roster 对 `baf` 输出 `copyable: false`。



#### 1.5 roster UI

- 更新 `packages/client/ui-agent-preset` 的 fixture/快照：BAF 显示“内置”、standard 显示默认；跑该包 e2e（`apps/web/tests/agent-preset-authoring.e2e.ts`、`apps/cli/tests/web-agent-presets.e2e.ts` 如有枚举断言则更新）。



#### 1.6 打包链路检查

- `overlay/scripts/pack-dsh.mjs` 打包后用真实 roster 复检 `baf` 存在、trust 正确（临时脚本或手工验证步骤写入脚本注释）。
- **验收**：开发模式 roster 可见 BAF 并能挂载真实 session；全部 preset 测试绿；standard 仍是默认。



### Phase 2：`baf-core` 骨架、baseline loader 和 adapter contract



#### 2.1 建包

- 新建 `packages/baf/baf-core/`（`package.json` 名 `@deepseek-ai/dsh-baf-core`，依赖 `zod`、`@deepseek-ai/dsh-agent-presets` 等按需）；同步在 workspace 依赖注册。



#### 2.2 公共类型

- `src/intake.ts`：`ChangeKind`、`WorkflowMode`、`AffectedScope`、`ChangeIntake`（5.3 N0 结构）；
- `src/workflow.ts`：`WORKFLOW_NODES`、`WorkflowNode`、`NodeStatus`、`TerminalState`、`TransitionRule` 与 5.2 转换表常量 `TRANSITIONS`（唯一权威，UI 与 domain 共用）、`WorkflowStatus`（含 change id、mode、当前节点、每节点状态、route 摘要、baseline lock、sourceRevision、projection version）；
- `src/events.ts`：projection 事件联合类型：

```ts
export type ProjectionEvent =
  | { type: 'intake-classified'; intake: ChangeIntake; at: string; seq: number }
  | { type: 'intake-confirmed'; by: 'user' | 'rule'; at: string; seq: number }
  | { type: 'stage-entered'; node: WorkflowNode; at: string; seq: number }
  | { type: 'stage-completed'; node: WorkflowNode; artifacts: string[]; at: string; seq: number }
  | { type: 'stage-failed'; node: WorkflowNode; reason: string; at: string; seq: number }
  | { type: 'drift-detected'; node: WorkflowNode; cause: string; at: string; seq: number }
  | { type: 'mode-upgraded'; from: 'bug-fast-path'; to: 'full-go'; cause: string; at: string; seq: number }
  | { type: 'change-archived'; at: string; seq: number }
  | { type: 'change-abandoned'; at: string; seq: number }
```

- `src/errors.ts`：错误码常量 + `BafError` 类（`code`、`message`、`details`）；
- `src/identity.ts`：workspace identity（root、Git branch/revision 探测接口）、change id 生成（Phase 0 冻结规则）；
- `src/result.ts`：`DomainResult<T>`（`status`、`diagnostics`、`artifacts`、`exitCode`、`startedAt`、`finishedAt`、`baselineVersion`、`sourceEventSeq`）。



#### 2.3 baseline loader

- `src/baseline.ts`：用 zod 实现 Phase 0 schema 的解析与校验；校验项：schema 版本、`bafCompatibility` 与当前 BAF 版本比对、`routeProfile.default` 在 `allowed` 内、每个 phase route 在 `allowed` 内、fallback group 存在且成员在 `allowed` 内、`bugFastPath.maxScope` 合法、openspec/stack/guard 字段完整；失败返回 `baseline_unavailable`/`baseline_incompatible`。
- `tests/baseline.spec.ts`：合法 fixture、缺字段、版本不兼容、route 不在 allowed、fallback group 缺失、fast path 策略非法各一例。



#### 2.4 adapter contract 与 stub

- `src/adapters.ts`：7.3 的四个 interface + `AdapterContext`；提供每个 adapter 的 `unavailable` 实现（全部返回结构化 `tool_unavailable`/`baseline_unavailable`），保证后续 Phase 在无真实工具时也能走通失败路径。



#### 2.5 启用 composition rows

- 打开 `presets/baf/agent.cordis.yml` 中 `baf-core` row（此时其余仍注释）；`mount.spec.ts` 增加 BAF 挂载用例（含 isolate realm 断言：无 root-realm 注册、重复挂载不冲突）。
- **验收**：`packages/baf/baf-core` 测试绿；BAF session 挂载后能注册 `baf-core` 服务；坏 baseline 被结构化拒绝。



### Phase 3：接通 dsh 原生模型路由



#### 3.1 route resolver

- 新建 `packages/baf/baf-workflow/src/route.ts`：

```ts
export interface RouteResolution {
  provider: string
  model: string
  source: 'enterprise' | 'route-profile' | 'phase' | 'session-override' | 'dsh-default'
  phase: WorkflowNode
  fallbackFrom?: { provider: string; model: string; reason: string }
}

// 解析顺序（只收紧不放宽）：
// enterprise policy → routeProfile.phases[phase] → session override（须在 allowed 内）→ dsh default
// 每步检查 allowed-list、capability 标签、上下文长度；失败查 fallbackGroup（approved-only）
export function resolveRoute(
  enterprisePolicy: EnterpriseRoutePolicy, // 发行配置提供，session 创建时冻结，独立于 baseline/profile
  profile: RouteProfile,            // session 创建时冻结
  phase: WorkflowNode,
  sessionOverride: ModelSelection | undefined,
  availability: ProviderAvailability, // 来自 dsh llm.listProviders/resolveModelInfo
): RouteResolution
```

- `tests/route.spec.ts`：覆盖 6.2 的 1–7 条边界（企业策略独立于 profile 且只能收紧、override 不在 allowed 被拒、fallback 不兼容被拒、无 fallback 返回 `model_fallback_blocked` 等）。



#### 3.2 phase route 传递

- **优先路径**：阶段启动 agent turn 时，经 session/agent 请求级 API 设置该 turn 的 `provider`/`model`（与 catalog / default-model 同源），不强制经过 dsh `workflow` 工具。
- **可选路径**：仅当该阶段需要子代理扇出时，把 `resolveRoute()` 结果写入 dsh `agentOptions.provider/model`（复用 `workflow-worker-thread` 转发）；phase metadata 从冻结的 `routeProfile.phases` 生成。
- 无论哪条路径，route 失败都阻断需要模型产物的阶段；不得静默落到企业策略外的默认模型。



#### 3.3 route 审计

- `src/route-audit.ts`：每次解析先向 dsh session log 追加 typed `baf/route-resolved` 事件，载荷为 `RouteAuditEntry { provider, model, source, phase, fallbackFrom, at, sessionId, changeId, failureReason? }`；这是重放模型请求身份和 fallback 原因的权威记录，满足“所有 model-visible 输入可由 session log 重建”。`<workspace>/.baf/audit/route.jsonl` 仅作为可选派生索引，由 session/projection 事件生成，不能成为唯一记录；token usage 归因沿用 dsh token-meter 原生记录，不重复计费。



#### 3.4 route 状态暴露

- `baf-core` 增加 `RouteStatusView`（routeProfile 版本、默认 route、各 phase 首选/实际 route、fallback 状态），供设置页、Tab、`baf status` 读取。
- **验收**：route 失败阻断阶段且错误码稳定；resume 保留 route 语义；换模型不能改变 projection/门禁结果。



### Phase 4：intake 分类器 + workflow projection + 状态查询 + Web 工作流 Tab



#### 4.1 建包与事件存储

- 在已有 `packages/baf/baf-workflow/` 实现 `src/projection.ts`：append-only 事件日志（单 writer queue + workspace/change lock；每次 append 携带 `expectedSeq`，在锁内重读尾部并 compare-and-swap，随后以临时文件 + fsync + atomic rename 提交；多进程不支持可靠文件锁的平台显式拒绝第二 writer，而不是退化为无锁写入）、`replay()` 从事件重建 `WorkflowStatus`、事件 schema 版本迁移、损坏文件诊断（单条损坏 → 停在该 seq 并报 `projection_corrupted`，不静默丢弃）。`index.json` 仅是由 change 日志重建的派生索引，与事件提交同一临界区更新；启动时若 revision/seq 不一致则重建，不能把 index 当权威。
- `tests/projection.spec.ts`：重放一致性、相同 event id 的幂等追加、stale `expectedSeq` 拒绝、同进程并发序列化、双 writer 冲突、事件已提交但 index 更新中断后的重建、损坏检测。



#### 4.2 转换执行器

- `src/transition.ts`：输入 `(current, target, evidence)`，按 `TRANSITIONS` 表和 5.2 条件裁决；表外 → `invalid_transition`；每次放行/拒绝都追加审计事件。



#### 4.3 intake 规则引擎

- `src/intake.ts`：`suggest()` 可用启发式（Phase 4）或模型（后续）产出候选分类；`review()` 用规则引擎复核；`decide()` 合成最终 `ChangeIntake` + `requiresUserConfirmation`；`confirm()` 接收用户确认写事件。
- 规则清单代码化：`cross-module`/`public-api`/数据格式/并发/安全/性能/集成 → 强制 full-go；`single-file`/`small-local` 且 baseline 允许且可写回归测试 → 允许 fast path；证据不足 → `clarify-required`。
- `tests/intake.spec.ts`：新需求、单文件低风险 Bug、跨模块 Bug、公共 API Bug、用户误报、低置信度、baseline 缺失各一例；断言“分类确认前 `implement` 转换被拒”。



#### 4.4 状态查询 service + Web Tab

- `src/workflow-service.ts`：`WorkflowService.intake/status/transition/resume`；`BafWorkflow` 暴露同一实现。
- `src/tab-view.ts` + Typert Remote：按 session `cwd` 组装 `WorkflowTabView`（含 `NODE_CATALOG` 详情与允许动作）。
- `packages/client/ui-baf-workflow/`：会话 Tab「工作流」（仅 BAF preset）；半交互；跟随主题的 SVG 流程图。
- `baf-core`：`NODE_CATALOG`、`WORKFLOW_GRAPH`。
- 暴露选型：**Web Typert Remote（不进 root realm 的 domain 逻辑仍在 isolate；Remote 为读投影/写确认的 Host 面）**；Electron IPC 留 Phase 8。记入 route-notes。
- **验收**：非法转换被拒；事件重放一致；分类未确认时无法进入 implement；BAF session 可见工作流 Tab 且与 projection 一致。



### Phase 5：full-go 全阶段实现



#### 5.1 open（`baf-openspec` 建包）

- 新建 `packages/baf/baf-openspec/`：`OpenSpecAdapter` 实现——`detect()`（探测 CLI 与版本，走受控执行器）、`open()`（创建 change skeleton 目录与初始文档，不覆盖已有）、`read()`、`validate()`、`archive()`（原子：临时目录 → 校验 → rename）。
- `baf-workflow/src/stages/open.ts`：探测 workspace/Git/baseline/OpenSpec；多 active change 强制选择；change id 生成；写 `stage-entered`。
- `tests/openspec.spec.ts`：用本地 OpenSpec CLI fixture（或 stub 执行器）覆盖 validate 成功/失败/不可用。



#### 5.2 clarify

- `src/stages/clarify.ts` + `skills/baf-go` 补 clarify 指引：产出 `openspec/<change>/clarify.md`（问题、决策含确认来源、非目标、验收条件）；完成校验：阻塞问题全部有答案或 `deferred` 标记 + 验收条件存在。



#### 5.3 design

- `src/stages/design.ts`：产出 `design.md`（引用实际文件/API、风险清单）；guard 预检查调 `baf-guard` stub（Phase 7 替换为真实实现）；完成校验：引用路径存在（抽样验证）。



#### 5.4 plan

- `src/stages/plan.ts`：产出 `plan.md` + 结构化 `plan.json`（任务数组：输入/输出/影响文件/验证命令/回滚点）+ `allowlist`（文件集合）+ guard snapshot；完成校验：每个任务有验证命令和影响文件。



#### 5.5 implement

- `src/stages/implement.ts`：按任务驱动 Agent 编辑（模型只产出编辑建议，写入经 dsh filesystem/shell 工具并受 allowlist 检查）；任务状态记录；取消处理；越界写 → blocked + `protected_path`/`scope_exceeded`。
- guard 检查点：每次文件写入前比对 allowlist。



#### 5.6 verify（骨架）

- `src/stages/verify.ts`：`CheckRunner` 聚合框架（注册 checks：openspec-validate 已接、quality/guard/secret 为占位接口）；报告聚合为 `verify-report.json`（含 source revision、baseline、tool versions、route metadata、新鲜度字段）；T11/T12 触发逻辑。



#### 5.7 archive

- `src/stages/archive.ts`：人工确认（复用 dsh 审批/ask-user 机制）→ `OpenSpecAdapter.archive()` 原子归档 → 写 `change-archived`；失败保持 active；幂等重试。



#### 5.8 resume/drift/abandon

- `src/drift.ts`：检测文件删除、branch/revision 变化、baseline 变化、报告过期（verify-report 的 revision ≠ 当前）、composition 变化；`src/abandon.ts`：确认后写 `change-abandoned`，保留产物。
- `tests/stages/*.spec.ts`：每阶段 happy path + 完成校验失败 + 非法进入。
- 打开 composition 中 `baf-openspec` row。
- **验收**：happy path `open → … → archive` 全链路（fixture 仓库）跑通；verify 失败回 implement；drift 标记正确；模型声明不推动转换。



### Phase 6：bug-fast-path 与风险升级

- `src/fastpath.ts`：仅当 projection 中 intake 为 `bug-fix + fast path + 已确认` 时允许 T5；open 阶段创建最小 Bug 记录（问题/根因/影响范围/回归测试占位）；implement 强制先写回归测试；verify 必跑回归测试；图中/报告中标注“未走 OpenSpec：reason codes”。
- `src/escalate.ts`：implement 中检测范围扩大（实际修改文件 ∉ allowlist、或发现公共 API/数据格式影响）→ 自动 T15 升级：写 `mode-upgraded` 事件、生成待补的 clarify/design/plan 阶段、要求补 OpenSpec change；原 identity 和审计保留。
- `tests/fastpath.spec.ts`：低风险 Bug 全链路、范围扩大升级、升级后补阶段、fast path 试图跳回归测试被拒。



### Phase 7：C quality、standard 和 guard 硬门禁



#### 7.1 `baf-quality` 建包

- 新建 `packages/baf/baf-quality/`：`StackAdapter`/`QualityRunner` 实现——从 baseline `stack` 读取编译器/构建/测试/覆盖率/分析器配置；每个 check 独立受控执行（超时、取消、退出码、stdout/stderr 截断脱敏）；产出 `QualityReport`（8.5 结构）。
- verify 的 `CheckRunner` 接入全部 quality checks + 阈值判定。



#### 7.2 `baf-standard` 建包

- 新建 `packages/baf/baf-standard/`：`StandardBaselineProvider` 加载 baseline `standard` 段，输出结构化规则摘要（供 prompt 注入、plan 校验、guard 引用）；不内嵌具体规则值。



#### 7.3 `baf-guard` 建包

- 新建 `packages/baf/baf-guard/`：protected path、workspace escape、path traversal、危险命令清单、secret scan（正则规则来自 baseline）、`invalid_transition`、`verify_required`、system_resource_conflict；通过 BAF agent 的 `agent.ctx` 注册现有 `ctx.tools.guard()` 单调 guard，覆盖所有 mutating filesystem/shell tool，而不只覆盖 stage handler。guard 从 projection 读取 intake 确认、当前阶段、allowlist 和 snapshot：确认前任何源码写入返回 `intake_confirmation_required`，implement 外或越界写入返回稳定策略错误；每次 tool body 前重新判定，listener 顺序不能 force-allow。补 `tests/tool-guard.spec.ts` 覆盖普通自然语言触发的工具调用、slash/CLI/Tab 旁路尝试、shell 间接写入、scope 隔离和 disposer/HMR 清理。
- 打开 composition 中 `baf-quality`/`baf-standard`/`baf-guard` rows。



#### 7.4 `baf-scaffold` 建包

- 新建 `packages/baf/baf-scaffold/`：`init` 命令实现（OpenSpec 目录、C 构建测试骨架、baseline 引用；不覆盖已有文件，覆盖需确认 + 备份）；打开对应 composition row。
- **验收**：verify 报告结构化且区分失败原因；任一门禁失败阻断 archive；guard 测试全绿。



### Phase 8：统一交互面——slash、CLI、desktop bridge 和工作流 Tab



#### 8.1 slash commands

- 新建 `packages/baf/baf-workflow/src/commands.ts`：用 `CommandRuntime.register()` 注册第 9.2 全部命令（`/baf-help`、`/baf-status`、`/baf-doctor`、`/baf-version`、`/baf-open`、`/baf-classify`、`/baf-clarify`、`/baf-design`、`/baf-plan`、`/baf-implement`、`/baf-verify`、`/baf-archive`、`/baf-abandon`、`/baf-quality`、`/baf-guard`、`/baf-update-*`）；每个 handler 只调 `WorkflowService`/`UpdateService`，统一错误码转 `CommandResult`。



#### 8.2 standalone CLI

- 按 9.1：新建 `baf-cli` profile（或 patch）+ 可选 thin wrapper；Commander tree，`parseCmdline(ctx, program)` 接入；命令表同 9.2；输出格式与 slash 一致（同一 formatters 模块）。
- 验收：`verify-application-entrypoints` 不因新增 Node 应用 bin 失败。



#### 8.3 desktop bridge

- `overlay/desktop/src/preload-desktop.ts` 增加 IPC：`baf:getWorkflowStatus`、`baf:confirmIntake`、`baf:getRouteStatus`、`baf:getUpdateState`；main process 转发到 domain service（经 api controller/projection），UI 不直接碰文件。



#### 8.4 工作流 Tab（Electron 补齐；Web 已在 Phase 4）

- Web Tab（`packages/client/ui-baf-workflow/`）与 Typert Remote 已在 Phase 4 落地；本步仅补 8.3 Electron IPC 到同一 `WorkflowTabView` / domain service，并做四入口一致性快照。
- 组件分层已存在：`WorkflowGraph`、`IntakeCard`、`NodeDetail`、`StatusStrip`、空态/阻断态；补 desktop 桥接测试与断线重连用例。



#### 8.5 一致性测试

- `tests/surface-parity.spec.ts`：同一 projection 状态下 slash/CLI/desktop/Tab 的 status 输出快照一致。
- **验收**：四入口同状态；Tab 无法触发转换表外操作。



#### 8.6 变更 Dashboard（归档总览；本 Phase 交付）

> 开发方案正文在此；**不进**用户帮助 site（`overlay/docs/help` / `overlay/site`）。

**目标**：在同一工作区列出全部变更（含 archived / abandoned），支持筛选、聚焦与只读导出；UI 不直接读写 projection 文件。

**先行（Phase 4 已落地）**：工作流 Tab 顶栏「变更总览」按钮 → 模态列出 `WorkflowTabView.changes`（无筛选/导出）。完整能力仍属本 Phase。

| 项 | 说明 |
| --- | --- |
| 入口 | 工作流 Tab 明确按钮（已有）；可选后续加 `/baf-changes` |
| 数据 | Typert Remote 读 projection index + 各 change 摘要；禁止 Browser 直读 `.baf/` |
| 列表列 | changeId、mode、current、updatedAt、archive 标记 |
| 筛选 | active / archived / abandoned；按 mode |
| 操作 | 聚焦到图（set focus）；只读打开产物路径提示；禁止未授权 transition |
| 导出 | JSON/CSV 摘要（可选，非 MVP 阻断） |
| 空态 | 引导「新建变更」/ intake |
| 验收 | 多变更夹杂 archived 时列表正确；聚焦切换后顶栏与图一致；与 `/baf-status` 焦点一致 |

落点建议：`packages/client/ui-baf-workflow/` 面板升级 + `baf-workflow` Remote `listChanges`（若现有 `getTabView` 不足）；desktop IPC 复用 8.3。



### Phase 9：桌面打包、三 scope 更新、签名和回滚



#### 9.1 版本 schema 迁移

- `overlay/desktop/src/versions.ts`：实现 `InstalledVersions`（schema 2）+ `migrateVersions()`（旧三字段 → 新结构；旧 `bafPlugin` 只映射到 `plugin.baf`，baseline 字段置 `unknown`）；写入用临时文件 + rename；`dsh` 永远取 seed（保持现有行为）；`tests/versions-migrate.spec.ts`：旧格式、幂等、损坏文件。



#### 9.2 manifest schema 2

- `overlay/desktop/src/update/manifest.ts`：parser 扩展（11.2 字段、signed `issuedAt`/`expiresAt`/`releaseEpoch`、signature 块、systemResources、rollback）；缺字段/坏类型拒绝；定义可信时钟、允许 clock skew、时钟回拨与离线包例外策略。



#### 9.3 签名链

- `overlay/scripts/generate-manifest.mjs`：canonical JSON + artifact SHA-256 + 逐文件 hash + Ed25519 签名（`manifest.sig`）；`public-key.ts` 换正式 key/keyId（测试 key 标注不进生产）；生产强制校验，开发跳过须显式 env。
- `tests/manifest-sign.spec.ts`：缺签名、错 key、篡改、过期、降级各拒。



#### 9.4 scoped plan

- `overlay/desktop/src/update/plan.ts`：`buildUpdatePlan()` 返回 `ScopedUpdatePlan[]`（11.6 结构）；`service.ts` 按 11.6 顺序协调；`apply.ts` 拆 per-scope apply/rollback（plugin：pending→`.next`→原子交换→child restart→roster/trust/composition 复检→失败仅回滚 plugin；baseline：装 `managed baselines/<id>/<v>/` → 探测 → 原子切 active pointer；harness：installer handoff，记录状态安全退出）。
- `tests/apply-scoped.spec.ts`：多 scope 事务、单 scope 失败不误回滚他 scope、installer handoff 状态。



#### 9.5 splash 与设置

- `overlay/desktop/src/main.ts`：splash 按 11.7 十条实现（按 scope 展示、超时放行、强制阻断、installer 交接）；`promptUpdateAfterReady()` 改按 scope+required。
- 设置页三区（11.8）：只读版本区、策略区（受企业上限）、操作区；新增 route/baseline 状态展示。



#### 9.6 命令接入

- `baf update status|check|download|apply|rollback` 与 `/baf-update-*` 接 `UpdateService`。



#### 9.7 打包与分发

- `pack-plugin.mjs`：plugin zip manifest 增加 schema、payload scope、逐文件 hash、preset schema、BAF version、systemResources 声明；system/user payload 目标分离；zip 路径校验（拒 `..`/绝对路径/symlink 逃逸）。
- `pack-dsh.mjs`/`build-release.mjs`：canonical BAF 进 shipped root；打包后 roster 复检脚本化。
- **验收**：11.6 全部事务边界测试绿；离线/超时/强制更新/installer 退出/plugin 回滚各有确定行为。



### Phase 10：发布门禁和后续扩展

- `.github/workflows/baf-dsh-release.yml` 增加门禁：BAF 存在、system trust、standard default、composition health、plugin/preset/runtime/baseline 版本一致、manifest schema、hash 和签名、打包后真实启动、rollback smoke test、artifact completeness。
- 后续按 provider contract 开发 `baf-integrate`（GitLab/Jira/远程 Git）、`baf-stack`（Python）、`baf-knowledge`、`baf-observe`，不改变 core workflow contract。

---



## 13. 文件实施清单



### 新增

- `packages/preset/agent-presets/presets/baf/{preset.yml,agent.cordis.yml,skills/**}`；
- `packages/baf/baf-core/`、`packages/baf/baf-workflow/`、`packages/baf/baf-openspec/`、`packages/baf/baf-standard/`、`packages/baf/baf-quality/`、`packages/baf/baf-guard/`、`packages/baf/baf-scaffold/`（各含 `src/`、`tests/`）；
- `packages/client/ui-baf-workflow/`（工作流 Tab）；
- `overlay/docs/baf/{enterprise-inputs,error-codes,compatibility-matrix,route-notes}.md`；
- `overlay/plugin/standards/baf-baseline-c/`（baseline fixture）；
- baseline/workflow/quality/guard/manifest/signature 各类 fixture 与 spec。



### 修改

- `packages/preset/agent-presets/tests/{display,shipped-root,composition-inventory,authoring}.spec.ts`（BAF roster 断言）+ 新增 `tests/baf-roster.spec.ts`；
- `packages/client/ui-agent-preset` 快照与 e2e（`apps/web/tests/agent-preset-authoring.e2e.ts`、`apps/cli/tests/web-agent-presets.e2e.ts`）；
- `overlay/desktop/src/versions.ts`（schema 2 迁移）；
- `overlay/desktop/src/update/{manifest,github,public-key,plan,apply,service}.ts`（schema 2、签名、scoped plan/apply）；
- `overlay/desktop/src/{main.ts,preload-desktop.ts}`（splash、IPC）；
- `overlay/scripts/{pack-plugin,pack-dsh,generate-manifest,build-release}.mjs`；
- `overlay/plugin/README.md`；
- `.github/workflows/baf-dsh-release.yml`。

---



## 14. 测试和验收标准



### 14.1 Preset 和信任

shipped roster 有 BAF 且 `trust === system`、`copyable === false`；standard 仍是 default；BAF 可选、**不可复制**、不可删除；桌面不同步官方 preset 到 user root；user 同名不 shadow；broken system BAF 不隐藏；session 创建后 composition 固定、child 继承。

### 14.2 Workflow 和分类

intake 区分新需求、低风险 Bug、高风险 Bug、维护、未知；新需求默认 full-go + OpenSpec；fast path 仅在 baseline 允许且满足范围/风险条件；fast path 保留 identity、根因、回归测试、implement、verify、quality、guard；高风险/不确定/范围扩大 → full-go；分类、确认、裁剪理由、升级可审计可 resume；分类确认前不能写源码；用户不能强关企业要求的 OpenSpec；5.2 表内转换按条件放行、表外全部 `invalid_transition`；三条回环（T11/T12+T13/T15）正确；各阶段产物和前置条件正确；多 change 不自动猜测；projection 可重建；文件删除/分支变化/baseline 变化/报告过期 → drift；resume 从最后一致阶段恢复；archive 仅 verify 通过 + 人工确认；archive 失败可重试无半归档；abandon 保留审计。

### 14.3 工作流 Tab

流程图正确显示分类、当前、已完成、未开始、失败、阻断、drift、受控裁剪；fast path 标注“未走 OpenSpec” + reason codes；升级后追加缺失阶段不清除已完成；四入口同 projection；刷新/重连/旧事件正确；分类卡只有“确认/补充/退出”；键盘导航和非色彩状态表达可验收。

### 14.4 Provider 和 C quality

baseline 缺失/格式错误/版本不兼容阻断；OpenSpec validate 成功/失败/不可用可区分；C 编译/测试/覆盖率/静态分析/格式结果结构化；覆盖率不足、报告缺失、超时、取消、并发隔离有测试；phase route 正确传递、child 继承、显式 override 校验；provider 不可用/批准 fallback/被阻断有确定错误；resume 保留 route；token meter 按实际 route 归因；日志有诊断无 secret。

### 14.5 Guard

protected path、workspace escape、路径穿越、危险命令、强制 Git、secret、未 verify archive、表外转换全拒；每次拒绝有稳定 reason code；普通用户无关闭 guard 或降阈值入口。

### 14.6 Command/UI/desktop

slash、CLI、desktop、Tab 同输入同状态；`baf status/doctor/version/classify/update` 输出稳定；launcher flags 不被 BAF 污染；打包后真实应用能发现挂载 BAF；UI 将官方 BAF 标为内置且禁用复制。

### 14.7 Update/release

三 scope 目录/平台边界不混淆；baseline 默认无未审批二进制（如有则逐工具签名/许可证/平台/hash 可验证）；`AppVersions` 迁移幂等不伪造版本、dsh 版本以 seed 为准；manifest canonical/hash/Ed25519 正确；缺签名、错 key、篡改、过期、降级、不兼容均拒；system/user 目标不互换；installer 覆盖升级不先卸载、handoff/失败恢复可验证；离线/超时不阻塞启动、强制更新 child 前阻断；plugin 独立下载/原子应用/重启/回滚；baseline 独立安装/探测/激活/回滚；多 scope 事务边界正确；child 启动失败/composition broken/roster 缺失完整回滚；release 在缺 BAF、错 trust、错 default、未签名、artifact 不完整时失败；clean build、开发运行、打包运行、升级回滚 fixture 全过。

---



## 15. 企业必须提供的输入

必须由企业在 Phase 0 提供（缺失时系统显示 unavailable 或 policy missing，不得使用 Ceedling、gcc、gcovr、cpplint、cppcheck 等旧默认值）：

1. OpenSpec 的确切版本、安装方式、CLI 和模板；
2. Matt Pocock 规则的企业正式来源；
3. C 编译器、构建系统、测试框架、覆盖率和静态分析工具；
4. 覆盖率、复杂度和其他质量阈值；
5. protected paths、secret scan 规则和 Git policy；
6. bug-fast-path 许可策略：允许的影响范围上限、回归测试要求；
7. baseline manifest 的发布和兼容策略；
8. stable/beta/offline channel 策略；
9. 正式 Ed25519 公钥、key id、轮换和吊销策略；
10. 管理员权限、更新审批和回滚权限；
11. 企业是否允许普通用户看到完整 composition、创造模式和调试信息；
12. allowed provider/model 清单、能力标签、fallback group 和 route policy 版本。

---



## 16. 完成定义

同时满足以下条件才算企业可分发版本：

- 官方 BAF 位于 shipped/managed system root，`trust: system`，**仅内置、不可复制、不可由用户修改**；
- standard 仍是默认 preset；
- 桌面不把官方 BAF 同步到 `~/.dsh/.agent-presets`；
- intake 分类、full-go、bug-fast-path、风险升级、转换表、resume、drift 全部按第 5 章可验证；
- 工作流 Tab 流程图与 domain 状态一致，四个交互面共享同一 projection；
- OpenSpec、企业 baseline、C quality 和 guard 通过统一 adapter 工作；
- 官方资源无法被 user payload shadow 或覆盖；
- update manifest、hash、Ed25519 签名、兼容检查、降级保护和 rollback 可证明；
- clean build、真实打包启动、UI/CLI e2e、更新/回滚测试全部通过；
- 本文档已完全脱离 Comet、Superpowers、vibe、Claude Code marketplace 和 hooks 主架构。

任何只把文件复制到 `~/.dsh/.agent-presets`、只加 prompt、只实现 CLI、或只实现可下载 zip 而没有 system trust、真实 packaged roster、签名和 rollback 的方案，都不算完成。

---



## 17. 评审结论：遗漏、风险、可落地性与逐步实现门禁

> 本章回答：需求是否理解完整、文档有无漏洞、计划能否按步落地、第一期如何裁剪。**结论先行：能落地；按 Phase 顺序可一步步做出基于 dsh 的公司级自定义 Agent；但必须先纠正三处硬错误，并用 MVP 裁剪控制爆炸半径。**



### 17.1 需求理解核对

你要的产品能力可压缩为六句话（与第 1 章对齐）：

1. 同事打开桌面应用就能选「BAF 模式」，能力边界由官方 preset 锁定；
2. 任何变更先经 intake 分类：新需求走完整 go，低风险 Bug 走受控快路径，不能口头跳过；
3. 阶段状态、OpenSpec 产物、质量/安全报告可追溯、可 resume，模型不能伪造完成；
4. C 工具链与企业规则来自可版本化 baseline，不写死在七个插件里；
5. slash / CLI / 桌面 / 工作流 Tab 共读同一 projection；
6. 官方资源随桌面签名升级回滚，用户目录不能 shadow 官方。

文档主线覆盖了上述需求；下列缺口是「写全了方向但实现前必须补 contract」的项，不是方向错误。

### 17.2 遗漏与必须补充（已部分回填正文）


| #   | 缺口                                               | 影响                                     | 处置                                                                  |
| --- | ------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------- |
| G1  | **dsh** `workflow` **工具与 BAF go 状态机混称**          | 实现者会误用 model-authored 脚本驱动阶段           | 已补 2.3；代码命名强制区分                                                     |
| G2  | **独立** `baf` **Node bin 违规**                     | 会被 `verify-application-entrypoints` 拒绝 | 已补 9.1 / Phase 8.2：profile + thin wrapper                           |
| G3  | **现状 plugin → user root**                        | 与 system trust / 完成定义矛盾                | 已补 3.9；Phase 1/9 关闭；改 overlay 文档与同步逻辑                               |
| G4  | **自然语言如何推进阶段**                                   | 只有状态机没有驱动面                             | 已补 5.6：命令 + `baf_stage_`* 工具                                        |
| G5  | **session log vs** `.baf/projection` **权威**      | 双写漂移、resume 不一致                        | 已补 5.7                                                              |
| G6  | **MCP / 子代理 / ralph 旁路 ToolGuard**               | 硬门禁被绕过                                 | 已补 8.6 旁路面；Phase 7 测试清单                                             |
| G7  | **包落点 packages vs overlay**                      | 与二次开发策略冲突、上游合并难                        | 已补 3.9 决策表                                                          |
| G8  | **公开仓默认不验签**                                     | Phase 9 假设生产强制签名                       | Phase 0 登记：企业通道开启 `signatureVerificationEnabled`；公开演示仓可保留跳过但企业发行禁止  |
| G9  | **Windows 投影锁与 fsync**                           | 多进程/杀进程半写                              | Phase 4 显式测：atomic rename、损坏检测、第二 writer 拒绝；不依赖 POSIX flock         |
| G10 | **阶段 route 不经 dsh workflow 时如何传 provider/model** | 文档过度绑定 `agent()` options               | Phase 3：优先 session/agent 请求级 API；仅子代理扇出时复用 workflow `agent()`       |
| G11 | **UI i18n / slots**                              | Tab 文案硬编码会被 `verify-client-ui-i18n` 拒绝 | Phase 8 按 `ui-baf-desktop` 模式注册 locale                              |
| G12 | **conversation 内阶段提示**                           | 仅 Tab 时用户在聊天里看不见当前阶段                   | Phase 8 可选：conversation header/status strip 只读投影；第一期可后置             |
| G13 | **plan mode / todo 与 BAF plan 阶段关系**             | 两套「计划」概念冲突                             | 冻结：BAF `plan` 阶段产物权威；dsh plan mode 在 BAF session 默认关闭或只读提示，不双写      |
| G14 | **OpenSpec CLI 分发**                              | baseline 不含二进制时 verify 不可用             | Phase 0 企业输入：安装方式；fixture 用 stub 执行器；真实环境 `openspec_unavailable` 阻断 |
| G15 | **多 change / 多 workspace**                       | 文档有选择逻辑但缺并发矩阵                          | Phase 4 验收：同 workspace 多 change 强制选择；跨 workspace 状态不串               |
| G16 | **企业输入阻塞感过强**                                    | 误以为 Phase 0 齐才能开工                      | 已补第 12 章：0–4 不阻塞；5+ 用 fixture                                       |




### 17.3 风险登记（按严重度）


| 风险                             | 等级  | 为何危险                          | 缓解                                              |
| ------------------------------ | --- | ----------------------------- | ----------------------------------------------- |
| R1 用 prompt/skill 冒充门禁         | 高   | Agent 一句话跳过 OpenSpec/verify   | ToolGuard + `WorkflowService` 表驱动；测试「模型声称完成」不推进 |
| R2 官方资源落在 user root            | 高   | 用户可改/删/shadow；升级污染用户副本        | managed system root；shipped-root-first 测试       |
| R3 把 BAF go 做成 dsh workflow 脚本 | 高   | 状态不可审计、可被模型改写                 | 2.3 红线；code review checklist                    |
| R4 更新验签未开就宣称企业可分发              | 高   | 供应链攻击面                        | 完成定义绑定强制验签；公开仓演示与企业发行通道分离                       |
| R5 C 工具链环境差异                   | 中   | CI 绿、同事机红                     | `tool_unavailable` 结构化；doctor；不伪造通过             |
| R6 projection 损坏/半写            | 中   | 无法 resume 或谎报阶段               | append-only + CAS + 损坏停在 seq；archive 原子         |
| R7 上游 dsh 合入冲突                 | 中   | `packages/baf` 与 preset 改动难回灌 | 3.9；尽量少改 host 热文件；preset 新增优于改 standard         |
| R8 一期范围过大（Tab+三 scope+全质量）     | 中   | 半年无可用产品                       | 17.4 MVP 裁剪                                     |
| R9 intake 规则误杀/漏放              | 中   | 小 Bug 过重或大改走快路径               | 用户确认卡；reason codes；升级 T15；规则可测                  |
| R10 企业输入长期 `unavailable`       | 低   | 永远停在 fixture                  | 产品可演示；企业发行 checklist 单独门禁                       |




### 17.4 能否落地 / 计划是否够细 / 如何一步步做

**能否落地：能。** 复用面已在仓库核实：

- preset shipped root + `trust: system` + copy-only authoring（`agent-presets`）；
- `ctx.tools.guard()` 单调门禁（`dsh-tools`）；
- commands registry、session projection、desktop UpdateService 骨架、phase `provider`/`model` 转发。

缺的是 BAF domain 与「user root → system root」迁移，不是重写 dsh。

**计划是否够细：主链够细，可按 Phase 执行；** 第 12 章已到文件级。仍须在每个 Phase 开工前写该 Phase 的短任务单（接口签名、fixture 路径、测试名），避免 1300 行设计文档直接当 sprint backlog。

**推荐逐步实现顺序（严格门禁）**：

```text
Phase 0  contract/fixture
   ↓
Phase 1  roster 可见 BAF（system trust）     ← 第一个可演示里程碑
   ↓
Phase 2  baf-core + baseline loader
   ↓
Phase 3  route resolver（可先 stub availability）
   ↓
Phase 4  intake + projection + transition        ← 第二个里程碑：状态机可测
   ↓
Phase 5  full-go 主链（OpenSpec stub 可先）   ← 第三个里程碑：端到端 go
   ↓
Phase 7' ToolGuard（可从 Phase 5 并行插入）  ← 硬门禁；无此不算 Agent
   ↓
Phase 8' slash + status（Tab 可后置）         ← 第四个里程碑：MVP 可用
   ↓
Phase 6  fast-path
Phase 7  完整 C quality
Phase 8  Tab + CLI profile + desktop bridge
Phase 9  system root 迁移 + 签名三 scope
Phase 10 release 门禁
```

**MVP（对内可用）完成线**：Phase 0–5 + ToolGuard + slash/`status`/`doctor`；官方 BAF 已是 system trust；full-go 在 fixture 仓库跑通；非法转换与分类前写码均被拒。

**企业可分发完成线**：MVP + Phase 6–10 + 第 15 章企业输入齐 + 第 16 章全部勾选。

### 17.5 第一期明确仍不做（防范围漂移）

与 1.4 一致，并追加：

- 不做拖拽自定义编排、不做任意流程图编辑器；
- 不把 BAF go 编译成 dsh workflow 脚本；
- 不接 GitLab/Jira/知识库/Python（provider contract 预留即可）；
- 不自动 push / 强制 reset；
- 不在公开演示通道关闭验签的同时声称「企业供应链安全已完成」；
- 不把 `overlay/plugin` 同步到 user presets 当作临时「也行」长期留下。



### 17.6 给实现负责人的开工检查单

开始写代码前只确认这 8 项：

1. Phase 0 四份文档目录已建，`<enterprise-tbd>` 可暂时 unavailable；
2. 已理解 2.3：不会用 `tool-workflow` 实现 go；
3. 已理解 3.9：关闭 user-root 官方安装路径；
4. 已理解 9.1：`baf` CLI 走 dsh profile；
5. 已理解 5.6：阶段推进只有命令/阶段工具；
6. 第一个 PR 只做 Phase 1（preset + roster 测试），不夹带更新/UI；
7. 每个 Phase PR 带该 Phase 验收用例；
8. 企业发行前对照第 15–16 章，而不是对照「演示过一次」。

---



## Dev Note（非权威）

评审工作笔记 — 点击展开

对照基准日核过的仓库事实：`workflow-worker-thread` 的 `SUPPORTED_AGENT_OPTIONS` 含 `provider`/`model`；`ctx.tools.guard` 在 `tools/pre-execute` 之后单调拒绝；`overlay/desktop` 的 `signatureVerificationEnabled` 公开仓默认关；`overlay/plugin` README 仍写同步到 `~/.dsh/.agent-presets`；`ui-baf-desktop` 尚无工作流 Tab。若上游行为变化，以代码为准并回改本章表项。
