import { spawn, type ChildProcess } from 'node:child_process'
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  watchFile,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  Notification,
  Tray,
  nativeImage,
  shell,
} from 'electron'
import { ensureDshModulesExpanded } from './ensure-dsh-modules.ts'
import { findSupportedNode, isSupportedNodeBinary } from './find-node.ts'
import { enableWrites as enableLaunchTimings, mark as markLaunch } from './launch-timings.ts'
import { parseNotificationPayload, type DesktopNotificationPayload } from './notification.ts'
import { bundledPnpmEntry, featuredManifestPath, packageManagerEnvJson } from './package-manager.ts'
import { syncSkillTree } from './plugin-sync.ts'
import { mergePrefs, parsePrefs, type AppPrefs, type CloseAction, DEFAULT_PREFS } from './prefs.ts'
import { readyTimeoutMs } from './ready-timeout.ts'
import { parseWebReadyUrl } from './ready-url.ts'
import { DEFAULT_CHANNEL_TAG, DEFAULT_UPDATE_HOST, DEFAULT_UPDATE_PROJECT } from './update/defaults.ts'
import { setSignaturePackaged } from './update/public-key.ts'
import { UpdateService, updateRequestPath, updateResponsePath, updateStatePath, type CheckUpdateResult } from './update/service.ts'
import { userFacingLaunchError } from './user-errors.ts'
import { DEFAULT_VERSIONS, parseVersions, readDesktopVersionFile, type AppVersions } from './versions.ts'

const APP_USER_MODEL_ID = 'com.baf.dsh.desktop'
const APP_NAME = 'baf-dsh'

app.setAppUserModelId(APP_USER_MODEL_ID)
Menu.setApplicationMenu(null)

markLaunch('app-ready')

function desktopRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..')
}

function overlayRoot(): string {
  return join(desktopRoot(), '..')
}

function repoRoot(): string {
  return join(overlayRoot(), '..')
}

function uiPath(...parts: string[]): string {
  return join(desktopRoot(), 'ui', ...parts)
}

function libFile(name: string): string {
  return join(dirname(fileURLToPath(import.meta.url)), name)
}

function iconPath(): string {
  const packaged = join(process.resourcesPath, 'icon.ico')
  const branding = join(desktopRoot(), 'branding', 'icon.ico')
  if (app.isPackaged && existsSync(packaged)) return packaged
  return branding
}

function prefsPath(): string {
  return join(app.getPath('userData'), 'desktop-prefs.json')
}

