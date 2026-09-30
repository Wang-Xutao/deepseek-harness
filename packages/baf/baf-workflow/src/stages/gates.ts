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
import { BUG_FIX_PROPOSAL_FILE, REGRESSION_TASK_ID, sectionOf } from './bug-fix-path.ts'
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
export type ArtifactState = 'missing' | 'template' | 'planned' | 'filled' | 'clipped'

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

/**
 * 【变更】2026-09-28 (用户问题 8): the verify-stage customer checklist — the
 * one artifact authored AFTER implement completes and BEFORE verify starts.
 * The model derives it from the plan's per-task verify commands and the
 * acceptance criteria; the customer confirms it on the verify-advance card;
 * the model ticks `- [ ]` → `- [x]` as verification confirms each item; gate B
 * releases only when every box is ticked. Same rail state machine as tasks.md
 * (missing → template → planned → filled). Declared BEFORE the artifact
 * orders that reference it (const TDZ).
 */
export const CHECKLIST_FILE = 'checklist.md'

/** One parsed checklist row. */
export interface ChecklistItem {
  readonly text: string
  readonly done: boolean
}

/** A parsed checklist's fold: rows plus the still-open item texts. */
export interface ChecklistStatus {
  readonly items: readonly ChecklistItem[]
  readonly total: number
  readonly open: readonly string[]
}

const CHECKBOX_LINE = /^\s*[-*]\s+\[([ xX])]\s*(.*)$/

/**
 * Parse the markdown checkbox rows out of a checklist body. Non-checkbox
 * lines (headings, prose) are ignored — the rows ARE the checklist.
 * @param body - checklist.md text.
 * @returns the parsed fold.
 */
export function parseChecklist(body: string): ChecklistStatus {
  const items: ChecklistItem[] = []
  for (const line of body.split(/\r?\n/)) {
    const match = CHECKBOX_LINE.exec(line)
    if (match === null) continue
    const flag = match[1] ?? ' '
    const text = match[2] ?? ''
    items.push({ done: flag.toLowerCase() === 'x', text: text.trim() })
  }
  return { items, total: items.length, open: items.filter(item => !item.done).map(item => item.text) }
}

/** The checklist's pass conditions, quoted by the /baf-go dispatch order. */
export const CHECKLIST_REQUIREMENTS_ZH: readonly string[] = [
  'checklist.md 每行一个 `- [ ] 检查项`（来自 plan.json 每个任务的 verify 命令 + 验收标准）',
  '验证阶段逐项确认：通过一项勾一项（`- [ ]` 改 `- [x]`）',
  '全部勾选后才允许归档（归档门硬校验）',
]

/** Every customer-editable change artifact, in stage order (paths join with `/`). */
const DOC_ARTIFACT_ORDER = [
  ARTIFACT_FILES.proposal,
  ARTIFACT_FILES.clarify,
  ARTIFACT_FILES.design,
  ARTIFACT_FILES.plan,
  ARTIFACT_FILES.planJson,
  ARTIFACT_FILES.tasks,
  // 【变更】2026-09-28 (用户问题 8): the verify checklist rides between the
  // task ledger and the acceptance document — implement-exit authors it,
  // verify ticks it, gate B hard-checks it.
  CHECKLIST_FILE,
  // 【变更】2026-09-23 (demo5 issue #3): the verify stage's customer-facing
  // artifact is verify.md (rendered from the run) — verify-report.json stays
  // on disk as the machine ledger (drift freshness, quality consumers) but
  // leaves the rail.
  'verify.md',
] as const

/**
 * 【变更】2026-09-26 (用户需求 工作流 3): the bug-fix-path rail is CLIPPED — the
 * same artifact-rail shape full-go-path gets, minus the clarify/design/plan
 * documents this mode never writes.
 * 【变更】2026-09-28 (用户问题 3): rail PARITY with full-go-path — the user
 * wants the bug-fix rail to look like the full-go one, with the stages this
 * mode skips shown as 「已裁剪」 rows instead of dropped.
 * 【变更】2026-09-30 (demo31 问题 4 · 文档类型名称与全流程一致，只是裁剪): the
 * rail is now ROW-FOR-ROW the full-go rail — proposal.md is the open artifact
 * (bug-record.md is gone), clarify/design/plan.md render clipped, and the
 * fast-path ledger keeps plan.json's slot.
 */
const BUG_FIX_ARTIFACT_ORDER = [
  BUG_FIX_PROPOSAL_FILE,
  ARTIFACT_FILES.clarify,
  ARTIFACT_FILES.design,
  ARTIFACT_FILES.plan,
  ARTIFACT_FILES.planJson,
  ARTIFACT_FILES.tasks,
  CHECKLIST_FILE,
  'verify.md',
] as const

