# 多模型路由 M1–M4 — 三档配置 / 派单选型 / 设置行 + Tab 当前路由 / verify 失败升级

- 日期：2026-10-05
- 范围：Tier 2（baf-core/baf-workflow 纯库 + 双面包 ui-settings-baf-route + ui-baf-workflow Tab 面；`build:lib` 见 §7；无 NSIS/打包面改动）
- 验证：单测 M1 起累计全覆盖（本批最终五包 542/542 绿，tsc 四程序零错）；web 端 + 桌面端真机双端 CDP 探针（§8）
- 状态：M1–M4 全部落地（提案 15 项勾选全勾），M4 为可选项亦已交付
- 提案：`proposed/feature/2026-10-04-baf-multi-model-routing.md`（偏差见各节括注与 §9 裁决）

## 1. M1 决策纯核 + 文件 IO — `baf-core/route-tier.ts` + `baf-workflow/route-config-io.ts`

【变更】`route-tier.ts` 新增三档词表：`RouteTier`（high/mid/low）、`RouteTierConfig`（schema 1，三档 `TierModelSpec`，`phaseTier` 可覆写、`keywords` 规则、`escalateOnly` 默认 true）、`DEFAULT_PHASE_TIER` 9 节点默认（设计/规划=高、澄清/验证=中、其余=低，含 drift）、`TIER_CAPABILITIES`（high 补 coding——implement 回合的关键词升档要过能力地板）、`resolveTaskTier`（规则序首个命中；CJK 子串匹配、ASCII 词边界——demo33 教训）、`effectiveTier`（escalateOnly 时 `max(taskTier, phaseTier)` 只升不降）、`compileTierRouteProfile`/`synthesizeTierPolicy`（编译进既有 `RouteProfile`/`EnterpriseRoutePolicy`，复用企业 ceiling/能力校验/approved-only fallback，不造并行路由系统）。

【变更】`route-config-io.ts`：`~/.dsh/baf-route-config.json` 同步读写（tmp+rename 原子写；缺/坏恒读 undefined——路由旁路、永不阻塞派单）。派单路径每回合同步重读，设置保存下一个工单即生效。

## 2. M1→M3A Remote 迁入双面包 — `packages/client/ui-settings-baf-route`

