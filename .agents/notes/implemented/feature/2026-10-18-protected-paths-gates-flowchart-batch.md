# 2026-10-18 两问题批 — 项目工程卡（路径/配置文件/AI 禁改路径三层防线）+ 工作流确认门（文案/Switch/流程图）

> 范围：设置→工作流两个 tab。项目工程 tab 从只读卡升级为「路径可点开 + AI 禁改路径可编辑」；工作流确认门总览改为工作流流程图本体。验证路径：**web 端**（客户要求「必要时打开 web 端验证确认」，无 exe 打包）。
> 客户决策（AskUserQuestion）：写口范围 = **只开 protectedPaths**（其余字段维持 2026-10-06 只读决策）；打开行为 = **默认程序打开**（项目路径 = 资源管理器 reveal，配置文件 = 关联程序打开）；旁路对策 = **客户自设计** — git 提交时对保护路径修改再做一次校验，存在即阻止并报错。

## 问题 → 方案总表

| # | 问题 | 方案 | 涉及包 |
|---|------|------|--------|
| 1.1 | 显示项目工程路径，点击可打开 | summary 新增 `cwd`/`baselinePath` 投影；路径行点击 → `session.openWorkspacePath({path, action:'reveal'})`（资源管理器定位），title=绝对路径、文本=路径 | ui-settings-baf-standard |
| 1.2 | 显示配置文件名，点击可打开 | 同上 Remote；文件名行点击 → `openWorkspacePath({path})`（**省略 action = 默认程序打开**，契约里没有 'open' 字面量），title=完整路径、文本=仅文件名 | ui-settings-baf-standard |
| 1.3 | 管控文件夹（AI 禁改，强制） | **三层防线**（见下）+ ProtectedPathsCard 编辑卡（增删改/复制/目录选择框/相对路径校验），唯一写口 = `saveProtectedPaths` Remote，经 comment-preserving 外科手术式改写落盘 + 装钩子 | baf-core / baf-guard / baf-standard / ui-settings-baf-standard / web-app(patch) |
| 2.1 | 删除「门禁总览（只读）两层门禁一份清单：…」导语 | 删除；tab 标题已表意 | ui-baf-workflow |
| 2.2 | 详细/简洁用 Switch，样式与轨迹图一致 | 改用共享 `Switch` 原语（轨迹图行同款控件本体，非样式拷贝）—「简洁 [Switch] 详细」两端标签 | ui-baf-workflow / ui-primitives |
| 2.3 | 整图用工作流流程图，节点承载确认门详情；简洁 hover 出详情 | 复用 WorkflowView 同一画布几何（TEMPLATE_PLACEMENTS/EDGES、bezier SVG 边、右键拖拽平移 + 滚轮滚动 + ctrl 缩放）；每节点带阶段门 + 挂靠确认门；简洁态节点只有徽标行，完整详情进 hover/focus Tooltip（与 aria-label 同一字符串）；行高按实测重排，详细节点不会重叠 | ui-baf-workflow |

### AI 禁改路径三层防线（1.3 的「可靠可落地」答案）

| 层 | 机制 | 文件 |
|----|------|------|
| L1 | **BAF 预设全量 ToolGuard**（原有，本批增强 policy：`INDIRECT_WRITE_PATTERNS` 间接写模式 + `GIT_COMMIT_NO_VERIFY` 拒绝 `git commit --no-verify`） | baf-guard/policy.ts / tool-guard.ts |
| L2 | **预设无关全局轻量守卫**：`createProtectedPathsGuard` 挂在基础组合层（cordis.patch.yml 常驻行 `baf-guard-global-install`），每个 agent 创建即绑定会话 cwd — fs write/edit 命中保护路径或内建 `.git`/`.baf` 即拒；shell 仅「引用保护路径的变形命令」被拒（standard 模式 agent 其余 shell 全放行）；`--no-verify` 拒。每次调用重读 baseline → 设置页保存后下一次工具调用即生效 | baf-guard/global-guard.ts / global-install.ts |
| L3 | **git pre-commit 提交防线**：保存非空列表时安装受管 shim（`.git/hooks/pre-commit`，行 2 带 `baf-dsh-managed` 标记）+ 零依赖校验器 `.baf/hooks/pre-commit-check.cjs`（纯 node，parse baseline → `git diff --cached --name-only` 比对 → 命中 exit 1 中文报错列出文件）。已有用户钩子被保留为 `.user` 并由 shim 链式调用；重装幂等；非受管 shim（用户手工替换）不动 | baf-guard/commit-hook.ts |

