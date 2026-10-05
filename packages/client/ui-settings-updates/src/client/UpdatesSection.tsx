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

/**
 * 【变更】2026-10-04 (用户问题 3): a silent re-check runs when the last result
 * is missing, failed, or older than this. The host already checks once during
 * splash, so fresh sessions do not refetch — only stale ones do.
 */
const AUTO_RECHECK_STALE_MS = 30 * 60_000

/** Whether a retained check result is too old (or failed) to trust silently. */
function isStale(result: CheckUpdateResult | null): boolean {
  if (result === null || result.status === 'error') return true
  const checkedAt = Date.parse(result.checkedAt)
  return !Number.isFinite(checkedAt) || Date.now() - checkedAt > AUTO_RECHECK_STALE_MS
}

/** Split a notes blob into display paragraphs (one per non-empty line). */
function noteParagraphs(notes: string | undefined): readonly string[] {
  if (notes === undefined) return []
  return notes.split('\n').map(line => line.trim()).filter(line => line.length > 0)
}

/** Join CSS-module class names, dropping the ones the sheet lacks. */
function joinClasses(...names: ReadonlyArray<string | undefined>): string {
  return names.filter(name => name !== undefined && name !== '').join(' ')
}

function VersionRow(props: {
  label: string
  version: string | undefined
  notes: string | undefined
  /** 【变更】2026-10-05 (插件包说明): static plain-language description of what the row's package DOES. */
  desc?: string
}): ReactElement {
  const { label, version, notes, desc } = props
  // 【变更】2026-10-04 (用户问题 1): notes render one paragraph per line —
  // version-notes.json now carries concise multi-line copy instead of one
  // wall of text.
  const paragraphs = noteParagraphs(notes)
  return (
    <li className={css.row}>
      <div className={css.rowMain}>
        <span className={css.label}>{label}</span>
        <span className={css.value}>{version ?? '—'}</span>
      </div>
      {desc === undefined ? undefined : <p className={css.desc}>{desc}</p>}
      {paragraphs.map(line => <p key={line} className={css.notes}>{line}</p>)}
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
      if (cancelled) return
      setCheck(r)
      // 【变更】2026-10-04 (用户问题 3): 自动获取最新版本 — silently refetch
      // when the retained result is missing/failed/stale. Errors stay silent;
      // the manual button remains the loud path.
      if (isStale(r)) {
        void live.checkForUpdate().then((result) => {
          if (cancelled) return
          setCheck(result)
          setVersions(result.versions)
        }).catch(() => { /* silent auto-check */ })
      }
    })
    // Host push after every check (splash, manual, this page's own auto-check):
    // keeps the card and the nav red dot fresh without polling.
    const offChecked = live.onCheckResult?.((result) => {
      if (cancelled) return
      setCheck(result)
      setVersions(result.versions)
    })
    const off = live.onUpdateProgress((p) => {
      setProgress(p.message)
    })
    return () => {
      cancelled = true
      offChecked?.()
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
    } catch (error) {
      // 【变更】2026-10-06 (问题 6): transport failures surface inline under the
      // buttons too (the check state drives the regular status lines).
      setMessage(`${t('error')}：${String(error)}`)
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
  // 【变更】2026-10-06 (问题 6): the latest version the check knows about —
  // the plan target when an update exists, the running version when current,
  // unknown on a failed check.
  const latestVersion = check === null
    ? undefined
    : check.status === 'available'
      ? targetVersion
      : check.status === 'up-to-date'
        ? check.versions.bafDsh
        : '—'

  return (
    <div className={css.section} data-testid="updates-section">
      <h2 className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      {/* 【变更】2026-10-04 (用户问题 3): the check/update actions lead the page
          instead of trailing the package list — checking is the page's primary
          action, and an available update must be visible without scrolling. */}
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
      {/* 【变更】2026-10-06 (问题 6): the check output lives DIRECTLY under the
          buttons — status line with the full error sentence on failure, and
          the current + latest version pair — never stranded at the page
          bottom. */}
      {check !== null ? (
        <div
          className={check.status === 'error' ? joinClasses(css.checkResult, css.checkResultError) : css.checkResult}
          data-testid="update-check-result"
        >
          <p className={css.checkStatus}>
            {check.status === 'error'
              ? `${t('error')}：${check.error}`
              : check.status === 'available'
                ? `${t('available')}：${check.plan.summaryZh}`
                : t('upToDate')}
          </p>
          <p className={css.checkVersions}>
            <span>{t('currentVersion')}：{check.versions.bafDsh}</span>
            <span>{t('latestVersion')}：{latestVersion}</span>
          </p>
        </div>
      ) : null}
      {progress ? <p className={css.status}>{t('progress')}：{progress}</p> : null}
      {message ? (
        <p className={check?.status === 'error' ? css.statusError : css.status}>{message}</p>
      ) : null}
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
      {/* 【变更】2026-10-05 (插件包说明): each package row carries a static
          plain-language description under its name — the release notes say
          what CHANGED, this says what the package IS. */}
      <p className={css.packagesHint}>{t('packagesHint')}</p>
      {/* 【变更】2026-10-06 (问题 6): the hot-upgrade path the packages ALSO
          support — /baf-update without an app restart. */}
      <p className={css.packagesHint}>{t('hotUpgradeHint')}</p>
      <ul className={css.rows}>
        <VersionRow
          label={t('labelBafCore')}
          version={versions?.bafCore}
          notes={versions?.bafCoreNotes}
          desc={t('descBafCore')}
        />
        <VersionRow
          label={t('labelBafWorkflow')}
          version={versions?.bafWorkflow}
          notes={versions?.bafWorkflowNotes}
          desc={t('descBafWorkflow')}
        />
        <VersionRow
          label={t('labelBafOpenspec')}
          version={versions?.bafOpenspec}
          notes={versions?.bafOpenspecNotes}
          desc={t('descBafOpenspec')}
        />
        <VersionRow
          label={t('labelBafStandard')}
          version={versions?.bafStandard}
          notes={versions?.bafStandardNotes}
          desc={t('descBafStandard')}
        />
        <VersionRow
          label={t('labelBafQuality')}
          version={versions?.bafQuality}
          notes={versions?.bafQualityNotes}
          desc={t('descBafQuality')}
        />
        <VersionRow
          label={t('labelBafGuard')}
          version={versions?.bafGuard}
          notes={versions?.bafGuardNotes}
          desc={t('descBafGuard')}
        />
        <VersionRow
          label={t('labelBafScaffold')}
          version={versions?.bafScaffold}
          notes={versions?.bafScaffoldNotes}
          desc={t('descBafScaffold')}
        />
      </ul>
    </div>
  )
}
