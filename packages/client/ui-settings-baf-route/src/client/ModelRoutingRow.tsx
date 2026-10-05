/**
 * 多模型路由 settings section: the master enable, one model card per tier,
 * the phase→tier flow diagram, keyword rules with curated preset packs, and
 * the 预演 dry-run box.
 *
 * 【变更】2026-10-05 (UI 批次): the editor moved out of the 工作流 section into
 * its own settings section (id `model-routing`), the phase mapping renders as
 * a workflow-order flow diagram (each node answers「谁在服务」with the mapped
 * tier's model; click cycles the tier), and the keyword block offers curated
 * preset packs. Testids live on intrinsics this component renders (the repo
 * convention); primitives are queried through their roles. The effective
 * phase mapping always arrives materialized from the Host — `get` fills
 * defaults on an existing config and a fresh draft seeds from `defaults()`.
 */
import { useId } from 'react'
import { Input, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { RouteTier, TierKeywordRule, WorkflowNode } from '../types.ts'
import type { RouteSectionFace } from './route-store.ts'
import { KEYWORD_PRESETS, type KeywordPresetId } from './presets.ts'
import css from './ModelRoutingRow.module.css'

const identity = <T,>(value: T): T => value

/** The tiers in display order. */
const TIERS: readonly RouteTier[] = ['high', 'mid', 'low']

/** One phase-mapping node: the workflow node and its locale key. */
type PhaseNode = { readonly node: WorkflowNode; readonly key: `phase${Capitalize<WorkflowNode>}` }

/**
 * The nine nodes in WORKFLOW EXECUTION ORDER (intake first, archive last,
 * drift as the loop-back tail) — the flow diagram reads as the pipeline the
 * work orders travel, not the tier vocabulary's declaration order.
 */
const FLOW: readonly PhaseNode[] = [
  { node: 'intake', key: 'phaseIntake' },
  { node: 'open', key: 'phaseOpen' },
  { node: 'clarify', key: 'phaseClarify' },
  { node: 'design', key: 'phaseDesign' },
  { node: 'plan', key: 'phasePlan' },
  { node: 'implement', key: 'phaseImplement' },
  { node: 'verify', key: 'phaseVerify' },
  { node: 'archive', key: 'phaseArchive' },
  { node: 'drift', key: 'phaseDrift' },
]

/** Locale key for one tier's display label. */
function tierKey(tier: RouteTier): 'tierHigh' | 'tierMid' | 'tierLow' {
  return tier === 'high' ? 'tierHigh' : tier === 'mid' ? 'tierMid' : 'tierLow'
}

/**
 * CSS-module accent class per tier (explicit keys — no string indexing). The
 * ambient css-module type is `Record<string, string>`, which reads as
 * `string | undefined` under noUncheckedIndexedAccess; the `?? ''` fallback
 * only satisfies the type — this component's own stylesheet defines the keys.
 */
const TIER_CLASS: Record<RouteTier, string> = {
  high: css.tierHigh ?? '',
  mid: css.tierMid ?? '',
  low: css.tierLow ?? '',
}

/** Locale key for one tier's one-line role description. */
function tierDescKey(tier: RouteTier): 'tierHighDesc' | 'tierMidDesc' | 'tierLowDesc' {
  return tier === 'high' ? 'tierHighDesc' : tier === 'mid' ? 'tierMidDesc' : 'tierLowDesc'
}

/** Locale key for one preset pack's display name. */
function presetNameKey(id: KeywordPresetId): `preset${Capitalize<KeywordPresetId>}` {
  return `preset${id.charAt(0).toUpperCase()}${id.slice(1)}` as `preset${Capitalize<KeywordPresetId>}`
}

/** The next tier in the low → mid → high → low cycle a node click walks. */
function nextTier(tier: RouteTier): RouteTier {
  return tier === 'low' ? 'mid' : tier === 'mid' ? 'high' : 'low'
}

/**
 * Join CSS-module class names without a clsx dependency. The ambient
 * css-module type reads as `string | undefined` under noUncheckedIndexedAccess,
 * so dropped names (undefined and '') are filtered by a narrowing guard.
 */
const join = (...names: ReadonlyArray<string | undefined>): string =>
  names.filter((name): name is string => name !== undefined && name !== '').join(' ')

/** Full component props for the 多模型路由 settings section. */
export type ModelRoutingRowProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'baf.route'>
  & InjectFace<RouteSectionFace>

/**
 * Render the 多模型路由 editor as its own settings section.
 * @param props - composed slot + inject props.
 * @returns the settings section.
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
          <h2 className={css.title}>{t('title')}</h2>
          <div className={css.description}>{t('description')}</div>
        </div>
        <Switch checked={draft.enabled} label={t('master')} onChange={setEnabled} />
      </div>
      {state.dirty ? <div className={css.dirty}>{t('dirty')}</div> : undefined}

      <div className={css.tiers}>
        {TIERS.map(tier => (
          <div key={tier} className={join(css.tier, TIER_CLASS[tier])} data-testid={`route-tier-${tier}`}>
            <div className={css.tierHead}>
              <span className={join(css.dot, TIER_CLASS[tier])} aria-hidden="true" />
              <span className={css.tierTitle}>{t(tierKey(tier))}</span>
            </div>
            <div className={css.tierDesc}>{t(tierDescKey(tier))}</div>
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
        <div className={css.flowHead}>
          <div className={css.blockTitle}>{t('phaseTitle')}</div>
          <div className={css.legend}>
            {TIERS.map(tier => (
              <span key={tier} className={css.legendItem}>
                <span className={join(css.dot, TIER_CLASS[tier])} aria-hidden="true" />
                {t(tierKey(tier))}
              </span>
            ))}
          </div>
        </div>
        <div className={css.flow} data-testid="route-flow">
          {FLOW.map(({ node, key }, at) => {
            const tier = draft.phaseTier?.[node] ?? 'mid'
            return (
              <span key={node} className={css.flowItem}>
                {at > 0 && (
                  <span className={css.flowArrow} aria-hidden="true">{node === 'drift' ? '↻' : '→'}</span>
                )}
                <button
                  type="button"
                  className={join(css.node, TIER_CLASS[tier])}
                  data-testid="route-phase-row"
                  aria-label={`${t(key)} · ${t(tierKey(tier))}`}
                  title={`${t(key)} → ${t(tierKey(tier))} · ${draft.tiers[tier].model}`}
                  onClick={() => { setPhaseTier(node, nextTier(tier)) }}
                >
                  <span className={css.nodeName}>{t(key)}</span>
                  <span className={css.nodeTier}>{t(tierKey(tier))}</span>
                  <span className={css.nodeModel}>{draft.tiers[tier].model}</span>
                </button>
              </span>
            )
          })}
        </div>
        <div className={css.description}>{t('flowHint')}</div>
      </div>

      <div className={css.block}>
        <div className={css.blockTitle}>{t('presetsTitle')}</div>
        <div className={css.description}>{t('presetsHint')}</div>
        <div className={css.presets}>
          {KEYWORD_PRESETS.map((preset) => {
            const added = (draft.keywords ?? []).some(rule => rule.words === preset.words)
            return (
              <button
                key={preset.id}
                type="button"
                className={join(css.preset, TIER_CLASS[preset.tier], added ? css.presetAdded : '')}
                data-testid="route-preset"
                disabled={added}
                title={preset.words}
                onClick={() => { addKeyword({ words: preset.words, tier: preset.tier }) }}
              >
                <span className={css.presetName}>{t(presetNameKey(preset.id))}</span>
                <span className={css.presetTier}>{added ? `✓ ${t('presetAdded')}` : `+ ${t(tierKey(preset.tier))}`}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className={css.block}>
        <div className={css.blockTitle}>{t('keywordsTitle')}</div>
        {(draft.keywords ?? []).map((rule, index) => (
          <div key={`${rule.words}-${index}`} className={css.keywordRow}>
            <div className={css.keywordInputWrap}>
              <Input aria-label={t('keywordWords')} value={rule.words} disabled />
            </div>
            <span className={join(css.keywordTier, TIER_CLASS[rule.tier])}>{t(tierKey(rule.tier))}</span>
            <button type="button" className={css.link} onClick={() => { removeKeyword(index) }}>
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
