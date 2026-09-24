/**
 * `baf-go` coordinator (§18): the single entry that pushes a session to the
 * next point requiring a customer action, then renders that point's card.
 *
 * `driveGo` is a **pure router**. It never re-implements a transition rule —
 * the state machine stays `WorkflowService` + the §5.2 transition table, and
 * every stage move goes through the existing `StagePipeline` entry points.
 * What it adds is three things no single drive can do:
 *
 * 1. **Binding** (§18.3 / §18.6): decide which change this session is about
 *    before anything else, and refuse to open a second active change here.
 * 2. **Chaining** (§18.4): keep moving while the next step needs no
 *    model-authored content, so the customer types `baf-go` once per decision
 *    point instead of once per stage.
 * 3. **The two mandatory confirmation gates** (§18.5 / §22.17): stop after
 *    design and again after verify. With a popup channel (desktop GUI) both
 *    the park and any re-run of `/baf-go` surface the §22 interactive dialog;
 *    `/baf-go-confirm` takes the positive path directly, and where no popup
 *    channel exists (CLI / tests) the legacy rule holds — the customer
 *    typing `baf go` again *is* the confirmation.
 *
 * Idempotent throughout: re-running on a resting point re-renders its card and
 * writes nothing.
 *
 * @module @deepseek-ai/dsh-baf-workflow/go-coordinator
 */

import type { CommandResult } from '@deepseek-ai/dsh-commands'
import {
  isBafError,
  type AwaitingConfirmSnapshot,
  type ConfirmGate,
  type ProjectionEvent,
  type TransitionSource,
  type WorkflowNode,
  type WorkflowStatus,
} from '@deepseek-ai/dsh-baf-core'
import { ProjectionStore } from './projection.ts'
import { isActiveChange } from './projection.ts'
import { StagePipeline } from './stages/pipeline.ts'
import { DOC_REQUIREMENTS_ZH, implementGate, proposalGate } from './stages/gates.ts'
import { ARTIFACT_FILES } from '@deepseek-ai/dsh-baf-openspec'
import { readLedger } from './stages/implement.ts'
import { formatCommandReport } from './command-format.ts'
import { parseArgs, valueOf } from './cli-args.ts'
import {
  cardTitle,
  driveClassify,
  driveGateResolve,
  driveResume,
  driveScaffold,
  loadWorkspaceBaseline,
  pipelineFor,
  renderDomainError,
  statusLines,
  type DriveAdapters,
} from './command-drives.ts'
import { beginIntake } from './begin-intake.ts'
import { GATE_REGISTRY, renderGate, type GateId, type GateSpec } from './gate-cards.ts'
import { judgmentOf } from './gate-dialog.ts'
import type { GateJudgment } from './gate-dialog.ts'
import { artifactPathFor } from './go-dispatch.ts'
import type { DispatchNode, DispatchOrigin, DispatchSignal, GoDispatch, GoDispatchOutcome } from './go-dispatch.ts'
import type { FocusStore } from './session-focus.ts'

/** Node names `baf-go` accepts as an explicit drift-resume target. */
const RESUME_TARGETS: readonly WorkflowNode[] = ['clarify', 'design', 'plan', 'implement', 'verify']

/** Words that carry no requirement text of their own. */
const FILLER = new Set(['go', 'continue', 'resume', 'next'])

export type { FocusStore }

/** Options for {@link driveGo}. */
export interface GoInput {
  /** Workspace root the session is bound to. */
  readonly cwd: string
  /**
   * Edge form (§18.2 / §21.3): a requirement supplied alongside the command.
   * Empty for the primary form. Only meaningful while unbound — a bound
   * session answers a new requirement with the §18.6 guard refusal.
   */
  readonly rawInput?: string
  /** Stack/guard adapters for the verify + quality wiring. */
  readonly adapters?: DriveAdapters
  /** Session focus cache; omitted in CLI/test contexts (no session). */
  readonly focus?: FocusStore
  /** Origin of the drive (§22.15 B convention). */
  readonly source?: TransitionSource
  /**
   * §22.17 popup channel (host-plane `gate-dialog.ts`). Present only on the
   * GUI slash surface; the coordinator pops it at each park point and
   * dispatches the answered option through `driveGateResolve`. Undefined in
   * CLI/tests — everything degrades to the plain §22 card.
   */
  readonly ask?: GateAsk
  /**
   * `/baf-go-confirm` mode: take the positive path at whichever gate the
   * workspace/change rests on (scaffold init, intake confirm, gates A/B
   * unlock) without popping any dialog. Drift keeps asking — §19 forbids
   * auto-picking a rollback target.
   */
  readonly confirm?: boolean
  /**
   * §18.4.2 work-order channel (2026-09-22 customer decision): at every rest
   * where the *model* must author an artifact, the coordinator hands the
   * session a read-only order naming the gap, waking it to fill the file.
   * Produced only from a live agent (`makeGoDispatcher` in `commands.ts`, the
   * orchestrator's gate resolution, the Tab remotes), so CLI/CLI-smoke/tests
   * pass nothing and every card degrades to exactly its pre-dispatch text.
   */
  readonly dispatch?: GoDispatch
  /**
   * 【变更】2026-09-23 (user issue #1): marks the calling surface as a
   * customer action (typed slash, gate-dialog click, Tab button click).
   * Dispatch requires this marker — `dispatch` without an origin is inert, so
   * host-internal re-drives (the orchestrator's verify auto-drive) can never
   * put an order in the customer's mouth even though they reuse the same
   * `driveGo` surface. `/baf-go-confirm` may now dispatch too: the customer
   * typed it, so its confirm path is as customer-origin as `/baf-go`'s.
   */
  readonly dispatchOrigin?: DispatchOrigin
}

/**
 * One §22 popup outcome (§22.17). `answered` carries the registry option id
 * the customer clicked; `paused` means they closed/skipped/dismissed the
 * dialog (the workflow stays parked); `unavailable` means no dialog could
 * ever show (no answerer), so the caller degrades to the plain card.
 */
export type GateAskOutcome =
  | { readonly kind: 'answered'; readonly optionId: string; readonly label: string }
  | { readonly kind: 'paused'; readonly reason: 'dismissed' | 'cancelled' | 'skipped' }
  | { readonly kind: 'unavailable'; readonly reason: string }

/** The popup channel `go-coordinator` consumes — implemented by `gate-dialog.ts`. */
export type GateAsk = (gate: {
  readonly gateId: GateId
  readonly changeId?: string
  readonly resumeCandidates?: readonly WorkflowNode[]
  /** Bind gate — the active change ids this session could take over (§22.19 R4). */
  readonly bindCandidates?: readonly string[]
  /** Extra context paragraphs shown on the dialog (§22.18 note pattern). */
  readonly note?: readonly string[]
  /** §22.17 I: the intake classifier's verdict, shown on the intake-classify dialog. */
  readonly judgment?: GateJudgment
}) => Promise<GateAskOutcome>

/** One row of the projection index, as far as routing cares. */
interface ActiveRow {
  readonly changeId: string
  readonly current: string
  readonly updatedAt: string
}

/** A card section. */
interface Section {
  readonly title: string
  readonly lines: readonly string[]
}

/**
 * `baf-go` — push the current session to its next customer-action point.
 * @param input - workspace, optional requirement, adapters, focus cache.
 * @returns the card for whatever point the session now rests on.
 */
