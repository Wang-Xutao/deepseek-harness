/**
 * 【变更】2026-10-19 (六问题批 4.2): the 确认门 tab is ONE complete vertical
 * card flow — the pan/zoom canvas is gone, and with it the row's own
 * scrollbar/fixed height: the settings page scrolls, every card renders at
 * its natural height. State cards run the whole chain 接单 → … → 归档 →
 * 完成, with the branch cards (漂移回归 / 已放弃) at the bottom. The
 * one-shot gates that used to sit in the leading「一次性确认门」card are now
 * BETWEEN-state gate nodes — 「工作区需要初始化」right after 接单, before the
 * 分类 confirm, exactly where it pops — and each bootstrap gate carries the
 *「一次性」badge at its top-right. Unanchored per-change gates get fixed
 * client-side anchors: design-confirm rides 设计, verify-archive rides 验证,
 * resume rides 漂移回归, abandon rides 已放弃. The 详略 switch keeps the
 * shared `Switch` primitive (略 hides option lists + stage conditions behind
 * a hover/focus Tooltip; 详 prints them, and the connectors list the template
 * edge conditions). The「开关与阈值在配置文件」block is deleted.
 * Still read-only throughout (2026-10-07 客户决策).
 * 【变更】2026-10-07 (九点批 问题 9): the row stays collapsed in list context
 * and loads the projection on first expand (cached client-side); embedded in
 * the 确认门 tab it loads expanded on mount.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import { Switch, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  BafWorkflowGateConfirmRow, BafWorkflowGateOverview, BafWorkflowGateStageRow,
} from '../types.ts'
import { TEMPLATE_EDGES } from './graph-template.ts'
import { NodeIcon } from './icons.tsx'
import type { TerminalStateId, WorkflowNodeId } from './tab-types.ts'
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

/** The spine order (terminals ride after 归档; drift/abandoned are branches). */
const MAIN_CHAIN: readonly string[] = [
  'intake', 'open', 'clarify', 'design', 'plan', 'implement', 'verify', 'archive',
]

/** The bootstrap one-shot gates — they pop at flow start under special
 * workspace conditions, not once per change, and become between-state gate
 * nodes right after 接单 (before the 分类 confirm). */
const ONCE_ENTRY: readonly string[] = ['scaffold', 'new-workflow', 'active-conflict', 'bind-workflow']

/** Client-side anchors for per-change gates the projection cannot place
 * (their `node` is undefined): each rides the state card it confirms. */
