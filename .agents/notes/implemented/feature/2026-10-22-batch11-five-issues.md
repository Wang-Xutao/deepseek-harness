# 批次十一（2026-10-22）：通用文案微调 + 推荐插件导入导出 + 指令集两大卡详解 + 企业规范 markdown 渲染 + 测试流图点击检视 — desktop 0.0.33

> 需求原句：修改baf-dsh桌面应用，需要打开web端进行验证确认，无误后生成baf-dsh.exe桌面应用，不打安装包：1. 主页工作流，通用页。"关闭后，对话 Tab 不再显示「测试流图」（单元测试结果）。"改为"关闭后，对话 Tab 不再显示「测试流图」。" 2. 设置，推荐插件，增加推荐插件的导入导出功能，可以导出推荐插件列表到配置文件，也可以导入配置文件更新推荐插件列表。3. 主页工作流，指令集，删除图例。将状态指令和全局指令分成两个大卡片显示。所有指令要有更加详细的解释说明，让用户清晰的知道指令的作用和实现的功能，以及指令运行的结果是什么。4. 主页工作流，企业规范，删除图例。文档预览的模态框能否渲染markdown文档，而不是显示原文。5. 优化美化显示会话的测试流图，要求显示的更加详细，点击对应节点后，右侧会显示对应的详细信息和执行结果，尽可能详尽。直观，美化。

## 0. 结论速览

| # | 需求 | 落点 | 状态 |
| -- | ---- | ---- | ---- |
| 1 | 通用页「测试流图」开关描述去括注 | `ui-baf-workflow/locales.ts` | ✅ zh「关闭后，对话 Tab 不再显示「测试流图」。」/ en 同步；仅文案 |
| 2 | 推荐插件导入/导出 | `baf-featured` overlay + 2 新 @Remote + `FeaturedSection` 常驻配置行 | ✅ 导出存 featured-plugins.json；导入整体验证通过即整体替换（dsh home 覆盖层，重启仍生效；坏覆盖层报错不静默回退种子） |
| 3 | 指令集删图例、两大卡、作用/功能/结果三行详解 | `CommandsCard.tsx` 重写 + catalog 新增 `result` 字段 | ✅ 「状态指令 · 按阶段查看」「全局指令 · 任何状态可用」两大卡；desc/stars 奇偶锁定不变，详解入 effect+result |
| 4 | 企业规范删图例 + 预览渲染 markdown | `EnterpriseDocsCard.tsx` 删图例 + `EnterpriseDocViewer.tsx` MarkdownText | ✅ 标题/列表/表格/代码块 + 复制工具条（mdCopy 等 6 键双语言）；纯文本优雅降级 |
| 5 | 会话测试流图点击检视 | `TestFlowView.tsx` + CSS + tflow.* 新键 | ✅ 左状态色步骤链（编号/点/名称/工具·类型/命令/指标）+ 右详情面板（kv 行 + 作用 + 执行结果 + 打开报告/未运行提示）；数据契约不变 |

测试：baf-featured 新增导入导出 4 例、ui-settings-featured-plugins 新增配置行 2 例、ui-settings-baf-standard 指令集断言翻转 + 两卡/三行/无图例新例 + markdown h1 断言——四包定向合计 127 用例全绿；host/client 两平面 `tsc -b` 全绿。

## 1. 需求 1：通用页开关描述（文案）

【变更】`packages/client/ui-baf-workflow/src/client/locales.ts`：zh `settings.testFlowTab.description` 去「（单元测试结果）」括注——页签名「测试流图」已自明；en 同步为 `Turn off to hide the Test flow tab on the conversation view.`。无逻辑变更。

## 2. 需求 2：推荐插件导入/导出

### 2.1 宿主侧（baf-featured）

【变更】`src/overlay.ts`（新文件）：dsh home 下 `featured-manifest.json` 覆盖层的读/写——`featuredOverlayPath()`（默认 `resolveDshHome()`）、`readFeaturedOverlay()`（文件不存在返回空；存在则复用 `readFeaturedManifest` 的读取+校验链）、`writeFeaturedOverlay()`（writeFileAtomic，mode 0600，与 featured-state 同款持久化纪律）。

【变更】`src/service.ts`：私有 `effectiveManifest()` = 覆盖层优先（校验通过即用；**覆盖层坏了把错误原样上报，绝不静默回退种子**——客户导入过东西，就该看到为什么没生效），否则回退 `BAF_DSH_FEATURED_MANIFEST` 环境种子；`list()`/`entryFor()`/`checkUpdates()` 三个读取点全部改走 effectiveManifest（导入即时生效，无需重启）。两个新 @Remote：

