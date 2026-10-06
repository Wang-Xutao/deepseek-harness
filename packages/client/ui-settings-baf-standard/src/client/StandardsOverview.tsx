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
import { NS, type BafStandardKey } from './locales.ts'
import css from './StandardsOverview.module.css'

const identity = <T,>(value: T): T => value

/**
 * 【变更】2026-10-07 (九点批 问题 8): per-domain locale keys (title + one-line
 * jurisdiction), keyed by area id — the host's `titleKey` resolves into this
 * table after its `${NS}.area.` prefix is stripped.
 */
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

/** Resolve a host area's id from its `titleKey` (`<NS>.area.<id>`). */
function areaIdOf(titleKey: string, fallbackId: string): string {
  const prefix = `${NS}.area.`
  return titleKey.startsWith(prefix) ? titleKey.slice(prefix.length) : fallbackId
}

/**
 * Slice one rule domain's rules out of the rules document: the section from
 * its `## <anchor>…` heading up to the next `## ` heading (the scaffold's
 * headings carry a Chinese tail after the anchor — `## logging 日志` — so the
 * match is prefix-wise). Pure; exported for the client spec.
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
export function StandardsOverview({ useStandards, reload, loadRules, toggleRules, toggleArea, t }: StandardsOverviewProps) {
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

          {/* 【变更】2026-10-07 (九点批 问题 8): the 8 rule domains, one digest row
              each — title + one-line jurisdiction + anchored pointer; expanding
              slices the domain's rules out of the loaded rules document. */}
          <div className={css.rules} data-testid="baf-standard-areas">
            <div className={css.rulesHead}>
              <div>
                <div className={css.cardTitle}>{t('areasTitle')}</div>
                <div className={css.cardDesc}>{t('areasHint')}</div>
              </div>
            </div>
            <div className={css.areaList}>
              {(summary.standardAreas ?? []).map((area) => {
                const id = areaIdOf(area.titleKey, area.id)
                const meta = AREA_META[id]
                const expanded = state.areasExpanded[id] === true
                const content = state.rules?.status === 'ready' && state.rules.content !== undefined
                  ? sliceAreaContent(state.rules.content, id)
                  : undefined
                return (
                  <div key={id} className={css.areaRow} data-testid={`baf-standard-area-${id}`}>
                    <button
                      type="button"
                      className={css.areaHead}
                      data-testid={`baf-standard-area-toggle-${id}`}
                      onClick={() => { toggleArea(id) }}
                    >
                      <span className={css.areaTitle}>{meta === undefined ? id : t(meta[0])}</span>
                      <span className={css.areaDesc}>{meta === undefined ? '' : t(meta[1])}</span>
                      <span className={css.areaToggle}>{expanded ? t('areaCollapse') : t('areaExpand')}</span>
                    </button>
                    <span className={css.areaAnchor}>{area.sourceRef}</span>
                    {expanded ? (
                      content !== undefined ? (
                        <pre className={css.areaBody} data-testid={`baf-standard-area-body-${id}`}>{content}</pre>
                      ) : (
                        <div className={css.status} data-testid={`baf-standard-area-missing-${id}`}>{t('areaNoContent')}</div>
                      )
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 【变更】2026-10-07 (九点批 问题 8): the provenance chain — where the
              rules document comes from, who reads it, and how to swap it. */}
          <div className={css.rules} data-testid="baf-standard-from">
            <div className={css.cardTitle}>{t('fromTitle')}</div>
            <ol className={css.fromSteps}>
              <li data-testid="baf-standard-from-step-1">{t('fromStep1')}</li>
              <li data-testid="baf-standard-from-step-2">{t('fromStep2')}</li>
              <li data-testid="baf-standard-from-step-3">{t('fromStep3')}</li>
              <li data-testid="baf-standard-from-step-4">{t('fromStep4')}</li>
            </ol>
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
