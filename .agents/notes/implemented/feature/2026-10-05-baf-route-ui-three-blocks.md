# 多模型路由 UI 三块批 — 三行一列模型分级 + 「工作流模型绑定」重叠根修 + 预设并入关键词规则 + 预演热加载 + 精选插件 pill 按钮 + updates 包通俗说明

- 日期：2026-10-05
- 范围：Tier 2（ui-settings-baf-route / ui-settings-updates 两 client 包共 8 文件；域层、store、host 契约零改动——全部是呈现层与交互层）
- 触发：客户续批六点 + 两点（web + 桌面双端验收）：①1.1 三张角色卡改三行一列，服务商/模型名/思考力度一行三列（左→右），模型名随服务商切换；②1.2 「阶段 → 角色 流程」改名「工作流模型绑定」、点击切角色说明移到标题下方，流程图重叠（客户截图）修复且更紧凑；③1.3 配置页分三块：模型分级 / 工作流模型绑定 / 关键词规则；④1.4 保存等按钮与精选插件按钮同风格；⑤1.5 预设词库默认已加入关键词规则，样式与逻辑取最优（操作简单、直观清晰）；⑥1.6 预演热加载，关键词一变预演随动；⑦版本与更新页插件包解释通俗易懂；⑧会话模型选择器开路由时显示 auto（§22.28 已落，本批双端复验）；⑨其他遗漏（=②）。
- 验证：定向 spec **39/39**（route-section.client.spec 重写 + updates-section.client.spec +4）；触点六包全量回归 **693/693**（预存失败清单之外全绿，首轮 1 例低内存 WELCOME_COMMAND 瞬时失败、复跑即绿）；**双端真机 19/19 ×2**（`probe-route-auto.mjs` v2：web 3080 + 桌面 Electron CDP 9201 同脚本双跑，见 §7）；staged oxlint 零错（首轮 2 处 arrow-parens 风格违例，修正后干净）。
- 前序：§22.28 auto 批（`2026-10-05-baf-route-auto-batch.md`）——本批全部建立在其运行时与 store 之上。

## 1. 模型分级块（1.1 三行一列）

【变更】`ModelRoutingRow.tsx`：三张角色卡重排为 `.tiers` 纵向 grid 的三行一列，每行 `grid-template-columns: 148px 1fr 1.4fr 1fr`（角色 | 服务商 | 模型 | 思考力度），`tiersHead` 表头行统一标注四列（`roleLabel`/`provider`/`model`/`effortLabel`）：

- 行内三选择器严格左→右：**服务商**单换（`setTierProvider`，模型与 effort 保留）→ **模型**菜单按已选服务商过滤（`providerModels = models.filter(m => m.provider === spec.provider)`）→ **思考力度**（选中模型的推理阶梯）。
- **模型名随服务商切换**：换服务商后模型下拉只列该服务商的模型；从菜单选中即从目录组反推 provider 落 spec。
- 无推理阶梯的模型以 disabled「—」占位按钮保住三列节奏（不塌列）。
- 「未在目录」chip 语义收紧：`spec.model` 离开**所选服务商菜单**即触发（`!providerModels.some(...)`），不止离开全目录。

## 2. 工作流模型绑定块（1.2 改名 + 重叠根修）

【变更】

- `phaseTitle`：zh「工作流模型绑定」/ en 'Workflow model binding'；`flowHint` 扩为「为每个工作流阶段绑定角色模型；点击节点切换角色（Worker → Reviewer → Commander）。」并从流程图下方移到**标题正下方**（`.description` 渲染在 `flowWrap` 之前）。
- 几何常量重定：`NODE_W 192 / NODE_H 56 / ROW_H 72 / COL_X [16, 236]`、恢复通道 `CHANNEL_X 446`、`CANVAS_W 460`。**根修**：列距 = 完整节点宽 + gutter（此前漂移列起点落在主链节点内 24px，即客户截图的重叠）。
- 新增 `edgePath(edge)` 按相邻单元格分类布线：同列竖直 bezier（底中→顶中）；同行右向 hop（implement→漂移）；恢复边（漂移→设计）出右边、沿 `CHANNEL_X` 正交通道上行、回设计的右缘——**任何连线不穿节点、无对角斜穿**。

## 3. 关键词规则块（1.3/1.5 预设并入）

【变更】独立的「内置预设词库」块删除——预设词本就是始终生效的规则（§22.28 运行时语义），呈现层归位：

- 预设词渲染为只读 `route-preset-tag` span：词 + 「预设」徽标（`presetBadge`），title「内置预设 · 始终生效」（`presetAlwaysHint`）；与用户可编辑 `route-keyword-tag`（✎ 行内编辑 / ✕ 删除）同住 `route-keyword-group` 角色行——先 Commander/Reviewer/Worker 分组，行内再按词库包（`rulePackName`）分组，一块看完「哪些词在生效、哪些是我加的」。
- §22.28 的「点击引用」交互删除（它们已在规则内，引用是冗余动作）——§22.28 遗留「引用为词级单条、不支持整包引入」就此关闭。
- `keywordsHint` 一句话说明两类标签语义；escalate 开关与预演子块（`previewBlock` 嵌套尾部，视觉分隔但不引入第四页块）同归本块。

## 4. 预演热加载（1.6）

【变更】预演输入改受控 `previewText` state + `useEffect` 300ms debounce（`PREVIEW_DEBOUNCE_MS`）：box 有文本时，任何草稿变动（关键词增删改、档位重指、开关翻转、verify 模拟切换）自动重跑 `runPreview(previewText, { verifyRetry })`，无需再点按钮；Enter 与手动「预演」按钮保留。无命中渲染 `previewNone`（「不会冻结角色」），命中渲染 `角色 · 命中词`（+ verify 模拟升档标）。

