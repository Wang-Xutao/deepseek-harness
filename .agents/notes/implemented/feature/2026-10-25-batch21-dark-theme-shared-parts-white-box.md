# 批次二十一（2026-10-25）：暗色模式「共享部件白底」根治 + 亮暗双主题真机核验 — desktop 0.0.45

> 需求原句：`/frontend-design-master` 修改优化暗色模式共享部件白底的问题，需要打开 web 端查看是否正常美观，亮色暗色都要兼顾。

这条需求是批次二十自己留下的欠账：批次二十的《遗留问题 §8.2》写明「详情工作区在暗色主题下与共享部件存在色差……暗色主题的完整对齐留待下一批」。本批把它还掉。

## 0. 结论速览

| # | 事项 | 落点 | 状态 |
| -- | ---- | ---- | ---- |
| 1 | 暗色模式共享部件白底 | `packages/client/ui-theme/src/styles/design-platform.css` | ✅ **根因修**：主题平台补齐 14 枚客户端一直在用、平台却从未定义的 `--dsw-alias-*` 别名（亮暗双份），一次点亮 10 个包 432 处使用 |
| 2 | BAF 金色品牌随主题 | `ui-baf-workflow` 5 个 CSS + `ui-settings-baf-standard` | ✅ 金色改为**本地 token 并给出暗色半值**（#c9a227 → #d9b64c）；五处页面共用同一套 `--wf-*` / `--qf-accent` 词表 |
| 3 | 亮色 / 暗色都兼顾 | `ui-baf-tracegraph` / `ui-baf-workflow` / `ui-settings-baf-standard` | ✅ 追踪图保留自有靛紫品牌但改为亮暗双值；确认门问答弹窗金面文案改为固定深墨；状态色按文案对比度重新定档 |
| 4 | web 端真机验证 | `overlay/scripts/probe-batch21-web.mjs` | ✅ **37 项断言全 PASS，`fail: []`**；六个界面（会话工作流图 / 会话测试流图 / 确认门 / 测试流 / 变更总览 / 变更详情工作区）双主题逐帧审查通过，8 张截图 |

**一句话**：暗色下的 BAF 界面从「深色页面里浮着白盒子」变成一套完整的暗金仪表台——画布是地面（#151517），卡片是抬升面（#2c2c2e），金箔是材质，文字是浅墨。

## 1. 根因：不是"暗色没做"，是"暗色被兜底链吃掉了"

批次二十的共享部件（`FlowCanvas` / `ArtifactRail` / `StageChecklist` / `BilingualDetail`）在暗色下仍是白底。读代码看到的不是"忘了写暗色样式"，而是**客户端 CSS 写的 token 平台根本没有**：

```css
/* 批次二十的原样 */
--wf-card: var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-canvas, #fff));
--wf-ink:  var(--dsw-alias-text-primary, #1f2937);
--wf-line: var(--dsw-alias-border-subtle, #d7dee8);
```

`--dsw-alias-bg-elevated` / `--dsw-alias-bg-canvas` / `--dsw-alias-text-primary` / `--dsw-alias-border-subtle` 这些名字在 `design-platform.css` 里**一个都不存在**（该文件定义了 411 个 token，这四个不在其中）。于是每一处 `var(未知token, 浅色字面量)` 都稳定落回那个浅色字面量——**亮色下看起来完全正常，暗色下原形毕露**。

写一个审计脚本把这件事量化（`tmp/b21-token-debt.mjs`）：

| 口径 | 修之前 | 修之后 |
| ---- | ------ | ------ |
| 客户端 CSS 用到、主题未定义的 token 种类 | **45 种** | 33 种 |
| 受影响文件数 | **432** | 180 |
| 其中 BAF 十个包（workflow / tracegraph / settings-baf-*） | 228 处 | 0 处（除字体类 token） |

这是**典型的"token 债"**：客户端作者按直觉写了一个语义合理的别名，平台没定义，于是每个调用点各自用一条浅色兜底链兜住——单看每一处都"有兜底、不会崩"，合起来就是暗色主题整片失守。

## 2. 修法（一）：平台补词表，而不是十个包各写各的

【变更】`packages/client/ui-theme/src/styles/design-platform.css` 新增 14 枚别名，亮色写进 `body {}` 块、暗色写进 `body[data-ds-dark-theme] {}` 块：

