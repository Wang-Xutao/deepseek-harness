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

import type { CommandResult } from '@deepseek-ai/dsh-commands'
import {
  isBafError,
  type TransitionSource,
  type WorkflowNode,
  type WorkflowStatus,
} from '@deepseek-ai/dsh-baf-core'
import { pickActiveChange, ProjectionStore, type ProjectionIndexEntry } from './projection.ts'
import { rerunChain } from './stages/drift.ts'
import { GATE_REGISTRY, type GateOptionSpec, type GateSpec } from './gate-cards.ts'
import { confirmIntake, createWorkflowService, rejectIntake, setIntakeMode } from './workflow-service.ts'
import { driveGo } from './go-coordinator.ts'
import { readLedger } from './stages/implement.ts'
import { formatCommandReport, modeZh } from './command-format.ts'
import { parseArgs, valueOf, valuesOf } from './cli-args.ts'
import {
  WORKSPACE_BASELINE_PATH,
  loadWorkspaceBaseline,
  pipelineFor,
  type DriveAdapters,
} from './pipeline-factory.ts'

// Every drive below resolves its pipeline through the shared factory so the
// slash, CLI and Tab surfaces drive a change under identical workspace facts.
export {
  WORKSPACE_BASELINE_PATH,
  gitRevisionOf,
  loadWorkspaceBaseline,
  pipelineFor,
  type DriveAdapters,
  type ScaffoldAdapter,
  type ScaffoldAdapterOptions,
  type ScaffoldAdapterOutcome,
} from './pipeline-factory.ts'

/** Slash → description map (mirrors the descriptors in `commands.ts`). */
const SLASH_DESC: Record<string, string> = {
  '/baf-go': '自动驱动到下一个客户确认点 · ★★★',
  '/baf-workflow-open': '启动变更：intake 分类 · ★★★',
  '/baf-workflow-classify': '分类确认 / 拒绝 · ★★',
  '/baf-workflow-clarify': '澄清阶段（N2） · ★★',
  '/baf-workflow-design': '设计阶段（N3） · ★★',
  '/baf-workflow-plan': '计划阶段（N4） · ★★',
  '/baf-workflow-implement': '实现阶段（N5 进入/完成） · ★★★',
  '/baf-workflow-verify': '验证阶段（N6） · ★★★',
  '/baf-workflow-archive': '归档变更（N7/T14，需 confirm） · ★★★',
  '/baf-workflow-abandon': '放弃变更（T16，需 confirm） · ★',
  '/baf-workflow-resume': 'drift 复位（T13，需选目标节点） · ★★★',
  '/baf-check-quality': '基线 C 栈质量检查 · ★★',
  '/baf-check-guard': '安全门禁（verify + secret-scan） · ★★',
  '/baf-scaffold': '初始化工作区（scaffold） · ★★（与 §22 scaffold 门同源）',
}

/**
 * Build a slash-command card title from its description + optional runtime info.
 * @param slash - slash command name (must have a {@link SLASH_DESC} row).
 * @param runtime - optional runtime qualifier (change id, outcome, …).
 * @returns rendered card title.
 */
export function cardTitle(slash: string, runtime?: string): string {
  const desc = SLASH_DESC[slash] ?? slash
  return runtime === undefined
    ? `${desc} · 点本行展开/折叠详情`
    : `${desc} · ${runtime} · 点本行展开/折叠详情`
}

/** Outcome of resolving the change a command addresses. */
type ChangeResolution =
  | { readonly kind: 'ok'; readonly changeId: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly string[] }

/** One row in the projection index. */
type IndexRow = Pick<ProjectionIndexEntry, 'changeId' | 'current' | 'updatedAt'>

/** Subset of the projection index the resolver needs. */
type IndexShape = { readonly changes: readonly IndexRow[] }

function resolveChange(index: IndexShape, explicit?: string): ChangeResolution {
  if (explicit !== undefined) {
    return index.changes.some(c => c.changeId === explicit)
      ? { kind: 'ok', changeId: explicit }
      : { kind: 'none' }
  }
  // Same tie-breaker as the Tab / `/baf-status` / session-gate surfaces
  // (highest seq, then lexical changeId) so a slash command and a Tab click
  // agree on the focus even when several changes are still in-flight
  // (§13 issue #2: three surfaces used to diverge here).
  const fullIndex = { changes: index.changes as readonly ProjectionIndexEntry[] }
  const picked = pickActiveChange(fullIndex.changes)
  if (picked.kind === 'none') return { kind: 'none' }
  if (picked.kind === 'one') return { kind: 'ok', changeId: picked.changeId }
  return { kind: 'ambiguous', candidates: picked.candidates.map(c => `${c.changeId} · ${c.current}`) }
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
      text: formatCommandReport(false, `${command} · ${error.code} · 点本行展开/折叠详情`, [
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
    text: formatCommandReport(false, `${command} · 失败 · 点本行展开/折叠详情`, [
      { title: '原因', lines: [error instanceof Error ? error.message : String(error)] },
    ]),
  }
}

/**
 * The canonical status block every drive card ends with (§20.1).
 * @param status - recovered status.
 * @returns stable `change/mode/current/projection` rows.
 */
export function statusLines(status: WorkflowStatus): string[] {
  return [
    `change: ${status.changeId}`,
    `mode: ${status.mode}（${modeZh(status.mode)}）`,
    `current: ${String(status.current)}`,
    `projection: v${status.projectionVersion}`,
  ]
}

/**
 * `/baf-workflow-open <描述>` — run the intake classifier (T1).
 * @param cwd - workspace root.
 * @param rawInput - free-form change description.
 * @returns classification card.
 */
export async function driveOpen(cwd: string, rawInput: string, _source: TransitionSource = 'slash'): Promise<CommandResult> {
  const description = rawInput.trim()
  if (description === '') {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('/baf-workflow-open', '缺少描述'), [
        { title: '用法', lines: ['/baf-workflow-open <需求或 Bug 描述>'] },
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
      cardTitle('/baf-workflow-open', `分类完成 · ${modeZh(intake.mode)}`),
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
            `确认：/baf-workflow-classify confirm mode=${intake.mode === 'bug-fix-path' ? 'bug-fix-path problem=… root-cause=… file=… test=… test-cmd=…' : 'full-go-path title=…'}`,
            '拒绝：/baf-workflow-classify reject',
          ],
        },
      ],
    ),
  }
}