export async function driveGo(input: GoInput): Promise<CommandResult> {
  const { cwd } = input
  try {
    // §22.17: an uninitialized workspace has exactly one legal next step —
    // the scaffold gate. `/baf-go` pops it (so 暂不初始化 is reversible by
    // typing /baf-go again), `/baf-go-confirm` initializes directly, and
    // without a popup channel the §22 card renders instead of the old
    // misleading "没有进行中的工作流".
    if (await loadWorkspaceBaseline(cwd) === undefined) {
      if (input.confirm === true) return driveScaffold(cwd, input.adapters ?? {})
      const card = renderGate('scaffold', { cwd })
      if (input.ask === undefined) return card
      const resolved = await resolveViaDialog({ ask: input.ask, cwd, adapters: input.adapters ?? {} }, { gateId: 'scaffold' })
      return resolved ?? withContinueHint(card)
    }

    const store = new ProjectionStore({ workspaceRoot: cwd })
    const args = parseArgs(input.rawInput ?? '')
    const gateArg = valueOf(args, 'gate')
    const resumeTarget = args.positionals.find(p => RESUME_TARGETS.includes(p as WorkflowNode)) as
      | WorkflowNode
      | undefined
    const requirement = args.positionals
      .filter(p => !FILLER.has(p) && !RESUME_TARGETS.includes(p as WorkflowNode))
      .join(' ')
      .trim()

    // §18.6: binding comes first. No stage may move on an unbound session.
    const index = await store.readIndex()
    const actives: ActiveRow[] = index.changes.filter(isActiveChange)
    const explicit = valueOf(args, 'change')
    const focused = input.focus?.get()

    // §18.2 edge form: unbound, nothing active, and the customer stated a
    // requirement — that statement *is* the new work, so it goes straight to
    // the intake classifier (no `baf-go + 需求` ceremony). §22.19: the mint
    // runs through the single entry, which re-checks actives under its
    // per-cwd lock — a change that appeared between the readIndex above and
    // this mint now converges ('reused' / refusal card) instead of creating
    // the session-7 twin. The change it maps to becomes this session's
    // focus: it was created by this conversation, so binding it is recording
    // a fact, not the §18.6.4 kind of guessing.
    if (focused === undefined && actives.length === 0 && explicit === undefined
      && requirement !== '') {
      const outcome = await beginIntake(cwd, requirement)
      if (outcome.kind === 'minted' || outcome.kind === 'reused') {
        input.focus?.set(outcome.changeId)
      }
      return outcome.card
    }

    const binding = resolveBinding({
      actives,
      known: index.changes.map(c => c.changeId),
      focused,
      explicit,
      requirement,
    })
    if (binding.kind === 'stop') return binding.card
    // §22.19 R4: multi-active binding is a registered gate, not prose. With a
    // popup channel the coordinator pops `bind-workflow` (candidates =
    // actives); the click re-dispatches the same `/baf-go change=<id>` the
    // text card advertised, through the same single resolution surface as
    // every other gate. Paused → the stop card with the revive hint; no
    // answerer → the stop card exactly as before (CLI / tests).
    if (binding.kind === 'choose') {
      if (input.ask !== undefined) {
        const candidates = binding.actives.map(a => a.changeId)
        const outcome = await input.ask({
          gateId: 'bind-workflow',
          bindCandidates: candidates,
          note: [
            `当前未完成的变更（共 ${binding.actives.length} 条）：`,
            ...listActives(binding.actives),
            '其余变更不受影响，保持原状；之后仍可用 /baf-go change=<changeId> 换绑。',
          ],
        })
        // The option id must map back to a live candidate — a bogus answer
        // degrades to the stop card instead of binding a guess.
        const picked = outcome.kind === 'answered'
          ? candidates.find(id => `bind-${id}` === outcome.optionId)
          : undefined
        if (picked !== undefined) {
          // The inner `/baf-go change=<picked>` dispatch carries no focus
          // cache of this session, so the binding is recorded here — the
          // next plain /baf-go from this session must not pop again.
          input.focus?.set(picked)
          return driveGateResolve(cwd, 'bind-workflow', `bind-${picked}`, input.adapters ?? {}, undefined, candidates, 'gate-card', {
            // 2026-09-23 issue #1: the bind pick is a customer click — the
            // re-dispatched /baf-go may dispatch an order at the picked
            // change's authoring rest.
            ...(input.dispatch === undefined ? {} : { dispatch: input.dispatch }),
          })
        }
        return withContinueHint(binding.card)
      }
      return binding.card
    }
    input.focus?.set(binding.changeId)

    const pipeline = await pipelineFor(cwd, input.adapters ?? {})
    const context: RouteContext = {
      cwd,
      store,
      pipeline,
      changeId: binding.changeId,
      resumeTarget,
      source: input.source ?? 'slash',
      adapters: input.adapters ?? {},
      ...(input.ask === undefined ? {} : { ask: input.ask }),
      ...(input.dispatch === undefined ? {} : { dispatch: input.dispatch }),
      ...(input.dispatchOrigin === undefined ? {} : { dispatchOrigin: input.dispatchOrigin }),
      confirm: input.confirm === true,
    }
    // `/baf-go gate=<id>` (2026-09-21 user request: 回到指定确认门) — explicit
    // re-pop of one registered gate instead of the coordinator's state-derived
    // routing. Validated against the change's live resting point below.
    if (gateArg !== undefined) return await explicitGate(context, gateArg)
    return await route(context)
  } catch (error) {
    return renderDomainError('/baf-go', error)
  }
}

/**
 * Decide which change this session is about (§18.3.1, §18.4.1, §18.6).
 *
 * A lone active change binds directly. The workspace invariant is exactly one
 * active change per cwd, so there is nothing to guess — the original
 * "continue is an explicit word" rule (§18.6.4) made the workflow unpushable
 * from every surface that mints or outlives a session focus change
 * (`baf_gate_ask` bootstrap, auto-pop, Tab, a host restart: the focus cache is
 * process-local): `/baf-go` and `/baf-go-confirm` both stopped on a selection
 * card whose only escape was a word the customer had no reason to know
 * (2026-09-20 incident 3.jsonl). The multi-candidate case returns `choose` —
 * a workspace-scope §22.19 gate the caller pops when a dialog channel exists
 * — and a requirement stated beside an active change is still refused
 * (§18.6 guard 5, checked by the caller before this runs).
 * @param input - binding inputs.
 * @returns bound change id, the card that must be shown instead, or the
 *   candidate set the bind-workflow gate must offer.
 */
function resolveBinding(input: {
  readonly actives: readonly ActiveRow[]
  readonly known: readonly string[]
  readonly focused: string | undefined
  readonly explicit: string | undefined
  readonly requirement: string
}): { kind: 'bound'; changeId: string } | { kind: 'stop'; card: CommandResult }
  | { kind: 'choose'; actives: readonly ActiveRow[]; card: CommandResult } {
  const { actives, known, focused, explicit, requirement } = input

  // Explicit selection always wins — the §5.6 / §18.6.4 "customer chooses"
  // principle, and the advertised way out of the multi-candidate branch.
  if (explicit !== undefined) {
    const hit = actives.find(c => c.changeId === explicit)
    if (hit !== undefined) return { kind: 'bound', changeId: hit.changeId }
    return {
      kind: 'stop',
      card: errorCard('指定变更不可用', [
        { title: '原因', lines: [`${explicit} 不存在或已是终态`] },
        { title: '活动变更', lines: listActives(actives) },
      ]),
    }
  }

  // A requirement passed *to `baf-go`* is the §18.2 "start new work" signal,
  // so it is refused whenever a change is still active (§18.6 guard 5) — this
  // is checked before the focus, because a focus must not turn a new-work
  // signal into silent supplementary input for the change already running.
  // Context for the running change is stated to the *model* in the
  // conversation, not on this command line.
  if (requirement !== '' && actives.length > 0) {
    return {
      kind: 'stop',
      card: errorCard('本会话已有工作流', [
        { title: '原因', lines: ['一个会话只承载一条工作流；不能在同一会话里改换需求'] },
        { title: '当前活动变更', lines: listActives(actives) },
        {
          title: '处理',
          lines: [
            '继续这条：/baf-go continue（补充说明直接对模型说即可，它作用于当前变更）',
            '换一条：新开一个会话；或先 /baf-workflow-abandon confirm 收尾旧的',
          ],
        },
      ]),
    }
  }

  // A focused change that is still ACTIVE binds without further ado.
  if (focused !== undefined && actives.some(c => c.changeId === focused)) {
    return { kind: 'bound', changeId: focused }
  }

  // 【变更】2026-09-23 (user issue #4): a focused change that has since gone
  // TERMINAL must not bind while another change is still active — the focus
  // cache is process-local and outlives the change (a completed walk, an
  // abandon on another surface), and the old rule dead-ended every later
  // `/baf-go` on 「当前变更已终态」 while `/baf-status` happily reported the
  // active change (lexical-last pick), so the flow only revived on free text.
  // The terminal focus binds only when NOTHING is left to drive: §18.4.2
  // wants the "already terminal" card there, not the "nothing unfinished"
  // one — the customer needs to know the workflow they were driving ended.
  if (focused !== undefined && known.includes(focused) && actives.length === 0) {
    return { kind: 'bound', changeId: focused }
  }

  if (actives.length === 0) {
    // Unbound with nothing active and no requirement: nothing to drive.
    return {
      kind: 'stop',
      card: successCard('没有进行中的工作流', [
        {
          title: '下一步',
          lines: ['直接描述你的需求即可，分类卡会自动弹出', '（不需要写 /baf-go + 需求）'],
        },
      ]),
    }
  }

  if (actives.length === 1) {
    const only = actives[0]
    if (only === undefined) throw new Error('unreachable: actives.length === 1 with no element')
    return { kind: 'bound', changeId: only.changeId }
  }

  // Only reachable with ≥2 actives (a lone active bound above). The cwd-wide
  // invariant is one active change, so this is an operator-cleaned-up mess;
  // the customer names the change explicitly rather than us guessing. The
  // stop card is the no-dialog rendering (and the paused fallback); with a
  // popup channel the caller offers the same choice as the bind-workflow
  // gate — the card's `/baf-go change=<changeId>` hint and the dialog's
  // click dispatch the identical command.
  const chooseCard = errorCard('请选择本会话的工作流', [
    { title: '检测到未完成工作流', lines: listActives(actives) },
    {
      title: '选择',
      lines: ['/baf-go change=<changeId>    指定本会话的工作流'],
    },
    {
      title: '新开',
      lines: ['cwd 仍有未终态变更：先收尾（/baf-workflow-abandon confirm）或另开会话'],
    },
  ])
  return { kind: 'choose', actives, card: chooseCard }
}

