# 桌面 splash/主标题 + 工作流七问题修复全景（2026-09-25 需求 → web 实测）

需求来源：用户 2026-09-25 提出的桌面 2 条 + BAF 工作流 7 条。全部落地后经
`dev:web`（:3080）Playwright 验收走查 + 计时器专项走查确认；`tsc -b` host/client
双绿、相关 vitest 绿、oxlint 与 HEAD 基线持平（WorkflowView 33 条全部先在）。

## 一、桌面（baf-dsh 壳）

### 1. Splash 左下版本号 + 右上加载计时器（桌面 1）

【变更】`overlay/desktop/ui/splash.html`：面板右上角新增 `<p class="timer">`
（200ms 一跳）；底部由单行 `credit` 改为 `footer` 双列——左 `version`、右 `by sora`。
【变更】`overlay/desktop/ui/splash.js`：版本号读 `loadFile` query 参数 `v`（主进程
`seedVersions().bafDsh` 注入，沙箱页只读字符串）；计时器 `performance.now()` 差值
0.1s 精度。
【变更】`overlay/desktop/src/main.ts`：splash `loadFile` 追加 `?v=<bafDsh>`。
【变更】`overlay/desktop/ui/splash.css`：`.timer` 绝对定位右上、`.footer` 弹性
双列布局。
验证：静态核对（splash 仅启动瞬间可见；`overlay/scripts/bench-spawn-to-shown.mjs`
可作 A/B 基准，本需求不改启动路径）。

### 2. 主页 hero 标题补全 + badge 改 BAF（桌面 2）

【变更】`ui-conversation/src/client/locales.ts`：headline 补全
「探索未至之境，拉启智能篇章」；badge「预览版」→「BAF」。
【变更】`ui-conversation/tests/skeleton.client.spec.tsx` +
`snapshots/web/lifecycle-chrome/plan-active-zh.expected.md`：快照同步。
实测（web 走查 hero.headline / hero.badge）：标题与 badge 均绿。

## 二、BAF 工作流（七条）

### 3. 工作流 Tab 单页闭环（工作流 1，主项）

目标：会话页挂着 BAF 工作流弹窗（初始化工作区 / 推动工作流 / 已有进行中的变更 /
分类确认等）时切到工作流 Tab，会话页的表单弹窗隐藏，工作流页顶部出现同一组选择
按钮；顶部常驻「推进」按钮取消，改为仅在需要推进时弹顶部对话框；非工作流弹窗
（业务选择题）保持原底部弹窗。

实现（新文件 4 个）：
【变更】`ui-baf-workflow/src/client/tab-activity.ts`：`useSyncExternalStore` 模块级
store，记录「哪个会话的工作流 Tab 正在屏上」。
【变更】`ui-baf-workflow/src/client/gate-ask.ts`：BAF 工作流 ask 通道契约——
header `BAF 工作流` 鸭子判别（baf_gate_ask 载体）、选项/hint 结构、
`ask_options_blocked` 守卫。
【变更】`ui-baf-workflow/src/client/BafGateComposer.tsx` + `.module.css`：统一
BAF 会话卡（`[data-baf-gate-card]`）——composer 链 entry 优先级 -10，Tab 活跃时
渲染 null（工作流 2 的统一样式同时落地）。
【变更】`ui-baf-workflow/src/client/index.ts`：注册会话卡 entry；Tab 顶部推进
对话框期间抑制其它卡（行 100 附近）。
【变更】`ui-baf-workflow/src/client/WorkflowView.tsx`：
- 行 590/600：LIVE 会话门对话框（`[data-live-gate]`）仅 Tab 在屏时挂载，与
  `[data-baf-gate-card]` 同题同选项；
- 行 958：常驻「推进」按钮删除；
- 行 1128：`[data-advance-dialog]` 顶部推进对话框——仅 `advance.ready` 且无更高
  优先级卡且未dismissed时出现（行 527 dismissal ref）；
