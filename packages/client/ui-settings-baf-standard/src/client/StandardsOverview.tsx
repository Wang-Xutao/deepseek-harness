/**
 * BAF 工程规范 settings panels (2026-10-12 工作流设置 7): split across 项目工程 /
 * 企业规范 / 质量监控 tabs — read-only baseline projections without workspace
 * meta dumps; enterprise rules group by workflow stage.
 *
 * 【变更】2026-10-13 (问题 4 批, 客户决策): 企业规范's 8-domain structure and
 * stage grouping are product constants and ALWAYS render — only the rules
 * content needs the baseline (per-area body and the full document degrade
 * with a /baf-scaffold pointer). 质量监控 gains an always-on gate-mechanism
 * card (product-fixed knowledge); its stack card stays baseline-gated (the
 * commands/thresholds ARE the project's git-managed baseline config).
 */
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { BafStandardCardId, BafStandardFieldRow } from '../types.ts'
import type { StandardsOverviewFace, StandardsOverviewState } from './standards-store.ts'
import { NS, type BafStandardKey } from './locales.ts'
import css from './StandardsOverview.module.css'

const identity = <T,>(value: T): T => value

const AREA_META: Record<string, readonly [BafStandardKey, BafStandardKey]> = {
  'project-charter': ['area.project-charter', 'areaDesc.project-charter'],
  'coding-style': ['area.coding-style', 'areaDesc.coding-style'],
  interfaces: ['area.interfaces', 'areaDesc.interfaces'],
  'error-handling': ['area.error-handling', 'areaDesc.error-handling'],
  logging: ['area.logging', 'areaDesc.logging'],
  documentation: ['area.documentation', 'areaDesc.documentation'],
  'branch-commit': ['area.branch-commit', 'areaDesc.branch-commit'],
  'testing-discipline': ['area.testing-discipline', 'areaDesc.testing-discipline'],
}

/** Workflow stages → rule domains shown under 企业规范. */
const STAGE_AREA_GROUPS: readonly {
  stageKey: BafStandardKey
  hintKey: BafStandardKey
  areas: readonly string[]
}[] = [
  { stageKey: 'stage.intake', hintKey: 'stageHint.intake', areas: ['project-charter'] },
  { stageKey: 'stage.open', hintKey: 'stageHint.open', areas: ['documentation'] },
  { stageKey: 'stage.clarify', hintKey: 'stageHint.clarify', areas: ['interfaces'] },
  { stageKey: 'stage.design', hintKey: 'stageHint.design', areas: ['coding-style', 'error-handling'] },
  { stageKey: 'stage.plan', hintKey: 'stageHint.plan', areas: ['branch-commit', 'logging'] },
  { stageKey: 'stage.verify', hintKey: 'stageHint.verify', areas: ['testing-discipline'] },
]

const PROJECT_CARD_IDS: readonly BafStandardCardId[] = ['workflow', 'route', 'openspec', 'guard']
const QUALITY_CARD_IDS: readonly BafStandardCardId[] = ['quality']
const STANDARD_CARD_IDS: readonly BafStandardCardId[] = ['standard']

/** Resolve a host area's id from its `titleKey` (`<NS>.area.<id>`). */
function areaIdOf(titleKey: string, fallbackId: string): string {
  const prefix = `${NS}.area.`
  return titleKey.startsWith(prefix) ? titleKey.slice(prefix.length) : fallbackId
}

/**
 * Slice one rule domain's rules out of the rules document.
 * @param content - the rules document text.
 * @param anchor - the area's heading anchor (its id).
 * @returns the trimmed section, or undefined when the heading is absent.
 */
export function sliceAreaContent(content: string, anchor: string): string | undefined {
  const lines = content.split('\n')
  const start = lines.findIndex(line => line.startsWith(`## ${anchor} `) || line.trim() === `## ${anchor}`)
  if (start === -1) return undefined
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index]?.startsWith('## ') === true) {
      end = index
      break
    }
  }
  return lines.slice(start, end).join('\n').trim()
}

