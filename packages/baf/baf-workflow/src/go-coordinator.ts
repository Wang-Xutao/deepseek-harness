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
  type TransitionSource,
  type WorkflowNode,
  type WorkflowStatus,
} from '@deepseek-ai/dsh-baf-core'
import { ProjectionStore } from './projection.ts'
import { isActiveChange } from './projection.ts'
import { StagePipeline } from './stages/pipeline.ts'
import { implementGate } from './stages/gates.ts'
import { readLedger } from './stages/implement.ts'
import { formatCommandReport } from './command-format.ts'
import { parseArgs, valueOf } from './cli-args.ts'
import {
  cardTitle,
  driveClassify,
  driveGateResolve,
  driveOpen,
  driveResume,
  driveScaffold,
  loadWorkspaceBaseline,
  pipelineFor,
  renderDomainError,
  statusLines,
  type DriveAdapters,
} from './command-drives.ts'
import { GATE_REGISTRY, renderGate, type GateId } from './gate-cards.ts'
import { judgmentOf } from './gate-dialog.ts'
import type { GateJudgment } from './gate-dialog.ts'
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
      const resolved = await resolveViaDialog(input.ask, cwd, input.adapters ?? {}, { gateId: 'scaffold' })
      return resolved ?? withContinueHint(card)
    }

    const store = new ProjectionStore({ workspaceRoot: cwd })
    const args = parseArgs(input.rawInput ?? '')
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
    // the intake classifier (no `baf-go + 需求` ceremony). The change it mints
    // then becomes this session's focus: it was created by this conversation,
    // so binding it is recording a fact, not the §18.6.4 kind of guessing.
    if (focused === undefined && actives.length === 0 && explicit === undefined
      && requirement !== '') {
      const before = new Set(actives.map(c => c.changeId))
      const card = await driveOpen(cwd, requirement, input.source ?? 'slash')
      input.focus?.set(await mintedChange(store, before))
      return card
    }

    const binding = resolveBinding({
      actives,
      known: index.changes.map(c => c.changeId),
      focused,
      explicit,
      wantsContinue: args.positionals.includes('continue'),
      requirement,
    })
    if (binding.kind === 'stop') return binding.card
    input.focus?.set(binding.changeId)

    const pipeline = await pipelineFor(cwd, input.adapters ?? {})
    return await route({
      cwd,
      store,
      pipeline,
      changeId: binding.changeId,
      resumeTarget,
      source: input.source ?? 'slash',
      adapters: input.adapters ?? {},
      ...(input.ask === undefined ? {} : { ask: input.ask }),
      confirm: input.confirm === true,
    })
  } catch (error) {
    return renderDomainError('/baf-go', error)
  }
}

/**
 * The change an open just added to the index — the only active id that was not
 * there before.
 * @param store - projection store.
 * @param before - active change ids seen before the open.
 * @returns the new change id, or undefined when the open wrote nothing.
 */
async function mintedChange(
  store: ProjectionStore,
  before: ReadonlySet<string>,
): Promise<string | undefined> {
  const index = await store.readIndex()
  const fresh = index.changes.filter(c => !before.has(c.changeId) && isActiveChange(c))
  return fresh.at(-1)?.changeId
}

/**
 * Decide which change this session is about (§18.3.1, §18.4.1, §18.6).
 *
 * Never guesses: even a lone candidate is the customer's call to adopt
 * (§18.6.4), so "continue" is an explicit word rather than a default. The one
 * case that is not a guess — a requirement stated while nothing is active —
 * is resolved in {@link driveGo} before this runs, because minting it is async.
 * @param input - binding inputs.
 * @returns bound change id, or the card that must be shown instead.
 */
