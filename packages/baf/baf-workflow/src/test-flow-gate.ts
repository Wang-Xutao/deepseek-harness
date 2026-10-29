/**
 * 【变更】2026-10-28 (批次三十五 · 用户问题 8): the implement→verify test-flow
 * precondition, in ONE place.
 *
 * The customer rule: 实现必须先跑通测试流才能进入验证. Three surfaces ask the
 * same question — the `/baf-go` verify entry (the refusal card + the implement
 * 补单), the turn-end advance pop (`docAdvanceDue` must not offer the card
 * while the evidence is red) and the Tab's 推进 readiness (the button may not
 * promise an advance the drives would refuse). They all read this verdict so
 * the three can never disagree.
 *
 * Gating follows the same fail-closed-but-never-gate-dead rule as the verify
 * stage's own check: a baseline whose `stack.test` is the `<enterprise-tbd>`
 * placeholder never configured a unit-test flow, so the entry asks for no
 * evidence (a fresh scaffold must not deadlock with no in-band fix).
 *
 * 【变更】2026-10-29 (批次三十六 · 用户问题 9): TWO changes on top.
 *
 * 1. **One verdict.** {@link verifyEntryVerdict} answers 「may this change
 *    enter verify, and if not, what is missing」 for EVERY surface: the
 *    Tab's 推进 readiness and the coordinator's transition read the SAME
 *    verdict, so the button can no longer offer an advance the coordinator
 *    refuses one click later (the customer's 「点不了还报错」).
 * 2. **The transition runs the flow.** The test-flow evidence is no longer a
 *    precondition the model has to satisfy on its own — {@link
 *    ensureTestFlowEvidence} runs the SAME chain (the same runner, the same
 *    step list) the verify stage runs, so a gated workspace advances on a green
 *    run instead of deadlocking on evidence nobody could produce.
 * @module @deepseek-ai/dsh-baf-workflow/test-flow-gate
 */

import {
  runTestFlowChain,
  testFlowCompletion,
  testFlowEvidenceSteps,
  testFlowGated,
  type QualityExecutor,
  type TestFlowChainResult,
  type TestFlowCompletion,
  type TestFlowStep,
} from '@deepseek-ai/dsh-baf-quality'
import { loadWorkspaceBaseline } from './pipeline-factory.ts'
import { checklistGate, type GateInput, type GateOutcome } from './stages/gates.ts'

/** The implement→verify entry verdict over the durable test-flow evidence. */
export interface TestFlowEntryVerdict {
  /** Whether this workspace's baseline configures a real test flow. */
  readonly gated: boolean
  /** Whether the durable evidence (coverage + static-analysis) is green. */
  readonly ok: boolean
  /** Per-problem lines naming what is missing or red (empty when green). */
  readonly problems: readonly string[]
}

/**
 * Judge the test-flow entry precondition for one workspace.
 *
 * 【变更】2026-10-29 (批次三十六 · 用户问题 9): the gate reads BOTH switches —
 * the baseline's `stack.test` and the workspace's explicit per-stage toggles
 * (`testFlowGated` owns that rule; the customer switched the stages on while
 * the baseline still carried the placeholder).
 * @param cwd - absolute workspace root.
 * @returns the verdict; ungated workspaces answer `{ gated: false, ok: true }`.
 */
export async function testFlowEntryVerdict(cwd: string): Promise<TestFlowEntryVerdict> {
  const baseline = await loadWorkspaceBaseline(cwd).catch(() => undefined)
  if (baseline === undefined || !testFlowGated(baseline, cwd)) {
    return { gated: false, ok: true, problems: [] }
  }
  const completion = testFlowCompletion(cwd)
  return { gated: true, ok: completion.ok, problems: completion.problems }
}

/**
 * 【变更】2026-10-29 (批次三十六 · 用户问题 9): the ONE verdict every surface
 * reads for 「may this change enter verify?」.
 *
 * Two parts, one answer:
 * - the **checklist** is the hard blocker — verification may not start (nor
 *   pop its confirm card) before checklist.md exists with real items, and the
 *   `missing` lines name the REAL condition (the file is missing / still the
 *   template / has no checkbox row), not a generic message.
 * - the **test flow** is resolved BY the transition: a gated workspace whose
 *   evidence is missing runs the chain itself (see {@link
 *   ensureTestFlowEvidence}), so a missing report is not a reason to refuse
 *   the entry — it is the work the transition does.
 */
export interface VerifyEntryVerdict {
  /** Whether this change may enter the verify stage now. */
  readonly ready: boolean
  /** The real blockers (Chinese, one line each) — empty when ready. */
  readonly missing: readonly string[]
  /** The checklist gate's own outcome (the authoring precondition). */
  readonly checklist: GateOutcome
  /** The test-flow evidence verdict (the transition resolves it by running). */
  readonly testFlow: TestFlowEntryVerdict
}

