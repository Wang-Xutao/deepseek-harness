export type CloseAction = 'ask' | 'tray' | 'quit'

export type AppPrefs = {
  /** What to do when the window close button is pressed. */
  closeAction: CloseAction
  /**
   * Node binary path that satisfied the engines range on a prior launch.
   * Cached to skip probing every Windows PATH / Program Files candidate
   * (`spawnSync('node -v')` × N) on subsequent starts.
   */
  nodeBinary?: string
}

export const DEFAULT_PREFS: AppPrefs = {
  closeAction: 'ask',
}

/**
 * Apply one renderer-supplied prefs patch over the live prefs.
 *
 * The settings row owns `closeAction` only, so replacing the whole document
 * with its payload would drop the shell-owned {@link AppPrefs.nodeBinary}
 * cache; the patch applies just the fields the renderer actually sent.
 * @param current - the live prefs.
 * @param raw - the renderer's patch, as received over IPC.
 * @returns the merged prefs; `current` unchanged when the patch names no known field.
 */
export function mergePrefs(current: AppPrefs, raw: unknown): AppPrefs {
  if (raw === null || typeof raw !== 'object') return current
  const closeAction = (raw as { closeAction?: unknown }).closeAction
  if (closeAction !== 'ask' && closeAction !== 'tray' && closeAction !== 'quit') return current
  return { ...current, closeAction }
}

/**
 * Parse a persisted prefs document.
 * @param raw - the parsed JSON document.
 * @returns the prefs, with unknown or malformed fields replaced by defaults.
 */
export function parsePrefs(raw: unknown): AppPrefs {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULT_PREFS }
  const record = raw as { closeAction?: unknown, nodeBinary?: unknown }
  const closeAction = record.closeAction
  const nodeBinary = record.nodeBinary
  const close: CloseAction =
    closeAction === 'ask' || closeAction === 'tray' || closeAction === 'quit'
      ? closeAction
      : DEFAULT_PREFS.closeAction
  const node = typeof nodeBinary === 'string' && nodeBinary.length > 0 ? nodeBinary : undefined
  return { closeAction: close, ...node !== undefined ? { nodeBinary: node } : {} }
}
