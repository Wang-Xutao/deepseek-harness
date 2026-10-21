# 批次九（2026-10-21）：质量监控三卡重构 + 指令集流程图页签 + 工作流图配置入口 — desktop 0.0.31

> 需求原句：1. 主页工作流，质量监控部分：1.1 删除"质量监控 单元测试（Ceedling 工具栏和环境、路径、覆盖率、报告）+ stack 配置只读投影 + baf-quality 真实工具链资产。"和"单元测试（Ceedling · Unity · CMock）"；1.2 分为以下3个卡片部分：环境、配置、规范。重新整理优化下显示ui界面，要求醒目直观、美观和谐。1.3 环境，需要列出所有工具链的版本号，并需要检查当前工作区是否支持该环境。如果不支持，需要增加"一键安装"按钮用于初始化所有工具链。1.4 配置，列出"单元测试目录"、"单元测试报告目录"、"单元测试构建目录"、"行覆盖率阈值"、"测试报告"。测试报告点击后可模态框预览，只需支持html即可。1.5 文档，将所有和单元测试相关的规范文档，进行分类显示。1.6 删除"baf-quality · 质量门禁"卡片。2. 工作流在企业规范和确认门之间增加一个tab页，名称为指令集。显示内容也是一个完整的工作流流程图，和企业规范的流程图样式一致。在每个状态节点上，显示对应状态支持的所有baf指令，并对该baf指令进行解释说明，做什么用的，有什么效果。3. 会话，工作流图的顶部增加一个"配置"按钮，点击后打开"工作流"配置页面。

## 0. 结论速览

| # | 需求 | 落点 | 状态 |
|---|------|------|------|
| 1.1/1.6 | 删旧描述文案 + 旧「单元测试」卡 + 旧「baf-quality · 质量门禁」卡 | `UnitTestCard.tsx` / `QualityDocsCard.tsx` 删除 | ✅ 质量监控 tab 旧两卡退役，真机 oldGone 断言通过 |
| 1.2–1.5 | 质量监控重构为 环境/配置/规范 三卡 | `QualityEnvironmentCard` / `QualityConfigCard` / `QualityStandardsCard`（三新文件）+ host 4 个 @Remote | ✅ 三卡 testid 全部真机可见；视觉审查后补修 用途 列宽（见 §1.4） |
| 2 | 指令集 tab（确认门↔企业规范） | `baf-commands-catalog.ts` + `CommandsCard.tsx` + tracegraph tab 注册 + `HELP_TABLES` 导出 | ✅ 8 节点同款流程图 + 每节点指令明细 + 双语 parity spec 防漂移 |
| 3 | 会话工作流图顶部「配置」按钮 | `WorkflowView.tsx` strip + `layout.selectPanel('workflow')` | ✅ busy 置灰防抖，点击直达工作流配置页（通用 tab） |

构建链全绿：`corepack pnpm run build` exit 0 → brand-web（嵌入 `BAF DSH / v0.0.31`）→ pack-dsh → `dist:dir` 免安装（不打 NSIS）→ exe 冒烟。

## 1. 需求 1：质量监控三卡重构

### 1.1 卡片退役

【变更】`src/client/UnitTestCard.tsx`、`src/client/QualityDocsCard.tsx` 删除（批次七的三分组卡 + 批次八的单元测试卡），`tsconfig.client.json` 同步移除；质量监控 tab 的文档查看器单例（`viewerOf` / `EnterpriseDocViewer`）从 tab 级状态机保留——规范卡的文档直达复用它。卡头长描述文案（"质量监控 单元测试（Ceedling 工具栏和环境…）"）随旧卡一并消失。

### 1.2 宿主侧：4 个新 @Remote（`ui-settings-baf-standard/src/index.ts`，+335 行）

【变更】`types.ts` 新增四个判别类型 + host 实现（全部零参，符合 @Remote arity 纪律）：