语义边界：AI 侧三层全拦（工具直写、shell 间接写、`--no-verify` 跳钩子）；**人工在自己的终端保留 `--no-verify` 逃生口**（L3 只在 git 原生钩子里跑，不拦人）。

## 【变更】明细

### baf-core（编辑基座 + schema）

- `baseline-edit.ts`（新）：`normalizeProtectedPathEntry`（反斜杠→`/`、剥 `./` 前缀与尾 `/`）／`validateProtectedPaths`（非空、工作区相对 — 拒盘符/前导 `/`/`..` 段、通配只许结尾 `/**`、`.git`/`.baf` 内建拒、归一化去重）／`rewriteBaselineProtectedPaths`（**只改 `guard:` 块内 `protectedPaths:` 起至列表末段的行**，其余字节不动 — 全量 js-yaml dump 会抹掉客户注释；无 `guard:` 块或无键 → `BafError('baseline_unavailable')` 不静默追加；CRLF 按行保留；空列表写 inline `[]`，键缩进处注释保留、列表内部注释随段替换）。
- `baseline.ts`：guard 投影携带 `protectedPaths` 原始列表。
- `schema/baseline.schema.yaml`：protectedPaths 条目 pattern 收紧（对齐 validate 语义）。
- `index.ts`：导出 baseline-edit 三函数。

### baf-guard（L1 增强 + L2 + L3）

- `policy.ts`：新增 `INDIRECT_WRITE_PATTERNS`（`>`/`>>` 重定向、`rm`/`mv`/`cp`、`tee`、`sed -i` 等 shell 变形写模式）；`GIT_COMMIT_NO_VERIFY` 正则供全量守卫与轻量守卫共用。
- `global-guard.ts`（新）：见上表 L2。模块注释写明**为何刻意跨预设**（与 2026-09-28「BAF 工作流规则泄漏」事故的区别：这是产品级客户决策，且叠在 baf 预设上被全量守卫完全吸收、双装无害）。
- `global-install.ts`（新）：宿主面常驻行 — `agent/created` → 取 `session.header.cwd ?? process.cwd()` → `agent.ctx.inject(['tools'])` 挂守卫；`agent/disposed` → fiber 清理；effect 兜底全量 dispose。空白会话重链预设复用同一 agent，无需重评估（预设无关）。
- `commit-hook.ts`（新）：`parseHookProtectedPaths`（块列表/inline/占位符/宽松空白解析，fail-open）／`stagedViolations`（`git diff --cached --name-only` 成员 + `dir/**` 匹配、反斜杠归一）／`isManagedShim`（**标记在 shim 第 2 行** — shebang 之后；查前 3 行）／`installCommitGuardHook`（保留用户钩子 → `.user` + shim 尾部 `sh` 链式调用；重装幂等；手工替换过的 shim 不动 — 首个保留钩子为准；无 `.git` → `{ok:false, message}`）／`commitGuardHookInstalled`／`checkerScript()`（字符串内嵌零依赖 .cjs 源码）。
- `package.json` + `tsdown.config.ts`：新增 `./commit-hook` 与 `./global-install` 导出入口（**tsdown 必须重跑** 否则 lib 缺子路径）。

### baf-standard / 服务写口

- `ui-settings-baf-standard/src/index.ts`（宿主 Remote）：
  - `summary()` ready 分支新增 `guardProtectedPaths`（原始列表）+ `commitGuardHookInstalled`；`cwd`/`baselinePath` 在 no-baseline 分支也返回（路径行先于基线存在）。
  - `saveProtectedPaths(paths)`（**本 Remote 唯一写方法**）：resolveCwd → 校验（invalid 带客户可读 message）→ 读原文 → 外科改写 → **落盘前整份 YAML+schema 复检**（解析坏了进不了盘）→ `*.baf-tmp` + rename 原子换 → **换后重载 belt**（失败回写原文恢复）→ 非空列表装 L3 钩子（`hookInstalled:false` + message 随 ready 返回，不阻塞保存）。
  - guard 卡投影移除 protectedPaths 行（编辑卡独占该字段，避免双处展示）。
