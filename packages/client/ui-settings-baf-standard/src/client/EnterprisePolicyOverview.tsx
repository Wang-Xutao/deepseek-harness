/**
 * Settings B — enterprise policy & gates (read-only, tabbed).
 */
import { useId, useState } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { BafEnterpriseFact } from '../types.ts'
import type { StandardsOverviewFace, StandardsOverviewState } from './standards-store.ts'
import { sliceAreaContent } from './slice-area.ts'
import { WorkflowGatesDiagram } from './WorkflowGatesDiagram.tsx'
import { NS, type BafStandardKey } from './locales.ts'
import css from './StandardsOverview.module.css'

const identity = <T,>(value: T): T => value

type PolicyTabId = 'overview' | 'gates' | 'quality' | 'standards'

const POLICY_TABS: readonly { id: PolicyTabId; labelKey: BafStandardKey }[] = [
  { id: 'overview', labelKey: 'tabOverview' },
  { id: 'gates', labelKey: 'tabGates' },
  { id: 'quality', labelKey: 'tabQuality' },
  { id: 'standards', labelKey: 'tabStandards' },
]

/** Engineering-standards domains grouped for scanability. */
const AREA_GROUPS: readonly {
  id: string
  titleKey: BafStandardKey
  hintKey: BafStandardKey
  areas: readonly string[]
}[] = [
  {
    id: 'foundation',
    titleKey: 'areaGroupFoundation',
    hintKey: 'areaGroupFoundationHint',
    areas: ['project-charter', 'coding-style', 'interfaces'],
  },
  {
    id: 'reliability',
    titleKey: 'areaGroupReliability',
    hintKey: 'areaGroupReliabilityHint',
    areas: ['error-handling', 'logging', 'testing-discipline'],
  },
  {
    id: 'delivery',
    titleKey: 'areaGroupDelivery',
    hintKey: 'areaGroupDeliveryHint',
    areas: ['documentation', 'branch-commit'],
  },
]

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

const UNIT_TEST_FACT_IDS = new Set([
  'compiler', 'build', 'test', 'coverageRequired', 'coverageMinimum',
])
const STATIC_FACT_IDS = new Set(['analyzers'])
const GUARD_FACT_IDS = new Set([
  'secretScan', 'protectedPaths', 'requireHumanConfirmation',
])

function areaIdOf(titleKey: string, fallbackId: string): string {
  const prefix = `${NS}.area.`
  return titleKey.startsWith(prefix) ? titleKey.slice(prefix.length) : fallbackId
}

function pickFacts(facts: readonly BafEnterpriseFact[], ids: ReadonlySet<string>): BafEnterpriseFact[] {
  return facts.filter(fact => ids.has(fact.id))
}

export type EnterprisePolicyOverviewProps =
  PropsRuntime<'settings.workflow.item'>
  & PropsLocale<'baf.standard'>
  & InjectFace<StandardsOverviewFace>

function FactRows({ facts, t }: {
  facts: readonly BafEnterpriseFact[]
  t: PropsLocale<'baf.standard'>['t']
}) {
  if (facts.length === 0) return null
  return (
    <>
      {facts.map(fact => (
        <div key={fact.id} className={css.row} data-testid={`baf-fact-${fact.id}`}>
          <div className={css.rowText}>
            <div className={css.rowTitle}>
              {t(fact.labelKey as BafStandardKey)}
              <span className={fact.userOverrideAllowed ? css.chipOverride : css.chipForced}>
                {fact.userOverrideAllowed ? t('chipOverride') : t('chipForced')}
              </span>
              {fact.state === 'tbd' ? <span className={css.chipTbd}>{t('stateTbd')}</span> : null}
            </div>
          </div>
          <div className={css.rowControl}>
            <div className={fact.state === 'tbd' ? css.valueTbd : css.value}>{fact.value}</div>
          </div>
        </div>
      ))}
    </>
  )
}

function DocLink({
  path, cwd, openSourceFile, t, testId,
}: {
  path: string
  cwd: string | undefined
  openSourceFile: StandardsOverviewFace['openSourceFile']
  t: PropsLocale<'baf.standard'>['t']
  testId?: string
}) {
  return (
    <button
      type="button"
      className={css.linkButton}
      data-testid={testId}
      title={`${t('openSource')}（${t('readonlyBadge')}）`}
      onClick={() => { void openSourceFile(path) }}
    >
      {cwd !== undefined && path.startsWith(cwd) ? path.slice(cwd.length).replace(/^[\\/]/u, '') || path : path}
    </button>
  )
}

