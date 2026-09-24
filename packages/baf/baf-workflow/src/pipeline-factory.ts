/**
 * Workspace-bound pipeline construction, shared by every entry surface.
 *
 * The slash commands, the standalone CLI and the Tab Remote must all drive the
 * same change under the same facts — the workspace's baseline and its current
 * Git revision. Constructing a {@link StagePipeline} by hand in each surface is
 * how those facts silently drift apart (a missing `gitRevision` alone makes
 * `detectDrift` blind to `git-revision-changed`), so the construction lives
 * here and the surfaces call it.
 * @module @deepseek-ai/dsh-baf-workflow/pipeline-factory
 */

import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { loadBaselineFile, type BaselineManifest, type GuardPolicy, type StackAdapter } from '@deepseek-ai/dsh-baf-core'
import { ProjectionStore } from './projection.ts'
import { StagePipeline } from './stages/pipeline.ts'

const execFileAsync = promisify(execFile)

/** Workspace convention for the governing baseline (same path baf-guard reads). */
export const WORKSPACE_BASELINE_PATH = '.baf/baseline.yml'

/** Optional sibling-package adapters the caller wires into verify/quality/guard. */
export interface DriveAdapters {
  readonly stack?: StackAdapter
  readonly guard?: GuardPolicy
  /**
   * Scaffold adapter (Phase 8.11 / §22.4) — wraps `baf-scaffold`'s
   * `scaffoldWorkspace`. Optional because the CLI / single-step drivers may
   * run in a composition that does not mount `baf-scaffold`; drives tolerate
   * the absence and surface a clear "服务未挂载" card.
   */
  readonly scaffold?: ScaffoldAdapter
}

/**
 * Adapter contract for the `baf-scaffold` workspace init (§22.4). The host
 * resolves the actual implementation through the cordis `bafScaffold`
 * service; tests pass a stub. The adapter is intentionally tiny so a stub
 * takes two lines and matches the rest of the `DriveAdapters` pattern.
 */
export interface ScaffoldAdapter {
  readonly scaffold: (options: ScaffoldAdapterOptions) => ScaffoldAdapterOutcome
}

/** Mirror of `ScaffoldOptions` from `baf-scaffold` — kept local to avoid coupling. */
export interface ScaffoldAdapterOptions {
  readonly workspaceRoot: string
  readonly baselineId?: string
  readonly humanConfirmed: boolean
  readonly at?: Date
}

/** Mirror of `GitAnchor` from `baf-scaffold` — the best-effort init+commit report. */
export interface ScaffoldGitAnchor {
  readonly initialized: boolean
  readonly revision?: string
  readonly note: string
}

/** Mirror of `ScaffoldOutcome` — `kind: 'done' | 'refused'`. */
export type ScaffoldAdapterOutcome =
  | { readonly kind: 'refused'; readonly reason: 'human_confirmation_required' }
  | {
    readonly kind: 'done'
    readonly changes: { readonly created: readonly string[]; readonly skipped: readonly string[]; readonly backedUp: readonly string[] }
    /** 2026-09-22 user decision: the scaffold also anchors the workspace in Git when none exists. */
    readonly git?: ScaffoldGitAnchor
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
