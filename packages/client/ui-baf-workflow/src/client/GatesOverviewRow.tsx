/**
 * 【变更】2026-10-20 (批次三 4.5): the 详/略 switch is DELETED — the flow is
 * always 详, re-laid-out as a left-right split inside the frame: the canvas
 * on the left, the SELECTED node's 门禁明细 on the right (click a canvas
 * card to select — every card is a real button with aria-pressed and a
 * selection ring; the default selection is the first node with anything to
 * print). The node's full detail also stays in its aria-label.
 * 【变更】2026-10-19 (流程图样式对齐批): the flow adopts the 多模型路由
 * 工作流模型绑定 canvas style EXACTLY — same 460px framed canvas, same
 * absolute node cards (192×56, tier-tinted gradient + hover lift), same SVG
 * bezier edges with arrowheads, same right-hand orthogonal channel for the
 * drift recovery edge. Content is re-projected onto it: the 8-node main
 * chain runs down column 0 (完成 as the green terminal), 漂移回归 sits in
 * column 1 beside 实现, 已放弃 under it; every confirm gate is a pill ON the
 * edge it guards (entry gates + 分类 on 接单→建立变更, advance gates on their
 * node's leaving edge, resume/abandon stacked under their branch node) — the
 * gap below a node grows with its pill count, so pills never overlap.
 * Earlier history: the 2026-10-19 六问题批 4.2 made this ONE complete flow
 * (one-shot gates between states, unanchored gates given fixed client-side
 * anchors: design-confirm rides 设计, verify-archive rides 验证, resume rides
 * 漂移回归, abandon rides 已放弃); the 开关与阈值 block stays deleted.
 * Still read-only throughout (2026-10-07 客户决策).
 * 【变更】2026-10-07 (九点批 问题 9): the row stays collapsed in list context
 * and loads the projection on first expand (cached client-side); embedded in
 * the 确认门 tab it loads expanded on mount.
 * 【变更】2026-10-20 (批次五 2.1–2.6): the projection is de-duplicated for the
 * READER — gates whose only difference is an internal routing variant stop
 * rendering (bug-fix twins like bugfix-open-advance, and design-confirm whose
 * decision design-advance already shows); the runtime gates themselves are
 * untouched. Internal vocabulary leaves the display copy: no T-edge ids (the
 * plain-zh CONDITION_ZH rides in from graph-template), no bug-fix chips, no
 * 一次性 badges or legend item, and the gate cards re-layer as title /
 * question / option rows with section labels.
 */