function AreaBlock({
  areaId, area, policyCwd, content, expanded, openSourceFile, toggleArea, t,
}: {
  areaId: string
  area: { sourceRef: string }
  policyCwd: string | undefined
  content: string | undefined
  expanded: boolean
  openSourceFile: StandardsOverviewFace['openSourceFile']
  toggleArea: (id: string) => void
  t: PropsLocale<'baf.standard'>['t']
}) {
  const meta = AREA_META[areaId]
  return (
    <div key={areaId} className={css.areaRow} data-testid={`baf-standard-area-${areaId}`}>
      <button
        type="button"
        className={css.areaHead}
        data-testid={`baf-standard-area-toggle-${areaId}`}
        onClick={() => { toggleArea(areaId) }}
      >
        <span className={css.areaTitle}>{meta === undefined ? areaId : t(meta[0])}</span>
        <span className={css.areaDesc}>{meta === undefined ? '' : t(meta[1])}</span>
        <span className={css.areaToggle}>{expanded ? t('areaCollapse') : t('areaExpand')}</span>
      </button>
      <div className={css.areaAnchor}>
        <DocLink
          path={area.sourceRef.replace(/#.*$/u, '')}
          cwd={policyCwd}
          openSourceFile={openSourceFile}
          t={t}
          testId={`baf-standard-area-link-${areaId}`}
        />
        <span className={css.chipForced}>{t('readonlyBadge')}</span>
      </div>
      {expanded ? (
        content !== undefined ? (
          <pre className={css.areaBody} data-testid={`baf-standard-area-body-${areaId}`}>{content}</pre>
        ) : (
          <div className={css.status} data-testid={`baf-standard-area-missing-${areaId}`}>{t('areaNoContent')}</div>
        )
      ) : null}
    </div>
  )
}

/** B-layer enterprise policy overview. */
export function EnterprisePolicyOverview({
  useStandards, loadRules, toggleRules, toggleArea, openSourceFile, t,
}: EnterprisePolicyOverviewProps) {
  const state = useStandards(identity<StandardsOverviewState>)
  const policy = state.policy
  const quality = policy?.status === 'ready' ? (policy.qualityFacts ?? []) : []
  const gatesLoading = policy?.status === 'ready'
    && (policy.confirmGates?.length ?? 0) === 0
    && (policy.stageGates?.length ?? 0) === 0
    && state.gatesLoading
  const tabsId = useId()
  const [activeTab, setActiveTab] = useState<PolicyTabId>('overview')

  return (
    <section className={css.block} data-testid="baf-enterprise-policy">
      <div className={css.head}>
        <div className={css.title}>{t('enterpriseTitle')}</div>
      </div>

      {state.status === 'loading' ? <div className={css.status}>{t('statusLoading')}</div> : null}
      {state.status === 'no-workspace' ? <div className={css.status}>{t('statusNoWorkspace')}</div> : null}
      {state.status === 'no-baseline' ? <div className={css.status}>{t('statusNoBaseline')}</div> : null}
      {state.status === 'failed' ? (
        <div className={css.statusError} data-testid="baf-enterprise-failed">
          {t('statusFailed')}{policy?.error ?? 'unknown'}
        </div>
      ) : null}

      {policy?.status === 'ready' ? (
        <>
          <div className={css.tabs} role="tablist" aria-label={t('tabsLabel')} data-testid="baf-policy-tabs">
            {POLICY_TABS.map((tab) => {
              const selected = tab.id === activeTab
              return (
                <button
                  key={tab.id}
                  id={`${tabsId}-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  className={css.tab}
                  aria-selected={selected}
                  aria-controls={`${tabsId}-panel-${tab.id}`}
                  data-active={selected ? 'true' : undefined}
                  data-testid={`baf-policy-tab-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => {
                    setActiveTab(tab.id)
                    if (tab.id === 'standards' && state.rules === undefined) void loadRules()
                  }}
                >
                  {t(tab.labelKey)}
                </button>
              )
            })}
          </div>

          <div
            id={`${tabsId}-panel-overview`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-tab-overview`}
            hidden={activeTab !== 'overview'}
            data-testid="baf-tab-panel-overview"
          >
            <div className={css.meta} data-testid="baf-enterprise-meta">
              <span>{t('baselineLabel')}：{policy.baselineId}</span>
              <span>{t('compatLabel')}：{policy.compatibility?.min} ~ {policy.compatibility?.max}</span>
              {policy.cwd !== undefined && policy.cwd !== ''
                ? <span>{t('cwdLabel')}：{policy.cwd}</span>
                : null}
            </div>
            <div className={css.moduleHint}>{t('overviewHint')}</div>
            {policy.baselineId === 'baf-baseline-product-default'
              || policy.baselinePath === '(product-default)'
              ? <div className={css.status} data-testid="baf-default-baseline-hint">{t('defaultBaselineHint')}</div>
              : null}
            <div className={css.module} data-testid="baf-section-guard">
              <div className={css.moduleTitle}>{t('sectionGuard')}</div>
              <div className={css.moduleHint}>{t('sectionGuardHint')}</div>
              <FactRows facts={pickFacts(quality, GUARD_FACT_IDS)} t={t} />
            </div>
          </div>

          <div
            id={`${tabsId}-panel-gates`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-tab-gates`}
            hidden={activeTab !== 'gates'}
            data-testid="baf-tab-panel-gates"
          >
            <div className={css.module} data-testid="baf-section-flow-diagram">
              <div className={css.moduleTitle}>{t('sectionFlowDiagram')}</div>
              <div className={css.moduleHint}>{t('sectionFlowDiagramHint')}</div>
              <WorkflowGatesDiagram
                confirmGates={policy.confirmGates ?? []}
                stageGates={policy.stageGates ?? []}
                loading={gatesLoading}
                t={t}
              />
            </div>
          </div>

          <div
            id={`${tabsId}-panel-quality`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-tab-quality`}
            hidden={activeTab !== 'quality'}
            data-testid="baf-tab-panel-quality"
          >
            <div className={css.module} data-testid="baf-section-quality">
              <div className={css.moduleTitle}>{t('sectionQuality')}</div>
              <div className={css.moduleHint}>{t('sectionQualityHint')}</div>
              <div className={css.subModule} data-testid="baf-section-unit-test">
                <div className={css.subModuleTitle}>{t('sectionUnitTest')}</div>
                <div className={css.moduleHint}>{t('sectionUnitTestHint')}</div>
                <FactRows facts={pickFacts(quality, UNIT_TEST_FACT_IDS)} t={t} />
              </div>
              <div className={css.subModule} data-testid="baf-section-static-analysis">
                <div className={css.subModuleTitle}>{t('sectionStaticAnalysis')}</div>
                <div className={css.moduleHint}>{t('sectionStaticAnalysisHint')}</div>
                <FactRows facts={pickFacts(quality, STATIC_FACT_IDS)} t={t} />
              </div>
            </div>
          </div>

          <div
            id={`${tabsId}-panel-standards`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-tab-standards`}
            hidden={activeTab !== 'standards'}
            data-testid="baf-tab-panel-standards"
          >
            <div className={css.module} data-testid="baf-section-rules">
              <div className={css.moduleTitle}>{t('sectionRules')}</div>
              <div className={css.moduleHint}>{t('sectionRulesHint')}</div>
              {policy.standardSourceRef !== undefined ? (
                <div className={css.row}>
                  <div className={css.rowText}>
                    <div className={css.rowTitle}>
                      {t('fact.mattRef')}
                      <span className={css.chipForced}>{t('readonlyBadge')}</span>
                    </div>
                  </div>
                  <div className={css.rowControl}>
                    <DocLink
                      path={policy.standardSourceRef}
                      cwd={policy.cwd}
                      openSourceFile={openSourceFile}
                      t={t}
                      testId="baf-rules-path-link"
                    />
                  </div>
                </div>
              ) : null}

              {(policy.standardAreas ?? []).length > 0 ? (
                <div className={css.areaGroups} data-testid="baf-standard-areas">
                  {AREA_GROUPS.map((group) => {
                    const areas = (policy.standardAreas ?? []).filter((area) => {
                      const id = areaIdOf(area.titleKey, area.id)
                      return group.areas.includes(id)
                    })
                    if (areas.length === 0) return null
                    return (
                      <div key={group.id} className={css.areaGroup} data-testid={`baf-area-group-${group.id}`}>
                        <div className={css.areaGroupTitle}>{t(group.titleKey)}</div>
                        <div className={css.moduleHint}>{t(group.hintKey)}</div>
                        <div className={css.areaList}>
                          {areas.map((area) => {
                            const id = areaIdOf(area.titleKey, area.id)
                            const expanded = state.areasExpanded[id] === true
                            const content = state.rules?.status === 'ready' && state.rules.content !== undefined
                              ? sliceAreaContent(state.rules.content, id)
                              : undefined
                            return (
                              <AreaBlock
                                key={id}
                                areaId={id}
                                area={area}
                                policyCwd={policy.cwd}
                                content={content}
                                expanded={expanded}
                                openSourceFile={openSourceFile}
                                toggleArea={(areaKey) => {
                                  if (state.rules === undefined) void loadRules()
                                  toggleArea(areaKey)
                                }}
                                t={t}
                              />
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}

              <div className={css.rulesHead}>
                <div className={css.rowTitle}>{t('rulesTitle')}</div>
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
                      <div>
                        {state.rules.path !== undefined ? (
                          <div className={css.row}>
                            <div className={css.rowText}>
                              <div className={css.rowTitle}>{t('rulesPathLabel')}</div>
                            </div>
                            <div className={css.rowControl}>
                              <DocLink
                                path={state.rules.path}
                                cwd={policy.cwd}
                                openSourceFile={openSourceFile}
                                t={t}
                                testId="baf-rules-full-path-link"
                              />
                            </div>
                          </div>
                        ) : null}
                        <pre className={css.rulesBody} data-testid="baf-standard-rules-body">{state.rules.content}</pre>
                      </div>
                    )
                    : state.rules.status === 'unreadable'
                      ? <div className={css.statusError}>{t('rulesUnreadable')}{state.rules.reason}</div>
                      : (
                        <div className={css.status} data-testid="baf-standard-rules-unavailable">
                          {policy.standardAvailability === 'policy_missing'
                            ? t('rulesUnavailablePolicy')
                            : t('rulesUnavailableNoWorkspace')}
                        </div>
                      )
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {state.openError !== undefined ? (
        <div className={css.statusError} data-testid="baf-open-source-failed">
          {t('openSourceFailed')}{state.openError}
        </div>
      ) : null}
    </section>
  )
}

export { sliceAreaContent }
