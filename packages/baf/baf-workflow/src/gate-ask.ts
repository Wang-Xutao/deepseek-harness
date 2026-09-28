/**
 * Model-facing `baf_gate_ask` tool (§22.9 / §22.14 E / §22.17).
 *
 * The tool is the model's **only** authorized way to surface a confirmation
 * gate. Where a `userQuestions` answerer is mounted (desktop GUI) it now
 * pops the §22 interactive dialog and waits for the customer's click — the
 * click is genuine human input, so it may resolve the gate (§22.1): the
 * chosen option is dispatched through `driveGateResolve` exactly like a Tab
 * button, and the tool returns the *resulting* card so the model can report
 * the real state instead of claiming a dialog the customer never saw. With
 * no answerer (CLI / test compositions) the tool degrades to the original
 * card-text-only behavior.
 *
 * The tool sits in the **Host** composition (per preset row, outside the
 * `baf-domain` isolate) so the `tools` registry it registers into is the
 * shared one other tools already populate. A broken composition still leaves
 * a session openable: the row is optional, and the tool description
 * explicitly tells the model to read the §22 GATE_REGISTRY even when the
 * tool itself is missing.
 *
 * @module @deepseek-ai/dsh-baf-workflow/gate-ask
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { GATE_REGISTRY, renderGate } from './gate-cards.ts'
import { cardTitle, formatCommandReport } from './command-format.ts'
import {
  askGateDialogQueued,
  bugPlanExtraArgs,
  hasBugField,
  judgmentOf,
  resolveUserQuestionsForTool,
  toolDriveAdapters,
  type GateBugPlan,
  type GateDialogInput,
} from './gate-dialog.ts'
import { driveGateResolve, loadWorkspaceBaseline } from './command-drives.ts'
import { makeGoDispatcher, type DispatchAgent } from './go-dispatch.ts'
import { beginIntake } from './begin-intake.ts'
import { bindSessionChange } from './session-change.ts'
import { clearParkedRequirementFor } from './requirement-park.ts'
import { ProjectionStore, isActiveChange, pickActiveChange } from './projection.ts'

/** Preset row identity — referenced from `agent.cordis.yml`. */
export const name = 'baf-gate-ask'

/** Service injection list. */
export const inject = ['tools'] as const

/**
 * Tool description — deliberately long. The model reads this verbatim to
 * know the contract: it can ask, never invent options; the §22 registry is
 * the single source of options; the customer's click (or the mapped command)
 * is what drives the transition. The dialog pauses until the customer
 * answers — the returned text is the resulting state, so the model must
 * read it before saying anything about what the customer chose.
 */