/**
 * `/baf-workflow-classify [confirm|reject]` — confirm/reject pending intake and open (T2/T3).
 * @param cwd - workspace root.
 * @param rawInput - subcommand plus optional key=value fields.
 * @returns result card.
 */
export async function driveClassify(cwd: string, rawInput: string, source: TransitionSource = 'slash'): Promise<CommandResult> {
  const args = parseArgs(rawInput)
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const index = await store.readIndex()
  const explicit = valueOf(args, 'change')
  const resolution = resolveChange(index, explicit)
  if (resolution.kind === 'none') {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('/baf-workflow-classify', '无此变更'), [
        { title: '当前工作区变更', lines: index.changes.length === 0 ? ['（无）— 先 /baf-workflow-open <描述>'] : index.changes.map(c => `${c.changeId} · ${String(c.current)}`) },
      ]),
    }
  }
  if (resolution.kind === 'ambiguous') {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('/baf-workflow-classify', '多个活动变更，需显式指定'), [
        { title: '候选', lines: resolution.candidates.map(c => `- ${c}`) },
        { title: '用法', lines: ['/baf-workflow-classify confirm change=<changeId> …'] },
      ]),
    }
  }
  const changeId = resolution.changeId

  if (args.positionals.includes('reject')) {
    await rejectIntake(store, changeId)
    return {
      kind: 'success',
      text: formatCommandReport(true, cardTitle('/baf-workflow-classify', `已拒绝 ${changeId}`), [
        { title: '状态', lines: ['intake 被拒绝，change 进入已放弃（审计保留）'] },
      ]),
    }
  }

  if (!args.positionals.includes('confirm')) {
    const status = await store.readStatus(changeId)
    const intake = status.intake
    return {
      kind: 'success',
      text: formatCommandReport(true, cardTitle('/baf-workflow-classify', `${changeId} 当前分类`), [
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
        { title: '用法', lines: ['/baf-workflow-classify confirm [mode=full-go-path|bug-fix-path] [字段…]', '/baf-workflow-classify reject'] },
      ]),
    }
  }

  // §22.17 J — `mode=` carries the customer's path choice from the classify
  // dialog's two path buttons (or a hand-typed slash). Record the override
  // while the intake is still pending; the confirm below then proceeds down
  // the overridden path.
  const requestedMode = valueOf(args, 'mode')
  if (requestedMode !== undefined) {
    if (requestedMode !== 'full-go-path' && requestedMode !== 'bug-fix-path') {
      return {
        kind: 'error',
        text: formatCommandReport(false, cardTitle('/baf-workflow-classify', 'mode 取值不合法'), [
          { title: '收到', lines: [`mode=${requestedMode}`] },
          { title: '合法值', lines: ['mode=full-go-path', 'mode=bug-fix-path'] },
        ]),
      }
    }
    try {
      await setIntakeMode(store, changeId, requestedMode)
    } catch (error) {
      return {
        kind: 'error',
        text: formatCommandReport(false, cardTitle('/baf-workflow-classify', '改道失败'), [
          { title: '原因', lines: [error instanceof Error ? error.message : String(error)] },
          { title: '说明', lines: ['分类确认后不能再改道；如需换路径，请重新描述需求新开一条'] },
        ]),
      }
    }
  }

  const status = await confirmIntake(store, changeId, 'user')
  if (status.current !== 'intake') {
    return {
      kind: 'success',
      text: formatCommandReport(true, cardTitle('/baf-workflow-classify', `${changeId} 已确认并进入 ${String(status.current)}`), [
        { title: '状态', lines: statusLines(status) },
      ]),
    }
  }

  const pipeline = await pipelineFor(cwd)
  if (status.mode === 'bug-fix-path') {
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
        text: formatCommandReport(false, cardTitle('/baf-workflow-classify', 'fast-path 缺少 Bug 字段'), [
          { title: '缺少', lines: missing.map(m => `- ${m}`) },
          {
            title: '用法',
            lines: [
              '/baf-workflow-classify confirm problem="现象" root-cause="根因" \\',
              '  file=src/a.c file=tests/x.c test=tests/x.c test-cmd="ctest -R x"',
            ],
          },
        ]),
      }
    }
    await pipeline.driveBugFixPathOpenStage({
      changeId,
      title: valueOf(args, 'title') ?? status.intake?.summary ?? changeId,
      problem: problem as string,
      rootCause: rootCause as string,
      affectedFiles: files,
      regressionTest: { file: test as string, command: testCmd as string },
    }, source)
  } else {
    if (pipeline.context().baseline === undefined) {
      return {
        kind: 'error',
        text: formatCommandReport(false, cardTitle('/baf-workflow-classify', 'baseline_unavailable'), [
          { title: '原因', lines: [`工作区缺少可解析的 ${WORKSPACE_BASELINE_PATH}`] },
          { title: '处理', lines: ['先初始化工作区基线（baf-scaffold / 企业基线包）再确认 full-go-path'] },
        ]),
      }
    }
    await pipeline.driveOpenStage(changeId, valueOf(args, 'title') ?? status.intake?.summary ?? changeId, source)
  }
  const after = await store.readStatus(changeId)
  return {
    kind: 'success',
    text: formatCommandReport(true, cardTitle('/baf-workflow-classify', `已确认并进入 open · ${modeZh(after.mode)}`), [
      { title: '状态', lines: statusLines(after) },
      ...(after.mode === 'bug-fix-path'
        ? [{ title: 'fast-path', lines: ['bug-record.md 与回归测试台账已建立', '下一步：/baf-workflow-implement（先写回归测试）'] } as const]
        : [{ title: '下一步', lines: ['clarify：/baf-workflow-clarify（或页签）', '分类卡与产物在 openspec/changes/ 下'] } as const]),
    ]),
  }
}

