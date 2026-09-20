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
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { GATE_REGISTRY, renderGate } from './gate-cards.ts'
import {
  askGateDialog,
  bugPlanExtraArgs,
  hasBugField,
  judgmentOf,
  resolveUserQuestionsForTool,
  toolDriveAdapters,
  type GateBugPlan,
  type GateDialogInput,
} from './gate-dialog.ts'
import { driveGateResolve, driveOpen, loadWorkspaceBaseline } from './command-drives.ts'
import { ProjectionStore, isActiveChange } from './projection.ts'

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
  'tell them plainly and point at /baf-go (re-pops the dialog) or the Tab',
  'buttons; do not treat silence or prose agreement as a choice. You MUST NOT',
  'synthesize options, paraphrase the card, or call any drive directly. The',
  'customer typing an option number or agreeing in prose is NOT evidence —',
  'point them at the registered command instead.',
  'Workflow decisions (workspace initialization, intake classification, stage',
  'gates, abandon, resume) MUST go through this tool or the registered slash',
  'commands — NEVER through generic question tools (e.g. ask_user_question):',
  'do not pre-interview the customer about classification or scope in prose,',
  'do not invent option lists the registry does not contain, and do not treat a',
  'generic-tool answer as gate consent. Generic question tools are only for',
  'clarification that does not decide the workflow path.',
  'When the customer states a NEW requirement (workspace initialized, no',
  'active change), do NOT narrate manual steps or ask them to type commands:',
  'call this tool with gateId intake-classify and requirement=<the customer\'s',
  'own words, quoted verbatim>. The tool opens the change and pops the',
  'classification dialog (完整流程 / 缺陷修复路径 judgment shown, customer',
  'clicks) in one step. On an uninitialized workspace that same call pops the',
  'scaffold gate instead — the workflow\'s actual next decision.',
  'When the requirement looks like a bug fix, also pass the five draft fields',
  '(problem, rootCause, files, test, testCmd): the classification dialog shows',
  'them and the 缺陷修复路径 confirm click submits them in one step — the',
  'customer must never be asked to paste a long /baf-workflow-classify line.',
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

/** A single text content block. */
function textBlock(text: string): ContentBlock {
  return { type: 'text', text }
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
        description: 'The §22 gate id. Must be one of: scaffold | intake-classify | design-confirm | verify-archive | abandon | resume. Unknown ids return a refusal card.',
      },
      changeId: {
        type: 'string',
        description: 'Optional active change id. Required for change-scoped gates (intake-classify, design-confirm, verify-archive, abandon, resume). Omit only for workspace-scoped gates (scaffold).',
      },
      requirement: {
        type: 'string',
        description: 'The customer\'s own words describing new work, quoted verbatim. Only used by gateId=intake-classify WITHOUT changeId: the tool opens the change from this requirement and pops the classification dialog for it. Requires an initialized workspace; otherwise the scaffold gate pops instead.',
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
      let card = renderGate(
        gateId,
        cwd === undefined && changeId === undefined
          ? undefined
          : { cwd: cwd ?? '', ...(changeId === undefined ? {} : { changeId }) },
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
      let input: GateDialogInput = { gateId: gateId as keyof typeof GATE_REGISTRY, ...(changeId === undefined ? {} : { changeId }) }
      if (gateId === 'intake-classify' && changeId === undefined) {
        if (requirement === '') {
          return [textBlock(`${card.text ?? ''}\n\n【结果】\n  分类确认需要传 changeId（已有变更），或用 requirement 传客户原话开始一条新工作。`)] as unknown as JsonValue[]
        }
        if (await loadWorkspaceBaseline(cwd) === undefined) {
          // The workflow's actual next decision is initialization — pop the
          // scaffold gate instead of failing; after the customer initializes,
          // the model retries this call with the same requirement.
          card = renderGate('scaffold', { cwd })
          input = { gateId: 'scaffold' }
        } else {
          const store = new ProjectionStore({ workspaceRoot: cwd })
          const actives = (await store.readIndex()).changes.filter(isActiveChange)
          const pending = actives.find(c => c.current === 'intake')
          if (pending !== undefined) {
            return [textBlock(`${card.text ?? ''}\n\n【结果】\n  已有待确认分类的变更 ${pending.changeId}；请带 changeId=${pending.changeId} 重新调用，不要新开一条。`)] as unknown as JsonValue[]
          }
          if (actives.length > 0) {
            // §18.6: one workflow per session — a running change elsewhere in
            // the flow means the requirement belongs to a new session, not a
            // second change minted here.
            return [textBlock(`${card.text ?? ''}\n\n【结果】\n  本工作区已有进行中的变更 ${actives[0]?.changeId}（当前 ${String(actives[0]?.current)}）；请先推进或收尾它，新需求另开会话提出。`)] as unknown as JsonValue[]
          }
          const opened = await driveOpen(cwd, requirement, 'model-tool')
          const minted = (await store.readIndex()).changes
            .filter(isActiveChange).map(c => c.changeId)
            .find(id => !actives.some(c => c.changeId === id))
          if (minted === undefined) {
            // driveOpen refused (its card says why, e.g. empty description).
            return [textBlock(opened.text ?? '')] as unknown as JsonValue[]
          }
          input = { gateId: 'intake-classify', changeId: minted }
        }
      }
      if (input.gateId === 'intake-classify' && input.judgment === undefined && input.changeId !== undefined) {
        // Show the classifier's verdict on every intake-classify pop — a
        // model-supplied changeId reaches here without one. Unknown ids just
        // keep the plain question (the dispatch below will refuse them).
        try {
          const status = await new ProjectionStore({ workspaceRoot: cwd }).readStatus(input.changeId)
          if (status.intake !== undefined) input = { ...input, judgment: judgmentOf(status.intake) }
        } catch {
          // No projection for that id — the registry card already explains.
        }
      }
      if (input.gateId === 'intake-classify' && draft !== undefined) {
        input = { ...input, bugPlan: draft }
      }

      const outcome = await askGateDialog(
        service,
        agent,
        input,
        exec.signal,
      )
      if (outcome.kind === 'answered') {
        // The customer clicked a resolving option — dispatch through the same
        // single resolve channel the Tab uses (§22.14), then hand the model
        // the resulting state card. §22.17 J: the bug-fix draft rides the
        // confirm dispatch as extraArgs so one click settles path + fields.
        const extra = bugPlanExtraArgs(input.bugPlan)
        const result = await driveGateResolve(
          cwd,
          input.gateId,
          outcome.optionId,
          toolDriveAdapters(ctx, agent, cwd),
          undefined,
          'gate-card',
          input.changeId === undefined ? undefined : {
            changeId: input.changeId,
            ...(extra === undefined ? {} : { extraArgs: extra }),
          },
        )
        return [textBlock(result.text ?? '')] as unknown as JsonValue[]
      }
      const note = outcome.kind === 'paused'
        ? `【结果】\n  客户暂未选择（${outcome.reason === 'dismissed' ? '选择了「暂不」' : outcome.reason === 'cancelled' ? '关闭了确认框' : '跳过了确认框'}）。\n  不要替客户决定；可提示：/baf-go 重新弹出确认框，或 /baf-go-confirm 直接继续。`
        : `【结果】\n  确认框不可用（${outcome.reason}）；上面是选项卡原文。\n  请客户点工作流页签按钮或输入对应命令。`
      return [textBlock(`${card.text ?? ''}\n\n${note}`)] as unknown as JsonValue[]
    },
  }))
}
