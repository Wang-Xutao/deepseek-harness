/**
 * BAF 会话启动门（§18.3）: bind the session, probe the mandatory toolchain,
 * print both as the BAF welcome card.
 *
 * Three things happen at session open, and they happen together:
 *
 * 1. **Binding** (§18.3.1): count the non-terminal changes in
 *    `<workspace>/.baf/projection/index.json` and print the `0 / 1 / >= 2`
 *    branch. The gate **never binds for the customer** — §18.6 guard 4 makes
 *    even a lone candidate the customer's own call, so the card states the
 *    candidates and the next command to type.
 * 2. **Toolchain probe** (§18.3.2): read-only checks for workspace, baseline,
 *    Git, OpenSpec, guard/quality mounts and versions. The C toolchain is
 *    deliberately **not** spawned here (§21.4) — it reports `未探测` and the
 *    real probe belongs to the verify-stage QualityRunner.
 * 3. **The welcome card** (§20.3): one card, printed before the first model
 *    turn, which doubles as the BAF-mode greeting (requirement 6).
 *
 * **Two audiences, two channels** — the same snapshot is rendered twice:
 *
 * - the customer reads the card in the conversation. The gate fires
 *   `/baf-welcome` through `ctx.commands.execute`, which is the only mechanism
 *   in dsh that puts a card in the transcript before the first turn. It is
 *   *not* a session event: `system/message` requires an open turn
 *   (`session/invariant.ts`), and a synthetic `user/message` would put words
 *   in the customer's mouth. When the probe trips a registered §22 gate (no
 *   baseline → scaffold), a second `/baf-gate scaffold` execution pops the
 *   standard gate card as its own card — 修复/忽略 is decided there, never
 *   inside the welcome card.
 * - the model reads the same facts as a system-prompt section, which is what
 *   makes requirement 1 real on the model side: the session knows whether it
 *   is bound to a change, and knows which tools are missing, without spending
 *   a turn discovering it.
 *
 * The probe is cached per workspace for {@link PROBE_TTL_MS} so the row firing
 * `/baf-welcome` and the command handler itself share **one** probe — the
 * welcome path spawns `git`/`openspec` exactly once.
 *
 * Failure containment (§17.7 R19): nothing here may block or break session
 * creation. Every probe degrades to `未探测` on timeout, missing entries are
 * rendered with a hint instead of thrown, and the whole card render is wrapped
 * so a broken workspace still yields an openable session.
 *
 * @module @deepseek-ai/dsh-baf-workflow/session-gate
 */

import { exec, execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
// Type-only: brings the `'agent-preset/selected'` Events declaration into this
// compilation face (the registry emits it app-wide; no runtime import).
import type {} from '@deepseek-ai/dsh-agent-preset-registry/types'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import { isBafError } from '@deepseek-ai/dsh-baf-core'
import { loadBaselineFile } from '@deepseek-ai/dsh-baf-core'
import { createLocalOpenSpecAdapter } from '@deepseek-ai/dsh-baf-openspec'
import { formatCommandReport, modeZh } from './command-format.ts'
import { listActiveChanges, ProjectionStore, type ProjectionIndexEntry } from './projection.ts'
import type { ScaffoldAdapterOptions, ScaffoldAdapterOutcome } from './pipeline-factory.ts'
import { resolveBafProductVersions, type BafProductVersions } from './product-versions.ts'

/** Preset row id / module name installed by `presets/baf/agent.cordis.yml`. */
export const name = 'baf-session-gate'

/**
 * The row reaches the host `agents` registry (per-agent install, like
 * `baf-guard-install`) and the host `commands` registry (it fires the welcome
 * card). Both are host-plane services, so this row must stay **outside** the
 * `baf-domain` isolate group.
 */
export const inject = ['agents', 'commands']

/** The command the gate fires at session open. Registered by `commands.ts`. */
export const WELCOME_COMMAND = '/baf-welcome'

/**
 * The §22 gate-card command the gate may fire **after** the welcome card.
 * Registered by `commands.ts`; `renderGate` (the §22 registry) is the single
 * source of its text, so the popped card is byte-identical to the one the Tab
 * pendingGate and the `baf_gate_ask` tool render.
 */
export const STARTUP_GATE_COMMAND = '/baf-gate'

/**
 * Prompt-section position. `PLAN_POLICY` (500) and `TEAM_POLICY` (600) are the
 * existing policy slots; the gate states policy too, so it sits with them and
 * ahead of the tool docs (`PTC_ONLY` 800) — a session's binding must be known
 * before it reads how to use `write`.
 */
const SECTION_ORDER = 605

/** Prompt-section name. Namespaced like `deployment:persona-prefix`. */
const SECTION_NAME = 'baf:session-gate'

/** Per-item probe budget (§18.3.2). */
const DEFAULT_TIMEOUT_MS = 1500

/** How long one workspace's probe stays fresh for other callers. */
const PROBE_TTL_MS = 30_000

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)

/** Probe outcome for one item. `info` renders without a §20.5 symbol. */
export type ProbeState = 'ok' | 'missing' | 'unknown' | 'info'

/** One line of the 【环境体检】 section. */
export interface ToolchainItem {
  /** Stable key (also the L3 log key). */
  readonly key: string
  /** Symbol-bearing outcome. */
  readonly state: ProbeState
  /** Left column label, e.g. `workspace`. */
  readonly label: string
  /** Right column detail — the fact, not a sentence. */
  readonly detail: string
  /** One-line, directly actionable remedy. Present only when something is missing. */
  readonly hint?: string
}

