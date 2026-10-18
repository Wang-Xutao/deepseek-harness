/**
 * Node hooks (六问题批 4.1b): per-node custom scripts from baseline
 * `hooks.nodes.<node>.enter/exit`, enforced at the single transition choke
 * point `StagePipeline.enterStage`.
 *
 * Semantics (frozen with the settings UI copy):
 * - `enter(to)` — runs whenever the workflow ENTERS a main-chain node
 *   (open…archive; intake reachable via T13 resume). Must pass BEFORE the
 *   `stage-entered` event is recorded, so a failing script leaves the change
 *   on the previous node with only a `transition-rejected` audit trail.
 * - `exit(from)` — runs only on FORWARD main-chain advancement
 *   (idx(to) > idx(from), both main-chain). Backward edges (T11 verify→
 *   implement) and drift re-entry never re-fire exit hooks; re-entering a
 *   node does re-fire its enter hooks.
 * - Terminal edges outside `enterStage` (T14 archive→completed, T16 abandon)
 *   fire no exit hooks — the natural gates there are the archive gate and
 *   the abandon confirmation.
 *
 * Execution mirrors baf-quality's runner discipline: shell spawn with
 * windowsHide/timeout/SIGKILL, output redacted + truncated, fail-closed on
 * spawn error / timeout / non-zero exit / abort.
 * @module @deepseek-ai/dsh-baf-workflow/node-hooks
 */

import { join } from 'node:path'
import {
  WORKFLOW_NODES,
  type BaselineManifest,
  type WorkflowNode,
  type WorkflowStatus,
} from '@deepseek-ai/dsh-baf-core'
import {
  redactSecrets,
  shellExecutor,
  truncateOutput,
  type QualityExecutor,
} from '@deepseek-ai/dsh-baf-quality'

/** Default per-script wall-clock budget (same default as quality checks). */
export const DEFAULT_HOOK_TIMEOUT_MS = 300_000

/** Executor contract (re-exported so pipeline options can name it). */
export type { QualityExecutor } from '@deepseek-ai/dsh-baf-quality'

/** Output kept for the thrown error card's details payload. */
const MAX_FAILURE_OUTPUT_CHARS = 600

/** Main-chain nodes = every workflow node except the drift parking lot. */
const MAIN_CHAIN: readonly WorkflowNode[] = WORKFLOW_NODES.filter(node => node !== 'drift')

/** Plain-Chinese node labels for error cards (same vocabulary as the Tab). */
export const NODE_LABELS_ZH: Readonly<Record<WorkflowNode, string>> = {
  intake: '接单',
  open: '建立变更',
  clarify: '澄清',
  design: '设计',
  plan: '计划',
  implement: '实现',
  verify: '验证',
  archive: '归档',
  drift: '漂移',
}

/** Whether a node id is a main-chain node (hookable on both interfaces). */
export function isMainChainNode(node: string): node is WorkflowNode {
  return (MAIN_CHAIN as readonly string[]).includes(node)
}

/** One planned script run before a transition may be recorded. */
export interface PlannedNodeHook {
  readonly kind: 'enter' | 'exit'
  readonly node: WorkflowNode
  readonly entry: string
}

/**
 * Compute the scripts a transition must pass: exit hooks of the FROM node
 * (forward main-chain advancement only), then enter hooks of the TO node.
 * @param status - status BEFORE the transition (`current` is the FROM node).
 * @param to - target node.
 * @param baseline - governing baseline; no `hooks` block → empty plan.
 * @returns ordered plan (exit first, list order preserved); empty = pass-through.
 */
export function planNodeHooks(
  status: WorkflowStatus,
  to: WorkflowNode,
  baseline?: BaselineManifest,
): readonly PlannedNodeHook[] {
  const nodes = baseline?.hooks?.nodes
  if (nodes === undefined || isMainChainNode(to) === false) return []
  const plan: PlannedNodeHook[] = []
  const from = status.current
  if (isMainChainNode(from)
    && (WORKFLOW_NODES as readonly string[]).indexOf(to) > (WORKFLOW_NODES as readonly string[]).indexOf(from)) {
    for (const entry of nodes[from]?.exit ?? []) plan.push({ kind: 'exit', node: from, entry })
  }
  for (const entry of nodes[to]?.enter ?? []) plan.push({ kind: 'enter', node: to, entry })
  return plan
}

