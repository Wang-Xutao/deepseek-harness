# 批次十二（2026-10-22）：图 Tab 定序 + 测试流图手动运行/配置入口/配置文件预览 + 质量资产清单 — desktop 0.0.34

> 需求原句：修改baf-dsh桌面应用，需要打开web端进行验证确认，无误后生成baf-dsh.exe桌面应用，不打安装包：1. 会话中tab几个图tab的位置要固定，即使取消显示再显示也不变。轨迹图、工作流图、测试流图前后在一起，位置在会话和轨迹后。如果有其他tab页，在都要在这三个图后 2. 测试流图： 2.1 节点要增加独立的运行按钮，支持手动触发单个阶段的测试； 2.2 删除"执行纪律 …"； 2.3 顶部添加"配置"按钮，和工作流的"配置"按钮功能一致； 2.4 测试的这些所有相关指令，添加baf封装； 2.5 clang-format卡片，删除"无独立报告，以代码冻结检查为准"，并增加可配置的路径，点击后触发该路径的格式化； 2.6 测试流图中，各个节点需要配置的也要添加上，比如cpplint的配置文件，是需要在工程目录下受git控制的，需要能够模态框预览，支持文件打开。发散看下其他的也都要加进来 3. 工作流中，质量监控的质量资产是什么，是相关的配置文件吗？需要明确列出来，并支持预览和打开。没有选装，都是必装。删除"测试流图 · 单元测试执行流程"。删除"必装工具步骤/选装工具步骤"图例，删除"执行纪律 顺序：check…入口指令：/baf-quality check · /baf-quality lint。"

## 0. 结论速览

| # | 需求 | 落点 | 状态 |
| -- | ---- | ---- | ---- |
| 1 | 图 Tab 位置固定 + 三图相连 + 其余排后 | `ui-baf-tracegraph/client/index.ts` + `ui-baf-workflow/client/index.ts` 唯一 order 11/12/13 | ✅ 轨迹图 11 / 工作流图 12 / 测试流图 13，紧跟 对话 10（轨迹）之后、其余 Tab（bili-context 30 等）之前；web 实测关→开回到 x=595 原位 |
| 2.1 | 节点独立运行按钮 | `TestFlowView.tsx` FlowNode 兄弟按钮 + `runTestFlowStage` @Remote | ✅ 8 节点各一枚 运行，真实退出码+输出尾（run-result-{id}） |
| 2.2 | 删除执行纪律横幅 | `TestFlowView.tsx` band 区块 + `tflow.bandTitle/band/formatNote` 三键删除 | ✅ 页面正文 0 处「执行纪律」 |
| 2.3 | 顶部配置按钮 | `TestFlowView.tsx` header `baf-test-flow-config` → 设置·工作流 | ✅ 与工作流图配置按钮同宿（gotoSettings 工作流子页） |
| 2.4 | 指令 baf 封装 | `baf-quality/src/test-flow.ts` command 字段 | ✅ build/test→baf-quality test、instrument/report/gate→baf-quality check、lint/analyze→baf-quality lint、format→clang-format -i |
| 2.5 | clang-format 可配置路径 | `fmtRow`（`baf-test-flow-format-path`）+ formatPath store 字段 | ✅ 默认 `source`，运行对该路径 `clang-format -i`；「无独立报告」注记已删 |
| 2.6 | 各步骤配置文件 chips + 模态框预览/打开 | `tab-types.ts` 每步 `configFiles` + cfg chips + `readWorkspaceFile` @Remote + preview 模态框 | ✅ 8 步全覆盖；CPPLINT.cfg 实测预览出 SORA 定制内容 + 打开文件 |
| 3 | 质量资产明确列出 + 预览/打开；全必装；删卡删图例 | `QualityAssetsCard.tsx`（新）+ `standards-store.ts` qualityAssets 远端 + 删 `QualityFlowCard`/`quality-flow-catalog` | ✅ 7 行逐一列出（路径+角色说明，受 git 控制、一键安装写入），每行 预览/打开；工具表 7 项全「必装」、正文 0 处「选装」；工作流图图例与执行纪律横幅删除 |

测试：`ui-baf-workflow`（test-flow.client.spec）+ `ui-settings-baf-standard`（standards-overview.client.spec.tsx）等四 spec 文件 83 用例全绿；host/client 两平面 `build:lib`（tsc -b + tsdown）全绿。

## 1. 需求 1：图 Tab 定序（位置固定）

【变更】`packages/client/ui-baf-tracegraph/src/client/index.ts`：conversation.view 安装 order 改为 **11**（唯一值，带批次十二注记）；设置行 order 5 与 sidebar panellist order 20 不动（既有 spec 依赖）。

【变更】`packages/client/ui-baf-workflow/src/client/index.ts`：baf-workflow order **12**、baf-test-flow order **13**。三个图 Tab 连续且唯一，插在 对话(10)/轨迹 之后；后续任何 Tab（上下文 30、将来新增）按数值自然排其后。取消显示再显示不再受「按安装先后插入」影响——位置由 order 数值唯一决定。

