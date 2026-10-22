# 批次十三（2026-10-22）：测试流图×工作流融合 + 运行按钮优化 + 质量监控改测试流 + 测试流页画布 — desktop 0.0.35 / 复核 0.0.36

> 需求原句（四部分）：1. 确认下测试流图的所有流程是否强制嵌入到了 baf 模式的工作流中，如何结合才能保证性能、效率和质量的综合最佳和平衡。给出方案，并优化工作流，在流程图中的适当状态卡片位置增加跳转到测试流图的按键，将两者有机的和谐的融合到一起。2. 优化测试流图中运行按钮的显示 ui 界面，要求更加和谐美观，方便使用。点击运行按钮后，会自动选中切换到对应的卡片。运行按钮需要放置到卡片中，而不是右侧。3. 工作流，「质量监控」改为「测试流」。并且确认下为什么我点击一键安装按钮后，环境仍然有问题，要保证点击一键安装就能保证环境是 ok 的，如果确实报问题，则需要提供按钮让用户点击，触发大模型的帮助安装，这种策略是否可行。日志：`gem install gcovr` 失败。4. 工作流，测试流页面，增加和会话测试流图一样样式的流程图，将「配置」「质量资产」「规范」分别放置到对应的流程位置。并每个流程增加 switch 开关和错误是否中止开关，注意流程间的绑定关系（比如跑单元测试才能生成覆盖率报告，关闭单元测试则覆盖率报告自动关闭等）。还要整理其他相关配置和规范填入对应测试流图。**确认这些问题是否都修改彻底。**

## 0. 结论速览

| # | 需求 | 落点 | 状态 |
| -- | ---- | ---- | ---- |
| 1 | 测试流图×工作流融合方案 + 跳转按键 | 独立画布 + viewRequest 单向跳转；`WorkflowView.tsx` implement/verify/archive 卡跳转 chip | ✅ 8 步保持独立画布（不强制内嵌）；三状态卡 chip 直达 format/test/gate 步骤卡，web 实测跳转+聚焦 |
| 2 | 运行按钮入卡 + 点击自动选中 | `TestFlowView.tsx/.module.css`（批次十三 + 复核①） | ✅ 卡片 chrome 移到 li.node，▶ 运行完全在卡片边框内（视觉审查确认）；点击运行 `setPicked(id)` 先选中；链跑失败选中首败卡 |
| 3 | 「质量监控」→「测试流」+ 一键安装保障 + AI 协助安装 | locales 改名 + `classifyStageToolMissing` + gcovr→pip + 复检轮 + `decidePipShadowQuarantine` + AI 协助安装按钮 | ✅ 改名全端一致；安装三个根因全修（gcovr 装不上 / ceedling 版本解析 / 失效垫片遮蔽），复检「✓ 全部工具就绪」；AI 协助安装可行且已实现（预填草稿，客户回车发送） |
| 4 | 工作流·测试流页同款画布 + 双开关 + 级联 + 配置/资产/规范归位 | `QualityFlowCard.tsx`（新）+ `standards-store.ts` + `.baf/quality/test-flow.json` 信封 | ✅ 8 节点画布 + 每节点 启用/失败中止 双开关；级联语义精确（关上游→下游级联关，开下游→上游自动开，haltOnError 永不级联）；配置/质量资产/规范 chips 落对应节点 |

测试：`ui-baf-workflow` 71/71 + `ui-settings-baf-standard` 102/102（复核后全量 173/173，13 文件）；host/client 两平面 `build:lib` 全绿；web 真机四轮探针 + 临时工程 CLI e2e + 视觉审查全过。

## 1. 需求 1：融合方案（性能/效率/质量平衡）

**方案结论：不强制内嵌，保持独立画布 + 单向跳转通道。**

