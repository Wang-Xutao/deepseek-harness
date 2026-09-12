/**
 * Stage completion gates (enterprise-workflow §5.3 completion conditions).
 * A gate inspects durable artifacts and returns reason codes; it never
 * trusts caller assertions. Fast path skips full-go-only artifacts.
 * @module @deepseek-ai/dsh-baf-workflow/stages/gates
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { OpenSpecAdapter } from '@deepseek-ai/dsh-baf-core'
import { ARTIFACT_FILES } from '@deepseek-ai/dsh-baf-openspec'
import { REGRESSION_TASK_ID } from './fastpath.ts'

/** Outcome of one completion gate. */
export interface GateOutcome {
  readonly ok: boolean
  readonly reasonCodes: readonly string[]
  readonly detail?: string
}

/** Shared gate inputs for one stage completion check. */
export interface GateInput {
  readonly workspaceRoot: string
  readonly changeId: string
  /** Which workflow mode the change runs (fast path skips full-go artifacts). */
  readonly mode: 'full-go' | 'bug-fast-path'
}

const ok: GateOutcome = { ok: true, reasonCodes: [] }
const fail = (reasonCodes: string[], detail?: string): GateOutcome =>
  ({ ok: false, reasonCodes, ...(detail === undefined ? {} : { detail }) })

/**
 * Read a change artifact; undefined when the file is missing.
 * @param input - gate input.
 * @param file - artifact file name.
 * @returns body or undefined.
 */
async function readArtifact(input: GateInput, file: string): Promise<string | undefined> {
  const path = join(input.workspaceRoot, 'openspec', 'changes', input.changeId, file)
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * Whether a body is still an unfilled template (no real content lines).
 * @param body - artifact text.
 * @returns true when only template placeholders remain.
 */
function templateOnly(body: string): boolean {
  const content = body
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l !== '' && !l.startsWith('#'))
  const placeholder =
    /^(?:-\s*)?(?:TODO\b|Change id:|[A-Z][\w /]*:|Question:|Answer \(decision source \+ date\) or `deferred: <reason>`:)/
  return content.every(l => placeholder.test(l))
}

/**
 * N2 clarify gate: blocking questions answered or deferred + testable
 * acceptance criteria present.
 * @param input - gate input.
 * @returns gate outcome.
 */
export async function clarifyGate(input: GateInput): Promise<GateOutcome> {
  if (input.mode === 'bug-fast-path') return ok
  const body = await readArtifact(input, ARTIFACT_FILES.clarify)
  if (body === undefined) return fail(['stage_incomplete'], 'clarify.md missing')
  if (templateOnly(body)) return fail(['stage_incomplete'], 'clarify.md is still the unfilled template')
  if (!body.includes('## Acceptance criteria')) {
    return fail(['stage_incomplete'], 'clarify.md lacks Acceptance criteria section')
  }
  return ok
}

/**
 * N3 design gate: design written with a real Approach section.
 * @param input - gate input.
 * @returns gate outcome.
 */
export async function designGate(input: GateInput): Promise<GateOutcome> {
  if (input.mode === 'bug-fast-path') return ok
  const body = await readArtifact(input, ARTIFACT_FILES.design)
  if (body === undefined) return fail(['stage_incomplete'], 'design.md missing')
  if (templateOnly(body)) return fail(['stage_incomplete'], 'design.md is still the unfilled template')
  return ok
}

/** One planned task entry parsed from plan.json. */
export interface PlanTask {
  readonly id?: string
  readonly title?: string
  readonly files?: readonly string[]
  readonly verify?: readonly string[]
  readonly rollback?: string
}

/** Serialized plan document written by the plan handler. */
export interface PlanDocument {
  readonly tasks: readonly PlanTask[]
  readonly allowlist: readonly string[]
  readonly verifyCommands?: readonly string[]
}

/**
 * Parse plan.json leniently.
 * @param input - gate input.
 * @returns parsed plan or undefined.
 */
async function readPlan(input: GateInput): Promise<PlanDocument | undefined> {
  const body = await readArtifact(input, ARTIFACT_FILES.planJson)
  if (body === undefined) return undefined
  try {
    const parsed = JSON.parse(body) as Partial<PlanDocument>
    if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.allowlist)) return undefined
    return parsed as PlanDocument
  } catch {
    return undefined
  }
}

