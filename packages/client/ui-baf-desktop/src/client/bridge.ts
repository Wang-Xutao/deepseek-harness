/**
 * Electron bridge helpers shared by baf desktop chrome components.
 */

export type IdeAvailability = {
  vscode: boolean
  cursor: boolean
}

export type BafDesktopIdeBridge = {
  isDesktop: true
  getIdeTools: () => Promise<IdeAvailability>
  openInIde: (ide: 'vscode' | 'cursor', folderPath: string) => Promise<{ ok: boolean; error?: string }>
}

declare global {
  interface Window {
    bafDesktop?: BafDesktopIdeBridge & Record<string, unknown>
  }
}

/**
 * @returns the desktop bridge when running inside baf-dsh Electron.
 */
export function readIdeBridge(): BafDesktopIdeBridge | undefined {
  if (typeof window === 'undefined') return undefined
  const bridge = window.bafDesktop
  if (bridge === undefined || bridge.isDesktop !== true) return undefined
  if (typeof bridge.getIdeTools !== 'function' || typeof bridge.openInIde !== 'function') return undefined
  return bridge as BafDesktopIdeBridge
}
