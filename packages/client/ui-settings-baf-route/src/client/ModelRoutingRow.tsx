/**
 * 多模型路由 settings section: the master enable, one role card per tier
 * (Commander / Reviewer / Worker) whose model comes from the generic settings
 * dropdown fed by the model catalog, the session-tab-style VERTICAL phase→tier
 * flow canvas, the always-on builtin preset packs (read-only) plus the user's
 * own keyword rules, and the 预演 dry-run box.
 *
 * 【变更】2026-10-05 (角色三档批): tier labels read Commander/Reviewer/Worker
 * (presentation only — the wire stays high/mid/low); save/reset moved into a
 * toolbar at the TOP; the three role cards sit in one three-column row with
 * muted red/blue/green accents; the phase mapping renders as the same vertical
 * flow the 会话 Tab workflow graph uses (absolute-positioned node cards over
 * SVG bezier edges); and the preset packs are no longer add-chips — they are
 * always in effect at dispatch, so the block explains them read-only while the
 * user's own rules live below. Testids live on intrinsics this component
 * renders (the repo convention); primitives are queried through their roles.
 * The effective phase mapping always arrives materialized from the Host —
 * `get` fills defaults on an existing config and a fresh draft seeds from
 * `defaults()`, which also carries the builtin packs (2.4).
 */
