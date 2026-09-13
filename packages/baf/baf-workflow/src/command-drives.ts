/**
 * Workspace-bound BAF command drives (§12 Phase 8.1/8.2): one shared surface
 * behind slash commands and the CLI. Each drive resolves the workspace's
 * projection/baseline/git facts, calls the same `WorkflowService` /
 * `StagePipeline` domain layer the Tab uses, and renders the structured
 * result through {@link formatCommandReport} — so every entry surface prints
 * identical text for identical state (§12 Phase 8.5).
 *
 * Adapters that live in sibling packages (`baf-quality`, `baf-guard`) are
 * injected by the caller: slash resolves them through the mounted services,
 * the CLI composes them directly. This package only knows the
 * `StackAdapter`/`GuardPolicy` contracts.
 * @module @deepseek-ai/dsh-baf-workflow/command-drives
 */

import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import {
  isBafError,
  loadBaselineFile,
  type BaselineManifest,
  type GuardPolicy,
  type StackAdapter,
  type WorkflowStatus,
} from '@deepseek-ai/dsh-baf-core'
import { ProjectionStore } from './projection.ts'
import { StagePipeline } from './stages/pipeline.ts'
import { confirmIntake, createWorkflowService, rejectIntake } from './workflow-service.ts'
import { readLedger } from './stages/implement.ts'
import { formatCommandReport, modeZh } from './command-format.ts'
import { parseArgs, valueOf, valuesOf } from './cli-args.ts'

const execFileAsync = promisify(execFile)

/** Workspace convention for the governing baseline (same path baf-guard reads). */
export const WORKSPACE_BASELINE_PATH = '.baf/baseline.yml'

/** Optional sibling-package adapters the caller wires into verify/quality/guard. */
export interface DriveAdapters {
  readonly stack?: StackAdapter
  readonly guard?: GuardPolicy
}

/**
 * Load the workspace's governing baseline.
 * @param cwd - absolute workspace root.
 * @returns parsed baseline, or undefined when absent/unparseable.
 */
export async function loadWorkspaceBaseline(cwd: string): Promise<BaselineManifest | undefined> {
  try {
    return await loadBaselineFile(join(cwd, WORKSPACE_BASELINE_PATH))
  } catch {
    return undefined
  }
}

/**
 * Current Git revision of the workspace, if any.
 * @param cwd - absolute workspace root.
 * @returns `git rev-parse HEAD` output, or undefined when Git is unavailable.
 */
export async function gitRevisionOf(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd, timeout: 10_000 })
    return stdout.trim() === '' ? undefined : stdout.trim()
  } catch {
    return undefined
  }
}

/**
 * Build the stage pipeline bound to a workspace.
 * @param cwd - absolute workspace root.
 * @param adapters - optional stack/guard adapters for verify wiring.
 * @returns pipeline with baseline and git facts resolved.
 */
export async function pipelineFor(cwd: string, adapters: DriveAdapters = {}): Promise<StagePipeline> {
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const baseline = await loadWorkspaceBaseline(cwd)
  const gitRevision = await gitRevisionOf(cwd)
  return new StagePipeline({
    store,
    workspaceRoot: cwd,
    ...(gitRevision === undefined ? {} : { gitRevision }),
    ...(baseline === undefined ? {} : { baseline }),
    ...(adapters.stack === undefined ? {} : { stack: adapters.stack }),
    ...(adapters.guard === undefined ? {} : { guard: adapters.guard }),
  })
}

/** Outcome of resolving the change a command addresses. */
type ChangeResolution =
  | { readonly kind: 'ok'; readonly changeId: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly string[] }

function resolveChange(index: { changes: readonly { changeId: string; current: string; updatedAt: string }[] }, explicit?: string): ChangeResolution {
  if (explicit !== undefined) {
    return index.changes.some(c => c.changeId === explicit)
      ? { kind: 'ok', changeId: explicit }
      : { kind: 'none' }
  }
  const actives = index.changes.filter(c => c.current !== 'completed' && c.current !== 'abandoned')
  if (actives.length === 0) return { kind: 'none' }
  if (actives.length > 1) return { kind: 'ambiguous', candidates: actives.map(c => `${c.changeId} · ${String(c.current)}`) }
  const first = actives[0]
  if (first === undefined) return { kind: 'none' }
  return { kind: 'ok', changeId: first.changeId }
}

