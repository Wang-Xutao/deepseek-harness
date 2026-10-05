/**
 * 多模型路由 settings section: the master enable, one role card per tier
 * (Commander / Reviewer / Worker) with model + provider + effort pickers fed
 * by the model catalog, the session-tab-style VERTICAL phase→tier flow canvas
 * (compact, fully visible), the always-on builtin preset packs rendered as
 * role-grouped keyword TAGS (click 引用's one word into the user's rules) plus
 * the user's own keyword tag rules (inline edit / delete), and the 预演
 * dry-run box (previews the unsaved draft, can simulate the verify-retry
 * floor).
 *
 * 【变更】2026-10-05 (auto 批): each role card carries three pickers — model
 * (catalog name-labelled), provider alone (point 1: a tier may re-point its
 * provider without losing the model), and reasoning effort drawn from the
 * selected model's ladder (批次B-B; hidden when the model has none); an
 * out-of-catalog model shows a 未在目录 chip beside its raw id (批次B-D);
 * duplicate catalog names disambiguate via the provider-suffixed labels the
 * store distills (批次B-E); the flow canvas renders compact and full-view
 * (point 3 — no inner scroll viewport); preset packs and user rules are TAG
 * clouds (point 5 — every word fully visible, grouped by role then pack);
 * 预演 runs against the draft and forwards the M4 verify-retry switch
 * (批次A/C). Tier labels read Commander/Reviewer/Worker (presentation only —
 * the wire stays high/mid/low). Testids live on intrinsics this component
 * renders (the repo convention); primitives are queried through their roles.
 * The effective phase mapping always arrives materialized from the Host —
 * `get` fills defaults on an existing config and a fresh draft seeds from
 * `defaults()`, which also carries the builtin packs (2.4).
 */
