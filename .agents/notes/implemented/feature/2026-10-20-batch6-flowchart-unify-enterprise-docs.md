# 批次六（2026-10-20）：流程图统一 + 企业规范真文档批 — desktop 0.0.28

> 需求原句：① 主界面工作流右上角的 baf 签样式与设置·多模型路由右上角的 baf 签一致；② 项目工程·状态脚本流程图节点中英文一行、中文在前；③ 确认门流程图同款中英文一行、样式与状态脚本一致；④ 继续优化确认门·门禁明细 UI（清晰直观、和谐美观）；⑤ 企业规范页生成同款流程图、标注每个规范用到的状态、可打开对应规范，规范真实参考 `D:\Source\baf-codingplugin\bafplugin`，不再使用占位符。

## 0. 结论速览

| # | 需求 | 落点 | 状态 |
|---|------|------|------|
| 1 | 侧栏「工作流」行 baf 角标 = 设置导航 baf 徽标 | `ui-sidebar/SidebarRoot.module.css` `.panelBadge` | ✅ web 真机逐属性一致 |
| 2 | 状态脚本流程图中英文一行（中文前） | `ui-settings-baf-standard/NodeHooksCard.tsx` | ✅ 8 节点 oneLine |
| 3 | 确认门流程图同款一行双语节点卡 | `ui-baf-workflow/GatesOverviewRow.tsx` + module.css | ✅ 11 节点 oneLine |
| 4 | 门禁明细 UI polish | `GatesOverviewRow.tsx`（节标签左肋线 / 命令 chip / hover 分层） | ✅ 计算样式实测 |
| 5 | 企业规范真文档流程图 | 新 `enterprise-docs.ts` + `enterprise-docs-catalog.ts` + `EnterpriseDocsCard.tsx` + `enterpriseDoc` RPC + 37 份资产 | ✅ 真文档全文验证 |

构建链全绿：`build:lib` → staged oxlint → 82/82（client spec）+ 94/94（host spec）→ brand-web → pack-dsh（`packed dsh ->`）→ `dist:dir` → 产物 grep 命中（`ENTERPRISE_DOCS`×3 / `baf-enterprise-docs-card` / `_panelBadge` / `baf-gate-node-` / assets 37 文件）→ ProductVersion 0.0.28。

## 1. 需求 ①：baf 角标逐属性对齐

【变更】`.panelBadge`（侧栏「工作流」label 右上角的 `<sup>`）改与设置导航 `.bafBadge`（ui-settings-general）像素一致：`padding 0 3px`、`border-radius 4px`、`font-size 8px / line-height 10px / weight 700`、去 `letter-spacing`、去品牌色 10% 底色，边框保持 `color-mix(brand-primary 55%)`。

web 真机取证（CDP 9200 探针，同一页面同主题下并排抓取）：

| 属性 | 设置 `HZn8Na_bafBadge` | 侧栏 `rkWtYW_panelBadge` |
|---|---|---|
| padding | 0px 3px | 0px 3px |
| border-radius | 4px | 4px |
| font | 8px/10px 700 | 8px/10px 700 |
| letter-spacing | normal | normal |
| background | transparent | transparent |
| border | 1px solid rgb(15,17,21)·55% | 同 |
| color | rgb(15,17,21) | 同 |
| vertical-align | super | super |

取证要点：角标只在侧栏**展开态**渲染（`PanelRow` 的 `wide &&` 分支），折叠态 DOM 里没有 `sup` —— 排查时先点「打开侧边栏」。

## 2. 需求 ②③：三个画布统一为「一行双语」节点卡

- 【变更】`NodeHooksCard.tsx`（状态脚本）：节点名行改为 `{中文}{<span class=hooksNodeEn>English</span>}` 单行渲染，中文在前。
- 【变更】`GatesOverviewRow.tsx`（确认门画布）：11 节点（8 主链 + completed/drift/abandoned 支线）同款一行双语；节点卡复用与状态脚本同一套 CSS 几何（192×48 卡 + SVG 贝塞尔边 + 箭头 marker）。
- 企业规范画布（需求 ⑤）直接 import 同一 CSS module 的 `hooksNodeName/hooksNodeAccent` 类 —— 三画布同解剖由构造保证。

web 真机：状态脚本 8 节点（`接单Intake未配置` 等）、确认门 11 节点（`接单Intake` … `已放弃Abandoned`）、企业规范 8 节点（`设计Design` + accent `编码 · SRI · 高风险`）全部一行双语。

## 3. 需求 ④：门禁明细 polish

【变更】`GatesOverviewRow.tsx` + module.css：

- 三小节标签（阶段门禁 / 进入下一步的条件 / 确认门）加 2px 左肋线 + 7px 缩进、11px 弱化灰 —— 实测 `border-left: 2px solid rgb(15,17,21)·55%`。
- 确认门选项的命令（`/baf-go`、`/baf-workflow-im`）从行内文字改为 mono chip 徽标。
- 卡内分层（标题·问题·选项行）与 hover 状态细化。

## 4. 需求 ⑤：企业规范真文档（本批主体）

### 4.1 数据面（Host）

- 【新增】`packages/baf/baf-standard/assets/enterprise/**`（37 文件）：从 `D:\Source\baf-codingplugin\bafplugin` 真实迁移 —— `skills/sora-c-code-standards/SKILL.md`、`c/high-risk-review-checklist.md`、commitlint 配置、quality pack 等。
- 【新增】`packages/baf/baf-standard/src/enterprise-docs.ts`：10 条 `ENTERPRISE_DOCS` 目录（id / titleZh / titleEn / 资产相对路径 / 适用节点集）+ `readEnterpriseDoc()` 文件读取。标题是文档自身 `# ` 标题的**派生短标签**（部分去 `（Agent 短规则）` 尾巴）；查看器展示原文，首行可能带更全标题 —— 这是刻意的 UI 短标签 vs 全文并存。
- 【变更】`src/index.ts`：`bafStandardConfig` Remote 新增 `@Remote enterpriseDoc(id)`，返回判别联合 `BafEnterpriseDocResult`。