- `types.ts`：`BafStandardSaveProtectedResult`（ready{paths, hookInstalled?, message?} / no-workspace / no-baseline / invalid / error）+ summary 扩展字段。

### ui-settings-baf-standard（呈现面 + store）

- `StandardsOverview.tsx`：项目工程卡重排 —
  - 路径行（testid `baf-project-cwd`）：文本=工作区路径，点击 reveal；title=绝对路径。
  - 配置文件行（testid `baf-project-baseline`）：文本=仅 `baseline.yml` 文件名，点击默认程序打开；title=完整路径。
  - 【变更·exe 冒烟追补】路径行提取为 `ProjectPathRows`（ready 卡与 no-baseline 卡共用）：服务端在 no-baseline 分支也返回 cwd/baselinePath，但原实现只在 ready 分支画 → 桌面 exe 首启（无基线工作区）1.1/1.2 第一眼不可见。现 no-baseline 且有路径字段时同画两行（无路径字段的 no-baseline summary 仍不画卡，防空壳）；`protectedCard` 仍只在 ready（无落盘目标不可编辑）。spec 49/49（新增 no-baseline 路径行用例）。
  - `ProtectedPathsCard`（testid `baf-protected-card`）：行=路径 + 每行 reveal 按钮 + 编辑（InlineEditor，Enter 提交/Esc 取消）+ 删除；底部添加框（按钮/Enter 二入口）；重复/空/非法条目拒绝并留 notice；草稿脏才可保存（`protectedSaving` 防抖动）；目录选择框按钮 → `pickDirectory()`（preload `__DSH_DIRECTORY_PICKER__` → `uiWorkspace.pickDirectory` → null）→ **盘符大小写不敏感 + 分隔符归一后求工作区相对路径**（区外/跨盘/根本身 → 不落草稿）；钩子状态行（`hookInstalled` 徽标）；notice 行（本地化键识别，非键原样展示）。
- `standards-store.ts`：state 加 `protectedDraft`/`protectedSaving`/`protectedNotice`；face 加 `updateProtectedDraft`/`saveProtectedPaths`/`clearProtectedNotice`/`revealPath`/`openPath`/`pickDirectory`。`applySummary` ready 时从 `guardProtectedPaths` 播种草稿（占位符不列出），非 ready 清空。`pathGesture`：reveal → `{path, action:'reveal'}`；open → `{path}`（**契约只有可选 'reveal'，省略即默认程序**）。`saveProtectedPaths` 成功即 reload（重读即所存），`hookInstalled:false` 的 message 落 notice。
- `locales.ts`：项目工程 + 保护路径全套键（中英）。
- `package.json`/`tsconfig.host.json`：baf-guard / baf-quality 依赖与宿主编译引入。

### ui-baf-workflow（工作流确认门）

- `GatesOverviewRow.tsx`：
  - 导语段删除；头部只剩 `modeSwitch`（简洁 [Switch] 详细）+ 嵌入态无折叠按钮。
  - `GatesCanvas`：WorkflowView 同款画布 — TEMPLATE_PLACEMENTS 摆位、TEMPLATE_EDGES 过滤现存节点、bezier `<path>` + 箭头 marker + 边 `<title>` 条件提示；右键拖拽平移、滚轮纵向（shift 横向）钳制、ctrl+滚轮 0.55–1.8 缩放；**行高 useLayoutEffect 实测重排**（详细态节点可长过 128px 模板行高，+36px 呼吸位；布局不变则保旧数组防渲染环）；前向边从节点**实测底边**出发。注册表多出的非常规节点堆在 drift 下方（col 1, row 5+）。
  - 节点卡：图标 + 名称 + 徽标（`确认门 ×N` 或 无门禁）+ 阶段门（artifact chip；详细加 gateFn/条件列表/note，简洁只显示条件数）+ 确认门卡片（详细展开 title/question/每选项+命令；简洁整段省略）。无门禁节点保留卡 + 「无门禁」静默行（管线不读作断链）。
  - **简洁态 hover**：`nodeDetailText` 生成与详细画布同文的一整段（标签/阶段门/条件/确认门/选项/动态选项标记），同时作为 Tooltip label 与节点 `aria-label`（hover、focus、读屏三通道同文）。
  - 一次性门（无 node）前置卡 `baf-gates-once`；配置诚实块只随详细。