function loadPrefs(): AppPrefs {
  try {
    const raw = readFileSync(prefsPath(), 'utf8')
    return parsePrefs(JSON.parse(raw) as unknown)
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

function savePrefs(next: AppPrefs): void {
  mkdirSync(dirname(prefsPath()), { recursive: true })
  writeFileSync(prefsPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
}

function readJsonVersion(path: string): string | undefined {
  try {
    const v = (JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown }).version
    return typeof v === 'string' ? v : undefined
  } catch {
    return undefined
  }
}

function packagedPluginRoot(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'plugin')
  return join(overlayRoot(), 'plugin')
}

function seedVersions(): AppVersions {
  const embeddedPath = app.isPackaged
    ? join(process.resourcesPath, 'dsh', 'baf-product-versions.json')
    : join(overlayRoot(), 'desktop', 'resources', 'dsh', 'baf-product-versions.json')
  const embedded = readProductVersionsFile(embeddedPath)
  const versionFile = app.isPackaged
    ? join(process.resourcesPath, 'VERSION')
    : join(desktopRoot(), 'VERSION')

  const bafDsh = embedded?.bafDsh
    ?? readDesktopVersionFile(versionFile)
    ?? readJsonVersion(join(desktopRoot(), 'package.json'))
    ?? DEFAULT_VERSIONS.bafDsh
  const dsh = embedded?.dsh
    ?? readJsonVersion(join(repoRoot(), 'package.json'))
    ?? readJsonVersion(join(process.resourcesPath, 'dsh', 'package.json'))
    ?? DEFAULT_VERSIONS.dsh
  const pluginManifest = join(pluginDir(), 'plugin-manifest.json')
  const bafPlugin = embedded?.bafPlugin
    ?? readJsonVersion(pluginManifest)
    ?? readJsonVersion(join(packagedPluginRoot(), 'plugin-manifest.json'))
    ?? DEFAULT_VERSIONS.bafPlugin
  return {
    bafDsh,
    dsh,
    bafPlugin,
    bafCore: embedded?.bafCore ?? DEFAULT_VERSIONS.bafCore,
    bafWorkflow: embedded?.bafWorkflow ?? DEFAULT_VERSIONS.bafWorkflow,
    bafOpenspec: embedded?.bafOpenspec ?? DEFAULT_VERSIONS.bafOpenspec,
    bafStandard: embedded?.bafStandard ?? DEFAULT_VERSIONS.bafStandard,
    bafQuality: embedded?.bafQuality ?? DEFAULT_VERSIONS.bafQuality,
    bafGuard: embedded?.bafGuard ?? DEFAULT_VERSIONS.bafGuard,
    bafScaffold: embedded?.bafScaffold ?? DEFAULT_VERSIONS.bafScaffold,
    bafDshNotes: embedded?.bafDshNotes ?? DEFAULT_VERSIONS.bafDshNotes,
    dshNotes: embedded?.dshNotes ?? DEFAULT_VERSIONS.dshNotes,
    bafCoreNotes: embedded?.bafCoreNotes ?? DEFAULT_VERSIONS.bafCoreNotes,
    bafWorkflowNotes: embedded?.bafWorkflowNotes ?? DEFAULT_VERSIONS.bafWorkflowNotes,
    bafOpenspecNotes: embedded?.bafOpenspecNotes ?? DEFAULT_VERSIONS.bafOpenspecNotes,
    bafStandardNotes: embedded?.bafStandardNotes ?? DEFAULT_VERSIONS.bafStandardNotes,
    bafQualityNotes: embedded?.bafQualityNotes ?? DEFAULT_VERSIONS.bafQualityNotes,
    bafGuardNotes: embedded?.bafGuardNotes ?? DEFAULT_VERSIONS.bafGuardNotes,
    bafScaffoldNotes: embedded?.bafScaffoldNotes ?? DEFAULT_VERSIONS.bafScaffoldNotes,
  }
}

function readProductVersionsFile(path: string): AppVersions | undefined {
  try {
    if (!existsSync(path)) return undefined
    return parseVersions(JSON.parse(readFileSync(path, 'utf8')) as unknown)
  } catch {
    return undefined
  }
}

function pluginDir(): string {
  return join(app.getPath('userData'), 'plugin')
}

function runtimeDir(): string {
  return join(app.getPath('userData'), 'runtime')
}

function dshBin(): string {
  const hot = join(runtimeDir(), 'lib', 'bin.js')
  if (existsSync(hot)) return hot
  const hotNested = join(runtimeDir(), 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  if (existsSync(hotNested)) return hotNested
  if (app.isPackaged) {
    const nested = join(process.resourcesPath, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    const deployed = join(process.resourcesPath, 'dsh', 'lib', 'bin.js')
    if (existsSync(nested)) return nested
    return deployed
  }
  return join(repoRoot(), 'apps', 'cli', 'lib', 'bin.js')
}

function logLaunchFailure(detail: string): void {
  try {
    const dir = app.getPath('userData')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'launch-error.log'), `\n[${new Date().toISOString()}]\n${detail}\n`, 'utf8')
  } catch {
    // Logging must never block the user-facing dialog.
  }
}

function showLaunchError(technical: string): void {
  logLaunchFailure(technical)
  dialog.showErrorBox(APP_NAME, userFacingLaunchError(technical))
}

/** Sync optional plugin skills into ~/.dsh/skills. Official BAF presets are
 * shipped inside dsh-agent-presets (system trust) and must NEVER be copied into
 * ~/.dsh/.agent-presets (user trust). The sync is skipped on launches where
 * the source-tree fingerprint matches the marker recorded on the previous
 * sync — both avoid the per-launch directory walk and stay honest against
 * source content even when the installer rewrites mtimes. */
function syncPluginIntoDshHome(): void {
  const root = pluginDir()
  const dshHome = join(homedir(), '.dsh')
  const from = join(root, 'skills')
  const to = join(dshHome, 'skills')
  const marker = join(dshHome, 'plugin-skills-sync.json')
  syncSkillTree(from, to, marker)
}

let child: ChildProcess | undefined
let mainWindow: BrowserWindow | undefined
let splashWindow: BrowserWindow | undefined
let tray: Tray | undefined
let closeDialog: BrowserWindow | undefined
let quitting = false
let prefs: AppPrefs = { ...DEFAULT_PREFS }
let updateService: UpdateService | undefined

/**
 * 【变更】2026-10-06 (问题 2): a launch the OS auto-start entry started (it
 * registers `--hidden`). The whole boot stays background: no splash, the main
 * window loads hidden, and the tray appears instead.
 */
const hiddenLaunch = process.argv.includes('--hidden')

function killChildTree(): void {
  if (child?.pid === undefined) return
  const pid = child.pid
  child = undefined
  if (process.platform === 'win32') {
    spawn('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true, stdio: 'ignore' })
    return
  }
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // Process already gone.
    }
  }
}

function waitForReady(proc: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false
    let combined = ''
    const timeoutMs = readyTimeoutMs()
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error(`启动超时（${String(timeoutMs / 1000)}s）\n${combined.slice(-4000)}`))
    }, timeoutMs)

    let lineBuf = ''
    const onData = (chunk: Buffer | string): void => {
      const text = String(chunk)
      combined += text
      lineBuf += text
      const lines = lineBuf.split(/\r?\n/)
      lineBuf = lines.pop() ?? ''
      for (const line of lines) {
        const url = parseWebReadyUrl(line)
        if (url !== undefined) {
          if (settled) return
          settled = true
          clearTimeout(timer)
          proc.stdout?.off('data', onData)
          proc.stderr?.off('data', onData)
          resolve(url)
          return
        }
      }
    }

    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', onData)
    proc.once('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    proc.once('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(`进程在就绪前退出，code=${String(code)}\n${combined.slice(-4000)}`))
    })
  })
}