/** Everything `route` needs beyond the bound change — one bag so the verify re-route can pass it through. */
interface RouteContext {
  readonly cwd: string
  readonly store: ProjectionStore
  readonly pipeline: StagePipeline
  readonly changeId: string
  readonly resumeTarget: WorkflowNode | undefined
  readonly source: TransitionSource
  readonly adapters: DriveAdapters
  /** §22.17 popup channel; absent on CLI/tests. */
  readonly ask?: GateAsk
  /** §18.4.2 work-order channel; absent unless the caller built one. */
  readonly dispatch?: GoDispatch
  /** 2026-09-23 issue #1: present only on customer-action surfaces. */
  readonly dispatchOrigin?: DispatchOrigin
  /** `/baf-go-confirm` mode: take the positive path without popping. */
  readonly confirm: boolean
}

/**
 * Route a bound change to its next action (§18.4.2).
 *
 * Chaining rule: keep moving while the next step needs no model-authored
 * content, and stop at the first point that needs either the model (authoring
 * a template) or the customer (a confirmation gate, a choice, a fix).
 * @param context - bound routing context.
 * @returns the card for the resting point.
 */
async function route(context: RouteContext): Promise<CommandResult> {
  const { cwd, store, pipeline, changeId, resumeTarget, source } = context
  const status = await store.readStatus(changeId)
  const at = (n: WorkflowNode): string | undefined => status.nodes[n]
  // `status.current` is already a `WorkflowNode`; the local exists to give the
  // switch below a stable narrowing target without re-reading it four times.
  const node = status.current

  if (status.terminal !== undefined) {
    return errorCard('当前变更已终态', [
      { title: '原因', lines: [`terminal: ${status.terminal}`] },
      { title: '下一步', lines: ['新需求请在新会话中提出（一个会话一条工作流）'] },
    ])
  }

  // §19: drift never resolves itself. Hand over to the resume flow — the
  // customer names the rollback node, or reads the candidate set first.
  // Auto-picking it would silently invalidate completed work — including in
  // `/baf-go-confirm` mode, so confirm only upgrades the card with the
  // continue hint, never picks a node.
  if (node === 'drift') {
    if (resumeTarget === undefined && context.ask !== undefined) {
      const options = await pipeline.resumeOptions(changeId)
      if (options.status.current === 'drift' && options.candidates.length > 0) {
        const resolved = await resolveViaDialog(context, {
          gateId: 'resume',
          changeId,
          resumeCandidates: options.candidates,
        })
        if (resolved !== undefined) return resolved
        return withContinueHint(await driveResume(cwd, `change=${changeId}`, source))
      }
    }
    const forward = resumeTarget === undefined ? '' : ` ${resumeTarget}`
    return driveResume(cwd, `change=${changeId}${forward}`, source)
  }

  switch (node) {
    case 'intake': {
      // Not yet confirmed → (re)surface the classification card (§18.4.1).
      // The card's own 确认/补充/退出 is where that decision is made; plain
      // `baf-go` only replays it (§18.2 reserves "baf-go means confirm" for
      // the two gates), while a popup channel (§22.17) or `/baf-go-confirm`
      // can settle it right here — the click/confirm is customer input.
      if (status.intake?.confirmation !== 'confirmed') {
        if (context.confirm) {
          return driveClassify(cwd, `confirm change=${changeId}`, source)
        }
        if (context.ask !== undefined) {
          // §22.17 I: the dialog carries the classifier's verdict so the
          // click confirms a visible path, not a blind 「确认分类」.
          const resolved = await resolveViaDialog(context, {
            gateId: 'intake-classify',
            changeId,
            ...(status.intake === undefined ? {} : { judgment: judgmentOf(status.intake) }),
          })
          if (resolved !== undefined) return resolved
          return withContinueHint(await driveClassify(cwd, `change=${changeId}`, source))
        }
        return driveClassify(cwd, `change=${changeId}`, source)
      }
      // Confirmed on the unresolved `clarify-required` verdict (legacy logs:
      // confirm-without-mode used to be reachable): no transition rule can
      // fire on that mode, so the classify gate is still the live decision —
      // pop it (or render its card); every option carries `mode=`, and
      // `setIntakeMode` accepts the override for exactly this state.
      if (status.intake?.mode === 'clarify-required') {
        const card = renderGate('intake-classify', { cwd, changeId })
        if (context.ask !== undefined) {
          const resolved = await resolveViaDialog(context, {
            gateId: 'intake-classify',
            changeId,
            judgment: judgmentOf(status.intake),
          })
          if (resolved !== undefined) return resolved
          return withContinueHint(card)
        }
        return card
      }
      // Confirmed but never opened: no customer decision is pending — every
      // other surface treats confirm + open as one action, so finish it here
      // rather than asking the customer to retype the command. A blocked
      // precondition (Git unavailable…) surfaces as the drive's own error
      // card, and this same `/baf-go` is the retry once the environment heals.
      return driveClassify(cwd, `confirm change=${changeId}`, source)
    }

    case 'open': {
      // §22 user-request 2026-09-20 — the customer wants explicit confirmation
      // before any forward transition, not just the two machine-checked gates.
      // `/baf-go-confirm` skips the popup; without a popup channel (CLI/tests)
      // we keep the legacy direct advance so the existing test suite stays
      // green; with a popup channel we render the gate card and the customer
      // clicks `advance` (or skips it). `advance` re-enters `/baf-go` here,
      // which — because the customer is still on `open` — runs the same
      // direct-advance path the legacy CLI does.
      //
      // 【变更】2026-09-22 (user report): open had
      // no artifact gate, so the Tab button / confirm path advanced a change
      // whose proposal.md was still the TODO template (and the next stages
      // inherited the hole). The user's principle: 每阶段产物是推进前提. Now
      // every forward path out of open — dialog, confirm, plain /baf-go —
      // runs the same proposalGate first; a failure refuses with the missing
      // list so the card names the work.
      const openRefusal = async (): Promise<CommandResult | undefined> => {
        if (status.mode === 'bug-fix-path') return undefined
        const gate = await proposalGate({ workspaceRoot: cwd, changeId, mode: 'full-go-path' })
        if (gate.ok) return undefined
        // §18.4.2 dispatch: the gap is authored by the model, so the customer's
        // `/baf-go` hands it the order instead of only describing the hole.
        const parts = dispatchParts(
          dispatchWorkOrder(context, 'open', gate.missing ?? []),
          [
            '对模型说补齐「缺什么」列出的项（或直接编辑上方产物文件）',
            '完成后敲 /baf-go 或点 Tab「推进」重新裁决',
          ],
        )
        return errorCard('open 裁决门未通过 · proposal 未完成', [
          { title: '原因', lines: [gate.detail ?? 'proposal.md 未达完成门'] },
          { title: '产物', lines: [`openspec/changes/${changeId}/${ARTIFACT_FILES.proposal} · 本次裁决对象`] },
          ...(gate.missing === undefined || gate.missing.length === 0 ? [] : [{ title: '缺什么', lines: [...gate.missing] }]),
          { title: '满足条件', lines: [...DOC_REQUIREMENTS_ZH.open] },
          { title: '下一步', lines: [...parts.next] },
        ], parts.marker)
      }
      const advanceOpen = async (): Promise<CommandResult> => {
        const refusal = await openRefusal()
        if (refusal !== undefined) return refusal
        if (status.mode === 'bug-fix-path') {
          const next = await pipeline.enterImplementStage(changeId, source)
          // 【变更】2026-09-23 (demo2 user issue #1): the bug-fix open→implement
          // rest is a model-authoring stop (the regression test is written
          // first, before any fix) — the same dispatch point every template
          // install carries. The classify-confirm follow-up (command-drives)
          // re-enters here with the customer-origin channel; without the
          // order the click left the freshly-entered stage in silence.
          const parts = dispatchParts(
            dispatchWorkOrder(context, 'implement', [
              'bug-fix-path：先写回归测试，再改代码（recordTouched 顺序强制）',
              '改动文件全部在 plan.json 的 allowlist 内',
            ]),
            ['先补回归测试，再改代码', '只允许 plan.json allowlist 内文件'],
          )
          return successCard('已进入 implement', [
            { title: '状态', lines: statusLines(next) },
            { title: '纪律', lines: [...parts.next] },
          ], parts.marker)
        }
        const next = await pipeline.beginDocStage(changeId, 'clarify', source)
        // §18.4.2 the classic stuck point (2026-09-22 `demo_1`): installing the
        // template is where the workflow goes quiet — nobody tells the model to
        // fill it. The order rides the requirements table as its work list.
        const parts = dispatchParts(
          dispatchWorkOrder(context, 'clarify', DOC_REQUIREMENTS_ZH.clarify),
          [
            '模型填写上方产物里的 TODO（也可直接对模型说「填写 clarify.md」）',
            '填完敲 /baf-go 裁决',
          ],
        )
        return successCard('clarify 已进入 · 模板已装', [
          { title: '状态', lines: statusLines(next) },
          { title: '产物', lines: docStageArtifacts(changeId, 'clarify') },
          { title: '接下来', lines: [...parts.next] },
        ], parts.marker)
      }
      if (context.confirm) return advanceOpen()
      if (context.ask !== undefined) {
        // Gate BEFORE offering the dialog — an advance card clicked over an
        // unauthored proposal would only bounce off the same refusal one
        // click later (user report #1: the card must confirm finished
        // artifacts, not hope for them).
        const refusal = await openRefusal()
        if (refusal !== undefined) return refusal
        const resolved = await resolveViaDialog(context, { gateId: 'open-advance', changeId })
        if (resolved !== undefined) return resolved
        return withContinueHint(renderGate('open-advance', { cwd, changeId }))
      }
      return advanceOpen()
    }

    case 'clarify': {
      const prep = await prepareDoc(context, 'clarify', at('clarify'))
      if (prep.kind === 'card') {
        return prep.card
      }
      const advanceClarify = async (): Promise<CommandResult> => {
        const next = await pipeline.beginDocStage(changeId, 'design', source)
        // 【变更】2026-09-23 (user issue #1): this advance lands at a
        // model-authoring rest (the design template just installed) — the
        // same dispatch point every other template install carries, so a
        // dialog/Tab/confirm click keeps the flow running.
        const parts = dispatchParts(
          dispatchWorkOrder(context, 'design', DOC_REQUIREMENTS_ZH.design),
          ['模型填 design.md（也可直接对模型说「填写 design.md」）', '填完敲 /baf-go'],
        )
        return successCard('clarify 已裁决通过 · design 已进入', [
          { title: '状态', lines: statusLines(next) },
          { title: '产物', lines: docStageArtifacts(changeId, 'design') },
          { title: '接下来', lines: [...parts.next] },
        ], parts.marker)
      }
      if (context.confirm) return advanceClarify()
      if (context.ask !== undefined) {
        const resolved = await resolveViaDialog(context, { gateId: 'clarify-advance', changeId })
        if (resolved !== undefined) return resolved
        return withContinueHint(renderGate('clarify-advance', { cwd, changeId }))
      }
      return advanceClarify()
    }

    case 'design': {
      const prep = await prepareDoc(context, 'design', at('design'))
      if (prep.kind === 'card') {
        return prep.card
      }
      // **Gate A** (§18.5 / §22.17). One park, three unlock shapes: the
      // dialog's confirm option (dispatched as a gate-card `/baf-go` with no
      // ask channel, so the legacy tail check below sees the unlock),
      // `/baf-go-confirm` (positive-path mode), and — with no popup channel
      // (CLI/tests) — the customer typing `baf-go` again.
      const parked = await gateUnlocked(store, changeId, 'design-to-plan')
      if (!parked) await parkOnGate(store, changeId, 'design-to-plan')
      const proceed = async (): Promise<CommandResult> => {
        const next = await pipeline.beginDocStage(changeId, 'plan', source)
        // 【变更】2026-09-23 (demo1 十问题 1): entering plan IS a
        // model-authoring rest (the plan.json template just installed) — the
        // same dispatch point clarify→design and plan→implement carry. The
        // design-advance confirm used to land here in silence: no order, the
        // model idled at the template, and the flow waited for a manual
        // /baf-go.
        const parts = dispatchParts(
          dispatchWorkOrder(context, 'plan', DOC_REQUIREMENTS_ZH.plan),
          ['模型填 plan.json（每任务：files / verify / rollback）', '填完敲 /baf-go'],
        )
        return successCard('设计已确认 · 已进入计划阶段', [
          { title: '状态', lines: statusLines(next) },
          { title: '产物', lines: docStageArtifacts(changeId, 'plan') },
          { title: '接下来', lines: [...parts.next] },
        ], parts.marker)
      }
      // First-time /baf-go after design finished: pop the friendly design-advance
      // card so the customer sees what they're agreeing to. The legacy design-confirm
      // wording takes over once the gate is parked.
      if (!parked && context.ask !== undefined && !context.confirm) {
        const advanced = await resolveViaDialog(context, { gateId: 'design-advance', changeId })
        if (advanced !== undefined) return advanced
        return withContinueHint(renderGate('design-advance', { cwd, changeId }))
      }
      if (context.confirm) return proceed()
      if (context.ask !== undefined) {
        // Every /baf-go on a parked gate re-pops the dialog (§22.17) — the
        // customer who paused via the popup revives it by typing /baf-go.
        const resolved = await resolveViaDialog(context, { gateId: 'design-confirm', changeId })
        if (resolved !== undefined) return resolved
        return withContinueHint(renderGate('design-confirm', { cwd, changeId }))
      }
      // §22.14-D: render the registered §22 card verbatim so slash, Tab,
      // and the coordinator agree on options / commands. The card is
      // `kind: 'error'` so the surface still renders it as a stop.
      return parked ? proceed() : renderGate('design-confirm', { cwd, changeId })
    }

    case 'plan': {
      const prep = await prepareDoc(context, 'plan', at('plan'))
      if (prep.kind === 'card') {
        return prep.card
      }
      const advancePlan = async (): Promise<CommandResult> => {
        const next = await pipeline.enterImplementStage(changeId, source)
        // 【变更】2026-09-23 (user issue #1): entering implement is the
        // ledger-authoring rest — dispatch like every other template install
        // so the dialog/Tab/confirm click wakes the model.
        const gap: readonly string[] = [
          `plan.json：0/${(await readLedger(cwd, changeId).catch(() => undefined))?.tasks.length ?? '?'} 个任务已 done——完成剩余任务并把 done 标为 true`,
        ]
        const parts = dispatchParts(
          dispatchWorkOrder(context, 'implement', gap),
          ['只改 plan.json allowlist 内文件（baf-guard 硬门禁）', '全部任务完成后敲 /baf-go'],
        )
        return successCard('plan 已裁决通过 · implement 已进入', [
          { title: '状态', lines: statusLines(next) },
          { title: '产物', lines: [docStageArtifacts(changeId, 'plan').at(-1) ?? ''] },
          { title: '纪律', lines: [...parts.next] },
        ], parts.marker)
      }
      if (context.confirm) return advancePlan()
      if (context.ask !== undefined) {
        // 【变更】2026-09-23 (demo1 十问题 7): the implement-entry confirm is
        // the「正式落代码」notice — it names the confirmed change scope
        // (allowlist) and the task count from the ledger, so the customer
        // starts coding only with the impact settled and visible.
        const ledger = await readLedger(cwd, changeId).catch(() => undefined)
        const scopeNote = ledger === undefined ? [] : [
          `将修改 ${ledger.allowlist.length} 个文件（影响范围，已确认）：${ledger.allowlist.slice(0, 6).join('、')}${ledger.allowlist.length > 6 ? ' …' : ''}`,
          // 【变更】2026-09-23 (demo5 issue #1/#4): tasks.md 已随计划完成从
          // plan.json 生成（「已计划」），实现阶段逐项勾选——不再是确认后才生成。
          `共 ${ledger.tasks.length} 个任务；tasks.md 任务清单已生成，确认后开始落代码并逐项完成`,
        ]
        const resolved = await resolveViaDialog(context, {
          gateId: 'plan-advance',
          changeId,
          ...(scopeNote.length === 0 ? {} : { note: scopeNote }),
        })
        if (resolved !== undefined) return resolved
        return withContinueHint(renderGate('plan-advance', { cwd, changeId }))
      }
      return advancePlan()
    }

    case 'implement': {
      if (at('implement') === 'completed') return verifyEntry(context)
      const ledger = await readLedger(cwd, changeId)
      const gate = await implementGate(
        {
          workspaceRoot: cwd,
          changeId,
          mode: status.mode === 'bug-fix-path' ? 'bug-fix-path' : 'full-go-path',
        },
        ledger.touched,
      )
      if (!gate.ok) {
        // Still waiting on the model: report progress, change nothing. The
        // gate's `missing` lines ride along so the card names the work — and
        // when they are absent (a bare reason code, e.g. scope_exceeded) the
        // dispatch falls back to the gate's own detail line, so the order
        // still names a concrete gap.
        const done = ledger.tasks.filter(t => (t as { done?: boolean }).done === true).length
        const gap = gate.missing ?? (gate.detail === undefined ? [] : [gate.detail])
        const parts = dispatchParts(
          dispatchWorkOrder(context, 'implement', gap),
          ['模型补齐后敲 /baf-go'],
        )
        return errorCard('implement 进行中 · 等模型', [
          {
            title: '状态',
            lines: [...statusLines(status), `任务: ${done}/${ledger.tasks.length} done`],
          },
          {
            title: '裁决门',
            lines: [
              ...gate.reasonCodes.map(code => `${code}  ${gate.detail ?? ''}`.trim()),
              ...(gate.missing ?? []),
            ],
          },
          { title: '下一步', lines: [...parts.next] },
        ], parts.marker)
      }
      const driven = await pipeline.driveImplementStage(changeId)
      if (driven.node !== 'implement') throw new Error(`expected an implement drive, got ${driven.node}`)
      // §18.4.2: a T15 escalation rewrites the lane to full-go-path; the session
      // stays put and the next `baf-go` lands on clarify.
      if (driven.result.escalated !== undefined) {
        const after = await store.readStatus(changeId)
        return errorCard('已升级为完整流程', [
          { title: '原因', lines: [driven.result.escalated.cause] },
          { title: '状态', lines: statusLines(after) },
          {
            title: '说明',
            lines: [
              '缺陷修复路径的记录会保留，可追溯',
              '缺的 澄清/设计/计划 阶段会按完整流程补走',
              '输入 /baf-go 继续',
            ],
          },
        ])
      }
      // 【变更】2026-09-23 (demo1 十问题 8): verify entry is customer-gated —
      // implement completing used to auto-run verification. The dialog names
      // the checklist and the acceptance document; 暂不 keeps the rest.
      return verifyEntry(context)
    }

    case 'verify': {
      if (at('verify') !== 'completed') return driveVerifyNow(context)
      // **Gate B** (§18.5 / §22.17) — archiving is the customer's call, not
      // the coordinator's. Same three unlock shapes as gate A.
      const parked = await gateUnlocked(store, changeId, 'verify-to-archive')
      if (!parked) await parkOnGate(store, changeId, 'verify-to-archive')
      const proceed = async (): Promise<CommandResult> => {
        const driven = await pipeline.driveArchiveStage(changeId, true, source)
        if (driven.node !== 'archive') throw new Error(`expected an archive drive, got ${driven.node}`)
        const after = await store.readStatus(changeId)
        return successCard('检查已确认 · 已归档', [
          { title: '状态', lines: statusLines(after) },
          { title: '产物', lines: [driven.result.archivePath] },
          { title: '下一步', lines: ['本条工作流结束；新需求请在新会话中提出'] },
        ])
      }
      if (context.confirm) return proceed()
      if (context.ask !== undefined) {
        const resolved = await resolveViaDialog(context, { gateId: 'verify-archive', changeId })
        if (resolved !== undefined) return resolved
        return withContinueHint(renderGate('verify-archive', { cwd, changeId }))
      }
      // §22.14-D: render the registered §22 card verbatim.
      return parked ? proceed() : renderGate('verify-archive', { cwd, changeId })
    }

    case 'archive': {
      // Only reachable when an earlier archive attempt entered the node but
      // did not finish (e.g. the atomic move failed).
      const driven = await pipeline.driveArchiveStage(changeId, true, source)
      if (driven.node !== 'archive') throw new Error(`expected an archive drive, got ${driven.node}`)
      const after = await store.readStatus(changeId)
      return successCard('已归档', [
        { title: '状态', lines: statusLines(after) },
        { title: '产物', lines: [driven.result.archivePath] },
      ])
    }

    default: {
      return errorCard(`未识别的阶段 ${node}`, [
        { title: '活动变更', lines: [`${changeId} · 当前 ${node}`] },
        { title: '处理', lines: ['/baf-status 查看完整状态；必要时 /baf-workflow-resume 复位'] },
      ])
    }
  }
}

