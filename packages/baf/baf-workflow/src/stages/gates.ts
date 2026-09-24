/**
 * Stage completion gates (enterprise-workflow §5.3 completion conditions).
 * A gate inspects durable artifacts and returns reason codes; it never
 * trusts caller assertions. Fast path skips full-go-path-only artifacts.
 * @module @deepseek-ai/dsh-baf-workflow/stages/gates
 */

import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { OpenSpecAdapter } from '@deepseek-ai/dsh-baf-core'
import { ARTIFACT_FILES } from '@deepseek-ai/dsh-baf-openspec'
import { REGRESSION_TASK_ID } from './bug-fix-path.ts'
import { parsePlanLedger } from './plan-ledger.ts'

/** Outcome of one completion gate. */
export interface GateOutcome {
  readonly ok: boolean
  readonly reasonCodes: readonly string[]
  readonly detail?: string
  /**
   * Customer-facing missing items (Chinese, one line each) — the concrete work
   * needed before this gate can pass. `/baf-go` refusal cards and `/baf-status`
   * render these so a blocked stage names the work, not just the reason code
   * (2026-09-21 session 5.jsonl: repeated `stage_incomplete` with no pointer to
   * the file or the missing sections left both model and customer blind).
   */
  readonly missing?: readonly string[]
}

/**
 * Customer-facing state of one change artifact, as cards render it.
 * 【变更】2026-09-23 (demo5 issue #4): `planned` is tasks.md's 中间态 — 计划
 * 完成（todo list 已从账本渲染）但实现未完成（done 标记未全勾）。
 */
export type ArtifactState = 'missing' | 'template' | 'planned' | 'filled'

/** One artifact status row for the /baf-go and /baf-status cards. */
export interface ArtifactStatusRow {
  /** Artifact file name inside the change directory (e.g. `clarify.md`). */
  readonly file: string
  /** Workspace-relative path — the string the customer opens or tells the model about. */
  readonly path: string
  readonly state: ArtifactState
  /** Missing items when state is not `filled` (Chinese, one line each). */
  readonly missing: readonly string[]
}

/** Every customer-editable change artifact, in stage order (paths join with `/`). */
const DOC_ARTIFACT_ORDER = [
  ARTIFACT_FILES.proposal,
  ARTIFACT_FILES.clarify,
  ARTIFACT_FILES.design,
  ARTIFACT_FILES.plan,
  ARTIFACT_FILES.planJson,
  ARTIFACT_FILES.tasks,
  // 【变更】2026-09-23 (demo5 issue #3): the verify stage's customer-facing
  // artifact is verify.md (rendered from the run) — verify-report.json stays
  // on disk as the machine ledger (drift freshness, quality consumers) but
  // leaves the rail.
  'verify.md',
] as const

/** What each documentation stage's gate requires, in customer language. */
export const DOC_REQUIREMENTS_ZH: Readonly<Record<'open' | 'clarify' | 'design' | 'plan', readonly string[]>> = {
  open: [
    'proposal.md 有实际内容（不是 TODO 模板占位）',
    '含 ## Why 节（一句话说清用户目标与这个变更解决什么问题）',
    'Scope / Impact 节填上（改哪些、不改哪些、影响面与回退难度）',
  ],
  clarify: [
    'clarify.md 有实际内容（不是 TODO 模板占位）',
    '含 ## Acceptance criteria 节，每条可用命令或行为验证',
  ],
  design: [
    'design.md 有实际内容：Approach（接口/数据流/错误路径/兼容性）为主',
  ],
  plan: [
    'plan.json 的每个任务写全 files（改哪些文件）/ verify（验证命令）/ rollback（回退点）——键名也认 affected_files / verify_cmd / rollback_point',
    'allowlist 非空（实施阶段只允许改这些文件）',
  ],
}

/** Shared gate inputs for one stage completion check. */
export interface GateInput {
  readonly workspaceRoot: string
  readonly changeId: string
  /** Which workflow mode the change runs (fast path skips full-go-path artifacts). */
  readonly mode: 'full-go-path' | 'bug-fix-path'
}

const ok: GateOutcome = { ok: true, reasonCodes: [] }
const fail = (reasonCodes: string[], detail?: string, missing?: readonly string[]): GateOutcome =>
  ({
    ok: false,
    reasonCodes,
    ...(detail === undefined ? {} : { detail }),
    ...(missing === undefined || missing.length === 0 ? {} : { missing }),
  })

/**
 * Read a change artifact; undefined when the file is missing.
 * @param input - gate input.
 * @param file - artifact file name.
 * @returns body or undefined.
 */