- `exportManifest()`（零参）：当前生效清单序列化为 canonical JSON 文本 + revision/count；读不到清单回 `{ok:false, error}`。
- `importManifest(text: string)`（单必填参，符合 @Remote 全必填 arity 纪律）：先 `JSON.parse`（坏 JSON 回 `not valid JSON: …`），再 `parseFeaturedManifest` 整体验证（schemaVersion/revision/逐条必填字段/重复 id——沿用清单校验单一事实源），**验证全过才落盘**覆盖层并 `announced()` 发 `featured-plugins/changed`（客户端自动重读卡片）；被拒文档零副作用。

【变更】`src/types.ts`：`FeaturedExportResult`（ok/text/revision/count/error）与 `FeaturedImportResult`（ok/revision/count/problems）两平结果类型；`src/index.ts` 导出 overlay 四符号。`packages/api/remotes/src/client/index.ts` 类型再导出清单补两类型（typert 聚合重建随 build:lib）。

### 2.2 设置面（ui-settings-featured-plugins）

【变更】`featured-store.ts`：state 新增 `exporting`/`importing` 两忙标志；face 新增 `exportConfig(): Promise<string | undefined>`（成功把清单文本递回组件存盘；失败落 notice）与 `importConfig(text)`（调远端；成功 notice 带「清单已导入，共 N 个插件生效。」本地化句、被拒引用 Host 校验问题串；两法互斥 + 防抖守卫，收尾防御性 `load()`）。

【变更】`FeaturedSection.tsx`：manifestError/空清单提示之后**常驻**渲染 `featured-config-row`（空清单也在——导入本就是清单的来路）：「导出清单」（忙态「正在导出…」）/「导入清单」+ 说明句 `configHint`（导入整体替换）+ 隐藏 `<input type="file" accept=".json">`（`display:none`，导入按钮代点；onChange 读 `file.text()` 后 `value=''` 复位以便重选同一文件）。导出落盘：`Blob` + 临时 `<a download="featured-plugins.json">` + `URL.createObjectURL` 即用即毁。导入/导出进行中连带置灰批量条/卡片动作/检查更新（整个列表是两者的操作对象）。notice 的 ok 分支改为「有自带句用自带句（导入计数），否则 applied」。

【变更】`locales.ts`：`exportConfig/exporting/importConfig/importing/configHint` 五键 zh/en。

### 2.3 桌面语义

导入落在 dsh home（`~/.dsh/featured-manifest.json`），优先于 main.ts 注入的 userData/打包种子——重启后仍生效；删除该文件即回到种子。web CLI host（不注 env）下导入同样是合法的清单来路。

## 3. 需求 3：指令集两大卡 + 作用/功能/结果

【变更】`baf-commands-catalog.ts`：`BafCommandEntry` 新增 `readonly result: string`（运行结果——运行后客户实际看到什么）；14 状态 + 11 全局共 25 条全部补写 effect（机制细化）与 result（结果描述）。**desc/stars 保持与 baf-workflow HELP_TABLES 逐字节一致**（奇偶锁定不动，丰富度全部进新字段）。parity spec 同步加锁：`result.length > 0`。

【变更】`CommandsCard.tsx` 重写为两张大卡：

- 卡一 `baf-commands-card`「状态指令 · 按阶段查看」（cardTitle + cardDesc 引导句）：原 8 节点画布（canvas/箭头/点击切明细，marker id 不变）+ 右侧明细列；
- 卡二 `baf-commands-global`「全局指令 · 任何状态可用」（独立 card + cardDesc）：`cmdListGrid`（auto-fill ≥340px 网格）平铺**完整** CommandRow——旧「全局带紧凑行」退役；
- `CommandRow` 统一三行详解：`作用`（desc，帮助表原文）→ `功能`（effect）→ `结果`（result），cmdFieldKey 标签 + 值分层排版；命令名 mono + ★ 推荐保留；
- 两处图例（状态指令图例 + 全局带图例）删除。

【变更】`locales.ts`（settings-standard）：删 `cmdLegendState/cmdLegendGlobal`；新增 `cmdStateTitle/cmdStateIntro/cmdGlobalTitle/cmdGlobalIntro/cmdUseLabel(作用)/cmdEffectLabel(功能)/cmdResultLabel(结果)`。`StandardsOverview.module.css`：`.cmdListGrid/.cmdField/.cmdFieldKey/.cmdFieldValue/.cmdFieldDesc` 新行样式，`.cmdDesc/.cmdEffect/.cmdListCompact` 退役；`CommandsCard` 不再收 `state` prop（StandardsOverview 调用点同步）。

