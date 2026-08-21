import { spawn, type ChildProcess } from 'node:child_process'
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
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
} from 'electron'
import { findSupportedNode } from './find-node.ts'
import { parsePrefs, type AppPrefs, type CloseAction, DEFAULT_PREFS } from './prefs.ts'
import { parseWebReadyUrl } from './ready-url.ts'
import { DEFAULT_CHANNEL_TAG, DEFAULT_UPDATE_OWNER, DEFAULT_UPDATE_REPO } from './update/defaults.ts'
import { UpdateService, type CheckUpdateResult } from './update/service.ts'
import { userFacingLaunchError } from './user-errors.ts'
import { DEFAULT_VERSIONS, type AppVersions } from './versions.ts'

const APP_USER_MODEL_ID = 'com.baf.dsh.desktop'
const APP_NAME = 'baf-dsh'
const READY_TIMEOUT_MS = 90_000

app.setAppUserModelId(APP_USER_MODEL_ID)
Menu.setApplicationMenu(null)

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
  const bafDsh = readJsonVersion(join(desktopRoot(), 'package.json')) ?? DEFAULT_VERSIONS.bafDsh
  const dsh = readJsonVersion(join(repoRoot(), 'package.json'))
    ?? readJsonVersion(join(process.resourcesPath, 'dsh', 'package.json'))
    ?? DEFAULT_VERSIONS.dsh
  const pluginManifest = join(pluginDir(), 'plugin-manifest.json')
  const bafPlugin = readJsonVersion(pluginManifest)
    ?? readJsonVersion(join(packagedPluginRoot(), 'plugin-manifest.json'))
    ?? DEFAULT_VERSIONS.bafPlugin
  return { bafDsh, dsh, bafPlugin }
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

/** Sync BAF plugin packs into ~/.dsh. Pack entries should use baf-prefixed ids to avoid clobbering user presets. */
function syncPluginIntoDshHome(): void {
  const root = pluginDir()
  const dshHome = join(homedir(), '.dsh')
  const pairs: Array<[string, string]> = [
    [join(root, 'agent-presets'), join(dshHome, '.agent-presets')],
    [join(root, 'skills'), join(dshHome, 'skills')],
  ]
  for (const [from, to] of pairs) {
    if (!existsSync(from)) continue
    mkdirSync(to, { recursive: true })
    // Copy each child so pack layout matches discovery (one child = one preset/skill).
    for (const name of readdirSync(from)) {
      if (name === '.gitkeep' || name === '.DS_Store') continue
      const src = join(from, name)
      const dest = join(to, name)
      cpSync(src, dest, { recursive: true, force: true })
    }
  }
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
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error(`启动超时（${String(READY_TIMEOUT_MS / 1000)}s）\n${combined.slice(-4000)}`))
    }, READY_TIMEOUT_MS)

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
    minimizeToTray()
    return
  }
  quitting = true
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
    width: 360,
    height: 280,
    resizable: false,
    frame: false,
    transparent: true,
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

function openCloseDialog(): void {
  if (closeDialog !== undefined && !closeDialog.isDestroyed()) {
    closeDialog.focus()
    return
  }
  closeDialog = new BrowserWindow({
    width: 400,
    height: 300,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWindow,
    modal: true,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    title: APP_NAME,
    icon: iconPath(),
    webPreferences: {
      preload: libFile('preload-dialog.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  void closeDialog.loadFile(uiPath('close.html'))
  closeDialog.once('ready-to-show', () => closeDialog?.show())
  closeDialog.on('closed', () => {
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

  await window.loadURL(url)
  closeSplash()
  window.show()
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
    onProgress: (p) => {
      mainWindow?.webContents.send('update:progress', p)
    },
  })
}

async function startDshProcess(): Promise<string> {
  const node = findSupportedNode()
  if (node === undefined) throw new Error('未找到符合要求的 Node.js')
  const bin = dshBin()
  if (!existsSync(bin)) throw new Error(`未找到 dsh 入口：${bin}`)
  mkdirSync(pluginDir(), { recursive: true })
  syncPluginIntoDshHome()
  child = spawn(node, [bin, 'web', '--host', '127.0.0.1', '--port', '0', '--no-open'], {
    cwd: homedir(),
    env: {
      ...process.env,
      DSH_TELEMETRY_DISABLED: process.env.DSH_TELEMETRY_DISABLED ?? '1',
      BAF_DSH_PLUGIN: pluginDir(),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  return waitForReady(child)
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
 * After the main window is up, prompt if a background check found an update.
 * Failures / up-to-date are ignored here (settings page can re-check).
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

  const force = result.plan.force
  const buttons = force ? ['立即更新', '退出'] : ['立即更新', '稍后更新']
  const { response } = await dialog.showMessageBox(mainWindow!, {
    type: 'info',
    title: APP_NAME,
    message: force ? '必须更新后才能继续使用' : '发现新版本',
    detail: result.plan.summaryZh + (result.plan.manifest.notesZh ? `\n\n${result.plan.manifest.notesZh}` : ''),
    buttons,
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  })

  if (response === 1) {
    if (force) {
      quitting = true
      app.quit()
    }
    return
  }

  const applied = await updateService.startUpdate()
  if (!applied.ok) {
    dialog.showErrorBox(APP_NAME, applied.error ?? '更新失败')
    if (force) {
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
  prefs = parsePrefs(raw)
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

ipcMain.on('close-dialog:choice', (_event, payload: { action?: string, remember?: boolean }) => {
  const action = payload.action
  const remember = payload.remember === true
  if (closeDialog !== undefined && !closeDialog.isDestroyed()) {
    closeDialog.close()
  }
  closeDialog = undefined
  if (action === 'cancel' || action === undefined) return
  if (action !== 'tray' && action !== 'quit') return
  if (remember) {
    prefs = { ...prefs, closeAction: action }
    savePrefs(prefs)
  }
  applyCloseAction(action)
})

app.whenReady().then(async () => {
  prefs = loadPrefs()
  openSplash()
  updateService = createUpdateService()

  const seedPlugin = packagedPluginRoot()
  if (existsSync(seedPlugin) && !existsSync(join(pluginDir(), 'plugin-manifest.json'))) {
    mkdirSync(pluginDir(), { recursive: true })
    cpSync(seedPlugin, pluginDir(), { recursive: true, force: true })
  }

  // Background check during splash; never block startup on network/UI.
  const checkPromise = updateService.checkForUpdate()

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
