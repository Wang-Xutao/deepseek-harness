# 批次二十三（2026-10-25）：会话框控件字形同族化 + tooltip 改名「格式化输入」 — desktop 0.0.47

> 需求原句：`修改，/design-master` 1. 恢复按钮图标样式要和美化按钮保持风格一致；2. 按钮的 hover 文字改为「格式化输入」。

批次二十二交付后客户回看 exe 提出的两条修改。两条都不是功能问题，是**观感与措辞**：控件的两态摆在一起像两个产品，按钮的 hover 文案说的是原理而不是动作。

## 0. 结论速览

| # | 事项 | 落点 | 状态 |
| -- | ---- | ---- | ---- |
| 1 | 回退图标与美化图标风格一致 | `packages/client/ui-primitives/src/icons/artwork.ts` 新增 `undo-doc-outline` | ✅ 平台补一枚缺失字形：同一张文档体，把笔换成实心 ← 箭头；两态读作同一个物件的两个注解 |
| 2 | hover 文字改为「格式化输入」 | `packages/client/ui-baf-desktop/src/client/locales.ts` | ✅ `draft.format.hint`：zh「按 Markdown 整理结构，不改写你写的字」→「格式化输入」；en → "Format the input" |
| 3 | web 端真机验证（亮色 + 暗色） | `overlay/scripts/probe-batch23-web.mjs` | ✅ **30 项断言全 PASS，`fail: []`**（新增两项字形断言） |

**一句话**：两态不再是「一支笔」和「一个圆弧箭头」——而是**同一张文档**，一支笔在整理、一支箭头在退回。

## 1. 诊断：问题不在"图标不好看"，在"它们不是一套"

先量后改。把平台 97 枚字形按构造拆开看，发现两个态根本不在一个绘制语言里：

| 态 | 字形 | 构造 | 视觉 |
| -- | ---- | ---- | ---- |
| 美化 | `list-pen-outline` | 文档环（**实心填充路径带孔**）+ 两条描边文本线 + 实心笔 | 直角、密、实 |
| 回退 | `refresh-outline` | 两段**1.3px 细描边**圆弧 | 圆形、疏、飘 |

一个实心、一个细线；一个直角、一个整格圆弧。放在同一条工具栏里，**观感像两个产品做的**。

更糟的是语义：`refresh-outline` 在本产品里**一律表示"重试 / 刷新"**（插件版本检查、附件重载、插件更新），从来没用它表示"撤销"。所以上一批不只是风格不搭，**连词都借错了**。

## 2. 方案选择：为什么不直接换一个现成字形

先把平台现成的候选摊成一张对比表（12 枚字形 × 亮暗两套底色 × 14/28px 实尺），逐一判：

| 候选 | 判 |
| -- | -- |
| `browse-outline`（文档+横线） | 14px 下与美化态**几乎看不出区别**（只少了笔）——状态差异消失，用户不知道按钮变了。否决 |
| `right-up-outline` | 读作"导出/跳到别处"，语义反了。否决 |
| `edit-outline` | 读作"编辑"，语义反了。否决 |
| `compare-split-outline` | 读作"分屏/对比"，语义偏。否决 |
| `refresh-outline` | 圆弧、细线、语义是重试。否决（现状） |
| `chevrons-up-down-outline` | 读作"排序"。否决 |
| 曲线 ↺ 箭头（自绘） | 实测渲染成一坨圆顶，几何失败。否决 |

结论：**现成字形里没有一个既同族又对词**。正确解不是"挑一个最像的"，而是**补一枚对的**。

## 3. 做法：给平台补 `undo-doc-outline`

【变更】`packages/client/ui-primitives/src/icons/artwork.ts` 新增字形 `undo-doc-outline`：

- **文档体逐字复用平台自己的 path**（`browse-outline` 那一段）——不是描一个近似矩形，是平台自己的文档轮廓。
- 文本线沿用平台的描边线（与 `list-pen-outline` 的两条线同一语言）。
- **注解换成实心向左箭头**（两条填充 path：箭杆 + 三角头），与美化态的实心笔同一语言。

于是：

```
美化态：  文档 + 文本线 + 笔      list-pen-outline
回退态：  文档 + 文本线 + ← 箭头   undo-doc-outline   ← 同一张文档
```

字重、填充语言、包围盒、文档轮廓全部一致，**只有注解不同**。

【变更】`packages/client/ui-primitives/src/icons/index.tsx` 导出 `IconUndoDocOutlineRegular` / `IconUndoDocOutlineMedium`。字形随 `ICON_SYMBOLS` 自动进入 ui-theme 的图标 sprite（`<symbol id="dsw-icon-undo-doc-outline-medium">`），**主题仍可替换它**，不需要在 BAF 侧自己画 SVG。

> 为什么放平台而不是放 BAF 包里：文档体是**平台几何**，fork 进 BAF 会随上游演进而静默漂移；放平台则兄弟字形相邻、sprite 流程免费、主题可替换。这与批次二十一补 `--dsw-alias-*` 词表是同一类判断——**客户端在用的东西，平台里却没有，就该补平台**。

## 4. 文案：hover 文字改「格式化输入」

【变更】`packages/client/ui-baf-desktop/src/client/locales.ts`：

| 键 | 改前 | 改后 |
| -- | ---- | ---- |
| `draft.format.hint`（zh） | 按 Markdown 整理结构，不改写你写的字 | **格式化输入** |
| `draft.format.hint`（en） | Arrange the draft as Markdown structure without changing your words | **Format the input** |

只改**美化态**的 hover 文案。回退态保持原样（「还原美化前的原文」/「还原美化前的原文（会丢弃美化之后的修改）」）——那一侧必须说清后果，笼统一句"回退"反而会让人误以为无脑点击无损。

