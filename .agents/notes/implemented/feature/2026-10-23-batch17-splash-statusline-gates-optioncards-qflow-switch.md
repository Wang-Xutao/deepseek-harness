# 批次十七（2026-10-23）：splash 慢启动提示并入旋转状态行 + 确认门横向三选项卡 + 门禁明细去灰亮面 + 测试流卡片三改与一键开关 — desktop 0.0.40

> 需求原句（五点）：1. splash 页面显示异常（图1）；5s 后将「首次启动耗时较久，请耐心等待」放入「正在检查更新」等列表中（旋转状态行）；「后台启动」按钮放左下角。2. 工作流确认门页面：2.1 「需求进入」改「需求输入」并优化显示框（更醒目不要灰灰的）；删除「工作区未初始化·先行」「按进行中的变更三选一（互斥）」，流程图横向排列三个选项「未发现进行中的工作流/已有进行中的变更/多条未完成的变更，请选择接手对象」，条件「无进行中的变更」等放到确认门节点上；2.2 优化确认门的门禁明细，灰灰的不好看，要美化；2.3 状态卡片中不显示确认门数量（确认门不在状态中），状态的门禁明细也不需要「确认门」项；2.4 右侧「门禁明细」鼠标滚动时保持右侧顶端（sticky）。3. 工作流测试流界面：3.1 测试流卡片的「测试流」标题和「前置」卡片叠在一起，要留空间；3.2 「构建目录/测试目录/报告目录」不要黑色边框；「启用/失败中止」switch 太大，要精致和谐；3.3 前置卡片增加一键开关，控制整个测试流。4. 确认为什么没有文档的注释规范、测试流中没有 doxygen 相关部分。5. 六个 tab 页面顶部元素距 tab 签距离要一致。

## 0. 结论速览

| # | 需求 | 落点 | 状态 |
| -- | ---- | ---- | ---- |
| 1 | splash 异常修复 + 提示并入状态行 + 按钮左下角 | `overlay/desktop/ui/splash.html/.js/.css` | ✅ 批次十六的 `#slowBlock` 单行条撤销（即图1 异常源）；5s 后提示语 `splice` 进旋转状态行（与「正在检查更新…」轮流播报，零布局位移），「后台启动」按钮绝对定位面板左下角、`.on` 前 opacity 0 + pointer-events none |
| 2.1 | 需求输入 + 横向三选项卡 + 条件上节点 | `GatesOverviewRow.tsx` + `.module.css` + `locales.ts` | ✅ 入口框 176×32 品牌渐变 + 1.5px 品牌描边 + 投影（650 字重）；三个互斥选项横向一排选项卡（124×58，x=351/487/623），选项文案主行 + 进入条件静默副行；删除 scaffold 前置行/三选一说明/虚线汇流轨全部标签件；选项卡本身就是确认门节点（点击开该门明细） |
| 2.2 | 门禁明细去灰美化 | `GatesOverviewRow.module.css`（`.gateCard`） | ✅ 灰底改亮色浮面（警示色 3% 混入 elevated 底）+ 2.5px 警示色左条，hover 左条加深 + 底色增浓——警示色家族语言主导卡片 |
| 2.3 | 状态卡去确认门数量/「确认门」项 | `GatesOverviewRow.tsx` + `.module.css` + `locales.ts` | ✅ 状态节点明细只剩「阶段门禁」「进入下一步的条件」两小节，无「确认门」段、无 `确认门 ×N` 提示行（`.gatePillHint` 删除）、无确认门徽标；确认门内容只在门节点（选项卡/药丸）详情里 |
| 2.4 | 门禁明细 sticky | `GatesOverviewRow.module.css`（`.detail`） | ✅ `position:sticky; top:8px` + maxHeight 弹性，900px 滚动后仍钉在右栏顶（实测 stillVisible true） |
| 3.1 | 测试流标题与前置卡留空间 | `StandardsOverview.module.css`（`.qflowList`） | ✅ `margin-top:10px`——标题与 00 前置卡实测间距 10px 不再叠靠 |
| 3.2 | 目录按钮去黑边 + switch 精致化 | `.module.css`（`.qflowMonoChip`）+ `ui-primitives Switch.tsx/.module.css` | ✅ 目录按钮 `appearance:none; border:none` 去 UA 黑边；Switch 新增 `size='sm'`（28×16 轨、12px 拇指、translateX 12px），「启用/失败中止」全部换小号，默认 md 36×20 不变（向后兼容） |
| 3.3 | 前置卡一键开关 | `standards-store.ts` + `QualityFlowCard.tsx` + `StandardsOverview.tsx` + `locales.ts` | ✅ 00 前置卡新增「测试流开关」小号 Switch；`toggleQualityFlowAll` 按依赖闭包逐**独立根** RPC（关=[build,lint,analyze,format]、开=[gate,lint,analyze,format]），服务端级联为唯一事实源，八步同启同停（实测关→8/8 disabled、开→8/8 enabled） |
| 4 | 注释规范/doxygen 溯源 | （调查项，未改代码） | ✅ 结论见 §5——doxygen 规范**存在**且明确为软约束不进 CI，测试流无 doxygen 步骤属既定设计；docs-doxygen 指令是 bafplugin 遗留、本仓库无实现 |
| 5 | 六 tab 顶距一致 | （实测项，无需改动） | ✅ 六个页签 tab 条底边→面板首元素全部实测 14px（`.section gap 12` + `.panel padding-top 2` + 首块 16px 内边距的既有组合已经统一） |