/**
 * Map one hook entry to its shell command line. Extension picks the runner:
 * `.sh` → sh, `.ps1` → powershell -File, `.js/.mjs/.cjs` → node, anything
 * else runs directly (`.bat/.cmd`/executables via the shell).
 * @param entry - workspace-relative script path (already validated).
 * @param workspaceRoot - absolute workspace root.
 * @returns shell command string.
 */
export function hookCommand(entry: string, workspaceRoot: string): string {
  const abs = join(workspaceRoot, ...entry.split('/'))
  const lower = entry.toLowerCase()
  if (lower.endsWith('.sh')) return `sh "${abs}"`
  if (lower.endsWith('.ps1')) return `powershell -NoProfile -ExecutionPolicy Bypass -File "${abs}"`
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return `node "${abs}"`
  return `"${abs}"`
}

/** Why a hook script failed (structured, mirrors quality reason codes). */
export type NodeHookFailureCode = 'timeout' | 'cancelled' | 'spawn_error' | 'exit_code'

/** The failing run, for the BafError details payload. */
export interface NodeHookFailure {
  readonly kind: 'enter' | 'exit'
  readonly node: WorkflowNode
  readonly entry: string
  readonly reasonCode: NodeHookFailureCode
  readonly exitCode: number | null
  readonly durationMs: number
  readonly output: string
}

/** Outcome of executing a hook plan. */
export interface NodeHookRunOutcome {
  /** Every run in order, passed or not (stops at the first failure). */
  readonly executed: readonly {
    readonly kind: 'enter' | 'exit'
    readonly node: WorkflowNode
    readonly entry: string
    readonly passed: boolean
    readonly durationMs: number
  }[]
  /** Present iff a script failed — the transition must be blocked. */
  readonly failure?: NodeHookFailure
}

/** Options for {@link runNodeHooks}. */
export interface RunNodeHooksOptions {
  readonly workspaceRoot: string
  /** Per-script timeout; defaults to {@link DEFAULT_HOOK_TIMEOUT_MS}. */
  readonly timeoutMs?: number
  /** Executor override (tests inject deterministic outcomes). */
  readonly executor?: QualityExecutor
  /** Abort signal; an aborted signal fails the run as `cancelled`. */
  readonly signal?: AbortSignal
}

/**
 * Execute a hook plan sequentially in the workspace root. First failure
 * stops the plan (later scripts are not started) and is reported with
 * redacted, truncated output.
 * @param plan - ordered scripts from {@link planNodeHooks}.
 * @param options - workspace root + optional overrides.
 * @returns run outcome with the optional failure.
 */
export async function runNodeHooks(
  plan: readonly PlannedNodeHook[],
  options: RunNodeHooksOptions,
): Promise<NodeHookRunOutcome> {
  if (plan.length === 0) return { executed: [] }
  const executor = options.executor ?? shellExecutor()
  const timeoutMs = options.timeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS
  const signal = options.signal ?? new AbortController().signal
  const executed: { kind: 'enter' | 'exit'; node: WorkflowNode; entry: string; passed: boolean; durationMs: number }[] = []
  for (const hook of plan) {
    const result = await executor(hookCommand(hook.entry, options.workspaceRoot), {
      cwd: options.workspaceRoot,
      timeoutMs,
      signal,
    })
    const reasonCode: NodeHookFailureCode | undefined = result.cancelled
      ? 'cancelled'
      : result.timedOut
        ? 'timeout'
        : result.spawnError !== null
          ? 'spawn_error'
          : result.exitCode === 0
            ? undefined
            : 'exit_code'
    const passed = reasonCode === undefined
    executed.push({
      kind: hook.kind,
      node: hook.node,
      entry: hook.entry,
      passed,
      durationMs: result.durationMs,
    })
    if (!passed) {
      const combined = result.stderr.length > 0
        ? `${result.stdout}\n${result.stderr}`
        : result.stdout
      return {
        executed,
        failure: {
          kind: hook.kind,
          node: hook.node,
          entry: hook.entry,
          reasonCode,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          output: truncateOutput(redactSecrets(combined).trim(), MAX_FAILURE_OUTPUT_CHARS),
        },
      }
    }
  }
  return { executed }
}
