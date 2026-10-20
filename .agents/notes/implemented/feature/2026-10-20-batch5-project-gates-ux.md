# 批次五：项目工程 + 确认门体验批（desktop 0.0.27）

日期 2026-10-20 · 分支 `baf` · 桌面版本 0.0.26 → 0.0.27（`--dir` 免安装包）
工作流：修改 → web 端真机探针验证（8 点全过）→ exe 产出

需求原文分两组：主页·工作流·**项目工程** 四点（1.1–1.4）与 **确认门** 六点（2.1–2.6）。

---

## A 组 · 项目工程（ui-settings-baf-standard + desktop preload/main）

### 1.1 项目信息卡：去分隔线 + 路径 hover 下划线
- 【变更】`StandardsOverview.module.css`：删两行之间的 divider；`.pathValueButton` 基态 `text-decoration: underline transparent` + `text-underline-offset: 3px`，`:hover` 只把 `text-decoration-color` 点亮为 `currentColor` —— 无阴影、无底色，读作链接。
- 【变更】`.configValue` 同款 hover（配置文件行）。web 真机实测：hover 两值 computed `text-decoration: underline` / `box-shadow: none`。

### 1.2 受保护路径同款 hover
- 受保护路径条目复用 `.pathValueButton`（`ProtectedPathRow`，`StandardsOverview.tsx:342`），规则同 1.1，样式面零额外代码。
- demo1 工作区当前无已配置条目，CSS 层验证 + 单测覆盖。

### 1.3 状态脚本「选择脚本文件」
- 【变更】`overlay/desktop/src/main.ts`：新增 `ipcMain.handle('baf:pickScriptFile')` —— `dialog.showOpenDialog` 带 `defaultPath: 工作区路径`（文件选择框默认打开工作区目录）。
- 【变更】`overlay/desktop/src/preload-desktop.ts`：`__BAF_FILE_PICKER__` 桥暴露 `pathFor(File)` + `pickFile(defaultPath)`。
- 【变更】`NodeHooksCard.tsx`：`pickKind` ref 路由 —— 选完文件只填**当前操作的**进入/退出脚本行（`Record<'enter'|'exit', string>` per-kind 输入），不再两行同显。
- 添加后的脚本行 hover 同款下划线（`.hooksEntryButton:hover`）。
- 【变更】`standards-overview.client.spec.tsx` picker 测试重写：native 桥对话 → enter 预填 exit 空；null 取消；webBridge `pathFor` 路由；outside/裸名路径。

### 1.4 状态脚本流程图与确认门画布一致
- 【变更】节点卡复用确认门画布卡片样式（同色、同状态高亮；批次四已对齐布局，本批补齐 hover 语义）。
- 【变更】未配置节点**无** `title` tooltip（hover 不弹详情）；配置了进入/退出脚本的节点才带 title 显示脚本详情。web 真机实测：`建立变更`（未配置）向上爬 4 层无 title。

## B 组 · 确认门（ui-baf-workflow 客户端 + baf-workflow 运行时）

### 2.1 门禁明细重排
- 【变更】`GatesOverviewRow.tsx`：明细列改三小节 —— `gates.sectionStage`（阶段门禁）/ `gates.sectionEdge`（进入下一步的条件）/ `gates.sectionConfirm`（确认门），各带 `.sectionLabel` 小标题。
- 【变更】确认门卡分层：`.gateTitle`（13px/600）→ `.gateQuestion` → `.gateOptions`（上边线分隔的选项行）；`OptionLine` = 说明 label（主色）+ 命令（mono、tertiary、`overflow-wrap: anywhere`）。
- 【变更】`locales.ts` zh/en 三 key 新增；`gateFn` / `advanceGateId` / `bugFix` 等技术后缀从展示面删除（stage 行只显示 `阶段门禁 {artifact}`）。

### 2.2 提案门只显示一次 + 完整流程
- 【变更】`GatesOverviewRow.tsx` 顶部：`READER_SKIPPED_GATES = new Set(['design-confirm'])` + 分发循环 `if (gate.bugFix === true || READER_SKIPPED_GATES.has(gate.id)) continue` —— bugfix-open-advance 孪生门与 design-confirm 停靠重弹在 pills/明细/aria 三个面全去重。
- **运行时双门逻辑不动**（go-coordinator 的 design-advance 首弹 / design-confirm parked re-pop 语义保留），只做读者面去重 —— 这是 2.4 的解法本身。
- 【变更】`gate-overview.ts`：`open` / `implement` 的 bug-fix `note` 字段删除，总览只投影完整流程。

