/**
 * Publish whether any featured plugin has an update, for the settings nav red
 * dot. Uses a window-scoped signal so SettingsRoot (ui-settings-general) can
 * read it without a cross-plugin value import (client purity).
 */

const EVENT = 'baf-featured-plugins-update'
const FLAG = '__bafFeaturedPluginsUpdateAvailable'

type FeaturedUpdateWindow = Window & { [FLAG]?: boolean }

/**
 * Publish the featured-plugins update-available flag.
 * @param available - true when at least one card carries `updateAvailable`.
 */
export function setFeaturedPluginsUpdateAvailable(available: boolean): void {
  if (typeof window === 'undefined') return
  const win = window as FeaturedUpdateWindow
  if (win[FLAG] === available) return
  win[FLAG] = available
  win.dispatchEvent(new CustomEvent(EVENT, { detail: available }))
}

/**
 * Subscribe to featured-plugins update-available changes (test / nav hook).
 * @param listener - called whenever the flag changes.
 * @returns disposer.
 */
export function subscribeFeaturedPluginsUpdateAvailable(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const win = window as FeaturedUpdateWindow
  const handler = (): void => { listener() }
  win.addEventListener(EVENT, handler)
  return () => { win.removeEventListener(EVENT, handler) }
}

/**
 * Snapshot of the featured-plugins update-available flag.
 * @returns true when any featured plugin reports an update.
 */
export function getFeaturedPluginsUpdateAvailable(): boolean {
  if (typeof window === 'undefined') return false
  return (window as FeaturedUpdateWindow)[FLAG] === true
}