理由：baf-mode 工作流是**人驱动的状态机**（7 阶段裁决门、产物停靠、模式裁剪），测试流图是**工具链执行链**（8 步质量命令、按报告着色）。两者的渲染数据源、刷新频率、交互模型都不同——强行把 8 个测试节点塞进工作流画布会：① 双图并渲染互相拖累（工作流图每次投影推送都重绘）；② 语义混杂（裁决门 vs 工具命令两类节点同图）；③ 测试流图的「按工作区报告着色」逻辑被工作流投影生命周期绑架。独立画布 + 跳转 = 性能（各自按需渲染）、效率（一次点击直达具体步骤）、质量（各自数据契约不串）综合最优。

【变更】`packages/client/ui-baf-workflow/src/client/WorkflowView.tsx`：implement / verify / archive 三张状态卡各新增「测试流图」跳转 chip（`data-testid="flow-node-testflow-<id>"`），点击经 viewRequest 通道携带 `stage:<id>` 落点跳到会话「测试流图」Tab 并聚焦对应步骤卡——implement→format（最终格式化）、verify→test（单元测试主链）、archive→gate（覆盖率门禁收口）。

【变更】`TestFlowView.tsx`：`viewRequest` 处理器识别 `stage:<id>`，`setPicked(id)` 聚焦目标步骤卡（详情面板同步展开）。

web 实测（probe2）：三 chip 可见可点；点 verify chip → 测试流图 Tab 激活 + `baf-test-flow-step-test` 卡 `aria-pressed="true"` 聚焦。

## 2. 需求 2：运行按钮 UI + 自动选中（含复核①真缺口）

### 2.1 批次十三落地

【变更】`TestFlowView.tsx`：每步 ▶ 运行按钮（SVG 播放三角 + 旋转中态、`prefers-reduced-motion` 降级）+ 顶部金色「全部运行」链跑（check 链→lint→format）；点击运行回调先 `setPicked(id)` 再 `setRunning(id)`——**自动选中所属卡片**；链跑失败自动选中首败卡片；链中止/全过摘要条（ok/bad 双色，`tflow.chainHaltedNote/chainSummary/chainAllPassed`）。

### 2.2 复核①：按钮「真正入卡」（0.0.36）

批次十三把运行按钮放进了 li（与选中按钮同级），但**卡片视觉 chrome（边框/底色/圆角）仍挂在内层选中按钮上**——视觉审查发现运行按钮看起来悬在卡片边框外（HTML 禁止 button 嵌套，初次实现把 chrome 留错了层）。

【变更】`TestFlowView.module.css`：`.node` 本体成为卡片——`position:relative; display:flex; align-items:stretch; gap:0.4rem; padding-right:0.45rem; background:var(--wf-card); border:1px solid var(--wf-line); border-radius:10px`；hover 边框 `color-mix` 提亮；`.nodeBtn` 透明化（`background:transparent; border:none; border-radius:9px 0 0 9px`）只留排版，focus-visible 内收 outline。`.nodeSelected` 选中环挂 li（运行按钮同染 tint）。

【变更】`TestFlowView.tsx`：li className 含 `selected ? css.nodeSelected : undefined`；nodeBtn 裸 `css.nodeBtn`。

复验（probe4 几何断言 + 视觉审查）：`runInsideLi:true`、右缘距 li 边 -8px、li 1px solid 边框在位；视觉模型确认「▶ 运行完整位于卡片边框内部，无溢出」。

## 3. 需求 3：改名 + 一键安装保障 + AI 协助安装（含复核②三根因）

### 3.1 批次十三：改名 + 缺工具分类修复

【变更】「质量监控」→「测试流」全端改名（settings 导航、locales zh/en、页面标题；`ui-baf-tracegraph`/`ui-settings-baf-standard` locales 同步）。

