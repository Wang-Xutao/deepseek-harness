# 设置面四问题批次 — 版本说明分段 / 精选插件图标 / 检查更新置顶+红点 / 多模型路由方案

- 日期：2026-10-04
- 范围：Tier 2（客户端面 + 桌面壳；单进程 `build:lib:host` 在本机必 OOM——exit 134，见记忆配方；typecheck host/client/desktop 三面全绿，客户端面 tsdown 全量重打包 exit 0）
- 验证：**web 端 + 桌面端真机双端 CDP 探针**（见 §5）；ui-settings-general 33 测试绿（含 2 个新增红点用例）+ ui-settings-updates 7 测试绿 + overlay/desktop 96 测试绿
- 状态：问题 1–3 已实现并双端验证；问题 4 按客户要求交付可落地方案（`proposed/feature/2026-10-04-baf-multi-model-routing.md`），未实现

## 1. BAF DSH DESKTOP 说明分段 — `version-notes.json` + `UpdatesSection.tsx`

【变更】`overlay/desktop/version-notes.json` desktop.notesZh 由单行长块改为 5 行（标题 + ①②③④ 各一行），notesEn 同步；摘掉了内部文档指针 `详见 .agents/...`（客户可见面不该带仓库路径）。

【变更】`UpdatesSection.tsx` 新 `noteParagraphs(notes)`：按 `\n` 拆行、trim、滤空行，每行渲染一个 `<p className={css.notes}>`（原来是整串塞一个 `<p>`，`\n` 在 HTML 里不换行 → 一大坨）。

- 产物链：version-notes.json → pack-dsh.mjs `notes.desktop?.notesZh` → `overlay/desktop/resources/dsh/baf-product-versions.json`（gitignored）→ seedVersions（embed 对 bafDsh 恒胜过持久化快照）。本次手工同步了该 gitignored 工件（pack-dsh 全管线太重）；下次正式打包会自动重写。
- `/baf-version` 斜杠输出走同一 JSON，多行字符串透传，无影响。

## 2. 精选插件导航图标 — `SettingsRoot.tsx`

【变更】`navIcon('featured-plugins')` 由通用齿轮（与「通用设置」「插件市场」同款 `IconSettingsOutlineMedium`）改为 `IconPluginPinwheelOutlineMedium`——与 ui-plugin-manager 插件面板顶标同款风车语义（四叶 pinwheel，path 签名 `M7.84457/M5.12742/M8.02457/M10.7476`）。

## 3. 检查更新置顶 + 自动获取 + 红点 — `UpdatesSection.tsx` / `baf-update-dot.ts` / `SettingsRoot.tsx(+css)` / `main.ts` / `preload-desktop.ts`

【变更】操作区（检查更新按钮 + 条件出现的「更新到 x.y.z」按钮）从页尾移到 intro 之后、版本行之前（DOM 序断言 `compareDocumentPosition` 见测试）。

【变更】自动获取：挂载后读 `getLastCheckResult`，结果缺失/出错/超过 30 分钟（`AUTO_RECHECK_STALE_MS`）即静默 `checkForUpdate()`（错误吞掉不打扰）；30 分钟节流避免吃 GitHub API 限额。启动期 host 侧本就有 splash 后台检查（`promptUpdateAfterReady`）。

【变更】红点：新 hook `useBafUpdateAvailable`（`baf-update-dot.ts`）——直读 `window.bafDesktop`（DesktopClosePrefs 同款本地桥模式，避免 shell 跨插件依赖 ui-settings-updates），挂载回读 retained 结果 + 订阅 `update:checked` 推送；`.navDot` 8px 圆点、`var(--dsw-alias-text-danger, #cf222e)`（首版误写 `--dsw-alias-state-danger-label`——不存在的 token，透明无色，真机探针抓到后修正）。仅渲染在 `version-updates` 行。

【变更】推送通道：`main.ts` `update:check` handler 与 `promptUpdateAfterReady` 在拿到结果后 `webContents.send('update:checked', result)`；`preload-desktop.ts` 新 `onCheckResult(cb)` 订阅/退订。这补上了「设置弹窗关闭时推送落空、晚开拿不到状态」的缺口——晚开靠 retained 回读，开着时靠推送即时翻转（单测覆盖 up-to-date 推送熄灭红点）。

## 4. 多模型路由（问题 4）——方案交付

完整方案见 `proposed/feature/2026-10-04-baf-multi-model-routing.md`：三档（高/中/低）× 阶段映射（设计=高、实现=低、审核=中）× 自定义关键词（`escalateOnly` 只升不降），**编译成既有 `RouteProfile`**（复用企业 ceiling/能力校验/fallback/审计，不新造并行路由系统），M1 配置+服务（0.5–1d）→ M2 派单接线（1d）→ M3 设置 UI（1–1.5d）→ M4 verify 失败升级（可选 0.5d）。等待客户确认后排期。

## 5. 双端验证记录（2026-10-04 下午，全部通过）

**web 端**（`start:web` 源码直跑 3080 + 无头 Edge CDP 9200）：

- 设置弹窗打开，导航 7 行齐全；「精选插件」行 svg firstPathD=`M7.84457`、4 条 path（pinwheel 签名）；「内置插件」仍是 `M3.25`/3path、通用设置 `M8 9.75`/2path——图标确实换了不是全家换装。
- 红点 0 个（web 无桥，符合预期）；「版本与更新」页渲染 desktopOnly 文案。

