/**
 * Gate Cards registry — the domain-layer single source of truth for every
 * confirmation point in the BAF workflow (§22).
 *
 * The model's only authorized way to ask "what now?" at a gate is to read the
 * spec from this registry and render it verbatim — no ad-hoc option list, no
 * improvised third path. Slash handlers, the CLI, the Tab pendingGate, and
 * the model-facing section text all read the same `GATE_REGISTRY`, so the
 * three surfaces and the model's prose cannot disagree on what is offered.
 *
 * Each option maps to an existing slash command (the `command` field). Adding
 * a new gate = edit this file + add a test in `tests/gate-cards.spec.ts`.
 *
 * @module @deepseek-ai/dsh-baf-workflow/gate-cards
 */

import type { CommandResult } from '@deepseek-ai/dsh-commands'
import { formatCommandReport } from './command-format.ts'
import type { WorkflowNode } from '@deepseek-ai/dsh-baf-core'

/** The closed set of confirmation gates (new gates must extend this union). */
export type GateId =
  | 'scaffold'
  | 'new-workflow'
  | 'intake-classify'
  | 'active-conflict'
  | 'bind-workflow'
  | 'open-advance'
  | 'clarify-advance'
  | 'design-advance'
  | 'plan-advance'
  | 'verify-advance'
  | 'design-confirm'
  | 'verify-archive'
  | 'abandon'
  | 'resume'

/** One option on a gate card — must map to an existing slash command. */
export interface GateOptionSpec {
  /** Stable id (used in tests and Tab pendingGate). */
  readonly id: string
  /** Human label shown on the card (kept short, Chinese ok). */
  readonly label: string
  /** Slash command to dispatch (must be a registered slash, not arbitrary). */
  readonly command: string
  /** Positional / key=value args appended to the slash invocation. */
  readonly args?: readonly string[]
  /**
   * Custom one-sentence hint shown under the option. Gates whose click is
   * continued by the caller instead of dispatching a slash (the
   * `baf_gate_ask` bootstrap gates) use this — the derived 「将执行 /xxx」
   * line would advertise a command nobody runs.
   */
  readonly hint?: string
}

/**
 * Option-command sentinels (never dispatched as slashes):
 * - `__noop__` — the dismiss shape: clicking means "no choice / walk away",
 *   the dialog resolves it to the paused outcome.
 * - `__continued__` — the caller-continued shape: clicking is a real choice
 *   the caller (the `baf_gate_ask` bootstrap, which holds the requirement)
 *   continues in-call; the dialog resolves it to an answered outcome whose
 *   optionId the caller branches on. No Tab/slash surface can dispatch it.
 */
export const OPTION_COMMAND_SENTINELS = ['__noop__', '__continued__'] as const

/** Dynamic option set — gate cards that derive options from projection. */
export type GateDynamicOptions =
  | 'resume-targets'
  | 'change-targets'

/** A registered gate. */
export interface GateSpec {
  readonly id: GateId
  readonly title: string
  readonly question: string
  readonly options: readonly GateOptionSpec[]
  readonly dynamicOptions?: GateDynamicOptions
}

/** Per-render context — only dynamic-option gates need extra fields. */
export interface GateContext {
  readonly cwd: string
  readonly changeId?: string
  /** Resume gate — derived target nodes. */
  readonly resumeCandidates?: readonly WorkflowNode[]
  readonly resumeAnchor?: WorkflowNode
  /** Bind gate — the active change ids this session could take over. */
  readonly bindCandidates?: readonly string[]
}

/** Stable headline for the collapsed card row. */
const HEADLINE = '等待你的确认 · 点工作流页签的按钮，或输入对应命令'

/** Single-line footer hint shown on every gate card. */
const FOOTER = '点工作流页签的按钮，或输入对应命令'

/**
 * The canonical registry. Every gate the workflow ever offers must be
 * listed here. The model has read-only access to this map; it can never
 * add or remove options on its own.
 */
