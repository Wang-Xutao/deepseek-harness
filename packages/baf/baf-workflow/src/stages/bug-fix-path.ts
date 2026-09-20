/**
 * Bug fast-path stage support (§12 Phase 6): minimal bug record at open,
 * regression-test-first enforcement in implement, and T5 root-cause
 * evidence. OpenSpec artifacts are skipped on this mode; the projection's
 * `openspecSkipped` annotation carries the reason codes.
 * @module @deepseek-ai/dsh-baf-workflow/stages/bug-fix-path
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BafError, type WorkflowStatus } from '@deepseek-ai/dsh-baf-core'
import { ARTIFACT_FILES, changeDir } from '@deepseek-ai/dsh-baf-openspec'
import type { StageContext } from './context.ts'
import { writeArtifact } from './write.ts'
import { stageArtifactPaths } from './artifacts.ts'

/** Minimal bug record file name (fast-path replacement for the OpenSpec skeleton). */
export const BUG_RECORD_FILE = 'bug-record.md'

/** Preserved fast-path ledger name after a T15 upgrade (audit trail). */
export const BUG_FIX_PATH_LEDGER_FILE = 'bug-fix-path-ledger.json'

/** Ledger task id that must be written and completed first in fast path. */
export const REGRESSION_TASK_ID = 'regression-test'

/** Ledger task id covering the root-cause fix itself. */
export const FIX_TASK_ID = 'fix-root-cause'

/** One regression-test declaration recorded at fast-path open. */
export interface BugFixPathRegressionTest {
  /** Workspace-relative test file to write before any fix file. */
  readonly file: string
  /** Command that executes the regression test (Phase 7 runs it live). */
  readonly command: string
}

/** Input for {@link driveBugFixPathOpen} (T3 entry, minimal bug record). */
export interface BugFixPathBugInput {
  readonly changeId: string
  readonly title: string
  /** Observed problem behavior. */
  readonly problem: string
  /** Diagnosed root cause; T5 evidence reads this back from the record. */
  readonly rootCause: string
  /** Files the fix is expected to touch (seeds the implement allowlist). */
  readonly affectedFiles: readonly string[]
  readonly regressionTest: BugFixPathRegressionTest
}

/** Result of a successful fast-path open drive. */
export interface BugFixPathOpenResult {
  readonly status: WorkflowStatus
  readonly artifacts: readonly string[]
  /** Whether the bug record carries a real root cause (T5 evidence). */
  readonly rootCauseRecorded: boolean
}

/** Structural task-row view shared with ledgers (avoids import cycles). */
interface TaskRowView {
  readonly id?: string
  readonly files?: readonly string[]
  readonly done?: boolean
}

/** Ledger shape {@link driveBugFixPathOpen} writes and gates read back. */
export interface BugFixPathLedgerView {
  readonly bugFixPath?: boolean
  readonly tasks: readonly TaskRowView[]
  readonly allowlist: readonly string[]
  readonly touched: readonly string[]
}

/**
 * Render the minimal bug record body (§5.3 N1 fast-path skeleton).
 * @param input - bug fields.
 * @param workspace - observed Git/baseline facts for the audit trail.
 * @returns markdown body.
 */
export function renderBugRecordBody(
  input: BugFixPathBugInput,
  workspace: { readonly gitRevision?: string; readonly baselineId?: string },
): string {
  const lines: string[] = [
    `# Bug record — ${input.changeId}`,
    '',
    `- Title: ${input.title}`,
    '',
    '## Problem',
    '',
    input.problem,
    '',
    '## Root cause',
    '',
    input.rootCause,
    '',
    '## Impact scope',
    '',
  ]
  for (const file of input.affectedFiles) lines.push(`- ${file}`)
  lines.push(
    '',
    '## Regression test',
    '',
    `- File: ${input.regressionTest.file}`,
    `- Command: ${input.regressionTest.command}`,
    '',
    '## Workspace',
    '',
    ...(workspace.gitRevision === undefined
      ? ['- Git revision unavailable — warning recorded; fast path proceeds (full-go-path would block)']
      : [`- Git revision: ${workspace.gitRevision}`]),
    ...(workspace.baselineId === undefined
      ? ['- Baseline unavailable at open (intake approved this fast path)']
      : [`- Baseline: ${workspace.baselineId}`]),
    '',
    '- Mode: bug-fix-path (OpenSpec skipped; see projection reason codes)',
    '',
  )
  return lines.join('\n')
}

/**
 * Drive the fast-path open handler: write the minimal bug record and the
 * fast-path implement ledger (regression-test task first). No OpenSpec
 * skeleton is created on this mode.
 * @param ctx - stage context.
 * @param input - bug fields.
 * @returns artifacts plus the T5 evidence verdict.
 * @throws {BafError} invalid_transition when required fields are empty.
 */
