# 多模型路由 UI 批次 — 独立设置分区 / 流程图档位 / 预设词库 / 语义化导航图标

- 日期：2026-10-05
- 范围：Tier 2（client 面：ui-settings-baf-route + ui-settings-general + test-support 测试基建；无 host / Remote / typert 改动，无 NSIS/打包面改动）
- 触发：客户五点反馈（需 web + 桌面双端验收）：①多模型路由从工作流设置行独立为自己的设置分区；②UI 美化、美观和谐；③阶段→档位改流程图呈现；④关键词规则要有预设词库；⑤设置左侧导航图标贴合「多模型路由」词义
- 验证：route-section 15/15、settings-root 33/33、shell 9/9、六域无回归；根 `tsc -b tsconfig.client.json` 零错；staged oxlint 零错；双端真机（web 3080 serve + 桌面 electron）交客户验收
- 前序：M1–M4 全景见 `2026-10-05-baf-multi-model-routing-m1-m4.md`（本批只动 M3B 那一层的呈现与注册方式）

## 1. 独立设置分区（问题 1）

【变更】`ui-settings-baf-route/src/client/index.ts`：注册目标从 `settings.workflow.item` 行槽位改为 `settings.section` 分区槽位（ui-settings-general 声明的 `{kind:'list', scope:'root'}`；`PropsRuntime<'settings.section'>` 与原行槽位携带相同的 kit 钩子根标准 props——组件 props 只换壳不换里）。id `model-routing`、order 21（工作流 20 之后、版本更新 25 之前；agent-presets 20 同值不冲突，槽位排序稳定）。标题从行内 `h2` 保持为分区标题（locale `nav` = 多模型路由 / Multi-model routing）。

【变更】`ui-settings-general`：`SettingsRoot.tsx` navIcon 新增 `model-routing` 分支（§4）；shell 测试 `PRODUCT_SECTIONS` 扩为 8 项（general/models/plugins/agent-presets/workflow/**model-routing**/version-updates/featured-plugins）。

## 2. 流程图档位 + UI 和谐（问题 2+3）

【变更】`ModelRoutingRow.tsx`：九节点按**工作流执行序**横排 flow（intake → open → clarify → design → plan → implement → verify → archive，drift 以 ↻ 回环箭头收尾；flex-wrap 窄屏折行）——替代原「9 行 × 档位下拉」。每节点一枚按钮：节点名 + 档位色 + **映射档位的模型名**（节点直接回答「谁在服务」），点击按 低→中→高→低 循环切档（免下拉免表单），title 提示 `阶段 → 档位 · 模型` 全链路。头部图例三档圆点。

【变更】配色统一走每档一个 `--tier-color` 自定义属性：高=琥珀 `--dsw-alias-state-warn-primary`、中=品牌蓝 `--dsw-alias-brand-primary`、低=成功绿 `--dsw-alias-state-success-primary`；顶边 2px 色条（三档卡片、流程节点、预设 chip 左边条）+ 7px 圆点（图例、卡片头）+ 档位文字着色，全页同一套语义色。三档卡片化：圆点 + 档名 + 一句话职责（高=复杂工程与关键决策 / 中=常规开发与排查 / 低=轻量改动与日常问答）+ provider/model 输入（目录建议 datalist 保留）。

【变更】`route-store.ts` load()：保存文档缺某 phaseTier 节点（手改/旧档）时以 Host `defaults()` 默认图补齐——用户覆写优先，**新建对象**合并（`{...defaults.value.phaseTier, ...response.value.phaseTier}`，不 mutate——快照 store 深冻结 + 共享引用教训），流程图恒绘九节点；节点清单仍 Host-owned（bundle 纯度门禁：客户端零内置映射）。`freshDraft` 增可选 `loaded` 参数（load 并行取好的 defaults 直传，reset 走自取）。

## 3. 预设词库（问题 4）

【变更】新文件 `src/client/presets.ts`：四个精选双语包（客户端常量）。选词依据：工程经验中稳定预示任务复杂度的术语 + 主流 code review / issue 分级实践（复杂工程与发布宜强模型、文案 typo 不必）：

| 包 | 档 | 词表（`|` 分隔，复用 resolveTaskTier 的 CJK 子串 + ASCII 词边界） |
| --- | --- | --- |
| 复杂工程 | 高 | 架构\|重构\|性能优化\|性能瓶颈\|安全漏洞\|并发\|算法\|数据迁移\|兼容性\|architecture\|refactor\|performance\|security\|concurrency\|migration |
| 关键设计与发布 | 高 | 技术选型\|方案设计\|设计评审\|整体方案\|上线\|发布\|部署\|breaking |
| 测试与排查 | 中 | 单元测试\|集成测试\|测试用例\|代码评审\|回归\|排查\|复现\|日志\|边界\|test\|review\|debug\|regression |
| 轻量改动 | 低 | 文案\|注释\|文档\|README\|格式化\|拼写\|错别字\|翻译\|改名\|版本号\|typo\|wording\|docs\|rename |