### 2.3 删 T 前缀 + 通俗化
- 【变更】`graph-template.ts`：`CONDITION_ZH`（T1–T16 全中文）移入并 **export**；`conditionTextOf(edge)` helper（`CONDITION_ZH[id] ?? condition`）。
- 【变更】`GatesOverviewRow.tsx` stepConditions / `WorkflowView.tsx` SVG 边 `<title>` 同用 `conditionTextOf` —— 明细行与连线提示单源同文，全无 `T2:` 式前缀。
- 【变更】`command-drives.ts:578` T15 升级卡标题 → 「已升级为完整流程 · 当前澄清」。

### 2.4 设计双确认门去重
即 2.2 的 `design-confirm` 客户端过滤 + 文案对齐（见 2.5）：读者只见一个「设计已完成 · 请确认进入计划」，运行时 parked 重弹仍走原命令（`/baf-go` 确认 / `/baf-workflow-clarify` 退回），无行为回归。

### 2.5 确认门文案统一（运行时真文案）
- 【变更】`gate-cards.ts` GATE_REGISTRY —— 唯一事实源（session 卡 / Tab pendingGate / CLI / 模型工具四表面共用）：
  | 门 | 标题 | 确认项 | 回退 |
  |---|---|---|---|
  | open-advance | 提案已完成 · 请确认进入澄清 | 确认 · 进入澄清 | 暂不推进 |
  | bugfix-open-advance | 提案已完成 · 请确认进入实施 | 确认 · 进入实施 | — |
  | clarify-advance | 澄清已完成 · 请确认进入设计 | 确认 · 进入设计 | 暂不推进 |
  | design-advance / design-confirm | 设计已完成 · 请确认进入计划 | 确认 · 进入计划 | 暂不推进 / 退回，继续澄清需求 |
  | plan-advance | 计划已完成 · 请确认进入实现 | 确认 · 进入实现 | 暂不推进 |
  | verify-advance | 实现已完成 · 请确认开始验证 | 确认 · 开始验证 | 暂不推进（原「暂不验证」）|
  | verify-archive | 验证已完成 · 请确认归档 | 确认 · 归档 | — |
  | abandon / resume | 放弃当前变更 · 请确认 / 流程出现偏差 · 请选择回退位置 | — | — |
- 【变更】`locales.ts` `advanceDialog.title` = `{from}已完成 · 请确认进入{to}`；`WorkflowView.tsx` 两个 advanceDialog 调用点补 `from: t(node.{current})`。
- 设计确认门 question 与 design-advance 完全一致（go.spec 断言更新为「设计文档已经齐了」）。

### 2.6 图例删「一次性」
- 【变更】`GatesOverviewRow.tsx` 图例只剩 状态节点 + 确认门 两项；`.legendOnceChip` CSS 删除；once badge testid 全无。

## 验证

- **单测**：baf-workflow 8 spec + ui-baf-workflow gates-overview + ui-settings-baf-standard standards-overview 全绿（合 624 passed）；typecheck 5 gates PASS；build:lib clean（devtools EPERM 以 standalone 预热解决）。
- **web 真机**（dsh web @3080 + playwright headless Edge 带 token）：
  - 项目工程截图：项目信息卡无分隔线；选择脚本文件按钮就位；画布蓝卡与确认门一致。
  - 确认门截图：三小节明细、单提案 pill、无 T 前缀、图例无一次性、统一句式 8 门齐。
  - hover 程序化断言：项目路径/配置文件 `underline + no shadow`；未配置节点无 tooltip。
- **exe**：`brand-web → pack-dsh（packed dsh -> 行确认）→ overlay/desktop pnpm run dist:dir`；产物 `overlay/desktop/dist/win-unpacked/baf-dsh.exe`（0.0.27，免安装）。

## 遗留问题（按影响排序）

1. **design-confirm 停靠重弹的运行时卡**仍是完整副本（go-coordinator 双门保留所致）——读者面已不可见重复，但模型在 park 场景弹出的会话卡仍是独立实例；若后续要收敛为单门，需动 go-coordinator:739-758 的 parked re-pop 语义 + requirement-park 测试面，风险中等。
2. **受保护路径 hover 真机未验**（demo1 无条目）：CSS 与 1.1 同类同规则、单测覆盖，但建议客户在有条目的工作区肉眼过一眼。
3. **native 文件对话框默认路径**只在桌面端生效（web 端无 `__BAF_FILE_PICKER__`，走取消/手输路径）——按设计，web 调试时不可验，桌面冒烟时顺带确认。
4. oxlint 存量 13 errors 在 standards-overview.client.spec.tsx（全部在我新块之外的旧行）——不修避免 churn，下次触碰该文件时顺带清。