/**
 * The gates a change's live state actually offers — the validation table for
 * `/baf-go gate=<id>`. Mirrors what {@link route} would pop at each resting
 * point (a gate only counts when the stage work behind it is done), plus
 * `abandon`, which the workflow offers on every active non-terminal change.
 * @param status - the change's recovered status.
 * @returns gate ids legal to re-pop right now.
 */
function explicitGatesFor(status: WorkflowStatus): readonly GateId[] {
  if (status.terminal !== undefined) return []
  const gates: GateId[] = []
  switch (status.current) {
    case 'intake':
      // Pending (or the legacy unresolved clarify-required verdict) — the
      // classification dialog is the live decision. A confirmed intake has no
      // gate: /baf-go finishes the open drive instead.
      if (status.intake === undefined || status.intake.confirmation !== 'confirmed'
        || status.intake.mode === 'clarify-required') gates.push('intake-classify')
      break
    case 'open':
      gates.push('open-advance')
      break
    case 'clarify':
      if (status.nodes.clarify === 'completed') gates.push('clarify-advance')
      break
    case 'design':
      // design-advance is the friendly first pop, design-confirm the parked
      // §18.5 gate — both are legal re-pop targets once design is done.
      if (status.nodes.design === 'completed') gates.push('design-advance', 'design-confirm')
      break
    case 'plan':
      if (status.nodes.plan === 'completed') gates.push('plan-advance')
      break
    case 'implement':
      // 【变更】2026-09-23 (demo1 十问题 8): implement completed → the verify
      // entry decision is due (explicitGatesFor mirrors route's pop).
      if (status.nodes.implement === 'completed') gates.push('verify-advance')
      break
    case 'verify':
      if (status.nodes.verify === 'completed') gates.push('verify-archive')
      break
    case 'drift':
      gates.push('resume')
      break
    default:
      break
  }
  if (status.current !== 'drift') gates.push('abandon')
  return gates
}

