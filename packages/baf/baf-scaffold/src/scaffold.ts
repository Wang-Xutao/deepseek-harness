/**
 * Workspace scaffold: the `init` skeleton (baseline template + openspec
 * layout) with human confirmation, no-overwrite semantics, and timestamped
 * backups (enterprise-workflow §12.7.4).
 *
 * Never destroys data: an existing file with different content is moved to
 * `<path>.baf-backup-<timestamp>` before the template is written, and the
 * outcome reports created/skipped/backed-up separately. `scaffold` is in the
 * baseline's `guard.requireHumanConfirmation` list, so the entry point
 * refuses without an explicit confirmation flag.
 * @module @deepseek-ai/dsh-baf-scaffold/scaffold
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'

/** One planned skeleton file. */
export interface ScaffoldFile {
  /** Workspace-relative path with forward slashes. */
  readonly path: string
  readonly content: string
}

/** The full init plan: baseline template + openspec layout markers. */
export interface ScaffoldPlan {
  readonly files: readonly ScaffoldFile[]
}

/** Files actually written / kept / backed up by one scaffold run. */
export interface ScaffoldChanges {
  readonly created: readonly string[]
  readonly skipped: readonly string[]
  readonly backedUp: readonly string[]
}

/** Outcome: refusal (no confirmation) or the applied changes. */
export type ScaffoldOutcome =
  | { readonly kind: 'refused'; readonly reason: 'human_confirmation_required' }
  | { readonly kind: 'done'; readonly changes: ScaffoldChanges; readonly git?: GitAnchor }

/** Git anchor outcome — best-effort, never fails the scaffold itself. */
export interface GitAnchor {
  /** Whether a repository was created by this run (an existing one is never touched). */
  readonly initialized: boolean
  /** The anchor commit revision, when the anchor landed. */
  readonly revision?: string
  /** Customer-facing one-liner for the scaffold card. */
  readonly note: string
}

/** Run one git invocation synchronously in the workspace. */
function git(root: string, args: readonly string[]): { ok: boolean; stdout: string; stderr: string } {
  const run = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  return { ok: run.status === 0, stdout: (run.stdout ?? '').trim(), stderr: (run.stderr ?? '').trim() }
}

/**
 * Anchor a fresh workspace in Git (user decision 2026-09-22): full-go-path
 * open hard-blocks without a commit anchor, and the old story — the customer
 * hand-running `git init && git commit` in a terminal — contradicted the
 * "workflow operations are agent-owned" principle while the model was
 * simultaneously forbidden from narrating manual steps.
 *
 * Runs only when NO `.git` exists; an existing repository is never touched.
 * Best-effort by design: a missing git binary or a failed commit leaves the
 * scaffold successful and reports the reason — the open gate still names the
 * exact fix on its error card. The anchor commit captures the whole starting
 * state (`git add -A`), which is what drift detection wants to diff against.
 * A machine without a configured git identity falls back to a BAF identity
 * via `-c` (the anchor's purpose is the revision, not authorship).
 * @param workspaceRoot - absolute workspace root.
 * @returns anchor outcome for the scaffold card.
 */
export function anchorGitWorkspace(workspaceRoot: string): GitAnchor {
  if (existsSync(join(workspaceRoot, '.git'))) {
    return { initialized: false, note: '已存在 Git 仓库，未改动' }
  }
  const init = git(workspaceRoot, ['init'])
  if (!init.ok) {
    return { initialized: false, note: `git init 未成功（${init.stderr === '' ? 'git 不可用' : init.stderr.slice(0, 120)}），完整流程建立变更前需先初始化仓库` }
  }
  git(workspaceRoot, ['add', '-A'])
  const message = 'chore(baf): workspace anchor — scaffold init'
  let commit = git(workspaceRoot, ['commit', '-m', message])
  if (!commit.ok) {
    commit = git(workspaceRoot, ['-c', 'user.name=BAF', '-c', 'user.email=baf@localhost', 'commit', '--allow-empty', '-m', message])
  }
  const head = git(workspaceRoot, ['rev-parse', 'HEAD'])
  if (!commit.ok || !head.ok) {
    return { initialized: true, note: `仓库已创建，但锚点提交未成功（${commit.stderr.slice(0, 120)}）；完整流程建立变更前需完成一次提交` }
  }
  return { initialized: true, revision: head.stdout, note: `已建仓并提交锚点（${head.stdout.slice(0, 12)}）` }
}

