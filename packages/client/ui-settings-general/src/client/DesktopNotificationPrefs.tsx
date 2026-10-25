/**
 * 【变更】2026-10-25 (批次二十六 3): desktop-only notification switch. Shown
 * when Electron injects window.bafDesktop. The shell owns the pref and
 * decides whether a reported Session event reaches the operating system, so
 * the switch takes effect without a reload.
 * Same Setting-Cell chrome as the launch-at-login row; same Switch as
 * developer tools.
 */
import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './DesktopNotificationPrefs.module.css'

/** Bridge injected by overlay/desktop preload, typed for this row's fields. */
export type BafDesktopNotificationBridge = {
  isDesktop: true
  getPrefs: () => Promise<{ desktopNotifications?: boolean }>
  setPrefs: (prefs: { desktopNotifications: boolean }) => Promise<{ desktopNotifications?: boolean }>
}

export type DesktopNotificationPrefsProps =
  PropsRuntime<'settings.section'> & PropsLocale<'settings'>

function readBridge(): BafDesktopNotificationBridge | undefined {
  if (typeof window === 'undefined') return undefined
  const bridge = (window as Window & { bafDesktop?: BafDesktopNotificationBridge }).bafDesktop
  if (bridge === undefined || bridge.isDesktop !== true) return undefined
  return bridge
}

/**
 * General-settings row for 桌面通知.
 * @param props - settings section props.
 * @returns the switch row, or null outside Electron.
 */
export function DesktopNotificationPrefs({ t }: DesktopNotificationPrefsProps) {
  const [bridge, setBridge] = useState<BafDesktopNotificationBridge | undefined>(() => readBridge())
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
      setEnabled(prefs.desktopNotifications === true)
      setReady(true)
    })
    return () => { cancelled = true }
  }, [])

  if (bridge === undefined) return null

  return (
    <div className={css.row} data-testid="desktop-notification-prefs">
      <div className={css.rowText}>
        <div className={css.title}>{t('desktopNotification.title')}</div>
        <div className={css.desc}>{t('desktopNotification.description')}</div>
        {failed && <div className={css.error} role="alert">{t('desktopNotification.error')}</div>}
      </div>
      <Switch
        checked={enabled}
        disabled={!ready}
        label={t('desktopNotification.title')}
        onChange={(next) => {
          setFailed(false)
          setEnabled(next)
          void bridge.setPrefs({ desktopNotifications: next }).catch(() => { setFailed(true) })
        }}
      />
    </div>
  )
}
