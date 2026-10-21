/**
 * Featured plugins settings section: the curated cards, their per-state
 * actions, the bulk bar, and the confirmations the Host's compatibility and
 * build gates ask for.
 * 【变更】2026-10-22 (批次十一 2): an always-present 导出/导入 row — export saves
 * the effective recommended list as a `featured-plugins.json` config file;
 * import validates a chosen file whole and replaces the list with it.
 */
import { useRef } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { FeaturedSectionFace } from './featured-store.ts'
import type { FeaturedPluginCard } from '@deepseek-ai/dsh-api-remotes/client'
import type { FeaturedSettingsKey } from './locales.ts'
import css from './FeaturedSection.module.css'

export type FeaturedSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.featured'>
  & InjectFace<FeaturedSectionFace>

/** The label each card state's badge shows. */
function stateKey(state: FeaturedPluginCard['state']): FeaturedSettingsKey {
  switch (state) {
    case 'not-installed': return 'stateNotInstalled'
    case 'enabled': return 'stateEnabled'
    case 'disabled': return 'stateDisabled'
    default: return 'stateUnavailable'
  }
}

/**
 * 【变更】2026-10-06 (问题 7): refusal codes the notice translates into locale
 * sentences — the raw code (`management-required`) never reaches the person.
 */
const NOTICE_REASONS: Readonly<Record<string, FeaturedSettingsKey>> = {
  'management-required': 'reasonManagementRequired',
}

/** One card's action buttons for its state, minus the one busy running. */
function CardActions(props: {
  t: (key: FeaturedSettingsKey) => string
  card: FeaturedPluginCard
  busy: boolean
  disabled: boolean
  onInstall(): void
  onUpdate(): void
  onSetEnabled(enabled: boolean): void
  onRemove(): void
}) {
  const { t, card, busy, disabled } = props
  const anyBusy = busy || disabled
  if (card.state === 'unavailable') return null
  return (
    <div className={css.cardActions}>
      {card.state === 'not-installed' ? (
        <button type="button" className={css.btnPrimary} disabled={anyBusy} data-testid="featured-install" onClick={props.onInstall}>
          {t(busy ? 'installing' : 'install')}
        </button>
      ) : null}
      {card.state === 'enabled' ? (
        <button type="button" className={css.btn} disabled={anyBusy} data-testid="featured-disable" onClick={() => { props.onSetEnabled(false) }}>
          {t('disable')}
        </button>
      ) : null}
      {card.state === 'disabled' ? (
        <button type="button" className={css.btnPrimary} disabled={anyBusy} data-testid="featured-enable" onClick={() => { props.onSetEnabled(true) }}>
          {t('enable')}
        </button>
      ) : null}
      {card.state !== 'not-installed' && card.updateAvailable ? (
        <button type="button" className={css.btnPrimary} disabled={anyBusy} data-testid="featured-update" onClick={props.onUpdate}>
          {t(busy ? 'updating' : 'update')}
        </button>
      ) : null}
      {card.state !== 'not-installed' ? (
        <button type="button" className={css.btnDanger} disabled={anyBusy} data-testid="featured-remove" onClick={props.onRemove}>
          {t(busy ? 'removing' : 'remove')}
        </button>
      ) : null}
    </div>
  )
}

/**
 * Settings page body for featured plugins.
 * @param props - settings section props with locale and the section face.
 */
