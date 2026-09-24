# BAF 前置条件暴露 + 产物可见性（/baf-go 拒绝要说清缺什么）全景图

> 配套本轮修复（`tmp/session/5.jsonl` 复盘，用户三项需求）：`/baf-go` 推进前的前置条件不满足时只报一行 `stage_incomplete`，既不说缺什么、也不给产物路径，客户和模型都只能盲敲；阶段产物（clarify.md / design.md / proposal.md / tasks.md / plan.json）在卡片上只有一句「模型填 TODO」，没有文件清单和各自状态。本图给出根因、每一处「原来是什么样 → 现在是什么样」（`【变更】`标注）、以及按严重度排序的剩余问题清单。
>
> 产物：**已打包** `overlay/desktop/dist/win-unpacked/baf-dsh.exe`（0.0.16，`--dir` 免安装，未打 NSIS；resources 内 help 已核验，冒烟启动 12s 存活后收口）。验证：`pnpm build:lib`（host + client）**零 TS 错误**；全量 `pnpm run build` exit 0（242 client artifacts）；测试 `packages/baf/ + packages/client/ui-baf-workflow/` 合跑 **32 spec / 316 用例全绿**（两轮共新增 12 用例）；oxlint 本轮改动 hunk 零发现（剩余发现均为 HEAD/前轮未提交基线，行内容逐一比对确认非本轮引入）；另用临时工作区复放了 5.jsonl 尾部场景（design.md 仍是模板时敲 `/baf-go`），肉眼确认新卡片文本，复放脚本用完即删。

---

## 0. 事故与一句话方案

**事故**（`tmp/session/5.jsonl`，变更 `change-20260920-ecum-80de`）：

1. 客户敲 `/baf-go`，模型没先填产物，coordinator 在 `design` 阶段反复吃到 `design gate failed: stage_incomplete — design.md is still the unfilled template`——**只有原因码，没有缺什么、产物在哪、怎么补**。
2. 会话末尾连续两次 `/baf-go` 得到同一个错误，客户没有任何主动查询面能看到「产物分别处于什么状态」。
3. 各推进卡只写「模型填 openspec/changes/<id>/ 下的 TODO」，不列具体文件。

**一句话方案**：裁决门的拒绝 = **结构化拒绝**——`GateOutcome` 增加 `missing`（中文缺项清单，单一事实源在 gate 层），pipeline 把它带进 `BafError.details`，`/baf-go` 拒绝卡渲染【产物】【缺什么】【满足条件】【下一步】四段；`/baf-status` 增加【产物】段（`changeArtifactStatus` 逐文件分类：尚未生成/仍是未填的模板/已填写）；每个推进卡（open→clarify、clarify→design、design→plan、plan→implement）的【产物】段列出具体文件路径。零新增解析通道、零新增命令。

```
/baf-go（doc 阶段 in-progress）
  │ completeDocStage → gate fail（missing 随 BafError.details 透出）
  └─ 拒绝卡：【原因】【产物 路径·本次裁决对象】【缺什么 missing】【满足条件 DOC_REQUIREMENTS_ZH】【下一步】
/baf-status
  └─ 【产物】段：每文件一行 path · 状态（changeArtifactStatus + artifactLine）
```

## 1. 用户三项需求的定位与本轮决策

| 用户需求 | 定位 | 本轮处置 |
| --- | --- | --- |
| 1. baf-go 推动前先确认条件，不满足及时暴露 | 机制已在（`prepareDoc`→`completeDocStage`→gate），缺的是**暴露的信息量** | 【变更】A/B/C：拒绝卡结构化 |
| 2.1 多命令合并 `baf-go-confirm`；弹窗/页签按钮底层同源 | 已实现（`command-drives.ts:1194` 派发 `/baf-go-confirm`→`driveGo({confirm:true})`；advance 门全部挂 `/baf-go-confirm`） | 无需改 |
| 2.2 弹窗关闭/跳过后 `/baf-go` 重弹 | 已实现（每个停靠点 `resolveViaDialog` 未决→`withContinueHint` 卡） | 无需改 |
| 2.3 用户迷路时 `/baf-go` 弹窗/报状态 | 已实现（有 ask 通道就弹、否则渲染状态卡）；用户另定：**不加子模式，`/baf-status` 补产物状态作主动查询面** | 【变更】E |
| 2.4 其他 | 见 §3 剩余清单 | — |
| 3. 产物显著显示 + 可打开确认修改 + 关弹窗后 `/baf-go` 重开 | 重开已实现；「显著显示」本轮落地卡片级；「可点击打开」受渲染层限制（见 §2 调研） | 【变更】B/D + §3-1 |