- **`qualityEnvironment()`**（index.ts:719）：逐项 spawn `--version` 探测六成员（gcc / ruby / ceedling / gcovr / cpplint / cppcheck），shell 解析（Windows gem/pip shim 需要），每行回 `key/state(ok·missing·unknown)/version?/required`；`supported` = 必装成员全部 ok；`assetsInstalled` = 工作区已带质量资产。工作区解析走 `resolveWorkspaceCwd` 链（会话 cwd → 最新会话 → sandboxPolicy.workspaceRoot）。
- **`installQualityToolchain()`**（index.ts:743）：一键安装——先回写质量包资产（project.yml 等，含 created 计数），再 `gem install ceedling` / `pip install gcovr cpplint`；gcc/ruby/cppcheck 等无法自动安装的前置项回手动提示行；每步 `{id, ok, detail}` 汇入 steps 报告。
- **`qualityConfiguration()`**（index.ts:842，`readQualityConfiguration` helper 270–323）：工作区 `.baf/quality/ceedling-config.json` → 内置资产回退，五行取值（testSource/testReport/testBuild/thresholdLine/reportHtmlRel）+ 每行来源标签（`workspaceConfig` 变量区分 工作区/内置默认）；reportHtml 落盘存在性实时 `stat`。
- **`readQualityReport()`**（index.ts:857）：读报告 HTML 全文（size 上限保护），供模态框 srcDoc 渲染；不存在回 `missing` 判别分支。

### 1.3 环境 card（`QualityEnvironmentCard.tsx`）

判定横幅（探测中 neutral 灰 / 无工作区引导 / 支持 success 绿 / 缺件 danger 红「环境不完整：Ceedling」）+ 工具表（工具[必装/选装角标] / 用途 / 版本 mono / 状态徽章 已就绪·未安装）+ 质量资产行 + 一键安装按钮（`baf-quality-env-install`，安装中置灰）+ 分步 ✓/✗ 结果（`baf-quality-env-step-*`）+ 重新检测（`baf-quality-env-recheck`，只重跑探测不重读配置）。

### 1.4 视觉审查补修：用途列宽

web 真机截图（analyze_image 视觉审查）发现 754px 视口下 `table-layout: fixed` 的三个 px 定宽列（108/110/84）把弹性 用途 列挤到 29px（「C…」「单…」单字截断）。

【变更】`StandardsOverview.module.css`：`.envColTool/.envColVersion/.envColState` 108/110/84 → **100/68/68**，窄面板下用途列保底 ~143px；`QualityEnvironmentCard.tsx` 用途 cell 补 `title` 属性兜底悬停全文。修后真机断言 **cellsClipped: 0**（role 列 319px）。横幅「浅红」为完成态 danger 判定（环境不完整），非缺陷。

### 1.5 配置 card（`QualityConfigCard.tsx`）

五行：单元测试目录 / 单元测试报告目录 / 单元测试构建目录 / 行覆盖率阈值（≥ 80%（shadow 门禁））/ 测试报告（存在→「预览」+「打开文件」，未生成→置灰 + 未生成标注）+ 底部「取值来源：内置默认 / 工作区」标签。预览点击开**模态框**（`baf-quality-report-modal`）：sandbox iframe `srcDoc` 渲染 HTML 全文（无外链执行），头部绝对路径 title + 打开文件 + Esc/遮罩关闭。

### 1.6 规范 card（`QualityStandardsCard.tsx`）

单元测试相关规范文档四组分类（测试纪律 2 / 静态分析 3 / 环境搭建 3 / 配置模板 2，共 10 条；跨组重复收录为有意分类——同一文档可属多类），条目点击进全屏模态看全文（复用 `EnterpriseDocViewer`）。

## 2. 需求 2：指令集 tab

【变更】`ui-baf-tracegraph/src/client/WorkflowSection.tsx`：`WORKFLOW_TABS` 注册 `{ id: 'commands', labelKey: 'tabs.commands', slotIds: ['baf-standard-commands'] }`，插在 gates 与 standard 之间（客户指定位置）；locales +`tabs.commands`「指令集 / Commands」。

【变更】`ui-baf-workflow/src/commands.ts`：导出 `HELP_TABLES = { core, flow, check, update }`（+13 行）——宿主侧 slash help 表的唯一事实源，浏览器侧目录与其 deep-compare（parity spec）防两份漂移。

【变更】`ui-settings-baf-standard/src/client/baf-commands-catalog.ts`（新）：8 状态节点（intake/open/clarify/design/plan/implement/verify/archive）× 每节点 baf 指令清单（命令名 / 一句话用途 / 完整解释：做什么用、有什么效果 / ★ 推荐），desc 与星级逐字镜像 `HELP_TABLES`。