web 实测（Edge CDP 1440×2400）：strip 坐标 对话 308 / 轨迹 370 / 轨迹图 432 / 工作流图 507 / 测试流图 595 / 上下文 683；设置·工作流关掉测试流图后 strip 少该 Tab 且其余坐标不变，重新打开后测试流图精确回到 x=595。

## 2. 需求 2：测试流图六项

### 2.1 节点独立运行按钮

【变更】`packages/client/ui-baf-workflow/src/client/tab-types.ts`：新增 `BafWorkflowStageRunRequest`（sessionId、stage、可选 formatPath）与 `BafWorkflowStageRunResult`（status ready/no-cwd/tool-missing、exitCode、durationMs、outputTail）两契约；`WorkflowTabActions` 增 `runStage(stage, arg?)`。

【变更】`packages/client/ui-baf-workflow/src/index.ts`：host 侧新 `@Remote('runTestFlowStage')`——按 stage 解析 baf 封装命令（与 2.4 同一张映射表），`child_process.spawn` 于工作区 cwd，收集退出码/时长/stdout+stderr 尾部（定长截断），**绝不虚构结论**：没工作区回 no-cwd，没装工具回 tool-missing。arity 全必填，符合 @Remote 纪律。

【变更】`packages/client/ui-baf-workflow/src/client/TestFlowView.tsx`：FlowNode 的 运行 按钮是**兄弟节点不是嵌套**（pick button 内层禁嵌 button）；running 态 `…` + disabled + aria-busy；结果落详情面板 `baf-test-flow-run-result-{id}`（成功绿/失败红 + 时长 + 输出尾）。

### 2.2 删除执行纪律横幅

【变更】`TestFlowView.tsx` 删 band 区块；`locales.ts` WorkflowTabKey 联合类型同步删 `tflow.bandTitle/tflow.band/tflow.formatNote` 三键（zh/en 字典本就未再引用）。

### 2.3 顶部配置按钮

【变更】`TestFlowView.tsx` header 右侧增「配置」（`data-testid="baf-test-flow-config"`），点击与工作流图「配置」同款动作——跳设置·工作流子页（通用页含三图显示开关）。web 实测点击后落在设置·工作流页。

### 2.4 指令 baf 封装

【变更】`packages/baf/baf-quality/src/test-flow.ts`：8 步 command 全部改为 baf 封装——build/test → `baf-quality test`（gcc 编译 + 测试框）、instrument/report/gate → `baf-quality check`（覆盖率链 + 门禁）、lint/analyze → `baf-quality lint`（cpplint + cppcheck）、format → `clang-format -i <配置路径>`；同时 8 步 `required: true`（全部必装，配合需求 3「没有选装」）。测试断言 stageCommand 映射三组各归其位。

### 2.5 clang-format 可配置路径

【变更】`TestFlowView.tsx`：选中 format 步骤时详情面板渲染 `fmtRow`（`baf-test-flow-format-path`）——label + 文本输入（默认 `source`，store 字段 `formatPath`，onChange 走 store changeFormatPath）；「无独立报告，以代码冻结检查为准」注记删除，作用文案改为「对本轮涉及的 c/h 做最终排版（clang-format -i）……」。运行按钮即对该路径执行格式化（命令行显示 `clang-format -i <配置路径>`）。

### 2.6 配置文件 chips + 模态框预览/打开

【变更】`tab-types.ts`：8 步每步新增 `configFiles: string[]`（工程目录相对路径、须受 git 控制）——build/test → project.yml + .baf/quality/ceedling-config.json；instrument/report/gate → project.yml；lint → CPPLINT.cfg；analyze → cppcheck-suppressions.xml；format → .clang-format。spec 断言：全部非空、无前导 `/`、无盘符、无 `..`，format 含 .clang-format、lint 含 CPPLINT.cfg。

【变更】`src/index.ts`：新 `@Remote('readWorkspaceFile')`（单必填 request：sessionId+path）——读工作区内文件全文（大小封顶 `BAF_WORKFLOW_FILE_READ_MAX_BYTES`，越界截断标注），路径越界/不存在结构化回错，不抛裸异常。

【变更】`TestFlowView.tsx`：详情面板「配置文件」区按步渲染 chips（`baf-test-flow-cfg-<slug>`，slug 保留大小写：CPPLINT.cfg → CPPLINT-cfg）；点击开模态框 `baf-test-flow-preview`——头部路径、`<pre>` 全文、关闭/打开文件两钮（打开走 openPath 侧栏宿主能力），Escape/遮罩可关。web 实测：lint 步 CPPLINT.cfg 预览出真实 SORA 定制内容（`set noparent`…），打开文件按钮在位。

## 3. 需求 3：质量资产清单 + 全必装 + 删卡删图例

### 3.1 质量资产是什么 → 明确列出

质量资产 = 质量监控的全部产线资产，**就是这 7 个工程配置文件**（由一键安装写入工程目录、受 git 控制，各测试/检查阶段按它们运行）：