export const GATE_REGISTRY: Readonly<Record<GateId, GateSpec>> = {
  'scaffold': {
    id: 'scaffold',
    title: '工作区需要初始化',
    question: '这个目录还没有初始化，缺少工作流需要的配置文件和目录。先初始化，才能开始处理变更。',
    options: [
      { id: 'init', label: '初始化工作区', command: '/baf-scaffold' },
      { id: 'cancel', label: '暂不初始化', command: '__noop__' },
    ],
  },
  // User decision 2026-09-22 (workflow spec §1, literal reading): the FIRST
  // dialog of a new requirement is always the bind-or-create check. With no
  // active change the requirement itself is evidence of intent, but the
  // customer still sees an explicit 新建工作流 card before anything is
  // minted. Popped only by the `baf_gate_ask` requirement bootstrap (and
  // after a scaffold leg); clicking 新建 continues to the classification
  // dialog inside the same tool call — hence the `hint`s instead of
  // dispatchable commands: no standalone slash carries the requirement.
  'new-workflow': {
    id: 'new-workflow',
    title: '未发现进行中的工作流',
    question: '这个工作区没有未结束的工作流。要为下面这个需求新建一条工作流吗？确认后进入分类确认（完整流程 / 缺陷修复路径）。',
    options: [
      { id: 'create', label: '新建工作流', command: '__continued__', hint: '确认新建，随即进入分类确认' },
      { id: 'hold', label: '暂不处理', command: '__continued__', hint: '本次不新建工作流（再敲 /baf-go 或再次提出需求时会重新询问）' },
    ],
  },
  'intake-classify': {
    id: 'intake-classify',
    title: '需求分类待确认',
    question: '系统已经初步判断了这个需求的类型和处理方式。请确认判断结果，或拒绝后重新描述。',
    // §22.17 J — the two paths are separate clickable options: the customer
    // settles full-go-path vs bug-fix-path here (an `intake-mode-set` event
    // when it differs from the classifier's pick), instead of re-describing
    // the whole requirement just to change lanes.
    options: [
      { id: 'confirm-full', label: '确认 · 完整流程', command: '/baf-workflow-classify', args: ['confirm', 'mode=full-go-path'] },
      { id: 'confirm-bugfix', label: '确认 · 缺陷修复路径', command: '/baf-workflow-classify', args: ['confirm', 'mode=bug-fix-path'] },
      { id: 'reject', label: '重新描述需求', command: '/baf-workflow-classify', args: ['reject'] },
    ],
  },
  // 2026-09-21 (session 6.jsonl): a stated requirement while another change is
  // still active used to come back as a text-only refusal card, and the model
  // bridged the gap with a prose "A. 继续推进 / B. 新开会话" question the
  // customer had to answer by typing "A". The two real actions were registered
  // commands all along — this gate makes them the clickable options, so the
  // conflict itself is a dialog the customer settles with one click. Popped by
  // the `baf_gate_ask` requirement bootstrap (and legal as an explicit re-pop).
  'active-conflict': {
    id: 'active-conflict',
    title: '已有进行中的变更',
    question: '这个工作区已有一条进行中的变更，还不能直接开始新需求。请先决定现有变更的去向：继续推进它，或放弃它之后再重新提出新需求。',
    options: [
      { id: 'advance', label: '继续推进现有变更', command: '/baf-go' },
      { id: 'abandon', label: '放弃现有变更，稍后再提新需求', command: '/baf-workflow-abandon', args: ['confirm'] },
      { id: 'pause', label: '暂不处理', command: '__noop__' },
    ],
  },
  // §22.19 (session 7.jsonl R4): `/baf-go` with ≥2 active changes used to be
  // a text-only card whose escape was typing `/baf-go change=<id>` — another
  // prose A/B the customer had to answer by hand. The binding choice is a
  // workspace-scope workflow decision, so it is a registered gate like every
  // other: the coordinator pops it (candidates = actives) and the click
  // re-dispatches the same `/baf-go change=<id>` the text card advertised.
  'bind-workflow': {
    id: 'bind-workflow',
    title: '多条未完成的变更，请选择接手对象',
    question: '这个工作区有多条未完成的变更，本会话要接手哪一条？选定后本会话将绑定并推进它，其余变更保持原状。',
    options: [], // populated dynamically from `ctx.bindCandidates`
    dynamicOptions: 'change-targets',
  },
  // User-facing advancement gates (§22 user-request 2026-09-20). Every
  // transition that requires explicit customer agreement — not just the two
  // machine-checked confirm gates — pops a dialog so the customer can see
  // what they're agreeing to. `advance` routes through `/baf-go-confirm`
  // (driveGateResolve handles it) so the click resolves into driveGo with
  // `confirm:true` and skips the next popup; `/baf-go` would loop because
  // the advance family has no parked state.
  'open-advance': {
    id: 'open-advance',
    title: '提案已完成 · 请确认推进',
    // 【变更】2026-09-22 (user report #1/#4): this card pops only after
    // proposal.md passes its gate — it is the customer confirming the open
    // stage's artifact, not a bare "next step" nod.
    question: '提案（proposal.md）已完成并通过完成门：Why / Scope / Impact 均已填写。确认后进入澄清阶段，系统会装好模板，等模型把澄清文档填好后，再弹下一次确认卡。',
    options: [
      { id: 'advance', label: '确认提案 · 进入澄清', command: '/baf-go-confirm' },
      { id: 'back', label: '暂不推进', command: '__noop__' },
    ],
  },
  'clarify-advance': {
    id: 'clarify-advance',
    title: '进入设计 · 请确认',
    question: '澄清文档已经齐了。系统会装好设计模板，等模型把设计文档填好后，再敲一次 /baf-go 继续。',
    options: [
      { id: 'advance', label: '确认进入设计', command: '/baf-go-confirm' },
      { id: 'back', label: '暂不推进', command: '__noop__' },
    ],
  },
  'design-advance': {
    id: 'design-advance',
    title: '进入计划 · 请确认',
    question: '设计文档已经齐了。系统会装好计划模板，等模型把计划文档填好后，再敲一次 /baf-go 继续。',
    options: [
      { id: 'advance', label: '确认进入计划', command: '/baf-go-confirm' },
      { id: 'back', label: '暂不推进', command: '__noop__' },
    ],
  },
  'plan-advance': {
    id: 'plan-advance',
    title: '进入实现 · 请确认',
    question: '计划已经齐了。系统会进入实现阶段，你只需要按计划改白名单内的文件。',
    options: [
      { id: 'advance', label: '确认进入实现', command: '/baf-go-confirm' },
      { id: 'back', label: '暂不推进', command: '__noop__' },
    ],
  },
  // 【变更】2026-09-23 (demo1 十问题 8): verify entry is a customer-gated
  // transition — implement finishing used to auto-run verification. The
  // confirm names the checklist the run will execute and the acceptance
  // document it writes (verify.md, demo5 issue #3).
  'verify-advance': {
    id: 'verify-advance',
    title: '实现完成 · 请确认验证',
    question: '计划内的任务已全部完成（改动均在白名单内）。确认后进入验证阶段：系统按检查单运行验证，并生成验收文档 verify.md。验证未通过会带着失败项回到实现阶段。',
    options: [
      { id: 'advance', label: '确认开始验证', command: '/baf-go-confirm' },
      { id: 'back', label: '暂不验证', command: '__noop__' },
    ],
  },
  'design-confirm': {
    id: 'design-confirm',
    title: '设计已完成，请确认',
    question: '设计文档已经写好。确认后将进入计划阶段。任选一种方式确认：确认弹窗点「确认设计」、工作流页签点确认按钮、聊天里输入 /baf-go-confirm、或终端跑 baf go-confirm；输入 /baf-go 会重新弹出确认框。',
    options: [
      { id: 'confirm', label: '确认设计，进入计划', command: '/baf-go' },
      { id: 'back', label: '退回，继续澄清需求', command: '/baf-workflow-clarify' },
    ],
  },
  'verify-archive': {
    id: 'verify-archive',
    title: '检查已通过，请确认归档',
    question: '所有检查都已通过。确认后将归档本次变更。任选一种方式确认：确认弹窗点「确认归档」、工作流页签点确认按钮、聊天里输入 /baf-go-confirm、或终端跑 baf go-confirm；输入 /baf-go 会重新弹出确认框。',
    options: [
      { id: 'confirm', label: '确认归档', command: '/baf-go' },
      { id: 'back', label: '退回，继续修改实现', command: '/baf-workflow-implement' },
    ],
  },
  'abandon': {
    id: 'abandon',
    title: '请确认：放弃当前变更',
    question: '即将放弃当前正在进行的变更。放弃后变更结束，只保留操作记录，已完成的阶段不会继续。',
    options: [
      { id: 'confirm', label: '确认放弃', command: '/baf-workflow-abandon', args: ['confirm'] },
      { id: 'cancel', label: '取消', command: '__noop__' },
    ],
  },
  'resume': {
    id: 'resume',
    title: '流程出现偏差，请选择回退位置',
    question: '工作流检测到实际改动和流程记录对不上。请选择要退回的阶段，从那里重新开始（它之后的阶段会重跑）。',
    options: [], // populated dynamically from `ctx.resumeCandidates`
    dynamicOptions: 'resume-targets',
  },
}