| 别名 | 亮色 | 暗色 |
| ---- | ---- | ---- |
| `bg-canvas` | bluish-60 `#f5f6f7` | bluish-950 `#151517` |
| `bg-elevated` / `bg-primary` | bluish-00 `#ffffff` | bluish-850 `#2c2c2e` |
| `text-primary` | bluish-1000 `#0f1115` | bluish-50 `#f9fafb` |
| `text-secondary` | bluish-700 `#61666b` | bluish-300 `#cfd3d6` |
| `text-tertiary` | bluish-600 `#81858c` | bluish-400 `#adb2b8` |
| `text-success` | green-500↔green-900 55% `#228748` | green-400 `#4ed17e` |
| `text-danger` | red-600↔red-900 85% `#d61212` | red-400↔白 82% `#f4716b` |
| `text-warning` | amber-600↔amber-900 55% `#8b5a25` | amber-400 `#f7ad31` |
| `text-info` | blue-600 `#2563eb` | blue-400 `#60a5fa` |
| `border-subtle` | bluish-1000 14% | 白 14% |
| `border-strong` | bluish-1000 24% | 白 24% |
| `state-danger-label` | 同 danger | red-400 |
| `attention` | amber-600↔amber-900 62% | amber-400 |

两条取值原则：

1. **暗色的层级是反过来的**。亮色是"白卡片压在浅灰画布上"（卡片 = `#fff`，画布 = `#f5f6f7`）；暗色必须换成"深画布托着抬升卡片"（画布 = `#151517`，卡片 = `#2c2c2e`）。用同一组名字、不同的方向，是让同一段 CSS 在两个主题里都成立的关键。
2. **状态色分"标记级"与"文案级"**。平台原来的 `state-*-primary` 是**标记色**（绿 500 / 红 600 在白底上只有 2.4:1 / 4.5:1，做正文不够），文案级另起一档并混向自身深端或白端：亮色成功 4.54:1 / 危险 5.31:1 / 警告 5.85:1；暗色成功 7.13:1 / 危险 4.82:1 / 警告 7.28:1（均在卡片面上实测）。

## 3. 修法（二）：BAF 金色是产品自己的品牌，平台没有品牌色

设计平台的 `--dsw-alias-brand-primary` 是**中性墨色**（亮色近黑、暗色近白），不是色相——所以"品牌金"不可能从平台借到。批次二十的写法是借一个不存在的 token：

```css
--wf-accent: var(--dsw-alias-border-brand, var(--dsw-alias-text-brand, #c9a227));
```

【变更】改为**本地 token 直接写死**，并给出暗色半值：

```css
.root { --wf-accent: #c9a227; }
:global(body[data-ds-dark-theme]) .root { --wf-accent: #d9b64c; }
```

暗色半值抬亮 14%，是因为金箔在深底上要靠**亮度**而不是对比来读——金 `#c9a227` 在 `#151517` 上是 7.4:1，够读，但作为"发丝边 / 焦点辉光 / 品牌块"的发光材质会偏闷；抬到 `#d9b64c` 后在画布上 9.33:1、在卡片上 7.13:1，金箔才真的像金属。

这套 `--wf-*` 词表现在由**五个页面共用**：会话工作流图 / 会话测试流图 / 变更总览台账 / 确认门 / 企业规范流程图（`--qf-accent`）。

【变更】顺手收掉一处**语义漂移**：会话侧的「停靠门」用 `--wf-gate: var(--dsw-alias-text-warning, #7c5cff)`（紫色），变更详情工作区用 `--wf-gate: var(--dsw-alias-state-warn-primary, #7c5cff)`（琥珀）——**同一个含义、两个 token、两种颜色**，而且都不随主题切换。本批统一为 `--dsw-alias-text-warning`（琥珀），BAF 面上最后一处紫色随之消失（批次十九的注释里本就写着「紫色不是平台 token」）。

## 4. 修法（三）：追踪图保留靛紫，但给它亮暗两半

追踪图是另一个界面，自有靛紫品牌（GitHub 紫）。它原先同样借那个不存在的 `--dsw-alias-text-brand`，颜色是冻结的 `#8250df` 兜底。紫色在深底上只有 3.7:1，小字偏弱。

