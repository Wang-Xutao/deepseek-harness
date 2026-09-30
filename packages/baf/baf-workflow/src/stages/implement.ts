/**
 * N5 implement stage handler (§12 Phase 5.5): track per-task state in the
 * implement ledger (plan.json on full-go-path, bug-fix-path-ledger.json on
 * the fast path), record touched files, and enforce the allowlist boundary.
 * Model edits flow through the caller (dsh filesystem/shell tools); this
 * handler owns the durable task ledger and scope verdicts.
 * @module @deepseek-ai/dsh-baf-workflow/stages/implement
 */

import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BafError, type WorkflowStatus } from '@deepseek-ai/dsh-baf-core'
import { ARTIFACT_FILES, changeDir } from '@deepseek-ai/dsh-baf-openspec'
import type { StageContext } from './context.ts'
import { implementGate, type PlanDocument } from './gates.ts'
import { stageArtifactPaths } from './artifacts.ts'
import { BUG_FIX_PATH_LEDGER_FILE, assertRegressionFirst } from './bug-fix-path.ts'
import { parsePlanLedger } from './plan-ledger.ts'

/** Mutable task ledger persisted during implement (per-mode file name). */
export interface ImplementLedger {
  /** True for the bug fast-path ledger written at fast-path open. */
  readonly bugFixPath?: boolean
  readonly tasks: readonly (PlanTaskInputRow & { done: boolean })[]
  readonly allowlist: readonly string[]
  /** Files actually edited or created so far. */
  readonly touched: readonly string[]
}

/** One task row inside the implement ledger. */
export interface PlanTaskInputRow {
  readonly id?: string
  readonly title?: string
  readonly files?: readonly string[]
  readonly verify?: readonly string[]
  readonly rollback?: string
}

/** Result of a completed implement drive. */
export interface ImplementStageResult {
  readonly status: WorkflowStatus
  readonly artifacts: readonly string[]
  readonly ledger: ImplementLedger
  /** Set when the drive escalated to full-go-path instead of completing (T15). */
  readonly escalated?: { readonly cause: string }
}

/** Options for {@link recordTouched}. */
export interface RecordTouchedOptions {
  readonly changeId: string
  /** File being created or edited (workspace-relative). */
  readonly file: string
}

/**
 * 【变更】2026-09-30 (demo33 问题 1): resolve which ledger file a change uses.
 * Full-go (and legacy bug-fix changes created before the rename) keep
 * `plan.json`; new bug-fix-path changes carry `bug-fix-path-ledger.json`.
 * plan.json wins when both exist (a T15 upgrade writes a fresh full-go
 * plan.json while the fast-path file remains as audit trail).
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - change id.
 * @returns the ledger file name to read/write.
 */
async function ledgerFileFor(workspaceRoot: string, changeId: string): Promise<string> {
  const dir = changeDir(workspaceRoot, changeId)
  const planJson = join(dir, ARTIFACT_FILES.planJson)
  if (await readFile(planJson, 'utf8').then(() => true, () => false)) return ARTIFACT_FILES.planJson
  return BUG_FIX_PATH_LEDGER_FILE
}

/**
 * Read the current implement ledger for a change.
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - change id.
 * @returns parsed ledger.
 * @throws {BafError} invalid_transition when no ledger is missing or malformed.
 */
export async function readLedger(workspaceRoot: string, changeId: string): Promise<ImplementLedger> {
  const file = await ledgerFileFor(workspaceRoot, changeId)
  const path = join(changeDir(workspaceRoot, changeId), file)
  let body: string
  try {
    body = await readFile(path, 'utf8')
  } catch {
    throw new BafError('invalid_transition', `implement ledger missing (${file})`, { changeId })
  }
  // 【变更】2026-09-23 (demo1 五问题 1–3): the tolerant normalizer accepts the
  // model-natural aliases (`affected_files` / `verify_cmd` / `rollback_point`)
  // exactly like the plan gate now does — one reader contract for every
  // ledger consumer.
  const normalized = parsePlanLedger(body)
  if (normalized === undefined) {
    try {
      JSON.parse(body)
      throw new BafError('invalid_transition', `${file} lacks tasks/allowlist arrays`, { changeId })
    } catch (error) {
      if (error instanceof BafError) throw error
      throw new BafError('invalid_transition', `${file} is not valid JSON`, { changeId })
    }
  }
  return {
    ...(normalized.bugFixPath === true ? { bugFixPath: true } : {}),
    tasks: normalized.tasks.map(task => ({ ...task, done: task.done === true })),
    allowlist: normalized.allowlist,
    touched: normalized.touched,
  }
}