/**
 * Baseline template. Structurally valid against the manifest schema with
 * enterprise-owned values as `<enterprise-tbd>` placeholders (§15: the
 * scaffold never guesses enterprise policy).
 *
 * 【变更】2026-10-06 (问题 4 客户决策): `standard.mattPocockRulesRef` now ships
 * pointing at the product-default rules document the scaffold also lays down
 * (`.baf/standards/default-rules.md`) — the standard policy is effective
 * out-of-the-box, and an enterprise replaces it wholesale by re-pointing the
 * ref at its own rules document. §15 still holds for everything else: the
 * scaffold never guesses enterprise values, and baf-standard itself still
 * embeds no rule text (the content lives in the referenced document).
 * @param baselineId - enterprise baseline id to stamp.
 * @returns template YAML text.
 */
export function baselineTemplate(baselineId: string): string {
  return `# BAF workspace baseline (scaffolded). Replace every <enterprise-tbd>
# with enterprise-owned values before running the workflow.
schema: 1
baselineId: ${baselineId}
bafCompatibility:
  min: 0.1.0
  max: 0.x
workflow:
  default: go
  requireOpenSpec: true
  bugFixPath:
    allowed: true
    maxScope: small-local
    requireRegressionTest: true
routeProfile:
  default:
    provider: <enterprise-tbd>
    model: <enterprise-tbd>
  allowed:
    - provider: <enterprise-tbd>
      model: <enterprise-tbd>
      capabilities: [reasoning, coding, structured-output, long-context, tool-use, low-latency]
      fallbackGroup: primary
  phases:
    intake: { provider: <enterprise-tbd>, model: <enterprise-tbd> }
    open: { provider: <enterprise-tbd>, model: <enterprise-tbd> }
    clarify: { provider: <enterprise-tbd>, model: <enterprise-tbd> }
    design: { provider: <enterprise-tbd>, model: <enterprise-tbd> }
    plan: { provider: <enterprise-tbd>, model: <enterprise-tbd> }
    implement: { provider: <enterprise-tbd>, model: <enterprise-tbd> }
    verify: { provider: <enterprise-tbd>, model: <enterprise-tbd> }
    archive: { provider: <enterprise-tbd>, model: <enterprise-tbd> }
  fallbackPolicy:
    mode: approved-only
    groups:
      primary:
        - provider: <enterprise-tbd>
          model: <enterprise-tbd>
openspec:
  cli: <enterprise-tbd>
  version: latest
  root: openspec
  changeRoot: openspec/changes
  validate:
    args: [<enterprise-tbd>]
standard:
  # Product-default rules document (laid down by this scaffold); re-point at
  # an enterprise rules document to replace the policy wholesale.
  mattPocockRulesRef: .baf/standards/default-rules.md
stack:
  language: c
  compiler: gcc
  build: <enterprise-tbd>
  test: <enterprise-tbd>
  coverage:
    required: true
    minimum: project-config
  analyzers:
    - <enterprise-tbd>
guard:
  secretScan: required
  protectedPaths:
    - <enterprise-tbd>
  requireHumanConfirmation:
    - scaffold
    - archive
    - abandon
userOverridePolicy:
  # true → 设置→工作流「用户可调偏好」可见，写入 .baf/user-prefs.yml 可 git 共享
  bugFixPathAllowed: true
  bugFixPathMaxScope: true
  coverageMinimum: true
  projectionGitignore: true
  verifyNotes: true
  changeSlugPrefix: true
`
}

