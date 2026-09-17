/**
 * `baf-cli` Commander tree — the standalone mirror of `/baf-*` slash commands.
 *
 * One process per `dsh --profile baf-cli -- <subcommand>…` invocation. The
 * subcommand name matches the slash name 1:1 (`help`, `welcome`, `version`,
 * `status`, `list`, `go`, `doctor`, `workflow-open`, `workflow-classify`,
 * `workflow-clarify`, `workflow-design`, `workflow-plan`,
 * `workflow-implement`, `workflow-verify`, `workflow-archive`,
 * `workflow-abandon`, `check-quality`, `check-guard`)
 * and the output goes through the same `formatCommandReport` formatter the
 * slash handlers use, so the Terminal card and the slash card read
 * identically.
 *
 * Per `overlay/docs/enterprise-workflow.md` §9.1 / Phase 8.2:
 *   - reuse the `dsh` launcher and `cmdlineArgs` (`parseCmdline`) — no extra
 *     Node bin and no Cordis subtree here other than the existing baf domain;
 *   - do NOT duplicate drive logic: each subcommand delegates to the same
 *     drive the slash handler dispatches through `command-drives.ts`.
 *
 * Naming follows the same two-tier scheme as `commands.ts`. Card titles are
 * produced by `cardTitle(slash, runtime?)` so the CLI output mirrors the
 * slash card text bit-for-bit.
 *
 * @module @deepseek-ai/dsh-baf-workflow/cmdline
 */

import { Command } from 'commander'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import type { GuardPolicy, StackAdapter } from '@deepseek-ai/dsh-baf-core'
import { formatCommandReport, modeZh } from './command-format.ts'
import {
  driveAbandon,
  driveArchive,
  driveClassify,
  driveClarify,
  driveDesign,
  driveGuard,
  driveImplement,
  driveOpen,
  drivePlan,
  driveQuality,
  driveResume,
  driveVerify,
} from './command-drives.ts'
import { driveGo } from './go-coordinator.ts'
import { focusFor } from './session-focus.ts'
import { probeMountFlags, probeToolchain, renderProbeLines, renderWelcomeCard, resolveStartupBinding } from './session-gate.ts'
import { ProjectionStore } from './projection.ts'
import { resolveBafProductVersions } from './product-versions.ts'

export const name = 'baf-cli'
export const inject = ['cmdlineArgs']

/**
 * Internal shape for the CLI's own error cards (vs. drives returning
 * `CommandResult` from `@deepseek-ai/dsh-commands`). Drives return
 * `CommandResult` directly — the CLI just normalises `text`/`kind` for
 * consistent process exit codes.
 */
interface CliResult {
  readonly ok: boolean
  readonly text: string
}

/** Slash → description map (mirrors the descriptors in `commands.ts`). */
const SLASH_DESC: Record<string, string> = {
  '/baf-help': '列出全部指令与用法 · ★★',
  '/baf-welcome': '会话启动卡：绑定 + 工具链体检 · ★★',
  '/baf-version': '查看桌面/插件版本（对齐设置页） · ★',
  '/baf-status': '查看当前变更：模式/阶段/intake · ★★★',
  '/baf-doctor': '工作流自检：cwd/工具链/注册 · ★',
  '/baf-list': '列出工作区全部变更（含已归档/已放弃） · ★★',
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
}

/**
 * Look up a slash command's description by its slash name.
 * Falls back to the slash name itself so an unlisted command still renders.
 */
function slashDesc(slash: string): string {
  return SLASH_DESC[slash] ?? slash
}

/** Build a slash-command card title from its description + optional runtime info. */
function cardTitle(slash: string, runtime?: string): string {
  const desc = slashDesc(slash)
  return runtime === undefined
    ? `${desc} · 点本行展开/折叠指令全文`
    : `${desc} · ${runtime} · 点本行展开/折叠指令全文`
}

const HELP_CORE = [
  'baf help       列出全部指令与用法 · ★★',
  'baf welcome    会话启动卡：绑定 + 工具链体检 · ★★',
  'baf status     查看当前变更：模式/阶段/intake · ★★★',
  'baf version    查看桌面/插件版本（对齐设置页） · ★',
  'baf doctor     工作流自检：cwd/工具链/注册 · ★',
  'baf list       列出工作区全部变更（含已归档/已放弃） · ★★',
] as const

