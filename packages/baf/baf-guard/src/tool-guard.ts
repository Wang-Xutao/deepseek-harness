/**
 * ToolGuard adapter: classifies mutating tool calls (write/edit/bash/pwsh)
 * and adjudicates them synchronously against the projection state. The
 * guard runs after permission decisions and before every tool body — it can
 * only deny, never force-allow (ToolRuntime contract).
 * @module @deepseek-ai/dsh-baf-guard/tool-guard
 */

import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import {
  adjudicateFsWrite,
  adjudicateShell,
  type GuardDecision,
  type GuardPolicyConfig,
  type GuardWorkflowState,
} from './policy.ts'
import { loadGuardConfig, readGuardWorkflowState } from './projection-state.ts'

/** Denial strings start with this stable prefix. */
export const BAF_GUARD_PREFIX = '[baf-guard]'

/** One classified mutating call; every other tool shape is out of scope. */
export type ClassifiedCall =
  | { readonly kind: 'fs-write'; readonly path: string; readonly content?: string }
  | { readonly kind: 'shell'; readonly command: string }
  | { readonly kind: 'unrecognized' }

interface WriteArgs {
  readonly file_path?: unknown
  readonly content?: unknown
}

interface EditArgs {
  readonly file_path?: unknown
  readonly old_string?: unknown
  readonly new_string?: unknown
}

interface ShellArgs {
  readonly command?: unknown
}

/**
 * Map a tool execution to the mutating call it represents. Only the four
 * workspace-mutating tools the BAF composition exposes are classified;
 * read-only tools and future tools pass through (`unrecognized` → allow,
 * logged in the report as unclassified).
 * @param name - tool name.
 * @param args - parsed tool arguments.
 * @returns classified call.
 */
export function classifyToolCall(name: string, args: unknown): ClassifiedCall {
  if (name === 'write') {
    const a = (args ?? {}) as WriteArgs
    if (typeof a.file_path === 'string') {
      return {
        kind: 'fs-write',
        path: a.file_path,
        ...(typeof a.content === 'string' ? { content: a.content } : {}),
      }
    }
    return { kind: 'unrecognized' }
  }
  if (name === 'edit') {
    const a = (args ?? {}) as EditArgs
    if (typeof a.file_path === 'string') {
      return {
        kind: 'fs-write',
        path: a.file_path,
        ...(typeof a.new_string === 'string' ? { content: a.new_string } : {}),
      }
    }
    return { kind: 'unrecognized' }
  }
  if (name === 'bash' || name === 'pwsh') {
    const a = (args ?? {}) as ShellArgs
    if (typeof a.command === 'string') return { kind: 'shell', command: a.command }
    return { kind: 'unrecognized' }
  }
  return { kind: 'unrecognized' }
}

/** Render a denial decision as the stable guard message. */
export function renderDenial(decision: GuardDecision): string | undefined {
  if (decision.allowed) return undefined
  return `${BAF_GUARD_PREFIX} ${decision.reasonCode}: ${decision.message}`
}

/** Injectable state/config readers (tests substitute deterministic ones). */
export interface ToolGuardSources {
  readonly readConfig: (workspaceRoot: string) => GuardPolicyConfig
  /** §22.19: the optional target path drives ranking rule 1 for fs-writes. */
  readonly readState: (workspaceRoot: string, targetPath?: string) => GuardWorkflowState
}

/** Default sources: sync disk reads of `.baf/`. */
export const diskSources: ToolGuardSources = {
  readConfig: loadGuardConfig,
  readState: readGuardWorkflowState,
}

/** Options for {@link createBafToolGuard}. */
export interface BafToolGuardOptions {
  /** Absolute workspace root the agent operates in. */
  readonly workspaceRoot: string
  /** Overrides for tests. */
  readonly sources?: ToolGuardSources
}

/** The generic question tool the BAF composition exposes (tool-ask-user row). */
const ASK_USER_TOOL = 'ask_user_question'