【变更】改为本地 `--tg-brand`：亮色 `#8250df`、暗色 `#a78bfa`（6.8:1），表面与描边随主题。

## 5. 探针方法学：扫整棵 DOM，而不是抽查几个颜色

【新增】`overlay/scripts/probe-batch21-web.mjs`。抽查颜色会漏——所以探针在每个 BAF 界面上**扫描整棵 DOM**：

- **暗色**：任何"不透明且接近白"的**面板级**平面（面积 ≥ 1200px²）都判为白盒，必须为 0；小于该面积的白色小件（开关滑块、状态点）单列为 pip，不算缺陷——暗色下的白钮深轨是正确设计，不是白盒。
- **亮色**：任何"不透明且接近黑"的平面判为黑盒，必须为 0（这是暗色那一侧检查的镜像）。
- 同时实测共享卡片的**表面色 / 文字色 / 对比度**、卡片与画布的**亮度台阶**（抬升必须看得出来）、页面内**金色元素计数**。

37 项断言实测结果：

| 界面 | 主题 | 实测 |
| ---- | ---- | ---- |
| 会话工作流图 | 亮 | 共享卡片 `rgb(255,255,255)`、对比度 **18.9:1**、金色元素 48 处、无黑盒 |
| 会话工作流图 | 暗 | **零白盒**、共享卡片 `rgb(44,44,46)`（亮度 0.0253）抬升在画布 `#151517`（亮度 0.0076）之上、对比度 **13.34:1**、金色元素 47 处 |
| 会话测试流图 | 暗 | 零白盒 |
| 确认门 | 暗 | 零白盒 |
| 测试流（工作流页） | 暗 | 零白盒 |
| 变更总览台账 | 暗 | 零白盒、金色元素 8 处 |
| 变更详情工作区 | 暗 | **零白盒**、共享卡片 `rgb(44,44,46)`、对比度 13.34:1、共享流程图 **11 个节点、0 个白节点卡** |
| 变更详情工作区 | 亮 | 共享卡片回到 `rgb(255,255,255)`、对比度 18.9:1、无黑盒（亮色零回归） |

截图（`overlay/scripts/out/batch21-*.png`，8 张）：会话工作流图亮/暗、会话测试流图暗、确认门暗、测试流暗、变更总览暗、变更详情工作区亮/暗。逐帧审查结论：暗色是完整的"暗金仪表台"（深底 + 金边 + 抬升面 + 浅墨字），亮色与批次二十的已验证外观一致，无退化。

## 6. 门禁实测

| 门禁 | 结果 |
| ---- | ---- |
| `vitest run packages/client/ui-baf-workflow packages/client/ui-baf-tracegraph` | **16 文件 / 110 例全绿** |
| `tsc -b packages/client/ui-baf-workflow/tsconfig.client.json --force` | 0 错 |
| `pnpm run build` | **10 passed, 0 failed, 0 skipped** |
| `oxlint`（整仓） | 失败，但**全部落在本批未改动的 .ts/.tsx 上**（上游合并带入的基线漂移，见 §8.2）；本批改动的 8 个 CSS 文件 0 错（oxlint 不看 CSS） |
| `verify-client-ui-i18n` | 33 条**全为基线既有**（与批次二十同数），本批 0 处 |
| `verify-no-unknown-casts` | 失败项全在未改动文件（同样为上游合并的基线漂移），本批 0 处 |

## 7. 本批踩到的真问题

1. **「有兜底」不等于「兜底会生效」**。`var(--不存在的token, #fff)` 在 CSS 里不是"用 #fff"，而是**整条声明在计算值阶段失效**——`background-color` 退回 `transparent`、`border` 整条不生效。所以那些"看起来有兜底"的调用点，暗色下的实际表现比代码字面更糟：`border: 1px solid var(--dsw-alias-border-subtle)` 在暗色下**根本没有边框**（不是"浅色边框"，是"没有边框"）。这解释了追踪图在暗色下卡片边界全无的现象。
2. **同一个平台文件里，静态色板在亮暗两块各写一遍**（`body {}` 与 `body[data-ds-dark-theme] {}` 各有一份 `--dsw-static-*`）。写别名时必须想清楚自己引用的是哪一块的静态值——比如 `bluish-60` 在亮色块是 `#f5f6f7`、在暗色块是 `#f9fafb`。
3. **暗色下"太黑"也是一种缺陷**。第一次写探针时我把"接近黑的平面"也判为失败，结果暗色画布 `#151517` 自己被判黑。正确的判据是**层级**：卡片必须比画布亮（抬升看得出来），而不是"不许黑"。
4. **构建期 Windows 文件锁**（与批次二十同类）：`pnpm run build` 连续两次撞 `packages/experimental/inspector/lib/devtools` 的 `EPERM rename`。二分实验确认与路径长度无关、与重命名时序有关（Windows 实时扫描对刚写完的目录持句柄）：单独重跑该步骤第二次即通过，随后整仓构建十门全绿。**这不是代码缺陷，是环境噪声**。

