# 多模型路由 auto 批 — `baf-route/auto` 伪模型 + Worker 默认/关键词升级 + 全量标签词库 + 流程图全显 + 遗留五项清零

- 日期：2026-10-05
- 范围：Tier 2（baf-workflow 派单链 + route-auto 运行时 + api/session-controller 结构化桥 + ui-settings-baf-route host/client 双面 + ui-model-selection / ui-settings-subagent client 面；无 NSIS/打包面改动）
- 触发：客户六点续批（web + 桌面双端验收）：①多模型路由服务商需要可配置；②日常编程使用 Worker、Reviewer 作为 Worker 的审查者；③流程图直接显示完整、卡片小些紧凑；④多模型路由需使用 auto 模型才支持，否则使用选中的模型——没有使能则没有 auto 模型；⑤非 baf 工作流默认 Worker、触发关键词才升级，预设词库 UI 全量清晰显示（先按 Commander/Reviewer/Worker 分类再细分包）、关键词标签增删改、支持引用默认预设词库；⑥精选插件飞书使用答疑（文档答复，非代码）。随批修掉 §22.27 遗留五项。
- 验证：route-auto 10/10、route-auto-bridge.host 7/7、provider-order 2/2、route-config-service +4、route-section +13、route-dispatch 改写；触点六文件 91/91；五包全量回归 **683/683**（baf-workflow + baf-core + ui-settings-baf-route + ui-model-selection + ui-settings-subagent）；**双端真机 12/12**（`probe-route-auto.mjs` web 3080 + 桌面 Electron CDP 同脚本双跑，见 §8）；staged oxlint 零错。
- 前序：§22.27 角色三档批（`2026-10-05-baf-route-role-tier-batch.md`）；本批在其上引入 auto 伪模型闭环。

## 1. auto 伪模型运行时（问题 4 核心）——`baf-workflow/src/route-auto.ts`

【变更】新增 `BafRouteAutoRuntime`（`Service` 名 `bafRouteAuto`，由 ui-settings-baf-route host 入口随配置服务一同挂载——配置文件归它所有，同级 host 服务经 scope 链可达）：

- `AUTO_PROVIDER='baf-route'` / `AUTO_MODEL='auto'` 伪模型对；`catalogGroups()` 仅在 `isTierRoutingActive` 时返回唯一组 `{id:'baf-route', name:'多模型路由', models:[{id:'auto', name:'Auto'}]}`，**每次调用重读配置文件**（设置保存即对下一次解析生效）。
- `resolveAuto(sessionId, raw)` 解析优先级：**派单单发 pin**（一次性消费，`/baf-go` 时派单钩子落点）→ **关键词扫描**（该会话最后一条**用户**消息文本；`session/event` 中 `source.kind==='user'` 的 text 部分拼接缓存，工具结果/子代理回声绝不入扫描）→ **默认 `low`（Worker**，问题 2/5：日常编程用 Worker、Reviewer 作审查者、关键词才升级）。非 auto 选择或配置失效返回 undefined——回落会话持久头/部署默认，伪模型对绝不落到 provider。
- 包导出 `./route-auto`：package.json exports/files + tsdown 分片（`lib/types/route-auto.js` 入口）+ tsconfig.base paths。

## 2. api/session-controller 结构化桥（不依赖 baf 包）——`route-auto-bridge.ts`

【变更】`routeAutoOf(ctx)` 经 scope 链鸭子类型探测（accepts/resolveAuto/catalogGroups 三函数形检；缺失/未挂载/异常 = 处处无 auto，一切如旧）；`autoCatalogGroups(ctx)` 把 auto 组映射成浏览器目录安全形状并**前置**。三个接入点：

- `catalog.ts`：组序列 `[...autoCatalogGroups(ctx)过滤空, ...providerGroups]`——启用时会话模型选择器首组即 多模型路由/Auto。
- `commands.ts` `selectModel`：伪模型对**原样安装**（`selectForNextRequest` 直落）——跳过 registry 可用性检查、`resolveCallConfig`（无 provider 认领该对）与默认模型持久化（auto 是会话级模式，永不成为部署默认）；下一次请求组装时逐级解析。
- `agent.ts` `InstalledSelection`：`current` getter 每步经运行时解析（resolve 出的 effort 以 `ReasoningEffortId` 品牌化；路由在 pick 后消失 → 回落持久头/部署默认）；新增 `raw` getter（picked ?? loggedSelectionOf）+ `index.ts` `rawSelectionOf()` 公共透传——**持久选择保持 `baf-route/auto` 不被覆写**，路由从不改写客户实际所选项。`tsconfig.host.json` files 增补 `route-auto-bridge.ts`。