/**
 * One gate the change's live resting point owes the customer right now —
 * §22.19's turn-end evaluation, extracted from the same judgments
 * {@link route} and {@link explicitGatesFor} apply (no new rules). The
 * orchestrator row calls this after every completed model turn; `undefined`
 * means the resting point is the model's authoring domain (implement in
 * progress, an un-authored doc stage, terminal) and no gate may pop.
 *
 * Priority inside one node: a parked `awaiting-confirm` tail outranks the
 * friendly first pop (design-confirm over design-advance) — the park event
 * is the durable "the customer already saw this decision" marker.
 *
 * @param status - the change's recovered status.
 * @param events - the change's projection log (only the tail is read).
 * @returns the due gate, or undefined when nothing is due.
 */
export function dueGateFor(
  status: WorkflowStatus,
  events: readonly ProjectionEvent[],
): { readonly gateId: GateId; readonly changeId: string } | undefined {
  if (status.terminal !== undefined) return undefined
  const tail = events.at(-1)
  const parked = tail !== undefined && tail.type === 'awaiting-confirm' ? tail.gate : undefined
  switch (status.current) {
    case 'intake':
      // Pending classification (or the legacy unresolved clarify-required
      // verdict) is the live decision; a confirmed intake has no gate — the
      // coordinator chains the open drive on the next /baf-go instead.
      return status.intake === undefined || status.intake.confirmation !== 'confirmed'
        || status.intake.mode === 'clarify-required'
        ? { gateId: 'intake-classify', changeId: status.changeId }
        : undefined
    case 'open':
      // 【变更】2026-09-22 (user report #1): `open-advance` is no longer due
      // unconditionally — an unauthored proposal.md must read as "the model's
      // authoring domain" exactly like an unfilled clarify.md does. The
      // orchestrator's doc-aware layer (docAdvanceDue's open case) pops the
      // card only once proposalGate passes; before that the change rests as
      // the model's work (the standing persona instruction tells the model to
      // read the projection state each turn).
      return undefined
    case 'clarify':
      return status.nodes.clarify === 'completed'
        ? { gateId: 'clarify-advance', changeId: status.changeId }
        : undefined
    case 'design':
      if (parked === 'design-to-plan') return { gateId: 'design-confirm', changeId: status.changeId }
      return status.nodes.design === 'completed'
        ? { gateId: 'design-advance', changeId: status.changeId }
        : undefined
    case 'plan':
      return status.nodes.plan === 'completed'
        ? { gateId: 'plan-advance', changeId: status.changeId }
        : undefined
    case 'verify':
      if (parked === 'verify-to-archive') return { gateId: 'verify-archive', changeId: status.changeId }
      return status.nodes.verify === 'completed'
        ? { gateId: 'verify-archive', changeId: status.changeId }
        : undefined
    case 'drift':
      return { gateId: 'resume', changeId: status.changeId }
    default:
      // implement / archive — the model's domain; no customer decision.
      return undefined
  }
}