const description = [
  'Surface the standard confirmation gate for the customer. The gate comes from',
  'a fixed registry — the options are fixed, you cannot add a third path.',
  'Use this tool whenever you would otherwise be tempted to ask the customer',
  '"should I do X or Y?" in prose. Pick the gateId that matches the situation and',
  'call the tool: an interactive dialog pops for the customer when the UI',
  'supports it, and the tool WAITS until the customer answers, cancels, or',
  'skips. The returned text is the resulting state card — report from it, never',
  'from what you assume the customer did. If the customer paused (取消/跳过/暂不),',
  'tell them plainly and wait: the system re-pops the due gate after your next',
  'completed turn; do not treat silence or prose agreement as a choice. You MUST NOT',
  'synthesize options, paraphrase the card, or call any drive directly. The',
  'customer typing an option number or agreeing in prose is NOT evidence —',
  'say so plainly and wait; never hand the customer manual steps.',
  'Workflow decisions (workspace initialization, intake classification, stage',
  'gates, abandon, resume) MUST go through this tool or the registered slash',
  'commands — NEVER through generic question tools (e.g. ask_user_question):',
  'do not pre-interview the customer about classification or scope in prose,',
  'do not invent option lists the registry does not contain, and do not treat a',
  'generic-tool answer as gate consent.',
  '§22.19 division of labor (2026-09-21): the SYSTEM owns the popup line —',
  'after every completed turn the harness re-derives the resting point and',
  'pops the due gate itself, so you never need to prompt a gate just to move',
  'the workflow. Your calls to this tool are the mid-turn exceptions: the',
  'requirement bootstrap below, and an explicit re-pop when a paused card',
  'should come back now. Never narrate manual steps for the customer (no',
  '"click the workflow tab", no "type /baf-xxx") — if a gate is due, the',
  'system pops it; say what the state is and continue your work.',
  'Division of labor with baf_question_ask (2026-09-21 standing rule): THIS',
  'tool decides the workflow path. Every OTHER customer choice — content',
  'tradeoffs, scope preferences, "which of these two drafts", artifact',
  'questions mid-stage — goes through baf_question_ask, which pops the same',
  'kind of clickable card and returns what the customer clicked. NEVER present',
  'options as a prose A/B/C list and ask the customer to reply with a letter',
  'or "1A 2C": if the customer must pick, pop a card they click.',
  'When the customer states a NEW requirement (workspace initialized, no',
  'active change), do NOT narrate manual steps or ask them to type commands:',
  'call this tool with gateId intake-classify and requirement=<the customer\'s',
  'own words, quoted verbatim>. The tool pops the 新建工作流 confirmation',
  'first (spec §1: the first dialog is always bind-or-create), and 新建',
  'continues straight into the classification dialog (完整流程 / 缺陷修复路径',
  'judgment shown, customer clicks) in one call. On an uninitialized workspace',
  'that same call pops the scaffold gate instead — the workflow\'s actual next',
  'decision — and the answered 初始化工作区 leg then walks the same',
  '新建确认 → 分类确认 sequence.',
  'While a change is ALREADY running, ordinary customer messages (supplements,',
  'follow-ups, small adjustments) are input to THAT change — handle them in',
  'your normal work and do NOT call this tool for them. Route a message here',
  'only when it is clearly about a DIFFERENT piece of work; then the tool pops',
  'the 已有进行中的变更 dialog (继续推进现有变更 / 放弃现有变更 / 暂不处理)',
  'and dispatches the click — relay its result; do NOT re-ask the collision as',
  'a prose "A or B" question, and do not treat a typed letter as the',
  'customer\'s choice. If the customer wants the new work as a separate',
  'workflow, tell them to raise it in a NEW session (one workspace carries one',
  'active change).',
  'When the requirement looks like a bug fix, also pass the five draft fields',
  '(problem, rootCause, files, test, testCmd): the classification dialog shows',
  'them and the 缺陷修复路径 confirm click submits them in one step — the',
  'customer must never be asked to paste a long /baf-workflow-classify line.',
  'When the returned card says an intake is ALREADY confirmed but not yet in',
  'open (blocked by the environment), do not pop again: tell the customer to',
  'type /baf-go (retries the open) or click the workflow-tab 进入建立变更 button.',
  'When speaking to the customer, NEVER use internal vocabulary — no section',
  'numbers (e.g. §22), no registry names, no gateId values, no workflow-mode',
  'ids. Say 「需要你确认」「初始化工作区」「完整流程」「缺陷修复路径」 in plain',
  'Chinese instead.',
].join(' ')

/** Canonical output contract: a single text content block carrying the card. */
const OUTPUT_SCHEMA = {
  type: 'array',
  items: { type: 'json' },
} as const

/** Structural read of the runtime agent's session cwd (the public Agent type is id-only). */
function agentCwd(agent: unknown): string | undefined {
  const cwd = (agent as { session?: { header?: { cwd?: string } } } | undefined)
    ?.session?.header?.cwd
  return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
}

/** Structural read of the runtime agent's session id (用户问题 7 binding). */
function agentSessionId(agent: unknown): string | undefined {
  const id = (agent as { session?: { header?: { id?: string } } } | undefined)
    ?.session?.header?.id
  return typeof id === 'string' && id !== '' ? id : undefined
}

/** A single text content block. */
function textBlock(text: string): ContentBlock {
  return { type: 'text', text }
}

/**
 * The card for an intake whose classification is already confirmed but whose
 * open never landed (blocked precondition: Git unavailable, baseline missing,
 * bug fields missing…). Re-popping the classify dialog there reads as
 * "my cancel was ignored" — the first click already confirmed, what is left
 * is a *retry*, not a decision — so the tool returns the state instead and
 * points the customer at the two real push surfaces (2026-09-20 incident).
 *
 * Not for `clarify-required`: that verdict never settled a path, so its
 * classification decision is genuinely still open and the dialog SHOULD pop.
 */
function isSettledConfirmation(
  intake: { readonly confirmation: string; readonly mode: string } | undefined,
): boolean {
  return intake !== undefined
    && intake.confirmation === 'confirmed'
    && intake.mode !== 'clarify-required'
}