/**
 * The product-default engineering rules document (2026-10-06 问题 4 客户决策:
 * 自带默认规则文档，开箱即生效，企业可覆盖).
 *
 * Organized as the 8 stable rule areas of the baf-standard catalog — the
 * heading ids ARE the anchors the provider's `sourceRef#anchor` pointers
 * cite, so `baf-standard` keeps embedding no rule text: this document is the
 * single rule source, injected into sessions as a pointer (the model reads
 * the file) and cited by templates. Matt Pocock practices in productized
 * default form; TDD lives in testing-discipline (regression-first echoes the
 * bug fast-path's hard gate).
 * @returns default rules document text.
 */
export function defaultRulesTemplate(): string {
  return `# BAF 工程规范（产品默认）

本文件是 BAF 自带的默认工程规则（Matt Pocock 实践集的产品化默认值），开箱即生效：
\`.baf/baseline.yml\` 的 \`standard.mattPocockRulesRef\` 指向本文件。

- 企业有自己的规范时，把 \`mattPocockRulesRef\` 改为自有规则文档路径即可整体替换，无需改产品代码。
- 文档按 8 个固定规则域组织（域 id 是 baf-standard 的稳定契约，标题中的英文即锚点，如 \`#testing-discipline\`）。
- 这是活文档：直接编辑即可，之后的产物与引用即按新内容执行。

## project-charter 项目章程

- 项目是什么、为谁做、边界在哪里，写在 README 或 openspec/project.md；拿不准算不算范围内的事，先对照章程，仍拿不准就问客户。
- 每个变更（openspec/changes/<id>）的 proposal 用一句话说明它服务于章程中的哪一项。
- 【变更】2026-10-30 (用户问题 5): 工作区边界——只在本工作区（当前目录）内读写；本工作区里没有的事实不要去相邻目录、兄弟仓库或工作区外面找（每一次这样的探查都会变成要客户点「允许」的审批弹窗）；确实需要工作区之外的信息时问客户。

## coding-style 编码风格

- 代码长得像它周围的代码：命名、注释密度、习惯用法随现场，不在功能变更里引入新风格。
- 函数小到能在头脑里完整放下；一个函数做一件事。
- 命名说清楚「做什么」；类型与命名能表达的，不写注释。
- 注释只解释「为什么」——代码本身已经说了「是什么」。
- 不顺手重构：功能变更里混入的风格改动，拆出去单独提。

## interfaces 接口约定

- 对外接口（导出函数、HTTP 面、CLI 参数）是承诺：先写文档再实现；破坏性变更必须在 design 阶段说明并经客户确认。
- 边界处用类型说话：入参出参有显式类型或校验，内部实现才可以信任它们。
- 优先加法演进（新增可选参数、新增端点），避免改变既有签名的语义。

## error-handling 错误处理

- 错误是值：处理它或传播它，永远不吞掉；不允许空 catch。
- 错误信息带上下文——发生了什么、为什么、下一步能做什么，不是一句 failed。
- 边界处快速失败（fail fast），边缘处收敛为客户能懂的一条信息。
- 可预期的业务失败用显式返回形状；意外失败才抛异常，且异常必须被某个边界接住。

## logging 日志

- 记状态迁移与决策点（选择了什么、为什么），不记噪音。
- 级别各司其职：error=需要人看，warn=可疑但已处理，info=关键路径，debug=细节。
- 日志里永远不出现密钥、token、客户敏感数据。

## documentation 文档

- 文档跟代码走：行为变了，同一个变更里把文档一起改掉。
- README 说「这是什么、怎么跑」；细节文档放最近的目录，不堆中央大文档。
- openspec/ 下的产物是流程记录：改了行为没改产物，等于没改完。

## branch-commit 分支与提交

- 一个变更一个分支；分支名与变更 id 可互相对应。
- 提交信息说「为什么」——动机、权衡、踩坑写在正文里（diff 已经说了「改了什么」）。
- 提交粒度以一次审阅可读完为准；重构与功能永不混在同一提交。

## testing-discipline 测试纪律

- 每个行为变更带测试；先想清楚「预期行为是什么」，再决定先写测试还是先写实现。
- Bug 修复必须先写回归测试：先复现（红），再修复（绿）——与 BAF 缺陷修复路径的「回归测试先行」门一致。
- verify 命令必须可非交互执行（CI 里能跑）；测试不依赖执行顺序、不依赖外部服务的临时状态。
- 覆盖率底线遵循 baseline stack 段的配置；不为凑数写断言空洞的测试。
`
}

