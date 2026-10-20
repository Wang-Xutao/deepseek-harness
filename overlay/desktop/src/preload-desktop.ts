import { contextBridge, ipcRenderer, webUtils } from 'electron'

export type DesktopVersions = {
  bafDsh: string
  dsh: string
  bafPlugin: string
  bafCore?: string
  bafWorkflow?: string
  bafOpenspec?: string
  bafStandard?: string
  bafQuality?: string
  bafGuard?: string
  bafScaffold?: string
  bafDshNotes?: string
  dshNotes?: string
  bafCoreNotes?: string
  bafWorkflowNotes?: string
  bafOpenspecNotes?: string
  bafStandardNotes?: string
  bafQualityNotes?: string
  bafGuardNotes?: string
  bafScaffoldNotes?: string
}

/** 【变更】2026-10-20 (批次二 3.2): upstream release notes for the updates page. */
export type DshReleaseNotes = { tag: string; name: string; publishedAt: string; lines: string[] } | null

/**
 * 【变更】2026-10-20 (批次四 3.6): renderer-side File → absolute-path bridge for
 * the 状态脚本 script-file picker (设置 → 工作流 → 项目工程). The renderer owns a
 * hidden <input type="file">; this turns its File into the absolute path so the
 * client can prefill the workspace-relative script path. Plain web has no
 * bridge — the client falls back to the bare file name.
 */
contextBridge.exposeInMainWorld('__BAF_FILE_PICKER__', {
  pathFor: (file: File) => webUtils.getPathForFile(file),
})

contextBridge.exposeInMainWorld('bafDesktop', {
  isDesktop: true,
  getPrefs: () => ipcRenderer.invoke('prefs:get'),
  setPrefs: (prefs: unknown) => ipcRenderer.invoke('prefs:set', prefs),
  getVersions: () => ipcRenderer.invoke('update:getVersions') as Promise<DesktopVersions>,
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  startUpdate: () => ipcRenderer.invoke('update:start'),
  getLastCheckResult: () => ipcRenderer.invoke('update:lastCheck'),
  getDshReleaseNotes: () => ipcRenderer.invoke('update:dshReleaseNotes') as Promise<DshReleaseNotes>,
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  onUpdateProgress: (cb: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
      cb(payload)
    }
    ipcRenderer.on('update:progress', listener)
    return () => {
      ipcRenderer.off('update:progress', listener)
    }
  },
  // 【变更】2026-10-04 (用户问题 3): push channel for fresh check results —
  // the shell fires it after the splash background check and every manual check.
  onCheckResult: (cb: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
      cb(payload)
    }
    ipcRenderer.on('update:checked', listener)
    return () => {
      ipcRenderer.off('update:checked', listener)
    }
  },
})