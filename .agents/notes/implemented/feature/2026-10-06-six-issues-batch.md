# 六问题批 — auto 模型 / 开机自启动 / 工作流图改名 / 多模型路由 UI 五改 / 版本与更新 / 推荐插件禁用

- 触发：客户 2026-10-06 报六项（编号沿用客户口径 1–6，4.x 为其第 4 项的五个子点）。
- 交付：本批全部落地，双端（web 3180 + 桌面 dev electron CDP 9201）探针验证通过，`fail: []`。
- 验证：webprobe-v4.mjs 12/12 断言绿；desktopprobe-v4.mjs 全绿（含 HKCU Run 注册表往返、`--hidden` 冷启）；单测 route-section 43、featured+plugin-manager 105（含 2 个 sole-provider 新测试）、其余 16 文件 184 用例。

## 问题 1 — 会话模型菜单增加 auto（仅开启多模型路由时）

【变更】`packages/client/ui-model-selection/src/client/service.ts`：ModelDirectoryResolver 注册 `ctx.remote.$on('baf-route-config/changed', () => this.catalog.refresh())` — 没有这个监听，/model 座位在开关翻转后仍拿旧目录，auto 项直到整页刷新才出现/消失。host 侧的分组注入（`packages/baf/baf-workflow/src/route-auto.ts` 的 `catalogGroups()`，`baf-route` 伪供应商 + `Auto` 模型，prepend）为前批已有，本批只补客户端刷新链。

类型链（本批真正的坑）：api-remotes 的 selection key 收下了该转发事件，但 cordis `Events` 增强不随 `import type {}` 穿过 declaration emit — 每个 remote 消费者要在自己的源里加载一次。`service.ts` 头部补 `import type {} from '@deepseek-ai/dsh-client-ui-settings-baf-route/types'`（仿上方 product-analytics 行），`packages/client/ui-model-selection/tsconfig.json` references 补 baf-route（已核对无环）。

验证：两端均以「先读 off 态菜单 → 设置里开总开关+保存 → 重读菜单」的差分断言：off 无 Auto、on 时菜单首组为 多模型路由/Auto（桌面端实测菜单文本前缀 `多模型路由AutoDeepSeek…`），探测后配置恢复 off。菜单为两层面板：根层「模型」cell 需先 drill 进列表层（menuitemradio 所在层）再断言。

## 问题 2 — 通用设置「开机自启动」（仅桌面）

【变更】三件套：
- `packages/client/ui-settings-general/src/client/DesktopLaunchPrefs.tsx`（+ module.css）：`window.bafDesktop` 存在才渲染的 Setting-Cell 行；开关走 `bridge.setPrefs({ launchAtLogin })`，失败红字 `role="alert"`。web 端无桥接自然不出现（探针断言 row=0、文案不含）。
- `overlay/desktop/src/prefs.ts`：AppPrefs 增 `launchAtLogin`，mergePrefs/parsePrefs 带类型校验。
- `overlay/desktop/src/main.ts`：`prefs:set` 句柄在值变化即调 `applyLaunchAtLogin()`（dev 形态注册 `electron.exe <appPath> --hidden`，打包形态 `args: ['--hidden']`）；`hiddenLaunch = argv.includes('--hidden')` 贯穿两处 — whenReady 不开 splash 改 ensureTray；startDshAndShow 在 child URL 就绪后不 `window.show()`（窗口照常 loadURL，托盘「打开窗口」即得已就绪页面）。启动收敛：每次 boot 都 `applyLaunchAtLogin(prefs.launchAtLogin)` 对齐注册表。

验证：探针读行 → 开 → `HKCU…\Run` 出现 `com.baf.dsh.desktop … --hidden` → 关 → 条目消失 → 恢复原值。`--hidden` 冷启以 launch-timings.jsonl 为准（无 `splash-shown`/`main-shown` 标记）+ PowerShell `MainWindowHandle=0` 双证窗口未显示、DOM 已加载（66 按钮）。注意：隐藏窗口里 `document.visibilityState` 仍报 `visible`，不能当判据。

