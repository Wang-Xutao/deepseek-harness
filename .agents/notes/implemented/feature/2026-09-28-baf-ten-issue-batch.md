# 2026-09-28 · 十问题批次（弹窗居中 / 汇报分段 / bug-fix 死锁 / token 总览 / 滚轮 / 指令格式 / 会话绑定图 / checklist.md）

> 分支 `baf`，承接 2026-09-27 bug-fix-path 批次。本批全部为工作流体验与门禁修复，
> 未动桌面 splash。测试基线：baf-guard 35/35、baf-workflow 366/366、受影响项目 tsc 全绿。

## 一、逐项落地

### 1. 会话页工作流弹窗 → 居中模态（更醒目）

- 【变更】`packages/client/ui-baf-workflow/src/client/BafGateComposer.module.css`：
  内联 composer 卡升级为**遮罩 + 视口居中模态**——`position: fixed` + 半透明暗色 scrim（`backdrop-filter: blur(3px)`，z-index 2200），卡片 560px 宽、顶部 4px 金色强调条、重阴影 + 入场缩放动画；eyebrow 从文本行变为金底胶囊。
- 【变更】`BafGateComposer.tsx`：外层 `div.overlay[role=dialog][aria-modal=true]`。**刻意不提供关闭叉/ESC**：停靠门只经选项按钮离开（门 = 强制决策，语义即阻塞）。
- 工作流页签激活时仍隐藏（原逻辑不变，双表面互斥）。

### 2. 阶段汇报分段显示（根因 + 模板重构）

- **根因**（比"模板写得密"更深一层）：persona 的 `prefix: >-` 是 YAML **折叠标量**——四行骨架在模型提示词里被折叠拼接成**一整行**，模型自然照着一大段输出。
- 【变更】`packages/preset/agent-presets/presets/baf/agent.cordis.yml` + `packages/bundle/web-app/presets/baf.patch.yml`（zh+en 双份）：
  - `>-` → `|-`（字面量标量）。原有段落本就是单物理行，除骨架外逐字节不变（js-yaml 解析验证：段落结构、zh/en 完整性均保持）。
  - 骨架重写为分段版：四个小节各自独立成块、块间空行、`**【…】**` 加粗标题、节内用 `- ` 列表、多文件一行一项、任务清单可用「任务号 | 内容 | 状态」表格。明确写「禁止并成一大段」。
  - patch.yml 的 en 块原本缺【下一步】行，顺手补齐与 preset 对齐。

### 3. bug-fix-path demo-21 死锁（重要）+ 流程图/产物 parity

**死锁取证**（demo-21 `change-20260927-ecum-demo-1e45`，tmp/demo21-*.jsonl 会话日志解压）：
- 模型行为全部正确：填 bug-record.md、plan.json，试图写文件——`baf-guard` 全部 `protected_path` 拒绝（6 个回合）；
- 走不通的根因：guard 的 open 阶段产物白名单**只有 proposal.md**（2026-09-22 修的 full-go 语义），bug-fix 模式的 open 产物 bug-record.md / plan.json 根本不在放行集里；
- 「强制放弃」的真相：不是系统强制，是模型被逼 6 回合后自己调了 `baf_gate_ask {gateId:'abandon'}`。
- demo-bugfix6 当时能走通是因为 classify extraArgs 预填字段后**系统代写**记录（模型零写入），掩盖了此洞。

【变更】`packages/baf/baf-guard/src/policy.ts`：open 阶段产物放行按 mode 分流——full-go 放行 proposal.md；bug-fix 放行 bug-record.md + plan.json（工单明说的填写目标）。
【变更】`tool-guard.spec.ts` +回归：bug-fix open 恰好放行两件、proposal.md 仍拒；full-go open 反向验证。

**parity（图 + rail 与 full-go 一致，裁剪显示「已裁剪」）**：
- 【变更】`stages/gates.ts`：`ArtifactState` 增 `'clipped'`；`BUG_FIX_ARTIFACT_ORDER` 扩为 7 行（bug-record / clarify✂ / design✂ / plan.json / tasks / checklist / verify.md），clarify/design 行直接置 clipped 不读盘；
- 【变更】`baf-core/tab-view.ts` + `client/tab-types.ts`：wire 类型同步 `'clipped'`；
- 【变更】`WorkflowView.tsx`：rail clipped 行置灰无打开按钮（`blocked`）；流程图 off-path 节点徽章在 template 之前判 `已裁剪`；`locales.ts` 增 `status.clipped` / `artifact.state.clipped`（zh「已裁剪」）。

### 4. 变更总览 token 总用量「-」

