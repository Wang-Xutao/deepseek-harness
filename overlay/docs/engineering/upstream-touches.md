# 上游触达清单

记录二次开发改过的、位于 `overlay/` 之外的路径，方便 merge 上游。需求总账见 [../product/requirements.md](../product/requirements.md)。

关闭偏好必须改 harness 源码本身：Web「通用设置」由 `@deepseek-ai/dsh-client-ui-settings-general` 渲染，运行时从该包 `lib/client.js` 动态加载（不是 Vite 打进 `apps/web`）。仅改 `overlay/` 无法在设置页挂上控件。

| 路径 | 原因 |
|------|------|
| `packages/client/ui-settings-general/` | 在「通用设置」末尾增加桌面关闭偏好（仅 Electron `window.bafDesktop` 时显示）。改源码后须 `bundle`，再 `pack-dsh` 打进安装包。 |
| `packages/client/ui-settings-updates/` | 设置「版本与更新」页（order 25）；经 `window.bafDesktop` 调用桌面 UpdateService。ClientContext 取自 `@deepseek-ai/cordis`（上游已移除 `dsh-client-runtime`）。 |
| `packages/client/ui-baf-desktop/` | Hero 尾标、IDE 打开按钮、帮助面板（iframe `/help/` + 浏览器打开）；依赖桌面 `window.bafDesktop`。ClientContext 取自 cordis。 |
| `packages/client/ui-baf-tracegraph/` | 会话「轨迹图」Tab + 设置「工作流」开关：client 半边已迁到 `useChat`/`useTrajectory` + `LegacyConversationSlice`；Host 注册 `baf-workflow` settings 命名空间。 |
| `packages/client/ui-conversation/` | Hero 文案与 `conversation.hero.brand.trailing` 槽位；空会话时仍浮显 `header.utilities`（IDE 打开按钮）。 |
| `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` | 侧栏品牌回退读取 `DSH_CLIENT_TITLE` / `DSH_CLIENT_BUILD_LABEL`（未设置时仍为「DSH Local Build」+ commit 徽标）。打包时由 `overlay/scripts/brand-web.mjs` 注入「BAF DSH」与 `v<version>`。 |
| `packages/api/session-controller/` | `sessions.ensureOpen(id)`：打开历史窗口但不切换 `current`（轨迹图 inline 子 Session）。 |
| `packages/session/session-stats/` | `sessionStats.toolCalls` 全日志工具调用计数（轨迹图顶部汇总）。 |
| `packages/bundle/web-app/cordis.patch.yml` + `package.json` | 挂载 `ui-settings-updates`、`ui-baf-desktop`、`ui-baf-tracegraph`。 |
| `apps/cli/src/package-manager-env.ts`（新增）+ `apps/cli/src/bin.ts`（+6 行） | 精选插件安装能力：`DSH_PACKAGE_MANAGER` 环境变量（JSON `ProfilePnpmInvocation`）→ `runCli` 桥接为 launcher fact，让 profile plugin-manager 用壳捆绑的 pnpm（`overlay/desktop` extraResources `runtime/pnpm`，main.ts 以 `node --expose-internals pnpm.mjs` 形态导出）。env 缺省/坏值时 fail-soft 回落 PATH pnpm，上游行为不变。 |
| `packages/baf/baf-featured/`（新增） | 「精选插件」宿主服务：读 `overlay/plugin/featured-plugins.json`（随 bafPlugin zip 热更，经 `BAF_DSH_FEATURED_MANIFEST` env 传路径）× `pluginManager` 编排安装/删除/更新/启停/批量/自动更新/兼容豁免。 |
| `packages/client/ui-settings-featured-plugins/`（新增） | 设置页「精选插件」区块（order 26），经 harness RPC `remote.featuredPlugins` 驱动，无 `window.bafDesktop` 依赖（web 端同样可用）。 |
| `packages/api/remotes/src/remote-events.ts`（+1 行） | 白名单转发 `featured-plugins/changed` 事件到客户端。 |

## 2026-09-12 第四轮修复：根因与打包链路

### 根因

之前三轮调试全部生效、源码改对了，但 `overlay/desktop/dist/win-unpacked/` 里 `resources/dsh/node_modules/@deepseek-ai/dsh-client-*/lib/client.js` 仍是 9/11 06:23 的旧 bundle。`npm run dist:dir`（**仅在 `overlay/desktop/` 子目录里跑**）只跑 `electron-builder`，不重跑 `pack-dsh`，于是所有源码修改都没进 packaged exe：