## 4. 需求 4：企业规范删图例 + markdown 渲染

【变更】`EnterpriseDocsCard.tsx`：`hooksLegend` 图例行（enterpriseLegendDocs + enterpriseNodeNone 色点）删除，画布直起；locales 删 `enterpriseLegendDocs` 键。

【变更】`EnterpriseDocViewer.tsx`：ready 分支由 `<pre>` 直排原文改为共享原语 `MarkdownText`（@deepseek-ai/dsh-client-ui-primitives，聊天气泡同款渲染器）——标题层级/列表/表格/代码块（带复制/换行工具条）真正排版；`labels` 用 `useMemo` 按 t 构建（`mdCopy/mdCopied/mdCode/mdWrap/mdUnwrap/mdFootnotes` 六键 zh/en，参照 ui-chat markdown-labels 先例），t 身份稳定保 memo；testid `baf-enterprise-doc-body` 留在滚动宿主上。纯文本文档 markdown 优雅降级为段落（SKILL.md 全系兼容）。`.docBody` 去 mono/pre-wrap，改 markdown 宿主底色 + 内边距。

## 5. 需求 5：会话测试流图点击检视

【变更】`TestFlowView.tsx` 重写为左右分栏（数据契约、props、全部 testid 不变；纯展示层）：

- 左 `rail`（`<ol>`）：八节点按钮链——编号（01–08 mono）/ 状态色圆点 / 中文名+英文副题 / `tool · 必装|选装` chip / 命令 mono（title 全文）/ 右侧指标（gate 覆盖率%、lint 错误数、report 报告时间、format 纪律注记）+ 状态字；`baf-test-flow-step-<id>` + `data-state` + `aria-pressed` 保留在按钮上；竖向点线连接器；选中态 accent 边框+底色；
- 右 `baf-test-flow-detail`（data-step）：状态色头部（名+英文+状态徽章）→ `工具/类型/命令` 三 kv 行（命令 mono）→ `作用` 段落（`tflow.desc.*` 八条新文案：每步为什么存在、上下游关系、阈值语义）→ `执行结果` 卡：check 链步「已随 /baf-quality 链执行（报告时间 X）」/ gate「行覆盖率 X%（≥ Y%）」按判决着色 / lint·analyze「N 项错误」+ 报告时间 / report 步附 HTML 报告路径行 + `baf-test-flow-open-report` 按钮（存在才显）/ 未运行各步给「执行 /baf-quality check|lint 后此处显示结果」引导；底部点击提示句；
- 判决条/纪律横幅/刷新/no-cwd/错误条原样保留；`picked ?? 'build'` 默认选中第一步。

【变更】`TestFlowView.module.css`：`.split`（grid 21–24rem | 1fr；≤44rem 纵向堆叠）+ rail/detail/kvGrid/stateBadge/resultCard/pickHint 等新样式，同款 `--wf-*` 主题令牌家族。`locales.ts`（ui-baf-workflow）：`tflow.pickHint/labelTool/labelType/labelCommand/labelPurpose/labelResult/reportPath/chainDone/chainIdle/gateUndecided/staticIdle/formatIdle/desc.build…format` 共 19 键 zh/en（类型联合 + 两字典三处同步）。

## 6. 测试（as-built）

- `baf-featured/tests/featured.spec.ts` 新增「manifest import and export」4 例：导出生效清单（种子 revision 3/count 2、文本可回 parse）；导入合法文档（{ok,revision 7,count 1} + changed 事件 + 覆盖层落盘 + list/export 跟随覆盖层）；坏 JSON 与 schemaVersion 错拒收零副作用（种子继续当政）；坏覆盖层在盘 → list 报 manifestError 不静默回退。
- `ui-settings-featured-plugins`：harness face 补 exportConfig/importConfig 桩 + readyState 补 exporting/importing；新 2 例——空清单下配置行常驻 + 导出点击达 face；选文件 → importConfig 收到文件全文。
- `ui-settings-baf-standard`：parity 锁 result 非空；指令集断言翻转（全局行现在**有**功能行「迷路时的第一站」+ 结果行「指令速查表」）+ 新例（两卡标题/引导句、三行标签、三处图例键绝迹）；企业文档 ready 例补 markdown 断言（`# SORA` 原文标记不出现 + `h1` 元素出现）。
- `ui-baf-workflow`：test-flow.client.spec.ts 17 例原样全绿（视图重写未破投影契约）。
- 定向四包合计 127 用例全绿；`tsc -b tsconfig.host.json` / `tsconfig.client.json` 全绿；`build:lib`（host+client 两平面 tsc+tsdown+desktop bundle）出库。

