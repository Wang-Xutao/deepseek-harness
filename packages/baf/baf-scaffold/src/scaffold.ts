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
  | { readonly kind: 'done'; readonly changes: ScaffoldChanges }

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
  bugFastPath:
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
  return { kind: 'done', changes: applyScaffold(options.workspaceRoot, planScaffold(options), options.at) }
}
