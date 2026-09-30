/**
 * §22.19 orchestrator — the harness-owned workflow line (session 7.jsonl).
 *
 * User principle (2026-09-21, non-negotiable): the workflow is ONE fixed
 * line. When to pop, when to wait, when to advance — all of it is standard,
 * project-independent harness code; the model cannot manipulate or skip
 * transitions, it only does business logic (clarify content, design drafts,
 * implementation). This row is that principle made executable: it subscribes
 * `session/event`, and after every **completed** model turn it re-derives
 * the change's resting point and pops whatever gate is due — classification,
 * advancement, the two mandatory confirm gates, drift resume, the bind
 * choice, or workspace scaffold. The customer's click resolves through
 * `driveGateResolve`, the same single resolution surface the Tab, the
 * dialogs, and the coordinator use.
 *
 * Convergence, not duplication: every pop rides the session's single-flight
 * ask queue (`askGateDialogQueued`), so when the coordinator (`/baf-go`),
 * `baf_gate_ask`, or auto-pop already has the same gate up, this row's entry
 * collapses to a duplicate drop instead of covering it (session 7.jsonl R2).
 * Anti-spam: a ledger keyed `cwd | changeId | gateId → projectionVersion`
 * never re-offers the same gate on the same projection — the model's next
 * real work changes the projection and thereby re-arms the gate.
 *
 * Layering: host-plane glue only (like `baf-auto-pop`), outside the
 * `baf-domain` isolate — it reaches the host `agents` registry and
 * `userQuestions`. Every failure is contained: fire-and-forget, must never
 * influence the turn stream it observes.
 *
 * @module @deepseek-ai/dsh-baf-workflow/orchestrator
 */

import type { Context } from '@deepseek-ai/cordis'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { WorkflowNode, WorkflowStatus } from '@deepseek-ai/dsh-baf-core'
import type {} from '@deepseek-ai/dsh-session' // Context 'session/event' augmentation
import type {} from '@deepseek-ai/dsh-user-questions' // Context.userQuestions augmentation
import {
  askGateDialogQueued,
  judgmentOf,
  resolveUserQuestions,
  toolDriveAdapters,
  type GateDialogAgent,
  type GateDialogInput,
} from './gate-dialog.ts'
import { driveGateResolve, loadWorkspaceBaseline, pipelineFor } from './command-drives.ts'
import { dispatchGateRevisionFromTab, dueGateFor } from './go-coordinator.ts'
import { expireDispatchLedger, makeGoDispatcher, artifactPathFor } from './go-dispatch.ts'
import { continueParkedRequirement } from './requirement-park.ts'
import { resetScaffoldOffer, scaffoldDialogOffered } from './scaffold-offer.ts'
import type { GateId } from './gate-cards.ts'
import { bugRecordGate, checklistGate, clarifyGate, designGate, planGate, implementGate, proposalGate, type GateInput } from './stages/gates.ts'
import { readLedger } from './stages/implement.ts'
import { focusFor } from './session-focus.ts'
import { isActiveChange, pickActiveChange, ProjectionStore } from './projection.ts'
import type { ProjectionIndexEntry } from './projection.ts'

/** Preset row identity — referenced from `agent.cordis.yml`. */
export const name = 'baf-orchestrator'

/** Host-plane services: the live agents registry and the question waterfall. */
export const inject = ['agents', 'userQuestions'] as const

/** Structural view of the session/event payload this row consumes. */
interface SessionLike {
  readonly header: { readonly id: string; readonly cwd?: string }
}

/** Audit-line timestamp helper (the coordinator/session-gate log format). */
function stamp(): string {
  return new Date().toISOString()
}

/**
 * One row instance per host process — the anti-spam ledger lives here.
 * Host-plane rows are process singletons, so a module-level store is
 * equivalent to instance state. (The scaffold once-per-session memory moved
 * to the shared `scaffold-offer` marker — it must count other channels' pops,
 * which live in other bundle copies.)
 */
