/**
 * 【变更】2026-10-07 (九点批 问题 9): the 门禁总览 settings row — a READ-ONLY
 * projection of both gate layers (customer decision: 只读总览 + 开关说明;
 * further edits live in config files / product code). Collapsed by default;
 * the first expand loads the static registry projection from the Tab Remote
 * (`gateOverview`, user-triggered — no remote-default-responses entry, the
 * rulesDoc precedent).
 */
import { useState } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {
  BafWorkflowGateConfirmRow, BafWorkflowGateOverview, BafWorkflowGateStageRow,
} from '../types.ts'
import css from './GatesOverviewRow.module.css'

/** The inject face the slot registration hands the row. */
export interface GatesOverviewRowInjected {
  /** Load the gate overview projection (first expand; cached client-side). */
  loadGateOverview(): Promise<BafWorkflowGateOverview>
}

/** Full component props for the 门禁总览 settings row. */
export type GatesOverviewRowProps =
  PropsRuntime<'settings.workflow.item'>
  & PropsLocale<'baf.go-workflow'>
  & InjectFace<GatesOverviewRowInjected>

/** Option-command sentinels (mirror `OPTION_COMMAND_SENTINELS`; the client
 * bundle never imports the host package, so the two literals ride here). */
const NOOP_COMMAND = '__noop__'
const CONTINUED_COMMAND = '__continued__'

/** Render one option line: label + the command a click runs (sentinels map
 * to their localized meaning — they dispatch nothing). */
function OptionLine({ option, t }: {
  option: BafWorkflowGateConfirmRow['options'][number]
  t: GatesOverviewRowProps['t']
}) {
  const command = option.command === NOOP_COMMAND
    ? t('gates.sentinelNoop')
    : option.command === CONTINUED_COMMAND
      ? t('gates.sentinelContinued')
      : option.command
  return <div className={css.option}>· {option.label}（{command}）</div>
}

/** One stage-gate row's condition list. */
function ConditionList({ row }: { row: BafWorkflowGateStageRow }) {
  return (
    <ul className={css.conditions}>
      {row.conditions.map((line, index) => <li key={index}>{line}</li>)}
    </ul>
  )
}

/**
 * Render the 门禁总览 read-only row inside the 工作流 settings section.
 * @param props - composed slot + inject props.
 * @returns the gates overview row.
 */
export function GatesOverviewRow({ loadGateOverview, t }: GatesOverviewRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [data, setData] = useState<BafWorkflowGateOverview | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)

  const expand = (): void => {
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (data === undefined && error === undefined) {
      setLoading(true)
      loadGateOverview()
        .then((overview) => { setData(overview) })
        .catch((err: unknown) => { setError(err instanceof Error ? err.message : String(err)) })
        .finally(() => { setLoading(false) })
    }
  }

  return (
    <div className={css.block} data-testid="baf-gates-row">
      <div className={css.head}>
        <div>
          <div className={css.title}>{t('gates.title')}</div>
          <div className={css.description}>{t('gates.description')}</div>
        </div>
        <button type="button" className={css.toggle} data-testid="baf-gates-toggle" onClick={expand}>
          {expanded ? t('gates.collapse') : t('gates.expand')}
        </button>
      </div>

      {expanded ? (
        loading ? (
          <div className={css.status}>{t('gates.loading')}</div>
        ) : error !== undefined ? (
          <div className={css.statusError} data-testid="baf-gates-error">{t('gates.loadFailed')}{error}</div>
        ) : data !== undefined ? (
          <>
            <div className={css.section} data-testid="baf-gates-confirm">
              <div className={css.sectionTitle}>{t('gates.confirmTitle')}</div>
              <div className={css.sectionHint}>{t('gates.confirmHint')}</div>
              <table className={css.table}>
                <thead>
                  <tr><th>{t('gates.colGate')}</th><th>{t('gates.colNode')}</th><th>{t('gates.colQuestion')}</th><th>{t('gates.colOptions')}</th></tr>
                </thead>
                <tbody>
                  {data.confirmGates.map(gate => (
                    <tr key={gate.id} data-testid={`baf-gate-confirm-${gate.id}`}>
                      <td className={css.mono}>{gate.id}</td>
                      <td>
                        <span>{gate.node ?? '—'}</span>
                        {gate.bugFix === true ? <span className={css.chip}>bug-fix</span> : null}
                      </td>
                      <td className={css.question}>{gate.title} — {gate.question}</td>
                      <td>
                        {gate.options.map(option => (
                          <OptionLine key={option.id} option={option} t={t} />
                        ))}
                        {gate.dynamicOptions !== undefined && gate.options.length === 0 && (
                          <div className={css.option} data-testid={`baf-gate-dynamic-${gate.id}`}>
                            · {t('gates.dynamicOptions')}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={css.section} data-testid="baf-gates-stage">
              <div className={css.sectionTitle}>{t('gates.stageTitle')}</div>
              <div className={css.sectionHint}>{t('gates.stageHint')}</div>
              <table className={css.table}>
                <thead>
                  <tr><th>{t('gates.colNode')}</th><th>{t('gates.colArtifact')}</th><th>{t('gates.colGateFn')}</th><th>{t('gates.colConditions')}</th><th>{t('gates.colAdvanceGate')}</th></tr>
                </thead>
                <tbody>
                  {data.stageGates.map(row => (
                    <tr key={row.node} data-testid={`baf-gate-stage-${row.node}`}>
                      <td className={css.mono}>{row.node}</td>
                      <td className={css.mono}>{row.artifact}</td>
                      <td className={css.mono}>{row.gateFn}</td>
                      <td>
                        <ConditionList row={row} />
                        {row.note !== undefined ? <div className={css.note}>{row.note}</div> : null}
                      </td>
                      <td className={css.mono}>{row.advanceGateId ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={css.config} data-testid="baf-gates-config">
              <div className={css.sectionTitle}>{t('gates.configTitle')}</div>
              <div className={css.sectionHint}>{t('gates.configIntro')}</div>
              <ul className={css.configList}>
                <li className={css.mono}>{t('gates.configBaseline')}</li>
                <li className={css.mono}>{t('gates.configRoute')}</li>
                <li className={css.mono}>{t('gates.configPresets')}</li>
              </ul>
              <div className={css.honesty}>{t('gates.honesty')}</div>
            </div>
          </>
        ) : null
      ) : null}
    </div>
  )
}
