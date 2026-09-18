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
 * 3. **The two mandatory confirmation gates** (§18.5): stop after design and
 *    again after verify, and treat "customer typed `baf-go` again" as the
 *    confirmation — there is deliberately **no** `baf-go confirm`.
 *
 * Idempotent throughout: re-running on a resting point re-renders its card and
 * writes nothing.
 *
 * @module @deepseek-ai/dsh-baf-workflow/go-coordinator
 */

import type { CommandResult } from '@deepseek-ai/dsh-commands'
import {
  isBafError,
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
  driveOpen,
  driveResume,
  pipelineFor,
  renderDomainError,
  statusLines,
  type DriveAdapters,
} from './command-drives.ts'
import { renderGate } from './gate-cards.ts'
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
}

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
      card: successCard('无未完成工作流', [
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

/**
 * Route a bound change to its next action (§18.4.2).
 *
 * Chaining rule: keep moving while the next step needs no model-authored
 * content, and stop at the first point that needs either the model (authoring
 * a template) or the customer (a confirmation gate, a choice, a fix).
 * @param context - bound routing context.
 * @returns the card for the resting point.
 */
async function route(context: {
  readonly cwd: string
  readonly store: ProjectionStore
  readonly pipeline: StagePipeline
  readonly changeId: string
  readonly resumeTarget: WorkflowNode | undefined
  readonly source: TransitionSource
}): Promise<CommandResult> {
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
  // Auto-picking it would silently invalidate completed work.
  if (node === 'drift') {
    const forward = resumeTarget === undefined ? '' : ` ${resumeTarget}`
    return driveResume(cwd, `change=${changeId}${forward}`, source)
  }

  switch (node) {
    case 'intake': {
      // Not yet confirmed → (re)surface the classification card (§18.4.1).
      // The card's own 确认/补充/退出 is where that decision is made; `baf-go`
      // only replays it, because §18.2 reserves "baf-go means confirm" for the
      // two gates, not for intake.
      if (status.intake?.confirmation !== 'confirmed') {
        return driveClassify(cwd, `change=${changeId}`, source)
      }
      // Confirmed but never opened: no customer decision is pending — every
      // other surface treats confirm + open as one action, so finish it here
      // rather than asking the customer to retype the command.
      return driveClassify(cwd, `confirm change=${changeId}`, source)
    }

    case 'open': {
      if (status.mode === 'bug-fast-path') {
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
      // **Gate A** (§18.5). The unlock is the customer typing `baf-go` once
      // more, observed as the matching `awaiting-confirm` at the log tail.
      if (!(await gateUnlocked(store, changeId, 'design-to-plan'))) {
        await parkOnGate(store, changeId, 'design-to-plan')
        // §22.14-D: render the registered §22 card verbatim so slash, Tab,
        // and the coordinator agree on options / commands. The card is
        // `kind: 'error'` so the surface still renders it as a stop.
        return renderGate('design-confirm', { cwd, changeId })
      }
      const next = await pipeline.beginDocStage(changeId, 'plan', source)
      return successCard('门 A 已确认 · plan 已进入', [
        { title: '状态', lines: statusLines(next) },
        { title: '接下来', lines: ['模型填 plan.md / plan.json，填完敲 /baf-go'] },
      ])
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
      if (at('implement') === 'completed') return driveVerifyNow(cwd, store, pipeline, changeId, source)
      const ledger = await readLedger(cwd, changeId)
      const gate = await implementGate(
        {
          workspaceRoot: cwd,
          changeId,
          mode: status.mode === 'bug-fast-path' ? 'bug-fast-path' : 'full-go',
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
      // §18.4.2: a T15 escalation rewrites the lane to full-go; the session
      // stays put and the next `baf-go` lands on clarify.
      if (driven.result.escalated !== undefined) {
        const after = await store.readStatus(changeId)
        return errorCard('T15 已升级 full-go', [
          { title: '原因', lines: [driven.result.escalated.cause] },
          { title: '状态', lines: statusLines(after) },
          {
            title: '说明',
            lines: [
              'fast-path 泳道保留可追溯（升级边 T15）',
              '缺口 clarify/design/plan 将按 full-go 补走',
              '敲 /baf-go 继续',
            ],
          },
        ])
      }
      return driveVerifyNow(cwd, store, pipeline, changeId, source)
    }

    case 'verify': {
      if (at('verify') !== 'completed') return driveVerifyNow(cwd, store, pipeline, changeId, source)
      // **Gate B** (§18.5) — archiving is the customer's call, not the
      // coordinator's. Same unlock rule as gate A.
      if (!(await gateUnlocked(store, changeId, 'verify-to-archive'))) {
        await parkOnGate(store, changeId, 'verify-to-archive')
        // §22.14-D: render the registered §22 card verbatim.
        return renderGate('verify-archive', { cwd, changeId })
      }
      const driven = await pipeline.driveArchiveStage(changeId, true, source)
      if (driven.node !== 'archive') throw new Error(`expected an archive drive, got ${driven.node}`)
      const after = await store.readStatus(changeId)
      return successCard('门 B 已确认 · 已归档', [
        { title: '状态', lines: statusLines(after) },
        { title: '产物', lines: [driven.result.archivePath] },
        { title: '下一步', lines: ['本条工作流结束；新需求请在新会话中提出'] },
      ])
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
      return errorCard(`未识别的节点 ${node}`, [
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
 * @param store - projection store.
 * @param pipeline - stage pipeline.
 * @param changeId - change id.
 * @returns verify outcome card.
 */
async function driveVerifyNow(
  cwd: string,
  store: ProjectionStore,
  pipeline: StagePipeline,
  changeId: string,
  source: TransitionSource,
): Promise<CommandResult> {
  const driven = await pipeline.driveVerifyStage(changeId, new AbortController().signal, source)
  if (driven.node !== 'verify') throw new Error(`expected a verify drive, got ${driven.node}`)
  const rows = driven.result.report.checks.map(
    row => `${row.ok ? '✓' : '✗'} ${row.name}${row.required ? '' : '（非必需）'}`,
  )
  if (driven.result.backToImplement) {
    const failures = driven.result.report.checks
      .filter(row => !row.ok)
      .map(row => `${row.name}: ${row.diagnostics.join('; ')}`)
    return errorCard('必需检查失败 · T11 回实现', [
      { title: '检查', lines: rows.length === 0 ? ['（无检查项）'] : rows },
      { title: '失败详情', lines: failures.length === 0 ? ['（无诊断信息）'] : failures },
      { title: '报告', lines: [driven.result.reportPath] },
      { title: '下一步', lines: ['模型修复后敲 /baf-go'] },
    ])
  }
  // Verify passed → re-route so gate B owns the next move (single source).
  return route({ cwd, store, pipeline, changeId, resumeTarget: undefined, source })
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
  const { status: next } = await store.append(changeId, status.projectionVersion, meta => ({
    type: 'awaiting-confirm',
    gate,
    ...meta,
  }))
  return next
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
    : `${runtime} · ${marker} · 点本行展开/折叠指令全文`
  return { kind: 'error', text: formatCommandReport(false, title, sections) }
}