/** Result of one read-only toolchain probe. */
export interface ToolchainProbe {
  readonly items: readonly ToolchainItem[]
  /** Unix epoch ms the probe finished. */
  readonly at: number
}

/** What the workspace's projection says at session open (§18.3.1). */
export interface StartupBinding {
  /** Non-terminal changes, oldest first. `length` picks the card branch. */
  readonly actives: readonly ProjectionIndexEntry[]
  /**
   * §13 R4 — change ids whose working tree differs from the locked baseline
   * at session open. Empty when nothing is drifted. The startup card surfaces
   * these as a one-line hint pointing the customer at `/baf-workflow-resume`,
   * so a drift detected while the user was away is not silently dropped
   * until the user manually refreshes the Tab.
   */
  readonly drifted: ReadonlySet<string>
}

/** Options for {@link probeToolchain}. */
export interface ProbeOptions {
  /** Whether `baf-guard` is mounted in this composition. */
  readonly guardMounted?: boolean
  /** Whether `baf-quality` is mounted in this composition. */
  readonly qualityMounted?: boolean
  /** Per-item wall-clock budget in ms. */
  readonly timeoutMs?: number
}

/** The snapshot the prompt section reads (filled by the async gate run). */
export interface GateSnapshot {
  readonly cwd: string
  readonly probe: ToolchainProbe
  readonly binding: StartupBinding
  readonly at: number
}

const probeCache = new Map<string, ToolchainProbe>()
const snapshotCache = new Map<string, GateSnapshot>()
const inflight = new Map<Agent, AbortController>()
/**
 * Agents whose welcome card has already fired. Module-level on purpose: the
 * row can be applied more than once for one process (preset reload, a second
 * mount of the same composition), and each `apply` gets a fresh `fibers`
 * map — so the `fibers.has` check cannot see a previous run. Without this
 * set, a re-apply after the agent exists fires a SECOND welcome + gate card
 * into the same session (the "双触发" bug — its regression test is the
 * double-trigger guard in `session-gate.spec.ts`).
 */
const gateFired = new WeakSet<Agent>()

/**
 * Drop every cached probe/snapshot. Tests call this between workspaces; the
 * row never does (a workspace's probe stays fresh for one card render).
 */
export function resetSessionGateCache(): void {
  probeCache.clear()
  snapshotCache.clear()
}

/**
 * The gate's snapshot for a workspace, as the prompt section sees it.
 * @param cwd - workspace root.
 * @returns snapshot, or undefined when the gate has not run for this cwd yet.
 */
export function gateSnapshotFor(cwd: string): GateSnapshot | undefined {
  return snapshotCache.get(cwd)
}

/**
 * Read-only probe of the mandatory toolchain (§18.3.2).
 *
 * Every item is independent: a failure is a `missing` row with a hint, never a
 * throw. Spawned commands (Git, OpenSpec) are bounded by `timeoutMs` and
 * degrade to `unknown` — §17.7 R19 is explicit that a hung external tool must
 * not hold the first screen.
 * @param cwd - workspace root.
 * @param options - mount flags and per-item budget.
 * @returns probe rows in card order.
 */
export async function probeToolchain(cwd: string, options: ProbeOptions = {}): Promise<ToolchainProbe> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const cacheKey = `${cwd}\u0000${options.guardMounted === true ? 1 : 0}${options.qualityMounted === true ? 1 : 0}`
  const cached = probeCache.get(cacheKey)
  if (cached !== undefined && Date.now() - cached.at < PROBE_TTL_MS) return cached

  const baseline = await probeBaseline(cwd)
  const probe: ToolchainProbe = {
    at: Date.now(),
    items: [
      await probeWorkspace(cwd),
      baseline.item,
      await probeGit(cwd, timeoutMs),
      await probeOpenSpec(cwd, timeoutMs, baseline.requireOpenSpec),
      cToolchainItem(),
      mountsItem(options),
      versionItem(),
    ],
  }
  probeCache.set(cacheKey, probe)
  return probe
}

/**
 * Which branch the startup card renders (§18.3.1).
 *
 * Lists the workspace's non-terminal changes through the shared
 * {@link listActiveChanges} helper so the welcome card, the Tab dashboard,
 * and `/baf-status` agree on the same active set (§13 issue #2). Also runs
 * a cheap drift probe (§13 R4) — `git status --porcelain` against the locked
 * baseline — so the welcome card can flag a drift the customer did not see
 * because they were away from the workspace when the index changed.
 *
 * Failure containment: a non-zero git exit, a missing `.git/`, or a missing
 * baseline all degrade to `drifted: ∅`. The probe is read-only and runs with
 * a 5s ceiling per active change.
 * @param cwd - workspace root.
 * @returns the non-terminal changes of that workspace + the drifted subset.
 */
export async function resolveStartupBinding(cwd: string): Promise<StartupBinding> {
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const actives = await listActiveChanges(store)
  const drifted = new Set<string>()
  for (const entry of actives) {
    const hasDrift = await probeDriftFor(cwd, store, entry.changeId)
    if (hasDrift) drifted.add(entry.changeId)
  }
  return { actives, drifted }
}

