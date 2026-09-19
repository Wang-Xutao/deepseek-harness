/**
 * Electron bridge helpers shared by baf desktop chrome components.
 */

export type BafDesktopBridge = {
  isDesktop: true
  openExternal?: (url: string) => Promise<{ ok: boolean; error?: string }>
  /**
   * Single source of truth for the running desktop shell's version. The
   * Settings page consumes the same call, so the sidebar wordmark cannot
   * drift from the Settings UI without the bridge breaking too.
   */
  getVersions?: () => Promise<DesktopVersions>
}

export type DesktopVersions = {
  bafDsh: string
  dsh: string
  bafPlugin?: string
  bafCore?: string
  bafWorkflow?: string
  bafOpenspec?: string
  bafStandard?: string
  bafQuality?: string
  bafGuard?: string
  bafScaffold?: string
}

declare global {
  interface Window {
    bafDesktop?: BafDesktopBridge & Record<string, unknown>
  }
}

/** Relative path of the shipped MkDocs site (same origin as the web shell). */
export const HELP_DOCS_PATH = '/help/index.html'

/**
 * @returns the desktop bridge when running inside baf-dsh Electron.
 */
export function readDesktopBridge(): BafDesktopBridge | undefined {
  if (typeof window === 'undefined') return undefined
  const bridge = window.bafDesktop
  if (bridge === undefined || bridge.isDesktop !== true) return undefined
  return bridge as BafDesktopBridge
}

/**
 * Read the running desktop shell version (`baf-dsh`) from the Electron bridge.
 * Falls back to `undefined` when running outside Electron (web build) or when
 * the bridge does not expose `getVersions`; consumers must handle that case
 * (the sidebar shows no version capsule; the settings page shows '—').
 * @returns version string, or undefined when unavailable.
 */
export async function readBafDshVersion(): Promise<string | undefined> {
  const bridge = readDesktopBridge()
  if (bridge?.getVersions === undefined) return undefined
  try {
    const versions = await bridge.getVersions()
    return typeof versions.bafDsh === 'string' && versions.bafDsh.length > 0
      ? versions.bafDsh
      : undefined
  } catch {
    return undefined
  }
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
  const bridge = readDesktopBridge()
  if (bridge?.openExternal !== undefined) {
    void bridge.openExternal(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
