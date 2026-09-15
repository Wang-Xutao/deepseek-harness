/**
 * Version and update settings section (desktop Electron only for actions).
 */
import { useEffect, useState, type ReactElement } from 'react'
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

function VersionRow(props: {
  label: string
  version: string | undefined
  notes: string | undefined
}): ReactElement {
  const { label, version, notes } = props
  return (
    <li className={css.row}>
      <div className={css.rowMain}>
        <span className={css.label}>{label}</span>
        <span className={css.value}>{version ?? '—'}</span>
      </div>
      {notes !== undefined && notes.length > 0 ? (
        <p className={css.notes}>{notes}</p>
      ) : null}
    </li>
  )
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

  const updateAvailable = check?.status === 'available'
  const canUpdate = updateAvailable && busy === null
  const availablePlan = updateAvailable ? check.plan : undefined
  const planRecord = availablePlan as (typeof availablePlan & {
    manifest?: { bafDsh?: string; notesZh?: string }
  }) | undefined
  const targetVersion = planRecord === undefined
    ? undefined
    : (planRecord.targetBafDsh
      ?? planRecord.manifest?.bafDsh
      ?? planRecord.summaryZh)
  const updateNotes = planRecord === undefined
    ? undefined
    : (planRecord.notesZh
      || planRecord.manifest?.notesZh
      || planRecord.summaryZh)

  return (
    <div className={css.section} data-testid="updates-section">
      <h2 className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      <ul className={css.rows}>
        <VersionRow
          label={t('labelBaf')}
          version={versions?.bafDsh}
          notes={versions?.bafDshNotes}
        />
        <VersionRow
          label={t('labelDsh')}
          version={versions?.dsh}
          notes={versions?.dshNotes}
        />
      </ul>
      <h3 className={css.subtitle}>{t('packagesHeading')}</h3>
      <ul className={css.rows}>
        <VersionRow
          label={t('labelBafCore')}
          version={versions?.bafCore}
          notes={versions?.bafCoreNotes}
        />
        <VersionRow
          label={t('labelBafWorkflow')}
          version={versions?.bafWorkflow}
          notes={versions?.bafWorkflowNotes}
        />
        <VersionRow
          label={t('labelBafOpenspec')}
          version={versions?.bafOpenspec}
          notes={versions?.bafOpenspecNotes}
        />
        <VersionRow
          label={t('labelBafStandard')}
          version={versions?.bafStandard}
          notes={versions?.bafStandardNotes}
        />
        <VersionRow
          label={t('labelBafQuality')}
          version={versions?.bafQuality}
          notes={versions?.bafQualityNotes}
        />
        <VersionRow
          label={t('labelBafGuard')}
          version={versions?.bafGuard}
          notes={versions?.bafGuardNotes}
        />
        <VersionRow
          label={t('labelBafScaffold')}
          version={versions?.bafScaffold}
          notes={versions?.bafScaffoldNotes}
        />
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
        {updateAvailable ? (
          <button
            type="button"
            className={css.btnPrimary}
            disabled={!canUpdate}
            onClick={() => { void onUpdate() }}
          >
            {busy === 'update' ? t('updating') : t('update')}
          </button>
        ) : null}
      </div>
      {updateAvailable ? (
        <div className={css.updateCard} data-testid="update-available-card">
          <p className={css.updateLine}>
            <span className={css.updateLabel}>{t('updateTarget')}</span>
            <span className={css.updateValue}>{targetVersion}</span>
          </p>
          {updateNotes !== undefined && updateNotes.length > 0 ? (
            <p className={css.updateLine}>
              <span className={css.updateLabel}>{t('updateNotes')}</span>
              <span className={css.updateValue}>{updateNotes}</span>
            </p>
          ) : null}
        </div>
      ) : null}
      {progress ? <p className={css.status}>{t('progress')}：{progress}</p> : null}
      {message ? (
        <p className={check?.status === 'error' ? css.statusError : css.status}>{message}</p>
      ) : null}
    </div>
  )
}
