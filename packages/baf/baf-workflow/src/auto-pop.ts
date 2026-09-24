/**
 * §22.17 J — state-driven auto-pop: the platform guarantee behind 「直接
 * 描述需求，分类卡自动弹出」.
 *
 * The 2026-09-20 incident class was always the same shape: the customer
 * stated a requirement in plain prose, and whether a dialog appeared depended
 * on the *model* choosing to call `baf_gate_ask` (rules are soft). This row
 * moves the trigger to the host plane: it subscribes `session/event`, and
 * when a **genuine user message** (source.kind === 'user') lands in an
 * initialized, idle workspace, it pops one small pre-question — 「把这句话
 * 作为新需求开始工作流吗？」. A message that arrives in a workspace not yet
 * initialized does NOT consume the offer — the scaffold is that workspace's
 * next decision, and the first post-init message gets the pre-question
 * (pristine first-run, 2026-09-22). Only the customer's click mints anything:
 * 开始 → `beginIntake` + the informed classification dialog (judgment + the
 * two §22.17 J path buttons); 不是 → nothing happens. Smalltalk never
 * creates audit junk, and the model is no longer in the trigger loop.
 *
 * Layering: host-plane glue only (like `baf-gate-ask`), outside the
 * `baf-domain` isolate — it reaches the host `agents` registry (for the live
 * agent handle `userQuestions.ask` scopes to) and `userQuestions` itself.
 * Every failure is contained: the handler is fire-and-forget and must never
 * influence the message stream it observes.
 *
 * @module @deepseek-ai/dsh-baf-workflow/auto-pop
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session' // Context 'session/event' augmentation
import type { AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions'
import type {} from '@deepseek-ai/dsh-user-questions' // Context.userQuestions augmentation
import { askGateDialogQueued, judgmentOf, resolveUserQuestions, toolDriveAdapters } from './gate-dialog.ts'
import { driveGateResolve, loadWorkspaceBaseline } from './command-drives.ts'
import { beginIntake } from './begin-intake.ts'
import { makeGoDispatcher, type DispatchAgent } from './go-dispatch.ts'
import { parkRequirement, clearParkedRequirement } from './requirement-park.ts'
import { enqueueAsk, type AskOutcome } from './ask-queue.ts'
import { isActiveChange, ProjectionStore } from './projection.ts'

/** Preset row identity — referenced from `agent.cordis.yml`. */
export const name = 'baf-auto-pop'

/** Host-plane services: the live agents registry and the question waterfall. */
export const inject = ['agents', 'userQuestions'] as const

/** The pre-question id (QuestionComposer routing, not a §22 gate id). */
const QUESTION_ID = 'baf-auto-pop'

/** Minimum length for a message worth offering as a requirement. */
const MIN_LENGTH = 4

/** Extract the plain text of a user message (ignore non-text blocks). */
function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (typeof block === 'object' && block !== null
      && (block as { type?: unknown }).type === 'text'
      && typeof (block as { text?: unknown }).text === 'string') {
      parts.push((block as { text: string }).text)
    }
  }
  return parts.join('\n').trim()
}

/**
 * The whole auto-pop chain for one user message, best-effort: any failure
 * (no baseline, busy workspace, no answerer, refused mint) just stops —
 * the model-side `baf_gate_ask` path and the Tab/slash surfaces remain.
 */