/** The already-confirmed note body for {@link isSettledConfirmation} hits. */
function confirmedIntakeNote(changeId: string, mode: string): string {
  const path = mode === 'bug-fix-path' ? '缺陷修复路径' : mode === 'full-go-path' ? '完整流程' : mode
  return [
    '【结果】',
    `  ${changeId} 的分类已确认（${path}），但尚未进入建立变更阶段——上一次进入被环境阻断（如 Git 不可用、基线缺失、缺陷字段未交）。`,
    '  不要再弹分类确认框，也不要替客户重试；请客户输入 /baf-go 继续（会重试进入并给出新的阻断原因），',
    '  或点工作流页签的「进入建立变更」按钮。环境问题解决后这一步即可通过。',
  ].join('\n')
}

/**
 * Spec §1 first dialog (2026-09-22 user decision): a stated requirement on a
 * workspace with NO active change is confirmed as a new workflow before
 * anything is minted — the requirement itself is intent, but the customer
 * settles the create/bind question on a card, not by implication. The card is
 * registry-backed like every workflow decision; 新建 continues the bootstrap,
 * 暂不 leaves the workspace untouched.
 */
async function confirmNewWorkflow(
  service: NonNullable<ReturnType<typeof resolveUserQuestionsForTool>>,
  agent: Parameters<typeof askGateDialogQueued>[1],
  requirement: string,
  signal?: AbortSignal,
): Promise<'create' | 'hold' | 'paused'> {
  const outcome = await askGateDialogQueued(service, agent, {
    gateId: 'new-workflow',
    note: [`客户新需求：「${requirement}」`],
  }, signal === undefined ? undefined : { signal })
  if (outcome.kind === 'answered') return outcome.optionId === 'create' ? 'create' : 'hold'
  return 'paused'
}

/**
 * The slash-report line `formatCommandReport` prints for the customer UI
 * (「类型：系统斜杠指令，无需大模型」 — this card cost no LLM tokens). Inside a
 * `baf_gate_ask` tool result the same line reads as "not an answer at all":
 * session 1.jsonl (2026-09-21) the model saw the scaffold done-card, read
 * that line plus the ✓ title, and told the customer 「已弹出但客户还没点击」.
 * Tool results re-label it so a dispatch card cannot masquerade as a
 * pre-choice menu echo.
 */
function modelFacingCardText(text: string): string {
  return text.replace('类型：系统斜杠指令，无需大模型', '类型：客户点选后的真实执行结果（确认门已推进）')
}

/**
 * First lines of every answered `baf_gate_ask` return: what the customer
 * actually clicked. The dispatch card below states the resulting workflow
 * state but never the choice itself, and a model that misreads 「初始化工作区
 * （scaffold）· 新增 2 项」 as a *prompt* instead of a *result* re-asks the
 * customer in prose — the exact anti-pattern §22.9 forbids.
 */
function choiceHeader(gateId: string, outcome: { readonly optionId: string; readonly label: string }): string {
  return [
    '【客户选择】',
    `  客户已在确认框点选「${outcome.label}」（gate=${gateId} · option=${outcome.optionId}），选择已生效并执行完毕。`,
    '  下面是执行后的真实状态卡：如实转述即可，不要把客户已经选过的选项再用文字问一遍。',
  ].join('\n')
}