/**
 * §13 R4 — return true when the working tree differs from the locked
 * baseline. Lightweight: a single `git status --porcelain` is enough to
 * know whether anything changed since the projection was locked. We do not
 * compare individual file content here — the full drift detection (with
 * `DriftSignal` shape) lives in `stages/drift.ts` and is only run when the
 * user types `/baf-workflow-resume` or clicks the Tab drift card.
 */
async function probeDriftFor(cwd: string, store: ProjectionStore, changeId: string): Promise<boolean> {
  try {
    const status = await store.readStatus(changeId)
    const baselineRevision = status.baseline?.sourceRevision
    if (baselineRevision === undefined) return false
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execFileAsync = promisify(execFile)
    const { stdout } = await execFileAsync(
      'git',
      ['status', '--porcelain'],
      { cwd, timeout: 5_000, windowsHide: true },
    ).catch(() => ({ stdout: '' }))
    return stdout.trim() !== ''
  } catch {
    return false
  }
}

/**
 * Render the §20.3 welcome card.
 * @param input - workspace, probe, binding.
 * @returns the command result the customer sees.
 */
/**
 * One-line summary of a `baf-guard` report (the verify + secret-scan sweep
 * run on `baf-welcome`). Rendered in the welcome card under 【环境体检】 as a
 * single short line so the customer sees the environment is OK at session
 * open, instead of having to type `/baf-check-guard` by hand. Plain Chinese by
 * design: success/failure state plus the count of touched files examined, with
 * no internal ids.
 */
export interface GuardReportSummary {
  readonly state: 'ok' | 'fail' | 'unavailable'
  readonly detail: string
  readonly hint?: string
}

/**
 * Render the §20.3 welcome card.
 *
 * The card includes a 【安全检查】 line summarising the `baf-guard` sweep.
 * `guardSummary` is optional: when the welcome fires from `runSessionGate`
 * (the session-open path) the gate has already run the guard in parallel
 * with the toolchain probe, so the summary lands as one extra line. When it
 * fires from the `/baf-welcome` slash handler it runs the guard inline and
 * renders whatever comes back. When the `baf-guard` service is absent (CLI /
 * tests), `state` is `unavailable` and the line renders as 「已跳过」 — the
 * customer's environment isn't broken; the sweep just lives in a different
 * process.
 * @param input - workspace, probe, binding, optional guard summary.
 * @returns the command result the customer sees.
 */
export function renderWelcomeCard(input: {
  readonly cwd: string
  readonly probe: ToolchainProbe
  readonly binding: StartupBinding
  readonly guardSummary?: GuardReportSummary
}): CommandResult {
  const { cwd, probe, binding, guardSummary } = input
  const actives = binding.actives
  const headline = `BAF 已就绪 · ${basename(cwd) || cwd} · ${bindingConclusion(binding)}`

  const sections: { title: string; lines: readonly string[] }[] = [
    { title: '当前状态', lines: bindingLines(actives) },
    { title: '下一步', lines: nextStepLines(actives, binding.drifted) },
    { title: '环境体检', lines: renderProbeLines(probe) },
    ...(guardSummary === undefined
      ? []
      : [{ title: '安全检查', lines: renderGuardSummaryLines(guardSummary) }]),
    {
      title: '常用命令',
      lines: [
        '/baf-welcome                 重新显示本卡（状态 + 体检）',
        '/baf-go                      把工作流推进到下一个需要你确认的点',
        '/baf-go-confirm              不弹确认框，直接继续工作流',
        '/baf-gate [名称]             重新弹出确认卡（如 scaffold）',
        '/baf-workflow-resume [阶段]   流程出现偏差后，退回指定阶段重来',
        '/baf-status                  完整状态 · /baf-doctor 体检明细',
        '/baf-help                    全部命令与用法',
      ],
    },
  ]
  return { kind: 'success', text: formatCommandReport(true, headline, sections) }
}

/**
 * 【安全检查】 section lines: one short, plain-Chinese summary. The customer
 * should be able to tell at a glance whether the workspace passed — without
 * knowing what `verify` or `secret-scan` are.
 */
function renderGuardSummaryLines(summary: GuardReportSummary): readonly string[] {
  const head = summary.state === 'ok'
    ? `✓ 安全检查  通过 · ${summary.detail}`
    : summary.state === 'fail'
      ? `✗ 安全检查  未通过 · ${summary.detail}`
      : `? 安全检查  ${summary.detail}`
  return summary.hint === undefined ? [head] : [head, `   → 怎么处理：${summary.hint}`]
}

/**
 * §22.14-D: the standard gate card to pop as its own card **after** the
 * welcome, when the probe trips a registered §22 gate. Registry-driven by
 * construction: only probes a registered gate can resolve trip a pop (baseline
 * missing → `scaffold`); other missing rows keep their `↳` hint line in
 * 【环境体检】 instead. The welcome card itself never splices gate sections in
 * — that produced a second 【下一步】 and buried the options.
 * @param probe - the same probe the welcome card rendered.
 * @returns the slash command to execute, or undefined when nothing to pop.
 */
export function startupGateCardFor(probe: ToolchainProbe): string | undefined {
  const baseline = probe.items.find(i => i.key === 'baseline')
  return baseline !== undefined && baseline.state === 'missing'
    ? `${STARTUP_GATE_COMMAND} scaffold`
    : undefined
}

/**
 * The §20.4 L3 log line for one gate run.
 * @param snapshot - gate snapshot.
 * @param versions - product versions (already resolved by the caller).
 * @returns one `key=value` log line, metadata only.
 */
