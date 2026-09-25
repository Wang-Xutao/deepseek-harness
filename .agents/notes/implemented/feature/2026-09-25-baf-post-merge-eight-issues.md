# merge master 后八问题修复全景（2026-09-25 需求 → web 实测 8/8）

需求来源：merge origin/master（15829a17fc）后用户发现的 8 条回归（设置页 3 条、
BAF 工作流 5 条），外加一轮主动排查。真机验证（web :3210 + CDP 探针 + 会话
zstd 落账取证）8/8 全绿；`tsc -b` host/client 双绿；分块 host 构建全块通过。

## 逐项修复

### 1. 通用设置 · 轨迹图 switch（问题 1.1）

根因：merge 后 host settings 注册链路变化，开关写入 `baf-workflow` settings
namespace 无效且无反馈，轨迹图 Tab 可见性也不跟随。

【变更】`ui-baf-tracegraph/src/workflow-settings.ts`：开关持久化改为设备本地
localStorage 偏好 `baf.trace-graph.pref`（`{"showTraceGraph":bool}`），不再依赖
host RPC。
【变更】`ui-baf-tracegraph/src/index.ts`：host 半边不再注册 settings namespace
（桌面组合仍挂载该入口，但自身零注册）。
【变更】`ui-baf-tracegraph/src/client/index.ts`：轨迹图 Tab 可见性直接订阅该
localStorage 偏好。
实测：开关可切换、`{"showTraceGraph":false}` 落盘、轨迹图 Tab 隐藏、刷新后状态
保持、恢复 ON。

### 2. Agent 预设 · BAF 模式（问题 1.2）

【变更】`ui-agent-preset/src/client/locales.ts`：「BAF流程模式」→「BAF 模式」；
排序移到第二位（标准模式之后、PTC 模式之前）；描述改写为企业级定位——
「为产品工程任务定制的工作流，内置质量门控」，突出 BAF 模式是企业级 AI 编程
工作流的核心。
【变更】`presets/baf/{preset.yml, agent.cordis.yml}` 与
`packages/bundle/web-app/cordis.patch.yml`（含 presets/ 三份）：agent-preset-registry
配置 `default: standard → baf`——新会话默认进入 BAF 模式。
【变更】已安装 profile `~/.dsh/profiles/web/cordis.patch.yml` 同步 `default: baf`
（运行时生效的是这份，repo bundle 只影响新装）。
实测：设置页顺序/文案/「新任务默认」badge 正确；demo8（无旧空白会话）新建会话
头栏显示「BAF 模式」。

### 3. 设置导航 icon 区分（问题 1.3）

【变更】`ui-settings-general/src/client/SettingsRoot.tsx`：`workflow` →
IconBranchOutlineMedium（分支图标）、`version-updates` → IconDownloadOutlineMedium
（下载图标）；齿轮（IconSettingsOutlineMedium）只保留给通用设置。
实测：三 section icon 互不相同（branch / download / gear 的 SVG path 逐一核对）。
（插件市场原本就用个性化 icon，不属于共享齿轮问题，未动。）

### 4. 新会话触发 baf-welcome（问题 2.1）

根因只有一层：新会话默认预设仍是 `standard`（master #4587 的 selectedDefault
机制下 bundle patch 也还是 standard），BAF 指令层根本没装。默认预设改为 baf
（见 #2）后，baf-welcome 本来就会自动触发——无需新代码。

实测（两个会话的 zstd 落账）：`command/run name=baf-welcome` +
`command/done "✓ BAF 已就绪 · <工作区> · …"` 自动出现。
已知剩余：hero 阶段（从未发过消息）conversation 视图渲染 0 节点，welcome 卡
要等首条消息后才可见——见剩余风险 1。

### 5. baf 指令默认展开（问题 2.2）

【变更】`ui-chat/src/client/chat/GenericCommandCard.tsx`：
`useState(false)` → `useState(true)`——斜杠指令输出卡默认展开。客户敲指令就是
为了看输出，折叠默认会让信息被忽略。
实测：baf-welcome 全文（状态/下一步段落）直接可见，无需点击。

### 6. /baf-go v4 报错 + 流程卡滞（问题 2.3，demo8 会话）

根因：merge 后 v4 消息格式校验要求 source 为 producer-owned kind；go-dispatch
工单 stamped `kind: 'plugin'`（v4 已废除的 catch-all）→「本轮运行失败 format v4
message requires a producer-owned source kind」→ 派单被拒 → 工作流卡在 clarify。