/** Shared begin/done/args handling for the three documentation stages. */
async function driveDocStage(
  command: string,
  cwd: string,
  rawInput: string,
  node: 'clarify' | 'design' | 'plan',
  _source: TransitionSource = 'slash',
): Promise<CommandResult> {
  const args = parseArgs(rawInput)
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const index = await store.readIndex()
  const resolution = resolveChange(index, valueOf(args, 'change'))
  if (resolution.kind !== 'ok') {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle(command, '无活动变更'), [
        { title: '处理', lines: ['先 /baf-workflow-open <描述> 并 /baf-workflow-classify confirm'] },
      ]),
    }
  }
  const changeId = resolution.changeId
  const pipeline = await pipelineFor(cwd)

  if (args.positionals.includes('done')) {
    const status = await pipeline.completeDocStage(changeId, node)
    return {
      kind: 'success',
      text: formatCommandReport(true, cardTitle(command, `${node} 完成裁决通过 · 当前 ${String(status.current)}`), [
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
      text: formatCommandReport(true, cardTitle(command, `${node} 产物写入并完成 · 当前 ${String(drive.status.current)}`), [
        { title: '产物', lines: drive.result.artifacts },
      ]),
    }
  }

  const status = await pipeline.beginDocStage(changeId, node)
  return {
    kind: 'success',
    text: formatCommandReport(true, cardTitle(command, `${node} 已进入 · 模板已安装`), [
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
 * `/baf-workflow-clarify [done | q=… a=… crit=…]` — N2 drive.
 * @param cwd - workspace root.
 * @param rawInput - subcommand/fields.
 * @returns result card.
 */
export async function driveClarify(cwd: string, rawInput: string, source: TransitionSource = 'slash'): Promise<CommandResult> {
  return driveDocStage('/baf-workflow-clarify', cwd, rawInput, 'clarify', source)
}

/**
 * `/baf-workflow-design [done | approach=… ref=…]` — N3 drive.
 * @param cwd - workspace root.
 * @param rawInput - subcommand/fields.
 * @returns result card.
 */
export async function driveDesign(cwd: string, rawInput: string, source: TransitionSource = 'slash'): Promise<CommandResult> {
  return driveDocStage('/baf-workflow-design', cwd, rawInput, 'design', source)
}

/**
 * `/baf-workflow-plan [done]` — N4 drive (tasks are authored in plan.md/plan.json).
 * @param cwd - workspace root.
 * @param rawInput - subcommand/fields.
 * @returns result card.
 */
export async function drivePlan(cwd: string, rawInput: string, source: TransitionSource = 'slash'): Promise<CommandResult> {
  return driveDocStage('/baf-workflow-plan', cwd, rawInput, 'plan', source)
}

/**
 * `/baf-workflow-implement [done]` — N5 entry (T5/T8) and completion (T9 + T15 precheck).
 * @param cwd - workspace root.
 * @param rawInput - subcommand.
 * @returns result card.
 */
export async function driveImplement(cwd: string, rawInput: string, source: TransitionSource = 'slash'): Promise<CommandResult> {
  const args = parseArgs(rawInput)
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const index = await store.readIndex()
  const resolution = resolveChange(index, valueOf(args, 'change'))
  if (resolution.kind !== 'ok') {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('/baf-workflow-implement', '无活动变更'), [
        { title: '处理', lines: ['先 /baf-workflow-open 并 /baf-workflow-classify confirm'] },
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
        text: formatCommandReport(true, cardTitle('/baf-workflow-implement', 'T15 已升级 full-go-path · 当前 clarify'), [
          { title: '原因', lines: [result.result.escalated.cause] },
          { title: '状态', lines: statusLines(status) },
          { title: '下一步', lines: ['/baf-workflow-clarify → /baf-workflow-design → /baf-workflow-plan 补走'] },
        ]),
      }
    }
    const status = await store.readStatus(resolution.changeId)
    return {
      kind: 'success',
      text: formatCommandReport(true, cardTitle('/baf-workflow-implement', `实现完成 · 当前 ${String(status.current)}`), [
        { title: '状态', lines: statusLines(status) },
        { title: '下一步', lines: ['/baf-workflow-verify'] },
      ]),
    }
  }
  const status = await pipeline.enterImplementStage(resolution.changeId, source)
  return {
    kind: 'success',
    text: formatCommandReport(true, cardTitle('/baf-workflow-implement', `已进入实现 · 当前 ${String(status.current)}`), [
      { title: '状态', lines: statusLines(status) },
      {
        title: '纪律',
        lines: [
          'bug-fix-path：必须先写回归测试（recordTouched 顺序强制）',
          '只允许修改 plan.json allowlist 内文件（baf-guard 硬门禁）',
          '完成后：/baf-workflow-implement done',
        ],
      },
    ]),
  }
}

/**
 * `/baf-workflow-verify` — N6 (T9 entry, check run, T10/T11 verdict).
 * @param cwd - workspace root.
 * @param rawInput - subcommand.
 * @param adapters - optional stack/guard wiring from the mounted services.
 * @returns result card.
 */
export async function driveVerify(cwd: string, rawInput: string, adapters: DriveAdapters = {}, source: TransitionSource = 'slash'): Promise<CommandResult> {
  const args = parseArgs(rawInput)
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const index = await store.readIndex()
  const resolution = resolveChange(index, valueOf(args, 'change'))
  if (resolution.kind !== 'ok') {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('/baf-workflow-verify', '无活动变更'), [
        { title: '处理', lines: ['先推进到 implement 完成：/baf-workflow-implement done'] },
      ]),
    }
  }
  const pipeline = await pipelineFor(cwd, adapters)
  const result = await pipeline.driveVerifyStage(resolution.changeId, new AbortController().signal, source)
  if (result.node !== 'verify') return renderDomainError('/baf-workflow-verify', new Error('unexpected drive result'))
  const rows = result.result.report.checks
    .map(row => `${row.ok ? '✓' : '✗'} ${row.name}${row.required ? '' : '（非必需）'} — ${row.diagnostics.join('; ')}`)
  const status = await store.readStatus(resolution.changeId)
  if (result.result.backToImplement) {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('/baf-workflow-verify', '必需检查失败 · T11 回实现'), [
        { title: '检查', lines: rows },
        { title: '报告', lines: [result.result.reportPath] },
        { title: '下一步', lines: ['修复后 /baf-workflow-implement → /baf-workflow-implement done → /baf-workflow-verify'] },
      ]),
    }
  }
  return {
    kind: 'success',
    text: formatCommandReport(true, cardTitle('/baf-workflow-verify', `全部必需检查通过 · 当前 ${String(status.current)}`), [
      { title: '检查', lines: rows },
      { title: '报告', lines: [result.result.reportPath] },
      { title: '下一步', lines: ['/baf-workflow-archive confirm'] },
    ]),
  }
}

