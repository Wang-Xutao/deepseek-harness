# 批次二十二（2026-10-25）：会话输入框「美化 / 回退」控件 —— 确定性 Markdown 整理器 — desktop 0.0.46

> 需求原句：`/frontend-design-master` 修改 baf-dsh 桌面应用……1. 增加一个新功能，在会话框中增加一个按钮，点击后会把当前会话框中输入的文字进行优化和格式化。使用 markdown 格式进行详细的补充的说明，目的是帮助用户讲问题说清楚，有条理。说清晰。注意不能修改客户的用意，不能私自增加私活。优化和格式化后的文字取代之前的文字，美化按钮改为回退按钮功能。这个功能能否实现，有无风险和问题，给出最优化的方案，优化和格式化过程是否需要隐式调用大模型实现？

## 0. 结论速览

| # | 事项 | 落点 | 状态 |
| -- | ---- | ---- | ---- |
| 1 | 会话框新增「美化」按钮 | `packages/client/ui-baf-desktop/src/client/DraftFormatButton.tsx` | ✅ 落地上游预留插槽 `conversation.input.right`（`scope: 'session'`），**不改上游 ui-conversation** |
| 2 | 把草稿整理成 Markdown 结构 | `packages/client/ui-baf-desktop/src/client/draft-format.ts` | ✅ **本地确定性规则**，只加结构不加字；零网络、零成本、零延迟，完全可逆 |
| 3 | 「美化」执行后变「回退」 | 同上 | ✅ 单格快照（绑定会话），执行后按钮即时切换，tooltip 同步改文案 |
| 4 | 是否隐式调用大模型 | — | ✅ **不调用**。这是本批最关键的一条决策，见 §2 |
| 5 | web 端真机验证（亮色 + 暗色） | `overlay/scripts/probe-batch22-web.mjs` | ✅ **28 项断言全 PASS，`fail: []`**；双主题逐帧审查通过 |
| 6 | 桌面 exe（免安装） | `overlay/desktop/dist/win-unpacked/baf-dsh.exe` | ✅ **exe 冒烟 25 项 + exe 内功能核验 11 项断言全 PASS**；splash 实测 `v0.0.46`；随包 12 项字节判据全中且与构建产物 SHA-256 一致，见 §7 |

**一句话**：给会话框加了一个「文档 + 笔」的小按钮——点一下把散乱的一句话拆成 Markdown 要点列表，**一个字都不改**；再点一下原样退回。整个过程本地完成，不联网、不调模型、不花钱。

## 1. 需求拆解：四个硬约束

用户提了四问，这里先答，因为它们决定了后面所有设计：

| 问 | 答 |
| -- | -- |
| 功能能否实现？ | **能**，且上游已经预留了插槽，**不需要改上游 ui-conversation 一行代码** |
| 有无风险和问题？ | 有三处可控风险，见 §5；都已在本批内解决或明确降级 |
| 最优方案是什么？ | 见 §3：本地确定性规则 + 显式按钮 + 单格可逆快照 |
| 是否需要隐式调用大模型？ | **不需要**，而且**不应该**。见 §2 |

用户的硬约束是「**不能修改客户的用意，不能私自增加私活**」。这条约束直接否掉了「调模型润色」这条路——模型润色必然改词、必然可能添词。

## 2. 核心决策：不隐式调用大模型

**结论：不调用。格式化是本地确定性规则。**

理由不是「省事」，而是这条功能本身就是用户约束的必然推论：

1. **不改用意 ⇒ 必须是规则，不能是生成**。模型会改词；规则只加结构。需求写的是「不能修改客户的用意」，那么实现就必须**在结构层面工作、��内容层面零动作**。
2. **不私加私活 ⇒ 不能有模型补白**。模型看到「包括 A、B、C」很容易"贴心地"补一句「需要我帮你实现吗？」——这就是私活。规则不会。
3. **隐式调用 = 用户不知情的副作用**。点一下「美化」结果悄悄花了一次模型调用（钱、延迟、网络），这是产品不该藏起来的东西。真要上模型，必须是**另一个显式入口**：用户主动点、有 diff 预览、有确认、失败保留原文。

本批采用的规则集（`draft-format.ts`，纯函数、零依赖）：

