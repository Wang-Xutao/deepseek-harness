/**
 * §22.17 interactive gate dialog — the popup face of the §22 GATE_REGISTRY.
 *
 * The card text alone proved insufficient: a model that calls
 * `baf_gate_ask` sees only text come back and can falsely tell the customer
 * a confirmation dialog appeared. This module reuses the platform
 * `ctx.userQuestions` waterfall — the same channel the `ask_user_question`
 * tool uses — so a §22 gate surfaces as a real dialog the customer clicks.
 * The click is genuine human input, so it may resolve the gate (§22.1):
 * the chosen option is dispatched through `driveGateResolve` exactly like a
 * Tab button, and the dialog never invents a path outside the registry.
 *
 * Layering: this module is host-plane glue only (preset rows `baf-commands`
 * / `baf-gate-ask`). The coordinator (`go-coordinator.ts`) knows the popup
 * only through the abstract {@link GateAsk} channel, so the domain layer
 * stays free of any UI dependency and CLI/tests run unchanged without it.
 *
 * @module @deepseek-ai/dsh-baf-workflow/gate-dialog
 */

import type { Context } from '@deepseek-ai/cordis'
import type {
  AskUserQuestionAnswer,
  AskUserQuestionRequest,
} from '@deepseek-ai/dsh-user-questions'
import type {} from '@deepseek-ai/dsh-user-questions' // Context.userQuestions augmentation
import type { ChangeIntake, GuardPolicy, StackAdapter, WorkflowNode } from '@deepseek-ai/dsh-baf-core'
import { GATE_REGISTRY, type GateId, type GateOptionSpec, type GateSpec } from './gate-cards.ts'
import { modeZh } from './command-format.ts'
import { enqueueAsk } from './ask-queue.ts'
import { noteScaffoldDialogOffered } from './scaffold-offer.ts'
import type { DriveAdapters } from './command-drives.ts'
import { resolveIsolateService, resolveScaffoldService } from './session-gate.ts'
import type { GateAsk, GateAskOutcome } from './go-coordinator.ts'

/** The live agent the dialog is scoped to (`ask_user_question` pattern). */
export type GateDialogAgent = NonNullable<AskUserQuestionRequest['agent']>

/** Minimal structural view of `ctx.userQuestions` — no runtime dependency. */
interface UserQuestionsLike {
  ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer>
}

/**
 * The classifier's verdict shown on the intake-classify dialog (§22.17 I):
 * the customer confirms a judgment they can see, not a blind 「确认分类」.
 */
export type GateJudgment = Pick<ChangeIntake, 'mode' | 'kind' | 'summary' | 'confidence'>

/** Project an intake record into the dialog's judgment fields. */
export function judgmentOf(intake: ChangeIntake): GateJudgment {
  return { mode: intake.mode, kind: intake.kind, summary: intake.summary, confidence: intake.confidence }
}

/** Plain-Chinese label for a change kind id (registry vocabulary stays home). */
function kindZh(kind: string): string {
  switch (kind) {
    case 'new-requirement': return '新需求'
    case 'bug': return '缺陷'
    case 'maintenance': return '维护'
    default: return '待定'
  }
}

/**
 * §22.17 J — the bug-fix five fields `baf_gate_ask` gathers from the model,
 * shown on the classify dialog and spliced into the confirm dispatch so the
 * customer never pastes the long `/baf-workflow-classify confirm …` line.
 * Every field optional: partial drafts show partially, and a confirm click
 * with gaps returns the existing missing-fields card.
 */
export interface GateBugPlan {
  readonly problem?: string
  readonly rootCause?: string
  readonly files?: readonly string[]
  readonly test?: string
  readonly testCmd?: string
}

/** Whether any bug-fix field is present at all. */
export function hasBugField(plan: GateBugPlan): boolean {
  return plan.problem !== undefined || plan.rootCause !== undefined
    || (plan.files !== undefined && plan.files.length > 0)
    || plan.test !== undefined || plan.testCmd !== undefined
}

/**
 * Render the draft as one dialog paragraph. `；`-separated single paragraph:
 * the composer folds single newlines, so item-per-line would collapse.
 */