**桌面端**（`electron .` 未打包，dev 回落 repo apps/cli/lib + 子进程 `--port 0`）：

- 自然态：红点 0；检查更新按钮 `compareDocumentPosition` 在首个版本行之前；BAF DSH DESKTOP 说明渲染为 **5 个独立段落**（demo33 标题 + ①②③④ 截图可证）；无更新卡。
- 注入态（`BAF_DEV_FAKE_UPDATE=1`，gitignored `lib/main.js` 临时探针，接管 `update:lastCheck` + 发 `update:checked`，下次 tsc 自动消失）：红点恰好 1 个、落在「版本与更新」行、计算色 `rgb(207, 34, 46)`、8×8px；更新卡出现。注入态必要因为真实通道 `Wang-Xutao/deepseek-harness` tag `baf-channel-stable` **HTTP 404（从未发布）**——真实检查只能得 error，available 态今天无法端到端点亮。
- 截图存于 `C:/Users/12402/AppData/Local/Temp/baf-verify/`（web-settings-nav / web-version-updates / desktop-nav-dot / desktop-version-updates-{natural,fake}.png）。

**测试**：updates-section.client.spec 7 例（多行段落/自动检查/新鲜结果不自动查/按钮 DOM 序/onCheckResult 推送刷新）；settings-root.client.spec 新增 2 例（available 点亮 + up-to-date 推送熄灭 + 无桥全暗）。顺手修复三处**预先存在**的测试腐化：`featuredPlugins/list` 进 remoteDefaultResponses（合并后 FeaturedSectionController 启动即读，16 例复活的 unmatched）、desktop-close-prefs 按钮名改读 `en` 字典（master 改了措辞）、shell.spec `PRODUCT_SECTIONS` 补到 7 行。

## 5.1 重新生成产物 + 打包版冒烟（2026-10-04 傍晚，客户指令「重新生成web端和桌面端」）

按 build-flow 管线顺序执行：`brand-web.mjs`（vite 重建 dist + help 回填——直接 vite 会清空 dist/help，正是记忆里的顺序坑）→ `pack-dsh.mjs`（自带 `pnpm deploy --prod`，重建 `resources/dsh`；产物验证：settings-general bundle 含 text-danger、updates bundle 含 onCheckResult、`baf-product-versions.json` 由 version-notes.json 正式重写为 bafDsh 0.0.23 + 5 行说明、help 在位）→ `npm run dist -- --dir`（tsc + electron-builder 解包版，204MB exe；tsc 顺带把 lib/main.js 里的临时假更新探针自然清除，asar 内含新 IPC）。

**打包版真机冒烟**（`win-unpacked/baf-dsh.exe --remote-debugging-port=9200`，resilient 探针防首启 target 切换断连）：精选插件 pinwheel `M7.84457`/4path、自然态红点 0、检查更新按钮在版本行前、说明 5 段、fail=0。**web 端再生成产物**（brand-web 后的 dist）同样复验全绿。截图 `exe-settings-nav.png` / `exe-version-updates.png` 同目录。

未做：NSIS 安装器（按 Tier 2 约定 + 客户只要求重新生成）；`generate-manifest.mjs` 与通道发布（`baf-channel-stable` 仍 404，见遗留 2）。

## 6. 遗留问题（按严重度排序）

1. ~~**【新发现·真 bug】dsh-auth cookie 无限累积 → 请求头超限 431 → 桌面应用打不开**~~ **已修复（2026-10-04 晚，候选 a 落地）**：cookie 名固定为 `dsh-auth`（签名 payload 里的 authority 绑定保留），全客户端覆盖；根因/取舍/验证梯见 [bug-fix/2026-10-04-dsh-auth-cookie-431-brick.md](../bug-fix/2026-10-04-dsh-auth-cookie-431-brick.md)。已累积的旧名 cookie ≤7 天自然过期，不再增长。
2. **更新通道未发布**：`baf-channel-stable` release 404，红点/更新卡在真实环境只会出现 error 态。发布首个 release 后建议真机复验一次 available 全链路（splash 检查 → 推送 → 红点 → 原生弹窗）。
3. 其余包的说明仍是单行长块（`bafCoreNotes`/`bafWorkflowNotes` 等 7 个 bafNotesZh，pack-dsh 从各包 `bafNotesZh` 字段取）——同一渲染路径已支持多行，写入侧分段即可，未动。
4. 桌面长会话无周期性复检：host 只在 splash 检查一次 + 客户端 30 分钟 staleness 自动查（仅设置页打开时）。后台常驻红点及时性依赖打开设置页，可接受；要更即时可在 main 加定时检查。
5. 更新卡里的 notes 同样走 `noteParagraphs` 多行渲染——发布长说明时注意同样分段。

## 7. 本次未跑的东西

- NSIS / pack-dsh 全管线（Tier 2 约定）；`build:lib:host` 的 tsdown host 面（本机必 OOM，typecheck 以 `tsc -b tsconfig.host.json` 代跑，exit 0；客户端面全量 tsdown exit 0）。
- 多模型路由 M1–M4（等客户对方案确认）。