import { useId, useState } from 'react'
import {
  IconChevronDownOutlineMedium as IconChevronDownOutline14, Input, Menu, Switch,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { RouteTier, TierKeywordRule, WorkflowNode } from '../types.ts'
import type { RouteSectionFace } from './route-store.ts'
import { KEYWORD_PRESET_IDS, type KeywordPresetId } from './presets.ts'
import css from './ModelRoutingRow.module.css'

const identity = <T,>(value: T): T => value

/** The tiers in display order. */
const TIERS: readonly RouteTier[] = ['high', 'mid', 'low']

/** One phase-mapping node: the workflow node and its locale key. */
type PhaseNode = { readonly node: WorkflowNode; readonly key: `phase${Capitalize<WorkflowNode>}` }

/**
 * The nine nodes in WORKFLOW EXECUTION ORDER (intake first, archive last,
 * drift as the loop-back tail) — the flow canvas reads as the pipeline the
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

/**
 * Canvas geometry mirroring the 会话 Tab workflow graph (FlowCanvas constants):
 * column 0 walks the main chain top→bottom, drift sits one column over beside
 * implement, and the bezier edges land bottom-center → top-center.
 */
const COL_W = 248
const ROW_H = 128
const NODE_W = 208
const NODE_H = 96
const CANVAS_W = 2 * COL_W + 56
const CANVAS_H = 8 * ROW_H + 72

/** Absolute grid cell per node (column × row), workflow order down column 0. */
const FLOW_POS: Readonly<Record<WorkflowNode, { col: number; row: number }>> = {
  intake: { col: 0, row: 0 },
  open: { col: 0, row: 1 },
  clarify: { col: 0, row: 2 },
  design: { col: 0, row: 3 },
  plan: { col: 0, row: 4 },
  implement: { col: 0, row: 5 },
  verify: { col: 0, row: 6 },
  archive: { col: 0, row: 7 },
  drift: { col: 1, row: 5 },
}

/** One canvas edge; `dashed` marks the drift spawn / recovery paths. */
interface FlowEdge {
  readonly from: WorkflowNode
  readonly to: WorkflowNode
  readonly dashed?: boolean
}

/** The main chain plus drift's spawn (from implement) and recovery (back to design). */
const FLOW_EDGES: readonly FlowEdge[] = [
  { from: 'intake', to: 'open' },
  { from: 'open', to: 'clarify' },
  { from: 'clarify', to: 'design' },
  { from: 'design', to: 'plan' },
  { from: 'plan', to: 'implement' },
  { from: 'implement', to: 'verify' },
  { from: 'verify', to: 'archive' },
  { from: 'implement', to: 'drift', dashed: true },
  { from: 'drift', to: 'design', dashed: true },
]

/** Pixel origin of one node's top-left corner on the canvas. */
function flowPos(node: WorkflowNode): { x: number; y: number } {
  const cell = FLOW_POS[node]
  return { x: 28 + cell.col * COL_W, y: 28 + cell.row * ROW_H }
}

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

/** The next tier in the worker → reviewer → commander → worker cycle a click walks. */
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
  const [openTier, setOpenTier] = useState<RouteTier | null>(null)
  const draft = state.draft
  if (state.status !== 'ready' || draft === undefined) {
    return <div className={css.section} data-testid="route-section">{t(state.status === 'failed' ? 'loadFailed' : 'loading')}</div>
  }
  const escalate = draft.escalateOnly ?? true
  const models = state.catalog?.models ?? []
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

      <div className={css.actions} data-testid="route-actions">
        {state.dirty ? <span className={css.dirty}>{t('dirty')}</span> : undefined}
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

      <div className={css.tiers}>
        {TIERS.map((tier) => {
          const spec = draft.tiers[tier]
          const selected = models.find(model => model.id === spec.model)
          const anchorLabel = selected?.name !== undefined && selected.name !== ''
            ? selected.name
            : spec.model
          return (
            <div key={tier} className={join(css.tier, TIER_CLASS[tier])} data-testid={`route-tier-${tier}`}>
              <div className={css.tierHead}>
                <span className={join(css.dot, TIER_CLASS[tier])} aria-hidden="true" />
                <span className={css.tierTitle}>{t(tierKey(tier))}</span>
              </div>
              <div className={css.tierDesc}>{t(tierDescKey(tier))}</div>
              <Menu
                open={openTier === tier}
                onClose={() => { setOpenTier(null) }}
                items={models.map(model => ({
                  id: model.id,
                  label: model.name !== '' ? model.name : model.id,
                }))}
                selectedId={spec.model}
                onSelect={(id) => {
                  setOpenTier(null)
                  const chosen = models.find(model => model.id === id)
                  if (chosen !== undefined) {
                    // A pick derives the provider from the catalog group the
                    // model lives in — the user never types one by hand.
                    setTierModel(tier, { provider: chosen.provider, model: chosen.id })
                  }
                }}
                align="start"
                portal
                anchor={(
                  <button
                    type="button"
                    className={css.selector}
                    aria-haspopup="menu"
                    aria-expanded={openTier === tier}
                    onClick={() => { setOpenTier(openTier === tier ? null : tier) }}
                  >
                    <span className={css.selectorLabel}>{anchorLabel}</span>
                    <IconChevronDownOutline14 className={css.chevron} />
                  </button>
                )}
              />
              <div className={css.tierProvider}>{t('provider')} · {spec.provider}</div>
            </div>
          )
        })}
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
        <div className={css.flowScroll}>
          <div className={css.flowCanvas} style={{ width: CANVAS_W, height: CANVAS_H }} data-testid="route-flow">
            <svg
              className={css.flowEdges}
              viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
              width={CANVAS_W}
              height={CANVAS_H}
              aria-hidden
            >
              <defs>
                <marker
                  id="route-flow-arrow"
                  viewBox="0 0 10 10"
                  refX={8}
                  refY={5}
                  markerWidth={6}
                  markerHeight={6}
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" className={css.arrowHead} />
                </marker>
              </defs>
              {FLOW_EDGES.map((edge) => {
                const a = flowPos(edge.from)
                const b = flowPos(edge.to)
                const x1 = a.x + NODE_W / 2
                const y1 = a.y + NODE_H
                const x2 = b.x + NODE_W / 2
                const y2 = b.y
                const mid = (y1 + y2) / 2
                return (
                  <path
                    key={`${edge.from}-${edge.to}`}
                    d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`}
                    className={join(css.edge, edge.dashed === true ? css.edgeDashed : '')}
                    markerEnd="url(#route-flow-arrow)"
                  />
                )
              })}
            </svg>
            {FLOW.map(({ node, key }) => {
              const tier = draft.phaseTier?.[node] ?? 'mid'
              const pos = flowPos(node)
              return (
                <button
                  key={node}
                  type="button"
                  className={join(css.flowNode, TIER_CLASS[tier])}
                  style={{ left: pos.x, top: pos.y, width: NODE_W, height: NODE_H }}
                  data-testid="route-phase-row"
                  aria-label={`${t(key)} · ${t(tierKey(tier))}`}
                  title={`${t(key)} → ${t(tierKey(tier))} · ${draft.tiers[tier].model}`}
                  onClick={() => { setPhaseTier(node, nextTier(tier)) }}
                >
                  <span className={css.nodeName}>{t(key)}</span>
                  <span className={css.nodeTier}>{t(tierKey(tier))}</span>
                  <span className={css.nodeModel}>{draft.tiers[tier].model}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className={css.description}>{t('flowHint')}</div>
      </div>

      <div className={css.block}>
        <div className={css.blockTitle}>{t('presetsTitle')}</div>
        <div className={css.description}>{t('presetsHint')}</div>
        <div className={css.builtinPresets}>
          {(state.presets ?? []).map((preset) => {
            // Known ids carry a display name; a version-skewed unknown id
            // still renders (raw) rather than vanishing.
            const known = (KEYWORD_PRESET_IDS as readonly string[]).includes(preset.id)
            return (
              <div
                key={preset.id}
                className={join(css.builtinPreset, TIER_CLASS[preset.tier])}
                data-testid="route-builtin-preset"
                title={preset.words}
              >
                <span className={css.builtinName}>
                  {known ? t(presetNameKey(preset.id as KeywordPresetId)) : preset.id}
                </span>
                <span className={css.builtinTier}>{t(tierKey(preset.tier))}</span>
                <span className={css.builtinWords}>{preset.words}</span>
              </div>
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