原文案「不改写你写的字」是这个功能最该被看见的承诺（它就是"不调模型、不改词"的对外说明），所以本批**没有删它**：承诺改写进 README 的功能说明与 Agent Note，hover 文案让位给动作名。

## 5. 门禁与真机验证

| 门禁 | 结果 |
| ---- | ---- |
| `vitest run packages/client/ui-baf-desktop` | **36 passed**（新增 1 例：锁定「格式化态 = list-pen、回退态 = undo-doc」的字形对） |
| `vitest run packages/client/ui-primitives/tests/icons.client.spec.tsx packages/client/ui-theme/tests/icon-sprite.client.spec.ts` | **549 passed**（含新增 1 例：锁定 undo 字形复用平台文档体、文本线描边、箭头实心） |
| `tsc -b`（ui-primitives + ui-baf-desktop） | **0 错** |
| `oxlint`（两包） | 新增/改动文件 **0 告警**（`ui-baf-desktop/src/client/bridge.ts` 5 条为上游基线债，本批未触碰） |
| `pnpm run build` | **10 passed / 0 failed / 0 skipped** |
| 平台图标数量断言 | 96 → **97** 枚（导出 192 → 194 个），`icons.client.spec.tsx` 同步 |

**web 端真机探针**（`probe-batch23-web.mjs`）：**30 项断言全 PASS，`fail: []`**

| 断言组 | 实测 |
| ---- | ---- |
| 字形（新增） | 美化态 `data-icon = dsw-icon-list-pen-outline-medium`；回退态 `dsw-icon-undo-doc-outline-medium` |
| tooltip（改后） | 文案实测「**格式化输入**」 |
| 其余 | 位置、28×28、亮色无黑盒、暗色无白盒、暗色回退金色对卡片 **7.13:1**、逐字完整性 `missing: []`、回退还原原文——全部沿用批次二十二的判据且仍全绿 |

### 探针方法学：隐藏标签页的 tooltip 读不到

第一版探针在 tooltip 一项上读到**空串**。查下来不是产品缺陷：

- 无头浏览器里页面是**隐藏标签页**（`document.hidden === true`），Chrome 对隐藏页**不做布局**，`ResizeObserver` 因此不回调；
- Tooltip 的气泡在拿到尺寸前一直是 `visibility: hidden`（`Tooltip.tsx` 的 `fit()` 才把它置为 visible）；
- 而 `innerText` 对不可见元素返回**空串**——`textContent` 才是真值。

探针改成：hover 前先 `Page.bringToFront` 把页面置前，读 `textContent` 而不是 `innerText`。这是一条通用教训：**隐藏页面上不要用 `innerText` 断言文案**。

## 6. 版本与产物

- 桌面版本 **0.0.46 → 0.0.47**（`VERSION` + `package.json` + `version-notes.json` + `version-map.md` 四处同步）。
- 产物：`overlay/desktop/dist/win-unpacked/baf-dsh.exe`（**免安装目录，204,592,128 字节，不产安装包**）。

**exe 冒烟**（`probe-batch23-exe.mjs`，冷 profile）：**28 项断言全 PASS，`fail: []`，`skipped: []`**

| 层 | 实测 |
| -- | ---- |
| splash | 版本徽标实测 `v0.0.47`（左下角 x=52 / y=238）；5 s 前按钮 `opacity: 0` + `pointer-events: none`；5 s 那一帧「后台启动」按钮与「首次启动耗时较久，请耐心等待…」同帧出现（右上角 x=248 / y=45、图标 3 条 path） |
| 点击后台启动 | splash 隐藏（`hidden: true`），主进程记下 `splash-bg-start` |
| 主窗口 | 实测可达 `http://127.0.0.1:3176/?token=…` |
| 启动时序 | `app-ready → splash-shown → dsh-spawn → splash-bg-start → dsh-ready → splash-closed → main-shown → main-load-url` |
| 随包字节 | 16 项判据全中，含**本批新增的四项**：`IconListPenOutlineMedium`、`IconUndoDocOutlineMedium`、`格式化输入`、`draft.format.hint` |

**桌面 exe 内的功能核验**（`probe-batch23-exe-ui.mjs`，连上 exe 自己的主窗口）：**12 项断言全 PASS，`fail: []`，`skipped: []`**

| 断言 | 实测 |
| ---- | ---- |
| 控件 | `[data-baf-draft-format]` 存在，`aria-label` = 「美化」，字形 = `dsw-icon-list-pen-outline-medium`，28×28 |
| 整理 | 真实指针聚焦写入「包括用户信息模块、权限模块、订单模块」→ 草稿变成 `包括：\n\n- 用户信息模块\n\n- 权限模块\n\n- 订单模块` |
| 回退 | 控件随即变为「回退」，字形实测 **`dsw-icon-undo-doc-outline-medium`**（新字形在桌面应用里确实渲染出来了）；再点一次原文原样回来 |

随包 `dsh-client-ui-baf-desktop/lib/client.js` **83,894 字节**，与仓库构建产物 **SHA-256 逐字节一致**（`C8F8FCC3…09FDA5`）——exe 里跑的就是源码构建出来的那份。

## 7. 遗留问题

1. **平台图标集从此多了一枚 BAF 引入的字形**。`undo-doc-outline` 是本批为 BAF 控件补进 `ui-primitives` 的，方向上更合理的是上游自己拥有它（它是通用字形）。下次同步上游时可以顺手提一个 PR 收回；在此之前合并上游只需处理一处**新增条目**，冲突面极小。
2. **回退态仍是单格快照**，多级撤销没做（批次二十二已记录）。
3. **含 @ 文件引用的草稿仍不能整理**（批次二十二遗留，需扩展上游 `InputActions`）。