【变更】`packages/client/ui-baf-workflow/src/index.ts` 新增 `classifyStageToolMissing(code, combined, command)` 纯函数：Windows 11 cmd 对缺失命令**退 exit 1（非 9009）且本地化报错 GBK 乱码**——只有 ASCII 稳定的 `'NAME'` 引号前缀检测（≤200 字符输出内）可靠；同时保留 ENOENT / 9009 / 可读 not-found 文本三探测器；真实失败（长输出带 findings）不误判。单步与链跑统一显示「未找到 … 请先安装质量工具链」引导，不再误报「运行失败 退出码 1」。3 用例锁死（含替换字符真字节样本）。

### 3.2 客户日志根因：为什么一键安装后环境仍报缺

客户日志 `gem install gcovr` 失败是**真实根因**：gcovr 是 PyPI 包（pip 装），gem（RubyGems）根本没有这个包。批次十三已把 gcovr 安装改走 `pip install`。复核又挖出两个「安装成功但复检仍缺」的根因：

1. **ceedling 版本横幅解析**：`ceedling version` 第 1 行是 banner、版本号在第 3 行，旧 `readToolVersion` 只扫第 1 行 → 已装却报「未安装」。
2. **失效 pipx 垫片遮蔽 PATH**：客户机器 `where cpplint` 首位是 pipx 生成的死垫片（内嵌 Python 已删，运行报 `No Python at …`），真身在 PATH 后位被永久遮蔽 → `cpplint --version` 永远失败，重装 pip 包也修不好（pip 装到另一个位置，垫片仍在首位）。

### 3.3 复核②修复（0.0.36）

【变更】`packages/client/ui-settings-baf-standard/src/index.ts`：

- `readToolVersion` 扫 stdout 前 4 行找 `\d+(\.\d+)+`（ceedling 横幅第 3 行命中；第 5 行起保守 undefined）。
- `DEAD_PYTHON_SHIM_SIGNATURE = 'No Python at'`；`decidePipShadowQuarantine(candidates)` 纯函数：首个可用候选之前的、带死签名的失败候选 → 隔离名单（无可用候选不动、奇因失败不动、已可用不动）。4 用例锁死。
- `repairPipPathShadow(key)`：`where <key>` → 逐候选 `"<path>" --version` 探测 → 死垫片改名 `<原名>.dead-python-shim-<时间戳14>`（**可逆**，非删除）→ 复测裸命令 → 安装步骤行 `repair-<key>`（✓ 已隔离失效垫片 N 个 / 无可修）。
- 一键安装流程第 4.5 步：win32 下 cpplint/gcovr 预探测失败先走垫片修复，再复检轮——本机实测从「复检仍缺：ceedling · cpplint」到「✓ 复检通过：全部工具就绪」；磁盘取证 `~/.local/bin/cpplint.exe.dead-python-shim-20261022095321`，裸 `cpplint --version` 复活。

### 3.4 AI 协助安装：可行性结论

**可行，且已实现。** 安装器覆盖不了的残余环境问题（网络受限、多 Python 混装、权限、杀软拦截）本质需要诊断推理——按钮触发后由 web 端向宿主要一个**预填好的 baf 会话草稿**（描述：一键安装已跑、哪些工具仍缺、机器探测输出尾、请协助安装并验证），客户检查后回车发送，模型带着上下文接手。不做静默自动派单（装环境是系统级写操作，客户必须知情发起）；按钮只在复检仍失败时出现（环境健康时 DOM 确认不存在）。

## 4. 需求 4：工作流·测试流页画布（8 节点 + 双开关 + 级联）

【变更】`packages/client/ui-settings-baf-standard/src/client/QualityFlowCard.tsx`（新，替代批次十二删去的 QualityAssetsCard/QualityConfigCard/QualityStandardsCard 三卡职责，归并入画布）：与确认门同解剖的 8 节点垂直链图（gcc 编译→ceedling 单测→gcov 插桩→gcovr 报告→覆盖率门禁→cpplint→cppcheck→clang-format）；每节点两枚 switch（`data-testid="baf-quality-flow-node-<id>" [role=switch]` 首枚=启用、次枚=失败中止）；**配置 / 质量资产 / 规范 chips 按节点归位**——project.yml+ceedling-config（build/test）、报告路径（instrument/report）、阈值（gate）、CPPLINT.cfg（lint）、cppcheck-suppressions.xml（analyze）、.clang-format（format），点击预览/打开复用 `readWorkspaceFile`。

