/**
 * 【变更】2026-09-23 (demo2 user issue #1): the parked-requirement memory and
 * its continuation — the host-plane half of "初始化之后流程自己继续".
 *
 * The incident shape (workspace `demo2`): the customer states a requirement on
 * an uninitialized workspace → the scaffold gate pops → 暂不初始化 → later a
 * `/baf-go` re-pops it → 初始化工作区 → **silence**. The requirement only ever
 * lived in the conversation, and after the scaffold nothing re-surfaces it:
 * `/baf-go` now answers 「没有进行中的工作流」 (true — nothing was minted), no
 * dialog is due, and the model is idle. The flow could only be revived by the
 * customer re-typing the requirement — exactly what they refused to do.
 *
 * Fix, two halves:
 * 1. {@link parkRequirement} — `baf-auto-pop` stashes the customer's words
 *    when a genuine message arrives in an uninitialized workspace (the branch
 *    that used to just release its one-per-session offer).
 * 2. {@link continueParkedRequirement} — every customer-action surface that
 *    can leave the workspace freshly initialized (typed `/baf-go` /
 *    `/baf-go-confirm`, the orchestrator's turn-end scaffold pop, the Tab's
 *    scaffold button) calls this afterwards: with a parked requirement, an
 *    initialized workspace and nothing active, it pops the same
 *    新建工作流 → 分类确认 chain the `baf_gate_ask` bootstrap runs — so the
 *    stated requirement survives the scaffold as a real classification
 *    decision instead of dying in conversation history.
 *
 * Lifetime of a parked entry (【变更】2026-09-23 demo3 — the unified cancel
 * rule): kept on BOTH cancel shapes — closing the dialog AND clicking
 * 暂不处理 — so `/baf-go` always re-offers the decision. A park only clears
 * when the requirement genuinely settles: minted into a change, the customer
 * chose 继续推进现有变更 over it in the conflict dialog, or a newer statement
 * superseded it (auto-pop's initialized-workspace message). A busy workspace
 * no longer discards it either — `/baf-go` offers the registered
 * active-conflict dialog instead.
 *
 * @module @deepseek-ai/dsh-baf-workflow/requirement-park
 */

import type { Context } from '@deepseek-ai/cordis'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import { cardTitle, formatCommandReport } from './command-format.ts'
import { loadWorkspaceBaseline } from './pipeline-factory.ts'
import { beginIntake } from './begin-intake.ts'
import { driveGateResolve, type DriveAdapters } from './command-drives.ts'
import { askGateDialogQueued, judgmentOf, resolveUserQuestions, type GateDialogAgent } from './gate-dialog.ts'
import { makeGoDispatcher, type DispatchAgent } from './go-dispatch.ts'
import { isActiveChange, pickActiveChange, ProjectionStore } from './projection.ts'
import { sharedHostMap } from './host-memory.ts'

/**
 * Parked requirements — session key → the customer's verbatim words.
 * 【变更】2026-09-23 (demo2 re-test): anchored on globalThis — the park is
 * written by the `baf-auto-pop` bundle and read by the `commands` /
 * orchestrator / Tab-remote bundles; a module-level Map exists once per bundle
 * and the continuation always saw an empty copy (see host-memory.ts).
 */
const PARKED = sharedHostMap<string>('requirement-park/parked')

/** Test seam — forget every parked requirement. */
export function resetParkedRequirements(): void {
  PARKED.clear()
}

/** Stash one requirement for the continuation (newest statement wins). */
export function parkRequirement(sessionKey: string, text: string): void {
  const trimmed = text.trim()
  if (trimmed === '') return
  PARKED.set(sessionKey, trimmed)
}

/** Peek without consuming (the continuation only clears on settled outcomes). */
export function peekParkedRequirement(sessionKey: string): string | undefined {
  return PARKED.get(sessionKey)
}

/** Drop one parked requirement (minted / held / superseded by an active change). */
export function clearParkedRequirement(sessionKey: string): void {
  PARKED.delete(sessionKey)
}

