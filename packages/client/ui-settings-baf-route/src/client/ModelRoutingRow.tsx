/**
 * 工作流 settings row for 多模型路由: the master enable, one model card per
 * tier, the phase→tier mapping, keyword rules, and the 预演 dry-run box.
 *
 * Testids live on intrinsics this component renders (the repo convention);
 * primitives are queried through their roles. The effective phase mapping
 * always arrives materialized from the Host — `get` fills defaults on an
 * existing config and a fresh draft seeds from `defaults()`.
 */
import { useId } from 'react'
import { Input, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { RouteTier, TierKeywordRule, WorkflowNode } from '../types.ts'
import type { RouteSectionFace } from './route-store.ts'
import css from './ModelRoutingRow.module.css'

const identity = <T,>(value: T): T => value

/** The tiers in display order. */
const TIERS: readonly RouteTier[] = ['high', 'mid', 'low']

/** One phase-mapping row: the node and its locale key. */
type PhaseRow = { readonly node: WorkflowNode; readonly key: `phase${Capitalize<WorkflowNode>}` }

/** Locale key for one tier's display label. */
function tierKey(tier: RouteTier): 'tierHigh' | 'tierMid' | 'tierLow' {
  return tier === 'high' ? 'tierHigh' : tier === 'mid' ? 'tierMid' : 'tierLow'
}

/** All nine nodes in presentation order (8 stages + drift); tiers come from the Host. */
const PHASES: readonly PhaseRow[] = [
  { node: 'design', key: 'phaseDesign' },
  { node: 'plan', key: 'phasePlan' },
  { node: 'clarify', key: 'phaseClarify' },
  { node: 'verify', key: 'phaseVerify' },
  { node: 'implement', key: 'phaseImplement' },
  { node: 'intake', key: 'phaseIntake' },
  { node: 'open', key: 'phaseOpen' },
  { node: 'archive', key: 'phaseArchive' },
  { node: 'drift', key: 'phaseDrift' },
]

/** Full component props for the 多模型路由 settings row. */
export type ModelRoutingRowProps =
  PropsRuntime<'settings.workflow.item'>
  & PropsLocale<'baf.route'>
  & InjectFace<RouteSectionFace>

/**
 * Render the 多模型路由 editor inside the 工作流 settings section.
 * @param props - composed slot + inject props.
 * @returns the settings row.
 */
export function ModelRoutingRow({
  useRouteSection, setEnabled, setTierModel, setPhaseTier, addKeyword, removeKeyword,
  setEscalateOnly, save, reset, runPreview, t,
}: ModelRoutingRowProps) {
  const state = useRouteSection(identity)
  const keywordWordsId = useId()
  const keywordTierId = useId()
  const draft = state.draft
  if (state.status !== 'ready' || draft === undefined) {
    return <div className={css.section} data-testid="route-section">{t(state.status === 'failed' ? 'loadFailed' : 'loading')}</div>
  }
  const escalate = draft.escalateOnly ?? true
  const addKeywordFrom = (words: string, tier: RouteTier): void => {
    if (words === '') return
    const rule: TierKeywordRule = { words, tier }
    addKeyword(rule)
  }
  return (
    <div className={css.section} data-testid="route-section">
      <div className={css.head}>
        <div>
          <div className={css.title}>{t('title')}</div>
          <div className={css.description}>{t('description')}</div>
        </div>
        <Switch checked={draft.enabled} label={t('master')} onChange={setEnabled} />
      </div>
      {state.dirty ? <div className={css.dirty}>{t('dirty')}</div> : undefined}

      <div className={css.tiers}>
        {TIERS.map(tier => (
          <div key={tier} className={css.tier} data-testid={`route-tier-${tier}`}>
            <div className={css.tierTitle}>{t(tierKey(tier))}</div>
            <Input
              aria-label={t('provider')}
              list="route-provider-options"
              value={draft.tiers[tier].provider}
              onChange={event => setTierModel(tier, { provider: event.currentTarget.value })}
            />
            <Input
              aria-label={t('model')}
              list="route-model-options"
              value={draft.tiers[tier].model}
              onChange={event => setTierModel(tier, { model: event.currentTarget.value })}
            />
          </div>
        ))}
      </div>

      <div className={css.block}>
        <div className={css.blockTitle}>{t('phaseTitle')}</div>
        {PHASES.map(({ node, key }) => (
          <div key={node} className={css.phaseRow} data-testid="route-phase-row">
            <span className={css.phaseName}>{t(key)}</span>
            <select
              className={css.select}
              aria-label={t(key)}
              value={draft.phaseTier?.[node] ?? ''}
              onChange={event => setPhaseTier(node, event.currentTarget.value as RouteTier)}
            >
              {TIERS.map(option => (
                <option key={option} value={option}>{t(tierKey(option))}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className={css.block}>
        <div className={css.blockTitle}>{t('keywordsTitle')}</div>
        {(draft.keywords ?? []).map((rule, index) => (
          <div key={`${rule.words}-${index}`} className={css.keywordRow}>
            <div className={css.keywordInputWrap}>
              <Input aria-label={t('keywordWords')} value={rule.words} disabled />
            </div>
            <span className={css.keywordTier}>{t(tierKey(rule.tier))}</span>
            <button type="button" className={css.link} onClick={() => removeKeyword(index)}>
              {t('keywordRemove')}
            </button>
          </div>
        ))}
        <KeywordAdder id={{ words: keywordWordsId, tier: keywordTierId }} t={t} onAdd={addKeywordFrom} />
      </div>

      <div className={css.block}>
        <Switch checked={escalate} label={t('escalateOnly')} onChange={setEscalateOnly} />
        <div className={css.description}>{t('escalateOnlyHint')}</div>
      </div>

      <div className={css.block}>
        <div className={css.blockTitle}>{t('previewTitle')}</div>
        <div className={css.previewBar}>
          <input
            className={css.input}
            data-testid="route-preview-input"
            placeholder={t('previewPlaceholder')}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void runPreview(event.currentTarget.value)
            }}
          />
          <button
            type="button"
            className={css.link}
            data-testid="route-preview-run"
            onClick={(event) => {
              const input = event.currentTarget.previousElementSibling as HTMLInputElement | null
              if (input !== null) void runPreview(input.value)
            }}
          >
            {t('previewRun')}
          </button>
        </div>
        {state.preview === undefined ? undefined : (
          <div className={css.preview} data-testid="route-preview">
            {state.preview.tier === null
              ? t('previewNone')
              : `${t(tierKey(state.preview.tier))} · ${state.preview.matched ?? ''}`}
          </div>
        )}
      </div>

      {state.error === undefined ? undefined : (
        <div className={css.error} data-testid="route-error">{state.error}</div>
      )}
      {state.catalog === undefined ? undefined : (
        <>
          <datalist id="route-provider-options" data-testid="route-provider-options">
            {state.catalog.providers.map(provider => <option key={provider} value={provider} />)}
          </datalist>
          <datalist id="route-model-options" data-testid="route-model-options">
            {state.catalog.models.map(model => <option key={model} value={model} />)}
          </datalist>
        </>
      )}
      <div className={css.actions}>
        <button
          type="button"
          className={css.primary}
          disabled={!state.dirty || state.saving}
          onClick={() => { void save() }}
        >
          {t('save')}
        </button>
        <button type="button" className={css.link} disabled={state.saving} onClick={() => { void reset() }}>
          {t('reset')}
        </button>
      </div>
    </div>
  )
}

/** Uncontrolled words + tier inputs that append one keyword rule. */
function KeywordAdder({ id, t, onAdd }: {
  id: { words: string; tier: string }
  t: (key: 'keywordWords' | 'keywordTier' | 'keywordAdd' | 'tierHigh' | 'tierMid' | 'tierLow') => string
  onAdd: (words: string, tier: RouteTier) => void
}) {
  return (
    <div className={css.keywordRow}>
      <input
        id={id.words}
        className={css.input}
        placeholder={t('keywordWords')}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            const select = document.getElementById(id.tier) as HTMLSelectElement | null
            onAdd(event.currentTarget.value, (select?.value ?? 'high') as RouteTier)
            event.currentTarget.value = ''
          }
        }}
      />
      <select id={id.tier} className={css.select} aria-label={t('keywordTier')} defaultValue="high">
        {TIERS.map(option => (
          <option key={option} value={option}>
            {t(tierKey(option))}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={css.link}
        onClick={(event) => {
          const row = event.currentTarget.parentElement
          if (row === null) return
          const words = row.querySelector('input') as HTMLInputElement | null
          const tier = row.querySelector('select') as HTMLSelectElement | null
          if (words === null || tier === null) return
          onAdd(words.value, tier.value as RouteTier)
          words.value = ''
        }}
      >
        {t('keywordAdd')}
      </button>
    </div>
  )
}