/**
 * `/baf-workflow-archive confirm` — N7 (T14) with explicit human confirmation.
 * @param cwd - workspace root.
 * @param rawInput - must contain `confirm`.
 * @returns result card.
 */
export async function driveArchive(cwd: string, rawInput: string, source: TransitionSource = 'slash'): Promise<CommandResult> {
  const args = parseArgs(rawInput)
  if (!args.positionals.includes('confirm')) {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('/baf-workflow-archive', '需要人工确认'), [
        { title: '用法', lines: ['/baf-workflow-archive confirm'] },
      ]),
    }
  }
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const index = await store.readIndex()
  const resolution = resolveChange(index, valueOf(args, 'change'))
  if (resolution.kind !== 'ok') {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('/baf-workflow-archive', '无活动变更'), []),
    }
  }
  const pipeline = await pipelineFor(cwd)
  await pipeline.driveArchiveStage(resolution.changeId, true, source)
  const status = await store.readStatus(resolution.changeId)
  return {
    kind: 'success',
    text: formatCommandReport(true, cardTitle('/baf-workflow-archive', `已归档 · ${status.changeId}`), [
      { title: '状态', lines: [`terminal: ${String(status.terminal)}`] },
    ]),
  }
}

/**
 * `/baf-workflow-abandon confirm` — T16 with explicit human confirmation.
 * @param cwd - workspace root.
 * @param rawInput - must contain `confirm`.
 * @returns result card.
 */