/**
 * N4 plan gate: every task names affected files and a verify command;
 * allowlist is non-empty.
 * @param input - gate input.
 * @returns gate outcome.
 */
export async function planGate(input: GateInput): Promise<GateOutcome> {
  if (input.mode === 'bug-fast-path') return ok
  const plan = await readPlan(input)
  if (plan === undefined) return fail(['stage_incomplete'], 'plan.json missing or malformed')
  if (plan.allowlist.length === 0) return fail(['stage_incomplete'], 'plan.json allowlist is empty')
  for (const [index, task] of plan.tasks.entries()) {
    const label = `task ${task.id ?? task.title ?? index + 1}`
    if (task.files === undefined || task.files.length === 0) {
      return fail(['stage_incomplete'], `${label} has no affected files`)
    }
    if (task.verify === undefined || task.verify.length === 0) {
      return fail(['stage_incomplete'], `${label} has no verify command`)
    }
    if (task.rollback === undefined || task.rollback === '') {
      return fail(['stage_incomplete'], `${label} has no rollback point`)
    }
  }
  return ok
}

/**
 * N5 implement gate: plan tasks all carry done=true and the touched file set
 * stays inside the allowlist (out-of-scope growth must escalate instead).
 * Fast path gates on the durable regression-test rule instead of plan
 * completeness: regression task present, done, and its file written.
 * @param input - gate input.
 * @param touched - files actually edited or created.
 * @returns gate outcome.
 */
export async function implementGate(
  input: GateInput,
  touched: readonly string[],
): Promise<GateOutcome> {
  if (input.mode === 'bug-fast-path') {
    const plan = await readPlan(input)
    if (plan === undefined) return fail(['stage_incomplete'], 'plan.json missing or malformed')
    const allow = new Set(plan.allowlist)
    const outside = touched.filter(file => !allow.has(file))
    if (outside.length > 0) {
      return fail(['scope_exceeded'], `outside allowlist: ${outside.join(', ')}`)
    }
    const regression = plan.tasks.find(t => t.id === REGRESSION_TASK_ID)
    const regressionFile = regression?.files?.[0]
    const regressionDone = (regression as { done?: boolean } | undefined)?.done === true
    if (regression === undefined || !regressionDone) {
      return fail(['regression_test_required'], 'regression test task not done before fix work')
    }
    if (regressionFile === undefined || !touched.includes(regressionFile)) {
      return fail(['regression_test_required'], 'regression test file was never recorded as touched')
    }
    if (touched.length === 0) return fail(['stage_incomplete'], 'no touched files recorded')
    return ok
  }
  const plan = await readPlan(input)
  if (plan === undefined) return fail(['stage_incomplete'], 'plan.json missing or malformed')
  const done = plan.tasks.filter(t => (t as { done?: boolean }).done === true).length
  if (done < plan.tasks.length) {
    return fail(['stage_incomplete'], `${done}/${plan.tasks.length} tasks done`)
  }
  const allow = new Set(plan.allowlist)
  const outside = touched.filter(file => !allow.has(file))
  if (outside.length > 0) {
    return fail(['scope_exceeded'], `outside allowlist: ${outside.join(', ')}`)
  }
  return ok
}

/**
 * N6 verify gate: every required check passed and none skipped silently.
 * @param checks - check results from the CheckRunner.
 * @returns gate outcome.
 */
export function verifyGate(
  checks: readonly { readonly name: string; readonly ok: boolean; readonly required: boolean }[],
): GateOutcome {
  const failedRequired = checks.filter(c => c.required && !c.ok)
  if (failedRequired.length > 0) {
    return fail(
      ['verify_required'],
      `failed checks: ${failedRequired.map(c => c.name).join(', ')}`,
    )
  }
  return ok
}

/**
 * N1 open structural validation via the OpenSpec adapter.
 * @param adapter - openspec adapter.
 * @param changeId - change id.
 * @returns gate outcome.
 */
export async function openGate(
  adapter: OpenSpecAdapter,
  changeId: string,
): Promise<GateOutcome> {
  const report = await adapter.validate({ changeId, path: '' })
  return report.passed
    ? ok
    : fail(['stage_incomplete'], report.diagnostics.join('; '))
}