/**
 * Render a domain failure as the stable error card.
 * @param command - command label for the headline.
 * @param error - thrown value.
 * @returns error CommandResult.
 */
export function renderDomainError(command: string, error: unknown): CommandResult {
  if (isBafError(error)) {
    return {
      kind: 'error',
      text: formatCommandReport(false, `${command} · ${error.code}`, [
        {
          title: '原因',
          lines: [
            error.message,
            ...(Array.isArray(error.details) ? [] : typeof error.details === 'object' && error.details !== null
              ? [`details: ${JSON.stringify(error.details)}`]
              : []),
          ],
        },
        { title: '处理', lines: ['按原因补齐后重试；查看 /baf-status 与「工作流」页签'] },
      ]),
    }
  }
  return {
    kind: 'error',
    text: formatCommandReport(false, `${command} · 失败`, [
      { title: '原因', lines: [error instanceof Error ? error.message : String(error)] },
    ]),
  }
}

function statusLines(status: WorkflowStatus): string[] {
  return [
    `change: ${status.changeId}`,
    `mode: ${status.mode}（${modeZh(status.mode)}）`,
    `current: ${String(status.current)}`,
    `projection: v${status.projectionVersion}`,
  ]
}

/**
 * `/baf-open <描述>` — run the intake classifier (T1).
 * @param cwd - workspace root.
 * @param rawInput - free-form change description.
 * @returns classification card.
 */
export async function driveOpen(cwd: string, rawInput: string): Promise<CommandResult> {
  const description = rawInput.trim()
  if (description === '') {
    return {
      kind: 'error',
      text: formatCommandReport(false, '/baf-open · 缺少描述', [
        { title: '用法', lines: ['/baf-open <需求或 Bug 描述>'] },
      ]),
    }
  }
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const baseline = await loadWorkspaceBaseline(cwd)
  const service = createWorkflowService({ store })
  const { intake } = await service.intake({
    description,
    workspace: { root: cwd },
    ...(baseline === undefined ? {} : { baseline }),
  })
  return {
    kind: 'success',
    text: formatCommandReport(
      true,
      `/baf-open · 分类完成 · ${modeZh(intake.mode)}`,
      [
        {
          title: '分类卡',
          lines: [
            `change: ${intake.changeId}`,
            `kind: ${intake.kind}`,
            `mode: ${intake.mode}`,
            `affectedScope: ${intake.affectedScope}`,
            `confidence: ${intake.confidence.toFixed(2)}`,
            `openspecRequired: ${String(intake.openspecRequired)}`,
            `reasonCodes: ${intake.reasonCodes.join(', ') || '（无）'}`,
          ],
        },
        {
          title: '下一步',
          lines: [
            `确认：/baf-classify confirm${intake.mode === 'bug-fast-path' ? ' problem=… root-cause=… file=… test=… test-cmd=…' : ' title=…'}`,
            '拒绝：/baf-classify reject',
          ],
        },
      ],
    ),
  }
}

/**
 * `/baf-classify [confirm|reject]` — confirm/reject pending intake and open (T2/T3).
 * @param cwd - workspace root.
 * @param rawInput - subcommand plus optional key=value fields.
 * @returns result card.
 */