测试：`gates-overview.client.spec.tsx` 8/8、`standards-overview.client.spec.tsx` 70/70；包内 tsc + 根 `tsconfig.client.json` 双绿。

web 实测（dev:web + CDP 9200 探针 `overlay/scripts/probe-batch17-web.mjs`，截图 `overlay/scripts/out/batch17-*.png` 4 张）：六 tab 顶距 14×6 全一致 → 确认门：入口框品牌渐变/描边/投影三属性命中、三选项卡 `oneRow:true`（y=309 唯一）、残留件全零（条件芯片/说明/汇流轨）、18 条带箭头连线、选项卡点击 `aria-pressed:true` 开门详情、节点详情 `hasConfirmSection:false` + 徽标 0、sticky 滚动 900px 后 `stillVisible:true` → 测试流：titleGap 10px、目录按钮 `border:none`、主开关在前置卡上 aria-checked true、17 枚 switch 全部 28×16、主开关真实翻转 RPC 往返（关→8 节点 data-enabled=false、开→8 true）。四截图视觉复核无重叠/截断/对比度问题。

## 1. splash：提示并入旋转状态行（需求 1）

图1 的显示异常源即批次十六 `#slowBlock` 单行条（max-height 过渡 + flex 行内布局在 300px 窗口的挤压）。本批整条撤销：

【变更】`overlay/desktop/ui/splash.html`：删除 `#slowBlock` 容器与 `.slowHint` 文案段，「后台启动」按钮独立为面板直接子元素。
【变更】`overlay/desktop/ui/splash.js`：5s 定时回调改为 `statuses.splice(i + 1, 0, '首次启动耗时较久，请耐心等待')`——提示语插进**旋转状态行当前条目的下一个位置**，与「正在检查更新…」等轮流播报，天然零布局位移；按钮只补 `classList.add('on')`。
【变更】`overlay/desktop/ui/splash.css`：`.slowBlock/.slowHint` 删除；`.bgStart` 绝对定位 `left:16px; bottom:14px`（与左上角版本号呼应），`.on` 前 `opacity:0 + pointer-events:none`（5s 前不可点、永不推移居中 logo 组、不与右下角 credit 碰撞）；reduced-motion 分支同步收缩。

## 2. 确认门流程图改版（需求 2.1/2.2/2.3/2.4）

批次十六的分支块是「竖排 case 行 + 条件芯片 + 虚线汇流轨 + 两行文字标签」；客户裁决改为纯图形语言：入口框 + 横向三选项卡，条件直接印在选项卡上。

