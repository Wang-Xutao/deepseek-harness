# 2026-10-19 六问题批 — 产物文件名/当前路由静默/路由标题 + 项目工程重构（状态脚本引擎）+ 确认门入图 + 企业规范去头

> 范围：会话工作流图 tab、设置→多模型路由、设置→工作流三 tab（项目工程 / 确认门 / 企业规范）。
> 本批含一处**引擎级新能力**：工作流状态节点自定义脚本（进入/退出状态两个接口，退出实现状态的编译脚本列表全过才放行）。
> 验证路径：**web 端（CDP 探针）+ 桌面 exe --dir 双端**；产物 `overlay/desktop/dist/win-unpacked/baf-dsh.exe`（0.0.25 面，未打安装包）。

## 问题 → 方案总表

| # | 问题 | 方案 | 涉及包 |
|---|------|------|--------|
| 1 | 工作流图状态卡片产物路径显示完整路径 | `artifactName()`（`[\\/]` 切分取末段，回退原串）用于 dashboard 产物行与命令卡产物行两处渲染点 | ui-baf-workflow |
| 2 | 未用 auto 自动路由时仍显示「当前路由 …自动路由未接管…」 | RouteStatusRow 双门：`state!=='routed'` 或（审计为空 且 `sessionModel?.auto!==true`）→ **整行不渲染**（含标签）；auto 在位才出 `route.noneAuto` 空态 | ui-baf-workflow |
| 3 | 多模型路由页标题样式与其他设置页不一致 | 标题回归设置壳共享 H2（`lmGZYq_title`），页内分级微调 | ui-settings-baf-route |
| 4.1a | 项目工程 tab：删说明；路径=当前会话工作区；配置文件=同工作区；无配置文件才报错+按键生成（等同 baf 指令）；两行只读、点击即开、无复制/打开按钮；风格对齐轨迹图 | summary 投影带 `cwd`/`baselinePath`（no-baseline 也带）；`ConfigPathRow`（span 标签 + **按钮本体即路径**，title=绝对路径；项目路径 reveal / 配置文件默认程序打开）；no-baseline 分支 = 错误行 + `generateBaseline` Remote（跑 scaffold，no-destroy 备份语义）；ready 分支删 panel head、基线卡不再含路径 | ui-settings-baf-standard / baf-scaffold |
| 4.1b | 每个状态卡片增加自定义脚本增删改（进入/退出两接口，退出实现状态脚本全过才允许退出） | **NodeHooksCard**：主流链 8 节点纵向图（drift 刻意不列——引擎在漂移停车场不放炮），每节点 enter/exit 两列增删改；草稿本地编辑、一次保存全量落盘。引擎侧见下节 | baf-core / baf-workflow / baf-standard / ui-settings-baf-standard |
| 4.2 | 「工作流确认门」→「确认门」；详略 switch 与工作流图一致命名「详略」；一次性确认门融入工作流图（状态间门节点，如「工作区需要初始化」在接单后分类前）；「一次性」标签在门卡右上角；卡片化、全图完整显示无自身滚动条；删「开关与阈值在配置文件」 | GatesOverviewRow 重写为纵向卡片流：状态节点（含阶段门）与门节点交错（scaffold/new-workspace/active-conflict/bind-workspace 四个一次性引导门 + intake-classify + 各阶段 advance 门 + 分支：完成/漂移/放弃）；一次性门卡右上角 `一次性` 徽标；共享 Switch 原语双端标签「详略」；容器不设自身滚动 | ui-baf-workflow |
| 4.3 | 企业规范 tab 删面板说明 | `suppressNoBaseline` 传导：无头无横幅，8 域结构常显（沿用 2026-10-13 决策） | ui-settings-baf-standard |
| fix | （本批验证中发现）项目路径在切换会话/工作区后不刷新 | 控制器只在插件激活时拉一次 summary → 每次面板挂载 `refreshIfClean()` 重读（脏草稿自门禁）；`applySummary` 折叠时**只重播仍干净的草稿**——往返期间打入的编辑按旧投影判脏而存活 | ui-settings-baf-standard |

### 状态脚本引擎（4.1b 的「能不能、放哪」答案）

| 层 | 机制 | 文件 |
|----|------|------|
| schema | `baseline.yml` 新增 `hooks.nodes.<node>.enter/exit`（脚本相对路径列表）；zod 用 **`z.partialRecord`**（`z.record` 对 enum 键是穷举语义，稀疏映射必炸） | baf-core/baseline.ts + baseline.schema.yaml |
| 计划 | `planNodeHooks`：仅**前进主流链**边触发 —— `exit(from)+enter(to)`；漂移边（含 parking）不挂；漂移恢复出沿挂 `enter(to)` | baf-workflow/node-hooks.ts |
| 执行 | `runNodeHooks`：顺序执行、**fail-closed**（任一非零即拒）、`redactSecrets`+600 字符截断入审计 | baf-workflow/node-hooks.ts |
| 执法 | `enterStage` 阶段切换前跑计划钩子：失败 → `transition-rejected` 审计 + `BafError('node_hook_failed')`，**先于** `stage-entered`（未进门不落脚印） | baf-workflow/stages/pipeline.ts |
| 设置面 | `saveNodeHooks` Remote：外科手术式改写 `hooks:` 块（注释保留、无块则追加、空映射删块）；校验=脚本相对路径+已知节点 | ui-settings-baf-standard/index.ts（复用 baseline-edit 手法） |

语义示例（客户原始诉求）：`hooks.nodes.implement.exit: [scripts/build.sh, scripts/lint.ps1]` —— 退出实现状态前逐个跑，全过才放行去验证。

