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
  readonly readState: (workspaceRoot: string) => GuardWorkflowState
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
      return undefined
    }
    const call = classifyToolCall(execution.name, execution.arguments)
    if (call.kind === 'unrecognized') return undefined
    const config = sources.readConfig(options.workspaceRoot)
    const state = sources.readState(options.workspaceRoot)
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
