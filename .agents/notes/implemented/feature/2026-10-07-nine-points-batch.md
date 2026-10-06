# 九点批 — grill-me 轻融入 / 卡片级路由徽标 / 推进重弹 / 节点卡产物+档位 / 当前路由动态化 / 三档等宽 / 词库文案 / 规范总览深化 / 门禁总览只读

- 触发：客户 2026-10-07 在 v0.0.24 验证后提九点。三项产品决策已确认：grill-me=**轻量融入**（模板+工单提示，不加门禁条件）；门禁=**只读总览+配置开关说明**（条目本体保持产品注册表，详细修改走配置文件/产品代码）；路由徽标=**卡片级**（不动 ui-conversation 消息流）。
- 交付：九点全部落地；新增 `baf-workflow/src/gate-overview.ts`（两层门禁投影纯核）+ `ui-baf-workflow` 门禁总览行（`GatesOverviewRow`）+ `routePreview`/`gateOverview` 两个 Tab Remote。
- 验证：触及包 vitest 全绿（baf-openspec+baf-workflow 40 文件/501 测试；ui-baf-workflow 9/42；ui-settings-baf-standard+route 5/81）+ 全 tsc 面绿 + 构建链走完（触及包 tsdown → typert-emit-all → api/remotes 聚合 → 根 client tsc）+ web CDP 探针（A/B/D/E/F 实机绿；C 按钮存在与接线绿、重弹路径受现场状态限制；G 无 auto 审计夹具，纯核已单测）。
- **本批抓到一个真机才暴露的激活级 bug**（TDZ，见「根因记录」#3）：类型检查、单测、esbuild 全部无感，web boot 冒烟探针一枪命中 — 这正是坚持实机探针的理由。

## 问题 1 — grill-me 轻量融入 clarify（零新门禁）

【变更】`packages/baf/baf-openspec/src/templates.ts` `clarifyTemplate`：TODO 骨架加「Asking discipline (grill-me style)」段 — 一次只问一个最阻塞的问题；每问=背景一句+选项（含推荐默认）；客户答不上→给建议并标「待定 deferred」；阻塞问题清零（blocking list is empty）才算澄清完成。风格提示而非门禁条件 — 与 `DOC_REQUIREMENTS_ZH.clarify`（文件检查）分工明确，门禁不查它没承诺的东西。
【变更】`baf-workflow/src/go-dispatch.ts` `workOrderText` clarify 节点加 `1b. 追问纪律：一次只问一个最阻塞的问题` + `阻塞问题清零后才算澄清完成`（工单提示，同上批「抓手2」形态）。
测试：`templates.spec.ts` 锁五条断言（纪律段关键词+骨架字段完整）；`go-dispatch.spec.ts` 锁两行工单文案。

## 问题 2+4 — 卡片级「档位·模型」徽标 + 状态产物

产品决策：徽标落点=工作流 Tab 的卡片（推进弹窗/门卡/节点卡/仪表盘行），**不动 ui-conversation 消息流**。

【变更】`ui-baf-workflow` 四处落点，同一数据源 `routeBadgeText`（tier·model 前缀；无 tier 仅 model；`fallbackActive` 同）：
1. **RouteDispatchLine**（`WorkflowView.tsx` 新组件，testid `route-dispatch-line`）—「确认后派单：Reviewer·glm-5.3-flash」，挂在推进弹窗、Tab live 门卡、pending 门卡三处；会话页门卡（`BafGateComposer.tsx`）同款。
2. **仪表盘变更行** chip（testid `dashboard-route-chip`）— 读 fold 新增 `byChange: Record<changeId, RouteAuditEntry>`（`route-status.ts`：会话日志内按 changeId 取**最新**一条审计）。
3. **FlowCanvas 节点卡** route badge（testid `flow-node-route-<id>`）+ 产物 chips — 折叠每阶段 `artifacts`（`tab-types.ts` 已有），点击复用 `openArtifact`（与 ArtifactRail 同通道）。
4. Host `routeStatusFor`（`ui-baf-workflow/src/index.ts`）fold 扩展 byChange。

【变更】Host 新 Remote `routePreview(input)`（`@Remote('routePreview')`）：同一纯核 `tierRouteSelection` 做预演 — 不 pin、不写审计；off（config/session）、unresolved、routed（tier+reason+provider+model）三态。@Remote 遵守全必填单对象约定。

**wire-id 语义修正**（根因记录 #4）：`gate-ask.ts` `DISPATCH_NODE_OF_GATE` 初版把 park 名 `design-to-plan` 当 wire id — 实际 ask 线上走的是 REGISTRY confirm id `design-confirm`（go-coordinator 映射），已改并由 `gate-ask.client.spec.ts` 封闭集锁定（8 映射+6 null）。

