/**
 * 多模型路由 settings section — THREE titled blocks (1.3): 模型分级 (one role
 * ROW per tier, provider → model → effort across the row, the model menu
 * filtered to the chosen provider), 工作流模型绑定 (the vertical workflow
 * canvas with the click-hint directly under the title), and 关键词规则 (the
 * builtin preset packs rendered INSIDE the rules as read-only 预设-badged tags
 * plus the user's own editable tag rules, the escalate switch, and the 预演
 * dry-run box which hot-reloads on draft changes).
 *
 * 【变更】2026-10-05 (UI 三块批): the three role CARDS became three rows in
 * one column, each a single line of provider / model / effort pickers under a
 * shared header row (1.1); the flow block is titled 工作流模型绑定 and its
 * node rects can never intersect — the columns now carry a real gap and the
 * drift recovery path runs an orthogonal right-hand channel instead of a
 * diagonal through the chain (1.2); presets merged into 关键词规则 — the 引用
 * click is gone because they already ARE rules (1.5); 预演 re-runs itself on a
 * debounce whenever the draft or the verify switch changes while text is
 * present (1.6); save/reset (and the small action buttons) ride the
 * featured-plugins pill style (1.4).
 * 【变更】2026-10-05 (auto 批): an out-of-catalog model (or one that left the
 * chosen provider's menu) shows a 未在目录 chip beside its raw id; 预演 reads
 * the unsaved draft and forwards the M4 verify-retry switch. Tier labels
 * read Commander/Reviewer/Worker (presentation only — the wire stays
 * high/mid/low). Testids live on intrinsics this component renders
 * (the repo convention); primitives are queried through their roles. The
 * effective phase mapping always arrives materialized from the Host — `get`
 * fills defaults on an existing config and a fresh draft seeds from
 * `defaults()`, which also carries the builtin packs (2.4).
 * 【变更】2026-10-06 (问题 2/3/4 批): the three role rows became three CARDS —
 * no shared header row, each card leads with its role name + one-line
 * description (主次分明) and then labels its own 服务商/模型/思考力度 fields;
 * keyword tags carry a mini role="switch" each (off parks the word without
 * deleting it), preset packs gained a master switch beside the pack name and
 * each preset word its own tag switch, and user rules can carry a custom
 * 功能分类 rendered as a labelled group with its own one-click master switch;
 * the tag's inner tier label is gone (the group already says the role); the
 * preset block points at the user-editable preset file; the 预演 box explains
 * the verify-retry floor its checkbox simulates.
 * 【变更】2026-10-06 (问题 5 批): 恢复默认 parks at the action row's LEFT end and
 * 取消 joins 保存 at the right end (cancel discards the draft, re-reading the
 * saved file); roles renamed 旗舰/评审/执行 with one-line role descriptions;
 * a provider switch re-points the model to that provider's first offering and
 * the loaded draft is normalized against the catalog, so the 未在目录 chip is
 * gone; per-tag switch buttons are GONE — clicking a tag parks/revives it —
 * and every group renders its tags in 中文 / 英文 segments, each custom
 * 功能分类 (and each preset pack) as its own framed segment.
 * 【变更】2026-10-06 (问题 1/2/3 批): the model menus are provider-scoped, so
 * the label is now the fetched name itself (a cross-provider suffix repeated
 * what the menu already scoped — only same-provider duplicate names still
 * disambiguate, via the id); the role labels are the English
 * Commander/Reviewer/Worker (Chinese survives only in the one-line
 * descriptions); the 预演 hint explains the verify-retry floor in plain
 * words (the rule itself is unchanged).
 * 【变更】2026-10-12 (挡位/高级批 1.1–1.3): the 挡位选择 label row is gone —
 * the select (options now just 两档/三档) sits in the action row's left end
 * (恢复默认's old seat); real tab pagination landed (`.block[hidden]`
 * restores the hidden attribute against the flex display); a fourth 高级
 * tab carries 恢复默认 with its blast radius spelled out.
 * 【变更】2026-10-13 (下拉样式/worker 关键词批): the 挡位 dropdown is the same
 * Menu-primitive selector pill 通用设置·语言 uses; keyword rules only cover
 * the ESCALATION grades (Worker is the fallback — its keyword rules/packs
 * were dead config and no longer render or can be added).
 */