export async function driveBugFixPathOpen(
  ctx: StageContext,
  input: BugFixPathBugInput,
): Promise<BugFixPathOpenResult> {
  if (input.problem.trim() === '' || input.rootCause.trim() === '') {
    throw new BafError('invalid_transition', 'fast-path open requires problem and root cause', {
      changeId: input.changeId,
    })
  }
  if (input.regressionTest.file.trim() === '' || input.regressionTest.command.trim() === '') {
    throw new BafError('invalid_transition', 'fast-path open requires a regression test', {
      changeId: input.changeId,
    })
  }
  if (input.affectedFiles.length === 0) {
    throw new BafError('invalid_transition', 'fast-path open requires at least one affected file', {
      changeId: input.changeId,
    })
  }

  const body = renderBugRecordBody(input, {
    ...(ctx.workspace.git?.revision === undefined
      ? {}
      : { gitRevision: ctx.workspace.git.revision }),
    ...(ctx.baseline === undefined ? {} : { baselineId: ctx.baseline.baselineId }),
  })
  await writeArtifact(ctx.workspace.root, input.changeId, BUG_RECORD_FILE, body)

  const ledger: BugFixPathLedgerView = {
    bugFixPath: true,
    tasks: [
      {
        id: REGRESSION_TASK_ID,
        files: [input.regressionTest.file],
        done: false,
      },
      {
        id: FIX_TASK_ID,
        files: [...input.affectedFiles],
        done: false,
      },
    ],
    allowlist: [...new Set([...input.affectedFiles, input.regressionTest.file])],
    touched: [],
  }
  await writeArtifact(
    ctx.workspace.root,
    input.changeId,
    ARTIFACT_FILES.planJson,
    `${JSON.stringify(ledger, null, 2)}\n`,
  )

  return {
    status: await ctx.store.readStatus(input.changeId),
    artifacts: stageArtifactPaths(ctx.workspace.root, input.changeId, [
      BUG_RECORD_FILE,
      ARTIFACT_FILES.planJson,
    ]),
    rootCauseRecorded: input.rootCause.trim() !== '',
  }
}

/**
 * Read the raw bug record body for a change.
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - change id.
 * @returns body or undefined when no bug record exists.
 */
export async function readBugRecord(
  workspaceRoot: string,
  changeId: string,
): Promise<string | undefined> {
  try {
    return await readFile(join(changeDir(workspaceRoot, changeId), BUG_RECORD_FILE), 'utf8')
  } catch {
    return undefined
  }
}

/**
 * Extract one `## <heading>` section body.
 * @param body - markdown body.
 * @param heading - section heading text (without `##`).
 * @returns section body or undefined when the heading is absent.
 */
export function sectionOf(body: string, heading: string): string | undefined {
  const marker = `## ${heading}`
  const start = body.indexOf(marker)
  if (start < 0) return undefined
  const rest = body.slice(start + marker.length)
  const next = rest.indexOf('\n## ')
  return next < 0 ? rest : rest.slice(0, next)
}

/**
 * Whether the bug record carries a real root cause (T5 machine evidence;
 * never trusts caller assertions, §5.2 T5).
 * @param workspaceRoot - absolute workspace root.
 * @param changeId - change id.
 * @returns true when the Root cause section has real content.
 */
export async function rootCauseRecorded(
  workspaceRoot: string,
  changeId: string,
): Promise<boolean> {
  const body = await readBugRecord(workspaceRoot, changeId)
  if (body === undefined) return false
  const section = sectionOf(body, 'Root cause')
  if (section === undefined) return false
  const real = section
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line =>
      line !== ''
      && !line.startsWith('#')
      && !/^(?:TODO\b|n\/a\b|none\b|-)$/i.test(line))
  return real.length > 0
}

/**
 * The regression-test task row of a ledger, when present.
 * @param ledger - implement ledger view.
 * @returns task row or undefined.
 */
export function regressionTaskOf(ledger: BugFixPathLedgerView): TaskRowView | undefined {
  return ledger.tasks.find(task => task.id === REGRESSION_TASK_ID)
}

/**
 * The regression test file a fast-path ledger must write first.
 * @param ledger - implement ledger view.
 * @returns workspace-relative file or undefined.
 */
export function regressionFileOf(ledger: BugFixPathLedgerView): string | undefined {
  return regressionTaskOf(ledger)?.files?.[0]
}

/**
 * Enforce regression-test-first ordering on fast-path writes (§12 Phase 6:
 * implement 强制先写回归测试). Called by recordTouched after the allowlist
 * check; refusing here keeps the ordering violation recoverable, unlike a
 * post-hoc gate over the immutable touched order.
 * @param ledger - current ledger.
 * @param file - workspace-relative target being recorded.
 * @throws {BafError} invalid_transition (regression_test_required) when a
 * non-regression file is recorded before the regression task is done.
 */
export function assertRegressionFirst(ledger: BugFixPathLedgerView, file: string): void {
  if (ledger.bugFixPath !== true) return
  const regressionFile = regressionFileOf(ledger)
  if (regressionFile !== undefined && file === regressionFile) return
  const task = regressionTaskOf(ledger)
  if (task === undefined || task.done !== true) {
    throw new BafError(
      'invalid_transition',
      'fast path must write and complete the regression test before other implement writes',
      { file, reasonCodes: ['regression_test_required'] },
    )
  }
}

/**
 * Whether the fast-path ledger satisfies the regression-test requirement
 * (task exists, done, and its file was written). Non-fast-path ledgers pass.
 * @param ledger - implement ledger view.
 * @returns true when satisfied.
 */
export function regressionSatisfied(ledger: BugFixPathLedgerView): boolean {
  if (ledger.bugFixPath !== true) return true
  const task = regressionTaskOf(ledger)
  const file = task?.files?.[0]
  return task !== undefined && task.done === true && file !== undefined
    && ledger.touched.includes(file)
}