## 3. 派单门改读 raw 选择（问题 4 后半）——`route-dispatch.ts`

【变更】`SessionControllerLike` 从 `selectForNextRequest` 换 `rawSelectionOf`；新增 `bafRouteAuto` 运行时探测（accepts + pinForNextRequest 形检）。门逻辑：非 auto 选择（**否则使用选中的模型**，钩子完全不介入）或无控制器/无运行时 → 不装钩子；命中 auto → `tierRouteSelection` 纯函数照旧出档位模型，落点从「会话控制器 pin」改为 `bafRouteAuto.pinForNextRequest`（单发，下一次请求消费）。会话双通道定型：**派单走 pin（冻结档），普通聊天走关键词瀑布（Worker 默认）**。

## 4. 选择器排序 + 子代理排除（问题 4 呈现层）

【变更】`ui-model-selection/provider-order.ts`：`providerRank(id)`——`baf-route`=0（Auto 排第一，「让路由决定」是入口）→ deepseek-account=1 → deepseek-official=2 → 其余 3；`orderModelProviders` 用 rank 差排序，组内模型序不变。
【变更】`ui-settings-subagent/subagent-model-selection-card-controller.ts`：`subagentModelCandidates` 过滤 `group.id !== 'baf-route'`——auto 是会话级选择器，子代理钉死伪路由会携带不可解析对。

## 5. 设置区五补（问题 1/3/5 + 遗留 A–E）

【变更】`route-store.ts`：

- `RouteCatalogModel` 增 `label`（重名以「·provider」后缀消歧，遗留 E）与 `reasoning`（选中模型的推理阶梯 efforts + defaultEffort，无梯则省略）；目录蒸馏剔除 auto 组（伪模型不可被档位钉选）。
- `setTierProvider(tier, provider)`（问题 1：单换服务商、模型与 effort 保留）——每卡「服务商」Menu 独立可选。
- `setTierEffort(tier, effort)`（遗留 B：档位 effort 可编辑；`undefined` 删键回落模型默认，「默认」菜单项清空）。
- `updateKeyword(index, rule)`（问题 5：标签行内原地替换）。
- `runPreview(summary, options?)` 改传**未保存草稿** + `verifyRetry` 开关（遗留 A/C）：host `index.ts` `preview(summary, draft, options)` 草稿无效回落已存配置；低于 mid 的判定在 verifyRetry 下升 mid 并打 `escalated` 徽标（M4 地板对预演可见）。`BafRoutePreviewResult.escalated` + `BafRoutePreviewOptions` 进 types.ts。
- 目录外旧模型：锚钮显「未在目录」chip + 原始 id（遗留 D）。

【变更】`ModelRoutingRow.tsx` + `.module.css`：

- **词库全量标签云**（问题 5）：预设区按角色分组——`route-preset-tier` 行（Commander/Reviewer/Worker 角色色标）× 每档 `route-preset-pack`（包名 = 细分类目，如 复杂工程/关键设计与发布 等 BUILTIN 四包显示名）+ **一词一标签** `route-preset-tag`（50 词全量可见、无省略号）；点击标签**引用**——词级去重（同档已有规则覆盖该词则跳过）后 `addKeyword({words, tier})`。用户规则呈 `route-keyword-tag`（词组 + 角色色标 + ✎/✕）；✎ 开行内编辑（`route-keyword-edit-input` 词组 + tier 下拉 + 保存/取消），✕ 直接删。
- **流程图全显**（问题 3）：去 §22.27 的 420px max-height 内滚，`flowWrap` 全量直出；节点卡收紧（COL_W/NODE_W 缩、卡高减），真机 `wrapH == scrollH`、`style.maxHeight` 为空、无内部滚动条；10 path + arrow marker 保留，节点点击循环切档保留。

## 6. 测试（as-built，均 RED→GREEN）