```
overlay/desktop/dist/win-unpacked/resources/dsh/node_modules/@deepseek-ai/dsh-client-connection/lib/client.js
  => 没有 `credentials: "include"`（连接层失败 → Failed to fetch）
overlay/desktop/dist/win-unpacked/resources/dsh/node_modules/@deepseek-ai/dsh-client-ui-subagent/lib/client.js
  => 仍是 createPortal + 5px gap + JS `placeMenu`（闪烁源）
```

正确流程：根目录执行 `pnpm run build:lib:client`，再在 `overlay/` 执行 **`npm run dist:dir`**（顶层脚本，会按序跑 `docs:build` → `brand-web` → `verify-help-build` → `pack-dsh` → `desktop/dist:dir` → `verify-desktop-dir-launch`）。**直接在 `overlay/desktop/` 跑 `npm run dist:dir` 等于打包旧的 `resources/dsh/`**。

### 改动

| 文件 | 内容 |
|------|------|
| `packages/client/connection/src/client/rpc.ts` | `createWebConnectionRpc` 的 `fetch` 调用加 `credentials: 'include'`。原因：Host 的 `/api` 路由用浏览器会话语义 cookie 做会话认证；Chromium 在跨源 POST 默认不发 cookie，导致 401 → renderer 看到 `Failed to fetch`。 |
| `packages/client/ui-subagent/src/client/SubagentHeaderLineage.tsx` | 把 catalog menu 从 `createPortal(..., document.body)` 改成根容器内的子节点，`position: absolute; top: calc(100% + 4px)` 纯 CSS 定位，删掉 `setMenuPosition` 与 `[open]` 触发的 `placeMenu` resize/scroll 监听。`scheduleHoverOpen` 的 `if (open) return` 改为 `openRef.current`，避免闭包过期导致 hover→menu→hover 时重复打开。 |
| `packages/client/ui-subagent/src/client/SubagentHeaderLineage.module.css` | `.menu` 由 `position: fixed` 改为 `position: absolute; top: calc(100% + 4px); left: 0`。把菜单放回 trigger 容器，`onMouseEnter/Leave` 不再被 5px gap 打断。 |
| `packages/client/ui-subagent/tests/conversation-ui.client.spec.tsx` | 把测「portaled menu inline top/left + resize/scroll 重定位」的两条测试改成「CSS 定位无 inline style + resize/scroll 不写 inline」。`hoverOpen` debounce 由 150ms 改成 120ms，对应 `HOVER_OPEN_DELAY_MS`。 |
| `packages/client/ui-baf-desktop/src/client/HelpFooterAction.tsx` | 在 `iframe.onLoad` 主动给子文档 `documentElement` 补 `class="baf-embedded"`（带 `useCallback`）；同源文档直接拿 `contentDocument`，跨源时静默放弃并依赖 `overlay/docs/help/javascripts/embedded.js` 的回退。这是「帮助界面显示异常」的 belt-and-suspenders 修复。 |

### req6（cmd/powershell 图标 + 设置开关）

| 文件 | 内容 |
|------|------|
| `packages/client/ui-open-in-app/src/client/OpenInAppAction.tsx` | `FALLBACK_ICONS` 已包含 `cmd`、`powershell`、`windowsterminal` 的内联 SVG；`AppIcon` 在 16×16 槽位渲染。 |
| `packages/client/ui-open-in-app/src/client/OpenInAppSettingsRow.tsx` | 通用设置面板为 `KNOWN_IDS`（含 cmd / powershell）渲染 checkbox，写入 `OpenInAppController.disabled`。 |
| `packages/client/ui-open-in-app/src/client/controller.ts` | `disabled` 快照（持久化 `dsh.open-in-app.disabled`）+ `setEnabled(appId, enabled)` 单 id 切换。 |
| `packages/client/ui-open-in-app/src/client/index.ts` | 两个槽位（header dropdown、general.settings.item）共用同一个 controller，禁用状态实时同步。 |

设置面板「打开应用功能受限」是 Chromium 早期对未签名 exe（Git Bash 的 `bash.exe`、PowerShell ISE 等）的 SmartScreen 弹窗，与上层无关。

## 2026-09-12 第五轮修复：启动链路、图标与「0 个子代理」闪烁

### 根因一：BAF 预设 persona 用了已废弃的 `text` 字段（会话创建 500）