export async function driveClassify(cwd: string, rawInput: string): Promise<CommandResult> {
  const args = parseArgs(rawInput)
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const index = await store.readIndex()
  const explicit = valueOf(args, 'change')
  const resolution = resolveChange(index, explicit)
  if (resolution.kind === 'none') {
    return {
      kind: 'error',
      text: formatCommandReport(false, '/baf-classify · 无此变更', [
        { title: '当前工作区变更', lines: index.changes.length === 0 ? ['（无）— 先 /baf-open <描述>'] : index.changes.map(c => `${c.changeId} · ${String(c.current)}`) },
      ]),
    }
  }
  if (resolution.kind === 'ambiguous') {
    return {
      kind: 'error',
      text: formatCommandReport(false, '/baf-classify · 多个活动变更，需显式指定', [
        { title: '候选', lines: resolution.candidates.map(c => `- ${c}`) },
        { title: '用法', lines: ['/baf-classify confirm change=<changeId> …'] },
      ]),
    }
  }
  const changeId = resolution.changeId

  if (args.positionals.includes('reject')) {
    await rejectIntake(store, changeId)
    return {
      kind: 'success',
      text: formatCommandReport(true, `/baf-classify · 已拒绝 ${changeId}`, [
        { title: '状态', lines: ['intake 被拒绝，change 进入已放弃（审计保留）'] },
      ]),
    }
  }

  if (!args.positionals.includes('confirm')) {
    const status = await store.readStatus(changeId)
    const intake = status.intake
    return {
      kind: 'success',
      text: formatCommandReport(true, `/baf-classify · ${changeId} 当前分类`, [
        {
          title: '分类卡',
          lines: intake === undefined
            ? ['（无 intake 记录）']
            : [
              `kind: ${intake.kind}`,
              `mode: ${intake.mode}`,
              `confirmation: ${intake.confirmation}`,
              `reasonCodes: ${intake.reasonCodes.join(', ') || '（无）'}`,
            ],
        },
        { title: '用法', lines: ['/baf-classify confirm [字段…]', '/baf-classify reject'] },
      ]),
    }
  }

  const status = await confirmIntake(store, changeId, 'user')
  if (status.current !== 'intake') {
    return {
      kind: 'success',
      text: formatCommandReport(true, `/baf-classify · ${changeId} 已确认并进入 ${String(status.current)}`, [
        { title: '状态', lines: statusLines(status) },
      ]),
    }
  }

  const pipeline = await pipelineFor(cwd)
  if (status.mode === 'bug-fast-path') {
    const problem = valueOf(args, 'problem')
    const rootCause = valueOf(args, 'root-cause')
    const files = valuesOf(args, 'file')
    const test = valueOf(args, 'test')
    const testCmd = valueOf(args, 'test-cmd')
    const missing = [
      ...(problem === undefined ? ['problem'] : []),
      ...(rootCause === undefined ? ['root-cause'] : []),
      ...(files.length === 0 ? ['file'] : []),
      ...(test === undefined ? ['test'] : []),
      ...(testCmd === undefined ? ['test-cmd'] : []),
    ]
    if (missing.length > 0) {
      return {
        kind: 'error',
        text: formatCommandReport(false, '/baf-classify · fast-path 缺少 Bug 字段', [
          { title: '缺少', lines: missing.map(m => `- ${m}`) },
          {
            title: '用法',
            lines: [
              '/baf-classify confirm problem="现象" root-cause="根因" \\',
              '  file=src/a.c file=tests/x.c test=tests/x.c test-cmd="ctest -R x"',
            ],
          },
        ]),
      }
    }
    await pipeline.driveFastPathOpenStage({
      changeId,
      title: valueOf(args, 'title') ?? status.intake?.summary ?? changeId,
      problem: problem as string,
      rootCause: rootCause as string,
      affectedFiles: files,
      regressionTest: { file: test as string, command: testCmd as string },
    })
  } else {
    if (pipeline.context().baseline === undefined) {
      return {
        kind: 'error',
        text: formatCommandReport(false, '/baf-classify · baseline_unavailable', [
          { title: '原因', lines: [`工作区缺少可解析的 ${WORKSPACE_BASELINE_PATH}`] },
          { title: '处理', lines: ['先初始化工作区基线（baf-scaffold / 企业基线包）再确认 full-go'] },
        ]),
      }
    }
    await pipeline.driveOpenStage(changeId, valueOf(args, 'title') ?? status.intake?.summary ?? changeId)
  }
  const after = await store.readStatus(changeId)
  return {
    kind: 'success',
    text: formatCommandReport(true, `/baf-classify · 已确认并进入 open · ${modeZh(after.mode)}`, [
      { title: '状态', lines: statusLines(after) },
      ...(after.mode === 'bug-fast-path'
        ? [{ title: 'fast-path', lines: ['bug-record.md 与回归测试台账已建立', '下一步：/baf-implement（先写回归测试）'] } as const]
        : [{ title: '下一步', lines: ['clarify：/baf-clarify（或页签）', '分类卡与产物在 openspec/changes/ 下'] } as const]),
    ]),
  }
}