【变更】`bafRouteConfig` Remote（get/save/reset/**preview/defaults** + `baf-route-config/changed` 事件）落在新双面包：浏览器端访问 host Remote 需要生成的 TYPERT_REMOTE contribution，纯 host 库包（baf-workflow）拿不到——M1 先放在 baf-workflow 的服务在批次A 迁包（单一 browser roster 行同时供两面，ui-baf-workflow 先例）。

- `get()` 物化默认：保存文档缺的 phaseTier 节点由 `DEFAULT_PHASE_TIER` 补齐再下发；`defaults()` Remote 供新鲜草稿播种——客户端零重复内置映射（bundle 纯度门禁禁 value-import baf-core）。
- `preview(summary)` host 跑 `resolveTaskTier` 返回 `{tier, matched}`——「预演」关键词试跑在 host 侧单一事实源。
- 校验拒绝回 `{ok:false, error}` 行内提示；save/reset 成功后 emit `baf-route-config/changed`，多端设置行经 api-remotes 转发刷新。

## 3. M2 派单选型 — `route-dispatch.ts` + 13 处接线 + 审计

【变更】`tierRouteSelection`（纯核）：信号节点 → `effectiveTier` → per-dispatch 编译 profile（派单节点覆写为生效档）→ `resolveRoute`（PERMISSIVE 可用性；能力不满足按 approved-only 组回落 [high→mid→low]）；`reasoningEffort` 跟随**实际解析档**。`tierRouteSelectorFor`（壳）：读配置、查冻结 taskTier、`sessionController.selectForNextRequest` 钉选、追加 `baf/route-resolved` 审计（M2 补 `tier`/`tierReason` 字段）。钩子失败隔离——路由不可用就跑会话当前模型，工单照发。

【变更】intake 冻结：分类确认时 `resolveTaskTier` 评估一次写进 change projection（`taskTier`+`taskTierMatched`），中途改配置不追溯已冻结变更（与会话冻结语义对齐，防同变更前后回合漂移）。

## 4. M3B 设置行 — `ui-settings-baf-route/client`

【变更】`settings.workflow.item` 行 `id: model-routing`（「多模型路由」，order 20）：总开关 + 三档卡片（provider/model 输入带 `session.modelCatalog` 目录建议 datalist，下拉+手输）+ 9 阶段行（8 阶段+drift）× 档位下拉 + 关键词增删行 + escalateOnly 开关 + 预演框（Enter/按钮触发，显示 `档位 · 命中词`）+ 保存/恢复默认。`RouteSectionController` 快照 store：加载 = get + modelCatalog 并行；拒绝保存保 dirty；`changed` 事件 reload。

## 5. M3C 工作流 Tab「当前路由」行 — `route-status.ts` + `RouteStatusRow.tsx`

【变更】fold 随既有 `getTabView` 载荷下发（`WorkflowTabView.routeStatus`，无新 Remote/无 typert 重生成）：off（配置缺/禁用）零扫描；有路由时 9 节点行——preferred 来自 config 覆盖+默认（`resolvePhaseTier` 导出），actual/fallback 来自**驱动会话**冷日志每阶段最后一条 `baf/route-resolved` 审计（`readSessionRouteAudits` observeSession none 投影冷读、revision 缓存，2s 轮询不重扫不变日志；失败降级 preferred-only）。

【变更】客户端 `RouteStatusRow` 芯片行挂 Tab strip 下方：每**审计过**的阶段一枚芯片 `阶段名 档位·模型` + 徽标（回落/词/失败/升档）；off 不渲染（验收要求 enabled=false 与今天完全一致）；无审计显示「暂无派单路由」。

（偏差：不走冻结链 `buildRouteStatusView`——档位路由每回合读配置、从不冻结 policy/profile，无物可读；且 `compileTierRouteProfile` 的 phases 缺 drift。fold 直接组成同一 preferred/actual/fallback 语义。）

## 6. M4 verify 失败升级 — 派单地板 + 审计原因

【变更】`tierRouteSelection`：`cause: 'verify-failed'` 的重试回合（T11 修复环/检查单门，T15 升级通道同标记）以 mid 为档位下限——`tierReason: 'verify-escalation'` 仅当地板实际抬档（平档及以上保留原 keyword/phase 原因，审计不谎报未发生的升级）。地板只升不降；implement 需 coding 而 mid 档无 → approved-only 回落再上探 high，**审核不过的重试实跑最强档**（提案意图）。Tab 芯片 fallbackActive 时不标档位名（标签描述偏好档，回落后的模型属别档——`中档·big-brain` 是谎言，只显模型+徽标）。

## 7. 构建验证

- 全量 `build:lib`（root host face）在本机 OOM（exit 134，V8 heap 上限，died after dsh-tool-schedule；机器空闲内存 0.8GB）→ **降级为定向重建链**（tsc 四程序 `tsconfig.host/client.json` 全绿后逐包 tsdown `--env.DSH_BUILD_FACE client`）：baf-core、baf-workflow、ui-baf-workflow、ui-settings-baf-route、apps/cli 全部重建成功。
- typert 工作区生成物用仓根 `typert-emit-all.mjs`（emitWorkspace 的独立镜像，8GB heap）整体再生 —— **关键**：`lib/typert.remote-client.js`（`/remote` 出口的运行时实体）只有这条 sweep 会产；OOM 跳过它 = 浏览器端 `$mount` 拿不到贡献、卡「pending (waiting for service: remote.bafRouteConfig)」。
- `packages/api/remotes` 的 `lib/client.js`（**remote 贡献的消费端**浏览器 bundle）需在 M3A 挂载表变更后重打包；本次真机探针抓到它停在 Oct 4 15:32（早于 M3A 提交），重建后含 `bafRouteConfig`×39。
- root `tsconfig.client.json` 会类型检查测试文件（逐包 tsc 不查）：route-section.client.spec 补 5 处类型错（kit 未用 hook、mock 字面量收窄、combobox[1] 判空）。
- 清理陈年 `src/*.js` 影子（gitignored、非跟踪）：vite 解析优先 `.js`，launch-environment 的旧 `src/index.js` 让 12 个 web-app bundle 规格「launchedThroughSsh is not a function」；全仓 16 个一并删除后 bundle 规格 47/47。
- 汇总：**六域 590/590 绿**（baf-core、baf-workflow、ui-baf-workflow、ui-settings-baf-route、api/remotes、bundle/web-app，2026-10-05）。

## 8. 双端验证记录（web + 桌面 CDP 掯针）

探针：`C:/Users/12402/AppData/Local/Temp/baf-verify/routeprobe.mjs`（write=驱动 web、read=桌面断言同配置），截图同目录 `route-*.png`。两次探针各抓到一类单测不可见集成缺陷：

1. **组合树有插件、bundle 无依赖**：`dsh-web-app/package.json` 缺 `dsh-client-ui-settings-baf-route`（patch.yml 条目 M3A 已提交）→ 新增 `composition-roster.spec.ts` 守卫「树内每个 `@deepseek-ai/dsh-*` 插件必须是声明依赖」RED→GREEN（`6cfe136180`）。
2. **Host 入口幽灵依赖**：`src/index.ts` 为无用的 `static Config` 引 `@deepseek-ai/schemastery`（未声明；vitest/tsc 走根提升双双绿，Loader 包内解析运行时失败）→ 按先例删 import+Config，新增 `host-entry-deps.host.spec.ts` 把裸导入钉在 package.json（`4b7ada68c4`）。
3. 两处**构建产物根因**（源码无错）：缺 `typert.remote-client.js`（§7 的 OOM sweep）与 api-remotes `lib/client.js` 陈旧 —— 浏览器端 `remote.bafRouteConfig` 注入件由此两者决定，修产物后 boot 即绿。

**web 端（write，全绿 fail:[]/warn:[]）**：设置→工作流→多模型路由行渲染（3 档卡、9 阶段行、目录建议=真实账号模型 MiniMax-M2.7/M3/glm-5.3-flash）；总开关开、三档填 probe 模型、关键词 架构→高档、**保存往返落盘** `~/.dsh/baf-route-config.json`（escalateOnly=true、9 阶段映射全量）；**预演**「高档 · 架构」（host 侧 resolveTaskTier 走真实 RPC）；BAF 会话「工作流」Tab 出 `[data-testid=route-status]`＝「当前路由：暂无派单路由」。
**桌面端（read，全绿）**：dev electron（CDP 9201）读同一 home —— 开关已开、三档=web 所存 probe-high/mid/low、关键词在、预演同结果、Tab 面同断言。双端共享同一配置文件验证成立。
探针侧小教训：设置 Modal 关闭走 ESC/关闭钮（侧栏触发钮非 toggle）；会话行选择器用 `[data-row-key^="session:"]`（CSS-module 类名无语义）；「工作流」Tab 仅 agentPreset face=baf 的会话挂载，空白会话无 Tab（预期）。

## 9. 裁决摘要（全文见 SDD ledger）

1. Remote 迁双面包（浏览器 TYPERT_REMOTE 生成物只有双面包能拿）
2. 预演走 host Remote（bundle 纯度门禁禁客户端本地实现）
3. phase→tier 默认 host 物化（客户端不复制映射表）
4. Tab 当前路由不经冻结链（档位路由无冻结物）+ 搭 getTabView 顺风车（无新 Remote）
5. off 不渲染、preferred-only 阶段静默（enabled=false 与今天一致；行回答「每阶段谁在服务、是否回落」）
6. M4 挂既有 `cause:'verify-failed'` 标记（不新增信号字段）；地板在派单层不在配置层（重试通道规则，不动冻结链）
7. 芯片回落时去档位名（防跨档误导）

## 10. 遗留（小）

- reasoningEffort 暂不可在档位卡片编辑（保存往返原样保留）
- 预演读的是**已保存**配置（未保存改动预演结果滞后——dirty 徽标提示）
- M4 地板对设置「预演」框不可见（预演只试关键词匹配）