/**
 * The shared implement→verify verdict.
 * @param input - the change's gate input (the workspace root doubles as the
 *   cwd the test-flow switches are read from).
 * @returns the verdict every surface renders.
 */
export async function verifyEntryVerdict(input: GateInput): Promise<VerifyEntryVerdict> {
  const checklist = await checklistGate(input)
  const testFlow = await testFlowEntryVerdict(input.workspaceRoot)
  const missing = checklist.ok
    ? []
    : checklist.missing !== undefined && checklist.missing.length > 0
      ? checklist.missing
      : [checklist.detail ?? 'checklist.md 未达验证前置门']
  return { ready: checklist.ok, missing, checklist, testFlow }
}

/**
 * 【变更】2026-10-29 (批次三十六 · 用户问题 9): the 测试流's own run at the
 * implement→verify transition.
 *
 * The deadlock this breaks: the entry gate demanded the durable evidence
 * ALREADY exist, while the only automatic runner lived inside the verify
 * stage — so a gated workspace could never produce the evidence the entry
 * asked for (the customer filed 「测试流使能了但没有跑」). The transition now
 * runs the SAME chain (the same runner, the same enabled step list) and then
 * judges the result.
 *
 * A missing toolchain stays a visible failure — the run's own diagnostics
 * (工具缺失 / a failing command) ride the refusal, never a silent pass.
 */
export interface TestFlowEvidenceResult {
  /** The durable-evidence verdict AFTER the run. */
  readonly completion: TestFlowCompletion
  /** The chain's outcome (absent when the flow was not gated or already green). */
  readonly chain?: TestFlowChainResult
  /** Whether the chain actually ran. */
  readonly ran: boolean
}

/**
 * Make sure the gated workspace's durable test-flow evidence exists — running
 * the chain itself when it does not.
 * @param cwd - absolute workspace root.
 * @param options - the executor (tests inject a deterministic one), the abort
 *   signal, and the step list override.
 * @returns the completion verdict and (when it ran) the chain's outcome.
 */
export async function ensureTestFlowEvidence(
  cwd: string,
  options: {
    readonly executor?: QualityExecutor
    readonly signal?: AbortSignal
    readonly stages?: readonly TestFlowStep['id'][]
  } = {},
): Promise<TestFlowEvidenceResult> {
  const baseline = await loadWorkspaceBaseline(cwd).catch(() => undefined)
  if (baseline === undefined || !testFlowGated(baseline, cwd)) {
    return { completion: testFlowCompletion(cwd), ran: false }
  }
  const before = testFlowCompletion(cwd)
  if (before.ok) return { completion: before, ran: false }
  const chain = await runTestFlowChain(cwd, {
    stages: options.stages ?? testFlowEvidenceSteps(cwd),
    ...(options.executor === undefined ? {} : { executor: options.executor }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  })
  return { completion: testFlowCompletion(cwd), chain, ran: true }
}

/**
 * The 补单 lines for a red verdict — the implement-stage order text that tells
 * the model HOW to turn the evidence green: the very same baf-quality commands
 * the 测试流图's buttons run (one command per chain), so a model-run flow and a
 * customer-clicked flow leave the same durable reports.
 * @param problems - the verdict's per-problem lines.
 * @returns the work-order lines.
 */
export function testFlowWorkOrderLines(problems: readonly string[]): readonly string[] {
  return [
    '测试流未跑通——实现必须先通过测试流才能进入验证',
    ...problems,
    '在实现阶段依次运行 baf-quality test（构建+测试）、baf-quality check（覆盖率链：插桩/报告/门禁）、baf-quality lint（lint+静态分析），与测试流图按钮是同一组命令；失败就修复代码后重跑，直到两项报告全部通过',
  ]
}

/**
 * 【变更】2026-10-29 (批次三十六 · 用户问题 9): the failed chain's own
 * diagnostics — the per-step lines the refusal card quotes so a missing
 * toolchain reads as 工具缺失 (never as a silent pass).
 * @param chain - the chain's outcome.
 * @returns one line per failed step.
 */
export function testFlowChainFailureLines(chain: TestFlowChainResult): readonly string[] {
  return chain.steps
    .filter(step => !step.ok)
    .flatMap(step => [
      `test_flow.${step.stage}:${step.toolMissing ? 'tool_missing' : 'failed'}`,
      ...(step.output === '' ? [] : [`test_flow.${step.stage}.output: ${step.output.slice(0, 200)}`]),
    ])
}