const CLIENT_ANCHOR: Readonly<Record<string, string>> = {
  'design-confirm': 'design',
  'verify-archive': 'verify',
  'resume': 'drift',
  'abandon': 'abandoned',
}

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
  completed: 'node.completed',
  abandoned: 'node.abandoned',
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
 * One confirm gate inside a card — 略 keeps the title + question on one
 * line; 详 adds every option with the command a click runs (and the
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

/** The localized command a hover line shows for one option. */
function optionCommandText(option: BafWorkflowGateConfirmRow['options'][number], t: GatesOverviewRowProps['t']): string {
  return option.command === NOOP_COMMAND
    ? t('gates.sentinelNoop')
    : option.command === CONTINUED_COMMAND
      ? t('gates.sentinelContinued')
      : option.command
}

/** The node's full detail as ONE pre-line string — the 略 hover Tooltip's
 * label AND the node's aria-label, so hover, focus, and screen readers all
 * read the same text the 详 flow would print inline. */
function nodeDetailText(label: string, stage: BafWorkflowGateStageRow | undefined, gates: readonly BafWorkflowGateConfirmRow[], t: GatesOverviewRowProps['t']): string {
  const lines: string[] = [label]
  if (stage !== undefined) {
    lines.push(`${t('gates.stageGate')} ${stage.artifact} · ${stage.gateFn}`)
    for (const condition of stage.conditions) lines.push(`· ${condition}`)
    if (stage.advanceGateId !== undefined) lines.push(`${t('gates.advancePrefix')}${stage.advanceGateId}`)
    if (stage.note !== undefined) lines.push(stage.note)
  } else {
    lines.push(t('gates.noGate'))
  }
  for (const gate of gates) {
    lines.push(`【${gate.title}${gate.bugFix === true ? ' · bug-fix' : ''}】${gate.question}`)
    for (const option of gate.options) {
      lines.push(`· ${option.label}（${optionCommandText(option, t)}）`)
    }
    if (gate.dynamicOptions !== undefined && gate.options.length === 0) {
      lines.push(`· ${t('gates.dynamicOptions')}`)
    }
  }
  return lines.join('\n')
}

/** Join CSS-module names without a clsx dependency (filters dropped keys). */
const join = (...names: ReadonlyArray<string | undefined>): string =>
  names.filter((name): name is string => name !== undefined && name !== '').join(' ')

/** Template edge conditions for one state→state step — 详 prints them beside
 * the connector (skip/loop edges to non-adjacent nodes are simply not
 * between-state steps and stay unlisted). */
function stepConditions(from: string, to: string): readonly string[] {
  return TEMPLATE_EDGES
    .filter(edge => edge.from === from && String(edge.to) === to)
    .map(edge => `${edge.id} · ${edge.condition}`)
}

/** The between-card connector: a left-spine arrow; 详 lists the template
 * edge conditions that govern the state-to-state step beside it. */
function Connector({ conditions }: { conditions: readonly string[] | undefined }) {
  return (
    <div className={css.connector}>
      <span className={css.connectorArrow} aria-hidden />
      {conditions !== undefined && conditions.length > 0 ? (
        <span className={css.connectorConditions}>
          {conditions.map(line => <span key={line} className={css.connectorCondition}>{line}</span>)}
        </span>
      ) : null}
    </div>
  )
}

/**
 * One between-state gate node — the dashed checkpoint card sitting on the
 * spine between two state cards. Bootstrap gates carry the「一次性」badge at
 * the top-right corner.
 */
function GateNodeCard({ gate, once, detail, t }: {
  gate: BafWorkflowGateConfirmRow
  once: boolean
  detail: boolean
  t: GatesOverviewRowProps['t']
}) {
  return (
    <div className={css.gateNode} data-testid={`baf-gates-gate-node-${gate.id}`}>
      {once ? <span className={css.onceBadge} data-testid={`baf-gates-once-badge-${gate.id}`}>{t('gates.onceBadge')}</span> : null}
      <GateCard gate={gate} detail={detail} t={t} />
    </div>
  )
}

/**
 * One state card on the spine — node icon + label + gate-count badge, the
 * stage gate block, and every confirm gate resting on the node (详 prints
 * them; 略 hides them behind the hover/focus Tooltip + aria-label).
 */
function StateCard({ node, stage, gates, detail, t }: {
  node: string
  stage: BafWorkflowGateStageRow | undefined
  gates: readonly BafWorkflowGateConfirmRow[]
  detail: boolean
  t: GatesOverviewRowProps['t']
}) {
  const label = NODE_LABEL[node] !== undefined ? t(NODE_LABEL[node]) : node
  const detailText = nodeDetailText(label, stage, gates, t)
  const badge = gates.length > 0
    ? { text: `${t('gates.confirmCount')} ×${String(gates.length)}`, cls: css.badgeGate ?? '' }
    : { text: t('gates.noGate'), cls: css.badgeIdle ?? '' }

  const card = (
    <div
      className={css.nodeCard}
      data-testid={`baf-gate-node-${node}`}
      tabIndex={0}
      role="group"
      aria-label={detailText}
    >
      <div className={css.nodeHead}>
        <span className={css.nodeIcon}><NodeIcon id={node as WorkflowNodeId | TerminalStateId} /></span>
        <span className={css.nodeName}>{label}</span>
        <span className={join(css.badge, badge.cls)}>{badge.text}</span>
      </div>
      {stage !== undefined ? (
        <div className={css.stageLine} data-testid={`baf-gate-stage-${node}`}>
          <div className={join(css.nodeChip, css.mono)}>{stage.artifact}</div>
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
        // Gate-less nodes (intake / archive / drift / the terminals in the
        // default config) keep their card with a quiet 无门禁 line — the
        // pipeline never reads as a broken chain.
        <div className={css.stageLine}>{t('gates.noGate')}</div>
      ) : null}
      {/* 略 keeps the flow quiet — the badge counts the gates and the
          Tooltip (this node's aria-label string) carries their full text. */}
      {gates.length > 0 && detail ? (
        <div className={css.gates}>
          {gates.map(gate => <GateCard key={gate.id} gate={gate} detail={detail} t={t} />)}
        </div>
      ) : null}
    </div>
  )

  if (detail) return card
  // 略: the whole detail rides a hover/focus Tooltip on the node.
  return (
    <Tooltip label={detailText} side="right" portal maxWidth={360} delayMs={120}>
      {card}
    </Tooltip>
  )
}

/**
 * The whole projection as ONE vertical flow: 接单, the one-shot gate nodes,
 * the 分类 confirm, the main chain down to 完成, the branch cards, and a
 * trailing fallback for unanchored gates this client cannot yet place.
 */
function GatesFlow({ data, mode, t }: {
  data: BafWorkflowGateOverview
  mode: 'detail' | 'concise'
  t: GatesOverviewRowProps['t']
}) {
  const detail = mode === 'detail'
  const stageByNode = new Map(data.stageGates.map(row => [row.node, row]))
  const gatesByNode = new Map<string, BafWorkflowGateConfirmRow[]>()
  const addGate = (node: string, gate: BafWorkflowGateConfirmRow): void => {
    const bucket = gatesByNode.get(node)
    if (bucket === undefined) gatesByNode.set(node, [gate])
    else bucket.push(gate)
  }
  const entryGates: BafWorkflowGateConfirmRow[] = []
  let classifyGate: BafWorkflowGateConfirmRow | undefined
  const fallbackGates: BafWorkflowGateConfirmRow[] = []
  for (const gate of data.confirmGates) {
    if (gate.node !== undefined) {
      addGate(gate.node, gate)
      continue
    }
    if (ONCE_ENTRY.includes(gate.id)) {
      entryGates.push(gate)
      continue
    }
    if (gate.id === 'intake-classify') {
      classifyGate = gate
      continue
    }
    const anchor = CLIENT_ANCHOR[gate.id]
    if (anchor !== undefined) {
      addGate(anchor, gate)
      continue
    }
    fallbackGates.push(gate)
  }
  // Registry extras (future nodes the projection learns before this client)
  // still render — as state cards after 归档, before the 完成 terminal.
  const known = new Set<string>([...MAIN_CHAIN, 'drift', 'completed', 'abandoned'])
  const extraNodes = [...stageByNode.keys(), ...gatesByNode.keys()].filter(node => !known.has(node))

  const stateCard = (node: string): ReactNode => (
    <StateCard
      node={node}
      stage={stageByNode.get(node)}
      gates={gatesByNode.get(node) ?? []}
      detail={detail}
      t={t}
    />
  )

  return (
    <div className={css.flow} data-testid="baf-gates-flow" aria-label={t('gates.canvasAria')}>
      {stateCard('intake')}
      {entryGates.map(gate => (
        <div key={gate.id}>
          <Connector conditions={undefined} />
          <GateNodeCard gate={gate} once detail={detail} t={t} />
        </div>
      ))}
      {classifyGate !== undefined ? (
        <div>
          <Connector conditions={undefined} />
          <GateNodeCard gate={classifyGate} once={false} detail={detail} t={t} />
        </div>
      ) : null}
      {MAIN_CHAIN.slice(1).map((node, index) => (
        <div key={node}>
          <Connector conditions={detail ? stepConditions(MAIN_CHAIN[index] ?? node, node) : undefined} />
          {stateCard(node)}
        </div>
      ))}
      {extraNodes.map(node => (
        <div key={node}>
          <Connector conditions={undefined} />
          {stateCard(node)}
        </div>
      ))}
      <div>
        <Connector conditions={detail ? stepConditions('archive', 'completed') : undefined} />
        {stateCard('completed')}
      </div>
      <section className={css.branch} data-testid="baf-gates-branch">
        <div className={css.branchTitle}>{t('gates.branchTitle')}</div>
        <div className={css.branchCards}>
          {stateCard('drift')}
          {stateCard('abandoned')}
        </div>
      </section>
      {fallbackGates.length > 0 ? (
        <section className={css.fallback} data-testid="baf-gates-once">
          <div className={css.nodeHead}>
            <span className={css.nodeName}>{t('gates.onceTitle')}</span>
            <span className={css.nodeHint}>{t('gates.onceHint')}</span>
          </div>
          <div className={css.gates}>
            {fallbackGates.map(gate => <GateCard key={gate.id} gate={gate} detail={detail} t={t} />)}
          </div>
        </section>
      ) : null}
    </div>
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
        {/* 【变更】2026-10-18 (工作流确认门 2.1/2.2): the intro paragraph is
            deleted (the tab title carries the meaning); the density control is
            the shared `Switch` primitive — the exact control the 轨迹图 row
            uses, so the two switches on one settings page cannot drift.
            【变更】2026-10-19 (六问题批 4.2): the labels are 详 / 略. */}
        <div className={css.headActions}>
          {showBody ? (
            <div className={css.modeSwitch}>
              <span className={css.modeLabel}>{t('gates.modeConcise')}</span>
              <Switch
                checked={mode === 'detail'}
                label={t('gates.modeAria')}
                onChange={(next) => { setMode(next ? 'detail' : 'concise') }}
              />
              <span className={css.modeLabel}>{t('gates.modeDetail')}</span>
            </div>
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
