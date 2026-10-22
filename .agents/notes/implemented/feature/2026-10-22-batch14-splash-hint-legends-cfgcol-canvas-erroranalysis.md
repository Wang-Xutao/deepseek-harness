# 批次十四（2026-10-22）：splash 首启提示 + 流程图图例删除 + 测试流配置文件列 + 画布美化 + 运行错误解析 — desktop 0.0.37

> 需求原句（五部分）：1. splash页面，如果是首次打开时间比较久，需要在右上角显示提示，告诉用户。2. 工作流，项目工程、确认门两个流程图删除图例。3. 工作流，测试流页面，删除「质量资产 已应用到工作区」行，而是需要在「用途」后增加一列，列出所需要的配置文件名称，点击即可模态预览，预览框右上角有「打开」按钮。安装环境时需要将配置文件按照默认模板复制进项目工程。4. 工作流，测试流的流程图需要进行ui优化，更加美化炫酷，信息显示的更加完整。5. 会话中，测试流图中，运行后，如果报错，需要增加对错误的解析说明，说明错误是什么原因，如何解决。

## 0. 结论速览

| # | 需求 | 落点 | 状态 |
| -- | ---- | ---- | ---- |
| 1 | splash 首次打开右上角提示 | `overlay/desktop/src/main.ts` + `ui/splash.html/.css/.js` | ✅ 首启判定 = `prefs.nodeBinary === undefined`（缓存仅在 splash 之后的 startDshProcess 里写入）；`first=1` query → 3 秒宽限后右上角浮出「首次启动正在初始化运行环境…」；file:// 直载两态实测（有 first=1 显示 / 无则 hidden） |
| 2 | 项目工程、确认门删图例 | `GatesOverviewRow.tsx/.module.css` + `locales.ts` | ✅ web 实测：项目工程 `legendItem` 0 个、hooks 图例 0 节点；确认门 `legendBar` 0 节点、10 个 ×N 徽章保留 |
| 3 | 环境表删资产行 + 用途后「配置文件」列 + 模板落盘 | `QualityEnvironmentCard.tsx` + `StandardsOverview.tsx` + host `src/index.ts` | ✅ 「已应用到工作区」行删除；配置文件 chips 按工具列出（tool-keyed testid），点击 AssetModal 预览真实内容 + 右上角「打开」；未写入淡显「未写入」；一键安装 packs 扩为 `['quality','c']` 双包全量模板（demo1 实测 `.clang-format` 未写入 ⇒ c 包未装的判定正确） |
| 4 | 测试流画布美化炫酷 + 信息完整 | `QualityFlowCard.tsx`（STAGES/FlowLink/toolState）+ `StandardsOverview.module.css` | ✅ 品牌色渐变竖向导轨 + 序号渐变气泡（光晕环）+ 主链/独立阶段徽章 + 工具环境状态 chip + 节点卡内嵌品牌色边条 + hover 浮起；视觉审查 8/10 后三处精修（气泡对比度、卡片外 elevation、15px chevron 居中 481.0 vs 气泡 481.5）全复核 |
| 5 | 运行报错解析说明 | `TestFlowView.tsx`（analyzeRunFailure）+ `locales.ts` + `.module.css` | ✅ 失败运行渲染「错误解析」卡（testid `baf-test-flow-run-analysis-<stage>`）：九类规则 + 兜底通用，逐类给「原因/解决方法」；demo1 真机跑 format 实测：首版落入 generic → 按实况补 3b 路径缺失规则 → 复测命中「命令要访问的文件或目录在工程里不存在」 |

测试：`ui-baf-workflow` + `ui-settings-baf-standard` 共 **13 文件 182 用例全绿**（新增 analyzeRunFailure 分类器 9 用例）；两包 host/client 平面 `tsc -b` 全绿；`pnpm run build` 九门全 PASS；打包 `dist:dir` 出 `win-unpacked/baf-dsh.exe`（0.0.37，无安装包，按客户要求）；exe 冒烟启动 5 进程稳定。

## 1. 需求 1：splash 首次启动提示

**首启判定**：Node 运行时缓存在 `startDshProcess` 里才写入，而它在 splash 之后才跑——所以 splash 时刻 `prefs.nodeBinary === undefined` 就是「第一次」。

【变更】`overlay/desktop/src/main.ts`：openSplash 计算 `firstLaunch = prefs.nodeBinary === undefined`，`loadFile` query 增发 `first: '1'`。