const OFFERED = new Map<string, string>()

/** Reset the orchestrator memories (tests). */
export function resetOrchestrator(): void {
  OFFERED.clear()
  resetScaffoldOffer()
}

/**
 * Install the turn/end listener. The fixed line per completed turn:
 * scaffold (uninitialized workspace) → binding → the due gate of the bound
 * change. Anything else — the model authoring artifacts, terminal changes,
 * idle workspaces — stays silent (that is auto-pop's or the model's domain).
 */
export function apply(ctx: Context): void {
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'turn/end') return
    // Only a completed turn means "the model finished its slice" — aborted /
    // error / blocked / max-tokens turns are mid-work, not a resting point.
    if ((event.data as { reason?: { kind?: string } }).reason?.kind !== 'completed') return
    const s = session as unknown as SessionLike
    const cwd = s.header.cwd
    if (cwd === undefined || cwd === '') return
    void orchestrateTurn(ctx, s, cwd)
      .catch((error: unknown) => {
        ctx.logger.warn(`baf-orchestrator: turn orchestration failed: ${error instanceof Error ? error.message : String(error)}`)
      })
  })
}

/**
 * The whole §22.19 turn evaluation for one session + cwd, best-effort.
 */
async function orchestrateTurn(ctx: Context, session: SessionLike, cwd: string): Promise<void> {
  const sessionId = String(session.header.id)

  // 【变更】2026-09-23 (user issue #4): a completed turn re-arms the §18.4.2
  // dispatch ledger for this workspace. Every order sent before this turn has
  // been consumed or ignored by it; a gap that survives the turn must be
  // re-dispatchable by the customer's next `/baf-go`, not answered forever
  // with 「已派单 · 等待补齐」 while the model idles.
  expireDispatchLedger(cwd)

  // ① Workspace not initialized → the scaffold gate, once per session. This
  // is the only decision an empty workspace has, and §22.17 already renders
  // it as a gate — the orchestrator just makes sure it pops without the
  // model remembering to ask.
  // 【变更】2026-09-23 (demo2 re-test): "once per session" now counts EVERY
  // channel's offer, not just this row's own pops — the marker is recorded by
  // askGateDialogQueued (gate-ask bootstrap, the coordinator's /baf-go re-pop,
  // the Tab button, and this row) and shared across bundle copies. The old
  // local SCAFFOLD_SEEN missed the mid-turn gate-ask dialog, so a 暂不初始化
  // click was immediately re-asked at that same turn's end.
  if (await loadWorkspaceBaseline(cwd) === undefined) {
    if (scaffoldDialogOffered(sessionId)) return
    await popGate(ctx, cwd, sessionId, {
      gateId: 'scaffold',
    }, 'no-baseline', `${cwd} || scaffold || ${sessionId}`,
    // Moot the moment a baseline appears by any route (model /baf-scaffold,
    // a second host process, the click itself resolving elsewhere).
    async () => await loadWorkspaceBaseline(cwd) !== undefined)
    // 【变更】2026-09-23 (demo2 user issue #1): a scaffold the customer just
    // resolved with 初始化工作区 must not dead-end — the requirement they
    // stated before it (parked by baf-auto-pop) continues onto the
    // initialized workspace as the 新建工作流 → 分类确认 chain. No-op when
    // nothing is parked (the click answered 暂不初始化, or no requirement was
    // ever stated).
    const agent = ctx.agents.get(sessionId as Parameters<typeof ctx.agents.get>[0])
    if (agent !== undefined) {
      await continueParkedRequirement(ctx, agent, cwd)
    }
    return
  }

  // ② Binding: which change does this workspace's workflow line sit on?
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const index = await store.readIndex()
  const actives = index.changes.filter(isActiveChange)
  if (actives.length === 0) return // idle: auto-pop's domain, not ours

  const focused = focusFor(cwd).get()
  const bound: ProjectionIndexEntry | undefined = focused !== undefined
    ? actives.find(entry => entry.changeId === focused)
    : undefined
  if (bound === undefined) {
    const picked = pickActiveChange(index.changes)
    if (picked.kind === 'ambiguous') {
      // ②' §22.19 R4 — the multi-active binding choice pops as the
      // registered gate; the click binds via the same /baf-go dispatch.
      await popBind(ctx, cwd, sessionId, actives)
    }
    if (picked.kind !== 'one') return // ambiguous handled above; terminal → silent
    await popDueGate(ctx, cwd, sessionId, store, picked.changeId)
    return
  }

  // ③ The due gate for the bound change — the fixed line's decision point.
  await popDueGate(ctx, cwd, sessionId, store, bound.changeId)
}

