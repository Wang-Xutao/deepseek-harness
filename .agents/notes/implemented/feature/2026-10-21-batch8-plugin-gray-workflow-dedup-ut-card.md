# 批次八（2026-10-21）：推荐插件置灰 + 工作流信息去重 + 企业规范全量核对 + 单元测试查漏补缺 — desktop 0.0.30

> 需求原句：1. 设置-推荐插件。暂不可用的插件卡片样式要置灰。这样更加直观。2. 会话工作流图中，顶部的「模式」删除，已经在右侧栏显示了。右侧栏顶部的当前变更和状态删除，已经在顶部显示了。3. 工作流页面，企业规范中：3.1 多了一层边框，如图，请删除。3.2 预览文档使用模态框全屏显示，更加清晰，删除关闭按钮，点击文档外的空白位置即可关闭。3.3 再核对一遍，根据 D:\Source\baf-codingplugin\bafplugin，企业规范文档是否完整无误，是否存在遗漏和错误。给我明确的核对结果。3.4 质量监控，针对的单元测试部分。包括几块内容：单元测试工具栏和环境、单元测试文件夹路径，单元测试报告路径，单元测试覆盖率比例，单元测试报告预览和打开，以及其他和单元测试相关的所有内容，需要你进行查漏补缺。

## 0. 结论速览

| # | 需求 | 落点 | 状态 |
|---|------|------|------|
| 1 | 不可用插件卡片置灰 | `FeaturedSection.tsx` + `.cardUnavailable` | ✅ opacity 0.55 + grayscale 0.9（jsdom 断言；web 端推荐目录当前为空无实物可拍） |
| 2 | 顶栏删「模式」、右侧栏删「当前变更/状态」横幅 | `WorkflowView.tsx` + module.css | ✅ strip 模式项删除（保留 change/node/time/tokens）、rail 横幅整段删除、`.changeBanner*` 五规则退役、locale `strip.mode` 三处清除；vitest workflow 全绿 + web 真机页面无「模式」无 rail-change-banner |
| 3.1 | 企业规范卡删多余边框 | `EnterpriseDocsCard.tsx` 根改无边框 `.cardFlow` | ✅ 真机 computed border 0px（内层 wrap 自带 1px/12px 单框） |
| 3.2 | 预览改全屏模态框、删关闭按钮、点空白关闭 | `EnterpriseDocViewer.tsx` 重写 + `.docModalScrim/.docModal` | ✅ fixed 遮罩 z-1000 + 1080px 面板 + role=dialog + Escape + scrim 点击关闭；唯一按钮「打开文件」；真机三路关闭验证 |
| 3.3 | 企业规范文档全量核对 vs bafplugin | 逐文件 diff + 编目核对 | ✅ **明确结论见 §3 表**：1 处漏迁（python SKILL，已补）+ 1 处内容差（SRI checklist 少一空行，已逐字节重拷）+ 1 处漏编目（uttpl，已补）；其余 16 份编目 + 全部非编目随包资产内容一致 |
| 3.4 | 单元测试查漏补缺 | `UnitTestCard.tsx`（新）+ locales + css | ✅ 三节（工具栏和环境 / 路径与覆盖率 / 相关文档），全部取自随包真资产（config.json / project.yml / Ceedling SKILL）；三报告产物按工作区存在性点亮「打开」+ 未生成标注；六条 UT 文档直达全屏模态 |

构建链全绿：`tsc -b` 四包 0 错 → tsdown client 三包（workflow 752kB / baf-standard 305kB / featured 102kB）→ vitest 148/148（standard+featured 94 + workflow/baf-standard host 54）→ host bundle 重建（baf-standard tsdown HOST，python 文档 RPC 走通）→ web 真机探针（CDP 9200）全项 → brand-web（嵌入 v0.0.30）→ pack-dsh（`packed dsh ->`）→ `dist:dir` 免安装 → 产物 grep + ProductVersion 0.0.30。

## 1. 需求 1：不可用插件卡片置灰

【变更】`ui-settings-featured-plugins/src/client/FeaturedSection.tsx`：卡片 `<li>` className 改 `state === 'unavailable' ? \`${css.card} ${css.cardUnavailable}\` : css.card`，同时落 `data-unavailable` 属性（真机/测试可查的语义标记）。

【变更】`FeaturedSection.module.css`：`.cardUnavailable { opacity: 0.55; filter: grayscale(0.9); }` —— 降不透明度 + 去饱和双管，与原有「暂不可用」文案角标互补（色弱用户也靠亮度可辨）。

【变更】`featured-section.client.spec.tsx`：unavailable 用例补断言 —— `closest('[data-unavailable]')` 存在且 className 含 `cardUnavailable`。

真机注：web 端推荐插件注册表当前为空（「暂无推荐插件」，非 manifest 错误），无 unavailable 实物可拍；置灰由 jsdom 断言覆盖，样式为纯 CSS 无运行时分支。

## 2. 需求 2：工作流画布信息去重

【变更】`ui-baf-workflow/src/client/WorkflowView.tsx`：

