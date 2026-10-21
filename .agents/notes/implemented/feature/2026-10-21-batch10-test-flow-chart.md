# 批次十（2026-10-21）：单元测试执行流程图（质量监控页 + 会话测试流图 Tab）— desktop 0.0.32

> 需求原句：工作流质量监控页面，配置后增加一个流程图，该流程图显示单元测试的执行流程。gcc编译，ceedling单元测试，生成gcovr单元测试报告，check覆盖率，cpplint，cppcheck，静态代码检查，clang-format格式化等整个流程，显示执行的过程和规范等。不要有遗漏，同时要有先后顺序。该流程也要增加到会话工作流图后，命名为测试流图，显示该会话阶段的测试结果。测试流图的是否显示可以在工作流通用中配置，参考工作流图样式。看下我的这个设计需求是否合理，是否有遗漏，需要补充完整，要求醒目清晰，直观美观，和谐稳定。

## 0. 结论速览

| # | 需求 | 落点 | 状态 |
|---|------|------|------|
| 1 | 质量监控页配置卡后的执行流程图（8 步全量、有先后顺序、含规范） | `QualityFlowCard.tsx` + `quality-flow-catalog.ts`（settings-standard 两新文件）+ `baf-quality/test-flow.ts` 权威目录 | ✅ 8 节点 7 边垂直链 + 每节点命令/做什么/规范要点/依据规范/产物 + 底部执行纪律横幅；真机断言 8 节点按序、明细点击切换、规范 chips 可点 |
| 2 | 会话工作流图后新增「测试流图」Tab，显示该会话阶段测试结果 | `TestFlowView.tsx` + host `@Remote('testFlowStatus')` + `readTestFlowStatus` | ✅ Tab 挂在 工作流图 之后（order 30）；真实读工作区 `.baf/reports/*.json`；演示夹具下 绿链/红 lint/灰 format 全对，覆盖率判决条 + 打开报告（右侧栏 iframe 预览） |
| 3 | 显示开关在工作流通用配置（参考工作流图） | `TestFlowTabRow.tsx` + `workflow-tab-settings.ts` 快照新增键 | ✅ `test-flow-tab-row` 紧跟 `workflow-tab-row`；关→Tab 消失、工作流图不受影响；开→恢复；快照持久化 |
| 4 | 设计评估（醒目清晰、直观美观、和谐稳定） | 视觉审查两轮 | ✅ 修正 3 处 192px 节点英文副题截断（实测溢出 9/41/34px → 0）；会话卡沿用 工作流图 同款 strip/行样式 |

测试：新增 `test-flow.client.spec.ts`（8）+ `test-flow-status.host.spec.ts`（5）+ `standards-overview.client.spec.tsx` 追加两组 describe；四个触及包全量 vitest 18 文件 168 用例全绿。构建链全绿：build:lib → build → brand-web → pack-dsh → `dist --dir` 免安装（不打 NSIS）。

## 1. 需求 1：质量监控页流程图

### 1.1 权威目录（单一事实源）

【变更】`packages/baf/baf-quality/src/test-flow.ts`（新文件）：`TEST_FLOW_STEPS` 八步执行序——`build(gcc) → test(ceedling) → instrument(gcov) → report(gcovr) → gate(baf-quality check) → lint(cpplint) → analyze(cppcheck) → format(clang-format)`；前五步 `required: true`（必装），后三步 `required: false`（选装）。`baf-quality/src/index.ts` 补 `export * from './test-flow.ts'`。客户的原始清单没有 gcov 插桩一步——但 gcovr 报告依赖 gcov 的 .gcda 数据，单独列出才能「显示执行的过程」不遗漏，故补全为 8 步。

### 1.2 展示镜像 + 卡片（settings-standard）