/**
 * Shared pop-and-resolve for one registered gate: ledger check → queued pop
 * (moot re-checked at queue head) → click dispatches through the same
 * `driveGateResolve` surface every other channel uses. Paused and dropped
 * outcomes record the ledger too — the same projection never re-offers; the
 * customer revives with /baf-go or the Tab.
 */
async function popGate(
  ctx: Context,
  cwd: string,
  sessionId: string,
  gate: GateDialogInput,
  fingerprint: string,
  ledgerKey: string,
  isMoot: () => boolean | Promise<boolean>,
): Promise<void> {
  if (OFFERED.get(ledgerKey) === fingerprint) return
  const agent = ctx.agents.get(sessionId as Parameters<typeof ctx.agents.get>[0])
  if (agent === undefined) return
  const service = resolveUserQuestions(ctx, agent)
  if (service === undefined) return

  const outcome = await askGateDialogQueued(service, agent as GateDialogAgent, gate, {
    sessionId,
    isMoot,
  })
  OFFERED.set(ledgerKey, fingerprint)
  // 【变更】2026-09-28 (用户问题 1.7): the auto-pop's revision input — the
  // custom answer is a customer action on this session, so the SAME
  // gate-revise dispatch the coordinator's gate surface takes applies here;
  // the artifact edit re-arms this pop's fingerprint and the gate re-pops
  // after the model reworks the document.
  if (outcome.kind === 'revise') {
    const revisionDispatch = makeGoDispatcher(cwd, agent)
    const revisionCard = dispatchGateRevisionFromTab(cwd, revisionDispatch, gate.gateId, gate.changeId, outcome.text)
    ctx.logger.info(
      `${stamp()} - session baf:orchestrate gate=${gate.gateId} change=${gate.changeId ?? '-'} outcome=revise dispatched=${revisionCard !== undefined} textLen=${outcome.text.length}`,
    )
    return
  }
  const outcomeNote = outcome.kind === 'answered'
    ? ` option=${outcome.optionId}`
    : ` reason=${outcome.reason}`
  ctx.logger.info(`${stamp()} - session baf:orchestrate gate=${gate.gateId} change=${gate.changeId ?? '-'} outcome=${outcome.kind}${outcomeNote}`)
  if (outcome.kind !== 'answered') return

  // 【变更】2026-09-22 (user report #1): the click resolves through the same
  // driveGateResolve surface every channel uses. 【变更】2026-09-23 (user
  // issue #1): the answered dialog is a customer action, so the resolve drive
  // carries this session's work-order channel — a confirm that advances into
  // a template rest now dispatches the order that wakes the model, instead of
  // leaving the freshly-installed template in silence.
  const gateDispatch = makeGoDispatcher(cwd, agent)
  const result = await driveGateResolve(
    cwd,
    gate.gateId,
    outcome.optionId,
    toolDriveAdapters(ctx, agent, cwd),
    gate.resumeCandidates,
    gate.bindCandidates,
    'gate-card',
    {
      ...(gate.changeId === undefined ? {} : { changeId: gate.changeId }),
      ...(gateDispatch === undefined ? {} : { dispatch: gateDispatch }),
    },
  )
  ctx.logger.info(`${stamp()} - session baf:orchestrate gate=${gate.gateId} change=${gate.changeId ?? '-'} resolved=${result.kind}${result.kind === 'error' ? ` text=${result.text.slice(0, 160).replaceAll('\n', ' ')}` : ''}`)
}

