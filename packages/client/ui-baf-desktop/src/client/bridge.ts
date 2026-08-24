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
  openExternal?: (url: string) => Promise<{ ok: boolean; error?: string }>
}

declare global {
  interface Window {
    bafDesktop?: BafDesktopIdeBridge & Record<string, unknown>
  }
}

/** Relative path of the shipped MkDocs site (same origin as the web shell). */
export const HELP_DOCS_PATH = '/help/index.html'

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

/**
 * Absolute URL for the in-app help site.
 * @returns same-origin `/help/index.html` when `window` exists; otherwise the relative path.
 */
export function resolveHelpDocsUrl(): string {
  if (typeof window === 'undefined' || window.location?.origin === undefined) return HELP_DOCS_PATH
  try {
    return new URL(HELP_DOCS_PATH, window.location.origin).href
  } catch {
    return HELP_DOCS_PATH
  }
}

/**
 * Open the help site in the system browser (Electron) or a new tab.
 * @param url - absolute help URL.
 */
export function openHelpExternal(url: string): void {
  const bridge = readIdeBridge()
  if (bridge?.openExternal !== undefined) {
    void bridge.openExternal(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
