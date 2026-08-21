import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('bafDesktop', {
  isDesktop: true,
  getPrefs: () => ipcRenderer.invoke('prefs:get'),
  setPrefs: (prefs: unknown) => ipcRenderer.invoke('prefs:set', prefs),
})