【变更】`src/client/quality-flow-catalog.ts`（新）：`QUALITY_FLOW_STEPS` 显示镜像（id/tool/required/command/docIds/artifacts 逐步携带），parity spec 与权威目录逐项对齐防漂移（同 HELP_TABLES 先例）。`src/client/QualityFlowCard.tsx`（新）：192×48 节点 + SVG 贝塞尔竖向箭头（hooksFlow 同款画布，与企业规范/指令集流程图和谐同构）；点击节点右侧明细列切换（命令 / 做什么 / 规范要点 / 依据规范 chips 点击直达 openEnterpriseDoc / 产物路径）；必装绿角标、选装灰角标 + 图例；底部「执行纪律」横幅（顺序 + 入口指令 + 禁止中途格式化）。`StandardsOverview.tsx` 在配置卡与规范卡之间挂载（data-testid `baf-quality-flow-card`）。`tsconfig.client.json` files 列表同步两新文件。`StandardsOverview.module.css` 追加 `.qflow*` 行样式（1225–1287 行区域）。locales（zh/en 双语 ~70 键 `qolFlow*`）。

### 1.3 视觉审查两轮补修（醒目清晰）

首轮 analyze_image 审查 + 页内实测（`scrollWidth - clientWidth`）发现 3 个 192px 节点的 中英名行 溢出省略：test +9px、analyze +41px、format +34px。

【变更】英文副题三处缩短（两个包的 zh/en 字典同步）：`Unit test (ceedling) → Ceedling test`、`Format (clang-format) → clang-format`；二轮复测 analyze 仍 +14px，再改 `Analyze (cppcheck) → cppcheck`（与 format 的裸工具名同款一致，阶段名已在中文行）。终测八节点溢出全 0。

## 2. 需求 2：会话测试流图 Tab

### 2.1 宿主侧（ui-baf-workflow/src/index.ts）

【变更】`types.ts` 新增 `BafWorkflowTestFlowStatus`（判别 `ready | no-cwd`）+ Coverage/Static 子对象（全可选字段）。宿主导出上下文无关读取器 `readTestFlowStatus(cwd)`：防御式读 `.baf/reports/ut-coverage.json`、`.baf/reports/static-analysis.json`、`.baf/quality/ceedling-config.json`（JSON.parse 失败一律跳过不抛）、`generated_at` 蛇形键转驼峰、`report_html`（缺省 `build/coverage/coverage_report.html`）实时 `stat` 存在性。`@Remote('testFlowStatus')`（单对象参 `BafWorkflowSessionRequest`，符合 arity 纪律）：`requireCwd` 失败回 `no-cwd`（RemoteError.code 判别，不 instanceof）。契约进 typert 聚合（`lib/typert.remote-client.d.ts` 已再生成）。

exactOptionalPropertyTypes 两处教训（见 §5 遗留·已修）：条件展开里**重复调用** helper（`asNumber(x) === undefined ? {} : { line: asNumber(x) }`）无法窄化——第二处调用是全新表达式仍带 `| undefined`；正确写法是先把每个字段绑定到 const，再 `cond ? {} : { field }`。`Object.fromEntries` 不保留字面量键类型，需一次 `as Record<TestFlowStepId, …>` 断言。

### 2.2 诚实状态映射（client/tab-types.ts）

【变更】`WorkflowTabTestFlow*` 镜像类型 + `TEST_FLOW_STEPS` 客户端镜像 + 纯函数 `projectTestFlowSteps(status)`：

- check 链四步（build/test/instrument/report）共享覆盖率**报告存在性** → 报告在即 通过（它们确实跑过），报告缺即 未运行——绝不伪造判决；
- gate 读报告 `passed` 判决（true→通过 / false→未通过 / 字段缺→未判定 未运行）；
- lint/analyze 共用 `static-analysis.json`（cpplint+cppcheck 在同一次 `/baf-quality lint` 里跑）→ `passed===true || errors===0` 通过；`passed===false || errors>0` 未通过；
- format 无独立报告 → 恒 未运行 + 纪律注释行（不伪造）；
- 判决条：覆盖率 `{line}%（≥ {min}%）`（报告缺 minimum 时回退 config thresholdLine×100）、静态检查 `{n} 项错误`、报告时间、`门禁模式 · {gate_mode}`。

### 2.3 视图 + 挂载（client/TestFlowView.tsx / client/index.ts）