| 规则 | 作用 | 不动什么 |
| ---- | ---- | ---- |
| 归一化 | 统一换行、去行尾空白、折叠连续空行 | 不改任何字 |
| 保留结构 | 已有围栏代码块 / 标题 / 列表 / 引用 / 表格原样保留 | 不重排既有块 |
| 长段切分 | 超过 2 句或 200 字的段落按句切 | 只切，不写 |
| 要点化 | 整行都以句末标点收尾的短行 → `- ` 列表 | 只加 `- ` |
| 枚举展开 | 引导词 + 顿号枚举 → 引导词单独成行 + 列表 | 逗号被列表结构消费，词全留 |
| 代码围栏 | 英文错误行 / 栈帧 / 含 `;{}` `=>` `()` / Windows 路径 → 包进 ``` | 只加围栏 |

**含 CJK 的行永不判为代码**——中文句子常含括号和分号，用英文启发式会把中文误包成代码块。

这套规则的代价也要讲明白：**它只做「排版」，不做「改写」**。它不会把「A和B有冲突」改成「A 与 B 存在冲突」，也不会把口语化的句子改得更正式。这正是我们要的——「让用户把问题讲清楚、有条理」里的「有条理」由 Markdown 结构提供，「讲清楚」由作者自己讲。

## 3. 落点：用上游预留的插槽，不改上游

调研结论（上游事实）：

| 事实 | 位置 |
| ---- | ---- |
| 插槽 `conversation.input.right`（"Compact controls before the composer submit action"），`scope: 'session'`，standard props 17 项（含 `useInput` / `inputActions`），occupants 为空 | `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts:1477-1533` |
| `renderSlot('conversation.input.right', {})` 在 `.standardControls` 内、模型选择与发送按钮之前 | `packages/client/ui-conversation/src/client/skeleton/InputBar.tsx:491-497` |
| 读草稿 `useInput(s => s.draft)` / 写草稿 `inputActions.setDraft(text)` | `packages/client/ui-conversation/src/client/contract/input.ts:258-309` |
| `setDraft` 以纯文本整体替换 | `packages/client/ui-conversation/src/client/input/facade.ts:226-241` |

【变更】`packages/client/ui-baf-desktop/src/client/index.ts` 注册插槽：

```ts
ctx.slots.inject('conversation.input.right', () =>
  ctx.slots.register({ name: 'conversation.input.right', id: 'draft-format', order: 0, locale: NS }, DraftFormatButton))
```

**往返无损**：编辑器投影里每行 = 一个 Lexical 段落，段落间只贡献**一个** `\n`（`input/editor/projection.ts`），`$appendParagraphs` 也按 `\n` 切段（`input/editor/runtime.ts:52-60`）。所以 `setDraft(text)` → 显示 → 再读回是等价的，格式化后的 Markdown 不会被编辑器吃掉结构。

## 4. 控件与视觉

【新增】`DraftFormatButton.tsx` + `DraftFormatButton.module.css`：

- **28×28 幽灵图标按钮**，占位在模型选择与发送按钮之前（与上游 `.standardControls` 同排）。
- **三态**：`format`（美化，文档+笔字形）/ `revert`（回退，金色发丝边 + 刷新字形）/ 闪烁「无需调整」（勾字形，1.8 s）。
- 字形用 **`list-pen-outline`（文档 + 笔）**。最初用的是 `enhance-outline`，渲染出来是「递减的四条横线」，语义偏弱（像"对齐"）；换成文档+笔才真的读作「把这几行整理一下」。**刻意不用 `sparkle`**——闪光字形在用户心智里等于「AI 魔法」，而本功能明确不调模型，用它就是骗人。
- **金色是本地 token**（`--baf-accent`）：亮色 `#8a6d12`、暗色 `#d9b64c`。平台 `brand-primary` 是中性墨色不是色相，BAF 金只能自带；暗色取亮端是因为金箔在深底上要靠亮度读。
- **回退是单格快照**：快照以 `inputActions` 身份绑定会话（切会话自动失效）；用户美化后又编辑，tooltip 改成「还原美化前的原文（会丢弃美化之后的修改）」，明确告知再执行。
- `mousedown` 里 `preventDefault()`，保住输入框光标。
- 阻塞态（草稿含 @ 文件引用）保持可见但 `opacity: 0.55` + `cursor: default`，tooltip 说明原因。

【变更】`packages/client/ui-baf-desktop/src/client/locales.ts` 新增 7 个键（zh/en），其中 `draft.format.hint` =「按 Markdown 整理结构，不改写你写的字」——这句话同时是**承诺**和**tooltip**。

## 5. 风险与问题（本批实际处理的）