/** Shared begin/done/args handling for the three documentation stages. */
async function driveDocStage(
  command: string,
  cwd: string,
  rawInput: string,
  node: 'clarify' | 'design' | 'plan',
): Promise<CommandResult> {
  const args = parseArgs(rawInput)
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const index = await store.readIndex()
  const resolution = resolveChange(index, valueOf(args, 'change'))
  if (resolution.kind !== 'ok') {
    return {
      kind: 'error',
      text: formatCommandReport(false, `${command} · 无活动变更`, [
        { title: '处理', lines: ['先 /baf-open <描述> 并 /baf-classify confirm'] },
      ]),
    }
  }
  const changeId = resolution.changeId
  const pipeline = await pipelineFor(cwd)

  if (args.positionals.includes('done')) {
    const status = await pipeline.completeDocStage(changeId, node)
    return {
      kind: 'success',
      text: formatCommandReport(true, `${command} · ${node} 完成裁决通过 · 当前 ${String(status.current)}`, [
        { title: '状态', lines: statusLines(status) },
      ]),
    }
  }

  const structured = node === 'clarify' ? structuredClarify(changeId, args) : structuredDesign(changeId, args)
  if (structured !== undefined) {
    const drive = node === 'clarify'
      ? await pipeline.driveClarifyStage(structured as Parameters<typeof pipeline.driveClarifyStage>[0])
      : await pipeline.driveDesignStage(structured as Parameters<typeof pipeline.driveDesignStage>[0])
    if (drive.node !== node) return renderDomainError(command, new Error(`unexpected drive node: ${drive.node}`))
    return {
      kind: 'success',
      text: formatCommandReport(true, `${command} · ${node} 产物写入并完成 · 当前 ${String(drive.status.current)}`, [
        { title: '产物', lines: drive.result.artifacts },
      ]),
    }
  }

  const status = await pipeline.beginDocStage(changeId, node)
  return {
    kind: 'success',
    text: formatCommandReport(true, `${command} · ${node} 已进入 · 模板已安装`, [
      { title: '状态', lines: statusLines(status) },
      {
        title: '接下来',
        lines: [
          `模型在会话中回答模板 TODO（写入 openspec/changes/${changeId}/ 的文档受硬门禁保护）`,
          `完成后：${command} done`,
        ],
      },
    ]),
  }
}

function structuredClarify(changeId: string, args: ReturnType<typeof parseArgs>) {
  const questions = valuesOf(args, 'q')
  const answers = valuesOf(args, 'a')
  const criteria = valuesOf(args, 'crit')
  if (questions.length === 0 && answers.length === 0 && criteria.length === 0) return undefined
  return {
    changeId,
    questions: questions.map((question, i) => ({
      question,
      answer: answers[i] ?? 'deferred: 未提供（用户补填）',
      status: 'decided' as const,
    })),
    acceptanceCriteria: criteria,
    nonGoals: valuesOf(args, 'ngoal'),
  }
}

function structuredDesign(changeId: string, args: ReturnType<typeof parseArgs>) {
  const approach = valueOf(args, 'approach')
  const references = valuesOf(args, 'ref')
  if (approach === undefined && references.length === 0) return undefined
  return {
    changeId,
    approach: approach ?? 'TODO: chosen approach.',
    references,
    risks: valuesOf(args, 'risk'),
  }
}

/**
 * `/baf-clarify [done | q=… a=… crit=…]` — N2 drive.
 * @param cwd - workspace root.
 * @param rawInput - subcommand/fields.
 * @returns result card.
 */