/**
 * 2026-09-21 standing rule: does this `ask_user_question` payload carry at
 * least one question with a non-empty `options` array? Option-bearing asks are
 * selection questions, and every selection must pop through the BAF channels
 * (`baf_question_ask`, or `baf_gate_ask` for workflow decisions) so the
 * customer always clicks the same kind of card and the result text is the
 * click — a generic-tool option list looks identical to a registry gate to
 * the customer but bypasses the popup discipline entirely. Free-text-only
 * clarification (no options) stays legal.
 */
function hasOptionBearingQuestion(args: unknown): boolean {
  if (typeof args !== 'object' || args === null) return false
  const questions = (args as { questions?: unknown }).questions
  if (!Array.isArray(questions)) return false
  return questions.some(q =>
    typeof q === 'object' && q !== null && Array.isArray((q as { options?: unknown }).options)
    && ((q as { options?: unknown }).options as unknown[]).length > 0,
  )
}

/**
 * Create the synchronous ToolGuard for one agent workspace. Every call
 * re-reads config + state: the guard never caches across tool executions.
 * @param options - workspace binding and source overrides.
 * @returns ToolGuard returning a denial string or undefined.
 */
export function createBafToolGuard(options: BafToolGuardOptions) {
  const sources = options.sources ?? diskSources
  return (execution: Readonly<ToolExecution>): string | undefined => {
    // §22.17 J hard line: while a customer-confirmation gate is pending
    // (unconfirmed classification, parked gate A/B), the generic question
    // tool must not substitute for the registry gate card — the model has to
    // call `baf_gate_ask` so the decision surfaces as a clickable dialog.
    // Outside a pending gate the generic tool stays legal (clarifications
    // that decide nothing are its job); the idle-workspace guarantee comes
    // from the host-plane auto-pop row instead.
    if (execution.name === ASK_USER_TOOL) {
      const state = sources.readState(options.workspaceRoot)
      // `gatePending === true` keeps the undefined (unknown) case open — the
      // hard line only fires on a positively-read pending gate.
      if (state.active && state.gatePending === true) {
        return `${BAF_GUARD_PREFIX} gate_pending_ask_blocked: 当前有未决的工作流确认（分类 / 设计确认 / 归档确认）。请改用 baf_gate_ask 弹出注册表确认卡让客户点选，不得用通用提问工具代答或代问工作流决策。`
      }
      // 2026-09-21 standing rule (session 6.jsonl): option-bearing generic
      // asks are selection questions — they must ride the BAF popup channels,
      // not the generic tool. Checked outside the pending-gate window because
      // the rule holds at every workflow state, not just parked gates.
      if (hasOptionBearingQuestion(execution.arguments)) {
        return `${BAF_GUARD_PREFIX} ask_options_blocked: 选择类问题必须用 baf_question_ask 弹卡让客户点选（工作流决策用 baf_gate_ask），返回文本就是客户的点选结果；不得用通用提问工具携带自创选项。不带选项的纯文本澄清仍可用 ask_user_question。`
      }
      return undefined
    }
    const call = classifyToolCall(execution.name, execution.arguments)
    if (call.kind === 'unrecognized') return undefined
    const config = sources.readConfig(options.workspaceRoot)
    // §22.19 ranking rule 1: an fs-write names its own change — the path
    // landing inside `openspec/changes/<id>/` selects that change for
    // adjudication, even when another row is fresher (session 7.jsonl R3).
    // Shell calls adjudicate without a path (focus / seq ranking applies).
    const state = sources.readState(options.workspaceRoot, call.kind === 'fs-write' ? call.path : undefined)
    const decision = call.kind === 'fs-write'
      ? adjudicateFsWrite(config, state, {
        root: options.workspaceRoot,
        path: call.path,
        ...(call.content === undefined ? {} : { content: call.content }),
      })
      : adjudicateShell(config, state, call.command)
    return renderDenial(decision)
  }
}
