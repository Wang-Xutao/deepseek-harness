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

安装产物在 `overlay/desktop/dist/`（例如 `baf-dsh-Setup-0.0.3.exe`）。

只要可运行目录、不要安装包时：

```powershell
cd overlay
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run dist:dir
```

产物为 `overlay/desktop/dist/win-unpacked/baf-dsh.exe`（保留展开的 `resources/dsh/node_modules`，可直接双击）。本机仍需符合要求的 Node 以启动内嵌 `dsh web`。

版本对照：改 `desktop/package.json` 的 `version` 时同步更新 [../release/version-map.md](../release/version-map.md)。

用户帮助站（MkDocs）：

```powershell
cd overlay
npm run docs:build
```

源文档在 `docs/help/`，产物在 `site/`，并同步到 `apps/web/dist/help/`（供主界面帮助面板与浏览器打开）。`brand-web` 结束时也会执行该同步。

### 发版（GitHub Releases）

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

1. 在 `baf` 对齐三层版本与 version-map；`desktop/package.json` 的 version = 即将打的 tag 号。
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