function bugPlanParagraph(plan: GateBugPlan): string {
  const parts: string[] = []
  if (plan.problem !== undefined) parts.push(`现象：${plan.problem}`)
  if (plan.rootCause !== undefined) parts.push(`根因：${plan.rootCause}`)
  if (plan.files !== undefined && plan.files.length > 0) parts.push(`涉及文件：${plan.files.join('、')}`)
  if (plan.test !== undefined) parts.push(`回归测试：${plan.test}`)
  if (plan.testCmd !== undefined) parts.push(`测试命令：${plan.testCmd}`)
  return `缺陷修复草案（模型整理，点「确认 · 缺陷修复路径」时一并提交）—— ${parts.join('；')}`
}

/**
 * Quote one value as a `key="value"` token the §12 tokenizer round-trips:
 * it strips quotes without escape support, so strip embedded quotes/newlines
 * first (bug prose survives; punctuation noise does not).
 */
function kv(key: string, value: string): string {
  const cleaned = value.replaceAll('"', ' ').replaceAll("'", ' ').replaceAll('\n', ' ').replaceAll('\r', ' ')
  return `${key}="${cleaned.trim()}"`
}

/** Build the confirm-dispatch extra args from a draft, or undefined when empty. */
export function bugPlanExtraArgs(plan: GateBugPlan | undefined): string[] | undefined {
  if (plan === undefined || !hasBugField(plan)) return undefined
  return [
    ...(plan.problem === undefined ? [] : [kv('problem', plan.problem)]),
    ...(plan.rootCause === undefined ? [] : [kv('root-cause', plan.rootCause)]),
    ...(plan.files ?? []).map(f => kv('file', f)),
    ...(plan.test === undefined ? [] : [kv('test', plan.test)]),
    ...(plan.testCmd === undefined ? [] : [kv('test-cmd', plan.testCmd)]),
  ]
}

/** Which gate a dialog pop is for. */
export interface GateDialogInput {
  readonly gateId: GateId
  readonly changeId?: string
  readonly resumeCandidates?: readonly WorkflowNode[]
  /** Bind gate — the active change ids this session could take over (§22.19 R4). */
  readonly bindCandidates?: readonly string[]
  /** §22.17 I: the intake classifier's verdict, shown under the question on the intake-classify dialog. */
  readonly judgment?: GateJudgment
  /** §22.17 J: the bug-fix field draft shown on the intake-classify dialog (see {@link GateBugPlan}). */
  readonly bugPlan?: GateBugPlan
  /**
   * 2026-09-21 (session 6.jsonl): extra plain-Chinese context paragraphs
   * rendered between the question and any judgment — e.g. the active-conflict
   * pop names the running change and the freshly stated requirement, so the
   * customer clicks knowing exactly what each option applies to. One entry per
   * paragraph (single newlines fold in the composer's markdown detail).
   */
  readonly note?: readonly string[]
}

/**
 * Resolve the `userQuestions` service for a host-plane preset row. The
 * service is published where the `tool-ask-user` row mounted it (same preset
 * entry tree), so the row ctx can see it; the receiving agent's realm is
 * tried first anyway — the same two-scope pattern `resolveScaffoldService`
 * uses — because a future composition may publish it per-agent.
 */
export function resolveUserQuestions(
  ctx: Context,
  agent?: { ctx?: Context },
): UserQuestionsLike | undefined {
  const scopes = agent?.ctx === undefined ? [ctx] : [agent.ctx, ctx]
  for (const scope of scopes) {
    try {
      const service = scope.get('userQuestions')
      if (service !== undefined) return service
    } catch {
      // Realm without the definition — try the next scope.
    }
  }
  return undefined
}

/** Tool-facing alias of {@link resolveUserQuestions} (same resolution, reads clearer at the call site). */
export function resolveUserQuestionsForTool(
  ctx: Context,
  agent: unknown,
): UserQuestionsLike | undefined {
  return resolveUserQuestions(
    ctx,
    agent === undefined ? undefined : agent as { ctx?: Context },
  )
}

/**
 * Adapters a dialog option dispatch may need, resolved the same way the
 * slash handlers do: stack/guard from the sibling quality/guard rows and the
 * scaffold service — all three sit in the baf-domain isolate, so every one
 * resolves through {@link resolveIsolateService} (agentPresets.serviceFor
 * first; plain get for non-isolate compositions). The scaffold service's own
 * `scaffold(opts)` method already satisfies the `ScaffoldAdapter` shape.
 */
