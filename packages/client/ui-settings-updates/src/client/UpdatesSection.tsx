/**
 * Version and update settings section (desktop Electron only for actions).
 */
import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  readBridge,
  type BafDesktopBridge,
  type CheckUpdateResult,
  type DesktopVersions,
} from './bridge.ts'
import type { UpdatesSettingsKey } from './locales.ts'
import css from './UpdatesSection.module.css'

export type UpdatesSectionProps =
  PropsRuntime<'settings.section'> & PropsLocale<'settings.updates'>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.updates': UpdatesSettingsKey
  }
}

/**
 * Settings page body for versions and updates.
 * @param props - settings section props with locale.
 */
export function UpdatesSection({ t }: UpdatesSectionProps) {
  const [bridge, setBridge] = useState<BafDesktopBridge | undefined>(() => readBridge())
  const [versions, setVersions] = useState<DesktopVersions | undefined>()
  const [check, setCheck] = useState<CheckUpdateResult | null>(null)
  const [busy, setBusy] = useState<'check' | 'update' | null>(null)
  const [progress, setProgress] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const live = readBridge()
    setBridge(live)
    if (live === undefined) return
    let cancelled = false
    void live.getVersions().then((v) => {
      if (!cancelled) setVersions(v)
    })
    void live.getLastCheckResult().then((r) => {
      if (!cancelled) setCheck(r)
    })
    const off = live.onUpdateProgress((p) => {
      setProgress(p.message)
    })
    return () => {
      cancelled = true
      off()
    }
  }, [])

  if (bridge === undefined) {
    return (
      <div className={css.section} data-testid="updates-section-web">
        <h2 className={css.title}>{t('title')}</h2>
        <p className={css.intro}>{t('desktopOnly')}</p>
      </div>
    )
  }

  const onCheck = async (): Promise<void> => {
    setBusy('check')
    setMessage('')
    try {
      const result = await bridge.checkForUpdate()
      setCheck(result)
      setVersions(result.versions)
      if (result.status === 'up-to-date') setMessage(t('upToDate'))
      else if (result.status === 'available') setMessage(`${t('available')}：${result.plan.summaryZh}`)
      else setMessage(`${t('error')}：${result.error}`)
    } finally {
      setBusy(null)
    }
  }

  const onUpdate = async (): Promise<void> => {
    setBusy('update')
    setMessage('')
    try {
      const result = await bridge.startUpdate()
      setVersions(result.versions)
      if (result.ok) {
        setMessage(result.launchedInstaller ? '安装程序已启动' : t('upToDate'))
        setCheck({ status: 'up-to-date', versions: result.versions, checkedAt: new Date().toISOString() })
      } else {
        setMessage(result.error ?? t('error'))
      }
    } finally {
      setBusy(null)
      setProgress('')
    }
  }

  const canUpdate = check?.status === 'available' && busy === null

  return (
    <div className={css.section} data-testid="updates-section">
      <h2 className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      <ul className={css.rows}>
        <li className={css.row}>
          <span className={css.label}>{t('labelBaf')}</span>
          <span className={css.value}>{versions?.bafDsh ?? '—'}</span>
        </li>
        <li className={css.row}>
          <span className={css.label}>{t('labelDsh')}</span>
          <span className={css.value}>{versions?.dsh ?? '—'}</span>
        </li>
        <li className={css.row}>
          <span className={css.label}>{t('labelPlugin')}</span>
          <span className={css.value}>{versions?.bafPlugin ?? '—'}</span>
        </li>
      </ul>
      <div className={css.actions}>
        <button
          type="button"
          className={css.btn}
          disabled={busy !== null}
          onClick={() => { void onCheck() }}
        >
          {busy === 'check' ? t('checking') : t('check')}
        </button>
        <button
          type="button"
          className={css.btnPrimary}
          disabled={!canUpdate}
          onClick={() => { void onUpdate() }}
        >
          {busy === 'update' ? t('updating') : t('update')}
        </button>
      </div>
      {progress ? <p className={css.status}>{t('progress')}：{progress}</p> : null}
      {message ? (
        <p className={check?.status === 'error' ? css.statusError : css.status}>{message}</p>
      ) : null}
    </div>
  )
}
