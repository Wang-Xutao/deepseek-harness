/**
 * 【变更】2026-09-23 (user issue #6): the 变更总览 dashboard payload — every
 * change in the workspace as one rollup row, newest first.
 *
 * One row = index entry + the metrics fold of its own event log + the
 * plan-ledger task counts (live or archived). Reads are per-change and
 * best-effort: a change whose status or ledger cannot be read still rows
 * (with what the index knows) instead of failing the whole dashboard.
 * @module @deepseek-ai/dsh-baf-workflow/dashboard
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  WorkflowDashboardArtifact,
  WorkflowDashboardRow,
  WorkflowDashboardView,
} from '@deepseek-ai/dsh-baf-core'
import { deriveWorkflowMetrics, type UsagePoint } from './metrics.ts'
import type { ProjectionIndexEntry, ProjectionStore } from './projection.ts'
import { changeArtifactStatus } from './stages/gates.ts'

/**
 * Read one change's plan ledger task counts, live dir first, archive second.
 * @param workspaceRoot - workspace root.
 * @param changeId - change id.
 * @returns the rollup, or undefined when no readable ledger.
 */
async function taskCounts(workspaceRoot: string, changeId: string): Promise<{ done: number; total: number } | undefined> {
  const read = async (path: string): Promise<string | undefined> =>
    await readFile(path, 'utf8').catch(() => undefined)
  const body = await read(join(workspaceRoot, 'openspec', 'changes', changeId, 'plan.json'))
    ?? await read(join(workspaceRoot, 'openspec', 'changes', 'archive', changeId, 'plan.json'))
  if (body === undefined) return undefined
  let tasks: readonly { done?: boolean }[] | undefined
  try {
    const parsed = JSON.parse(body) as { tasks?: readonly { done?: boolean }[] }
    if (Array.isArray(parsed.tasks)) tasks = parsed.tasks
  } catch {
    return undefined
  }
  if (tasks === undefined) return undefined
  return {
    done: tasks.filter(task => task.done === true).length,
    total: tasks.length,
  }
}

/**
 * Build the dashboard view for a workspace.
 * @param store - the workspace projection store.
 * @param usagePoints - the workspace sessions' per-step usage samples, any
 * order. 【变更】2026-09-28 (用户问题 4): attribution is time-window based — a
 * point lands in whichever change's stage window contains it, so the samples
 * of every session that ever drove this workspace fold correctly without a
 * per-change session map; points outside every window (preamble turns) are
 * unattributed by design. Absent (the old call shape) keeps rows token-less.
 * @returns every change row (newest first) plus the header rollups.
 */
export async function buildWorkflowDashboard(
  store: ProjectionStore,
  usagePoints: readonly UsagePoint[] = [],
): Promise<WorkflowDashboardView> {
  const workspaceRoot = store.workspaceRoot()
  const index = await store.readIndex()
  const rows: WorkflowDashboardRow[] = []
  for (const entry of index.changes) {
    const row = await dashboardRowFor(store, workspaceRoot, entry, usagePoints)
    rows.push(row)
  }
  // Newest activity first — the same ranking pickActiveChange applies.
  rows.sort((a, b) =>
    a.changeId === b.changeId ? 0 : rankOf(index, b) - rankOf(index, a) || a.changeId.localeCompare(b.changeId))
  const summary = {
    active: rows.filter(r => r.current !== 'completed' && r.current !== 'abandoned').length,
    archived: rows.filter(r => r.current === 'completed').length,
    abandoned: rows.filter(r => r.current === 'abandoned').length,
    tasksDone: rows.reduce((sum, r) => sum + (r.tasks?.done ?? 0), 0),
    tasksTotal: rows.reduce((sum, r) => sum + (r.tasks?.total ?? 0), 0),
  }
  return { rows, summary }
}

/** The index seq of one row's change (0 when unknown — sorts oldest). */
function rankOf(index: { readonly changes: readonly ProjectionIndexEntry[] }, row: WorkflowDashboardRow): number {
  return index.changes.find(c => c.changeId === row.changeId)?.seq ?? 0
}

/**
 * 【变更】2026-09-29 (demo23 问题 3): the artifacts a change actually
 * generated — one row per file on disk (live directory first, archive
 * fallback), for terminal changes especially the abandoned ones whose
 * directory is preserved in place. `missing`/`clipped` rows drop out (there
 * is nothing to show or open). Best-effort like every other per-change read.
 */
async function generatedArtifacts(
  workspaceRoot: string,
  entry: ProjectionIndexEntry,
): Promise<readonly WorkflowDashboardArtifact[] | undefined> {
  try {
    const rows = await changeArtifactStatus({
      workspaceRoot,
      changeId: entry.changeId,
      mode: entry.mode === 'bug-fix-path' ? 'bug-fix-path' : 'full-go-path',
    })
    // The loop (not filter+map) narrows ArtifactState to the three generated
    // states the wire type carries.
    const generated: WorkflowDashboardArtifact[] = []
    for (const row of rows) {
      if (row.state !== 'template' && row.state !== 'planned' && row.state !== 'filled') continue
      generated.push({ file: row.file, path: row.path, state: row.state })
    }
    return generated.length > 0 ? generated : undefined
  } catch {
    return undefined
  }
}

/** Fold one index entry into a dashboard row, tolerating partial reads. */
async function dashboardRowFor(
  store: ProjectionStore,
  workspaceRoot: string,
  entry: ProjectionIndexEntry,
  usagePoints: readonly UsagePoint[],
): Promise<WorkflowDashboardRow> {
  const base: WorkflowDashboardRow = {
    changeId: entry.changeId,
    mode: entry.mode,
    current: entry.current,
    ...(entry.current === 'completed' || entry.current === 'abandoned' ? { endedAt: entry.updatedAt } : {}),
  }
  // Issue 3 rides outside the metrics try — an unreadable event log must not
  // cost the artifacts the customer is asking about.
  const artifacts = await generatedArtifacts(workspaceRoot, entry)
  try {
    const { events } = await store.readEvents(entry.changeId)
    // 【变更】2026-09-28 (用户问题 4): usage samples ride along so per-node
    // tokens attribute by stage windows — same fold the Tab view runs.
    const { byNode } = deriveWorkflowMetrics(events, Date.now(), usagePoints)
    // Every present node's duration/tokens sum to the row's rollup.
    let durationMs = 0
    let inputTokens = 0
    let outputTokens = 0
    for (const metrics of Object.values(byNode)) {
      durationMs += metrics.durationMs ?? 0
      inputTokens += metrics.inputTokens ?? 0
      outputTokens += metrics.outputTokens ?? 0
    }
    const tasks = await taskCounts(workspaceRoot, entry.changeId)
    return {
      ...base,
      ...(durationMs > 0 ? { durationMs } : {}),
      ...(inputTokens > 0 || outputTokens > 0 ? { inputTokens, outputTokens } : {}),
      ...(tasks === undefined ? {} : { tasks }),
      ...(artifacts === undefined ? {} : { artifacts }),
    }
  } catch {
    return artifacts === undefined ? base : { ...base, artifacts }
  }
}