async function readArtifact(input: GateInput, file: string): Promise<string | undefined> {
  // 【变更】2026-09-23 (user issue #5): an archived change's artifacts live
  // under `openspec/changes/archive/<id>/` — fall back there so a terminal
  // change's rail and /baf-status keep showing real files instead of every
  // row flipping to 尚未生成 the moment the archive move lands.
  const live = join(input.workspaceRoot, 'openspec', 'changes', input.changeId, file)
  try {
    return await readFile(live, 'utf8')
  } catch {
    const archived = join(input.workspaceRoot, 'openspec', 'changes', 'archive', input.changeId, file)
    try {
      return await readFile(archived, 'utf8')
    } catch {
      return undefined
    }
  }
}

/**
 * Whether a body is still an unfilled template (no real content paragraphs).
 *
 * Judged per blank-line-separated paragraph, not per line: template TODOs wrap
 * across lines (`tasks.md`'s "TODO: ordered task list. Each task states …\nthe
 * verification command…" made the old per-line rule classify the template as
 * filled). A paragraph counts as placeholder when its first line matches the
 * placeholder pattern (TODO… / `Change id:` / Question: / Answer…).
 * @param body - artifact text.
 * @returns true when only template placeholders remain.
 */
function templateOnly(body: string): boolean {
  const placeholder =
    /^(?:-\s*)?(?:TODO\b|Change id:|[A-Z][\w /]*:|Question:|Answer \(decision source \+ date\) or `deferred: <reason>`:)/
  const paragraphs = body
    .split(/\r?\n\s*\r?\n/)
    .map(p => p.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '' && !l.startsWith('#')))
    .filter(lines => lines.length > 0)
  if (paragraphs.length === 0) return true
  return paragraphs.every(lines => placeholder.test(lines[0] ?? ''))
}

/**
 * N1b open gate (full-go-path): proposal authored with a real Why section.
 *
 * 【变更】2026-09-22 (web walk, change 170b): open had NO file gate — the Tab
 * 「推进」 button and `/baf-go` moved a change from open to clarify while
 * proposal.md was still the TODO template, so every later stage inherited a
 * missing ancestor artifact. The user's principle: 每阶段产物是推进前提. The
 * required marker mirrors the openspec adapter's REQUIRED_SECTIONS contract
 * for proposal.md (`## Why`), with the same numbered-heading tolerance the
 * clarify gate gained in Fix A. Fast path skips it (bug-fix-path never rests
 * on an authoring open).
 * @param input - gate input.
 * @returns gate outcome.
 */
export async function proposalGate(input: GateInput): Promise<GateOutcome> {
  if (input.mode === 'bug-fix-path') return ok
  const body = await readArtifact(input, ARTIFACT_FILES.proposal)
  if (body === undefined) {
    return fail(['stage_incomplete'], 'proposal.md missing',
      ['proposal.md 不存在——敲 /baf-go 安装模板'])
  }
  if (templateOnly(body)) {
    return fail(['stage_incomplete'], 'proposal.md is still the unfilled template', [
      'Why：一句话说清用户目标与这个变更解决什么问题',
      'Scope：改哪些、明确不改哪些',
      'Impact：预期影响的模块、公共 API 影响、回退难度',
    ])
  }
  if (!/^#{2,4}\s*(?:\d+[.)、]\s*)?Why\b[^\n]*$/im.test(body)) {
    return fail(['stage_incomplete'], 'proposal.md lacks Why section',
      ['补 ## Why 节：一句话说清用户目标与这个变更解决什么问题'])
  }
  return ok
}

/**
 * N2 clarify gate: blocking questions answered or deferred + testable
 * acceptance criteria present.
 * @param input - gate input.
 * @returns gate outcome.
 */
export async function clarifyGate(input: GateInput): Promise<GateOutcome> {
  if (input.mode === 'bug-fix-path') return ok
  const body = await readArtifact(input, ARTIFACT_FILES.clarify)
  if (body === undefined) {
    return fail(['stage_incomplete'], 'clarify.md missing',
      ['clarify.md 不存在——敲 /baf-go 安装模板'])
  }
  if (templateOnly(body)) {
    return fail(['stage_incomplete'], 'clarify.md is still the unfilled template', [
      'Blocking questions：每条阻塞问题的结论（或写明 deferred 及原因）',
      'Acceptance criteria：可验证的验收标准，每条对应一个命令或行为',
      'Non-goals：明确不做的事',
    ])
  }
  // 【变更】2026-09-22 (web walk stall #6): models number their sections
  // (`## 7. Acceptance criteria`) — the gate's contract is "the section
  // exists", so accept numbered (and shallowly suffixed) heading variants
  // instead of the one literal string. A literal-only check deadlocked the
  // walk: the model's turn ended believing clarify.md complete while this
  // gate kept judging it incomplete, and no card was due to say so.
  if (!/^#{2,4}\s*(?:\d+[.)、]\s*)?Acceptance criteria\b[^\n]*$/im.test(body)) {
    return fail(['stage_incomplete'], 'clarify.md lacks Acceptance criteria section',
      ['补 ## Acceptance criteria 节：每条验收标准可用命令或行为验证'])
  }
  return ok
}

