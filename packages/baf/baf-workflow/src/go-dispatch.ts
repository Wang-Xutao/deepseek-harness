/**
 * `/baf-go` work-order dispatch — the "one command runs the whole workflow"
 * half of §18.4.2.
 *
 * The problem this solves (2026-09-22 customer report, workspace `demo_1`,
 * change `change-20260922-ecum-7897`): the workflow has resting points where
 * the *next* move is the model authoring a template artifact — the advance-gate
 * click installs `clarify.md`, the doc-gate refusal names missing sections, the
 * implement card waits on `plan.json` tasks. Nothing at those points wakes the
 * model: the customer clicked 「推进」, `open` moved to `clarify`, and then
 * silence. `/baf-go` only re-rendered the same refusal card, which the customer
 * read as a crash. The customer's decision: **`/baf-go` must drive the whole
 * workflow — at every "waiting for the model" rest, typing it hands the model a
 * work order and the flow continues** (model fills the artifact → turn ends →
 * the orchestrator's turn-end gate pops the advance card → the customer clicks →
 * next stage).
 *
 * ## The red line this respects
 *
 * The four-fix teardown removed the *host* relaying messages into a session
 * without a customer action. This module is not that: a work order is sent
 * **only from a surface the customer acted on** — typing `/baf-go` or
 * `/baf-go-confirm`, clicking a gate-dialog option, clicking the Tab's
 * 「推进」/gate-card button (2026-09-23 user issue #1 widened the surface from
 * the typed slash alone: a gate confirm that advances into a template rest
 * must hand the model the order, or the click looks dead). Each such surface
 * stamps `source` as slash/gate-card/tab AND passes the `dispatchOrigin:
 * 'customer'` marker; the coordinator requires the marker, so host-internal
 * drives (the orchestrator's verify auto-drive), CLI scripts, and model tools
 * still cannot dispatch. The order itself is stamped `source.kind: 'plugin'`
 * with `form: 'go-dispatch'`, so the chat client renders it as a **read-only
 * context row** (no composer, no customer bubble, never editable, never
 * mistakable for the customer's own words). Dispatch is ask-side: it writes no
 * projection event, moves no state, and is not a gate resolution (§22.1
 * invariant 2).
 *
 * ## Dedupe
 *
 * The ledger is process-local and keyed `cwd | changeId | node | missing…`.
 * Typing `/baf-go` twice at an unchanged rest is a no-op (`deduped`) — the
 * model is already working on exactly that gap. A gap that *shrinks* (the model
 * filled some items) is a new key, i.e. a legitimate re-dispatch with a tighter
 * order. A host restart forgets the ledger and re-sends once; the order is
 * idempotent prose, so that is harmless by construction.
 *
 * @module @deepseek-ai/dsh-baf-workflow/go-dispatch
 */

import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import { ARTIFACT_FILES } from '@deepseek-ai/dsh-baf-openspec'
import { DOC_REQUIREMENTS_ZH } from './stages/gates.ts'
import { sharedHostSet } from './host-memory.ts'

/** The plugin id every work order is attributed to (`commands.ts` `name`). */
export const DISPATCH_PLUGIN = 'baf-commands'

/** Artifact-authoring stages a work order can address (`implement` edits the allowlist). */
export type DispatchNode = 'open' | 'clarify' | 'design' | 'plan' | 'implement'

/** One "the model must author this" rest, as the coordinator observes it. */
export interface DispatchSignal {
  /** Change the order is about. */
  readonly changeId: string
  /** Stage whose artifact is incomplete. */
  readonly node: DispatchNode
  /** Workspace-relative artifact path the order points at. */
  readonly artifactPath: string
  /** The gate's missing-item lines — the order's per-item work list. */
  readonly missing: readonly string[]
  /** Optional verification reason (the T11 fix loop). */
  readonly cause?: 'verify-failed'
}

/** What a dispatch attempt did. */
export type GoDispatchOutcome = 'sent' | 'deduped' | 'busy' | 'unavailable'

/**
 * 【变更】2026-09-23 (user issue #1): which customer action owns a dispatch.
 * `'customer'` marks every surface the customer acted on by hand — a typed
 * `/baf-go` or `/baf-go-confirm`, a gate-dialog option click, the Tab's
 * 「推进」/gate-card clicks. The coordinator refuses to dispatch without it,
 * so host-internal drives (the orchestrator's verify auto-drive, CLI scripts,
 * model tools) still cannot put an order in the customer's mouth.
 */