const HELP_FLOW = [
  'baf go                   自动驱动到下一个客户确认点 · ★★★',
  'baf workflow-open        启动变更：intake 分类 · ★★★',
  'baf workflow-classify    分类确认 / 拒绝 · ★★',
  'baf workflow-clarify     澄清阶段（N2） · ★★',
  'baf workflow-design      设计阶段（N3） · ★★',
  'baf workflow-plan        计划阶段（N4） · ★★',
  'baf workflow-implement   实现阶段（N5 进入/完成） · ★★★',
  'baf workflow-verify      验证阶段（N6） · ★★★',
  'baf workflow-archive     归档变更（N7/T14，需 confirm） · ★★★',
  'baf workflow-abandon     放弃变更（T16，需 confirm） · ★',
  'baf workflow-resume      drift 复位（T13，需选目标节点） · ★★★',
] as const

const HELP_CHECK = [
  'baf check-quality    基线 C 栈质量检查 · ★★',
  'baf check-guard      安全门禁（verify + secret-scan） · ★★',
] as const

const USAGE = [
  '1. 在工作区目录运行 `dsh --profile baf-cli -- <subcommand> [args]`',
  '2. 分类确认后再改代码；阶段由 domain service 推进，勿口头宣称完成',
  '3. 输出与 /baf-* slash 一致（同一 formatCommandReport formatters）',
] as const

const MODE_LINES = [
  '模式由 intake 分类确认决定（不是另开一套 CLI）：',
  '  · full-go = 完整流程（新需求 / 高风险）',
  '  · bug-fast-path = 缺陷快路径（低风险 Bug）',
  '  · clarify-required = 信息不足，先澄清',
  '快路径若风险扩大，在同一变更内升级为 full-go（无需新开 CLI 调用）。',
] as const

/**
 * Resolve cwd from `--cwd <path>` (CLI flag), falling back to `process.cwd()`.
 * The slash handlers read `agent.session.header.cwd`; the CLI has no agent,
 * so it accepts cwd either as a flag (preferred for portability) or as the
 * current working directory (single-workspace invocation).
 */
function readCwd(opts: { cwd?: string }): string | undefined {
  const cwd = opts.cwd ?? process.cwd()
  return cwd === '' ? undefined : cwd
}

function missingCwd(command: string): CliResult {
  return {
    ok: false,
    text: formatCommandReport(false, `${command} · 缺少工作区 · 点本行展开/折叠指令全文`, [
      { title: '原因', lines: ['CLI 没有 --cwd，当前工作目录也为空'] },
      { title: '处理', lines: ['指定 --cwd <path> 或 cd 到工作区目录'] },
    ]),
  }
}

/** Adapt a drive's `CommandResult` to the CLI's `CliResult`. */
function toCli(result: CommandResult): CliResult {
  return {
    ok: result.kind === 'success',
    text: result.text ?? '',
  }
}

function resolveAdapters(ctx: Context, cwd: string): { stack?: StackAdapter; guard?: GuardPolicy } {
  const stack = ctx.get('bafQuality')?.adapter()
  const guard = ctx.get('bafGuard')?.policy(cwd)
  return {
    ...(stack === undefined ? {} : { stack }),
    ...(guard === undefined ? {} : { guard }),
  }
}

function emit(ok: boolean, text: string, code: number): never {
  const stream = ok ? process.stdout : process.stderr
  stream.write(text)
  if (!text.endsWith('\n')) stream.write('\n')
  process.exit(code)
}

function fromDrive(drive: CliResult): never {
  emit(drive.ok, drive.text, drive.ok ? 0 : 1)
}

/**
 * Build the `baf` Commander program. Exported so unit tests can assert the
 * tree shape without booting a real dsh profile.
 */