/**
 * Full-go artifacts the bug-fix path never produces (rendered 已裁剪).
 * 【变更】2026-09-30 (demo31 问题 4): plan.md joins clarify/design — bug-fix
 * writes only the plan.json ledger at open, so the narrative plan document
 * is a clipped row too, giving the rail full-go's exact shape.
 */
const BUG_FIX_CLIPPED_FILES: ReadonlySet<string> = new Set([
  ARTIFACT_FILES.clarify,
  ARTIFACT_FILES.design,
  ARTIFACT_FILES.plan,
])

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

/**
 * 【变更】2026-09-26 (用户需求 工作流 3): the bug-fix-path open gate's pass
 * conditions — the clipped counterpart of `DOC_REQUIREMENTS_ZH.open`.
 * 【变更】2026-09-30 (demo31 问题 4): the open stage's artifact is proposal.md
 * (the clipped bug template), so the conditions name proposal.md.
 */
export const BUG_RECORD_REQUIREMENTS_ZH: readonly string[] = [
  'proposal.md 的 Root cause 节写清诊断出的根因（不是 TODO / 待定位 占位）',
  'Impact scope 节列出预期要改的文件（每行一个 - 路径，不是文字描述）',
  'Regression test 节写回归测试文件路径与可执行的运行命令',
  'plan.json（fast-path 账本）：allowlist 覆盖回归测试文件与受影响文件',
]

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
 * A placeholder-only line — the draft markers a fieldless bug-fix confirm
 * writes (`TODO` alone, or `- TODO` list items). Tolerant of the same
 * n/a / none / dash family `rootCauseRecorded` filters.
 */
const PLACEHOLDER_LINE = /^(?:-\s*)?(?:TODO\b|n\/a\b|none\b|-)$/i

/**
 * 【变更】2026-09-26 (web walk, workspace demo-bugfix): models prefill the
 * bug-fields form with vague Chinese placeholders (`待定位（疑似…）`) that are
 * neither TODO markers nor real content — the record's Root cause said nothing
 * while the gate passed it and the classify-confirm follow-up advanced into
 * implement. Lines opening with a 待-marker count as placeholders everywhere
 * the record is judged.
 */
const VAGUE_PLACEHOLDER = /^(?:-\s*)?(?:待定位|待新建|待补充|待确认|待填写|待提供|待分析|待排查|待定|TBD\b)/i

/**
 * A path-shaped value (file or directory): no whitespace, and either a file
 * extension or a trailing separator. Prose descriptions of files — the other
 * shape the demo-bugfix model used (`ecum 模块导出报表相关源文件（待定位）`) —
 * are not paths; the guard's allowlist is only as real as the paths it lists.
 */
const pathLike = (value: string): boolean =>
  value !== '' && !/\s/.test(value) && (/\.[A-Za-z0-9]{1,8}$/.test(value) || /[\\/]$/.test(value))

/** A command-shaped value: at least one multi-letter ASCII token to execute. */
const commandLike = (value: string): boolean => /[A-Za-z]{2,}/.test(value)

/** A real regression-test file path: not a placeholder, not prose. */
const realTestPath = (value: string | undefined): value is string =>
  value !== undefined && value !== ''
  && !PLACEHOLDER_LINE.test(value) && !VAGUE_PLACEHOLDER.test(value) && pathLike(value)

/**
 * The real (non-placeholder) content lines of one `## <heading>` section.
 */
function sectionRealLines(body: string, heading: string): readonly string[] {
  const section = sectionOf(body, heading)
  if (section === undefined) return []
  return section
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line =>
      line !== ''
      && !line.startsWith('#')
      && !PLACEHOLDER_LINE.test(line)
      && !VAGUE_PLACEHOLDER.test(line)
      && !/^TODO\b/.test(line))
}

/**
 * The bug record's per-section missing items (customer copy), draft-aware —
 * shared by the gate and the artifact rail row so the two can never disagree.
 * 【变更】2026-09-30 (demo31 问题 4): the record IS proposal.md now; the
 * Problem/Root cause/Impact scope/Regression test sections survive inside it.
 * @param body - the proposal.md text (bug-fix clipped template).
 * @returns one line per missing section item (empty when complete).
 */