export function toolDriveAdapters(ctx: Context, agent: unknown, cwd: string): DriveAdapters {
  const realm = agent as { ctx?: Context } | undefined
  const quality = resolveIsolateService<{ adapter(): StackAdapter }>(ctx, realm, 'bafQuality')
  const guard = resolveIsolateService<{ policy(root: string): GuardPolicy }>(ctx, realm, 'bafGuard')
  const scaffold = realm === undefined ? undefined : resolveScaffoldService(ctx, realm)
  return {
    ...(quality === undefined ? {} : { stack: quality.adapter() }),
    ...(guard === undefined ? {} : { guard: guard.policy(cwd) }),
    ...(scaffold === undefined ? {} : { scaffold }),
  }
}

/**
 * Build the coordinator's {@link GateAsk} channel from a host-plane ctx.
 * Returns undefined when no `userQuestions` service is mounted — callers
 * degrade to the plain §22 card (CLI / test compositions).
 *
 * @param ctx - preset-row context (the `baf-commands` / `baf-gate-ask` row).
 * @param agent - receiving agent; may be the runtime agent object.
 * @returns the popup channel, or undefined when no answerer can exist.
 */
export function makeGateAsk(ctx: Context, agent?: unknown): GateAsk | undefined {
  const service = resolveUserQuestions(
    ctx,
    agent === undefined ? undefined : agent as { ctx?: Context },
  )
  if (service === undefined) return undefined
  const dialogAgent = agent as GateDialogAgent | undefined
  // §22.19: coordinator pops ride the single-flight queue — the dialog can
  // no longer cover an in-flight auto-pop / gate-ask dialog on the same
  // session, and a re-pop of the same gate+change while one is up collapses
  // to a duplicate drop.
  return async gate => askGateDialogQueued(service, dialogAgent, gate)
}

/**
 * Structural read of a dialog agent's session id (the public Agent type is
 * id-only; the runtime object carries `session.header`).
 */
function sessionKeyOf(agent: GateDialogAgent | undefined): string {
  const id = (agent as { session?: { header?: { id?: unknown } } } | undefined)
    ?.session?.header?.id
  return typeof id === 'string' && id !== '' ? id : 'baf-unknown-session'
}

/** The queue identity of one gate pop: which gate, on which change. */
export function gateQueueKey(gate: GateDialogInput): string {
  return `gate:${gate.gateId}:${gate.changeId ?? ''}`
}

/**
 * Queue controls for {@link askGateDialogQueued} — everything the queue needs
 * beyond the dialog shape itself.
 */
export interface GateDialogQueueControls {
  /** Session scope; defaults to the agent's session id. */
  readonly sessionId?: string
  /** Head-of-queue staleness check (true → drop without popping). */
  readonly isMoot?: () => boolean | Promise<boolean>
  /** External abort (tool exec signal / agent disposal). */
  readonly signal?: AbortSignal
}

/**
 * §22.19 — pop one §22 gate dialog through the session's single-flight ask
 * queue. Same contract as {@link askGateDialog} plus the three queue guards
 * (dedupe / moot / abort). A dropped entry maps to the paused shape —
 * "already handled elsewhere or no longer due", never an answer.
 *
 * @param service - the resolved `ctx.userQuestions` service.
 * @param agent - live agent scoping the waterfall to this session's UI.
 * @param gate - which gate, with change id / resume candidates.
 * @param controls - queue scope + staleness + abort.
 * @returns the outcome; never throws — failures map to paused/unavailable.
 */
export async function askGateDialogQueued(
  service: UserQuestionsLike,
  agent: GateDialogAgent | undefined,
  gate: GateDialogInput,
  controls?: GateDialogQueueControls,
): Promise<GateAskOutcome> {
  const queueSession = controls?.sessionId ?? sessionKeyOf(agent)
  const outcome = await enqueueAsk({
    sessionId: queueSession,
    key: gateQueueKey(gate),
    // 【变更】2026-09-29 (demo23 问题 4): change-scoped metadata — a terminal
    // transition cancels the in-flight dialog of the change it ends, so the
    // session popup and the Tab banner die together instead of outliving the
    // workflow they were pushing.
    ...(gate.changeId === undefined ? {} : { changeId: gate.changeId }),
    ...(controls?.isMoot === undefined ? {} : { isMoot: controls.isMoot }),
    ...(controls?.signal === undefined ? {} : { signal: controls.signal }),
    run: controller => askGateDialog(service, agent, gate, controller.signal),
  })
  // 【变更】2026-09-23 (demo2 re-test): record the scaffold offer only AFTER
  // the pop settles, and only when a dialog actually rendered (or an
  // in-flight sibling owns one — it marks on its own settle). Recording at
  // enqueue time self-tripped the orchestrator's own head-of-queue moot
  // check; 'unavailable' (no dialog could show) and moot/abort drops
  // correctly leave the marker cold so the turn-end evaluation still fires.
  if (gate.gateId === 'scaffold'
    && (outcome.kind === 'answered' && outcome.value.kind !== 'unavailable'
      || outcome.kind === 'dropped' && outcome.reason === 'duplicate')) {
    noteScaffoldDialogOffered(queueSession)
  }
  if (outcome.kind === 'answered') return outcome.value
  return outcome.reason === 'aborted'
    ? { kind: 'paused', reason: 'cancelled' }
    : { kind: 'paused', reason: 'dismissed' }
}
/**
 * Options for one dialog — the same derivation `driveGateResolve` validates
 * against, so an answered label maps to an option id the dispatch accepts.
 */