export function sessionGateLogLine(snapshot: GateSnapshot): string {
  const actives = snapshot.binding.actives
  const binding = actives.length === 0 ? 'none' : actives.length === 1 ? 'one' : 'many'
  const change = actives.length === 1 ? actives[0]?.changeId : undefined
  const states = snapshot.probe.items
    .map(item => `${item.key.replaceAll('-', '_')}=${item.state}`)
    .join(' ')
  return `[baf] ${new Date(snapshot.at).toISOString()} - session ${SECTION_NAME} binding=${binding}`
    + ` actives=${actives.length}${change === undefined ? '' : ` change=${change}`} ${states}`
}

/**
 * The model-facing section text (§18.3.3: guidance, not a gate).
 *
 * Reads the cached snapshot so the provider stays synchronous — the probe runs
 * once, asynchronously, when the agent is created.
 * @param cwd - workspace root.
 * @returns prompt text for the session-gate section.
 */
export function sessionGateSection(cwd: string): string {
  const snapshot = snapshotCache.get(cwd)
  const rules = [
    '分类确认前不得修改源码；实现阶段只改 allowlist 内文件。',
    '阶段推进只经 /baf-go 或工作流页签，自然语言不是转换证据。',
    '两个确认门（design 完成 → plan、verify 通过 → archive）只认客户在确认框点「确认」、工作流页签按钮，或 /baf-go-confirm。',
    // §22 rule #4: when blocked by a gate, the only action is to call
    // `baf_gate_ask(gateId)` (§22.9 / §22.17) and read the registered gate card
    // verbatim — never invent a third option, never propose "模型手写 scaffold"
    // or any other path outside the registry. Customer's typed agreement is
    // not evidence; point them at the Tab button or the mapped slash command.
    '被确认门挡住时，唯一动作是调用 baf_gate_ask(gateId)：它会向客户弹出确认框并等待选择，返回的就是选择后的真实结果；选项由注册表决定，不得自创、改写或在卡外建议其他路径；客户没选就如实说明，口头同意不是证据。',
    // §22.19 (session 7.jsonl user principle): the workflow line is
    // harness-owned. The system itself re-derives the resting point after
    // every completed turn and pops the due gate — so the model never needs
    // to instruct the customer through manual UI steps. The old wording
    // (「请客户点工作流页签/输入命令」) was complaint #4's exact origin: the
    // customer was told to do the harness's job.
    '工作流何时弹卡、何时等待、何时推进由系统固定驱动：你每个回合结束后，系统会自动弹出到期的确认卡（分类/推进/确认门/复位/接手选择）。客户没点选时，如实说明状态即可，不得指导客户点页签按钮、敲斜杠命令或复述操作步骤——弹卡是系统的事，你只做业务内容。',
    // §22.17 as-built hardening: a model that cannot reach a gate (service
    // missing) must NOT fill the vacuum with a self-made question — generic
    // ask tools (ask_user_question) pop real dialogs, so invented options
    // look exactly like registry gates to the customer. Workflow decisions
    // (classification, gates, initialization) go through baf_gate_ask only.
    '不得用通用提问工具（如 ask_user_question）替代确认门、预演分类或为工作流决策自创选项：初始化、分类、确认门、放弃、复位等工作流决策只能经 baf_gate_ask 弹出的注册表选项或对应斜杠指令；通用提问工具只用于与工作流走向无关、且不带选项的纯文本澄清。',
    // 2026-09-21 standing rule (session 6.jsonl): the model twice ended a
    // live workflow on an unanswered prose choice — once an "A or B" bridge
    // over the active-change collision, once a 「问题1 A/B · 问题2 A/B/C，请回
    // 1A 2C」 artifact question. Every choice the customer must make pops a
    // card they click; a typed letter is not a click and not evidence.
    '需要客户在多个选项里做选择时（无论是否影响工作流走向），必须以弹窗卡让客户点选：工作流决策用 baf_gate_ask，其余一切选择用 baf_question_ask（工具会等待客户点选并返回真实结果）。不得在消息里罗列 A/B/C 选项让客户回复编号或字母（如「回 1A 2C」）；客户没点选就如实说明，不得把聊天里的字母或口头同意当作点选结果。',
    // §22.17 I: every workflow-advancing decision pops a registry dialog the
    // customer clicks — including "the customer just stated a requirement".
    // The tool's requirement bootstrap is the sanctioned one-call path; prose
    // step lists and "请输入 /baf-xxx 命令" hand-offs leave the decision
    // un-popped (2026-09-20 incident).
    '客户陈述新需求（工作区已初始化、无进行中变更）时，唯一动作是调用 baf_gate_ask（gateId=intake-classify，requirement=客户原话）：工具会建立变更并弹出分类确认卡，客户点选后返回真实结果；工作区未初始化时该调用会自动弹初始化确认卡。不得用文字罗列手动步骤、不得让客户自己拼命令。',
    // Customer-facing questions whose answers reroute the workflow: the
    // workflow impact must be IN the question and every option, not implied.
    // A scope answer that silently flips the full path ↔ the bug-fix path (or
    // skips a stage / rebuilds behavior) is a workflow decision made in
    // disguise. Use plain customer words (完整流程 / 缺陷修复路径), never
    // internal ids or section numbers.
    '向客户提出会影响工作流走向的问题（范围/模式/取舍类澄清）时，必须把工作流影响写进问题和每个选项，且用客户能懂的话，如「（走完整流程，七个阶段）」「（走缺陷修复路径，更快）」「（按 PDF 重做状态机，可能改变现有迁移行为）」；不得出现内部编号或术语（如 §22、gate、full-go-path、bug-fix-path），不得只列技术差异，让客户在不知情时选择工作流。',
  ]
  if (snapshot === undefined) {
    return [
      '## BAF 启动门（会话已绑定工作区，体检进行中）',
      `- 工作区: ${cwd}`,
      '- 体检: 进行中 —— 结果会出现在会话首屏的启动卡上；客户可直接描述需求。',
      ...rules.map(rule => `- ${rule}`),
    ].join('\n')
  }
  const actives = snapshot.binding.actives
  const binding = actives.length === 0
    ? '没有进行中的工作流 —— 客户描述需求后走分类确认，不要自行假设已有变更'
    : actives.map(row => `${row.changeId}（${modeZh(row.mode)} · 当前 ${row.current}）`).join('、')
      + ' —— 客户未确认前，本会话不得把它们当作已绑定的工作流'
  const probe = snapshot.probe.items
    .map(item => `${item.label}${markOf(item.state)}${item.state === 'ok' ? '' : `（${item.detail}${item.hint === undefined ? '' : ` · ${item.hint}`}）`}`)
    .join(' · ')
  return [
    '## BAF 启动门（本会话事实）',
    `- 工作区: ${cwd}`,
    `- 绑定: ${binding}`,
    `- 必须工具链: ${probe}`,
    ...rules.map(rule => `- ${rule}`),
  ].join('\n')
}

