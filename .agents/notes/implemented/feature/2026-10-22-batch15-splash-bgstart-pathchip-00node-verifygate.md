# 批次十五（2026-10-22）：splash 后台启动 + 工作流路径统一预览手势 + 测试流 00 前置节点/药丸开关 + 指令集瘦身 + Tab 间距 + 验证阶段测试流门禁 — desktop 0.0.38

> 需求原句（六部分）：1. splash 停留超过 5s 提示「BAF服务首次启动时间稍久，请耐心等待」+「后台启动」按钮，点击后隐藏 splash、后台完整启动、完成后再显示主页面。2. 工作流页面所有路径/文件名 hover 下划线；文件→模态预览（右上角「打开」「打开文件夹」两按钮）；路径/目录→打开文件夹；「企业规范」只读文件只支持预览。3. 测试流环境一键安装需包含 .clang-format 复制进项目（批次十四已落地，本批 web 复核）。4. 测试流卡片删除八步链说明；「前置」改为与 01 gcc 同款样式的「00」节点放第一位；启用/失败中止开关改单行药丸组。5. 指令集删除「状态指令 · 按阶段查看」标题+说明。6. 工作流各 tab 首元素与 tab 标签距离一致。7. 会话工作流图测试流链接仅在「验证」节点；测试流全部完成成功验证才算完成，并明确验证不过时的状态流转。

## 0. 结论速览

| # | 需求 | 落点 | 状态 |
| -- | ---- | ---- | ---- |
| 1 | splash 5s 提示 + 后台启动 | `overlay/desktop/src/main.ts` + `ui/splash.html/.css/.js` + `src/preload-splash.ts`（新） | ✅ 5s 后浮出提示条与「后台启动」按钮；点击 → splash 隐藏、启动继续（托盘 tooltip「正在后台启动…」）、完成后主窗口照常出现 |
| 2 | 路径/文件名统一手势 | `StandardsOverview.module.css`（`.pathChip`）+ `QualityFlowCard/QualityEnvironmentCard/NodeHooksCard/EnterpriseDocViewer/EnterpriseDocsCard/StandardsOverview.tsx` + `locales.ts`（qolAssetReveal） | ✅ 文件（配置文件/状态脚本/测试流资产/报告/配置 chips）hover 下划线→模态预览（右上「打开」「打开文件夹」）；目录（项目路径/受保护路径/测试流目录值）→直接打开文件夹；企业规范文档删「打开文件」仅预览 |
| 3 | 一键安装含 .clang-format | 批次十四已落地（host `packs:['quality','c']`） | ✅ 复核确认：`.clang-format` 在 c 包资产清单（QUALITY_ASSET_FILES 第 5 行），apply-enterprise-standards.spec 断言落盘且内容含 BasedOnStyle |
| 4 | 00 前置节点 + 药丸开关 + 删八步链 | `QualityFlowCard.tsx` + `.module.css` | ✅ web 实测：nodeOrder 首位 `baf-quality-flow-prereq`（idx=00，radius/bg/border 与 01 全等）；`八步按依赖串成一条链` 0 命中；启用/失败中止全部 999px 药丸（fill 8% 灰） |
| 5 | 指令集删标题+说明 | `CommandsCard.tsx` + `locales.ts` | ✅ web 实测：`状态指令 · 按阶段查看` 与 intro 0 命中，卡直接从流程图开始 |
| 6 | Tab 间距一致 | `.module.css`（`.blockQuality` padding 8→16px 等） | ✅ web 实测：六个 tab（通用/项目工程/确认门/指令集/企业规范/测试流）首元素 gap 全部 15px |
| 7 | 测试流链接仅验证 + 验证门禁 | `ui-baf-workflow/src/client/WorkflowView.tsx`（`TEST_FLOW_JUMPS={verify:'test'}`）+ `baf-quality/src/test-flow.ts`（新 reader 集）+ `baf-workflow/src/stages/verify.ts` | ✅ chip 仅注册 verify；verify CheckRunner 新增 required `test-flow` 检查（按开关 demanded 的覆盖率+静态分析报告双绿），不过走既有 T11 退回实现并派修复工单；`stack.test` 为 `<enterprise-tbd>` 占位的工作区不启用门禁（与质量门禁占位语义一致） |

**验证不过时的状态流转（客户问询的明确回答）**：既有 T11 逻辑自动把变更退回 **implement** 并派发带失败行的修复工单——模型回实现阶段修复、重跑测试流、再进验证；**从不在验证阶段内迭代**。（另有 verify-archive 手动退回路径。）

测试：`ui-settings-baf-standard` 68/68；`baf-quality`+`baf-workflow` 529/529（新增 `test-flow.spec.ts` 10 用例：开关 reader 三态、完成度判定五分支、占位门禁谓词）；`ui-baf-workflow` 80/80；`stages.spec` 新增 T11 门禁闭环用例（缺报告 → backToImplement + ut_coverage.missing/static_analysis.missing；双报告落盘 → backToImplement=false + `test flow complete`）。