【变更】`overlay/desktop/ui/splash.html`：`.panel` 内新增 `<p id="firstHint" class="firstHint" hidden>`（文案：首次启动正在初始化运行环境，耗时可能较长，请耐心等待）。

【变更】`splash.css`：`.panel` 加 `position:relative`；`.firstHint` 绝对定位右上角（`top:10px; right:12px`），accent 色 + 10% 底、圆角 8px、10.5px 字。

【变更】`splash.js`：`first=1` 时 `setTimeout(3000)` 后摘 `hidden`——启动 3 秒内完成的用户永远看不到闪烁。

实测：file:// 直载 splash.html（Electron splash 是静态文件，query 契约可直测）——带 `first=1` 4 秒后 `hint.hidden === false`、文案正确、版本号 `v0.0.36` 前缀剥离正常；不带 `first=1` 保持 `hidden === true`。

## 2. 需求 2：两个流程图删图例

【变更】`GatesOverviewRow.tsx` / `.module.css` / `locales.ts`：项目工程图的「必装工具步骤/选装工具步骤」图例与确认门图的图例条整行删除（样式类与 locale 键同步清掉）；节点上的 ×N 计数徽章保留（那是信息不是图例）。

web 实测：`legendItem`/`hooksLegend`/`legendBar` 选择器全 0；确认门 10 个 ×N 徽章仍在。

## 3. 需求 3：环境表「配置文件」列 + 模板落盘

【变更】`QualityEnvironmentCard.tsx`：
- 删除「质量资产 已应用到工作区」整行及其判定；
- 「用途」列后新增「配置文件」列（`qolEnvColConfig`）：`TOOL_CONFIG_FILES` 按工具映射（gcc→project.yml；ceedling→project.yml+ceedling-config.json；cpplint→CPPLINT.cfg；cppcheck→cppcheck-suppressions.xml；clang-format→.clang-format；ruby→无），chips 点击 `openCfg(rel)` → 共享 `AssetModal` 预览真实文件内容（右上角「打开」直达）；
- chip 的 testid 带 tool key（`baf-quality-env-cfg-<tool>-<rel>`）——project.yml 在 gcc/ceedling 两行都有，不带 key 会撞多元素；
- `cfgExists(rel)` 从已加载资产清单判定在盘状态，缺失时 chip 淡显 + `· 未写入`。

【变更】host `ui-settings-baf-standard/src/index.ts`：`installQualityToolchain` 的 packs 由 `['quality']` 扩为 `['quality', 'c']`——c 包补齐 CPPLINT.cfg / cppcheck-suppressions.xml / .clang-format / project.yml 等全部模板，一键安装即全量落盘。

web 实测（demo1）：project.yml chip 点击出模态、真实 YAML 内容、右上角「打开」在；`.clang-format · 未写入`（demo1 只装过 quality 包没装 c 包——判定与 packs 扩容逻辑互证）。

## 4. 需求 4：测试流画布美化

【变更】`QualityFlowCard.tsx`：STAGES 携带 `envTool`（步骤主工具）与 `chain: 'main' | 'side'`；head 行加工具环境状态 chip（环境探针 ok/缺失/未知）与「主链/独立」阶段徽章；`FlowLink` 连接件（2px 渐变竖轨 + chevron 箭头，aria-hidden）。

【变更】`StandardsOverview.module.css`：`--qf-accent` 取确认门/工作流图同源品牌 token；`.qflowIdx` 序号气泡渐变填充 + 3px 光晕环；`.qflowNode` 内嵌 2px 品牌色边条 + hover 上浮（`prefers-reduced-motion` 门控）；`.qflowNodeOff` 虚线降透明。

视觉审查（PNG→视觉模型）初评 8/10，三处精修后复核：
1. **气泡对比度**——渐变末端掺 14% 深墨（`color-mix(accent 86%, #1f2430)`）+ 字重 700，白字对浅琥珀也过 4.5:1；
2. **卡片分离度**——`.qflowNode` 叠 `0 1px 4px rgba(0,0,0,.05)` 外 elevation；
3. **chevron 太小**——12→15px、描边 1.6→1.8，轨心对齐实测（chevron 心 481.0 / 气泡心 481.5）。

## 5. 需求 5：运行错误解析（会话测试流图）

