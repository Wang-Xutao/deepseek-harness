/**
 * BAF 工程规范 overview row (2026-10-06 问题 6 客户决策: 规范总览·只读):
 * one card per BAF plugin package quoting the baseline fields it owns, plus
 * the rules-document viewer. The row never edits — every value labels the
 * `.baf/baseline.yml` path it came from, and edits go to that file.
 */
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { BafStandardCardId, BafStandardFieldRow } from '../types.ts'
import type { StandardsOverviewFace, StandardsOverviewState } from './standards-store.ts'
import type { BafStandardKey } from './locales.ts'
import css from './StandardsOverview.module.css'

const identity = <T,>(value: T): T => value

/** Locale keys per host card: title, one-line purpose, command entry. */
const CARD_META: Record<BafStandardCardId, readonly [BafStandardKey, BafStandardKey, BafStandardKey]> = {
  workflow: ['cardTitleWorkflow', 'cardDescWorkflow', 'cardCommandWorkflow'],
  route: ['cardTitleRoute', 'cardDescRoute', 'cardCommandRoute'],
  openspec: ['cardTitleOpenspec', 'cardDescOpenspec', 'cardCommandOpenspec'],
  standard: ['cardTitleStandard', 'cardDescStandard', 'cardCommandStandard'],
  quality: ['cardTitleQuality', 'cardDescQuality', 'cardCommandQuality'],
  guard: ['cardTitleGuard', 'cardDescGuard', 'cardCommandGuard'],
}

/** The one field whose value is localized rather than quoted raw. */
const AVAILABILITY_TEXT: Record<string, BafStandardKey> = {
  ready: 'stateAvailabilityReady',
  policy_missing: 'stateAvailabilityMissing',
}

/** Full component props for the BAF 工程规范 settings row. */
export type StandardsOverviewProps =
  PropsRuntime<'settings.workflow.item'>
  & PropsLocale<'baf.standard'>
  & InjectFace<StandardsOverviewFace>

/** One card's field table: baseline path | current value (+ 企业待定 chip). */
function FieldTable({ fields, t }: {
  fields: readonly BafStandardFieldRow[]
  t: PropsLocale<'baf.standard'>['t']
}) {
  return (
    <table className={css.fields}>
      <thead>
        <tr><th>{t('fieldLabel')}</th><th>{t('valueLabel')}</th></tr>
      </thead>
      <tbody>
        {fields.map(field => (
          <tr key={field.field} data-testid={`baf-standard-field-${field.field}`}>
            <td className={css.fieldPath}>{field.field}</td>
            <td className={field.state === 'tbd' ? css.valueTbd : css.value}>
              {field.field === 'standard.availability'
                ? t(AVAILABILITY_TEXT[field.value] ?? 'stateAvailabilityMissing')
                : field.value}
              {field.state === 'tbd' ? <span className={css.chipTbd}>{t('stateTbd')}</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Render the BAF 工程规范 read-only overview inside the 工作流 settings
 * section.
 * @param props - composed slot + inject props.
 * @returns the overview row.
 */
export function StandardsOverview({ useStandards, reload, loadRules, toggleRules, t }: StandardsOverviewProps) {
  const state = useStandards(identity<StandardsOverviewState>)
  const summary = state.summary

  return (
    <section className={css.block} data-testid="baf-standard-overview">
      <div className={css.head}>
        <div>
          <div className={css.title}>{t('rowTitle')}</div>
          <div className={css.description}>{t('rowDescription')}</div>
        </div>
        <button
          type="button"
          className={css.refresh}
          data-testid="baf-standard-refresh"
          // Refresh re-reads both the summary and (when open) the document.
          onClick={() => {
            void reload()
            if (state.rulesExpanded) void loadRules()
          }}
        >
          {t('refresh')}
        </button>
      </div>

      {state.status === 'loading' ? <div className={css.status}>{t('statusLoading')}</div> : null}
      {state.status === 'no-workspace' ? <div className={css.status}>{t('statusNoWorkspace')}</div> : null}
      {state.status === 'no-baseline' ? <div className={css.status}>{t('statusNoBaseline')}</div> : null}
      {state.status === 'failed' ? (
        <div className={css.statusError} data-testid="baf-standard-failed">
          {t('statusFailed')}{summary?.error ?? 'unknown'}
        </div>
      ) : null}

      {summary?.status === 'ready' ? (
        <>
          <div className={css.meta} data-testid="baf-standard-meta">
            <span>{t('baselineLabel')}：{summary.baselineId}</span>
            <span>{t('compatLabel')}：{summary.compatibility?.min} ~ {summary.compatibility?.max}</span>
            <span>{t('cwdLabel')}：{summary.cwd}</span>
            <span className={css.path}>{t('configFileLabel')}：{summary.baselinePath}</span>
          </div>

          <div className={css.grid}>
            {(summary.cards ?? []).map((card) => {
              const [titleKey, descKey, commandKey] = CARD_META[card.id]
              return (
                <div key={card.id} className={css.card} data-testid={`baf-standard-card-${card.id}`}>
                  <div className={css.cardTitle}>{t(titleKey)}</div>
                  <div className={css.cardDesc}>{t(descKey)}</div>
                  <div className={css.cardCommand}>{t(commandKey)}</div>
                  <FieldTable fields={card.fields} t={t} />
                </div>
              )
            })}
            <div className={css.card} data-testid="baf-standard-card-scaffold">
              <div className={css.cardTitle}>{t('cardTitleScaffold')}</div>
              <div className={css.cardDesc}>{t('cardDescScaffold')}</div>
              <div className={css.cardCommand}>{t('cardCommandScaffold')}</div>
              <ul className={css.scaffoldFiles}>
                <li>{t('scaffoldFileBaseline')}</li>
                <li>{t('scaffoldFileRules')}</li>
                <li>{t('scaffoldFileOpenspec')}</li>
              </ul>
            </div>
          </div>

          <div className={css.rules} data-testid="baf-standard-rules">
            <div className={css.rulesHead}>
              <div>
                <div className={css.cardTitle}>{t('rulesTitle')}</div>
                <div className={css.cardDesc}>{t('rulesHint')}</div>
              </div>
              <button
                type="button"
                className={css.refresh}
                data-testid="baf-standard-rules-toggle"
                // The controller fetches the document on the first expand.
                onClick={() => { toggleRules() }}
              >
                {state.rulesExpanded ? t('rulesCollapse') : t('rulesExpand')}
              </button>
            </div>
            {state.rulesExpanded ? (
              state.rules === undefined
                ? <div className={css.status}>{t('statusLoading')}</div>
                : state.rules.status === 'ready'
                  ? (
                    <div>
                      <div className={css.path}>{t('rulesPathLabel')}：{state.rules.path}</div>
                      <pre className={css.rulesBody} data-testid="baf-standard-rules-body">{state.rules.content}</pre>
                    </div>
                  )
                  : state.rules.status === 'unreadable'
                    ? <div className={css.statusError}>{t('rulesUnreadable')}{state.rules.reason}</div>
                    : (
                      <div className={css.status} data-testid="baf-standard-rules-unavailable">
                        {summary.standardAvailability === 'policy_missing'
                          ? t('rulesUnavailablePolicy')
                          : t('rulesUnavailableNoWorkspace')}
                      </div>
                    )
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  )
}
