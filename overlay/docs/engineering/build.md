# 打 Windows 安装包

在仓库根先构建上游产物（含 Web 前端与通用设置插件）：

```powershell
corepack pnpm install
corepack pnpm run build
# 若改过设置相关 client 插件，还需：
corepack pnpm --filter @deepseek-ai/dsh-client-ui-settings-general run bundle
corepack pnpm --filter @deepseek-ai/dsh-client-ui-settings-updates run bundle
corepack pnpm --filter @deepseek-ai/dsh-web-frontend run build
```

再构建 overlay：

```powershell
cd overlay
npm install
npm --prefix desktop install
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run dist
```

`npm run dist` 会：下载 Node MSI（可跳过）、用 `brand-web` 把侧栏品牌打成「BAF DSH」+ `v<version>`、扁平打包 dsh、生成 NSIS 用 BMP 侧栏/页眉、编译 Electron、打 NSIS。依赖以 `modules.zip` 打入安装包，安装末段解压并在详情区打印阶段信息（避免上万小文件拖死进度条）。

品牌文件放在（打包不会覆盖这里）：

- `overlay/desktop/branding/icon.ico`
- `overlay/desktop/branding/deepseek.png`
- `overlay/desktop/branding/sora.png`（splash 左侧；需同步到 `desktop/ui/sora.png`）

安装产物在 `overlay/desktop/dist/`（例如 `baf-dsh-Setup-0.0.8.exe`）。

`npm run dist` 打出的 `win-unpacked/` 内嵌 `modules.zip`（安装器会在安装末段解压）。请用 Setup 安装后启动；或改跑 `npm run dist:dir` 得到可直接双击的展开目录。桌面壳在发现缺少 `node_modules` 时也会尝试自行解压 `modules.zip`。

只要可运行目录、不要安装包时：

```powershell
cd overlay
$env:CI = 'true'
$env:npm_config_production = 'false'
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run dist:dir
```

本机若缺 Visual C++ / `fs-ext` 原生编译环境，仓库根请用 `pnpm install --ignore-scripts`；`pack-dsh` 已对 `pnpm deploy` 使用 `--ignore-scripts`。Windows 上 session lease 不加载 `fs-ext`（用 koffi 信号量），因此跳过原生编译仍可启动。

产物为 `overlay/desktop/dist/win-unpacked/baf-dsh.exe`（保留展开的 `resources/dsh/node_modules`，可直接双击）。本机仍需符合要求的 Node 以启动内嵌 `dsh web`。

`npm run dist:dir` 末尾会跑 `verify-desktop-dir-launch`：校验关键包 `lib/index.js` 已打入、从 `win-unpacked` 启动打包后的 `dsh web` 直至打印就绪 URL，并冒烟拉起 exe（`launch-error.log` 不得新增失败记录）。未通过则整次打包失败，不应把 exe 交给用户。

#### 帮助页守卫

`npm run dist` 与 `npm run dist:dir` 都已内置 `npm run docs:build && npm run verify-help-build` 守卫：

1. `docs:build` 先跑 MkDocs，把 `overlay/docs/help/` 编译到 `apps/web/dist/help/`。
2. `verify-help-build` 校验 `apps/web/dist/help/index.html` 存在且 `<title>` 含 `baf-dsh`；不满足则直接非零退出，避免打包产物里出现空 `/help/` iframe。

仅在手动跳过守卫（例如只重打安装包而 `apps/web/dist/help/` 已就绪）时省略；常规打包请直接用 `npm run dist` / `npm run dist:dir`。

版本对照：桌面版号以 `desktop/VERSION` 为准；发布前先执行 `npm run bump-desktop -- <X.Y.Z>`（同步 `package.json` / `version-notes.json`），再更新 [../release/version-map.md](../release/version-map.md)。

用户帮助站（MkDocs）：

```powershell
cd overlay
npm run docs:build
```

源文档在 `docs/help/`，产物在 `site/`，并同步到 `apps/web/dist/help/`（供主界面帮助面板与浏览器打开）。`brand-web` 结束时也会执行该同步。

### 发版（GitLab Releases）

【变更】2026-10-30 (升级途径迁移)：桌面端的更新通道（读取侧）已从 GitHub Releases 迁到 **GitLab Releases**——host `gitlab.sinc.lan`，项目 `ai/workflow/baf-dsh`（公开项目，客户端不带令牌）。产物签名仍是唯一信任锚。

GitLab Release 与 GitHub Release 的差别：GitHub 可以直接「上传 asset」，GitLab 的 Release 挂的是 **link**（外链）。所以发布侧要做的是：

1. 在 `baf` 分支打 `baf-dsh-vX.Y.Z` 标签（版本号须与 `desktop/VERSION` 一致）。
2. 流水线（GitLab CI，需 Windows runner 或等价的 wine 方案）构建产物：
   `node scripts/pack-plugin.mjs` → `npm run brand-web` → `node scripts/pack-dsh.mjs` → `node scripts/pack-runtime.mjs` → `npm run prepare-branding` → 打包 → `node scripts/generate-manifest.mjs`。
3. 把产物放到 **CI job artifacts 或对象存储直链**（客户端要能匿名 GET）：
   `manifest.json`、`manifest.sig`、`baf-plugin-<ver>.zip`、`baf-runtime-<ver>.zip`、`baf-dsh-Setup-<ver>.exe`。
