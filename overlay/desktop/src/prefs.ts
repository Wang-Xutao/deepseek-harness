export type CloseAction = 'ask' | 'tray' | 'quit'

export type AppPrefs = {
  /** What to do when the window close button is pressed. */
  closeAction: CloseAction
  /**
   * 【变更】2026-10-06 (问题 2): whether the app starts with Windows login.
   * When enabled the shell registers itself with a `--hidden` argument, so an
   * auto-started launch runs in the background (tray, no splash) until opened.
   */
  launchAtLogin: boolean
  /**
   * Node binary path that satisfied the engines range on a prior launch.
   * Cached to skip probing every Windows PATH / Program Files candidate
   * (`spawnSync('node -v')` × N) on subsequent starts.
   */
  nodeBinary?: string
}

export const DEFAULT_PREFS: AppPrefs = {
  closeAction: 'ask',
  launchAtLogin: false,
}

/**
 * Apply one renderer-supplied prefs patch over the live prefs.
 *
 * Each settings row owns one field — `closeAction` or `launchAtLogin` — so the
 * patch applies just the fields the renderer actually sent, per field, and a
 * patch naming no known field leaves the prefs object identical.
 * Replacing the whole document with a payload would drop the shell-owned
 * {@link AppPrefs.nodeBinary} cache.
 * @param current - the live prefs.
 * @param raw - the renderer's patch, as received over IPC.
 * @returns the merged prefs; `current` unchanged when the patch names no known field.
 */
export function mergePrefs(current: AppPrefs, raw: unknown): AppPrefs {
  if (raw === null || typeof raw !== 'object') return current
  const record = raw as { closeAction?: unknown, launchAtLogin?: unknown }
  const closeAction = record.closeAction
  const launchAtLogin = record.launchAtLogin
  const close: CloseAction =
    closeAction === 'ask' || closeAction === 'tray' || closeAction === 'quit'
      ? closeAction
      : current.closeAction
  const launch = typeof launchAtLogin === 'boolean' ? launchAtLogin : current.launchAtLogin
  if (close === current.closeAction && launch === current.launchAtLogin) return current
  return { ...current, closeAction: close, launchAtLogin: launch }
}

/**
 * Parse a persisted prefs document.
 * @param raw - the parsed JSON document.
 * @returns the prefs, with unknown or malformed fields replaced by defaults.
 */
export function parsePrefs(raw: unknown): AppPrefs {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULT_PREFS }
  const record = raw as { closeAction?: unknown, launchAtLogin?: unknown, nodeBinary?: unknown }
  const closeAction = record.closeAction
  const launchAtLogin = record.launchAtLogin
  const nodeBinary = record.nodeBinary
  const close: CloseAction =
    closeAction === 'ask' || closeAction === 'tray' || closeAction === 'quit'
      ? closeAction
      : DEFAULT_PREFS.closeAction
  const launch = launchAtLogin === true
  const node = typeof nodeBinary === 'string' && nodeBinary.length > 0 ? nodeBinary : undefined
  return { closeAction: close, launchAtLogin: launch, ...node !== undefined ? { nodeBinary: node } : {} }
}