/**
 * N3 design gate: design written with a real Approach section.
 * @param input - gate input.
 * @returns gate outcome.
 */
export async function designGate(input: GateInput): Promise<GateOutcome> {
  if (input.mode === 'bug-fix-path') return ok
  const body = await readArtifact(input, ARTIFACT_FILES.design)
  if (body === undefined) {
    return fail(['stage_incomplete'], 'design.md missing',
      ['design.md 不存在——敲 /baf-go 安装模板'])
  }
  if (templateOnly(body)) {
    return fail(['stage_incomplete'], 'design.md is still the unfilled template', [
      'Approach：选定方案——接口、数据流、错误路径、兼容性',
      'Repository references：每条结论引用真实文件/API',
      'Risks：风险与对策',
    ])
  }
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
 *
 * 【变更】2026-09-23 (demo1 五问题 1–3): reading goes through the tolerant
 * ledger normalizer — task rows written with the model-natural aliases
 * (`affected_files` / `verify_cmd` / `rollback_point`, verify as a bare string)
 * count exactly like the canonical `files` / `verify` / `rollback`. The old
 * strict read made the gate report every task as missing while the model had
 * filled the file, dead-looping the plan stage (dialog never due, /baf-go only
 * re-refusing).
 * @param input - gate input.
 * @returns parsed plan or undefined.
 */
async function readPlan(input: GateInput): Promise<PlanDocument | undefined> {
  const body = await readArtifact(input, ARTIFACT_FILES.planJson)
  if (body === undefined) return undefined
  return parsePlanLedger(body) as PlanDocument | undefined
}

/**
 * N4 plan gate: every task names affected files and a verify command;
 * allowlist is non-empty.
 * @param input - gate input.
 * @returns gate outcome.
 */
export async function planGate(input: GateInput): Promise<GateOutcome> {
  if (input.mode === 'bug-fix-path') return ok
  const plan = await readPlan(input)
  if (plan === undefined) {
    return fail(['stage_incomplete'], 'plan.json missing or malformed',
      ['plan.json 不存在或格式不对——需含 tasks 与 allowlist 两个数组'])
  }
  if (plan.allowlist.length === 0) {
    return fail(['stage_incomplete'], 'plan.json allowlist is empty',
      ['allowlist 为空——列出实施阶段允许修改的文件（baf-guard 硬门禁依据）'])
  }
  // Collect every task's gaps so one refusal names all the work, not just the
  // first broken task (fill-iterate loops were the 5.jsonl pain point).
  // 【变更】2026-09-23 (demo1 五问题 1–3): the lines name the canonical JSON
  // keys — the model copies these into plan.json, so the wording and the
  // reader must agree (aliases are accepted, but the canonical name is what
  // we teach).
  const missing: string[] = []
  let firstDetail = ''
  for (const [index, task] of plan.tasks.entries()) {
    const label = `task ${task.id ?? task.title ?? index + 1}`
    if (task.files === undefined || task.files.length === 0) {
      if (firstDetail === '') firstDetail = `${label} has no affected files`
      missing.push(`${label}：缺 files（本任务改哪些文件，数组）`)
    }
    if (task.verify === undefined || task.verify.length === 0) {
      if (firstDetail === '') firstDetail = `${label} has no verify command`
      missing.push(`${label}：缺 verify（怎么验证本任务完成，命令数组）`)
    }
    if (task.rollback === undefined || task.rollback === '') {
      if (firstDetail === '') firstDetail = `${label} has no rollback point`
      missing.push(`${label}：缺 rollback（出问题回退到哪）`)
    }
  }
  if (missing.length > 0) return fail(['stage_incomplete'], firstDetail, missing)
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
  if (input.mode === 'bug-fix-path') {
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
    return fail(
      ['stage_incomplete'],
      `${done}/${plan.tasks.length} tasks done`,
      [`plan.json：${done}/${plan.tasks.length} 个任务已 done——完成剩余任务并把 done 标为 true`],
    )
  }
  const allow = new Set(plan.allowlist)
  const outside = touched.filter(file => !allow.has(file))
  if (outside.length > 0) {
    return fail(
      ['scope_exceeded'],
      `outside allowlist: ${outside.join(', ')}`,
      [`以下改动不在 allowlist 内，收回或调整 plan.json：${outside.join(', ')}`],
    )
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

/** Chinese state label for artifact status rows. */
function stateZh(state: ArtifactState): string {
  switch (state) {
    case 'missing': return '尚未生成'
    case 'template': return '仍是未填的模板'
    case 'planned': return '已计划'
    case 'filled': return '已填写'
  }
}

/**
 * Classify one markdown artifact into the customer-facing state with the
 * template's TODO sections as the missing list.
 * @param body - artifact text, or undefined when the file does not exist.
 * @returns state + missing lines.
 */
function markdownState(body: string | undefined): { state: ArtifactState; missing: readonly string[] } {
  if (body === undefined) return { state: 'missing', missing: [] }
  if (templateOnly(body)) {
    const todos = body
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.startsWith('TODO'))
      .map(l => l.replace(/^-\s*/, ''))
    return { state: 'template', missing: todos.length > 0 ? todos : ['TODO 占位尚未替换为实际内容'] }
  }
  return { state: 'filled', missing: [] }
}

/**
 * Read every customer-editable artifact of one change and classify it — the
 * single source both `/baf-status` and the `/baf-go` park cards render from.
 * @param input - gate input (workspace + change + mode).
 * @returns one row per artifact, in stage order.
 */
export async function changeArtifactStatus(input: GateInput): Promise<readonly ArtifactStatusRow[]> {
  const rows: ArtifactStatusRow[] = []
  for (const file of DOC_ARTIFACT_ORDER) {
    // 2026-09-23 issue #5: the row's path follows the file — archived changes
    // report the archive location, so the rail's open button keeps working
    // after the move instead of pointing at a path that no longer exists.
    const livePath = `openspec/changes/${input.changeId}/${file}`
    const archivedPath = `openspec/changes/archive/${input.changeId}/${file}`
    const body = await readArtifact(input, file)
    const path = body === undefined || await stat(join(input.workspaceRoot, livePath)).then(() => true, () => false)
      ? livePath
      : archivedPath
    let row: ArtifactStatusRow
    if (file === 'verify.md') {
      // 【变更】2026-09-23 (demo5 issue #3): the acceptance document is
      // machine-written (rendered from the run) — present means filled (its
      // `passed` verdict rides the verify card, not this row), absent means
      // verify never ran.
      row = body === undefined
        ? { file, path, state: 'missing', missing: [] }
        : { file, path, state: 'filled', missing: [] }
    } else if (file === ARTIFACT_FILES.tasks) {
      // 【变更】2026-09-23 (demo5 issue #4): tasks.md 的四态状态机 —
      // 尚未生成 → 仍是未填的模板（计划未完成）→ 已计划（计划完成，todo
      // list 已从 plan.json 渲染，任务未全部 done）→ 已填写（实现完成，全部
      // done）。账本读得出时以 done 标记为准，读不出回退到勾选框扫描。
      if (body === undefined) {
        row = { file, path, state: 'missing', missing: [] }
      } else if (templateOnly(body)) {
        const todos = body
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(l => l.startsWith('TODO'))
          .map(l => l.replace(/^-\s*/, ''))
        row = { file, path, state: 'template', missing: todos.length > 0 ? todos : ['TODO 占位尚未替换为实际内容'] }
      } else {
        const plan = await readPlan(input).catch(() => undefined)
        const ledgerAllDone = plan !== undefined && plan.tasks.length > 0
          && plan.tasks.every(t => (t as { done?: boolean }).done === true)
        // Checkbox fallback for a hand-shaped tasks.md beside an unreadable
        // ledger: every box ticked and none open reads 已填写.
        const boxesAllDone = ledgerAllDone
          || (/^- \[x\]/m.test(body) && !/^- \[ \]/m.test(body))
        row = {
          file,
          path,
          state: boxesAllDone ? 'filled' : 'planned',
          missing: boxesAllDone ? [] : ['实现阶段完成任务并标 done 后刷新为已填写'],
        }
      }
    } else if (file === ARTIFACT_FILES.planJson) {
      const plan = body === undefined ? undefined : await readPlan(input)
      row = plan === undefined
        ? { file, path, state: 'missing', missing: [] }
        : plan.allowlist.length === 0 && plan.tasks.length === 0
          ? { file, path, state: 'template', missing: ['tasks / allowlist 还是空数组'] }
          : { file, path, state: 'filled', missing: [] }
    } else {
      const md = markdownState(body)
      row = { file, path, state: md.state, missing: md.state === 'filled' ? [] : md.missing }
    }
    rows.push(row)
  }
  return rows
}

/** One artifact row rendered as a card line: `path · state`. */
export function artifactLine(row: ArtifactStatusRow): string {
  return `${row.path} · ${stateZh(row.state)}`
}