import { useEffect, useId, useState, type ReactElement, type ReactNode } from 'react'
import {
  IconChevronDownOutlineMedium as IconChevronDownOutline14, IconChevronDownOutlineRegular, Menu, Switch,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { RouteTier, TierKeywordRule, WorkflowNode } from '../types.ts'
import type { RouteSectionFace } from './route-store.ts'
import { KEYWORD_PRESET_IDS, type KeywordPresetId } from './presets.ts'
import css from './ModelRoutingRow.module.css'

const identity = <T,>(value: T): T => value

/** Grade-count mode mirrored from baf-core (client cannot value-import it). */
type TierMode = 'two' | 'three'

/** The tiers in display order for three-grade mode. */
const TIERS_THREE: readonly RouteTier[] = ['high', 'mid', 'low']

/** The tiers in display order for two-grade mode (Reviewer folded away). */
const TIERS_TWO: readonly RouteTier[] = ['high', 'low']

/** Visible grade cards for the active mode. */
function displayTiers(mode: TierMode): readonly RouteTier[] {
  return mode === 'two' ? TIERS_TWO : TIERS_THREE
}

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
 * Canvas geometry (1.2): COMPACT and overlap-free by construction — column 1
 * starts a full node-width plus a gutter right of column 0 (the drifting
 * column once started 24px INSIDE the main chain), rows keep a fixed gutter,
 * and the drift recovery path exits into a right-hand channel instead of
 * cutting diagonally across the chain.
 */
const NODE_W = 192
const NODE_H = 56
const ROW_H = 72
const COL_X: readonly number[] = [16, 236]
const CHANNEL_X = 446
const CANVAS_W = 460
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
  return { x: COL_X[cell.col] ?? 0, y: 16 + cell.row * ROW_H }
}

/**
 * SVG path for one edge, routed by the cells it joins: same column walks the
 * chain bottom-center → top-center; same row hops right-edge → left-edge
 * (implement → drift); the recovery edge (drift → design) runs an orthogonal
 * right-hand channel — out, up, and back into design's right edge — so no
 * line ever crosses a node.
 */
