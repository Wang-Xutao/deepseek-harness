/**
 * 【变更】2026-10-21 (批次十 测试流图): the conversation Tab「测试流图」— the
 * unit-test execution flow (the SAME 8-step order the 质量监控 page's chart
 * teaches) painted with THIS workspace's real results: the check chain and
 * gate read `.baf/reports/ut-coverage.json`, lint/analyze read
 * `.baf/reports/static-analysis.json` (cpplint + cppcheck run inside one
 * `/baf-quality lint`), format keeps no report and carries its discipline
 * note. Missing reports paint 未运行 — never a fabricated verdict. Push-fed:
 * the same `baf-workflow/projection-appended` subscription the 工作流图 tab
 * uses, plus a manual 刷新.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import {
  TEST_FLOW_STEPS,
  projectTestFlowSteps,
  type TestFlowStepId,
  type WorkflowTabTestFlowStatus,
} from './tab-types.ts'
import type { WorkflowTabKey } from './locales.ts'
import css from './TestFlowView.module.css'

/** Session-bound 测试流图 Remote callbacks. */
export interface TestFlowViewInjected {
  /** Re-read the workspace's test-flow status. */
  refresh: () => Promise<WorkflowTabTestFlowStatus>
  /** Open one workspace file in the right sidebar (the HTML coverage report). */
  openArtifact: (path: string) => void
  /**
   * Real-time push subscription — the same workspace event the 工作流图 tab
   * listens on; the returned disposer unregisters.
   */
  subscribe: (onChange: () => void) => () => void
}

export type TestFlowViewProps =
  & ConvViewProps
  & PropsLocale<'baf.go-workflow'>
  & InjectFace<TestFlowViewInjected>

/** zh label key per step (the settings-page chart's twin catalog). */
const NODE_LABEL: Record<TestFlowStepId, WorkflowTabKey> = {
  build: 'tflow.node.build',
  test: 'tflow.node.test',
  instrument: 'tflow.node.instrument',
  report: 'tflow.node.report',
  gate: 'tflow.node.gate',
  lint: 'tflow.node.lint',
  analyze: 'tflow.node.analyze',
  format: 'tflow.node.format',
}

/** Inline English name per step (one name line, like the settings chart). */
const NODE_EN: Record<TestFlowStepId, WorkflowTabKey> = {
  build: 'tflow.nodeEn.build',
  test: 'tflow.nodeEn.test',
  instrument: 'tflow.nodeEn.instrument',
  report: 'tflow.nodeEn.report',
  gate: 'tflow.nodeEn.gate',
  lint: 'tflow.nodeEn.lint',
  analyze: 'tflow.nodeEn.analyze',
  format: 'tflow.nodeEn.format',
}

const STATE_TEXT: Record<'passed' | 'failed' | 'idle', WorkflowTabKey> = {
  passed: 'tflow.state.passed',
  failed: 'tflow.state.failed',
  idle: 'tflow.state.idle',
}

/** One chain row. */
function StepRow({ id, command, state, metric, stateLabel, enLabel, nameLabel, toolChip, children }: {
  id: TestFlowStepId
  command: string
  state: 'passed' | 'failed' | 'idle'
  // `| undefined` admitted: the view passes outcome.metric straight from the
  // projector, whose report-derived metrics are optional.
  metric?: string | undefined
  stateLabel: string
  enLabel: string
  nameLabel: string
  toolChip: string
  children?: ReactNode
}) {
  return (
    <li
      className={clsx(css.step, state === 'passed' ? css.passed : state === 'failed' ? css.failed : css.idle)}
      data-testid={`baf-test-flow-step-${id}`}
      data-state={state}
    >
      <span className={css.dot} aria-hidden />
      <div className={css.stepMain}>
        <span className={css.stepName}>
          {nameLabel}
          <span className={css.stepEn}>{enLabel}</span>
          <span className={css.stepEn}>{toolChip}</span>
        </span>
        <span className={css.stepCmd} title={command}>{command}</span>
      </div>
      <div className={css.stepSide}>
        {metric !== undefined && metric !== '' && <span className={css.metric} title={metric}>{metric}</span>}
        {children}
        <span className={css.stateText}>{stateLabel}</span>
      </div>
    </li>
  )
}

/**
 * Render the 测试流图 conversation tab.
 * @param props - composed conversation-view + inject props.
 * @returns the tab surface.
 */