## 【变更】明细

### baf-core
- `baseline.ts`：schema 加 `hooks.nodes` partialRecord；manifest 解析携带 hooks；`node_hook_failed` 错误码语义见 errors.ts。
- `schema/baseline.schema.yaml`：hooks 段落文档化。

### baf-workflow
- `node-hooks.ts`（新）：`planNodeHooks` / `runNodeHooks`（上表计划/执行两层）。
- `stages/pipeline.ts`：`enterStage` 执法点（上表）。
- 既有门禁总览行重写为卡片流（4.2）：`GatesOverviewRow.tsx` + `.module.css` + locales（`tabs.gates` 改名「确认门」实际在 tracegraph，见下）。

### baf-standard / baf-scaffold
- `generateBaseline` Remote 落在 ui-settings-baf-standard，实现委托 `scaffoldWorkspace({workspaceRoot, humanConfirmed: true})`：已有相异文件改名 `<path>.baf-backup-<ISO>` 再写模板（no-destroy）；`.git` 在位走「已存在 Git 仓库，未改动」锚定快径。

### ui-settings-baf-standard
- `index.ts`：Remotes 新增 `saveNodeHooks(hooks)` / `generateBaseline()`（typert 契约：全必填/零参，边界类型走本包 `./types` 子路径 `BafStandardNodeHooks`）。
- `types.ts`：`BafStandardNodeHooks` / `BafStandardNodeHookLists`；summary 结果携带 `nodeHooks`。
- `StandardsOverview.tsx`：项目工程重排（路径两行置顶两态常显、no-baseline 生成行、ready 网格、删 panel head）；企业规范 `suppressNoBaseline`；**mount refresh**（`usePanelState` 里 `useEffect → refreshIfClean`，本批 fix）。
- `NodeHooksCard.tsx`（新）：8 节点图 + 双列编辑；删除最后一条时**丢键不留学生空数组**（对归一化持久投影的幻影脏态），计算键解构免 `delete`（no-dynamic-delete）。
- `standards-store.ts`：hooksDraft/hooksSaving/hooksNotice/generating/generateNotice 状态 + `refreshIfClean` + 折叠期脏草稿保留（见 fix 行）。
- `locales.ts`：节点名（接单/建立变更/澄清/设计/计划/实现/验证/归档）、进入状态/退出状态、生成配置文件等键。

### ui-baf-workflow
- `WorkflowView.tsx`：`artifactName()` 两渲染点（问题 1）。
- `RouteStatusRow.tsx`：双门静默（问题 2）。
- `GatesOverviewRow.tsx/.module.css/locales.ts`：卡片流 + 一次性徽标 + 详略（4.2）。

### ui-baf-tracegraph
- `locales.ts`：`tabs.gates` →「确认门」（tab 名归位；本包拥有设置页 tab 集）。

### ui-settings-baf-route
- `ModelRoutingRow.module.css`：标题层级对齐设置壳（问题 3）。

## 验证（as-built）

- **单测**：baf 引擎 652/652（baf-integration 项目：core/guard/quality/scaffold/workflow）；客户端 108+45/45+23/23（thread-safe 项目：ui-baf-workflow、ui-settings-baf-standard 两套、gates-overview 7/7、route-status 10/10）；tsc 双面零错；staged oxlint 零告警。
- **web 端（headless Edge CDP :9200 → host :3180）**：项目工程 = 路径行 `D:\...\demo-protect` 单按钮、8 节点 hooks 图、无头、基线卡无路径、无生成行（有基线）；确认门 = `baf-gates-flow` 纵向序（intake→scaffold 门→…→branch→drift/abandoned）、4 个 `once-badge`、`详略` 在位、无「开关与阈值」、无自身滚动；企业规范 = 无 `baf-standard-empty`；多模型路由 = H2 `lmGZYq_title`。问题 1/2 为组件级（RouteStatusRow 静默双门有直测；artifactName 三行纯函数读码确认——dev 家底会话全空，工作流图 tab 无法现场挂载）。
- **桌面 exe --dir（CDP :9200）**：splash `version=0.0.25`；四 tab 名（确认门改名生效）；确认门 16 节点 + 4 徽标 + 详略；无基线分支（home 工作区）= 错误行 + 生成按钮；**切换工作区 demo-protect→demo1 后重开设置，路径行跟随到 `D:\Source\baf-codingplugin\demo\demo1` 且 8 节点图就位**（mount-refresh fix 的端到端证明）。
- 打包链：apps/cli 单包重建（OOM 擦除后）→ brand-web（BAF DSH / v0.0.25）→ pack-dsh（`packed dsh ->` 判据）→ `dist -- --dir`；资源抽检：help/index.html 在位、saveNodeHooks×7/planNodeHooks×4/once-badge/确认门/refreshIfClean×5 全部落包。

## 遗留问题（按客户影响排序）

1. **工作流图 tab 的桌面现场验证缺位**（问题 1/2 只到组件级）：真机家底无带工作流状态的会话可挂载。下次桌面验证若遇 BAF 会话，补一次目视（产物只显文件名；非 auto 会话当前路由整行消失）。
2. **状态脚本无可视化「试跑」**：脚本路径配好后只能等真实推进触发；可在后续批给 NodeHooksCard 加「dry-run」按钮（引擎 `runNodeHooks` 已可直接复用）。
3. **hooks 脚本执行环境未做超时**：单个脚本挂死会卡阶段切换（fail-closed 语义下表现为推进被拒）；后续可加每脚本 timeout 配置。
4. **一次性门节点与真实门弹卡的跳转联动**：总览图门卡目前只读展示，未提供「点击定位到对应会话弹卡」；低优先。
