export type CloseAction = 'ask' | 'tray' | 'quit'

export type AppPrefs = {
  /** What to do when the window close button is pressed. */
  closeAction: CloseAction
}

export const DEFAULT_PREFS: AppPrefs = {
  closeAction: 'ask',
}

export function parsePrefs(raw: unknown): AppPrefs {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULT_PREFS }
  const closeAction = (raw as { closeAction?: unknown }).closeAction
  if (closeAction === 'ask' || closeAction === 'tray' || closeAction === 'quit') {
    return { closeAction }
  }
  return { ...DEFAULT_PREFS }
}