/**
 * `/baf-go gate=<id>` — re-pop one named confirmation gate (2026-09-21 user
 * request). The customer names the dialog to reopen after closing it; we
 * validate the change actually rests on that gate (a mismatched pop would let
 * a stale card dispatch a decision the state no longer supports), then run
 * the same park/pop code path {@link route} uses at that resting point.
 * @param context - bound routing context.
 * @param gateArg - the gate id the customer asked for.
 * @returns the re-popped gate's card (dialog outcome or plain card + hint).
 */
async function explicitGate(context: RouteContext, gateArg: string): Promise<CommandResult> {
  const { cwd, store, pipeline, changeId, source } = context
  const spec: GateSpec | undefined = (GATE_REGISTRY as Record<string, GateSpec | undefined>)[gateArg]
  if (spec === undefined) {
    return errorCard('未注册的门', [
      { title: '原因', lines: [`gate=${gateArg} 不在门注册表里`] },
      { title: '可用门', lines: (Object.keys(GATE_REGISTRY) as GateId[]).map(g => `gate=${g}`) },
      { title: '用法', lines: ['/baf-go gate=<门> [change=<changeId>]    重弹指定确认门'] },
    ])
  }
  const gateId = gateArg as GateId
  if (gateId === 'scaffold') {
    // Reaching here means a baseline exists — driveGo's uninitialized branch
    // owns the no-baseline case and pops scaffold itself.
    return errorCard('工作区已初始化', [
      { title: '原因', lines: ['scaffold 门只在未初始化的工作区出现；当前已有 baseline'] },
      { title: '下一步', lines: ['不带 gate= 敲 /baf-go，由流程路由到当前停靠点'] },
    ])
  }
  const status = await store.readStatus(changeId)
  const allowed = explicitGatesFor(status)
  if (!allowed.includes(gateId)) {
    return errorCard('当前不在此门上', [
      {
        title: '状态',
        lines: [
          `${changeId} · ${status.terminal !== undefined ? `已终态（${status.terminal}）` : `当前 ${status.current}`}`,
        ],
      },
      {
        title: '可弹出的门',
        lines: allowed.length === 0
          ? ['（无——当前停靠点没有待确认的门）']
          : allowed.map(g => `gate=${g}  ${GATE_REGISTRY[g].title}`),
      },
      { title: '下一步', lines: ['不带 gate= 敲 /baf-go，由流程路由到当前停靠点'] },
    ])
  }

  // The resume gate renders from live drift candidates — same read the drift
  // branch of route() performs; it cannot go through the static renderGate.
  if (gateId === 'resume') {
    const options = await pipeline.resumeOptions(changeId)
    if (context.ask !== undefined && options.status.current === 'drift' && options.candidates.length > 0) {
      const resolved = await resolveViaDialog(context, {
        gateId: 'resume',
        changeId,
        resumeCandidates: options.candidates,
      })
      if (resolved !== undefined) return resolved
      return withContinueHint(await driveResume(cwd, `change=${changeId}`, source))
    }
    return driveResume(cwd, `change=${changeId}`, source)
  }

  // The two §18.5 confirm gates park first — the parked event is the durable
  // marker the dialog's `/baf-go` dispatch unlocks against.
  if (gateId === 'design-confirm' && !(await gateUnlocked(store, changeId, 'design-to-plan'))) {
    await parkOnGate(store, changeId, 'design-to-plan')
  }
  if (gateId === 'verify-archive' && !(await gateUnlocked(store, changeId, 'verify-to-archive'))) {
    await parkOnGate(store, changeId, 'verify-to-archive')
  }

  const card = renderGate(gateId, { cwd, changeId })
  if (context.ask === undefined) return withContinueHint(card)
  const resolved = await resolveViaDialog(context, {
    gateId,
    changeId,
    ...(gateId === 'intake-classify' && status.intake !== undefined
      ? { judgment: judgmentOf(status.intake) }
      : {}),
  })
  return resolved ?? withContinueHint(card)
}

/**
 * Workspace-relative artifact paths one documentation stage owns — rendered on
 * every park card so the customer always sees *where* the content lives
 * (2026-09-21 5.jsonl: cards said 「模型填 TODO」 without naming the files).
 * @param changeId - change id.
 * @param node - documentation stage.
 * @returns one path per artifact.
 */
function docStageArtifacts(changeId: string, node: 'clarify' | 'design' | 'plan'): string[] {
  const files = node === 'clarify'
    ? [ARTIFACT_FILES.proposal, ARTIFACT_FILES.clarify]
    : node === 'design'
      ? [ARTIFACT_FILES.design]
      : [ARTIFACT_FILES.plan, ARTIFACT_FILES.planJson]
  return files.map(file => `openspec/changes/${changeId}/${file}`)
}

/**
 * Bring a documentation node to `completed`, or return the card that says why
 * it cannot move yet.
 *
 * Three cases, in the order the pipeline expects them: already completed (no
 * write at all), not yet started (install the template — safe to re-drive,
 * because `enterStage` returns early on an in-progress node), and in progress
 * (run the durable gate). A failed gate renders the artifact path, the
 * missing-item list, and the pass conditions — the refusal names the work,
 * not just the reason code (§22 user-request 2026-09-21, session 5.jsonl).
 *
 * Both non-completed branches are §18.4.2 dispatch points: they are exactly
 * the rests where the next move is the model writing the file.
 * @param context - bound routing context (workspace, change, source, dispatch).
 * @param node - clarify / design / plan.
 * @param nodeStatus - current status of that node.
 * @returns `completed`, or a card to render instead.
 */