| 文件 | 角色 |
| ---- | ---- |
| project.yml | Ceedling 工程配置（UT 构建/路径） |
| .baf/quality/ceedling-config.json | 质量门禁配置（阈值/门禁模式/报告路径） |
| CPPLINT.cfg | cpplint 规则（SORA 定制） |
| cppcheck-suppressions.xml | cppcheck 抑制列表 |
| .clang-format | clang-format 排版规则 |
| .baf/quality/ceedling-README.md | UT 工程说明 |
| .baf/quality/static-analysis-README.md | 静态分析入库说明 |

【变更】`packages/client/ui-settings-baf-standard/src/index.ts`：`QUALITY_ASSET_FILES` 常量（rel + roleKey，唯一事实源）从这里出；`src/types.ts` 新 `BafQualityAssetsResult`/`BafQualityAssetReadResult` 两平面契约。

【变更】host 侧（同文件服务）：新 `@Remote qualityAssets()`（零参：cwd + 7 行 {rel, roleKey, exists}）与 `@Remote readQualityAsset(request)`（单必填 rel；真实读取 + 封顶，不存在/越界结构化回错）。

【变更】`standards-store.ts`：state +`qualityAssets`/`qualityAssetSeq`/`qualityAsset`；face +`loadQualityAssets()`（挂载即拉，notice 走 qualityEnvNotice 通道）/`openQualityAsset(rel)`（**seq 令牌防竞态**：慢响应按 seq 丢弃；传输失败回 `{status:'unreadable'}` 不弹裸错）/`closeQualityAsset()`（seq+1 清 payload）。

【变更】`QualityAssetsCard.tsx`（新组件）：卡头说明句（资产是什么、受 git 控制、一键安装写入）+ 7 行列表（路径 mono + 角色说明 + 缺失置灰 chip + 预览/打开两钮）；预览模态框（scrim/头/`<pre>` 全文/打开文件，Escape+遮罩关闭，缺失/读不了分别给文案）。`StandardsOverview.tsx` 挂载时 `loadQualityAssets()`，卡替换原 QualityFlowCard 位。CSS 新 `.assetPre`（等宽 12px/1.6、fill-l1、滚动）。

### 3.2 全必装 + 删卡删图例

【变更】删除 `QualityFlowCard.tsx` 与 `quality-flow-catalog.ts`（git rm；「测试流图 · 单元测试执行流程」卡从设置面消失，漂移面收窄）；`tsconfig.client.json` files 清单同步。

【变更】工具表（QualityEnvironmentCard 数据面）7 项全「必装」，无选装列；工作流图删「必装工具步骤/选装工具步骤」图例与「执行纪律」横幅（与 2.2 同源文案，工作流图正文 0 处「选装/执行纪律」——web 实测计数 0）。

【变更】`locales.ts`（ui-settings-baf-standard）：`qolAsset*` 七角色键 + 卡头/预览/打开/缺失/读取失败等键 zh/en。

## 4. 测试

- `ui-baf-workflow/tests/test-flow.client.spec.ts`：+configFiles 合法性断言（每步非空、工作区相对、无盘符/`..`；format 含 .clang-format、lint 含 CPPLINT.cfg）+ stageCommand baf 封装映射断言（动态 import）。
- `ui-settings-baf-standard/tests/standards-overview.client.spec.tsx`：catalog parity（7 条 rel 精确按序、roleKey 唯一、直接 import `QUALITY_ASSET_FILES`）+ QualityAssetsCard 挂载即拉一次/行渲染（`baf-quality-asset-CPPLINT-cfg` 大小写敏感）/预览路由与遮罩关闭/打开手势（openPath 收到拼好的绝对路径）。
- 定向 4 spec 文件 83 用例全绿（vitest 须在 repo 根跑）；`pnpm run build:lib` host+client 两平面全绿。

## 5. web 真机验证（Edge CDP :9200 → http://127.0.0.1:3080）

- 需求 1：strip 六 Tab 顺序与坐标（见 §1）；关→开往返，测试流图回到 x=595。
- 需求 2：8 枚运行按钮在位；正文无「执行纪律」；配置按钮落设置·工作流；lint 步 CPPLINT.cfg 预览模态框出真实内容 + 打开文件；format 步「格式化路径」输入框（值 source）。
- 需求 3：质量资产卡 7 行 testid 齐全按序、预览模态框出 project.yml 全文 + 打开钮；正文「选装」0 处、「必装」7 处（工具表）；「单元测试执行流程」0 处。

## 6. 遗留问题（按影响排序）

1. **dev:web 长跑仍会卡死**（非本批引入）：tsdown watch 静默烧 CPU、永不进入 vite/dsh web 启动段；本批以「build:artifacts 一次 + 直启 host」绕过。下次可排查 watchClientPlugins 就绪门与 tsdown watch 的兼容性。
2. **模态框预览只读**：预览是快照，不跟随磁盘变化；需要「刷新」得重开。当前规模可接受。
3. **格式化路径无校验**：formatPath 接受任意字符串，拼写错误时 clang-format 报错原样回显（真实退出码），未做路径存在性预检——按「不虚构结论」原则保留原样报错。