/**
 * Run the gate for one agent: probe, log, then fire the welcome card.
 *
 * Called from the preset row's `agent/created` handler. Never throws: a gate
 * failure is a log line, because a broken workspace must still open a session.
 * @param ctx - standing-mount context carrying `commands` and `logger`.
 * @param agent - the agent that just appeared.
 */
export async function runSessionGate(ctx: Context, agent: Agent): Promise<void> {
  const cwd = agent.session.header.cwd
  if (cwd === undefined || cwd === '') return
  const controller = new AbortController()
  inflight.set(agent, controller)
  try {
    const probe = await probeToolchain(cwd, { ...probeMountFlags(ctx, agent) })
    const binding = await resolveStartupBinding(cwd)
    const snapshot: GateSnapshot = { cwd, probe, binding, at: Date.now() }
    snapshotCache.set(cwd, snapshot)
    ctx.logger.info(sessionGateLogLine(snapshot))
    const execution = await ctx.commands.execute(agent, WELCOME_COMMAND, [], controller.signal)
    if (execution === undefined) {
      ctx.logger.warn(`baf-session-gate: ${WELCOME_COMMAND} is not registered; welcome card skipped`)
    }
    // §22.14-D: when the probe trips a registered gate (no baseline →
    // scaffold), pop the standard gate card as its own card right after the
    // welcome — the customer picks 修复/忽略 there, the welcome stays lean.
    // Same containment as the welcome fire: an absent command is a log line.
    const gateCard = startupGateCardFor(probe)
    if (gateCard !== undefined) {
      const gateExecution = await ctx.commands.execute(agent, gateCard, [], controller.signal)
      if (gateExecution === undefined) {
        ctx.logger.warn(`baf-session-gate: ${gateCard} is not registered; env gate card skipped`)
      }
    }
  } catch (error: unknown) {
    ctx.logger.warn(
      `baf-session-gate: welcome card failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  } finally {
    inflight.delete(agent)
  }
}

/**
 * Install the startup gate for every agent under this preset.
 * @param ctx - standing-mount context with `agents` and `commands`.
 */
export function apply(ctx: Context): void {
  const fibers = new Map<Agent, ReturnType<Context['inject']>>()

  const install = (agent: Agent): void => {
    if (fibers.has(agent)) return
    const cwd = agent.session.header.cwd
    const fiber = agent.ctx.inject(['systemPrompt'], (scope) => {
      scope.systemPrompt.section({
        name: SECTION_NAME,
        order: SECTION_ORDER,
        text: () => cwd === undefined || cwd === '' ? '' : sessionGateSection(cwd),
      })
    })
    fibers.set(agent, fiber)
    // Fire-and-forget: the first screen must not wait on the probe (§17.7 R20).
    if (gateFired.has(agent)) return
    gateFired.add(agent)
    void runSessionGate(ctx, agent)
  }

  const dispose = (agent: Agent): void => {
    gateFired.delete(agent)
    inflight.get(agent)?.abort()
    inflight.delete(agent)
    const fiber = fibers.get(agent)
    if (fiber === undefined) return
    fibers.delete(agent)
    void fiber.dispose().catch((error: unknown) => {
      ctx.logger.warn(
        `baf-session-gate: section cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    })
  }

  for (const agent of ctx.agents.list()) install(agent)
  ctx.on('agent/created', ({ agent }) => { install(agent) })
  ctx.on('agent/disposed', ({ agent }) => { dispose(agent) })
  // 【变更】2026-09-25 (post-master-merge regression): a blank session created
  // under one preset and then switched to BAF re-links its agent scope via the
  // registry's `recompose` WITHOUT re-firing `agent/created`, so the two paths
  // above never install it — the welcome card and the 启动门 prompt section
  // silently miss the session (demo8: header `standard`, then
  // `agent-preset/selected baf`, no gate at all). The registry re-emits
  // `'agent-preset/selected'` for every committed selection — string-name
  // events broadcast app-wide, so this standing mount hears it. Entering BAF
  // installs; leaving BAF unwinds (section fiber + gate dedupe) so the prompt
  // section never outlives the composition switch.
  ctx.on('agent-preset/selected', (sessionId, agentPreset) => {
    const agent = ctx.agents.get(sessionId)
    if (agent === undefined) return
    if (agentPreset === 'baf') install(agent)
    else dispose(agent)
  })
  ctx.effect(() => async () => {
    for (const controller of inflight.values()) controller.abort()
    inflight.clear()
    const pending = [...fibers.values()]
    for (const agent of fibers.keys()) gateFired.delete(agent)
    fibers.clear()
    await Promise.all(pending.map(fiber => fiber.dispose()))
  }, 'baf-session-gate: agent gates')
}