/**
 * Build the init plan for one workspace.
 *
 * 【变更】2026-10-06 (问题 4): the plan now lays down THREE files — the
 * default rules document joins the baseline (whose standard ref points at
 * it), so a fresh workspace's standard policy is effective out-of-the-box.
 */
export function planScaffold(options: { readonly baselineId?: string } = {}): ScaffoldPlan {
  return {
    files: [
      { path: '.baf/baseline.yml', content: baselineTemplate(options.baselineId ?? 'baf-baseline-init') },
      { path: '.baf/standards/default-rules.md', content: defaultRulesTemplate() },
      {
        path: '.baf/user-prefs.yml',
        content: `# BAF workspace user preferences (git-shareable).
# Only keys whose userOverridePolicy.<id> is true in .baf/baseline.yml take effect.
# Rules document body is NEVER edited here — see .baf/standards/.
schema: 1
`,
      },
      { path: 'openspec/changes/.gitkeep', content: '' },
    ],
  }
}

function backupName(path: string, at: Date): string {
  const stamp = at.toISOString().replace(/[:.]/g, '-')
  return `${path}.baf-backup-${stamp}`
}

/**
 * Apply a scaffold plan to a workspace.
 * @param workspaceRoot - absolute workspace root.
 * @param plan - files to lay down.
 * @param at - timestamp used for backup names (deterministic in tests).
 * @returns created/skipped/backed-up report.
 */
export function applyScaffold(
  workspaceRoot: string,
  plan: ScaffoldPlan,
  at: Date = new Date(),
): ScaffoldChanges {
  const created: string[] = []
  const skipped: string[] = []
  const backedUp: string[] = []
  for (const file of plan.files) {
    const abs = join(workspaceRoot, file.path)
    mkdirSync(dirname(abs), { recursive: true })
    if (!existsSync(abs)) {
      writeFileSync(abs, file.content, 'utf8')
      created.push(file.path)
      continue
    }
    const existing = readFileSync(abs, 'utf8')
    if (existing === file.content) {
      skipped.push(file.path)
      continue
    }
    const backup = backupName(abs, at)
    renameSync(abs, backup)
    writeFileSync(abs, file.content, 'utf8')
    backedUp.push(file.path)
  }
  return { created, skipped, backedUp }
}

/** Options for {@link scaffoldWorkspace}. */
export interface ScaffoldOptions {
  readonly workspaceRoot: string
  /** Baseline id stamped into the template. */
  readonly baselineId?: string
  /** Explicit human confirmation (baseline guard.requireHumanConfirmation). */
  readonly humanConfirmed: boolean
  /** Timestamp for backup names (tests). */
  readonly at?: Date
}

/**
 * Scaffold entry point: refuse without human confirmation, otherwise apply
 * the init plan with no-overwrite + backup semantics.
 * @param options - workspace, baseline id, confirmation.
 * @returns refusal or the applied changes.
 */
export function scaffoldWorkspace(options: ScaffoldOptions): ScaffoldOutcome {
  if (!options.humanConfirmed) {
    return { kind: 'refused', reason: 'human_confirmation_required' }
  }
  return {
    kind: 'done',
    changes: applyScaffold(options.workspaceRoot, planScaffold(options), options.at),
    git: anchorGitWorkspace(options.workspaceRoot),
  }
}