## 1. 需求 1：splash 5s 提示 + 后台启动

【变更】`overlay/desktop/src/main.ts`：splash 计时到 5s 未完成时通过 preload 通道发 `show-slow-hint`；「后台启动」点击走 IPC `splash-background`——splash 窗口 `hide()`（不销毁，主窗口 ready 后统一关闭）、托盘 tooltip 置「正在后台启动…」、启动链路照常走完。

【变更】`overlay/desktop/src/preload-splash.ts`（新文件）：splash 的 contextBridge——暴露 `onSlowHint(cb)` 与 `background()` 两个最小面。

【变更】`overlay/desktop/ui/splash.js/.css/.html`：5s 提示条（「BAF服务首次启动时间稍久，请耐心等待」）+ 右侧「后台启动」按钮（品牌色描边幽灵样式）；点击调 `window.__splashApi__.background()` 后本地点「已转入后台启动」静止态，等窗口关闭。

## 2. 需求 2：路径/文件名统一预览手势

【变更】`StandardsOverview.module.css`：新增共享修饰类 `.pathChip`——`cursor:pointer; text-decoration: underline transparent; text-underline-offset:3px`，`:hover/:focus-visible` 下划线变品牌色（`--dsw-alias-border-brand` 回退链）。

【变更】`QualityFlowCard.tsx`：
- `AssetModal`/`ReportModal` 头部右上角改为**两按钮**：`baf-quality-asset-open-file`（打开，默认应用）与 `baf-quality-asset-reveal-file`（打开文件夹，文件管理器定位）；ReportModal 同款两键。
- `FlowNode` 增加 `cwd` + `onRevealDir`：节点值 chips（构建/测试命令的工作目录类值）点击 `revealPath` 直接开文件夹。
- 资产 chips、报告 chip 的 className 追加 `.pathChip`（hover 下划线手势）。
- 组件级新 prop `onRevealPath` 透传两模态与节点目录跳转。

【变更】`QualityEnvironmentCard.tsx`：配置文件 chips 追加 `.pathChip`；`AssetModal` 调用带 `onRevealFile`。

【变更】`NodeHooksCard.tsx`：`openPath` prop 换 `onPreviewFile(rel)`——状态脚本条目点击走工作区相对路径预览（复用共享 AssetModal），不再裸 openPath。

【变更】`StandardsOverview.tsx`：项目工程页持有唯一预览态 `previewRel`，`配置文件` 行与状态脚本条目共用一个提升的 `AssetModal`（带双按钮）；`baselineRel = toRelativeEntry(cwd, baselinePath)`，相对化失败回退直开。测试流页 `onRevealPath` 线到两张卡。

【变更】`EnterpriseDocViewer.tsx`/`EnterpriseDocsCard.tsx`：删除「打开文件」按钮与 `onOpenFile` 通道——企业规范只读文档仅保留预览。

【变更】`locales.ts`：新增 `qolAssetReveal: '打开文件夹'` / `'Reveal in folder'`；移除指令集标题/说明与 qflowIntro 键（见需求 4/5）。

**顺手修复（重要）**：`QualityFlowCard.tsx` 的本地 `join()` 此前用 `''` 拼接 class——两个哈希类名熔成一个不存在的类（本批 `qflowDocChip×pathChip` 静默丢样式；既有受害者：side-chain 阶段的 `qflowPhase×qflowPhaseSide`、`qflowSwitchGroup` 弱化态）。改为 `join(' ')` 与其它四卡一致。web 实测复现→修复→复核（`cursor:pointer` + 透明下划线 + hover 变品牌色）。

## 3. 需求 3：一键安装含 .clang-format（批次十四复核）

无代码变更。host `installQualityToolchain` 调 `applyEnterpriseStandards({packs:['quality','c']})`；`.clang-format` 在 `QUALITY_ASSET_FILES` 清单与 c 包资产目录（`assets/enterprise/c/.clang-format`），`apply-enterprise-standards.spec.ts:52-57` 断言 `packs:['c']` 即落盘 `.clang-format` 且内容含 `BasedOnStyle`。

## 4. 需求 4：00 前置节点 + 药丸开关 + 删八步链说明

【变更】`QualityFlowCard.tsx`：删除八步链说明段；「前置」虚线带改为标准节点卡 `baf-quality-flow-prereq`（`qflowNode` 同款样式，序号气泡 `00`），渲染在 rail 首位（`nodes` 映射之前）。

【变更】`StandardsOverview.module.css`：删除 `.qflowPrereq/.qflowPrereqHint`；`.qflowSwitches` 改横排；新增 `.qflowSwitchGroup` 药丸（`inline-flex; gap:7px; padding:2px 8px 2px 11px; border-radius:999px; background:8% 灰填充`）——启用/失败中止同列一药丸，弱化不突兀。