【变更】`TestFlowView.tsx`（新）：判决条（品牌块 + 绿/红值 + gateChip + 刷新）→ 八行链（行内 点色块 + 中文名 + 英文副题 + `tool · 必装/选装` chip + 命令 mono + 判决字 + metric）→ 报告行的「打开报告」按钮（`reportHtmlExists` 才显示，走 sidebarRight.openResource → 右侧栏 iframe 预览）→ 底部执行纪律横幅；`projection-appended` 推送订阅（cwd 过滤）+ 挂载即拉取；no-cwd 提示、错误条、loading 防抖。conversation.view 挂载 id `baf-test-flow`、order 30（工作流图 25 之后），`agentPreset==='baf'` + `showTestFlowTab !== false` 双门。`tsconfig.client.json` 同步。

真机（demo1 会话 + 落盘夹具 83.3%/80 通过、5 错误未通过）：链四步+gate 绿、lint/analyze 红、format 灰；判决条 `83.3%（≥ 80%）/ 5 项错误 / 2026-10-21T14:30:00Z / 门禁模式 · shadow`（shadow 来自工作区真实 ceedling-config.json）；打开报告 → 右侧栏 `coverage_report.html` blob iframe 预览。夹具验后即删，demo1 工作区 git 状态复原。

## 3. 需求 3：工作流通用开关

【变更】`workflow-tab-settings.ts`：`DEFAULT_SHOW_TEST_FLOW_TAB = true` + `BafWorkflowTabSettings.showTestFlowTab`（旧快照缺键读 `!== false` 保持可见）。`TestFlowTabRow.tsx`（新）：Switch 原语 + 复用 WorkflowTabRow.module.css，testid `test-flow-tab-row`，settings.workflow.item 注册 order 11（工作流图行 10 正下方）。`WorkflowSection.tsx`（tracegraph）通用 tab slotIds 追加 `'test-flow-tab'`。

【变更·连带修复】`createSnapshotStore.set()` 是整体替换——批次九单键时代 `{ showWorkflowTab: value }` 恰好合法，加键后变部分对象会 TS 报错；两处开关改为 `prefs.set({ ...prefs.getSnapshot(), key: value })`，避免互踩。

真机：关 → 会话 Tab 条 测试流图 消失（工作流图仍在）；开 → 恢复；快照 `{"showWorkflowTab":true,"showTestFlowTab":…}` 两键独立。

## 4. 需求 4：设计评估结论

合理、无结构性遗漏；两处补全：① gcov 插桩独立成步（过程完整性）；② format 恒灰的诚实语义（无报告不伪造）。稳定性：host 读取全防御、client 纯函数映射 + parity spec 锁死两份目录与双语字典；设置页与会话页双图表同源同构。

## 5. 遗留问题（按影响排序）

1. **【中】测试流图判决条的门禁阈值显示优先报告 `minimum`，报告缺该字段才回退 config**——两源不一致时用户看到的是报告侧数字；后续可统一以 config 为准并在 tooltip 标注来源（当前行为已与 baf-quality 门禁判定一致，仅展示层差异）。
2. **【低】会话测试流图不显示逐文件覆盖率明细**——报告 HTML 里有文件级表格，Tab 只给总判决 + 打开报告；若客户要 Tab 内嵌明细，需扩 readTestFlowStatus 解析 HTML 或落 JSON 明细。
3. **【低】打开报告仅支持 HTML 报告路径**（`report_html` 单值）；若未来报告目录多文件（lcov/xml），需目录级资产面板。
4. **【低】质量监控页流程图卡无移动端专项**——沿用 hooksFlow 画布，窄于 ~720px 时图表列与明细列堆叠表现未专项调（与既有三卡同水位，非本批回归）。

## 6. 版本与构建

desktop 0.0.31 → **0.0.32**（VERSION / package.json / version-notes.json / version-map.md 四处同步；version-notes 批次十双语条目）。构建链：`pnpm run build:lib`（host tsc → tsdown → typert 聚合再生成 → client tsc → tsdown）全绿 → `pnpm run build` → brand-web（嵌入 `BAF DSH / v0.0.32`）→ pack-dsh → `overlay/desktop npm run dist -- --dir` 免安装 exe（不打 NSIS）。