/**
 * The advance gate owed when the current doc stage's artifacts already pass
 * their file gate — the same judgment `/baf-go` applies, evaluated at turn
 * end so the customer gets the decision card without typing anything.
 */
async function docAdvanceDue(cwd: string, changeId: string, status: WorkflowStatus): Promise<GateId | undefined> {
  const input: GateInput = { workspaceRoot: cwd, changeId, mode: status.mode === 'bug-fix-path' ? 'bug-fix-path' : 'full-go-path' }
  switch (status.current) {
    // 【变更】2026-09-22 (user report #1): open-advance is file-aware now —
    // the card pops only when proposal.md passes its gate, mirroring
    // clarify/design/plan (dueGateFor's open case returned undefined above).
    // 【变更】2026-09-26 (用户需求 工作流 3): bug-fix-path pops its clipped
    // counterpart once proposal.md passes bugRecordGate — the draft-open
    // record is the model's authoring domain until then.
    case 'open': return input.mode === 'bug-fix-path'
      ? (await bugRecordGate(input)).ok ? 'bugfix-open-advance' : undefined
      : (await proposalGate(input)).ok ? 'open-advance' : undefined
    case 'clarify': return (await clarifyGate(input)).ok ? 'clarify-advance' : undefined
    case 'design': return (await designGate(input)).ok ? 'design-advance' : undefined
    case 'plan': return (await planGate(input)).ok ? 'plan-advance' : undefined
    // 【变更】2026-09-23 (demo1 十问题 8): implement completed → verify entry
    // is the due decision (the gate /baf-go pops; the moot re-check reads the
    // same derivation).
    // 【变更】2026-09-28 (用户问题 8): the checklist must exist with real items
    // before the card pops — its question asserts checklist.md 已生成, so a
    // missing checklist keeps the rest in the model's authoring domain (the
    // customer's /baf-go refuses with the authoring order instead).
    case 'implement': {
      const ledger = await readLedger(cwd, changeId).catch(() => undefined)
      if (ledger === undefined) return undefined
      const gate = await implementGate(input, ledger.touched).catch(() => undefined)
      if (gate === undefined || !gate.ok) return undefined
      return (await checklistGate(input).catch(() => undefined))?.ok === true ? 'verify-advance' : undefined
    }
    default: return undefined
  }
}

/**
 * The change's resting-point gate, projection markers first, then the
 * doc-aware layer — ONE derivation shared by the pop path and the queue's
 * head-of-line moot re-check (a projection-only re-check cancels every
 * doc-aware pop the moment it leaves the caller's hands).
 * @param cwd - workspace root.
 * @param changeId - the change to evaluate.
 * @returns the due gate, or undefined when the resting point is the model's
 * authoring domain.
 */
async function deriveDueGate(cwd: string, changeId: string): Promise<{ readonly gateId: GateId; readonly changeId: string } | undefined> {
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const status = await store.readStatus(changeId)
  const { events } = await store.readEvents(changeId)
  const due = dueGateFor(status, events)
  if (due !== undefined || status.terminal !== undefined) return due
  const advance = await docAdvanceDue(cwd, changeId, status).catch(() => undefined)
  return advance === undefined ? undefined : { gateId: advance, changeId }
}