`dsh-persona` 现行 schema 是 `prefix`（必填）+ `suffix`（可选），legacy `text` 已删除；`text`-only 行在挂载时以 `$.prefix missing required value` 拒绝，`session/create` 直接 500 →「新会话打不开」的一部分。

### 根因二：Windows 控制台应用「打开受限」三层叠加

1. **fixed locator 从不展开 launch command 里的 `${SystemRoot}`**：resolver 只展开 iconPath，spawn 了字面量 `'${SystemRoot}/System32/cmd.exe'` → ENOENT → 502。
2. **cmd 对 argv 数据的再解析**：Node 会把 argv 里的 `"` 反斜杠转义到 raw command line，cmd 内建解析器读到语法错误（`start ""` 标题正是这个坑）；exe 路径或 `/d` 目录带正斜杠时，cmd 重解析 raw command line 把 `/` 当开关（「命令语法不正确」/「无效开关 - /x」）。结论：argv 数据不带引号、命令模板用反斜杠。
3. **无控制台宿主里控制台子系统子进程不开窗**：host child 无控制台，直接 spawn 的 cmd/powershell 无论 detached 与否都无窗口（OS 不分配 console）。cmd 的 `start` 内建是唯一能拿到 CREATE_NEW_CONSOLE 的原语。

最终形态：`cmd /c start /d {path} cmd`（powershell 加 `-NoExit`），`launchResolved` 在 win32 上把目录统一成反斜杠（路由校验接受两种分隔符，但 cmd 不接受）。

### 根因三：git-bash.exe 提取图标不是 Git 标志

Windows shell icon API 对 `git-bash.exe` 返回一个非 Git 的多色图标、对 `git.exe` 返回通用控制台图标（像素直方图：0% Git 橙 #F1502F）。客户端 `PREFERRED_FALLBACK_ICONS` 对 `gitbash` 强制走内置 MINGW64 SVG 回退（橙色分支字形）。

### 根因四：「0 个子代理」hover 闪烁

可见性条件里的 `presentedCatalog.state === 'error'`：选中任何会话都会调度 catalog 刷新，子会话数为 0 的会话一旦 RPC 失败，error 快照把 trigger 挂出来（「0 个子代理」），下一次刷新的 loading 快照又把它摘掉——每次 hover/选中都振荡。修复：error 不再构成「有子代理」的证据（entries/diagnostics/summary 后代仍是），报错重试入口在确有子代理的会话上保留。

### 改动

| 文件 | 内容 |
|------|------|
| `packages/preset/agent-presets/presets/baf/agent.cordis.yml` | persona `text` → `prefix` + `suffix`（schema 对齐，session/create 恢复）。 |
| `packages/client/connection/src/client/rpc.ts` | 除 round 4 的 `credentials: 'include'` 外：`TypeError: Failed to fetch`（socket 级失败）按 3 次 ×120ms 级退避重试，HTTP 错误照常穿透；`AbortSignal` 全程可取消。 |
| `packages/client/ui-agent-preset/src/client/settings-store.ts` | `readRoster` 捕获网络级异常 → 正常 roster error（渲染「重试」而不是泄漏 `Failed to fetch`）。 |
| `packages/client/ui-workspace/src/client/navigation.ts` | `pickDirectory` 与 5 分钟墙钟上限竞速：原生对话框悬死时给出明确超时而不是静默挂起。 |
| `packages/host/open-in-app/src/catalog.ts` | cmd/powershell win32 条目改为 `cmd /c start /d {path}` 形态（见根因二）。 |
| `packages/host/open-in-app/src/resolver.ts` | fixed locator 展开 launch command 的 `${SystemRoot}`（未展开 → 不可用）；`launchResolved` 在 win32 归一化目录分隔符。 |
| `packages/client/ui-open-in-app/src/client/OpenInAppAction.tsx` | `PREFERRED_FALLBACK_ICONS`（gitbash）→ 内置 SVG 回退。 |
| `packages/client/ui-subagent/src/client/SubagentHeaderLineage.tsx` | 可见性去掉 `state === 'error'` 子句（见根因四）。 |
| `packages/client/ui-subagent/tests/conversation-ui.client.spec.tsx` | 两条测试改钉新行为：childless catalog 在 loading/ready/error 三态都隐藏；error + 已知子代理保留重试行。 |
| `packages/host/open-in-app/tests/catalog.spec.ts`（新增） | 钉死 cmd/powershell 的 `start /d` argv 形态与「argv 数据不带引号」。 |