/**
 * Register the `baf_gate_ask` tool on the host `tools` registry.
 *
 * @param ctx - cordis context; `tools` is injected, `userQuestions` is
 *   resolved lazily (a composition without it keeps the card-only tool).
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'baf_gate_ask',
    description,
    parameters: {
      gateId: {
        type: 'string',
        required: true,
        description: 'The §22 gate id. Must be one of: scaffold | new-workflow | intake-classify | active-conflict | bind-workflow | open-advance | clarify-advance | design-advance | plan-advance | design-confirm | verify-archive | abandon | resume. The system pops due gates itself after each completed turn (§22.19) — explicit calls are mid-turn re-pops or the requirement bootstrap; active-conflict pops automatically when a requirement arrives beside a running change, bind-workflow when several changes are active, and new-workflow is the first dialog of any new requirement (an explicit new-workflow call behaves exactly like the intake-classify bootstrap). Unknown ids return a refusal card.',
      },
      changeId: {
        type: 'string',
        description: 'Optional active change id. Required for change-scoped gates (intake-classify, design-confirm, verify-archive, abandon, resume). Omit only for workspace-scoped gates (scaffold).',
      },
      requirement: {
        type: 'string',
        description: 'The customer\'s own words describing new work, quoted verbatim. Used by gateId=intake-classify/new-workflow when no changeId is given (or the given one does not exist in the workspace — the system mints ids, the model never authors one): the tool opens the change from this requirement and pops the classification dialog for it. Requires an initialized workspace; otherwise the scaffold gate pops instead.',
      },
      problem: {
        type: 'string',
        description: 'Bug-fix draft: the observed symptom (problem=). Shown on the classification dialog and submitted with the 缺陷修复路径 confirm click.',
      },
      rootCause: {
        type: 'string',
        description: 'Bug-fix draft: the diagnosed root cause (root-cause=). Shown on the classification dialog and submitted with the 缺陷修复路径 confirm click.',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Bug-fix draft: the affected source files (file=), one entry per file.',
      },
      test: {
        type: 'string',
        description: 'Bug-fix draft: the regression test file to add first (test=).',
      },
      testCmd: {
        type: 'string',
        description: 'Bug-fix draft: the command that runs the regression test (test-cmd=).',
      },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => value as unknown as ContentBlock[],
    },
    execute: async (args, exec) => {
      const gateId = typeof args.gateId === 'string' ? args.gateId : ''
      const changeId = typeof args.changeId === 'string' && args.changeId !== '' ? args.changeId : undefined
      const requirement = typeof args.requirement === 'string' ? args.requirement.trim() : ''
      // §22.17 J — the bug-fix five-field draft. Optional; any subset shows on
      // the classification dialog and rides the confirm dispatch, so the
      // customer confirms real content instead of pasting the long command.
      const bugPlan: GateBugPlan = {
        ...(typeof args.problem === 'string' && args.problem.trim() !== '' ? { problem: args.problem.trim() } : {}),
        ...(typeof args.rootCause === 'string' && args.rootCause.trim() !== '' ? { rootCause: args.rootCause.trim() } : {}),
        ...(Array.isArray(args.files)
          ? { files: args.files.filter((f): f is string => typeof f === 'string' && f.trim() !== '').map(f => f.trim()) }
          : {}),
        ...(typeof args.test === 'string' && args.test.trim() !== '' ? { test: args.test.trim() } : {}),
        ...(typeof args.testCmd === 'string' && args.testCmd.trim() !== '' ? { testCmd: args.testCmd.trim() } : {}),
      }
      const draft = hasBugField(bugPlan) ? bugPlan : undefined
      const cwd = agentCwd(exec.agent)
      // 【变更】2026-09-27 (demo-bugfix4 真机): the model sometimes INVENTS a
      // changeId (e.g. fix-ecum-export-empty-crash) instead of using a minted
      // one. The dialog then pops for a change that does not exist and the
      // customer's confirm lands on「无此变更」(the whole intake bootstrap —
      // scaffold diversion, pending check, conflict check, mint — only ran
      // for the no-id form). A carried id that is not in the projection
      // index is treated as absent, so the same bootstrap runs; without a
      // requirement to mint from, the refusal names the rule (ids are
      // minted by the system, never authored by the model).
      let effectiveChangeId = changeId
      if ((gateId === 'intake-classify' || gateId === 'new-workflow') && changeId !== undefined && cwd !== undefined) {
        const known = await new ProjectionStore({ workspaceRoot: cwd }).readIndex()
          .then(ix => ix.changes.some(c => c.changeId === changeId))
          .catch(() => false)
        if (!known) {
          if (requirement === '') {
            return [textBlock(`【结果】\n  changeId=${changeId} 在本工作区不存在——changeId 由系统铸造，不要自造。请改用 requirement=<客户原话> 重新调用。`)] as unknown as JsonValue[]
          }
          effectiveChangeId = undefined
        }
      }
      let card = renderGate(
        gateId,
        cwd === undefined && effectiveChangeId === undefined
          ? undefined
          : { cwd: cwd ?? '', ...(effectiveChangeId === undefined ? {} : { changeId: effectiveChangeId }) },
      )
      // Unknown gate → the refusal card above is the whole answer.
      if (!(gateId in GATE_REGISTRY)) return [textBlock(card.text ?? '')] as unknown as JsonValue[]
      const service = resolveUserQuestionsForTool(ctx, exec.agent)
      if (service === undefined || cwd === undefined || exec.agent === undefined) {
        // No answerer / no workspace — the original §22.9 card-only contract.
        return [textBlock(card.text ?? '')] as unknown as JsonValue[]
      }
      const agent = exec.agent

      // §22.17 I — intake bootstrap. gateId intake-classify without a change
      // id is the model handing the customer's freshly stated requirement to
      // the workflow (the §18.2 edge form): the change is minted through the
      // same driveOpen the /baf-workflow-open slash uses, then the
      // classification dialog pops for it. Without this branch the model has
      // no tool that reaches the classification decision at all, and a
      // stated requirement dead-ends in prose instructions (2026-09-20
      // incident: the model wrote a manual-steps message instead of a popup).
      let input: GateDialogInput = {
        gateId: gateId as keyof typeof GATE_REGISTRY,
        ...(effectiveChangeId === undefined ? {} : { changeId: effectiveChangeId }),
      }
      // 【变更】2026-09-22 (session 1.jsonl): when the bootstrap below diverts
      // to the scaffold gate, remember the requirement that caused it — the
      // answered scaffold leg continues the bootstrap in the same call
      // instead of dead-ending the model with the scaffold slash-card.
      let scaffoldDiversion: string | undefined
      if ((gateId === 'intake-classify' || gateId === 'new-workflow') && effectiveChangeId === undefined) {
        if (requirement === '') {
          return [textBlock(`${card.text ?? ''}\n\n【结果】\n  分类确认需要传 changeId（已有变更），或用 requirement 传客户原话开始一条新工作。`)] as unknown as JsonValue[]
        }
        if (await loadWorkspaceBaseline(cwd) === undefined) {
          // The workflow's actual next decision is initialization — pop the
          // scaffold gate instead of failing; after the customer initializes,
          // the tool continues with the same requirement (see the loop below).
          card = renderGate('scaffold', { cwd })
          input = { gateId: 'scaffold' }
          scaffoldDiversion = requirement
        } else {
          const store = new ProjectionStore({ workspaceRoot: cwd })
          const actives = (await store.readIndex()).changes.filter(isActiveChange)
          const pending = actives.find(c => c.current === 'intake')
          if (pending !== undefined) {
            // Confirmed-but-never-opened is NOT a pending classification — the
            // old message ("已有待确认分类的变更…请带 changeId 重新调用") sent the
            // model to re-pop a confirm dialog for an already-confirmed intake,
            // which the customer rightly read as "cancel did nothing".
            const parked = await store.readStatus(pending.changeId).catch(() => undefined)
            if (isSettledConfirmation(parked?.intake)) {
              return [textBlock(`${card.text ?? ''}\n\n${confirmedIntakeNote(pending.changeId, parked?.intake?.mode ?? '')}`)] as unknown as JsonValue[]
            }
            return [textBlock(`${card.text ?? ''}\n\n【结果】\n  已有待确认分类的变更 ${pending.changeId}；请带 changeId=${pending.changeId} 重新调用，不要新开一条。`)] as unknown as JsonValue[]
          }
          if (actives.length > 0) {
            // §18.6 / 2026-09-21 (session 6.jsonl): one workflow per
            // workspace — and the collision itself is a customer decision, so
            // it pops as the registered active-conflict dialog. The old
            // text-only refusal forced the model to bridge the gap with a
            // prose "A. 继续推进 / B. 新开会话" question the customer had to
            // answer by typing a letter; now the two real actions are the
            // clickable options and the click dispatches through the same
            // resolve channel every gate option uses.
            const ranked = pickActiveChange(actives)
            const focus = ranked.kind === 'one'
              ? actives.find(c => c.changeId === ranked.changeId)
              : ranked.kind === 'ambiguous' ? ranked.candidates[0] : undefined
            if (focus !== undefined) {
              const conflictCard = renderGate('active-conflict', { cwd, changeId: focus.changeId })
              const outcome = await askGateDialogQueued(service, agent, {
                gateId: 'active-conflict',
                changeId: focus.changeId,
                note: [
                  `现有变更当前进行到：${focus.current}`,
                  `客户提出的新需求：「${requirement}」`,
                ],
              }, { signal: exec.signal })
              if (outcome.kind === 'answered') {
                // 2026-09-23 issue #1: the conflict option click is a customer
                // action — a 「继续推进现有变更」 pick may dispatch at the
                // change's authoring rest.
                const conflictSessionId = agentSessionId(agent)
                if (conflictSessionId !== undefined) bindSessionChange(cwd, conflictSessionId, focus.changeId)
                const conflictDispatch = makeGoDispatcher(cwd, agent as unknown as DispatchAgent)
                const result = await driveGateResolve(
                  cwd,
                  'active-conflict',
                  outcome.optionId,
                  toolDriveAdapters(ctx, agent, cwd),
                  undefined,
                  undefined,
                  'gate-card',
                  {
                    changeId: focus.changeId,
                    ...(conflictDispatch === undefined ? {} : { dispatch: conflictDispatch }),
                  },
                )
                // After an abandon the workspace is free again — tell the
                // model the exact next call so the new requirement continues
                // from the classification pop instead of dying in prose.
                const after = outcome.optionId === 'abandon'
                  ? `\n\n【结果】\n  现有变更已按客户点选放弃，工作区已空出。请立刻用客户刚才的原话（requirement=${requirement}）重新调用 baf_gate_ask（gateId=intake-classify）——分类确认卡会马上弹出，新需求从这一步继续。`
                  : ''
                return [textBlock(`${choiceHeader('active-conflict', outcome)}\n${modelFacingCardText(result.text ?? '')}${after}`)] as unknown as JsonValue[]
              }
              // 【变更】2026-09-28 (用户问题 1.7): 'revise' cannot occur on this
              // gate (active-conflict has no revisable artifact) — the branch
              // only satisfies narrowing, treating it as no-choice-made.
              const note = outcome.kind === 'paused' || outcome.kind === 'revise'
                ? '【结果】\n  客户暂未选择（关闭了确认框）。\n  不要替客户决定；可再次调用 baf_gate_ask（gateId=intake-classify，requirement=客户原话）重弹这张卡，或等客户明确说出想推进还是放弃后再操作。'
                : `【结果】\n  确认框不可用（${outcome.reason}）；上面是选项卡原文。\n  不要指导客户手动操作；系统会在下一个回合结束时自动重弹到期确认卡，如实说明当前状态即可。`
              return [textBlock(`${conflictCard.text ?? ''}\n\n${note}`)] as unknown as JsonValue[]
            }
            // Unrankable index rows — the pre-dialog refusal shape, unchanged.
            return [textBlock(`${card.text ?? ''}\n\n【结果】\n  本工作区已有进行中的变更 ${actives[0]?.changeId}（当前 ${String(actives[0]?.current)}）；请先推进或收尾它，新需求另开会话提出。`)] as unknown as JsonValue[]
          }
          // 【变更】2026-09-22 user decision (workflow spec §1, literal): with
          // no active change the FIRST dialog of a new requirement is an
          // explicit 新建工作流 confirmation — the requirement itself is
          // intent, but the create/bind decision settles on a card. 新建
          // continues straight into the classification dialog in this same
          // call; 暂不 leaves the workspace untouched.
          const confirmed = await confirmNewWorkflow(service, agent, requirement, exec.signal)
          if (confirmed !== 'create') {
            const note = confirmed === 'paused'
              ? '【结果】\n  客户暂未选择（关闭了新建确认框）。\n  不要替客户决定；可再次调用 baf_gate_ask（gateId=intake-classify，requirement=客户原话）重弹这张卡，或等客户明确后再操作。'
              : '【结果】\n  客户选择暂不新建工作流，本次没有创建任何变更。\n  如实转述即可；客户再次提出需求时会重新弹出新建确认卡。'
            return [textBlock(`${card.text ?? ''}\n\n${note}`)] as unknown as JsonValue[]
          }
          // §22.19 — mint through the single entry. The structured outcome
          // replaces the index-diff this used to run (the diff itself raced:
          // session 7.jsonl R1 minted a twin change beside the auto-pop one);
          // 'reused' means the racing twin is this same requirement, so the
          // classification pop below simply targets it.
          const outcome = await beginIntake(cwd, requirement)
          if (outcome.kind !== 'minted' && outcome.kind !== 'reused') {
            // driveOpen refused (its card says why — empty description, or an
            // active change that appeared between the checks above and the
            // locked mint; the backstop card lists the candidates).
            return [textBlock(outcome.card.text ?? '')] as unknown as JsonValue[]
          }
          // 【变更】2026-09-23 (demo1 issue #1 follow-up): the statement just
          // became a change — spend the auto-pop park for this session so a
          // later /baf-go cannot offer it as an active-conflict against the
          // change it spawned.
          clearParkedRequirementFor(agent)
          input = { gateId: 'intake-classify', changeId: outcome.changeId }
        }
      }
      // 【变更】2026-09-22 (session 1.jsonl): the answered return used to be
      // the dispatch card alone, and a diverted scaffold leg ended the call
      // right there — the model read the scaffold slash-card (「类型：系统斜杠
      // 指令，无需大模型」) as "the gate popped but nobody clicked", re-asked the
      // choice in prose, and the stated requirement died in model context
      // (nothing durable for §22.19 to auto-pop). The loop below fixes both:
      // every answered leg opens with the customer's actual choice, and a
      // scaffold diversion the customer resolved with 初始化工作区 CONTINUES the
      // bootstrap in the same call — beginIntake mints the requirement and the
      // classification dialog pops as leg 2, so one tool call carries a new
      // requirement from an uninitialized workspace to a real classification
      // decision with no prose round-trip.
      const parts: string[] = []
      for (let leg = 1; ; leg += 1) {
        // 【变更】2026-09-28 (用户问题 7): this session is driving the change
        // the dialog is about — record it so its workflow Tab shows THIS
        // change's graph instead of the workspace-ranked one.
        const sessionId = agentSessionId(agent)
        if (input.changeId !== undefined && sessionId !== undefined) {
          bindSessionChange(cwd, sessionId, input.changeId)
        }
        if (leg > 1 && input.gateId === 'intake-classify') {
          // The paused-note fallback below quotes the registry card for the
          // gate being asked; after a scaffold diversion `card` still holds
          // the scaffold rendering, so re-render for the classify leg.
          card = renderGate('intake-classify', { cwd, ...(input.changeId === undefined ? {} : { changeId: input.changeId }) })
        }
        if (input.gateId === 'intake-classify' && input.judgment === undefined && input.changeId !== undefined) {
          // Show the classifier's verdict on every intake-classify pop — a
          // model-supplied changeId reaches here without one. Unknown ids just
          // keep the plain question (the dispatch below will refuse them).
          // A *confirmed* intake stops here instead of popping: its
          // classification decision is settled (clicking again is a retry, and
          // a cancel would read as "ignored"), so the card explains the parked
          // state and the two push surfaces.
          try {
            const status = await new ProjectionStore({ workspaceRoot: cwd }).readStatus(input.changeId)
            if (status.intake !== undefined) {
              if (isSettledConfirmation(status.intake) && status.current === 'intake') {
                return [textBlock([...parts, card.text ?? '', confirmedIntakeNote(input.changeId, status.intake.mode)].join('\n\n'))] as unknown as JsonValue[]
              }
              input = { ...input, judgment: judgmentOf(status.intake) }
            }
          } catch {
            // No projection for that id — the registry card already explains.
          }
        }
        if (input.gateId === 'intake-classify' && draft !== undefined) {
          input = { ...input, bugPlan: draft }
        }

        const outcome = await askGateDialogQueued(
          service,
          agent,
          input,
          { signal: exec.signal },
        )
        if (outcome.kind === 'answered') {
          // The customer clicked a resolving option — dispatch through the same
          // single resolve channel the Tab uses (§22.14), then hand the model
          // the resulting state card. §22.17 J: the bug-fix draft rides the
          // confirm dispatch as extraArgs so one click settles path + fields.
          const extra = bugPlanExtraArgs(input.bugPlan)
          // 2026-09-23 issue #1: the dialog answer is a customer click — the
          // resolved drive may dispatch at the rest it lands on.
          const askDispatch = makeGoDispatcher(cwd, agent as unknown as DispatchAgent)
          let result: CommandResult
          try {
            result = await driveGateResolve(
              cwd,
              input.gateId,
              outcome.optionId,
              toolDriveAdapters(ctx, agent, cwd),
              undefined,
              undefined,
              'gate-card',
              {
                ...(input.changeId === undefined ? {} : { changeId: input.changeId }),
                ...(extra === undefined ? {} : { extraArgs: extra }),
                ...(askDispatch === undefined ? {} : { dispatch: askDispatch }),
              },
            )
          } catch (error) {
            // 【变更】2026-09-22 (session 1.jsonl follow-up): a dispatch may
            // refuse AFTER recording the parked state — driveClassify confirm
            // throws when full-go-path open finds no usable Git, exactly the
            // incident workspace's shape. The slash surface lets BafError fly
            // to the host runner; a model-facing tool must not: the customer's
            // choice already landed in the projection, so re-read it and
            // return the honest blocked card instead of a crashed tool call.
            const changeIdNow = input.changeId
            const parked = changeIdNow === undefined ? undefined
              : await new ProjectionStore({ workspaceRoot: cwd }).readStatus(changeIdNow).catch(() => undefined)
            const intake = parked?.intake
            if (changeIdNow !== undefined && input.gateId === 'intake-classify' && parked !== undefined && intake !== undefined && isSettledConfirmation(intake) && parked.current === 'intake') {
              result = { kind: 'error', text: confirmedIntakeNote(changeIdNow, intake.mode) }
            } else {
              result = {
                kind: 'error',
                text: formatCommandReport(false, cardTitle('gateResolve', '客户点选已执行，但推进被环境阻断'), [
                  { title: '原因', lines: [error instanceof Error ? error.message : String(error)] },
                  { title: '处理', lines: ['客户的选择已记录在案；解决环境问题后输入 /baf-go 重试推进，或点工作流页签按钮'] },
                ]),
              }
            }
          }
          parts.push(choiceHeader(String(input.gateId), outcome), modelFacingCardText(result.text ?? ''))
          // 【变更】2026-09-22 (web walk): the post-confirm return used to end
          // at the state card, and the model closed its turn asking the
          // clarify questions in prose — the customer then had nothing to
          // click and the change stalled at a template clarify.md. The
          // standing orders keep the loop card-driven end to end.
          if (
            input.gateId === 'intake-classify'
            && (outcome.optionId === 'confirm-full' || outcome.optionId === 'confirm-bugfix')
            && result.kind === 'success'
          ) {
            parts.push('【接下来】\n  本变更的阶段产物（澄清 / 设计 / 计划 / 实现）由你产出：需要客户决策时必须调用 baf_question_ask 弹卡提问——禁止纯文本提问后结束回合；当前阶段产物完成后直接结束回合，系统会在回合结束时检查产物并弹出下一阶段确认卡。不要执行 /baf-go，也不要指导客户敲命令——推进由系统负责。')
          }
          if (
            leg === 1 && scaffoldDiversion !== undefined && input.gateId === 'scaffold'
            && result.kind === 'success'
          ) {
            // Spec §1 ordering on a fresh workspace: scaffold (environment) →
            // 新建确认 → 分类确认 — the same explicit create card the
            // initialized-workspace bootstrap shows, so the first workflow
            // decision is always a card, not an implication.
            const confirmed = await confirmNewWorkflow(service, agent, scaffoldDiversion, exec.signal)
            if (confirmed !== 'create') {
              parts.push(confirmed === 'paused'
                ? '【结果】\n  客户暂未选择（关闭了新建确认框）。\n  工作区已初始化但还没有新建工作流；可再次调用 baf_gate_ask（gateId=intake-classify，requirement=客户原话）重弹确认。'
                : '【结果】\n  客户选择暂不新建工作流。\n  工作区已初始化；客户再次提出需求时会重新弹出新建确认卡。')
              return [textBlock(parts.join('\n\n'))] as unknown as JsonValue[]
            }
            // The workspace is now initialized — resume the bootstrap this
            // call started with. 'reused' (a change already parked at intake
            // for this requirement) converges on it instead of minting a twin.
            const minted = await beginIntake(cwd, scaffoldDiversion)
            if (minted.kind === 'minted' || minted.kind === 'reused') {
              // 【变更】2026-09-23 (demo1 issue #1 follow-up): same park spend
              // as the non-scaffold mint above — the statement became a change.
              clearParkedRequirementFor(agent)
              scaffoldDiversion = undefined
              input = { gateId: 'intake-classify', changeId: minted.changeId }
              continue
            }
            // Refused (an active change appeared / empty text) — its card says why.
            parts.push(modelFacingCardText(minted.card.text ?? ''))
          }
          return [textBlock(parts.join('\n\n'))] as unknown as JsonValue[]
        }
        // 2026-09-21 user request: one wording for all three pause shapes
        // (dismissed / cancelled / skipped) — they mean the same thing to the
        // model ("no choice was made") and the old three-way phrasing read as
        // three different situations. §22.19: the system re-pops the due gate
        // after the next completed turn, so the model must NOT hand the
        // customer manual steps (session 7.jsonl complaint #4 — the「请在工作流
        // 页签点选…」sentence came from exactly this note).
        // 【变更】2026-09-28 (用户问题 1.7): a revisable gate can come back with
        // the customer's modification text — this is a MODEL-tool pop (no
        // dispatch channel by the red line), so the note hands the text back
        // as an instruction: revise the artifact yourself, the system re-pops.
        const note = outcome.kind === 'paused'
          ? '【结果】\n  客户暂未选择（关闭了确认框）。\n  不要替客户决定，也不要指导客户点页签或输入命令——系统会在你下一个回合结束时自动重新弹出这张卡；如实说明当前状态即可。'
          : outcome.kind === 'revise'
            ? `【结果】\n  客户提交了修改意见：「${outcome.text}」。\n  请按意见直接修订本阶段产物（不要另建文件）；修订完成后系统会在回合结束自动重弹确认卡。`
            : `【结果】\n  确认框不可用（${outcome.reason}）；上面是选项卡原文。\n  不要指导客户手动操作；系统会在下一个回合结束时自动重弹到期确认卡，如实说明当前状态即可。`
        parts.push(card.text ?? '', note)
        return [textBlock(parts.join('\n\n'))] as unknown as JsonValue[]
      }
    },
  }))
}