/**
 * Mount flags read from the composition, for the guard/quality row.
 *
 * The services live inside the `baf-domain` isolate. **Neither the host-plane
 * row ctx NOR the agent's realm ctx can see them** — `isolate` realms are
 * entry-local and invisible outside the group that declares them, including
 * to `agent.ctx.get` (verified against the packaged desktop 2026-09-20: the
 * welcome card reported 检查组件缺失 while the services were mounted). The
 * only sanctioned read channel is the `agentPresets` service's
 * `serviceFor(agent, name)` (agent-presets/index.ts), which scans the agent's
 * standing-mount fiber. Non-isolate compositions (CLI, tests) still resolve
 * via plain `ctx.get` — the two-scope fallback below.
 */
export function probeMountFlags(ctx: Context, agent?: { ctx?: Context }): ProbeOptions {
  return {
    guardMounted: resolveIsolateService(ctx, agent, 'bafGuard') !== undefined,
    qualityMounted: resolveIsolateService(ctx, agent, 'bafQuality') !== undefined,
  }
}

/** Structural view of the `agentPresets` service — no runtime dependency. */
interface AgentPresetsLike {
  serviceFor?: (agent: { ctx?: Context }, name: string) => unknown
}

/**
 * Resolve a service that a preset mounted behind an `isolate` realm.
 *
 * Channel 1 — `agentPresets.serviceFor(agent, name)`: the only read path that
 * crosses an isolate boundary (same API session-controller / skill-catalog
 * use). Channel 2 — plain `ctx.get` on the agent realm then the row ctx, for
 * compositions that mount the rows without an isolate (CLI profile, tests,
 * dev compositions) and for callers without an agent.
 *
 * @param ctx - the calling (host-plane) ctx.
 * @param agent - the receiving agent, when the caller has one.
 * @param name - service name as the preset's rows resolve it.
 * @returns the service instance, or undefined when no reachable realm defines it.
 */
export function resolveIsolateService<T = unknown>(
  ctx: Context,
  agent: { ctx?: Context } | undefined,
  name: string,
): T | undefined {
  if (agent?.ctx !== undefined) {
    try {
      const presets = ctx.get('agentPresets') as AgentPresetsLike | undefined
      const svc = presets?.serviceFor?.(agent, name)
      if (svc !== undefined) return svc as T
    } catch {
      // Composition without the agentPresets service — fall through to get().
    }
  }
  const scopes = agent?.ctx === undefined ? [ctx] : [agent.ctx, ctx]
  for (const scope of scopes) {
    try {
      const svc = scope.get(name)
      if (svc !== undefined) return svc as T
    } catch {
      // Realm without the definition — try the next scope.
    }
  }
  return undefined
}

/**
 * Resolve the `bafScaffold` service across realm boundaries. The service sits
 * inside the baf-domain isolate — a preset row outside an `isolate` realm
 * would publish process-global and fail the agent-presets mount invariant —
 * so host-plane callers (the `/baf-scaffold` slash handler, the §22.17 gate
 * dialog, the Tab Remote) read it through {@link resolveIsolateService}.
 * @param ctx - the calling (host-plane) ctx.
 * @param agent - the receiving agent, when the caller has one.
 * @returns the scaffold service, or undefined when no reachable realm defines it.
 */
export function resolveScaffoldService(
  ctx: Context,
  agent?: { ctx?: Context },
): { scaffold: (opts: ScaffoldAdapterOptions) => ScaffoldAdapterOutcome } | undefined {
  return resolveIsolateService(ctx, agent, 'bafScaffold')
}

/** 【环境体检】 rows: `符号 检查项 状态 · 详情`, remedy on its own indented
 * line. Also used by `/baf-doctor`. Plain-language by design: the label says
 * what was checked (Chinese), the status word says how it went, the hint says
 * what to do about it. */
export function renderProbeLines(probe: ToolchainProbe): readonly string[] {
  return probe.items.flatMap((item) => {
    const status = statusWordOf(item.state)
    const head = item.state === 'info'
      ? `${item.label.padEnd(10)} ${item.detail}`
      : `${markOf(item.state)} ${item.label.padEnd(10)} ${status === '' ? item.detail : `${status} · ${item.detail}`}`
    return item.hint === undefined ? [head] : [head, `   → 怎么处理：${item.hint}`]
  })
}

/** Plain status word per probe state (§20.5 symbols stay, words added). */
function statusWordOf(state: ProbeState): string {
  switch (state) {
    case 'ok': return '正常'
    case 'missing': return '缺失'
    case 'unknown': return '未确认'
    case 'info': return ''
  }
}