async function prepareDoc(
  context: RouteContext,
  node: 'clarify' | 'design' | 'plan',
  nodeStatus: string | undefined,
): Promise<{ kind: 'completed' } | { kind: 'card'; card: CommandResult }> {
  const { pipeline, changeId, source } = context
  if (nodeStatus === 'completed') return { kind: 'completed' }
  if (nodeStatus !== 'in-progress') {
    const next = await pipeline.beginDocStage(changeId, node, source)
    const parts = dispatchParts(
      dispatchWorkOrder(context, node, DOC_REQUIREMENTS_ZH[node]),
      [
        '模型填写上方产物里的 TODO（也可直接对模型说「填写 某个文件」）',
        '填完敲 /baf-go 裁决',
      ],
    )
    return {
      kind: 'card',
      card: successCard(`${node} 已进入 · 模板已装`, [
        { title: '状态', lines: statusLines(next) },
        { title: '产物', lines: docStageArtifacts(changeId, node) },
        { title: '接下来', lines: [...parts.next] },
      ], parts.marker),
    }
  }
  try {
    await pipeline.completeDocStage(changeId, node)
    return { kind: 'completed' }
  } catch (error) {
    if (isBafError(error) && error.code === 'invalid_transition') {
      const gateFile = node === 'plan' ? ARTIFACT_FILES.planJson : `${node}.md`
      const missing = missingOf(error)
      const parts = dispatchParts(
        dispatchWorkOrder(context, node, missing),
        [
          '打开上方文件核对/修改，或直接对模型说补齐「缺什么」列出的项',
          '完成后敲 /baf-go 重新裁决',
          `单独重跑：/baf-workflow-${node} change=${changeId} done`,
        ],
      )
      return {
        kind: 'card',
        card: errorCard(`${node} 裁决门未通过`, [
          { title: '原因', lines: [error.message] },
          { title: '产物', lines: [`openspec/changes/${changeId}/${gateFile} · 本次裁决对象`] },
          ...(missing.length === 0 ? [] : [{ title: '缺什么', lines: missing }]),
          { title: '满足条件', lines: [...DOC_REQUIREMENTS_ZH[node]] },
          { title: '下一步', lines: [...parts.next] },
        ], parts.marker),
      }
    }
    throw error
  }
}

/**
 * The missing-item list a doc-gate refusal carries — the pipeline copies the
 * gate's `missing` lines into the BafError details.
 * @param error - the caught BafError.
 * @returns string lines (empty when the refusal carried none).
 */