## 问题 3 — 工作流「推进」重弹按钮

【变更】`WorkflowView.tsx` 动作条加 ghost 按钮 `t('action.advance')`（testid `strip-advance-rearm`）：渲染条件 `view.advance?.ready === true`、`disabled={busy}`；onClick `setAdvanceDismissed(null)` + rAF 后滚动到 `[data-advance-dialog]`。语义=重弹既有顶部推进弹窗（不恢复常驻决策按钮）。弹窗本身仍受六条件门（changeActive/非 drift/ready/无 gate/无 pendingGate/liveGate 为空/未被 dismiss）— 有门卡时门优先，按钮在但弹窗让位，属设计内行为。

## 问题 5 — 「当前路由 暂无派单路由」动态化

**诊断**：路由只在会话模型=Auto 伪条目时接管并写 `baf/route-resolved` 审计；会话停在具体模型时该行永远显示静态「暂无」。

【变更】host `routeStatusFor` 扫会话日志兼取最后 `request/header` 纪元 → fold 增 `sessionModel?: {provider, model, auto}`（新导出 `readSessionRouteScan`，可降级 `{audits: []}`）。`RouteStatusRow.tsx` 空态三态（testid `route-empty`）：auto→`route.noneAuto`「Auto 已接管，等待首次派单」；非 auto→`route.nonePinnedPrechat/Post`「会话当前模型 X · 自动路由未接管 — 切到 Auto 后，派单会在此显示」；读不到→原 `route.none`。新 locale 键 zh/en。

## 问题 6 — 关键词规则三档等宽

【变更】`ui-settings-baf-route/src/client/ModelRoutingRow.module.css` `.ruleTierLabel` 加 `width: 6.5em`（量「Commander」实宽），三行右框左对齐。实机验证：computed width 72/72/72 相等。

## 问题 7 — 词库说明通俗化

【变更】`ui-settings-baf-route/src/client/locales.ts` zh `keywordsHint`：「命中哪个档的词，任务就派给哪个档的模型。带「预设」角标的是产品自带词库，普通标签是你自己加的。点一下标签＝停用/启用这个词；词库或分类名旁的开关＝整组停用。中文、英文标签分段排列。」；`presetsFileHint` 指明 `~/.dsh/baf-route-presets.json` 改文件即增删词库。en 同步改写。

## 问题 8 — 规范总览深化（8 规则域逐域可见 + 从何而来链路）

【变更】host `ui-settings-baf-standard/src/index.ts` `summary()` 透出 `summarizeStandard().areas`（id/titleKey/sourceRef，provider 早已算好未透出）到 fold；`types.ts` 扩展。
【变更】client `StandardsOverview.tsx`：
- 「工程规则 · 8 域」段（testid `baf-standard-areas`）：逐域本地化标题+管辖一句话（新 16 条 area locale）+ sourceRef 锚点；展开按 `## <anchor>` 前缀切片规则文档（`sliceAreaContent` 纯函数，导出供测试；规则不可用→仅标题+指向）。
- 「规范从何而来」四步链路（testid `baf-standard-from-step-1..4`）：scaffold 生成默认规则文档 → baseline `standard.mattPocockRulesRef` 指向 → 设计/计划/实现每环节模型读（会话节 `baf:standard-rules`）→ 企业改 ref 整体替换；尾注「活文档，直接编辑即生效」。
测试：host spec 断言 areas 透出（8 域+锚点）；client spec 断言 8 域渲染+切片+链路（20 测试）。

## 问题 9 — 门禁总览·只读（含配置开关说明）

产品决策：只读总览+开关说明；增删改门禁条目=改产品代码（GATE_REGISTRY 与 stages/gates.ts）并同步测试。