/** Card conclusion for the headline (§20.3). */
function bindingConclusion(binding: StartupBinding): string {
  const actives = binding.actives
  if (actives.length === 0) return '没有进行中的工作流'
  if (actives.length === 1) {
    const only = actives[0]
    return only === undefined
      ? '没有进行中的工作流'
      : `有一条没做完的工作流 ${only.changeId}（进行到 ${only.current}）`
  }
  return `有 ${actives.length} 条没做完的工作流 · 需要选一条继续`
}

/** §20.5 symbols. `info` rows carry no symbol at all. */
function markOf(state: ProbeState): string {
  switch (state) {
    case 'ok': return '✓'
    case 'missing': return '✗'
    case 'unknown': return '?'
    case 'info': return ' '
  }
}

/** 【当前状态】 rows. */
function bindingLines(actives: readonly ProjectionIndexEntry[]): readonly string[] {
  if (actives.length === 0) {
    return ['没有进行中的工作流 —— 直接描述你的需求即可开始，确认卡会自动弹出']
  }
  const rows = actives.map(
    row => `${row.changeId} · ${modeZh(row.mode)} · 进行到 ${row.current} · 最后活动 ${row.updatedAt || '（未知）'}`,
  )
  return ['工作区里有没做完的工作流（本会话还没接手哪一条）：', ...rows]
}

/** 【下一步】 rows — always a command the customer can actually type (§20.2). */
function nextStepLines(
  actives: readonly ProjectionIndexEntry[],
  drifted: ReadonlySet<string> = new Set(),
): readonly string[] {
  if (actives.length === 0) {
    return ['直接描述你的需求（自动进入分类确认）；也可回复 /baf-go 重新查看本卡。']
  }
  const only = actives.length === 1 ? actives[0]?.changeId : undefined
  const driftHint = drifted.size > 0
    ? [`检测到 ${drifted.size} 条工作流的实际改动和记录对不上：[${[...drifted].join(', ')}] — 回复 /baf-workflow-resume 退回重做`]
    : []
  return [
    ...driftHint,
    only === undefined
      ? '回复 /baf-go change=<编号> 指定接手哪一条（不会替你猜）'
      // A lone active change binds directly (2026-09-20 incident: the old
      // `continue`-word requirement stranded sessions that minted via the
      // tool/auto-pop or restarted the host — focus is process-local).
      : `回复 /baf-go 接着做 ${only}`,
    '想改做别的需求：先 /baf-workflow-abandon change=<编号> confirm 放弃当前这条，或新开一个会话',
  ]
}

/** 【版本】 line: product versions, `baf-*` folded when they agree. */
function versionLine(versions: BafProductVersions): string {
  const bafPackages = [
    versions.bafCore,
    versions.bafWorkflow,
    versions.bafOpenspec,
    versions.bafStandard,
    versions.bafQuality,
    versions.bafGuard,
    versions.bafScaffold,
  ]
  const uniform = bafPackages.every(v => v === bafPackages[0])
  const bafPart = uniform
    ? `baf-* ${bafPackages[0] ?? '未知'}`
    : `baf-core ${versions.bafCore} · baf-workflow ${versions.bafWorkflow} · baf-openspec ${versions.bafOpenspec}`
  return `版本         baf-dsh ${versions.bafDsh} · dsh ${versions.dsh} · ${bafPart}`
}

/** workspace row: the directory exists and is readable. */
async function probeWorkspace(cwd: string): Promise<ToolchainItem> {
  try {
    const s = await stat(cwd)
    return s.isDirectory()
      ? { key: 'workspace', state: 'ok', label: '工作区', detail: cwd }
      : {
        key: 'workspace',
        state: 'missing',
        label: '工作区',
        detail: `${cwd} 不是目录`,
        hint: '换一个工作区目录打开会话',
      }
  } catch {
    return {
      key: 'workspace',
      state: 'missing',
      label: '工作区',
      detail: `${cwd} 不存在`,
      hint: '换一个工作区目录打开会话',
    }
  }
}

/** baseline row: `.baf/baseline.yml` parses and satisfies bafCompatibility. */
async function probeBaseline(cwd: string): Promise<{ item: ToolchainItem; requireOpenSpec: boolean }> {
  const path = join(cwd, '.baf', 'baseline.yml')
  const missing = (detail: string): { item: ToolchainItem; requireOpenSpec: boolean } => ({
    item: {
      key: 'baseline',
      state: 'missing',
      label: '工作流配置',
      detail,
      hint: '点工作流页签的「初始化工作区」按钮，或输入 /baf-scaffold',
    },
    requireOpenSpec: true,
  })
  try {
    const manifest = await loadBaselineFile(path)
    return {
      item: {
        key: 'baseline',
        state: 'ok',
        label: '工作流配置',
        detail: `${manifest.baselineId} · baf ${manifest.bafCompatibility.min}–${manifest.bafCompatibility.max}`,
      },
      requireOpenSpec: manifest.workflow.requireOpenSpec,
    }
  } catch (error: unknown) {
    if (isBafError(error) && error.code === 'baseline_incompatible') {
      return missing('配置文件与当前版本不匹配（.baf/baseline.yml）')
    }
    return missing('还没有初始化（缺少 .baf/baseline.yml）')
  }
}

