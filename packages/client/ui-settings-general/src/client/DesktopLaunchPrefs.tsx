/**
 * 【变更】2026-10-06 (问题 2): desktop-only launch-at-login switch. Shown when
 * Electron injects window.bafDesktop; the shell mirrors the pref into the OS
 * login entries (auto-start runs `--hidden`: background, tray, no splash).
 * Same Setting-Cell chrome as the close-pref row; same Switch as developer tools.
 */
import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './DesktopLaunchPrefs.module.css'

/** Bridge injected by overlay/desktop preload, typed for this row's fields. */
export type BafDesktopLaunchBridge = {
  isDesktop: true
  getPrefs: () => Promise<{ launchAtLogin?: boolean }>
  setPrefs: (prefs: { launchAtLogin: boolean }) => Promise<{ launchAtLogin?: boolean }>
}

export type DesktopLaunchPrefsProps =
  PropsRuntime<'settings.section'> & PropsLocale<'settings'>

function readBridge(): BafDesktopLaunchBridge | undefined {
  if (typeof window === 'undefined') return undefined
  const bridge = (window as Window & { bafDesktop?: BafDesktopLaunchBridge }).bafDesktop
  if (bridge === undefined || bridge.isDesktop !== true) return undefined
  return bridge
}

/**
 * General-settings row for 开机自启动.
 * @param props - settings section props.
 * @returns the switch row, or null outside Electron.
 */
export function DesktopLaunchPrefs({ t }: DesktopLaunchPrefsProps) {
  const [bridge, setBridge] = useState<BafDesktopLaunchBridge | undefined>(() => readBridge())
  const [enabled, setEnabled] = useState(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const live = readBridge()
    if (live === undefined) return
    setBridge(live)
    let cancelled = false
    void live.getPrefs().then((prefs) => {
      if (cancelled) return
      setEnabled(prefs.launchAtLogin === true)
      setReady(true)
    })
    return () => { cancelled = true }
  }, [])

  if (bridge === undefined) return null

  return (
    <div className={css.row} data-testid="desktop-launch-prefs">
      <div className={css.rowText}>
        <div className={css.title}>{t('desktopLaunch.title')}</div>
        <div className={css.desc}>{t('desktopLaunch.description')}</div>
        {failed && <div className={css.error} role="alert">{t('desktopLaunch.error')}</div>}
      </div>
      <Switch
        checked={enabled}
        disabled={!ready}
        label={t('desktopLaunch.title')}
        onChange={(next) => {
          setFailed(false)
          setEnabled(next)
          void bridge.setPrefs({ launchAtLogin: next }).catch(() => { setFailed(true) })
        }}
      />
    </div>
  )
}
