/**
 * 【变更】2026-10-12 (问题 4.1): the 工作流确认门 tab renders the two gate
 * layers as ONE workflow process-card flow — a card per workflow node in
 * pipeline order carrying that node's stage gate (artifact / adjudicator /
 * conditions) plus the confirm gates resting on it, a leading card for the
 * one-shot gates, and a 详细/简洁 dropdown: 简洁 keeps one line per gate,
 * 详细 adds the options+commands, the stage conditions, and the config
 * honesty block. Still read-only throughout (2026-10-07 客户决策).
 * 【变更】2026-10-07 (九点批 问题 9): the row stays collapsed in list context
 * and loads the projection on first expand (cached client-side); embedded in
 * the 工作流确认门 tab it loads expanded on mount.
 */
import { useEffect, useState } from 'react'
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
  /** When true, overview content loads and stays visible without a first expand click. */
  embeddedInTab?: boolean
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

/** The 工作流流程卡片 pipeline order (matches the flow-canvas order). */
const FLOW_ORDER: readonly string[] = [
  'intake', 'open', 'clarify', 'design', 'plan', 'implement', 'verify', 'archive', 'drift',
]

/** Locale key per known node id; unknown ids keep their raw text. */
const NODE_LABEL: Readonly<Record<string, GatesLocaleKey>> = {
  intake: 'gates.node.intake',
  open: 'gates.node.open',
  clarify: 'gates.node.clarify',
  design: 'gates.node.design',
  plan: 'gates.node.plan',
  implement: 'gates.node.implement',
  verify: 'gates.node.verify',
  archive: 'gates.node.archive',
  drift: 'gates.node.drift',
}

/** The locale key union this component's `t` accepts. */
type GatesLocaleKey = PropsLocale<'baf.go-workflow'>['t'] extends (key: infer K) => string ? K : never

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

/**
 * One confirm gate inside a node card — 简洁 keeps the title + question on
 * one line; 详细 adds every option with the command a click runs (and the
 * runtime-dynamic marker for gates whose options are filled live).
 */