/** ③ — derive the due gate for one change and pop it if due. */
async function popDueGate(
  ctx: Context,
  cwd: string,
  sessionId: string,
  store: ProjectionStore,
  changeId: string,
): Promise<void> {
  const status = await store.readStatus(changeId)
  const { events } = await store.readEvents(changeId)
  let due = dueGateFor(status, events)
  // 【变更】2026-09-23 (demo5 issue #1): the status the pop's fingerprint reads
  // — swapped for a fresh read whenever the settle below advances the change.
  let live = status

  // 【变更】2026-09-22 (web walk stall #2): `dueGateFor` only sees projection
  // markers — a doc stage whose artifact is ALREADY filled in still reads as
  // "the model's authoring domain" (nodes.clarify !== 'completed', the marker
  // only lands when an advance drive runs), so the advance gate never popped
  // and the customer had nothing to click while a finished clarify.md sat on
  // disk. The file gates `/baf-go` runs are the same judgment: when they
  // pass, the advance gate IS the due decision. implement has no registered
  // gate because the next step is system-run verify, not a customer choice —
  // dispatch the same plain `/baf-go` the coordinator would run, then
  // re-derive: the verify-archive card is the customer's decision point.
  if (due === undefined && status.terminal === undefined) {
    // 【变更】2026-09-23 (demo1 十问题 8): docAdvanceDue now derives the
    // implement→verify entry gate too (implementGate ok → 'verify-advance') —
    // the special-case branch that auto-RAN verification here is gone; the
    // gate pops and the confirm click drives the run.
    const advance = await docAdvanceDue(cwd, changeId, status).catch(() => undefined)
    if (advance !== undefined) {
      // 【变更】2026-09-23 (demo5 issue #1/#4): settle the doc stage BEFORE the
      // dialog pops. The pop used to fire while nodes.clarify/design/plan
      // still read in-progress and plan.md/tasks.md still sat as unfilled
      // templates beside a passing ledger — the rail contradicted the
      // 「可推进」 dialog and the artifacts only materialized after the
      // customer clicked 推进到实现. Adjudicating the same completeDocStage
      // the click would run lands the stage-completed marker and renders
      // plan.md + tasks.md from the ledger FIRST, so the card confirms
      // artifacts the rail already shows（产物生成后，客户确认才推动工作流）.
      // The settled resting point still owes the same advance gate
      // (dueGateFor: nodes.X completed → X-advance), so the pop below and the
      // queue's moot re-check agree by construction.
      if (advance === 'clarify-advance' || advance === 'design-advance' || advance === 'plan-advance') {
        const node = advance === 'clarify-advance' ? 'clarify' : advance === 'design-advance' ? 'design' : 'plan'
        const pipeline = await pipelineFor(cwd, {})
        const settled = await pipeline.completeDocStage(changeId, node).then(
          () => true,
          () => false, // raced (concurrent drive refused/completed it) — pop re-derives below
        )
        if (settled) {
          // The completion appended events (projectionVersion moved) and just
          // rewrote the rendered docs (size+mtime moved) — refresh both reads
          // the pop's fingerprint and the projection push ride on, or the
          // anti-spam guard would eat this pop on its own writes.
          live = await store.readStatus(changeId)
          // Grace beat: let the projection push land on the client (the Tab's
          // rail refresh) before the dialog paints — the requirement is the
          // rail already SHOWING the rendered artifacts when 推进到实现 asks.
          await new Promise(resolve => setTimeout(resolve, 350))
        }
      }
      due = { gateId: advance, changeId }
    }
  }
  if (due === undefined) {
    // 【变更】2026-09-23 (demo1 五问题 1/3): the turn ended with the resting
    // doc stage's gate still failing — the model's authoring domain. The old
    // total silence was the demo1 stall shape: the model idled beside an
    // artifact the gate refused, no card was due, no dialog popped, and the
    // flow moved only when the customer typed /baf-go. The turn now hands the
    // model the remaining gap as a work order through the SAME channel and
    // SENT ledger /baf-go uses — an identical gap dedupes (no spam), a
    // shrunk gap re-dispatches. The order is plugin-sourced read-only
    // context, not a synthetic customer message; the customer's standing
    // authorization is the confirm chain that started this stage's work.
    await dispatchRestingGap(ctx, cwd, sessionId, status, changeId)
    return
  }

  // The resume gate renders from live drift candidates — the same read the
  // coordinator's drift branch performs.
  let resumeCandidates: readonly WorkflowNode[] | undefined
  if (due.gateId === 'resume') {
    const pipeline = await pipelineFor(cwd, {})
    const options = await pipeline.resumeOptions(changeId)
    if (options.status.current !== 'drift' || options.candidates.length === 0) {
      return // drift already resolved while we waited
    }
    resumeCandidates = options.candidates
  }

  // 【变更】2026-09-23 (demo5 issue #1/#4 parity): the /baf-go route's
  // plan-advance dialog carries the ledger scope note (allowlist + the
  // tasks.md-已随计划生成 sentence). The turn-end pop settled the SAME
  // completeDocStage above, so its card owes the customer the same context —
  // without it the two channels confirmed the same transition with different
  // information (demo5 check C4b).
  let planNote: readonly string[] | undefined
  if (due.gateId === 'plan-advance') {
    const ledger = await readLedger(cwd, changeId).catch(() => undefined)
    if (ledger !== undefined) {
      planNote = [
        `将修改 ${ledger.allowlist.length} 个文件（影响范围，已确认）：${ledger.allowlist.slice(0, 6).join('、')}${ledger.allowlist.length > 6 ? ' …' : ''}`,
        `共 ${ledger.tasks.length} 个任务；tasks.md 任务清单已生成，确认后开始落代码并逐项完成`,
      ]
    }
  }

  const gate: GateDialogInput = {
    gateId: due.gateId,
    changeId,
    ...(resumeCandidates === undefined ? {} : { resumeCandidates }),
    ...(planNote === undefined ? {} : { note: planNote }),
    // §22.17 I — the classify pop carries the classifier's verdict so the
    // customer confirms a visible judgment, not a blind 「确认分类」.
    ...(due.gateId === 'intake-classify' && status.intake !== undefined
      ? { judgment: judgmentOf(status.intake) }
      : {}),
  }

  // 【变更】2026-09-23 (user issue #1 second half): the anti-spam fingerprint
  // used to be the projection version alone — but the model authoring an
  // artifact writes NO projection event, so a gate paused at version V and an
  // artifact filled in a later turn still read V and the advance card never
  // re-offered (the customer had to keep typing /baf-go). The doc-aware
  // stages' fingerprint now carries the artifact file's size+mtime: any edit
  // to the file the gate judges re-arms the pop.
  const artifactSuffix = await artifactFingerprintOf(cwd, changeId, live.current)
  await popGate(ctx, cwd, sessionId, gate, `v${live.projectionVersion}${artifactSuffix}`, `${cwd} | ${changeId} | ${due.gateId}`,
    // Stale the moment the resting point moved on (a click elsewhere, a
    // model write) — the queue re-reads at head-of-line time. MUST use the
    // same doc-aware derivation as the pop itself: a projection-only
    // re-check cancelled every doc-aware pop at the queue head (web walk
    // stall #2, round 4 — the card never rendered).
    async () => await deriveDueGate(cwd, changeId).then(d => d?.gateId !== due.gateId))
}