/**
 * Render one option row. The full text of the row is the contract that the
 * session card, the Tab pendingGate, the CLI terminal, and the model-facing
 * tool return all use — the model only ever reads these strings back.
 */
function renderOptionLine(spec: GateOptionSpec, index: number, changeId: string | undefined): string {
  const num = `[${index + 1}]`
  if (spec.hint !== undefined) {
    return `${num} ${spec.label}    → ${spec.hint}`
  }
  if (spec.command === '__noop__') {
    return `${num} ${spec.label}    → 本次不操作`
  }
  const invocation = spec.args === undefined || spec.args.length === 0
    ? spec.command
    : `${spec.command} ${spec.args.join(' ')}`
  return changeId === undefined || spec.id === 'init'
    ? `${num} ${spec.label}    → ${invocation}`
    : `${num} ${spec.label}    → ${invocation} change=${changeId}`
}

/** Render the resume card's dynamic options. */
function resumeOptions(ctx: GateContext): readonly GateOptionSpec[] {
  const candidates = ctx.resumeCandidates ?? []
  const anchor = ctx.resumeAnchor
  return candidates.map((node) => {
    const isAnchor = anchor === node && candidates.length > 1
    return {
      id: `resume-${node}`,
      label: isAnchor ? `复位到 ${node} · 默认` : `复位到 ${node}`,
      command: '/baf-workflow-resume',
      args: [node],
    }
  })
}