【变更】UI：预设区四枚 chip（左边条档位色 + 包名 + `+ 档位`/`✓ 已添加`）；一键加入携档位入草稿，hover title 展示完整词表；与草稿**逐字相同**词表的包显示已添加并禁用（防重复堆积）。手输增删行保留在预设区之下。

## 4. 语义化导航图标（问题 5）

【变更】`ui-settings-general/SettingsRoot.tsx` `navIcon(id)` 新增 `model-routing` → **IconGaugeOutlineMedium**（仪表盘/指针盘）：「档位」的换挡语义——指针指向哪一档=哪一档服务本回合，与「多模型路由」词义贴合。否决项：IconCompareSplitOutlineMedium（实为左右并置双面板，与「分屏」撞义）、SlidersTwo（调参语义，弱于档位盘）、IconBranch（已归工作流）。未知 id 仍回落齿轮。

## 5. 测试基建顺修（预存问题，非本批引入）

【变更】`test-support/client-runtime remote-default-responses.ts` 补 `bafRouteConfig/get`（ok null）+ `bafRouteConfig/defaults`（九节点默认图，值镜像 baf-core `DEFAULT_PHASE_TIER`，host 侧规格已钉）——M3A 把 ui-settings-baf-route 纳入 webApp roster 后，shell.client.spec boot 期两 RPC 无应答、remote-mock teardown 报 unmatched，8/9 红自彼时起（stash 于 HEAD 验证）。补后 9/9 绿。

## 6. 测试（as-built）

- `route-section.client.spec.tsx` **15/15**：新增 5 例——控制器物化缺节点（手改档只钉 design，其余八节点由默认图补齐且覆写幸存）；流程图执行序（names[0]=intake、[3]=design、[8]=drift）+ 节点带映射模型（cheap/big/mid）；点击循环切档（implement low→mid、design high→low 回环）；预设包（chip 数=包数、一键 addKeyword 携词表+档位、已添加包 disabled+「已添加」）；分区注册（inject `settings.section`、`{id:'model-routing', order:21}`、label()=nav）。
- `settings-root.client.spec.tsx` **33/33**：导航图标去重规格扩为 7 行断言（前 6 个两两不同、第 7 未知 id 回落齿轮=第 1 个）——RED（5≠6 缺 glyph）→GREEN。
- `shell.client.spec.ts` **9/9**（remote 默认应答补齐后）。
- 六域无回归：baf-core / baf-workflow / ui-baf-workflow / ui-settings-baf-route / api-remotes / bundle·web-app 全绿（bundle-roster 的 `ui-baf-tracegraph → dsh-session-stats` 悬空 inject 边为**预存失败**，stash 于 HEAD 验证，与本批无关，留待 tracegraph 批次）。
- 根 `tsc -b tsconfig.client.json` 零错（会查测试文件；逐包 tsc 不查）。坑：ambient css-module `Record<string, string>` 在 noUncheckedIndexedAccess 下一切 `css.x` 读作 `string|undefined`——`join()` 形参放宽 `ReadonlyArray<string|undefined>` + 类型守卫过滤，`TIER_CLASS` 用 `?? ''`（no-non-null-assertion 禁 `!`，生产代码）。
- staged oxlint（`.oxlintrc.staged.json`）零错。注意：裸 `npx oxlint` 跑的是全量规则集，与本仓 staged 门禁不同——以 `scripts/run-oxlint.ts --config .oxlintrc.staged.json` 为准。

## 7. 构建 + 双端

- 定向重建：`packages/client/ui-settings-baf-route` + `packages/client/ui-settings-general` 各 `npx tsdown`（client face 8.05KB/141.88KB bundle 落盘）；无 host/remote/typert 改动故不触 emitWorkspace；test-support 为测试面不进 serve。
- web：`apps/cli web`（3080）stat-poll bundle → 刷新广播生效；桌面：`overlay/desktop npm start` 重启加载新 client bundle。交客户双端验收（设置 → 多模型路由：新分区 + 仪表盘图标 + 卡片 + 流程图 + 预设）。

## 8. 遗留（按影响排序）

1. **（中）预演读已保存配置**（M1–M4 遗留未变）：未保存改动预演滞后，仅 dirty 徽标提示。
2. **（低）reasoningEffort 不可在档位卡片编辑**（M1–M4 遗留未变）：保存往返原样保留。
3. **（低）M4 verify 升级地板对预演框不可见**（M1–M4 遗留未变）：预演只试关键词匹配。
4. **（低）流程图节点模型名截断**：窄屏 max-width 130px 省略号，完整链路看 title 悬停。
5. **（低）预设「已添加」判定为逐字相同**：用户手改过词表的同名包仍可再加（此时是预期——词表已不同）。