/**
 * 【变更】2026-09-23 (demo1 issue #1 follow-up): clear the parked requirement
 * for an agent's session — the mint surfaces that hold a live agent (the
 * `baf_gate_ask` bootstrap's two `beginIntake` legs) call this right after the
 * customer's statement became a change, so a later `/baf-go` cannot re-offer
 * it as an active-conflict against the very change it spawned.
 * @param agent - the session's runtime agent (structural read of its id).
 */
export function clearParkedRequirementFor(agent: unknown): void {
  PARKED.delete(sessionKeyOf(agent))
}

/**
 * Structural read of a runtime agent's session id — the same shape
 * `gate-dialog.ts` reads, so auto-pop's park key and this module's lookup key
 * agree by construction.
 */
function sessionKeyOf(agent: unknown): string {
  const id = (agent as { session?: { header?: { id?: unknown } } } | undefined)
    ?.session?.header?.id
  return typeof id === 'string' && id !== '' ? id : 'baf-unknown-session'
}

/**
 * Continue a parked requirement after the workspace became drivable.
 *
 * Runs the §1 chain the `baf_gate_ask` bootstrap uses, dialog-driven end to
 * end: 新建工作流 confirmation (the requirement quoted verbatim) → mint through
 * the single entry → informed classification dialog → the click resolves via
 * `driveGateResolve` with the session's work-order channel, so the classify
 * confirm's follow-up drive lands on the model-authoring rest and dispatches.
 *
 * @param ctx - host-plane context (preset row / remote) for `userQuestions`.
 * @param agent - the session's live agent — scopes the dialogs, supplies the
 *   dispatcher. Without one nothing can pop; returns undefined.
 * @param cwd - workspace root.
 * @param adapters - optional drive adapters (classify-confirm needs none
 *   beyond what `pipelineFor` resolves itself).
 * @returns the chain's card when the continuation actually ran (dialog
 *   answered or paused-with-explanation), or undefined when there was nothing
 *   parked / nothing to continue — callers keep the original card then.
 */
/**
 * The create leg shared by the idle path and the conflict-abandon path:
 * 新建工作流 confirmation → mint through the single entry → the informed
 * classification dialog → the click resolves via `driveGateResolve` with the
 * session's work-order channel, so the classify confirm's follow-up drive
 * lands on the model-authoring rest and dispatches.
 *
 * 【变更】2026-09-23 (demo3 user rule — unified cancel semantics): BOTH cancel
 * shapes keep the requirement parked — closing the dialog AND clicking
 * 暂不处理. Every BAF dialog must be revivable by typing /baf-go; a park only
 * clears when the requirement genuinely settles (minted into a change, or the
 * customer chose 推进现有变更 over it in the conflict dialog).
 */