const CARD_META: Record<BafStandardCardId, readonly [BafStandardKey, BafStandardKey, BafStandardKey]> = {
  workflow: ['cardTitleWorkflow', 'cardDescWorkflow', 'cardCommandWorkflow'],
  route: ['cardTitleRoute', 'cardDescRoute', 'cardCommandRoute'],
  openspec: ['cardTitleOpenspec', 'cardDescOpenspec', 'cardCommandOpenspec'],
  standard: ['cardTitleStandard', 'cardDescStandard', 'cardCommandStandard'],
  quality: ['cardTitleQuality', 'cardDescQuality', 'cardCommandQuality'],
  guard: ['cardTitleGuard', 'cardDescGuard', 'cardCommandGuard'],
}

const AVAILABILITY_TEXT: Record<string, BafStandardKey> = {
  ready: 'stateAvailabilityReady',
  policy_missing: 'stateAvailabilityMissing',
}

/** Shared inject + locale props for all standards panels. */
export type StandardsPanelProps =
  PropsRuntime<'settings.workflow.item'>
  & PropsLocale<'baf.standard'>
  & InjectFace<StandardsOverviewFace>

/** @deprecated Use StandardsEnterpriseOverview — kept for spec imports. */
export type StandardsOverviewProps = StandardsPanelProps

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

function PanelHead({ titleKey, descKey, t }: {
  titleKey: BafStandardKey
  descKey: BafStandardKey
  t: StandardsPanelProps['t']
}) {
  return (
    <div className={css.head}>
      <div>
        <div className={css.title}>{t(titleKey)}</div>
        <div className={css.description}>{t(descKey)}</div>
      </div>
    </div>
  )
}

function StatusSurface({ state, summary, t }: {
  state: StandardsOverviewState
  summary: StandardsOverviewState['summary']
  t: StandardsPanelProps['t']
}) {
  if (state.status === 'loading') return <div className={css.status}>{t('statusLoading')}</div>
  if (state.status === 'failed') {
    return (
      <div className={css.statusError} data-testid="baf-standard-failed">
        {t('statusFailed')}{summary?.error ?? 'unknown'}
      </div>
    )
  }
  // 【变更】2026-10-12 (问题 4.2): the no-workspace / no-baseline answers used
  // to render NOTHING here — the tab body read as a blank page. Both now show
  // their guidance copy (pointing at /baf-scaffold), so every tab always
  // explains itself.
  if (state.status === 'no-workspace') {
    return <div className={css.status} data-testid="baf-standard-empty">{t('statusNoWorkspace')}</div>
  }
  if (state.status === 'no-baseline') {
    return <div className={css.status} data-testid="baf-standard-empty">{t('statusNoBaseline')}</div>
  }
  return null
}

function PackageCard({ cardId, fields, t }: {
  cardId: BafStandardCardId
  fields: readonly BafStandardFieldRow[]
  t: StandardsPanelProps['t']
}) {
  const [titleKey, descKey, commandKey] = CARD_META[cardId]
  return (
    <div className={css.card} data-testid={`baf-standard-card-${cardId}`}>
      <div className={css.cardTitle}>{t(titleKey)}</div>
      <div className={css.cardDesc}>{t(descKey)}</div>
      <div className={css.cardCommand}>{t(commandKey)}</div>
      <FieldTable fields={fields} t={t} />
    </div>
  )
}

function usePanelState(props: StandardsPanelProps) {
  const state = props.useStandards(identity<StandardsOverviewState>)
  return { state, summary: state.summary }
}