- 行 1038/1092：LIVE 门/推进对话框在场时抑制旧入口，避免双弹。
【变更】`ui-baf-workflow/src/index.ts`（行 368）：`skipAsk`——Tab 顶部对话框
自行回答后，不再向会话页发问。
【变更】`ui-baf-workflow/src/types.ts`（行 26）、`locales.ts`（行 151/578）：类型
与文案同步（「常驻推进按钮改为顶部推进对话框」）。
实测（verify-batch run1/2，12/13 绿）：发消息 → 会话卡出现（标题+按钮+hint）→
切 Tab：会话卡隐藏 + 顶部同题对话框 + 顶条无「推进」按钮 → 经顶部对话框作答 →
后续门（新建工作流 → 需求分类待确认 → 确认·完整流程）全部在 Tab 顶部出现并可
作答 → change-active。业务选择题（澄清「本轮范围」）仍走原底部通用弹窗——
run3 实证。

### 4. 工作流弹窗卡片统一样式（工作流 2）

【变更】`BafGateComposer.module.css`：统一卡片视觉（与通用选择题弹窗区分）；
【变更】`WorkflowView.module.css`（行 760）：顶部 LIVE 门选项的行内 hint。
无技术细节：标题/question 直出，选项只带人话 hint。实测同上（卡片标题、按钮、
hint 断言）。

### 5. 变更耗时每秒走秒（工作流 3）

根因（web run2 实测 4m0s→3m59s 倒退）：host 每 2s 派生 totals，客户端在本地
apply 时刻重新锚定插值起点——apply 滞后于派生约 1s，每次 poll 都把已画出来的
值拽回去。
【变更】`baf-core/src/tab-view.ts`（行 52）：`WorkflowTabMetrics.computedAt`——
host 派生时刻的 epoch-ms 时钟戳。
【变更】`baf-workflow/src/metrics.ts`（行 158）：totals 恒带 `computedAt: nowMs`。
【变更】`ui-baf-workflow/src/client/tab-types.ts`（行 149）：客户端镜像 wire 类型
同步加 `computedAt`（客户端 import 的是这份 browser-safe 镜像，不是 baf-core）。
【变更】`WorkflowView.tsx`：行 540 插值锚点改 `metrics.computedAt`；行 519/638
`lastShownTotal` 单调 clamp（同一 change 内时钟偏移/pipeline 滞后永不倒退）；
行 626 1s ticker 仅在 change 活跃时运行；行 884 顶条读插值值。
实测（verify-timer 终轮全绿）：`4.2s→5.3s→6.3s→7.3s→8.3s→9.3s`（每 1.15s 采样
+1.0s，顺滑走秒，零倒退）。
语义说明：变更耗时=各阶段窗口时长之和，阶段间停靠（等门确认）时数值平坦——
与阶段卡、历史口径一致，非缺陷。

### 6. 阶段详情删「常见失败与处理」（工作流 4）

【变更】`WorkflowView.tsx`（行 2459/2472/2547）：整段参考表删除；异常
reason/solution 仅在阶段真正 failed/blocked 时渲染（唯一失败面）。
【变更】`locales.ts`（行 512）与 `WorkflowView.module.css`（行 756）：文案与
`.failTable/.failRow/.failCode/` 样式收口。
实测：详情页断言「常见失败与处理」不存在（detail.no-failure-table 绿）。

### 7. 已忽略全灰（工作流 5）

【变更】`WorkflowView.tsx`（行 203）：`已忽略` 状态在所有呈现面统一灰色降级。
（无归档数据的 workspace 无法 E2E，单测+静态核对。）

### 8. 变更总览含会话统计（工作流 6）

【变更】`WorkflowView.tsx`（行 2143）：历史模态在变更分类旁新增「会话统计」。
（同上，归档数据缺，静态核对 + 模态可开断言 dashboard.modal-opens 绿。）

### 9. 变更分类 · 影响范围待落定文案（工作流 7）

【变更】`locales.ts`（行 270/478）：未落定影响范围读「待计划阶段确认」。
实测：intake.scope-plan-pending 绿（Tab 卡上断言到该字符串）。

## 验证台账

| 门 | 结果 |
|---|---|
| baf 包 tsc -b | EXIT 0 |
| client tsc（ui-baf-workflow 等） | EXIT 0 |
| vitest（5 文件 20 用例） | 全绿 |
| oxlint（root，改动文件） | 与 HEAD 基线持平（WorkflowView 33 / tab-view 3 / metrics 0 / tab-types 0，全部先在） |
| verify-batch run1 | 12/13（唯一 FAIL 为倒退计时器 → 根因修复） |
| verify-batch run2 | 12/13（计时器 4m0s→3m59s 倒退实证） |
| verify-batch run3（修复后） | 10/13——3 条 FAIL 均为场景差异非缺陷：首轮门是业务选择题（按设计走通用弹窗）、变更停靠阶段间（耗时平坦=正确语义） |
| verify-timer 终轮 | 2/2 全绿（走秒 +1.0s/sample ×5、零倒退） |