- 根因：`buildWorkflowDashboard(store)` 折叠指标时**没传 usagePoints**（第三参默认 `[]`），token 归因只在 Tab 视图路径发生。
- 【变更】`dashboard.ts`：`buildWorkflowDashboard(store, usagePoints = [])`，行折叠把 usage 样本喂给 `deriveWorkflowMetrics`——归因是**时间窗**制的，落在哪个变更的哪个阶段窗口就记给谁。
- 【变更】`ui-baf-workflow/src/index.ts` `dashboard` Remote：`sessionPersistence.list()` 按 header cwd 过滤本工作区全部会话 → 复用 Tab 路径的 per-session revision 缓存（`usagePointsFor`）→ 拼接喂给 builder。历史会话（跨进程）也能归因，因为读的是持久会话日志而非进程内绑定。

### 5. 流程图滚轮上下移动

- 【变更】`WorkflowView.tsx` FlowCanvas `onCanvasWheel`：Ctrl+滚轮 = 缩放（原有）；**裸滚轮 = 垂直平移**（新增）；Shift+滚轮 = 水平平移。pan 钳制在画布范围（新增 `clamp` helper）。

### 6. baf 指令格式统一（merge 前后对比）

- 取证（agent 核查 `formatCommandReport` byte 级对比）：merge `15829a17fc` 前后格式化器**逐字节一致**；唯一漂移 = GUI 侧 `1b56a3acc4` 让 GenericCommandCard 默认展开、去掉了标题后缀，但 CLI 镜像 `cmdline.ts` 三处仍带 ` · 点本行展开/折叠详情`。
- 【变更】`cmdline.ts` `cardTitle` + `missingCwd`：后缀删除，CLI 与 GUI 标题收口一致。
- 【变更】`overlay/docs/enterprise-workflow.md`：§20.2 标题约定、欢迎卡/门卡/漂移卡示例、H 节 as-built 记录——示例去掉后缀，约定处加【变更】2026-09-28 注记（历史段落保留原文 + 日期注解）。

### 7. 工作流页签名会话对应（demo-21 两会话各显示各的图）

- 根因：Tab 视图选图回退链只有 workspace 级 `pickActiveChange`（排名挑一条），两会话看到同一条。
- 【变更】新模块 `baf-workflow/src/session-change.ts`：进程内 `(cwd, sessionId) → changeId` 绑定表（host-memory 锚定）。
- 【变更】写入点：`gate-ask.ts` 弹门即绑（dialog 腿 + active-conflict 腿）；Tab Remote 的 `startIntake` / `confirmIntake` / `gateResolve`。
- 【变更】读取点：`viewFor` —— `changeId ?? sessionChangeFor(root, sessionId)` 优先于 workspace 排名回退。命令面（/baf-go）不绑（纯 resolveChange，无 agent 上下文，维持原语义）。
- 【变更·冒烟时发现并修复】进程内绑定挡不住**重启后打开旧会话**的验收场景（demo-21 的两个会话都是修复前创建的）——补冷读回溯：`deriveSessionChangeFromEvents` 纯函数扫描会话持久日志（`user/message` 的 go-dispatch source.changeId / `baf/route-resolved` 审计事件 / `assistant/message` 的 `baf_gate_ask` 工具调用参数），**事件序最后提及者胜**（与活绑定的「后弹门重绑」语义一致）；Tab Remote 在绑定缺失时经 `sessionQuery.observeSession` 冷读一次、命中即回填共享绑定表，无信号的纯聊天会话负缓存不重扫。新增 `session-change.spec.ts` 7 例。

### 8. 验证阶段 checklist.md（新产物 + 双前置硬门）

**语义**（用户需求原文的落法）：
- 状态与 tasks.md 同构：尚未生成 → 仍是未填的模板 → 已计划（有未勾项）→ 已填写（全 `[x]`）；
- 实现完成、验证开始前生成 → **入口前置门**；验证阶段逐项确认打勾 → **归档前置门**；全部勾选才放行归档。

落点：
- 【变更】`stages/gates.ts`：`CHECKLIST_FILE` / `parseChecklist`（markdown 勾选行解析）/ `CHECKLIST_REQUIREMENTS_ZH`；`checklistGate`（入口前置：存在、非模板、≥1 项）；`checklistTickedGate`（归档前置：0 未勾）；两条产物序（full-go + bug-fix）都在 tasks.md 与 verify.md 之间插入 checklist.md；rail 行四态分类。
- 【变更】`go-coordinator.ts` `verifyEntry`：驱动前先过 `checklistGate`，不过 → 拒绝卡「验证检查单未就绪 · 不能开始验证」+ 派 `checklist-missing` 工单（implement 节点、产物指 checklist.md）；**confirm 捷径同样受制**——任何表面都绕不过。
- 【变更】`go-coordinator.ts` case 'verify'（门 B 前）：`checklistTickedGate` 不过 → 拒绝卡逐项列「未确认：…」+ 派 `checklist-open` 工单（verify 节点）；全勾才 park 门 B。
- 【变更】`go-dispatch.ts`：`DispatchNode` 增 `'verify'`（订单产物映射 checklist.md）；`cause` 联合增 checklist 两值；工单标题分型（生成验证检查单 / 勾选验证检查单）；`IMPLEMENT_REQUIREMENTS_ZH` 增教学项——模型在最后一个任务完成的同回合就写检查单，不等拒绝卡。
- 【变更】`orchestrator.ts` `docAdvanceDue`：implement 完成后弹 verify-advance 的条件**再加 checklistGate**——弹窗文案断言「checklist.md 已生成」，未生成时 rests 在模型写作域（客户的 /baf-go 会拒绝并派单）。
- 【变更】`baf-guard/policy.ts`：verify 阶段**仅放行 checklist.md**（勾选写入），其余产物仍保护；`tool-guard.spec.ts` +回归。
- 【变更】`gate-cards.ts` verify-advance 卡改文案：「实现完成 · 请确认验证检查单」，问题列明 checklist.md 确认 → 验证 → 逐项打勾 → 全勾才归档。
- 【变更】`llm/message.ts` `ContextFormed` go-dispatch `node` 联合增 `'verify'`（持久日志契约，向后兼容放宽）。
- 【变更】`WorkflowView.tsx` stageOf：checklist.md 归验证阶段行。
- 测试：`go.spec` 新增 2 例（无清单拒绝入验证 / 有未勾项停 verify、全勾后归档）、`reachGateB` 夹具播种全勾清单、`stages.spec` bug-fix rail 新序 + checklist 四态、`lanes.spec` full-go rail 8 行。
- **后续版本**（本批不做）：checklist 分节模板与用户可配置裁剪（默认包含哪些检查类别）。