## 8. 遗留问题

1. **暗色下仍有少量"白小件"是刻意的**：开关滑块（白钮深轨）、状态圆点。它们在探针里按 pip 单列，不是白盒，但若客户希望"暗色下连滑块都换深色"，需要动 `ui-primitives` 的 `Switch`（平台级，不属 BAF）。
2. **整仓 lint / unknown-casts / i18n 的基线漂移**：上游 master 合并（`2288bac278`）带进了两千余条类型感知告警与若干新增的 `unknown` 断言，本批按惯例只保证**本批改动文件 0 错**，没有替上游清账（清账属于上游同步议题）。
3. **追踪图的靛紫与 BAF 金**仍是两套品牌色。本批只保证两者各自在亮暗两态都成立；要不要把追踪图也收进金色体系，属于设计决策，留待客户定。

## 9. 版本与产物

- 桌面版本 **0.0.44 → 0.0.45**（`overlay/desktop/VERSION` + `package.json` + `version-notes.json` + `overlay/docs/release/version-map.md` 四处同步；0.0.44 是上游合并提交 `2288bac278` 占用的号，本批不与它抢号）。
- 产物：`overlay/desktop/dist/win-unpacked/baf-dsh.exe`（**免安装目录，204,592,128 字节，不产安装包**）。

**exe 冒烟两层全绿**：

| 层 | 结果 |
| -- | ---- |
| exe 真实窗口（`probe-batch21-exe.mjs`，冷 profile） | **30 项断言全 PASS，`fail: []`，`skipped: []`**；splash 实测 `v0.0.45`（左下角 x=52 / y=238）；**冷 profile 完整复现 5 s「后台启动」按钮块**（按钮右上角 x=248 / y=45、图标 3 条 path、提示语与按钮同帧、点击后 splash 隐藏且主进程记下 `splash-bg-start`）；主窗口实测可达 `http://127.0.0.1:12776/`；启动时序实测 `app-ready → splash-shown → dsh-spawn → splash-bg-start → dsh-ready → splash-closed → main-shown → main-load-url` |
| splash 渲染层（`probe-batch21-splash-page.mjs`） | **9 项断言全 PASS，`fail: []`**；5 s 那一帧按钮与「首次启动耗时较久，请耐心等待…」同帧出现、按钮右上角、图标 3 条 path |

**随包字节核对**（app.asar 只有 215 KB，仅 Electron 壳；客户端/宿主包在 `resources/dsh/node_modules/@deepseek-ai/*` 下）：

| 判据 | 实测 |
| ---- | ---- |
| `dsh-client-ui-theme/lib/client.js` | 含 `--dsw-alias-bg-canvas` / `-bg-elevated` / `-text-primary` / `-border-subtle` / `-text-danger` / `-state-danger-label`（139,325 字节） |
| `dsh-client-ui-baf-workflow/lib/client.js` | 含 BAF 金 `#c9a227` 与暗色半值 `#d9b64c`，以及批次二十的四区工作区 / 确认门控制台条 / 共享画布标记（471,824 字节） |
| `dsh-client-ui-baf-tracegraph/lib/client.js` | 含追踪图暗色靛紫 `#a78bfa`（115,653 字节）；页签槽位字节偏移实测 `baf-gates-overview`(103869) → `baf-standard-quality`(103965) → `baf-standard-commands`(104065)，**测试流仍在确认门与指令集之间** |
| `dsh-client-ui-settings-baf-standard/lib/client.js` | 含企业规范流程图的 `--qf-accent` |
