import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('bafDialog', {
  getPrefs: () => ipcRenderer.invoke('prefs:get'),
  setPrefs: (prefs: unknown) => ipcRenderer.invoke('prefs:set', prefs),
  closeChoice: (payload: { action: 'tray' | 'quit' | 'cancel'; remember: boolean }) =>
    ipcRenderer.send('close-dialog:choice', payload),
  settingsDone: () => ipcRenderer.send('settings:done'),
})