4. 创建版本 Release `baf-dsh-vX.Y.Z`，把上述文件按**文件名**挂成 release links（link 的 `name` 必须与 manifest 里的 artifact `name` 完全一致）。
5. 刷新通道 Release `baf-channel-stable`：同样以 release links 挂 `manifest.json` 与 `manifest.sig`（其它产物可不挂）。
6. 生产签名：CI 私钥来自 secret `BAF_UPDATE_PRIVATE_KEY_PEM`，公钥登记在 `overlay/desktop/src/update/public-key.ts`（`node overlay/scripts/gen-update-keypair.mjs`）；打包版拒绝 testOnly key。

客户端读取规则（`overlay/desktop/src/update/gitlab.ts`）：

- 通道：`GET {host}/api/v4/projects/{url-encoded project path}/releases/baf-channel-stable` → 取 `assets.links` 里名为 `manifest.json` 的 link。
- 版本：`GET .../releases/baf-dsh-v<version>` → 按 `assets.links[].name` 找产物，按 `url`（或 `direct_asset_url`）直取。
- 故障码：通道 Release 不存在 → U-01；网络层失败 → U-02；缺 `manifest.json` / 解析失败 → U-03；签名或 sha256 不通过 → U-04。

### 触发一次测试更新（本地，不依赖流水线）

【变更】2026-10-30：仓库里备好了 `overlay/scripts/publish-release-gitlab.mjs`（`npm run publish-release-gitlab`）。它把产物上传到**通用包仓库**，再把每个文件按名字挂成 release link —— 正是更新器要读的结构：

```powershell
cd overlay
# 1) 先产出本版本的 manifest + 产物（含 manifest.sig 签名）
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run build-release

# 2) 预演（不写任何东西）
npm run publish-release-gitlab -- --dry-run

# 3) 真发：需要项目 access token（api 权限）
$env:GITLAB_TOKEN = '<你的 token>'
npm run publish-release-gitlab
```

它做两件事：

1. `PUT /projects/:id/packages/generic/baf-dsh/<version>/<file>` —— 把 `manifest.json`、`manifest.sig`、`baf-plugin-*.zip`、`baf-runtime-*.zip`、`baf-dsh-Setup-*.exe` 上传到通用包仓库（项目公开，下载链接无需令牌）。
2. 建/刷两个 Release：**`baf-dsh-v<version>`**（挂全部产物）与 **`baf-channel-stable`**（只挂 `manifest.json` + `manifest.sig`）——桌面端「检查更新」读的就是通道这条。

要点：

- **link 的 `name` 必须与 manifest 里的 artifact `name` 完全一致**（更新器按名字找文件）。
- 通道 Release 每次发版都要重建：manifest 的签名内容变了，链接必须指向新文件。
- 打包版强制验签：`manifest.sig` 的公钥必须登记在 `overlay/desktop/src/update/public-key.ts`（`node overlay/scripts/gen-update-keypair.mjs` 生成），否则桌面端会拒绝并报 U-04。测试期可用开发态 + `BAF_UPDATE_ALLOW_UNSIGNED=1` 绕过策略，但那只是演练用。
- 想验证「查得到更新」而不真的换版本：先只发通道（`--skip-channel` 反过来用——只发通道、跳过版本 Release），或临时把 `desktop/package.json` 的版本号抬高一位再 build-release。

> 旧的 GitHub 发布路径（`.github/workflows/baf-dsh-release.yml`、`overlay/scripts/publish-release.mjs`）仍在仓库里，但**不再被客户端读取**——跑它们不会让桌面端看到更新。

### 发版（旧路径：GitHub Releases，仅存档参考）

**方式 A — 本地打包并上传（推荐，不依赖 Actions）**

```powershell
# 1. 安装并登录 GitHub CLI
winget install GitHub.cli
gh auth login

# 2. 在 overlay 目录一键构建 + 发布
cd overlay
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
$env:CI = 'true'
npm run release

# 或分步：
# npm run build-release          # 仅本地打包
# npm run publish-release        # 仅上传到 GitHub Releases
# node scripts/publish-release.mjs --dry-run   # 预览将上传的文件
```

`publish-release` 会创建/更新：

- `baf-dsh-vX.Y.Z` — 安装包、plugin/runtime zip、manifest
- `baf-channel-stable` — 仅 manifest（客户端检查更新读此 Release）

默认仓库 `Wang-Xutao/deepseek-harness`，可 `--repo owner/name` 覆盖。

**方式 B — GitHub Actions（需账号 Actions 可用）**

1. 在 `baf` 执行 `npm run bump-desktop -- <X.Y.Z>`，对齐 `desktop/VERSION` / package.json / version-notes / version-map；即将打的 tag = `baf-dsh-vX.Y.Z`。
2. `git tag baf-dsh-vX.Y.Z && git push origin baf-dsh-vX.Y.Z`。
3. Actions [baf-dsh-release.yml](../../.github/workflows/baf-dsh-release.yml) 构建并上传 Release，并刷新 `baf-channel-stable`。
4. 可选 Secret：`BAF_UPDATE_PRIVATE_KEY_PEM`；公钥写入 `desktop/src/update/public-key.ts`（`node overlay/scripts/gen-update-keypair.mjs`）。

本地辅助：

```powershell
cd overlay
npm run pack-plugin
# 先 pack-dsh 再：
npm run pack-runtime
npm run generate-manifest
```

electron-builder 会误把仓库根当 pnpm workspace；`desktop/bin/pnpm.cmd` 在打包时使用 `--ignore-workspace`。

开发态：

```powershell
cd overlay/desktop
npx tsc
npx electron .
```