/**
 * 【变更】2026-09-23 (demo1 五问题 1/3): hand the model the remaining gap of a
 * resting authoring stage whose gate still fails, at turn end.
 *
 * The demo1 stall: the model finished a turn with plan.json authored in a
 * shape the (pre-fix) reader rejected; no advance gate was due, nothing popped,
 * and the flow waited for a manual /baf-go. With the reader tolerant this
 * specific class is gone, but ANY genuine gate failure (half-filled artifact,
 * malformed ledger) would stall the same way — so the turn end now re-uses the
 * /baf-go work-order channel: same dispatcher, same SENT ledger (an identical
 * gap dedupes; a shrunk gap re-dispatches), same order text. Plugin-sourced
 * read-only context — never a synthetic customer message.
 * @param ctx - host context (agent registry + logger).
 * @param cwd - workspace root.
 * @param sessionId - the session whose turn just ended.
 * @param status - the change's live status.
 * @param changeId - the change id.
 */
async function dispatchRestingGap(
  ctx: Context,
  cwd: string,
  sessionId: string,
  status: WorkflowStatus,
  changeId: string,
): Promise<void> {
  const node = status.current
  if (node !== 'open' && node !== 'clarify' && node !== 'design' && node !== 'plan' && node !== 'implement') return
  const mode = status.mode === 'bug-fix-path' ? 'bug-fix-path' : 'full-go-path'
  const input: GateInput = { workspaceRoot: cwd, changeId, mode }
  let missing: readonly string[] | undefined
  switch (node) {
    case 'open': {
      // 【变更】2026-09-26 (用户需求 工作流 3): mode-aware — a bug-fix open
      // rest's gap is the proposal/ledger draft (proposalGate unconditionally
      // passes on that mode, which used to silence the dispatch).
      // 【变更】2026-09-30 (demo31 问题 4): both modes author proposal.md, so
      // the fallback label no longer forks either.
      const gate = mode === 'bug-fix-path'
        ? await bugRecordGate(input).catch(() => undefined)
        : await proposalGate(input).catch(() => undefined)
      missing = gate !== undefined && !gate.ok ? gate.missing ?? [gate.detail ?? 'proposal 未达完成门'] : undefined
      break
    }
    case 'clarify': {
      const gate = await clarifyGate(input).catch(() => undefined)
      missing = gate !== undefined && !gate.ok ? gate.missing ?? [gate.detail ?? 'clarify 未达完成门'] : undefined
      break
    }
    case 'design': {
      const gate = await designGate(input).catch(() => undefined)
      missing = gate !== undefined && !gate.ok ? gate.missing ?? [gate.detail ?? 'design 未达完成门'] : undefined
      break
    }
    case 'plan': {
      const gate = await planGate(input).catch(() => undefined)
      missing = gate !== undefined && !gate.ok ? gate.missing ?? [gate.detail ?? 'plan 未达完成门'] : undefined
      break
    }
    case 'implement': {
      const ledger = await readLedger(cwd, changeId).catch(() => undefined)
      if (ledger === undefined) break
      const gate = await implementGate(input, ledger.touched).catch(() => undefined)
      if (gate !== undefined && !gate.ok) {
        // Quote the same remaining-task shape /baf-go's implement gap uses.
        const undone = ledger.tasks.filter(task => task.done !== true)
        missing = undone.length > 0
          ? [`plan.json：${undone.length}/${ledger.tasks.length} 个任务未完成——做完并把 done 标为 true`]
          : gate.missing ?? [gate.detail ?? 'implement 未达完成门']
      }
      break
    }
    default: break
  }
  if (missing === undefined || missing.length === 0) return
  const agent = ctx.agents.get(sessionId as Parameters<typeof ctx.agents.get>[0])
  if (agent === undefined) return
  const dispatch = makeGoDispatcher(cwd, agent)
  if (dispatch === undefined) return
  const outcome = dispatch({
    changeId,
    node,
    artifactPath: artifactPathFor(changeId, node),
    missing,
    ...(mode === 'bug-fix-path' ? { mode: 'bug-fix-path' as const } : {}),
  })
  ctx.logger.info(`${stamp()} - session baf:orchestrate change=${changeId} gapDispatch node=${node} outcome=${outcome} missing=${missing.length}`)
}

