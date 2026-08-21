/**
 * Desktop-only close preference row. Shown when Electron injects window.bafDesktop.
 * Uses the same Setting-Cell + Menu chrome as Language / EnterBehavior rows.
 */
import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './DesktopClosePrefs.module.css'

/** Close preference persisted by the Electron shell. */
export type DesktopCloseAction = 'ask' | 'tray' | 'quit'

/** Bridge injected by overlay/desktop preload. */
export type BafDesktopBridge = {
  isDesktop: true
  getPrefs: () => Promise<{ closeAction: DesktopCloseAction }>
  setPrefs: (prefs: { closeAction: DesktopCloseAction }) => Promise<{ closeAction: DesktopCloseAction }>
}

declare global {
  interface Window {
    bafDesktop?: BafDesktopBridge
  }
}

export type DesktopClosePrefsProps =
  PropsRuntime<'settings.section'> & PropsLocale<'settings'>

const OPTIONS: readonly DesktopCloseAction[] = ['ask', 'tray', 'quit']

function readBridge(): BafDesktopBridge | undefined {
  if (typeof window === 'undefined') return undefined
  const bridge = window.bafDesktop
  if (bridge === undefined || bridge.isDesktop !== true) return undefined
  return bridge
}

/**
 * General-settings footer for desktop close behavior.
 * @param props - settings section props.
 * @returns the preference block, or null outside Electron.
 */
export function DesktopClosePrefs({ t }: DesktopClosePrefsProps) {
  const [bridge, setBridge] = useState<BafDesktopBridge | undefined>(() => readBridge())
  const [closeAction, setCloseAction] = useState<DesktopCloseAction>('ask')
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const live = readBridge()
    if (live === undefined) return
    setBridge(live)
    let cancelled = false
    void live.getPrefs().then((prefs) => {
      if (cancelled) return
      setCloseAction(prefs.closeAction)
      setReady(true)
    })
    return () => { cancelled = true }
  }, [])

  if (bridge === undefined) return null

  const persist = (next: DesktopCloseAction): void => {
    setCloseAction(next)
    void bridge.setPrefs({ closeAction: next })
  }

  const labelKey =
    closeAction === 'tray' ? 'desktopClose.tray'
      : closeAction === 'quit' ? 'desktopClose.quit'
        : 'desktopClose.ask'

  return (
    <div className={css.row} data-testid="desktop-close-prefs">
      <div className={css.rowText}>
        <div className={css.title}>{t('desktopClose.title')}</div>
        <div className={css.desc}>{t('desktopClose.description')}</div>
      </div>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={OPTIONS.map(id => ({
          id,
          label: t(
            id === 'tray' ? 'desktopClose.tray'
              : id === 'quit' ? 'desktopClose.quit'
                : 'desktopClose.ask',
          ),
        }))}
        selectedId={closeAction}
        onSelect={(id) => {
          setOpen(false)
          if (id === 'ask' || id === 'tray' || id === 'quit') persist(id)
        }}
        align="end"
        portal
        anchor={(
          <button
            type="button"
            className={css.selector}
            aria-label={t('desktopClose.title')}
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={!ready}
            onClick={() => { setOpen(value => !value) }}
          >
            {t(labelKey)}
            <IconChevronDownOutline14 className={css.chevron} />
          </button>
        )}
      />
    </div>
  )
}
