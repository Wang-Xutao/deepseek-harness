/**
 * Settings nav red dot for「推荐插件」while any featured card has an update.
 *
 * Reads the window-scoped signal published by ui-settings-featured-plugins —
 * same local-bridge pattern as {@link useBafUpdateAvailable}, so this shell
 * never value-imports the featured-plugins feature plugin (client purity).
 */

import { useSyncExternalStore } from 'react'

const EVENT = 'baf-featured-plugins-update'
const FLAG = '__bafFeaturedPluginsUpdateAvailable'

type FeaturedUpdateWindow = Window & { [FLAG]?: boolean }

function subscribe(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const win = window as FeaturedUpdateWindow
  win.addEventListener(EVENT, listener)
  return () => { win.removeEventListener(EVENT, listener) }
}

function snapshot(): boolean {
  if (typeof window === 'undefined') return false
  return (window as FeaturedUpdateWindow)[FLAG] === true
}

/**
 * Whether the featured-plugins section reports at least one plugin update.
 * @returns true when the window-scoped nav signal is set.
 */
export function useFeaturedPluginsUpdateAvailable(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
