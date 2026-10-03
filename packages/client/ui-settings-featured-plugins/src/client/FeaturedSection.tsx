/**
 * Featured plugins settings section: the curated cards, their per-state
 * actions, the bulk bar, and the confirmations the Host's compatibility and
 * build gates ask for.
 */
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
  const cardBusy = (id: string): boolean => state.busy?.id === id
  const anyRun = state.busy !== undefined || state.bulk !== undefined

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

      {state.plugins.length > 0 ? (
        <>
          <div className={css.bulk}>
            <button
              type="button" className={css.btn} disabled={anyRun || state.checking
                || !state.plugins.some(p => p.state === 'not-installed')}
              data-testid="featured-bulk-install"
              onClick={props.bulkInstall}
            >
              {state.bulk === 'install' ? t('installing') : t('bulkInstallAll')}
            </button>
            <button
              type="button" className={css.btn} disabled={anyRun || state.checking
                || !state.plugins.some(p => p.state === 'disabled')}
              data-testid="featured-bulk-enable"
              onClick={() => { props.bulkSetEnabled(true) }}
            >
              {state.bulk === 'enable' ? t('applied') : t('bulkEnableAll')}
            </button>
            <button
              type="button" className={css.btn} disabled={anyRun || state.checking
                || !state.plugins.some(p => p.state === 'enabled')}
              data-testid="featured-bulk-disable"
              onClick={() => { props.bulkSetEnabled(false) }}
            >
              {t('bulkDisableAll')}
            </button>
            <label className={css.autoAll}>
              <input
                type="checkbox"
                disabled={anyRun}
                checked={state.plugins.length > 0 && state.plugins.every(p => p.autoUpdate)}
                onChange={(event) => { props.setAllAutoUpdate(event.currentTarget.checked) }}
              />
              {t('autoUpdate')}
            </label>
            <button
              type="button" className={css.btn} disabled={anyRun || state.checking}
              data-testid="featured-check-updates"
              onClick={props.checkUpdates}
            >
              {state.checking ? t('checking') : t('checkUpdates')}
            </button>
          </div>

          <ul className={css.cards}>
            {state.plugins.map(card => (
              <li key={card.id} className={css.card} data-testid={`featured-card-${card.id}`}>
                <div className={css.cardHead}>
                  <span className={css.cardName}>{props.nameOf(card)}</span>
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
                  {card.updateAvailable ? <span className={css.updateChip} data-testid="featured-update-chip">{t('updateAvailable')}</span> : null}
                  <a className={css.metaLink} href={card.homepage} target="_blank" rel="noreferrer">{t('homepage')}</a>
                </div>
                {card.state !== 'unavailable' ? (
                  <label className={css.autoRow}>
                    <input
                      type="checkbox"
                      disabled={anyRun}
                      checked={card.autoUpdate}
                      title={t('autoUpdateHint')}
                      onChange={(event) => { props.setAutoUpdate(card.id, event.currentTarget.checked) }}
                    />
                    {t('autoUpdate')}
                  </label>
                ) : (
                  <p className={css.cardDesc}>{t('unavailableHint')}</p>
                )}
                <CardActions
                  t={t}
                  card={card}
                  busy={cardBusy(card.id)}
                  disabled={anyRun && state.busy?.id !== card.id}
                  onInstall={() => { props.install(card.id) }}
                  onUpdate={() => { props.update(card.id) }}
                  onSetEnabled={(enabled) => { props.setEnabled(card.id, enabled) }}
                  onRemove={() => { props.remove(card.id) }}
                />
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
        <p
          className={state.notice.kind === 'failed' ? css.statusError : css.status}
          data-testid="featured-notice"
        >
          {state.notice.kind === 'restart' ? t('restartRequired')
            : state.notice.kind === 'ok' ? t('applied')
              : `${t('operationFailed')}${state.notice.text.length > 0 ? `：${state.notice.text}` : ''}`}
        </p>
      ) : null}
    </div>
  )
}