- `GatesOverviewRow.module.css`：canvasShell/canvasNode/canvasStage/canvasGates/gateCard/modeSwitch 等新类；节点复用 `WorkflowView.module.css`（flowNode/flowNodeHead/nodeBadge/edge 族）保持与工作流画布同观感。
- `ui-primitives/index.ts`：导出 `Switch`（轨迹图行已在用的同款控件 — 非样式拷贝，两处永不漂移）。

### bundle/web-app

- `cordis.patch.yml`：基础组合层新增常驻行 `baf-guard-global-install`（`@deepseek-ai/dsh-baf-guard/global-install`）— 注释写明为何不能用 presetCovers 过滤（无作用域宿主行）。

## 测试与类型

- 新 spec：`baseline-edit.spec.ts`（16：归一/去重/各类拒绝/inline↔block 改写/CRLF/BafError/兄弟键容忍/roundtrip）、`commit-hook.spec.ts`（22：解析/暂存比对/isManagedShim/**tmp 仓真 git e2e**（init→stage→spawnSync node checker→exit 1 + 中文拒文 + 命中文件列出；干净/空/缺 baseline→exit 0）/安装生命周期（保留 .user+链式/幂等/手工替换不动/无 .git）/policy `--no-verify` 各形）、`global-guard.spec.ts`（15：fs 拒/放、内建 `.git`/`.baf`、shell 间接写拒、读类放行、占位符休眠、退化项）。
- 扩 spec：settings 服务 +6（summary 投影 / 保存全链含 tmp-dir 目录占位失败路径 / 空列表 inline+无钩子 / 非法路径字节不变 / EISDIR / guardless 拒）、settings 客户端近乎翻倍（ProtectedPathsCard 全手势 + StandardsController 写口/手势/picker 五级回退 + toRelativeEntry 边界）、gates-overview +6（Switch 角色/简洁徽标+无详情卡/Tooltip 文本与 aria 同源/详细选项展开/配置块只随详细/边 title）。
- **修复同树 8 个既有失败**（前批未提交的 status-blockers + standard-init 所致，非本批引入）：cmdline/surface-parity 快照列表补 `standard-init`；stages/bug-fix-path 夹具把 baseline 落盘（verify 的 REQUIRED 'status-blockers' 检查从盘上重读 — 真实脚手架工作区恒有盘上基线）。
- 全绿：baf-guard 54、baf-core、settings 双 spec 48、gates 6、baf-workflow 494（修完后）、ui-baf-workflow+ui-primitives 1399。
- oxlint staged 全过（arrow-parens/member-delimiter/max-len 140/no-non-null-assertion 修正：`(inline[1] ?? '')` 等）。涉改包 `tsc -b` 全绿（baf-guard、settings host+client、ui-baf-workflow、ui-primitives）。

## Web 端验证记录

2026-10-18 晚，profile=web（host `--profile web --port 3180 --no-open`）+ 无头 Edge CDP 探针（`%LOCALAPPDATA%\Temp\baf-verify\webprobe-v9b.mjs` / `v9c.mjs`），工作区 = `D:\Source\baf-codingplugin\demo\demo-protect`（会话 header.cwd 已绑定）。

### 验证前踩坑（环境层，非本批代码缺陷）

- 症状：设置→工作流→项目工程 tab 空白。两层叠加的根因：
  1. typert api/remotes 聚合过期（改 Remote 契约后未重建）— 本批前段已修（聚合 + 各 client 包 lib 重建 + host 重启）。
  2. **vite 壳过期**：浏览器插件以运行时模块引用共享包 `@deepseek-ai/dsh-client-ui-primitives`，其解析落在壳 `apps/web/dist/assets/index-*.js` 上；本批给 ui-primitives 新增 `useCopyFeedback` 导出后未重建壳 → 插件 bundle 的 `(0, _deepseek_ai_dsh_client_ui_primitives.useCopyFeedback) is not a function` 击穿 PathRow → 整个 settings.workflow.item slot 崩白（console 无可见报错，靠监听捕获）。修复 = `pnpm run build:web`（≈6s，产出 index-Bn7yXpBx.js 含新导出）。**结论：给共享 client 包加导出后，除 build:lib 外必须重建 apps/web/dist 壳。**
- 无头 Edge 后台节流：页面被遮挡时 Runtime.evaluate 挂 75s+；探针每阶段前 `Page.bringToFront`（poke）即恢复。仅影响自动化，不影响真人用户。
- 裸 `npx vite build` 在本仓失败（`this.getWatchFiles is not a function` @ product-isolation.ts:61 dsh-worker-build-inputs）；走 `pnpm run build:web` 即正常。

### v9b/v9c 断言结果（全绿）

| 项 | 断言 | 结果 |
| --- | --- | --- |
| 1.1 | 路径行文本含 demo-protect、title=绝对路径、点击 reveal | ✅ |
| 1.2 | 文件行文本=仅 `baseline.yml`（不含路径分隔/盘符）、title=完整路径 | ✅ |
| 1.3 初态 | 卡在、占位符 `<enterprise-tbd>` 过滤后 rows=[]、钩子「未安装」、保存钮 disabled | ✅ |
| 1.3 添加 | 按钮 + Enter 双入口入列（docs、config/secrets.env）、脏→保存 enabled | ✅ |
| 1.3 保存 | rows 持久化、钩子翻「已启用」、重读即所存 | ✅ |
| 1.3 重复 | 重复条目 notice「已在清单」拒绝 | ✅ |
| 1.3 编辑 | InlineEditor docs→docs/**（Enter 提交）落列 | ✅ |
| 1.3 删除 | 删 row-1 后仅剩 docs/**，保存后一致 | ✅ |
| 1.3 选目录 | web 端无原生 picker（preload 注入 null）→ 点击不崩卡 | ✅ |
| 2.1 | 导语文本（门禁总览/一份清单）全消失 | ✅ |
| 2.2 | Switch 存在且 className 与轨迹图行 Switch **完全同串**（`_switch_1ik0f_5`）— 同一控件本体 | ✅ |
| 2.3 画布 | `baf-gates-flow` 在，9 节点（canvas→archive 全链） | ✅ |
| 2.3 详细 | 节点内 15 张确认门卡展开；implement 节点文本含「确认门」 | ✅ |
| 2.3 简洁 | 节点内卡全隐（residual 9 张全属 `baf-gates-once` 一次性门区 — 设计如此）；节点 aria-label 与 hover Tooltip 同文；scrollIntoView + mouseMoved 后 Tooltip 打开（side=right、portal=true、文本=「实现 阶段门： plan.json · implementGate · 实现账本…」完整 nodeDetailText） | ✅（v9c 补验） |
| L3 | 见下 | ✅ |

探针自身两处假阳性已排查归档：(a) concise 残留 9 卡 = once 区（by design）；(b) tooltip 首测 null = 未 scrollIntoView 前节点不可命中。

### L3 git 提交防线真机验证（demo-protect）

保存 `docs/**` 后 `.git/hooks/pre-commit`（受管 shim）+ `.baf/hooks/pre-commit-check.cjs` 落盘：

- `git add docs/guide.md && git commit` → **exit 1**，中文拒文：`[baf-dsh] 提交被拒绝：以下文件位于 AI 禁改路径（.baf/baseline.yml guard.protectedPaths）： - docs/guide.md …`
- 同内容 `git commit --no-verify` → 通过（人工逃生口，符合设计）。
- 非保护文件（README）正常提交通过。
- 验证后现场还原（重置提交、baseline 保持 `docs/**` 一致终态）。

### 截图（供人工复核）

`%LOCALAPPDATA%\Temp\baf-verify\`：v9b-project-initial / v9b-project-saved-docs / v9b-project-final / v9b-gates-detail / v9b-gates-concise-hover / v9c-concise-hover / exe-project-tab / exe-gates-tab（.png）。host 与无头 Edge 均留活可直接连看。

## exe 打包与冒烟（2026-10-18 晚，--dir 免安装）

- 产物：`overlay/desktop/dist/win-unpacked/baf-dsh.exe`（204,592,128 bytes，v0.0.25，签名走过，无 NSIS）。
- **构建链坑（本段实录）**：① 全量 `pnpm run build` 的 root tsdown host pass 在低内存机器 OOM（exit 134，两次，均只擦掉在飞的 apps/cli/lib）；解法 = **跳过该 pass**——lib 内容此前已全部构建到位（102 包 host 面 src 无一新于 lib），只 one-off 重建 apps/cli（`cd apps/cli && ../../node_modules/.bin/tsdown --config-loader native`，59ms），pack-dsh 的上游判定只有 `apps/web/dist/index.html` + `apps/cli/lib/bin.js` 两文件。② **pack-dsh 假成功**：上游缺失时打印「上游产物缺失」却 exit 0——判断成败要看输出里的 `packed dsh -> …` 行而非退出码（此坑建议后续修为 exit 1）。③ 后台长构建别接 `| tail` 管道（吞退出码造成假绿）。
- 顺序：install(幂等) → 新鲜度扫描（3 处全甄别为假阳性/内容已对）→ 补 apps/cli → brand-web → pack-dsh → `dist -- --dir`。resources 树抽验：baf-guard `commit-hook.js`/`global-install.js`/`global-guard-*.js` 在、`dsh-web-app/cordis.patch.yml` 含 `baf-guard-global-install` 行、ui-primitives `useCopyFeedback` ×4、settings `saveProtectedPaths` ×8、`help/index.html`、`baf-product-versions.json`（bafDsh 0.0.25）。
- 桌面冒烟（CDP 9200，`env -u ELECTRON_RUN_AS_NODE`）：title BAF DSH、gates tab 全绿（导语无、Switch 在、flow 9 节点、once 区在）；项目工程 tab 首启 no-baseline 态冒出「路径行缺失」偏差（见上【变更·exe 冒烟追补】）→ 修复后二次打包复冒烟：path=`项目路径 C:\Users\12402`（title=绝对路径）、file=`配置文件 baseline.yml`（仅文件名）、protectedCard 不在（no-baseline 不可编辑，正确）。

## 剩余风险（排位）

1. **简洁态一次性门区仍渲染整卡**（`baf-gates-once` 不随 mode 收起）：设计决策 — 一次性门无节点可挂，若也藏进 tooltip 则简洁态整区消失、用户失去「还有门没看到」的线索。客户如觉冗余可改为简洁态只留标题行，一行改动。
2. **resolveWorkspaceCwd 多工作区启发式**（同 10-13 批风险 1）：项目工程 tab 跟随「最新带 header.cwd 的会话」；多工作区并存时可能显示非预期工作区。已知未改。
3. **L2 全局行无 cwd 会话回落 `process.cwd()`**：宿主进程 cwd 不一定是用户工作区，守卫面偏窄不偏宽（漏拦风险极小，误拦为 0）；真实会话均有 cwd。
4. **shim 手工替换后的「首个保留钩子」语义**：用户手工改写受管 shim 后，后续重装以「首个保留钩子」为链头，极端场景链序可能与用户预期不同；`.user` 链对含空格 Windows 路径的 sh 引号假设未在怪路径下实测。
5. **裸 `npx vite build` 失败**（getWatchFiles @ product-isolation.ts:61）：仅影响直接裸调 vite 的开发者，规范入口 `pnpm run build:web` 正常；未追。
6. **无头 Edge 背景节流**：仅自动化探针需 bringToFront，用户面无影响；记录在案避免未来探针复踩。
7. 视觉层未人工过目（本环境 Read 图片走 CDN 无法渲染回看）：DOM/aria 断言 + 截图已留档，建议客户在留活的 host 上眼验一次排版。
