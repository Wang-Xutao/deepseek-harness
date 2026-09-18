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
 *   in the customer's mouth.
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
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import { isBafError } from '@deepseek-ai/dsh-baf-core'
import { loadBaselineFile } from '@deepseek-ai/dsh-baf-core'
import { createLocalOpenSpecAdapter } from '@deepseek-ai/dsh-baf-openspec'
import { formatCommandReport, modeZh } from './command-format.ts'
import { gateCardSections, GATE_REGISTRY } from './gate-cards.ts'
import { isActiveChange, ProjectionStore, type ProjectionIndexEntry } from './projection.ts'
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
 * @param cwd - workspace root.
 * @returns the non-terminal changes of that workspace.
 */
export async function resolveStartupBinding(cwd: string): Promise<StartupBinding> {
  const store = new ProjectionStore({ workspaceRoot: cwd })
  const index = await store.readIndex()
  return { actives: index.changes.filter(isActiveChange) }
}

/**
 * Render the §20.3 welcome card.
 * @param input - workspace, probe, binding.
 * @returns the command result the customer sees.
 */
export function renderWelcomeCard(input: {
  readonly cwd: string
  readonly probe: ToolchainProbe
  readonly binding: StartupBinding
}): CommandResult {
  const { cwd, probe, binding } = input
  const actives = binding.actives
  const headline = `BAF 模式已就绪 · ${basename(cwd) || cwd} · ${bindingConclusion(binding)} · 点本行展开/折叠指令全文`

  const sections: { title: string; lines: readonly string[] }[] = [
    { title: '环境体检', lines: renderProbeLines(probe) },
    { title: '本会话绑定', lines: bindingLines(actives) },
    { title: '下一步', lines: nextStepLines(actives) },
    {
      title: '可用指令',
      lines: [
        '/baf-welcome                 重印本卡（绑定 + 体检）',
        '/baf-go                      推进当前工作流到下一个需要你确认的点',
        '/baf-workflow-resume [节点]   drift 后复位到合法节点',
        '/baf-status                  完整状态 · /baf-doctor 体检明细',
        '/baf-help                    全部指令与用法',
      ],
    },
  ]
  // §22.14-D: when the workspace has no baseline, splice the §22 scaffold
  // card fragment into the welcome so the customer sees the registered
  // options verbatim. The card is the same one the Tab pendingGate and the
  // `baf_gate_ask` tool render — no third option can sneak in here.
  const baselineItem = probe.items.find(i => i.key === 'baseline')
  if (baselineItem !== undefined && baselineItem.state === 'missing') {
    sections.splice(sections.length - 2, 0, ...scaffoldCardFragment())
  }
  return { kind: 'success', text: formatCommandReport(true, headline, sections) }
}

/**
 * §22.14-D: render the registered scaffold gate card as raw `formatCommandReport`
 * sections so the welcome card can splice it in alongside its own prose.
 * The headline + framing box of the welcome card stays; only the question /
 * options / footer (verbatim from the §22 registry) is appended.
 * @returns report sections to splice.
 */