- `route-auto.spec.ts` 10 例：服务注册名 / accepts 仅认伪对 / catalogGroups 门控 / 非 auto 与失活返回 undefined / **默认 Worker** / 关键词升档含内置包 / 非用户与无文本事件不入缓存 / **pin 单发优先并消费** / 逐次重读配置（保存即生效）。
- `route-auto-bridge.host.spec.ts` 7 例：目录前置 / 无运行时或失活无 auto 组 / selectModel 三跳过（可用性、call-config、默认持久化）/ rawSelectionOf 透传与每步解析 / 路由消失回落部署默认 / **请求头组装不消费 auto 选择**（会话留在 auto）/ 非 auto 原样返回。
- `provider-order.client.spec.ts` 2 例：baf-route 组排首（先于 account/official）/ 普通组相对序不变。
- `route-config-service.spec.ts` +4：挂载运行时 / 草稿预演 / 草稿无效回落已存配置 / verifyRetry 地板 + escalated 标记。
- `route-section.client.spec.tsx` +13：服务商单换（模型与 effort 保留）/ effort 编辑与「默认」清空 / 无梯模型隐藏 effort 菜单 / 未在目录 chip + 原始 id / 重名 provider 后缀消歧 / 目录蒸馏（auto 组剔除 + reasoning 携带）/ runPreview 传草稿与开关 / 紧凑全显流程（workflow 序）/ 全量标签云 / 引用去重 / 标签行内编辑删除 / 预演三态（判定 + escalated + 开关透传）。
- `route-dispatch.spec.ts` 改写：raw 门（非 auto 不装钩）+ pin 落点（bafRouteAuto 而非控制器）。

## 7. 构建链踩坑（本批核心教训）

改 typert 契约（`preview` 1→3 参）后必须**三连重建 + 重启**：①目标包 typert 工件 → ②`packages/api/remotes` `npx tsdown`——它是客户端聚合面，把每个包的 `typert.remote-client.js` 编织进单一 `lib/client.js`，**不重建则浏览器仍按旧参数数强制**，报 `client api: bafRouteConfig/preview expected 1 argument(s), got 3`（client 侧抛自 gateway `client/index.ts` 的 `descriptor.parameters.length` 检查，host 日志无痕）→ ③各改动的 client 包 `npx tsdown` 刷各自 `lib/client.js`（本批：ui-model-selection、ui-settings-subagent 也旧了）→ ④host 重启（rev 重扫破浏览器缓存）。注意 api/remotes 与 ui-model-selector 无 `tsconfig.client.json`——`npx tsdown` 单跑即可（`tsc -p tsconfig.client.json` 报 TS5058）。

## 8. 双端真机验证（12/12 × 2）

探针 `C:/Users/12402/AppData/Local/Temp/baf-verify/probe-route-auto.mjs`（参数化 `[port, mode]`，web=token 两步导航 / desktop=Electron 渲染进程同源重载）：

| 项 | 断言 | web | 桌面 |
|---|---|---|---|
| A1 | 三档角色卡 high/mid/low | PASS | PASS |
| A2 | 每卡独立「服务商」选择器 ×3 | PASS | PASS |
| A4 | 预设词库全量标签 50 词 / 3 角色组 | PASS | PASS |
| A5 | 流程图全量可见无内滚（flowWrap / maxHeight 空 / 10 path + marker） | PASS | PASS |
| A7 | 预演命中内置低档词库 → Worker · readme | PASS | PASS |
| A8 | verify 重试模拟 → Reviewer +「经 verify 重试保底升档」 | PASS | PASS |
| A9–A11 | 关键词标签 新增 / 行内编辑 / 删除 | PASS | PASS |
| C1 | enabled=true → 选择器首组 Auto 排第一 | PASS | PASS |
| C2 | enabled=false → 无 auto 组（没有使能则没有 auto） | PASS | PASS |
| D1 | 配置文件删除还原机器状态 | PASS | PASS |

截图 `route-auto-A-settings{,-desktop}.png`、`route-auto-C-picker-{on,off}{,-desktop}.png`（Temp/baf-verify）。

## 9. 遗留（按影响排序）

1. **`escalateOnly` 只约束关键词路径**：派单冻结档不受其限——与「只在关键词升级」的字面有差，待客户确认预期（派单是显式工作流行为，当前设计合理）。
2. **auto 会话请求头快照显示解析后模型**：回放可见具体档位模型而非 Auto，与选择器显示不一致（行为正确，呈现差异）。
3. 预设词库引用为**词级单条**：不支持整包一次引入（可作为后续「按包引用」增强）。
4. 关键词扫描只看**最后一条用户消息**：多轮长上下文中的关键词不在扫描面（首条触发即升级的语义下可接受）。
