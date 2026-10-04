/**
 * 【变更】2026-10-04 (用户问题 3): nav-row red dot for「版本与更新」.
 *
 * Reads the overlay Electron shell's `window.bafDesktop` bridge directly —
 * the same local-bridge pattern DesktopClosePrefs.tsx uses — because the
 * shell must not depend on the ui-settings-updates plugin (cross-plugin
 * collaboration goes through services; the injected global IS the service
 * here). Sources: the retained last check result plus the `update:checked`
 * push the shell fires after every check, so the dot appears after the
 * splash-time background check without the section ever mounting.
 */

import { useEffect, useState } from 'react'

/** Minimal structural view of the shell bridge this hook needs. */
type BafDesktopUpdateBridge = {
  isDesktop: true
  getLastCheckResult?: () => Promise<{ status?: string } | null>
  onCheckResult?: (cb: (result: { status?: string }) => void) => () => void
}

function readBridge(): BafDesktopUpdateBridge | undefined {
  if (typeof window === 'undefined') return undefined
  const bridge = (window as Window & { bafDesktop?: BafDesktopUpdateBridge }).bafDesktop
  if (bridge === undefined || bridge.isDesktop !== true) return undefined
  return bridge
}

/**
 * Whether the baf-dsh shell reports an available update.
 * @returns true only inside Electron with an `available` check result.
 */
export function useBafUpdateAvailable(): boolean {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    const bridge = readBridge()
    if (bridge === undefined) return
    let cancelled = false
    const apply = (result: { status?: string } | null): void => {
      if (!cancelled) setAvailable(result?.status === 'available')
    }
    void bridge.getLastCheckResult?.().then(apply).catch(() => { /* dot stays hidden */ })
    const off = bridge.onCheckResult?.(apply)
    return () => {
      cancelled = true
      off?.()
    }
  }, [])
  return available
}