function dialogOptions(gate: GateDialogInput): readonly GateOptionSpec[] {
  // Same partial-lookup cast `driveGateResolve` uses: callers may pass a
  // runtime string outside the registry, so the lookup is genuinely
  // `GateSpec | undefined` even though `Record<GateId, GateSpec>` types a
  // keyed access as total.
  const spec = (GATE_REGISTRY as Record<string, GateSpec | undefined>)[gate.gateId]
  if (spec === undefined) return []
  if (spec.dynamicOptions === 'resume-targets') {
    return (gate.resumeCandidates ?? []).map(node => ({
      id: `resume-${node}`,
      label: `复位到 ${node}`,
      command: '/baf-workflow-resume',
      args: [node],
    }))
  }
  if (spec.dynamicOptions === 'change-targets') {
    // Same derivation as `bindOptions` in gate-cards — the answered label must
    // map back to an option id `driveGateResolve` accepts.
    return (gate.bindCandidates ?? []).map(changeId => ({
      id: `bind-${changeId}`,
      label: `接手 ${changeId}`,
      command: '/baf-go',
      args: [`change=${changeId}`],
    }))
  }
  return spec.options
}

/**
 * 【变更】2026-09-28 (用户问题 1.5): the artifact rows a gate's 【产物】
 * section links — workspace-relative file names inside
 * `openspec/changes/<changeId>/`. Static per gate (the change id arrives per
 * pop); a gate absent from this table gets no artifact section.
 */
export interface GateArtifactSpec {
  /** File name inside the change directory. */
  readonly file: string
  /** Chinese row label. */
  readonly label: string
  /**
   * The dispatch node a REVISION work order targets (用户问题 1.7: the
   * revision input under the options). Absent = the gate's artifacts are not
   * model-revisable (none today).
   */
  readonly reviseNode?: 'open' | 'clarify' | 'design' | 'plan' | 'verify'
  /** `reviseNode`'s mode override (bug-fix open rest quotes the clipped conditions). */
  readonly reviseMode?: 'full-go-path' | 'bug-fix-path'
}

/**
 * 【变更】2026-09-28 (用户问题 1.5/1.7): per-gate artifact table. The list of
 * a gate's rows is also its revision capability: a gate present here shows
 * the artifact links AND the revision input; a gate absent here shows neither.
 * `verify-archive`'s revision overrides the artifact path (the dispatch
 * helper maps node `verify` → checklist.md, but this gate revises verify.md —
 * `reviseFile` wins when set).
 */
export const GATE_ARTIFACTS: Readonly<Partial<Record<GateId, readonly GateArtifactSpec[]>>> = {
  'open-advance': [{ file: 'proposal.md', label: '提案', reviseNode: 'open' }],
  // 【变更】2026-09-30 (demo31 问题 4): the bug-fix open artifact joins
  // proposal.md's slot — same doc type name as the full flow, clipped content.
  'bugfix-open-advance': [{ file: 'proposal.md', label: '提案', reviseNode: 'open', reviseMode: 'bug-fix-path' }],
  'clarify-advance': [{ file: 'clarify.md', label: '澄清文档', reviseNode: 'clarify' }],
  'design-advance': [{ file: 'design.md', label: '设计文档', reviseNode: 'design' }],
  'design-confirm': [{ file: 'design.md', label: '设计文档', reviseNode: 'design' }],
  'plan-advance': [
    { file: 'plan.json', label: '计划（任务账本）', reviseNode: 'plan' },
    { file: 'tasks.md', label: '任务清单（随计划生成）' },
  ],
  'verify-advance': [{ file: 'checklist.md', label: '验证检查单', reviseNode: 'verify' }],
  'verify-archive': [
    { file: 'verify.md', label: '验收文档', reviseNode: 'verify' },
    { file: 'checklist.md', label: '验证检查单' },
  ],
}

