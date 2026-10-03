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
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  shell,
} from 'electron'
import { ensureDshModulesExpanded } from './ensure-dsh-modules.ts'
import { findSupportedNode, isSupportedNodeBinary } from './find-node.ts'
import { enableWrites as enableLaunchTimings, mark as markLaunch } from './launch-timings.ts'
import { syncSkillTree } from './plugin-sync.ts'
import { mergePrefs, parsePrefs, type AppPrefs, type CloseAction, DEFAULT_PREFS } from './prefs.ts'
import { readyTimeoutMs } from './ready-timeout.ts'
import { parseWebReadyUrl } from './ready-url.ts'
import { DEFAULT_CHANNEL_TAG, DEFAULT_UPDATE_OWNER, DEFAULT_UPDATE_REPO } from './update/defaults.ts'
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
    height: 300,
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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  void splashWindow.loadFile(uiPath('splash.html'))
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
  markLaunch('main-shown')
  window.show()
  markLaunch('main-load-url')
  await window.loadURL(url)
}

function githubConfig(): { owner: string, repo: string, channelTag: string } {
  return {
    owner: DEFAULT_UPDATE_OWNER,
    repo: DEFAULT_UPDATE_REPO,
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
    github: githubConfig(),
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
 * After the main window is up, prompt if a background check found an update.
 * Failures / up-to-date are ignored here (settings page can re-check).
 * §11.7: the prompt decision is per scope — a REQUIRED harness installer
 * (forced security / minimum shell) blocks (立即更新/退出); anything else
 * (optional desktop installer, plugin/runtime hot update) offers 稍后.
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
  if (result.status !== 'available') return

  const scoped = updateService.getLastScoped()
  const harness = scoped?.plans.find(p => p.scope === 'harness')
  const required = harness !== undefined && harness.action === 'installer' && harness.required
  const buttons = required ? ['立即更新', '退出'] : ['立即更新', '稍后更新']
  const { response } = await dialog.showMessageBox(mainWindow!, {
    type: 'info',
    title: APP_NAME,
    message: required ? '必须更新后才能继续使用' : '发现新版本',
    detail: result.plan.summaryZh + (result.plan.manifest.notesZh ? `\n\n${result.plan.manifest.notesZh}` : ''),
    buttons,
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  })

  if (response === 1) {
    if (required) {
      quitting = true
      app.quit()
    }
    return
  }

  const applied = await updateService.startUpdate()
  if (!applied.ok) {
    dialog.showErrorBox(APP_NAME, applied.error ?? '更新失败')
    if (required) {
      quitting = true
      app.quit()
    }
    return
  }
  if (applied.launchedInstaller) {
    quitting = true
    app.quit()
  }
}

ipcMain.handle('prefs:get', () => prefs)

ipcMain.handle('prefs:set', (_event, raw: unknown) => {
  prefs = mergePrefs(prefs, raw)
  savePrefs(prefs)
  return prefs
})

ipcMain.handle('update:getVersions', () => updateService?.getVersions() ?? seedVersions())
ipcMain.handle('update:check', async () => {
  if (updateService === undefined) updateService = createUpdateService()
  return updateService.checkForUpdate()
})
ipcMain.handle('update:start', async () => {
  if (updateService === undefined) updateService = createUpdateService()
  return updateService.startUpdate()
})
ipcMain.handle('update:lastCheck', () => updateService?.getLastCheck() ?? null)
ipcMain.handle('update:lastScoped', () => updateService?.getLastScoped() ?? null)

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
  openSplash()
  markLaunch('splash-shown')
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

  void promptUpdateAfterReady(checkPromise)
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
