/** Shared Electron bridge shape used by the updates settings page. */

export type DesktopVersions = {
  bafDsh: string
  dsh: string
  bafPlugin: string
}

export type DesktopPrefs = {
  closeAction: 'ask' | 'tray' | 'quit'
}

export type CheckUpdateResult =
  | { status: 'up-to-date'; versions: DesktopVersions; checkedAt: string }
  | {
    status: 'available'
    versions: DesktopVersions
    plan: { summaryZh: string; force: boolean }
    checkedAt: string
  }
  | { status: 'error'; versions: DesktopVersions; error: string; checkedAt: string }

export type ApplyUpdateResult = {
  ok: boolean
  versions: DesktopVersions
  error?: string
  launchedInstaller?: boolean
}

export type BafDesktopBridge = {
  isDesktop: true
  getPrefs: () => Promise<DesktopPrefs>
  setPrefs: (prefs: Partial<DesktopPrefs>) => Promise<DesktopPrefs>
  getVersions: () => Promise<DesktopVersions>
  checkForUpdate: () => Promise<CheckUpdateResult>
  startUpdate: () => Promise<ApplyUpdateResult>
  getLastCheckResult: () => Promise<CheckUpdateResult | null>
  onUpdateProgress: (cb: (payload: { message: string }) => void) => () => void
}

declare global {
  interface Window {
    bafDesktop?: BafDesktopBridge
  }
}

/**
 * @returns the desktop bridge when running inside baf-dsh Electron.
 */
export function readBridge(): BafDesktopBridge | undefined {
  if (typeof window === 'undefined') return undefined
  const bridge = window.bafDesktop
  if (bridge === undefined || bridge.isDesktop !== true) return undefined
  if (typeof bridge.getVersions !== 'function') return undefined
  return bridge
}