web 实测：nodeOrder = `[prereq, build, test, instrument, report, gate, lint, analyze, format]`，prereq `firstInRail:true`、`sameAs01:true`（radius 10px/bg/border 全等）；switchPills 16 枚（8 节点 × 启用/失败中止）全部 999px + `rgba(127,127,127,0.08)`。

## 5. 需求 5：指令集删「状态指令 · 按阶段查看」

【变更】`CommandsCard.tsx`：删 `cardTitle` 标题行与 `cardDesc` 说明段，卡直接从状态流程图开始；`locales.ts` 同步移除 `cmdStateTitle/cmdStateIntro`（zh+en）。web 实测 0 命中。

## 6. 需求 6：Tab 间距一致

【变更】`StandardsOverview.module.css`：`.blockQuality` 内边距 8→16px 对齐其它 tab 块。web 实测六 tab 首元素 gap 全 15px（通用/项目工程/确认门/指令集/企业规范/测试流）。

## 7. 需求 7：测试流链接仅验证 + 验证门禁

【变更】`ui-baf-workflow/src/client/WorkflowView.tsx`：jump 表收敛为 `TEST_FLOW_JUMPS = { verify: 'test' }`——implement/archive 卡的测试流 chip 移除，仅验证节点保留（`flow-node-testflow-verify`）。

【变更】`baf-quality/src/test-flow.ts`（新导出集，10 用例覆盖）：
- `readTestFlowToggles(root)`——`.baf/quality/test-flow.json` 开关读取（缺失/畸形→{} 全参与；行缺省字段→enabled/haltOnError 默认）。
- `testFlowCompletion(root)`——完成度判定：按开关 demanded 的 durable evidence（`.baf/reports/ut-coverage.json` 覆盖率 passed+line≥minimum；`static-analysis.json` passed+errors=0）；覆盖率链任一启用即要求覆盖率报告；问题行带数字（`ut_coverage.failed line=61 minimum=80`、`static_analysis.failed errors=3`、`*.missing`）。
- `testFlowGated(baseline)`——`stack.test === '<enterprise-tbd>'` 时 false（占位工作区不门禁，避免新工作区死锁——2026-09-22 教训语义）。

【变更】`baf-workflow/src/stages/verify.ts`：CheckRunner 注册 `test-flow` 检查——`required = qualityWired && baseline 存在 && testFlowGated`；占位时 `ok:true + skipped` 诊断；真实基线时跑 `testFlowCompletion`，不绿即失败行进入既有 T11 退回（backToImplement + 修复工单）。

【变更】测试：`baf-workflow/tests/stages.spec.ts` 新增真实测试命令基线的闭环用例（缺报告 T11 退回 → 双报告落盘后 `test flow complete` 通过）；占位用例追加 `test-flow {required:false, ok:true}` 行断言。

**web 真机会话图探针说明**：dev 实例无可打开会话（demo1/demo50 均空白，单击/双击后主区「空面板」——即记忆中的 dev 会话空白陷阱），chip 位置以源码唯一注册点 + 测试为证；host 门禁逻辑由 stages.spec 闭环覆盖。

## 8. 构建

`pnpm run build` 九门全 PASS → brand-web（BAF DSH / v0.0.38）→ pack-dsh（`packed dsh ->` 校验、help/index.html 在包内）→ `overlay/desktop npm run dist -- --dir` → `win-unpacked/baf-dsh.exe`（**0.0.38.0**，无安装包，按客户要求）。

**两处构建期拦截（均已修）**：
1. `tsc` TS2345：`main.ts:794` 的 `markLaunch('splash-bg-start')` 相位不在 `LaunchPhase` 联合里 → `launch-timings.ts` 补 `'splash-bg-start'` 成员。
2. **ESM preload × sandbox:true 静默死**：包按 `type:module` 产出 ESM preload，而 sandboxed preload 只能以 CommonJS 加载——`import { contextBridge, ipcRenderer }` 直接 SyntaxError，桥从未注入，`后台启动` 点击成了静默 no-op（首发 exe 冒烟实测 `window.bafSplash === undefined`、timings 无 bg-start mark）。修法：splash 窗口 `sandbox:false`（与 dialog/desktop 两个兄弟窗口同姿态，本地可信内容）。复测：`bridge:"object"` → 点击 → splash `visibilityState:'hidden'` + `splash-bg-start @8750ms` mark + 托盘 tooltip → 38.9s `main-shown` → 主窗口 `visibility:'visible'`、32 按钮渲染完整。

exe 冒烟（--remote-debugging-port=9200）：splash 5 秒后浮出「BAF服务首次启动时间稍久，请耐心等待」+「后台启动」；点击隐藏 splash 后台续启；主窗口就绪自动出现——需求 1 全链路真机闭环。