## 5. 精选插件 pill 按钮（1.4）+ updates 包通俗说明（问题 2）

【变更】

- `ModelRoutingRow.module.css`：`css.primary`/`css.link` 退役 → `css.btnPrimary`/`css.btn`（32px 高、16px 圆角 pill；主操作品牌色填充，其余描边静默款）——覆盖保存/重置、预演、标签行内保存/取消、新增按钮，与精选插件按钮同风格。
- `ui-settings-updates`：`packagesHint` 定调句（「以下插件包随应用一起安装、一起更新，无需单独安装或管理。」）+ 七包各一句 desc（工作流内核 / 工作流引擎 / 变更规格 / 工程规范 / 质量检查 / 安全守护 / 工程脚手架，`descBafCore..descBafScaffold`）；`VersionRow` 增 `desc?: string` prop 渲染于包名下（secondary 色，与 release notes 的 tertiary 音层分开——notes 说「改了什么」，desc 说「是什么」）。

## 6. 会话选择器 auto（问题 3）

无代码改动——§22.28 已落（`providerRank` baf-route=0 首组 Auto、未启用无组），本批探针 C1/C2 双端复验通过。

## 7. 双端真机验证（19/19 ×2）

`C:/Users/12402/AppData/Local/Temp/baf-verify/probe-route-auto.mjs` v2（web：`BAF_URL='…?token=…' node probe-route-auto.mjs 9200 web`；桌面：Electron `--remote-debugging-port=9201` 后 `node probe-route-auto.mjs 9201 desktop`）。两轮全绿：

| # | 检查 | web | 桌面 |
|---|---|---|---|
| A1/A1b | 三档角色行；三行一列（同左缘/纵向堆叠/等宽） | ✅ | ✅ |
| A2 | 服务商/模型/思考力度表头标注 + 行内左→右三选择器 | ✅ | ✅ |
| A3/A3b | 三块顺序 模型分级→工作流模型绑定→关键词规则；说明紧贴标题下方（先于流程图） | ✅ | ✅ |
| A4 | 流程 9 节点 10 path + marker，两两 rect 零重叠，无内滚全显 | ✅ | ✅ |
| A5/A5b | 预设 50 词全量、3 角色组、全带预设徽标、点击零效果（只读） | ✅ | ✅ |
| A6 | 总开关幂等启用（未保存草稿供预演） | ✅ | ✅ |
| A7/A8 | 预演命中内置低档词库 Worker·readme；verify 模拟 → Reviewer + 升档标 | ✅ | ✅ |
| A9–A11 | 自定义关键词标签新增 / 行内改（词+tier）/ 删除 | ✅ | ✅ |
| A12/A12b | 热加载：加词自动翻 Commander、删词自动回落「不会冻结角色」 | ✅ | ✅ |
| B1 | updates：packagesHint + 7 条包描述（桌面）；web 显示桌面限定文案 | ✅ | ✅ |
| C1/C2 | enabled → 选择器首组 多模型路由（Auto 排第一）；disabled → 无该组 | ✅ | ✅ |
| D1 | 探针写入的配置文件已删除（机器还原） | ✅ | ✅ |

截图：`route-auto-A-settings.png`（web）/ `route-auto-A-settings-desktop.png` / `route-top-final.png`（弹层清理后顶部整页）。视觉复核：vision 分析确认三行一列与表头对齐；「思考力度」列在干净态 DOM 复核（首帧被探针遗留弹层遮挡——pointerdown 关闭后清晰）；保存按钮 computed `border-radius: 16px / 高 32px`（pill）。

**探针侧四个坑（防再踩）**：

1. token 两跳导航竞速：固定 1.5s sleep 会在 303 落地前发起第二跳，SameSite=Strict cookie 永不铸造、`#root` 不挂载——改布尔 `until()` 轮询（`pathname==='/' && search==='' && readyState!=='loading'` 再跳同源 hop；上下文切换期异常读作 false，waitExpr 的 q() 会返回 `'ERR:'` 字符串短路真值判断）。
2. CSS module 哈希：`.block` 类名被哈希（如 `lmGZYq_block`），字面选择器落空——块标题按**叶子节点精确文本**定位（`childElementCount === 0 && textContent === w`）。
3. `compareDocumentPosition` 返回**位掩码**（4=FOLLOWING）不是布尔——`=== true` 必败，要 `!!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)`。
4. 预演无命中文案是 `previewNone`（「不会冻结角色」）不是档名——热加载基线/回落都要等这四个字；另探针合成 Escape 派发在 document 上到不了 React root 监听，关菜单要用真实 pointerdown。

## 8. 构建

ui-settings-baf-route `lib/`：client+host tsc + tsdown（client 143.18 kB）；ui-settings-updates：tsdown（46.72 kB）。域层无改动，不涉 `packages/api/remotes` 重建链。

## 9. 遗留（按影响排序）

1. updates 包 `tsc -p tsconfig.json` TS6306 —— HEAD 上既有（stash 复核确认），非本批引入，随上游债处理。
2. 默认三档 spec 指向的模型不在本机目录时，开箱三条「未在目录」——诚实 UI，但默认模型策略（按目录首模型回落 or 留空待选）待客户定夺。
3. §22.28 遗留继续：`escalateOnly` 语义只在关键词路径生效（派单冻结档不受其限）；auto 会话请求头快照显示解析后模型而非 Auto（回放可见具体档位，行为正确但与选择器显示不一致）。