async function continueCreateLeg(
  service: NonNullable<ReturnType<typeof resolveUserQuestions>>,
  agent: unknown,
  cwd: string,
  sessionKey: string,
  requirement: string,
  adapters?: DriveAdapters,
): Promise<CommandResult | undefined> {
  const store = new ProjectionStore({ workspaceRoot: cwd })
  // Leg 1 — the §1 create/bind confirmation, requirement quoted verbatim.
  const create = await askGateDialogQueued(service, agent as GateDialogAgent, {
    gateId: 'new-workflow',
    note: [`客户新需求：「${requirement}」`],
  }, { sessionId: sessionKey })
  if (create.kind !== 'answered') {
    // Closed the dialog — parked stays; /baf-go re-pops the same decision.
    return {
      kind: 'success',
      text: formatCommandReport(true, cardTitle('/baf-go', '需求接续 · 客户暂未选择'), [
        { title: '状态', lines: ['客户在「新建工作流」确认框上未做选择（关闭了确认框）'] },
        { title: '继续', lines: ['再敲 /baf-go 重新弹出新建确认；确认后会接着弹出分类确认（完整流程 / 缺陷修复路径）'] },
      ]),
    }
  }
  if (create.optionId !== 'create') {
    // 【变更】demo3: explicit 暂不处理 ALSO keeps the park — the customer's
    // revive path is /baf-go (the same rule every paused gate follows); the
    // entry only clears when the requirement becomes a change or is superseded.
    return {
      kind: 'success',
      text: formatCommandReport(true, cardTitle('/baf-go', '需求接续 · 暂不新建'), [
        { title: '状态', lines: ['客户选择暂不新建工作流，本次没有创建任何变更'] },
        { title: '继续', lines: ['再敲 /baf-go 可重新弹出新建确认；客户再次提出需求时也会重新询问'] },
      ]),
    }
  }

  // Leg 2 — mint through the single §22.19 entry. With no actives this can
  // only refuse on empty text (impossible here); 'reused' converges on a twin.
  const outcome = await beginIntake(cwd, requirement)
  if (outcome.kind !== 'minted' && outcome.kind !== 'reused') {
    return outcome.card
  }
  clearParkedRequirement(sessionKey)
  const changeId = outcome.changeId
  const status = await store.readStatus(changeId).catch(() => undefined)
  if (status?.intake === undefined) {
    return outcome.card
  }

  // Leg 3 — the informed classification dialog. The click dispatches through
  // the same single resolve channel every surface uses, carrying the session's
  // work-order channel: the classify-confirm follow-up (command-drives.ts)
  // then lands on the authoring rest and wakes the model.
  const classify = await askGateDialogQueued(service, agent as GateDialogAgent, {
    gateId: 'intake-classify',
    changeId,
    judgment: judgmentOf(status.intake),
  }, { sessionId: sessionKey })
  if (classify.kind !== 'answered') {
    return {
      kind: 'success',
      text: formatCommandReport(true, cardTitle('/baf-go', `需求接续 · 分类待确认 · ${changeId}`), [
        { title: '状态', lines: [`已按客户需求建立 ${changeId}，分类确认框未做选择（关闭了确认框）`] },
        { title: '继续', lines: ['/baf-go gate=intake-classify 重弹分类确认；模型回合结束时系统也会自动重弹'] },
      ]),
    }
  }
  const dispatch = makeGoDispatcher(cwd, agent as DispatchAgent)
  return driveGateResolve(
    cwd,
    'intake-classify',
    classify.optionId,
    adapters ?? {},
    undefined,
    undefined,
    'gate-card',
    {
      changeId,
      ...(dispatch === undefined ? {} : { dispatch }),
    },
  )
}

/**
 * Whether one of the active changes IS the parked requirement — its intake
 * summary is the customer's verbatim statement (`decideIntake` copies the
 * trimmed description, capped at 500 chars), so the parked words matching the
 * summary means the statement already became that change.
 */
async function pickSettledActive(
  store: ProjectionStore,
  actives: readonly { readonly changeId: string }[],
  requirement: string,
): Promise<string | undefined> {
  for (const row of actives) {
    const status = await store.readStatus(row.changeId).catch(() => undefined)
    const summary = status?.intake?.summary
    if (summary === undefined) continue
    // Equal, or the 500-char cap truncated a longer statement.
    if (summary === requirement || (requirement.length >= 500 && summary.startsWith(requirement))) {
      return row.changeId
    }
  }
  return undefined
}

/**
 * Continue a parked requirement after the workspace became drivable.
 *
 * Idle workspace: the §1 chain (新建工作流 → 分类确认 → dispatched order).
 * Busy workspace (【变更】demo3 unified rule): the requirement meets a running
 * change, so the **active-conflict** dialog pops with the requirement quoted —
 * 继续推进现有变更 drives the running change (the park is spent), 放弃现有变更
 * frees the workspace and continues straight into the create leg, 暂不处理 or
 * closing keeps the park for the next /baf-go.
 *
 * @param ctx - host-plane context (preset row / remote) for `userQuestions`.
 * @param agent - the session's live agent — scopes the dialogs, supplies the
 *   dispatcher. Without one nothing can pop; returns undefined.
 * @param cwd - workspace root.
 * @param adapters - optional drive adapters (classify-confirm needs none
 *   beyond what `pipelineFor` resolves itself).
 * @returns the chain's card when the continuation actually ran (dialog
 *   answered or paused-with-explanation), or undefined when there was nothing
 *   parked / nothing to continue — callers keep the original card then.
 */
