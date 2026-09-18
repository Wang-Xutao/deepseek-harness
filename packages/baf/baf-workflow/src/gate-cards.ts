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
  | 'intake-classify'
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
}

/** Dynamic option set — gate cards that derive options from projection. */
export type GateDynamicOptions =
  | 'resume-targets'

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
}

/** Stable headline for the collapsed card row. */
const HEADLINE = '需客户确认 · 请点击工作流页签按钮，或输入对应命令'

/** Single-line footer hint shown on every gate card. */
const FOOTER = '请点击工作流页签按钮，或输入对应命令'

/**
 * The canonical registry. Every gate the workflow ever offers must be
 * listed here. The model has read-only access to this map; it can never
 * add or remove options on its own.
 */
export const GATE_REGISTRY: Readonly<Record<GateId, GateSpec>> = {
  'scaffold': {
    id: 'scaffold',
    title: '工作区未初始化 · awaiting_customer_confirm',
    question: '当前工作区缺少 `.baf/baseline.yml` 与 `openspec/changes/` 目录。需要先做 init 骨架才能走工作流。',
    options: [
      { id: 'init', label: '初始化工作区（执行 scaffold）', command: '/baf-scaffold' },
      { id: 'cancel', label: '暂不初始化', command: '__noop__' },
    ],
  },
  'intake-classify': {
    id: 'intake-classify',
    title: 'intake 分类待确认 · awaiting_customer_confirm',
    question: 'intake 分类器已生成结果，请确认或拒绝后继续。',
    options: [
      { id: 'confirm', label: '确认分类', command: '/baf-workflow-classify', args: ['confirm'] },
      { id: 'reject', label: '拒绝并重新描述', command: '/baf-workflow-classify', args: ['reject'] },
    ],
  },
  'design-confirm': {
    id: 'design-confirm',
    title: '自动驱动 · 设计文档已完成 · awaiting_customer_confirm',
    question: 'N3 design 已实现。按 §18.5 门 A，必须由客户再敲一次 /baf-go 才能进入 plan。',
    options: [
      { id: 'confirm', label: '确认设计，进入计划', command: '/baf-go' },
      { id: 'back', label: '退回澄清', command: '/baf-workflow-clarify' },
    ],
  },
  'verify-archive': {
    id: 'verify-archive',
    title: '自动驱动 · verify 已通过 · awaiting_customer_confirm',
    question: 'N6 verify 全部必需检查通过。按 §18.5 门 B，必须由客户再敲一次 /baf-go 才能归档。',
    options: [
      { id: 'confirm', label: '确认归档', command: '/baf-go' },
      { id: 'back', label: '退回实现', command: '/baf-workflow-implement' },
    ],
  },
  'abandon': {
    id: 'abandon',
    title: '放弃变更 · awaiting_customer_confirm',
    question: '将放弃当前 active change 并保留审计。需要客户二次确认。',
    options: [
      { id: 'confirm', label: '确认放弃', command: '/baf-workflow-abandon', args: ['confirm'] },
      { id: 'cancel', label: '取消', command: '__noop__' },
    ],
  },
  'resume': {
    id: 'resume',
    title: 'drift detected · 请选择复位目标节点 · awaiting_customer_confirm',
    question: '工作流检测到漂移。请从候选集中选一个目标节点（斜杠命令携带节点名）。',
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
  if (spec.command === '__noop__') {
    return `${num} ${spec.label}    → （不动作，按 /baf-go 重弹卡）`
  }
  const invocation = spec.args === undefined || spec.args.length === 0
    ? spec.command
    : `${spec.command} ${spec.args.join(' ')}`
  const tail = spec.id === 'confirm' || spec.id === 'init' || spec.id === 'back'
    ? '（resolve 一次性，按钮即用）'
    : ''
  return changeId === undefined || spec.id === 'init'
    ? `${num} ${spec.label}    → ${invocation} ${tail}`.trimEnd()
    : `${num} ${spec.label}    → ${invocation} change=${changeId} ${tail}`.trimEnd()
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
      text: formatCommandReport(false, `${spec.title} · 缺少上下文`, [
        { title: '原因', lines: ['此门需要动态上下文（resume 候选 / change id），但 ctx 为空'] },
        { title: '处理', lines: ['从工作流 Tab 检查；或重跑 /baf-go 让 coordinator 重新计算'] },
      ]),
    }
  }

  return {
    kind: 'success',
    text: formatCommandReport(true, `${HEADLINE} · ${spec.title}`, sections),
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
      text: formatCommandReport(false, `未知确认门 ${JSON.stringify(gateId)} · unknown_gate`, [
        { title: '原因', lines: [`gateId 不在 §22 GATE_REGISTRY（合法值：${Object.keys(GATE_REGISTRY).join(' | ')}）`] },
        { title: '处理', lines: ['重跑 /baf-go 让协调器重算当前门；或查 /baf-help 的命令表'] },
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
  if (command === '__noop__') return false
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