function GateCard({ gate, detail, t }: {
  gate: BafWorkflowGateConfirmRow
  detail: boolean
  t: GatesOverviewRowProps['t']
}) {
  return (
    <div className={css.gateCard} data-testid={`baf-gate-confirm-${gate.id}`}>
      <div className={css.gateLine}>
        <span className={css.gateTitle}>{gate.title}</span>
        {gate.bugFix === true ? <span className={css.chip}>bug-fix</span> : null}
        <span className={css.gateQuestion}>{gate.question}</span>
      </div>
      {detail ? (
        <div className={css.gateOptions}>
          {gate.options.map(option => (
            <OptionLine key={option.id} option={option} t={t} />
          ))}
          {gate.dynamicOptions !== undefined && gate.options.length === 0 && (
            <div className={css.option} data-testid={`baf-gate-dynamic-${gate.id}`}>
              · {t('gates.dynamicOptions')}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * One workflow node's process card: the stage gate (artifact chip up top;
 * adjudicator + pass conditions in 详细) and the confirm gates that rest on
 * the node, in pipeline order down the flow.
 */
function NodeCard({ node, stage, gates, detail, t }: {
  node: string
  stage: BafWorkflowGateStageRow | undefined
  gates: readonly BafWorkflowGateConfirmRow[]
  detail: boolean
  t: GatesOverviewRowProps['t']
}) {
  return (
    <section className={css.nodeCard} data-testid={`baf-gate-node-${node}`}>
      <div className={css.nodeHead}>
        <span className={css.nodeName}>{NODE_LABEL[node] !== undefined ? t(NODE_LABEL[node]) : node}</span>
        {stage !== undefined ? <span className={join(css.nodeChip, css.mono)}>{stage.artifact}</span> : null}
        {detail && stage?.advanceGateId !== undefined
          ? <span className={css.nodeChip}>{t('gates.advancePrefix')}{stage.advanceGateId}</span>
          : null}
      </div>
      {stage !== undefined ? (
        <div className={css.stageLine} data-testid={`baf-gate-stage-${node}`}>
          {detail ? (
            <>
              <div className={css.stageMeta}><span className={css.mono}>{stage.gateFn}</span></div>
              {stage.conditions.length > 0 ? (
                <ul className={css.conditions}>
                  {stage.conditions.map((line, index) => <li key={index}>{line}</li>)}
                </ul>
              ) : null}
              {stage.note !== undefined ? <div className={css.note}>{stage.note}</div> : null}
            </>
          ) : (
            <div className={css.stageMeta}>{t('gates.conditionsCount')}{stage.conditions.length}</div>
          )}
        </div>
      ) : gates.length === 0 ? (
        // 【变更】2026-10-12 (web 复核): gate-less nodes (intake / archive / drift in
        // the default config) used to VANISH from the flow, so the pipeline read as
        // a broken chain — they now keep their card with a quiet 无门禁 line.
        <div className={css.stageMeta}>{t('gates.noGate')}</div>
      ) : null}
      {gates.length > 0 ? (
        <div className={css.gates}>
          {gates.map(gate => <GateCard key={gate.id} gate={gate} detail={detail} t={t} />)}
        </div>
      ) : null}
    </section>
  )
}

/** Join CSS-module names without a clsx dependency (filters dropped keys). */
const join = (...names: ReadonlyArray<string | undefined>): string =>
  names.filter((name): name is string => name !== undefined && name !== '').join(' ')

/**
 * The whole projection as ONE process-card flow: one-shot gates card first,
 * then one card per workflow node in pipeline order; the config honesty
 * block rides only 详细.
 */
function GatesFlow({ data, mode, t }: {
  data: BafWorkflowGateOverview
  mode: 'detail' | 'concise'
  t: GatesOverviewRowProps['t']
}) {
  const detail = mode === 'detail'
  const stageByNode = new Map(data.stageGates.map(row => [row.node, row]))
  const gatesByNode = new Map<string, BafWorkflowGateConfirmRow[]>()
  const onceGates: BafWorkflowGateConfirmRow[] = []
  for (const gate of data.confirmGates) {
    if (gate.node === undefined) {
      onceGates.push(gate)
      continue
    }
    const bucket = gatesByNode.get(gate.node)
    if (bucket === undefined) gatesByNode.set(gate.node, [gate])
    else bucket.push(gate)
  }
  // 【变更】2026-10-12 (web 复核): gate-less nodes (intake / archive / drift in
  // the default config) used to VANISH from the flow — keep every pipeline node.
  const extraNodes = [...stageByNode.keys(), ...gatesByNode.keys()]
    .filter(node => !FLOW_ORDER.includes(node))
  const nodes = [...FLOW_ORDER, ...new Set(extraNodes)]
  return (
    <>
      {onceGates.length > 0 ? (
        <section className={css.nodeCard} data-testid="baf-gates-once">
          <div className={css.nodeHead}>
            <span className={css.nodeName}>{t('gates.onceTitle')}</span>
            <span className={css.nodeHint}>{t('gates.onceHint')}</span>
          </div>
          <div className={css.gates}>
            {onceGates.map(gate => <GateCard key={gate.id} gate={gate} detail={detail} t={t} />)}
          </div>
        </section>
      ) : null}
      <div className={css.flowCards} data-testid="baf-gates-flow">
        {nodes.map(node => (
          <NodeCard
            key={node}
            node={node}
            stage={stageByNode.get(node)}
            gates={gatesByNode.get(node) ?? []}
            detail={detail}
            t={t}
          />
        ))}
      </div>
      {detail ? (
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
      ) : null}
    </>
  )
}

/**
 * Render the 门禁总览 read-only row inside the 工作流 settings section.
 * @param props - composed slot + inject props.
 * @returns the gates overview row.
 */
export function GatesOverviewRow({ loadGateOverview, embeddedInTab, t }: GatesOverviewRowProps) {
  const embedded = embeddedInTab === true
  const [expanded, setExpanded] = useState(embedded)
  const [data, setData] = useState<BafWorkflowGateOverview | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'detail' | 'concise'>('detail')

  const fetchOverview = (): void => {
    if (data !== undefined || error !== undefined || loading) return
    setLoading(true)
    loadGateOverview()
      .then((overview) => { setData(overview) })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { setLoading(false) })
  }

  useEffect(() => {
    if (!embedded || data !== undefined || error !== undefined || loading) return
    setLoading(true)
    loadGateOverview()
      .then((overview) => { setData(overview) })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { setLoading(false) })
  }, [embedded, loadGateOverview, data, error, loading])

  const expand = (): void => {
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    fetchOverview()
  }

  const showBody = embedded || expanded

  return (
    <div className={css.block} data-testid="baf-gates-row" data-embedded={embedded ? 'true' : undefined}>
      <div className={css.head}>
        <div>
          <div className={css.title}>{t('gates.title')}</div>
          <div className={css.description}>{t('gates.description')}</div>
        </div>
        <div className={css.headActions}>
          {showBody ? (
            <select
              className={css.modeSelect}
              data-testid="baf-gates-mode"
              aria-label={t('gates.modeAria')}
              value={mode}
              onChange={(event) => { setMode(event.currentTarget.value === 'concise' ? 'concise' : 'detail') }}
            >
              <option value="detail">{t('gates.modeDetail')}</option>
              <option value="concise">{t('gates.modeConcise')}</option>
            </select>
          ) : null}
          {embedded ? null : (
            <button type="button" className={css.toggle} data-testid="baf-gates-toggle" onClick={expand}>
              {expanded ? t('gates.collapse') : t('gates.expand')}
            </button>
          )}
        </div>
      </div>

      {showBody ? (
        loading ? (
          <div className={css.status}>{t('gates.loading')}</div>
        ) : error !== undefined ? (
          <div className={css.statusError} data-testid="baf-gates-error">{t('gates.loadFailed')}{error}</div>
        ) : data !== undefined ? (
          <GatesFlow data={data} mode={mode} t={t} />
        ) : null
      ) : null}
    </div>
  )
}