export function bugRecordSectionMissing(body: string): readonly string[] {
  const missing: string[] = []
  if (sectionRealLines(body, 'Problem').length === 0) {
    missing.push('Problem：一句话描述 Bug 现象')
  }
  if (sectionRealLines(body, 'Root cause').length === 0) {
    missing.push('Root cause：诊断出的根因（为什么会出现这个 Bug）')
  }
  // 【变更】2026-09-26 (demo-bugfix walk): at least one Impact line must be a
  // real path — prose like「相关源文件（待定位）」describes a file without being
  // one, and the whole point of the section is feeding plan.json's allowlist.
  const impactPaths = sectionRealLines(body, 'Impact scope')
    .map(line => line.replace(/^-\s*/, ''))
    .filter(pathLike)
  if (impactPaths.length === 0) {
    missing.push('Impact scope：预期要改的文件（每行一个 - 路径）')
  }
  const regression = sectionOf(body, 'Regression test')
  const file = regression === undefined ? undefined : /^-\s*File:\s*(.+)$/m.exec(regression)?.[1]?.trim()
  const command = regression === undefined ? undefined : /^-\s*Command:\s*(.+)$/m.exec(regression)?.[1]?.trim()
  if (!realTestPath(file)) {
    missing.push('Regression test · File：回归测试文件路径')
  }
  if (command === undefined || command === '' || PLACEHOLDER_LINE.test(command)
    || VAGUE_PLACEHOLDER.test(command) || !commandLike(command)) {
    missing.push('Regression test · Command：运行回归测试的命令')
  }
  return missing
}

/**
 * 【变更】2026-09-26 (用户需求 工作流 3): the bug-fix-path open gate — the
 * counterpart of {@link proposalGate} on the clipped path. bug-fix-path used
 * to never rest on an authoring open (the 5 bug fields arrived fully formed on
 * the classify confirm); a fieldless confirm now opens a TODO draft record the
 * model completes, so THIS gate adjudicates it exactly the way proposalGate
 * adjudicates proposal.md — same shape as full-go-path, with clipping.
 * @param input - gate input (mode must be bug-fix-path; others pass).
 * @returns gate outcome with the per-item missing list.
 */
