/**
 * N2 clarify stage handler (§12 Phase 5.2): write `clarify.md` with answered
 * blocking questions and testable acceptance criteria, then gate T6.
 * @module @deepseek-ai/dsh-baf-workflow/stages/clarify
 */

import type { WorkflowStatus } from '@deepseek-ai/dsh-baf-core'
import { BafError } from '@deepseek-ai/dsh-baf-core'
import { ARTIFACT_FILES } from '@deepseek-ai/dsh-baf-openspec'
import type { StageContext } from './context.ts'
import { clarifyGate } from './gates.ts'
import { writeArtifact } from './write.ts'
import { stageArtifactPaths } from './artifacts.ts'

/** One answered blocking question entry. */
export interface ClarifyQuestion {
  /** Question text. */
  readonly question: string
  /** Answer with decision source + date, or `deferred: <reason>`. */
  readonly answer: string
  /** Disposition of the question. */
  readonly status: 'decided' | 'deferred' | 'out-of-scope'
}

/** Input for {@link driveClarify}. */
export interface ClarifyInput {
  readonly changeId: string
  readonly questions: readonly ClarifyQuestion[]
  /** Testable acceptance conditions (each checkable by a command/behavior). */
  readonly acceptanceCriteria: readonly string[]
  /** Explicit non-goals recorded during clarification. */
  readonly nonGoals?: readonly string[]
}

/** Result of a successful clarify drive. */
export interface ClarifyStageResult {
  readonly status: WorkflowStatus
  readonly artifacts: readonly string[]
}

/**
 * Render clarify.md body from structured input.
 * @param input - clarify fields.
 * @returns markdown body.
 */
export function renderClarifyBody(input: ClarifyInput): string {
  const lines: string[] = [
    `# Clarify — ${input.changeId}`,
    '',
    '## Blocking questions',
    '',
  ]
  if (input.questions.length === 0) {
    lines.push('TODO: one entry per blocking question, each with:', '')
  }
  for (const q of input.questions) {
    lines.push(`- Question: ${q.question}`)
    lines.push(`- Answer (decision source + date) or \`deferred: <reason>\`: ${q.answer}`)
    lines.push(`- Decided / Deferred / Out-of-scope: ${q.status}`)
    lines.push('')
  }
  lines.push('## Acceptance criteria', '')
  if (input.acceptanceCriteria.length === 0) {
    lines.push('TODO: testable acceptance conditions. Each must be checkable by a command or an observable behavior.')
  }
  for (const c of input.acceptanceCriteria) lines.push(`- ${c}`)
  lines.push('', '## Non-goals', '')
  const nonGoals = input.nonGoals ?? []
  if (nonGoals.length === 0) {
    lines.push('TODO: explicit non-goals recorded during clarification.')
  }
  for (const g of nonGoals) lines.push(`- ${g}`)
  lines.push('')
  return lines.join('\n')
}

/**
 * Drive the clarify stage: install the artifact then run the T6 gate.
 * The caller records `stage-entered` via transition before invoking; this
 * handler refuses when the gate would fail so no partial completion lands.
 * @param ctx - stage context.
 * @param input - clarify fields.
 * @returns updated status plus artifact paths (gate already passed).
 * @throws {BafError} stage_incomplete mapped to invalid_transition when the gate fails.
 */
export async function driveClarify(
  ctx: StageContext,
  input: ClarifyInput,
): Promise<ClarifyStageResult> {
  await writeArtifact(
    ctx.workspace.root,
    input.changeId,
    ARTIFACT_FILES.clarify,
    renderClarifyBody(input),
  )
  const gateInput = {
    workspaceRoot: ctx.workspace.root,
    changeId: input.changeId,
    mode: 'full-go' as const,
  }
  const gate = await clarifyGate(gateInput)
  if (!gate.ok) {
    throw new BafError(
      'invalid_transition',
      `clarify gate failed: ${gate.reasonCodes.join(', ')} — ${gate.detail ?? ''}`,
      { changeId: input.changeId, reasonCodes: gate.reasonCodes },
    )
  }
  return {
    status: await ctx.store.readStatus(input.changeId),
    artifacts: stageArtifactPaths(ctx.workspace.root, input.changeId, [ARTIFACT_FILES.clarify]),
  }
}