export function FeaturedSection(props: FeaturedSectionProps) {
  const { t } = props
  const state = props.useFeaturedSection(snapshot => snapshot)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const cardBusy = (id: string): boolean => state.busy?.id === id
  const anyRun = state.busy !== undefined || state.bulk !== undefined
  // 【变更】2026-10-22 (批次十一 2): an import/export in flight blocks the
  // other buttons too — the whole list is what either touches.
  const configBusy = state.exporting || state.importing
  // 批次十一 2: the Host's import success carries its own localized sentence
  // (with the applied count); a plain ok keeps the generic word.
  const runExport = async (): Promise<void> => {
    const text = await props.exportConfig()
    if (text === undefined) return
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'featured-plugins.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }
  const onFileChosen = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    // Reset so re-choosing the SAME file fires change again.
    event.target.value = ''
    if (file === undefined) return
    props.importConfig(await file.text())
  }
  // 【变更】2026-10-06 (问题 7): a mapped refusal code speaks its locale
  // sentence; only an unmapped failure falls back to the Host's words.
  const noticeText = state.notice === undefined ? '' : (() => {
    const notice = state.notice
    if (notice.kind === 'restart') return t('restartRequired')
    if (notice.kind === 'ok') return notice.text.length > 0 ? notice.text : t('applied')
    const key = notice.code === undefined ? undefined : NOTICE_REASONS[notice.code]
    const reason = key !== undefined ? t(key) : notice.text
    return reason.length > 0 ? `${t('operationFailed')}：${reason}` : t('operationFailed')
  })()

  return (
    <div className={css.section} data-testid="featured-section">
      <h2 className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>

      {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
      {state.status === 'failed' ? (
        <div className={css.failed}>
          <p className={css.statusError}>{t('loadFailed')}</p>
          <button type="button" className={css.btn} data-testid="featured-retry" onClick={props.reload}>{t('retry')}</button>
        </div>
      ) : null}

      {state.manifestError !== undefined ? (
        <p className={css.warn} data-testid="featured-manifest-error">
          {t('manifestProblem')}：{state.manifestError}
        </p>
      ) : null}
      {state.plugins.length === 0 && state.status === 'ready' ? <p className={css.status}>{t('emptyList')}</p> : null}

      {/* 【变更】2026-10-22 (批次十一 2): the list's import/export row — always
          present (even with no cards), because importing a file is how a list
          arrives in the first place. */}
      <div className={css.configRow} data-testid="featured-config-row">
        <button
          type="button" className={css.btn} disabled={anyRun || state.checking || configBusy
            || state.status !== 'ready'}
          data-testid="featured-export"
          onClick={() => { void runExport() }}
        >
          {state.exporting ? t('exporting') : t('exportConfig')}
        </button>
        <button
          type="button" className={css.btn} disabled={anyRun || state.checking || configBusy
            || state.status !== 'ready'}
          data-testid="featured-import"
          onClick={() => { fileInputRef.current?.click() }}
        >
          {state.importing ? t('importing') : t('importConfig')}
        </button>
        <span className={css.configHint}>{t('configHint')}</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className={css.fileInput}
          data-testid="featured-import-input"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => { void onFileChosen(event) }}
        />
      </div>

      {state.plugins.length > 0 ? (
        <>
          <div className={css.bulk}>
            <button
              type="button" className={css.btn} disabled={anyRun || state.checking || configBusy
                || !state.plugins.some(p => p.state === 'not-installed')}
              data-testid="featured-bulk-install"
              onClick={props.bulkInstall}
            >
              {state.bulk === 'install' ? t('installing') : t('bulkInstallAll')}
            </button>
            <button
              type="button" className={css.btn} disabled={anyRun || state.checking || configBusy
                || !state.plugins.some(p => p.state === 'disabled')}
              data-testid="featured-bulk-enable"
              onClick={() => { props.bulkSetEnabled(true) }}
            >
              {state.bulk === 'enable' ? t('applied') : t('bulkEnableAll')}
            </button>
            <button
              type="button" className={css.btn} disabled={anyRun || state.checking || configBusy
                || !state.plugins.some(p => p.state === 'enabled')}
              data-testid="featured-bulk-disable"
              onClick={() => { props.bulkSetEnabled(false) }}
            >
              {t('bulkDisableAll')}
            </button>
            {/* 【变更】2026-10-12 (问题 2.1): the bulk 自动更新 rides the same
                Switch the per-card footer uses — one consistent control, not a
                raw checkbox next to pill buttons. */}
            <span className={css.autoBulkSwitch} data-testid="featured-auto-all">
              <span className={css.autoBulkLabel}>{t('autoUpdateAll')}</span>
              <Switch
                checked={state.plugins.length > 0 && state.plugins.every(p => p.autoUpdate)}
                label={t('autoUpdateAll')}
                disabled={anyRun}
                onChange={(next) => { props.setAllAutoUpdate(next) }}
              />
            </span>
            <button
              type="button" className={css.btn} disabled={anyRun || state.checking || configBusy}
              data-testid="featured-check-updates"
              onClick={props.checkUpdates}
            >
              {state.checking ? t('checking') : t('checkUpdates')}
            </button>
          </div>

          <ul className={css.cards}>
            {state.plugins.map(card => (
              <li
                key={card.id}
                // 【变更】2026-10-21 (批次八 1): an UNAVAILABLE card grays out
                // (reduced opacity + desaturated) — the state badge alone read
                // too subtle; the whole card now says "not usable" at a glance.
                className={card.state === 'unavailable'
                  ? `${css.card} ${css.cardUnavailable}`
                  : css.card}
                data-testid={`featured-card-${card.id}`}
                data-unavailable={card.state === 'unavailable' || undefined}
                data-update-available={card.updateAvailable || undefined}
              >
                {card.updateAvailable ? (
                  <span className={css.cardUpdateDot} data-testid="featured-update-badge" aria-hidden="true" />
                ) : null}
                <div className={css.cardHead}>
                  <div className={css.cardTitleRow}>
                    <span className={css.cardName}>
                      {props.nameOf(card)}
                      {/* 【变更】2026-10-06 (问题 9): the plugin's package id rides
                          beside the display name — 飞书 · dsh-feishu — so the
                          customer can tell plugins apart (and quote them) by id. */}
                      <span className={css.cardId} data-testid="featured-card-id">{card.id}</span>
                    </span>
                    {/* 【变更】2026-10-12: homepage sits after the id; ellipsis
                        before the state badge when the URL is long. */}
                    <a
                      className={css.headLink}
                      href={card.homepage}
                      target="_blank"
                      rel="noreferrer"
                      title={card.homepage}
                      data-testid="featured-homepage-link"
                    >
                      {card.homepage}
                    </a>
                  </div>
                  <span
                    className={card.state === 'enabled' ? css.badgeOn : card.state === 'disabled' ? css.badgeOff : css.badge}
                    data-testid="featured-state"
                  >
                    {t(stateKey(card.state))}
                  </span>
                </div>
                <p className={css.cardDesc}>{props.descriptionOf(card)}</p>
                <div className={css.cardMeta}>
                  {card.installedVersion !== undefined ? (
                    <span className={css.meta}>{t('versionInstalled')}：{card.installedVersion}</span>
                  ) : null}
                  {card.latestKnown !== undefined ? (
                    <span className={css.meta}>{t('versionLatest')}：{card.latestKnown}</span>
                  ) : null}
                </div>
                {card.state === 'unavailable' ? (
                  <p className={css.cardDesc}>{t('unavailableHint')}</p>
                ) : (
                  <div className={css.cardFooter}>
                    <div className={css.autoSwitch} title={t('autoUpdateHint')}>
                      <span className={css.autoLabel}>{t('autoUpdate')}</span>
                      <Switch
                        checked={card.autoUpdate}
                        label={t('autoUpdate')}
                        disabled={anyRun}
                        onChange={(next) => { props.setAutoUpdate(card.id, next) }}
                      />
                    </div>
                    <CardActions
                      t={t}
                      card={card}
                      busy={cardBusy(card.id)}
                      disabled={(anyRun || configBusy) && state.busy?.id !== card.id}
                      onInstall={() => { props.install(card.id) }}
                      onUpdate={() => { props.update(card.id) }}
                      onSetEnabled={(enabled) => { props.setEnabled(card.id, enabled) }}
                      onRemove={() => { props.remove(card.id) }}
                    />
                  </div>
                )}
                {state.busy?.id === card.id && state.progress !== undefined ? (
                  <p className={css.status} data-testid="featured-progress">
                    {state.progress.phase === 'applying' ? t('progressApplying') : t('progressInstalling')}
                    {state.progress.attempt !== undefined
                      ? `（${t('progressRegistry')} ${state.progress.attempt.index}/${state.progress.attempt.total}）`
                      : ''}
                  </p>
                ) : null}
                {state.confirm?.id === card.id ? (
                  <div className={css.confirm} data-testid={`featured-confirm-${state.confirm.kind}`}>
                    <p className={css.confirmTitle}>
                      {t(state.confirm.kind === 'risk' ? 'confirmRiskTitle' : 'confirmBuildsTitle')}
                    </p>
                    <p className={css.confirmBody}>
                      {t(state.confirm.kind === 'risk' ? 'confirmRiskBody' : 'confirmBuildsBody')}
                    </p>
                    {state.confirm.kind === 'builds' && state.confirm.packages !== undefined ? (
                      <ul className={css.confirmList}>
                        {state.confirm.packages.map(pkg => <li key={pkg}>{pkg}</li>)}
                      </ul>
                    ) : null}
                    <div className={css.cardActions}>
                      <button
                        type="button" className={css.btnPrimary} disabled={anyRun}
                        data-testid="featured-confirm-accept"
                        onClick={() => { props.acceptConfirm(true) }}
                      >
                        {t('confirmAccept')}
                      </button>
                      <button
                        type="button" className={css.btn} disabled={anyRun}
                        data-testid="featured-confirm-decline"
                        onClick={() => { props.acceptConfirm(false) }}
                      >
                        {t('confirmDecline')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {state.notice !== undefined ? (
        /* 【变更】2026-10-06 (问题 7): a failure is a RED FRAMED alert (醒目),
           not a quiet status line. */
        <div
          className={state.notice.kind === 'failed' ? css.noticeError : css.status}
          data-testid="featured-notice"
          role={state.notice.kind === 'failed' ? 'alert' : 'status'}
        >
          {noticeText}
        </div>
      ) : null}
    </div>
  )
}