/** Git row: the revision the drift detector anchors on. */
async function probeGit(cwd: string, timeoutMs: number): Promise<ToolchainItem> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd,
      timeout: timeoutMs,
      windowsHide: true,
    })
    const revision = stdout.trim()
    return revision === ''
      ? { key: 'git', state: 'missing', label: 'Git 仓库', detail: '仓库还没有任何提交', hint: '先提交一次代码（git commit）' }
      : { key: 'git', state: 'ok', label: 'Git 仓库', detail: revision }
  } catch (error: unknown) {
    return {
      key: 'git',
      state: timedOut(error) ? 'unknown' : 'missing',
      label: 'Git 仓库',
      detail: timedOut(error) ? '超时，未能确认' : '不可用',
      hint: '初始化仓库并提交一次：git init && git commit',
    }
  }
}

/** OpenSpec row: layout present (via the adapter) + CLI executable. */
async function probeOpenSpec(
  cwd: string,
  timeoutMs: number,
  requireOpenSpec: boolean,
): Promise<ToolchainItem> {
  const cli = await probeOpenSpecCli(timeoutMs)
  const detection = await createLocalOpenSpecAdapter({ workspaceRoot: cwd }).detect({ workspace: { root: cwd } })
  const layout = detection.available
  const hint = '点「初始化工作区」生成 openspec/changes，或安装 OpenSpec 命令行工具'
  if (layout && cli.value !== undefined) {
    return { key: 'openspec', state: 'ok', label: 'OpenSpec 目录', detail: `${cli.value} · openspec/changes 存在` }
  }
  // A tool we could not interrogate is `?`, not `✗` (§20.5): reporting missing
  // here would send the customer to install a CLI that is already installed,
  // just slower than the item budget. The layout, which *is* detected, still
  // carries its remedy — that part is the customer's actual next step.
  if (cli.timedOut) {
    return {
      key: 'openspec',
      state: 'unknown',
      label: 'OpenSpec 目录',
      detail: `${layout ? 'openspec/changes 存在' : 'openspec/changes 缺失'} · 命令行工具超时，未能确认`,
      ...(layout ? {} : { hint: '点「初始化工作区」生成 openspec/changes' }),
    }
  }
  // A baseline that does not require OpenSpec makes the missing piece
  // informational: full-go-path will run without it, so a ✗ here would be a false
  // alarm. Only the baseline can say this — hence the flag threading.
  if (!requireOpenSpec && layout) {
    return {
      key: 'openspec',
      state: 'unknown',
      label: 'OpenSpec 目录',
      detail: '命令行工具未探测到 · 当前配置不强制要求',
    }
  }
  const parts = [
    cli.value === undefined ? '命令行工具不可用' : `${cli.value} · 命令行工具可用`,
    layout ? 'openspec/changes 存在' : 'openspec/changes 缺失',
  ]
  return { key: 'openspec', state: 'missing', label: 'OpenSpec 目录', detail: parts.join(' · '), hint }
}

/** Best-effort `openspec --version`; `value` is undefined when not runnable. */
async function probeOpenSpecCli(timeoutMs: number): Promise<{ value?: string; timedOut: boolean }> {
  // The command string is a literal — nothing from the workspace is
  // interpolated into it — so a shell is safe here and is the only thing that
  // works: on Windows the npm shim is `openspec.cmd`, which `execFile` refuses
  // to start with `shell: false` (Node's CVE-2024-27980 fix). The shell
  // resolves it through PATHEXT.
  const read = (stdout: string): string | undefined => {
    const text = stdout.trim()
    return text === '' ? undefined : (text.split(/\s+/).at(-1) ?? 'openspec')
  }
  try {
    const { stdout } = await execAsync('openspec --version', { timeout: timeoutMs, windowsHide: true })
    return { value: read(stdout) ?? 'openspec', timedOut: false }
  } catch (error: unknown) {
    if (timedOut(error)) return { timedOut: true }
    // A CLI that prints its version and then exits non-zero is still usable.
    const stdout = (error as { stdout?: unknown }).stdout
    const value = typeof stdout === 'string' ? read(stdout) : undefined
    return value === undefined ? { timedOut: false } : { value, timedOut: false }
  }
}

/** C toolchain row: never spawned here (§21.4). */
function cToolchainItem(): ToolchainItem {
  return {
    key: 'c-toolchain',
    state: 'unknown',
    label: 'C 工具链',
    detail: '未探测 · 进入验证阶段时才会检查',
  }
}

/** guard/quality mount row. */
function mountsItem(options: ProbeOptions): ToolchainItem {
  const guard = options.guardMounted === true
  const quality = options.qualityMounted === true
  if (guard && quality) {
    return { key: 'guard', state: 'ok', label: '检查组件', detail: '已加载' }
  }
  const absent = [guard ? undefined : 'baf-guard', quality ? undefined : 'baf-quality']
    .filter((v): v is string => v !== undefined)
  return {
    key: 'guard',
    state: 'missing',
    label: '检查组件',
    detail: `${absent.join(' / ')} 未加载`,
    hint: '工作流预设里缺少上述组件，请检查预设配置',
  }
}

/** Version row: informational, no symbol (§20.3). */
function versionItem(): ToolchainItem {
  return { key: 'version', state: 'info', label: '版本', detail: versionLine(resolveBafProductVersions()) }
}

/** Whether an execFile failure was the timeout guard rather than a real failure. */
function timedOut(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'killed' in error && error.killed === true
}