/** 项目工程 tab — plugin cards for workflow routing, openspec, guard, scaffold. */
export function StandardsProjectOverview(props: StandardsPanelProps) {
  const { state, summary } = usePanelState(props)
  const { t } = props
  const cards = (summary?.cards ?? []).filter(card => PROJECT_CARD_IDS.includes(card.id))

  return (
    <section className={css.block} data-testid="baf-standard-project">
      <PanelHead titleKey="panelProjectTitle" descKey="panelProjectDescription" t={t} />
      <StatusSurface state={state} summary={summary} t={t} />
      {summary?.status === 'ready' ? (
        <div className={css.grid}>
          {/* 【变更】2026-10-12 (问题 4.3 客户确认): 基线档案头卡 — the repo-tied,
              git-managed anchor of every projection on this page: the baseline
              id, its bafCompatibility window, and the actual baseline.yml path.
              All three already ride the summary wire — zero new host reads. */}
          <div className={css.card} data-testid="baf-standard-card-baseline">
            <div className={css.cardTitle}>{t('cardTitleBaseline')}</div>
            <div className={css.cardDesc}>{t('cardDescBaseline')}</div>
            <FieldTable
              fields={[
                { field: t('baselineLabel'), value: summary.baselineId ?? '—', state: 'ok' },
                {
                  field: t('compatLabel'),
                  value: summary.compatibility === undefined
                    ? '—'
                    : `${summary.compatibility.min} ~ ${summary.compatibility.max}`,
                  state: 'ok',
                },
                { field: t('configFileLabel'), value: summary.baselinePath ?? '—', state: 'ok' },
              ]}
              t={t}
            />
          </div>
          {cards.map(card => (
            <PackageCard key={card.id} cardId={card.id} fields={card.fields} t={t} />
          ))}
          <div className={css.card} data-testid="baf-standard-card-scaffold">
            <div className={css.cardTitle}>{t('cardTitleScaffold')}</div>
            <div className={css.cardDesc}>{t('cardDescScaffold')}</div>
            <div className={css.cardCommand}>{t('cardCommandScaffold')}</div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

/** 质量监控 tab — product-fixed gate mechanism + the baseline's stack card. */
export function StandardsQualityOverview(props: StandardsPanelProps) {
  const { state, summary } = usePanelState(props)
  const { t } = props
  const cards = (summary?.cards ?? []).filter(card => QUALITY_CARD_IDS.includes(card.id))

  return (
    <section className={css.blockQuality} data-testid="baf-standard-quality">
      <PanelHead titleKey="panelQualityTitle" descKey="panelQualityDescription" t={t} />
      <StatusSurface state={state} summary={summary} t={t} />
      {/* 【变更】2026-10-13 (问题 4 批, 客户决策): the gate MECHANISM is product
          knowledge and always shows — the per-project card below it (commands,
          coverage floor, analyzers) is the baseline's stack section, i.e. the
          same git-managed project config 项目工程 projects; without a baseline
          there is nothing real to show and the banner above explains why. */}
      <div className={css.mechanismCard} data-testid="baf-standard-quality-mechanism">
        <div className={css.cardTitle}>{t('qualityMechanismTitle')}</div>
        <div className={css.cardDesc}>{t('qualityMechanismBody')}</div>
      </div>
      {summary?.status === 'ready' ? (
        <div className={css.qualityGrid}>
          {cards.map(card => (
            <PackageCard key={card.id} cardId={card.id} fields={card.fields} t={t} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function AreaRow({ id, state, loadRules, toggleArea, t }: {
  id: string
  state: StandardsOverviewState
  loadRules: () => Promise<void>
  toggleArea: (id: string) => void
  t: StandardsPanelProps['t']
}) {
  const meta = AREA_META[id]
  const expanded = state.areasExpanded[id] === true
  const content = state.rules?.status === 'ready' && state.rules.content !== undefined
    ? sliceAreaContent(state.rules.content, id)
    : undefined
  return (
    <div className={css.areaRow} data-testid={`baf-standard-area-${id}`}>
      <button
        type="button"
        className={css.areaHead}
        data-testid={`baf-standard-area-toggle-${id}`}
        onClick={() => {
          if (state.rules === undefined) void loadRules()
          toggleArea(id)
        }}
      >
        <span className={css.areaTitle}>{meta === undefined ? id : t(meta[0])}</span>
        <span className={css.areaDesc}>{meta === undefined ? '' : t(meta[1])}</span>
        <span className={css.areaToggle}>{expanded ? t('areaCollapse') : t('areaExpand')}</span>
      </button>
      {expanded ? (
        state.rules === undefined ? (
          <div className={css.status}>{t('statusLoading')}</div>
        ) : state.rules.status === 'ready' ? (
          content !== undefined ? (
            <pre className={css.areaBody} data-testid={`baf-standard-area-body-${id}`}>{content}</pre>
          ) : (
            <div className={css.status} data-testid={`baf-standard-area-missing-${id}`}>{t('areaNoContent')}</div>
          )
        ) : (
          // 【变更】2026-10-13 (问题 4 批): the rules document needs the baseline
          // to locate it — the 8-domain STRUCTURE is a product constant, only
          // the content degrades with a pointer at /baf-scaffold.
          <div className={css.status} data-testid={`baf-standard-area-needs-${id}`}>{t('areaNeedsBaseline')}</div>
        )
      ) : null}
    </div>
  )
}

/** 企业规范 tab — rules grouped by workflow stage + optional full document. */
export function StandardsEnterpriseOverview(props: StandardsPanelProps) {
  const { state, summary } = usePanelState(props)
  const { loadRules, toggleRules, toggleArea, t } = props
  const standardCards = (summary?.cards ?? []).filter(card => STANDARD_CARD_IDS.includes(card.id))
  const areaById = new Map(
    (summary?.standardAreas ?? []).map(area => [areaIdOf(area.titleKey, area.id), area]),
  )

  return (
    <section className={css.block} data-testid="baf-standard-overview">
      <PanelHead titleKey="panelStandardTitle" descKey="panelStandardDescription" t={t} />
      <StatusSurface state={state} summary={summary} t={t} />
      {summary?.status === 'ready' && standardCards.length > 0 ? (
        <div className={css.grid}>
          {standardCards.map(card => (
            <PackageCard key={card.id} cardId={card.id} fields={card.fields} t={t} />
          ))}
        </div>
      ) : null}

      {/* 【变更】2026-10-13 (问题 4 批, 客户决策): the 8-domain structure and
          stage grouping are PRODUCT CONSTANTS — they always render. Only the
          rules-document CONTENT needs the baseline (to locate the file), and
          the per-area body degrades with a /baf-scaffold pointer when the
          rules fetch answers unavailable. */}
      <div className={css.rules} data-testid="baf-standard-areas">
        <div className={css.rulesHead}>
          <div>
            <div className={css.cardTitle}>{t('areasTitle')}</div>
            <div className={css.cardDesc}>{t('areasHint')}</div>
          </div>
        </div>
        <div className={css.stageList}>
          {STAGE_AREA_GROUPS.map((group) => {
            // The server list wins when present; without a baseline the static
            // catalog ids render directly (same ids, same anchors).
            const areas = group.areas.map(id => areaById.get(id) ?? { id, titleKey: `${NS}.area.${id}`, sourceRef: '' })
            return (
              <section key={group.stageKey} className={css.stageGroup} data-testid={`baf-standard-stage-${group.stageKey}`}>
                <div className={css.stageTitle}>{t(group.stageKey)}</div>
                <div className={css.stageHint}>{t(group.hintKey)}</div>
                <div className={css.areaList}>
                  {areas.map((area) => {
                    const id = areaIdOf(area.titleKey, area.id)
                    return (
                      <AreaRow
                        key={id}
                        id={id}
                        state={state}
                        loadRules={loadRules}
                        toggleArea={toggleArea}
                        t={t}
                      />
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
        <div className={css.fromLiving}>{t('fromLiving')}</div>
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
                <pre className={css.rulesBody} data-testid="baf-standard-rules-body">{state.rules.content}</pre>
              )
              : state.rules.status === 'unreadable'
                ? <div className={css.statusError}>{t('rulesUnreadable')}{state.rules.reason}</div>
                : (
                  <div className={css.status} data-testid="baf-standard-rules-unavailable">
                    {summary?.status === 'ready' && summary.standardAvailability === 'policy_missing'
                      ? t('rulesUnavailablePolicy')
                      : summary?.status === 'no-baseline'
                        ? t('rulesUnavailableNoBaseline')
                        : t('rulesUnavailableNoWorkspace')}
                  </div>
                )
        ) : null}
      </div>
    </section>
  )
}

/** @deprecated Alias for StandardsEnterpriseOverview. */
export const StandardsOverview = StandardsEnterpriseOverview
