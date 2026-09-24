/**
 * 【变更】2026-09-23 (demo1 五问题 1–3): plan.json 账本的宽容解析。
 *
 * 事故形态（demo/demo1 会话 seq 199–238）：模板装的是空数组、工单文案说
 * 「缺 affected files / verify 命令 / rollback 点」，模型据此写
 * `affected_files` / `verify_cmd` / `rollback_point`（snake_case）——而裁决门
 * 只认 `files` / `verify` / `rollback`（camelCase 短名）。门永远报缺、工单
 * 永远重派同样的缺口、流程死循环卡在 plan。模板、工单措辞、门的缺失清单
 * 三处都在暗示读者不认的键名。
 *
 * 修复立场：**读者宽容**。模型写哪个合理的拼法都算数（数组/字符串都收），
 * 同时模板带 `_schema` 自述、措辞引用规范键名。规范键仍是
 * `files` / `verify` / `rollback`（PlanTaskInput 的合同）。
 *
 * @module @deepseek-ai/dsh-baf-workflow/stages/plan-ledger
 */

/** A normalized plan.json task row (the canonical shape every reader judges). */
export interface PlanTaskRow {
  readonly id?: string
  readonly title?: string
  readonly files: readonly string[]
  readonly verify: readonly string[]
  readonly rollback: string
  readonly done?: boolean
}

/** A normalized plan.json document. */
export interface PlanLedger {
  /** True for the bug fast-path ledger written at fast-path open (pass-through). */
  readonly bugFixPath?: boolean
  readonly tasks: readonly PlanTaskRow[]
  readonly allowlist: readonly string[]
  readonly touched: readonly string[]
}

/** Alias keys one task row may carry, by canonical field. */
const TASK_ALIASES: Readonly<Record<'files' | 'verify' | 'rollback' | 'done', readonly string[]>> = {
  files: ['files', 'affected_files', 'affectedFiles', 'affectedfiles', 'files_to_change'],
  verify: ['verify', 'verify_cmd', 'verifyCmd', 'verify_command', 'verifyCommands', 'verify_commands'],
  rollback: ['rollback', 'rollback_point', 'rollbackPoint', 'rollbackpoint', 'rollback_points'],
  done: ['done', 'is_done', 'isDone'],
}

/** Alias keys the document top level may carry. */
const DOC_ALIASES: Readonly<Record<'tasks' | 'allowlist' | 'touched', readonly string[]>> = {
  tasks: ['tasks'],
  allowlist: ['allowlist', 'allow_list', 'allowList', 'allowed_files'],
  touched: ['touched', 'touched_files'],
}

/** Coerce one raw value into a string list (string → single-element list). */
function toStringList(value: unknown): readonly string[] | undefined {
  if (typeof value === 'string') return value.trim() === '' ? [] : [value.trim()]
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
  return undefined
}

/** Read the first present alias off one raw record. */
function firstOf(raw: Record<string, unknown>, aliases: readonly string[]): unknown {
  for (const key of aliases) {
    if (raw[key] !== undefined && raw[key] !== null) return raw[key]
  }
  return undefined
}

/** Normalize one raw task row into the canonical shape. */
export function normalizeTaskRow(raw: unknown): PlanTaskRow {
  const record = (raw ?? {}) as Record<string, unknown>
  const files = toStringList(firstOf(record, TASK_ALIASES.files)) ?? []
  const verify = toStringList(firstOf(record, TASK_ALIASES.verify)) ?? []
  const rollbackRaw = firstOf(record, TASK_ALIASES.rollback)
  const idRaw = record.id ?? record.task_id ?? record.taskId
  const titleRaw = record.title ?? record.name ?? record.summary
  const doneRaw = firstOf(record, TASK_ALIASES.done)
  return {
    ...(typeof idRaw === 'string' && idRaw !== '' ? { id: idRaw } : {}),
    ...(typeof titleRaw === 'string' && titleRaw !== '' ? { title: titleRaw } : {}),
    files,
    verify,
    rollback: typeof rollbackRaw === 'string' ? rollbackRaw : '',
    ...(typeof doneRaw === 'boolean' ? { done: doneRaw } : {}),
  }
}

/**
 * Normalize one parsed plan.json document. Unknown top-level keys（如模板自述
 * `_schema`）被丢弃；tasks/allowlist 缺失或非数组时返回 undefined——这是
 * 「文档没有账本结构」的判断，与「字段缺失」不同层。
 * @param parsed - the JSON.parse result of plan.json.
 * @returns the normalized ledger, or undefined when the shape is not a ledger.
 */
export function normalizePlanLedger(parsed: unknown): PlanLedger | undefined {
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const record = parsed as Record<string, unknown>
  const tasksRaw = firstOf(record, DOC_ALIASES.tasks)
  const allowlistRaw = firstOf(record, DOC_ALIASES.allowlist)
  if (!Array.isArray(tasksRaw) || !Array.isArray(allowlistRaw)) return undefined
  const touchedRaw = firstOf(record, DOC_ALIASES.touched)
  const bugFixPathRaw = record.bugFixPath ?? record.bug_fix_path ?? record.bugFix
  return {
    tasks: tasksRaw.map(normalizeTaskRow),
    allowlist: (allowlistRaw as unknown[]).filter((v): v is string => typeof v === 'string'),
    touched: Array.isArray(touchedRaw)
      ? (touchedRaw as unknown[]).filter((v): v is string => typeof v === 'string')
      : [],
    ...(bugFixPathRaw === true ? { bugFixPath: true } : {}),
  }
}

/**
 * Parse one plan.json body defensively.
 * @param raw - the file body.
 * @returns the normalized ledger, or undefined when unparseable / not a ledger.
 */
export function parsePlanLedger(raw: string): PlanLedger | undefined {
  try {
    return normalizePlanLedger(JSON.parse(raw))
  } catch {
    return undefined
  }
}

/** The `_schema` self-description the installed template carries (models read it). */
export const PLAN_SCHEMA_HINT = '每个任务：{ "id": "T01-…", "title": "…", "files": ["改哪些文件"], "verify": ["验证命令"], "rollback": "回退点", "done": false }；顶层 "allowlist": ["实施允许改的全部文件"]。键名也认 affected_files / verify_cmd / rollback_point 等别名。'