## 问题 3 — 「工作流图页签」→「工作流图」

【变更】`packages/client/ui-baf-workflow/src/client/locales.ts` 页签名去「页签」。探针断言新词在、旧词亡（两端）。

## 问题 4 — 多模型路由五改

- 4.1【变更】操作条（`ModelRoutingRow.tsx`）：恢复默认 行首、取消+保存 行尾；干净态取消禁用。`route-store.ts` 增 `cancel()`（整稿回滚到已保存文件）。
- 4.2【变更】角色呈现（locales.ts zh/en）：旗舰 / 评审 / 执行，卡内「名 + 职责行」两节点分别渲染（`旗舰` 与 `强推理、复杂工程、关键设计与发布、架构决策` 等三组，DOM 无全角冒号连接 — 探针按两段断言）。
- 4.3【变更】未在目录 绝迹：加载时 `normalizeTiers` 对照目录重挂（provider 消失→目录首个模型；模型消失→该 provider 首个模型，effort 随之清空）；`setTierProvider` 同规则即时重挂。单测覆盖 dangling provider/model 两分支。
- 4.4 结论（非缺陷）：`baf/MiniMax-M3` 锚点显示无 minimax-cn 泄漏（探针对三档锚点逐个断言）。所谓「异常后缀」来自本机 profile 自己配置的 `minimax-cn` 供应商（其下同名 MiniMax-M3，见 `~/.dsh/profiles/web/cordis.patch.yml` llm-pi-ai 段）— 桌面端模型菜单里它作为独立分组 `minimax-cn/MiniMax-M3` 与 `baf/MiniMax-M3` 并列，是两台真模型，非代码混淆。
- 4.5【变更】标签即开关：用户标签与预设词标签本体 `role="switch"`（点击/Enter 停启用，✎/✕ 停传播），无内嵌 switch；中文/英文分段（`tagsZh`/`tagsEn` 行标签，zh 值为 中文/英文）；自定义组按 category 分组、词库按 pack 分组，组级一键开关（category/pack toggle）。60 预设标签 + 4 zh + 4 en 段实测。
- 4.6【变更】预演失灵根修：4.4 转发链上 zod 把 draft 的 `category`/`presetWords`/`packs` 字段剥掉 → host 预演看不到停用状态。重建 typert 聚合后 `typert.remote-client.js` 三字段俱在；实测「停用 架构 标签 → 预演 `请处理架构相关事宜` 从 `旗舰 · 架构` 变为不命中」，启用即复命中。

## 问题 5 — 版本与更新：删说明 + 结果醒目分色

【变更】`UpdatesSection.tsx`（+ css/locales）：删「以下插件包随应用一起安装…」与 /baf-update 热升级两段；检查更新结果框 `checkResultOk`（绿）/ `checkResultError`（红）两类哈希类名。桌面实测点击后得红框全文「检查更新失败：无法读取更新通道（HTTP 404）。仓库尚未发布 Release「baf-channel-stable」…当前版本：0.0.23 最新可升级版本：—」— 404 为本仓库未发版的预期态（绿路径由 updates 单测覆盖）。

## 问题 6 — 推荐插件可禁用 + 报错红色

【变更】`packages/boot/plugin-manager/src/index.ts`：disable/enable 管理权放宽 — 之前插件若由 bundle 提供（非用户单独安装）即报 `management-required`，现允许操作，唯「sole-provider 保护」保留（某插件仅此 bundle 提供且被依赖时拒动，两个新单测锁定该语义）。`FeaturedSection.tsx`：notice 以红色 `role="alert"` 渲染。web 实测 feishu 卡 禁用 → 「操作成功。」无 management-required → 启用恢复（初始为已禁用态，按原态还原）。

## 构建与验证环境记录