function missingOf(error: { readonly details: Readonly<Record<string, unknown>> }): readonly string[] {
  const value = error.details.missing
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/**
 * 【变更】2026-09-23 (demo1 十问题 8): the verify-entry gate — implement
 * completing must stop at a customer decision, not auto-run verification.
 * With a popup channel the `verify-advance` dialog pops (its question names
 * the checklist and the acceptance document); the confirm option re-enters
 * `/baf-go-confirm` (the rest is now verify-eligible) and runs the drive.
 * `confirm` mode and channel-less compositions (CLI/tests) take the positive
 * path directly, exactly like every other advance gate.
 * @param context - bound routing context.
 * @returns the gated (or directly driven) verify outcome card.
 */
async function verifyEntry(context: RouteContext): Promise<CommandResult> {
  const { cwd, changeId, ask, confirm } = context
  if (confirm) return driveVerifyNow(context)
  if (ask !== undefined) {
    const resolved = await resolveViaDialog(context, { gateId: 'verify-advance', changeId })
    if (resolved !== undefined) return resolved
    return withContinueHint(renderGate('verify-advance', { cwd, changeId }))
  }
  return driveVerifyNow(context)
}

/**
 * Run the verify stage and render either the T11 fix-loop card or gate B.
 * @param context - bound routing context (the change this verify belongs to).
 * @returns verify outcome card.
 */
async function driveVerifyNow(context: RouteContext): Promise<CommandResult> {
  const { pipeline, changeId, source } = context
  const driven = await pipeline.driveVerifyStage(changeId, new AbortController().signal, source)
  if (driven.node !== 'verify') throw new Error(`expected a verify drive, got ${driven.node}`)
  const rows = driven.result.report.checks.map(
    row => `${row.ok ? '✓' : '✗'} ${row.name}${row.required ? '' : '（非必需）'}`,
  )
  if (driven.result.backToImplement) {
    const failures = driven.result.report.checks
      .filter(row => !row.ok)
      .map(row => `${row.name}: ${row.diagnostics.join('; ')}`)
    // §18.4.2 the T11 loop is the one implement rest whose work list comes from
    // a verify report instead of the ledger — same dispatch, explicit cause so
    // the order reads as a fix, not a first pass at the artifact.
    const parts = dispatchParts(
      dispatchWorkOrder(context, 'implement', failures, 'verify-failed'),
      ['模型修复后敲 /baf-go'],
    )
    return errorCard('必需检查未通过 · 退回实现阶段', [
      { title: '检查', lines: rows.length === 0 ? ['（无检查项）'] : rows },
      { title: '失败详情', lines: failures.length === 0 ? ['（无诊断信息）'] : failures },
      { title: '报告', lines: [driven.result.reportPath] },
      { title: '下一步', lines: [...parts.next] },
    ], parts.marker)
  }
  // Verify passed → re-route so gate B owns the next move (single source).
  // The re-route drops any explicit resume target: a verify run never
  // carries one, and gate B must not misread it as a drift instruction.
  return route({ ...context, resumeTarget: undefined })
}

/**
 * Pop the §22.17 dialog for one gate and, when the customer clicks a
 * resolving option, dispatch it through `driveGateResolve` — the same single
 * resolve channel the Tab buttons use, with the same `gate-card` §22.15
 * source. The inner `/baf-go` dispatch carries no ask channel, so a dialog
 * confirm can never recursively pop another dialog.
 *
 * 【变更】2026-09-23 (user issue #1): an answered dialog is a customer click,
 * so the resolve drive carries this drive's work-order channel — a confirm
 * that advances into a template rest now dispatches the order that wakes the
 * model, instead of leaving the freshly-installed template in silence.
 * @param context - routing context (cwd + adapters + ask + dispatch channel).
 * @param gate - which gate to pop, with change id / resume candidates.
 * @returns the dispatched drive's card, or undefined when the customer
 *   paused or no dialog could show (callers fall back to the plain card).
 */
async function resolveViaDialog(
  surface: {
    readonly ask?: GateAsk
    readonly cwd: string
    readonly adapters: DriveAdapters
    readonly dispatch?: GoDispatch
  },
  gate: {
    readonly gateId: GateId
    readonly changeId?: string
    readonly resumeCandidates?: readonly WorkflowNode[]
    readonly bindCandidates?: readonly string[]
    readonly judgment?: GateJudgment
  },
): Promise<CommandResult | undefined> {
  if (surface.ask === undefined) return undefined
  const outcome = await surface.ask(gate)
  if (outcome.kind !== 'answered') return undefined
  const opts = gate.changeId === undefined ? undefined : { changeId: gate.changeId }
  return driveGateResolve(surface.cwd, gate.gateId, outcome.optionId, surface.adapters, gate.resumeCandidates, gate.bindCandidates, 'gate-card', {
    ...opts,
    ...(surface.dispatch === undefined ? {} : { dispatch: surface.dispatch }),
  })
}

/**
 * Append the §22.17 continue hint to a paused gate card: how the customer
 * revives the popup (`/baf-go`) or settles it without one (`/baf-go-confirm`).
 * Section shape mirrors `formatCommandReport` (【title】 + indented lines).
 */
function withContinueHint(card: CommandResult): CommandResult {
  return {
    kind: card.kind,
    text: `${card.text}\n\n【继续】\n  /baf-go 重新弹出确认框\n  /baf-go-confirm 不弹框直接继续`,
  }
}

/**
 * Whether the customer has already unlocked a gate by typing `baf-go` again
 * (§18.5). The park event is the durable "we already stopped here" marker, so
 * finding it at the log tail means this invocation *is* the confirmation.
 * @param store - projection store.
 * @param changeId - change id.
 * @param gate - gate to test.
 * @returns true when this invocation is the unlock.
 */
async function gateUnlocked(
  store: ProjectionStore,
  changeId: string,
  gate: ConfirmGate,
): Promise<boolean> {
  const { events } = await store.readEvents(changeId)
  const tail = events.at(-1)
  return tail !== undefined && tail.type === 'awaiting-confirm' && tail.gate === gate
}

/**
 * Record a gate park (§18.5) — audit only, never a permission check. The gate
 * is *derived* from node status, so this event must not move `current`.
 *
 * Idempotent: an identical `awaiting-confirm` already at the log tail is a
 * no-op, so re-rendering a parked card never grows the log (§18.4.1).
 * @param store - projection store.
 * @param changeId - change id.
 * @param gate - which gate is parked.
 * @returns status after the (possibly skipped) append.
 */
async function parkOnGate(
  store: ProjectionStore,
  changeId: string,
  gate: ConfirmGate,
): Promise<WorkflowStatus> {
  const status = await store.readStatus(changeId)
  if (await gateUnlocked(store, changeId, gate)) return status
  // §13 R5 — capture the §22 gate card text at park time so a later
  // registry edit cannot silently change what the customer sees on replay.
  const snapshot = captureGateSnapshot(gate)
  const { status: next } = await store.append(changeId, status.projectionVersion, meta => ({
    type: 'awaiting-confirm',
    gate,
    ...(snapshot === undefined ? {} : { snapshot }),
    ...meta,
  }))
  return next
}

/**
 * §13 R5 — map a {@link ConfirmGate} to the matching GATE_REGISTRY spec and
 * freeze its text + options. Kept sync and pure so it can run inside the
 * `append` callback; the gate-cards module has no I/O.
 * @param gate - the parked gate id.
 * @returns frozen snapshot, or undefined when the gate has no static spec
 * (only the two §18.5 confirm gates today).
 */
function captureGateSnapshot(gate: ConfirmGate): AwaitingConfirmSnapshot | undefined {
  const spec = GATE_REGISTRY[gateToGateId(gate)]
  if (spec === undefined) return undefined
  return {
    title: spec.title,
    question: spec.question,
    options: spec.options.map(opt => ({
      id: opt.id,
      label: opt.label,
      command: opt.command,
      ...(opt.args === undefined ? {} : { args: opt.args }),
    })),
  }
}

function gateToGateId(gate: ConfirmGate): 'design-confirm' | 'verify-archive' {
  return gate === 'design-to-plan' ? 'design-confirm' : 'verify-archive'
}

/**
 * Render active-change rows for a card.
 * @param actives - active rows from the projection index.
 * @returns one line per change.
 */
function listActives(actives: readonly ActiveRow[]): string[] {
  if (actives.length === 0) return ['（无）']
  return actives.map(c =>
    `${c.changeId} · 当前 ${c.current}${c.updatedAt === '' ? '' : ` · ${c.updatedAt}`}`,
  )
}

/**
 * Hand the addressed session a work order for one model-authoring rest
 * (§18.4.2, 2026-09-22 customer decision), and report what happened.
 *
 * Two independent guards, deliberately redundant:
 * - the surface-side rule — `GoInput.dispatch` exists only when the caller
 *   could build a dispatcher from a live agent (`followup` present);
 * - the origin rule (2026-09-23 issue #1) — `dispatchOrigin: 'customer'` is
 *   stamped only by surfaces the customer acted on: a typed `/baf-go` or
 *   `/baf-go-confirm`, a gate-dialog option click, a Tab 「推进」/gate-card
 *   click. Host-internal re-drives (the orchestrator's verify auto-drive),
 *   CLI, and model tools pass no origin and can never dispatch.
 *
 * Both guards live here, in one function: a second dispatch point that forgets
 * one of them would be the whole failure mode this design exists to avoid.
 * @param context - bound routing context.
 * @param node - stage whose artifact is incomplete.
 * @param missing - the gate's missing-item lines (the order's work list).
 * @param cause - set for the T11 fix loop; plain authoring rests leave it off.
 * @returns the outcome, or 'unavailable' when this drive may not dispatch.
 */
function dispatchWorkOrder(
  context: RouteContext,
  node: DispatchNode,
  missing: readonly string[],
  cause?: 'verify-failed',
): GoDispatchOutcome {
  const { dispatch, dispatchOrigin, changeId } = context
  if (dispatch === undefined || dispatchOrigin !== 'customer') return 'unavailable'
  const signal: DispatchSignal = {
    changeId,
    node,
    artifactPath: artifactPathFor(changeId, node),
    missing,
    ...(cause === undefined ? {} : { cause }),
  }
  return dispatch(signal)
}

/**
 * Title marker a resting card carries when the work order for its gap was
 * delivered to the model (§18.4.2). Exported so combining surfaces — the
 * classify-confirm follow-up in `command-drives.ts`, the Tab transition
 * remote's follow — can tell「stopped because dispatched」apart from「stopped
 * because failed」without re-deriving the outcome (2026-09-23 demo1 issue #1).
 */
export const DISPATCH_SENT_MARKER = '已派单'

/**
 * Title marker + 下一步 section for a card rendered at a dispatch point.
 *
 * The 下一步 lines are dispatch-aware: a sent order tells the customer the
 * model is now working and the next gate will pop by itself; a deduped one
 * explains why re-typing does nothing (the gap is unchanged); a busy one says
 * the model already has a turn in flight. `unavailable` (CLI/tests, Tab,
 * confirm, model tools) returns exactly the legacy lines, so every
 * pre-existing surface and spec sees byte-identical cards.
 * @param outcome - what the dispatch attempt did.
 * @param next - the legacy 下一步 lines for this card.
 * @returns the optional title marker and the 下一步 lines to render.
 */
function dispatchParts(
  outcome: GoDispatchOutcome,
  next: readonly string[],
): { readonly marker?: string; readonly next: readonly string[] } {
  switch (outcome) {
    case 'sent':
      return {
        marker: DISPATCH_SENT_MARKER,
        next: [
          '工单已送达本会话（只读「/baf-go 派单」条目），模型正在补齐产物',
          '模型结束回合后系统自动弹出下一阶段裁决卡；也可再敲 /baf-go 查看进度',
        ],
      }
    case 'deduped':
      return {
        marker: `${DISPATCH_SENT_MARKER} · 等待补齐`,
        next: ['同样缺口的工单已派过，正在等模型补齐', '缺口变小后再敲 /baf-go 会派出新工单'],
      }
    case 'busy':
      return {
        marker: '模型回合进行中',
        next: ['模型正在干活，本单暂不重派', '回合结束后再敲 /baf-go 查看进度'],
      }
    case 'unavailable':
      return { next }
  }
}

/**
 * A coordinator success card, titled from the `/baf-go` descriptor (§20.2).
 * @param runtime - runtime qualifier.
 * @param sections - card sections.
 * @param marker - optional state marker appended to the title (§18.4.2 dispatch).
 * @returns CommandResult.
 */
function successCard(runtime: string, sections: readonly Section[], marker?: string): CommandResult {
  const title = marker === undefined
    ? cardTitle('/baf-go', runtime)
    : `${runtime} · ${marker} · 点本行展开/折叠详情`
  return { kind: 'success', text: formatCommandReport(true, title, sections) }
}

/**
 * A coordinator attention card.
 *
 * `kind: 'error'` is the only kind the surface renders as a stop, and every
 * use here is exactly that — the flow is waiting on the customer (§18.5) or on
 * the model (§18.4.2). The `marker` form is the gate-card title §18.5 pins.
 * @param runtime - runtime qualifier.
 * @param sections - card sections.
 * @param marker - optional state marker appended to the title.
 * @returns CommandResult.
 */
function errorCard(runtime: string, sections: readonly Section[], marker?: string): CommandResult {
  const title = marker === undefined
    ? cardTitle('/baf-go', runtime)
    : `${runtime} · ${marker} · 点本行展开/折叠详情`
  return { kind: 'error', text: formatCommandReport(false, title, sections) }
}