function showMainWindow(): void {
  if (mainWindow === undefined) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function ensureTray(): void {
  if (tray !== undefined) return
  const image = nativeImage.createFromPath(iconPath())
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image)
  tray.setToolTip(APP_NAME)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开窗口', click: () => showMainWindow() },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        quitting = true
        app.quit()
      },
    },
  ]))
  tray.on('double-click', () => showMainWindow())
}

function minimizeToTray(): void {
  ensureTray()
  mainWindow?.hide()
}

/**
 * 【变更】2026-10-06 (问题 2): mirror the launch-at-login pref into the OS
 * login entries (Windows Run key via Electron). The registered command reuses
 * this executable with `--hidden`, so an auto-started launch boots straight to
 * the tray — no splash wait (问题 2 的诉求), no window. Re-applied at every
 * boot so an entry deleted by hand (or by a cleaner) converges back to the pref.
 */
function applyLaunchAtLogin(enabled: boolean): void {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return
  try {
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] })
    } else {
      // Dev runs electron.exe directly, which needs the app directory as its
      // first argument to load this checkout — register THAT shape so the
      // toggle is real (and verifiable) in a dev build too.
      app.setLoginItemSettings({
        openAtLogin: enabled, path: process.execPath, args: [app.getAppPath(), '--hidden'],
      })
    }
  } catch (err) {
    logLaunchFailure(`设置开机自启动失败：${err instanceof Error ? err.message : String(err)}`)
  }
}

function applyCloseAction(action: Exclude<CloseAction, 'ask'>): void {
  if (action === 'tray') {
    setMainWindowScrim(false)
    minimizeToTray()
    return
  }
  quitting = true
  setMainWindowScrim(false)
  mainWindow?.destroy()
  app.quit()
}

function closeSplash(): void {
  if (splashWindow === undefined || splashWindow.isDestroyed()) return
  splashWindow.destroy()
  splashWindow = undefined
}