async function offerAutoPop(
  ctx: Context,
  session: { readonly header: { readonly id: string; readonly cwd?: string } },
  text: string,
  releaseOffer: () => void,
): Promise<void> {
  const cwd = session.header.cwd
  if (cwd === undefined || cwd === '') return
  const sessionId = String(session.header.id)
  // Workspace must be BAF-initialized and idle — an uninitialized or busy
  // workspace has a different next decision (scaffold / the running change).
  // 【变更】2026-09-22 (pristine first-run, web walk 04:39): a message that
  // arrives BEFORE the scaffold must not burn the session's single offer —
  // the scaffold card is that workspace's next decision, and the offer would
  // be spent on a workspace where it can never pop (the promised 分类卡 then
  // never appeared for the whole first session). Release it: the first
  // genuine post-init message is the requirement worth offering.
  // 【变更】2026-09-23 (demo2 user issue #1): the released statement is also
  // PARKED — when the customer later resolves the scaffold gate (typed
  // /baf-go, the turn-end pop, the Tab button), the continuation
  // (requirement-park.ts) surfaces it as the 新建工作流 → 分类确认 chain
  // instead of leaving the initialized workspace silent with the requirement
  // stranded in conversation history.
  if (await loadWorkspaceBaseline(cwd) === undefined) {
    parkRequirement(sessionId, text)
    releaseOffer()
    return
  }
  // Initialized: this statement supersedes any parked one — the pre-question /
  // offer flow (or the running change) owns the next decision from here, and a
  // pre-init statement must not resurface via /baf-go after the customer moved
  // on (dismissed the offer, or started chatting beside a busy workspace).
  clearParkedRequirement(sessionId)
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const actives = (await store.readIndex()).changes.filter(isActiveChange)
  if (actives.length > 0) return
  const agent = ctx.agents.get(session.header.id as Parameters<typeof ctx.agents.get>[0])
  if (agent === undefined) return
  const service = resolveUserQuestions(ctx, agent)
  if (service === undefined) return

  // The pre-question: one decision, zero side effects. 「开始」 is the only
  // path that mints; chat/smalltalk costs one dismissed dialog, nothing more.
  // §22.19: it rides the session's single-flight queue (session 7.jsonl R2 —
  // an uncoordinated second dialog covered this one before the customer
  // clicked) and re-checks idleness at queue head, so a change minted by
  // another route while this entry waited retires the offer silently.
  let preQuestion: AskOutcome<AskUserQuestionAnswer>
  try {
    preQuestion = await enqueueAsk({
      sessionId,
      key: `autopop:${sessionId}`,
      isMoot: async () => {
        const nowActives = (await new ProjectionStore({ workspaceRoot: cwd }).readIndex())
          .changes.filter(isActiveChange)
        return nowActives.length > 0
      },
      run: async controller => service.ask({
        questions: [{
          id: QUESTION_ID,
          question: '要把这句话作为新需求开始 BAF 工作流吗？',
          detail: '检测到你发了一段描述，而当前工作区没有进行中的变更。\n\n「作为新需求开始」会建立变更并弹出需求分类确认（完整流程 / 缺陷修复路径由你点选）；「只是聊天」不产生任何变更。',
          header: 'BAF 工作流',
          options: [
            { label: '作为新需求开始', description: '建立变更并弹出需求分类确认' },
            { label: '只是聊天，不开始', description: '本次不操作，不产生变更' },
          ],
        }],
        agent,
        signal: controller.signal,
      }),
    })
  } catch {
    // Cancelled / unavailable — nothing was minted, nothing to clean up.
    return
  }
  if (preQuestion.kind !== 'answered') return
  const label = preQuestion.value.answers[0]?.selected[0]
  if (label !== '作为新需求开始') return

  // Customer confirmed new work: mint through the single §22.19 entry
  // ('gate-card' — a popup click drives this, not the model), then surface
  // the informed classification dialog with the two path options (§22.17 J).
  // 'reused' is the racing-twin convergence: the model-side baf_gate_ask
  // bootstrap (or a re-stated identical requirement) already minted this
  // same sentence, so the classify pop simply targets that change — the old
  // index-diff mint detection could not see a reused mint and bailed.
  const outcome = await beginIntake(cwd, text)
  ctx.logger.info(`[baf] ${new Date().toISOString()} - session baf:auto-pop change=${outcome.kind === 'minted' || outcome.kind === 'reused' ? outcome.changeId : '-'} outcome=${outcome.kind} source=gate-card textLen=${text.length}`)
  if (outcome.kind !== 'minted' && outcome.kind !== 'reused') return
  const minted = outcome.changeId
  try {
    const status = await store.readStatus(minted)
    if (status.intake === undefined) return
    const outcome = await askGateDialogQueued(service, agent, {
      gateId: 'intake-classify',
      changeId: minted,
      judgment: judgmentOf(status.intake),
    }, { sessionId })
    ctx.logger.info(`[baf] ${new Date().toISOString()} - session baf:auto-pop classify change=${minted} outcome=${outcome.kind}${outcome.kind === 'answered' ? ` option=${outcome.optionId}` : ''}`)
    if (outcome.kind === 'answered') {
      // 2026-09-23 issue #1: the classify confirm click is a customer
      // action — the chained open drive may dispatch at its authoring rest.
      const classifyDispatch = makeGoDispatcher(cwd, agent as unknown as DispatchAgent)
      const result = await driveGateResolve(
        cwd,
        'intake-classify',
        outcome.optionId,
        toolDriveAdapters(ctx, agent, cwd),
        undefined,
        undefined,
        'gate-card',
        classifyDispatch === undefined ? undefined : { dispatch: classifyDispatch },
      )
      ctx.logger.info(`[baf] ${new Date().toISOString()} - session baf:auto-pop resolved change=${minted} result=${result.kind}${result.kind === 'error' ? ` text=${result.text.slice(0, 160).replaceAll('\n', ' ')}` : ''}`)
    }
  } catch (error: unknown) {
    ctx.logger.warn(`baf-auto-pop: classify dialog failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Install the listener. One offer per session: the first genuine user message
 * in a ready+idle workspace pops the pre-question; every later message is
 * left to the model-side tool / Tab / slash surfaces (rules 6 / §22.9).
 */
export function apply(ctx: Context): void {
  const offered = new Set<string>()
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'user/message') return
    // Genuine typing only — plugin/tool-injected messages are not the
    // customer stating a requirement.
    if ((event.data as { source?: { kind?: string } }).source?.kind !== 'user') return
    const id = String(session.header.id)
    if (offered.has(id)) return
    const text = textOf((event.data as { content?: unknown }).content)
    // Slash input is a command, not a requirement; one-word greetings are
    // not worth a dialog. Both stay untouched — the model handles them.
    if (text === '' || text.startsWith('/') || text.length < MIN_LENGTH) return
    // Mark before the async work so a crash mid-chain never re-offers. The
    // release callback un-marks the pristine-first-run case above (message
    // arrived pre-scaffold) — every other path keeps the one-offer-per-session
    // semantics (§22.17 J).
    offered.add(id)
    void offerAutoPop(
      ctx,
      session as { readonly header: { readonly id: string; readonly cwd?: string } },
      text,
      () => { offered.delete(id) },
    )
      .catch((error: unknown) => {
        ctx.logger.warn(`baf-auto-pop: offer failed: ${error instanceof Error ? error.message : String(error)}`)
      })
  })
}