export function TestFlowView({ refresh, openArtifact, subscribe, t }: TestFlowViewProps) {
  const [status, setStatus] = useState<WorkflowTabTestFlowStatus | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setStatus(await refresh())
      setError(undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [refresh])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const dispose = subscribe(() => { void load() })
    return () => { dispose() }
  }, [subscribe, load])

  const noCwd = status?.status === 'no-cwd'
  const outcomes = projectTestFlowSteps(status)
  const coverage = status?.status === 'ready' ? status.coverage : undefined
  const statics = status?.status === 'ready' ? status.staticAnalysis : undefined
  const gatePassed = coverage?.passed
  const reportAt = coverage?.generatedAt ?? statics?.generatedAt
  // thresholdLine is a 0-1 fraction; the report's own minimum (already a
  // percent) wins when present.
  const minPct = coverage?.minimum ?? (status?.thresholdLine !== undefined
    ? Math.round(status.thresholdLine * 100)
    : undefined)

  return (
    <div className={css.root} data-testid="baf-test-flow-view">
      <div className={css.strip}>
        <span className={css.stripBrand}>{t('view.testFlow')}</span>
        <span className={css.stripItem}>
          <span className={css.stripLabel}>{t('tflow.verdictCoverage')}</span>
          <span className={clsx(
            css.stripValue,
            gatePassed === true ? css.stripOk : gatePassed === false ? css.stripBad : css.stripMuted,
          )}>
            {coverage?.line === undefined
              ? '—'
              : t('tflow.coverageValue').replace('{line}', String(coverage.line)).replace('{min}', String(minPct ?? '—'))}
          </span>
        </span>
        <span className={css.stripItem}>
          <span className={css.stripLabel}>{t('tflow.verdictStatic')}</span>
          <span className={clsx(
            css.stripValue,
            statics === undefined ? css.stripMuted
              : (statics.passed === true || statics.errors === 0) ? css.stripOk : css.stripBad,
          )}>
            {statics === undefined
              ? '—'
              : statics.errors === undefined ? (statics.passed === true ? t('tflow.state.passed') : statics.passed === false ? t('tflow.state.failed') : '—')
                : t('tflow.staticValue').replace('{n}', String(statics.errors))}
          </span>
        </span>
        <span className={css.stripItem}>
          <span className={css.stripLabel}>{t('tflow.verdictReport')}</span>
          <span className={clsx(css.stripValue, css.stripMuted)}>{reportAt ?? '—'}</span>
        </span>
        {status?.gateMode !== undefined && (
          <span className={css.gateChip} title={t('tflow.gateMode')}>{`${t('tflow.gateMode')} · ${status.gateMode}`}</span>
        )}
        <button
          type="button"
          className={css.refreshBtn}
          data-testid="baf-test-flow-refresh"
          disabled={loading}
          onClick={() => { void load() }}
        >
          {t('action.refresh')}
        </button>
      </div>

      <div className={css.body}>
        {error !== undefined && <div className={css.errorBar} role="alert">{`${t('tflow.loadFailed')}${error}`}</div>}
        {noCwd
          ? (
            <div className={css.hint} data-testid="baf-test-flow-nocwd">{t('tflow.noCwd')}</div>
          )
          : (
            <ol className={css.chain} aria-label={t('tflow.aria')}>
              {TEST_FLOW_STEPS.map(step => (
                <StepRow
                  key={step.id}
                  id={step.id}
                  command={step.command}
                  state={outcomes[step.id].state}
                  metric={step.id === 'format' ? t('tflow.formatNote') : outcomes[step.id].metric}
                  stateLabel={t(STATE_TEXT[outcomes[step.id].state])}
                  nameLabel={t(NODE_LABEL[step.id])}
                  enLabel={t(NODE_EN[step.id])}
                  toolChip={`${step.tool} · ${t(step.required ? 'tflow.required' : 'tflow.optional')}`}
                >
                  {step.id === 'report' && status?.reportHtmlExists === true && status.reportHtmlRel !== undefined && (
                    <button
                      type="button"
                      className={css.openBtn}
                      data-testid="baf-test-flow-open-report"
                      title={status.reportHtmlRel}
                      onClick={() => { openArtifact(status.reportHtmlRel as string) }}
                    >
                      {t('tflow.openReport')}
                    </button>
                  )}
                </StepRow>
              ))}
            </ol>
          )}
        {!noCwd && (
          <div className={css.band} data-testid="baf-test-flow-band">
            <div className={css.bandTitle}>{t('tflow.bandTitle')}</div>
            {t('tflow.band')}
          </div>
        )}
      </div>
    </div>
  )
}