**@path vs markdown 链接调研结论**（用户问题 3 的技术答复）：BAF 指令卡正文渲染在 `<pre>` 纯文本（`GenericCommandCard.tsx:66`），**两者都不可点击**。`@path` 是输入侧语法（客户→模型引用 workspace 文件）；markdown `[text](path)` 只在模型气泡里渲染成链接且相对路径点不开本地文件。GUI 唯一真「打开文件」通道是 `openFile(path)`→`dsh-resource://file/session/<id>/<相对路径>`→右侧边栏（`ui-chat/apply.ts:132`）；模型气泡里可点击的只有**反引号行内代码 + ui-deliverables fileMentions**，且仅覆盖「本轮模型写出的文件」。→ 卡片层本轮用纯文本完整路径（可复制）；真点击打开需 WorkflowView 产物区块（§3-1，未做）。

## 2. 修复清单（按文件，`【变更】`= 本轮新改）

### A. `stages/gates.ts` — 门禁拒绝结构化 + 产物状态助手

1. 【变更】`GateOutcome` 增加可选 `missing: readonly string[]`（中文缺项，每条一行）；`fail()` 增加第三参。
2. 【变更】`clarifyGate` / `designGate` / `planGate` 每个失败分支填 `missing`（如 design 模板态：Approach/Repository references/Risks 三条）。`planGate` 从首个失败即返回改为**收集全部任务的缺口**后一次返回（detail 保持首个失败的英文串，兼容既有断言）。
3. 【变更】`implementGate` 的 `tasks not done` / `outside allowlist` 两个分支补 `missing`（「把剩余 N 个任务做完并标 done=true」等）。
4. 【变更】新增导出 `changeArtifactStatus(input)`：按 stage 顺序读 proposal/clarify/design/plan/plan.json/tasks 六个产物，分类 `missing|template|filled`（plan.json 以 tasks+allowlist 全空为模板态），返回 `{file, path, state, missing[]}` 行；`artifactLine(row)` 渲染 `path · 中文状态`。`DOC_REQUIREMENTS_ZH` 常量给出各 doc 阶段门的通过条件（卡片【满足条件】段用）。
5. 【变更】**修 `templateOnly` 误判**：原实现逐行测占位正则，`tasks.md` 模板的 TODO 句子跨两行（第二行 "the verification command…" 不匹配）→ 整个模板被判「已填写」。改为**按空行分段、段首行测占位正则**——跨行 TODO 归并进段，模板判定恢复正确；对 clarify/design/proposal 模板态与已填态的分类不变（既有 308 用例回归证实）。

### B. `stages/pipeline.ts` — missing 透传

1. 【变更】`completeDocStage` 的 gate 拒绝 `BafError` 的 `details` 里带上 `missing: gate.missing`（coordinator 从 `error.details.missing` 取）。

### C. `go-coordinator.ts` — 拒绝卡与推进卡

1. 【变更】新增 `docStageArtifacts(changeId, node)`：各 doc 阶段的产物路径清单（clarify→proposal+clarify；design→design；plan→plan+plan.json），卡片【产物】段统一来源。
2. 【变更】`prepareDoc` 拒绝卡：原来只有【原因】+【下一步】两行路径提示；现在渲染【产物（路径·本次裁决对象）】【缺什么（missing）】【满足条件（DOC_REQUIREMENTS_ZH）】【下一步（打开核对/让模型补齐/敲 /baf-go/单独重跑）】。模板已装卡同样列出【产物】具体路径。
3. 【变更】`route()` 四个推进卡（open→clarify、clarify→design、design→plan、plan→implement）补【产物】段（plan→implement 列 plan.json——allowlist 依据）。
4. 【变更】implement 等待卡的【裁决门】段把 `gate.missing` 中文行并排在原因码后。

### D. `commands.ts` — `/baf-status` 产物段

1. 【变更】焦点变更卡在【焦点变更】之后渲染【产物】：`changeArtifactStatus` 的每行 `path · 状态`。`/baf-status` 成为「不敲 /baf-go 也能看清门挡在哪」的主动查询面（用户决策：替代新增 `/baf-stage-status`）。

### E. 测试

1. 【变更】`go.spec.ts`：模板已装卡断言产物路径；clarify 门拒绝卡断言【产物】【缺什么】【满足条件】与路径；新增 5.jsonl 复放用例（design 模板态拒绝卡含路径+缺什么+Approach）。
2. 【变更】`stages.spec.ts`：新增 `changeArtifactStatus` describe（模板/已填/缺失三态 + plan.json 空/有任务 + tasks.md 跨行模板回归）。

## 3. 剩余问题清单（按严重度排序）

**第二轮（2026-09-21 下午，用户「这些问题都要修改…打包桌面应用exe，不打安装包」）已将 1–4 全部落地，见 §4；原清单留存如下，标注处置结果。**