function scaffoldCardFragment(): readonly { title: string; lines: readonly string[] }[] {
  const spec = GATE_REGISTRY['scaffold']
  return gateCardSections(spec) ?? []
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
    '两个确认门（design 完成 → plan、verify 通过 → archive）只认客户再敲一次 /baf-go。',
    // §22 rule #4: when blocked by a gate, the only action is to call
    // `baf_gate_ask(gateId)` (§22.9) and read the registered gate card
    // verbatim — never invent a third option, never propose "模型手写 scaffold"
    // or any other path outside the registry. Customer's typed agreement is
    // not evidence; point them at the Tab button or the mapped slash command.
    '被确认门挡住时，唯一动作是调用 baf_gate_ask(gateId) 弹标准选项卡；选项由注册表决定，不得自创、改写或在卡外建议其他路径；客户口头同意不是证据。',
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
    ? '无未完成工作流 —— 客户描述需求后走 intake 分类，不要自行假设已有变更'
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
    const probe = await probeToolchain(cwd, { ...probeMountFlags(ctx) })
    const binding = await resolveStartupBinding(cwd)
    const snapshot: GateSnapshot = { cwd, probe, binding, at: Date.now() }
    snapshotCache.set(cwd, snapshot)
    ctx.logger.info(sessionGateLogLine(snapshot))
    const execution = await ctx.commands.execute(agent, WELCOME_COMMAND, [], controller.signal)
    if (execution === undefined) {
      ctx.logger.warn(`baf-session-gate: ${WELCOME_COMMAND} is not registered; welcome card skipped`)
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
    void runSessionGate(ctx, agent)
  }

  const dispose = (agent: Agent): void => {
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
  ctx.effect(() => async () => {
    for (const controller of inflight.values()) controller.abort()
    inflight.clear()
    const pending = [...fibers.values()]
    fibers.clear()
    await Promise.all(pending.map(fiber => fiber.dispose()))
  }, 'baf-session-gate: agent gates')
}

/** Mount flags read from the composition, for the guard/quality row. */
export function probeMountFlags(ctx: Context): ProbeOptions {
  return {
    guardMounted: ctx.get('bafGuard') !== undefined,
    qualityMounted: ctx.get('bafQuality') !== undefined,
  }
}

/** 【环境体检】 rows, aligned on the label column. Also used by `/baf-doctor`. */
export function renderProbeLines(probe: ToolchainProbe): readonly string[] {
  return probe.items.map((item) => {
    if (item.state === 'info') return `${item.label.padEnd(12)} ${item.detail}`
    const line = `${markOf(item.state)} ${item.label.padEnd(12)} ${item.detail}`
    return item.hint === undefined ? line : `${line}\n  ↳ ${item.hint}`
  })
}

/** Card conclusion for the headline (§20.3). */
function bindingConclusion(binding: StartupBinding): string {
  const actives = binding.actives
  if (actives.length === 0) return '无未完成工作流'
  if (actives.length === 1) {
    const only = actives[0]
    return only === undefined
      ? '无未完成工作流'
      : `检测到未完成工作流 ${only.changeId}（当前 ${only.current}）· 继续还是新开？`
  }
  return `检测到 ${actives.length} 条未完成工作流 · 请选择一条继续`
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

/** 【本会话绑定】 rows. */
function bindingLines(actives: readonly ProjectionIndexEntry[]): readonly string[] {
  if (actives.length === 0) {
    return ['无 —— 直接描述你的需求即可开始（intake 分类卡会自动弹出）']
  }
  const rows = actives.map(
    row => `${row.changeId} · ${modeZh(row.mode)} · 当前 ${row.current} · 最后活动 ${row.updatedAt || '（未知）'}`,
  )
  return ['工作区里还有未完成的工作流（本会话尚未绑定）：', ...rows]
}

/** 【下一步】 rows — always a command the customer can actually type (§20.2). */
function nextStepLines(actives: readonly ProjectionIndexEntry[]): readonly string[] {
  if (actives.length === 0) {
    return ['直接描述你的需求（自动进入 intake 分类）；也可回复 /baf-go 重新查看本卡。']
  }
  const only = actives.length === 1 ? actives[0]?.changeId : undefined
  return [
    only === undefined
      ? '回复 /baf-go change=<id> 指定一条继续（不会替你猜）'
      : `回复 /baf-go continue 继续 ${only}`,
    '要改做别的需求：先 /baf-workflow-abandon change=<id> confirm 放弃它，或新开一个会话',
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
      ? { key: 'workspace', state: 'ok', label: 'workspace', detail: cwd }
      : {
        key: 'workspace',
        state: 'missing',
        label: 'workspace',
        detail: `${cwd} 不是目录`,
        hint: '换一个工作区目录打开会话',
      }
  } catch {
    return {
      key: 'workspace',
      state: 'missing',
      label: 'workspace',
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
      label: 'baseline',
      detail,
      hint: '运行 baf scaffold 生成，或导入企业 baseline',
    },
    requireOpenSpec: true,
  })
  try {
    const manifest = await loadBaselineFile(path)
    return {
      item: {
        key: 'baseline',
        state: 'ok',
        label: 'baseline',
        detail: `${manifest.baselineId} · baf ${manifest.bafCompatibility.min}–${manifest.bafCompatibility.max}`,
      },
      requireOpenSpec: manifest.workflow.requireOpenSpec,
    }
  } catch (error: unknown) {
    if (isBafError(error) && error.code === 'baseline_incompatible') {
      return missing('.baf/baseline.yml 与当前 BAF 版本不兼容')
    }
    return missing('.baf/baseline.yml 缺失或无法解析')
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
      ? { key: 'git', state: 'missing', label: 'Git', detail: '仓库无提交', hint: '提交一次以建立 drift 锚点' }
      : { key: 'git', state: 'ok', label: 'Git', detail: `${revision}（drift 锚点）` }
  } catch (error: unknown) {
    return {
      key: 'git',
      state: timedOut(error) ? 'unknown' : 'missing',
      label: 'Git',
      detail: '不可用（无法读取 HEAD）',
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
  const hint = '安装 OpenSpec CLI，或运行 baf scaffold 生成 openspec/changes'
  if (layout && cli.value !== undefined) {
    return { key: 'openspec', state: 'ok', label: 'OpenSpec', detail: `${cli.value} · openspec/changes 存在` }
  }
  // A tool we could not interrogate is `?`, not `✗` (§20.5): reporting missing
  // here would send the customer to install a CLI that is already installed,
  // just slower than the item budget. The layout, which *is* detected, still
  // carries its remedy — that part is the customer's actual next step.
  if (cli.timedOut) {
    return {
      key: 'openspec',
      state: 'unknown',
      label: 'OpenSpec',
      detail: `${layout ? 'openspec/changes 存在' : 'openspec/changes 缺失'} · CLI 未探测（超时）`,
      ...(layout ? {} : { hint: '运行 baf scaffold 生成 openspec/changes' }),
    }
  }
  // A baseline that does not require OpenSpec makes the missing piece
  // informational: full-go will run without it, so a ✗ here would be a false
  // alarm. Only the baseline can say this — hence the flag threading.
  if (!requireOpenSpec && layout) {
    return {
      key: 'openspec',
      state: 'unknown',
      label: 'OpenSpec',
      detail: 'CLI 未探测到 · baseline 未强制（requireOpenSpec=false）',
    }
  }
  const parts = [
    cli.value === undefined ? 'CLI 不可执行' : `${cli.value} · CLI 可用`,
    layout ? 'openspec/changes 存在' : 'openspec/changes 缺失',
  ]
  return { key: 'openspec', state: 'missing', label: 'OpenSpec', detail: parts.join(' · '), hint }
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
    detail: '未探测 · 首次进入 verify 时检查',
  }
}

/** guard/quality mount row. */
function mountsItem(options: ProbeOptions): ToolchainItem {
  const guard = options.guardMounted === true
  const quality = options.qualityMounted === true
  if (guard && quality) {
    return { key: 'guard', state: 'ok', label: 'guard/quality', detail: '已挂载' }
  }
  const absent = [guard ? undefined : 'baf-guard', quality ? undefined : 'baf-quality']
    .filter((v): v is string => v !== undefined)
  return {
    key: 'guard',
    state: 'missing',
    label: 'guard/quality',
    detail: `${absent.join(' / ')} 未挂载`,
    hint: '检查 preset composition（baf-domain 组内应有该 row）',
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