/**
 * Render the bind card's dynamic options — one per active change id. The
 * dispatch is the `/baf-go change=<id>` the old text card advertised, so a
 * click and a typed command run the exact same drive.
 */
function bindOptions(ctx: GateContext): readonly GateOptionSpec[] {
  return (ctx.bindCandidates ?? []).map(changeId => ({
    id: `bind-${changeId}`,
    label: `接手 ${changeId}`,
    command: '/baf-go',
    args: [`change=${changeId}`],
  }))
}

/**
 * Build the §22 gate card sections (the canonical structured form every
 * surface composes from). Pure — no I/O, no projection reads. Used by
 * `renderWelcomeCard` (session card), by `baf_gate_ask` (model tool), and
 * indirectly by the Tab pendingGate through `WorkflowTabPendingGate`.
 *
 * Returned shape is `formatCommandReport` sections: `title` is the 【...】
 * label and `lines` are the body lines without the leading two-space indent.
 * Callers that want the rendered card pass this to `formatCommandReport`;
 * callers that want to splice into an existing card (session gate) use the
 * sections directly.
 * @param spec - the gate spec.
 * @param ctx - optional per-render context (cwd / changeId / dynamic options).
 * @returns sections, or undefined if the gate needs context the caller omitted.
 */
export function gateCardSections(spec: GateSpec, ctx?: GateContext): readonly { title: string; lines: readonly string[] }[] | undefined {
  const options = spec.dynamicOptions === 'resume-targets'
    ? resumeOptions(ctx ?? { cwd: '' })
    : spec.dynamicOptions === 'change-targets'
      ? bindOptions(ctx ?? { cwd: '' })
      : spec.options
  if (options.length === 0) return undefined
  const changeId = ctx?.changeId
  const sections: { title: string; lines: readonly string[] }[] = [
    { title: '问题', lines: [spec.question] },
    {
      title: '选项',
      lines: options.map((opt, i) => renderOptionLine(opt, i, changeId)),
    },
    { title: '下一步', lines: [FOOTER] },
  ]
  if (ctx?.cwd !== undefined && ctx.cwd !== '') {
    sections.unshift({ title: '工作区', lines: [`cwd: ${ctx.cwd}`] })
  }
  return sections
}