| # | 风险 | 处置 |
| -- | ---- | ---- |
| 1 | **`setDraft` 会丢 inline 引用 chip** | 上游注释明写 `setDraft` 会移除 inline 引用。本批取 `InputState.occurrences.length`，**含 @ 文件引用时拒绝格式化**，按钮保持可见但阻塞并用 tooltip 说明原因。要真支持需扩展上游 `InputActions` 增加文档级 setDraft（属上游 API 变更），**留作后续批次**，本批不擅自改上游 |
| 2 | **规则误判中文为代码块** | 引入 CJK 判据：含中文字符的行永不判为代码 |
| 3 | **回退丢失用户在美化之后的编辑** | tooltip 提前说明「会丢弃美化之后的修改」；回退是单格快照，不做多级历史（多级历史会让"回退"语义发飘） |
| 4 | 上游接口变更导致失效 | 只用上游**已预留**的插槽与**已公开**的 `InputActions`，不新增、不修改上游 API |

## 6. 门禁与真机验证

### 6.1 单测与静态检查

| 门禁 | 结果 |
| ---- | ---- |
| `vitest run packages/client/ui-baf-desktop` | **35 passed**（格式化器 24 + 组件 11） |
| `tsc -b packages/client/ui-baf-desktop/tsconfig.json --force` | **0 错** |
| 覆盖率（仅两个新增源文件需 100%） | `draft-format.ts` / `DraftFormatButton.tsx` **statements / branches / functions / lines 均 100%** |
| `oxlint`（本包） | 新增文件 **0 告警**；仅 `bridge.ts` 5 条**上游基线债**（本批未改动该文件） |
| `verify-client-ui-i18n` | **33 条**，与批次二十一基线完全一致；本批新增文件 **0 条** |
| `verify-translation-pairing` | 整仓 32 条**基线既有**（上游 `code-runtime` / `e2b` / `experimental` 等包缺 `.i18n.yaml`）；本批的 `ui-baf-desktop` README 三件套**未被标记**。本批新增的 Agent Note 与**批次二十一那条同款标记**（全仓 18 条 BAF note 同此形状，属既有约定） |
| `pnpm run build` | **10 passed / 0 failed / 0 skipped**（含 Web build） |

### 6.2 web 端真机探针（`probe-batch22-web.mjs`，28 项断言全 PASS）

探针证明的是**行为**与**视觉**，不是"代码看起来对"：

| 断言组 | 实测 |
| ---- | ---- |
| 落点 | 控件挂在会话框；`data-baf-draft-format="format"`；`aria-label` = 「美化」；**排在发送按钮之前**；28×28 |
| 亮色 | 会话框卡片内 **0 个近黑平面**（无黑盒）；控件前景 `rgb(129,133,140)` |
| 写入 | 用**真实指针事件**聚焦编辑器后 `Input.insertText` 写入「包括用户信息模块、权限模块、订单模块」，读回一致 |
| 整理 | 草稿变成 `包括：\n\n- 用户信息模块\n\n- 权限模块\n\n- 订单模块`；引导词「包括：」保留 |
| **完整性** | 逐字比对：作者原句的每一个字都在整理结果里（`missing: []`）——**只允许多出 Markdown 标记，不允许丢字/改字** |
| 回退 | 再点一次原文原样回来；控件变回 `format` |
| tooltip | 「按 Markdown 整理结构，不改写你写的字」 |
| 暗色 | 整张会话框卡片 **0 个白盒**；控件存活 |
| 暗色对比度 | 回退态金色字形 `rgb(217,182,76)` 对卡片 `rgb(44,44,46)` = **7.13:1**（≥4.5:1） |

探针方法学上的两个坑（都记在这里免得下批再踩）：

1. **后台标签页会被 Chrome 冻结**——页面内的 `setTimeout` 可能永不触发。探针因此**一律不在页面里等待**，所有等待放 Node 侧；每次 CDP 调用带 15 s 超时；开页前 `Page.setWebLifecycleState {state:'active'}`。
2. **会话框草稿持久化在 localStorage**（键 `dsh.conversation`）——上一轮跑完留下的「已排版草稿」会被本轮当成新写入的草稿。探针开局 `localStorage.clear()` + `Page.reload()`。
3. `document.execCommand('insertText')` 在没有真实指针焦点时不生效；必须先 `Input.dispatchMouseEvent` 点一下编辑器。

截图（`overlay/scripts/out/batch22-*.png`）：亮色会话框 / 亮色整理后 / 亮色 tooltip / 暗色会话框 / 暗色回退态 / 四张控件放大对照（`batch22-state-{light,dark}-{format,revert}.png`）。