export async function driveAbandon(cwd: string, rawInput: string, source: TransitionSource = 'slash'): Promise<CommandResult> {
  const args = parseArgs(rawInput)
  if (!args.positionals.includes('confirm')) {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('/baf-workflow-abandon', '需要人工确认'), [
        { title: '用法', lines: ['/baf-workflow-abandon confirm'] },
      ]),
    }
  }
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const index = await store.readIndex()
  const resolution = resolveChange(index, valueOf(args, 'change'))
  if (resolution.kind !== 'ok') {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('/baf-workflow-abandon', '无活动变更'), []),
    }
  }
  const pipeline = await pipelineFor(cwd)
  await pipeline.driveAbandonStage({ changeId: resolution.changeId, humanConfirmed: true }, source)
  const status = await store.readStatus(resolution.changeId)
  return {
    kind: 'success',
    text: formatCommandReport(true, cardTitle('/baf-workflow-abandon', `已放弃 · ${status.changeId}`), [
      { title: '状态', lines: [`terminal: ${String(status.terminal)}`, '审计与产物保留'] },
    ]),
  }
}

/**
 * `/baf-workflow-resume [节点]` — the T13 drift exit (§19).
 *
 * No argument is the **only** correct way to ask "what are my options": it runs
 * a read-only detection, writes nothing, and renders the candidate card. An
 * argument performs the resume. The candidate set is machine-computed and the
 * choice is the customer's — the driver never picks a node on its own (§19.4).
 * @param cwd - workspace root.
 * @param rawInput - optional target node, optional `change=<id>`.
 * @returns candidate card, resume card, or the no-drift / idempotent card.
 */
export async function driveResume(cwd: string, rawInput: string, source: TransitionSource = 'slash'): Promise<CommandResult> {
  const args = parseArgs(rawInput)
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const index = await store.readIndex()
  const resolution = resolveChange(index, valueOf(args, 'change'))
  if (resolution.kind !== 'ok') {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('/baf-workflow-resume', '无活动变更'), []),
    }
  }
  const changeId = resolution.changeId
  const pipeline = await pipelineFor(cwd)
  const options = await pipeline.resumeOptions(changeId)
  const { status } = options

  if (status.terminal !== undefined) {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('/baf-workflow-resume', `已终态 · ${changeId}`), [
        { title: '状态', lines: [`terminal: ${status.terminal}`, '终态变更无需复位'] },
      ]),
    }
  }

  const target = args.positionals[0]

  if (status.current !== 'drift') {
    if (target !== undefined && target === status.current) {
      return {
        kind: 'success',
        text: formatCommandReport(true, cardTitle('/baf-workflow-resume', `已在 ${target} · ${changeId}`), [
          { title: '状态', lines: [...statusLines(status), '已在目标节点，未写事件'] },
        ]),
      }
    }
    return {
      kind: 'success',
      text: formatCommandReport(true, cardTitle('/baf-workflow-resume', `无漂移 · ${changeId}`), [
        { title: '状态', lines: [...statusLines(status), '当前无漂移，无需复位'] },
      ]),
    }
  }

  if (target === undefined) {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('/baf-workflow-resume', `流程有偏差 · ${changeId} · 请选择要退回的阶段`), [
        { title: '偏差证据', lines: evidenceLines(options.signals, status) },
        {
          title: '可以退回到',
          lines: options.candidates.map(node => candidateLine(node, options.anchor, options.candidates.length)),
        },
        { title: '不处理的后果', lines: ['流程会一直停在这里，改代码的请求都会被拦下'] },
      ]),
    }
  }

  if (!options.candidates.includes(target as WorkflowNode)) {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('/baf-workflow-resume', `不能退到这个阶段 · ${changeId}`), [
        { title: '原因', lines: [`目标阶段 ${target} 不在可退回列表内（当前锚点 ${options.anchor}）`] },
        { title: '可以退回到', lines: options.candidates.map(node => `  /baf-workflow-resume ${node}`) },
      ]),
    }
  }

  const resumed = await pipeline.driveResumeStage(changeId, target as WorkflowNode, undefined, source)
  if (resumed.node !== 'resume') throw new Error('expected a resume drive')
  const after = await store.readStatus(changeId)
  return {
    kind: 'success',
    text: formatCommandReport(true, cardTitle('/baf-workflow-resume', `已退回到 ${target} · ${changeId}`), [
      { title: '退回路径', lines: [`${resumed.result.anchor} → ${resumed.result.target}`] },
      { title: '偏差证据', lines: evidenceLines(resumed.result.signals, status) },
      { title: '状态', lines: statusLines(after) },
      { title: '需要重做', lines: [rerunChain(target as WorkflowNode).join(' → ')] },
      { title: '下一步', lines: ['输入 /baf-go 从该阶段继续自动推进'] },
    ]),
  }
}

/**
 * Evidence rows for a resume card.
 *
 * A fresh detection can come back empty when the drift was recorded earlier
 * (the anchors it compares against are the ones it already invalidated), so
 * the recorded cause from the `drift-detected` event is the fallback — the
 * card must never claim a drift without saying why.
 * @param signals - freshly detected signals.
 * @param status - drifted status.
 * @returns non-empty evidence lines.
 */