【变更】`baf-workflow/src/go-dispatch.ts`：工单 source 改
`{ kind: 'baf-workflow', form: 'go-dispatch', changeId, node, missing }`
（producer-owned）；删除 DISPATCH_PLUGIN 常量。
【变更】`llm/llm/src/message.ts`：MessageSourceMap 新增 `'baf-workflow'`
producer kind；ContextForm 新增 `go-dispatch`（changeId / node / missing 字段
契约）。
【变更】`ui-chat` event-projection.ts + ContextBody.tsx：`baf-workflow` kind →
role `inject`、label「BAF 工作流」，渲染为只读上下文行（不进 composer、不可
误读为客户发言）。
【变更】`baf-workflow/tests/{go-dispatch,go}.spec.ts` 断言同步。

实测（demo8 · session-bb0637c7，端到端推进）：
- v4 报错 0 次（页面与会话落账均无「本轮运行失败」）；
- 澄清问题卡 4 题答完 → commit 策略门（单 commit）→「进入设计」确认卡 →
  design 回合自动执行（design.md +269/-3）→「进入计划」确认卡弹出等待客户——
  卡死的 clarify 阶段已完全打通，整链 clarify→design→plan 门全部正常弹出可交互；
- 会话落账 seq126 `user/message` source=
  `{kind:'baf-workflow',form:'go-dispatch',changeId:'change-20260924-ecum-9f0f',node:'design',missing:[…]}`；
- UI 渲染「BAF 工作流」只读行；门卡内选项 1 直接执行
  `/baf-go-confirm change=…`。

### 7. 右侧栏阶段详情通俗化（问题 2.4）

【变更】`ui-baf-workflow/src/client/catalog-i18n.ts`（191 行重写）：删除
「通俗说明」独立项；其余条目（门条件、产物要求、下一跳等）整体改写为通俗
语言——无 T 码、无内部术语，条件可检验（例：「下一跳 = 设计；条件 = 卡进度的
问题已回答或明确延后」）。
【变更】`WorkflowView.tsx`：确认状态行由裸 `view.intake.mode`（泄漏
`full-go-path`）改为 `modeLabel()` 本地化 →「已确认 · 完整流程」；
`locales.ts` 增补词条。
实测：右栏无「通俗说明」项、无裸枚举值；确认行显示「已确认 · 完整流程」
（ui-baf-workflow bundle 重建后复核）。

## 构建与验证

- 分块 host 构建：`tsdown.chunk.config.ts`（12 包/块 × 12 块，rebuild-list.tmp.json
  驱动，剔除 `*.tsbuildinfo` 假信号）+ `typert-emit-all.mjs` 单独 emit（24 包），
  绕开单进程 workspace 构建 OOM；typertPlugin 的 decorator-lowering transform 保留，
  仅抑制块内 writeBundle。全块 exit 0。
- client 侧受影响包各自 `pnpm --filter @deepseek-ai/dsh-client-<pkg> run bundle`。
- vitest：baf-workflow go/go-dispatch 相关全绿。预存失败（stash 隔离证明与本次
  无关）：connection/fixture raw-history 形状、ui-settings-general apply/shell
  （client-test-runtime 解析不到 web-app）、desktop-close-prefs label 漂移、
  rpc-retry ×3。

## 剩余风险/不平整点（user-visibility × fix-cost 排序）

1. **hero 阶段 welcome 卡不可见**（高可见 / 中成本）：从未发消息的会话
   conversation 渲染 0 节点（feed 实际已 open，slash palette 可用），baf-welcome
   已落账但看不到，首条消息后才出现。建议方案：hero slot 注入 BAF 摘要卡
   （经 baf-workflow remote 读 host snapshot）；本轮未动（属 Tier 1 接口新增）。
2. **旧空白会话携带旧预设**（中可见 / 低成本）：`reuseBlank` 会复用工作区里的
   空白会话并沿用其录制预设（demo7 的空白会话仍是 standard）。候选修复：
   创建时若空白会话预设 ≠ 当前默认预设则弃旧建新。
3. **预存测试失败 4 组**（低可见 / 中成本）：均为 master 合并既有，见上。
4. **插件市场 icon**：仍为个性化 icon（非共享齿轮），不在本次需求范围，维持现状。