/**
 * Render a gate spec into the canonical card text. Every surface (session
 * card, Tab pendingGate, CLI, model tool) reads this same function.
 *
 * The output is **plain text**, not an exception: an unknown `gateId`
 * surfaces as a structured refusal that callers can render verbatim. The
 * model cannot ask for a gate that is not in the registry — even if it
 * invents one, the renderer returns a refusal value, not a card.
 *
 * @param spec - the gate spec from {@link GATE_REGISTRY} (or a dynamic gate).
 * @param ctx - optional per-render context (cwd / changeId / dynamic options).
 * @returns the rendered card, or a refusal describing an unknown gate.
 */
export function renderGateCard(spec: GateSpec, ctx?: GateContext): CommandResult {
  const sections = gateCardSections(spec, ctx)
  if (sections === undefined) {
    return {
      kind: 'error',
      text: formatCommandReport(false, `${spec.title} · 信息不全，暂时无法展示 · 点本行展开/折叠详情`, [
        { title: '原因', lines: ['这张卡需要额外的上下文（可选的回退阶段 / 变更编号），当前没有拿到'] },
        { title: '处理', lines: ['到工作流页签看一下当前状态；或重新输入 /baf-go 让系统重新计算'] },
      ]),
    }
  }

  return {
    kind: 'success',
    text: formatCommandReport(true, `${HEADLINE} · ${spec.title} · 点本行展开/折叠详情`, sections),
  }
}

/**
 * Convenience: render by gate id. Unknown ids return a structured refusal —
 * the model tool layer and the Tab pendingGate both consume this so the
 * "unknown gate" case is uniform. The parameter is deliberately `string`
 * (not the `GateId` union): runtime callers (the `baf_gate_ask` tool, Remote
 * `gateResolve`) receive ids from JSON payloads, and an unregistered id must
 * surface as a refusal value (§22.9), never a TypeError.
 *
 * @param gateId - the gate id from {@link GATE_REGISTRY} (validated at runtime).
 * @param ctx - per-render context.
 * @returns the rendered card or a refusal.
 */
export function renderGate(gateId: string, ctx?: GateContext): CommandResult {
  const spec: GateSpec | undefined = (GATE_REGISTRY as Record<string, GateSpec | undefined>)[gateId]
  if (spec === undefined) {
    return {
      kind: 'error',
      text: formatCommandReport(false, `无法识别的确认项 ${JSON.stringify(gateId)} · 点本行展开/折叠详情`, [
        { title: '原因', lines: [`系统里没有这个确认项（现有：${Object.keys(GATE_REGISTRY).join(' | ')}）`] },
        { title: '处理', lines: ['重新输入 /baf-go 让系统重新计算当前需要确认的事项；或输入 /baf-help 查看命令表'] },
      ]),
    }
  }
  return renderGateCard(spec, ctx)
}

/**
 * Whether a slash command is one of the registered gate-resolving slashes
 * (used by `go-coordinator` / `session-gate` to spot the resolved evidence).
 * Pure whitelist so the runtime cannot confuse a customer typo with a gate
 * resolution.
 */
export function isGateResolvingCommand(command: string): boolean {
  if (command === '__noop__' || command === '__continued__') return false
  if (command === '/baf-scaffold') return true
  if (command === '/baf-workflow-resume') return true // dynamic-options gate
  if (command === '/baf-go') return true
  for (const [id, spec] of Object.entries(GATE_REGISTRY)) {
    if (id === 'resume') continue // dynamic — handled above
    for (const opt of spec.options) {
      if (opt.command === command) return true
    }
  }
  return false
}