export async function continueParkedRequirement(
  ctx: Context,
  agent: unknown,
  cwd: string,
  adapters?: DriveAdapters,
): Promise<CommandResult | undefined> {
  const service = resolveUserQuestions(ctx, agent as { ctx?: Context } | undefined)
  if (service === undefined) return undefined
  const sessionKey = sessionKeyOf(agent)
  const requirement = PARKED.get(sessionKey)
  if (requirement === undefined) return undefined
  // Nothing to continue onto yet — the scaffold decision is still the live
  // one (this /baf-go answered 暂不初始化, or the click never landed).
  if (await loadWorkspaceBaseline(cwd) === undefined) return undefined
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const actives = (await store.readIndex()).changes.filter(isActiveChange)
  if (actives.length === 0) {
    return await continueCreateLeg(service, agent, cwd, sessionKey, requirement, adapters)
  }

  // 【变更】2026-09-23 (demo1 issue #1 follow-up): the parked statement may
  // already BE the active change — minted by a surface that did not clear the
  // park (the model's `baf_gate_ask` bootstrap, the Tab's startIntake). The
  // intake summary is the customer's verbatim words, so a match means the
  // requirement settled: spend the park and continue nothing. Without this
  // guard, the next `/baf-go` popped the active-conflict dialog against the
  // very change the statement spawned (web-walk repro, 2026-09-23).
  const settled = await pickSettledActive(store, actives, requirement)
  if (settled !== undefined) {
    clearParkedRequirement(sessionKey)
    return undefined
  }

  // 【变更】2026-09-23 (demo3 user rule): the busy workspace no longer discards
  // the parked requirement — the collision IS the customer's next decision, so
  // /baf-go re-offers the registered active-conflict dialog (the same one the
  // gate-ask bootstrap pops) instead of silently spending the statement.
  const ranked = pickActiveChange(actives)
  const focus = ranked.kind === 'one'
    ? actives.find(c => c.changeId === ranked.changeId)
    : ranked.kind === 'ambiguous' ? ranked.candidates[0] : undefined
  if (focus === undefined) return undefined
  const conflict = await askGateDialogQueued(service, agent as GateDialogAgent, {
    gateId: 'active-conflict',
    changeId: focus.changeId,
    note: [
      `现有变更当前进行到：${focus.current}`,
      `客户提出的新需求：「${requirement}」`,
    ],
  }, { sessionId: sessionKey })
  if (conflict.kind !== 'answered') {
    return {
      kind: 'success',
      text: formatCommandReport(true, cardTitle('/baf-go', '需求接续 · 客户暂未选择'), [
        { title: '状态', lines: ['客户在「已有进行中的变更」确认框上未做选择（关闭了确认框）'] },
        { title: '继续', lines: ['再敲 /baf-go 重新弹出冲突确认；也可直接描述需求由模型弹出'] },
      ]),
    }
  }
  if (conflict.optionId === 'pause') {
    return {
      kind: 'success',
      text: formatCommandReport(true, cardTitle('/baf-go', '需求接续 · 暂不处理'), [
        { title: '状态', lines: ['客户选择暂不处理；现有变更与新需求都保持原状'] },
        { title: '继续', lines: ['再敲 /baf-go 可重新弹出冲突确认'] },
      ]),
    }
  }
  const dispatch = makeGoDispatcher(cwd, agent as DispatchAgent)
  const resolved = await driveGateResolve(
    cwd,
    'active-conflict',
    conflict.optionId,
    adapters ?? {},
    undefined,
    undefined,
    'gate-card',
    {
      changeId: focus.changeId,
      ...(dispatch === undefined ? {} : { dispatch }),
    },
  )
  // The abandon option frees the workspace — the parked requirement continues
  // from the create leg in the same /baf-go (the gate-ask bootstrap's dance).
  if (conflict.optionId === 'abandon') {
    const after = await continueCreateLeg(service, agent, cwd, sessionKey, requirement, adapters)
    if (after !== undefined) {
      return { kind: after.kind, text: `${resolved.text}\n\n${after.text}` }
    }
  } else {
    // advance — the customer chose the running change over the statement.
    clearParkedRequirement(sessionKey)
  }
  return resolved
}