function openSplash(): void {
  splashWindow = new BrowserWindow({
    width: 380,
    // 【变更】2026-10-29 (批次三十七 · 用户问题 1): the panel grew from 300px
    // to 340px so the logo group can sit clear of the slow-start hint row
    // (see `.logos` margin-top in ui/splash.css) without crowding it.
    // 【变更】2026-10-30 (用户问题 1): the hint row came back too far — the
    // mark now clears it by ~18px, so the panel shrinks back to 324px and the
    // stack no longer floats over an empty band.
    height: 324,
    resizable: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: true,
    center: true,
    backgroundColor: '#00000000',
    title: APP_NAME,
    icon: iconPath(),
    webPreferences: {
      preload: libFile('preload-splash.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 【变更】2026-10-23 (批次十五 1): sandbox:false — the package emits ESM
      // preloads (type:module), and a sandboxed preload only ever loads as
      // CommonJS, so the bridge died silently and 后台启动 never reached the
      // main process. Same trusted-local-content posture as the dialog window.
      sandbox: false,
    },
  })
  const splashVersion = app.getVersion()
    || readJsonVersion(join(desktopRoot(), 'package.json'))
    || seedVersions().bafDsh
  void splashWindow.loadFile(uiPath('splash.html'), { query: { version: splashVersion } })
}

const CLOSE_SCRIM_ID = 'baf-close-scrim'

/** Dim + blur the main window while the close dialog is open. */
function setMainWindowScrim(active: boolean): void {
  try {
    const win = mainWindow
    if (win === undefined || win.isDestroyed()) return
    const contents = win.webContents
    if (contents === null || contents === undefined || contents.isDestroyed()) return
    const script = active
      ? `(() => {
          if (document.getElementById('${CLOSE_SCRIM_ID}')) return;
          const el = document.createElement('div');
          el.id = '${CLOSE_SCRIM_ID}';
          el.setAttribute('aria-hidden', 'true');
          el.style.cssText = [
            'position:fixed',
            'inset:0',
            'z-index:2147483647',
            'background:rgba(26,29,38,0.32)',
            'backdrop-filter:blur(8px)',
            '-webkit-backdrop-filter:blur(8px)',
            'pointer-events:none',
          ].join(';');
          document.documentElement.appendChild(el);
        })()`
      : `document.getElementById('${CLOSE_SCRIM_ID}')?.remove()`
    void contents.executeJavaScript(script).catch(() => {
      // Page may be mid-navigation or destroyed; ignore.
    })
  } catch {
    // Window may be mid-teardown; ignore.
  }
}

function openCloseDialog(): void {
  if (closeDialog !== undefined && !closeDialog.isDestroyed()) {
    closeDialog.focus()
    return
  }
  closeDialog = new BrowserWindow({
    width: 360,
    height: 280,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWindow,
    modal: true,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    title: 'BAF DSH',
    icon: iconPath(),
    webPreferences: {
      preload: libFile('preload-dialog.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  void closeDialog.loadFile(uiPath('close.html'))
  closeDialog.once('ready-to-show', () => {
    setMainWindowScrim(true)
    closeDialog?.show()
  })
  closeDialog.on('closed', () => {
    if (!quitting) setMainWindowScrim(false)
    closeDialog = undefined
  })
}

function handleWindowCloseRequest(): void {
  if (quitting) return
  if (prefs.closeAction === 'tray' || prefs.closeAction === 'quit') {
    applyCloseAction(prefs.closeAction)
    return
  }
  openCloseDialog()
}

async function createWindow(url: string): Promise<void> {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: APP_NAME,
    icon: iconPath(),
    frame: true,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: libFile('preload-desktop.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  mainWindow = window

  window.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    handleWindowCloseRequest()
  })

  window.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('file:')) {
      void shell.openExternal(target)
    }
    return { action: 'deny' }
  })

  // Reveal the main window as soon as the dsh web child has a URL: the splash
  // stays up while it can, and the renderer loads the React tree in the
  // background. Waiting for `loadURL` here would chain the splash onto the
  // web dist's first-paint, doubling perceived startup time.
  closeSplash()
  markLaunch('splash-closed')
  if (hiddenLaunch) {
    // 【变更】2026-10-06 (问题 2): auto-started launch — the window stays
    // hidden with the tray up; it still loads the app now so 打开窗口 from
    // the tray reveals an already-ready page.
    ensureTray()
  } else {
    markLaunch('main-shown')
    window.show()
  }
  // 【变更】2026-10-22 (批次十五 1): a 后台启动 launch just became ready —
  // the tray tooltip drops its starting note.
  tray?.setToolTip(APP_NAME)
  markLaunch('main-load-url')
  await window.loadURL(url)
}

/**
 * 【变更】2026-10-30 (升级途径迁移): the update channel is a GITLAB project —
 * the channel release af-channel-stable and the versioned releases live
 * there, and the manifest signature stays the trust anchor.
 */
function gitlabConfig(): { host: string, project: string, channelTag: string } {
  return {
    host: DEFAULT_UPDATE_HOST,
    project: DEFAULT_UPDATE_PROJECT,
    channelTag: DEFAULT_CHANNEL_TAG,
  }
}

function createUpdateService(): UpdateService {
  const userData = app.getPath('userData')
  // §11.3: packaged builds enforce signatures (test keys refused); dev builds
  // may skip only via BAF_UPDATE_ALLOW_UNSIGNED=1.
  setSignaturePackaged(app.isPackaged)
  return new UpdateService({
    userData,
    seedVersions: seedVersions(),
    gitlab: gitlabConfig(),
    pluginDir: pluginDir(),
    runtimeDir: runtimeDir(),
    stopChild: () => {
      killChildTree()
    },
    restartChild: async () => {
      try {
        await startDshAndShow()
        return true
      } catch {
        return false
      }
    },
    // Electron seam injected into the update engine (apply.ts stays testable).
    openInstaller: (setupPath) => {
      shell.openPath(setupPath)
    },
    clockSkewMs: 5 * 60 * 1000,
    onProgress: (p) => {
      mainWindow?.webContents.send('update:progress', p)
    },
  })
}

/**
 * Post-ready supervision for the dsh web child. `waitForReady` detaches its
 * pipe listeners once the ready URL appears, and nothing else consumed
 * stdout/stderr — so the child's logging could eventually stall on a full OS
 * pipe. Drain both continuously, and record a backend death that would
 * otherwise be invisible: the window keeps rendering the already-loaded app
 * while every client fetch fails with "Failed to fetch" and nothing lands in
 * launch-error.log. Intentional shutdowns (`killChildTree` clears `child`
 * before signalling) are excluded.
 * @param proc - the child that just reached ready.
 */
function watchChildAfterReady(proc: ChildProcess): void {
  const tail: string[] = []
  let tailLength = 0
  const drain = (chunk: Buffer | string): void => {
    const text = String(chunk)
    tail.push(text)
    tailLength += text.length
    while (tailLength > 4096 && tail.length > 1) {
      tailLength -= tail[0].length
      tail.shift()
    }
  }
  proc.stdout?.on('data', drain)
  proc.stderr?.on('data', drain)
  proc.once('exit', (code, signal) => {
    if (child !== proc) return
    logLaunchFailure(
      `后端在就绪后退出 code=${String(code)} signal=${String(signal)}\n`
      + `（窗口仍显示已加载的页面，但所有请求会以 Failed to fetch 失败）\n`
      + `stdout/stderr 末尾：\n${tail.join('').slice(-2000)}`,
    )
  })
}

async function startDshProcess(): Promise<string> {
  // Bypass the candidate walk when a prior launch cached a Node binary that
  // still satisfies the engines range. The cache is re-probed, not trusted: an
  // in-place Node upgrade out of range must fall through to the discovery loop
  // rather than spawn an unsupported interpreter. `BAF_DSH_BENCH_BASELINE=1`
  // forces that walk so the bench harness can A/B both paths on one machine.
  const baselineMode = process.env.BAF_DSH_BENCH_BASELINE === '1'
  const cached = baselineMode ? undefined : prefs.nodeBinary
  const node = cached !== undefined && isSupportedNodeBinary(cached)
    ? cached
    : findSupportedNode()
  if (node === undefined) throw new Error('未找到符合要求的 Node.js')
  if (cached !== node) {
    prefs = { ...prefs, nodeBinary: node }
    savePrefs(prefs)
  }
  if (app.isPackaged) {
    // NSIS packs node_modules as modules.zip; expand if Setup (or a prior run) did not.
    ensureDshModulesExpanded(join(process.resourcesPath, 'dsh'))
  }
  const bin = dshBin()
  if (!existsSync(bin)) throw new Error(`未找到 dsh 入口：${bin}`)
  mkdirSync(pluginDir(), { recursive: true })
  syncPluginIntoDshHome()
  // Featured-plugins install capability: run the bundled pnpm under the same
  // Node as the child; the child's profile plugin-manager layers this fact
  // over its base environment, so only the PATH delta rides along.
  const pnpmEntry = bundledPnpmEntry(app.isPackaged, process.resourcesPath, desktopRoot())
  // Curated manifest: hot-updated userData copy first, packaged seed fallback.
  const featuredManifest = featuredManifestPath(
    join(pluginDir(), 'featured-plugins.json'),
    join(packagedPluginRoot(), 'featured-plugins.json'),
  )
  markLaunch('dsh-spawn')
  child = spawn(node, [bin, 'web', '--host', '127.0.0.1', '--port', '0', '--no-open'], {
    cwd: homedir(),
    env: {
      ...process.env,
      DSH_TELEMETRY_DISABLED: process.env.DSH_TELEMETRY_DISABLED ?? '1',
      BAF_DSH_PLUGIN: pluginDir(),
      // §11.8/9.6: in-child `baf update status` reads this state file
      // (read-only) — the only child→main channel is env + files.
      BAF_DSH_UPDATE_STATE: updateStatePath(app.getPath('userData')),
      ...(pnpmEntry === undefined ? {} : { DSH_PACKAGE_MANAGER: packageManagerEnvJson(node, pnpmEntry, process.env.PATH) }),
      ...(featuredManifest === undefined ? {} : { BAF_DSH_FEATURED_MANIFEST: featuredManifest }),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const url = await waitForReady(child)
  markLaunch('dsh-ready')
  watchChildAfterReady(child)
  return url
}

async function startDshAndShow(): Promise<void> {
  const url = await startDshProcess()
  if (mainWindow !== undefined && !mainWindow.isDestroyed()) {
    await mainWindow.loadURL(url)
    return
  }
  await createWindow(url)
}

/**
 * §11.8/9.6 child→main update-command channel: the in-child
 * `baf update check|apply|rollback` commands write `update-request.json`
 * next to the state file (the child only knows that dir via env); this
 * watcher consumes it, dispatches through the UpdateService, and answers in
 * `update-response.json` matched by request id. The child polls that file —
 * no IPC surface is added for the child.
 */
function watchUpdateRequests(): void {
  const userData = app.getPath('userData')
  const requestPath = updateRequestPath(userData)
  const responsePath = updateResponsePath(userData)
  let handling = false
  watchFile(requestPath, { interval: 500 }, (cur) => {
    if (handling || cur.mtimeMs === 0 || cur.size === 0) return
    handling = true
    void (async () => {
      let raw: unknown
      try {
        raw = JSON.parse(readFileSync(requestPath, 'utf8'))
      } catch {
        raw = undefined
      }
      try {
        rmSync(requestPath, { force: true })
      } catch {
        // Best effort — a stale request is ignored by id mismatch anyway.
      }
      if (updateService === undefined) updateService = createUpdateService()
      const response = raw === undefined
        ? { id: 'unknown', command: 'check', ok: false, error: '请求文件不可解析' }
        : await updateService.dispatchUpdateRequest(raw)
      try {
        const tmp = `${responsePath}.tmp`
        writeFileSync(tmp, `${JSON.stringify(response)}\n`, 'utf8')
        renameSync(tmp, responsePath)
      } catch (err) {
        logLaunchFailure(`update-request 响应写入失败：${err instanceof Error ? err.message : String(err)}`)
      }
    })().finally(() => {
      handling = false
    })
  })
}

/**
 * 【变更】2026-10-25 (批次二十六 4): the update prompt is an IN-APP dialog.
 *
 * The operating system's message box put a Windows-styled panel in the middle
 * of an app that draws every other surface itself. The split now follows the
 * product's own grain: the shell owns the DECISION (which scope prompted,
 * whether the update is required, what applying it means) and the renderer
 * owns the DRAWING. The shell keeps the prompt until the next one, so a
 * renderer that mounted late still finds it (`update:getPrompt`).
 */
export type UpdatePromptPayload = {
  /** Prompt identity; the renderer shows the newest prompt only. */
  id: string
  /** Whether the shell refuses to keep running on the old version. */
  required: boolean
  /** One line naming the scopes and versions involved. */
  summaryZh: string
  /** The release notes — one point per line. */
  notesZh: string
  /** The version the update lands on. */
  targetVersion: string
}

/** The prompt the renderer has not answered yet. */
let pendingUpdatePrompt: UpdatePromptPayload | undefined

/**
 * Hand the update prompt to the renderer.
 * @param payload - the prompt facts.
 */
function pushUpdatePrompt(payload: Omit<UpdatePromptPayload, 'id'>): void {
  const full: UpdatePromptPayload = { id: `prompt-${Date.now().toString(36)}`, ...payload }
  pendingUpdatePrompt = full
  mainWindow?.webContents.send('update:prompt', full)
}

/**
 * After the main window is up, prompt if a background check found an update.
 * Failures / up-to-date are ignored here (settings page can re-check).
 * §11.7: the prompt decision is per scope — a REQUIRED harness installer
 * (forced security / minimum shell) blocks (立即更新/退出); anything else
 * (optional desktop installer, plugin/runtime hot update) offers 稍后.
 * 【变更】2026-10-25 (批次二十六 4): the prompt is no longer an operating-system
 * message box. The shell still decides to prompt here — a manual check on the
 * settings page stays on the page — and hands the renderer the facts; the
 * renderer draws the dialog and calls back through `update:start`.
 * @param checkPromise - in-flight check started during splash.
 */
async function promptUpdateAfterReady(
  checkPromise: Promise<CheckUpdateResult>,
): Promise<void> {
  if (updateService === undefined) return
  let result
  try {
    result = await checkPromise
  } catch {
    return
  }
  // 【变更】2026-10-04 (用户问题 3): the splash-time background check lands
  // here after the window is up — push it so the renderer (nav red dot,
  // 版本与更新 card) reflects it without waiting for a manual check.
  mainWindow?.webContents.send('update:checked', result)
  if (result.status !== 'available') return

  const scoped = updateService.getLastScoped()
  const harness = scoped?.plans.find(p => p.scope === 'harness')
  const required = harness !== undefined && harness.action === 'installer' && harness.required
  pushUpdatePrompt({
    required,
    summaryZh: result.plan.summaryZh,
    notesZh: result.plan.manifest.notesZh ?? '',
    targetVersion: result.plan.manifest.bafDsh,
  })
}

/**
 * 【变更】2026-10-22 (批次十五 1): the splash's 后台启动 — hide the splash and
 * let the boot finish headlessly; the tray appears so the wait stays visible
 * (tooltip says it is still starting), and createWindow shows the main window
 * the moment the backend is ready. Idempotent: a second click lands on a
 * hidden/destroyed window and no-ops.
 */
ipcMain.on('splash:bg-start', () => {
  if (splashWindow === undefined || splashWindow.isDestroyed()) return
  markLaunch('splash-bg-start')
  splashWindow.hide()
  ensureTray()
  tray?.setToolTip('BAF DSH — 正在后台启动…')
})

ipcMain.handle('prefs:get', () => prefs)

ipcMain.handle('prefs:set', (_event, raw: unknown) => {
  const before = prefs.launchAtLogin
  prefs = mergePrefs(prefs, raw)
  savePrefs(prefs)
  // 【变更】2026-10-06 (问题 2): the OS login entry follows the pref the moment
  // it changes, not on the next boot.
  if (prefs.launchAtLogin !== before) applyLaunchAtLogin(prefs.launchAtLogin)
  return prefs
})

/**
 * 【变更】2026-10-25 (批次二十六 3): raise an OS notification for a Session
 * that finished, failed, or blocks on the user. The renderer reports the
 * event; the shell decides — the `desktopNotifications` pref is the switch,
 * and owning it here means the setting takes effect without a reload.
 * Clicking the toast reveals the window, which is the whole point of the
 * reminder when the app sits in the tray.
 * @param payload - the renderer-reported event.
 * @returns whether the toast was shown.
 */
function showDesktopNotification(payload: DesktopNotificationPayload): boolean {
  if (!Notification.isSupported()) return false
  const notification = new Notification({
    title: payload.title,
    body: payload.body,
    silent: false,
  })
  notification.on('click', () => { showMainWindow() })
  notification.show()
  return true
}

ipcMain.handle('notify:desktop', (_event, raw: unknown) => {
  if (!prefs.desktopNotifications) return { shown: false }
  const payload = parseNotificationPayload(raw)
  if (payload === undefined) return { shown: false }
  return { shown: showDesktopNotification(payload) }
})

ipcMain.handle('update:getVersions', () => updateService?.getVersions() ?? seedVersions())
ipcMain.handle('update:check', async () => {
  if (updateService === undefined) updateService = createUpdateService()
  const result = await updateService.checkForUpdate()
  // 【变更】2026-10-04 (用户问题 3): push every check result to the renderer —
  // the Settings nav red dot and the 版本与更新 page stay fresh without polling.
  mainWindow?.webContents.send('update:checked', result)
  return result
})
ipcMain.handle('update:start', async () => {
  if (updateService === undefined) updateService = createUpdateService()
  const result = await updateService.startUpdate()
  // 【变更】2026-10-25 (批次二十六 4): the installer replaces the running files,
  // so the app steps aside once it launched. The native prompt used to own
  // that quit, which left the settings page's own update hanging in front of
  // an installer that could not replace a live executable.
  if (result.ok && result.launchedInstaller) {
    quitting = true
    setTimeout(() => { app.quit() }, 250)
  }
  return result
})
ipcMain.handle('update:lastCheck', () => updateService?.getLastCheck() ?? null)
ipcMain.handle('update:lastScoped', () => updateService?.getLastScoped() ?? null)
// 【变更】2026-10-25 (批次二十六 4): the pending update prompt, so a renderer
// that mounted after the shell pushed it still finds it.
ipcMain.handle('update:getPrompt', () => pendingUpdatePrompt ?? null)
// 【变更】2026-10-25 (批次二十六 4): the user answered the prompt. The shell
// forgets it, so a reloaded renderer does not raise a dialog the user already
// dismissed.
ipcMain.handle('update:dismissPrompt', () => {
  pendingUpdatePrompt = undefined
  return true
})
// 【变更】2026-10-25 (批次二十六 4): the in-app prompt's 「退出」 — a required
// update refuses to let the app keep running on the old version, and the
// renderer cannot end the process itself.
ipcMain.handle('app:quit', () => {
  quitting = true
  app.quit()
  return true
})

/**
 * 【变更】2026-10-20 (批次二 3.2): upstream DeepSeek Harness release notes for
 * the 版本与更新 page. The public releases list (prereleases included — /latest
 * 404s on rc-only history) is fetched through Electron's net so the system
 * proxy applies; the body's CHINESE section (between the `cn-` and `en-` anchor
 * headings upstream's bilingual template emits) is distilled to its first five
 * non-empty lines. Failures return null — the page keeps its static dshNotes.
 */
const DSH_RELEASES_URL = 'https://api.github.com/repos/deepseek-ai/deepseek-harness/releases?per_page=1'
const DSH_RELEASE_NOTES_TTL_MS = 30 * 60_000
/** 【变更】2026-10-20 (批次三 exe 冒烟): failure entries expire after a minute —
 * a null value used to be pinned for the full 30-minute TTL, hiding the block
 * long after the proxy recovered. The fetch itself aborts after 15s so a
 * stalled system proxy cannot leave concurrent invokes pending forever. */
const DSH_RELEASE_FAIL_TTL_MS = 60_000
const DSH_RELEASE_FETCH_TIMEOUT_MS = 15_000
type DshReleaseNotes = { tag: string; name: string; publishedAt: string; lines: string[] } | null
let dshReleaseNotesCache: { at: number; ttl: number; value: DshReleaseNotes } | undefined

/** Pull the Chinese section out of a bilingual release body, first five lines. */
function extractChineseReleaseLines(body: string): string[] {
  let cn = body
  const cnHeading = cn.indexOf('<h3 id="cn-')
  if (cnHeading >= 0) cn = cn.slice(cnHeading)
  const enHeading = cn.search(/<h3 id="en-/)
  if (enHeading >= 0) cn = cn.slice(0, enHeading)
  return cn
    .split(/\r?\n/)
    .map(line => line.replace(/<[^>]+>/g, '').trim())
    .map(line => (line.startsWith('- ') ? line.slice(2) : line))
    .filter(line => line.length > 0 && !line.startsWith('['))
    .slice(0, 5)
}

ipcMain.handle('update:dshReleaseNotes', async (): Promise<DshReleaseNotes> => {
  if (dshReleaseNotesCache !== undefined && Date.now() - dshReleaseNotesCache.at < dshReleaseNotesCache.ttl) {
    return dshReleaseNotesCache.value
  }
  let value: DshReleaseNotes = null
  try {
    const res = await net.fetch(DSH_RELEASES_URL, {
      headers: { 'User-Agent': 'baf-dsh-desktop' },
      signal: AbortSignal.timeout(DSH_RELEASE_FETCH_TIMEOUT_MS),
    })
    if (res.ok) {
      const releases = JSON.parse(await res.text()) as Array<{ tag_name?: unknown; name?: unknown; published_at?: unknown; body?: unknown }>
      const latest = Array.isArray(releases) ? releases[0] : undefined
      if (latest !== undefined && typeof latest.tag_name === 'string') {
        const lines = extractChineseReleaseLines(typeof latest.body === 'string' ? latest.body : '')
        if (lines.length > 0) {
          value = {
            tag: latest.tag_name,
            name: typeof latest.name === 'string' ? latest.name : latest.tag_name,
            publishedAt: typeof latest.published_at === 'string' ? latest.published_at : '',
            lines,
          }
        }
      }
    }
  } catch {
    value = null
  }
  dshReleaseNotesCache = {
    at: Date.now(),
    ttl: value === null ? DSH_RELEASE_FAIL_TTL_MS : DSH_RELEASE_NOTES_TTL_MS,
    value,
  }
  return value
})

ipcMain.handle('shell:openExternal', async (_event, raw: unknown) => {
  if (typeof raw !== 'string' || raw.trim() === '') return { ok: false, error: '无效 URL' }
  const url = raw.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file:')) {
    return { ok: false, error: '仅支持 http(s)/file URL' }
  }
  try {
    await shell.openExternal(url)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// 【变更】2026-10-26 (批次二十八 5): the 变更总览 ledger's 「在浏览器中打开」.
// The ledger renders a self-contained HTML board in the renderer and opens it
// through a `blob:` URL — but the window-open handler above forwards only
// http(s)/file URLs to the system browser, and a blob: URL belongs to the
// renderer anyway, so the board never left the app. The shell therefore
// writes the page to a temp file and opens THAT with the system browser.
ipcMain.handle('shell:openHtml', async (_event, payload: unknown) => {
  if (typeof payload !== 'object' || payload === null) return { ok: false, error: '无效内容' }
  const { html, name } = payload as { html?: unknown; name?: unknown }
  if (typeof html !== 'string' || html.trim() === '') return { ok: false, error: '无效内容' }
  // The file name lands on disk — keep it to a plain, bounded name.
  const fileName = typeof name === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(name)
    ? name
    : 'baf-dsh-board.html'
  try {
    const dir = join(app.getPath('temp'), 'baf-dsh')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, fileName)
    writeFileSync(file, html, 'utf8')
    await shell.openExternal(pathToFileURL(file).href)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// 【变更】2026-10-20 (批次五 1.3): the 状态脚本 script-file picker's native
// dialog (设置 → 工作流 → 项目工程). The renderer's hidden <input type="file">
// cannot preset an initial directory, so the preload bridge routes the click
// here: `defaultPath` is the workspace root the settings page reports, and
// the answer is the picked absolute path (null on cancel).
ipcMain.handle('baf:pickScriptFile', async (_event, defaultPath: unknown) => {
  const initial = typeof defaultPath === 'string' && defaultPath.trim() !== '' ? defaultPath : undefined
  const options = { properties: ['openFile'] as Array<'openFile'>, defaultPath: initial }
  // Modal to the main window when it exists; a windowless call still opens.
  const picked = mainWindow !== undefined && !mainWindow.isDestroyed()
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)
  if (picked.canceled) return null
  return picked.filePaths[0] ?? null
})

ipcMain.on('close-dialog:choice', (_event, payload: { action?: string, remember?: boolean }) => {
  const action = payload.action
  const remember = payload.remember === true
  const dialog = closeDialog
  closeDialog = undefined
  if (action === 'cancel' || action === undefined) {
    setMainWindowScrim(false)
    if (dialog !== undefined && !dialog.isDestroyed()) dialog.close()
    return
  }
  if (action !== 'tray' && action !== 'quit') {
    setMainWindowScrim(false)
    if (dialog !== undefined && !dialog.isDestroyed()) dialog.close()
    return
  }
  if (remember) {
    prefs = { ...prefs, closeAction: action }
    savePrefs(prefs)
  }
  // Clear scrim and apply before destroying the dialog, so closed handlers
  // do not race against a destroyed main window's webContents.
  applyCloseAction(action)
  if (dialog !== undefined && !dialog.isDestroyed()) dialog.close()
})

app.whenReady().then(async () => {
  prefs = loadPrefs()
  enableLaunchTimings(app.getPath('userData'))
  if (hiddenLaunch) {
    // 【变更】2026-10-06 (问题 2): auto-started launch — tray only, no splash
    // (开机后台自启动并最小化到托盘，不显示 splash 界面).
    ensureTray()
  } else {
    openSplash()
    markLaunch('splash-shown')
  }
  // Converge the OS login entry to the pref every boot (a hand-deleted entry
  // comes back; a stale entry from an uninstalled build does not linger).
  applyLaunchAtLogin(prefs.launchAtLogin)
  updateService = createUpdateService()

  const seedPlugin = packagedPluginRoot()
  if (existsSync(seedPlugin) && !existsSync(join(pluginDir(), 'plugin-manifest.json'))) {
    mkdirSync(pluginDir(), { recursive: true })
    cpSync(seedPlugin, pluginDir(), { recursive: true, force: true })
  }

  // Background check during splash; never block startup on network/UI.
  const checkPromise = updateService.checkForUpdate()
  watchUpdateRequests()

  try {
    await startDshAndShow()
  } catch (err) {
    closeSplash()
    killChildTree()
    showLaunchError(err instanceof Error ? err.message : String(err))
    app.quit()
    return
  }

  // A hidden auto-start never prompts: the update dialog is modal to a window
  // the person has not opened — the nav red dot carries the news instead.
  if (!hiddenLaunch) void promptUpdateAfterReady(checkPromise)
})

app.on('before-quit', () => {
  quitting = true
  closeSplash()
  killChildTree()
  tray?.destroy()
  tray = undefined
})

app.on('window-all-closed', () => {
  if (quitting) {
    killChildTree()
    app.quit()
  }
})