function edgePath(edge: FlowEdge): string {
  const a = FLOW_POS[edge.from]
  const b = FLOW_POS[edge.to]
  const ax = COL_X[a.col] ?? 0
  const ay = 16 + a.row * ROW_H
  const bx = COL_X[b.col] ?? 0
  const by = 16 + b.row * ROW_H
  if (a.col === b.col) {
    const x = ax + NODE_W / 2
    const y1 = ay + NODE_H
    const y2 = by
    const mid = (y1 + y2) / 2
    return `M ${x} ${y1} C ${x} ${mid}, ${x} ${mid}, ${x} ${y2}`
  }
  if (a.row === b.row) {
    const y = ay + NODE_H / 2
    const x1 = ax + NODE_W
    const mid = (x1 + bx) / 2
    return `M ${x1} ${y} C ${mid} ${y}, ${mid} ${y}, ${bx} ${y}`
  }
  const yFrom = ay + NODE_H / 2
  const yTo = by + NODE_H / 2
  return `M ${ax + NODE_W} ${yFrom} L ${CHANNEL_X} ${yFrom} L ${CHANNEL_X} ${yTo} L ${bx + NODE_W} ${yTo}`
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

/** The next tier a workflow-node click walks, honoring two- vs three-grade mode. */
function nextTier(tier: RouteTier, mode: TierMode): RouteTier {
  if (mode === 'two') return tier === 'high' ? 'low' : 'high'
  return tier === 'low' ? 'mid' : tier === 'mid' ? 'high' : 'low'
}

/** 问题 5 (4.5): any CJK glyph reads the word as 中文, everything else 英文. */
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

/** Whether one keyword word carries CJK. */
function isCjkWord(word: string): boolean {
  return CJK.test(word)
}

/**
 * 问题 5 (4.5): one labelled 中文/英文 line of tags inside a group — the
 * caption only rides along when the group holds BOTH languages (a single
 * language needs no divider).
 */
function TagLine({ label, showLabel, children }: {
  label: string
  showLabel: boolean
  children: ReactNode
}): ReactElement {
  return (
    <span className={css.segLine}>
      {showLabel ? <span className={css.segLabel}>{label}</span> : null}
      {children}
    </span>
  )
}

/**
 * Join CSS-module class names without a clsx dependency. The ambient
 * css-module type reads as `string | undefined` under noUncheckedIndexedAccess,
 * so dropped names (undefined and '') are filtered by a narrowing guard.
 */
const join = (...names: ReadonlyArray<string | undefined>): string =>
  names.filter((name): name is string => name !== undefined && name !== '').join(' ')

/** 1.6 热加载: how long a draft settles before the preview re-runs itself. */
const PREVIEW_DEBOUNCE_MS = 300

/** Which of a row's three menus is open (one at a time across the section). */
type OpenMenu = `${RouteTier}:model` | `${RouteTier}:provider` | `${RouteTier}:effort` | 'tierMode' | null

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
  addKeyword, removeKeyword, updateKeyword, setKeywordEnabled, setCategoryEnabled,
  setPackEnabled, setPresetWordEnabled, setEscalateOnly, setTierMode, save, cancel, reset,
  runPreview, t,
}: ModelRoutingRowProps) {
  const state = useRouteSection(identity)
  const keywordWordsId = useId()
  const keywordTierId = useId()
  const keywordCategoryId = useId()
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
  const [keywordEdit, setKeywordEdit] = useState<KeywordEdit | null>(null)
  const [verifyRetry, setVerifyRetry] = useState(false)
  const [previewText, setPreviewText] = useState('')
  /** 【变更】2026-10-12: restore tabbed layout; 高级 carries 恢复默认 (1.3). */
  const [routeTab, setRouteTab] = useState<'tiers' | 'phase' | 'keywords' | 'advanced'>('tiers')
  const tabsId = useId()
  const draft = state.draft
  // 1.6 热加载: while the box holds text, any draft edit (keyword add/remove,
  // tier re-point, switch flip) re-runs the dry-run on a short debounce — the
  // preview always reflects the current draft, no re-click needed.
  useEffect(() => {
    if (previewText === '') return
    const timer = setTimeout(() => { void runPreview(previewText, { verifyRetry }) }, PREVIEW_DEBOUNCE_MS)
    return () => { clearTimeout(timer) }
  }, [previewText, verifyRetry, draft, runPreview])
  if (state.status !== 'ready' || draft === undefined) {
    return <div className={css.section} data-testid="route-section">{t(state.status === 'failed' ? 'loadFailed' : 'loading')}</div>
  }
  const escalate = draft.escalateOnly ?? true
  const tierMode: TierMode = draft.tierMode === 'three' ? 'three' : 'two'
  const visibleTiers = displayTiers(tierMode)
  // 【变更】2026-10-13 (worker 关键词批): keyword rules only ever ESCALATE —
  // Worker is the fallback grade, so a 'low' keyword is dead config (and
  // two-grade mode folds mid into low, killing mid rules there too). The
  // adder/edit selectors offer only escalation grades; dead stored rules and
  // packs no longer render (the host fold filters them at evaluation).
  const keywordTiers: readonly RouteTier[] = tierMode === 'two' ? ['high'] : ['high', 'mid']
  const models = state.catalog?.models ?? []
  // 问题 3: the adder's optional 功能分类 rides the new rule when filled.
  const addKeywordFrom = (words: string, tier: RouteTier, category: string): void => {
    if (words === '') return
    const rule: TierKeywordRule = category === '' ? { words, tier } : { words, tier, category }
    addKeyword(rule)
  }

  /**
   * One user keyword rule: the inline edit row, or the tag — word, a mini
   * role="switch" that parks the rule without deleting it (问题 4), and the
   * edit/remove buttons. The tag carries NO tier label inside: it sits inside
   * its tier group, which already names the role.
   */
  const renderUserRule = (rule: TierKeywordRule, index: number): ReactNode => {
    if (keywordEdit !== null && keywordEdit.index === index) {
      return (
        <div key={`${rule.words}-${index}`} className={css.keywordEdit} data-testid="route-keyword-edit">
          <input
            className={css.input}
            data-testid="route-keyword-edit-input"
            defaultValue={rule.words}
            aria-label={t('keywordWords')}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitKeywordEdit(event.currentTarget, rule.category)
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
            {keywordTiers.map(option => (
              <option key={option} value={option}>{t(tierKey(option))}</option>
            ))}
          </select>
          <button
            type="button"
            className={css.btn}
            data-testid="route-keyword-save"
            onClick={(event) => {
              const input = event.currentTarget.parentElement?.querySelector('input') ?? null
              commitKeywordEdit(input, rule.category)
            }}
          >
            {t('keywordSave')}
          </button>
          <button
            type="button"
            className={css.btn}
            onClick={() => { setKeywordEdit(null) }}
          >
            {t('keywordCancel')}
          </button>
        </div>
      )
    }
    const on = rule.enabled !== false
    // 问题 5 (4.5): the TAG is the switch — a click (or Enter/Space) parks or
    // revives the word; the mini switch button is gone. ✎/✕ stop the click so
    // editing never toggles.
    return (
      <span
        key={`${rule.words}-${index}`}
        className={join(css.keywordTag, TIER_CLASS[rule.tier], on ? '' : css.keywordTagOff)}
        data-testid="route-keyword-tag"
        role="switch"
        aria-checked={on ? 'true' : 'false'}
        aria-label={`${t('tagToggle')}：${rule.words}`}
        tabIndex={0}
        onClick={() => { setKeywordEnabled(index, !on) }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setKeywordEnabled(index, !on)
          }
        }}
      >
        <span className={css.keywordTagWords}>{rule.words}</span>
        <button
          type="button"
          className={css.tagBtn}
          data-testid="route-keyword-edit-btn"
          aria-label={t('keywordEdit')}
          onClick={(event) => {
            event.stopPropagation()
            setKeywordEdit({ index, tier: rule.tier })
          }}
        >
          ✎
        </button>
        <button
          type="button"
          className={css.tagBtn}
          data-testid="route-keyword-remove"
          aria-label={t('keywordRemove')}
          onClick={(event) => {
            event.stopPropagation()
            removeKeyword(index)
          }}
        >
          ✕
        </button>
      </span>
    )
  }

  /**
   * 问题 5 (4.5): one preset-pack word as a CLICKABLE tag — the tag itself is
   * the switch (off parks the word without deleting it); the per-word switch
   * button is gone, matching the user tags.
   */
  const renderPresetWord = (
    preset: { readonly id: string }, word: string, tier: RouteTier, packName: string,
  ): ReactElement => {
    const wordOn = draft.presetWords?.[`${preset.id}::${word}`] !== false
    return (
      <span
        key={`${preset.id}-${word}`}
        className={join(css.presetTag, TIER_CLASS[tier], wordOn ? '' : css.presetTagOff)}
        data-testid="route-preset-tag"
        role="switch"
        aria-checked={wordOn ? 'true' : 'false'}
        aria-label={`${t('tagToggle')}：${word}`}
        tabIndex={0}
        title={`${packName} · ${t('presetAlwaysHint')}`}
        onClick={() => { setPresetWordEnabled(preset.id, word, !wordOn) }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setPresetWordEnabled(preset.id, word, !wordOn)
          }
        }}
      >
        <span>{word}</span>
        <span className={css.presetBadge}>{t('presetBadge')}</span>
      </span>
    )
  }
  return (
    <div className={css.section} data-testid="route-section">
      {/* Title/intro match 版本与更新: 18px title + 13px tertiary description. */}
      <div className={css.head}>
        <div>
          <h2 className={css.title}>{t('title')}</h2>
          <p className={css.intro}>{t('description')}</p>
        </div>
        <Switch checked={draft.enabled} label={t('master')} onChange={setEnabled} />
      </div>

      {/* 【变更】2026-10-12 (问题 1.1/1.3): the 挡位 dropdown moved INTO the
          action row's left end (the 恢复默认 button's old seat — that button
          now lives in the 高级 tab) and the visible 挡位选择 label is gone;
          the options read just 两档 / 三档.
          【变更】2026-10-13 (下拉样式批): the native <select> became the same
          Menu-primitive selector pill 通用设置·语言 uses (css.modeSelector —
          a verbatim copy of locale/LanguageRow's .selector values, Regular
          chevron), so the two dropdowns read as one control family. */}
      <div className={css.actions} data-testid="route-actions">
        <Menu
          open={openMenu === 'tierMode'}
          onClose={() => { setOpenMenu(null) }}
          items={[
            { id: 'two', label: t('tierModeTwo') },
            { id: 'three', label: t('tierModeThree') },
          ]}
          selectedId={tierMode}
          onSelect={(id) => {
            setOpenMenu(null)
            setTierMode(id as TierMode)
          }}
          align="end"
          portal
          anchor={(
            <button
              type="button"
              className={css.modeSelector}
              data-testid="route-tier-mode"
              aria-haspopup="menu"
              aria-expanded={openMenu === 'tierMode'}
              aria-label={t('tierModeLabel')}
              onClick={() => { setOpenMenu(openMenu === 'tierMode' ? null : 'tierMode') }}
            >
              <span className={css.selectorLabel}>
                {tierMode === 'two' ? t('tierModeTwo') : t('tierModeThree')}
              </span>
              <IconChevronDownOutlineRegular className={css.chevron} />
            </button>
          )}
        />
        <span className={css.actionsEnd}>
          {state.dirty ? <span className={css.dirty}>{t('dirty')}</span> : undefined}
          <button
            type="button"
            className={css.btn}
            disabled={!state.dirty || state.saving}
            data-testid="route-cancel"
            onClick={() => { void cancel() }}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            className={css.btnPrimary}
            disabled={!state.dirty || state.saving}
            data-testid="route-save"
            onClick={() => { void save() }}
          >
            {t('save')}
          </button>
        </span>
      </div>

      <div className={css.tabs} role="tablist" aria-label={t('tabsAria')}>
        {([
          ['tiers', 'tiersTitle'],
          ['phase', 'phaseTitle'],
          ['keywords', 'keywordsTitle'],
          ['advanced', 'advancedTitle'],
        ] as const).map(([id, labelKey]) => {
          const selected = routeTab === id
          return (
            <button
              key={id}
              id={`${tabsId}-tab-${id}`}
              type="button"
              role="tab"
              className={css.tab}
              aria-selected={selected}
              aria-controls={`${tabsId}-panel-${id}`}
              data-active={selected ? 'true' : undefined}
              data-testid={`route-tab-${id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => { setRouteTab(id) }}
            >
              {t(labelKey)}
            </button>
          )
        })}
      </div>

      {/* 问题 2 (2026-10-06) — 模型分级: one role CARD per tier. */}
      <div
        className={css.block}
        id={`${tabsId}-panel-tiers`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-tab-tiers`}
        hidden={routeTab !== 'tiers'}
        data-testid="route-panel-tiers"
      >
        <div className={css.tiers}>
          {visibleTiers.map((tier) => {
            const spec = draft.tiers[tier]
            // 1.1: the model menu follows the provider — only that provider's
            // models are offered. 问题 5 (4.3/4.4): the loaded draft is
            // normalized against the catalog and a provider switch re-points
            // the model, so the pick always sits under the chosen provider
            // and the anchor lookup stays scoped to it (a same-named model
            // on ANOTHER provider can never bleed in), and the 未在目录 chip
            // is gone. 问题 1 (2026-10-06): the menu text is the fetched
            // name itself — the scoping above already says the provider.
            const providerModels = models.filter(model => model.provider === spec.provider)
            const selected = providerModels.find(model => model.id === spec.model)
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
              <div key={tier} className={join(css.tierCard, TIER_CLASS[tier])} data-testid={`route-tier-${tier}`}>
                <div className={css.tierCardHead}>
                  <span className={css.tierHead}>
                    <span className={join(css.dot, TIER_CLASS[tier])} aria-hidden="true" />
                    <span className={css.tierTitle}>{t(tierKey(tier))}</span>
                  </span>
                  <span className={css.tierDesc}>{t(tierDescKey(tier))}</span>
                </div>
                <div className={css.tierCardGrid}>
                  <div className={css.field}>
                    <span className={css.fieldLabel}>{t('provider')}</span>
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
                          className={css.selector}
                          aria-haspopup="menu"
                          aria-expanded={openMenu === `${tier}:provider`}
                          onClick={() => { setOpenMenu(openMenu === `${tier}:provider` ? null : `${tier}:provider`) }}
                        >
                          <span className={css.selectorLabel}>{spec.provider}</span>
                          <IconChevronDownOutline14 className={css.chevron} />
                        </button>
                      )}
                    />
                  </div>
                  <div className={css.field}>
                    <span className={css.fieldLabel}>{t('model')}</span>
                    {/* 问题 5 (4.3): no 未在目录 chip — the store normalizes the
                        draft and provider switches re-point the model, so the
                        anchor is always a real catalog entry. */}
                    <Menu
                      open={openMenu === `${tier}:model`}
                      onClose={() => { setOpenMenu(null) }}
                      items={providerModels.map(model => ({ id: model.id, label: model.label }))}
                      selectedId={spec.model}
                      onSelect={(id) => {
                        setOpenMenu(null)
                        const chosen = providerModels.find(model => model.id === id)
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
                  </div>
                  <div className={css.field}>
                    <span className={css.fieldLabel}>{t('effortLabel')}</span>
                    {/* 批次B-B: the effort ladder comes from the selected model;
                        models without one hold the column with a disabled — so
                        the three-field rhythm never collapses (1.1). */}
                    {selected?.reasoning === undefined ? (
                      <button type="button" className={css.selector} disabled>
                        <span className={css.selectorLabel}>—</span>
                      </button>
                    ) : (
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
                            className={css.selector}
                            aria-haspopup="menu"
                            aria-expanded={openMenu === `${tier}:effort`}
                            onClick={() => { setOpenMenu(openMenu === `${tier}:effort` ? null : `${tier}:effort`) }}
                          >
                            <span className={css.selectorLabel}>{effortName}</span>
                            <IconChevronDownOutline14 className={css.chevron} />
                          </button>
                        )}
                      />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 1.3 block 2 — 工作流模型绑定. */}
      <div
        className={css.block}
        id={`${tabsId}-panel-phase`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-tab-phase`}
        hidden={routeTab !== 'phase'}
        data-testid="route-panel-phase"
      >
        <div className={css.flowHead}>
          <div className={css.legend}>
            {visibleTiers.map(tier => (
              <span key={tier} className={css.legendItem}>
                <span className={join(css.dot, TIER_CLASS[tier])} aria-hidden="true" />
                {t(tierKey(tier))}
              </span>
            ))}
          </div>
        </div>
        <div className={css.description}>{t(tierMode === 'two' ? 'flowHintTwo' : 'flowHint')}</div>
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
              {FLOW_EDGES.map(edge => (
                <path
                  key={`${edge.from}-${edge.to}`}
                  d={edgePath(edge)}
                  className={join(css.edge, edge.dashed === true ? css.edgeDashed : '')}
                  markerEnd="url(#route-flow-arrow)"
                />
              ))}
            </svg>
            {FLOW.map(({ node, key }) => {
              const raw = draft.phaseTier?.[node] ?? (tierMode === 'two' ? 'low' : 'mid')
              const tier = tierMode === 'two' && raw === 'mid' ? 'low' : raw
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
                  onClick={() => { setPhaseTier(node, nextTier(tier, tierMode)) }}
                >
                  <span className={css.nodeName}>{t(key)}</span>
                  <span className={css.nodeTier}>{t(tierKey(tier))}</span>
                  <span className={css.nodeModel}>{draft.tiers[tier].model}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* 1.3 block 3 — 关键词规则 (+ 预演). */}
      <div
        className={css.block}
        id={`${tabsId}-panel-keywords`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-tab-keywords`}
        hidden={routeTab !== 'keywords'}
        data-testid="route-panel-keywords"
      >
        <div className={css.description}>{t('keywordsHint')}</div>
        {/* 问题 4: the preset packs live in a user-editable file — say so. */}
        <div className={css.description}>{t('presetsFileHint')}</div>
        {keywordTiers.map((tier) => {
          const effectiveOf = (value: RouteTier): RouteTier =>
            tierMode === 'two' && value === 'mid' ? 'low' : value
          const rules = (draft.keywords ?? [])
            .map((rule, index) => ({ rule, index }))
            .filter(entry => effectiveOf(entry.rule.tier) === tier)
          // 【变更】2026-10-13 (worker 关键词批): keyword groups cover only the
          // escalation grades — Worker is the fallback (no keywords can land
          // there), and in two-grade mode mid coerces into the fallback too,
          // so mid rules/packs (e.g. qualityAssurance) simply don't render.
          const packs = (state.presets ?? []).filter(preset => effectiveOf(preset.tier) === tier)
          if (rules.length === 0 && packs.length === 0) return undefined
          // 问题 3 自定义功能分类: rules sharing a category render inside one
          // labelled SEGMENT whose switch parks the whole category at once.
          const categories = [...new Set(
            rules.map(entry => entry.rule.category)
              .filter((category): category is string => category !== undefined && category !== ''),
          )]
          const bare = rules.filter(entry => entry.rule.category === undefined || entry.rule.category === '')
          // 问题 5 (4.5): 中文/英文 split — CJK-carrying words one line, the
          // rest another; the caption rides only when both languages exist.
          const bothLanguages = (zh: number, en: number): boolean => zh > 0 && en > 0
          return (
            <div key={tier} className={css.ruleTier} data-testid="route-keyword-group">
              <span className={join(css.ruleTierLabel, TIER_CLASS[tier])}>{t(tierKey(tier))}</span>
              <div className={css.ruleTags}>
                {categories.map((category) => {
                  const entries = rules.filter(entry => entry.rule.category === category)
                  const allOn = entries.every(entry => entry.rule.enabled !== false)
                  const zh = entries.filter(({ rule }) => isCjkWord(rule.words))
                  const en = entries.filter(({ rule }) => !isCjkWord(rule.words))
                  return (
                    <span key={category} className={css.ruleCategory} data-testid="route-category">
                      <span className={css.ruleHead}>
                        <span className={css.ruleCategoryName}>{category}</span>
                        <span className={css.tagSwitchWrap} data-testid="route-category-toggle">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={allOn ? 'true' : 'false'}
                            aria-label={category}
                            className={css.tagSwitch}
                            onClick={() => { setCategoryEnabled(category, !allOn) }}
                          />
                        </span>
                      </span>
                      <TagLine label={t('tagsZh')} showLabel={bothLanguages(zh.length, en.length)}>
                        {zh.map(({ rule, index }) => renderUserRule(rule, index))}
                      </TagLine>
                      <TagLine label={t('tagsEn')} showLabel={bothLanguages(zh.length, en.length)}>
                        {en.map(({ rule, index }) => renderUserRule(rule, index))}
                      </TagLine>
                    </span>
                  )
                })}
                {(() => {
                  const zh = bare.filter(({ rule }) => isCjkWord(rule.words))
                  const en = bare.filter(({ rule }) => !isCjkWord(rule.words))
                  if (zh.length === 0 && en.length === 0) return undefined
                  return (
                    <span className={css.ruleBare}>
                      <TagLine label={t('tagsZh')} showLabel={bothLanguages(zh.length, en.length)}>
                        {zh.map(({ rule, index }) => renderUserRule(rule, index))}
                      </TagLine>
                      <TagLine label={t('tagsEn')} showLabel={bothLanguages(zh.length, en.length)}>
                        {en.map(({ rule, index }) => renderUserRule(rule, index))}
                      </TagLine>
                    </span>
                  )
                })()}
                {packs.map((preset) => {
                  // Known ids carry a display name; a version-skewed unknown id
                  // still renders (raw) rather than vanishing.
                  const known = (KEYWORD_PRESET_IDS as readonly string[]).includes(preset.id)
                  const packName = known ? t(presetNameKey(preset.id as KeywordPresetId)) : preset.id
                  const words = preset.words.split('|').filter(word => word !== '')
                  // 问题 3 类级一键开关: one switch parks the entire pack.
                  const packOn = draft.packs?.[preset.id] !== false
                  const zhWords = words.filter(isCjkWord)
                  const enWords = words.filter(word => !isCjkWord(word))
                  return (
                    <span key={preset.id} className={css.rulePack}>
                      <span className={css.ruleHead}>
                        <span className={css.rulePackName}>{packName}</span>
                        <span className={css.tagSwitchWrap} data-testid="route-pack-toggle">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={packOn ? 'true' : 'false'}
                            aria-label={packName}
                            className={css.tagSwitch}
                            onClick={() => { setPackEnabled(preset.id, !packOn) }}
                          />
                        </span>
                      </span>
                      <TagLine label={t('tagsZh')} showLabel={bothLanguages(zhWords.length, enWords.length)}>
                        {zhWords.map(word => renderPresetWord(preset, word, tier, packName))}
                      </TagLine>
                      <TagLine label={t('tagsEn')} showLabel={bothLanguages(zhWords.length, enWords.length)}>
                        {enWords.map(word => renderPresetWord(preset, word, tier, packName))}
                      </TagLine>
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
        <KeywordAdder
          id={{ words: keywordWordsId, tier: keywordTierId, category: keywordCategoryId }}
          tiers={keywordTiers}
          t={t}
          onAdd={addKeywordFrom}
        />
        <Switch checked={escalate} label={t('escalateOnly')} onChange={setEscalateOnly} />
        <div className={css.description}>{t('escalateOnlyHint')}</div>

        <div className={css.previewBlock}>
          <div className={css.blockTitle}>{t('previewTitle')}</div>
          <div className={css.description}>{t('previewAutoHint')}</div>
          <div className={css.previewBar}>
            <input
              className={css.input}
              data-testid="route-preview-input"
              placeholder={t('previewPlaceholder')}
              value={previewText}
              onChange={(event) => { setPreviewText(event.currentTarget.value) }}
            />
          </div>
          <div className={css.description}>
            {t(tierMode === 'two' ? 'previewVerifyHintTwo' : 'previewVerifyHint')}
          </div>
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
              {state.preview.tier === null ? (
                <div className={css.previewLine}>{t('previewNone')}</div>
              ) : (
                <>
                  <div className={css.previewLine}>
                    <span className={css.previewLabel}>{t('previewMatched')}</span>
                    <span>{state.preview.matched ?? '—'}</span>
                  </div>
                  <div className={css.previewLine}>
                    <span className={css.previewLabel}>{t('previewRole')}</span>
                    <span>{t(tierKey(state.preview.tier))}</span>
                  </div>
                  <div className={css.previewLine}>
                    <span className={css.previewLabel}>{t('previewModel')}</span>
                    <span>
                      {state.preview.provider !== undefined && state.preview.model !== undefined
                        ? `${state.preview.provider} / ${state.preview.model}`
                        : '—'}
                    </span>
                  </div>
                  {state.preview.escalated === true
                    ? <div className={css.previewNote}>{t('previewEscalated')}</div>
                    : null}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 【变更】2026-10-12 (问题 1.3): 高级 tab — 恢复默认 moved here from the
          action row, so the destructive reset sits behind an explicit hop
          instead of beside the save cluster. */}
      <div
        className={css.block}
        id={`${tabsId}-panel-advanced`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-tab-advanced`}
        hidden={routeTab !== 'advanced'}
        data-testid="route-panel-advanced"
      >
        <div className={css.description}>{t('advancedHint')}</div>
        <div>
          <button
            type="button"
            className={css.btn}
            disabled={state.saving}
            data-testid="route-reset"
            onClick={() => { void reset() }}
          >
            {t('reset')}
          </button>
        </div>
      </div>

      {state.error === undefined ? undefined : (
        <div className={css.error} data-testid="route-error">{state.error}</div>
      )}
    </div>
  )

  /** Commit the open keyword-tag edit (words from the inline input, tier from
   *  the selector, and the rule's own 功能分类 carried through untouched). */
  function commitKeywordEdit(input: HTMLInputElement | null, category?: string): void {
    if (input === null || keywordEdit === null) return
    const words = input.value
    if (words === '') return
    updateKeyword(keywordEdit.index, {
      words,
      tier: keywordEdit.tier,
      ...(category === undefined ? {} : { category }),
    })
    setKeywordEdit(null)
  }
}

/** Uncontrolled words + optional category + tier inputs that append one rule. */
function KeywordAdder({ id, tiers, t, onAdd }: {
  id: { words: string; tier: string; category: string }
  tiers: readonly RouteTier[]
  t: (key: 'keywordWords' | 'keywordCategory' | 'keywordTier' | 'keywordAdd'
    | 'tierHigh' | 'tierMid' | 'tierLow') => string
  onAdd: (words: string, tier: RouteTier, category: string) => void
}) {
  // The row reads its own inputs by id on commit (Enter or the button) — an
  // empty 功能分类 adds a bare rule, a filled one labels it for 类级 grouping.
  const readRow = (): { words: string; tier: RouteTier; category: string } => {
    const words = document.getElementById(id.words) as HTMLInputElement | null
    const tier = document.getElementById(id.tier) as HTMLSelectElement | null
    const category = document.getElementById(id.category) as HTMLInputElement | null
    return {
      words: words?.value ?? '',
      tier: (tier?.value ?? 'high') as RouteTier,
      category: category?.value ?? '',
    }
  }
  const commit = (): void => {
    const { words, tier, category } = readRow()
    onAdd(words, tier, category)
    const wordsInput = document.getElementById(id.words) as HTMLInputElement | null
    if (wordsInput !== null) wordsInput.value = ''
  }
  return (
    <div className={css.keywordRow} data-testid="route-keyword-adder">
      <input
        id={id.words}
        className={css.input}
        data-testid="route-keyword-add-words"
        placeholder={t('keywordWords')}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
        }}
      />
      <input
        id={id.category}
        className={css.input}
        data-testid="route-keyword-add-category"
        placeholder={t('keywordCategory')}
      />
      <select id={id.tier} className={css.select} aria-label={t('keywordTier')} defaultValue="high">
        {tiers.map(option => (
          <option key={option} value={option}>
            {t(tierKey(option))}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={css.btn}
        onClick={() => { commit() }}
      >
        {t('keywordAdd')}
      </button>
    </div>
  )
}