export function buildBafProgram(): Command {
  const program = new Command()
    .name('baf')
    .description('standalone BAF CLI: mirror of /baf-* slash commands with workflow-* / check-* subcommands')
    .version('0.0.0', '-V,--baf-version', 'print baf-cli version (use `baf version` for product versions)')
    .option('--cwd <path>', 'workspace directory (defaults to process.cwd())')
    .option('--quiet', 'suppress the trailing "ok" / "fail" stamp line', false)
    .showHelpAfterError('(use `baf help` for the full command list)')

  program.command('help')
    .description(slashDesc('/baf-help'))
    .action(() => emit(true, formatCommandReport(true, cardTitle('/baf-help'), [
      { title: '核心', lines: HELP_CORE },
      { title: '流程', lines: HELP_FLOW },
      { title: '检查', lines: HELP_CHECK },
      { title: '怎么用', lines: USAGE },
      { title: '模式说明', lines: MODE_LINES },
    ]) + '\n', 0))

  program.command('version')
    .description(slashDesc('/baf-version'))
    .action(() => emit(true, formatCommandReport(true, cardTitle('/baf-version', resolveBafProductVersions().bafDsh), (() => {
      const v = resolveBafProductVersions()
      return [
        {
          title: '与设置「版本与更新」对齐',
          lines: [
            `BAF DSH DESKTOP: ${v.bafDsh}`,
            ...(v.bafDshNotes ? [`  · ${v.bafDshNotes}`] : []),
            `DeepSeek Harness: ${v.dsh}`,
            ...(v.dshNotes ? [`  · ${v.dshNotes}`] : []),
          ],
        },
        {
          title: 'BAF 插件包（各自独立 semver）',
          lines: [
            `@deepseek-ai/dsh-baf-core: ${v.bafCore}`,
            ...(v.bafCoreNotes ? [`  · ${v.bafCoreNotes}`] : []),
            `@deepseek-ai/dsh-baf-workflow: ${v.bafWorkflow}`,
            ...(v.bafWorkflowNotes ? [`  · ${v.bafWorkflowNotes}`] : []),
            `@deepseek-ai/dsh-baf-openspec: ${v.bafOpenspec}`,
            ...(v.bafOpenspecNotes ? [`  · ${v.bafOpenspecNotes}`] : []),
            `@deepseek-ai/dsh-baf-standard: ${v.bafStandard}`,
            ...(v.bafStandardNotes ? [`  · ${v.bafStandardNotes}`] : []),
            `@deepseek-ai/dsh-baf-quality: ${v.bafQuality}`,
            ...(v.bafQualityNotes ? [`  · ${v.bafQualityNotes}`] : []),
            `@deepseek-ai/dsh-baf-guard: ${v.bafGuard}`,
            ...(v.bafGuardNotes ? [`  · ${v.bafGuardNotes}`] : []),
            `@deepseek-ai/dsh-baf-scaffold: ${v.bafScaffold}`,
            ...(v.bafScaffoldNotes ? [`  · ${v.bafScaffoldNotes}`] : []),
          ],
        },
        {
          title: '来源',
          lines: [
            v.source,
            'CLI 入口：dsh --profile baf-cli -- <subcommand>',
          ],
        },
      ]
    })()) + '\n', 0))

  program.command('welcome')
    .description(`${slashDesc('/baf-welcome')}（与 /baf-welcome 同源渲染）`)
    .action(async () => {
      const opts = program.opts<{ cwd?: string }>()
      const cwd = readCwd(opts)
      if (cwd === undefined) fromDrive(missingCwd('baf welcome'))
      const ctx = getCtx()
      // Same three calls as the slash handler, in the same order, so the
      // Terminal card and the in-session card cannot drift (§9.1).
      const [probe, binding] = await Promise.all([
        probeToolchain(cwd, ctx === undefined ? {} : probeMountFlags(ctx)),
        resolveStartupBinding(cwd),
      ])
      fromDrive(toCli(renderWelcomeCard({ cwd, probe, binding })))
    })

  program.command('doctor')
    .description(slashDesc('/baf-doctor'))
    .action(async () => {
      const opts = program.opts<{ cwd?: string }>()
      const cwd = readCwd(opts)
      const cwdOk = cwd !== undefined
      const ok = cwdOk
      const ctx = getCtx()
      const probe = cwd === undefined ? undefined : await probeToolchain(cwd, ctx === undefined ? {} : probeMountFlags(ctx))
      emit(ok, formatCommandReport(
        ok,
        cardTitle('/baf-doctor', ok ? '通过' : '缺少工作区'),
        [
          {
            title: '检查项',
            lines: [
              `cwd: ${ok ? cwd : '（missing）'}`,
              'profile: baf-cli（当前 dsh 会话）',
              'commands: help/welcome/version/doctor/status/list 可见',
              'drives: go + workflow-open/classify/clarify/design/plan/implement/verify/archive/abandon/resume + check-quality/guard',
              'workflow tab: 请打开桌面「工作流」页签核对流程图',
            ],
          },
          ...(probe === undefined ? [] : [{ title: '工具链体检', lines: renderProbeLines(probe) }]),
          {
            title: '续跑提示',
            lines: [
              '状态落在工作区 .baf/projection/，与会话 id 无关',
              '同 cwd 新开 dsh 会话可继续；换机需同步该目录（或整仓）',
            ],
          },
        ],
      ) + '\n', ok ? 0 : 1)
    })

  program.command('status')
    .description(slashDesc('/baf-status'))
    .action(async () => {
      const opts = program.opts<{ cwd?: string }>()
      const cwd = readCwd(opts)
      if (cwd === undefined) fromDrive(missingCwd('baf status'))
      const store = new ProjectionStore({ workspaceRoot: cwd })
      const index = await store.readIndex()
      const ids = index.changes.map(c => c.changeId)
      if (ids.length === 0) {
        emit(true, formatCommandReport(true, cardTitle('/baf-status', '模板（空闲）· 无活动变更'), [
          { title: '工作区', lines: [`cwd: ${cwd}`] },
          { title: '变更', lines: ['（无）— 流程图为参考模板'] },
          { title: '模式说明', lines: MODE_LINES },
        ]) + '\n', 0)
      }
      const changeId = ids.at(-1)
      if (changeId === undefined) {
        emit(true, formatCommandReport(true, cardTitle('/baf-status', '模板（空闲）· 无活动变更'), [
          { title: '工作区', lines: [`cwd: ${cwd}`] },
          { title: '变更', lines: ['（无）'] },
        ]) + '\n', 0)
      }
      const status = await store.readStatus(changeId)
      const others = index.changes
        .filter(c => c.changeId !== changeId)
        .map(c => `${c.changeId} · ${modeZh(c.mode)} · ${String(c.current)}`)
      emit(true, formatCommandReport(
        true,
        cardTitle('/baf-status', `${modeZh(status.mode)} · 当前 ${String(status.current)}`),
        [
          {
            title: '焦点变更',
            lines: [
              `change: ${status.changeId}`,
              `mode: ${status.mode}（${modeZh(status.mode)}）`,
              `current: ${String(status.current)}`,
              `projection: v${status.projectionVersion}`,
              status.intake === undefined
                ? 'intake: （无）'
                : `intake: ${status.intake.kind} / ${status.intake.mode} / ${status.intake.confirmation}`,
            ],
          },
          { title: '同工作区其他变更', lines: others.length === 0 ? ['（无）'] : others },
          { title: '工作区', lines: [`cwd: ${cwd}`] },
          { title: '模式说明', lines: MODE_LINES },
        ],
      ) + '\n', 0)
    })

  program.command('list')
    .description(slashDesc('/baf-list'))
    .action(async () => {
      const opts = program.opts<{ cwd?: string }>()
      const cwd = readCwd(opts)
      if (cwd === undefined) fromDrive(missingCwd('baf list'))
      const store = new ProjectionStore({ workspaceRoot: cwd })
      const index = await store.readIndex()
      const rows = index.changes.map(c => `${c.changeId} · ${modeZh(c.mode)} · ${String(c.current)} · ${c.updatedAt}`)
      emit(true, formatCommandReport(true, cardTitle('/baf-list', `${rows.length} 条变更`), [
        { title: '变更', lines: rows.length === 0 ? ['（无）'] : rows },
        { title: '工作区', lines: [`cwd: ${cwd}`] },
      ]) + '\n', 0)
    })

  // Drives — every stage / check subcommand delegates to the same drive the
  // slash handler uses, so the CLI and slash outputs are bit-identical except
  // for the cwd source. The subcommand name follows the slash name (with the
  // `baf-` prefix stripped), so `baf workflow-open` mirrors `/baf-workflow-open`.
  function driveCommand(
    subcommand: string,
    slash: string,
    run: (cwd: string, rawInput: string) => Promise<CommandResult>,
  ): void {
    program.command(subcommand)
      .description(`${slashDesc(slash)}（与 ${slash} 同源 drive）`)
      .allowUnknownOption(true)
      .argument('[args...]', 'key=value pairs (description=…, files=…, test=…, testCmd=…)')
      .action(async (args: string[]) => {
        const opts = program.opts<{ cwd?: string }>()
        const cwd = readCwd(opts)
        if (cwd === undefined) {
          emit(false, missingCwd(`baf ${subcommand}`).text, 1)
          return
        }
        const raw = args.join(' ')
        const r = toCli(await run(cwd, raw))
        emit(r.ok, r.text, r.ok ? 0 : 1)
      })
  }

  // `baf go` needs the same adapter wiring as `baf workflow-verify`: the
  // coordinator runs verify when it chains into it, so a CLI invocation must
  // see the wired StackAdapter / GuardPolicy rows too.
  program.command('go')
    .description(`${slashDesc('/baf-go')}（与 /baf-go 同源 drive；自动推进到下一个确认点）`)
    .allowUnknownOption(true)
    .argument('[args...]', 'key=value pairs (change=…, continue, 或漂移复位目标节点)')
    .action(async (args: string[]) => {
      const opts = program.opts<{ cwd?: string }>()
      const cwd = readCwd(opts)
      if (cwd === undefined) {
        emit(false, missingCwd('baf go').text, 1)
        return
      }
      const ctx = getCtx()
      const { stack, guard } = ctx === undefined ? {} : resolveAdapters(ctx, cwd)
      const r = toCli(await driveGo({
        cwd,
        rawInput: args.join(' '),
        focus: focusFor(cwd),
        adapters: {
          ...(stack === undefined ? {} : { stack }),
          ...(guard === undefined ? {} : { guard }),
        },
      }))
      emit(r.ok, r.text, r.ok ? 0 : 1)
    })

  driveCommand('workflow-open', '/baf-workflow-open', driveOpen)
  driveCommand('workflow-classify', '/baf-workflow-classify', driveClassify)
  driveCommand('workflow-clarify', '/baf-workflow-clarify', driveClarify)
  driveCommand('workflow-design', '/baf-workflow-design', driveDesign)
  driveCommand('workflow-plan', '/baf-workflow-plan', drivePlan)
  driveCommand('workflow-implement', '/baf-workflow-implement', driveImplement)

  program.command('workflow-verify')
    .description(`${slashDesc('/baf-workflow-verify')}（与 /baf-workflow-verify 同源 drive；可挂 StackAdapter / GuardPolicy）`)
    .allowUnknownOption(true)
    .argument('[args...]', 'key=value pairs')
    .action(async (args: string[]) => {
      const opts = program.opts<{ cwd?: string }>()
      const cwd = readCwd(opts)
      if (cwd === undefined) {
        emit(false, missingCwd('baf workflow-verify').text, 1)
        return
      }
      const raw = args.join(' ')
      // Drives need a ctx-shaped adapter source; the CLI uses the same
      // `resolveAdapters` pattern as the slash handler but reads from the
      // host context the launcher provides.
      const ctx = getCtx()
      const { stack, guard } = ctx === undefined ? {} : resolveAdapters(ctx, cwd)
      const r = toCli(await driveVerify(cwd, raw, {
        ...(stack === undefined ? {} : { stack }),
        ...(guard === undefined ? {} : { guard }),
      }))
      emit(r.ok, r.text, r.ok ? 0 : 1)
    })

  driveCommand('workflow-archive', '/baf-workflow-archive', driveArchive)
  driveCommand('workflow-abandon', '/baf-workflow-abandon', driveAbandon)
  driveCommand('workflow-resume', '/baf-workflow-resume', driveResume)

  program.command('check-quality')
    .description(`${slashDesc('/baf-check-quality')}（与 /baf-check-quality 同源 drive）`)
    .action(async () => {
      const opts = program.opts<{ cwd?: string }>()
      const cwd = readCwd(opts)
      if (cwd === undefined) {
        emit(false, missingCwd('baf check-quality').text, 1)
        return
      }
      const ctx = getCtx()
      const { stack } = ctx === undefined ? {} : resolveAdapters(ctx, cwd)
      const r = toCli(await driveQuality(cwd, { ...(stack === undefined ? {} : { stack }) }))
      emit(r.ok, r.text, r.ok ? 0 : 1)
    })

  program.command('check-guard')
    .description(`${slashDesc('/baf-check-guard')}（与 /baf-check-guard 同源 drive）`)
    .action(async () => {
      const opts = program.opts<{ cwd?: string }>()
      const cwd = readCwd(opts)
      if (cwd === undefined) {
        emit(false, missingCwd('baf check-guard').text, 1)
        return
      }
      const ctx = getCtx()
      const { guard } = ctx === undefined ? {} : resolveAdapters(ctx, cwd)
      const r = toCli(await driveGuard(cwd, { ...(guard === undefined ? {} : { guard }) }))
      emit(r.ok, r.text, r.ok ? 0 : 1)
    })

  return program
}

/**
 * Carry the host context the row's `apply(ctx)` received. The drive handlers
 * need a `ctx` to resolve `bafQuality` / `bafGuard` services; without it they
 * surface the "服务未挂挂" card, which is the documented fallback when the
 * profile did not mount those rows.
 */
let hostCtx: Context | undefined

export function setBafCliContext(ctx: Context | undefined): void {
  hostCtx = ctx
}

function getCtx(): Context | undefined {
  return hostCtx
}

/**
 * Apply the CLI row into the booted dsh tree. Builds the Commander program,
 * parses the launcher's inner argv via `parseCmdline`, and exits on terminal
 * conditions (help / version / parse error). Drives are dispatched through
 * the same `command-drives.ts` modules the slash handlers use.
 * @param ctx - the host context carrying `cmdlineArgs` and `appExit`.
 */
export function apply(ctx: Context): void {
  setBafCliContext(ctx)
  ctx.effect(() => () => { setBafCliContext(undefined) }, 'baf-cli: clear host context')
  const program = buildBafProgram()
  parseCmdline(ctx, program)
}
