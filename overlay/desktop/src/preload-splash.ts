import { contextBridge, ipcRenderer } from 'electron'

/**
 * 【变更】2026-10-22 (批次十五 1): the splash renderer's only bridge — the
 * 后台启动 button. The splash window is sandbox:false (the package emits ESM
 * preloads; a sandboxed preload would load as CommonJS and die silently), so
 * this preload is the page's sole channel back to the main process.
 */
contextBridge.exposeInMainWorld('bafSplash', {
  backgroundStart: () => ipcRenderer.send('splash:bg-start'),
})