export type DispatchOrigin = 'customer'

/** One dispatch attempt against the addressed session. */
export type GoDispatch = (signal: DispatchSignal) => GoDispatchOutcome

/** The host agent face a dispatcher needs — `Agent.followup` + `Agent.status`. */
export interface DispatchAgent {
  /** Queue a user-role message into the next-turn inbox and wake the driver. */
  followup?(message: UserMessage): void
  /** Whether this agent already has active work (a turn in flight). */
  status?: 'idle' | 'running'
  /**
   * Structural read: the runtime agent carries `session.header.id`, which
   * scopes the dispatch ledger per session. `cwd` is declared so command-face
   * agent types (header with only cwd) stay structurally assignable. Absent
   * on test doubles.
   */
  readonly session?: { readonly header?: { readonly id?: unknown; readonly cwd?: unknown } }
}

/**
 * Ledger of dispatched gaps: `cwd | changeId | node | missing…`. A process
 * singleton, matching `session-focus.ts` / the orchestrator's `OFFERED` (all
 * three are host-plane memories that must not reach the log).
 *
 * 【变更】2026-09-23 (user issue #4): the ledger used to be a permanent Set —
 * once an order was sent for a gap, every later `/baf-go` at the same gap
 * answered 「已派单 · 等待补齐」 even after the dispatched turn had ENDED with
 * the gap still open (the model idled, nothing could wake it, and the
 * customer's only escape was free text). A dedupe now only means "this exact
 * order is already queued or in flight": the orchestrator forgets the ledger
 * for a workspace at every completed turn end, so the next `/baf-go`
 * re-dispatches with a fresh order — the model had its chance and did not
 * close the gap, so re-sending is the correct move, not spam.
 */
const SENT = sharedHostSet('go-dispatch/sent')

/** Forget every dispatched gap. Test seam only — a running host never calls this. */
export function resetDispatchLedger(): void {
  SENT.clear()
}

/**
 * Forget the ledger for one workspace — the completed-turn re-arm (issue #4).
 * Called by the orchestrator at every `turn/end` with the session's cwd: any
 * order sent before this turn has either been consumed by it or ignored by it,
 * and in both cases the customer's next `/baf-go` may dispatch again.
 * @param cwd - workspace root the ledger is scoped to.
 */
export function expireDispatchLedger(cwd: string): void {
  // Key shape: `sessionKey | cwd | changeId | node | missing…` — the cwd sits
  // in the second segment (session keys carry no '|').
  for (const key of SENT.keys()) {
    if (key.split('|')[1] === cwd) SENT.delete(key)
  }
}

/**
 * The workspace-relative artifact path for one dispatch node. `implement`'s
 * gate reads the ledger inside `plan.json` (task `done` flags + allowlist),
 * not `tasks.md`, so the order points the model at the file it will be
 * judged by.
 * @param changeId - change id.
 * @param node - dispatch stage.
 * @returns the workspace-relative path.
 */
export function artifactPathFor(changeId: string, node: DispatchNode): string {
  const file = node === 'open'
    ? ARTIFACT_FILES.proposal
    : node === 'clarify'
      ? ARTIFACT_FILES.clarify
      : node === 'design'
        ? ARTIFACT_FILES.design
        : ARTIFACT_FILES.planJson
  return `openspec/changes/${changeId}/${file}`
}

/**
 * The implement stage's pass conditions, quoted from `implementGate` (the doc
 * stages' prose table has no `implement` row — that stage's gate is the
 * ledger inside `plan.json`, not an article).
 */
const IMPLEMENT_REQUIREMENTS_ZH = [
  'plan.json 里每个任务的 done 标为 true（剩余任务做完并标记）',
  '改动文件全部在 plan.json 的 allowlist 内',
] as const

/**
 * The completion conditions the order restates. Implement quotes its own
 * ledger gate; every doc stage quotes {@link DOC_REQUIREMENTS_ZH}.
 * @param node - dispatch stage.
 * @returns the pass-condition lines.
 */
function requirementsFor(node: DispatchNode): readonly string[] {
  return node === 'implement' ? IMPLEMENT_REQUIREMENTS_ZH : DOC_REQUIREMENTS_ZH[node]
}