验收脚本（未入库，apps/web/ 下）：`verify-batch.mjs`（全量走查）、
`verify-timer.mjs`（计时器专项：放弃遗留变更 → 新消息 → 门应答 → 走秒采样）。

## 「生成 web」阶段事故与修复（2026-09-26 凌晨）

首次 `pnpm run build` 成功后，生产 `dsh web` 仍渲染旧 hero 字串。三层根因链：

1. **tsc watcher 竞速污染**（主因）：在 dev:web 监视器运行期间编辑的文件，其中间产物
   `lib/types/client/*.js` 可能带「旧内容 + 新 mtime」——后续所有增量 `tsc -b` 判定
   输出比输入新而永久跳过，tsdown 再把陈旧中间体打成 `lib/client.js`，覆盖掉 dev
   监视器产出的新鲜 bundle。ui-conversation（hero 字串）与 ui-baf-workflow
   （computedAt）均中招。
2. **清理暴露部署树入口缺失**：purge 全部 `lib/types` 后，tsdown workspace pass 对
   `packages/*/*` 中无本地 tsdown 配置的 pnpm-deploy 输出树（code-runtime×2、e2b×3、
   experimental×2、agent-presets、settings-file、workflow-worker-thread 共 9 棵）按
   继承入口 `lib/types/{index,invariant,startup}.js` 解析——报错标签
   `@deepseek-ai/dsh-root`（code-runtime/code-runtime 无 package.json，名字向上解析
   到仓库根）极具误导性。修复=每棵树 `cp lib/index.js lib/types/index.js`。
3. **被排除的 baf-only 包**：ui-settings-updates / ui-sidebar-textpreview 被根
   client solution 排除（master API 分歧，见 tsconfig.client.json 注释），主构建通道
   永远不会重建它们的 `lib/types`——单独 `tsc -b <pkg>` 重发（TS6306/TS2339 报错但
   产物落地）。

修复后全量构建绿（273 client artifacts），生产 smoke 全绿：hero 标题/BAF badge/
composer/工作流页签/顶条变更耗时/无常驻推进按钮。完整修复阶梯已存
memory（baf-dsh-tsc-watcher-race-stale-lib）。

## 剩余风险 / 不平整点（按 用户可见度 × 修复成本 排序）

1. **推进对话框弹出时机仅静态验证**（可见度高/成本低）：`[data-advance-dialog]`
   仅实测过「阶段中途不出现」，未在 verify/design→archive 收口时刻实测弹出+作答。
   demo10 现有归档变更可手动走查补证。
2. **已忽略灰 / 会话统计两条无 E2E**（中/低）：所有注册 workspace 均无归档数据，
   只能单测+静态。建议下次在一个 workspace 走完 verify→archive 留数据。
3. **FRESH（无 .baf）初始化工作区门路径未实测**（中/低）：需新建空 workspace；
   verify-batch 的 `fresh` 分支已备好。
4. **计时器停靠平坦的感知风险**（中/低）：阶段间停靠时数值不动是对的（口径=
   阶段时长和），但用户可能误以为卡死。可选缓解：停靠时旁挂「等待确认中」
   状态字，或改口径为 wall-clock（需与阶段卡/历史同步改，成本高）。
5. **verify-batch run3 的门序列不确定性**（低/低）：重复消息命中活跃变更时首轮
   门可能是业务选择题而非 BAF 卡——走查脚本已容错（记录 which-card），非产品问题。
6. **预先存在**（非本轮）：chat-apply.client.spec.tsx 5 failures
   （SlotTestRuntime 双 'remote' 注册）、WorkflowView 33 条 lint 基线——均先在，
   未新增。
7. **验收脚本未入库**（低/低）：`apps/web/verify-{batch,timer}.mjs` 仍 untracked；
   要么入库作回归走查，要么移 tmp。桌面 splash 两条仅静态验证（启动瞬间 UI，
   bench-spawn-to-shown.mjs 可作后续 A/B）。
