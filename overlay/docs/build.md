# 打 Windows 安装包

在仓库根先构建上游产物（含 Web 前端与通用设置插件）：

```powershell
corepack pnpm install
corepack pnpm run build
# 若改过 packages/client/ui-settings-general，还需：
corepack pnpm --filter @deepseek-ai/dsh-client-ui-settings-general run bundle
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

`npm run dist` 会：下载 Node MSI（可跳过）、扁平打包 dsh、生成 NSIS 用 BMP 侧栏/页眉、编译 Electron、打 NSIS。依赖以 `modules.zip` 打入安装包，安装末段解压并在详情区打印阶段信息（避免上万小文件拖死进度条）。

品牌文件放在（打包不会覆盖这里）：

- `overlay/desktop/branding/icon.ico`
- `overlay/desktop/branding/deepseek.png`

安装产物在 `overlay/desktop/dist/`（例如 `baf-dsh-Setup-0.0.1.exe`）。

版本对照：改 `desktop/package.json` 的 `version` 时同步更新 [version-map.md](version-map.md)。

electron-builder 会误把仓库根当 pnpm workspace；`desktop/bin/pnpm.cmd` 在打包时使用 `--ignore-workspace`。

开发态：

```powershell
cd overlay/desktop
npx tsc
npx electron .
```