## 7. 版本与产物

- 桌面版本 **0.0.45 → 0.0.46**（`overlay/desktop/VERSION` + `package.json` + `version-notes.json` + `overlay/docs/release/version-map.md` 四处同步）。
- 产物：`overlay/desktop/dist/win-unpacked/baf-dsh.exe`（**免安装目录，204,592,128 字节，不产安装包**）。

**exe 冒烟**（`probe-batch22-exe.mjs`，冷 profile）：**25 项断言全 PASS，`fail: []`，`skipped: []`**

| 层 | 实测 |
| -- | ---- |
| splash | 版本徽标实测 `v0.0.46`（左下角 x=52 / y=238）；5 s 前按钮 `opacity: 0` + `pointer-events: none`；5 s 那一帧「后台启动」按钮与「首次启动耗时较久，请耐心等待…」同帧出现（按钮右上角 x=248 / y=45、图标 3 条 path） |
| 点击后台启动 | splash 隐藏（`hidden: true` / `state: hidden`），主进程记下 `splash-bg-start` |
| 主窗口 | 实测可达 `http://127.0.0.1:6576/?token=…` |
| 启动时序 | `app-ready → splash-shown → dsh-spawn → splash-bg-start → dsh-ready → splash-closed → main-shown → main-load-url`（`splash-bg-start` @ 6710 ms，`dsh-ready` @ 52014 ms） |

**随包字节核对**（app.asar 只有 Electron 壳，客户端包在 `resources/dsh/node_modules/@deepseek-ai/*` 下）：12 项判据全中——`data-baf-draft-format`、`conversation.input.right`、`draft-format`、`draft.revert`、`draft.format.hint`、`formatDraft`、`包括`、亮色金 `#8a6d12`、暗色金 `#d9b64c`、`baf-accent`、主题词表 `--dsw-alias-bg-canvas`、工作流侧暗色金 `#d9b64c`；随包 `dsh-client-ui-baf-desktop/lib/client.js` **83,979 字节**，与仓库构建产物 **SHA-256 逐字节一致**（`5ED34935…C6A8368F`）——即 exe 里跑的就是源码构建出来的那份。

**桌面 exe 内的功能核验**（`overlay/scripts/probe-batch22-exe-ui.mjs`，连上 exe 自己的主窗口）：**11 项断言全 PASS，`fail: []`，`skipped: []`**

| 断言 | 实测 |
| ---- | ---- |
| 外壳 | 打包应用主窗口挂载成功，侧边栏工作区（demo1 / 重构ecum模块 / demo50 / demo-protect / 未分组）加载 |
| 控件 | `[data-baf-draft-format]` 存在，`aria-label` = 「美化」，字形 = `dsw-icon-list-pen-outline-medium`，尺寸 28×28 |
| 写入 | 真实指针事件聚焦编辑器 + `Input.insertText` 写入「包括用户信息模块、权限模块、订单模块」，读回一致 |
| 整理 | 草稿变成 `包括：\n\n- 用户信息模块\n\n- 权限模块\n\n- 订单模块` |
| 回退 | 控件随即变为「回退」（`state=revert`、`aria-label=回退`）；再点一次原文原样回来，控件变回 `format` |

这一层的价值在于：字节核对只能证明"代码在包里"，这一层证明"**它在桌面应用里活着并且能用**"。截图 `overlay/scripts/out/batch22-exe-composer-tidied.png`（桌面应用内整理后的会话框，金边回退按钮清晰可见）与 `batch22-exe-composer-reverted.png`。

> 探针踩坑记录：打包应用启动后**先是一片空**——工作区列表与输入框槽位 occupants 要晚一拍才挂上。第一版探针只等外壳就查询，于是把"还没挂上"读成了"没有这个控件"。正确做法是**轮询控件本身**（`[data-baf-draft-format]` 出现即停），而不是等固定时长或只等外壳。

## 8. 遗留问题

1. **含 @ 文件引用的草稿仍不能整理**（§5.1）。要支持需扩展上游 `InputActions` 增加文档级 `setDraft`——属上游 API 变更，需单独一批并按仓库惯例走升级指南。
2. **规则不做语义改写**。这是刻意的（§2），但如果客户以后要「顺手把话写得正式一点」，那是**另一个功能**，必须是显式入口、要有 diff 预览、失败要保留原文。
3. **本批未 bump 客户端包版本**。`ui-baf-desktop` 跟随 dsh 发行列车（当前 0.1.5-alpha.1），单独 bump 会与上游列车脱节。