function evidenceLines(
  signals: readonly { trigger: string; detail: string }[],
  status: WorkflowStatus,
): string[] {
  if (signals.length > 0) return signals.map(s => `${s.trigger}  ${s.detail}`)
  const recorded = status.annotations?.drift?.detail
  return recorded === undefined ? ['（漂移已记录于 projection，未复现新信号）'] : [recorded]
}

/**
 * One candidate row on the resume card: the default is marked, others show the
 * downstream chain they reopen.
 * @param node - candidate node.
 * @param anchor - default candidate.
 * @param total - candidate count (a single candidate is trivially default).
 * @returns rendered line.
 */
function candidateLine(node: WorkflowNode, anchor: WorkflowNode, total: number): string {
  const command = `/baf-workflow-resume ${node}`
  if (node === anchor && total > 1) return `  ${command}     ← 默认`
  return `  ${command}    重跑 ${rerunChain(node).join(' → ')}`
}

/**
 * `/baf-check-quality` — run the baseline's C-stack checks outside the verify gate.
 * @param cwd - workspace root.
 * @param adapters - must carry a stack adapter (resolved by the entry surface).
 * @returns quality report card.
 */
export async function driveQuality(cwd: string, adapters: DriveAdapters): Promise<CommandResult> {
  if (adapters.stack === undefined) {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('/baf-check-quality', '质量检查组件没有加载'), [
        { title: '原因', lines: ['质量检查需要的组件（baf-quality）没有加载到当前配置'] },
      ]),
    }
  }
  const baseline = await loadWorkspaceBaseline(cwd)
  if (baseline === undefined) {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('/baf-check-quality', 'baseline_unavailable'), [
        { title: '原因', lines: [`工作区缺少可解析的 ${WORKSPACE_BASELINE_PATH}`] },
      ]),
    }
  }
  const report = await adapters.stack.runQuality(
    { workspace: { root: cwd }, baseline, changeId: 'adhoc' },
    new AbortController().signal,
  )
  const rows = report.checks.map((check) => {
    const row = check as { id?: unknown; passed?: unknown; reasonCode?: unknown }
    const id = typeof row.id === 'string' ? row.id : String(row.id ?? '?')
    const passed = Boolean(row.passed)
    const reason = typeof row.reasonCode === 'string' ? row.reasonCode : 'ok'
    return `${passed ? '✓' : '✗'} ${id} — ${reason}`
  })
  return {
    kind: report.passed ? 'success' : 'error',
    text: formatCommandReport(report.passed, cardTitle('/baf-check-quality', `${report.passed ? '通过' : '未通过'} · ${report.baselineId}`), [
      { title: '检查', lines: rows },
      { title: '工具版本', lines: Object.entries(report.toolVersions).map(([tool, version]) => `${tool}: ${version}`) },
      ...(report.diagnostics.length === 0 ? [] : [{ title: '诊断', lines: report.diagnostics } as const]),
    ]),
  }
}

/**
 * `/baf-check-guard` — run the guard policy (verify + secret-scan) over touched files.
 * @param cwd - workspace root.
 * @param adapters - must carry a guard policy (resolved by the entry surface).
 * @returns guard report card.
 */
export async function driveGuard(cwd: string, adapters: DriveAdapters): Promise<CommandResult> {
  if (adapters.guard === undefined) {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('/baf-check-guard', '安全检查组件没有加载'), [
        { title: '原因', lines: ['安全检查需要的组件（baf-guard）没有加载到当前配置'] },
      ]),
    }
  }
  const baseline = await loadWorkspaceBaseline(cwd)
  if (baseline === undefined) {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('/baf-check-guard', 'baseline_unavailable'), [
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
    text: formatCommandReport(ok, cardTitle('/baf-check-guard', ok ? '通过' : '拒绝'), [
      { title: 'verify', lines: verifyReport.reasonCodes.length === 0 ? ['within policy'] : verifyReport.reasonCodes },
      { title: 'secret-scan', lines: secretReport.reasonCodes.length === 0 ? ['no secrets detected'] : secretReport.reasonCodes },
      { title: '受检文件', lines: paths.length === 0 ? ['（无 touched 记录）'] : paths },
    ]),
  }
}

/**
 * `/baf-scaffold` — init the workspace skeleton (baseline template + openspec
 * layout, Phase 8.11 / §22.4).
 *
 * Human confirmation is implied by the entry surface itself: the slash is
 * only dispatched after the customer typed `/baf-scaffold` (or the Tab button
 * dispatched the same slash through the gate resolver), so `humanConfirmed:
 * true` is unconditional at this layer. The refusal branch in
 * {@link ScaffoldAdapter.scaffold} is kept for symmetry with `baf-scaffold`'s
 * own refusal-as-value contract — drives never fabricate a refusal but a
 * missing adapter still surfaces as a clear "服务未挂载" card.
 *
 * @param cwd - workspace root.
 * @param adapters - must carry a scaffold adapter (resolved by the entry
 *   surface via `resolveScaffoldService` — `agentPresets.serviceFor` first,
 *   plain `get` second, because the service sits in the baf-domain isolate).
 * @param baselineId - optional enterprise baseline id; defaults to
 *   `baf-baseline-init` (matches `baf-scaffold`'s `planScaffold` default).
 * @returns result card.
 */