【变更】`TestFlowView.tsx`：新增导出 `analyzeRunFailure(stage, tool, result, t)`——只在真实失败（`tool-missing` 或 `exitCode ≠ 0`）时返回 `{cause, fix}`；有序规则：

| 序 | 规则 | 判据要点 |
| -- | ---- | ---- |
| 1 | 超时 | exit 124 / `timed out|超时` |
| 2 | 工具缺失 | status `tool-missing` 或「不是内部或外部命令 / not recognized」措辞；点名输出里出现的 TOOL_TOKENS 工具，否则步骤主工具（{tool} 替换） |
| 3 | 配置文件缺失 | 文件级 miss 措辞 **且** 输出含已知模板名（project.yml / .baf/quality/ceedling-config.json / CPPLINT.cfg / cppcheck-suppressions.xml / .clang-format） |
| 3b | 路径不存在 | 文件级 miss 措辞但不含模板名（复核新增：demo1 实况 `clang-format -i source` → `source: no such file or directory`，命令输入路径不存在） |
| 4 | 权限/占用 | `permission denied|访问被拒绝|eperm|eacces|正在被另一(个\|程序)` |
| 5 | 静态检查发现 | lint/analyze 阶段失败即是发现（**先于**编译规则——cpplint 输出满是 error+.c 行，会被编译规则吃掉） |
| 6 | 编译/链接 | error+.c/.h 锚定 / undefined reference / multiple definition / build、instrument 阶段兜底 |
| 7 | 单测失败 | `FAILED` 列表 / test 阶段兜底 |
| 8 | 覆盖率不达标 | coverage 措辞 / gate、report 阶段兜底 |
| 9 | 通用兜底 | 原话「命令以退出码 {code} 结束，没有命中已知的错误模式」+ 指引看输出尾/贴给 AI |

渲染：运行结果块头部下方 `data-testid="baf-test-flow-run-analysis-<stage>"`，danger 边框卡内「错误解析」标题 + 原因/解决方法两行（`.runAnalysis*` 样式，`.module.css` 批次十四 5 段）。

【变更】`locales.ts`：zh/en 各 +27 键（errTitle/errCause/errFix + 九类 Cause/Fix 对，`{tool}`/`{code}` 调用点 `.replace()`）。

【变更】`tests/test-flow.client.spec.ts`：`analyzeRunFailure classifier` describe 10 用例——identity `t` 钉死命中哪条规则、模板 `t` 钉死 {tool}/{code} 替换；含「lint 输出带 error+.c 仍判静态」「非模板路径 miss 判路径不存在（复核）」。

真机闭环（demo1 会话·测试流图·format 运行）：首版实测落入 generic（输出 `source: no such file or directory` 不含模板名）→ 补 3b 规则 → 复测卡内文案「原因：命令要访问的文件或目录在工程里不存在——命令并没有真正执行成功。解决方法：对照输出里报错的路径检查工程目录结构…」✅。

## 6. 构建

0.0.36 → 0.0.37：`overlay/desktop/VERSION`、`package.json`、`version-notes.json`（desktop.notesZh/notesEn 批次十四文案；发现批次十三漏更该文件，本批恢复惯例）。

`pnpm run build` 九门 PASS → `brand-web.mjs`（title/label v0.0.37）→ `pack-dsh.mjs` → `dist:dir`（**无 NSIS 安装包**，按客户要求）→ `overlay/desktop/dist/win-unpacked/baf-dsh.exe`（ProductVersion 0.0.37.0，约 195MB）。exe 冒烟：主/渲染/GPU 5 进程稳定，Session Storage 有真实页面活动。

## 7. 遗留（按优先级）

1. **0.0.36 的 version-notes 档案缺失**：批次十三提交没更新 desktop notes（当时随包仍显示批次十二文案）。0.0.37 起已恢复；如需补档可从 `79540ec8da` 提交说明反推。
2. 画布 head 行在窄列下「阶段徽章 + 工具状态 chip + 名称」可能拥挤（视觉审查提示，当前 1600px 下无碍）——后续可把状态 chip 折到命令行尾。
3. 工具点名依赖 TOOL_TOKENS 白名单，白名单外的自定义工具回落到步骤主工具名（诚实但少一分精确）。
4. 首启判定基于 `prefs.nodeBinary`——用户清缓存后重装场景会再看到一次提示（3 秒后出现、非首装误伤可忽略）。
