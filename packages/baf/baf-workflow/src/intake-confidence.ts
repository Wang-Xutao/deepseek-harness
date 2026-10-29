/**
 * 【变更】2026-10-29 (批次三十七 · 用户问题 4): the intake confidence
 * evaluator registry.
 *
 * The classifier itself stays a pure domain function: it never reaches for a
 * model. The host plane (the workflow Tab remote, which owns `ctx.llm`)
 * registers ONE evaluator for the process, and every mint surface — the Tab's
 * 「新建变更」, the model's `baf_gate_ask` bootstrap, the CLI — then classifies
 * with the model's own percentage instead of a fixed tier.
 *
 * The registry hangs off the process-wide host memory (host-memory.ts) so the
 * bundled copies of this package (auto-pop.js / gate-ask.js / the Tab remote's
 * copy) share ONE evaluator — the same reason `begin-intake`'s mint lock is
 * anchored there.
 *
 * @module @deepseek-ai/dsh-baf-workflow/intake-confidence
 */

import type { IntakeConfidenceEvaluator } from './intake.ts'
import { sharedHostMap } from './host-memory.ts'

/** The process-shared slot holding the registered evaluator. */
const registry = sharedHostMap<IntakeConfidenceEvaluator | undefined>('intake-confidence/evaluator')

/**
 * Register the process-wide intake confidence evaluator.
 * @param evaluator - the host plane's model hook (undefined clears it).
 */
export function setIntakeConfidenceEvaluator(evaluator: IntakeConfidenceEvaluator | undefined): void {
  if (evaluator === undefined) registry.delete('evaluator')
  else registry.set('evaluator', evaluator)
}

/**
 * The registered evaluator, if any.
 * @returns the evaluator or undefined.
 */
export function intakeConfidenceEvaluator(): IntakeConfidenceEvaluator | undefined {
  return registry.get('evaluator')
}
