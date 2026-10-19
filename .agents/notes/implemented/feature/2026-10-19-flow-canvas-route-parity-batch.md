# 2026-10-19 流程图样式对齐批 — 项目工程/确认门 图面与多模型路由画布同款

> 范围：设置→工作流「项目工程」（状态脚本图）与「确认门」（门禁总览图）两张流程图，
> 全面对齐「多模型路由→工作流模型绑定」的画布样式（route-parity canvas）；内容在新样式上适配。
> 验证路径：**web 端（CDP 探针 + 截图目检）**；vitest 52/52（gates 7 + standards 45），tsc 双端过，双包 lib 已重建并核内容标记。

## 统一画布语言（自 ModelRoutingRow 提炼，两图共用）

| 元素 | 规格 |
|------|------|
| 画布框 | `.flowWrap`/`.hooksFlowWrap`：1px separator 边 + 12px 圆角 + elevated 底 |
| 节点卡 | 绝对定位 192×56，padding 7px 10px，radius 10px，`linear-gradient(155deg, tier 10%, elevated)` 底 + `tier 45%` 边 |
| 交互 | hover/focus `translateY(-2px)` + tier 边框；focus-visible 2px 品牌色 `#4a78d2` 外圈 |
| 连线 | SVG 绝对 inset-0、pointer-events-none；同列垂直贝塞尔 `M x y1 C x mid, x mid, x y2`；stroke 1.6、tertiary、opacity .55 |
| 箭头 | marker `viewBox 0 0 10 10` / refX 8 / markerWidth 6 / orient auto-start-reverse，path `M 0 0 L 10 5 L 0 10 z` |
| 层级色 | 正常=蓝 `#7b8fc7`、终态/灰=tertiary、告警=红 `#bc7a7e`、配置=绿 `#7ba984` |

## 【变更】确认门（GatesOverviewRow 重写为画布投影）

- **投影**：0 列主链 `[...8 主流链节点, …extra, completed]`；每个门禁为**药丸贴在其守卫边的节点离边上**（入口门+分类贴 接单→建立变更 边；各 advance 门贴本节点离边；resume/abandon 堆在分支节点下）。PILL_W 176 / PILL_STEP 30，`pillGap(n)= n===0?18:n*30+14`。
- **客户端锚**：无 node 的 per-change 门（design-confirm→design、verify-archive→verify、resume→drift、abandon→abandoned）骑固定锚；仍放不进的进尾部 fallback 组（`baf-gates-once`）。
- **分支列**：漂移回归（红 tint）在 implement 旁 col 1，`分支` 标签；漂移→接单的虚线恢复通道在 CHANNEL_X 446，CANVAS_W 460。
- **详/略 Switch**（`gates.modeAria`，共享 Switch 原语）：详=画布+门禁明细组（`baf-gates-detail-node-<node>`，选项+阶段条件+模板边条件）；略=只留画布，药丸保标题+「一次性」徽标，节点 aria-label 携全部明细（hover Tooltip 同串）。「开关与阈值在配置文件」块删除。
- 样式：`GatesOverviewRow.module.css` 重写（`.gatePill` 虚线告警边 999px 药丸、`.pillOnce`、`.branchLabel`、`.detailGrid/Group`）；locales 加 `gates.legendState` 状态节点、`gates.detailTitle` 门禁明细。

## 【变更】项目工程·状态脚本（NodeHooksCard 重写为分栏画布）

- **左画布**：单列 224px（NODE_W 192 / NODE_H 56 / GAP 16 / X 16，CANVAS_H 584），8 个主链节点按钮（`baf-standard-hooks-node-<node>`，aria-pressed）；accent 行 = `进 e · 出 x`（绿 tier `#7ba984`）或 `未配置`（灰）；7 条带箭头贝塞尔；图例（绿点=已配置脚本 / 灰点=未配置脚本）。
- **右编辑器**：`baf-standard-hooks-editor`（`data-node=选中`，flex 1 1 280px + 左分隔线），进入状态/退出状态两列增删改；按选中节点 key 重挂（切换即重置在途输入）；默认选中=第一个有脚本的节点，否则 intake。空列表**丢键不留空数组**（对归一化持久投影的幻影脏态）。
- drift 刻意不列（引擎在漂移停车场不放炮，planNodeHooks 仅主链）。
- 样式：`StandardsOverview.module.css` hooks 段重写（route flowNode 卡逐字复用 + `.hooksNodeSelected` tier 边 + 2px tier box-shadow）；locales 加 `hooksEnterShort 进 / hooksExitShort 出 / hooksEmptyShort 未配置 / hooksLegendConfigured / hooksFlowAria`。

## 验证记录（web 端，demo-protect 工作区）

- **确认门结构**：11 节点 / 15 药丸 / 10 带箭头边 / `分支` 标签 / 10 明细组 / 4 个「一次性」徽标；几何探针 `canvasW 460, canvasH 1042, outside: [], overlaps: []`。
- **详/略翻转**（探针点击 switch）：明细组 10→0（药丸 15/节点 11 不动）→回详恢复 10/15。
- **项目工程结构**：8 节点序 intake…archive / 7 箭头边 / 默认 editor=intake / 点击 implement → data-node=implement、aria-pressed 唯一 / 保存钮未脏禁用 / 无重叠无出界（canvas 224×592）。
- **目检**（截图 6 张：确认门入口段/中段/明细段 + 状态脚本顶部/分栏/选中态）：药丸居中骑线不压卡、分支列与虚线恢复通道清晰、选中卡 tier 边+柔光环可辨识、无裁切/错位。
- vitest：`gates-overview.client.spec.tsx` 7 + `standards-overview.client.spec.tsx` 45 = **52/52 绿**；tsc client+host 双包过；双包 lib 重建并核内容标记（`baf-standard-hooks-editor` ×1；`baf-gates-flow-arrow`/`baf-gates-detail-node` ×3）。

## 会话杂项

- `.gitignore`：`/.edge-verify-profile/` 泛化为 `/.edge-*/`（本批 headless-Edge 档案目录 `.edge-baf-verify2/` 也入忽略）；清除误建 `undefined/`（坏 TMPDIR 下 tsx 缓存）。
- 探针：`.verify-sixissues.mjs` / `.shot-baf-flow.mjs`（CDP eval + 滚动截图；`/.*.mjs` 已忽略）。注意 `.verify-sixissues.mjs` 的 body 需要**显式 `return`**——函数体无 return 的语句块完成值恒 undefined。