/**
 * Guard one implement write against the allowlist (§5.3 N5).
 * Called by tool consumers before every filesystem/shell write; the
 * caller must not perform the write when this throws.
 * @param ledger - current ledger.
 * @param file - workspace-relative target path.
 * @throws {BafError} scope_exceeded when the file is outside the allowlist.
 */
export function assertWithinAllowlist(ledger: ImplementLedger, file: string): void {
  const allow = new Set(ledger.allowlist)
  if (!allow.has(file)) {
    throw new BafError('scope_exceeded', `file outside allowlist: ${file}`, { file })
  }
}

/**
 * Record a touched file in the ledger (call after a successful write).
 * @param workspaceRoot - absolute workspace root.
 * @param options - change + file.
 * @returns updated ledger.
 * @throws {BafError} scope_exceeded when the file is outside the allowlist.
 */
export async function recordTouched(
  workspaceRoot: string,
  options: RecordTouchedOptions,
): Promise<ImplementLedger> {
  const ledger = await readLedger(workspaceRoot, options.changeId)
  assertWithinAllowlist(ledger, options.file)
  // Regression-test-first (bug fast path): refuse before the write happens
  // so a violation stays recoverable (§12 Phase 6).
  assertRegressionFirst(ledger, options.file)
  if (ledger.touched.includes(options.file)) return ledger
  const next: ImplementLedger = { ...ledger, touched: [...ledger.touched, options.file] }
  await persistLedger(workspaceRoot, options.changeId, next)
  return next
}

/**
 * Mark one task done in the ledger.
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - change id.
 * @param taskId - task id from plan.json.
 * @returns updated ledger.
 * @throws {BafError} invalid_transition when the task id is unknown.
 */
export async function completeTask(
  workspaceRoot: string,
  changeId: string,
  taskId: string,
): Promise<ImplementLedger> {
  const ledger = await readLedger(workspaceRoot, changeId)
  const index = ledger.tasks.findIndex(t => t.id === taskId)
  if (index < 0) {
    throw new BafError('invalid_transition', `unknown task id: ${taskId}`, { changeId, taskId })
  }
  const tasks = ledger.tasks.map((t, i) => i === index ? { ...t, done: true } : t)
  const next: ImplementLedger = { ...ledger, tasks }
  await persistLedger(workspaceRoot, changeId, next)
  return next
}

/**
 * Persist the ledger atomically (temp + rename via the same discipline as
 * projection writes; the ledger is small so a plain write-then-rename is fine).
 * 【变更】2026-09-30 (demo33 问题 1): writes back to the SAME file
 * {@link readLedger} resolved — the bug-fix name for fast-path changes.
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - change id.
 * @param ledger - new ledger.
 */
async function persistLedger(
  workspaceRoot: string,
  changeId: string,
  ledger: ImplementLedger,
): Promise<void> {
  const file = await ledgerFileFor(workspaceRoot, changeId)
  const path = join(changeDir(workspaceRoot, changeId), file)
  const tmp = `${path}.implement.tmp`
  await writeFile(tmp, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8')
  await rename(tmp, path)
}

/**
 * Drive implement completion: every task done and touched ⊆ allowlist.
 * @param ctx - stage context.
 * @param changeId - change id.
 * @returns status plus artifact paths (gate already passed).
 * @throws {BafError} invalid_transition / scope_exceeded from the gate.
 */
export async function driveImplementComplete(
  ctx: StageContext,
  changeId: string,
): Promise<ImplementStageResult> {
  const ledger = await readLedger(ctx.workspace.root, changeId)
  // Mode comes from the projection, not the caller: fast-path changes gate
  // on the regression-test rule, full-go-path changes on plan completeness.
  const status = await ctx.store.readStatus(changeId)
  const gate = await implementGate(
    {
      workspaceRoot: ctx.workspace.root,
      changeId,
      mode: status.mode === 'bug-fix-path' ? 'bug-fix-path' : 'full-go-path',
    },
    ledger.touched,
  )
  if (!gate.ok) {
    throw new BafError(
      gate.reasonCodes.includes('scope_exceeded') ? 'scope_exceeded' : 'invalid_transition',
      `implement gate failed: ${gate.reasonCodes.join(', ')} — ${gate.detail ?? ''}`,
      { changeId, reasonCodes: gate.reasonCodes },
    )
  }
  return {
    status,
    // 【变更】2026-09-30 (demo33 问题 1): report the ledger file this change
    // actually uses (fast-path name on bug-fix-path).
    artifacts: stageArtifactPaths(ctx.workspace.root, changeId, [
      await ledgerFileFor(ctx.workspace.root, changeId),
    ]),
    ledger,
  }
}

/** Re-exported plan document type for consumers of the ledger shape. */
export type { PlanDocument }