【变更】`ui-settings-baf-standard/src/client/CommandsCard.tsx`（新）：企业规范同款流程图解剖（`hooksFlow` 8 节点 + SVG 箭头 + 图例 + 全局带，批次六/七同款组件复用）；每节点 accent 行「接单Intake · 2 条指令」；点击节点下方明细区切换（`baf-commands-node-*` / `baf-commands-detail`），指令卡 = 命令名 mono chip + ★ 推荐角标 + 用途 + 完整解释；默认展示 intake 节点。

验证：parity spec（目录 vs HELP_TABLES deep-compare）+ 节点/明细交互断言；web 真机 8 节点全可见、openRow `/baf-workflow-open` 全文、verify 节点 `baf_check_quality` 在列。

## 3. 需求 3：会话工作流图「配置」按钮

【变更】`ui-baf-workflow/src/client/WorkflowView.tsx`：strip 按钮组（仪表盘/刷新之后）加 配置（`data-testid="strip-workflow-config"`，`action.config`「配置 / Configure」，`disabled={busy}` 与刷新同防抖），`onClick={openWorkflowConfig}`。

【变更】`ui-baf-workflow/src/client/index.ts`：inject 加 `layout`（`@deepseek-ai/dsh-client-ui-layout/client`）；`WorkflowViewInjected` 新增 `openWorkflowConfig`，实现 = `ctx.layout.selectPanel('workflow' as MainPanelId)`——与侧栏「工作流」入口选中同一主面板（tracegraph 注册的 workflow MainPanelId），配置页内确认门/指令集/企业规范/质量监控 tab 即图形的配置源。locales +`action.config` zh/en。

## 4. 验证与产物

- vitest：`ui-settings-baf-standard` 84/84（2 文件，含列宽修复后复跑）；四包合计 642/642（settings-baf-standard + tracegraph + ui-baf-workflow + dsh-baf host）；tsc -b 五包 exit 0；`corepack pnpm run build` exit 0（双 face + web 壳）。
- web 真机（host 3180 + Edge CDP 9200，五段探针全过）：
  - tabs：`[general, project, gates, commands, standard, quality]`，指令集位置正确；
  - commands：8 节点 + intake accent「2 条指令」+ `/baf-workflow-open` 明细全文 + verify 节点 `baf_check_quality`；
  - quality：verdict「环境不完整：Ceedling」+ 六工具行（GCC 16.1.0 / Ruby 3.2.11 / Ceedling 必装未安装 / gcovr 8.3 / cpplint 选装未安装 / Cppcheck 2.19.0）+ 一键安装 + 配置五行（来源 内置默认）+ 规范四组 10 条 + 旧卡 oldGone；
  - report：staged HTML → 预览 → 模态 sandbox iframe srcDoc 全文 + 打开文件（验证后已清理 staging 文件）；
  - strip：配置 按钮 → workflowPageShown + activeTab `workflow-tab-general`（设备本地 pref 是否显示工作流 Tab 需为开，真机已开）。
- 视觉审查：5 张截图 analyze_image 复核，唯一实质缺陷（用途列单字截断）已修并复测 0 截断；其余标记项为滚动位置/有意设计（跨组文档收录、staging 报告自身样式）。
- exe 0.0.31：`pnpm run build` → brand-web（`embedded title "BAF DSH" / label "v0.0.31"`）→ pack-dsh → `dist:dir` 免安装（无 NSIS）→ `overlay/desktop/dist/win-unpacked/baf-dsh.exe`。

## 5. 遗留问题（按优先级）

1. **一键安装未在真机全量执行**：web 验证覆盖按钮渲染/置灰态与 steps 报告结构，未在工作区真跑 gem/pip 安装（避免污染验证机工具链）；首次客户实际使用时建议观察 steps 输出。
2. **报告预览仅 HTML**：与需求一致（"只需支持 html 即可"）；XML/JSON 报告产物仍走 打开文件 系统关联。
3. **设备本地 pref 门槛**：会话内 工作流图 Tab（含新 配置 按钮）受「是否显示工作流 Tab」设备本地开关控制，新装机默认关——配置按钮随该 Tab 一同隐藏；如需默认可见需改 pref 默认值（客户未要求，未动）。
4. **指令集明细为静态目录**：按状态列指令，不含运行时可用性（如 drift 态才有的 resume 已并入对应节点）；若要按活跃变更动态过滤可后续做。
