/**
 * 【变更】2026-10-24 (批次二十 2): the 确认门 page reads as ONE premium
 * console (「金箔仪表台」) — the same material vocabulary the session 工作流图
 * uses, so the two pages feel like one product:
 *
 * - the frame gains a CONSOLE BAR (the chart's name + the two live counts:
 *   确认门 / 阶段门禁) — a numeric focal point above the canvas, and the
 *   frame itself becomes a layered gold-lit chassis instead of a hairline box;
 * - the canvas plane gains the soft radial gold GLOW the session graph has
 *   (WorkflowView's .flowGlow), so the middle of the page has a focal point;
 * - every canvas element enters on a STAGGERED fade-up (the step index rides
 *   the element's inline animation-delay), and the SELECTED element now reads
 *   GOLD (gold edge + tinted fill + a soft gold glow) instead of its tier
 *   colour — 「现在选中的是哪一个」 is obvious at a glance;
 * - the 门禁明细 panel is the page's primary content, so it carries the
 *   layered surface (gradient + gold hairline + top highlight) and the
 *   section headings wear the small-caps eyebrow treatment.
 *
 * No new copy: every string comes from the existing gates.* keys.
 * 【变更】2026-10-24 (批次十九 3.1): the 需求输入 ENTRY NODE is re-designed —
 * the old box tinted itself with `--dsw-alias-brand-primary`, which the
 * design platform defines as a NEUTRAL INK (near-black / near-white), so the
 * "brand tint" rendered as a grey wash (and, in dark mode, near-white text on
 * a near-white box). The node now wears the BAF GOLD accent (the package's
 * own --wf-accent family, as WorkflowView / TestFlowView use) with the dark
 * ink that sits ON gold — legible in BOTH themes — plus a glyph, real padding
 * and 700 weight (the old 650 weight is not a snapped variable-font weight).
 * 【变更】2026-10-24 (批次十九 3.2): the 门禁明细 panel reads as one system —
 * the gate title is printed ONCE (the detail head owns it; the card no longer
 * repeats it), the question body's 【…】 sections are FLATTENED (caption /
 * text / list are siblings — the .qSection wrapper is gone; grouping now comes
 * from spacing + a left rule), and the muted copy gets a real hierarchy
 * (primary ink / supporting ink / quiet ink) instead of one flat grey.
 * 【变更】2026-10-23 (批次十七 2.1/2.3): the intake decision is now a REAL
 * flowchart — a prominent 需求输入 entry box, the scaffold pill on the spine,
 * then ONE horizontal row of three option cards (未发现进行中的工作流 / 已有
 * 进行中的变更 / 多条未完成的变更，请选择接手对象) whose quiet line carries the
 * active-change condition (条件上节点); new-workflow converges solid into
 * 分类确认, the other two re-enter the spine dashed. The state cards and the
 * state 门禁明细 drop the 确认门 count/section entirely (a gate fires BETWEEN
 * states — the pills carry the details); the 明细 column is sticky and
 * restyled (批次十七 2.2/2.4).
 * 【变更】2026-10-23 (批次十六 2.1/2.5): the intake bootstrap gates are no
 * longer a blind vertical pill stack under 接单 — the canvas now opens with
 * the DECISION LOGIC that picks between them: a 需求进入 entry tag, the
 * scaffold PRE-ROW (工作区未初始化, sequential), a 三选一 caption, and the
 * three mutually-exclusive condition rows (无进行中的变更 / 已有一条 / 多条
 * 未完成) whose pills fan right of their condition chips and converge back
 * into the 分类确认 pill on the edge into 接单 (new-workflow solid;
 * active-conflict / bind-workflow dashed re-entry). Gate pills are now REAL
 * BUTTONS — clicking one selects THAT gate in the 门禁明细; a state node's
 * detail prints only its 阶段门禁 + 进入下一步的条件 (the 确认门 section
 * belongs to the gate node, because a gate fires BETWEEN states, not inside
 * them — the node keeps a ×N hint line pointing at its pills).
 * 【变更】2026-10-23 (批次十六 2.2): the GateCard body renders the registry
 * question's 【…】 sections (parseGateSections) — segmented blocks, not one
 * run-on line.
 * 【变更】2026-10-23 (批次十六 2.3/2.4): the 阶段门禁 conditions render as
 * soft checklist rows (checkbox markers + quiet fill), and the 明细 section
 * labels (阶段门禁 / 进入下一步的条件 / 确认门) promote from hairline text
 * to accent chips — the 确认门 chip carries the pill's warning tint.
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
import { parseGateSections, peelChangeMarker } from './gate-ask.ts'
import { NodeIcon } from './icons.tsx'
import type { TerminalStateId, WorkflowNodeId } from './tab-types.ts'
import css from './GatesOverviewRow.module.css'

/** The inject face the slot registration hands the row. */
export interface GatesOverviewRowInjected {
  /** Load the gate overview projection (first expand; cached client-side). */
  loadGateOverview: () => Promise<BafWorkflowGateOverview>
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
 * 【变更】2026-10-23 (批次十六 2.2): the question body renders its 【…】
 * sections (parseGateSections — the same wire protocol the session dialog
 * speaks): section title / lead text / `- ` list blocks, so the segmented
 * registry copy (【状态变化】【完成情况】【确认后】) reads as blocks instead of
 * one run-on line. A sectionless question (plain prose gates) stays one
 * quiet paragraph.
 * 【变更】2026-10-24 (批次十九 3.2): the body is FLATTER — each section's
 * caption / text / list render as SIBLINGS inside one body container, so the
 * copy sits one level shallower than the old .qSection wrapper (the grouping
 * now comes from spacing + a left rule, not from a nested element). The card
 * TITLE is optional: the 门禁明细 head prints the gate title, so that card
 * renders body-only (`showTitle={false}`) and the title appears exactly once.
 */
function GateCard({ gate, t, showTitle = true }: {
  gate: BafWorkflowGateConfirmRow
  t: GatesOverviewRowProps['t']
  /** 【变更】2026-10-24 (批次十九 3.2): false when the caller already prints
   * the gate title (the 门禁明细 head) — the title must appear exactly once. */
  showTitle?: boolean
}) {
  // 【变更】2026-10-23 (批次十六 2.2): peel the {{change:}} marker the same way
  // the dialog projection does — the token never prints as body copy. The
  // segmented layout needs at least one 【…】 TITLED section; plain prose
  // parses into a single untitled lead-in and keeps the flat paragraph.
  const { body } = peelChangeMarker(gate.question)
  const sections = parseGateSections(body)
  const titled = sections.some(section => section.title !== undefined)
  return (
    <div className={css.gateCard} data-testid={`baf-gate-confirm-${gate.id}`}>
      {showTitle ? <div className={css.gateTitle}>{gate.title}</div> : null}
      {!titled
        ? <div className={css.gateQuestion}>{body}</div>
        : (
          <div className={css.gateQuestionSections} data-testid={`baf-gate-question-${gate.id}`}>
            {sections.map((section, si) => (
              <Fragment key={`qsec-${si}`}>
                {section.title !== undefined && <div className={css.qSectionTitle}>{section.title}</div>}
                {section.blocks.map((block, bi) => block.kind === 'text'
                  ? <div key={`qt-${si}-${bi}`} className={css.qText}>{block.text}</div>
                  : (
                    <ul key={`ql-${si}-${bi}`} className={css.qList}>
                      {block.items.map((item, ii) => (
                        <li key={`qli-${si}-${bi}-${ii}`}>{item.text}</li>
                      ))}
                    </ul>
                  ))}
              </Fragment>
            ))}
          </div>
        )}
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

/**
 * 【变更】2026-10-23 (批次十六 2.5): a gate pill's full detail as ONE
 * pre-line string — the pill is a real button now, so its aria-label carries
 * the same text the 门禁明细 prints when the pill is selected (title /
 * question / options with their commands).
 */
function gateDetailText(gate: BafWorkflowGateConfirmRow, t: GatesOverviewRowProps['t']): string {
  const lines: string[] = [`${t('gates.sectionConfirm')} · ${gate.title}`, gate.question]
  for (const option of gate.options) {
    lines.push(`· ${option.label}（${optionCommandText(option, t)}）`)
  }
  if (gate.dynamicOptions !== undefined && gate.options.length === 0) {
    lines.push(`· ${t('gates.dynamicOptions')}`)
  }
  return lines.join('\n')
}

/** The node's full detail as ONE pre-line string — the node's aria-label, so
 * focus and screen readers read the same text the selected node's 门禁明细
 * group prints inline. 【变更】2026-10-20 (批次五 2.3): internal ids drop out
 * here too (no gateFn / advance-gate id / bug-fix tag — the reader-side
 * de-dup already keeps twins out of `gates`).
 * 【变更】2026-10-23 (批次十七 2.3): the confirm-gate lines left too — a gate
 * fires BETWEEN states, so the state's own text is stage + entry conditions
 * only (each pill button carries its own aria-label). */
function nodeDetailText(label: string, stage: BafWorkflowGateStageRow | undefined, t: GatesOverviewRowProps['t']): string {
  const lines: string[] = [label]
  if (stage !== undefined) {
    lines.push(`${t('gates.stageGate')} ${stage.artifact}`)
    for (const condition of stage.conditions) lines.push(`· ${condition}`)
    if (stage.note !== undefined) lines.push(stage.note)
  } else {
    lines.push(t('gates.noGate'))
  }
  return lines.join('\n')
}

/** Join CSS-module names without a clsx dependency (filters dropped keys). */
const join = (...names: ReadonlyArray<string | undefined>): string =>
  names.filter((name): name is string => name !== undefined && name !== '').join(' ')

/**
 * 【变更】2026-10-24 (批次二十 2): the entrance stagger — the canvas elements
 * assemble top-to-bottom instead of popping in at once. The step is the
 * element's place in the canvas order (fractional steps let a node's pills
 * land between it and the next node); the cap keeps the last element under
 * ~0.65s so the page never feels slow.
 */
const STAGGER_STEP_MS = 40
const STAGGER_MAX_STEP = 16
const stagger = (step: number): string =>
  `${Math.round(Math.min(Math.max(step, 0), STAGGER_MAX_STEP) * STAGGER_STEP_MS)}ms`

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
    .filter(edge => edge.from === from && edge.to === to)
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

/*
 * 【变更】2026-10-23 (批次十七 2.1): the intake branch block, take two — the
 * chip+caption+rail anatomy reads cluttered, so the whole decision is now a
 * REAL flowchart: a prominent 需求输入 entry box on the spine, the scaffold
 * pill right under it, then ONE horizontal row of three option cards (each
 * IS its 确认门 node — option text as the title, the active-change condition
 * as the card's quiet line). new-workflow converges solid into 分类确认;
 * the other two re-enter the spine dashed (take over an EXISTING change —
 * no classification).
 */
/** Entry box height (the prominent 需求输入 card at the very top).
 * 【变更】2026-10-24 (批次十九 3.1): 32→40 — the old box squeezed a 12.5px
 * label into 32px with no horizontal padding; 40 carries the gold node's
 * 13px/700 label with real breathing room. */
const ENTRY_H = 40
/** The scaffold pill sits this far under the entry box (on the spine). */
const ENTRY_GAP = 8
/** Fork point → the option row's tops (the fan-out curves' air). */
const FORK_GAP = 22
/** One horizontal branch option card (三选一, mutually exclusive). */
const OPTION_W = 124
const OPTION_H = 58
const OPTION_GAP = 12
/** Option bottoms → the 分类确认 pill. */
const OPTION_FLOW_GAP = 26

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

/** A pill on the canvas — 【变更】2026-10-20 (批次五 2.3/2.6): just the
 * title (the bug-fix chip and 一次性 badge are gone; the native title attr
 * still carries the question).
 * 【变更】2026-10-23 (批次十六 2.5): the pill is a real BUTTON — clicking it
 * selects THIS gate in the 门禁明细 (aria-pressed + the selection ring),
 * because a confirm gate fires BETWEEN states, so its detail belongs to the
 * pill, not to either state card. `width`/`pos` let the intake branch rows
 * place narrower pills off-spine; chain pills keep the centered default. */
function GatePill({ gate, pos, selected, onSelect, width = PILL_W, ariaLabel, step }: {
  gate: BafWorkflowGateConfirmRow
  pos: Pos
  selected: boolean
  onSelect: () => void
  width?: number
  ariaLabel: string
  /** 【变更】2026-10-24 (批次二十 2): the entrance stagger step. */
  step: number
}) {
  return (
    <button
      type="button"
      className={join(css.gatePill, selected ? css.gatePillSelected : undefined)}
      data-testid={`baf-gates-gate-node-${gate.id}`}
      style={{ left: pos.x, top: pos.y, width, height: PILL_H, animationDelay: stagger(step) }}
      aria-pressed={selected}
      aria-label={ariaLabel}
      title={gate.question}
      onClick={onSelect}
    >
      <span className={css.pillTitle}>{gate.title}</span>
    </button>
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
function CanvasNode({ node, pos, stage, gates, selected, onSelect, t, step }: {
  node: string
  pos: Pos
  stage: BafWorkflowGateStageRow | undefined
  gates: readonly BafWorkflowGateConfirmRow[]
  selected: boolean
  onSelect: () => void
  t: GatesOverviewRowProps['t']
  /** 【变更】2026-10-24 (批次二十 2): the entrance stagger step. */
  step: number
}) {
  const label = nodeLabelOf(node, t)
  const detailText = nodeDetailText(label, stage, t)
  return (
    <button
      type="button"
      className={join(css.flowNode, TIER_CLASS[node] ?? css.nodeMain, selected ? css.nodeSelected : undefined)}
      data-testid={`baf-gate-node-${node}`}
      style={{ left: pos.x, top: pos.y, width: NODE_W, height: NODE_H, animationDelay: stagger(step) }}
      aria-pressed={selected}
      aria-label={detailText}
      onClick={onSelect}
    >
      <span className={css.canvasName}>
        <span className={css.nodeIconInline}><NodeIcon id={node as WorkflowNodeId | TerminalStateId} /></span>
        {label}
        {NODE_EN[node] !== undefined ? <span className={css.nodeNameEn}>{NODE_EN[node]}</span> : null}
      </span>
      {/* 【变更】2026-10-23 (批次十七 2.3): the confirm-gate COUNT left the
          state card — a gate fires BETWEEN states, so the card no longer
          tallies what it does not contain; pill-less nodes still say 无门禁,
          pill-carrying nodes let their hanging pills speak for themselves. */}
      {gates.length === 0 ? (
        <span className={join(css.nodeAccent, css.nodeAccentIdle)}>{t('gates.noGate')}</span>
      ) : null}
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
  // 【变更】2026-10-23 (批次十六 2.1): 接单 no longer adopts the bootstrap
  // pills — they render in the intake branch block above it; only genuinely
  // intake-anchored strays still stack under the card.
  const chainPills = (node: string): BafWorkflowGateConfirmRow[] =>
    gatesByNode.get(node) ?? []
  const stackPills = (node: string): BafWorkflowGateConfirmRow[] =>
    gatesByNode.get(node) ?? []

  /*
   * 【变更】2026-10-23 (批次十七 2.1): the intake branch block, take two — a
   * clean flowchart: 需求输入 entry box → scaffold pill (sequential, on the
   * spine) → fork into the HORIZONTAL three-option row (each option card IS
   * its 确认门 node: option title + the active-change condition) → converge.
   * new-workflow flows solid into 分类确认 on the edge into 接单;
   * active-conflict / bind-workflow re-enter the spine directly (dashed —
   * they take over an EXISTING change, no new classification).
   */
  const entryGateOf = (id: string): BafWorkflowGateConfirmRow | undefined =>
    entryGates.find(gate => gate.id === id)
  const scaffoldGate = entryGateOf('scaffold')
  const optionGates = [entryGateOf('new-workflow'), entryGateOf('active-conflict'), entryGateOf('bind-workflow')]
    .filter((gate): gate is BafWorkflowGateConfirmRow => gate !== undefined)
  const spineX = COL_X[0] + NODE_W / 2

  const entryY = CANVAS_TOP
  const scaffoldPillY = entryY + ENTRY_H + ENTRY_GAP
  const forkY = scaffoldPillY + (scaffoldGate !== undefined ? PILL_H : 0) + 6
  const optionY = forkY + FORK_GAP
  /** The option row, centered in the canvas: [10, 146, 282] on a 416px row. */
  const optionRowW = optionGates.length * OPTION_W + (optionGates.length - 1) * OPTION_GAP
  const optionX = (index: number): number => (CANVAS_W - optionRowW) / 2 + index * (OPTION_W + OPTION_GAP)
  const optionCx = (index: number): number => optionX(index) + OPTION_W / 2
  const optionBottom = optionY + OPTION_H
  const classifyY = optionBottom + OPTION_FLOW_GAP
  const hasClassify = classifyGate !== undefined
  const reentryY = classifyY + PILL_H + 10
  const intakeY = hasClassify ? reentryY + 16 : optionBottom + 18

  const edgeList: Array<{ d: string; dashed?: boolean }> = []
  // Spine: entry box → fork point; the scaffold pill sits ON it.
  edgeList.push({ d: `M ${spineX} ${entryY + ENTRY_H} L ${spineX} ${forkY}` })
  // Fork: fan out to each option card's top.
  optionGates.forEach((_, index) => {
    const cx = optionCx(index)
    edgeList.push({ d: `M ${spineX} ${forkY} C ${spineX} ${forkY + 10}, ${cx} ${optionY - 10}, ${cx} ${optionY}` })
  })
  // Converge: new-workflow → 分类确认 (solid); the other two re-enter the
  // spine below the classify pill (dashed, offset joins so the arrowheads
  // never stack).
  optionGates.forEach((gate, index) => {
    const cx = optionCx(index)
    if (gate.id === 'new-workflow') {
      if (hasClassify) {
        edgeList.push({ d: `M ${cx} ${optionBottom} C ${cx} ${optionBottom + 10}, ${spineX} ${classifyY - 12}, ${spineX} ${classifyY}` })
      } else {
        edgeList.push({ d: `M ${cx} ${optionBottom} C ${cx} ${optionBottom + 10}, ${spineX} ${intakeY - 12}, ${spineX} ${intakeY}` })
      }
      return
    }
    const joinY = reentryY + (gate.id === 'active-conflict' ? 0 : 8)
    edgeList.push({
      d: `M ${cx} ${optionBottom} C ${cx} ${optionBottom + 16}, ${spineX + 30} ${joinY - 14}, ${spineX} ${joinY}`,
      dashed: true,
    })
  })
  // 分类确认 → 接单 (the guarded edge into the chain).
  if (hasClassify) {
    edgeList.push({ d: `M ${spineX} ${classifyY + PILL_H} L ${spineX} ${intakeY}` })
  }

  // Column 0 layout: walk the chain, growing each gap with its pill count;
  // the chain verticals are collected on the same walk. The walk starts at
  // intakeY — below the whole intake branch block (批次十六 2.1).
  const chainOrder = [...MAIN_CHAIN, ...extraNodes, 'completed']
  const pos = new Map<string, Pos>()
  const chainPillList = new Map<string, BafWorkflowGateConfirmRow[]>()
  let y = intakeY
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
  /*
   * 【变更】2026-10-23 (批次十六 2.5): a PILL click picks the gate itself —
   * `gate:<id>` — and the 明细 column opens the gate's card instead of the
   * state's (a confirm gate fires BETWEEN states; neither state card owns
   * its detail). Bare ids keep the old node selection.
   */
  const selectedGateId = selected.startsWith('gate:') ? selected.slice('gate:'.length) : undefined
  const allCanvasGates = [
    ...(classifyGate !== undefined ? [classifyGate] : []),
    ...entryGates,
    ...[...chainPillList.values()].flat(),
    ...fallbackGates,
  ]
  const selectedGateRow = selectedGateId === undefined
    ? undefined
    : allCanvasGates.find(gate => gate.id === selectedGateId)

  /**
   * 【变更】2026-10-24 (批次二十 2): the entrance stagger steps — the canvas
   * assembles in reading order: the 需求输入 hero, its scaffold pill, the
   * horizontal option row, the 分类确认 converge, then the chain (each node
   * and the pills riding its edge), then the branch column.
   */
  const STEP_ENTRY = 0
  const STEP_SCAFFOLD = 1
  const STEP_OPTION = 2
  const STEP_CLASSIFY = STEP_OPTION + optionGates.length
  const STEP_CHAIN = STEP_CLASSIFY + 1

  /** One canvas node + the pills that ride its leaving edge / its stack. */
  const renderNode = (node: string, step: number): ReactNode => {
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
          step={step}
        />
        {pills.map((gate, index) => (
          <GatePill
            key={gate.id}
            gate={gate}
            pos={{ x: nodePos.x + NODE_W / 2 - PILL_W / 2, y: nodePos.y + NODE_H + 10 + index * PILL_STEP }}
            selected={selected === `gate:${gate.id}`}
            onSelect={() => { setPicked(`gate:${gate.id}`) }}
            ariaLabel={gateDetailText(gate, t)}
            step={step + 0.5 + index * 0.5}
          />
        ))}
      </Fragment>
    )
  }

  // The right-hand 门禁明细 column — 【变更】2026-10-20 (批次五 2.1/2.3): the
  // selected node's group re-layers under section labels (阶段门禁 / 进入下一
  // 步的条件 / 确认门); the internal gateFn id no longer prints.
  // 【变更】2026-10-23 (批次十六 2.5): a selected PILL opens the GATE's group
  // (确认门 badge + its card) — the state node's group no longer prints the
  // gate cards, only the count + where to click (确认门 fires BETWEEN states).
  const detailSection = (
    <section className={css.detail} data-testid="baf-gates-detail" style={{ animationDelay: stagger(1) }}>
      <div className={css.detailHead}>{t('gates.detailTitle')}</div>
      {selectedGateRow !== undefined ? (
        <div className={css.detailGroup} data-testid={`baf-gates-detail-gate-${selectedGateRow.id}`}>
          {/* 【变更】2026-10-24 (批次十九 3.2): the head owns the gate title —
              the card below renders body-only, so the title is written ONCE
              (it used to print twice: here AND in the card's own title line). */}
          <div className={css.nodeHead}>
            <span className={join(css.badge, css.badgeGate)}>{t('gates.sectionConfirm')}</span>
            <span className={css.nodeName}>{selectedGateRow.title}</span>
          </div>
          <div className={css.gates}>
            <GateCard gate={selectedGateRow} t={t} showTitle={false} />
          </div>
        </div>
      ) : selectedSpec === undefined ? null : (
        <div className={css.detailGroup} data-testid={`baf-gates-detail-node-${selectedSpec.node}`}>
          {/* 【变更】2026-10-23 (批次十七 2.3): the 确认门 badge AND the 确认门
              section left the state's 明细 — gates fire BETWEEN states, so the
              state prints stage + entry conditions only; the pills on the
              canvas carry the gate details (click one). */}
          <div className={css.nodeHead}>
            <span className={css.nodeIcon}><NodeIcon id={selectedSpec.node as WorkflowNodeId | TerminalStateId} /></span>
            <span className={css.nodeName}>
              {nodeLabelOf(selectedSpec.node, t)}
              {NODE_EN[selectedSpec.node] !== undefined
                ? <span className={css.nodeNameEn}>{NODE_EN[selectedSpec.node]}</span>
                : null}
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
        </div>
      )}
    </section>
  )

  return (
    <div className={css.flow} data-testid="baf-gates-flow" aria-label={t('gates.canvasAria')}>
      {/* 【变更】2026-10-25 (批次二十四 2): the page gains the LEDGER's
          structure — a hero band (the BAF mark, the page's identity, what it
          shows) and a row of figure plates (确认门 / 阶段门禁 / 状态节点). The
          确认门 tab and the 变更总览 tab are the two pages of the 工作流
          surface; before, one opened with a console bar and the other with a
          hero, and they did not read as siblings. The counts that used to sit
          inside the frame's console bar are page figures now, so the frame is
          the chart alone. */}
      <header className={css.hero} data-testid="baf-gates-hero">
        <span className={css.heroBrand}>{t('view.brandBaf')}</span>
        <div className={css.heroText}>
          <span className={css.heroLabel}>{t('gates.heroLabel')}</span>
          <h2 className={css.heroTitle}>{t('gates.heroTitle')}</h2>
          <p className={css.heroDescription}>{t('gates.heroHelp')}</p>
        </div>
      </header>

      <div className={css.tiles} data-testid="baf-gates-tiles">
        <div className={css.tile} data-tone="confirm">
          <span className={css.tileValue}>{String(allCanvasGates.length)}</span>
          <span className={css.tileLabel}>{t('gates.sectionConfirm')}</span>
        </div>
        <div className={css.tile} data-tone="stage">
          <span className={css.tileValue}>{String(data.stageGates.length)}</span>
          <span className={css.tileLabel}>{t('gates.sectionStage')}</span>
        </div>
        <div className={css.tile} data-tone="states">
          <span className={css.tileValue}>{String(detailSpecs.length)}</span>
          <span className={css.tileLabel}>{t('gates.tileStates')}</span>
        </div>
      </div>

      <div className={css.flowWrap}>
        {/* 【变更】2026-10-22 (批次十四 2): the legend bar (状态节点 / 确认门) is
            DELETED — the node anatomy is self-explanatory now, no legend. */}
        {/* 【变更】2026-10-24 (批次二十 2): the CONSOLE BAR — the frame's control
            deck: the chart's own name (the visible echo of the region's
            accessible name, so it is hidden from AT).
            【变更】2026-10-25 (批次二十四 2): the two live counts left the bar
            for the page's figure plates, so the bar says what the frame IS and
            the plates say how big it is. The quiet hint replaces them. */}
        <div className={css.consoleBar} data-testid="baf-gates-console">
          <span className={css.consoleLabel} aria-hidden="true">{t('gates.canvasAria')}</span>
          <span className={css.consoleHint}>{t('gates.canvasHint')}</span>
        </div>
        {/* 【变更】2026-10-20 (批次三 4.5): the canvas and the 门禁明细 split
            the frame left-right (the 状态脚本 split layout); clicking a canvas
            card swaps the right column to that node.
            【变更】2026-10-24 (批次二十 2): the canvas rides a PLANE wrapper, so
            the glow behind it has a box to live in. */}
        <div className={css.flowSplit}>
          <div className={css.plane}>
            <div className={css.flowCanvas} style={{ width: CANVAS_W, height: canvasH }}>
              {/* 【变更】2026-10-24 (批次二十 2): the soft radial gold GLOW behind
                  the canvas — the same focal point the session 工作流图 has. */}
              <div className={css.flowGlow} aria-hidden="true" />
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
              {/*
                【变更】2026-10-23 (批次十七 2.1): the intake branch block, take two —
                a clean flowchart. The prominent 需求输入 entry box anchors the
                spine; the scaffold pill rides right under it; the spine forks
                into ONE horizontal row of three option cards (each IS its
                确认门 node — the customer-facing option text leads, the
                active-change condition rides quiet under it). new-workflow
                converges solid into 分类确认; the other two re-enter the spine
                dashed (take over an EXISTING change — no classification).
              */}
              <div
                className={css.entryBox}
                data-testid="baf-gates-entry"
                style={{
                  left: spineX - NODE_W / 2,
                  top: entryY,
                  width: NODE_W,
                  height: ENTRY_H,
                  animationDelay: stagger(STEP_ENTRY),
                }}
              >
                {/* 【变更】2026-10-24 (批次十九 3.1): the entry node carries the
                    intake glyph, so it reads as a NODE (like the state cards)
                    instead of a bare text chip. */}
                <span className={css.entryIcon}><NodeIcon id="intake" /></span>
                {t('gates.entryInput')}
              </div>
              {scaffoldGate !== undefined ? (
                <GatePill
                  gate={scaffoldGate}
                  pos={{ x: spineX - PILL_W / 2, y: scaffoldPillY }}
                  selected={selected === `gate:${scaffoldGate.id}`}
                  onSelect={() => { setPicked(`gate:${scaffoldGate.id}`) }}
                  ariaLabel={gateDetailText(scaffoldGate, t)}
                  step={STEP_SCAFFOLD}
                />
              ) : null}
              {optionGates.map((gate, index) => (
                <button
                  key={gate.id}
                  type="button"
                  className={join(css.optionCard, selected === `gate:${gate.id}` ? css.optionCardSelected : undefined)}
                  data-testid={`baf-gates-gate-node-${gate.id}`}
                  style={{
                    left: optionX(index),
                    top: optionY,
                    width: OPTION_W,
                    height: OPTION_H,
                    animationDelay: stagger(STEP_OPTION + index),
                  }}
                  aria-pressed={selected === `gate:${gate.id}`}
                  aria-label={gateDetailText(gate, t)}
                  title={gate.question}
                  onClick={() => { setPicked(`gate:${gate.id}`) }}
                >
                  <span className={css.optionTitle}>
                    {gate.id === 'new-workflow'
                      ? t('gates.entryOptNone')
                      : gate.id === 'active-conflict'
                        ? t('gates.entryOptOne')
                        : t('gates.entryOptMany')}
                  </span>
                  <span className={css.optionCond}>
                    {gate.id === 'new-workflow'
                      ? t('gates.entryCondNone')
                      : gate.id === 'active-conflict'
                        ? t('gates.entryCondOne')
                        : t('gates.entryCondMany')}
                  </span>
                </button>
              ))}
              {classifyGate !== undefined ? (
                <GatePill
                  gate={classifyGate}
                  pos={{ x: spineX - PILL_W / 2, y: classifyY }}
                  selected={selected === `gate:${classifyGate.id}`}
                  onSelect={() => { setPicked(`gate:${classifyGate.id}`) }}
                  ariaLabel={gateDetailText(classifyGate, t)}
                  step={STEP_CLASSIFY}
                />
              ) : null}
              {chainOrder.map((node, index) => renderNode(node, STEP_CHAIN + index))}
              <div className={css.branchLabel} data-testid="baf-gates-branch" style={{ left: COL_X[1], top: driftPos.y - 20 }}>
                {t('gates.branchTitle')}
              </div>
              {renderNode('drift', STEP_CHAIN + chainOrder.length)}
              {renderNode('abandoned', STEP_CHAIN + chainOrder.length + 1)}
            </div>
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
      {/* 【变更】2026-10-20 (批次三 4.5): the 详/略 switch is deleted (the
          flow is always 详, split canvas + selected detail) — the head keeps
          only the collapsed-row expand/collapse toggle. Earlier: the intro
          paragraph left with 2026-10-18 (工作流确认门 2.1/2.2).
          【变更】2026-10-24 (批次二十 2): the head renders ONLY when it owns a
          control — embedded in the 确认门 tab the row has no toggle, so the
          empty head bar is gone and the console bar (inside the frame) owns
          the page's identity. */}
      {embedded ? null : (
        <div className={css.head}>
          <div className={css.headActions}>
            <button type="button" className={css.toggle} data-testid="baf-gates-toggle" onClick={expand}>
              {expanded ? t('gates.collapse') : t('gates.expand')}
            </button>
          </div>
        </div>
      )}

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