【变更】`baf-workflow/src/gate-overview.ts`（新，纯静态投影）：
- Layer 1 客户确认门：`GATE_REGISTRY` 15 卡 verbatim（id/标题/问题/选项→命令）；挂靠阶段由 `advanceGateIdForNode` **反向推导**（ADVANCE_RESTS 六个 rest 跑一遍建映射），映射改动自动流过，杜绝手抄漂移。
- Layer 2 阶段完成门：6 阶段（open…verify）门函数名+产物文件+条件常量 **`toBe` 同一引用**（`DOC_REQUIREMENTS_ZH`/`IMPLEMENT_REQUIREMENTS_ZH`/`CHECKLIST_REQUIREMENTS_ZH` — 工单引的就是这些常量）+ 推进门 id + 模式注记（bug-fix 裁剪/账本文件）。
【变更】Host Remote `@Remote('gateOverview')` 零参，直返投影（静态可永久缓存）。`remote-default-responses` 不加（用户触发展开，rulesDoc 先例）。
【变更】client `GatesOverviewRow.tsx`（settings `workflow.item` id `baf-gates-overview` order 15）：默认折叠；首次展开加载（client 侧缓存，收起再展开不重取）；两张表 + 哨兵命令本地化（`__noop__`→关闭、`__continued__`→由调用方续接）+ **dynamicOptions 行**（bind-workflow/resume 选项运行时生成）+ 「开关与阈值在配置文件」注解块（baseline.yml 四开关/baf-route-config.json/baf-route-presets.json + 诚实声明：条目本体是产品注册表）。
【变更】**dynamicOptions 端到端**：`GateOverviewConfirmRow`（host types + client `types.ts`）增 `dynamicOptions?: string`，投影 verbatim 携带；行渲染空选项+标记时显示说明行（`gates.dynamicOptions` zh/en）。
测试：`gate-overview.spec.ts`（15 卡 verbatim+id 对账、挂靠推导、6 阶段常量 `toBe`、客户端 DISPATCH 反向锁含 `design-confirm`、dynamic 分支）；`gates-overview.client.spec.tsx`（折叠零取数/一次展开两表/收展不重取/哨兵本地化/dynamic 行/错误面）。

## 根因记录（本批三个深坑）

1. **WorkflowView.tsx 1023 行吞号解析回归**（跨会话阻塞）：一次删区域编辑把 `${row.endedAt.slice(0,16).replace('T',' ')}` 的**闭合 `}` 掉了** — 替换内的模板串开嵌套，吞到 1045 行的下一个反引号；tsc/esbuild 在**远处未改行**报「Expected } but found $」。逐行反引号奇偶检查无效（缺陷在两个疑区**之间**）。解法：自写状态机扫描器（code/sq/dq/tpl/注释 + `${` 入栈记录花括深度、`}` 回到记录深度弹回模板态、闭合反引必须 `mode='code'`）+ `od` hexdump 定位单字符修复。扫描器留在 `C:/Users/12402/AppData/Local/Temp/baf-verify/scan-tpl.mjs`。
2. **mount.spec 环境泄漏**：M1 惰性档位冻结（`requireFrozen()` 内 `ensureTierRoute()`）读本机真实 `~/.dsh/baf-route-config.json`（enabled:true）→ 「not frozen」断言必挂。非回归（M1 既有行为）。修法：spec 内 `$DSH_HOME` 指向空临时目录（`resolveDshHome()` 尊重非空 `DSH_HOME`）beforeEach/afterEach 建拆。
3. **client apply() TDZ 击穿整插件激活**（实机新发现）：本批给 composer-inject 选项对象加 `t`（routePreview 行的 label binder），而 `const t = ctx.locale.bind(NS)` 声明在其**后**；`slots.inject` 回调在父槽已存在时**同步**执行 → `ReferenceError: Cannot access 't' before initialization` → 整个 `ui-baf-workflow` 客户端条目激活失败（「web boot: 1 entry did not activate」）。tsc/vitest/esbuild 全无感（测试不实例化 cordis Service 是仓库纪律；node 桩跑 factory 因 ctx 桩为 no-op 同样无感）。**取证法**：CDP `Page.addScriptToEvaluateOnNewDocument` 注入 `__DSH_TRANSPORT__.loadBundle`（fetch 补丁包裹 `exports.apply = apply;` 再 eval，批次 URL 是逗号拼接多插件，锚点需 split/join 全替换）捕获真实栈。修法：`const t` 上移到 composer inject 之前（含注释说明 TDZ 纪律）。
4. **wire gate-id 语义**：ask 线上的 question id 就是 GATE_REGISTRY id；`design-to-plan` 是 §18.5 PARK 名（go-coordinator 映射后才上線）。客户端反查表必须用 registry id。

## 构建与验证记录