export async function driveClarify(cwd: string, rawInput: string): Promise<CommandResult> {
  return driveDocStage('/baf-clarify', cwd, rawInput, 'clarify')
}

/**
 * `/baf-design [done | approach=… ref=…]` — N3 drive.
 * @param cwd - workspace root.
 * @param rawInput - subcommand/fields.
 * @returns result card.
 */
export async function driveDesign(cwd: string, rawInput: string): Promise<CommandResult> {
  return driveDocStage('/baf-design', cwd, rawInput, 'design')
}

/**
 * `/baf-plan [done]` — N4 drive (tasks are authored in plan.md/plan.json).
 * @param cwd - workspace root.
 * @param rawInput - subcommand/fields.
 * @returns result card.
 */
export async function drivePlan(cwd: string, rawInput: string): Promise<CommandResult> {
  return driveDocStage('/baf-plan', cwd, rawInput, 'plan')
}

/**
 * `/baf-implement [done]` — N5 entry (T5/T8) and completion (T9 + T15 precheck).
 * @param cwd - workspace root.
 * @param rawInput - subcommand.
 * @returns result card.
 */
export async function driveImplement(cwd: string, rawInput: string): Promise<CommandResult> {
  const args = parseArgs(rawInput)
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const index = await store.readIndex()
  const resolution = resolveChange(index, valueOf(args, 'change'))
  if (resolution.kind !== 'ok') {
    return {
      kind: 'error',
      text: formatCommandReport(false, '/baf-implement · 无活动变更', [
        { title: '处理', lines: ['先 /baf-open 并 /baf-classify confirm'] },
      ]),
    }
  }
  const pipeline = await pipelineFor(cwd)
  if (args.positionals.includes('done')) {
    const result = await pipeline.driveImplementStage(resolution.changeId)
    if (result.node === 'implement' && result.result.escalated !== undefined) {
      const status = await store.readStatus(resolution.changeId)
      return {
        kind: 'success',
        text: formatCommandReport(true, '/baf-implement · T15 已升级 full-go · 当前 clarify', [
          { title: '原因', lines: [result.result.escalated.cause] },
          { title: '状态', lines: statusLines(status) },
          { title: '下一步', lines: ['/baf-clarify → /baf-design → /baf-plan 补走'] },
        ]),
      }
    }
    const status = await store.readStatus(resolution.changeId)
    return {
      kind: 'success',
      text: formatCommandReport(true, `/baf-implement · 实现完成 · 当前 ${String(status.current)}`, [
        { title: '状态', lines: statusLines(status) },
        { title: '下一步', lines: ['/baf-verify'] },
      ]),
    }
  }
  const status = await pipeline.enterImplementStage(resolution.changeId)
  return {
    kind: 'success',
    text: formatCommandReport(true, `/baf-implement · 已进入实现 · 当前 ${String(status.current)}`, [
      { title: '状态', lines: statusLines(status) },
      {
        title: '纪律',
        lines: [
          'bug-fast-path：必须先写回归测试（recordTouched 顺序强制）',
          '只允许修改 plan.json allowlist 内文件（baf-guard 硬门禁）',
          '完成后：/baf-implement done',
        ],
      },
    ]),
  }
}

/**
 * `/baf-verify` — N6 (T9 entry, check run, T10/T11 verdict).
 * @param cwd - workspace root.
 * @param rawInput - subcommand.
 * @param adapters - optional stack/guard wiring from the mounted services.
 * @returns result card.
 */
