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
 * 作为新需求开始工作流吗？」. Only the customer's click mints anything:
 * 开始 → `driveOpen` + the informed classification dialog (judgment + the
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
import { askGateDialog, judgmentOf, resolveUserQuestions, toolDriveAdapters } from './gate-dialog.ts'
import { driveGateResolve, driveOpen, loadWorkspaceBaseline } from './command-drives.ts'
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
): Promise<void> {
  const cwd = session.header.cwd
  if (cwd === undefined || cwd === '') return
  // Workspace must be BAF-initialized and idle — an uninitialized or busy
  // workspace has a different next decision (scaffold / the running change).
  if (await loadWorkspaceBaseline(cwd) === undefined) return
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const actives = (await store.readIndex()).changes.filter(isActiveChange)
  if (actives.length > 0) return
  const agent = ctx.agents.get(session.header.id as Parameters<typeof ctx.agents.get>[0])
  if (agent === undefined) return
  const service = resolveUserQuestions(ctx, agent)
  if (service === undefined) return

  // The pre-question: one decision, zero side effects. 「开始」 is the only
  // path that mints; chat/smalltalk costs one dismissed dialog, nothing more.
  let answer: AskUserQuestionAnswer
  try {
    answer = await service.ask({
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
    })
  } catch {
    // Cancelled / unavailable — nothing was minted, nothing to clean up.
    return
  }
  const label = answer.answers[0]?.selected[0]
  if (label !== '作为新需求开始') return

  // Customer confirmed new work: mint through the same drive the slash uses
  // ('gate-card' — a popup click drives this, not the model), then surface
  // the informed classification dialog with the two path options (§22.17 J).
  const before = new Set(actives.map(c => c.changeId))
  await driveOpen(cwd, text, 'gate-card')
  const minted = (await store.readIndex()).changes
    .filter(isActiveChange).map(c => c.changeId)
    .find(id => !before.has(id))
  ctx.logger.info(`[baf] ${new Date().toISOString()} - session baf:auto-pop change=${minted ?? '-'} source=gate-card textLen=${text.length}`)
  if (minted === undefined) return
  try {
    const status = await store.readStatus(minted)
    if (status.intake === undefined) return
    const outcome = await askGateDialog(service, agent, {
      gateId: 'intake-classify',
      changeId: minted,
      judgment: judgmentOf(status.intake),
    })
    ctx.logger.info(`[baf] ${new Date().toISOString()} - session baf:auto-pop classify change=${minted} outcome=${outcome.kind}${outcome.kind === 'answered' ? ` option=${outcome.optionId}` : ''}`)
    if (outcome.kind === 'answered') {
      const result = await driveGateResolve(
        cwd,
        'intake-classify',
        outcome.optionId,
        toolDriveAdapters(ctx, agent, cwd),
        undefined,
        'gate-card',
        { changeId: minted },
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
    // Mark before the async work so a crash mid-chain never re-offers.
    offered.add(id)
    void offerAutoPop(ctx, session as { readonly header: { readonly id: string; readonly cwd?: string } }, text)
      .catch((error: unknown) => {
        ctx.logger.warn(`baf-auto-pop: offer failed: ${error instanceof Error ? error.message : String(error)}`)
      })
  })
}
