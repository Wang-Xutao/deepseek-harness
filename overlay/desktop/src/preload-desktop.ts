import { contextBridge, ipcRenderer } from 'electron'

export type DesktopVersions = {
  bafDsh: string
  dsh: string
  bafPlugin: string
}

contextBridge.exposeInMainWorld('bafDesktop', {
  isDesktop: true,
  getPrefs: () => ipcRenderer.invoke('prefs:get'),
  setPrefs: (prefs: unknown) => ipcRenderer.invoke('prefs:set', prefs),
  getVersions: () => ipcRenderer.invoke('update:getVersions') as Promise<DesktopVersions>,
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  startUpdate: () => ipcRenderer.invoke('update:start'),
  getLastCheckResult: () => ipcRenderer.invoke('update:lastCheck'),
  onUpdateProgress: (cb: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
      cb(payload)
    }
    ipcRenderer.on('update:progress', listener)
    return () => {
      ipcRenderer.off('update:progress', listener)
    }
  },
})