### 4.2 类型面

【变更】`ui-settings-baf-standard/src/types.ts`：`BafEnterpriseDocResult` 由单 interface（union 型 status）改为**判别联合** —— 否则 `Extract<T, {status:'ready'}>` 推导为 `never`（本批实际踩到：TS2339 ×6）。与 `BafStandardSummaryResult` 同族惯例。

### 4.3 状态面（Controller）

【变更】`standards-store.ts`：

- 旧规则摘要机制（`rules/rulesExpanded/areasExpanded/loadRules/toggleRules/toggleArea`）整体退役；企业规范文档是**产品常量**，不再依赖 workspace/baseline。
- 新增 viewer 状态机：`enterpriseDocId` + `enterpriseDoc`（loading → ready/unknown/unreadable）；陈旧应答按 id 比对丢弃；transport 失败 settle 为 `unreadable` 绝不悬挂。
- `localeActive` 镜像（locale service try/catch 兜底，裸测试 harness 落 'zh'）驱动画布 chip 标签的中英切换。

### 4.4 视图面

- 【新增】`enterprise-docs-catalog.ts`：客户端目录镜像（10 行 + short 短标签：总览/文档/编码/SRI/高风险/分支/提交/静态/UT/UT 表）。
- 【新增】`EnterpriseDocsCard.tsx`：8 节点画布（accent 行 = 该状态适用规范短标签 `' · '` 连接；无规范节点显示弱化 idle 行）→ 点击节点右侧列规范（DocRow：标题双语 + 适用状态串联）→ 点击规范卡内查看全文（`<pre>` verbatim + 「打开文件」按钮带真实资产绝对路径 + 关闭）。
- 【变更】`StandardsOverview.tsx` / `index.ts` / `locales.ts`：企业规范 tab 切换挂新卡 + 新 i18n 键；`tsconfig.client.json` files 列表补两个新文件。

### 4.5 测试（重写）

- `standards-overview.client.spec.tsx`：旧 rules-digest 用例退役，新增 3 组 —— 画布解剖（8 节点序 + 箭头 + accent 短标签）、节点→规范列表→查看器四态（loading/ready/unknown/unreadable 含 ENOENT 原文与 close 回调）、locale 切换 accent。
- 目录镜像一致性：`ENTERPRISE_DOC_ROWS` ↔ `ENTERPRISE_DOCS` id 序、双语标题、节点集排序相等、节点全在主链。
- Controller viewer：同 id 幂等、陈旧应答丢弃、rejected transport → unreadable。
- `standards-config-service.spec.ts`：Host 资产守卫 —— 遍历目录逐条 `enterpriseDoc(id)` 必须 `ready`、内容 >200 字符、含 `# ` 标题；未知 id → `unknown`。

### 4.6 web 真机验证（CDP 探针）

- 画布 8 节点 + accent（`编码 · SRI · 高风险` / `分支 · 提交` / `静态 · UT · UT 表` / 归档 `无适用规范`）+ 7 箭头。
- design 节点 → 3 规范行（code/sri/risk）→ 点击 code → 查看器标题 `SORA C 语言编码规范 · C coding standards`、正文 8777 字符、H1 `# SORA C 语言编码规范（Agent 短规则）`、267 行、含 clang-format；「打开文件」title = 真实绝对路径 `…\assets\enterprise\skills\sora-c-code-standards\SKILL.md`。

## 5. 发布

- desktop 0.0.28（`overlay/desktop/package.json` + `VERSION`）；version-notes desktop/dsh-baf-standard 条目重写；version-map 追加 0.0.28 行。
- 管线：brand-web（嵌入 v0.0.28）→ pack-dsh → `dist:dir` 免安装（不打 NSIS）。
- 产物 grep：`dsh-baf-standard/lib/index.js` 含 `ENTERPRISE_DOCS/enterpriseDoc`；`dsh-client-ui-settings-baf-standard/lib/client.js` 含 `baf-enterprise-docs-card`；ui-sidebar client 含 `_panelBadge`；ui-baf-workflow 含 `baf-gate-node-`；assets/enterprise 37 文件；exe ProductVersion 0.0.28。

## 6. 遗留问题（按影响排序）

1. **（低）规范标题短标签 vs 文档 H1 不完全一致** —— 目录标题是派生短标签（如 `静态分析规范（cpplint + cppcheck）` vs H1 `SORA C 风格检查与静态分析（cpplint + cppcheck）`）。查看器首行可见全文标题，信息不丢；若客户要求目录行也用 H1 原文，改 catalog 常量即可（10 行）。
2. **（低）查看器为纯文本 `<pre>`** —— markdown 不渲染（标题/代码块/列表按原文展示）。优点是与「打开文件」所见即资产原文；若要渲染需引入 md 渲染器并处理样式隔离。
3. **（低）企业规范画布 accent 只到「短标签」粒度** —— 一个规范跨多状态时靠右侧列表的「适用状态」串联补全；未做画布上的规范→多节点高亮联动。
4. **（-info）旧 `rulesDoc` RPC 仍在 Host 面保留** —— 客户端已无消费者；留作潜在回退窗口，下批可随 `BafStandardRulesDocResult` 一并清理。

## 7. 验证截图

`C:\Users\12402\AppData\Local\Temp\batch6-probe\`：`sidebar-badge.png`（需求①）、`project-canvas.png`（②）、`gate-tab.png`（③④）、`enterprise-tab.png`（⑤）。
