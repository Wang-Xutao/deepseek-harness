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
  mattPocockRulesRef: <enterprise-tbd>
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
`
}

/** Build the init plan for one workspace. */
export function planScaffold(options: { readonly baselineId?: string } = {}): ScaffoldPlan {
  return {
    files: [
      { path: '.baf/baseline.yml', content: baselineTemplate(options.baselineId ?? 'baf-baseline-init') },
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