1. ~~**产物「可点击打开」未落地（用户需求 3 的后半）**~~ **✅ 第二轮落地**：WorkflowView 新增「阶段产物」区块（ArtifactRail）——工作流页签常驻每产物一行（文件名 + 状态徽标 + 打开按钮），按钮经 `openArtifact` → `fileAddressFor` → `ctx.sidebarRight.openResource(dsh-resource://file/session/...)` 在右侧边栏打开确认/修改；数据源就是 `/baf-status` 同一个 `changeArtifactStatus`（宿主 `buildWorkflowTabView` 注入 `view.artifacts`，typert 镜像层不改 wire schema 直通）。missing 态按钮禁用并提示。
2. ~~**模型侧行为（5.jsonl 的另一半根因）**~~ **✅ 第二轮落地**：`baf-go` SKILL.md 增第 8 条规则——`/baf-go` 是裁决者不是催促键；先填产物再让客户敲；「…裁决门未通过」拒绝卡的【缺什么】就是工单；永远不要指望空产物重跑会过、也不要在卡片已点名缺什么时说流程卡死。
3. ~~**`/baf-go` 显式回门**~~ **✅ 第二轮落地**：`/baf-go gate=<id>`——`driveGo` 解析 `gate=` 参数转 `explicitGate`：未知 id 拒绝并列出 GATE_REGISTRY 全部 key；与当前状态不匹配（如 design 进行中敲 gate=design-confirm）拒绝并列出**当前可弹的门**；`resume` 走候选分支；`design-confirm`/`verify-archive` 先按停靠事件校验；合法则与路由同源弹卡/弹窗（intake-classify 带 judgment）。防陈旧卡派发状态已不支持的决策。
4. ~~**弹窗暂停三态文案**~~ **✅ 第二轮落地**：`gate-ask.ts` 暂停三态统一为一句——「客户暂未选择（关闭了确认框，下次 /baf-go 重弹）。不要替客户决定；可提示：/baf-go 重新弹出确认框，或 /baf-go-confirm 直接继续。」；不可用态（无 ask 通道）单独一句指路页签按钮/命令。
5. **GenericCommandCard 全局路径点击**：改共享组件做路径检测，影响所有指令卡，收益/风险比低，不推荐先做。（维持不做）

## 4. 第二轮修复清单（2026-09-21 下午，`【变更】`= 第二轮新改）

### A. 产物页签区块（全链路四层）

1. 【变更】`baf-core/tab-view.ts`：`WorkflowTabView` 增 `artifacts?: readonly WorkflowTabArtifact[]`（`{file, path, state: missing|template|filled, missing[]}`；仅焦点变更存在且状态读取成功时携带）。
2. 【变更】`baf-workflow/tab-view.ts`：`buildWorkflowTabView` 对焦点变更调 `changeArtifactStatus`（与 `/baf-status` 同源），结果并入 view。
3. 【变更】`ui-baf-workflow/src/client/tab-types.ts`：客户端镜像类型同步（typert wire 层 `parse(value)=>value` 不需要改）。
4. 【变更】`ui-baf-workflow/src/client/index.ts`：注入 `sidebarRight`，`openArtifact(path)` 用 `ctx.sessions` 取 cwd → `fileAddressFor(sessionId, cwd, path)` → `ctx.sidebarRight.openResource`；context 增广走 `import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'`。`package.json`（inject/peerDeps/devDeps）与 `tsconfig.client.json`（references 加 ui-sidebar-right）配套。

### B. WorkflowView.tsx + CSS + 词条

1. 【变更】`ArtifactRail` 组件：焦点变更存在且产物非空时渲染于流程图与节点详情之间；每行「打开」按钮（missing/忙时禁用）、文件名、状态徽标（已填写=主题色 / 仍是未填的模板=琥珀 / 尚未生成=灰）、missing 明细列表。词条 7 条（zh/en）入 `locales.ts`。

### C. 技能文本

1. 【变更】`presets/baf/skills/baf-go/SKILL.md` 规则 8（见 §3-2），原规则 8 顺延为 9。

### D. `/baf-go gate=<id>` 显式回门

1. 【变更】`go-coordinator.ts`：`explicitGatesFor(status)`（按当前状态算可弹门清单）+ `explicitGate(context, gateArg)`（校验→弹卡/弹窗，拒绝卡列可弹门）；`driveGo` 解析 `gate=` 参数先行分流。
2. 【变更】`gate-ask.ts`：暂停文案统一（见 §3-4）。

### E. 测试与打包

1. 【变更】`go.spec.ts` 新 describe（6 用例）：停靠 design-confirm 重弹带继续提示、经 ask 通道真弹、design 进行中拒绝并列可弹门、未知门拒绝列注册表、design 进行中弹 abandon、有基线拒 scaffold。
2. 【变更】`lanes.spec.ts` 新 describe（2 用例）：full-go 变更 Tab 载荷六产物行及状态翻转（写真实 clarify.md → filled）；空工作区 view.artifacts 为 undefined。
3. 【变更】打包：`pnpm run build` → `brand-web.mjs` → `pack-dsh.mjs`（help 落位核验：`resources/dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/help/index.html` ✅）→ `cd overlay/desktop && npm run dist -- --dir`（免安装 exe，无 NSIS）→ `generate-manifest.mjs`（`dist/update/manifest.json`，无签名钥跳过签名）→ 冒烟启动存活收口。
