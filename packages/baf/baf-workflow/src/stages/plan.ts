/**
 * N4 plan stage handler (§12 Phase 5.4): write `plan.md` + structured
 * `plan.json` (tasks / allowlist / verify / rollback), then gate T8.
 * @module @deepseek-ai/dsh-baf-workflow/stages/plan
 */

import { BafError, type WorkflowStatus } from '@deepseek-ai/dsh-baf-core'
import { ARTIFACT_FILES } from '@deepseek-ai/dsh-baf-openspec'
import type { StageContext } from './context.ts'
import { planGate } from './gates.ts'
import { writeArtifact } from './write.ts'
import { stageArtifactPaths } from './artifacts.ts'

/** One planned task (plan.json entry). */
export interface PlanTaskInput {
  readonly id: string
  readonly title: string
  /** Files this task may touch (workspace-relative). */
  readonly files: readonly string[]
  /** Verification command(s) proving the task outcome. */
  readonly verify: readonly string[]
  /** Rollback point (commit / tag / described revert). */
  readonly rollback: string
}

/** Input for {@link drivePlan}. */
export interface PlanInput {
  readonly changeId: string
  readonly tasks: readonly PlanTaskInput[]
  /** Files implement may modify; out-of-allowlist writes are scope_exceeded. */
  readonly allowlist: readonly string[]
}

/** Result of a successful plan drive. */
export interface PlanStageResult {
  readonly status: WorkflowStatus
  readonly artifacts: readonly string[]
  /** Parsed plan document also written as plan.json. */
  readonly plan: {
    readonly tasks: readonly (PlanTaskInput & { done: boolean })[]
    readonly allowlist: readonly string[]
  }
}

/**
 * Render plan.md body from structured input.
 * @param input - plan fields.
 * @returns markdown body.
 */
export function renderPlanBody(input: PlanInput): string {
  const lines: string[] = [
    `# Plan — ${input.changeId}`,
    '',
    '## Tasks',
    '',
  ]
  for (const task of input.tasks) {
    lines.push(`### ${task.id} — ${task.title}`)
    lines.push(`- Files: ${task.files.map(f => `\`${f}\``).join(', ')}`)
    lines.push(`- Verify: ${task.verify.map(v => `\`${v}\``).join('; ')}`)
    lines.push(`- Rollback: ${task.rollback}`)
    lines.push('')
  }
  lines.push('## Allowlist', '')
  for (const file of input.allowlist) lines.push(`- \`${file}\``)
  lines.push('')
  return lines.join('\n')
}

/**
 * Drive the plan stage: install plan.md and plan.json, then run the T8 gate.
 * @param ctx - stage context.
 * @param input - plan fields.
 * @returns updated status plus artifact paths (gate already passed).
 * @throws {BafError} invalid_transition when the gate fails.
 */
export async function drivePlan(ctx: StageContext, input: PlanInput): Promise<PlanStageResult> {
  const plan = {
    tasks: input.tasks.map(task => ({ ...task, done: false })),
    allowlist: [...input.allowlist],
  }
  await writeArtifact(
    ctx.workspace.root,
    input.changeId,
    ARTIFACT_FILES.plan,
    renderPlanBody(input),
  )
  await writeArtifact(
    ctx.workspace.root,
    input.changeId,
    ARTIFACT_FILES.planJson,
    `${JSON.stringify(plan, null, 2)}\n`,
  )
  const gate = await planGate({
    workspaceRoot: ctx.workspace.root,
    changeId: input.changeId,
    mode: 'full-go',
  })
  if (!gate.ok) {
    throw new BafError(
      'invalid_transition',
      `plan gate failed: ${gate.reasonCodes.join(', ')} — ${gate.detail ?? ''}`,
      { changeId: input.changeId, reasonCodes: gate.reasonCodes },
    )
  }
  return {
    status: await ctx.store.readStatus(input.changeId),
    artifacts: stageArtifactPaths(ctx.workspace.root, input.changeId, [
      ARTIFACT_FILES.plan,
      ARTIFACT_FILES.planJson,
    ]),
    plan,
  }
}