export async function driveVerify(cwd: string, rawInput: string, adapters: DriveAdapters = {}): Promise<CommandResult> {
  const args = parseArgs(rawInput)
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const index = await store.readIndex()
  const resolution = resolveChange(index, valueOf(args, 'change'))
  if (resolution.kind !== 'ok') {
    return {
      kind: 'error',
      text: formatCommandReport(false, '/baf-verify · 无活动变更', [
        { title: '处理', lines: ['先推进到 implement 完成：/baf-implement done'] },
      ]),
    }
  }
  const pipeline = await pipelineFor(cwd, adapters)
  const result = await pipeline.driveVerifyStage(resolution.changeId)
  if (result.node !== 'verify') return renderDomainError('/baf-verify', new Error('unexpected drive result'))
  const rows = result.result.report.checks
    .map(row => `${row.ok ? '✓' : '✗'} ${row.name}${row.required ? '' : '（非必需）'} — ${row.diagnostics.join('; ')}`)
  const status = await store.readStatus(resolution.changeId)
  if (result.result.backToImplement) {
    return {
      kind: 'error',
      text: formatCommandReport(false, '/baf-verify · 必需检查失败 · T11 回实现', [
        { title: '检查', lines: rows },
        { title: '报告', lines: [result.result.reportPath] },
        { title: '下一步', lines: ['修复后 /baf-implement → /baf-implement done → /baf-verify'] },
      ]),
    }
  }
  return {
    kind: 'success',
    text: formatCommandReport(true, `/baf-verify · 全部必需检查通过 · 当前 ${String(status.current)}`, [
      { title: '检查', lines: rows },
      { title: '报告', lines: [result.result.reportPath] },
      { title: '下一步', lines: ['/baf-archive confirm'] },
    ]),
  }
}

/**
 * `/baf-archive confirm` — N7 (T14) with explicit human confirmation.
 * @param cwd - workspace root.
 * @param rawInput - must contain `confirm`.
 * @returns result card.
 */
export async function driveArchive(cwd: string, rawInput: string): Promise<CommandResult> {
  const args = parseArgs(rawInput)
  if (!args.positionals.includes('confirm')) {
    return {
      kind: 'error',
      text: formatCommandReport(false, '/baf-archive · 需要人工确认', [
        { title: '用法', lines: ['/baf-archive confirm'] },
      ]),
    }
  }
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const index = await store.readIndex()
  const resolution = resolveChange(index, valueOf(args, 'change'))
  if (resolution.kind !== 'ok') {
    return {
      kind: 'error',
      text: formatCommandReport(false, '/baf-archive · 无活动变更', []),
    }
  }
  const pipeline = await pipelineFor(cwd)
  await pipeline.driveArchiveStage(resolution.changeId, true)
  const status = await store.readStatus(resolution.changeId)
  return {
    kind: 'success',
    text: formatCommandReport(true, `/baf-archive · 已归档 · ${status.changeId}`, [
      { title: '状态', lines: [`terminal: ${String(status.terminal)}`] },
    ]),
  }
}

/**
 * `/baf-abandon confirm` — T16 with explicit human confirmation.
 * @param cwd - workspace root.
 * @param rawInput - must contain `confirm`.
 * @returns result card.
 */
export async function driveAbandon(cwd: string, rawInput: string): Promise<CommandResult> {
  const args = parseArgs(rawInput)
  if (!args.positionals.includes('confirm')) {
    return {
      kind: 'error',
      text: formatCommandReport(false, '/baf-abandon · 需要人工确认', [
        { title: '用法', lines: ['/baf-abandon confirm'] },
      ]),
    }
  }
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const index = await store.readIndex()
  const resolution = resolveChange(index, valueOf(args, 'change'))
  if (resolution.kind !== 'ok') {
    return {
      kind: 'error',
      text: formatCommandReport(false, '/baf-abandon · 无活动变更', []),
    }
  }
  const pipeline = await pipelineFor(cwd)
  await pipeline.driveAbandonStage({ changeId: resolution.changeId, humanConfirmed: true })
  const status = await store.readStatus(resolution.changeId)
  return {
    kind: 'success',
    text: formatCommandReport(true, `/baf-abandon · 已放弃 · ${status.changeId}`, [
      { title: '状态', lines: [`terminal: ${String(status.terminal)}`, '审计与产物保留'] },
    ]),
  }
}

/**
 * `/baf-quality` — run the baseline's C-stack checks outside the verify gate.
 * @param cwd - workspace root.
 * @param adapters - must carry a stack adapter (resolved by the entry surface).
 * @returns quality report card.
 */