【变更】`GatesOverviewRow.tsx`：
- 几何常量重写（`ENTRY_H=32/ENTRY_GAP=8/FORK_GAP=22/OPTION_W=124/OPTION_H=58/OPTION_GAP=12/OPTION_FLOW_GAP=26`），选项行 `optionX(index)=(CANVAS_W-(n*OPTION_W+(n-1)*OPTION_GAP))/2+index*(OPTION_W+OPTION_GAP)` 居中横向排列（三卡 x=351/487/623 同一 y）。
- **选项卡即确认门节点**：scaffold/new-workflow/active-conflict/bind-workflow 四枚 bootstrap 门渲染为 `button[data-testid=baf-gates-gate-node-<id>]` 选项卡（客户文案主行 + `entryCondNone/One/Many` 条件副行），点击 `setPicked('gate:<id>')` 直开该门明细——选项语义与门语义合一，不再有独立药丸层。
- scaffold 前置语义保留为流程事实（主轴上小药丸 `工作区需要初始化`），但**文字标签删除**；三选一互斥由「横向并列 + 出边各奔目标」的图形自身表达。
- `nodeDetailText` 去 gates 参数：状态节点 aria-label 不再数确认门；`detailSection` 节点组只渲染阶段说明 + 进入条件，门组（`确认门` 徽标小节）只在门模式出现。
- 分支边生成 `optionGates.forEach((_, index) => …)`（scaffold 出边 + 各选项卡出边 + classify 汇流，共 18 条带箭头 path）。

【变更】`GatesOverviewRow.module.css`：
- `.entryBox`（原 `.entryTag`）：10px 圆角、155deg 品牌渐变（16%→6%）、1.5px 品牌实线描边、品牌 18% 投影、12.5px/650 字重——醒目不灰。
- `.optionCard`（原 `.condChip`+药丸合并）：124×58 纵向两行（选项文案 600 字重 + 条件副行 10.5px 静默色）、虚线描边保留门家族语言、hover/选中态齐备。
- `.gateCard`：灰底改 `color-mix(warning 3%, bg-elevated)` 亮面 + `border-left:2.5px solid warning 50%` 警示左条；hover 左条 70% + 底色 6%。
- `.gatePillHint` 删除（状态明细不再有确认门指针行）；`.pickCaption/.caseRail/.condChip` 全删。
- `.detail`：`position:sticky; top:8px` + `maxHeight` 弹性——右栏明细随滚动常驻顶端。

【变更】`locales.ts`：`gates.entryInput`（需求输入/Request input）、`gates.entryOptNone/One/Many`（未发现进行中的工作流/已有进行中的变更/多条未完成的变更，请选择接手对象 + 英文）；删 `confirmCount/entryTag/entryCondScaffold/entryPickCaption/gateHintClick`（联合类型同步，防悬空引用）。

## 3. 测试流卡片三改（需求 3.1/3.2/3.3）

【变更】`StandardsOverview.module.css`：`.qflowList { margin-top:10px }`（标题与前置卡间距）；`.qflowMonoChip` 补 `appearance:none; border:none`（目录按钮是 `<button>`，UA 默认黑边来自这里）。

【变更】`ui-primitives`：`Switch.tsx` 新增可选 `size?: 'sm'`（`clsx` 合入 `.switchSm`），`.module.css` 加 `.switchSm`（28×16 轨、12px 拇指、选中 `translateX(12px)`）——默认 md 36×20 完全不变，既有消费方零影响。

【变更】`QualityFlowCard.tsx`：00 前置卡头部加「测试流开关」小号 Switch（勾选态 = 八步 `enabled` 全真；`qualityFlowSaving` 期间禁用）；两枚每步开关换 `size="sm"`。新必需 prop `toggleQualityFlowAll` 由 `StandardsOverview.tsx` 透传。

【变更】`standards-store.ts`：`toggleQualityFlowAll(value)` 三段式——①乐观更新（`exactOptionalPropertyTypes` 下窄化 const 后显式重建 `qualityFlow`，`qualityFlowSaving` 防重入）；②按独立根逐个 RPC：关=`[build,lint,analyze,format]`、开=`[gate,lint,analyze,format]`（**每根一次调用，闭包内的依赖由服务端 `applyQualityTestFlowToggle` 级联**——关 = 依赖闭包全关、开 = 前置闭包全开，`haltOnError` 永不级联；不改 `@Remote` 契约，避免 typert 聚合重建链）；③落定（首个非 ok/异常即断并写 `qualityFlowNotice`，成功则用最后一次 ready 响应的 stages 快照刷新）。

【变更】`locales.ts`（baf-standard）：`qflowSwitchAll`（测试流开关/Test flow）、`qflowSwitchAllTitle`（一键启停整个测试流（八个步骤全部启用/停用））。

## 4. 测试