## 二、问题 9 的答复：状态 × 产物 × 确认的时序

**确认：当前实现就是你理解的前者——「状态内产出产物 → 停靠等确认 → 确认后才离开该状态」。**

时序图（full-go-path）：

```
进入阶段 X（系统装模板）
  │  模型在 X 状态内填写产物（guard 限制 X 阶段只写 X 的产物）
  ▼
模型回合结束 → 系统检测产物达完成门（文件门）
  │  未达 → 停靠在 X，派工单（缺什么逐项）
  ▼
产物达门 → 弹客户确认卡（advance 族 / 门 A / verify-advance）
  │  【此刻仍在 X 状态】节点状态 = completed 但 current 未变
  ▼
客户点确认 → 才进入下一阶段（装下一阶段模板）
```

例外说明（与直觉一致）：
- verify → archive（门 B）是「先跑完验证（产物 verify.md 已生成）→ 停靠等归档确认」——同样是产物先行、确认后离态；
- 非门控边（如 plan → implement 的装模板推进）只在**客户发起**的驱动（/baf-go、门卡点击、Tab 按钮）上前进，模型和系统都不会自行推进——所以「先出状态再补确认」的形状在实现里不存在。

## 三、问题 10 的答复：verify 阶段实现到哪一步、还差什么

对照 `overlay/docs/enterprise-workflow.md` 设计，当前 verify 实现（**约 80%**）：

**已实现**：
- 机器检查管线（CheckRunner：openspec validate / build / 测试类检查，必需/非必需分级）；
- T11 回环：必需检查失败 → 退回 implement + 派修复工单（带失败诊断）；
- verify.md 验收文档（机器渲染，含 passed 结论）+ verify-report.json 机读账本（drift 新鲜度锚点）；
- 门 B（verify→archive 客户确认）+ 新增 checklist 双前置硬门（本批问题 8）；
- 回合结束自动弹门（orchestrator）+ 三表面等价确认（弹窗/Tab/斜杠）。

**未实现 / 占位**（「感觉是空的」的来源——placeholder 跳过的行）：
1. `<enterprise-tbd>` 基线检查：未配置基线时整行 `policy_missing` 跳过（占位通过，非真实检查）；
2. **R16 verify_stale**（归档前验证报告过期复核）：设计有、实现无——门 B 目前只查 checklist 勾选，不复核 verify 报告是否仍新鲜（git revision 变了仍可归档）；
3. 路由元数据校验（检查项与 plan.json verify 命令的对应关系审计）；
4. `tool_unavailable` 硬化：工具缺失时必需检查目前降级为跳过而非阻塞（设计要求区分）；
5. format-check 类检查（格式一致性）不在检查集；
6. 聚合报告的工作区身份（多变更共用报告时的归属标注）。

建议优先级：R16 verify_stale（防「旧报告归档」真实风险）> policy_missing 显式化（把占位跳过显示为「未配置，跳过」而不是空行）> 其余。

## 四、遗留 / 待客户确认

1. **web 端确认**：本批构建后 serve，URL 交付（见会话）——重点看：居中弹窗、分段汇报（需新回合触发）、bug-fix rail 已裁剪行、流程图滚轮、变更总览 token、checklist.md 全流程（需走一条新变更到验证）。
2. checklist 用户可配置裁剪：后续版本（问题 8 尾款）。
3. 问题 10 的 R16 verify_stale 等 verify 深化项：待排期。
4. 会话→变更绑定：活绑定为进程内，但冷读回溯已覆盖旧会话/重启场景（命中即回填）；跨进程并发写日志的极端场景不重扫（负缓存），可接受。