import { Fragment, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {
  BafWorkflowGateConfirmRow, BafWorkflowGateOverview, BafWorkflowGateStageRow,
} from '../types.ts'
import { TEMPLATE_EDGES, conditionTextOf } from './graph-template.ts'
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

/**
 * 【变更】2026-10-20 (批次五 2.2/2.4): reader-side de-duplication — gates whose
 * decision another visible gate already shows are SKIPPED by the client
 * projection (pills, 明细, aria alike). `bugFix === true` gates are bug-fix
 * twins of a full-path gate (bugfix-open-advance ≙ open-advance); the parked
 * re-pop design-confirm ≙ the first-pop design-advance. The RUNTIME registry
 * and pop logic are untouched — only this overview stops printing the twin.
 */
const READER_SKIPPED_GATES: ReadonlySet<string> = new Set(['design-confirm'])

/** Client-side anchors for per-change gates the projection cannot place
 * (their `node` is undefined): each rides the state card it confirms. */
const CLIENT_ANCHOR: Readonly<Record<string, string>> = {
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

/** 【变更】2026-10-20 (批次六 3): the English name rides INLINE after the zh
 * label on every canvas card — 中文在前，英文在后，one name line (the 状态脚本
 * graph's card anatomy). */
const NODE_EN: Readonly<Record<string, string>> = {
  intake: 'Intake',
  open: 'Open change',
  clarify: 'Clarify',
  design: 'Design',
  plan: 'Plan',
  implement: 'Implement',
  verify: 'Verify',
  archive: 'Archive',
  drift: 'Drift',
  completed: 'Completed',
  abandoned: 'Abandoned',
}

/** The locale key union this component's `t` accepts. */
type GatesLocaleKey = PropsLocale<'baf.go-workflow'>['t'] extends (key: infer K) => string ? K : never

/** Render one option line — 【变更】2026-10-20 (批次五 2.1): a two-part row
 * (label, then the command a click runs in mono; sentinels map to their
 * localized meaning — they dispatch nothing). */
function OptionLine({ option, t }: {
  option: BafWorkflowGateConfirmRow['options'][number]
  t: GatesOverviewRowProps['t']
}) {
  const command = option.command === NOOP_COMMAND
    ? t('gates.sentinelNoop')
    : option.command === CONTINUED_COMMAND
      ? t('gates.sentinelContinued')
      : option.command
  return (
    <div className={css.option}>
      <span className={css.optionLabel}>{option.label}</span>
      <span className={css.optionCommand}>{command}</span>
    </div>
  )
}

/**
 * One confirm gate inside a card — 【变更】2026-10-20 (批次五 2.1/2.3): layered
 * as title → question → option rows (no inline bug-fix chip; the reader-side
 * de-dup means a twin never renders), with the runtime-dynamic marker for
 * gates whose options are filled live.
 */
function GateCard({ gate, t }: {
  gate: BafWorkflowGateConfirmRow
  t: GatesOverviewRowProps['t']
}) {
  return (
    <div className={css.gateCard} data-testid={`baf-gate-confirm-${gate.id}`}>
      <div className={css.gateTitle}>{gate.title}</div>
      <div className={css.gateQuestion}>{gate.question}</div>
      <div className={css.gateOptions}>
        {gate.options.map(option => (
          <OptionLine key={option.id} option={option} t={t} />
        ))}
        {gate.dynamicOptions !== undefined && gate.options.length === 0 && (
          <div className={css.option} data-testid={`baf-gate-dynamic-${gate.id}`}>
            <span className={css.optionLabel}>{t('gates.dynamicOptions')}</span>
          </div>
        )}
      </div>
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

/** The node's full detail as ONE pre-line string — the node's aria-label, so
 * focus and screen readers read the same text the selected node's 门禁明细
 * group prints inline. 【变更】2026-10-20 (批次五 2.3): internal ids drop out
 * here too (no gateFn / advance-gate id / bug-fix tag — the reader-side
 * de-dup already keeps twins out of `gates`). */
function nodeDetailText(label: string, stage: BafWorkflowGateStageRow | undefined, gates: readonly BafWorkflowGateConfirmRow[], t: GatesOverviewRowProps['t']): string {
  const lines: string[] = [label]
  if (stage !== undefined) {
    lines.push(`${t('gates.stageGate')} ${stage.artifact}`)
    for (const condition of stage.conditions) lines.push(`· ${condition}`)
    if (stage.note !== undefined) lines.push(stage.note)
  } else {
    lines.push(t('gates.noGate'))
  }
  for (const gate of gates) {
    lines.push(`【${gate.title}】${gate.question}`)
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

/** The localized label for one node id; unknown ids keep their raw text. */
function nodeLabelOf(node: string, t: GatesOverviewRowProps['t']): string {
  return NODE_LABEL[node] !== undefined ? t(NODE_LABEL[node]) : node
}

/** Template edge conditions for one state→state step — 详 prints them beside
 * the connector (skip/loop edges to non-adjacent nodes are simply not
 * between-state steps and stay unlisted). 【变更】2026-10-20 (批次五 2.3): the
 * plain-zh rendering (CONDITION_ZH via conditionTextOf) — the T-edge id is
 * internal vocabulary and no longer prefixes the line. */
function stepConditions(from: string, to: string): readonly string[] {
  return TEMPLATE_EDGES
    .filter(edge => edge.from === from && String(edge.to) === to)
    .map(edge => conditionTextOf(edge))
}

/* ── Canvas geometry (route parity: the 多模型路由 flow constants) ───────── */

/** Node card size — the route canvas's box, narrowed 192→176 so the canvas
 * and the 280px 门禁明细 column sit side-by-side even at a 760px panel
 * (批次三 4.5 左右分布; below that the flex-wrap stacks them gracefully). */
const NODE_W = 176
const NODE_H = 56
/** Gate pill size: pills sit centered ON the edge they guard. */
const PILL_W = 176
const PILL_H = 24
/** Vertical pitch between stacked pills inside one gap. */
const PILL_STEP = 30
/** Column origins (col 0 = main chain, col 1 = branches) + the recovery
 * channel's x, canvas width, and the top margin — route values, rescaled
 * to the narrowed node box. */
const COL_X: readonly [number, number] = [12, 208]
const CHANNEL_X = 402
const CANVAS_W = 416
const CANVAS_TOP = 16

/** The gap below a node whose leaving edge carries `count` pills (0 → the
 * route row pitch; more pills push the next node further down). */
const pillGap = (count: number): number => (count === 0 ? 18 : count * PILL_STEP + 14)

/** One canvas position (top-left pixel origin inside the canvas). */
interface Pos { x: number; y: number }

/** 【变更】2026-10-20 (批次五 2.6): the PillSpec `once` flag left with the
 * 一次性 badge — a pill is just its gate row now. */

/** The tier tint per node family — the route's quiet low-saturation family:
 * main chain blue, drift red, the green 完成 terminal, gray 已放弃. */
const TIER_CLASS: Readonly<Record<string, string | undefined>> = {
  drift: css.nodeDrift,
  completed: css.nodeDone,
  abandoned: css.nodeTerminal,
}

/** The same vertical bezier the route canvas uses (bottom-center → top-center). */
function vEdgePath(from: Pos, to: Pos): string {
  const x = from.x + NODE_W / 2
  const y1 = from.y + NODE_H
  const y2 = to.y
  const mid = (y1 + y2) / 2
  return `M ${x} ${y1} C ${x} ${mid}, ${x} ${mid}, ${x} ${y2}`
}

/** A pill row on the canvas — 【变更】2026-10-20 (批次五 2.3/2.6): just the
 * title (the bug-fix chip and 一次性 badge are gone; the native title attr
 * still carries the question). */
function GatePill({ gate, pos }: {
  gate: BafWorkflowGateConfirmRow
  pos: Pos
}) {
  return (
    <div
      className={css.gatePill}
      data-testid={`baf-gates-gate-node-${gate.id}`}
      style={{ left: pos.x + NODE_W / 2 - PILL_W / 2, top: pos.y, width: PILL_W, height: PILL_H }}
      title={gate.question}
    >
      <span className={css.pillTitle}>{gate.title}</span>
    </div>
  )
}

/**
 * One state node card on the canvas — the route anatomy (name / accent /
 * meta) with the gates projection: the accent line counts the pills this
 * node's edge carries (or shows 无门禁), the meta line carries the stage
 * gate's artifact + condition count. 【变更】2026-10-20 (批次三 4.5): the card
 * is a real BUTTON — clicking it selects the node whose 门禁明细 the right
 * column prints (aria-pressed + the selection ring); the full detail stays
 * in the aria-label.
 */
function CanvasNode({ node, pos, stage, gates, selected, onSelect, t }: {
  node: string
  pos: Pos
  stage: BafWorkflowGateStageRow | undefined
  gates: readonly BafWorkflowGateConfirmRow[]
  selected: boolean
  onSelect: () => void
  t: GatesOverviewRowProps['t']
}) {
  const label = nodeLabelOf(node, t)
  const detailText = nodeDetailText(label, stage, gates, t)
  return (
    <button
      type="button"
      className={join(css.flowNode, TIER_CLASS[node] ?? css.nodeMain, selected ? css.nodeSelected : undefined)}
      data-testid={`baf-gate-node-${node}`}
      style={{ left: pos.x, top: pos.y, width: NODE_W, height: NODE_H }}
      aria-pressed={selected}
      aria-label={detailText}
      onClick={onSelect}
    >
      <span className={css.canvasName}>
        <span className={css.nodeIconInline}><NodeIcon id={node as WorkflowNodeId | TerminalStateId} /></span>
        {label}
        {NODE_EN[node] !== undefined ? <span className={css.nodeNameEn}>{NODE_EN[node]}</span> : null}
      </span>
      <span className={join(css.nodeAccent, gates.length === 0 ? css.nodeAccentIdle : undefined)}>
        {gates.length > 0 ? `${t('gates.confirmCount')} ×${String(gates.length)}` : t('gates.noGate')}
      </span>
      {stage !== undefined ? (
        <span className={css.nodeMeta} data-testid={`baf-gate-stage-${node}`}>
          {stage.artifact} · {t('gates.conditionsCount')}{String(stage.conditions.length)}
        </span>
      ) : null}
    </button>
  )
}

/**
 * The whole projection as the route-parity canvas: the framed 460px canvas
 * (main chain down col 0, branches in col 1, SVG edges with arrowheads, gate
 * pills on the guarded edges) with the SELECTED node's 门禁明细 as the right
 * column of a left-right split inside the same frame, and a trailing
 * fallback for unanchored gates this client cannot yet place.
 */
function GatesFlow({ data, t }: {
  data: BafWorkflowGateOverview
  t: GatesOverviewRowProps['t']
}) {
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
    // 【变更】2026-10-20 (批次五 2.2/2.4): reader-side de-dup — skip the
    // bug-fix twins and the parked design-confirm re-pop (see
    // READER_SKIPPED_GATES); the runtime gate itself still pops.
    if (gate.bugFix === true || READER_SKIPPED_GATES.has(gate.id)) continue
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
  // still render — on the main column after 归档, before the 完成 terminal.
  const known = new Set<string>([...MAIN_CHAIN, 'drift', 'completed', 'abandoned'])
  const extraNodes = [...stageByNode.keys(), ...gatesByNode.keys()].filter(node => !known.has(node))

  // The pills each node owns: chain nodes guard their LEAVING edge (a gate
  // anchored on X pops while advancing out of X); the col-1 branch nodes
  // stack their gates right under the card.
  const chainPills = (node: string): BafWorkflowGateConfirmRow[] => {
    if (node === 'intake') {
      const pills = [...entryGates]
      if (classifyGate !== undefined) pills.push(classifyGate)
      pills.push(...(gatesByNode.get('intake') ?? []))
      return pills
    }
    return gatesByNode.get(node) ?? []
  }
  const stackPills = (node: string): BafWorkflowGateConfirmRow[] =>
    gatesByNode.get(node) ?? []

  // Column 0 layout: walk the chain, growing each gap with its pill count;
  // the chain verticals are collected on the same walk.
  const chainOrder = [...MAIN_CHAIN, ...extraNodes, 'completed']
  const pos = new Map<string, Pos>()
  const chainPillList = new Map<string, BafWorkflowGateConfirmRow[]>()
  const edgeList: Array<{ d: string; dashed?: boolean }> = []
  let y = CANVAS_TOP
  let lastY = y
  let prevPos: Pos | undefined
  for (const node of chainOrder) {
    const nodePos: Pos = { x: COL_X[0], y }
    pos.set(node, nodePos)
    const pills = chainPills(node)
    chainPillList.set(node, pills)
    if (prevPos !== undefined) edgeList.push({ d: vEdgePath(prevPos, nodePos) })
    prevPos = nodePos
    lastY = y
    y += NODE_H + pillGap(pills.length)
  }
  // Column 1: 漂移回归 beside 实现 (its parking lot), 已放弃 below it with
  // room for 漂移回归's stacked pills; both stack their own pills beneath.
  const driftPos: Pos = { x: COL_X[1], y: pos.get('implement')?.y ?? CANVAS_TOP }
  pos.set('drift', driftPos)
  const driftPills = stackPills('drift')
  chainPillList.set('drift', driftPills)
  const abandonedY = driftPos.y + NODE_H + (driftPills.length > 0 ? driftPills.length * PILL_STEP + 16 : 26)
  pos.set('abandoned', { x: COL_X[1], y: abandonedY })
  const abandonedPills = stackPills('abandoned')
  chainPillList.set('abandoned', abandonedPills)
  const canvasH = Math.max(
    lastY + NODE_H,
    abandonedY + NODE_H + abandonedPills.length * PILL_STEP,
  ) + CANVAS_TOP

  // The horizontal 实现→漂移 hop and the dashed drift-recovery channel back
  // into 接单 (the route's orthogonal right-hand channel — T13 漂移回归→接单).
  const driftMid = driftPos.y + NODE_H / 2
  const intakeMid = (pos.get('intake')?.y ?? CANVAS_TOP) + NODE_H / 2
  edgeList.push({
    d: `M ${COL_X[0] + NODE_W} ${driftMid} C ${COL_X[0] + NODE_W + 14} ${driftMid}, ${COL_X[1] - 14} ${driftMid}, ${COL_X[1]} ${driftMid}`,
  })
  edgeList.push({
    d: `M ${COL_X[1] + NODE_W} ${driftMid} L ${CHANNEL_X} ${driftMid} L ${CHANNEL_X} ${intakeMid} L ${COL_X[0] + NODE_W} ${intakeMid}`,
    dashed: true,
  })

  const nodeGates = (node: string): BafWorkflowGateConfirmRow[] =>
    chainPillList.get(node) ?? []

  // 【变更】2026-10-20 (批次三 4.5): the 门禁明细 column prints exactly ONE
  // node — the selected canvas card's. picked stays null until the first
  // click; the default selection follows the first node with anything to
  // print (stage gate, pills, or leaving-edge conditions), 接单 otherwise.
  const detailNodes = [...chainOrder, 'drift', 'abandoned']
  const detailSpecs = detailNodes.map((node, index) => {
    const stage = stageByNode.get(node)
    const gates = nodeGates(node)
    // The leaving-edge template conditions: the chain node's outgoing step;
    // 漂移回归's recovery edge back into 接单.
    const next = index < chainOrder.length - 1 ? chainOrder[index + 1] : undefined
    const conditions = next !== undefined
      ? stepConditions(node, next)
      : node === 'drift' ? stepConditions('drift', 'intake') : []
    return { node, stage, gates, conditions }
  })
  const [picked, setPicked] = useState<string | null>(null)
  const firstContent = detailSpecs.find(spec =>
    spec.stage !== undefined || spec.gates.length > 0 || spec.conditions.length > 0)
  const selected = picked ?? firstContent?.node ?? 'intake'
  const selectedSpec = detailSpecs.find(spec => spec.node === selected)

  /** One canvas node + the pills that ride its leaving edge / its stack. */
  const renderNode = (node: string): ReactNode => {
    const nodePos = pos.get(node) ?? { x: COL_X[0], y: CANVAS_TOP }
    const pills = chainPillList.get(node) ?? []
    return (
      <Fragment key={node}>
        <CanvasNode
          node={node}
          pos={nodePos}
          stage={stageByNode.get(node)}
          gates={pills}
          selected={node === selected}
          onSelect={() => { setPicked(node) }}
          t={t}
        />
        {pills.map((gate, index) => (
          <GatePill
            key={gate.id}
            gate={gate}
            pos={{ x: nodePos.x, y: nodePos.y + NODE_H + 10 + index * PILL_STEP }}
          />
        ))}
      </Fragment>
    )
  }

  // The right-hand 门禁明细 column — 【变更】2026-10-20 (批次五 2.1/2.3): the
  // selected node's group re-layers under section labels (阶段门禁 / 进入下一
  // 步的条件 / 确认门); the internal gateFn id no longer prints.
  const detailSection = (
    <section className={css.detail} data-testid="baf-gates-detail">
      <div className={css.detailHead}>{t('gates.detailTitle')}</div>
      {selectedSpec === undefined ? null : (
        <div className={css.detailGroup} data-testid={`baf-gates-detail-node-${selectedSpec.node}`}>
          <div className={css.nodeHead}>
            <span className={css.nodeIcon}><NodeIcon id={selectedSpec.node as WorkflowNodeId | TerminalStateId} /></span>
            <span className={css.nodeName}>
              {nodeLabelOf(selectedSpec.node, t)}
              {NODE_EN[selectedSpec.node] !== undefined
                ? <span className={css.nodeNameEn}>{NODE_EN[selectedSpec.node]}</span>
                : null}
            </span>
            <span className={join(css.badge, selectedSpec.gates.length > 0 ? css.badgeGate : css.badgeIdle)}>
              {selectedSpec.gates.length > 0
                ? `${t('gates.confirmCount')} ×${String(selectedSpec.gates.length)}`
                : t('gates.noGate')}
            </span>
          </div>
          {selectedSpec.stage !== undefined ? (
            <div className={css.stageLine}>
              <div className={css.sectionLabel}>{t('gates.sectionStage')}</div>
              <div className={css.stageArtifactRow}>
                <div className={join(css.nodeChip, css.mono)}>{selectedSpec.stage.artifact}</div>
              </div>
              {selectedSpec.stage.conditions.length > 0 ? (
                <ul className={css.conditions}>
                  {selectedSpec.stage.conditions.map((line, conditionIndex) => <li key={conditionIndex}>{line}</li>)}
                </ul>
              ) : null}
              {selectedSpec.stage.note !== undefined ? <div className={css.note}>{selectedSpec.stage.note}</div> : null}
            </div>
          ) : null}
          {selectedSpec.conditions.length > 0 ? (
            <div className={css.edgeConditions}>
              <div className={css.sectionLabel}>{t('gates.sectionEdge')}</div>
              {selectedSpec.conditions.map(line => <span key={line} className={css.connectorCondition}>{line}</span>)}
            </div>
          ) : null}
          {selectedSpec.gates.length > 0 ? (
            <div className={css.gates}>
              <div className={css.sectionLabel}>{t('gates.sectionConfirm')}</div>
              {selectedSpec.gates.map(gate => <GateCard key={gate.id} gate={gate} t={t} />)}
            </div>
          ) : null}
        </div>
      )}
    </section>
  )

  return (
    <div className={css.flow} data-testid="baf-gates-flow" aria-label={t('gates.canvasAria')}>
      <div className={css.flowWrap}>
        {/* 【变更】2026-10-20 (批次五 2.6): the 一次性 legend item left with the
            once badges (state node + 确认门 pill remain). */}
        <div className={css.legendBar}>
          <span className={css.legendItem}><span className={join(css.legendDot, css.nodeMain)} aria-hidden />{t('gates.legendState')}</span>
          <span className={css.legendItem}><span className={css.legendPillDot} aria-hidden />{t('gates.confirmCount')}</span>
        </div>
        {/* 【变更】2026-10-20 (批次三 4.5): the canvas and the 门禁明细 split
            the frame left-right (the 状态脚本 split layout); clicking a canvas
            card swaps the right column to that node. */}
        <div className={css.flowSplit}>
          <div className={css.flowCanvas} style={{ width: CANVAS_W, height: canvasH }}>
            <svg className={css.flowEdges} viewBox={`0 0 ${CANVAS_W} ${canvasH}`} aria-hidden="true">
              <defs>
                <marker
                  id="baf-gates-flow-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" className={css.arrowHead} />
                </marker>
              </defs>
              {edgeList.map((edge, index) => (
                <path
                  key={index}
                  d={edge.d}
                  markerEnd="url(#baf-gates-flow-arrow)"
                  className={join(css.edge, edge.dashed === true ? css.edgeDashed : undefined)}
                />
              ))}
            </svg>
            {chainOrder.map(node => renderNode(node))}
            <div className={css.branchLabel} data-testid="baf-gates-branch" style={{ left: COL_X[1], top: driftPos.y - 20 }}>
              {t('gates.branchTitle')}
            </div>
            {renderNode('drift')}
            {renderNode('abandoned')}
          </div>
          {detailSection}
        </div>
      </div>
      {fallbackGates.length > 0 ? (
        <section className={css.fallback} data-testid="baf-gates-once">
          <div className={css.nodeHead}>
            <span className={css.nodeName}>{t('gates.onceTitle')}</span>
            <span className={css.nodeHint}>{t('gates.onceHint')}</span>
          </div>
          <div className={css.gates}>
            {fallbackGates.map(gate => <GateCard key={gate.id} gate={gate} t={t} />)}
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
        {/* 【变更】2026-10-20 (批次三 4.5): the 详/略 switch is deleted (the
            flow is always 详, split canvas + selected detail) — the head keeps
            only the collapsed-row expand/collapse toggle. Earlier: the intro
            paragraph left with 2026-10-18 (工作流确认门 2.1/2.2). */}
        <div className={css.headActions}>
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
          <GatesFlow data={data} t={t} />
        ) : null
      ) : null}
    </div>
  )
}