【变更】`tests/gates-overview.client.spec.tsx`：断言重写——入口框 `baf-gates-entry` 含 `gates.entryInput`、三选项卡各含选项文案 + 条件键、残留件（cond-*/pick-caption/case-rail）`toBeNull`、节点详情无 `sectionConfirm` 小节且无门卡开缸、aria-label 不含「确认门 ×N」措辞但保留条件句。
【变更】`tests/standards-overview.client.spec.tsx`：harness face 补 `toggleQualityFlowAll: vi.fn()`；新增 UI 用例（主开关默认在 00 前置卡上 aria-checked true，点击→`toggleQualityFlowAll(false)`；部分停用态→未勾选，点击→`true`）与控制器用例（关向调用序 `[build,lint,analyze,format]` 含乐观中途校验、开向 `[gate,lint,analyze,format]`）。

## 5. 溯源：注释规范与 doxygen（需求 4，调查项未改码）

- **规范存在**：`assets/enterprise/skills/sora-c-code-standards/SKILL.md` P1.6 专节「注释 / Doxygen」（L109），含函数 Doxygen 格式模板（L160）与 docs-doxygen 再生成规则（L214）；`sora-docs-standards` 技能定义 Doxygen 站点契约；`assets/enterprise/c/Doxyfile.example + api-mainpage.dox.example` 两份资产随包映射到 `.baf/standards/`。
- **测试流无 doxygen 步骤是既定设计**：SKILL.md L112 明确「分层：本专节 = 软约束；注释率 / doxygen warn **不进 CI**（P2 另议）」——测试流（baf-quality 八步）只收硬约束项，doxygen 被文档显式推迟到 P2。
- **两处真缺口（未修，待客户裁决）**：① `docs-doxygen`/`docs-open` 指令在 legacy bafplugin 中被引用、本仓库**无实现**；② 企业规范浏览器目录（`ENTERPRISE_DOCS` 11 条 / `QUALITY_DOCS` 7 条）未收录 `Doxyfile.example`/`api-mainpage.dox.example` 两份 Doxygen 资产（注释规范本体已随 `code` 条目可读）。

## 6. 六 tab 顶距核验（需求 5，实测项未改码）

探针逐页签点击 + 面板首可见元素测距：`通用/项目工程/确认门/指令集/企业规范/测试流` 全部 **14px**（tablist 底边 → 首元素顶边）。一致性的来源是既有组合（`.section` gap 12 + `.panel` padding-top 2 + 各首块 16px 内边距）在六个页签上同构——无需改动，附实测值存档。

## 7. 打包

版本 0.0.39 → 0.0.40（`overlay/desktop/package.json` + `VERSION` + `version-notes.json` 批次十七中英文注记；`baf-product-versions.json` 由 pack-dsh 重写）。全量 `pnpm run build` → brand-web → pack-dsh（验「packed dsh ->」行 + help/index.html 新鲜度）→ `overlay/desktop npm run dist -- --dir`（仅免安装目录，不产 NSIS）→ `dist/win-unpacked/baf-dsh.exe`。

exe 冒烟（CDP 9200 骑 splash）：`v0.0.40` 左上角；状态行旋转播报中 5s 后出现「首次启动耗时较久，请耐心等待」一条（与「正在检查更新…」同一样式同行）、左下角浮出「后台启动」按钮；点击后台启动主窗口照常拉起。

## 8. 遗留问题（按影响排序）

1. **doxygen 两缺口待客户裁决**（§5）：补实现 `docs-doxygen` 指令 + 把两份 Doxygen 资产编目进浏览器目录，或维持 P2 推迟。规范文档本体已可读，不影响日常。
2. **主开关逐根 RPC 非原子**：四根独立根顺序四次调用，中途失败前面已生效不回滚（`qualityFlowNotice` 提示）；级联语义正确性由服务端保证，若需原子可上批量端点（需动 @Remote 契约 + typert 聚合重建链，本批刻意回避）。
3. **选项卡固定几何**（124×58 ×3 适配 416px 列）：更长选项文案会换行挤压；当前三文案实测单行放下，第四个互斥选项出现时需重排几何。
4. **splash 提示语只插一次**：`splice(i+1,…)` 挂在 5s 时刻的当前索引后，后续旋转会再次轮到它（每圈播报一次）——与「列表成员」语义一致，非缺陷，记录在案。
5. **`.gateCard` 亮面在暗色主题**：`bg-elevated` 混警示色 3% 在暗色下偏紫近黑，对比度依赖主题变量质量；当前仓库仅亮色主题实测。