export async function driveScaffold(
  cwd: string,
  adapters: DriveAdapters,
  baselineId: string = 'baf-baseline-init',
): Promise<CommandResult> {
  if (adapters.scaffold === undefined) {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('/baf-scaffold', '初始化服务没有加载'), [
        { title: '原因', lines: ['工作区初始化需要的组件没有加载到当前会话'] },
        { title: '处理', lines: ['请在设置里启用 BAF 工作流预设（含全部 BAF 组件）后，重新打开本会话再试'] },
      ]),
    }
  }
  const outcome = adapters.scaffold.scaffold({
    workspaceRoot: cwd,
    baselineId,
    humanConfirmed: true,
  })
  if (outcome.kind === 'refused') {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('/baf-scaffold', '需要你确认'), [
        { title: '原因', lines: ['初始化会写入/改写工作区文件，需要明确确认后才会执行'] },
        { title: '处理', lines: ['在工作流页签点「初始化工作区」按钮，或输入 /baf-scaffold'] },
      ]),
    }
  }
  const { created, skipped, backedUp } = outcome.changes
  const allEmpty = created.length === 0 && skipped.length === 0 && backedUp.length === 0
  const titleSuffix = allEmpty
    ? '无需改动，工作区已就绪'
    : `新增 ${created.length} 项 · 已存在 ${skipped.length} 项 · 改写 ${backedUp.length} 项`
  return {
    kind: 'success',
    text: formatCommandReport(true, cardTitle('/baf-scaffold', titleSuffix), [
      { title: '工作区', lines: [`cwd: ${cwd}`, `baselineId: ${baselineId}`] },
      ...(created.length === 0 ? [] : [{ title: '新增', lines: created } as const]),
      ...(skipped.length === 0 ? [] : [{ title: '已存在（内容一致，未改动）', lines: skipped } as const]),
      ...(backedUp.length === 0 ? [] : [{ title: '已备份并改写', lines: backedUp } as const]),
      { title: '下一步', lines: ['/baf-workflow-open <需求> 启动第一条变更', '或输入 /baf-status 查看当前状态'] },
    ]),
  }
}

/**
 * §22.14 Tab resolve channel (`BafWorkflowTabRemote.gateResolve`). The Tab
 * dispatches a `(gateId, optionId)` pair picked from a `WorkflowTabGate` or
 * `WorkflowTabPendingGate` it rendered. The drive validates the pair against
 * the §22 registry and re-dispatches the corresponding slash command —
 * tabs cannot invent a path that does not exist in the registry, because the
 * resolved `command` is the slash the registry itself advertises.
 *
 * `__noop__` is the "dismiss" sentinel (cancel / no-op). For those, no
 * command is dispatched and the drive returns a calm dismissal card so the
 * Tab can refresh. Unknown `gateId` / `optionId` returns a refusal card —
 * `gateId must be a registered GateId` is the only contract callers need
 * to satisfy; everything else is verified here.
 *
 * @param cwd - workspace root.
 * @param gateId - §22 gate id from the Tab payload.
 * @param optionId - registered option id (or `resume-<node>` for the dynamic resume gate).
 * @param adapters - drive adapters (scaffold / guard / stack as needed by the dispatched slash).
 * @param resumeCandidates - required when `gateId === 'resume'`; the Tab supplies them from the drift payload.
 * @returns the dispatched slash's card, the dismissal card, or a refusal.
 */