/**
 * 【变更】2026-09-28 (用户问题 1.7): the revision work-order target for one
 * gate — the node the order dispatches to plus the artifact path it names.
 * `verify` normally maps to checklist.md (the dispatch table's rule); the
 * `file` of the FIRST revise-capable row wins instead, so verify-archive's
 * revision points at verify.md.
 * @param gateId - the gate the revision came from.
 * @returns the dispatch target, or undefined for non-revisable gates.
 */
export function gateRevisionTarget(
  gateId: GateId,
  changeId: string,
): { node: 'open' | 'clarify' | 'design' | 'plan' | 'verify'; artifactPath: string; mode?: 'full-go-path' | 'bug-fix-path' } | undefined {
  const rows = GATE_ARTIFACTS[gateId]
  const revisable = rows?.find(row => row.reviseNode !== undefined)
  if (revisable === undefined || revisable.reviseNode === undefined) return undefined
  return {
    node: revisable.reviseNode,
    artifactPath: `openspec/changes/${changeId}/${revisable.file}`,
    ...(revisable.reviseMode === undefined ? {} : { mode: revisable.reviseMode }),
  }
}

/**
 * 【变更】2026-09-28 (用户问题 1.7 Tab parity): the advance gate id for a
 * completed stage — the workflow Tab's advance dialog has no gate id of its
 * own, so its revision input maps the resting stage back to the gate whose
 * artifact table names the revisable document (implement → verify-advance:
 * the artifact that stage just produced is the checklist).
 * @param node - the completed stage the Tab rests on.
 * @param mode - the change's mode (bug-fix open quotes the clipped conditions).
 * @returns the gate id, or undefined for stages with no revisable artifact.
 */
export function advanceGateIdForNode(
  node: string,
  mode?: string,
): GateId | undefined {
  if (node === 'open') return mode === 'bug-fix-path' ? 'bugfix-open-advance' : 'open-advance'
  if (node === 'clarify') return 'clarify-advance'
  if (node === 'design') return 'design-advance'
  if (node === 'plan') return 'plan-advance'
  if (node === 'implement') return 'verify-advance'
  return undefined
}

/**
 * 【变更】2026-09-28 (用户问题 1.5): the 【产物】 section appended to a gate's
 * detail — one `- {{art:<path>}} <label>` line per artifact row. The client
 * parses the `{{art:…}}` token into a clickable chip (opens the file in the
 * right sidebar / artifact rail); surfaces without a parser (CLI, the plain
 * text card) see the path verbatim, which still names the file honestly.
 */
function artifactSection(gateId: GateId, changeId: string): string | undefined {
  const rows = GATE_ARTIFACTS[gateId]
  if (rows === undefined || rows.length === 0) return undefined
  return ['【产物】', ...rows.map(row => `- {{art:openspec/changes/${changeId}/${row.file}}} ${row.label}`)]
    .join('\n')
}

/** One sentence under an option button: what clicking it will run. */
function optionDescription(opt: GateOptionSpec, changeId: string | undefined): string {
  if (opt.hint !== undefined) return opt.hint
  // 【变更】2026-09-28 (用户问题 1.3): the dismiss hint names the revive
  // command as CUSTOMER copy — it rides the wire on purpose (the client's
  // hint filter no longer drops /baf- mentions).
  if (opt.command === '__noop__') return '工作流暂停；需要继续时再敲一次 /baf-go'
  const invocation = [opt.command, ...(opt.args ?? [])].join(' ')
  return changeId === undefined || opt.id === 'init'
    ? `将执行 ${invocation}`
    : `将执行 ${invocation} change=${changeId}`
}

/** Best-effort error code read (UserQuestionError carries `code`). */
function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string') return code
  }
  return undefined
}

/**
 * Pop one §22 gate dialog and wait for the customer's choice.
 *
 * @param service - the resolved `ctx.userQuestions` service.
 * @param agent - live agent scoping the waterfall to this session's UI.
 * @param gate - which gate, with change id / resume candidates.
 * @param signal - optional abort (the tool forwards its exec signal).
 * @returns the outcome; never throws — failures map to paused/unavailable.
 */