【变更】级联语义（`standards-store.ts` + host `saveQualityTestFlowToggle`）：**关上游 → 下游级联关**（关 test ⇒ instrument/report/gate 同答全关）；**开下游 → 上游自动开**（开 gate ⇒ build/test/instrument/report 重开，前置满足才能跑）；**haltOnError 永不级联**（每步独立）。开关落盘 `.baf/quality/test-flow.json` `{version:1, stages:{<id>:{enabled,haltOnError}}}` 信封（版本化 pretty JSON，客户可手改）；关闭步骤运行按钮置灰 + 详情卡「已关闭」徽标。

【变更】`readTestFlowStageToggles`：信封拆封后归一化（非对象条目丢弃、缺省字段补默认）——修复读信封本身导致的全默认静默回归；与 `readTestFlowStatus` 捎带合并。

web 实测（probe3）：8 节点全在、双开关就位；关 test → instrument/report/gate 同轮全关；开 gate → 四前置自动开；haltOnError 独立不联动；落盘恢复一致。

## 5. 复核③：baf-quality 命令随包落地（0.0.36，最大的真缺口）

**症状**：批次十二起 8 步命令全部 baf 封装（`baf-quality test/check/lint`），但**这个命令从未真正存在**——客户机器与开发机都没有它，每步运行必报「未找到 baf-quality 命令」。

【变更】`packages/baf/baf-quality/baf-quality-cli.cjs`（新，随包根发布，零依赖 node:*）：三子命令兑现 README 契约——

- `test [模块]` → `ceedling test:all / test:<模块>`；
- `check [--clean]` → 可选 `ceedling clean` → `ceedling gcov:all` → `gcovr -r . --html-details build/coverage/coverage_report.html` + `--print-summary`；
- `lint [路径…]` → `cpplint --recursive` + `cppcheck`（`runCaptured` 捕获输出数 findings），写 `.baf/reports/static-analysis.json` **平铺契约键**（`passed/errors/generated_at` + `tools[]` 明细——对齐 `readTestFlowStatus` 消费契约，修掉首版嵌套 schema 导致节点状态恒「未运行」的问题）；退出码=首个失败子命令。
- `cppcheckSuppressionsArgs()`：工程内 `cppcheck-suppressions.xml`（XML，人/GUI 用）译成 `--suppressions-list` 要的**纯文本** `id[:file[:line]]` 行（该 flag 不吃 XML——真机报 `Invalid id "<?xml version…"` 后修），落 `build/.baf-quality/cppcheck-suppressions.txt`。

【变更】`packages/baf/baf-quality/package.json`：`bin: {"baf-quality": "baf-quality-cli.cjs"}` + files 增 `baf-quality-cli.cjs`。（exports **不加** `./baf-quality-cli.cjs` 条目——typert 分析器要求 exports 解析到 TS 源，非 TS 资产经 `./package.json` 根 + dirname 解析。）

【变更】`packages/client/ui-baf-workflow/src/index.ts`：

- `bafQualityCliPath()`（memoize）：`createRequire(import.meta.url).resolve('@deepseek-ai/dsh-baf-quality/package.json')` → dirname 拼 `baf-quality-cli.cjs` + existsSync。
- `stageSpawnCommand(display, cliPath, execPath)` 纯函数：display 以 `baf-quality ` 开头且 cli 在 → `"<process.execPath>" "<绝对cli>" <子命令>`（**宿主 node 下运行，零 PATH 依赖**）；其余命令原样（clang-format 等走 PATH）。3 用例锁死。
- `execTestFlowStage` spawn 用重生命令、UI 展示命令与分类判定仍用 display（客户看到的仍是 `baf-quality lint`）。
- `STAGE_TOOL_TOKENS`（baf-quality/ceedling/gcovr/cpplint/cppcheck/clang-format/gcc/ruby）——缺工具分类扩展到**链成员**（wrapper 内嵌 shell 再 spawn，报错行点名 `'ceedling'` 而非 wrapper 本身）；2 用例锁死。