- 测试：`pnpm vitest run packages/baf/baf-openspec packages/baf/baf-workflow`（40/501 绿）；`packages/client/ui-baf-workflow`（9/42 绿）；`packages/client/ui-settings-baf-standard packages/client/ui-settings-baf-route`（5/81 绿）。
- tsc 面：baf-core/baf-workflow/baf-openspec/ui-baf-workflow(host)/ui-settings-baf-route/ui-settings-baf-standard 全绿；ui-baf-workflow client 面三处 TS2339（routePreview/gateOverview 未入聚合）在 typert-emit-all + api/remotes 重建后如期清零；根 `tsc -b tsconfig.client.json` 绿。
- 构建链：触及包 tsdown（host 面 baf-core/baf-openspec/baf-workflow；client 面 ui-baf-workflow 双面同产 `lib/index.js`+`lib/client.js`/两 settings 包）→ `NODE_OPTIONS=--max-old-space-size=8192 node typert-emit-all.mjs` → api/remotes 聚合 → 根 client tsc → web host 重启（3080）。
- **i18n 校验器现状**：`verify-client-ui-i18n` 报 28 条硬编码串 — 逐条比对 HEAD 全部预先存在（SVG path 模板串、上一批修订卡文案等），本批零新增；属既有债务非回归。
- web CDP 探针（`webprobe-v6.mjs`，Chrome 9202 + host 3080，authed URL 因 host 重启换 token 需从启动日志取）：
  - **A** 规范总览：8 域行全在（project-charter…testing-discipline）、coding-style 展开切片到 `## coding-style 编码风格` 正文、从何而来 4 步+活文档注 ✓（截图 v6-web-standards-areas.png）
  - **B** 门禁总览：折叠零取数、展开 15 confirm + 6 stage、bind-workflow 动态选项行「选项在运行时按现场状态动态生成」、配置块三文件名齐 ✓（v6-web-gates-overview.png）
  - **D** 当前路由动态化：真发一条消息建会话（pinned MiniMax-M3）→ 工作流 Tab 路由行实读「会话当前模型 MiniMax-M3 · 自动路由未接管 — 切到 Auto 模型后，派单会在此显示」✓（v6-web-workflow-tab.png）
  - **E** 三档等宽：computed width 72/72/72 ✓
  - **F** 词库新文案 + presets 文件路径 ✓
  - **C** 推进重弹：按钮存在于动作条（text 推进）✓；重弹全路径需 advance-ready+可 dismiss 现场（当前工作区变更被门卡占据，弹窗按设计让位）— 接线（setAdvanceDismissed(null)+rAF 滚动）代码级复核。
  - **G** 节点卡 chips：本工作区无 auto 审计夹具（会话均为 pinned 模型，无 baf/route-resolved）— 数据折叠（routeStatusFor phases/byChange）与渲染件（RouteDispatchLine/routeBadgeText/chips）均有单测/host 测。
  - 桌面端：桌面与 web 共享同一 client bundle 与 remotes，本批未触桌面专属面。实机尝试了 `pnpm --filter @deepseek-ai/dsh-desktop run dev`（全量 build:lib 链），在默认 4GB 堆顶 OOM 退出（exit 134，dsh-credentials-local 之后的并行 tsdown 段）— 与本批改动无关（触及包均已单独构建绿且正被 web host 实载验证），属本机已知全链内存条件（见 [[baf-dsh-merge-2026-10-second-batch]] 的分片配方）。Tier 2 的 build:lib 门以触及包链路（上节）为准，已绿。
- RPC 侧通道验证：页内 `fetch('api/bafWorkflowView/gateOverview', POST {type:'client-request',rpcId,method,payload:{args:{}}})` 实机应答（门禁总览行数据即其产物）；args 形状为 `{request: {...}}` 包装（descriptor 校验）。

## 剩余风险（排序）

1. **WorkflowView 整体无 jsdom mount 测试**（仓库惯例：大视图靠实机探针）— 本批 C（重弹全路径）与 G（节点卡 chips 实机形态）的实机覆盖受现场状态限制未走满。若后续再动 WorkflowView，建议补一个最小 mount spec（fake view 夹具）或扩 webwalk harness。
2. **门禁总览条件常量是「快照引用」不是「快照值」**：`toBe` 同引用保证与产品代码同步，但客户看到的条件文案改动（改常量内容）不会出现在任何 release note 里 — 总览永远「对」，但变化静默。可接受（同一来源原则），列出备知。
3. **routePreview 的 session 面 off 判定**依赖会话模型读取链（readSessionRouteScan）；会话日志损坏/极旧时降级 unresolved 而非 off — 文案上两者对客户几乎无差（都不显示派单行）。
4. **apply() TDZ 类 bug 的测试盲区**：客户端入口的同步 inject 回调路径无任何单测可达（需真 cordis Context）。web boot 冒烟（开 app 看 Failed to load plugins）是唯一门 — 建议后续给 client-modules 加一个「激活冒烟」jsdom 测试（真 Context + 全 entries），一劳永逸。
5. **桌面端 spot-check 本轮未走实机**：尝试过 dev 全量构建链但在默认 4GB 堆顶 OOM（见上「构建与验证记录」）；重试需 `NODE_OPTIONS=--max-old-space-size=8192` 且在内存宽裕时进行（本机当时仅 ~4.9GB 空闲，与 web host 并存会挤兑）。本批零桌面专属改动、client bundle 与 web 同源已验证，风险实质极低；若需补：桌面 dev CDP 9200 同款 A/B/C/D 探针脚本（`webprobe-v6.mjs` 改端口即用）可直接复用。