export async function askGateDialog(
  service: UserQuestionsLike,
  agent: GateDialogAgent | undefined,
  gate: GateDialogInput,
  signal?: AbortSignal,
): Promise<GateAskOutcome> {
  const spec = (GATE_REGISTRY as Record<string, GateSpec | undefined>)[gate.gateId]
  if (spec === undefined) return { kind: 'unavailable', reason: `unknown gate ${gate.gateId}` }
  const options = dialogOptions(gate)
  if (options.length === 0) {
    return { kind: 'unavailable', reason: 'gate has no options to offer' }
  }
  const labels = new Set(options.map(o => o.label))
  if (labels.size !== options.length) {
    return { kind: 'unavailable', reason: 'gate option labels are not unique' }
  }
  // §22.17 I: with a judgment the dialog shows the classifier's verdict as
  // its own paragraph — the customer confirms a visible path (完整流程 /
  // 缺陷修复路径), not a blind 「确认分类」. Paragraph breaks, not single
  // newlines: the composer renders the detail as markdown, where a lone \n
  // folds into one running line.
  // 【变更】2026-09-28 (用户问题 1.2/1.5): the change id rides the wire as a
  // `{{change:…}}` FIRST line the client parses into the top-right chip (no
  // longer embedded in the question prose), and revisable gates append a
  // 【产物】 section whose `{{art:…}}` tokens render as openable links.
  const artifact = gate.changeId === undefined ? undefined : artifactSection(gate.gateId, gate.changeId)
  const detail = [
    ...(gate.changeId === undefined ? [] : [`{{change:${gate.changeId}}}`]),
    spec.question,
    ...(gate.note ?? []),
    ...(gate.judgment === undefined ? [] : [
      `系统初步判断：${modeZh(gate.judgment.mode)} · ${kindZh(gate.judgment.kind)} · 置信 ${gate.judgment.confidence.toFixed(2)}`,
      `需求摘要：${gate.judgment.summary}`,
    ]),
    ...(gate.bugPlan !== undefined && hasBugField(gate.bugPlan) ? [bugPlanParagraph(gate.bugPlan)] : []),
    ...(artifact === undefined ? [] : [artifact]),
  ].join('\n\n')
  let answer: AskUserQuestionAnswer
  try {
    answer = await service.ask({
      questions: [{
        id: gate.gateId,
        question: spec.title,
        detail,
        header: 'BAF 工作流',
        options: options.map(o => ({ label: o.label, description: optionDescription(o, gate.changeId) })),
      }],
      ...(agent === undefined ? {} : { agent }),
      ...(signal === undefined ? {} : { signal }),
    })
  } catch (error) {
    // X-button / abort = the customer walked away → paused, not a failure.
    // No answerer / wrong caller context = no dialog could ever show → the
    // caller degrades to the plain card.
    const code = errorCode(error)
    if (code === 'ASK_CANCELLED' || code === 'ASK_ABORTED') return { kind: 'paused', reason: 'cancelled' }
    return { kind: 'unavailable', reason: code ?? 'ask failed' }
  }
  const item = answer.answers[0]
  const label = item?.selected[0]
  // 【变更】2026-09-28 (用户问题 1.7 修改意见): free text submitted through the
  // revision input answers with the platform's `custom` field (selected is
  // empty). That is a REVISION request, not an option click — return it as
  // such and let the coordinator dispatch the revision work order; the gate
  // re-pops (fingerprint re-armed by the artifact edit) after the model
  // revises, closing the iterate-until-confirmed loop. Gates with no
  // revisable artifact (scaffold, classify, conflict — their cards render no
  // revision input) keep the closed-set semantics: free text is a non-answer.
  const custom = typeof item?.custom === 'string' ? item.custom.trim() : ''
  if (custom !== '' && gateRevisionTarget(gate.gateId, gate.changeId ?? '') !== undefined) {
    return { kind: 'revise', text: custom }
  }
  if (label === undefined) {
    // Skip button, or custom text the fixed registry cannot accept — a §22
    // gate offers a closed option set, so free text is a non-answer.
    return { kind: 'paused', reason: 'skipped' }
  }
  const opt = options.find(o => o.label === label)
  if (opt === undefined) return { kind: 'paused', reason: 'skipped' }
  if (opt.command === '__noop__') return { kind: 'paused', reason: 'dismissed' }
  return { kind: 'answered', optionId: opt.id, label: opt.label }
}