【变更】`packages/client/ui-baf-workflow/package.json`：deps 增 `@deepseek-ai/dsh-baf-quality: workspace:^`（宿主能 resolve 到包根的前提）。

**e2e 取证**（临时工程 `%TEMP%\baf13-cli-e2e`，source/ecum + Unity 测试，验后已删）：`check` EXIT=0（gcov 对象 + `build/coverage/coverage_report.html` 报告套件齐全）；`lint` EXIT=0（cpplint + cppcheck 双工具跑完，报告落盘）；web 实测（probe2/probe4）：demo1 会话内点 lint「运行」→ wrapper 真实执行 → `.baf/reports/static-analysis.json` 写入 → lint/analyze 节点状态「已通过」（fresh load 复验，持久映射成立）。修临时工程时顺带验证企业规范按预期工作：`#include "ecum/ecum.h"`（必须带子目录名）。

## 6. 验证记录

| 轮次 | 内容 | 结果 |
| ---- | ---- | ---- |
| web probe2 | 跳转 chip 三枚 + 落点聚焦；运行按钮同卡几何断言；lint 运行→自动选中→`data-state=passed` | ✅ 全过（`lintSelectedAfterRun:"true"`） |
| web probe3 | 测试流 Tab 改名；8 节点双开关；级联三轮（关 test / 开 gate / haltOnError 独立）；落盘恢复；环境卡真装一轮到「复检通过」 | ✅ 全过 |
| web probe4 | fresh-load 持久状态（lint/analyze passed）；详情面板文本「通过」；运行按钮入卡几何（-8px） | ✅ 全过 |
| 视觉审查 | 06/07 卡绿点「通过」；运行按钮全在卡内；06 选中环 + 详情联动；布局无溢出 | ✅（首轮 07 图为 CDN 陈旧缓存误报，换新路径 20-*.png 复验通过） |
| CLI e2e | 临时工程 check/lint 双命令真实退出码 + 产物 | ✅ EXIT=0 ×2 |
| 磁盘取证 | 死垫片改名存在；裸 cpplint --version 复活 | ✅ |
| vitest | 两包全量 71+102=173 | ✅ 全绿 |
| oxlint（staged 门） | 7 个改动文件 | ✅ 0 发现（全量配置下 8 条均为未触碰行的存量债） |

demo1 夹具清理：`build/`、`.baf/reports/`、`.baf/quality/test-flow.json`（探测残留，全默认值）已删，git status 复原到探测前（`.baf/quality/` 内批次十二资产保留）。

## 7. 遗留问题（按影响排序）

1. **gcovr HTML 报告内的 CSS/JS 资源**：`--html-details` 单文件已含全部样式；若企业后续要 Cobertura/JSON 双报告并存，wrapper 需再加子命令（当前契约未含，非缺陷）。
2. **`readToolVersion` 第 5 行起保守放弃**：极端工具版本横幅超 4 行会报未安装（现状已知工具链最长 3 行；安装引导兜底）。可加工具名→行号线索表。
3. **垫片隔离只认 `No Python at` 签名**：pipx 其他死法（如 VC 运行库缺失弹窗超时）不在签名内，落到「AI 协助安装」路径兜底。
4. **全量 oxlint 存量债 8 条**（`ui-baf-workflow/src/index.ts` 1172/1571/1577、`TestFlowView.tsx` 582、settings spec 731-733，均非本批引入）：建议单开清理批，不混入功能批。
5. **测试流页画布 chips 的「规范」组**当前静态编目；若企业规范文档增删需同步 catalog（已有奇偶校验 spec 兜底错配）。