/**
 * The size+mtime stamp of the artifact the current node's file gate judges
 * ('' when the node has no single judging artifact). Part of the popGate
 * fingerprint so an artifact edit re-arms a paused advance gate (issue #1).
 *
 * 【变更】2026-09-28 (用户问题 1.7): `verify` joins the doc-aware stages — gate
 * B (verify-archive) parks the change with NO projection event flowing, so
 * before this a verify.md revision (the gate dialog's 修改意见 loop) left the
 * fingerprint frozen at the pre-park version and the confirm card never
 * re-offered. verify.md (what the gate judges and what a revision edits) is
 * the fingerprinted file — checklist.md stays out: it is ticked during the
 * verify drive itself, which would re-pop the card mid-drive.
 * @param cwd - workspace root.
 * @param changeId - change id.
 * @param current - the change's current node.
 * @returns `:<size>-<mtime>` or ''.
 */
async function artifactFingerprintOf(
  cwd: string,
  changeId: string,
  current: string,
): Promise<string> {
  if (current === 'verify') {
    try {
      const s = await stat(join(cwd, 'openspec', 'changes', changeId, 'verify.md'))
      return `:${s.size}-${Math.floor(s.mtimeMs)}`
    } catch {
      return ''
    }
  }
  if (current !== 'open' && current !== 'clarify' && current !== 'design' && current !== 'plan' && current !== 'implement') return ''
  const relative = artifactPathFor(changeId, current)
  try {
    const s = await stat(join(cwd, relative))
    return `:${s.size}-${Math.floor(s.mtimeMs)}`
  } catch {
    return ''
  }
}

