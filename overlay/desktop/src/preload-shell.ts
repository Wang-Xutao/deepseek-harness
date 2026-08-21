import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('bafShell', {
  minimize: () => ipcRenderer.send('shell:minimize'),
  maximize: () => ipcRenderer.send('shell:maximize'),
  close: () => ipcRenderer.send('shell:close'),
})
