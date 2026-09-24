/**
 * N4 plan stage handler (§12 Phase 5.4): write `plan.md` + structured
 * `plan.json` (tasks / allowlist / verify / rollback), then gate T8.
 * @module @deepseek-ai/dsh-baf-workflow/stages/plan
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BafError, type WorkflowStatus } from '@deepseek-ai/dsh-baf-core'
import { ARTIFACT_FILES, changeDir } from '@deepseek-ai/dsh-baf-openspec'
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
 * 【变更】2026-09-23 (user issue #2): render plan.md from the plan.json
 * ledger on disk.
 *
 * plan.json is the single source the gates judge (task rows + allowlist);
 * plan.md is its human-readable face. The model authors the ledger only —
 * this render, run at the transitions that complete plan (and again when
 * implement finishes flipping the done flags), keeps the doc bound to the
 * ledger by construction: never an unfilled template beside a finished
 * ledger, never the two disagreeing. Failures are the caller's to tolerate
 * (the pipeline logs and moves on — the gate already passed on the JSON).
 * @param workspaceRoot - workspace root.
 * @param changeId - change id.
 */
/** The ledger rows {@link renderPlanMdFromLedger} reads off plan.json. */
import { parsePlanLedger } from './plan-ledger.ts'

export async function renderPlanMdFromLedger(workspaceRoot: string, changeId: string): Promise<void> {
  const raw = await readFile(join(changeDir(workspaceRoot, changeId), ARTIFACT_FILES.planJson), 'utf8')
  // 【变更】2026-09-23 (demo1 五问题 1–3): the tolerant normalizer — the model
  // may author the ledger with the natural aliases, and the rendered doc must
  // still show the real rows (empty render beside a filled ledger read as
  // "plan.md 仍是 TODO 模板").
  const ledger = parsePlanLedger(raw) ?? { tasks: [], allowlist: [], touched: [] }
  const tasks = ledger.tasks
  const allowlist = ledger.allowlist
  const lines: string[] = [
    `# Plan — ${changeId}`,
    '',
    '> 本文档由 plan.json 账本自动渲染（单一数据源）；修改请编辑 plan.json。',
    '',
    '## Tasks',
    '',
  ]
  for (const task of tasks) {
    const state = task.done === true ? '✅' : '⬜'
    lines.push(`### ${state} ${task.id ?? '?'} — ${task.title ?? ''}`)
    lines.push(`- Files: ${task.files.map(f => `\`${f}\``).join(', ')}`)
    lines.push(`- Verify: ${task.verify.map(v => `\`${v}\``).join('; ')}`)
    lines.push(`- Rollback: ${task.rollback === '' ? '—' : task.rollback}`)
    lines.push('')
  }
  lines.push('## Allowlist', '')
  for (const file of allowlist) lines.push(`- \`${file}\``)
  lines.push('')
  await writeFile(join(changeDir(workspaceRoot, changeId), ARTIFACT_FILES.plan), lines.join('\n'), 'utf8')
}

/**
 * 【变更】2026-09-23 (demo1 十问题 7/9 → demo5 issue #4): render tasks.md from
 * the plan.json ledger.
 *
 * tasks.md 的生成阶段由此定死：**计划完成的时刻**（先出 todo list——「已计划」），
 * 实现完成时随 done 标记刷新为「已填写」——与 plan.md 同源同拍，从账本渲染。
 * 不再是进入计划时装一个永远不裁决的模板。
 * @param workspaceRoot - workspace root.
 * @param changeId - change id.
 */
export async function renderTasksMdFromLedger(workspaceRoot: string, changeId: string): Promise<void> {
  const raw = await readFile(join(changeDir(workspaceRoot, changeId), ARTIFACT_FILES.planJson), 'utf8')
  const ledger = parsePlanLedger(raw) ?? { tasks: [], allowlist: [], touched: [] }
  const lines: string[] = [
    `# Tasks — ${changeId}`,
    '',
    '> 本文档由 plan.json 账本自动渲染（计划完成时生成任务清单，实现完成时刷新勾选）；修改请编辑 plan.json。',
    '',
  ]
  for (const task of ledger.tasks) {
    const state = task.done === true ? '[x]' : '[ ]'
    lines.push(`- ${state} ${task.id ?? '?'} ${task.title ?? ''}（验证：${task.verify.join('; ') === '' ? '—' : task.verify.join('; ')}）`)
  }
  if (ledger.tasks.length === 0) lines.push('- （账本还没有任务）')
  lines.push('')
  lines.push(`允许修改的文件（allowlist，共 ${ledger.allowlist.length} 个）：`, '')
  for (const file of ledger.allowlist) lines.push(`- \`${file}\``)
  lines.push('')
  await writeFile(join(changeDir(workspaceRoot, changeId), ARTIFACT_FILES.tasks), lines.join('\n'), 'utf8')
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
    mode: 'full-go-path',
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