## 7. 验证与出包（as-verified）

**web 端真机验证**：`BAF_DSH_FEATURED_MANIFEST` 种子下 `pnpm run dev:web` 全栈（127.0.0.1:3080）+ `logs/probe-batch11.mjs` playwright 探针（21 检查点）——**ALL PROBES PASSED**。逐项实况：

- **①通用文案**：`test-flow-tab-row` 行文本 =「关闭后，对话 Tab 不再显示「测试流图」。」，无「（单元测试结果）」括注。
- **②推荐插件导入导出**：种子两张卡（飞书/插件市场）；「导出清单」钩 `URL.createObjectURL` 捕获 Blob 文本为合法 JSON（revision 2 / 2 插件）；导入 `import-ok.json` 回显「清单已导入，共 1 个插件生效」且卡片随 changed 事件刷新为「批次十一探针」（飞书消失）；导入 `import-bad.json`（schemaVersion 2）被拒——notice 显「操作失败：schemaVersion must be 1, got 2」，列表保持导入清单不变（零副作用）。注意覆盖层 `~/.dsh/featured-manifest.json` 优先于种子且跨探针存留——复跑种子断言前须删该文件（已按此纪律执行）。
- **③指令集**：`baf-commands-card`（状态指令）+ `baf-commands-global`（全局指令）两大卡同屏，标题/引导句齐；三行标签 作用/功能/结果 全见；两页均无「图例」字样；全局卡平铺 11 行（globalRows=11），点 verify 节点状态卡明细 7 行（stateRows=7）。
- **④企业规范 markdown**：无图例；点 implement 节点 → code 文档 chip → 全屏模态 `baf-enterprise-doc-body` 渲染出 h1×1 / h2×11 / li×35，正文无 `#` / `##` 原文标记——真排版非原文。
- **⑤测试流图点击检视**：首页 demo1 组（4 组可见）点开真实 BAF 会话 `session-b3765cd7-80e3-4330-9a9e-88842094c6be`，「测试流图」Tab 出现（会话 Tab 条是无 aria 的 CSS 模块 button，按文本定位；点击后列表重排，行 key 须点前取）；视图 `baf-test-flow-view` 左步骤链 + 右详情面板同屏，默认选中 build：kv 三行（工具 gcc / 类型 必装 / 命令 ceedling test:all）+ 作用段 + 执行结果；点 gate → 「行覆盖率 83.3%（≥ 80%）通过」；点 lint → 「5 项错误 未通过」；点 report → HTML 报告路径（build/coverage）+「打开报告」按钮可见。
- **视觉抽检**（截图 → 视觉模型审读）：⑤ 分栏视图左右结构/状态色圆点/kv 网格/结果卡均按设计呈现，命令超长处省略号截断但 title 悬停有全文（设计内）；④ 模态确认为格式化 markdown（粗体/行内代码 chip/真表格，无 `#`/`**` 裸标记）。

**夹具即删**：demo1 验证夹具（.baf/reports/ut-coverage.json、static-analysis.json、build/coverage/coverage_report.html 及空 build 目录）、`~/.dsh/featured-manifest.json` 覆盖层、%TEMP%/baf-batch11 导入文件、diag 脚本、孤儿 CDP Edge 进程树（16 只）、dev:web 后台任务——全部清除/停止。

**出包**：验证通过后走 overlay 产线 `node overlay/scripts/brand-web.mjs` → `node overlay/scripts/pack-dsh.mjs`（输出 `packed dsh -> …` 真成功行，help/ 已同步）→ `overlay/desktop` `pnpm run dist:dir`（02:23–02:31，约 8 分钟）→ **`overlay/desktop/dist/win-unpacked/baf-dsh.exe`**（约 195MB，`resources/VERSION` = 0.0.33，无 NSIS 安装包）。注：根脚本 `pnpm run package:desktop:dir` 指向上游 apps/desktop 打包器（需 `.env.windows` 签名环境），不是 baf-dsh 的产线。装船内容标记核查：win-unpacked resources 内 `featured-export`/`baf-test-flow-detail`/`baf-commands-global`/`exportManifest` 全部命中；启动冒烟（`--remote-debugging-port=9200`，9223 被 Hyper-V 排除段拦）CDP 应答正常、三进程健康、渲染日志零报错。出包前 `overlay/desktop/VERSION` 同步 0.0.33、强杀 4 只残留 baf-dsh.exe（防 EPERM 锁文件）。