import { useId, useState } from 'react'
import {
  IconChevronDownOutlineMedium as IconChevronDownOutline14, Menu, Switch,
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
 * Canvas geometry mirroring the 会话 Tab workflow graph, COMPACT (point 3):
 * the whole chain fits without an inner scroll viewport. Column 0 walks the
 * main chain top→bottom, drift sits one column over beside implement, and the
 * bezier edges land bottom-center → top-center.
 */
const COL_W = 176
const ROW_H = 80
const NODE_W = 200
const NODE_H = 60
const CANVAS_W = 2 * COL_W + 48
const CANVAS_H = 8 * ROW_H + 32

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
  return { x: 16 + cell.col * COL_W, y: 16 + cell.row * ROW_H }
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

/** Which of a card's three menus is open (one at a time across the section). */
type OpenMenu = `${RouteTier}:model` | `${RouteTier}:provider` | `${RouteTier}:effort` | null

/** The keyword rule being inline-edited, with its tier selector's value. */
interface KeywordEdit {
  readonly index: number
  readonly tier: RouteTier
}

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
  useRouteSection, setEnabled, setTierModel, setTierProvider, setTierEffort, setPhaseTier,
  addKeyword, removeKeyword, updateKeyword, setEscalateOnly, save, reset, runPreview, t,
}: ModelRoutingRowProps) {
  const state = useRouteSection(identity)
  const keywordWordsId = useId()
  const keywordTierId = useId()
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
  const [keywordEdit, setKeywordEdit] = useState<KeywordEdit | null>(null)
  const [verifyRetry, setVerifyRetry] = useState(false)
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
  const runPreviewFrom = (input: HTMLInputElement | null): void => {
    if (input === null) return
    void runPreview(input.value, { verifyRetry })
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
          // 批次B-D/E: an out-of-catalog model keeps its raw id on the anchor
          // with a 未在目录 chip; catalog models read their (possibly
          // provider-suffixed) display label.
          const anchorLabel = selected?.label ?? spec.model
          const providers = [...new Set([
            ...models.map(model => model.provider),
            ...(spec.provider !== '' ? [spec.provider] : []),
          ])]
          const effortName = selected?.reasoning === undefined
            ? undefined
            : selected.reasoning.efforts.find(effort => effort.id === spec.reasoningEffort)?.name
              ?? spec.reasoningEffort
              ?? t('effortDefault')
          return (
            <div key={tier} className={join(css.tier, TIER_CLASS[tier])} data-testid={`route-tier-${tier}`}>
              <div className={css.tierHead}>
                <span className={join(css.dot, TIER_CLASS[tier])} aria-hidden="true" />
                <span className={css.tierTitle}>{t(tierKey(tier))}</span>
              </div>
              <div className={css.tierDesc}>{t(tierDescKey(tier))}</div>
              <Menu
                open={openMenu === `${tier}:model`}
                onClose={() => { setOpenMenu(null) }}
                items={models.map(model => ({ id: model.id, label: model.label }))}
                selectedId={spec.model}
                onSelect={(id) => {
                  setOpenMenu(null)
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
                    aria-expanded={openMenu === `${tier}:model`}
                    onClick={() => { setOpenMenu(openMenu === `${tier}:model` ? null : `${tier}:model`) }}
                  >
                    <span className={css.selectorLabel}>{anchorLabel}</span>
                    <IconChevronDownOutline14 className={css.chevron} />
                  </button>
                )}
              />
              {/* point 1: the provider re-points alone — model and effort stay. */}
              <Menu
                open={openMenu === `${tier}:provider`}
                onClose={() => { setOpenMenu(null) }}
                items={providers.map(provider => ({ id: provider, label: provider }))}
                selectedId={spec.provider}
                onSelect={(provider) => {
                  setOpenMenu(null)
                  setTierProvider(tier, provider)
                }}
                align="start"
                portal
                anchor={(
                  <button
                    type="button"
                    className={join(css.selector, css.selectorSmall)}
                    aria-haspopup="menu"
                    aria-expanded={openMenu === `${tier}:provider`}
                    onClick={() => { setOpenMenu(openMenu === `${tier}:provider` ? null : `${tier}:provider`) }}
                  >
                    <span className={css.selectorLabel}>{t('provider')} · {spec.provider}</span>
                    <IconChevronDownOutline14 className={css.chevron} />
                  </button>
                )}
              />
              {/* 批次B-B: the effort ladder comes from the selected model; models
                  without one hide the row entirely (default follows the model). */}
              {selected?.reasoning === undefined ? undefined : (
                <Menu
                  open={openMenu === `${tier}:effort`}
                  onClose={() => { setOpenMenu(null) }}
                  items={[
                    { id: '', label: t('effortDefault') },
                    ...selected.reasoning.efforts.map(effort => ({ id: effort.id, label: effort.name })),
                  ]}
                  selectedId={spec.reasoningEffort ?? ''}
                  onSelect={(id) => {
                    setOpenMenu(null)
                    setTierEffort(tier, id === '' ? undefined : id)
                  }}
                  align="start"
                  portal
                  anchor={(
                    <button
                      type="button"
                      className={join(css.selector, css.selectorSmall)}
                      aria-haspopup="menu"
                      aria-expanded={openMenu === `${tier}:effort`}
                      onClick={() => { setOpenMenu(openMenu === `${tier}:effort` ? null : `${tier}:effort`) }}
                    >
                      <span className={css.selectorLabel}>{t('effortLabel')} · {effortName}</span>
                      <IconChevronDownOutline14 className={css.chevron} />
                    </button>
                  )}
                />
              )}
              {selected === undefined && spec.model !== ''
                ? <span className={css.notInCatalog} data-testid="route-not-in-catalog">{t('notInCatalog')}</span>
                : undefined}
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
        {/* point 3: compact + full-view — the wrapper frames the canvas, it no
            longer scrolls inside; the whole chain is visible at a glance. */}
        <div className={css.flowWrap}>
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

      {/* point 5: every builtin word fully visible as a tag, grouped by role
          (Commander / Reviewer / Worker) then by pack — clicking one 引用's it
          into the user's own rules below (deduped, one word per rule). */}
      <div className={css.block}>
        <div className={css.blockTitle}>{t('presetsTitle')}</div>
        <div className={css.description}>{t('presetsHint')}</div>
        {TIERS.map((tier) => {
          const packs = (state.presets ?? []).filter(preset => preset.tier === tier)
          if (packs.length === 0) return undefined
          return (
            <div key={tier} className={css.presetTier} data-testid="route-preset-tier">
              <span className={join(css.presetTierLabel, TIER_CLASS[tier])}>{t(tierKey(tier))}</span>
              <div className={css.presetPacks}>
                {packs.map((preset) => {
                  // Known ids carry a display name; a version-skewed unknown id
                  // still renders (raw) rather than vanishing.
                  const known = (KEYWORD_PRESET_IDS as readonly string[]).includes(preset.id)
                  const words = preset.words.split('|').filter(word => word !== '')
                  return (
                    <span key={preset.id} className={css.presetPack}>
                      <span className={css.presetPackName}>
                        {known ? t(presetNameKey(preset.id as KeywordPresetId)) : preset.id}
                      </span>
                      {words.map(word => (
                        <button
                          key={word}
                          type="button"
                          className={join(css.presetTag, TIER_CLASS[tier])}
                          data-testid="route-preset-tag"
                          title={t('presetTagHint')}
                          onClick={() => {
                            // 引用: layer the single word onto the user's rules —
                            // unless a rule at the same tier already covers the
                            // word (word-level: 架构|refactor covers 架构).
                            const covered = (draft.keywords ?? []).some(rule =>
                              rule.tier === preset.tier && rule.words.split('|').includes(word))
                            if (!covered) addKeyword({ words: word, tier: preset.tier })
                          }}
                        >
                          {word}
                        </button>
                      ))}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className={css.block}>
        <div className={css.blockTitle}>{t('keywordsTitle')}</div>
        {/* point 5: the user's rules as editable tags — ✎ opens an inline row
            (words + tier + save), ✕ drops the rule outright. */}
        <div className={css.keywordTags}>
          {(draft.keywords ?? []).map((rule, index) => {
            if (keywordEdit !== null && keywordEdit.index === index) {
              return (
                <div key={`${rule.words}-${index}`} className={css.keywordEdit} data-testid="route-keyword-edit">
                  <input
                    className={css.input}
                    data-testid="route-keyword-edit-input"
                    defaultValue={rule.words}
                    aria-label={t('keywordWords')}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitKeywordEdit(event.currentTarget)
                    }}
                  />
                  <select
                    className={css.select}
                    data-testid="route-keyword-edit-tier"
                    aria-label={t('keywordTier')}
                    value={keywordEdit.tier}
                    onChange={(event) => {
                      setKeywordEdit({ ...keywordEdit, tier: event.currentTarget.value as RouteTier })
                    }}
                  >
                    {TIERS.map(option => (
                      <option key={option} value={option}>{t(tierKey(option))}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={css.link}
                    data-testid="route-keyword-save"
                    onClick={(event) => {
                      const input = event.currentTarget.parentElement?.querySelector('input') ?? null
                      commitKeywordEdit(input)
                    }}
                  >
                    {t('keywordSave')}
                  </button>
                  <button
                    type="button"
                    className={css.link}
                    onClick={() => { setKeywordEdit(null) }}
                  >
                    {t('keywordCancel')}
                  </button>
                </div>
              )
            }
            return (
              <span key={`${rule.words}-${index}`} className={join(css.keywordTag, TIER_CLASS[rule.tier])} data-testid="route-keyword-tag">
                <span className={css.keywordTagWords}>{rule.words}</span>
                <span className={css.keywordTagTier}>{t(tierKey(rule.tier))}</span>
                <button
                  type="button"
                  className={css.tagBtn}
                  data-testid="route-keyword-edit-btn"
                  aria-label={t('keywordEdit')}
                  onClick={() => { setKeywordEdit({ index, tier: rule.tier }) }}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className={css.tagBtn}
                  data-testid="route-keyword-remove"
                  aria-label={t('keywordRemove')}
                  onClick={() => { removeKeyword(index) }}
                >
                  ✕
                </button>
              </span>
            )
          })}
        </div>
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
              if (event.key === 'Enter') runPreviewFrom(event.currentTarget)
            }}
          />
          <button
            type="button"
            className={css.link}
            data-testid="route-preview-run"
            onClick={(event) => {
              runPreviewFrom(event.currentTarget.previousElementSibling as HTMLInputElement | null)
            }}
          >
            {t('previewRun')}
          </button>
        </div>
        {/* 批次C: simulate the M4 verify-failed retry floor (a below-Reviewer
            verdict runs at Reviewer) — 预演 reads the unsaved draft (批次A). */}
        <label className={css.previewOpt}>
          <input
            type="checkbox"
            data-testid="route-preview-verify"
            checked={verifyRetry}
            onChange={(event) => { setVerifyRetry(event.currentTarget.checked) }}
          />
          {t('previewVerify')}
        </label>
        {state.preview === undefined ? undefined : (
          <div className={css.preview} data-testid="route-preview">
            {state.preview.tier === null
              ? t('previewNone')
              : `${t(tierKey(state.preview.tier))} · ${state.preview.matched ?? ''}`}
            {state.preview.escalated === true ? ` · ${t('previewEscalated')}` : ''}
          </div>
        )}
      </div>

      {state.error === undefined ? undefined : (
        <div className={css.error} data-testid="route-error">{state.error}</div>
      )}
    </div>
  )

  /** Commit the open keyword-tag edit (words from the inline input, tier from the selector). */
  function commitKeywordEdit(input: HTMLInputElement | null): void {
    if (input === null || keywordEdit === null) return
    const words = input.value
    if (words === '') return
    updateKeyword(keywordEdit.index, { words, tier: keywordEdit.tier })
    setKeywordEdit(null)
  }
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