export async function bugRecordGate(input: GateInput): Promise<GateOutcome> {
  if (input.mode !== 'bug-fix-path') return ok
  const body = await readArtifact(input, BUG_FIX_PROPOSAL_FILE)
  if (body === undefined) {
    return fail(['stage_incomplete'], 'proposal.md missing', [
      'proposal.md 不存在——重新确认缺陷修复路径（/baf-workflow-classify confirm mode=bug-fix-path）生成',
    ])
  }
  const missing = [...bugRecordSectionMissing(body)]
  const plan = await readPlan(input)
  if (plan === undefined) {
    missing.push('plan.json：fast-path 账本（tasks + allowlist）缺失或不可读')
  } else {
    // 【变更】2026-09-26 (demo-bugfix walk): the ledger is judged by the same
    // path contract as the record — prose allowlist entries describe files
    // without naming them, which defeats the guard's hard gate.
    const realAllow = plan.allowlist.filter(file => pathLike(file)
      && !PLACEHOLDER_LINE.test(file) && !VAGUE_PLACEHOLDER.test(file))
    if (realAllow.length === 0) {
      missing.push('plan.json allowlist：列出回归测试文件与受影响文件（baf-guard 硬门禁依据）')
    }
    const regression = plan.tasks.find(task => task.id === REGRESSION_TASK_ID)
    const regressionFile = regression?.files?.[0]
    if (!realTestPath(regressionFile)) {
      missing.push('plan.json：regression-test 任务指到真实的回归测试文件')
    }
  }
  if (missing.length > 0) {
    return fail(['stage_incomplete'], 'proposal.md 未达完成门', missing)
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
 * 【变更】2026-09-28 (用户问题 8): the verify-ENTRY precondition — implement
 * completed is not enough; the customer must see a real checklist before the
 * verification run starts. The model authors checklist.md at the implement
 * exit (derived from the plan's verify commands + acceptance criteria); this
 * gate refuses the verify drive until it exists with at least one item, so
 * the verify-advance card the customer clicks is backed by a concrete list.
 * Applies to BOTH modes (bug-fix-path verifies too).
 * @param input - gate input.
 * @returns gate outcome with the authoring missing-list.
 */
export async function checklistGate(input: GateInput): Promise<GateOutcome> {
  const body = await readArtifact(input, CHECKLIST_FILE)
  if (body === undefined) {
    return fail(['stage_incomplete'], 'checklist.md missing', [
      'checklist.md 不存在——实现完成后、验证开始前，模型需生成检查验证项清单',
    ])
  }
  if (templateOnly(body)) {
    return fail(['stage_incomplete'], 'checklist.md is still the unfilled template', [
      '把 TODO 占位替换为逐项检查清单：每行一个 `- [ ] 检查项`',
      '检查项来源：plan.json 每个任务的 verify 命令 + 验收标准',
    ])
  }
  const status = parseChecklist(body)
  if (status.total === 0) {
    return fail(['stage_incomplete'], 'checklist.md has no checkbox items', [
      'checklist.md 至少一个 `- [ ] 检查项`（当前没有可勾选行）',
    ])
  }
  return ok
}

/**
 * 【变更】2026-09-28 (用户问题 8): gate B's hard precondition — every
 * checklist box ticked before the archive confirmation is even offered. The
 * model ticks items as verification confirms them (`- [ ]` → `- [x]`); any
 * open box holds the change at verify with the unticked items named.
 * @param input - gate input.
 * @returns gate outcome; ok only when zero open items.
 */
export async function checklistTickedGate(input: GateInput): Promise<GateOutcome> {
  const body = await readArtifact(input, CHECKLIST_FILE)
  if (body === undefined) {
    return fail(['checklist_open'], 'checklist.md missing', [
      'checklist.md 不存在——归档前必须生成并逐项勾选检查清单',
    ])
  }
  const status = parseChecklist(body)
  if (status.open.length > 0) {
    return fail(
      ['checklist_open'],
      `${status.open.length}/${status.total} checklist items unticked`,
      status.open.map(text => `未确认：${text}`),
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
    case 'clipped': return '已裁剪（缺陷修复路径不经过该阶段）'
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
  // 【变更】2026-09-26 (用户需求 工作流 3): the rail order follows the mode —
  // bug-fix-path shows its own three artifacts, not seven rows of which five
  // can never exist on this mode.
  const order: readonly string[] = input.mode === 'bug-fix-path'
    ? BUG_FIX_ARTIFACT_ORDER
    : DOC_ARTIFACT_ORDER
  for (const file of order) {
    // 【变更】2026-09-28 (用户问题 3): bug-fix parity — the full-go documents
    // this mode skips render as 「已裁剪」 rows (no disk read; no open button
    // client-side), so the rail mirrors full-go-path's shape.
    if (input.mode === 'bug-fix-path' && BUG_FIX_CLIPPED_FILES.has(file)) {
      rows.push({ file, path: `openspec/changes/${input.changeId}/${file}`, state: 'clipped', missing: [] })
      continue
    }
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
    // 【变更】2026-09-30 (demo31 问题 4): the rename made BUG_FIX_PROPOSAL_FILE
    // === 'proposal.md' — the mode guard is now LOAD-BEARING, or full-go's
    // proposal row (## Why/Impact sections) would be judged by the bug
    // template's Problem/Root cause rules and read as an unfilled template.
    if (file === BUG_FIX_PROPOSAL_FILE && input.mode === 'bug-fix-path') {
      // 【变更】2026-09-26 (用户需求 工作流 3): the bug-fix open artifact's row
      // judges by the same section rules `bugRecordGate` applies — a draft
      // record (TODO placeholders) reads 仍是未填的模板 with the per-item
      // missing list, a complete one reads 已填写. The two can never disagree
      // because they share `bugRecordSectionMissing`.
      if (body === undefined) {
        row = { file, path, state: 'missing', missing: [] }
      } else {
        const sectionMissing = bugRecordSectionMissing(body)
        row = {
          file,
          path,
          state: sectionMissing.length === 0 ? 'filled' : 'template',
          missing: sectionMissing.length === 0 ? [] : sectionMissing,
        }
      }
    } else if (file === 'verify.md') {
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
    } else if (file === CHECKLIST_FILE) {
      // 【变更】2026-09-28 (用户问题 8): checklist.md 的四态状态机（与 tasks.md
      // 同构）—— 尚未生成 → 仍是未填的模板 → 已计划（清单已生成、验证未全部
      // 确认）→ 已填写（全部 `- [x]` 勾选，归档门放行）。
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
        const parsed = parseChecklist(body)
        if (parsed.total === 0) {
          row = { file, path, state: 'template', missing: ['没有 `- [ ] 检查项`——每行一个检查项'] }
        } else {
          const allTicked = parsed.open.length === 0
          row = {
            file,
            path,
            state: allTicked ? 'filled' : 'planned',
            missing: allTicked
              ? []
              : [`验证阶段逐项确认打勾（剩 ${parsed.open.length}/${parsed.total} 项）`],
          }
        }
      }
    } else if (file === ARTIFACT_FILES.planJson) {
      const plan = body === undefined ? undefined : await readPlan(input)
      // 【变更】2026-09-26 (用户需求 工作流 3): a fast-path draft ledger (every
      // file entry still the TODO placeholder) reads as the template it is —
      // the rail must not call a draft 已填写.
      const draftLedger = plan !== undefined
        && (plan.allowlist.length === 0 || plan.allowlist.every(file => PLACEHOLDER_LINE.test(file)))
        && plan.tasks.every(task => (task.files ?? []).every(file => PLACEHOLDER_LINE.test(file)))
      row = plan === undefined
        ? { file, path, state: 'missing', missing: [] }
        : draftLedger
          ? { file, path, state: 'template', missing: ['fast-path 账本仍是 TODO 草稿——根因/影响文件/回归测试补齐后变为已填写'] }
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