/**
 * Render one work order as model-facing text.
 *
 * The single content source is the gate's own `missing` list plus
 * {@link requirementsFor} — the order can never promise something the gate
 * does not check, because it quotes the gate. A requirement the `missing`
 * list already carries is not restated (the template-installed rest passes
 * the requirements as its work list, so the two lists coincide there).
 * @param signal - the observed gap.
 * @returns the order text.
 */
export function workOrderText(signal: DispatchSignal): string {
  const { changeId, node, artifactPath, missing, cause } = signal
  const conditions = requirementsFor(node).filter(line => !missing.includes(line))
  const head = cause === 'verify-failed'
    ? '【BAF 工单 · /baf-go 派单 · 验证未通过】'
    : '【BAF 工单 · /baf-go 派单】'
  return [
    head,
    `变更：${changeId}`,
    `阶段：${node}`,
    `产物：${artifactPath}`,
    '',
    missing.length === 0 ? '缺什么：产物未达该阶段裁决门' : '缺什么（逐项补齐）：',
    ...missing.map(line => `- ${line}`),
    ...(conditions.length === 0
      ? []
      : ['', '完成条件（裁决门）：', ...conditions.map(line => `- ${line}`)]),
    '',
    '执行要求：',
    '1. 直接编辑上方产物补齐，不要另建文件；',
    '2. 补齐后立即结束本回合——系统会在回合结束时自动弹出下一阶段裁决卡，无需你调用任何命令；',
    '3. 需要客户决策时调用 baf_question_ask，不要用文字向客户提问；',
    '4. 本工单由客户敲 /baf-go 生成（客户已授权），照单执行即可。',
  ].join('\n')
}

/**
 * Wrap one work order as the durable message a session receives. Never
 * `kind: 'user'`: the plugin source is what makes the client render a
 * read-only context row instead of a customer bubble.
 * @param signal - the observed gap.
 * @returns the identified, frozen user-role message.
 */
export function workOrderMessage(signal: DispatchSignal): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text: workOrderText(signal) }],
    source: {
      kind: 'plugin',
      plugin: DISPATCH_PLUGIN,
      form: 'go-dispatch',
      changeId: signal.changeId,
      node: signal.node,
      missing: [...signal.missing],
    },
  })
}

/** The ledger key for one gap — a shrinking `missing` list is a distinct gap. */
function ledgerKey(sessionKey: string, cwd: string, signal: DispatchSignal): string {
  return [sessionKey, cwd, signal.changeId, signal.node, signal.missing.join('\u0000')].join('|')
}

/**
 * Structural read of a dispatch agent's session id — the same shape
 * `gate-dialog.ts` reads. Agents without one (tests, structural doubles)
 * share the `'baf-unknown-session'` scope, which keeps the test semantics
 * unchanged.
 */
function sessionKeyOf(agent: DispatchAgent): string {
  const id = agent.session?.header?.id
  return typeof id === 'string' && id !== '' ? id : 'baf-unknown-session'
}

/**
 * Build the dispatcher for one session, or undefined when the host agent
 * cannot take a queued turn (`followup` absent — CLI/tests).
 *
 * 【变更】2026-09-23: the ledger is scoped per SESSION as well as workspace —
 * an order sent to session A (even one still parked on a question) must not
 * silence `/baf-go` in session B against the same gap.
 * @param cwd - workspace root (ledger scope).
 * @param agent - the addressed session's runtime agent.
 * @returns the dispatcher, or undefined.
 */
export function makeGoDispatcher(cwd: string, agent: DispatchAgent | undefined): GoDispatch | undefined {
  if (agent === undefined || agent.followup === undefined) return undefined
  const followup = agent.followup.bind(agent)
  const sessionKey = sessionKeyOf(agent)
  return (signal) => {
    // A turn is already in flight: the model is working, and a queued order
    // would only arrive after it finished — the customer's next /baf-go will
    // re-check the (then smaller) gap.
    if (agent.status === 'running') return 'busy'
    const key = ledgerKey(sessionKey, cwd, signal)
    if (SENT.has(key)) return 'deduped'
    followup(workOrderMessage(signal))
    SENT.add(key)
    return 'sent'
  }
}