### 打包链路补充（round 4 修正的再确认）

`overlay/desktop/` 子目录里单独跑 `npm run dist:dir` 只复制 staging 树 `overlay/desktop/resources/dsh/node_modules/`。本轮在根目录 `npx tsc -b tsconfig.client.json && npx tsdown --env.DSH_BUILD_FACE client`（等价 `build:lib:client`，绕开 pnpm verify-deps 包装器对 TTY 的要求——**不要**用 `CI=true` 强推，那会触发 production install 清空 devDependencies）后，把 6 个改动包的 `lib/` 手动刷进 staging 树再 `dist:dir`，产物内已验证含全部修复标记。正式流程仍推荐 overlay 顶层 `npm run dist:dir`（含 pack-dsh）。

### 验证（packaged app，CDP 实测）

cmd/powershell/gitbash/explorer 启动均 200 且出现真实窗口（故意用正斜杠路径验证归一化）；设置→通用设置 38 项 checkbox，Git Bash 关闭→下拉消失、开启→恢复；新会话/工作区切换/原生目录选择器（「Select Workspace Directory」窗口实测出现）/帮助 iframe（完整文档渲染）/Agent 预设（standard/BAF/PTC）/历史载入全部正常；hover 头部区域 25 元素 ×4 轮无「个子代理」出现。测试：ui-subagent 33、connection+ui-open-in-app+ui-agent-preset+ui-baf-desktop+ui-workspace 共 486、host open-in-app 64，全绿。

## 2026-10-04 精选插件子系统补全：plugin-manager 三处行为修复（上游核心包触碰）

dsh-feishu 装入 baf profile 暴露出三个 plugin-manager 语义缺口。三处都在 `packages/boot/plugin-manager/src/index.ts`，每处附 `tests/manager.spec.ts` 钉死测试（253 通过）：

| 位置 | 缺口 | 修复 |
|------|------|------|
| `protectsManager` + 新增 `userDisabledIds` | feishu 的 patch 声明了 protected module（`@deepseek-ai/dsh-client-connection`），bundle 被永久锁为 not-removable / management-required | **用户层否决**：profile patch、home patch、launch overlay 三层里 `disabled: true` 的行 id 集合可释放锁——另一 bundle 的同名模块才是真正承载 manager 的那份。注意 `managementBundles` 粘性缓存必须被活跃否决穿透（先保护后写 disable 行的 install→repair 次序会留下陈旧缓存），`vetoed.size === 0` 时保留上游短路行为不变 |
| `removeBundle` in-use 检查 | web-app 与 feishu 都声明 `workspace` 行（同 id 同 name），web-app 的 live entry 命中「本 bundle 贡献的行仍在挂载」→ 误报 `bundle-in-use` | 检查前先读 profile 仍选中 bundles 的全部声明行；**另一仍选中 bundle 也声明的 (id, name) 不算 in-use**——本层离开组合后那份声明继续供着该 entry |
| （baf-featured 侧）`repairOverlaps` | 组合级失败→重组合成功会**替换**安装结果，把 dsh CLI 安装门的 `incompatible-version` 拒绝（如降版到未豁免版本）误报为成功 | `changed !== true` 的失败（pnpm/门拒阶段，磁盘未变）原样透传给调用方，不写行、不重组；只有 `changed: true` 的组合期失败才由重组合结果取代 |

**行 id 碰撞矩阵**（dedupe 的依据）：web-app 层以 `connection`/`file-upload`/`session-controller` 挂载三个包，feishu 层以 `client-connection`/`client-file-upload`/`api-session-controller` 挂载**同名包** → 不同 id 的两行都会挂载 → 服务重复注册。`packages/baf/baf-featured/src/dedupe.ts` 在安装后自动向 profile patch 追加带 `# baf-featured dedupe` 标记的 disable 行并重组合；删除时剥离。未来任何精选插件同理受益，无需逐一适配。

**typert 产物注意**：`packages/baf/baf-featured/lib/` 里的 `typert.host.js`/`typert.remote-client.js` 由根构建（`build:lib:host` 的 tsdown typert 插件）生成——包内 `rm -rf lib` 后只跑包内 `tsc && pnpm run bundle` **不会**重建它们，必须再跑根 `build:lib:host`，否则启动报 `typert-loader ... ERR_MODULE_NOT_FOUND` + 1 entry did not activate。