- 本机（15.3GB，余 ~5.5GB）全仓 tsdown 单进程 OOM（exit 134）：按 rebuild-list.tmp.json 188 包分 16 chunk（`--env.CHUNK=<n>` 每片 12 包新进程），再 `node typert-emit-all.mjs`（6GB heap）出 typert 产物；4.6 的门禁校验（remote-client.js 三字段计数）通过后才继续。
- 清梯：360 个 tsbuildinfo + 全部 lib/types 删除 + 9 个 deploy 树重打桩 + 2 个 baf-only 包（updates、featured-plugins）单独 `tsc -b` 补 emit。
- 桌面 lib 陷阱：`overlay/desktop/lib` mtime 新但内容为旧（无 launchAtLogin）→ 症状是 UI 开关翻转而 prefs/注册表不动。`rm -rf lib tsconfig.tsbuildinfo && tsc` 重建后通。tsc-watcher 竞速已知机制的又一实例。
- web 探针宿主要带 `BAF_DSH_FEATURED_MANIFEST=<repo>/overlay/plugin/featured-plugins.json`（桌面 shell 才默认注入）；隔离 profile `web` 的 cordis.patch.yml 曾把 workspace 插件 toggle 成 disabled（追加式 last-wins），本批末尾追加了带注释的 `disabled: false` 复原会话/模型菜单可达性，未回退。
- 模型菜单两层面板、设置模态用自己的「关闭」钮（顶栏 设置 钮在模态开着时点不动它）、Edge 首航 token 需双跳。

## 剩余风险（按危害排序）

1. ~~**打包产物仍是旧桌面 lib**~~ **已闭环（10-06 下午重打包）**：重跑 pack-dsh + `dist:dir` 后复核 — `dist/win-unpacked/resources/app.asar` 含 launchAtLogin（18 处），`resources/dsh/node_modules/…ui-settings-baf-route/lib/client.js` 与 packages 侧逐字节一致。旧的 `baf-dsh-Setup-0.0.23.exe`（03:03）仍旧勿用。
2. **更新绿路径未走真网**：真机只见红（404）路径；绿框由单测覆盖，`baf-channel-stable` 发版后建议真机复验一次。
3. ~~**开机自启动安装形态未实测**~~ **已闭环（10-06 打包 exe 冒烟）**：`dist/win-unpacked/baf-dsh.exe --remote-debugging-port=9203` 实测（packprobe.mjs，`fail: []`）— 开关 ON 写入 `com.baf.dsh.desktop = <…win-unpacked\baf-dsh.exe> --hidden`（指向打包 exe 本体，非 dev electron.exe 形态），OFF 即消失；推荐插件 4 卡、更新红框、删段文案均与 dev 一致。
4. `--hidden` 冷启的「托盘在位」未直接探（OS 托盘无 CDP 面）；以 ensureTray 分支必经 + 无窗口双证替代。
5. 隔离 profile web 的 workspace 复原项未回退（见上），下次若需纯净 web 宿主注意此项。

## 交付物（10-06 下午）

- 复验：web 3180 + 桌面 dev 双端 webprobe-v4 / desktopprobe-v4 重跑 `fail: []`（对 commit `17c7091988`）。
- web 端：`node apps/cli/lib/bin.js --profile web --port 3080 --no-open`（带 `BAF_DSH_FEATURED_MANIFEST`），token 见交付消息。
- 桌面端：`overlay/desktop/dist/win-unpacked/baf-dsh.exe`（免安装 dir 构建，无 NSIS；pack-dsh 戳 2026-10-06T06:02:47Z，14:04 出包，含上述冒烟证据 v4-pack-*.png）。

## 代码内批注口径对照

代码里沿用开发期批号，与客户编号映射：问题 2（自启动）=客户 2；「问题 5 批 / 4.x」=客户 4 的 4.1–4.6（含 4.3 未在目录、4.5 标签即开关）；「问题 7」=客户 6；「UI 三块批 / M3 批次B」为此前布局批次（本批未动其结构）。