- strip（顶栏 role=status）删除「模式」项（原 `stripItem` + `modeLabel(view.mode)`）——右侧栏 intake 卡已展示模式及其确认态，顶栏留 变更 change-xx / 当前节点 / 累计用时 / 累计 tokens 四项。`modeLabel` 函数保留（intake 确认卡 + dashboard 仍用）。
- 右侧栏删除顶部「当前变更 / 状态」横幅整段（`data-testid="rail-change-banner"` 的 section 块）——顶栏 change chip 已展示同信息。

【变更】`WorkflowView.module.css`：`.changeBannerCard/.changeBannerRow/.changeBannerLabel/.changeBannerId/.changeBannerMeta` 五规则删除（退役注释占位）。

【变更】`locales.ts`：`strip.mode` 从 key 联合类型 + en + zh 三处清除。

验证：workflow vitest 全绿（strip/rail 断言随删除更新）；web 真机工作流页 body 文本无「模式」、无 `rail-change-banner` 节点。

## 3. 需求 3.3：企业规范文档全量核对（明确结论）

**核对方法**：编目资产逐文件 `diff --strip-trailing-cr` + 规范化（去 CRLF/行尾空白）diff 分类（装饰性 vs 实质差）+ `cmp` 逐字节复核；编目清单与 bafplugin 源树 + 本仓随包资产三向对齐。

| 类别 | 数量 | 结论 |
|------|------|------|
| 编目资产内容核对（enterprise 10 + quality 6 原有 16 份） | 16 | 全部与 bafplugin **内容一致**（差异仅为 CRLF/行尾空白/EOF 空行等仓库规范化项，`<pre>` 逐字显示不可见；`sri-spec-sw-01a-agent-checklist.md` 曾实质少第 28 行后一个空行，本轮按 bafplugin 原样重拷后再按仓库先例规范化，规范化 diff 为 0） |
| 漏迁检测（bafplugin 有、本仓无） | 1 | `skills/sora-python-code-standards/SKILL.md`（976B）baf-standard 从未迁移 → 已补（编目 id `python`，design/implement 节点；企业文档 10→11；同仓库规范化，规范化 diff 为 0） |
| 漏编目检测（随包有、目录无） | 1 | `quality/ceedling/test/test_module.template.c`（669B）已随包发布但目录未收 → 已补（编目 id `uttpl`，group `ut`；质量文档 6→7） |
| 非编目随包资产（c 模板 ×7 / commitlint ×3 / constitution ×6 / scripts ×4） | 20 | 全部与 bafplugin 源内容一致（这些是运行时消费的资产，本就不进查看目录） |

**最终状态：11 份企业文档 + 7 份质量文档全部编目在册、内容与 bafplugin 一致（按仓库 whitespace 规范化后 diff 为 0，viewer 中逐字显示无差别），无遗漏、无错误。**

> 规范化说明：lefthook whitespace 钩子不放行行尾双空格与 EOF 空行，批次六入库的 16 份资产即按此规范化（markdown 硬换行的行尾双空格在 `<pre>` 逐字显示中不可见）；本轮两份新文件跟随同一先例。

宿主侧注意：`enterprise-docs.ts` 目录改动后须 `cd packages/baf/baf-standard && corepack pnpm run bundle`（tsdown HOST bundle）再重启 host——运行中的 host 加载的是 `lib/index.js` 汇总产物，`tsc -b` 只刷新 `lib/types`，本轮 python 文档「未找到该规范文档」即此因。

## 4. 需求 3.1 + 3.2：卡边框删除 + 全屏模态预览

【变更】`EnterpriseDocsCard.tsx`：根元素从 `.card`（0.5px 边框/圆角 8）改无边框 `.cardFlow`（纯纵向 flex 容器）——原 `.card` 外框套 `.hooksFlowWrap`（1px/圆角 12）形成双框，删外框后流程图卡自带单框。

【变更】`EnterpriseDocViewer.tsx` 整体重写：

- 结构 = `.docModalScrim`（fixed inset-0 z-1000、rgba(15,17,21,.45) 遮罩、flex 居中、padding 28px）+ `.docModal`（min(1080px,100%) × 高 100%/max 900px、白底、24px/64px 投影、圆角 12）。scrim `onClick={onClose}`，面板 `stopPropagation` —— **点文档外空白即关**。
- **无关闭按钮**：头部只剩标题 + 「打开文件」（带真实资产绝对路径 title）。`EnterpriseDocViewer` 不再接收/渲染 close 相关 props。
- 键盘：window keydown `Escape` → onClose；挂载即焦点落面板（`tabIndex={-1}` + focus）。
- 内容体沿用原状态机（loading / ready `<pre>` 全文 / unknown / unreadable），`role="dialog" aria-modal="true"`。