/** ②' — the multi-active bind choice as a registered gate pop. */
async function popBind(
  ctx: Context,
  cwd: string,
  sessionId: string,
  actives: readonly ProjectionIndexEntry[],
): Promise<void> {
  const candidates = actives.map(a => a.changeId)
  const ledgerKey = `${cwd} || bind-workflow`
  const fingerprint = candidates.join('|')
  if (OFFERED.get(ledgerKey) === fingerprint) return
  const agent = ctx.agents.get(sessionId as Parameters<typeof ctx.agents.get>[0])
  if (agent === undefined) return
  const service = resolveUserQuestions(ctx, agent)
  if (service === undefined) return

  const outcome = await askGateDialogQueued(service, agent as GateDialogAgent, {
    gateId: 'bind-workflow',
    bindCandidates: candidates,
    note: [
      `当前未完成的变更（共 ${candidates.length} 条）：`,
      ...actives.map(a => `${a.changeId} · 当前 ${a.current}`),
      '选定后本会话将绑定并推进它，其余变更保持原状。',
    ],
  }, {
    sessionId,
    isMoot: async () => {
      const nowActives = (await new ProjectionStore({ workspaceRoot: cwd }).readIndex())
        .changes.filter(isActiveChange)
      return nowActives.length !== actives.length
    },
  })
  OFFERED.set(ledgerKey, fingerprint)
  ctx.logger.info(`${stamp()} - session baf:orchestrate gate=bind-workflow change=- outcome=${outcome.kind}${outcome.kind === 'answered' ? ` option=${outcome.optionId}` : ''}`)
  if (outcome.kind !== 'answered') return

  const picked = candidates.find(id => `bind-${id}` === outcome.optionId)
  if (picked === undefined) return
  // Same record-outside-the-dispatch rule as the coordinator's choose
  // branch: the inner /baf-go cannot see any session's focus cache.
  focusFor(cwd).set(picked)
  // 2026-09-23 issue #1: the bind pick is a customer click — the inner
  // /baf-go may dispatch at the picked change's authoring rest.
  const bindDispatch = makeGoDispatcher(cwd, agent)
  const result = await driveGateResolve(
    cwd,
    'bind-workflow',
    `bind-${picked}`,
    toolDriveAdapters(ctx, agent, cwd),
    undefined,
    candidates,
    'gate-card',
    bindDispatch === undefined ? undefined : { dispatch: bindDispatch },
  )
  ctx.logger.info(`${stamp()} - session baf:orchestrate gate=bind-workflow change=${picked} resolved=${result.kind}`)
}
