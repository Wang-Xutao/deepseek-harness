/**
 * Session-header utilities that open the current workspace in VS Code / Cursor.
 */
import { useEffect, useState } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { CURSOR_ICON_DATA_URL } from './assets/cursor-icon.ts'
import { VSCODE_ICON_DATA_URL } from './assets/vscode-icon.ts'
import { readIdeBridge, type IdeAvailability } from './bridge.ts'
import type { BafDesktopKey } from './locales.ts'
import css from './IdeOpenButtons.module.css'

export type IdeOpenButtonsProps =
  PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<'baf.desktop'>

/**
 * Render IDE open buttons when the desktop shell reports available CLIs.
 * @param props - session header utility props.
 */
export function IdeOpenButtons({ sessionId, useSessions, t }: IdeOpenButtonsProps) {
  const [tools, setTools] = useState<IdeAvailability | undefined>()
  const [busy, setBusy] = useState<'vscode' | 'cursor' | null>(null)
  const cwd = useSessions(s => s.byId[sessionId]?.cwd)

  useEffect(() => {
    const bridge = readIdeBridge()
    if (bridge === undefined) return
    let cancelled = false
    void bridge.getIdeTools().then((next) => {
      if (!cancelled) setTools(next)
    })
    return () => { cancelled = true }
  }, [])

  if (tools === undefined || (!tools.vscode && !tools.cursor)) return null

  const open = async (ide: 'vscode' | 'cursor'): Promise<void> => {
    const bridge = readIdeBridge()
    if (bridge === undefined) return
    if (cwd === undefined || cwd.trim() === '') {
      window.alert(t('ide.noWorkspace'))
      return
    }
    setBusy(ide)
    try {
      const result = await bridge.openInIde(ide, cwd)
      if (!result.ok) window.alert(`${t('ide.failed')}：${result.error ?? ''}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={css.row} data-testid="ide-open-buttons">
      {tools.vscode ? (
        <Tooltip label={t('ide.openVscode')} side="bottom" delayMs={400}>
          <button
            type="button"
            className={css.btn}
            aria-label={t('ide.openVscode')}
            disabled={busy !== null}
            onClick={() => { void open('vscode') }}
          >
            <img className={css.icon} src={VSCODE_ICON_DATA_URL} alt="" width={16} height={16} />
          </button>
        </Tooltip>
      ) : null}
      {tools.cursor ? (
        <Tooltip label={t('ide.openCursor')} side="bottom" delayMs={400}>
          <button
            type="button"
            className={css.btn}
            aria-label={t('ide.openCursor')}
            disabled={busy !== null}
            onClick={() => { void open('cursor') }}
          >
            <img
              className={css.icon}
              src={CURSOR_ICON_DATA_URL}
              alt=""
              width={16}
              height={16}
            />
          </button>
        </Tooltip>
      ) : null}
    </div>
  )
}

// Keep the key type referenced for declaration merging consumers.
export type { BafDesktopKey }
