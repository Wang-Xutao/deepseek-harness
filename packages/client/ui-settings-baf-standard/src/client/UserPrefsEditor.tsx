/**
 * Settings A — user-editable workspace preferences (only when enterprise allows).
 */
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BafPrefId, BafUserPrefRow, BafUserPrefsPatch } from '../types.ts'
import type { StandardsOverviewFace, StandardsOverviewState } from './standards-store.ts'
import type { BafStandardKey } from './locales.ts'
import css from './StandardsOverview.module.css'

const identity = <T,>(value: T): T => value

const PREF_META: Record<BafPrefId, readonly [BafStandardKey, BafStandardKey]> = {
  bugFixPathAllowed: ['pref.bugFixPathAllowed', 'pref.bugFixPathAllowed.hint'],
  bugFixPathMaxScope: ['pref.bugFixPathMaxScope', 'pref.bugFixPathMaxScope.hint'],
  coverageMinimum: ['pref.coverageMinimum', 'pref.coverageMinimum.hint'],
  projectionGitignore: ['pref.projectionGitignore', 'pref.projectionGitignore.hint'],
  verifyNotes: ['pref.verifyNotes', 'pref.verifyNotes.hint'],
  changeSlugPrefix: ['pref.changeSlugPrefix', 'pref.changeSlugPrefix.hint'],
}

export type UserPrefsEditorProps =
  PropsRuntime<'settings.workflow.item'>
  & PropsLocale<'baf.standard'>
  & InjectFace<StandardsOverviewFace>

function draftValue(row: BafUserPrefRow, draft: BafUserPrefsPatch): string {
  switch (row.id) {
    case 'bugFixPathAllowed':
      return draft.bugFixPathAllowed === undefined
        ? row.value
        : (draft.bugFixPathAllowed ? 'true' : 'false')
    case 'bugFixPathMaxScope':
      return draft.bugFixPathMaxScope ?? row.value
    case 'coverageMinimum':
      return draft.coverageMinimum === undefined ? row.value : String(draft.coverageMinimum)
    case 'projectionGitignore':
      return draft.projectionGitignore === undefined
        ? row.value
        : (draft.projectionGitignore ? 'true' : 'false')
    case 'verifyNotes':
      return draft.verifyNotes ?? row.value
    case 'changeSlugPrefix':
      return draft.changeSlugPrefix ?? row.value
    default:
      return row.value
  }
}

/** A-layer editable preferences — Setting-Cell rows, no long blurb. */
export function UserPrefsEditor({ useStandards, reload, setDraft, save, t }: UserPrefsEditorProps) {
  const state = useStandards(identity<StandardsOverviewState>)
  const policy = state.policy
  const prefs = policy?.status === 'ready' ? (policy.userPrefs ?? []) : []
  const dirty = Object.keys(state.draft).length > 0
  const showBody = state.status !== 'loading'
    && state.status !== 'no-workspace'
    && state.status !== 'no-baseline'
    && state.status !== 'failed'

  return (
    <section className={css.block} data-testid="baf-user-prefs">
      <div className={css.head}>
        <div className={css.title}>{t('prefsTitle')}</div>
        <div className={css.actions}>
          <button type="button" className={css.refresh} data-testid="baf-prefs-reload" onClick={() => { void reload() }}>
            {t('prefsReload')}
          </button>
          <button
            type="button"
            className={css.refresh}
            data-testid="baf-prefs-save"
            disabled={!dirty || state.saving || policy?.status !== 'ready'}
            onClick={() => { void save() }}
          >
            {state.saving ? t('prefsSaving') : t('prefsSave')}
          </button>
        </div>
      </div>

      {state.status === 'loading' ? <div className={css.status}>{t('statusLoading')}</div> : null}
      {state.status === 'no-workspace' ? <div className={css.status}>{t('statusNoWorkspace')}</div> : null}
      {state.status === 'no-baseline' ? <div className={css.status}>{t('statusNoBaseline')}</div> : null}
      {state.status === 'failed' ? (
        <div className={css.statusError}>{t('statusFailed')}{policy?.error ?? 'unknown'}</div>
      ) : null}

      {showBody && prefs.length === 0 ? (
        <div className={css.status} data-testid="baf-prefs-empty">{t('prefsEmpty')}</div>
      ) : null}

      {showBody && prefs.length > 0 ? (
        <div data-testid="baf-prefs-list">
          {prefs.map((row) => {
            const [titleKey, hintKey] = PREF_META[row.id]
            const value = draftValue(row, state.draft)
            return (
              <div key={row.id} className={css.row} data-testid={`baf-pref-${row.id}`}>
                <div className={css.rowText}>
                  <div className={css.rowTitle}>{t(titleKey)}</div>
                  <div className={css.rowDesc}>{t(hintKey)}</div>
                  <div className={css.rowHint}>{t('prefsEnterpriseHint')}{row.enterpriseValue}</div>
                </div>
                <div className={css.rowControl}>
                  {row.kind === 'boolean' ? (
                    <span data-testid={`baf-pref-input-${row.id}`}>
                      <Switch
                        checked={value === 'true'}
                        label={t(titleKey)}
                        onChange={(checked) => {
                          if (row.id === 'bugFixPathAllowed') setDraft({ bugFixPathAllowed: checked })
                          if (row.id === 'projectionGitignore') setDraft({ projectionGitignore: checked })
                        }}
                      />
                    </span>
                  ) : null}
                  {row.kind === 'enum' ? (
                    <select
                      value={value}
                      data-testid={`baf-pref-input-${row.id}`}
                      onChange={(event) => {
                        const scope = event.target.value as NonNullable<BafUserPrefsPatch['bugFixPathMaxScope']>
                        setDraft({ bugFixPathMaxScope: scope })
                      }}
                    >
                      {(row.options ?? []).map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  ) : null}
                  {row.kind === 'number-or-text' || row.kind === 'text' ? (
                    <input
                      type="text"
                      value={value}
                      data-testid={`baf-pref-input-${row.id}`}
                      onChange={(event) => {
                        const next = event.target.value
                        if (row.id === 'coverageMinimum') {
                          const asNum = Number(next)
                          setDraft({ coverageMinimum: next !== '' && !Number.isNaN(asNum) ? asNum : next })
                        }
                        if (row.id === 'verifyNotes') setDraft({ verifyNotes: next })
                        if (row.id === 'changeSlugPrefix') setDraft({ changeSlugPrefix: next })
                      }}
                    />
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {state.saveMessage === 'saved' ? (
        <div className={css.status} data-testid="baf-prefs-saved">{t('prefsSaved')}</div>
      ) : null}
      {state.saveMessage !== undefined && state.saveMessage !== 'saved' ? (
        <div className={css.statusError} data-testid="baf-prefs-save-failed">
          {t('prefsSaveFailed')}{state.saveMessage}
        </div>
      ) : null}
    </section>
  )
}