export async function driveQuality(cwd: string, adapters: DriveAdapters): Promise<CommandResult> {
  if (adapters.stack === undefined) {
    return {
      kind: 'error',
      text: formatCommandReport(false, '/baf-quality · quality 服务未挂载', [
        { title: '原因', lines: ['当前 composition 未安装 baf-quality（StackAdapter 不可用）'] },
      ]),
    }
  }
  const baseline = await loadWorkspaceBaseline(cwd)
  if (baseline === undefined) {
    return {
      kind: 'error',
      text: formatCommandReport(false, '/baf-quality · baseline_unavailable', [
        { title: '原因', lines: [`工作区缺少可解析的 ${WORKSPACE_BASELINE_PATH}`] },
      ]),
    }
  }
  const report = await adapters.stack.runQuality(
    { workspace: { root: cwd }, baseline, changeId: 'adhoc' },
    new AbortController().signal,
  )
  const rows = report.checks.map(check => {
    const row = check as { id?: unknown; passed?: unknown; reasonCode?: unknown }
    const id = typeof row.id === 'string' ? row.id : String(row.id ?? '?')
    const passed = Boolean(row.passed)
    const reason = typeof row.reasonCode === 'string' ? row.reasonCode : 'ok'
    return `${passed ? '✓' : '✗'} ${id} — ${reason}`
  })
  return {
    kind: report.passed ? 'success' : 'error',
    text: formatCommandReport(report.passed, `/baf-quality · ${report.passed ? '通过' : '未通过'} · ${report.baselineId}`, [
      { title: '检查', lines: rows },
      { title: '工具版本', lines: Object.entries(report.toolVersions).map(([tool, version]) => `${tool}: ${version}`) },
      ...(report.diagnostics.length === 0 ? [] : [{ title: '诊断', lines: report.diagnostics } as const]),
    ]),
  }
}

/**
 * `/baf-guard` — run the guard policy (verify + secret-scan) over touched files.
 * @param cwd - workspace root.
 * @param adapters - must carry a guard policy (resolved by the entry surface).
 * @returns guard report card.
 */
export async function driveGuard(cwd: string, adapters: DriveAdapters): Promise<CommandResult> {
  if (adapters.guard === undefined) {
    return {
      kind: 'error',
      text: formatCommandReport(false, '/baf-guard · guard 服务未挂载', [
        { title: '原因', lines: ['当前 composition 未安装 baf-guard（GuardPolicy 不可用）'] },
      ]),
    }
  }
  const baseline = await loadWorkspaceBaseline(cwd)
  if (baseline === undefined) {
    return {
      kind: 'error',
      text: formatCommandReport(false, '/baf-guard · baseline_unavailable', [
        { title: '原因', lines: [`工作区缺少可解析的 ${WORKSPACE_BASELINE_PATH}`] },
      ]),
    }
  }
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const index = await store.readIndex()
  const resolution = resolveChange(index)
  let paths: string[] = []
  if (resolution.kind === 'ok') {
    try {
      paths = [...(await readLedger(cwd, resolution.changeId)).touched]
    } catch {
      paths = []
    }
  }
  const signal = new AbortController().signal
  const verifyReport = await adapters.guard.check({ workspace: { root: cwd }, baseline, paths, action: 'verify' }, signal)
  const secretReport = await adapters.guard.check({ workspace: { root: cwd }, baseline, paths, action: 'secret-scan' }, signal)
  const ok = verifyReport.allowed && secretReport.allowed
  return {
    kind: ok ? 'success' : 'error',
    text: formatCommandReport(ok, `/baf-guard · ${ok ? '通过' : '拒绝'}`, [
      { title: 'verify', lines: verifyReport.reasonCodes.length === 0 ? ['within policy'] : verifyReport.reasonCodes },
      { title: 'secret-scan', lines: secretReport.reasonCodes.length === 0 ? ['no secrets detected'] : secretReport.reasonCodes },
      { title: '受检文件', lines: paths.length === 0 ? ['（无 touched 记录）'] : paths },
    ]),
  }
}