export async function driveGateResolve(
  cwd: string,
  gateId: string,
  optionId: string,
  adapters: DriveAdapters,
  resumeCandidates?: readonly WorkflowNode[],
  source: TransitionSource = 'slash',
  opts?: {
    /** Active change id for the audit line; falls back to the projection index. */
    changeId?: string
    /** Audit-line emitter; omitted callers get silent runs (e.g. CLI smoke). */
    audit?: (line: string) => void
    /**
     * §22.17 J — extra key=value tokens spliced into the dispatched classify
     * confirm invocation. The registry's option args are static; the bug-fix
     * fields (problem/root-cause/file/test/test-cmd) are per-call payload the
     * dialog gathered from `baf_gate_ask`, so they ride along here. Only the
     * confirm subcommand consumes them; reject ignores stray kv pairs.
     */
    extraArgs?: readonly string[]
  },
): Promise<CommandResult> {
  const spec: GateSpec | undefined = (GATE_REGISTRY as Record<string, GateSpec | undefined>)[gateId]
  if (spec === undefined) {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('gateResolve', `无法识别的确认项 ${JSON.stringify(gateId)}`), [
        { title: '原因', lines: [`系统里没有这个确认项（现有：${Object.keys(GATE_REGISTRY).join(' | ')}）`] },
        { title: '处理', lines: ['重新输入 /baf-go 让系统重新计算，或输入 /baf-help 查看命令表'] },
      ]),
    }
  }

  // §22.5: dynamic options (resume) are derived from the caller's payload
  // because the registry cannot enumerate them at definition time. We
  // re-validate against the supplied candidates so a stale Tab can't drive
  // a node that the projection no longer considers legal.
  const options: readonly GateOptionSpec[] = spec.dynamicOptions === 'resume-targets'
    ? (resumeCandidates ?? []).map(node => ({
      id: `resume-${node}`,
      label: `复位到 ${node}`,
      command: '/baf-workflow-resume',
      args: [node],
    }))
    : spec.options

  const opt = options.find(o => o.id === optionId)
  if (opt === undefined) {
    return {
      kind: 'error',
      text: formatCommandReport(false, cardTitle('gateResolve', `未知选项 ${JSON.stringify(optionId)}`), [
        { title: '门', lines: [`${spec.title} (gateId=${gateId})`] },
        { title: '合法选项', lines: options.map(o => `${o.id} → ${o.command}${o.args ? ' ' + o.args.join(' ') : ''}`) },
        { title: '处理', lines: ['刷新 Tab 后重选（projection 已更新）'] },
      ]),
    }
  }

  // Dismissal = no-op. The Tab will re-render and the gate's condition
  // (e.g. "no baseline") still holds, so the pendingGate stays visible.
  // No audit line: dismissal is a UI event, not a workflow drive.
  if (opt.command === '__noop__') {
    return {
      kind: 'success',
      text: formatCommandReport(true, cardTitle('gateResolve', '已收起确认门'), [
        { title: '状态', lines: ['取消未动作；门条件未解除，Tab 仍保留此卡'] },
        { title: '重弹方式', lines: ['在 Tab 上重选，或敲 /baf-go 让协调器重渲染'] },
      ]),
    }
  }

  // §22.16 P3: gate-resolve audit line — one structured log per dispatched
  // resolution. Format mirrors sessionGateLogLine (key=value metadata only,
  // no prose) so log scrapers can build dashboards without parsing Chinese.
  // `change` and `baseline` are best-effort: the change id may be absent
  // for workspace-scope gates (scaffold) and the baseline may not be on
  // disk yet during intake.
  if (opts?.audit !== undefined) {
    let baselineId: string | undefined
    try {
      baselineId = (await loadWorkspaceBaseline(cwd))?.baselineId
    } catch {
      baselineId = undefined
    }
    const change = opts.changeId ?? '-'
    const baseline = baselineId ?? '-'
    const line = `[baf] ${new Date().toISOString()} - session baf:gate gateId=${gateId} option=${optionId} change=${change} source=${source} baseline=${baseline}`
    opts.audit(line)
  }

  // Re-dispatch the registered slash drive. We rebuild the rawInput the
  // handler would have received and call the same drive surface — no
  // second copy of the transition logic. Inner drives inherit the §22.15
  // source so every confirm edge below carries the same gate-card origin.
  const innerSource: TransitionSource = 'gate-card'
  const invocations = [opt.command, ...(opt.args ?? [])].join(' ').trim()
  if (opt.command === '/baf-scaffold') {
    return driveScaffold(cwd, adapters, opt.args?.[0] ?? 'baf-baseline-init')
  }
  if (opt.command === '/baf-workflow-classify') {
    const base = invocations.replace('/baf-workflow-classify', '').trim()
    // §22.17 J — splice the per-call payload only into a confirm dispatch.
    const withExtra = base.split(/\s+/).includes('confirm') && opts?.extraArgs !== undefined && opts.extraArgs.length > 0
      ? `${base} ${opts.extraArgs.join(' ')}`.trim()
      : base
    return driveClassify(cwd, withExtra, innerSource)
  }
  if (opt.command === '/baf-workflow-clarify') {
    return driveClarify(cwd, invocations.replace('/baf-workflow-clarify', '').trim(), innerSource)
  }
  if (opt.command === '/baf-workflow-implement') {
    return driveImplement(cwd, invocations.replace('/baf-workflow-implement', '').trim(), innerSource)
  }
  if (opt.command === '/baf-workflow-abandon') {
    return driveAbandon(cwd, invocations.replace('/baf-workflow-abandon', '').trim(), innerSource)
  }
  if (opt.command === '/baf-workflow-resume') {
    return driveResume(cwd, invocations.replace('/baf-workflow-resume', '').trim(), innerSource)
  }
  if (opt.command === '/baf-go') {
    // §18 coordinator — gates A/B re-fire through the same surface the
    // slash handler uses; no separate drive needed. The re-dispatch carries
    // the gate's change id (§22.17): the coordinator's binding guard
    // (§18.6.4) refuses an unfocused second `/baf-go`, and the dispatch has
    // no session focus cache — without `change=` a dialog/Tab confirm click
    // would die on "请选择本会话的工作流" instead of unlocking the gate.
    const changeArg = opts?.changeId === undefined ? '' : ` change=${opts.changeId}`
    return driveGo({
      cwd,
      adapters,
      rawInput: `${invocations.replace('/baf-go', '').trim()}${changeArg}`.trim(),
      source: innerSource,
    })
  }
  return {
    kind: 'error',
    text: formatCommandReport(false, cardTitle('gateResolve', `未实现派发 ${opt.command}`), [
      { title: '门', lines: [`${spec.title} (gateId=${gateId})`] },
      { title: '处理', lines: ['此命令尚未接入 gateResolve 派发表'] },
    ]),
  }
}