function resolveBinding(input: {
  readonly actives: readonly ActiveRow[]
  readonly known: readonly string[]
  readonly focused: string | undefined
  readonly explicit: string | undefined
  readonly wantsContinue: boolean
  readonly requirement: string
}): { kind: 'bound'; changeId: string } | { kind: 'stop'; card: CommandResult } {
  const { actives, known, focused, explicit, wantsContinue, requirement } = input

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

  // A focused change that is no longer active still binds: §18.4.2 wants the
  // "already terminal" card, not the "nothing unfinished" one — the customer
  // needs to know the workflow they were driving ended, not that it vanished.
  if (focused !== undefined && (actives.some(c => c.changeId === focused) || known.includes(focused))) {
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

  if (actives.length === 1 && wantsContinue) {
    const only = actives[0]
    if (only === undefined) throw new Error('unreachable: actives.length === 1 with no element')
    return { kind: 'bound', changeId: only.changeId }
  }

  return {
    kind: 'stop',
    card: errorCard('请选择本会话的工作流', [
      { title: '检测到未完成工作流', lines: listActives(actives) },
      {
        title: '选择',
        lines: actives.length === 1
          ? ['/baf-go continue    继续这条工作流']
          : ['/baf-go change=<changeId>    指定本会话的工作流'],
      },
      {
        title: '新开',
        lines: ['cwd 仍有未终态变更：先收尾（/baf-workflow-abandon confirm）或另开会话'],
      },
    ]),
  }
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
        const resolved = await resolveViaDialog(context.ask, context.cwd, context.adapters, {
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
          const resolved = await resolveViaDialog(context.ask, context.cwd, context.adapters, {
            gateId: 'intake-classify',
            changeId,
            ...(status.intake === undefined ? {} : { judgment: judgmentOf(status.intake) }),
          })
          if (resolved !== undefined) return resolved
          return withContinueHint(await driveClassify(cwd, `change=${changeId}`, source))
        }
        return driveClassify(cwd, `change=${changeId}`, source)
      }
      // Confirmed but never opened: no customer decision is pending — every
      // other surface treats confirm + open as one action, so finish it here
      // rather than asking the customer to retype the command.
      return driveClassify(cwd, `confirm change=${changeId}`, source)
    }

    case 'open': {
      if (status.mode === 'bug-fix-path') {
        const next = await pipeline.enterImplementStage(changeId, source)
        return successCard('已进入 implement', [
          { title: '状态', lines: statusLines(next) },
          { title: '纪律', lines: ['先补回归测试，再改代码', '只允许 plan.json allowlist 内文件'] },
        ])
      }
      const next = await pipeline.beginDocStage(changeId, 'clarify', source)
      return successCard('clarify 已进入 · 模板已装', [
        { title: '状态', lines: statusLines(next) },
        {
          title: '接下来',
          lines: [`模型填 openspec/changes/${changeId}/ 下的 TODO`, '填完敲 /baf-go 裁决'],
        },
      ])
    }

    case 'clarify': {
      const prep = await prepareDoc(pipeline, changeId, 'clarify', at('clarify'), source)
      if (prep.kind === 'card') return prep.card
      const next = await pipeline.beginDocStage(changeId, 'design', source)
      return successCard('clarify 已裁决通过 · design 已进入', [
        { title: '状态', lines: statusLines(next) },
        { title: '接下来', lines: ['模型填 design.md，填完敲 /baf-go'] },
      ])
    }

    case 'design': {
      const prep = await prepareDoc(pipeline, changeId, 'design', at('design'), source)
      if (prep.kind === 'card') return prep.card
      // **Gate A** (§18.5 / §22.17). One park, three unlock shapes: the
      // dialog's confirm option (dispatched as a gate-card `/baf-go` with no
      // ask channel, so the legacy tail check below sees the unlock),
      // `/baf-go-confirm` (positive-path mode), and — with no popup channel
      // (CLI/tests) — the customer typing `baf-go` again.
      const parked = await gateUnlocked(store, changeId, 'design-to-plan')
      if (!parked) await parkOnGate(store, changeId, 'design-to-plan')
      const proceed = async (): Promise<CommandResult> => {
        const next = await pipeline.beginDocStage(changeId, 'plan', source)
        return successCard('设计已确认 · 已进入计划阶段', [
          { title: '状态', lines: statusLines(next) },
          { title: '接下来', lines: ['模型填 plan.md / plan.json，填完敲 /baf-go'] },
        ])
      }
      if (context.confirm) return proceed()
      if (context.ask !== undefined) {
        // Every /baf-go on a parked gate re-pops the dialog (§22.17) — the
        // customer who paused via the popup revives it by typing /baf-go.
        const resolved = await resolveViaDialog(context.ask, context.cwd, context.adapters, { gateId: 'design-confirm', changeId })
        if (resolved !== undefined) return resolved
        return withContinueHint(renderGate('design-confirm', { cwd, changeId }))
      }
      // §22.14-D: render the registered §22 card verbatim so slash, Tab,
      // and the coordinator agree on options / commands. The card is
      // `kind: 'error'` so the surface still renders it as a stop.
      return parked ? proceed() : renderGate('design-confirm', { cwd, changeId })
    }

    case 'plan': {
      const prep = await prepareDoc(pipeline, changeId, 'plan', at('plan'), source)
      if (prep.kind === 'card') return prep.card
      const next = await pipeline.enterImplementStage(changeId, source)
      return successCard('plan 已裁决通过 · implement 已进入', [
        { title: '状态', lines: statusLines(next) },
        {
          title: '纪律',
          lines: ['只改 plan.json allowlist 内文件（baf-guard 硬门禁）', '全部任务完成后敲 /baf-go'],
        },
      ])
    }

    case 'implement': {
      if (at('implement') === 'completed') return driveVerifyNow(context)
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
        // Still waiting on the model: report progress, change nothing.
        const done = ledger.tasks.filter(t => (t as { done?: boolean }).done === true).length
        return errorCard('implement 进行中 · 等模型', [
          {
            title: '状态',
            lines: [...statusLines(status), `任务: ${done}/${ledger.tasks.length} done`],
          },
          {
            title: '裁决门',
            lines: gate.reasonCodes.map(code => `${code}  ${gate.detail ?? ''}`.trim()),
          },
          { title: '下一步', lines: ['模型补齐后敲 /baf-go'] },
        ])
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
      return driveVerifyNow(context)
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
        const resolved = await resolveViaDialog(context.ask, context.cwd, context.adapters, { gateId: 'verify-archive', changeId })
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
 * Bring a documentation node to `completed`, or return the card that says why
 * it cannot move yet.
 *
 * Three cases, in the order the pipeline expects them: already completed (no
 * write at all), not yet started (install the template — safe to re-drive,
 * because `enterStage` returns early on an in-progress node), and in progress
 * (run the durable gate).
 * @param pipeline - stage pipeline.
 * @param changeId - change id.
 * @param node - clarify / design / plan.
 * @param nodeStatus - current status of that node.
 * @returns `completed`, or a card to render instead.
 */
async function prepareDoc(
  pipeline: StagePipeline,
  changeId: string,
  node: 'clarify' | 'design' | 'plan',
  nodeStatus: string | undefined,
  source: TransitionSource,
): Promise<{ kind: 'completed' } | { kind: 'card'; card: CommandResult }> {
  if (nodeStatus === 'completed') return { kind: 'completed' }
  if (nodeStatus !== 'in-progress') {
    const next = await pipeline.beginDocStage(changeId, node, source)
    return {
      kind: 'card',
      card: successCard(`${node} 已进入 · 模板已装`, [
        { title: '状态', lines: statusLines(next) },
        {
          title: '接下来',
          lines: [`模型填 openspec/changes/${changeId}/ 下的 TODO`, '填完敲 /baf-go'],
        },
      ]),
    }
  }
  try {
    await pipeline.completeDocStage(changeId, node)
    return { kind: 'completed' }
  } catch (error) {
    if (isBafError(error) && error.code === 'invalid_transition') {
      return {
        kind: 'card',
        card: errorCard(`${node} 裁决门未通过`, [
          { title: '原因', lines: [error.message] },
          {
            title: '下一步',
            lines: [
              `模型补齐 openspec/changes/${changeId} 下 ${node} 的产物后敲 /baf-go`,
              `单独重跑：/baf-workflow-${node} change=${changeId} done`,
            ],
          },
        ]),
      }
    }
    throw error
  }
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
    return errorCard('必需检查未通过 · 退回实现阶段', [
      { title: '检查', lines: rows.length === 0 ? ['（无检查项）'] : rows },
      { title: '失败详情', lines: failures.length === 0 ? ['（无诊断信息）'] : failures },
      { title: '报告', lines: [driven.result.reportPath] },
      { title: '下一步', lines: ['模型修复后敲 /baf-go'] },
    ])
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
 * @param context - routing context (cwd + adapters + ask channel).
 * @param gate - which gate to pop, with change id / resume candidates.
 * @returns the dispatched drive's card, or undefined when the customer
 *   paused or no dialog could show (callers fall back to the plain card).
 */
async function resolveViaDialog(
  ask: GateAsk,
  cwd: string,
  adapters: DriveAdapters,
  gate: {
    readonly gateId: GateId
    readonly changeId?: string
    readonly resumeCandidates?: readonly WorkflowNode[]
  },
): Promise<CommandResult | undefined> {
  const outcome = await ask(gate)
  if (outcome.kind !== 'answered') return undefined
  const opts = gate.changeId === undefined ? undefined : { changeId: gate.changeId }
  return driveGateResolve(cwd, gate.gateId, outcome.optionId, adapters, gate.resumeCandidates, 'gate-card', opts)
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
 * A coordinator success card, titled from the `/baf-go` descriptor (§20.2).
 * @param runtime - runtime qualifier.
 * @param sections - card sections.
 * @returns CommandResult.
 */
function successCard(runtime: string, sections: readonly Section[]): CommandResult {
  return { kind: 'success', text: formatCommandReport(true, cardTitle('/baf-go', runtime), sections) }
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
