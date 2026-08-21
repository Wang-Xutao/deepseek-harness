import { spawn, type ChildProcess } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
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
import { userFacingLaunchError } from './user-errors.ts'

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

function dshBin(): string {
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

let child: ChildProcess | undefined
let mainWindow: BrowserWindow | undefined
let splashWindow: BrowserWindow | undefined
let tray: Tray | undefined
let closeDialog: BrowserWindow | undefined
let quitting = false
let prefs: AppPrefs = { ...DEFAULT_PREFS }

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

ipcMain.handle('prefs:get', () => prefs)

ipcMain.handle('prefs:set', (_event, raw: unknown) => {
  prefs = parsePrefs(raw)
  savePrefs(prefs)
  return prefs
})

ipcMain.on('close-dialog:choice', (_event, payload: { action?: string; remember?: boolean }) => {
  const action = payload.action
  const remember = payload.remember === true
  if (closeDialog !== undefined && !closeDialog.isDestroyed()) {
    closeDialog.close()
  }
  closeDialog = undefined
  if (action === 'cancel' || action === undefined) return
  if (action !== 'tray' && action !== 'quit') return
  if (remember) {
    prefs = { closeAction: action }
    savePrefs(prefs)
  }
  applyCloseAction(action)
})

app.whenReady().then(async () => {
  prefs = loadPrefs()
  openSplash()

  const node = findSupportedNode()
  if (node === undefined) {
    closeSplash()
    showLaunchError('未找到符合要求的 Node.js')
    app.quit()
    return
  }
  const bin = dshBin()
  if (!existsSync(bin)) {
    closeSplash()
    showLaunchError(`未找到 dsh 入口：${bin}`)
    app.quit()
    return
  }
  child = spawn(node, [bin, 'web', '--host', '127.0.0.1', '--port', '0'], {
    cwd: homedir(),
    env: {
      ...process.env,
      DSH_TELEMETRY_DISABLED: process.env.DSH_TELEMETRY_DISABLED ?? '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  try {
    const url = await waitForReady(child)
    await createWindow(url)
  } catch (err) {
    closeSplash()
    killChildTree()
    showLaunchError(err instanceof Error ? err.message : String(err))
    app.quit()
  }
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