【变更】单例化：质量 tab 的 viewer 从 `QualityDocsCard` 内部上提到 `StandardsQualityOverview` tab 级（`viewerOf` 一份状态、一个 `<EnterpriseDocViewer>`）——否则 UT 卡 + 工具链卡各挂一个 viewer 时 jsdom `getByTestId('baf-enterprise-doc-body')` 命中两个元素。企业 tab 保持卡级（该 tab 只有一张卡）。`QualityDocsCard` 相应瘦身（props 只剩 state/t/openEnterpriseDoc）。

真机验证（CDP 探针）：scrim computed `position:fixed / z-index:1000`、面板 `role=dialog`、按钮仅「打开文件」、python 全文 976 字符且 title 为真实资产绝对路径；scrim 点击关闭（row `aria-pressed` 回 false）、Escape 关闭均过。截图 `batch8-python-modal.png` / `batch8-uttpl-modal.png`。

## 5. 需求 3.4：单元测试查漏补缺卡

【变更】`UnitTestCard.tsx`（新文件，质量监控 tab 首卡）：三节全部取自随包真资产，逐行标注来源——

- **工具栏和环境**（`baf-ut-section-env`）：工具链 `gcc · ruby · ceedling 1.0.1 (gem) · gcovr`（project.yml `:which_ceedling gem` + `:ceedling_version 1.0.1` + README）；框架 `Unity · CMock · gcov`；五条命令 `baf-quality test <suite>` / `check` / `check --delta` / `--clean` / `--open`（Ceedling SKILL §2/§9）。
- **路径与覆盖率**（`baf-ut-section-paths`）：`test/<rel>/test_<module>.c（与 source 镜像）` + `source/<rel>/<module>.c|.h`（SKILL §4 布局约定）+ `build/（gcov 对象 build/gcov）`；阈值 `行覆盖 ≥ 80%（threshold_line 0.8 · shadow）`；排除 `test/** · third_party/** · build/**`（config.json exclude 列表）。
- **报告产物三行**（`baf-ut-report-*`）：HTML `build/coverage/coverage_report.html` / Cobertura `build/coverage/coverage_report.xml` / 覆盖率 JSON `.baf/reports/ut-coverage.json`（config.json report_* 键）。`statWorkspacePath` 按当前工作区探测存在性：存在 → 「打开」点亮（`openPath(绝对路径)`）；不存在 → 「打开」置灰 + 「未生成」标注（跑一次 `baf-quality check` 即生成）。无工作区 → 只显示路径。
- **相关文档**（`baf-ut-section-docs`）：六条直达（`ut` Ceedling SKILL / `utlist` 测试清单 / `uttpl` 模板 / `env-ut` 环境搭建 / `cfg-project` project.yml / `cfg-config` config.json），标题从两份目录镜像解析（永不漂移），点击进共享全屏模态。

【变更】配套：locales 24 个 zh/en 键（utTitle ~ utReportMissing）；`.utCard/.utSection/.utSectionLabel/.utRow*` 样式（节标签左肋线与 qualityGroupLabel 同款、行 label 左/mono 值右）；`tsconfig.client.json` 收录新文件；测试新增专卡用例（statWorkspacePath mock html=true/xml=false：断言启用/禁用 + 未生成标注 + 六文档 testid + 点击 `baf-ut-doc-uttpl` 调 `openEnterpriseDoc('uttpl')`）。

真机验证：三节齐、三报告行全禁用 + 未生成（探针工作区无产物）、六文档行齐、`baf-ut-doc-uttpl` 点击进全屏模态（661 字符模板全文、唯一按钮「打开文件」）、scrim 点击关闭、工具链卡三分组（env 2 / config 4 / standard 3）原样。截图 `batch8-ut-card.png`。

## 6. 验证与产物

- vitest：`ui-settings-baf-standard` + `ui-settings-featured-plugins` 94/94；`ui-baf-workflow` + `dsh-baf-standard` host 54/54（11 文件）。
- tsc -b：baf-standard / featured / workflow / settings-baf-standard 四包 exit 0。
- web 真机（headless Edge CDP 9200，token 直连）：企业规范（边框/流程图/python 节点标注/模态三路关闭）+ 质量监控（UT 卡三节/报告行/文档直达/工具链卡）全项过；截图 ×3。
- exe 0.0.30：brand-web 嵌入 `BAF DSH / v0.0.30` → pack-dsh → dist:dir 免安装 → 产物 grep（`python`/`uttpl` 目录 id、`docModalScrim`、featured bundle `cardUnavailable`、workflow bundle 无 `rail-change-banner`/`strip.mode`）+ ProductVersion `0.0.30.0`。

## 7. 遗留问题（按优先级）

1. **推荐插件置灰无真机实物**：web 端推荐注册表当前为空（无 manifest 错误），unavailable 卡片只能 jsdom 验证；待注册表有不可用条目时可真机复验。
2. **UT 报告「打开」对 HTML 报告用系统默认程序**：`openPath` 走宿主打开语义，coverage HTML 在浏览器开、XML/JSON 在编辑器开（依系统关联）；如需统一内嵌预览可后续做报告格式 sniff。
3. **全屏模态无缩放**：超长文档（如 constitution）在全屏模态中为一整列滚动；如需字号调节/打印可后续加。
