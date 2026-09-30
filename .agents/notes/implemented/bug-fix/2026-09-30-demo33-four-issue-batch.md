# demo33 四问题批次（2026-09-30）

用户批次：「修改以下问题，必要时打开web端验证调试：1. bug-fix-path路径，计划阶段被裁剪，为什么plan.json和task.md仍会生成。2. checklist.md 每一项都要优化下输出，要用中文明确检查项是什么。3. verify.md需要有完整的、详尽的、正式的测试报告…4. 变更总览要有一个在浏览器中打开的按钮，同时有一个更加完整的、炫酷的dashboard，web看板…」

Tier 2 范围：只跑 `pnpm build:lib`（无 NSIS）。验证梯：vitest 476/476（473 基线 + 3 新增 renderVerifyMd 测试）→ build:lib exit 0 → web 源码重启（bbite31pu）→ 真机只读 walk 18/18 PASS。

## 问题 1：bug-fix-path 裁剪后 plan.json / tasks.md 仍生成

**根因**：fast-path 的实现账本直接复用了 full-go 的 `ARTIFACT_FILES.planJson` / `tasks` 文件名落盘——「计划阶段被裁剪」只是流程上不产出计划产物，但机器账本还顶着 plan.json/tasks.md 的名字，rail 与消费者看到的就是「裁剪了却又生成」。

**修复——账本双命名方案**：

- 【变更】`src/stages/implement.ts`：新增 `ledgerFileFor(mode)`——`bug-fix-path` 模式实现账本落盘为 **`bug-fix-path-ledger.json`**（机器状态文件，永不进 rail）；full-go/legacy 维持 `plan.json`。
- 【变更】`src/stages/gates.ts` `readPlan()`：优先读 `plan.json`，不存在再读 `bug-fix-path-ledger.json`——每个消费者统一走这条回退（implement 门、守卫、任务计数）。
- 【变更】`src/dashboard.ts` `taskCounts()`：4 路探测（plan.json / bug-fix-path-ledger.json 两套 × 存在与否），看板任务进度两种模式都能算出。
- 【变更】`src/stages/escalate.ts` `preserveBugFixPathLedger()`：升级 full-go 时保留旧账本名做审计；目标已存在则早退。
- 【变更】`src/stages/gates.ts` `BUG_FIX_CLIPPED_FILES = {clarify.md, design.md, plan.md, plan.json, tasks.md}`：rail 对这五行统一标 **已裁剪**、禁用打开按钮、不读盘——**按模式裁剪而非按磁盘裁剪**（真机证实：legacy 命名的 change-20260930-ecum-3245 磁盘上有 plan.json/tasks.md，rail 仍显示已裁剪）。
- 【变更】`src/stages/go-dispatch.ts` implement 门文案改为「实现账本（plan.json / bug-fix-path-ledger.json）」双名表述。
- 【变更】`src/orchestrator.ts`：mode-aware `artifactPathFor` 与 `artifactFingerprintOf` 双候选探测（升级后指纹不因改名漂移）。
- 测试同步：`tests/stages.spec.ts` rail 期望 plan.json/tasks.md → `clipped`；`tests/bug-fix-path.spec.ts` T15 手改账本路径 → `bug-fix-path-ledger.json`；`tests/go-dispatch.spec.ts` 断言新文案。

## 问题 2：checklist.md 每项中文明确检查项

- 【变更】`src/stages/gates.ts` `CHECKLIST_REQUIREMENTS_ZH` / `IMPLEMENT_REQUIREMENTS_ZH`：要求每行格式 **`- [ ] **检查项名称**：检查内容与判定标准`**——粗体中文名打头，内容与判定标准跟冒号；checklistGate 的拒绝 hint 同步。
- 纯提示词侧改动（无自动化表面可断言）；存量 checklist（demo40 的 change）保持旧格式，新生成的变更按新格式产出。

## 问题 3：verify.md 正式测试报告

- 【变更】`src/stages/verify.ts`：新增 `CHECK_CATALOG_ZH` 注册表（5 项：regression-test→回归测试落地检查、openspec-validate→OpenSpec 结构校验、quality→质量门禁检查、guard→改动范围守卫检查、secret-scan→敏感信息扫描），每项带 name/content/method 中文元数据；未知检查名回退原文。
- 【变更】`renderVerifyMd()` 重写为四段式报告：**报告信息**（编号/模式/源版本/基线/工具版本/完成时间/必需检查通过数）→ **验证结论**（通过/未通过整句）→ **验证总览表**（# / 验证名称 / 类别 / 验证结果 / 耗时）→ **验证明细**（每项一节：检查项 / 验证内容 / 验证方法 / 验证结果 + 诊断信息）。
- 【变更】真机联动：demo40 的 change-20260930-ecum-3245 verify.md 已用新渲染器从其 verify-report.json 重渲染——rail 点开即见新格式。
- 新增 3 个测试（stages.spec.ts `renderVerifyMd (demo33 问题 3 — 正式测试报告)` describe）：通过全格式断言、未知检查名回退、必需检查失败 ❌ 分支。

## 问题 4：变更总览 → 浏览器打开 + 独立看板

- 【变更】`packages/client/ui-baf-workflow/src/client/dashboard-html.ts`（新文件）：`buildDashboardHtml(data, labels)` 纯字符串 HTML 构建器——内联 CSS+SVG 零外部资源，深色主题（#0c0f16 + 渐变辉光），含 6 汇总磁贴（进行中/已归档/已放弃/任务完成/累计耗时/累计 Tokens）、模式分布甜甜圈图（SVG stroke-dasharray）、耗时排行 Top8 条形图、每条变更一张卡（模式徽章/阶段 pill/任务进度条/成本/产物 chips）。
- 【变更】`src/client/WorkflowView.tsx`：变更总览弹窗新增 **在浏览器中打开** 按钮——构建 HTML → Blob URL → `window.open('_blank', 'noopener,noreferrer')`，60s 后 revoke。
- 【变更】`src/client/locales.ts`：17 个新 i18n key（`dashboard.openExternal` + `dashboard.board.*`），看板页全文案走 `t()`（en/zh 双语）。
- 【变更】`tsconfig.client.json`：files 列表补 `dashboard-html.ts`（该包显式文件清单模式，新源文件必须登记，否则 TS6307）。
- 真机 walk（`apps/web/.demo33-verify.mjs`，gitignored）：弹窗按钮存在且可点 → popup 断言标题/6 磁贴/两图表/变更卡/甜甜圈 SVG/排行条/深色背景 + rail 裁剪 18 项全 PASS；截图 `tmp/webwalk-demo33/demo33-04-board.png` 经视觉复核无重叠/裁切缺陷。

## 遗留问题（按影响排序）

1. **存量变更的 checklist.md/verify.md 不回填**——问题 2/3 只对新生成的产物生效；存量要新格式需像 demo40 那样手动重渲染（有 verify-report.json 即可）。低风险，不建议自动批量回填。
2. **看板是快照页**——Blob URL 打开的是生成时刻的数据，不自动刷新（页脚已注明「快照」）；实时刷新需轮询/事件通道，属后续增强。
3. **checklist 命名规范无门禁**——问题 2 的格式靠提示词约束，checklistGate 只查勾选数不查粗体命名格式；如需硬门禁可在 gate 里加正则。
4. **未知检查名的中文元数据靠回退**——`CHECK_CATALOG_ZH` 是硬编码注册表，新增检查（如未来 lint 检查）需同步登记，否则 verify.md 显示原文英文名。
